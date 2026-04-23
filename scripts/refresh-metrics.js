#!/usr/bin/env node
'use strict';

/**
 * Refresh kb-data/intelligence/metrics-live.json from Databricks.
 *
 * Requires in .env:
 *   DATABRICKS_HOST          e.g. adb-1234567890123456.7.azuredatabricks.net
 *   DATABRICKS_TOKEN         Personal Access Token (dapi...)
 *   DATABRICKS_WAREHOUSE_ID  SQL Warehouse ID (hex, from warehouse URL)
 *
 * Uses the Databricks Statement Execution REST API:
 *   POST /api/2.0/sql/statements/
 *
 * Usage:
 *   node scripts/refresh-metrics.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const outputPath = path.join(rootDir, 'kb-data', 'intelligence', 'metrics-live.json');

// ─── Tiny .env parser ────────────────────────────────────────
function loadEnv() {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = loadEnv();
const host = process.env.DATABRICKS_HOST || env.DATABRICKS_HOST;
const token = process.env.DATABRICKS_TOKEN || env.DATABRICKS_TOKEN;
const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID || env.DATABRICKS_WAREHOUSE_ID;

if (!host || !token || !warehouseId) {
  console.error('ERROR: Missing Databricks config. Set DATABRICKS_HOST, DATABRICKS_TOKEN, and DATABRICKS_WAREHOUSE_ID in .env.');
  process.exit(1);
}

// ─── HTTPS helpers ───────────────────────────────────────────
function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 500)));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Non-JSON response: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Execute SQL via Databricks Statement Execution API ──────
async function executeSQL(sql) {
  // Submit
  const submitOpts = {
    hostname: host,
    port: 443,
    path: '/api/2.0/sql/statements/',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  };
  const submitBody = JSON.stringify({
    warehouse_id: warehouseId,
    statement: sql,
    wait_timeout: '30s',
    on_wait_timeout: 'CONTINUE',
    format: 'JSON_ARRAY',
    disposition: 'INLINE'
  });

  let response = await httpsJson(submitOpts, submitBody);
  let state = response.status && response.status.state;
  const statementId = response.statement_id;

  // Poll if not done
  const deadline = Date.now() + 120000;
  while (state === 'PENDING' || state === 'RUNNING') {
    if (Date.now() > deadline) throw new Error('Query timeout after 120s: ' + sql.slice(0, 80));
    await sleep(2000);
    const pollOpts = {
      hostname: host,
      port: 443,
      path: '/api/2.0/sql/statements/' + statementId,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    };
    response = await httpsJson(pollOpts, null);
    state = response.status && response.status.state;
  }

  if (state === 'FAILED' || state === 'CANCELED' || state === 'CLOSED') {
    const err = (response.status && response.status.error && response.status.error.message) || state;
    throw new Error('Query ' + state + ': ' + err);
  }

  const schema = (response.manifest && response.manifest.schema && response.manifest.schema.columns) || [];
  const columns = schema.map((c) => c.name);
  const rawRows = (response.result && response.result.data_array) || [];
  // Format JSON_ARRAY: rows are arrays of primitive values (strings)
  const rows = rawRows.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      const val = row[i];
      obj[col] = coerce(val, schema[i] && schema[i].type_name);
    });
    return obj;
  });
  return { columns, rows };
}

function coerce(val, typeName) {
  if (val == null) return null;
  if (typeName === 'LONG' || typeName === 'INT') return parseInt(val, 10);
  if (typeName === 'DOUBLE' || typeName === 'FLOAT' || typeName === 'DECIMAL') return parseFloat(val);
  return val;
}

// ─── Queries (match the schema confirmed via MCP) ────────────
const FY_RANGES = [
  ['FY26', '2025-07-01', '2026-07-01'],
  ['FY25', '2024-07-01', '2025-07-01'],
  ['FY24', '2023-07-01', '2024-07-01'],
  ['CY25', '2025-01-01', '2026-01-01'],
  ['CY24', '2024-01-01', '2025-01-01']
];

function kpiUnion() {
  const union = FY_RANGES.map(([label, s, e]) =>
    "SELECT '" + label + "' AS period, DATE '" + s + "' AS start_d, DATE '" + e + "' AS end_d"
  ).join(' UNION ALL ');
  // Skill pattern: SUM(SkuAmount) directly with RateType filter — DO NOT multiply by Rate (double-converts)
  return `WITH fy_ranges AS (${union})
SELECT
  r.period,
  ROUND(SUM(f.SkuAmount),0) AS revenue_aud,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG),0) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  COUNT(DISTINCT f.CustomerId) AS customers,
  COUNT(DISTINCT CASE WHEN f.ftbp_Flag > 0 THEN f.OrderNumber END) AS ftbp_orders,
  ROUND(SUM(CASE WHEN f.ftbp_Flag > 0 THEN f.SkuAmount ELSE 0 END),0) AS ftbp_revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN fy_ranges r ON f.OrderDate >= r.start_d AND f.OrderDate < r.end_d
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY r.period
ORDER BY r.period`;
}

const QUERIES = {
  kpis: kpiUnion(),
  revenueTrendMonthly: `SELECT DATE_FORMAT(f.OrderDate, 'yyyy-MM') AS month,
  ROUND(SUM(f.SkuAmount),0) AS revenue, SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled' AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2023-07-01' AND f.OrderDate < '2026-07-01'
GROUP BY DATE_FORMAT(f.OrderDate, 'yyyy-MM') ORDER BY month`,
  revenueByCountryMonth: `SELECT s.Country AS country, DATE_FORMAT(f.OrderDate, 'yyyy-MM') AS month,
  ROUND(SUM(f.SkuAmount),0) AS revenue, SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled' AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2023-07-01' AND f.OrderDate < '2026-07-01'
GROUP BY s.Country, DATE_FORMAT(f.OrderDate, 'yyyy-MM')
ORDER BY month, country`,
  revenueByCountryPerPeriod: `WITH periods AS (
  SELECT 'FY26' AS period, DATE '2025-07-01' AS s, DATE '2026-07-01' AS e UNION ALL
  SELECT 'FY25', DATE '2024-07-01', DATE '2025-07-01' UNION ALL
  SELECT 'FY24', DATE '2023-07-01', DATE '2024-07-01' UNION ALL
  SELECT 'CY25', DATE '2025-01-01', DATE '2026-01-01' UNION ALL
  SELECT 'CY24', DATE '2024-01-01', DATE '2025-01-01'
)
SELECT r.period, s.Country AS country,
  ROUND(SUM(f.SkuAmount),0) AS revenue, SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode
INNER JOIN periods r ON f.OrderDate >= r.s AND f.OrderDate < r.e
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled' AND f.BeanzSkuFlag = 1
GROUP BY r.period, s.Country ORDER BY r.period, revenue DESC`,
  revenueByProgramPerPeriod: `WITH periods AS (
  SELECT 'FY26' AS period, DATE '2025-07-01' AS s, DATE '2026-07-01' AS e UNION ALL
  SELECT 'FY25', DATE '2024-07-01', DATE '2025-07-01' UNION ALL
  SELECT 'FY24', DATE '2023-07-01', DATE '2024-07-01' UNION ALL
  SELECT 'CY25', DATE '2025-01-01', DATE '2026-01-01' UNION ALL
  SELECT 'CY24', DATE '2024-01-01', DATE '2025-01-01'
)
SELECT r.period,
  CASE WHEN f.ftbp_Flag = 2 THEN 'FTBP v2' WHEN f.ftbp_Flag = 1 THEN 'FTBP v1'
    WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType != '' THEN 'Subscription'
    ELSE 'One-off' END AS program,
  ROUND(SUM(f.SkuAmount),0) AS revenue, SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN periods r ON f.OrderDate >= r.s AND f.OrderDate < r.e
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled' AND f.BeanzSkuFlag = 1
GROUP BY r.period, 2 ORDER BY r.period, revenue DESC`,
  roastersTopPerPeriod: `WITH periods AS (
  SELECT 'FY26' AS period, DATE '2025-07-01' AS s, DATE '2026-07-01' AS e UNION ALL
  SELECT 'FY25', DATE '2024-07-01', DATE '2025-07-01' UNION ALL
  SELECT 'FY24', DATE '2023-07-01', DATE '2024-07-01' UNION ALL
  SELECT 'CY25', DATE '2025-01-01', DATE '2026-01-01' UNION ALL
  SELECT 'CY24', DATE '2024-01-01', DATE '2025-01-01'
), roaster_totals AS (
  SELECT r.period, p.VendorName AS roaster, SUM(f.SkuAmount) AS revenue,
    SUM(f.Quantity) AS bags, ROUND(SUM(f.Quantity_by_KG),0) AS kg
  FROM ana_prd_gold.edw.factbeanzorder f
  INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
  INNER JOIN ana_prd_gold.edw.dimbeanzproduct p ON f.ProductCodeKey = p.ProductCodeKey
  INNER JOIN periods r ON f.OrderDate >= r.s AND f.OrderDate < r.e
  WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled' AND f.BeanzSkuFlag = 1
    AND p.VendorName IS NOT NULL
  GROUP BY r.period, p.VendorName
)
SELECT period, roaster, ROUND(revenue,0) AS revenue, bags, kg
FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY period ORDER BY revenue DESC) AS rn FROM roaster_totals) x
WHERE rn <= 25 ORDER BY period, revenue DESC`,
  slaByCountry: `SELECT sh.COUNTRY AS country, ROUND(AVG(sh.LeadTime),1) AS avg_lead_time,
  ROUND(PERCENTILE_APPROX(sh.LeadTime, 0.95),1) AS p95_lead_time,
  ROUND(AVG(sh.TRANSITITME),1) AS avg_transit,
  ROUND(100.0 * AVG(sh.OrderSLAFlg),1) AS sla_pct, COUNT(*) AS shipments
FROM ana_prd_gold.edw.factbeanzshipment sh
WHERE sh.ORDERCREATIONDATE >= '2025-07-01' AND sh.ORDERCREATIONDATE < '2026-07-01'
  AND sh.LeadTime IS NOT NULL AND sh.LeadTime >= 0 AND sh.LeadTime < 60
GROUP BY sh.COUNTRY ORDER BY avg_lead_time`,
  slaByCarrier: `SELECT sh.CARRIER AS carrier, sh.COUNTRY AS country,
  ROUND(AVG(sh.LeadTime),1) AS avg_lead_time,
  ROUND(100.0 * AVG(sh.OrderSLAFlg),1) AS sla_pct, COUNT(*) AS shipments
FROM ana_prd_gold.edw.factbeanzshipment sh
WHERE sh.ORDERCREATIONDATE >= '2025-07-01' AND sh.ORDERCREATIONDATE < '2026-07-01'
  AND sh.LeadTime IS NOT NULL AND sh.LeadTime >= 0 AND sh.LeadTime < 60
  AND sh.CARRIER IS NOT NULL AND sh.CARRIER != ''
GROUP BY sh.CARRIER, sh.COUNTRY HAVING COUNT(*) > 500
ORDER BY shipments DESC LIMIT 15`,
  slaTrend: `SELECT DATE_FORMAT(sh.ORDERCREATIONDATE, 'yyyy-MM') AS month,
  ROUND(AVG(sh.LeadTime),2) AS avg_lead_time, COUNT(*) AS shipments
FROM ana_prd_gold.edw.factbeanzshipment sh
WHERE sh.ORDERCREATIONDATE >= '2024-07-01' AND sh.ORDERCREATIONDATE < '2026-07-01'
  AND sh.LeadTime IS NOT NULL AND sh.LeadTime >= 0 AND sh.LeadTime < 60
GROUP BY DATE_FORMAT(sh.ORDERCREATIONDATE, 'yyyy-MM') ORDER BY month`,
  ftbpConversion: `SELECT
  CASE WHEN FTBP_Release IN ('v1','V1') THEN 'v1'
       WHEN FTBP_Release IN ('v2','V2') THEN 'v2' ELSE 'unknown' END AS release,
  COUNT(DISTINCT ProductRegistrationID) AS registrations,
  COUNT(DISTINCT CASE WHEN Has_PaidOrdere = 'Y' THEN ProductRegistrationID END) AS converted,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN Has_PaidOrdere = 'Y' THEN ProductRegistrationID END) / NULLIF(COUNT(DISTINCT ProductRegistrationID),0), 1) AS conversion_pct,
  SUM(PaidOrders) AS total_paid_orders,
  ROUND(AVG(DurationTakenForFirstPaidOrdere),1) AS avg_days_to_paid
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE ProductRegistrationDate >= '2025-07-01' AND ProductRegistrationDate < '2026-07-01'
  AND IsFTBPRegistration = 'true'
GROUP BY 1 ORDER BY registrations DESC`,
  subsTrend: `SELECT DATE_FORMAT(fs.EventDate, 'yyyy-MM') AS month,
  COUNT(DISTINCT CASE WHEN fs.EventName = 'SubscriptionCreated' AND fs.status = 'ACTIVE' THEN fs.SubscriptionID END) AS new_subs,
  COUNT(DISTINCT CASE WHEN fs.EventName = 'SubscriptionCancelDate' THEN fs.SubscriptionID END) AS cancelled,
  COUNT(DISTINCT CASE WHEN fs.EventName = 'SubscriptionPauseDate' THEN fs.SubscriptionID END) AS paused
FROM ana_prd_gold.edw.factbeanzsubscription fs
WHERE fs.EventDate >= '2024-07-01' AND fs.EventDate < '2026-07-01' AND fs.BeanzSkuFlag = 1
GROUP BY DATE_FORMAT(fs.EventDate, 'yyyy-MM') ORDER BY month`,
  activeSubsByCountry: `SELECT s.Country AS country, COUNT(DISTINCT fs.SubscriptionID) AS active_subs
FROM ana_prd_gold.edw.factbeanzsubscription fs
JOIN ana_prd_gold.edw.dimbeanzstore s ON fs.storecode = s.StoreCode
WHERE fs.EventName = 'SubscriptionCreated' AND fs.status = 'ACTIVE' AND fs.BeanzSkuFlag = 1
  AND fs.SubscriptionID NOT IN (
    SELECT fs2.SubscriptionID FROM ana_prd_gold.edw.factbeanzsubscription fs2
    WHERE fs2.EventName = 'SubscriptionCancelDate')
GROUP BY s.Country ORDER BY active_subs DESC`,
  cancelReasons: `SELECT Question AS reason, COUNT(*) AS cancellations
FROM ana_prd_gold.edw.factbeanzcancellationsurvey
WHERE SurveyDate >= '2025-07-01' AND SurveyDate < '2026-07-01'
  AND Question IS NOT NULL AND Question != ''
GROUP BY Question ORDER BY cancellations DESC LIMIT 10`
};

// ─── Transform into the metrics-live.json shape ──────────────
async function build() {
  console.log('Running ' + Object.keys(QUERIES).length + ' queries against Databricks...');
  const results = {};
  for (const [key, sql] of Object.entries(QUERIES)) {
    process.stdout.write('  - ' + key + '... ');
    try {
      const t0 = Date.now();
      const r = await executeSQL(sql);
      results[key] = r.rows;
      console.log(r.rows.length + ' rows (' + (Date.now() - t0) + 'ms)');
    } catch (e) {
      console.log('FAILED — ' + e.message);
      results[key] = [];
    }
  }

  const periods = {};
  for (const row of results.kpis) {
    const key = row.period;
    periods[key] = {
      label: key,
      revenue_aud: row.revenue_aud,
      bags: row.bags,
      orders: row.orders,
      customers: row.customers,
      ftbp_orders: row.ftbp_orders,
      ftbp_revenue_aud: row.ftbp_revenue,
      ftbp_revenue_share_pct: row.revenue_aud ? Math.round(1000 * row.ftbp_revenue / row.revenue_aud) / 10 : 0
    };
  }

  const yoy = {
    FY26_vs_FY25: pctDiff(periods.FY26, periods.FY25),
    CY25_vs_CY24: pctDiff(periods.CY25, periods.CY24)
  };

  const ftbpMap = {};
  for (const r of results.ftbpConversion) {
    ftbpMap[r.release] = {
      registrations: r.registrations,
      converted: r.converted,
      conversion_pct: r.conversion_pct,
      total_paid_orders: r.total_paid_orders,
      avg_days_to_first_paid: r.avg_days_to_paid
    };
  }

  const fy26Months = fyMonths(26);
  const subsFY26 = results.subsTrend.filter((r) => fy26Months.includes(r.month));
  const subsYTD = subsFY26.reduce((acc, r) => ({
    new_subs: acc.new_subs + (r.new_subs || 0),
    cancellations: acc.cancellations + (r.cancelled || 0)
  }), { new_subs: 0, cancellations: 0 });
  const activeTotal = results.activeSubsByCountry.reduce((s, r) => s + r.active_subs, 0);
  subsYTD.net_growth = subsYTD.new_subs - subsYTD.cancellations;
  subsYTD.churn_rate_pct = activeTotal ? Math.round(1000 * subsYTD.cancellations / (subsYTD.new_subs + activeTotal)) / 10 : null;

  const snapshot = {
    source: 'databricks',
    warehouse: 'ana_prd_gold.edw',
    generated_at: new Date().toISOString(),
    note: 'Auto-generated by scripts/refresh-metrics.js',
    periods,
    yoy,
    revenue_trend_monthly: results.revenueTrendMonthly.map((r) => ({
      month: r.month, revenue: r.revenue, bags: r.bags, orders: r.orders
    })),
    revenue_by_country_month: results.revenueByCountryMonth,
    revenue_by_country_fy26: results.revenueByCountryFY26,
    revenue_by_program_fy26: results.revenueByProgram,
    ftbp_conversion_fy26: {
      v1: ftbpMap.v1 || null,
      v2: ftbpMap.v2 || null,
      combined: {
        registrations: (ftbpMap.v1 && ftbpMap.v1.registrations || 0) + (ftbpMap.v2 && ftbpMap.v2.registrations || 0),
        converted: (ftbpMap.v1 && ftbpMap.v1.converted || 0) + (ftbpMap.v2 && ftbpMap.v2.converted || 0)
      }
    },
    subscribers: {
      active_by_country: results.activeSubsByCountry,
      active_total: activeTotal,
      fy26_ytd: subsYTD,
      monthly_trend: results.subsTrend
    },
    roasters_top_fy26: results.roastersTop,
    sla: {
      fy26_by_country: results.slaByCountry,
      fy26_by_carrier: results.slaByCarrier,
      monthly_trend: results.slaTrend
    },
    cancellation_reasons_fy26: results.cancelReasons.map((r) => ({
      reason: r.reason, cancellations: r.cancellations
    }))
  };

  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('\nWrote ' + outputPath);
  console.log('FY26 revenue: $' + (snapshot.periods.FY26 && (snapshot.periods.FY26.revenue_aud / 1000000).toFixed(2) + 'M'));
  console.log('FY26 bags:    ' + (snapshot.periods.FY26 && snapshot.periods.FY26.bags.toLocaleString()));
}

function pctDiff(cur, prev) {
  if (!cur || !prev) return {};
  const pct = (a, b) => b ? Math.round(1000 * (a - b) / b) / 10 : 0;
  return {
    revenue_pct: pct(cur.revenue_aud, prev.revenue_aud),
    bags_pct: pct(cur.bags, prev.bags),
    orders_pct: pct(cur.orders, prev.orders),
    ftbp_revenue_pct: pct(cur.ftbp_revenue_aud, prev.ftbp_revenue_aud)
  };
}

function fyMonths(fy) {
  const startY = 2000 + fy - 1;
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = (6 + i) % 12;
    const y = m < 6 ? startY + 1 : startY;
    out.push(String(y) + '-' + String(m + 1).padStart(2, '0'));
  }
  return out;
}

build().catch((err) => {
  console.error('Refresh failed:', err.message);
  process.exit(1);
});
