const { jsonReply, readBody } = require('../lib/helpers');
const db = require('../lib/db');

// ─── Whitelists ──────────────────────────────────────────────
const ALLOWED_METRICS = new Set([
  'revenue', 'bags_shipped', 'active_subs', 'churn_rate',
  'ftbp_conversion', 'delivery_sla', 'net_sub_growth',
  'ftbp_revenue_share', 'bags', 'kg', 'subscriptions', 'cancellations'
]);

const ALLOWED_DIMENSIONS = new Set([
  'market', 'program', 'roaster', 'carrier', 'cohort', 'fy', 'month'
]);

const ALLOWED_GRANULARITIES = new Set(['day', 'week', 'month', 'quarter']);

const ALLOWED_PERIODS = /^(FY\d{2}|CY\d{2}|last-\d+-(months|weeks|days))$/;

// ─── Cache TTLs (ms) ────────────────────────────────────────
const CACHE_TTL_KPI = 15 * 60 * 1000;        // 15 minutes
const CACHE_TTL_QUERY = 60 * 60 * 1000;       // 60 minutes

// ─── Helpers ─────────────────────────────────────────────────

function isConfigured(ctx) {
  return !!(ctx.genie && ctx.genie.host && ctx.genie.token);
}

function getCached(key) {
  const dbInst = db.getDb();
  const row = dbInst.prepare(
    'SELECT response_json, cached_at FROM genie_cache WHERE cache_key = ?'
  ).get(key);
  if (!row) return null;
  return { response: JSON.parse(row.response_json), cachedAt: row.cached_at };
}

function setCached(key, data, queryType) {
  const dbInst = db.getDb();
  dbInst.prepare(
    `INSERT OR REPLACE INTO genie_cache (cache_key, query_type, response_json, cached_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(key, queryType, JSON.stringify(data));
}

function isCacheFresh(cachedAt, ttlMs) {
  if (!cachedAt) return false;
  const age = Date.now() - new Date(cachedAt).getTime();
  return age < ttlMs;
}

function getCacheStats() {
  const dbInst = db.getDb();
  const row = dbInst.prepare('SELECT COUNT(*) AS cnt FROM genie_cache').get();
  return row ? row.cnt : 0;
}

function clearCache() {
  const dbInst = db.getDb();
  dbInst.prepare('DELETE FROM genie_cache').run();
}

function validatePeriod(period) {
  return typeof period === 'string' && ALLOWED_PERIODS.test(period);
}

function genieError(res, message) {
  return jsonReply(res, 200, { error: message, source: 'genie', fallback: true });
}

// ─── Lazy-load optional libs (created separately) ────────────
let _genieClient = null;
let _sqlBuilder = null;

function getGenieClient() {
  if (!_genieClient) {
    try { _genieClient = require('../lib/genie-client'); }
    catch { _genieClient = null; }
  }
  return _genieClient;
}

function getSqlBuilder() {
  if (!_sqlBuilder) {
    try { _sqlBuilder = require('../lib/sql-builder'); }
    catch { _sqlBuilder = null; }
  }
  return _sqlBuilder;
}

// ─── Route Handler ───────────────────────────────────────────

module.exports = async function handleGenie(req, res, parts, url, ctx) {

  // GET /api/genie/status
  if (parts[0] === 'status' && req.method === 'GET') {
    try {
      const configured = isConfigured(ctx);
      if (!configured) {
        return jsonReply(res, 200, { configured: false });
      }
      return jsonReply(res, 200, {
        connected: true,
        spaceId: ctx.genie.spaceId || null,
        cacheEntries: getCacheStats(),
        configured: true
      });
    } catch (e) {
      return genieError(res, 'Status check failed: ' + e.message);
    }
  }

  // GET /api/genie/kpis?period=FY26
  if (parts[0] === 'kpis' && req.method === 'GET') {
    try {
      if (!isConfigured(ctx)) return genieError(res, 'Databricks not configured');

      const period = url.searchParams.get('period') || 'FY26';
      if (!validatePeriod(period)) return jsonReply(res, 400, { error: 'Invalid period: ' + period });

      // Check cache
      const cacheKey = 'kpis:' + period;
      const cached = getCached(cacheKey);
      if (cached && isCacheFresh(cached.cachedAt, CACHE_TTL_KPI)) {
        return jsonReply(res, 200, { ...cached.response, cached: true });
      }

      const sqlBuilder = getSqlBuilder();
      const genieClient = getGenieClient();
      if (!sqlBuilder || !genieClient) {
        return genieError(res, 'Genie libraries not available');
      }

      const startMs = Date.now();
      const kpiBundle = sqlBuilder.buildKPIBundle(period);
      const entries = Object.entries(kpiBundle);

      // Execute all KPI queries in parallel
      const results = await Promise.allSettled(
        entries.map(([key, query]) =>
          genieClient.executeQuery(ctx.genie, query.sql).then(r => ({ key, ...query, result: r }))
        )
      );

      const metrics = {};
      for (const outcome of results) {
        if (outcome.status === 'fulfilled') {
          const { key, name, format, result } = outcome.value;
          const value = result.rows && result.rows[0] ? result.rows[0][0] : null;
          metrics[key] = {
            name,
            value,
            format: format || 'number',
            trend: null,
            yoy: null,
            status: value !== null ? 'healthy' : 'unavailable',
            detail: period + ' total'
          };
        }
      }

      const payload = {
        metrics,
        period,
        source: 'genie',
        executionMs: Date.now() - startMs
      };

      setCached(cacheKey, payload, 'kpis');
      return jsonReply(res, 200, payload);
    } catch (e) {
      return genieError(res, 'KPI fetch failed: ' + e.message);
    }
  }

  // POST /api/genie/timeseries
  if (parts[0] === 'timeseries' && req.method === 'POST') {
    try {
      if (!isConfigured(ctx)) return genieError(res, 'Databricks not configured');

      const body = await readBody(req);
      const { metric, granularity, period, filters } = body;

      if (!metric || !ALLOWED_METRICS.has(metric)) {
        return jsonReply(res, 400, { error: 'Invalid or missing metric. Allowed: ' + [...ALLOWED_METRICS].join(', ') });
      }
      if (!granularity || !ALLOWED_GRANULARITIES.has(granularity)) {
        return jsonReply(res, 400, { error: 'Invalid granularity. Allowed: ' + [...ALLOWED_GRANULARITIES].join(', ') });
      }
      if (!period || !validatePeriod(period)) {
        return jsonReply(res, 400, { error: 'Invalid or missing period' });
      }

      const cacheKey = 'ts:' + [metric, granularity, period, JSON.stringify(filters || {})].join(':');
      const cached = getCached(cacheKey);
      if (cached && isCacheFresh(cached.cachedAt, CACHE_TTL_QUERY)) {
        return jsonReply(res, 200, { ...cached.response, cached: true });
      }

      const sqlBuilder = getSqlBuilder();
      const genieClient = getGenieClient();
      if (!sqlBuilder || !genieClient) {
        return genieError(res, 'Genie libraries not available');
      }

      const sql = sqlBuilder.buildTimeseriesQuery(metric, granularity, period, filters);
      const result = await genieClient.executeQuery(ctx.genie, sql);

      const series = (result.rows || []).map(row => ({
        label: row[0],
        value: row[1]
      }));

      const payload = { series, metric, period, source: 'genie' };
      setCached(cacheKey, payload, 'timeseries');
      return jsonReply(res, 200, payload);
    } catch (e) {
      return genieError(res, 'Timeseries query failed: ' + e.message);
    }
  }

  // POST /api/genie/breakdown
  if (parts[0] === 'breakdown' && req.method === 'POST') {
    try {
      if (!isConfigured(ctx)) return genieError(res, 'Databricks not configured');

      const body = await readBody(req);
      const { metric, dimension, period, filters } = body;

      if (!metric || !ALLOWED_METRICS.has(metric)) {
        return jsonReply(res, 400, { error: 'Invalid or missing metric. Allowed: ' + [...ALLOWED_METRICS].join(', ') });
      }
      if (!dimension || !ALLOWED_DIMENSIONS.has(dimension)) {
        return jsonReply(res, 400, { error: 'Invalid dimension. Allowed: ' + [...ALLOWED_DIMENSIONS].join(', ') });
      }
      if (!period || !validatePeriod(period)) {
        return jsonReply(res, 400, { error: 'Invalid or missing period' });
      }

      const cacheKey = 'bd:' + [metric, dimension, period, JSON.stringify(filters || {})].join(':');
      const cached = getCached(cacheKey);
      if (cached && isCacheFresh(cached.cachedAt, CACHE_TTL_QUERY)) {
        return jsonReply(res, 200, { ...cached.response, cached: true });
      }

      const sqlBuilder = getSqlBuilder();
      const genieClient = getGenieClient();
      if (!sqlBuilder || !genieClient) {
        return genieError(res, 'Genie libraries not available');
      }

      const sql = sqlBuilder.buildBreakdownQuery(metric, dimension, period, filters);
      const result = await genieClient.executeQuery(ctx.genie, sql);

      const rows = (result.rows || []).map(row => ({
        dim: row[0],
        value: row[1]
      }));
      const total = rows.reduce((sum, r) => sum + (r.value || 0), 0);

      const payload = { rows, total, metric, source: 'genie' };
      setCached(cacheKey, payload, 'breakdown');
      return jsonReply(res, 200, payload);
    } catch (e) {
      return genieError(res, 'Breakdown query failed: ' + e.message);
    }
  }

  // POST /api/genie/compare
  if (parts[0] === 'compare' && req.method === 'POST') {
    try {
      if (!isConfigured(ctx)) return genieError(res, 'Databricks not configured');

      const body = await readBody(req);
      const { metric, period1, period2, dimension, filters } = body;

      if (!metric || !ALLOWED_METRICS.has(metric)) {
        return jsonReply(res, 400, { error: 'Invalid or missing metric. Allowed: ' + [...ALLOWED_METRICS].join(', ') });
      }
      if (!period1 || !validatePeriod(period1)) {
        return jsonReply(res, 400, { error: 'Invalid or missing period1' });
      }
      if (!period2 || !validatePeriod(period2)) {
        return jsonReply(res, 400, { error: 'Invalid or missing period2' });
      }

      const cacheKey = 'cmp:' + [metric, period1, period2, dimension || '', JSON.stringify(filters || {})].join(':');
      const cached = getCached(cacheKey);
      if (cached && isCacheFresh(cached.cachedAt, CACHE_TTL_QUERY)) {
        return jsonReply(res, 200, { ...cached.response, cached: true });
      }

      if (dimension && !ALLOWED_DIMENSIONS.has(dimension)) {
        return jsonReply(res, 400, { error: 'Invalid dimension. Allowed: ' + [...ALLOWED_DIMENSIONS].join(', ') });
      }

      const sqlBuilder = getSqlBuilder();
      const genieClient = getGenieClient();
      if (!sqlBuilder || !genieClient) {
        return genieError(res, 'Genie libraries not available');
      }

      const sql1 = sqlBuilder.buildBreakdownQuery(metric, dimension || 'month', period1, filters);
      const sql2 = sqlBuilder.buildBreakdownQuery(metric, dimension || 'month', period2, filters);

      const [result1, result2] = await Promise.all([
        genieClient.executeQuery(ctx.genie, sql1),
        genieClient.executeQuery(ctx.genie, sql2)
      ]);

      const toMap = (result) => {
        const map = {};
        for (const row of (result.rows || [])) {
          map[row[0]] = row[1];
        }
        return map;
      };

      const map1 = toMap(result1);
      const map2 = toMap(result2);
      const allDims = [...new Set([...Object.keys(map1), ...Object.keys(map2)])];

      const total1 = Object.values(map1).reduce((s, v) => s + (v || 0), 0);
      const total2 = Object.values(map2).reduce((s, v) => s + (v || 0), 0);

      const rows = allDims.map(dim => {
        const p1 = map1[dim] || 0;
        const p2 = map2[dim] || 0;
        const delta = p2 !== 0 ? ((p1 - p2) / p2) * 100 : (p1 > 0 ? 100 : 0);
        return { dim, p1, p2, delta: Math.round(delta * 10) / 10 };
      });

      const change = total2 !== 0 ? Math.round(((total1 - total2) / total2) * 1000) / 10 : 0;

      const payload = {
        period1: { label: period1, total: total1 },
        period2: { label: period2, total: total2 },
        change,
        rows,
        source: 'genie'
      };

      setCached(cacheKey, payload, 'compare');
      return jsonReply(res, 200, payload);
    } catch (e) {
      return genieError(res, 'Compare query failed: ' + e.message);
    }
  }

  // POST /api/genie/query — raw SQL execution (explore mode)
  if (parts[0] === 'query' && req.method === 'POST') {
    try {
      if (!isConfigured(ctx)) return genieError(res, 'Databricks not configured');

      const body = await readBody(req);
      const sql = (body.sql || '').trim();

      if (!sql) {
        return jsonReply(res, 400, { error: 'Missing sql in request body' });
      }

      // Validate mandatory filters
      const sqlUpper = sql.toUpperCase();
      if (!sqlUpper.includes('RATETYPE')) {
        return jsonReply(res, 400, { error: 'SQL must include RateType filter (mandatory for data accuracy)' });
      }
      if (!sqlUpper.includes('ORDERSTATUS')) {
        return jsonReply(res, 400, { error: 'SQL must include OrderStatus filter (mandatory for data accuracy)' });
      }

      const genieClient = getGenieClient();
      if (!genieClient) {
        return genieError(res, 'Genie client library not available');
      }

      const startMs = Date.now();
      const result = await genieClient.executeQuery(ctx.genie, sql);

      return jsonReply(res, 200, {
        columns: result.columns || [],
        rows: result.rows || [],
        rowCount: (result.rows || []).length,
        sql,
        executionMs: Date.now() - startMs,
        source: 'genie'
      });
    } catch (e) {
      return genieError(res, 'Query execution failed: ' + e.message);
    }
  }

  // POST /api/genie/cache/clear
  if (parts[0] === 'cache' && parts[1] === 'clear' && req.method === 'POST') {
    try {
      clearCache();
      return jsonReply(res, 200, { ok: true });
    } catch (e) {
      return genieError(res, 'Cache clear failed: ' + e.message);
    }
  }

  return jsonReply(res, 404, { error: 'Unknown genie endpoint' });
};
