'use strict';

/**
 * Optional LLM enhancement for the digest "State of Play" hero line.
 * Deterministic rules still produce the base narrative; this upgrades
 * the hero line to natural-language prose grounded in the same numbers.
 *
 * Guardrails:
 *   - Only fires for the hero line (small token cost per period change)
 *   - Uses Claude Haiku for speed + cost
 *   - Grounded prompt (system + data JSON) — no free-form rambling
 *   - Hard timeout 10s; falls back to deterministic line on error
 *   - Cached in memory keyed by period + snapshot hash
 */

const https = require('https');
const crypto = require('crypto');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 300;
const TIMEOUT_MS = 10000;

const _cache = new Map();

function hashSnap(period, headline) {
  const h = JSON.stringify({ k: period.kind, c: period.current, hl: headline });
  return crypto.createHash('sha256').update(h).digest('hex').slice(0, 24);
}

function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('Anthropic HTTP ' + res.statusCode + ': ' + data.slice(0, 200)));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Non-JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error('Anthropic timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function summariseHeadline(headline) {
  if (!Array.isArray(headline)) return null;
  const pick = (w) => headline.find(r => r.win === w);
  return {
    current:  pick('current'),
    previous: pick('previous'),
    yoy:      pick('yoy')
  };
}

/**
 * Generate a 2-3 sentence executive "State of Play" from the snapshot.
 * Returns the deterministic fallback if LLM unavailable.
 *
 * cfg: { anthropicApiKey }
 * snapshot: digest assembler output
 * deterministicFallback: string (from metrics-narrator)
 */
async function heroNarrative(cfg, snapshot, deterministicFallback) {
  const apiKey = cfg && cfg.anthropicApiKey;
  if (!apiKey) return deterministicFallback;
  if (!snapshot || !snapshot.period) return deterministicFallback;

  const key = hashSnap(snapshot.period, snapshot.headline);
  if (_cache.has(key)) return _cache.get(key);

  const headline = summariseHeadline(snapshot.headline);
  const context = {
    period: snapshot.period,
    headline,
    market_mix: (snapshot.marketMix || []).filter(r => r.win === 'current').slice(0, 5),
    program_mix: (snapshot.programMix || []).filter(r => r.win === 'current'),
    subscribers: (snapshot.subscriberLifecycle || []).find(r => r.win === 'current'),
    nrr: snapshot.nrr && snapshot.nrr[0],
    top_cancellation: (snapshot.cancellationReasons || []).filter(r => r.win === 'current').slice(0, 3),
    deterministic_note: deterministicFallback
  };

  const systemPrompt = `You are writing the "State of Play" headline for the Beanz coffee subscription business dashboard. Beanz is a specialty coffee subscription marketplace (part of Breville Group). Your job: summarise the current period's business performance in 2 concise sentences, grounded in the numbers provided. Lead with the biggest signal (growth, contraction, or standout shift). Include at least one specific number. Plain, executive English. No bullets, no emoji. Do not invent numbers not in the data.`;

  const userPrompt = `Data for ${snapshot.period.kind} = ${snapshot.period.label}:\n\n${JSON.stringify(context, null, 2)}\n\nWrite the 2-sentence executive narrative.`;

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const opts = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  try {
    const resp = await httpsJson(opts, body);
    const text = resp && resp.content && resp.content[0] && resp.content[0].text;
    if (text && text.trim()) {
      const cleaned = text.trim();
      _cache.set(key, cleaned);
      return cleaned;
    }
  } catch (e) {
    // fall through
  }
  return deterministicFallback;
}

module.exports = { heroNarrative };
