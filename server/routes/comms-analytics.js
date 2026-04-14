/**
 * comms-analytics.js — Route handler for /api/comms-analytics endpoints.
 */

'use strict';

const { jsonReply, readBody } = require('../lib/helpers');
const {
  generateDailySnapshot,
  generateAISummaries,
  getAnalyticsDashboard
} = require('../lib/comms-analytics-engine');
const db = require('../lib/db');

let _lastSnapshotTrigger = 0;

async function handleCommsAnalytics(req, res, parts, url, ctx) {
  // GET /api/comms-analytics — full dashboard payload
  if (parts.length === 1 && req.method === 'GET') {
    const days = parseInt(url.searchParams.get('days')) || 14;
    const dashboard = getAnalyticsDashboard(ctx, days);
    return jsonReply(res, 200, dashboard);
  }

  // GET /api/comms-analytics/trends/:key — time-series for a specific dimension key
  if (parts[1] === 'trends' && parts[2] && req.method === 'GET') {
    const key = decodeURIComponent(parts[2]);
    const days = parseInt(url.searchParams.get('days')) || 14;
    const dateTo = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const snapshots = db.getAnalyticsSnapshots(dateFrom, dateTo);
    const matching = snapshots.filter(s => s.dimension_key === key);
    return jsonReply(res, 200, { key, snapshots: matching });
  }

  // POST /api/comms-analytics/snapshot — trigger manual snapshot
  if (parts[1] === 'snapshot' && req.method === 'POST') {
    const now = Date.now();
    if (now - _lastSnapshotTrigger < 3600000) {
      return jsonReply(res, 429, { ok: false, error: 'Snapshot already generated in the last hour' });
    }
    _lastSnapshotTrigger = now;
    try {
      const result = generateDailySnapshot(ctx);
      // Fire AI summaries async
      generateAISummaries(ctx).catch(e => console.error('[Analytics] AI summary error:', e.message));
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { ok: false, error: e.message });
    }
  }

  // GET /api/comms-analytics/summary/:date — AI summaries for a date
  if (parts[1] === 'summary' && parts[2] && req.method === 'GET') {
    const date = parts[2];
    const summaries = db.getAnalyticsSummary(date);
    const result = {};
    if (Array.isArray(summaries)) {
      summaries.forEach(s => { result[s.summary_type] = s.summary_text; });
    }
    return jsonReply(res, 200, { date, summaries: result });
  }

  return jsonReply(res, 404, { error: 'Unknown comms-analytics endpoint' });
}

module.exports = handleCommsAnalytics;
