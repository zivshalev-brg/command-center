// Auto-discovery of candidate projects from classified thread clusters.
// Runs after daily synthesis. Proposes projects for user confirmation.

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const MODELS = require('./ai-models');
const { getDb } = require('./db');
const store = require('./project-store');

const MIN_THREADS_PER_CLUSTER = 2;    // was 3 — broaden horizon
const MIN_PEOPLE_PER_CLUSTER = 2;
const CONFIDENCE_THRESHOLD = 0.5;     // was 0.55
const LOOKBACK_DAYS = 30;             // was 14 — longer horizon

// Open-ended discovery: look at UNCLASSIFIED threads (no project_tags) and cluster
// by shared entities. This finds projects that weren't in the classifier's list.
const OPEN_DISCOVERY_MIN_MENTIONS = 3;  // entity must appear in N+ unclassified threads
const OPEN_DISCOVERY_MIN_PEOPLE = 2;

function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

function _normTag(s) { return String(s || '').trim().toLowerCase(); }

function _existingTagSet(projects) {
  const set = new Set();
  for (const p of projects) {
    for (const t of p.classifier_tags || []) set.add(_normTag(t));
    for (const a of p.aliases || []) set.add(_normTag(a));
    set.add(_normTag(p.id));
    set.add(_normTag(p.title));
  }
  return set;
}

// Pull recent classified threads with project_tags
function _recentClassified(sinceIso) {
  const db = getDb();
  return db.prepare(
    `SELECT thread_id, project_tags, summary, category, priority
     FROM ai_classifications
     WHERE classified_at >= ? AND project_tags IS NOT NULL AND project_tags != '[]'`
  ).all(sinceIso);
}

// Cluster threads by their shared project_tag.
// A thread with tag X contributes to cluster X. If multiple tags, contributes to each.
function _cluster(rows, existingTags) {
  const buckets = {}; // tag → { threadIds, summaries, people, categories }
  for (const row of rows) {
    let tags = [];
    try { tags = JSON.parse(row.project_tags) || []; } catch { tags = []; }
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      const key = _normTag(tag);
      if (!key || existingTags.has(key)) continue;
      if (!buckets[key]) {
        buckets[key] = {
          tag, threadIds: new Set(), summaries: [], categories: {}, priorities: {}
        };
      }
      buckets[key].threadIds.add(row.thread_id);
      if (row.summary) buckets[key].summaries.push(row.summary);
      if (row.category) buckets[key].categories[row.category] = (buckets[key].categories[row.category] || 0) + 1;
      if (row.priority) buckets[key].priorities[row.priority] = (buckets[key].priorities[row.priority] || 0) + 1;
    }
  }
  return Object.values(buckets).map(b => ({
    ...b,
    threadIds: Array.from(b.threadIds)
  }));
}

function _enrichClusterWithPeople(cluster, ctx) {
  const commsPath = ctx.commsLivePath;
  const emailPath = path.join(ctx.intelDir, 'email-live.json');
  const commsLive = _readJson(commsPath) || {};
  const emailLive = _readJson(emailPath) || {};
  const threadsComms = commsLive.threads || {};
  const threadsEmail = emailLive.threads || {};
  const peopleCounts = {};
  for (const tid of cluster.threadIds) {
    const t = threadsComms[tid] || threadsEmail[tid];
    if (!t) continue;
    for (const person of t.people || []) {
      peopleCounts[person] = (peopleCounts[person] || 0) + 1;
    }
  }
  return { ...cluster, peopleCounts };
}

// Optional Claude naming step
function _claudeNameCluster(apiKey, cluster) {
  return new Promise((resolve) => {
    const prompt = [
      'You are naming a potential project. Based on these thread summaries, suggest:',
      '1. A concise project title (3-6 words)',
      '2. A one-sentence description',
      '3. 3-5 classifier tags (single words or short phrases)',
      'Return ONLY JSON: {"title":"","description":"","tags":[]}',
      '',
      `Candidate tag: ${cluster.tag}`,
      `Thread count: ${cluster.threadIds.length}`,
      'Thread summaries:',
      ...cluster.summaries.slice(0, 8).map(s => '- ' + s)
    ].join('\n');

    const body = JSON.stringify({
      model: MODELS.HAIKU,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const txt = parsed.content && parsed.content[0] && parsed.content[0].text;
          if (!txt) return resolve(null);
          const clean = txt.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
          const json = JSON.parse(clean.match(/\{[\s\S]*\}/)[0]);
          resolve(json);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// Noise we NEVER want as project candidates
const TOPIC_STOPWORDS = new Set([
  'hi', 'hello', 'hey', 'thanks', 'dear', 'regards', 'cheers', 'best', 'team',
  'sign up', 'sign in', 'view online', 'unsubscribe', 'click here', 'learn more',
  'external sender', 'external', 'no reply', 'noreply', 'all rights reserved',
  'privacy policy', 'terms of service', 'bourke rd', 'sydney', 'melbourne', 'australia',
  'new south wales', 'united states', 'united kingdom', 'netherlands', 'germany',
  'breville', 'beanz', 'sage', 'coffee',
  'breville group', 'sage appliances', 'facebook', 'instagram', 'twitter', 'linkedin',
  'america', 'europe', 'weekly', 'monthly', 'daily', 'quarterly', 'yearly', 'annual',
  'good morning', 'good afternoon', 'good evening', 'today', 'tomorrow', 'yesterday',
  'fyi', 'ftw', 'asap', 'eod', 'eow', 'eom', 'woohoo', 'wowzers',
  'hi ziv', 'hey ziv', 'dear ziv', 'ziv shalev', 'hi all', 'hi team',
  'project update', 'quick update', 'meeting notes', 'action item', 'follow up',
  'next steps', 'best regards', 'kind regards', 'warm regards',
  'pty ltd', 'pty ltd suite', 'together with tldr', 'tldr newsletter', 'tldr ai',
  'claude api', 'claude design', 'claude sonnet', 'claude opus', 'claude haiku',
  'open ai', 'chat gpt', 'chatgpt', 'anthropic', 'bourke rd', 'sydney', 'rozelle',
  'visit us', 'read more', 'shop now', 'get started', 'sign up', 'log in',
  'this email', 'this message', 'your account', 'your order', 'your subscription'
]);

const BUSINESS_TERMS = [
  'rollout', 'launch', 'migration', 'integration', 'initiative', 'pilot',
  'strategy', 'program', 'partnership', 'experiment', 'redesign', 'refresh',
  'review', 'audit', 'activation', 'campaign', 'expansion', 'overhaul', 'restructure'
];

function _loadPersonNameSet(ctx) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = JSON.parse(fs.readFileSync(path.join(ctx.intelDir, 'team-directory.json'), 'utf-8'));
    const names = new Set();
    for (const k of Object.keys(dir || {})) {
      const entry = dir[k];
      const full = (entry.n || entry.name || '').toLowerCase().trim();
      if (full && full.length >= 3) names.add(full);
      // Also first-name + last-name parts
      for (const part of full.split(/\s+/)) if (part.length >= 3) names.add(part);
    }
    return names;
  } catch { return new Set(); }
}

// Extract candidate topic phrases from a thread with STRONG filters.
function _extractTopicsFromThread(thread, personNames) {
  const topics = new Set();
  const text = ((thread.subject || '') + ' ' +
    (thread.preview || '') + ' ' +
    (Array.isArray(thread.messages) && thread.messages[0] ? thread.messages[0].text || '' : '')).slice(0, 2000);

  function isNoise(phrase) {
    const low = phrase.toLowerCase().trim();
    if (!low || low.length < 5 || low.length > 50) return true;
    if (TOPIC_STOPWORDS.has(low)) return true;
    if (personNames && personNames.has(low)) return true;
    // Single word (no space) — too generic unless has digits
    if (!low.includes(' ') && !/\d/.test(low)) return true;
    // Starts with generic filler
    if (/^(the|a|an|some|any|all|our|my|your|their|this|that|these|those|dear|hi|hey|hello|re:|fw:)\b/.test(low)) return true;
    return false;
  }

  // 1. Business-term co-occurrences: "NL Launch", "Blommers Rollout", "Shopify Migration"
  for (const term of BUSINESS_TERMS) {
    const re = new RegExp(`\\b([A-Z][a-zA-Z0-9]+(?:\\s+[A-Z][a-zA-Z0-9]+)?)\\s+${term}\\b`, 'g');
    for (const m of text.matchAll(re)) {
      const phrase = (m[1] + ' ' + term).trim();
      if (!isNoise(phrase)) topics.add(phrase);
    }
    // Also uppercase→lowercase pair: "NL rollout" → keep
    const re2 = new RegExp(`\\b([A-Z][A-Z0-9]{1,4})\\s+${term}\\b`, 'g');
    for (const m of text.matchAll(re2)) {
      const phrase = (m[1] + ' ' + term).trim();
      if (!isNoise(phrase)) topics.add(phrase);
    }
  }

  // 2. Quoted phrases ("Project X", 'Initiative Y')
  const quoted = text.match(/["']([A-Z][a-zA-Z0-9\s]{4,40})["']/g) || [];
  for (const q of quoted) {
    const trimmed = q.replace(/["']/g, '').trim();
    if (!isNoise(trimmed)) topics.add(trimmed);
  }

  // 3. Capitalised 2-3 word phrases THAT include a capitalised non-name word
  const capsPhrases = text.match(/[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,2}/g) || [];
  for (const p of capsPhrases) {
    const trimmed = p.trim();
    if (isNoise(trimmed)) continue;
    // Also drop if all words match a known person
    const words = trimmed.toLowerCase().split(/\s+/);
    const allPeople = words.every(w => personNames && personNames.has(w));
    if (allPeople) continue;
    // Require at least one word with 4+ chars (filters "No NL" etc.)
    const hasContent = words.some(w => w.length >= 4);
    if (hasContent) topics.add(trimmed);
  }

  return Array.from(topics).slice(0, 15);
}

// Open-ended discovery — scans threads WITHOUT project_tags and clusters by shared
// entity/topic. Surfaces new project candidates that aren't in the classifier's
// list. Leverages existing comms-live + email-live JSON (no DB dependency on
// ai_classifications.project_tags being populated).
async function discoverOpenEnded(ctx, opts = {}) {
  const fs = require('fs');
  const path = require('path');
  const commsPath = ctx.commsLivePath;
  const emailPath = path.join(ctx.intelDir, 'email-live.json');
  const _readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } };
  const comms = _readJson(commsPath) || {};
  const email = _readJson(emailPath) || {};

  // Pull threads that don't already have strong project_tags
  const threadsMap = Object.assign({}, comms.threads || {}, email.threads || {});
  const ids = Object.keys(threadsMap);
  if (!ids.length) return { found: 0, created: 0, candidates: [] };

  // Load existing tagged thread IDs so we skip already-classified ones
  const db = getDb();
  const classifiedRows = db.prepare(
    `SELECT thread_id FROM ai_classifications WHERE project_tags IS NOT NULL AND project_tags != '[]' AND project_tags != 'null'`
  ).all();
  const classifiedSet = new Set(classifiedRows.map(r => r.thread_id));

  // Existing project tags/aliases to exclude from new suggestions
  const projects = store.listProjects({ includeArchived: true });
  const existingTags = _existingTagSet(projects);

  const personNames = _loadPersonNameSet(ctx);

  // Topic → thread cluster
  const topicBuckets = {};
  for (const tid of ids) {
    if (classifiedSet.has(tid)) continue;  // already tagged — skip for open discovery
    const t = threadsMap[tid];
    if (!t) continue;
    const topics = _extractTopicsFromThread(t, personNames);
    for (const topic of topics) {
      const key = _normTag(topic);
      if (!key || key.length < 4) continue;
      if (existingTags.has(key)) continue;
      if (!topicBuckets[key]) topicBuckets[key] = { topic, threadIds: new Set(), people: new Set(), subjects: [] };
      topicBuckets[key].threadIds.add(tid);
      for (const person of t.people || []) topicBuckets[key].people.add(person);
      if (t.subject) topicBuckets[key].subjects.push(t.subject);
    }
  }

  // Filter by thresholds
  const viable = Object.values(topicBuckets)
    .filter(b => b.threadIds.size >= OPEN_DISCOVERY_MIN_MENTIONS && b.people.size >= OPEN_DISCOVERY_MIN_PEOPLE)
    .map(b => ({
      topic: b.topic,
      threadIds: Array.from(b.threadIds),
      peopleCounts: Object.fromEntries(Array.from(b.people).map(p => [p, 1])),
      confidence: Math.min(0.9, 0.45 + 0.1 * b.threadIds.size + 0.05 * b.people.size),
      summaries: b.subjects.slice(0, 8),
      tag: b.topic
    }));

  if (!viable.length) return { found: 0, created: 0, candidates: [] };

  // Suppress already-pending or rejected candidates
  const pending = store.listCandidates('pending');
  const rejected = store.listCandidates('rejected');
  const seenTags = new Set([].concat(
    pending.flatMap(c => (c.suggested_tags || []).map(_normTag)),
    rejected.flatMap(c => (c.suggested_tags || []).map(_normTag))
  ));

  const created = [];
  for (const cluster of viable) {
    if (seenTags.has(_normTag(cluster.tag))) continue;

    let title = cluster.topic;
    let description = null;
    let tags = [cluster.topic];
    if (ctx.anthropicApiKey && !opts.skipAI) {
      try {
        const named = await _claudeNameCluster(ctx.anthropicApiKey, cluster);
        if (named) {
          title = named.title || title;
          description = named.description || null;
          tags = Array.isArray(named.tags) && named.tags.length ? named.tags : tags;
        }
      } catch {}
    }

    const topPeople = Array.from(Object.keys(cluster.peopleCounts)).slice(0, 6);
    const candidate = store.createCandidate({
      suggested_title: title,
      suggested_description: description || ('Auto-discovered from ' + cluster.threadIds.length + ' thread mentions of "' + cluster.topic + '"'),
      suggested_tags: tags,
      suggested_people: topPeople,
      cluster_signals: {
        thread_ids: cluster.threadIds.slice(0, 30),
        topic: cluster.topic,
        discovery_mode: 'open_ended'
      },
      confidence: cluster.confidence
    });
    created.push(candidate);
  }

  return { at: new Date().toISOString(), found: viable.length, created: created.length, candidates: created };
}

async function discoverCandidates(ctx, opts = {}) {
  const projects = store.listProjects({ includeArchived: true });
  const existingTags = _existingTagSet(projects);
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  const rows = _recentClassified(sinceIso);
  const rawClusters = _cluster(rows, existingTags);
  // Drop clusters below threshold
  const viable = rawClusters.filter(c => c.threadIds.length >= MIN_THREADS_PER_CLUSTER);

  const enriched = [];
  for (const c of viable) {
    const e = _enrichClusterWithPeople(c, ctx);
    const peopleCount = Object.keys(e.peopleCounts || {}).length;
    if (peopleCount < MIN_PEOPLE_PER_CLUSTER) continue;

    // Confidence: logistic-ish on counts
    const threadWeight = Math.min(1, e.threadIds.length / 10);
    const peopleWeight = Math.min(1, peopleCount / 6);
    const confidence = 0.4 + 0.35 * threadWeight + 0.25 * peopleWeight;

    if (confidence < CONFIDENCE_THRESHOLD) continue;
    enriched.push({ ...e, confidence });
  }

  // Dedupe against already-pending candidates (by tag)
  const pending = store.listCandidates('pending');
  const pendingTags = new Set(pending.map(c => _normTag(c.suggested_title)).concat(
    pending.flatMap(c => (c.suggested_tags || []).map(_normTag))
  ));

  // Suppress rejected (same tag)
  const rejected = store.listCandidates('rejected');
  const rejectedTags = new Set(rejected.flatMap(c => (c.suggested_tags || []).map(_normTag)));

  const created = [];
  for (const cluster of enriched) {
    const nTag = _normTag(cluster.tag);
    if (pendingTags.has(nTag) || rejectedTags.has(nTag)) continue;

    // Optional AI naming
    let title = cluster.tag;
    let description = null;
    let tags = [cluster.tag];
    if (ctx.anthropicApiKey && !opts.skipAI) {
      try {
        const named = await _claudeNameCluster(ctx.anthropicApiKey, cluster);
        if (named) {
          title = named.title || title;
          description = named.description || null;
          tags = Array.isArray(named.tags) && named.tags.length ? named.tags : tags;
        }
      } catch {}
    }

    const topPeople = Object.entries(cluster.peopleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    const candidate = store.createCandidate({
      suggested_title: title,
      suggested_description: description,
      suggested_tags: tags,
      suggested_people: topPeople,
      cluster_signals: {
        thread_ids: cluster.threadIds.slice(0, 30),
        categories: cluster.categories,
        priorities: cluster.priorities
      },
      confidence: cluster.confidence
    });
    created.push(candidate);
  }

  return { at: new Date().toISOString(), found: viable.length, created: created.length, candidates: created };
}

// Accept a candidate: creates a real project, backfills sources
async function acceptCandidate(ctx, candidateId, opts = {}) {
  const row = getDb().prepare('SELECT * FROM project_candidates WHERE id = ?').get(candidateId);
  if (!row) throw new Error('candidate not found');

  const parsedTags = _safeParse(row.suggested_tags, []);
  const parsedPeople = _safeParse(row.suggested_people, []);
  const signals = _safeParse(row.cluster_signals, {});

  // Try to resolve people names to person IDs
  const peopleDirectory = _readJson(path.join(ctx.intelDir, 'team-directory.json')) || {};
  const peopleIds = [];
  for (const raw of parsedPeople) {
    const nRaw = _normTag(raw);
    for (const [pid, pdata] of Object.entries(peopleDirectory)) {
      const canon = _normTag(pdata.n || pdata.name || pid);
      if (canon && (nRaw === canon || nRaw.includes(canon) || canon.includes(nRaw))) {
        peopleIds.push(pid);
        break;
      }
    }
  }

  const project = store.createProject({
    title: opts.title || row.suggested_title,
    description: opts.description || row.suggested_description,
    classifier_tags: opts.tags || parsedTags,
    aliases: [row.suggested_title],
    people_ids: peopleIds,
    status: 'active',
    rag: 'amber',
    priority: 55,
    colour: 'var(--ac)',
    source: 'auto_discovered',
    auto_discovery_confidence: row.confidence
  });

  store.decideCandidate(candidateId, 'accepted', project.id);

  // Deep KB context backfill (fire-and-forget, runs in background)
  try {
    const { backfillNewProjectContext } = require('./project-context-builder');
    backfillNewProjectContext(ctx, project.id).catch(e => console.error('[Backfill] auto-accepted', project.id, e.message));
  } catch (e) { console.error('[Backfill] setup failed:', e.message); }

  // Immediate backfill from cluster thread_ids (synchronous, instant)
  const commsLive = _readJson(ctx.commsLivePath) || {};
  const threadsComms = commsLive.threads || {};
  const emailLive = _readJson(path.join(ctx.intelDir, 'email-live.json')) || {};
  const threadsEmail = emailLive.threads || {};
  for (const tid of (signals.thread_ids || [])) {
    const t = threadsComms[tid] || threadsEmail[tid];
    if (!t) continue;
    const srcType = (t.sources && t.sources.includes('slack')) ? 'slack' : 'email';
    store.upsertSource(project.id, {
      source_type: srcType,
      source_id: tid,
      title: t.subject || '',
      relevance: 0.8,
      link_method: 'auto_discovery_backfill'
    });
  }

  return { project, candidate_id: candidateId };
}

function rejectCandidate(id) {
  return store.decideCandidate(id, 'rejected');
}

function mergeCandidateInto(id, targetProjectId) {
  const row = getDb().prepare('SELECT * FROM project_candidates WHERE id = ?').get(id);
  if (!row) throw new Error('candidate not found');
  const existing = store.getProject(targetProjectId);
  if (!existing) throw new Error('target project not found');

  const parsedTags = _safeParse(row.suggested_tags, []);
  const mergedTags = Array.from(new Set((existing.classifier_tags || []).concat(parsedTags)));
  const mergedAliases = Array.from(new Set((existing.aliases || []).concat([row.suggested_title])));

  store.updateProject(targetProjectId, { classifier_tags: mergedTags, aliases: mergedAliases });
  store.decideCandidate(id, 'merged', targetProjectId);
  return store.getProject(targetProjectId);
}

function _safeParse(s, fallback) {
  if (!s) return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

// Combined pass: classifier-tag discovery + open-ended. Use this as the
// default entry point for the scheduler and the UI "Rescan" button.
async function discoverAll(ctx, opts = {}) {
  const tagBased = await discoverCandidates(ctx, opts);
  let openEnded = { created: 0, candidates: [] };
  try { openEnded = await discoverOpenEnded(ctx, opts); }
  catch (e) { console.error('[Discovery] open-ended failed:', e.message); }
  return {
    at: new Date().toISOString(),
    tag_based: tagBased,
    open_ended: openEnded,
    created: (tagBased.created || 0) + (openEnded.created || 0),
    candidates: [].concat(tagBased.candidates || [], openEnded.candidates || [])
  };
}

module.exports = { discoverCandidates, discoverOpenEnded, discoverAll, acceptCandidate, rejectCandidate, mergeCandidateInto };
