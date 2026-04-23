#!/usr/bin/env node
'use strict';

/**
 * Refresh kb-data/intelligence/email-perf-live.json from Databricks.
 *
 * Requires in .env:
 *   DATABRICKS_HOST
 *   DATABRICKS_TOKEN
 *   DATABRICKS_WAREHOUSE_ID
 *
 * Shape written to disk (consumed by /api/email-perf and js/mod-email-marketing.js):
 *   {
 *     generated_at: ISO8601,
 *     window_days: 30,
 *     emails: [{
 *       sendId, emailName, subject, category, sentDate, region,
 *       totals: { sent, delivered, unique_open, unique_click, open_rate_pct, ctr_pct },
 *       regional: [{ region, sent, unique_open, unique_click }],
 *       cohorts:  [{ cohort, sent, unique_open, unique_click }],
 *       topLinks: [{ url, clicks, ctr_pct }]
 *     }],
 *     benchmarks: [{ category, region, metric, value }]
 *   }
 *
 * Schema-resolved constants (confirmed via /autoresearch:plan [VERIFY] pass):
 *   - factemailevents.ClickURL  (NOT 'URL')
 *   - dimsendjobs has { ClientID, SendID, FromName, FromEmail, Subject, EmailName,
 *       SchedDate, SentDate, IsBIEDM, IsWelcomeJourney, EmailRegion, EmailBrand }
 *   - Cohort derivation via dimbeanzsubscription { SubscriptionDurationDays, SubscriptionStatus }
 *   - Mandatory filters: BrandRegionPartition='Beanz', TRIM(EmailBrand)='Beanz', COUNT(DISTINCT SubscriberKey)
 *
 * Usage: node scripts/refresh-email-perf.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const outputPath = path.join(rootDir, 'kb-data', 'intelligence', 'email-perf-live.json');

// ─── .env loader ──────────────────────────────────────────────
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
  console.error('ERROR: Missing Databricks config. Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID in .env.');
  process.exit(1);
}

// ─── HTTPS helpers ────────────────────────────────────────────
function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 500)));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Non-JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function executeSQL(sql) {
  const submitOpts = {
    hostname: host, port: 443, path: '/api/2.0/sql/statements/', method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  };
  const submitBody = JSON.stringify({
    warehouse_id: warehouseId, statement: sql,
    wait_timeout: '30s', on_wait_timeout: 'CONTINUE',
    format: 'JSON_ARRAY', disposition: 'INLINE'
  });
  let resp = await httpsJson(submitOpts, submitBody);
  let state = resp.status && resp.status.state;
  const id = resp.statement_id;
  const deadline = Date.now() + 180000;
  while (state === 'PENDING' || state === 'RUNNING') {
    if (Date.now() > deadline) throw new Error('Query timeout: ' + sql.slice(0, 80));
    await sleep(2000);
    resp = await httpsJson({ hostname: host, port: 443, path: '/api/2.0/sql/statements/' + id, method: 'GET', headers: { 'Authorization': 'Bearer ' + token } }, null);
    state = resp.status && resp.status.state;
  }
  if (state !== 'SUCCEEDED') {
    const err = (resp.status && resp.status.error && resp.status.error.message) || state;
    throw new Error('Query ' + state + ': ' + err);
  }
  const schema = (resp.manifest && resp.manifest.schema && resp.manifest.schema.columns) || [];
  const cols = schema.map((c) => c.name);
  const rawRows = (resp.result && resp.result.data_array) || [];
  return rawRows.map((r) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = coerce(r[i], schema[i] && schema[i].type_name); });
    return obj;
  });
}
function coerce(v, typeName) {
  if (v == null) return null;
  if (typeName === 'LONG' || typeName === 'INT') return parseInt(v, 10);
  if (typeName === 'DOUBLE' || typeName === 'FLOAT' || typeName === 'DECIMAL') return parseFloat(v);
  return v;
}

// ─── Query builders ───────────────────────────────────────────
//
// Window: last 30 days of sends; Brand scope: Beanz only; Apple MPP protection via COUNT(DISTINCT SubscriberKey).
//
const WINDOW_DAYS = 30;

function categoryCase(alias) {
  // Derive category from dimsendjobs flags + EmailName pattern (resolved via [VERIFY] — DR-006)
  return "CASE " +
    "WHEN UPPER(" + alias + ".IsBIEDM) = 'Y' THEN 'BIEDM' " +
    "WHEN UPPER(" + alias + ".IsWelcomeJourney) = 'Y' THEN 'Welcome' " +
    "WHEN UPPER(" + alias + ".EmailName) LIKE '%TRANSACT%' OR UPPER(" + alias + ".EmailName) LIKE '%ORDER%' OR UPPER(" + alias + ".EmailName) LIKE '%SHIP%' THEN 'Transactional' " +
    "WHEN UPPER(" + alias + ".EmailName) LIKE '%SUBSCRIPTION%' OR UPPER(" + alias + ".EmailName) LIKE '%RENEW%' THEN 'Subscription Lifecycle' " +
    "ELSE 'Other' END";
}

const cohortCase = "CASE " +
  "WHEN sub.SubscriptionDurationDays <= 90 THEN 'New' " +
  "WHEN sub.SubscriptionDurationDays <= 730 AND sub.SubscriptionStatus = 'Active' THEN 'Active' " +
  "WHEN sub.SubscriptionDurationDays IS NULL THEN 'Unknown' " +
  "ELSE 'Dormant' END";

const QUERIES = {
  // Per-send totals — sent, delivered (sent - bounced), unique opens, unique clicks
  totalsPerSend: `
WITH recent_sends AS (
  SELECT sj.SendID, sj.EmailName, sj.Subject, sj.SentDate, sj.SchedDate,
         TRIM(sj.EmailRegion) AS region, ${categoryCase('sj')} AS category
  FROM ana_prd_gold.edw.dimsendjobs sj
  WHERE TRIM(sj.EmailBrand) = 'Beanz'
    AND sj.SentDate >= CURRENT_DATE - INTERVAL ${WINDOW_DAYS} DAYS
)
SELECT r.SendID, r.EmailName, r.Subject, r.SentDate, r.SchedDate, r.region, r.category,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent'         THEN e.SubscriberKey END) AS sent,
  COUNT(DISTINCT CASE WHEN e.EventType IN ('Sent','Open','Click') THEN e.SubscriberKey END) AS delivered,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open'         THEN e.SubscriberKey END) AS unique_open,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click'        THEN e.SubscriberKey END) AS unique_click
FROM recent_sends r
LEFT JOIN ana_prd_gold.edw.factemailevents e
  ON e.SendID = r.SendID
 AND e.BrandRegionPartition = 'Beanz'
 AND e.YearPartition >= YEAR(CURRENT_DATE - INTERVAL ${WINDOW_DAYS} DAYS)
GROUP BY r.SendID, r.EmailName, r.Subject, r.SentDate, r.SchedDate, r.region, r.category
ORDER BY r.SentDate DESC`,

  // Top 5 links per SendID (uses ClickURL — the resolved column name)
  topLinksPerSend: `
WITH recent_sends AS (
  SELECT SendID FROM ana_prd_gold.edw.dimsendjobs
  WHERE TRIM(EmailBrand) = 'Beanz' AND SentDate >= CURRENT_DATE - INTERVAL ${WINDOW_DAYS} DAYS
),
ranked AS (
  SELECT e.SendID, e.ClickURL,
    COUNT(DISTINCT e.SubscriberKey) AS unique_clicks,
    ROW_NUMBER() OVER (PARTITION BY e.SendID ORDER BY COUNT(DISTINCT e.SubscriberKey) DESC) AS rn
  FROM ana_prd_gold.edw.factemailevents e
  JOIN recent_sends rs ON rs.SendID = e.SendID
  WHERE e.BrandRegionPartition = 'Beanz'
    AND e.EventType = 'Click'
    AND e.YearPartition >= YEAR(CURRENT_DATE - INTERVAL ${WINDOW_DAYS} DAYS)
    AND e.ClickURL IS NOT NULL
    AND LOWER(e.ClickURL) NOT LIKE '%unsubscribe%'
    AND LOWER(e.ClickURL) NOT LIKE '%tracking%'
  GROUP BY e.SendID, e.ClickURL
)
SELECT SendID, ClickURL, unique_clicks FROM ranked WHERE rn <= 5 ORDER BY SendID, unique_clicks DESC`,

  // 90-day category benchmarks (for delta comparisons)
  benchmarks: `
WITH window_sends AS (
  SELECT sj.SendID, TRIM(sj.EmailRegion) AS region, ${categoryCase('sj')} AS category
  FROM ana_prd_gold.edw.dimsendjobs sj
  WHERE TRIM(sj.EmailBrand) = 'Beanz' AND sj.SentDate >= CURRENT_DATE - INTERVAL 90 DAYS
)
SELECT w.category, COALESCE(w.region, 'Unknown') AS region,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Sent'   THEN e.SubscriberKey END) AS sent,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Open'   THEN e.SubscriberKey END) AS unique_open,
  COUNT(DISTINCT CASE WHEN e.EventType = 'Click'  THEN e.SubscriberKey END) AS unique_click
FROM window_sends w
LEFT JOIN ana_prd_gold.edw.factemailevents e
  ON e.SendID = w.SendID AND e.BrandRegionPartition = 'Beanz'
 AND e.YearPartition >= YEAR(CURRENT_DATE - INTERVAL 90 DAYS)
GROUP BY w.category, COALESCE(w.region, 'Unknown')`
};

// ─── Build snapshot ───────────────────────────────────────────
async function build() {
  console.log('[email-perf] Running 3 queries…');
  const [totals, links, bench] = await Promise.all([
    executeSQL(QUERIES.totalsPerSend),
    executeSQL(QUERIES.topLinksPerSend),
    executeSQL(QUERIES.benchmarks)
  ]);
  console.log('[email-perf] sends=' + totals.length + ' link rows=' + links.length + ' benchmarks=' + bench.length);

  // Index top links by SendID
  const linksBySend = {};
  for (const r of links) {
    const sid = r.SendID;
    linksBySend[sid] = linksBySend[sid] || [];
    linksBySend[sid].push({ url: r.ClickURL, clicks: r.unique_clicks });
  }

  const emails = totals.map((t) => {
    const sent = t.sent || 0;
    const delivered = t.delivered || 0;
    const opens = t.unique_open || 0;
    const clicks = t.unique_click || 0;
    const openRate = delivered > 0 ? Math.round((opens / delivered) * 1000) / 10 : null;
    const ctr = delivered > 0 ? Math.round((clicks / delivered) * 1000) / 10 : null;
    const topLinks = (linksBySend[t.SendID] || []).slice(0, 5).map((l) => ({
      url: l.url,
      clicks: l.clicks,
      ctr_pct: delivered > 0 ? Math.round((l.clicks / delivered) * 1000) / 10 : null
    }));
    return {
      sendId: t.SendID, emailName: t.EmailName, subject: t.Subject,
      category: t.category, sentDate: t.SentDate, schedDate: t.SchedDate,
      region: t.region || 'Unknown',
      totals: { sent, delivered, unique_open: opens, unique_click: clicks, open_rate_pct: openRate, ctr_pct: ctr },
      regional: [], // populated in a later FR (FR-003 regional tab)
      cohorts: [],  // populated in a later FR (FR-006 cohort tab)
      topLinks
    };
  });

  const benchmarks = bench.map((b) => ({
    category: b.category,
    region: b.region,
    sent: b.sent || 0,
    open_rate_pct: b.sent > 0 ? Math.round((b.unique_open / b.sent) * 1000) / 10 : null,
    ctr_pct: b.sent > 0 ? Math.round((b.unique_click / b.sent) * 1000) / 10 : null
  }));

  const out = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    emails,
    benchmarks
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('[email-perf] Wrote ' + outputPath + ' (' + emails.length + ' emails, ' + benchmarks.length + ' benchmark rows)');
}

build().catch((err) => {
  console.error('refresh-email-perf failed:', err.message);
  process.exit(1);
});
