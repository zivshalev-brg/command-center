// Project daily synthesis engine.
// Gathers 24h of source data for a project, calls Claude, persists to project_updates.

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const MODELS = require('./ai-models');
const store = require('./project-store');
const { getDb } = require('./db');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./project-synthesis-prompt');

const DEFAULT_MODEL = MODELS.SONNET;
const PRIORITY_OPUS_THRESHOLD = 80; // projects with priority >= use Opus
const MAX_TOKENS = 1800;
const MIN_SIGNALS_FOR_SYNTH = 1;

// ─── Anthropic call ───────────────────────────────────────────

function callClaude(apiKey, systemPrompt, userMessage, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve({
              text: parsed.content[0].text,
              usage: parsed.usage || null
            });
          } else if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            reject(new Error('Unexpected API response'));
          }
        } catch (e) {
          reject(new Error('Parse failed: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Source gatherers ────────────────────────────────────────

function _readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

function _gatherExcerpts(projectId, sinceIso, ctx) {
  // Read project_sources rows, then enrich each with excerpt from the live JSON cache.
  const rows = store.listSources(projectId, { sinceIso, limit: 80 });
  if (!rows.length) return [];

  const commsLive = _readJson(ctx.commsLivePath) || {};
  const emailLive = _readJson(path.join(ctx.intelDir, 'email-live.json')) || {};
  const jiraLive = _readJson(path.join(ctx.intelDir, 'jira-live.json')) || {};
  const calLive = _readJson(path.join(ctx.intelDir, 'calendar-live.json')) || {};

  const commsThreads = (commsLive.threads || {});
  const emailThreads = (emailLive.threads || {});
  const jiraItems = {};
  const jiraSrc = (jiraLive.recentMovements || []).concat(jiraLive.blockers || []);
  for (const i of jiraSrc) if (i && i.key) jiraItems[i.key] = i;
  const calEvents = {};
  for (const e of calLive.events || []) {
    const id = String(e.id || e.iCalUId || `${e.subject}_${e.start || ''}`);
    calEvents[id] = e;
  }

  return rows.map(r => {
    let excerpt = '';
    if (r.source_type === 'slack' && commsThreads[r.source_id]) {
      const t = commsThreads[r.source_id];
      const first = t.messages && t.messages[0];
      excerpt = (first && first.text || t.preview || '').slice(0, 240);
    } else if (r.source_type === 'email' && emailThreads[r.source_id]) {
      const t = emailThreads[r.source_id];
      excerpt = (t.preview || (t.messages && t.messages[0] && (t.messages[0].text || t.messages[0].bodyPreview)) || '').slice(0, 240);
    } else if (r.source_type === 'jira' && jiraItems[r.source_id]) {
      const i = jiraItems[r.source_id];
      excerpt = ((i.status ? `[${i.status}] ` : '') + (i.summary || '') + ' · ' + (i.assignee || '')).slice(0, 240);
    } else if (r.source_type === 'calendar' && calEvents[r.source_id]) {
      const e = calEvents[r.source_id];
      excerpt = ((e.start ? e.start + ' ' : '') + (e.bodyPreview || '')).slice(0, 240);
    }
    return {
      source_type: r.source_type,
      source_id: r.source_id,
      title: r.title,
      url: r.url,
      relevance: r.relevance,
      excerpt
    };
  });
}

// ─── Deterministic health score ────────────────────────────

function _computeHealth(project, sources, blockers) {
  // Base from RAG
  const ragScore = project.rag === 'green' ? 80 : project.rag === 'amber' ? 60 : 35;
  const blockerPenalty = Math.min(30, blockers.length * 6);
  const criticalPenalty = blockers.filter(b => b.severity === 'critical').length * 10;
  const signalBoost = Math.min(10, Math.max(0, sources.length - 2) * 2);
  const score = Math.max(0, Math.min(100, ragScore - blockerPenalty - criticalPenalty + signalBoost));
  return Math.round(score);
}

// ─── Main ─────────────────────────────────────────────────

function _todayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _parseJsonRelaxed(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  // Strip markdown fences
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Extract first { ... } block
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

async function synthesizeProject(ctx, projectId, opts = {}) {
  const project = store.getProjectFull(projectId);
  if (!project) throw new Error('project not found: ' + projectId);

  const date = opts.date || _todayDate();
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sources = _gatherExcerpts(projectId, sinceIso, ctx);
  const blockers = project.blockers || [];

  // Compose counts
  const sources_counts = {
    slack: sources.filter(s => s.source_type === 'slack').length,
    email: sources.filter(s => s.source_type === 'email').length,
    jira: sources.filter(s => s.source_type === 'jira').length,
    confluence: sources.filter(s => s.source_type === 'confluence').length,
    calendar: sources.filter(s => s.source_type === 'calendar').length
  };
  const totalSignals = sources.length;

  // Deterministic health regardless of whether Claude runs
  const health_score = _computeHealth(project, sources, blockers);

  const priorUpdate = store.getLatestUpdate(projectId);

  // If no Claude key or no signals, persist a deterministic-only update
  if (!ctx.anthropicApiKey) {
    const fallback = {
      project_id: projectId, date,
      summary: totalSignals === 0
        ? 'No new source activity in last 24h; carrying forward existing blockers and milestones.'
        : `${totalSignals} artifact${totalSignals === 1 ? '' : 's'} touched the project; AI synthesis skipped (no API key).`,
      what_moved: sources.slice(0, 5).map(s => `[${s.source_type}] ${s.title || s.source_id}`),
      decisions: [],
      new_blockers: [],
      milestones_touched: [],
      recommended_actions: [],
      health_score,
      rag_suggested: project.rag || 'green',
      momentum_delta: 0,
      source_artifacts: sources.slice(0, 20),
      sources_counts,
      model_used: 'deterministic',
      token_cost: 0
    };
    store.upsertUpdate(fallback);
    return { ...fallback, _mode: 'fallback_no_api' };
  }

  if (totalSignals < MIN_SIGNALS_FOR_SYNTH && !opts.force) {
    const quiet = {
      project_id: projectId, date,
      summary: 'Quiet day — no new source activity in the last 24 hours.',
      what_moved: [], decisions: [], new_blockers: [], milestones_touched: [],
      recommended_actions: [],
      health_score,
      rag_suggested: project.rag || 'green',
      momentum_delta: priorUpdate ? -0.1 : 0,
      source_artifacts: [],
      sources_counts,
      model_used: 'deterministic',
      token_cost: 0
    };
    store.upsertUpdate(quiet);
    return { ...quiet, _mode: 'quiet' };
  }

  const model = (project.priority || 50) >= PRIORITY_OPUS_THRESHOLD ? MODELS.OPUS : DEFAULT_MODEL;
  const userPrompt = buildUserPrompt({ project, sources, date, priorUpdate });

  let aiResponse;
  try {
    aiResponse = await callClaude(ctx.anthropicApiKey, SYSTEM_PROMPT, userPrompt, model);
  } catch (e) {
    const errRow = {
      project_id: projectId, date,
      summary: `AI synthesis failed: ${e.message}`,
      what_moved: [], decisions: [], new_blockers: [], milestones_touched: [],
      recommended_actions: [],
      health_score,
      rag_suggested: project.rag || 'green',
      momentum_delta: 0,
      source_artifacts: sources.slice(0, 15),
      sources_counts,
      model_used: model,
      token_cost: 0
    };
    store.upsertUpdate(errRow);
    return { ...errRow, _mode: 'error', _error: e.message };
  }

  const parsed = _parseJsonRelaxed(aiResponse.text);
  if (!parsed) {
    const bad = {
      project_id: projectId, date,
      summary: 'AI returned unparseable output; review logs.',
      what_moved: [], decisions: [], new_blockers: [], milestones_touched: [],
      recommended_actions: [],
      health_score,
      rag_suggested: project.rag || 'green',
      momentum_delta: 0,
      source_artifacts: sources.slice(0, 15),
      sources_counts,
      model_used: model,
      token_cost: (aiResponse.usage && (aiResponse.usage.input_tokens + aiResponse.usage.output_tokens)) || 0
    };
    store.upsertUpdate(bad);
    return { ...bad, _mode: 'unparseable', _raw: aiResponse.text.slice(0, 200) };
  }

  // Merge AI response with deterministic health
  const record = {
    project_id: projectId, date,
    summary: parsed.summary || '',
    what_moved: Array.isArray(parsed.what_moved) ? parsed.what_moved : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    new_blockers: Array.isArray(parsed.new_blockers) ? parsed.new_blockers : [],
    milestones_touched: Array.isArray(parsed.milestones_touched) ? parsed.milestones_touched : [],
    recommended_actions: Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [],
    health_score: typeof parsed.health_score === 'number' ? parsed.health_score : health_score,
    rag_suggested: parsed.rag_suggested || project.rag || 'green',
    momentum_delta: typeof parsed.momentum_delta === 'number' ? parsed.momentum_delta : 0,
    source_artifacts: Array.isArray(parsed.source_artifacts) && parsed.source_artifacts.length
      ? parsed.source_artifacts
      : sources.slice(0, 20),
    sources_counts,
    model_used: model,
    token_cost: (aiResponse.usage && (aiResponse.usage.input_tokens + aiResponse.usage.output_tokens)) || 0
  };

  const saved = store.upsertUpdate(record);

  // Auto-insert recommended actions into project_actions with origin='ai_synthesis'
  // Only if they are new (text comparison with existing open actions)
  try {
    const existingActions = store.listActions(projectId).map(a => String(a.text || '').toLowerCase().trim());
    for (const ra of record.recommended_actions.slice(0, 6)) {
      const text = typeof ra === 'string' ? ra : (ra && ra.text);
      if (!text) continue;
      if (existingActions.includes(text.toLowerCase().trim())) continue;
      store.addAction(projectId, {
        text,
        priority: (typeof ra === 'object' && ra.priority) || 'normal',
        owner_id: (typeof ra === 'object' && ra.owner_id) || null,
        origin: 'ai_synthesis',
        origin_ref: `update:${date}`
      });
    }
  } catch (e) {
    console.warn('[Synthesis] action auto-insert failed:', e.message);
  }

  return { ...saved, _mode: 'synthesized' };
}

async function synthesizeAll(ctx, opts = {}) {
  const projects = store.listProjects({ includeArchived: false });
  const results = [];
  // Concurrency: 2 at a time
  const queue = projects.slice();
  const MAX_CONC = opts.concurrency || 2;
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      try {
        const r = await synthesizeProject(ctx, p.id, opts);
        results.push({ id: p.id, mode: r._mode, tokens: r.token_cost });
      } catch (e) {
        results.push({ id: p.id, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: MAX_CONC }, worker));
  return { at: new Date().toISOString(), count: projects.length, results };
}

module.exports = { synthesizeProject, synthesizeAll };
