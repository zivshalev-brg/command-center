/**
 * Power BI Refresh Scheduler — daily auto-fetch of PBI metrics.
 *
 * Runs on a configurable interval (default: every 4 hours, with daily full refresh).
 * Writes results to pbi-live.json for consumption by /api/metrics.
 * Includes a SQLite cache layer for DAX query results (15-min TTL).
 */
const fs = require('fs');
const path = require('path');
const pbi = require('./powerbi-api');
const dax = require('./powerbi-dax');
const { getDb, logAction } = require('./db');

// ─── SQLite Cache ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function ensureCacheTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pbi_query_cache (
      cache_key   TEXT PRIMARY KEY,
      result      TEXT NOT NULL,
      dataset_id  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    )
  `);
}

/**
 * Get a cached DAX query result if fresh, otherwise return null.
 */
function getCached(cacheKey) {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT result, expires_at FROM pbi_query_cache WHERE cache_key = ?'
    ).get(cacheKey);
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      // Expired — clean up
      db.prepare('DELETE FROM pbi_query_cache WHERE cache_key = ?').run(cacheKey);
      return null;
    }
    return JSON.parse(row.result);
  } catch {
    return null;
  }
}

/**
 * Store a DAX query result in cache.
 */
function setCache(cacheKey, result, datasetId) {
  try {
    const db = getDb();
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO pbi_query_cache (cache_key, result, dataset_id, created_at, expires_at)
      VALUES (?, ?, ?, datetime('now'), ?)
    `).run(cacheKey, JSON.stringify(result), datasetId, expiresAt);
  } catch (e) {
    console.error('[PBI Cache] Write failed:', e.message);
  }
}

/**
 * Execute a DAX query with caching.
 */
async function cachedDAXQuery(ctx, datasetId, templateName, params) {
  const cacheKey = `${datasetId}:${templateName}:${JSON.stringify(params || {})}`;
  const cached = getCached(cacheKey);
  if (cached) return { ...cached, _fromCache: true };

  const query = dax.buildQuery(templateName, params);
  const result = await pbi.executeDAXQuery(ctx, datasetId, query);
  setCache(cacheKey, result, datasetId);
  return result;
}

/**
 * Clear expired cache entries.
 */
function cleanExpiredCache() {
  try {
    const db = getDb();
    const deleted = db.prepare(
      "DELETE FROM pbi_query_cache WHERE expires_at < datetime('now')"
    ).run();
    if (deleted.changes > 0) {
      console.log(`[PBI Cache] Cleaned ${deleted.changes} expired entries`);
    }
  } catch {}
}

// ─── PBI Metrics Refresh ────────────────────────────────────────────────────

let _refreshInterval = null;
let _lastRefreshResult = null;

/**
 * Fetch fresh metrics from Power BI and write to pbi-live.json.
 * This is the core refresh function called by the scheduler.
 */
async function refreshPBIMetrics(ctx) {
  const startTime = Date.now();
  console.log('[PBI Refresh] Starting metrics refresh...');

  try {
    // Check token availability first
    const tokenStatus = pbi.getTokenStatus(ctx);
    if (!tokenStatus.available) {
      console.log('[PBI Refresh] Skipped — token unavailable:', tokenStatus.reason);
      _lastRefreshResult = {
        status: 'skipped',
        reason: tokenStatus.reason,
        timestamp: new Date().toISOString()
      };
      return _lastRefreshResult;
    }

    // Get datasets — prefer BeanzCore for business metrics
    const datasets = await pbi.getDatasets(ctx);
    if (datasets.length === 0) {
      _lastRefreshResult = {
        status: 'error',
        reason: 'No datasets found in workspace',
        timestamp: new Date().toISOString()
      };
      return _lastRefreshResult;
    }

    const beanzDs = datasets.find(d => d.name && d.name.includes('BeanzCore'));
    const datasetId = beanzDs ? beanzDs.id : datasets[0].id;
    const datasetName = beanzDs ? beanzDs.name : datasets[0].name;
    const metrics = {};

    // Run all standard metric templates
    const templates = ['kpi_overview', 'regional_breakdown', 'subscription_health'];
    for (const templateName of templates) {
      try {
        const query = dax.buildQuery(templateName);
        const result = await pbi.executeDAXQuery(ctx, datasetId, query);
        metrics[templateName] = { rows: result.rows, columns: result.columns };
      } catch (e) {
        metrics[templateName] = { error: e.message };
      }
    }

    // Write to pbi-live.json
    const pbiLiveData = {
      datasetId,
      datasetName,
      metrics,
      refreshedAt: new Date().toISOString()
    };

    const outputPath = path.join(ctx.intelDir, 'pbi-live.json');
    fs.writeFileSync(outputPath, JSON.stringify(pbiLiveData, null, 2));

    const elapsed = Date.now() - startTime;
    console.log(`[PBI Refresh] Completed in ${elapsed}ms — ${Object.keys(metrics).length} templates run`);

    logAction('pbi_refresh', null, 'scheduler', {
      datasetId,
      templatesRun: templates.length,
      elapsed
    });

    _lastRefreshResult = {
      status: 'completed',
      datasetId,
      datasetName,
      templatesRun: templates.length,
      elapsed,
      timestamp: new Date().toISOString()
    };

    return _lastRefreshResult;
  } catch (e) {
    console.error('[PBI Refresh] Failed:', e.message);
    _lastRefreshResult = {
      status: 'error',
      error: e.message,
      timestamp: new Date().toISOString()
    };
    return _lastRefreshResult;
  }
}

/**
 * Start the PBI refresh scheduler.
 * Default: refresh every 4 hours. First attempt 15s after startup.
 */
function startPBIRefreshScheduler(ctx, options = {}) {
  const interval = options.interval || 4 * 60 * 60 * 1000; // 4 hours default

  ensureCacheTable();

  // First refresh 15s after startup (let other services initialize)
  setTimeout(() => {
    refreshPBIMetrics(ctx).catch(e =>
      console.error('[PBI Refresh] Startup refresh failed:', e.message)
    );
  }, 15000);

  // Recurring refresh
  _refreshInterval = setInterval(() => {
    refreshPBIMetrics(ctx).catch(e =>
      console.error('[PBI Refresh] Scheduled refresh failed:', e.message)
    );
    cleanExpiredCache();
  }, interval);

  console.log(`[PBI Refresh] Scheduler started — interval: ${Math.round(interval / 60000)}min`);
}

/**
 * Get the status of the PBI refresh scheduler.
 */
function getPBIRefreshStatus() {
  return {
    schedulerActive: _refreshInterval !== null,
    lastRefresh: _lastRefreshResult
  };
}

module.exports = {
  startPBIRefreshScheduler,
  refreshPBIMetrics,
  getPBIRefreshStatus,
  cachedDAXQuery,
  getCached,
  setCache,
  cleanExpiredCache,
  ensureCacheTable
};
