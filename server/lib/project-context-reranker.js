// Rerank candidate sources with Claude-Haiku.
// Given a project brief and up to 80 candidate sources, Claude returns a
// filtered + re-scored list of the truly relevant ones.

'use strict';

const https = require('https');
const MODELS = require('./ai-models');

const SYSTEM_PROMPT = [
  "You filter candidate context sources for a project. Your job: given a project brief",
  "and a list of candidate source artifacts (Slack/email threads, Jira issues, Confluence",
  "pages, calendar events, KB docs), return ONLY the ones that are genuinely relevant to",
  "the project's focus areas.",
  "",
  "Return ONLY valid JSON:",
  '{ "keep": [<list of integer indexes>], "reasoning": "<one sentence>" }',
  "",
  "Rules:",
  "1. Cut noise aggressively — a name collision is not relevance.",
  "2. Prefer sources that discuss the project's focus_areas, key_entities, or domain_vocab.",
  "3. Keep at most 40 indexes. Quality > quantity.",
  "4. If nothing is relevant, return { \"keep\": [], \"reasoning\": \"...\" }."
].join('\n');

function _callClaude(apiKey, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODELS.HAIKU,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) resolve(parsed.content[0].text);
          else reject(new Error(parsed.error && parsed.error.message || 'No content'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

/**
 * Rerank candidates. If AI is unavailable or fails, returns original list sorted
 * by relevance (deterministic fallback).
 *
 * @param ctx — server ctx (for apiKey)
 * @param brief — project brief object (or null)
 * @param project — project DB row
 * @param candidates — array of { source_type, source_id, title, excerpt, relevance, _method }
 * @param opts — { max: 40, skipAI: false }
 */
async function rerankCandidates(ctx, brief, project, candidates, opts = {}) {
  const max = opts.max || 40;
  const deterministic = candidates
    .slice()
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, max);

  if (!ctx.anthropicApiKey || opts.skipAI || !candidates.length) return deterministic;

  // Cap at 80 inputs (don't blow token budget)
  const input = candidates.slice(0, 80);

  const briefBlock = brief ? [
    'PROJECT BRIEF:',
    '- one_liner: ' + (brief.one_liner || ''),
    '- context_profile: ' + (brief.context_profile || 'general'),
    '- focus_areas: ' + (brief.focus_areas || []).slice(0, 8).join(', '),
    '- key_entities: ' + (brief.key_entities || []).slice(0, 8).join(', '),
    '- domain_vocab: ' + (brief.domain_vocab || []).slice(0, 12).join(', ')
  ].join('\n') : [
    'PROJECT:',
    '- title: ' + project.title,
    '- description: ' + (project.description || ''),
    '- tags: ' + (project.classifier_tags || []).join(', ')
  ].join('\n');

  const candidatesBlock = input.map((c, i) =>
    `[${i}] ${(c.source_type || '').padEnd(10)} ${String(c.title || '').slice(0, 100)}${c.excerpt ? ' — ' + String(c.excerpt).slice(0, 120) : ''}`
  ).join('\n');

  const userMessage = [
    briefBlock,
    '',
    'CANDIDATE SOURCES (' + input.length + ') — indexes [0-' + (input.length - 1) + ']:',
    candidatesBlock,
    '',
    'Return JSON now. Keep only the genuinely relevant indexes.'
  ].join('\n');

  try {
    const text = await _callClaude(ctx.anthropicApiKey, userMessage);
    const parsed = _parseJson(text);
    if (!parsed || !Array.isArray(parsed.keep)) return deterministic;
    const keepSet = new Set(parsed.keep.filter(n => Number.isInteger(n) && n >= 0 && n < input.length));
    if (!keepSet.size) return deterministic.slice(0, Math.min(10, deterministic.length));
    // Build AI-kept list in Claude's preferred order
    const aiKept = Array.from(keepSet).map(i => input[i]);

    // Floor: guarantee at least N of each source type Claude found above threshold.
    // Ensures we don't drop all Slack/email just because Claude prefers KB docs.
    const MIN_PER_TYPE = { slack: 5, email: 5, jira: 3, confluence: 2, calendar: 2, kb: 3 };
    const byType = {};
    for (const c of aiKept) (byType[c.source_type] = byType[c.source_type] || []).push(c);

    // For any type where AI kept < floor, backfill from top-scored deterministic
    for (const [type, floor] of Object.entries(MIN_PER_TYPE)) {
      const aiCount = (byType[type] || []).length;
      if (aiCount >= floor) continue;
      const need = floor - aiCount;
      const candidates = deterministic
        .filter(c => c.source_type === type && !aiKept.includes(c))
        .slice(0, need);
      aiKept.push(...candidates);
    }

    return aiKept.slice(0, max);
  } catch (e) {
    console.warn('[Rerank] failed, using deterministic:', e.message);
    return deterministic;
  }
}

module.exports = { rerankCandidates };
