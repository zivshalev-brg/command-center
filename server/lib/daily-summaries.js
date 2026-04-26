/**
 * daily-summaries.js — Per-tab daily summary MD generator for the Obsidian brain.
 *
 * Every tab in Beanz OS gets a daily summary MD written to:
 *   {vault}/950-Daily-Summaries/{YYYY-MM-DD}/{tab}.md
 *
 * Weekly rollups land at:
 *   {vault}/951-Weekly-Summaries/{YYYY}-W{WW}.md
 *
 * Uses Opus (prompt-cached) for chat/strategy tabs, Sonnet for high-volume ones
 * (news/comms) to keep costs in check. Each tab generator is a pure function of
 * { ctx, dateKey } → { title, data, prompt }.
 *
 * Public API:
 *   runDailySummaries({ ctx, dateKey?, tabs?, force? }) → { results, vaultDir }
 *   runWeeklyRollup({ ctx, weekKey? }) → { result }
 *   getLastRun() → { date, per-tab status }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getVaultPath } = require('./obsidian-sync');
const { writeFreshPage } = require('./obsidian-comms-sync');
const MODELS = require('./ai-models');
const db = require('./db');

const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2500;

// ═══ Helpers ════════════════════════════════════════════════════

function todayInSydney() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  return m.year + '-' + m.month + '-' + m.day;
}

function readJSONSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function weekOf(dateKey) {
  // ISO week — best-effort, uses Thursday-containing-week rule
  const d = new Date(dateKey + 'T00:00:00Z');
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target) / 604800000);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function sinceHoursIso(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function truncate(text, max) {
  if (!text) return '';
  text = String(text);
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n\n... [truncated at ' + max + ' chars]';
}

// ═══ Anthropic call ═════════════════════════════════════════════

function callAnthropic({ apiKey, model, system, user, maxTokens }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || MODELS.OPUS,
      max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
      system: Array.isArray(system) ? system : [{ type: 'text', text: String(system || '') }],
      messages: [{ role: 'user', content: user }]
    });
    const req = https.request({
      hostname: API_HOSTNAME, path: API_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION }
    }, (res) => {
      const bufs = [];
      res.on('data', c => bufs.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(bufs).toString('utf8'));
          if (json.error) return reject(new Error(json.error.message || 'API error'));
          const text = (json.content || []).map(b => b.type === 'text' ? b.text : '').join('').trim();
          resolve({ text, usage: json.usage || {} });
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Timed out')); });
    req.write(body);
    req.end();
  });
}

// ═══ Per-tab data collectors ════════════════════════════════════

/** Collect Summary-tab data — highlights from every signal surface. */
function collectSummary(ctx) {
  return {
    metrics: readJSONSafe(path.join(ctx.intelDir, 'metrics-live.json')),
    comms: readJSONSafe(ctx.commsLivePath || path.join(ctx.intelDir, 'comms-live.json')),
    projects: readJSONSafe(path.join(ctx.intelDir, 'project-updates.json'))
  };
}

function collectComms(ctx) {
  const comms = readJSONSafe(ctx.commsLivePath || path.join(ctx.intelDir, 'comms-live.json')) || {};
  const email = readJSONSafe(ctx.emailLivePath || path.join(ctx.intelDir, 'email-live.json')) || {};
  const threads = Object.values(comms.threads || {});
  const recent = threads.filter(t => {
    const last = t.lastActivity ? new Date(t.lastActivity) : null;
    return last && (Date.now() - last.getTime()) < 36 * 3600 * 1000;
  });
  // Score + keep top 30
  const scored = recent.map(t => ({
    subject: t.subject,
    source: (t.sources || []).includes('slack') ? 'slack' : 'email',
    people: (t.people || []).filter(Boolean).slice(0, 6),
    category: t.aiCategory,
    priority: t.aiPriority,
    action: t.aiActionRequired,
    summary: t.aiSummary,
    projects: t.aiProjectTags || [],
    messageCount: t.threadCount || (t.messages || []).length,
    lastActivity: t.lastActivity
  })).sort((a, b) => {
    const pa = a.priority === 'critical' ? 3 : a.priority === 'high' ? 2 : 1;
    const pb = b.priority === 'critical' ? 3 : b.priority === 'high' ? 2 : 1;
    if (pa !== pb) return pb - pa;
    return new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0);
  }).slice(0, 30);
  return { threadCount: threads.length, recentCount: recent.length, topThreads: scored };
}

function collectCalendar(ctx) {
  // No persistent store — walk any cached calendar files we have
  const calPath = path.join(ctx.intelDir, 'calendar-live.json');
  const data = readJSONSafe(calPath);
  if (!data) return { events: [] };
  const today = todayInSydney();
  const events = (data.events || []).filter(e => {
    const start = String(e.start || e.startDateTime || '').slice(0, 10);
    return start === today;
  });
  return { events };
}

function collectProjects(ctx) {
  const data = readJSONSafe(path.join(ctx.intelDir, 'project-updates.json')) || {};
  const projects = Object.entries(data.projects || {}).map(([key, p]) => ({
    key, name: key.replace(/_/g, ' '),
    status: p.status, lead: p.lead, latest: p.latest,
    blockers: p.blockers || [], workstreams: p.workstreams_active || []
  }));
  // Intelligence cache
  try {
    const d = db.getDb();
    const rows = d.prepare('SELECT project_id, health_score, health_summary, risk_flags FROM project_intelligence_cache').all();
    const byId = {};
    rows.forEach(r => { byId[r.project_id] = r; });
    projects.forEach(p => {
      const intel = byId[p.key];
      if (intel) {
        p.healthScore = intel.health_score;
        p.healthSummary = intel.health_summary;
        try { p.riskFlags = intel.risk_flags ? JSON.parse(intel.risk_flags) : []; } catch { p.riskFlags = []; }
      }
    });
  } catch {}
  return { projects };
}

function collectPeople(ctx) {
  const team = readJSONSafe(path.join(ctx.intelDir, 'team-directory.json')) || {};
  // Recent learning notes
  const notes = [];
  try {
    const d = db.getDb();
    const rows = d.prepare("SELECT target_id, note, created_at FROM learning_notes WHERE target_type = 'person' AND created_at > ? ORDER BY created_at DESC LIMIT 20").all(sinceHoursIso(48));
    notes.push(...rows);
  } catch {}
  return { teamCount: (team.team || []).length, recentNotes: notes };
}

function collectMetrics(ctx) {
  const snap = readJSONSafe(path.join(ctx.intelDir, 'metrics-live.json'));
  if (!snap) return null;
  const live = snap.live || {};
  return {
    refreshedAt: live.refreshedAt,
    yesterday: live.yesterday,
    mtd: live.mtd,
    activeSubs: live.activeSubs,
    mom: live.mom ? live.mom.slice(-3) : [],
    daily7: (live.daily30 || []).slice(-7),
    marketMTD: live.marketMTD || [],
    topRoasters: (live.topRoasters || []).slice(0, 5),
    ftbpPrograms: (live.ftbpPrograms || []).slice(0, 8),
    sla30: live.sla30 || [],
    cancellationReasons: live.cancellationReasons || []
  };
}

function collectStrategy(ctx) {
  // Strategy correlations — hardcoded 8 in obsidian-sync, plus KB
  const correlations = [
    { id: 'COR-1', title: 'Cancellation acceleration vs growth', type: 'critical' },
    { id: 'COR-2', title: 'Oracle 21x revenue over-index', type: 'opportunity' },
    { id: 'COR-3', title: 'FTBP v2 conversion leap', type: 'positive' },
    { id: 'COR-4', title: 'Large bag adoption accelerating', type: 'positive' },
    { id: 'COR-5', title: 'DE delivery deterioration', type: 'warning' },
    { id: 'COR-6', title: 'Platinum flywheel working', type: 'positive' },
    { id: 'COR-7', title: 'FTBP single-channel risk', type: 'warning' },
    { id: 'COR-8', title: 'Flat LTV despite revenue growth', type: 'warning' }
  ];
  return { correlations };
}

function collectNews(ctx, hours) {
  const coffee = readJSONSafe(ctx.newsStore) || {};
  const tech = readJSONSafe(ctx.techNewsStore) || {};
  const since = Date.now() - hours * 3600 * 1000;
  function filterRecent(store) {
    return (store.articles || []).filter(a => {
      const t = a.publishedAt || a.fetched;
      if (!t) return false;
      return new Date(t).getTime() > since;
    }).slice(0, 25).map(a => ({
      title: a.title,
      source: a.sourceName || a.source,
      publishedAt: a.publishedAt,
      summary: a.aiEnrichedSummary || a.aiSummary || a.summary,
      url: a.url,
      sentiment: a.sentiment,
      relevance: a.relevanceScore
    }));
  }
  return {
    coffee: filterRecent(coffee),
    tech: filterRecent(tech)
  };
}

function collectIntel(ctx) {
  try {
    const d = db.getDb();
    const briefings = d.prepare('SELECT id, type, week, title, content_md, model_used, created_at FROM cibe_briefings ORDER BY created_at DESC LIMIT 3').all();
    const anomalies = d.prepare('SELECT * FROM cibe_anomalies ORDER BY detected_at DESC LIMIT 10').all();
    const roasters = d.prepare('SELECT id, name, country, beanz_partner FROM cibe_roasters WHERE active = 1').all();
    return {
      recentBriefings: briefings.map(b => ({ ...b, content_md: truncate(b.content_md || '', 2000) })),
      anomalies,
      roasterCount: roasters.length,
      partners: roasters.filter(r => r.beanz_partner).length
    };
  } catch { return { recentBriefings: [], anomalies: [], roasterCount: 0, partners: 0 }; }
}

function collectNotes(ctx) {
  // Recent notebook activity
  try {
    const d = db.getDb();
    const notebooks = d.prepare('SELECT id, title, updated_at FROM notebooks ORDER BY updated_at DESC LIMIT 10').all();
    const since = sinceHoursIso(24);
    const recentSources = d.prepare('SELECT s.notebook_id, s.kind, s.title, s.added_at FROM notebook_sources s WHERE s.added_at > ? ORDER BY s.added_at DESC LIMIT 20').all(since);
    const recentNotes = d.prepare("SELECT n.notebook_id, n.kind, n.title, n.updated_at FROM notebook_notes n WHERE n.updated_at > ? ORDER BY n.updated_at DESC LIMIT 20").all(since);
    return { notebooks, recentSources, recentNotes };
  } catch { return { notebooks: [], recentSources: [], recentNotes: [] }; }
}

// ═══ Tab specs ═════════════════════════════════════════════════

const TAB_SPECS = {
  summary: {
    label: 'Daily Summary',
    collect: collectSummary,
    model: () => MODELS.OPUS,
    maxTokens: 2500,
    system: 'You produce executive-grade daily briefings for Ziv Shalev, GM of Beanz (BRG). Lead with the bottom line. Structured, scannable, decision-ready. Cite numbers precisely. Avoid fluff.',
    user: (data, dateKey) => (
      'Generate the daily summary for ' + dateKey + ' (AEST) from the state of Beanz OS.\n\n' +
      '# Sections (use this order):\n' +
      '## Bottom line (3-5 bullets — what Ziv needs to know first)\n' +
      '## Signals worth acting on\n' +
      '## Numbers (yesterday / MTD / subs / churn)\n' +
      '## Project health (statuses + any red flags)\n' +
      '## Comms that need a response today\n' +
      '## What\'s coming (next 24-48h)\n\n' +
      '# Data\n\n' +
      '## Metrics snapshot\n```json\n' + truncate(JSON.stringify(data.metrics?.live || {}, null, 2), 8000) + '\n```\n\n' +
      '## Projects\n```json\n' + truncate(JSON.stringify(data.projects?.projects || {}, null, 2), 6000) + '\n```\n\n' +
      '## Comms summary\n```json\n' + truncate(JSON.stringify({ threadCount: Object.keys(data.comms?.threads || {}).length }, null, 2), 1000) + '\n```'
    )
  },
  comms: {
    label: 'Comms',
    collect: collectComms,
    model: () => MODELS.SONNET,   // high volume, Sonnet is cost-effective
    maxTokens: 2500,
    skipIf: (d) => (d.topThreads || []).length === 0,
    system: 'You triage communications for a General Manager. Group by priority and project. Flag action-required items. Be terse.',
    user: (data, dateKey) => (
      'Daily comms triage for ' + dateKey + '. Cover Slack + Outlook from the last 36 hours.\n\n' +
      '# Structure:\n' +
      '## Action required (needs reply today)\n' +
      '## Signal (important context, no reply needed)\n' +
      '## By project (grouped)\n' +
      '## Patterns noticed (senders, topics, cadence)\n\n' +
      '# Data — top ' + data.topThreads.length + ' of ' + data.recentCount + ' recent threads\n' +
      '```json\n' + truncate(JSON.stringify(data.topThreads, null, 2), 30000) + '\n```'
    )
  },
  calendar: {
    label: 'Calendar',
    collect: collectCalendar,
    model: () => MODELS.HAIKU,
    maxTokens: 1500,
    skipIf: (d) => (d.events || []).length === 0,
    system: 'You produce a concise meeting agenda summary for today.',
    user: (data, dateKey) => (
      'Today\'s calendar (' + dateKey + '). For each meeting: time, attendees, purpose (from body), what to prepare.\n\n' +
      '```json\n' + truncate(JSON.stringify(data.events, null, 2), 10000) + '\n```'
    )
  },
  projects: {
    label: 'Projects',
    collect: collectProjects,
    model: () => MODELS.OPUS,
    maxTokens: 2500,
    system: 'You produce a daily project status dashboard. Flag anything at risk. Recommend next moves.',
    user: (data, dateKey) => (
      'Project status pulse for ' + dateKey + '.\n\n' +
      '# Sections:\n' +
      '## 🚨 At-risk projects (health < 60 or red flags)\n' +
      '## 🟢 Healthy / progressing\n' +
      '## 🟡 Watch list\n' +
      '## Recommended next moves this week\n\n' +
      '# Data\n```json\n' + truncate(JSON.stringify(data.projects, null, 2), 20000) + '\n```'
    )
  },
  people: {
    label: 'People',
    collect: collectPeople,
    model: () => MODELS.HAIKU,
    maxTokens: 1000,
    skipIf: (d) => !d.recentNotes || !d.recentNotes.length,
    system: 'You summarise recent learning notes about people into a short knowledge digest.',
    user: (data, dateKey) => (
      'People insight digest for ' + dateKey + '. Patterns across recent notes. Anyone needing follow-up.\n\n' +
      '```json\n' + truncate(JSON.stringify(data.recentNotes, null, 2), 8000) + '\n```'
    )
  },
  metrics: {
    label: 'Metrics',
    collect: collectMetrics,
    model: () => MODELS.OPUS,
    maxTokens: 2500,
    skipIf: (d) => !d,
    system: 'You are a revenue and operations analyst for Beanz (coffee subscription, part of BRG). Explain what numbers moved and why. Spot anomalies. Commercial angle, not just descriptive.',
    user: (data, dateKey) => (
      'Metrics pulse for ' + dateKey + '.\n\n' +
      '# Sections:\n' +
      '## Yesterday vs baseline\n' +
      '## MoM trajectory\n' +
      '## Market performance (AU/UK/US/DE/NL)\n' +
      '## Top roasters\n' +
      '## FTBP program health (single-channel risk check)\n' +
      '## SLA by market\n' +
      '## Cancellation reasons\n' +
      '## What I\'d dig into\n\n' +
      '# Data\n```json\n' + truncate(JSON.stringify(data, null, 2), 30000) + '\n```'
    )
  },
  strategy: {
    label: 'Strategy',
    collect: collectStrategy,
    model: () => MODELS.OPUS,
    maxTokens: 2000,
    system: 'You are a strategy advisor. Each day, pressure-test the 8 live correlations against the latest data. Flag anything shifting.',
    user: (data, dateKey) => (
      'Strategy pulse for ' + dateKey + '. For each correlation, say "still true / weakening / worth re-examining" with one-line justification. Then: what should Ziv propose in the next strategy review?\n\n' +
      '```json\n' + JSON.stringify(data.correlations, null, 2) + '\n```'
    )
  },
  news: {
    label: 'News',
    collect: (ctx) => collectNews(ctx, 30),
    model: () => MODELS.SONNET,
    maxTokens: 2500,
    skipIf: (d) => !(d.coffee?.length || d.tech?.length),
    system: 'You produce a terse news digest for a coffee-industry GM: only items that matter commercially or technically. No listicle. Opinionated filtering.',
    user: (data, dateKey) => (
      'News digest for ' + dateKey + '.\n\n' +
      '# Coffee & BRG (' + data.coffee.length + ' articles, last 30h)\n' +
      '```json\n' + truncate(JSON.stringify(data.coffee, null, 2), 15000) + '\n```\n\n' +
      '# AI & Tech (' + data.tech.length + ' articles, last 30h)\n' +
      '```json\n' + truncate(JSON.stringify(data.tech, null, 2), 15000) + '\n```\n\n' +
      '# Format:\n## Coffee signal\n## Tech signal\n## Meta-patterns'
    )
  },
  intel: {
    label: 'Intel',
    collect: collectIntel,
    model: () => MODELS.OPUS,
    maxTokens: 2000,
    skipIf: (d) => !(d.recentBriefings?.length || d.anomalies?.length),
    system: 'You synthesise competitive intelligence into actionable signal. Link anomalies to potential causes.',
    user: (data, dateKey) => (
      'Intel digest for ' + dateKey + '.\n\n' +
      'Roasters: ' + data.roasterCount + ' monitored, ' + data.partners + ' Beanz partners.\n\n' +
      '# Recent briefings\n```json\n' + truncate(JSON.stringify(data.recentBriefings, null, 2), 10000) + '\n```\n\n' +
      '# Anomalies (last 10)\n```json\n' + truncate(JSON.stringify(data.anomalies, null, 2), 6000) + '\n```\n\n' +
      '# Format:\n## Competitive signals worth acting on\n## Anomaly interpretation\n## Next investigation'
    )
  },
  notes: {
    label: 'Notes',
    collect: collectNotes,
    model: () => MODELS.HAIKU,
    maxTokens: 1200,
    skipIf: (d) => !(d.recentSources?.length || d.recentNotes?.length),
    system: 'You produce a short "what I researched yesterday" note for a knowledge worker.',
    user: (data, dateKey) => (
      'Notebook activity digest for ' + dateKey + '.\n\n' +
      '```json\n' + JSON.stringify(data, null, 2) + '\n```\n\n' +
      'Format:\n## Notebooks touched\n## New sources by theme\n## Notes created'
    )
  }
};

// ═══ Write helpers ═════════════════════════════════════════════

function writeDailySummary({ vault, dateKey, tab, spec, content, modelUsed }) {
  const rel = path.join('950-Daily-Summaries', dateKey, tab + '.md');
  const full = path.join(vault, rel);
  const fm = {
    title: 'Daily · ' + spec.label + ' · ' + dateKey,
    description: 'Auto-generated daily summary of the ' + spec.label + ' tab.',
    type: 'daily-summary',
    status: 'complete',
    owner: 'Platform',
    market: ['global'],
    tags: ['daily-summary', 'auto', tab],
    aliases: [],
    related: [],
    tab, date: dateKey,
    model_used: modelUsed || 'n/a',
    generated_at: new Date().toISOString()
  };
  writeFreshPage(full, fm, '# ' + spec.label + ' — ' + dateKey + '\n\n> Auto-generated · ' + (modelUsed || 'n/a') + ' · ' + new Date().toISOString() + '\n\n' + content);
  return rel.replace(/\\/g, '/');
}

function writeDailyIndex({ vault, dateKey, results }) {
  const rel = path.join('950-Daily-Summaries', dateKey, '_Index.md');
  const full = path.join(vault, rel);
  const lines = [
    '# Daily Summaries — ' + dateKey,
    '',
    '> Auto-generated index · ' + new Date().toISOString(),
    ''
  ];
  results.forEach(r => {
    const base = r.relPath ? path.basename(r.relPath, '.md') : r.tab;
    if (r.skipped) {
      lines.push('- ⏭ **' + TAB_SPECS[r.tab].label + '** — skipped (' + (r.skipReason || 'no data') + ')');
    } else if (r.error) {
      lines.push('- ❌ **' + TAB_SPECS[r.tab].label + '** — error: ' + r.error);
    } else {
      lines.push('- ✅ [[' + base + '|' + TAB_SPECS[r.tab].label + ']] — ' + (r.model || 'n/a') + ', ' + r.chars + ' chars');
    }
  });
  const fm = {
    title: 'Daily Summaries · ' + dateKey,
    description: 'Index of daily summary pages generated for ' + dateKey + '.',
    type: 'index',
    status: 'complete',
    owner: 'Platform',
    market: ['global'],
    tags: ['index', 'daily-summary', 'auto'],
    aliases: [],
    related: [],
    date: dateKey,
    generated_at: new Date().toISOString()
  };
  writeFreshPage(full, fm, lines.join('\n'));
  return rel.replace(/\\/g, '/');
}

// ═══ Main runner ═══════════════════════════════════════════════

async function runDailySummaries({ ctx, dateKey, tabs, force }) {
  if (!ctx || !ctx.anthropicApiKey) throw new Error('ctx.anthropicApiKey required');
  const vault = getVaultPath();
  const date = dateKey || todayInSydney();
  const wanted = tabs && tabs.length ? tabs : Object.keys(TAB_SPECS);
  const results = [];
  const d = db.getDb();

  for (const tab of wanted) {
    const spec = TAB_SPECS[tab];
    if (!spec) { results.push({ tab, error: 'unknown tab' }); continue; }

    // Skip if already run today (unless forced)
    if (!force) {
      const prior = d.prepare('SELECT id FROM daily_summary_runs WHERE date = ? AND tab = ? AND skipped = 0 AND error IS NULL').get(date, tab);
      if (prior) { results.push({ tab, skipped: true, skipReason: 'already ran today' }); continue; }
    }

    let data;
    try { data = spec.collect(ctx); }
    catch (e) { results.push({ tab, error: 'collect failed: ' + e.message }); continue; }

    if (spec.skipIf && spec.skipIf(data)) {
      d.prepare('INSERT INTO daily_summary_runs (date, tab, rel_path, model, content_chars, skipped, skip_reason) VALUES (?,?,?,?,?,?,?)')
        .run(date, tab, '', '', 0, 1, 'no data');
      results.push({ tab, skipped: true, skipReason: 'no data' });
      continue;
    }

    const model = spec.model();
    const system = spec.system;
    const user = spec.user(data, date);

    try {
      const { text, usage } = await callAnthropic({ apiKey: ctx.anthropicApiKey, model, system, user, maxTokens: spec.maxTokens || DEFAULT_MAX_TOKENS });
      if (!text || text.length < 100) {
        d.prepare('INSERT INTO daily_summary_runs (date, tab, rel_path, model, content_chars, skipped, skip_reason) VALUES (?,?,?,?,?,?,?)')
          .run(date, tab, '', model, text ? text.length : 0, 1, 'too short');
        results.push({ tab, skipped: true, skipReason: 'too short' });
        continue;
      }
      const relPath = writeDailySummary({ vault, dateKey: date, tab, spec, content: text, modelUsed: model });
      d.prepare('INSERT INTO daily_summary_runs (date, tab, rel_path, model, content_chars) VALUES (?,?,?,?,?)')
        .run(date, tab, relPath, model, text.length);
      results.push({ tab, relPath, model, chars: text.length, inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0 });
    } catch (e) {
      try { d.prepare('INSERT INTO daily_summary_runs (date, tab, rel_path, model, content_chars, error) VALUES (?,?,?,?,?,?)').run(date, tab, '', model, 0, e.message.slice(0, 500)); } catch {}
      results.push({ tab, error: e.message });
    }
  }

  // Write the day index
  try { writeDailyIndex({ vault, dateKey: date, results }); } catch {}

  return { date, vaultDir: vault, results };
}

// ═══ Weekly rollup ═════════════════════════════════════════════

async function runWeeklyRollup({ ctx, weekKey, dateKey }) {
  if (!ctx || !ctx.anthropicApiKey) throw new Error('ctx.anthropicApiKey required');
  const vault = getVaultPath();
  const today = dateKey || todayInSydney();
  const week = weekKey || weekOf(today);

  // Gather all daily summary pages from the last 7 days
  const daysDir = path.join(vault, '950-Daily-Summaries');
  const lastSeven = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    lastSeven.push(d.toISOString().slice(0, 10));
  }

  const combined = [];
  lastSeven.forEach(dk => {
    const dir = path.join(daysDir, dk);
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '_Index.md');
      files.forEach(f => {
        try {
          const raw = fs.readFileSync(path.join(dir, f), 'utf8');
          combined.push({ date: dk, tab: f.replace('.md', ''), content: truncate(raw, 3000) });
        } catch {}
      });
    } catch {}
  });

  if (!combined.length) return { week, skipped: true, reason: 'no daily summaries to roll up' };

  const user = 'Roll up the last 7 days of daily summaries into a weekly brain page.\n\n' +
    '# Sections:\n' +
    '## Week headline (one paragraph)\n' +
    '## Numbers that moved\n' +
    '## Projects — what shipped / got stuck\n' +
    '## Comms & people patterns\n' +
    '## Strategy signals reconfirmed or weakened\n' +
    '## Market & competitive signals\n' +
    '## What to focus on next week\n\n' +
    '# Source summaries\n\n' +
    combined.map(c => '## ' + c.date + ' · ' + c.tab + '\n\n' + c.content).join('\n\n---\n\n');

  const { text } = await callAnthropic({
    apiKey: ctx.anthropicApiKey,
    model: MODELS.OPUS,
    system: 'You roll up a week of daily briefings into a tight weekly synthesis. Priorities: patterns, trajectory, decisions needed. Ignore noise.',
    user, maxTokens: 3500
  });

  const rel = path.join('951-Weekly-Summaries', week + '.md');
  const full = path.join(vault, rel);
  const fm = {
    title: 'Weekly rollup · ' + week,
    description: 'Auto-generated weekly synthesis of daily summaries.',
    type: 'weekly-summary',
    status: 'complete',
    owner: 'Platform',
    market: ['global'],
    tags: ['weekly-summary', 'auto'],
    aliases: [],
    related: lastSeven.map(d => '[[950-Daily-Summaries/' + d + '/_Index|' + d + ']]'),
    week, generated_at: new Date().toISOString()
  };
  writeFreshPage(full, fm, '# Weekly rollup — ' + week + '\n\n> Covers ' + lastSeven[0] + ' to ' + lastSeven[6] + '\n\n' + text);
  return { week, relPath: rel.replace(/\\/g, '/'), chars: text.length };
}

// ═══ Status / observability ════════════════════════════════════

function getLastRun() {
  try {
    const d = db.getDb();
    const rows = d.prepare('SELECT date, tab, rel_path, model, content_chars, skipped, skip_reason, error, created_at FROM daily_summary_runs ORDER BY id DESC LIMIT 40').all();
    const latestDate = rows[0] ? rows[0].date : null;
    return { latestDate, runs: rows };
  } catch { return { latestDate: null, runs: [] }; }
}

module.exports = {
  runDailySummaries,
  runWeeklyRollup,
  getLastRun,
  TAB_SPECS,
  todayInSydney,
  weekOf
};
