'use strict';

const path = require('path');
const { jsonReply, readJSON } = require('../lib/helpers');
const riClient = require('../lib/roasters-insights-client');

const CACHE_FILE = 'roasters-insights-live.json';

function cachePath(ctx) {
  return path.join(ctx.intelDir, CACHE_FILE);
}

module.exports = async function handleRoastersInsights(req, res, parts, url, ctx) {
  // GET /api/roasters-insights/overview — cached overview
  if (parts[0] === 'overview' && req.method === 'GET') {
    const { data, source, error } = await riClient.getOverview(cachePath(ctx));
    if (!data) return jsonReply(res, 503, { error: error || 'unavailable', source });
    return jsonReply(res, 200, { overview: data, source });
  }

  // GET /api/roasters-insights/movements — daily diff of last 2 snapshots
  if (parts[0] === 'movements' && req.method === 'GET') {
    const { data, source, error } = await riClient.getMovements(cachePath(ctx));
    if (data) return jsonReply(res, 200, { ...data, source });
    // Fall back to the snapshot file's `movements` field if present, or empty shell otherwise
    const snap = readJSON(cachePath(ctx));
    if (snap && snap.movements) return jsonReply(res, 200, { ...snap.movements, source: 'snapshot-file' });
    const overviewDates = snap && snap.overview && snap.overview.snapshot_dates ? snap.overview.snapshot_dates : [];
    return jsonReply(res, 200, {
      latestSnapshot: overviewDates[0] || null,
      priorSnapshot: overviewDates[1] || null,
      newProducts: [],
      priceChanges: [],
      descriptionChanges: [],
      source: 'degraded',
      note: error || 'Roasters Insights backend unavailable and no cached movements. Summary card will re-populate once the backend (:8000) is reachable.'
    });
  }

  // GET /api/roasters-insights/competitive-signals
  if (parts[0] === 'competitive-signals' && req.method === 'GET') {
    const { data, source, error } = await riClient.getCompetitiveSignals(cachePath(ctx));
    if (!data) return jsonReply(res, 503, { error: error || 'unavailable', source });
    return jsonReply(res, 200, { ...data, source });
  }

  // GET /api/roasters-insights/snapshot — the full cached snapshot file
  if (parts[0] === 'snapshot' && req.method === 'GET') {
    const snap = readJSON(cachePath(ctx));
    if (!snap) return jsonReply(res, 404, { error: 'no snapshot yet \u2014 run refresh' });
    return jsonReply(res, 200, snap);
  }

  // POST /api/roasters-insights/refresh — regenerate snapshot file
  if (parts[0] === 'refresh' && req.method === 'POST') {
    try {
      const snap = await riClient.buildSnapshot();
      require('fs').writeFileSync(cachePath(ctx), JSON.stringify(snap, null, 2), 'utf8');
      return jsonReply(res, 200, { ok: true, writtenTo: cachePath(ctx), status: snap.status });
    } catch (e) {
      return jsonReply(res, 500, { ok: false, error: e.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown roasters-insights endpoint' });
};
