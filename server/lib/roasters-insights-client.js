'use strict';

// ─── Roasters Insights HTTP client ───────────────────────────
// Proxies requests to the FastAPI Roasters Insights backend running on :8000.
// Adds a short timeout so a dead backend never stalls callers; falls back to
// the last cached JSON file on disk when the live service is unreachable.

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 8000;
const DEFAULT_TIMEOUT_MS = 8000;     // FastAPI is slow on first call after idle; accept up to 8s
const REFRESH_TIMEOUT_MS = 20000;    // Scheduled refresh — run in background, allow 20s

function httpGet(pathname, { host = DEFAULT_HOST, port = DEFAULT_PORT, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: host, port, path: pathname, timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' ' + pathname));
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Non-JSON response from ' + pathname)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout ' + pathname)); });
  });
}

/** Try live call; on failure, fall back to cached JSON file. Returns { data, source }. */
async function withFallback(pathname, cachePath) {
  try {
    const data = await httpGet(pathname);
    return { data, source: 'live' };
  } catch (err) {
    if (cachePath && fs.existsSync(cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return { data, source: 'cache', error: err.message };
      } catch { /* fall through */ }
    }
    return { data: null, source: 'unavailable', error: err.message };
  }
}

/** Overview card data (roaster count, categories, pricing, top origins, regions) */
function getOverview(cachePath) {
  return withFallback('/api/overview', cachePath);
}

/** Daily movements = diff of two most recent snapshots (new products, price changes, removals) */
async function getMovements(cachePath) {
  try {
    // Overview gives us the two most recent snapshot dates for diffing
    const overview = await httpGet('/api/overview');
    const dates = (overview && overview.snapshot_dates) || [];
    if (dates.length < 1) return { data: null, source: 'unavailable', error: 'no snapshots' };
    const latest = dates[0];
    // new-products endpoint returns the "new since previous snapshot" list
    const newProducts = await httpGet('/api/trends/new-products/' + encodeURIComponent(latest)).catch(() => ({ products: [] }));
    // changes endpoint returns recent price/description changes
    const changes = await httpGet('/api/changes?days=7').catch(() => ({ changes: [] }));
    const data = {
      latestSnapshot: latest,
      priorSnapshot: dates[1] || null,
      newProducts: (newProducts.products || newProducts.items || []).slice(0, 15),
      priceChanges: ((changes.changes || changes.items || []).filter((c) => c.type === 'price' || c.change_type === 'price')).slice(0, 10),
      descriptionChanges: ((changes.changes || changes.items || []).filter((c) => c.type === 'description' || c.change_type === 'description')).slice(0, 5)
    };
    return { data, source: 'live' };
  } catch (err) {
    if (cachePath && fs.existsSync(cachePath)) {
      try { return { data: JSON.parse(fs.readFileSync(cachePath, 'utf8')).movements || null, source: 'cache', error: err.message }; }
      catch { /* ignore */ }
    }
    return { data: null, source: 'unavailable', error: err.message };
  }
}

/** Competitive signals (AI-generated reports) */
async function getCompetitiveSignals(cachePath) {
  try {
    const reports = await httpGet('/api/ai/reports?limit=5');
    const data = { reports: reports.reports || reports.items || reports || [] };
    return { data, source: 'live' };
  } catch (err) {
    if (cachePath && fs.existsSync(cachePath)) {
      try { return { data: JSON.parse(fs.readFileSync(cachePath, 'utf8')).competitiveSignals || null, source: 'cache', error: err.message }; }
      catch { /* ignore */ }
    }
    return { data: null, source: 'unavailable', error: err.message };
  }
}

/**
 * Write a combined snapshot file that consumers (digest, summary, obsidian)
 * can read without making any HTTP calls. Called by the refresh scheduler.
 *
 * Important: if a live fetch fails and we have a prior snapshot on disk, we
 * preserve the previous value for that field instead of overwriting with null.
 * This stops a temporary backend outage from wiping the cache.
 */
async function buildSnapshot(prevCachePath) {
  let prior = null;
  if (prevCachePath && fs.existsSync(prevCachePath)) {
    try { prior = JSON.parse(fs.readFileSync(prevCachePath, 'utf8')); } catch { /* ignore */ }
  }
  // Scheduled refresh — use the longer timeout so slow backends still succeed
  const longOpts = { timeout: REFRESH_TIMEOUT_MS };
  const overview = await httpGet('/api/overview', longOpts).then((d) => ({ data: d, source: 'live' })).catch((e) => ({ data: null, source: 'unavailable', error: e.message }));
  let movements = { data: null, source: 'unavailable' };
  if (overview.data && (overview.data.snapshot_dates || []).length >= 1) {
    const latest = overview.data.snapshot_dates[0];
    try {
      const np = await httpGet('/api/trends/new-products/' + encodeURIComponent(latest), longOpts).catch(() => ({ products: [] }));
      const ch = await httpGet('/api/changes?days=7', longOpts).catch(() => ({ changes: [] }));
      movements = {
        data: {
          latestSnapshot: latest,
          priorSnapshot: overview.data.snapshot_dates[1] || null,
          newProducts: (np.products || np.items || []).slice(0, 15),
          priceChanges: ((ch.changes || ch.items || []).filter((c) => c.type === 'price' || c.change_type === 'price')).slice(0, 10),
          descriptionChanges: ((ch.changes || ch.items || []).filter((c) => c.type === 'description' || c.change_type === 'description')).slice(0, 5)
        },
        source: 'live'
      };
    } catch (e) { movements = { data: null, source: 'unavailable', error: e.message }; }
  }
  const signals = await httpGet('/api/ai/reports?limit=5', longOpts).then((r) => ({ data: { reports: r.reports || r.items || r || [] }, source: 'live' })).catch((e) => ({ data: null, source: 'unavailable', error: e.message }));
  return {
    generated_at: new Date().toISOString(),
    overview: overview.data || (prior && prior.overview) || null,
    movements: movements.data || (prior && prior.movements) || null,
    competitiveSignals: signals.data || (prior && prior.competitiveSignals) || null,
    status: {
      overview: overview.source,
      movements: movements.source,
      signals: signals.source
    },
    prior_preserved: {
      overview: !overview.data && !!(prior && prior.overview),
      movements: !movements.data && !!(prior && prior.movements),
      signals: !signals.data && !!(prior && prior.competitiveSignals)
    }
  };
}

module.exports = {
  getOverview,
  getMovements,
  getCompetitiveSignals,
  buildSnapshot,
  httpGet
};
