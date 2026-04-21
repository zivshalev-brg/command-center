'use strict';

// Email Performance Insight — FR-010
// Given a single email-perf row (+ benchmark context), call Anthropic to
// produce a structured narrative explaining WHY this send over/underperformed.
// Grounds every claim in numbers provided (no hallucination about data we
// didn't pass in). Returns JSON with bullets + anomalies + recommendations.

const https = require('https');

const MODEL = 'claude-sonnet-4-5-20250929';
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = [
  'You are an email-marketing analyst for Ziv Shalev at Beanz (coffee subscription platform, part of Breville Group).',
  'Beanz sends lifecycle emails (welcome, FTBP, winback), promos, and newsletters across AU/UK/US/DE/NL markets.',
  'Given ONE email send + its benchmark context, explain why it over- or under-performed.',
  '',
  'Rules:',
  '- Ground EVERY claim in the numbers provided. Do not invent data.',
  '- If a number is missing, say so — do not fabricate.',
  '- Be concise and actionable. This is for an executive, not a marketing intern.',
  '- Compare against the benchmark deltas (the "vs benchmark" figures) when explaining performance.',
  '- If cohort_proxy breakdown is provided, flag which cohort drove the result.',
  '- If regional breakdown is provided and one region dominates, call it out.',
  '',
  'Return ONLY valid JSON (no markdown, no explanation):',
  '{',
  '  "headline": "one-line verdict (e.g. \'Outperformed — +4.2pp open rate driven by 90d+ subs\')",',
  '  "sentiment": "outperform|neutral|underperform",',
  '  "bullets": [',
  '    { "point": "short bullet", "evidence": "the specific numbers that support it" },',
  '    ...3-5 bullets total...',
  '  ],',
  '  "anomalies": ["any surprising numbers that stand out"],',
  '  "recommendations": ["1-2 specific, concrete actions for the next send"]',
  '}'
].join('\n');

function callAnthropic(apiKey, systemPrompt, userMessage, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: API_HOSTNAME,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) return resolve(parsed.content[0].text);
          if (parsed.error) return reject(new Error(parsed.error.message));
          reject(new Error('Unexpected API response'));
        } catch (e) { reject(new Error('Failed to parse API response: ' + e.message)); }
      });
    });
    req.on('error', (err) => reject(new Error('API request failed: ' + err.message)));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

/**
 * Build a compact context bundle from an email-perf row + its deltas.
 * Kept as plain text (not JSON) to reduce token count and keep numbers legible.
 */
function buildContext(hit) {
  const t = hit.totals || {};
  const d = hit.deltas || {};
  const parts = [];
  parts.push('=== EMAIL ===');
  parts.push('SendID: ' + hit.sendId);
  parts.push('Name: ' + (hit.emailName || '(unnamed)'));
  if (hit.subject) parts.push('Subject: ' + hit.subject);
  parts.push('Category: ' + (hit.category || 'unknown'));
  parts.push('Region: ' + (hit.region || 'unknown'));
  parts.push('Sent: ' + (hit.sentDate || hit.sent_date || 'unknown'));
  parts.push('');
  parts.push('=== TOTALS ===');
  parts.push('Sent: ' + (t.sent ?? '—') + ' · Delivered: ' + (t.delivered ?? '—'));
  parts.push('Unique opens: ' + (t.unique_open ?? '—') + ' (open rate ' + (t.open_rate_pct != null ? t.open_rate_pct + '%' : '—') + ')');
  parts.push('Unique clicks: ' + (t.unique_click ?? '—') + ' (CTR ' + (t.ctr_pct != null ? t.ctr_pct + '%' : '—') + ')');
  if (d && (d.open_rate_delta_pp != null || d.ctr_delta_pp != null)) {
    parts.push('');
    parts.push('=== VS BENCHMARK (' + hit.category + ' · ' + hit.region + ') ===');
    if (d.benchmark_open_rate_pct != null) parts.push('Benchmark open rate: ' + d.benchmark_open_rate_pct + '%');
    if (d.benchmark_ctr_pct != null) parts.push('Benchmark CTR: ' + d.benchmark_ctr_pct + '%');
    if (d.open_rate_delta_pp != null) parts.push('Open-rate delta: ' + (d.open_rate_delta_pp > 0 ? '+' : '') + d.open_rate_delta_pp + 'pp');
    if (d.ctr_delta_pp != null) parts.push('CTR delta: ' + (d.ctr_delta_pp > 0 ? '+' : '') + d.ctr_delta_pp + 'pp');
  }
  if (hit.regional && hit.regional.length) {
    parts.push('');
    parts.push('=== REGIONAL BREAKDOWN ===');
    hit.regional.forEach((r) => {
      parts.push('- ' + (r.region || '?') + ': sent=' + (r.sent ?? '—') + ', opens=' + (r.unique_open ?? '—') + ', clicks=' + (r.unique_click ?? '—'));
    });
  }
  // cohort_proxy can be either a string label ("Mixed", "New", "Loyal") OR
  // an array of breakdown rows. Handle both shapes gracefully.
  const cohorts = hit.cohorts || hit.cohort_proxy;
  if (Array.isArray(cohorts) && cohorts.length) {
    parts.push('');
    parts.push('=== COHORT BREAKDOWN ===');
    cohorts.slice(0, 8).forEach((c) => {
      parts.push('- ' + (c.cohort || c.name || '?') + ': sent=' + (c.sent ?? '—') + ', opens=' + (c.unique_open ?? '—') + ', clicks=' + (c.unique_click ?? '—'));
    });
  } else if (typeof hit.cohort_proxy === 'string' && hit.cohort_proxy) {
    parts.push('');
    parts.push('Cohort: ' + hit.cohort_proxy + ' (proxy label — no per-cohort breakdown for this send)');
  }
  if (hit.topLinks && hit.topLinks.length) {
    parts.push('');
    parts.push('=== TOP LINKS ===');
    hit.topLinks.slice(0, 5).forEach((l) => {
      parts.push('- ' + (l.url || '?').slice(0, 80) + ' — ' + (l.clicks ?? '—') + ' clicks' + (l.ctr_pct != null ? ' (' + l.ctr_pct + '% CTR)' : ''));
    });
  }
  return parts.join('\n');
}

/**
 * Generates an AI narrative for one email-perf row.
 * Returns structured JSON — see SYSTEM_PROMPT schema.
 */
async function generateInsight(apiKey, hit) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!hit) throw new Error('email row required');
  const ctx = buildContext(hit);
  const raw = await callAnthropic(apiKey, SYSTEM_PROMPT, ctx);
  // Strip code-fence if the model wraps JSON in ```json
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(stripped); }
  catch (e) { throw new Error('AI returned non-JSON response: ' + raw.slice(0, 200)); }
  return validate(parsed);
}

function validate(raw) {
  const allowedSentiment = new Set(['outperform', 'neutral', 'underperform']);
  return {
    headline: typeof raw.headline === 'string' ? raw.headline.slice(0, 200) : '',
    sentiment: allowedSentiment.has(raw.sentiment) ? raw.sentiment : 'neutral',
    bullets: Array.isArray(raw.bullets) ? raw.bullets.slice(0, 6).map((b) => ({
      point: typeof b.point === 'string' ? b.point.slice(0, 300) : '',
      evidence: typeof b.evidence === 'string' ? b.evidence.slice(0, 300) : ''
    })).filter((b) => b.point) : [],
    anomalies: Array.isArray(raw.anomalies) ? raw.anomalies.slice(0, 5).map((a) => String(a).slice(0, 300)) : [],
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations.slice(0, 3).map((r) => String(r).slice(0, 300)) : []
  };
}

module.exports = { generateInsight, buildContext };
