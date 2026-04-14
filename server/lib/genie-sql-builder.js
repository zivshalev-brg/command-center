'use strict';

// ─── Genie SQL Builder ──────────────────────────────────────
// Generates validated SQL for the Beanz Databricks Genie Space.
// All revenue/volume queries enforce mandatory filters to prevent
// data inflation and incorrect results.

// ─── Constants ───────────────────────────────────────────────

const SCHEMA = 'ana_prd_gold.edw';

const TABLES = {
  order:        `${SCHEMA}.factbeanzorder`,
  exchangeRate: `${SCHEMA}.dimexchangerate`,
  store:        `${SCHEMA}.dimbeanzstore`,
  product:      `${SCHEMA}.dimbeanzproduct`,
  date:         `${SCHEMA}.dimdate`,
  subscription: `${SCHEMA}.dimbeanzsubscription`,
  factSub:      `${SCHEMA}.factbeanzsubscription`,
  ftbp:         `${SCHEMA}.factbeanzftbpprodregistration`,
  shipment:     `${SCHEMA}.factbeanzshipment`,
  mot:          `${SCHEMA}.factbeanzroastermotskudata`,
  motSummary:   `${SCHEMA}.factbeanzroastermotsummary`,
  cancelSurvey: `${SCHEMA}.factbeanzcancellationsurvey`
};

const MANDATORY_FILTERS = [
  "er.RateType = 'AUD-MonthEnd'",
  "o.OrderStatus != 'Cancelled'",
  'p.BeanzSkuFlag = 1'
];

const MARKET_MAP = {
  AU: 'Australia', UK: 'United Kingdom', US: 'United States',
  DE: 'Germany', NL: 'Netherlands'
};

// ─── Date Range Utility ──────────────────────────────────────

/**
 * Convert a period descriptor to { start, end } ISO date strings.
 * Supported: 'FY26', 'CY25', 'last-3-months', 'last-6-months',
 *            'last-12-months', 'YTD', 'FYTD', 'Q1-FY26', etc.
 * @param {string} period
 * @returns {{ start: string, end: string }}
 */
function dateRange(period) {
  if (!period || typeof period !== 'string') {
    throw new Error('period is required (e.g. "FY26", "CY25", "last-3-months")');
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Fiscal year: FY26 = 2025-07-01 to 2026-06-30
  const fyMatch = period.match(/^FY(\d{2})$/i);
  if (fyMatch) {
    const fy = parseInt(fyMatch[1], 10);
    const startYear = 2000 + fy - 1;
    return { start: `${startYear}-07-01`, end: `${2000 + fy}-06-30` };
  }

  // Calendar year: CY25 = 2025-01-01 to 2025-12-31
  const cyMatch = period.match(/^CY(\d{2})$/i);
  if (cyMatch) {
    const year = 2000 + parseInt(cyMatch[1], 10);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  // Fiscal quarter: Q1-FY26 (Q1 = Jul-Sep, Q2 = Oct-Dec, Q3 = Jan-Mar, Q4 = Apr-Jun)
  const fqMatch = period.match(/^Q([1-4])-FY(\d{2})$/i);
  if (fqMatch) {
    const q = parseInt(fqMatch[1], 10);
    const fy = parseInt(fqMatch[2], 10);
    const baseYear = 2000 + fy - 1;
    const quarterStarts = [
      { start: `${baseYear}-07-01`, end: `${baseYear}-09-30` },
      { start: `${baseYear}-10-01`, end: `${baseYear}-12-31` },
      { start: `${baseYear + 1}-01-01`, end: `${baseYear + 1}-03-31` },
      { start: `${baseYear + 1}-04-01`, end: `${baseYear + 1}-06-30` }
    ];
    return quarterStarts[q - 1];
  }

  // Relative periods
  const relMatch = period.match(/^last-(\d+)-months$/i);
  if (relMatch) {
    const months = parseInt(relMatch[1], 10);
    const start = new Date(now);
    start.setMonth(start.getMonth() - months);
    return { start: start.toISOString().slice(0, 10), end: todayStr };
  }

  // YTD (calendar year to date)
  if (period.toUpperCase() === 'YTD') {
    return { start: `${now.getFullYear()}-01-01`, end: todayStr };
  }

  // FYTD (fiscal year to date)
  if (period.toUpperCase() === 'FYTD') {
    const fyStart = now.getMonth() >= 6
      ? `${now.getFullYear()}-07-01`
      : `${now.getFullYear() - 1}-07-01`;
    return { start: fyStart, end: todayStr };
  }

  throw new Error(`Unrecognised period: "${period}". Use FY26, CY25, Q1-FY26, last-N-months, YTD, FYTD.`);
}

// ─── Granularity helpers ─────────────────────────────────────

function granularitySelect(granularity) {
  switch ((granularity || 'month').toLowerCase()) {
    case 'day':     return { select: 'd.PK_Date AS Period', group: 'd.PK_Date', order: 'd.PK_Date' };
    case 'week':    return { select: 'd.WeekStartDate AS Period', group: 'd.WeekStartDate', order: 'd.WeekStartDate' };
    case 'month':   return { select: 'd.Month_Name AS Period', group: 'd.Month_Name', order: 'MIN(d.PK_Date)' };
    case 'quarter': return { select: 'd.Quarter AS Period', group: 'd.Quarter', order: 'MIN(d.PK_Date)' };
    case 'year':    return { select: 'd.CalendarYear AS Period', group: 'd.CalendarYear', order: 'd.CalendarYear' };
    default:        return { select: 'd.Month_Name AS Period', group: 'd.Month_Name', order: 'MIN(d.PK_Date)' };
  }
}

// ─── Market filter ───────────────────────────────────────────

function marketJoin(market) {
  if (!market) return { join: '', where: '' };
  const name = MARKET_MAP[market.toUpperCase()] || market;
  return {
    join: `JOIN ${TABLES.store} s ON o.FK_Store = s.PK_Store`,
    where: `AND s.Country = '${name}'`
  };
}

// ─── SQL Validation ──────────────────────────────────────────

/**
 * Validate that mandatory filters are present in the SQL.
 * Returns { valid, missing } where missing is an array of filter strings.
 * @param {string} sql
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateSQL(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, missing: [...MANDATORY_FILTERS] };
  }

  const normalised = sql.replace(/\s+/g, ' ');
  const missing = MANDATORY_FILTERS.filter(f => !normalised.includes(f));
  return { valid: missing.length === 0, missing };
}

// ─── Query Builders ──────────────────────────────────────────

/**
 * Revenue query — SUM(SkuAmount * Rate) in AUD.
 * @param {Object} opts
 * @param {string} opts.period - e.g. 'FY26', 'CY25', 'last-3-months'
 * @param {string} [opts.granularity] - 'day'|'week'|'month'|'quarter'|'year'
 * @param {string} [opts.market] - country code: AU, UK, US, DE, NL
 * @param {string} [opts.program] - e.g. 'FTBP', 'Platinum'
 * @param {string} [opts.currency] - reserved for future multi-currency
 * @returns {string} SQL query
 */
function buildRevenueQuery({ period, granularity, market, program }) {
  const { start, end } = dateRange(period);
  const g = granularitySelect(granularity);
  const m = marketJoin(market);
  const programFilter = program
    ? `AND p.ProgramName = '${program}'`
    : '';

  const sql = [
    `SELECT ${g.select}, SUM(o.SkuAmount * er.Rate) AS Revenue`,
    `FROM ${TABLES.order} o`,
    `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
    `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
    `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
    m.join,
    `WHERE er.RateType = 'AUD-MonthEnd'`,
    `  AND o.OrderStatus != 'Cancelled'`,
    `  AND p.BeanzSkuFlag = 1`,
    `  AND d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
    m.where,
    programFilter,
    `GROUP BY ${g.group}`,
    `ORDER BY ${g.order}`
  ].filter(Boolean).join('\n');

  return sql;
}

/**
 * Volume query — bags and KG.
 * @param {Object} opts
 * @param {string} opts.period
 * @param {string} [opts.granularity]
 * @param {string} [opts.market]
 * @returns {string} SQL query
 */
function buildVolumeQuery({ period, granularity, market }) {
  const { start, end } = dateRange(period);
  const g = granularitySelect(granularity);
  const m = marketJoin(market);

  return [
    `SELECT ${g.select},`,
    `  SUM(o.Quantity) AS Bags,`,
    `  SUM(o.Quantity * p.WeightKG) AS KG`,
    `FROM ${TABLES.order} o`,
    `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
    `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
    `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
    m.join,
    `WHERE er.RateType = 'AUD-MonthEnd'`,
    `  AND o.OrderStatus != 'Cancelled'`,
    `  AND p.BeanzSkuFlag = 1`,
    `  AND d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
    m.where,
    `GROUP BY ${g.group}`,
    `ORDER BY ${g.order}`
  ].filter(Boolean).join('\n');
}

/**
 * Subscription query — active, new, or cancelled counts.
 * @param {Object} opts
 * @param {string} opts.period
 * @param {string} opts.type - 'active'|'new'|'cancelled'
 * @returns {string} SQL query
 */
function buildSubscriptionQuery({ period, type }) {
  const { start, end } = dateRange(period);
  const subType = (type || 'active').toLowerCase();

  if (subType === 'active') {
    return [
      `SELECT d.Month_Name AS Period, COUNT(DISTINCT sub.PK_Subscription) AS ActiveSubscriptions`,
      `FROM ${TABLES.factSub} fs`,
      `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
      `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `  AND fs.EventType = 'Active'`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  if (subType === 'new') {
    return [
      `SELECT d.Month_Name AS Period, COUNT(DISTINCT sub.PK_Subscription) AS NewSubscriptions`,
      `FROM ${TABLES.factSub} fs`,
      `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
      `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `  AND fs.EventType = 'Created'`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  if (subType === 'cancelled') {
    return [
      `SELECT d.Month_Name AS Period, COUNT(DISTINCT sub.PK_Subscription) AS Cancellations`,
      `FROM ${TABLES.factSub} fs`,
      `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
      `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `  AND fs.EventType = 'Cancelled'`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  throw new Error(`Unknown subscription type: "${type}". Use active, new, or cancelled.`);
}

/**
 * SLA query — delivery lead time metrics.
 * @param {Object} opts
 * @param {string} opts.period
 * @param {string} [opts.market]
 * @returns {string} SQL query
 */
function buildSLAQuery({ period, market }) {
  const { start, end } = dateRange(period);
  const marketFilter = market
    ? `AND ship.Country = '${MARKET_MAP[market.toUpperCase()] || market}'`
    : '';

  return [
    `SELECT d.Month_Name AS Period,`,
    `  AVG(ship.DeliveryLeadDays) AS AvgLeadDays,`,
    `  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ship.DeliveryLeadDays) AS P95LeadDays,`,
    `  COUNT(*) AS Shipments`,
    `FROM ${TABLES.shipment} ship`,
    `JOIN ${TABLES.date} d ON ship.FK_ShipDate = d.PK_Date`,
    `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
    marketFilter,
    `GROUP BY d.Month_Name`,
    `ORDER BY MIN(d.PK_Date)`
  ].filter(Boolean).join('\n');
}

/**
 * FTBP query — registrations or conversion metrics.
 * @param {Object} opts
 * @param {string} opts.period
 * @param {string} opts.metric - 'registrations'|'conversion'
 * @returns {string} SQL query
 */
function buildFTBPQuery({ period, metric }) {
  const { start, end } = dateRange(period);
  const m = (metric || 'registrations').toLowerCase();

  if (m === 'registrations') {
    return [
      `SELECT d.Month_Name AS Period, COUNT(*) AS Registrations`,
      `FROM ${TABLES.ftbp} ftbp`,
      `JOIN ${TABLES.date} d ON ftbp.FK_RegistrationDate = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  if (m === 'conversion') {
    return [
      `SELECT d.Month_Name AS Period,`,
      `  COUNT(*) AS Registrations,`,
      `  SUM(CASE WHEN ftbp.ConvertedToSubscription = 1 THEN 1 ELSE 0 END) AS Conversions,`,
      `  ROUND(100.0 * SUM(CASE WHEN ftbp.ConvertedToSubscription = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS ConversionPct`,
      `FROM ${TABLES.ftbp} ftbp`,
      `JOIN ${TABLES.date} d ON ftbp.FK_RegistrationDate = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  throw new Error(`Unknown FTBP metric: "${metric}". Use registrations or conversion.`);
}

/**
 * Roaster query — MOT data or revenue by roaster.
 * @param {Object} opts
 * @param {string} opts.period
 * @param {string} opts.metric - 'mot'|'revenue'
 * @returns {string} SQL query
 */
function buildRoasterQuery({ period, metric }) {
  const { start, end } = dateRange(period);
  const m = (metric || 'revenue').toLowerCase();

  if (m === 'mot') {
    return [
      `SELECT mots.RoasterName,`,
      `  SUM(mots.TotalOrders) AS Orders,`,
      `  SUM(mots.TotalRevenue) AS Revenue,`,
      `  AVG(mots.AvgOrderValue) AS AvgOrderValue`,
      `FROM ${TABLES.motSummary} mots`,
      `JOIN ${TABLES.date} d ON mots.FK_Date = d.PK_Date`,
      `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `GROUP BY mots.RoasterName`,
      `ORDER BY SUM(mots.TotalRevenue) DESC`
    ].join('\n');
  }

  if (m === 'revenue') {
    return [
      `SELECT d.Month_Name AS Period, mot.RoasterName,`,
      `  SUM(o.SkuAmount * er.Rate) AS Revenue`,
      `FROM ${TABLES.order} o`,
      `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
      `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
      `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
      `JOIN ${TABLES.mot} mot ON o.FK_Product = mot.FK_Product AND o.FK_OrderDate = mot.FK_Date`,
      `WHERE er.RateType = 'AUD-MonthEnd'`,
      `  AND o.OrderStatus != 'Cancelled'`,
      `  AND p.BeanzSkuFlag = 1`,
      `  AND d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
      `GROUP BY d.Month_Name, mot.RoasterName`,
      `ORDER BY MIN(d.PK_Date), SUM(o.SkuAmount * er.Rate) DESC`
    ].join('\n');
  }

  throw new Error(`Unknown roaster metric: "${metric}". Use mot or revenue.`);
}

/**
 * Cohort retention query.
 * @param {Object} opts
 * @param {string} opts.period
 * @returns {string} SQL query
 */
function buildCohortQuery({ period }) {
  const { start, end } = dateRange(period);

  return [
    `SELECT sub.CohortMonth,`,
    `  fs.MonthsSinceCreation,`,
    `  COUNT(DISTINCT CASE WHEN fs.EventType = 'Active' THEN sub.PK_Subscription END) AS ActiveSubs,`,
    `  COUNT(DISTINCT sub.PK_Subscription) AS CohortSize,`,
    `  ROUND(100.0 * COUNT(DISTINCT CASE WHEN fs.EventType = 'Active' THEN sub.PK_Subscription END) / NULLIF(COUNT(DISTINCT sub.PK_Subscription), 0), 2) AS RetentionPct`,
    `FROM ${TABLES.factSub} fs`,
    `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
    `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
    `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
    `GROUP BY sub.CohortMonth, fs.MonthsSinceCreation`,
    `ORDER BY sub.CohortMonth, fs.MonthsSinceCreation`
  ].join('\n');
}

/**
 * Period-over-period comparison query.
 * @param {Object} opts
 * @param {string} opts.metric - 'revenue'|'volume'|'subscriptions'
 * @param {string} opts.period1 - e.g. 'FY25'
 * @param {string} opts.period2 - e.g. 'FY26'
 * @param {string} [opts.granularity]
 * @returns {string} SQL query
 */
function buildComparisonQuery({ metric, period1, period2, granularity }) {
  const r1 = dateRange(period1);
  const r2 = dateRange(period2);
  const g = granularitySelect(granularity);
  const m = (metric || 'revenue').toLowerCase();

  if (m === 'revenue') {
    return [
      `SELECT ${g.select},`,
      `  SUM(CASE WHEN d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}' THEN o.SkuAmount * er.Rate ELSE 0 END) AS Revenue_P1,`,
      `  SUM(CASE WHEN d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}' THEN o.SkuAmount * er.Rate ELSE 0 END) AS Revenue_P2`,
      `FROM ${TABLES.order} o`,
      `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
      `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
      `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
      `WHERE er.RateType = 'AUD-MonthEnd'`,
      `  AND o.OrderStatus != 'Cancelled'`,
      `  AND p.BeanzSkuFlag = 1`,
      `  AND ((d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}')`,
      `       OR (d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}'))`,
      `GROUP BY ${g.group}`,
      `ORDER BY ${g.order}`
    ].join('\n');
  }

  if (m === 'volume') {
    return [
      `SELECT ${g.select},`,
      `  SUM(CASE WHEN d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}' THEN o.Quantity ELSE 0 END) AS Bags_P1,`,
      `  SUM(CASE WHEN d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}' THEN o.Quantity ELSE 0 END) AS Bags_P2`,
      `FROM ${TABLES.order} o`,
      `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
      `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
      `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
      `WHERE er.RateType = 'AUD-MonthEnd'`,
      `  AND o.OrderStatus != 'Cancelled'`,
      `  AND p.BeanzSkuFlag = 1`,
      `  AND ((d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}')`,
      `       OR (d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}'))`,
      `GROUP BY ${g.group}`,
      `ORDER BY ${g.order}`
    ].join('\n');
  }

  if (m === 'subscriptions') {
    return [
      `SELECT d.Month_Name AS Period,`,
      `  COUNT(DISTINCT CASE WHEN d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}' THEN sub.PK_Subscription END) AS Subs_P1,`,
      `  COUNT(DISTINCT CASE WHEN d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}' THEN sub.PK_Subscription END) AS Subs_P2`,
      `FROM ${TABLES.factSub} fs`,
      `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
      `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
      `WHERE fs.EventType = 'Active'`,
      `  AND ((d.PK_Date >= '${r1.start}' AND d.PK_Date < '${r1.end}')`,
      `       OR (d.PK_Date >= '${r2.start}' AND d.PK_Date < '${r2.end}'))`,
      `GROUP BY d.Month_Name`,
      `ORDER BY MIN(d.PK_Date)`
    ].join('\n');
  }

  throw new Error(`Unknown comparison metric: "${metric}". Use revenue, volume, or subscriptions.`);
}

/**
 * Build a bundle of KPI queries for dashboard cards.
 * @param {Object} opts
 * @param {string} opts.period - e.g. 'FYTD'
 * @returns {Array<{ key: string, sql: string, format: string }>}
 */
function buildKPIBundle({ period }) {
  const { start, end } = dateRange(period);

  return [
    {
      key: 'total_revenue',
      sql: [
        `SELECT SUM(o.SkuAmount * er.Rate) AS Value`,
        `FROM ${TABLES.order} o`,
        `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
        `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
        `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
        `WHERE er.RateType = 'AUD-MonthEnd'`,
        `  AND o.OrderStatus != 'Cancelled'`,
        `  AND p.BeanzSkuFlag = 1`,
        `  AND d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`
      ].join('\n'),
      format: 'currency'
    },
    {
      key: 'total_bags',
      sql: [
        `SELECT SUM(o.Quantity) AS Value`,
        `FROM ${TABLES.order} o`,
        `JOIN ${TABLES.exchangeRate} er ON o.FK_ExchangeRate = er.PK_ExchangeRate`,
        `JOIN ${TABLES.date} d ON o.FK_OrderDate = d.PK_Date`,
        `JOIN ${TABLES.product} p ON o.FK_Product = p.PK_Product`,
        `WHERE er.RateType = 'AUD-MonthEnd'`,
        `  AND o.OrderStatus != 'Cancelled'`,
        `  AND p.BeanzSkuFlag = 1`,
        `  AND d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`
      ].join('\n'),
      format: 'number'
    },
    {
      key: 'active_subscriptions',
      sql: [
        `SELECT COUNT(DISTINCT sub.PK_Subscription) AS Value`,
        `FROM ${TABLES.factSub} fs`,
        `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
        `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
        `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
        `  AND fs.EventType = 'Active'`
      ].join('\n'),
      format: 'number'
    },
    {
      key: 'cancellations',
      sql: [
        `SELECT COUNT(DISTINCT sub.PK_Subscription) AS Value`,
        `FROM ${TABLES.factSub} fs`,
        `JOIN ${TABLES.subscription} sub ON fs.FK_Subscription = sub.PK_Subscription`,
        `JOIN ${TABLES.date} d ON fs.FK_Date = d.PK_Date`,
        `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`,
        `  AND fs.EventType = 'Cancelled'`
      ].join('\n'),
      format: 'number'
    },
    {
      key: 'ftbp_registrations',
      sql: [
        `SELECT COUNT(*) AS Value`,
        `FROM ${TABLES.ftbp} ftbp`,
        `JOIN ${TABLES.date} d ON ftbp.FK_RegistrationDate = d.PK_Date`,
        `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`
      ].join('\n'),
      format: 'number'
    },
    {
      key: 'avg_delivery_days',
      sql: [
        `SELECT ROUND(AVG(ship.DeliveryLeadDays), 1) AS Value`,
        `FROM ${TABLES.shipment} ship`,
        `JOIN ${TABLES.date} d ON ship.FK_ShipDate = d.PK_Date`,
        `WHERE d.PK_Date >= '${start}' AND d.PK_Date < '${end}'`
      ].join('\n'),
      format: 'decimal'
    }
  ];
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  buildRevenueQuery,
  buildVolumeQuery,
  buildSubscriptionQuery,
  buildSLAQuery,
  buildFTBPQuery,
  buildRoasterQuery,
  buildCohortQuery,
  buildComparisonQuery,
  buildKPIBundle,
  dateRange,
  validateSQL,
  // Exposed for testing
  TABLES,
  MANDATORY_FILTERS
};
