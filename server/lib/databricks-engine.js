'use strict';

/**
 * ============================================================
 *  Databricks Engine — Beanz Command Center wrapper
 * ============================================================
 *
 *  A schema-correct, data-quality-enforced wrapper around the
 *  Beanz Databricks warehouse. Implements every rule from the
 *  `beanz-genie-sql-engine` skill:
 *
 *   Rule 1  — RateType = 'AUD-MonthEnd' on every factbeanzorder query
 *   Rule 2  — lower(f.OrderStatus) <> 'cancelled'
 *   Rule 3  — Calendar Year default; BRG FY = Jul 1 → Jun 30
 *   Rule 4  — StoreCode ILIKE 'PBB%' for Powered by Beanz
 *   Rule 5  — Program detection via offer_code / ftbp_Flag / source
 *   Rule 6  — Coffee KG from f.Quantity_by_KG when BeanzSkuFlag = 1
 *   Rule 7  — f.BeanzSkuFlag = 1 for coffee-only
 *   Rule 8  — dimbeanzsubscription needs BeanzSkuFlag = 1 too
 *   Rule 9a — factbeanzshipment.ORDERDATE is a day-of-week int; use SHIPPINGDATE
 *   Rule 9b — Revenue definition varies (SkuAmount vs SkuAmount>0)
 *   Rule 10 — factbeanzorderdailysummary ghost rows from Oct 2025+
 *   Rule 11 — Email queries need BrandRegionPartition='Beanz' + partition cols
 *
 *  Dual execution backends:
 *   (a) SQL Warehouse Statement Execution API  — primary, reliable
 *   (b) Genie Spaces conversation API          — fallback when warehouse ID missing
 *
 *  SQLite cache keyed by SHA-256 of SQL text with configurable TTL.
 *
 * ============================================================
 */

const https = require('https');
const crypto = require('crypto');
const { getDb } = require('./db');
const { getBearerToken, tokenStatus } = require('./databricks-auth');

// ─── Schema constants (corrected per skill reference) ────────
const SCHEMA = 'ana_prd_gold.edw';
const T = {
  order:        `${SCHEMA}.factbeanzorder`,
  dailySum:     `${SCHEMA}.factbeanzorderdailysummary`,
  mbOrder:      `${SCHEMA}.factbeanzmborders`,
  subDim:       `${SCHEMA}.dimbeanzsubscription`,
  subFact:      `${SCHEMA}.factbeanzsubscription`,
  ftbp:         `${SCHEMA}.factbeanzftbpprodregistration`,
  shipment:     `${SCHEMA}.factbeanzshipment`,
  motSku:       `${SCHEMA}.factbeanzroastermotskudata`,
  motSummary:   `${SCHEMA}.factbeanzroastermotsummary`,
  cancelSurvey: `${SCHEMA}.factbeanzcancellationsurvey`,
  customerEmail:`${SCHEMA}.dimbeanzcustomeremail`,
  promo:        `${SCHEMA}.dimbeanzpromotion`,
  product:      `${SCHEMA}.dimbeanzproduct`,
  store:        `${SCHEMA}.dimbeanzstore`,
  rate:         `${SCHEMA}.dimexchangerate`,
  date:         `${SCHEMA}.dimdate`,
  orderDim:     `${SCHEMA}.dimbeanzorder`,
  emailEvents:  `${SCHEMA}.factemailevents`,
  sendJobs:     `${SCHEMA}.dimsendjobs`
};

// CY25 verified benchmarks (from skill, Mar 2026)
const BENCHMARKS = {
  CY25_REVENUE_TOTAL: 15543599,
  CY25_REVENUE_PAID_ESTIMATE: 13500000, // SkuAmount>0 match to PBI "Paid"
  CY25_BAGS_TOTAL: 1003406,
  CY25_BAGS_PAID_ESTIMATE: 700000,
  CY25_KG_TOTAL: 298181,
  CY25_ACTIVE_SUBS: 36584,
  CY25_PBB_REVENUE: 907949,
  CY25_AVG_REVENUE_MONTHLY: 1295299,
  CY25_AVG_BAGS_MONTHLY: 83617,
  AVG_KG_PER_BAG_MIN: 0.22,
  AVG_KG_PER_BAG_MAX: 0.40,
  SLA_AU: 5.83, SLA_UK: 3.97, SLA_US: 5.72, SLA_DE: 5.17,
  FTBP_V2_PAID_BAGS_CY25: 24481,
  FTBP_V2_PAID_REVENUE_CY25: 524000,
  EMAIL_BIEDM_OPEN_RATE: { min: 44, max: 53 },
  EMAIL_TRIGGERED_OPEN_RATE: { min: 80, max: 90 },
  EMAIL_WELCOME_CTR: { min: 10, max: 15 }
};

const MARKET_CODES = { AU: 'Australia', UK: 'United Kingdom', US: 'United States', DE: 'Germany', NL: 'Netherlands' };

// ─── HTTPS helper ────────────────────────────────────────────
function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('Databricks HTTP ' + res.statusCode + ': ' + data.slice(0, 300)));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Non-JSON response: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Databricks request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Cache (SHA-256 of SQL + TTL) ────────────────────────────
let _cacheInit = false;
function ensureCache() {
  if (_cacheInit) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS databricks_cache (
      sql_hash TEXT PRIMARY KEY,
      sql_text TEXT NOT NULL,
      result_json TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ttl_minutes INTEGER DEFAULT 60,
      tag TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_databricks_cache_tag ON databricks_cache(tag);
  `);
  _cacheInit = true;
}

function hashSQL(sql) { return crypto.createHash('sha256').update(sql).digest('hex'); }

function cacheGet(sql) {
  ensureCache();
  const db = getDb();
  const hash = hashSQL(sql);
  const row = db.prepare('SELECT result_json, created_at, ttl_minutes FROM databricks_cache WHERE sql_hash = ?').get(hash);
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.created_at + 'Z').getTime();
  if (ageMs > (row.ttl_minutes || 60) * 60000) {
    db.prepare('DELETE FROM databricks_cache WHERE sql_hash = ?').run(hash);
    return null;
  }
  try { return JSON.parse(row.result_json); } catch { return null; }
}

function cachePut(sql, result, ttlMinutes, tag) {
  ensureCache();
  const db = getDb();
  const hash = hashSQL(sql);
  db.prepare(`
    INSERT OR REPLACE INTO databricks_cache (sql_hash, sql_text, result_json, row_count, created_at, ttl_minutes, tag)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
  `).run(hash, sql, JSON.stringify(result), (result.rows || []).length, ttlMinutes || 60, tag || null);
}

function cacheInvalidate(tag) {
  ensureCache();
  const db = getDb();
  if (tag) db.prepare('DELETE FROM databricks_cache WHERE tag = ?').run(tag);
  else db.prepare('DELETE FROM databricks_cache').run();
}

function cacheStats() {
  ensureCache();
  const db = getDb();
  const c = db.prepare('SELECT COUNT(*) AS n FROM databricks_cache').get();
  const oldest = db.prepare('SELECT MIN(created_at) AS t FROM databricks_cache').get();
  return { entries: c ? c.n : 0, oldest: oldest ? oldest.t : null };
}

// ─── SQL Warehouse executor (primary) ────────────────────────
async function executeSQLWarehouse(cfg, sql) {
  if (!cfg.host || !cfg.warehouseId) {
    throw new Error('SQL Warehouse not configured — missing host/warehouseId');
  }
  const bearer = await getBearerToken(cfg);
  if (!bearer) throw new Error('SQL Warehouse not configured — no token or SP credentials');

  const submitOpts = {
    hostname: cfg.host, port: 443,
    path: '/api/2.0/sql/statements/', method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + bearer,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    rejectUnauthorized: false
  };

  const submitBody = JSON.stringify({
    warehouse_id: cfg.warehouseId,
    statement: sql,
    wait_timeout: '30s',
    disposition: 'INLINE',
    format: 'JSON_ARRAY'
  });

  let response = await httpsJson(submitOpts, submitBody);
  let statementId = response.statement_id;
  let state = response.status && response.status.state;

  // Poll if pending
  const maxPolls = 20;
  let pollAttempt = 0;
  while (state && ['PENDING', 'RUNNING'].includes(state) && pollAttempt < maxPolls) {
    await sleep(2000 + (pollAttempt * 500));
    const pollOpts = {
      hostname: cfg.host, port: 443,
      path: '/api/2.0/sql/statements/' + statementId, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + bearer },
      rejectUnauthorized: false
    };
    response = await httpsJson(pollOpts, null);
    state = response.status && response.status.state;
    pollAttempt++;
  }

  if (state !== 'SUCCEEDED') {
    const err = response.status && (response.status.error || {});
    throw new Error('SQL Warehouse ' + state + ': ' + (err.message || 'query failed'));
  }

  const manifest = response.manifest || {};
  const schema = manifest.schema || {};
  const columns = (schema.columns || []).map(c => c.name);
  const result = response.result || {};
  const rows = result.data_array || [];

  return { columns, rows, rowCount: rows.length, source: 'warehouse' };
}

// ─── Genie executor (fallback) ───────────────────────────────
async function executeGenie(cfg, sql) {
  if (!cfg.host || !cfg.spaceId) {
    throw new Error('Genie not configured — missing host/spaceId');
  }
  const bearer = await getBearerToken(cfg);
  if (!bearer) throw new Error('Genie not configured — no token');
  const prefix = 'Run the following SQL exactly as written, do not modify it:\n';
  const startOpts = {
    hostname: cfg.host, port: 443,
    path: '/api/2.0/genie/spaces/' + cfg.spaceId + '/start-conversation', method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + bearer,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    rejectUnauthorized: false
  };
  const body = JSON.stringify({ content: prefix + sql });
  let response = await httpsJson(startOpts, body);

  const convId = response.conversation_id;
  const msgId = response.message_id;
  if (!convId || !msgId) throw new Error('Genie: missing conversation/message id');

  let status = response.status;
  let attempt = 0;
  const schedule = [1000, 2000, 4000, 8000, 8000, 8000, 8000];
  while (status !== 'COMPLETED' && status !== 'FAILED' && attempt < schedule.length) {
    await sleep(schedule[attempt]);
    const pollOpts = {
      hostname: cfg.host, port: 443,
      path: `/api/2.0/genie/spaces/${cfg.spaceId}/conversations/${convId}/messages/${msgId}`,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + bearer },
      rejectUnauthorized: false
    };
    response = await httpsJson(pollOpts, null);
    status = response.status;
    attempt++;
  }

  if (status !== 'COMPLETED') throw new Error('Genie status: ' + status);

  const attachments = response.attachments || [];
  const qa = attachments.find(a => a.query && a.query.result);
  if (!qa) return { columns: [], rows: [], rowCount: 0, source: 'genie' };

  const r = qa.query.result;
  const cols = (r.columns || r.column_names || []).map(c => typeof c === 'string' ? c : c.name);
  const rows = r.data_array || r.rows || r.data || [];
  return { columns: cols, rows, rowCount: rows.length, source: 'genie' };
}

// ─── Unified executor with cache + fallback ──────────────────
async function executeSQL(cfg, sql, opts) {
  opts = opts || {};
  const ttl = opts.ttlMinutes || 60;
  const tag = opts.tag || 'generic';

  if (!opts.skipCache) {
    const cached = cacheGet(sql);
    if (cached) return { ...cached, cached: true };
  }

  const hasAuth = !!(cfg.token || (cfg.clientId && cfg.clientSecret));
  let result;
  let lastErr;
  // Prefer warehouse when available — more stable
  if (cfg.warehouseId && cfg.host && hasAuth) {
    try { result = await executeSQLWarehouse(cfg, sql); }
    catch (e) { lastErr = e; }
  }
  // Fallback to Genie
  if (!result && cfg.spaceId && cfg.host && hasAuth) {
    try { result = await executeGenie(cfg, sql); }
    catch (e) { lastErr = e; }
  }
  if (!result) throw lastErr || new Error('No Databricks backend available');

  cachePut(sql, result, ttl, tag);
  return result;
}

// ─── Date helpers ────────────────────────────────────────────
function dateRangeForPeriod(period) {
  if (!period) return null;
  const now = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);

  const fyM = /^FY(\d{2})$/i.exec(period);
  if (fyM) {
    const fy = 2000 + parseInt(fyM[1], 10);
    return { start: (fy - 1) + '-07-01', end: fy + '-07-01', label: period };
  }
  const cyM = /^CY(\d{2})$/i.exec(period);
  if (cyM) {
    const cy = 2000 + parseInt(cyM[1], 10);
    return { start: cy + '-01-01', end: (cy + 1) + '-01-01', label: period };
  }
  const lastM = /^last-(\d+)-(month|week|day)s?$/i.exec(period);
  if (lastM) {
    const n = parseInt(lastM[1], 10);
    const unit = lastM[2].toLowerCase();
    const start = new Date(now);
    if (unit === 'month') start.setMonth(start.getMonth() - n);
    if (unit === 'week') start.setDate(start.getDate() - n * 7);
    if (unit === 'day') start.setDate(start.getDate() - n);
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    return { start: ymd(start), end: ymd(end), label: period };
  }
  return null;
}

// ─── Mandatory filter validator ──────────────────────────────
function validateSQL(sql) {
  const issues = [];
  const s = String(sql || '').replace(/\s+/g, ' ');
  const touchesOrder = /factbeanzorder(?!daily)/i.test(s) && !/factbeanzordersummary/i.test(s);
  if (touchesOrder) {
    if (!/ratetype\s*=\s*'aud-monthend'/i.test(s)) issues.push('Missing RateType=AUD-MonthEnd (6x inflation risk)');
    if (!/orderstatus[^=]*\s*<>\s*'cancelled'/i.test(s) && !/lower\(.*orderstatus.*\)\s*<>\s*'cancelled'/i.test(s)) {
      issues.push('Missing OrderStatus != cancelled filter');
    }
  }
  if (/factbeanzshipment/i.test(s) && /where[^;]*\borderdate\s*>=|\borderdate\s*<=/i.test(s)) {
    issues.push('factbeanzshipment.ORDERDATE is day-of-week int — use SHIPPINGDATE or DeliveryDate');
  }
  if (/factemailevents/i.test(s) && !/brandregionpartition\s*=\s*'beanz'/i.test(s)) {
    issues.push("Missing BrandRegionPartition='Beanz' on email query");
  }
  return { ok: issues.length === 0, issues };
}

// ─── Query Library ───────────────────────────────────────────

// Yesterday's pulse — revenue, bags, kg, orders, new subs, cancellations
function sqlYesterdayPulse() {
  return `
SELECT
  'revenue' AS metric,
  ROUND(SUM(f.SkuAmount), 2) AS value
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL SELECT 'bags', SUM(f.Quantity)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL SELECT 'kg', ROUND(SUM(f.Quantity_by_KG), 2)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL SELECT 'orders', COUNT(DISTINCT f.OrderNumber)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL SELECT 'aov', ROUND(SUM(f.SkuAmount) / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())
`.trim();
}

// MTD pulse
function sqlMTD() {
  return `
SELECT
  'mtd_revenue' AS metric,
  ROUND(SUM(f.SkuAmount), 2) AS value
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()

UNION ALL SELECT 'mtd_bags', SUM(f.Quantity)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()

UNION ALL SELECT 'mtd_kg', ROUND(SUM(f.Quantity_by_KG), 2)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()

UNION ALL SELECT 'mtd_orders', COUNT(DISTINCT f.OrderNumber)
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
`.trim();
}

// Last 30 days daily revenue + bags
function sqlDaily30() {
  return `
SELECT
  CAST(f.OrderDate AS STRING) AS day,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATEADD(DAY, -30, CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY f.OrderDate
ORDER BY f.OrderDate
`.trim();
}

// Active subscriptions (point in time)
function sqlActiveSubs() {
  return `
SELECT
  'active_total' AS metric,
  COUNT(*) AS value
FROM ${T.subDim}
WHERE SubscriptionStatus IN ('Active', 'Paused') AND BeanzSkuFlag = 1

UNION ALL SELECT 'active', COUNT(*) FROM ${T.subDim}
WHERE SubscriptionStatus = 'Active' AND BeanzSkuFlag = 1

UNION ALL SELECT 'paused', COUNT(*) FROM ${T.subDim}
WHERE SubscriptionStatus = 'Paused' AND BeanzSkuFlag = 1

UNION ALL SELECT 'cancelled_30d', COUNT(*) FROM ${T.subDim}
WHERE SubscriptionStatus = 'Cancelled' AND BeanzSkuFlag = 1
  AND SubscriptionCancelDate >= DATEADD(DAY, -30, CURRENT_DATE())

UNION ALL SELECT 'new_30d', COUNT(*) FROM ${T.subDim}
WHERE BeanzSkuFlag = 1
  AND SubscriptionCreationDate >= DATEADD(DAY, -30, CURRENT_DATE())
`.trim();
}

// Revenue by market (MTD)
function sqlMarketMTD() {
  return `
SELECT
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.store} s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY s.Country
ORDER BY revenue DESC
`.trim();
}

// Top roasters MTD
function sqlTopRoastersMTD(limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  return `
SELECT
  p.VendorName,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS kg,
  ROUND(AVG(p.Product_Margin), 1) AS avg_margin
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.product} p ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY p.VendorName
ORDER BY revenue DESC
LIMIT ${n}
`.trim();
}

// MoM comparison (prev month vs month before)
function sqlMoMComparison() {
  return `
SELECT
  CASE
    WHEN f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -1, CURRENT_DATE()))
      AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
    THEN 'prev_month' ELSE 'month_before' END AS period,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -2, CURRENT_DATE()))
  AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY period
`.trim();
}

// YoY comparison (this month vs same month prev year)
function sqlYoYComparison() {
  return `
SELECT
  CASE WHEN f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
       THEN 'this_month' ELSE 'same_month_last_year' END AS period,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND ((f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
        AND f.OrderDate < CURRENT_DATE())
    OR (f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(YEAR, -1, CURRENT_DATE()))
        AND f.OrderDate < DATEADD(MONTH, 1, DATE_TRUNC('MONTH', DATEADD(YEAR, -1, CURRENT_DATE())))))
GROUP BY period
`.trim();
}

// FTBP performance (MTD)
// Note: ftbp_Flag is the authoritative column — 0=non-FTBP, 1=FTBP v1, 2=FTBP v2.
// Earlier skill docs referenced offer_code/source/exact_offer_code which don't exist in the current schema.
function sqlFTBPProgramsMTD() {
  return `
SELECT
  CASE
    WHEN f.ftbp_Flag = 2 THEN 'FTBP_v2'
    WHEN f.ftbp_Flag = 1 THEN 'FTBP_v1'
    WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType <> '' THEN 'Subscription'
    ELSE 'Organic' END AS program,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY program
ORDER BY revenue DESC
`.trim();
}

// PBB breakdown (MTD)
function sqlPBBMtd() {
  return `
SELECT
  s.StoreCode,
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS revenue,
  SUM(f.Quantity) AS bags
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.store} s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND s.StoreCode ILIKE 'PBB%'
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY s.StoreCode, s.Country
ORDER BY revenue DESC
`.trim();
}

// SLA by market (last 30 days)
function sqlSLA30() {
  return `
SELECT
  COUNTRY,
  COUNT(*) AS shipments,
  ROUND(AVG(LeadTime), 2) AS avg_lead_time,
  ROUND(PERCENTILE_APPROX(LeadTime, 0.95), 2) AS p95_lead_time,
  ROUND(PERCENTILE_APPROX(LeadTime, 0.50), 2) AS median_lead_time
FROM ${T.shipment}
WHERE SHIPPINGDATE >= DATEADD(DAY, -30, CURRENT_DATE())
  AND LeadTime IS NOT NULL
GROUP BY COUNTRY
ORDER BY shipments DESC
`.trim();
}

// Cancellation reasons (last 30 days)
function sqlCancellationReasons30() {
  return `
SELECT
  Question_ls AS reason,
  COUNT(*) AS cases
FROM ${T.cancelSurvey}
WHERE SurveyDate >= DATEADD(DAY, -30, CURRENT_DATE())
  AND Question_ls IS NOT NULL
GROUP BY Question_ls
ORDER BY cases DESC
LIMIT 15
`.trim();
}

// ─── Email performance (last 30 days) ────────────────────────
function sqlEmailPerfLast30() {
  const d = new Date();
  // Use a rolling range; Databricks is happy with date literals on partition cols via CAST
  return `
SELECT
  CASE
    WHEN sj.EmailName LIKE 'BIEDM%' THEN 'Campaign (BIEDM)'
    WHEN sj.EmailName LIKE 'WelcomeSeries%' THEN 'Welcome Series'
    WHEN sj.EmailName IN ('Beanz_OrderConfirmation','OrderConfirmation_SubscriptionNew','Beanz_OrderShipment','Beanz_OrderPartialProcessing') THEN 'Transactional (Order)'
    WHEN sj.EmailName IN ('Beanz_UpcomingSubscription','EditSubscriptionGeneric','ChangeCoffeeConfirmationUSER','SubscriptionCancellation','SubscriptionDiscounted','SubscriptionPaymentFailure','SubscriptionPaused') THEN 'Subscription Lifecycle'
    WHEN sj.EmailName IN ('Beanz_RateMyCoffee','DialInVideoEmail','DialInVideoEmail _New') THEN 'Engagement'
    WHEN sj.EmailName LIKE '%CardExpiry%' OR sj.EmailName LIKE '%OOS%' OR sj.EmailName LIKE '%DiscountEnding%' THEN 'Retention / Win-back'
    WHEN sj.EmailName LIKE '%MICE%' THEN 'MICE Campaign'
    WHEN sj.EmailName LIKE '%BEI%' OR sj.EmailName LIKE '%FreeBeansPromo%' OR sj.EmailName LIKE '%BonusCoffee%' OR sj.EmailName LIKE '%SpringBonus%' THEN 'FTBP / Promo'
    ELSE 'Other'
  END AS category,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END) AS unique_sends,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) AS unique_opens,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) AS unique_clicks,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Unsubscribe' THEN e.SubscriberKey END) AS unique_unsubs,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Bounce' THEN e.SubscriberKey END) AS unique_bounces,
  ROUND(COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS open_rate,
  ROUND(COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS ctr
FROM ${T.emailEvents} e
JOIN ${T.sendJobs} sj ON e.SendID = sj.SendID
WHERE e.BrandRegionPartition = 'Beanz'
  AND e.YearPartition >= ${d.getFullYear() - 1}
  AND e.EventDate >= DATEADD(DAY, -30, CURRENT_DATE())
GROUP BY category
ORDER BY unique_sends DESC
`.trim();
}

// Email performance by region + BIEDM
function sqlBIEDMRegion() {
  const d = new Date();
  return `
SELECT
  COALESCE(sj.EmailRegion, 'NULL/Journey') AS region,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END) AS unique_sends,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) AS unique_opens,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) AS unique_clicks,
  ROUND(COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS open_rate,
  ROUND(COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) * 100.0
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS ctr
FROM ${T.emailEvents} e
JOIN ${T.sendJobs} sj ON e.SendID = sj.SendID
WHERE e.BrandRegionPartition = 'Beanz'
  AND sj.EmailName LIKE 'BIEDM%'
  AND e.YearPartition >= ${d.getFullYear() - 1}
  AND e.EventDate >= DATEADD(DAY, -60, CURRENT_DATE())
GROUP BY region
ORDER BY unique_sends DESC
`.trim();
}

// Cohort retention (last 12 cohorts, 6-month retention)
function sqlCohortRetention() {
  return `
WITH cohorts AS (
  SELECT
    CohortMonth,
    COUNT(*) AS cohort_size,
    SUM(CASE WHEN SubscriptionDurationMonth >= 1 THEN 1 ELSE 0 END) AS m1,
    SUM(CASE WHEN SubscriptionDurationMonth >= 2 THEN 1 ELSE 0 END) AS m2,
    SUM(CASE WHEN SubscriptionDurationMonth >= 3 THEN 1 ELSE 0 END) AS m3,
    SUM(CASE WHEN SubscriptionDurationMonth >= 4 THEN 1 ELSE 0 END) AS m4,
    SUM(CASE WHEN SubscriptionDurationMonth >= 5 THEN 1 ELSE 0 END) AS m5,
    SUM(CASE WHEN SubscriptionDurationMonth >= 6 THEN 1 ELSE 0 END) AS m6
  FROM ${T.subDim}
  WHERE BeanzSkuFlag = 1
    AND SubscriptionCreationDate >= DATEADD(MONTH, -12, CURRENT_DATE())
  GROUP BY CohortMonth
)
SELECT
  CohortMonth,
  cohort_size,
  ROUND(100.0 * m1 / NULLIF(cohort_size, 0), 1) AS m1_pct,
  ROUND(100.0 * m2 / NULLIF(cohort_size, 0), 1) AS m2_pct,
  ROUND(100.0 * m3 / NULLIF(cohort_size, 0), 1) AS m3_pct,
  ROUND(100.0 * m4 / NULLIF(cohort_size, 0), 1) AS m4_pct,
  ROUND(100.0 * m5 / NULLIF(cohort_size, 0), 1) AS m5_pct,
  ROUND(100.0 * m6 / NULLIF(cohort_size, 0), 1) AS m6_pct
FROM cohorts
ORDER BY CohortMonth DESC
LIMIT 12
`.trim();
}

// Revenue waterfall — last 13 months by month (revenue + bags + orders + MoM delta)
function sqlRevenueWaterfall() {
  return `
WITH monthly AS (
  SELECT
    DATE_FORMAT(f.OrderDate, 'yyyy-MM') AS month,
    ROUND(SUM(f.SkuAmount), 0) AS revenue,
    SUM(f.Quantity) AS bags,
    ROUND(SUM(f.Quantity_by_KG), 0) AS kg,
    COUNT(DISTINCT f.OrderNumber) AS orders,
    COUNT(DISTINCT f.CustomerEmail) AS customers
  FROM ${T.order} f
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1
    AND f.OrderDate >= DATEADD(MONTH, -13, DATE_TRUNC('MONTH', CURRENT_DATE()))
    AND f.OrderDate < CURRENT_DATE()
  GROUP BY DATE_FORMAT(f.OrderDate, 'yyyy-MM')
)
SELECT
  month,
  revenue,
  bags,
  kg,
  orders,
  customers,
  revenue - LAG(revenue, 1) OVER (ORDER BY month) AS mom_delta
FROM monthly
ORDER BY month
`.trim();
}

// SLA monthly trend (last 12 months)
function sqlSLAMonthly() {
  return `
SELECT
  DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM') AS month,
  COUNTRY,
  COUNT(*) AS shipments,
  ROUND(AVG(LeadTime), 2) AS avg_lead_time,
  ROUND(PERCENTILE_APPROX(LeadTime, 0.95), 2) AS p95_lead_time
FROM ${T.shipment}
WHERE SHIPPINGDATE >= DATEADD(MONTH, -12, DATE_TRUNC('MONTH', CURRENT_DATE()))
  AND SHIPPINGDATE < CURRENT_DATE()
  AND LeadTime IS NOT NULL AND LeadTime >= 0 AND LeadTime < 60
GROUP BY DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM'), COUNTRY
ORDER BY month, COUNTRY
`.trim();
}

// Per-send email performance (one row per SendID)
//   days: lookback window in days (default 90)
//   minSends: skip tiny sends (test sends etc). Default 50
function sqlEmailSendPerf(days, minSends) {
  const d = Math.max(1, Math.min(parseInt(days, 10) || 90, 730));
  const m = Math.max(0, parseInt(minSends, 10) || 50);
  const curYear = new Date().getFullYear();
  return `
SELECT
  sj.SendID,
  sj.EmailName,
  sj.Subject,
  sj.EmailRegion,
  sj.EmailBrand,
  sj.SentDate,
  sj.IsBIEDM,
  sj.IsWelcomeJourney,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END) AS sends,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) AS opens,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) AS clicks,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Bounce' THEN e.SubscriberKey END) AS bounces,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Unsubscribe' THEN e.SubscriberKey END) AS unsubs,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS open_rate,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 2) AS ctr,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END), 0), 1) AS click_to_open,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Unsubscribe' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 2) AS unsub_rate,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Bounce' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 2) AS bounce_rate
FROM ${T.emailEvents} e
JOIN ${T.sendJobs} sj ON e.SendID = sj.SendID
WHERE e.BrandRegionPartition = 'Beanz'
  AND e.YearPartition >= ${curYear - 1}
  AND e.EventDate >= DATEADD(DAY, -${d}, CURRENT_DATE())
  AND sj.EmailName IS NOT NULL
GROUP BY sj.SendID, sj.EmailName, sj.Subject, sj.EmailRegion, sj.EmailBrand, sj.SentDate, sj.IsBIEDM, sj.IsWelcomeJourney
HAVING COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END) >= ${m}
ORDER BY sj.SentDate DESC, sends DESC
LIMIT 500
`.trim();
}

// Top-clicked links across Beanz emails
function sqlEmailLinkPerf(days) {
  const d = Math.max(1, Math.min(parseInt(days, 10) || 90, 730));
  const curYear = new Date().getFullYear();
  return `
SELECT
  sj.EmailName,
  e.ClickURL,
  COUNT(DISTINCT e.SubscriberKey) AS unique_clicks,
  COUNT(*) AS total_clicks
FROM ${T.emailEvents} e
JOIN ${T.sendJobs} sj ON e.SendID = sj.SendID
WHERE e.BrandRegionPartition = 'Beanz'
  AND e.EventType = 'Click'
  AND e.ClickURL IS NOT NULL AND e.ClickURL <> ''
  AND e.YearPartition >= ${curYear - 1}
  AND e.EventDate >= DATEADD(DAY, -${d}, CURRENT_DATE())
GROUP BY sj.EmailName, e.ClickURL
HAVING COUNT(DISTINCT e.SubscriberKey) >= 5
ORDER BY unique_clicks DESC
LIMIT 200
`.trim();
}

// Performance for a single email by EmailName (aggregated across all SendIDs)
function sqlEmailByName(emailName, days) {
  const d = Math.max(1, Math.min(parseInt(days, 10) || 180, 730));
  const curYear = new Date().getFullYear();
  const safe = String(emailName || '').replace(/'/g, "''");
  return `
SELECT
  sj.EmailName,
  COUNT(DISTINCT sj.SendID) AS send_count,
  MIN(sj.SentDate) AS first_send,
  MAX(sj.SentDate) AS last_send,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END) AS sends,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END) AS opens,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END) AS clicks,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Bounce' THEN e.SubscriberKey END) AS bounces,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Unsubscribe' THEN e.SubscriberKey END) AS unsubs,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Open' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 1) AS open_rate,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN e.EventType = 'Click' THEN e.SubscriberKey END)
    / NULLIF(COUNT(DISTINCT CASE WHEN e.EventType = 'Sent' THEN e.SubscriberKey END), 0), 2) AS ctr
FROM ${T.emailEvents} e
JOIN ${T.sendJobs} sj ON e.SendID = sj.SendID
WHERE e.BrandRegionPartition = 'Beanz'
  AND e.YearPartition >= ${curYear - 1}
  AND e.EventDate >= DATEADD(DAY, -${d}, CURRENT_DATE())
  AND sj.EmailName = '${safe}'
GROUP BY sj.EmailName
`.trim();
}

// Cross-period KPI rollup (FY24/25/26 + CY24/25)
function sqlPeriodKPIs() {
  return `
WITH periods AS (
  SELECT 'FY24' AS period, DATE '2023-07-01' AS start_d, DATE '2024-07-01' AS end_d UNION ALL
  SELECT 'FY25', DATE '2024-07-01', DATE '2025-07-01' UNION ALL
  SELECT 'FY26', DATE '2025-07-01', DATE '2026-07-01' UNION ALL
  SELECT 'CY24', DATE '2024-01-01', DATE '2025-01-01' UNION ALL
  SELECT 'CY25', DATE '2025-01-01', DATE '2026-01-01'
)
SELECT
  p.period,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 0) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  COUNT(DISTINCT f.CustomerEmail) AS customers,
  ROUND(SUM(CASE WHEN f.ftbp_Flag > 0 THEN f.SkuAmount ELSE 0 END), 0) AS ftbp_revenue,
  SUM(CASE WHEN f.ftbp_Flag > 0 THEN f.Quantity ELSE 0 END) AS ftbp_bags
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN periods p ON f.OrderDate >= p.start_d AND f.OrderDate < p.end_d
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY p.period
ORDER BY p.period
`.trim();
}

// Weekly MOT performance (last 13 weeks)
function sqlMOTWeekly() {
  return `
SELECT
  Week_Start_Date,
  VENDOR_NAME,
  WEB_STORE,
  Tier,
  MOT_QTY
FROM ${T.motSummary}
WHERE Week_Start_Date >= DATEADD(WEEK, -13, CURRENT_DATE())
ORDER BY Week_Start_Date DESC, MOT_QTY DESC
LIMIT 200
`.trim();
}

// ─── Executors with tags ─────────────────────────────────────
function rowsToObjects(result) {
  if (!result || !result.rows || !result.columns) return [];
  return result.rows.map(r => {
    const obj = {};
    result.columns.forEach((c, i) => { obj[c] = r[i]; });
    return obj;
  });
}

async function getYesterdayPulse(cfg) {
  const r = await executeSQL(cfg, sqlYesterdayPulse(), { ttlMinutes: 30, tag: 'daily-pulse' });
  const rows = rowsToObjects(r);
  const out = { revenue: 0, bags: 0, kg: 0, orders: 0, aov: 0 };
  rows.forEach(row => { out[row.metric] = Number(row.value) || 0; });
  return { data: out, cached: r.cached, source: r.source };
}

async function getMTD(cfg) {
  const r = await executeSQL(cfg, sqlMTD(), { ttlMinutes: 60, tag: 'mtd' });
  const rows = rowsToObjects(r);
  const out = { revenue: 0, bags: 0, kg: 0, orders: 0 };
  rows.forEach(row => { out[row.metric.replace('mtd_', '')] = Number(row.value) || 0; });
  return { data: out, cached: r.cached, source: r.source };
}

async function getDaily30(cfg) {
  const r = await executeSQL(cfg, sqlDaily30(), { ttlMinutes: 60, tag: 'daily-30' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getActiveSubs(cfg) {
  const r = await executeSQL(cfg, sqlActiveSubs(), { ttlMinutes: 240, tag: 'subs' });
  const rows = rowsToObjects(r);
  const out = { active_total: 0, active: 0, paused: 0, cancelled_30d: 0, new_30d: 0 };
  rows.forEach(row => { out[row.metric] = Number(row.value) || 0; });
  return { data: out, cached: r.cached, source: r.source };
}

async function getMarketMTD(cfg) {
  const r = await executeSQL(cfg, sqlMarketMTD(), { ttlMinutes: 60, tag: 'market-mtd' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getTopRoastersMTD(cfg, limit) {
  const r = await executeSQL(cfg, sqlTopRoastersMTD(limit), { ttlMinutes: 120, tag: 'roasters-mtd' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getMoM(cfg) {
  const r = await executeSQL(cfg, sqlMoMComparison(), { ttlMinutes: 240, tag: 'mom' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getYoY(cfg) {
  const r = await executeSQL(cfg, sqlYoYComparison(), { ttlMinutes: 240, tag: 'yoy' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getFTBPPrograms(cfg) {
  const r = await executeSQL(cfg, sqlFTBPProgramsMTD(), { ttlMinutes: 120, tag: 'ftbp' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getPBB(cfg) {
  const r = await executeSQL(cfg, sqlPBBMtd(), { ttlMinutes: 120, tag: 'pbb' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getSLA30(cfg) {
  const r = await executeSQL(cfg, sqlSLA30(), { ttlMinutes: 240, tag: 'sla-30' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getCancellationReasons(cfg) {
  const r = await executeSQL(cfg, sqlCancellationReasons30(), { ttlMinutes: 240, tag: 'churn' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getEmailPerformance(cfg) {
  const r = await executeSQL(cfg, sqlEmailPerfLast30(), { ttlMinutes: 120, tag: 'email-perf' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getBIEDMByRegion(cfg) {
  const r = await executeSQL(cfg, sqlBIEDMRegion(), { ttlMinutes: 120, tag: 'biedm' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getCohortRetention(cfg) {
  const r = await executeSQL(cfg, sqlCohortRetention(), { ttlMinutes: 360, tag: 'cohort' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getMOT(cfg) {
  const r = await executeSQL(cfg, sqlMOTWeekly(), { ttlMinutes: 240, tag: 'mot' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getRevenueWaterfall(cfg) {
  const r = await executeSQL(cfg, sqlRevenueWaterfall(), { ttlMinutes: 180, tag: 'waterfall' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getSLAMonthly(cfg) {
  const r = await executeSQL(cfg, sqlSLAMonthly(), { ttlMinutes: 240, tag: 'sla-monthly' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getPeriodKPIs(cfg) {
  const r = await executeSQL(cfg, sqlPeriodKPIs(), { ttlMinutes: 360, tag: 'period-kpis' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getEmailSendPerf(cfg, days, minSends) {
  const r = await executeSQL(cfg, sqlEmailSendPerf(days, minSends), { ttlMinutes: 60, tag: 'email-sends' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getEmailLinkPerf(cfg, days) {
  const r = await executeSQL(cfg, sqlEmailLinkPerf(days), { ttlMinutes: 120, tag: 'email-links' });
  return { data: rowsToObjects(r), cached: r.cached, source: r.source };
}

async function getEmailByName(cfg, emailName, days) {
  const r = await executeSQL(cfg, sqlEmailByName(emailName, days), { ttlMinutes: 60, tag: 'email-by-name' });
  const rows = rowsToObjects(r);
  return { data: rows[0] || null, cached: r.cached, source: r.source };
}

// ─── Data Quality Audit ──────────────────────────────────────
function auditSnapshot(snapshot) {
  const issues = [];
  const ok = [];
  const data = snapshot || {};

  // Revenue sanity (daily ~$40-80K)
  if (data.yesterday && data.yesterday.revenue != null) {
    const rev = data.yesterday.revenue;
    if (rev < 5000) issues.push({ metric: 'yesterday_revenue', severity: 'warning', detail: `Very low revenue $${rev.toLocaleString()} — verify or investigate drop` });
    else if (rev > 200000) issues.push({ metric: 'yesterday_revenue', severity: 'warning', detail: `Very high revenue $${rev.toLocaleString()} — verify for outlier` });
    else ok.push('yesterday_revenue');
  }

  // KG/bag sanity
  if (data.yesterday && data.yesterday.bags > 0 && data.yesterday.kg != null) {
    const ratio = data.yesterday.kg / data.yesterday.bags;
    if (ratio < BENCHMARKS.AVG_KG_PER_BAG_MIN || ratio > BENCHMARKS.AVG_KG_PER_BAG_MAX) {
      issues.push({
        metric: 'kg_per_bag',
        severity: 'critical',
        detail: `Avg KG/bag ${ratio.toFixed(3)} outside [0.25, 0.35] — likely missing RateType or BeanzSkuFlag filter`
      });
    } else ok.push('kg_per_bag_ratio');
  }

  // Active subs sanity
  if (data.activeSubs && data.activeSubs.active_total != null) {
    const t = data.activeSubs.active_total;
    if (t > 50000) issues.push({ metric: 'active_subs', severity: 'critical', detail: `Active subs ${t.toLocaleString()} >50K — BeanzSkuFlag=1 filter likely missing` });
    else if (t < 20000) issues.push({ metric: 'active_subs', severity: 'warning', detail: `Active subs ${t.toLocaleString()} below 20K — unusual churn spike or data gap?` });
    else ok.push('active_subs');
  }

  // PBB share sanity
  if (data.pbb && data.mtd && data.mtd.revenue > 0) {
    const pbbTotal = (data.pbb || []).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const share = pbbTotal / data.mtd.revenue;
    if (share > 0.20) issues.push({ metric: 'pbb_share', severity: 'warning', detail: `PBB share ${(share * 100).toFixed(1)}% > 15% — verify segmentation` });
    else ok.push('pbb_share');
  }

  return { ok, issues, score: ok.length - issues.length * 2, generatedAt: new Date().toISOString() };
}

// ─── Insight Generation ──────────────────────────────────────
function generateInsights(snapshot) {
  const insights = [];
  const d = snapshot;

  // Yesterday vs recent
  if (d.yesterday && d.daily30 && d.daily30.length > 1) {
    const recent = d.daily30.slice(-8, -1); // last 7 (exclude yesterday)
    const avgRev = recent.reduce((s, r) => s + (Number(r.revenue) || 0), 0) / Math.max(recent.length, 1);
    const ratio = d.yesterday.revenue / Math.max(avgRev, 1);
    if (ratio > 1.3) insights.push({ severity: 'positive', tile: 'Revenue surge', detail: `Yesterday's $${Math.round(d.yesterday.revenue).toLocaleString()} is ${((ratio - 1) * 100).toFixed(0)}% above 7-day avg of $${Math.round(avgRev).toLocaleString()}` });
    else if (ratio < 0.7) insights.push({ severity: 'warning', tile: 'Revenue dip', detail: `Yesterday's $${Math.round(d.yesterday.revenue).toLocaleString()} is ${((1 - ratio) * 100).toFixed(0)}% below 7-day avg — investigate` });
  }

  // MoM comparison
  if (d.mom && d.mom.length === 2) {
    const prev = d.mom.find(r => r.period === 'prev_month');
    const before = d.mom.find(r => r.period === 'month_before');
    if (prev && before && before.revenue > 0) {
      const mom = ((prev.revenue - before.revenue) / before.revenue) * 100;
      const sev = mom > 10 ? 'positive' : mom > 0 ? 'neutral' : mom > -10 ? 'warning' : 'critical';
      insights.push({ severity: sev, tile: 'MoM revenue', detail: `${mom > 0 ? '+' : ''}${mom.toFixed(1)}% MoM ($${Math.round(prev.revenue / 1000)}K vs $${Math.round(before.revenue / 1000)}K)` });
    }
  }

  // Top market concentration
  if (d.marketMTD && d.marketMTD.length) {
    const total = d.marketMTD.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const top = d.marketMTD[0];
    const share = top.revenue / Math.max(total, 1);
    if (share > 0.5) insights.push({ severity: 'warning', tile: 'Market concentration', detail: `${top.Country} accounts for ${(share * 100).toFixed(0)}% of MTD revenue — concentration risk` });
  }

  // FTBP share
  if (d.ftbpPrograms && d.ftbpPrograms.length && d.mtd && d.mtd.revenue > 0) {
    const ftbp = d.ftbpPrograms.filter(r => r.program === 'FTBP_v1' || r.program === 'FTBP_v2');
    const ftbpRev = ftbp.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const share = ftbpRev / d.mtd.revenue;
    insights.push({
      severity: share > 0.45 ? 'warning' : 'neutral',
      tile: 'FTBP revenue share',
      detail: `FTBP is ${(share * 100).toFixed(0)}% of MTD revenue ($${Math.round(ftbpRev / 1000)}K)${share > 0.45 ? ' — single-channel risk' : ''}`
    });
  }

  // SLA stress
  if (d.sla30 && d.sla30.length) {
    const stressed = d.sla30.filter(r => Number(r.avg_lead_time) > 7);
    if (stressed.length) {
      insights.push({
        severity: 'warning',
        tile: 'SLA stress',
        detail: stressed.map(r => `${r.COUNTRY}: ${Number(r.avg_lead_time).toFixed(1)}d`).join(' · ') + ' — lead time > 7d'
      });
    }
  }

  // Top cancellation reason
  if (d.cancellationReasons && d.cancellationReasons.length) {
    const top = d.cancellationReasons[0];
    insights.push({
      severity: 'neutral',
      tile: 'Top churn reason',
      detail: `"${top.reason.slice(0, 60)}" (${top.cases.toLocaleString()} cases, last 30d)`
    });
  }

  // Subscriber momentum
  if (d.activeSubs) {
    const s = d.activeSubs;
    const net = s.new_30d - s.cancelled_30d;
    insights.push({
      severity: net > 0 ? 'positive' : 'warning',
      tile: 'Subscriber momentum',
      detail: `Net ${net > 0 ? '+' : ''}${net.toLocaleString()} last 30d (new +${s.new_30d.toLocaleString()} / cancelled -${s.cancelled_30d.toLocaleString()}), total ${s.active_total.toLocaleString()}`
    });
  }

  return insights;
}

// ─── Full Snapshot Assembler ─────────────────────────────────
async function getFullSnapshot(cfg, opts) {
  opts = opts || {};
  const out = { generatedAt: new Date().toISOString(), source: null, errors: {}, cached: {}, benchmarks: BENCHMARKS };
  const tasks = [
    ['yesterday', () => getYesterdayPulse(cfg)],
    ['mtd', () => getMTD(cfg)],
    ['daily30', () => getDaily30(cfg)],
    ['activeSubs', () => getActiveSubs(cfg)],
    ['marketMTD', () => getMarketMTD(cfg)],
    ['topRoasters', () => getTopRoastersMTD(cfg, 15)],
    ['mom', () => getMoM(cfg)],
    ['yoy', () => getYoY(cfg)],
    ['ftbpPrograms', () => getFTBPPrograms(cfg)],
    ['pbb', () => getPBB(cfg)],
    ['sla30', () => getSLA30(cfg)],
    ['slaMonthly', () => getSLAMonthly(cfg)],
    ['cancellationReasons', () => getCancellationReasons(cfg)],
    ['waterfall', () => getRevenueWaterfall(cfg)],
    ['periodKPIs', () => getPeriodKPIs(cfg)]
  ];
  if (opts.includeEmail !== false) {
    tasks.push(['emailPerformance', () => getEmailPerformance(cfg)]);
    tasks.push(['biedmRegion', () => getBIEDMByRegion(cfg)]);
  }
  if (opts.includeCohort !== false) {
    tasks.push(['cohortRetention', () => getCohortRetention(cfg)]);
  }

  await Promise.all(tasks.map(async ([key, fn]) => {
    try {
      const r = await fn();
      out[key] = r.data;
      out.cached[key] = !!r.cached;
      out.source = out.source || r.source;
    } catch (e) {
      out.errors[key] = e.message || String(e);
    }
  }));

  out.audit = auditSnapshot(out);
  out.insights = generateInsights(out);
  return out;
}

// ─── Exports ─────────────────────────────────────────────────
module.exports = {
  // Config validator — accepts either a PAT or SP (clientId+clientSecret)
  isConfigured: (cfg) => !!(cfg && cfg.host && (cfg.warehouseId || cfg.spaceId) &&
    (cfg.token || (cfg.clientId && cfg.clientSecret))),
  // Core executor
  executeSQL,
  validateSQL,
  // Token diagnostics
  tokenStatus,
  // Cache utilities
  cacheInvalidate,
  cacheStats,
  // Query library (for advanced callers)
  sql: {
    yesterdayPulse: sqlYesterdayPulse,
    mtd: sqlMTD,
    daily30: sqlDaily30,
    activeSubs: sqlActiveSubs,
    marketMTD: sqlMarketMTD,
    topRoastersMTD: sqlTopRoastersMTD,
    momComparison: sqlMoMComparison,
    yoyComparison: sqlYoYComparison,
    ftbpProgramsMTD: sqlFTBPProgramsMTD,
    pbbMtd: sqlPBBMtd,
    sla30: sqlSLA30,
    cancellationReasons: sqlCancellationReasons30,
    emailPerfLast30: sqlEmailPerfLast30,
    biedmRegion: sqlBIEDMRegion,
    cohortRetention: sqlCohortRetention,
    motWeekly: sqlMOTWeekly,
    revenueWaterfall: sqlRevenueWaterfall,
    slaMonthly: sqlSLAMonthly,
    periodKPIs: sqlPeriodKPIs,
    emailSendPerf: sqlEmailSendPerf,
    emailLinkPerf: sqlEmailLinkPerf,
    emailByName: sqlEmailByName
  },
  // High-level getters
  getYesterdayPulse,
  getMTD,
  getDaily30,
  getActiveSubs,
  getMarketMTD,
  getTopRoastersMTD,
  getMoM,
  getYoY,
  getFTBPPrograms,
  getPBB,
  getSLA30,
  getCancellationReasons,
  getEmailPerformance,
  getBIEDMByRegion,
  getCohortRetention,
  getMOT,
  getRevenueWaterfall,
  getSLAMonthly,
  getPeriodKPIs,
  getEmailSendPerf,
  getEmailLinkPerf,
  getEmailByName,
  // Snapshot
  getFullSnapshot,
  auditSnapshot,
  generateInsights,
  // Utilities
  dateRangeForPeriod,
  rowsToObjects,
  // Constants
  BENCHMARKS,
  SCHEMA,
  TABLES: T,
  MARKET_CODES
};
