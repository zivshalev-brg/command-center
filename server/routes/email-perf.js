'use strict';

// Email Performance Layer — FR-005 cache route + FR-010 AI insight.
// Reads kb-data/intelligence/email-perf-live.json (written by refresh-email-perf.js)
// and serves list + per-SendID endpoints to the frontend. The Beanz OS module
// never queries Databricks directly on page load.

const path = require('path');
const { jsonReply, readJSON, readBody } = require('../lib/helpers');
const db = require('../lib/db');
const emailInsight = require('../lib/email-insight');

const CACHE_FILE = 'email-perf-live.json';

function cachePath(ctx) { return path.join(ctx.intelDir, CACHE_FILE); }

function readSnapshot(ctx) {
  try { return readJSON(cachePath(ctx)); } catch { return null; }
}

// Rebuild the { hit + deltas } shape used by the GET endpoint — the insight
// generator needs the same compact context.
function buildHitWithDeltas(snap, sendId) {
  const hit = (snap.emails || []).find((e) => e.sendId === sendId);
  if (!hit) return null;
  const bench = (snap.benchmarks || []).find((b) => b.category === hit.category && (b.region === hit.region || b.region === 'Unknown'));
  const deltas = bench ? {
    open_rate_delta_pp: hit.totals.open_rate_pct != null && bench.open_rate_pct != null ? Math.round((hit.totals.open_rate_pct - bench.open_rate_pct) * 10) / 10 : null,
    ctr_delta_pp: hit.totals.ctr_pct != null && bench.ctr_pct != null ? Math.round((hit.totals.ctr_pct - bench.ctr_pct) * 10) / 10 : null,
    benchmark_open_rate_pct: bench.open_rate_pct,
    benchmark_ctr_pct: bench.ctr_pct
  } : null;
  return Object.assign({}, hit, { deltas });
}

module.exports = function handleEmailPerf(req, res, parts, url, ctx) {
  const snap = readSnapshot(ctx);
  if (!snap) {
    return jsonReply(res, 404, {
      error: 'No email-perf snapshot yet. Run scripts/refresh-email-perf.js to generate one.',
      expectedPath: cachePath(ctx)
    });
  }

  // GET /api/email-perf — list payload (paginated, filterable)
  if (!parts[0] && req.method === 'GET') {
    const sp = url.searchParams || new URLSearchParams();
    const category = sp.get('category') || '';
    const region = sp.get('region') || '';
    const limit = Math.min(parseInt(sp.get('limit'), 10) || 50, 200);
    const offset = parseInt(sp.get('offset'), 10) || 0;
    const q = (sp.get('q') || '').toLowerCase();

    let emails = snap.emails || [];
    if (category) emails = emails.filter((e) => e.category === category);
    if (region) emails = emails.filter((e) => e.region === region);
    if (q) emails = emails.filter((e) =>
      (e.emailName || '').toLowerCase().includes(q) ||
      (e.subject || '').toLowerCase().includes(q)
    );

    const total = emails.length;
    const page = emails.slice(offset, offset + limit);

    return jsonReply(res, 200, {
      generated_at: snap.generated_at,
      window_days: snap.window_days,
      source: snap.source || 'file',
      total,
      offset,
      limit,
      emails: page
    });
  }

  // GET /api/email-perf/benchmarks — category × region benchmarks
  if (parts[0] === 'benchmarks' && req.method === 'GET') {
    return jsonReply(res, 200, {
      generated_at: snap.generated_at,
      benchmarks: snap.benchmarks || []
    });
  }

  // GET /api/email-perf/{sendId} — full performance payload for one email
  // Must exclude sub-paths like /insight — check parts[1] is undefined
  if (parts[0] && /^\d+$/.test(parts[0]) && !parts[1] && req.method === 'GET') {
    const sendId = parseInt(parts[0], 10);
    const hit = (snap.emails || []).find((e) => e.sendId === sendId);
    if (!hit) return jsonReply(res, 404, { error: 'SendID not found in current snapshot', sendId });

    // Compute benchmark delta inline
    const bench = (snap.benchmarks || []).find((b) => b.category === hit.category && (b.region === hit.region || b.region === 'Unknown'));
    const deltas = bench ? {
      open_rate_delta_pp: hit.totals.open_rate_pct != null && bench.open_rate_pct != null ? Math.round((hit.totals.open_rate_pct - bench.open_rate_pct) * 10) / 10 : null,
      ctr_delta_pp: hit.totals.ctr_pct != null && bench.ctr_pct != null ? Math.round((hit.totals.ctr_pct - bench.ctr_pct) * 10) / 10 : null,
      benchmark_open_rate_pct: bench.open_rate_pct,
      benchmark_ctr_pct: bench.ctr_pct
    } : null;

    return jsonReply(res, 200, Object.assign({}, hit, { deltas }));
  }

  // GET /api/email-perf/{sendId}/insight — cached-only (no generation)
  if (parts[0] && /^\d+$/.test(parts[0]) && parts[1] === 'insight' && req.method === 'GET') {
    const sendId = parseInt(parts[0], 10);
    const cached = db.getEmailInsight(sendId);
    if (!cached) return jsonReply(res, 404, { sendId, cached: false, error: 'No cached insight — POST to generate' });
    return jsonReply(res, 200, { sendId, cached: true, generated_at: cached.generated_at, narrative: cached.narrative });
  }

  // POST /api/email-perf/{sendId}/insight — generate or return cached AI narrative
  if (parts[0] && /^\d+$/.test(parts[0]) && parts[1] === 'insight' && req.method === 'POST') {
    const sendId = parseInt(parts[0], 10);
    const hit = buildHitWithDeltas(snap, sendId);
    if (!hit) return jsonReply(res, 404, { error: 'SendID not found', sendId });

    return (async () => {
      // ?refresh=1 bypasses cache; default serves cached if fresh
      let body = {}; try { body = await readBody(req); } catch {}
      const forceRefresh = url.searchParams.get('refresh') === '1' || body.refresh === true;
      if (!forceRefresh) {
        const cached = db.getEmailInsight(sendId);
        if (cached) return jsonReply(res, 200, { sendId, cached: true, generated_at: cached.generated_at, narrative: cached.narrative });
      }
      if (!ctx.anthropicApiKey) {
        return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY not configured', sendId });
      }
      try {
        const narrative = await emailInsight.generateInsight(ctx.anthropicApiKey, hit);
        db.saveEmailInsight(sendId, narrative);
        return jsonReply(res, 200, { sendId, cached: false, generated_at: new Date().toISOString(), narrative });
      } catch (e) {
        return jsonReply(res, 500, { error: 'Insight generation failed: ' + e.message, sendId });
      }
    })();
  }

  // DELETE /api/email-perf/{sendId}/insight — invalidate cache
  if (parts[0] && /^\d+$/.test(parts[0]) && parts[1] === 'insight' && req.method === 'DELETE') {
    const sendId = parseInt(parts[0], 10);
    db.deleteEmailInsight(sendId);
    return jsonReply(res, 200, { sendId, ok: true });
  }

  return jsonReply(res, 404, { error: 'Unknown email-perf endpoint' });
};
