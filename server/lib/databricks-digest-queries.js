'use strict';

/**
 * Period-aware digest queries. Every function takes a resolved `period`
 * object (from period-spec.js) and returns a validated SQL statement.
 *
 * All queries:
 *   - Use factbeanzorder with the four mandatory filters (RateType, cancelled,
 *     BeanzSkuFlag, exchange rate join)
 *   - Return three windows in one shot where practical: current / previous / yoy
 *   - Are idempotent and cacheable by SHA-256 of SQL text
 *
 * Naming: sql<Slice>(period [, opts]) — returns a string.
 */

const { dateFormatForGranularity, truncUnitForGranularity } = require('./period-spec');

const SCHEMA = 'ana_prd_gold.edw';
const T = {
  order:        `${SCHEMA}.factbeanzorder`,
  subDim:       `${SCHEMA}.dimbeanzsubscription`,
  subFact:      `${SCHEMA}.factbeanzsubscription`,
  product:      `${SCHEMA}.dimbeanzproduct`,
  store:        `${SCHEMA}.dimbeanzstore`,
  rate:         `${SCHEMA}.dimexchangerate`,
  promo:        `${SCHEMA}.dimbeanzpromotion`,
  ftbp:         `${SCHEMA}.factbeanzftbpprodregistration`,
  shipment:     `${SCHEMA}.factbeanzshipment`,
  cancelSurvey: `${SCHEMA}.factbeanzcancellationsurvey`,
  motSummary:   `${SCHEMA}.factbeanzroastermotsummary`
};

// ─── Common fragments ────────────────────────────────────────
const ORDER_FILTERS = `
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  WHERE e.RateType = 'AUD-MonthEnd'
    AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1`;

function windowsCTE(period) {
  const c = period.current, p = period.previous, y = period.yoy;
  return `WITH windows AS (
  SELECT 'current'  AS win, DATE '${c.start}' AS s, DATE '${c.end}' AS e UNION ALL
  SELECT 'previous',        DATE '${p.start}',       DATE '${p.end}'        UNION ALL
  SELECT 'yoy',             DATE '${y.start}',       DATE '${y.end}'
)`;
}

// ─── 1. Headline KPIs (curr / prev / yoy in one row) ─────────
function sqlHeadline(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  ROUND(SUM(f.SkuAmount), 0)          AS revenue,
  SUM(f.Quantity)                     AS bags,
  ROUND(SUM(f.Quantity_by_KG), 0)     AS kg,
  COUNT(DISTINCT f.OrderNumber)       AS orders,
  COUNT(DISTINCT f.CustomerEmail)     AS customers,
  ROUND(SUM(f.SkuAmount) / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS aov,
  ROUND(SUM(f.Quantity) * 1.0 / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS bags_per_order,
  SUM(CASE WHEN f.ftbp_Flag > 0 THEN f.SkuAmount ELSE 0 END) AS ftbp_revenue,
  SUM(CASE WHEN f.FirstOrder_Flg = 1 THEN f.SkuAmount ELSE 0 END) AS first_order_revenue,
  COUNT(DISTINCT CASE WHEN f.FirstOrder_Flg = 1 THEN f.OrderNumber END) AS first_orders
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY w.win
`.trim();
}

// ─── 2. Time series (binned by granularity) ──────────────────
function sqlTimeSeries(period) {
  const fmt = dateFormatForGranularity(period.granularity);
  const trunc = truncUnitForGranularity(period.granularity);
  return `
SELECT
  DATE_FORMAT(DATE_TRUNC('${trunc}', f.OrderDate), '${fmt}') AS bucket,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 0) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  COUNT(DISTINCT f.CustomerEmail) AS customers
FROM ${T.order} f
${ORDER_FILTERS}
  AND f.OrderDate >= DATE '${period.current.start}'
  AND f.OrderDate < DATE '${period.current.end}'
GROUP BY DATE_FORMAT(DATE_TRUNC('${trunc}', f.OrderDate), '${fmt}')
ORDER BY bucket
`.trim();
}

// ─── 3. Segment mix (bag-size / price band) ──────────────────
function sqlSegmentMix(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  CASE
    WHEN f.Quantity_by_KG / NULLIF(f.Quantity, 0) < 0.27 THEN '250g'
    WHEN f.Quantity_by_KG / NULLIF(f.Quantity, 0) < 0.34 THEN '300g'
    WHEN f.Quantity_by_KG / NULLIF(f.Quantity, 0) < 0.42 THEN '340-400g'
    ELSE '454g+ (1lb+)'
  END AS bag_size,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  ROUND(AVG(f.Average_Selling_Price), 2) AS avg_price
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.Quantity > 0 AND f.Quantity_by_KG IS NOT NULL
GROUP BY w.win, bag_size
ORDER BY w.win, bags DESC
`.trim();
}

// ─── 4. AOV decomposition (by market + program) ──────────────
function sqlAOVDecomp(period) {
  return `
SELECT
  s.Country,
  CASE
    WHEN f.ftbp_Flag = 2 THEN 'FTBP v2'
    WHEN f.ftbp_Flag = 1 THEN 'FTBP v1'
    WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType <> '' THEN 'Subscription'
    ELSE 'One-off'
  END AS program,
  ROUND(SUM(f.SkuAmount) / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS aov,
  ROUND(SUM(f.Quantity) * 1.0 / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS bags_per_order,
  ROUND(AVG(f.Average_Selling_Price), 2) AS avg_price,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  ROUND(SUM(f.SkuAmount), 0) AS revenue
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.store} s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE '${period.current.start}'
  AND f.OrderDate < DATE '${period.current.end}'
GROUP BY s.Country, program
HAVING orders >= 10
ORDER BY revenue DESC
`.trim();
}

// ─── 5. Program mix (curr / prev / yoy) ──────────────────────
function sqlProgramMix(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  CASE
    WHEN f.ftbp_Flag = 2 THEN 'FTBP v2'
    WHEN f.ftbp_Flag = 1 THEN 'FTBP v1'
    WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType <> '' THEN 'Subscription'
    ELSE 'One-off'
  END AS program,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  COUNT(DISTINCT f.CustomerEmail) AS customers
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY w.win, program
ORDER BY w.win, revenue DESC
`.trim();
}

// ─── 6. Market mix with key metrics × deltas ─────────────────
function sqlMarketMix(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  s.Country,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.Quantity_by_KG), 0) AS kg,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  COUNT(DISTINCT f.CustomerEmail) AS customers,
  ROUND(SUM(f.SkuAmount) / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS aov
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.store} s ON f.StoreCode = s.StoreCode
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY w.win, s.Country
ORDER BY w.win, revenue DESC
`.trim();
}

// ─── 7. Roaster tiers + mover deltas ─────────────────────────
function sqlRoasterTiers(period, topN) {
  const n = Math.min(Math.max(parseInt(topN, 10) || 25, 5), 50);
  return `
${windowsCTE(period)}
, totals AS (
  SELECT
    w.win,
    COALESCE(p.VendorName, '(unknown)') AS roaster,
    ROUND(SUM(f.SkuAmount), 0) AS revenue,
    SUM(f.Quantity) AS bags,
    ROUND(SUM(f.Quantity_by_KG), 0) AS kg,
    COUNT(DISTINCT f.OrderNumber) AS orders
  FROM ${T.order} f
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  LEFT JOIN ${T.product} p ON f.ProductCodeKey = p.ProductCodeKey
  INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
  WHERE e.RateType = 'AUD-MonthEnd'
    AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1
  GROUP BY w.win, p.VendorName
)
SELECT *,
  ROW_NUMBER() OVER (PARTITION BY win ORDER BY revenue DESC) AS rn
FROM totals
QUALIFY rn <= ${n}
ORDER BY win, revenue DESC
`.trim();
}

// ─── 8. MOT achievement (roaster MOT target vs actual) ───────
function sqlMOTAchievement(period) {
  // factbeanzroastermotsummary has WEEKLY granularity via Week_Start_Date
  return `
SELECT
  VENDOR_NAME AS roaster,
  WEB_STORE AS market,
  Tier,
  SUM(MOT_QTY) AS total_mot_qty,
  COUNT(DISTINCT Week_Start_Date) AS weeks_covered
FROM ${T.motSummary}
WHERE Week_Start_Date >= DATE '${period.current.start}'
  AND Week_Start_Date < DATE '${period.current.end}'
GROUP BY VENDOR_NAME, WEB_STORE, Tier
HAVING total_mot_qty > 0
ORDER BY total_mot_qty DESC
LIMIT 200
`.trim();
}

// ─── 9. Subscriber lifecycle (events within period) ──────────
function sqlSubscriberLifecycle(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  COUNT(DISTINCT CASE WHEN lower(fs.EventName) LIKE '%created%' THEN fs.SubscriptionID END) AS new_subs,
  COUNT(DISTINCT CASE WHEN lower(fs.EventName) LIKE '%cancel%'  THEN fs.SubscriptionID END) AS cancelled,
  COUNT(DISTINCT CASE WHEN lower(fs.EventName) LIKE '%pause%'   THEN fs.SubscriptionID END) AS paused,
  COUNT(DISTINCT CASE WHEN lower(fs.EventName) LIKE '%resume%'  THEN fs.SubscriptionID END) AS resumed
FROM ${T.subFact} fs
INNER JOIN windows w ON fs.EventDate >= w.s AND fs.EventDate < w.e
WHERE fs.BeanzSkuFlag = 1
GROUP BY w.win
`.trim();
}

// ─── 10. Cohort retention heat-map (monthly cohorts) ─────────
function sqlCohortRetention(period, cohortMonths) {
  const n = Math.min(Math.max(parseInt(cohortMonths, 10) || 12, 3), 24);
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
    SUM(CASE WHEN SubscriptionDurationMonth >= 6 THEN 1 ELSE 0 END) AS m6,
    SUM(CASE WHEN SubscriptionDurationMonth >= 9 THEN 1 ELSE 0 END) AS m9,
    SUM(CASE WHEN SubscriptionDurationMonth >= 12 THEN 1 ELSE 0 END) AS m12
  FROM ${T.subDim}
  WHERE BeanzSkuFlag = 1
    AND SubscriptionCreationDate >= DATEADD(MONTH, -${n}, DATE '${period.current.end}')
    AND SubscriptionCreationDate < DATE '${period.current.end}'
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
  ROUND(100.0 * m6 / NULLIF(cohort_size, 0), 1) AS m6_pct,
  ROUND(100.0 * m9 / NULLIF(cohort_size, 0), 1) AS m9_pct,
  ROUND(100.0 * m12 / NULLIF(cohort_size, 0), 1) AS m12_pct
FROM cohorts
ORDER BY CohortMonth DESC
LIMIT ${n}
`.trim();
}

// ─── 11. NRR (Net Revenue Retention) ─────────────────────────
function sqlNRR(period) {
  // NRR = revenue from customers who existed in prior period, measured in current period / prior revenue
  // Cohort = CustomerEmail active (any order) in prior window
  return `
WITH prior_customers AS (
  SELECT DISTINCT CustomerEmail, ROUND(SUM(f.SkuAmount), 0) AS prior_revenue
  FROM ${T.order} f
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  WHERE e.RateType = 'AUD-MonthEnd'
    AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1
    AND f.OrderDate >= DATE '${period.previous.start}'
    AND f.OrderDate < DATE '${period.previous.end}'
    AND f.CustomerEmail IS NOT NULL
  GROUP BY f.CustomerEmail
),
current_revenue AS (
  SELECT f.CustomerEmail, ROUND(SUM(f.SkuAmount), 0) AS current_revenue
  FROM ${T.order} f
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  WHERE e.RateType = 'AUD-MonthEnd'
    AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1
    AND f.OrderDate >= DATE '${period.current.start}'
    AND f.OrderDate < DATE '${period.current.end}'
    AND f.CustomerEmail IS NOT NULL
  GROUP BY f.CustomerEmail
)
SELECT
  COUNT(DISTINCT p.CustomerEmail) AS prior_cohort_size,
  SUM(p.prior_revenue) AS prior_cohort_revenue,
  COUNT(DISTINCT CASE WHEN c.CustomerEmail IS NOT NULL THEN p.CustomerEmail END) AS retained_customers,
  SUM(CASE WHEN c.CustomerEmail IS NOT NULL THEN c.current_revenue ELSE 0 END) AS retained_revenue,
  ROUND(100.0 * SUM(CASE WHEN c.CustomerEmail IS NOT NULL THEN c.current_revenue ELSE 0 END)
        / NULLIF(SUM(p.prior_revenue), 0), 1) AS nrr_pct,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN c.CustomerEmail IS NOT NULL THEN p.CustomerEmail END)
        / NULLIF(COUNT(DISTINCT p.CustomerEmail), 0), 1) AS customer_retention_pct
FROM prior_customers p
LEFT JOIN current_revenue c ON p.CustomerEmail = c.CustomerEmail
`.trim();
}

// ─── 12. Repeat purchase distribution ────────────────────────
function sqlRepeatPurchase(period) {
  return `
WITH customer_orders AS (
  SELECT
    f.CustomerEmail,
    COUNT(DISTINCT f.OrderNumber) AS order_count
  FROM ${T.order} f
  INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
  WHERE e.RateType = 'AUD-MonthEnd'
    AND lower(f.OrderStatus) <> 'cancelled'
    AND f.BeanzSkuFlag = 1
    AND f.OrderDate >= DATE '${period.current.start}'
    AND f.OrderDate < DATE '${period.current.end}'
    AND f.CustomerEmail IS NOT NULL
  GROUP BY f.CustomerEmail
)
SELECT
  CASE
    WHEN order_count = 1 THEN '1 order'
    WHEN order_count = 2 THEN '2 orders'
    WHEN order_count = 3 THEN '3 orders'
    WHEN order_count BETWEEN 4 AND 5 THEN '4-5 orders'
    WHEN order_count BETWEEN 6 AND 10 THEN '6-10 orders'
    ELSE '11+ orders'
  END AS bucket,
  COUNT(*) AS customers,
  SUM(order_count) AS total_orders
FROM customer_orders
GROUP BY bucket
ORDER BY MIN(order_count)
`.trim();
}

// ─── 13. Reactivation (cancelled → new sub within window) ────
function sqlReactivation(period) {
  return `
SELECT
  COUNT(DISTINCT CASE
    WHEN fs_new.EventDate >= DATE '${period.current.start}'
     AND fs_new.EventDate < DATE '${period.current.end}'
     AND fs_new.SubscriptionID NOT IN (SELECT SubscriptionID FROM ${T.subFact} WHERE EventName LIKE '%Created%' AND EventDate < DATE '${period.current.start}')
    THEN fs_new.CustomerEmail
  END) AS new_customer_subs,
  COUNT(DISTINCT CASE
    WHEN fs_new.CustomerEmail IN (
      SELECT CustomerEmail FROM ${T.subFact}
      WHERE lower(EventName) LIKE '%cancel%'
        AND EventDate < DATE '${period.current.start}'
    )
    THEN fs_new.CustomerEmail
  END) AS reactivated
FROM ${T.subFact} fs_new
WHERE fs_new.BeanzSkuFlag = 1
  AND lower(fs_new.EventName) LIKE '%created%'
  AND fs_new.EventDate >= DATE '${period.current.start}'
  AND fs_new.EventDate < DATE '${period.current.end}'
`.trim();
}

// ─── 14. FTBP funnel (registration → first paid) ─────────────
function sqlFTBPFunnel(period) {
  return `
SELECT
  CASE WHEN FTBP_Release IN ('v1','V1') THEN 'FTBP v1'
       WHEN FTBP_Release IN ('v2','V2') THEN 'FTBP v2'
       ELSE 'unknown' END AS release,
  COUNT(DISTINCT ProductRegistrationID) AS registrations,
  COUNT(DISTINCT CASE WHEN FirstOrderDate IS NOT NULL THEN ProductRegistrationID END) AS placed_first_order,
  COUNT(DISTINCT CASE WHEN Has_PaidOrdere = 'Y' THEN ProductRegistrationID END) AS converted_paid,
  COUNT(DISTINCT CASE WHEN RecurringPaidOrderValuee > 0 THEN ProductRegistrationID END) AS became_recurring,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN Has_PaidOrdere = 'Y' THEN ProductRegistrationID END)
        / NULLIF(COUNT(DISTINCT ProductRegistrationID), 0), 1) AS paid_conversion_pct,
  ROUND(AVG(DurationTakenForFirstPaidOrdere), 1) AS avg_days_to_paid,
  ROUND(SUM(FirstPaidOrderValue), 0) AS first_paid_total_value
FROM ${T.ftbp}
WHERE IsFTBPRegistration = 'true'
  AND ProductRegistrationDate >= DATE '${period.current.start}'
  AND ProductRegistrationDate < DATE '${period.current.end}'
GROUP BY release
ORDER BY registrations DESC
`.trim();
}

// ─── 15. Cancellation reasons (curr vs prev) ─────────────────
function sqlCancellationReasons(period, limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 15, 5), 30);
  return `
${windowsCTE(period)}
, reasons AS (
  SELECT
    w.win,
    COALESCE(c.Question, c.Question_ls, '(no reason)') AS reason,
    COUNT(*) AS cases
  FROM ${T.cancelSurvey} c
  INNER JOIN windows w ON c.SurveyDate >= w.s AND c.SurveyDate < w.e
  WHERE win IN ('current','previous')
  GROUP BY w.win, COALESCE(c.Question, c.Question_ls, '(no reason)')
)
SELECT win, reason, cases,
  ROW_NUMBER() OVER (PARTITION BY win ORDER BY cases DESC) AS rn
FROM reasons
QUALIFY rn <= ${n}
ORDER BY win, cases DESC
`.trim();
}

// ─── 16. SLA deep-dive (market × carrier) ────────────────────
function sqlSLADeepDive(period) {
  return `
SELECT
  sh.COUNTRY AS market,
  COALESCE(sh.CARRIER, '(unknown)') AS carrier,
  COUNT(*) AS shipments,
  ROUND(AVG(sh.LeadTime), 2) AS avg_lead_time,
  ROUND(PERCENTILE_APPROX(sh.LeadTime, 0.50), 2) AS median_lead_time,
  ROUND(PERCENTILE_APPROX(sh.LeadTime, 0.95), 2) AS p95_lead_time,
  ROUND(100.0 * AVG(sh.OrderSLAFlg), 1) AS sla_pct
FROM ${T.shipment} sh
WHERE sh.SHIPPINGDATE >= DATE '${period.current.start}'
  AND sh.SHIPPINGDATE < DATE '${period.current.end}'
  AND sh.LeadTime IS NOT NULL AND sh.LeadTime >= 0 AND sh.LeadTime < 60
GROUP BY sh.COUNTRY, sh.CARRIER
HAVING shipments >= 50
ORDER BY sh.COUNTRY, shipments DESC
`.trim();
}

// ─── 17. Promotion lift (with-promo vs without) ──────────────
function sqlPromotionLift(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  CASE WHEN f.PromotionFlag > 0 OR f.Discount > 0 THEN 'with_promo' ELSE 'no_promo' END AS segment,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  ROUND(SUM(f.SkuAmount) / NULLIF(COUNT(DISTINCT f.OrderNumber), 0), 2) AS aov,
  ROUND(AVG(f.Discount), 2) AS avg_discount
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND w.win IN ('current','previous')
GROUP BY w.win, segment
ORDER BY w.win, revenue DESC
`.trim();
}

// ─── 18. Channel mix (subscription / one-off / PBB) ──────────
function sqlChannelMix(period) {
  return `
${windowsCTE(period)}
SELECT
  w.win,
  CASE
    WHEN s.StoreCode ILIKE 'PBB%' THEN 'PBB (Powered by Beanz)'
    WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType <> '' THEN 'Subscription'
    WHEN f.ftbp_Flag > 0 THEN 'FTBP'
    ELSE 'Direct / One-off'
  END AS channel,
  COUNT(DISTINCT f.OrderNumber) AS orders,
  ROUND(SUM(f.SkuAmount), 0) AS revenue,
  SUM(f.Quantity) AS bags,
  COUNT(DISTINCT f.CustomerEmail) AS customers
FROM ${T.order} f
INNER JOIN ${T.rate} e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ${T.store} s ON f.StoreCode = s.StoreCode
INNER JOIN windows w ON f.OrderDate >= w.s AND f.OrderDate < w.e
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
GROUP BY w.win, channel
ORDER BY w.win, revenue DESC
`.trim();
}

// ─── Exports ─────────────────────────────────────────────────
module.exports = {
  sqlHeadline,
  sqlTimeSeries,
  sqlSegmentMix,
  sqlAOVDecomp,
  sqlProgramMix,
  sqlMarketMix,
  sqlRoasterTiers,
  sqlMOTAchievement,
  sqlSubscriberLifecycle,
  sqlCohortRetention,
  sqlNRR,
  sqlRepeatPurchase,
  sqlReactivation,
  sqlFTBPFunnel,
  sqlCancellationReasons,
  sqlSLADeepDive,
  sqlPromotionLift,
  sqlChannelMix
};
