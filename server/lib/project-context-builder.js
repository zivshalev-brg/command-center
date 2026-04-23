// Project context builder — deep one-shot backfill for new projects.
// Sweeps 30 days of Slack/email, queries Jira (JQL), Confluence (CQL), calendar,
// and scans KB intelligence files for entity mentions. Upserts all matches into
// project_sources with link_method = 'context_backfill'.
//
// Fire-and-forget model: POST returns immediately; project.backfill_state tracks
// lifecycle (idle → running → complete | error).

'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./project-store');
const { scoreCandidate } = require('./ingestors/matcher');
const { searchIssuesRich } = require('./jira-api');

const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_RELEVANCE = 0.3; // lower threshold; rerank pass filters noise
const CAPS = { slack: 80, email: 80, jira: 40, confluence: 20, calendar: 30, kb: 20 };

function _readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function _peopleDir(ctx) {
  return _readJson(path.join(ctx.intelDir, 'team-directory.json')) || {};
}

function _escapeJqlString(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Slack + Email (combined thread sweep) ────────────────────

function _gatherSlackEmail(ctx, project, lookbackIso) {
  const peopleDirectory = _peopleDir(ctx);
  const commsLive = _readJson(ctx.commsLivePath) || {};
  const emailLive = _readJson(path.join(ctx.intelDir, 'email-live.json')) || {};
  const threads = Object.assign({}, commsLive.threads || {}, emailLive.threads || {});

  const matched = { slack: [], email: [] };
  for (const [tid, t] of Object.entries(threads)) {
    if (!t) continue;
    // Filter by lookback: check lastActivity when available
    if (lookbackIso && t.lastActivity && t.lastActivity < lookbackIso) continue;

    const subject = t.subject || '';
    const firstMsg = Array.isArray(t.messages) && t.messages.length ? (t.messages[0].text || t.messages[0].bodyPreview || '') : '';
    const body = (t.preview || '') + ' ' + firstMsg.slice(0, 800);
    const participants = t.people || [];

    const { score, method } = scoreCandidate({ project, subject, body, participants, peopleDirectory });
    if (score < MIN_RELEVANCE) continue;

    const isSlack = Array.isArray(t.sources) ? t.sources.includes('slack') : String(tid).startsWith('slack-');
    const bucket = isSlack ? 'slack' : 'email';
    matched[bucket].push({ source_type: bucket, source_id: tid, title: subject, relevance: score, link_method: 'context_backfill', _method: method });
  }

  // Sort by relevance desc and cap
  matched.slack.sort((a, b) => b.relevance - a.relevance);
  matched.email.sort((a, b) => b.relevance - a.relevance);
  return { slack: matched.slack.slice(0, CAPS.slack), email: matched.email.slice(0, CAPS.email) };
}

// ─── Jira ─────────────────────────────────────────────────────

async function _gatherJira(ctx, project, lookbackDays) {
  if (!ctx.atlassian || !ctx.atlassian.token) return { items: [], error: 'Atlassian not configured' };

  // Build JQL: prefer custom JQL, else auto-construct from tags
  let jql;
  if (project.jira_jql) {
    jql = project.jira_jql + ' AND updated >= -' + lookbackDays + 'd';
  } else {
    const tags = (project.classifier_tags || []).concat(project.aliases || []).filter(Boolean);
    if (!tags.length) return { items: [] };
    const escaped = tags.slice(0, 6).map(_escapeJqlString);
    const textParts = escaped.map(t => 'text ~ "' + t + '"').join(' OR ');
    const labelParts = escaped.map(t => 'labels = "' + t.replace(/\s+/g, '-') + '"').join(' OR ');
    jql = '(' + textParts + ' OR ' + labelParts + ') AND updated >= -' + lookbackDays + 'd';
  }

  try {
    const issues = await searchIssuesRich(ctx, jql + ' ORDER BY updated DESC', CAPS.jira, true);
    return {
      items: (issues || []).map(i => ({
        source_type: 'jira',
        source_id: i.key,
        title: i.summary,
        url: i.url || null,
        relevance: 0.75,
        link_method: 'context_backfill'
      }))
    };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

// ─── Confluence ───────────────────────────────────────────────

async function _gatherConfluence(ctx, project) {
  if (!ctx.atlassian || !ctx.atlassian.token) return { items: [], error: 'Atlassian not configured' };
  let search;
  try { ({ searchPages: search } = require('./confluence-api')); } catch {}
  // confluence-api may not have searchPages; fall back to getRecentPages + client filter
  let pages = [];
  if (search) {
    try {
      const keywords = (project.classifier_tags || []).concat(project.aliases || []).slice(0, 6);
      pages = await search(ctx, keywords);
    } catch (e) { return { items: [], error: e.message }; }
  } else {
    try {
      const { getRecentPages } = require('./confluence-api');
      const recent = await getRecentPages(ctx);
      const peopleDirectory = _peopleDir(ctx);
      for (const page of recent || []) {
        const subject = page.title || '';
        const body = page.excerpt || '';
        const { score } = scoreCandidate({ project, subject, body, peopleDirectory });
        if (score >= MIN_RELEVANCE) {
          pages.push(page);
          if (pages.length >= CAPS.confluence) break;
        }
      }
    } catch (e) { return { items: [], error: e.message }; }
  }
  return {
    items: pages.map(p => ({
      source_type: 'confluence',
      source_id: String(p.id),
      title: p.title,
      url: p.url || null,
      relevance: 0.7,
      link_method: 'context_backfill'
    }))
  };
}

// ─── Calendar ─────────────────────────────────────────────────

function _gatherCalendar(ctx, project, lookbackIso) {
  const live = _readJson(path.join(ctx.intelDir, 'calendar-live.json'));
  if (!live || !Array.isArray(live.events)) return { items: [] };
  const peopleDirectory = _peopleDir(ctx);
  const items = [];
  for (const ev of live.events) {
    if (lookbackIso && ev.start && ev.start < lookbackIso && ev.end && ev.end < lookbackIso) continue;
    const subject = ev.subject || ev.title || '';
    const body = (ev.bodyPreview || ev.body || '').slice(0, 400);
    const participants = (ev.attendees || []).map(a => a.name || a.emailAddress || a);
    if (ev.organizer) participants.push(ev.organizer.name || ev.organizer);
    const { score, method } = scoreCandidate({ project, subject, body, participants, peopleDirectory });
    if (score < MIN_RELEVANCE) continue;
    items.push({
      source_type: 'calendar',
      source_id: String(ev.id || ev.iCalUId || `${subject}_${ev.start || ''}`),
      title: subject,
      url: ev.webLink || null,
      relevance: score,
      link_method: 'context_backfill'
    });
    if (items.length >= CAPS.calendar) break;
  }
  return { items };
}

// ─── KB (proper index-based scan across all kb-data/* dirs) ─────

function _gatherKb(ctx, project) {
  const kbIndex = require('./kb-index');
  const brief = project.brief && typeof project.brief === 'object' ? project.brief : null;
  const categories = (brief && brief.kb_categories) || null;
  const matches = kbIndex.findForProject(ctx, project, { categories, limit: CAPS.kb });
  const items = matches.map(m => ({
    source_type: 'kb',
    source_id: m.rel_path,
    title: m.title + ' [' + m.category + ']',
    url: null,
    relevance: Math.min(0.95, 0.5 + Math.min(0.4, (m._score || 0) * 0.05)),
    link_method: 'kb_index',
    excerpt: m.snippet
  }));
  return { items };
}

// ─── Main entry ────────────────────────────────────────────────

async function backfillNewProjectContext(ctx, projectId, opts = {}) {
  let project = store.getProject(projectId);
  if (!project) throw new Error('project not found: ' + projectId);

  // Skip seed projects unless forced
  if (project.source === 'seed' && !opts.force) {
    return { skipped: true, reason: 'seed_project' };
  }

  // Guard against concurrent runs
  if (project.backfill_state === 'running' && !opts.force) {
    return { skipped: true, reason: 'already_running' };
  }

  const lookbackDays = opts.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  const lookbackIso = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000).toISOString();
  const started = Date.now();

  store.setBackfillState(projectId, 'running');

  // ─── Generate or refresh brief BEFORE gathering ────────────────
  // The brief drives signal_priorities + kb_categories used by downstream gatherers.
  if (!project.brief || opts.refreshBrief) {
    try {
      const { buildProjectBrief } = require('./project-brief-builder');
      await buildProjectBrief(ctx, projectId, { skipAI: !ctx.anthropicApiKey });
      project = store.getProject(projectId); // reload with brief
    } catch (e) {
      console.warn('[Backfill] brief generation failed:', e.message);
    }
  }

  const brief = project.brief && typeof project.brief === 'object' ? project.brief : null;
  const signalPriorities = (brief && brief.signal_priorities) || {};

  // Dynamically scale caps by profile weights
  const scaledCaps = {
    slack:      Math.round(CAPS.slack      * (signalPriorities.slack ?? 0.8)),
    email:      Math.round(CAPS.email      * (signalPriorities.email ?? 0.8)),
    jira:       Math.round(CAPS.jira       * (signalPriorities.jira ?? 0.6)),
    confluence: Math.round(CAPS.confluence * (signalPriorities.confluence ?? 0.6)),
    calendar:   Math.round(CAPS.calendar   * (signalPriorities.calendar ?? 0.6)),
    kb:         Math.round(CAPS.kb         * (signalPriorities.kb ?? 0.7))
  };

  const counts = { slack: 0, email: 0, jira: 0, confluence: 0, calendar: 0, kb: 0 };
  const errors = [];
  const allCandidates = []; // for rerank pass

  try {
    // ─── Gather raw candidates from every source ─────────────────
    const se = _gatherSlackEmail(ctx, project, lookbackIso);
    for (const s of se.slack.slice(0, scaledCaps.slack)) allCandidates.push(s);
    for (const s of se.email.slice(0, scaledCaps.email)) allCandidates.push(s);

    if (!opts.skipJira) {
      const jira = await _gatherJira(ctx, project, lookbackDays);
      if (jira.error) errors.push({ source: 'jira', error: jira.error });
      for (const s of (jira.items || []).slice(0, scaledCaps.jira)) allCandidates.push(s);
    }

    if (!opts.skipConfluence) {
      const conf = await _gatherConfluence(ctx, project);
      if (conf.error) errors.push({ source: 'confluence', error: conf.error });
      for (const s of (conf.items || []).slice(0, scaledCaps.confluence)) allCandidates.push(s);
    }

    const cal = _gatherCalendar(ctx, project, lookbackIso);
    for (const s of cal.items.slice(0, scaledCaps.calendar)) allCandidates.push(s);

    const kb = _gatherKb(ctx, project);
    for (const s of kb.items.slice(0, scaledCaps.kb)) allCandidates.push(s);

    // ─── Claude-Haiku rerank across all sources ──────────────────
    let finalSources;
    if (!opts.skipRerank && ctx.anthropicApiKey && allCandidates.length > 10) {
      try {
        const { rerankCandidates } = require('./project-context-reranker');
        finalSources = await rerankCandidates(ctx, brief, project, allCandidates, { max: 60 });
      } catch (e) {
        errors.push({ source: 'rerank', error: e.message });
        finalSources = allCandidates
          .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
          .slice(0, 60);
      }
    } else {
      finalSources = allCandidates
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, 60);
    }

    // ─── Upsert the final set ────────────────────────────────────
    for (const s of finalSources) {
      store.upsertSource(projectId, s);
      counts[s.source_type] = (counts[s.source_type] || 0) + 1;
    }

    store.setBackfillState(projectId, 'complete', { counts, errors });

    if (!opts.skipSynth && ctx.anthropicApiKey) {
      try {
        const { synthesizeProject } = require('./project-synthesis');
        await synthesizeProject(ctx, projectId, { force: true });
      } catch (e) {
        errors.push({ source: 'synthesis', error: e.message });
        store.setBackfillState(projectId, 'complete', { counts, errors });
      }
    }

    return {
      ok: true,
      counts,
      raw_candidates: allCandidates.length,
      kept_after_rerank: finalSources.length,
      profile: brief && brief.context_profile,
      errors,
      duration_ms: Date.now() - started
    };
  } catch (e) {
    errors.push({ source: 'top-level', error: e.message });
    store.setBackfillState(projectId, 'error', { counts, errors });
    throw e;
  }
}

module.exports = { backfillNewProjectContext };
