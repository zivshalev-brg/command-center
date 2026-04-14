/**
 * Power BI DAX Query Templates — Beanz BeanzCore_RecentSubscriptions dataset.
 *
 * Dataset ID: 41fe42bf-710c-4efd-9a57-6ca20d20a432
 * Last schema discovery: 2026-03-31 via COLUMNSTATISTICS()
 *
 * Key tables:
 *   FactBeanzOrders         — orders/revenue (1.2M orders, 690K SKU lines)
 *   FactSubscription        — subscription lifecycle events (1M events)
 *   FactShipments           — shipments/SLA (800K shipments)
 *   FactCancelationSurvey   — cancellation reasons (69K surveys)
 *   FactSubscriptionMostRecent — latest subscription state (82K subs)
 *   DimSubscriptions        — subscription dimensions (155K subs)
 *   DimProduct              — products/SKUs (155K)
 *   DimStoreCode            — markets/regions (61 store codes)
 *   DimFactDate             — calendar (7K dates, FY/CY/rolling)
 *   DimCustomerEmail        — customer metrics (1.4M hashed emails)
 *   DimPromotionDetails     — promotions (400K)
 *   FactMBrandOrders        — machine brand/roaster orders
 *
 * Data quality rules (from beanz-genie-sql-engine skill):
 *   1. FactBeanzOrders in PBI is pre-filtered to BeanzSkuFlag=1 (coffee SKUs only)
 *   2. ALWAYS exclude cancelled orders: OrderStatus <> "Canceled" on all revenue/volume queries
 *   3. DimSubscriptions contains non-coffee subs — ALWAYS filter BeanzSkuFlag=1
 *   4. PBI "Active Subs" = Active + Paused where BeanzSkuFlag=1 (~36,584 as of Mar 2026)
 *   5. PBI "Paid" revenue = FreeUnits="Paid" (or SkuAmount>0), NOT DiscoverySkuFlag=0
 *   6. FactShipments ORDERDATE is day-of-week int (1-7), NOT a date — use SHIPPINGDATE
 *   7. LeadTime is the correct SLA metric (days order→delivery)
 *   8. Net_Sales is the primary revenue field in PBI (equiv to SkuAmount in Databricks)
 */

// ─── Query Templates ────────────────────────────────────────────────────────

const DAX_TEMPLATES = {

  /**
   * KPI Overview — top-level business metrics in a single row.
   *
   * Data quality rules applied (from beanz-genie-sql-engine skill):
   *   - FactBeanzOrders in PBI is pre-filtered to BeanzSkuFlag=1 (coffee only)
   *   - Exclude cancelled orders: OrderStatus <> "Canceled"
   *   - DimSubscriptions requires BeanzSkuFlag=1 filter (contains non-coffee subs)
   *   - PBI "Active Subs" = Active + Paused where BeanzSkuFlag=1 (~36,584)
   *   - FreeUnits="Paid" with Net_Sales>0 matches PBI's paid revenue definition
   */
  kpi_overview: (params = {}) => {
    // FY filter: params.fy = 2026 means FY26 (Jul 2025 - Jun 2026)
    // If no FY specified, returns all-time data
    const fyFilter = params.fy
      ? `'DimFactDate'[FiscalYearNumber] = ${params.fy}`
      : null;
    const fyCalc = (expr) => fyFilter
      ? `CALCULATE(${expr}, 'FactBeanzOrders'[OrderStatus] <> "Canceled", ${fyFilter})`
      : `CALCULATE(${expr}, 'FactBeanzOrders'[OrderStatus] <> "Canceled")`;
    const fyCalcPaid = (expr) => fyFilter
      ? `CALCULATE(${expr}, 'FactBeanzOrders'[OrderStatus] <> "Canceled", 'FactBeanzOrders'[FreeUnits] = "Paid", ${fyFilter})`
      : `CALCULATE(${expr}, 'FactBeanzOrders'[OrderStatus] <> "Canceled", 'FactBeanzOrders'[FreeUnits] = "Paid")`;
    // Sub queries don't use DimFactDate — filter by FiscalYearNumber on DimSubscriptions
    const subFyFilter = params.fy
      ? `, 'DimSubscriptions'[FiscalYearNumber] = ${params.fy}`
      : '';
    // Cancel survey date filter
    const cancelFyFilter = params.fy
      ? `, 'FactCancelationSurvey'[FiscalYearNumber] = ${params.fy}`
      : '';

    return `
    EVALUATE
    ROW(
      "FY", ${params.fy ? `"FY${params.fy}"` : '"All Time"'},
      "TotalRevenue", ${fyCalc("SUM('FactBeanzOrders'[Net_Sales])")},
      "PaidRevenue", ${fyCalcPaid("SUM('FactBeanzOrders'[Net_Sales])")},
      "GrossSales", ${fyCalc("SUM('FactBeanzOrders'[Gross_Sales])")},
      "TotalOrders", ${fyCalc("DISTINCTCOUNT('FactBeanzOrders'[OrderNumber])")},
      "ActiveCoffeeSubs", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] IN {"Active", "Paused"}, 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "ActiveSubs", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] = "Active", 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "PausedSubs", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] = "Paused", 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "CancelledSubs", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] = "Cancelled", 'DimSubscriptions'[BeanzSkuFlag] = 1${subFyFilter}),
      "NewSubs", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[BeanzSkuFlag] = 1${subFyFilter}),
      "TotalCustomers", DISTINCTCOUNT('DimCustomerEmail'[CustomerEmail]),
      "TotalBagsKG", ${fyCalc("SUM('FactBeanzOrders'[Quantity_by_KG])")},
      "TotalBags", ${fyCalc("SUM('FactBeanzOrders'[Quantity])")},
      "PaidBags", ${fyCalcPaid("SUM('FactBeanzOrders'[Quantity])")},
      "AvgOrderValue", ${fyCalcPaid("AVERAGE('FactBeanzOrders'[Net_Sales])")},
      "FTBPOrders", ${fyCalc("CALCULATE(COUNTROWS('FactBeanzOrders'), 'FactBeanzOrders'[ftbp_Flag] > 0)")},
      "SubscriptionOrders", ${fyCalc("CALCULATE(COUNTROWS('FactBeanzOrders'), 'FactBeanzOrders'[Is_Subscription_Order?] = \"Yes\")")},
      "PromotionOrders", ${fyCalc("CALCULATE(COUNTROWS('FactBeanzOrders'), 'FactBeanzOrders'[Is_Promotion_Order?] = \"Promotion\")")},
      "CancelSurveys", CALCULATE(COUNTROWS('FactCancelationSurvey')${cancelFyFilter}),
      "GeneratedAt", NOW()
    )
  `;
  },

  /**
   * KPI Comparison by FY — returns one row per fiscal year for YoY comparison.
   * Covers FY24, FY25, FY26 (current).
   */
  kpi_by_fy: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimFactDate'[FY],
      FILTER(ALL('FactBeanzOrders'[OrderStatus]), 'FactBeanzOrders'[OrderStatus] <> "Canceled"),
      FILTER(ALL('DimFactDate'[FiscalYearNumber]), 'DimFactDate'[FiscalYearNumber] >= 2024),
      "Revenue", SUM('FactBeanzOrders'[Net_Sales]),
      "PaidRevenue", CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid"),
      "Orders", DISTINCTCOUNT('FactBeanzOrders'[OrderNumber]),
      "Bags", SUM('FactBeanzOrders'[Quantity]),
      "BagsKG", SUM('FactBeanzOrders'[Quantity_by_KG]),
      "AvgOrderValue", CALCULATE(AVERAGE('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid")
    )
    ORDER BY 'DimFactDate'[FY] ASC
  `,

  /**
   * Revenue by Order Type — FTBP, Subscription, WS, etc.
   * Excludes cancelled orders.
   */
  revenue_by_program: (params = {}) => {
    const fyFilter = params.fy ? `,\n      FILTER(ALL('DimFactDate'[FiscalYearNumber]), 'DimFactDate'[FiscalYearNumber] = ${params.fy})` : '';
    return `
    EVALUATE
    SUMMARIZECOLUMNS(
      'FactBeanzOrders'[OrderType],
      FILTER(ALL('FactBeanzOrders'[OrderStatus]), 'FactBeanzOrders'[OrderStatus] <> "Canceled")${fyFilter},
      "Revenue", SUM('FactBeanzOrders'[Net_Sales]),
      "PaidRevenue", CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid"),
      "Orders", DISTINCTCOUNT('FactBeanzOrders'[OrderNumber]),
      "Bags", SUM('FactBeanzOrders'[Quantity]),
      "BagsKG", SUM('FactBeanzOrders'[Quantity_by_KG])
    )
    ORDER BY [Revenue] DESC
  `;
  },

  /**
   * Subscription Health — counts by status.
   * Filtered to BeanzSkuFlag=1 (coffee subs only).
   * Without this filter, returns ~57K inflated by 23K non-coffee subs.
   */
  subscription_health: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimSubscriptions'[SubscriptionStatus],
      FILTER(ALL('DimSubscriptions'[BeanzSkuFlag]), 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "Count", COUNTROWS('DimSubscriptions'),
      "AvgDurationDays", AVERAGE('DimSubscriptions'[SubscriptionDurationDays])
    )
    ORDER BY [Count] DESC
  `,

  /**
   * Cancellation Trend — top cancellation reasons from survey
   */
  cancellation_trend: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'FactCancelationSurvey'[Question],
      "Count", COUNTROWS('FactCancelationSurvey')
    )
    ORDER BY [Count] DESC
  `,

  /**
   * Regional Breakdown — revenue and orders by market.
   * Excludes cancelled orders.
   */
  regional_breakdown: (params = {}) => {
    const fyFilter = params.fy ? `,\n      FILTER(ALL('DimFactDate'[FiscalYearNumber]), 'DimFactDate'[FiscalYearNumber] = ${params.fy})` : '';
    return `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimStoreCode'[Country],
      FILTER(ALL('FactBeanzOrders'[OrderStatus]), 'FactBeanzOrders'[OrderStatus] <> "Canceled")${fyFilter},
      "Revenue", SUM('FactBeanzOrders'[Net_Sales]),
      "PaidRevenue", CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid"),
      "Orders", DISTINCTCOUNT('FactBeanzOrders'[OrderNumber]),
      "Bags", SUM('FactBeanzOrders'[Quantity]),
      "BagsKG", SUM('FactBeanzOrders'[Quantity_by_KG])
    )
    ORDER BY [Revenue] DESC
  `;
  },

  /**
   * FTBP Analysis — FTBP vs non-FTBP orders.
   * Excludes cancelled. ftbp_Flag: 0=non-FTBP, 1+=FTBP.
   */
  ftbp_funnel: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'FactBeanzOrders'[ftbp_Flag],
      FILTER(ALL('FactBeanzOrders'[OrderStatus]), 'FactBeanzOrders'[OrderStatus] <> "Canceled"),
      "Revenue", SUM('FactBeanzOrders'[Net_Sales]),
      "PaidRevenue", CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid"),
      "Orders", DISTINCTCOUNT('FactBeanzOrders'[OrderNumber]),
      "Customers", DISTINCTCOUNT('FactBeanzOrders'[CustomerEmail]),
      "Bags", SUM('FactBeanzOrders'[Quantity]),
      "BagsKG", SUM('FactBeanzOrders'[Quantity_by_KG])
    )
    ORDER BY 'FactBeanzOrders'[ftbp_Flag] ASC
  `,

  /**
   * Revenue Time Series — monthly revenue trend.
   * Excludes cancelled orders. Filtered to dates with data.
   */
  time_series: (params = {}) => {
    const granularity = params.granularity || 'Month_Name';
    const measure = params.measure || "CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[OrderStatus] <> \"Canceled\")";
    return `
      EVALUATE
      SUMMARIZECOLUMNS(
        'DimFactDate'[${granularity}],
        FILTER('DimFactDate', 'DimFactDate'[DatesWithData] = TRUE()),
        "Value", ${measure}
      )
      ORDER BY 'DimFactDate'[${granularity}] ASC
    `;
  },

  /**
   * Subscription Type Breakdown — Beanz, FTBP, Discovery, etc.
   * Filtered to BeanzSkuFlag=1 (coffee subs only).
   */
  subscription_types: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimSubscriptions'[SubscriptionType],
      FILTER(ALL('DimSubscriptions'[BeanzSkuFlag]), 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "Count", COUNTROWS('DimSubscriptions'),
      "Active", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] IN {"Active", "Paused"}),
      "Cancelled", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] = "Cancelled")
    )
    ORDER BY [Count] DESC
  `,

  /**
   * Shipment SLA — delivery performance by country.
   * NOTE: ORDERDATE in FactShipments is day-of-week integer (1-7), NOT a calendar date.
   * Use SHIPPINGDATE or DeliveryDate for date filtering. LeadTime = days order→delivery.
   * CY25 benchmarks: AU≈5.83d, UK≈3.97d, US≈5.72d, DE≈5.17d.
   */
  shipment_sla: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'FactShipments'[Country],
      FILTER(ALL('FactShipments'[LEADTIME]), NOT(ISBLANK('FactShipments'[LEADTIME]))),
      "TotalShipments", COUNTROWS('FactShipments'),
      "AvgLeadTime", AVERAGE('FactShipments'[LEADTIME]),
      "AvgTransitTime", AVERAGE('FactShipments'[TRANSITITME])
    )
    ORDER BY [AvgLeadTime] ASC
  `,

  /**
   * Monthly Revenue by Country — for market comparison.
   * Excludes cancelled orders. Current FY only.
   */
  revenue_by_country_month: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimFactDate'[Month_Name],
      'DimStoreCode'[Country],
      FILTER('DimFactDate', 'DimFactDate'[IsCurrentFY] = 1),
      FILTER(ALL('FactBeanzOrders'[OrderStatus]), 'FactBeanzOrders'[OrderStatus] <> "Canceled"),
      "Revenue", SUM('FactBeanzOrders'[Net_Sales]),
      "PaidRevenue", CALCULATE(SUM('FactBeanzOrders'[Net_Sales]), 'FactBeanzOrders'[FreeUnits] = "Paid"),
      "Bags", SUM('FactBeanzOrders'[Quantity])
    )
    ORDER BY 'DimFactDate'[Month_Name] ASC
  `,

  /**
   * Customer Cohort — subscriptions by cohort month.
   * Filtered to BeanzSkuFlag=1 (coffee subs only).
   * "StillActive" = Active + Paused (PBI definition).
   */
  cohort_analysis: (params = {}) => `
    EVALUATE
    SUMMARIZECOLUMNS(
      'DimSubscriptions'[CohortMonth],
      FILTER(ALL('DimSubscriptions'[BeanzSkuFlag]), 'DimSubscriptions'[BeanzSkuFlag] = 1),
      "NewSubscriptions", COUNTROWS('DimSubscriptions'),
      "StillActive", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] IN {"Active", "Paused"}),
      "Cancelled", CALCULATE(COUNTROWS('DimSubscriptions'), 'DimSubscriptions'[SubscriptionStatus] = "Cancelled")
    )
    ORDER BY 'DimSubscriptions'[CohortMonth] ASC
  `,

  /**
   * Discovery — all tables and columns via COLUMNSTATISTICS (works on executeQueries)
   */
  discover_schema: () => `EVALUATE COLUMNSTATISTICS()`,

  /**
   * Custom Query — pass-through for ad-hoc DAX
   */
  custom: (params = {}) => params.dax || 'EVALUATE ROW("Status", "No query provided")',
};

// ─── Template Metadata ───────────────────────────────────────────────────────

const TEMPLATE_INFO = {
  kpi_overview:             { name: 'KPI Overview',              category: 'metrics',   description: 'Top-level KPIs: revenue, subs, orders, customers (params: fy)' },
  kpi_by_fy:               { name: 'KPI by Fiscal Year',        category: 'metrics',   description: 'Revenue, orders, bags per FY for YoY comparison' },
  revenue_by_program:       { name: 'Revenue by Program',        category: 'revenue',   description: 'Revenue by order type (FTBP, Subscription, WS, etc.)' },
  subscription_health:      { name: 'Subscription Health',       category: 'subs',      description: 'Subscription counts by status' },
  cancellation_trend:       { name: 'Cancellation Reasons',      category: 'churn',     description: 'Top cancellation reasons from survey' },
  regional_breakdown:       { name: 'Regional Breakdown',        category: 'regional',  description: 'Revenue and orders by market' },
  ftbp_funnel:              { name: 'FTBP Analysis',             category: 'ftbp',      description: 'FTBP vs non-FTBP order comparison' },
  time_series:              { name: 'Time Series',               category: 'trend',     description: 'Monthly metric trends (params: measure, granularity)' },
  subscription_types:       { name: 'Subscription Types',        category: 'subs',      description: 'Breakdown by subscription type' },
  shipment_sla:             { name: 'Shipment SLA',              category: 'ops',       description: 'Delivery lead time by country' },
  revenue_by_country_month: { name: 'Revenue by Country/Month',  category: 'regional',  description: 'Monthly revenue by market (current FY)' },
  cohort_analysis:          { name: 'Cohort Analysis',           category: 'retention', description: 'Subscription cohort retention' },
  discover_schema:          { name: 'Discover Schema',           category: 'discovery', description: 'All tables and columns via COLUMNSTATISTICS()' },
  custom:                   { name: 'Custom Query',              category: 'custom',    description: 'Run arbitrary DAX query' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildQuery(templateName, params = {}) {
  const templateFn = DAX_TEMPLATES[templateName];
  if (!templateFn) throw new Error(`Unknown DAX template: ${templateName}`);
  return templateFn(params).trim();
}

function listTemplates() {
  return Object.entries(TEMPLATE_INFO).map(([key, info]) => ({
    key,
    ...info,
    hasParams: ['time_series', 'custom'].includes(key),
  }));
}

// ─── Slice-and-Dice Query Builder ───────────────────────────────────────────
// Uses actual BeanzCore_RecentSubscriptions schema discovered 2026-03-31.

const SCHEMA_MAP = {
  tables: {
    orders: 'FactBeanzOrders',
    subscriptions: 'DimSubscriptions',
    subscription_events: 'FactSubscription',
    shipments: 'FactShipments',
    cancellation_survey: 'FactCancelationSurvey',
    sub_recent: 'FactSubscriptionMostRecent',
    product: 'DimProduct',
    store: 'DimStoreCode',
    calendar: 'DimFactDate',
    customer: 'DimCustomerEmail',
    promotions: 'DimPromotionDetails',
    mbrand: 'FactMBrandOrders'
  },
  columns: {
    revenue: "'FactBeanzOrders'[Net_Sales]",
    grossSales: "'FactBeanzOrders'[Gross_Sales]",
    market: "'DimStoreCode'[Country]",
    region: "'DimStoreCode'[Region]",
    month: "'DimFactDate'[Month_Name]",
    year: "'DimFactDate'[YearNumber]",
    fy: "'DimFactDate'[FY]",
    quarter: "'DimFactDate'[Quarter_Name]",
    orderType: "'FactBeanzOrders'[OrderType]",
    subStatus: "'DimSubscriptions'[SubscriptionStatus]",
    subType: "'DimSubscriptions'[SubscriptionType]",
    subId: "'DimSubscriptions'[SubscriptionId]",
    orderId: "'FactBeanzOrders'[OrderNumber]",
    cancelReason: "'FactCancelationSurvey'[Question]",
    cancelId: "'FactCancelationSurvey'[Id]",
    ftbpFlag: "'FactBeanzOrders'[ftbp_Flag]",
    isSubOrder: "'FactBeanzOrders'[Is_Subscription_Order?]",
    isPromoOrder: "'FactBeanzOrders'[Is_Promotion_Order?]",
    quantity: "'FactBeanzOrders'[Quantity]",
    quantityKG: "'FactBeanzOrders'[Quantity_by_KG]",
    orderDate: "'FactBeanzOrders'[OrderDate]",
    shipCountry: "'FactShipments'[Country]",
    leadTime: "'FactShipments'[LEADTIME]",
    transitTime: "'FactShipments'[TRANSITITME]",
    cohortMonth: "'DimSubscriptions'[CohortMonth]",
    promoCategory: "'DimPromotionDetails'[Category]"
  }
};

function buildSliceQuery(dimension, metric, filters) {
  const col = SCHEMA_MAP.columns;

  const metricExpr = {
    revenue:       `"Value", SUM(${col.revenue})`,
    gross_sales:   `"Value", SUM(${col.grossSales})`,
    subscribers:   `"Value", COUNTROWS('DimSubscriptions')`,
    cancellations: `"Value", COUNTROWS('FactCancelationSurvey')`,
    orders:        `"Value", DISTINCTCOUNT(${col.orderId})`,
    bags:          `"Value", SUM(${col.quantity})`,
    bags_kg:       `"Value", SUM(${col.quantityKG})`,
    shipments:     `"Value", COUNTROWS('FactShipments')`,
    lead_time:     `"Value", AVERAGE(${col.leadTime})`,
    transit_time:  `"Value", AVERAGE(${col.transitTime})`
  }[metric];

  if (!metricExpr) return null;

  const dimCol = {
    market:       col.market,
    region:       col.region,
    order_type:   col.orderType,
    month:        col.month,
    year:         col.year,
    fy:           col.fy,
    quarter:      col.quarter,
    status:       col.subStatus,
    sub_type:     col.subType,
    reason:       col.cancelReason,
    ftbp:         col.ftbpFlag,
    promo:        col.promoCategory,
    cohort:       col.cohortMonth,
    ship_country: col.shipCountry
  }[dimension];

  if (!dimCol) return null;

  // Build CALCULATETABLE filters
  let filterClause = '';
  if (filters) {
    const filterParts = [];
    if (filters.market) {
      filterParts.push(`'DimStoreCode'[Country] = "${filters.market}"`);
    }
    if (filters.fy) {
      filterParts.push(`'DimFactDate'[FY] = "${filters.fy}"`);
    }
    if (filters.year) {
      filterParts.push(`'DimFactDate'[YearNumber] = ${filters.year}`);
    }
    if (filters.orderType) {
      filterParts.push(`'FactBeanzOrders'[OrderType] = "${filters.orderType}"`);
    }
    if (filters.subStatus) {
      filterParts.push(`'DimSubscriptions'[SubscriptionStatus] = "${filters.subStatus}"`);
    }
    if (filters.dateFrom) {
      filterParts.push(`'DimFactDate'[PK_Date] >= DATE(${filters.dateFrom.replace(/-/g, ',')})`);
    }
    if (filters.dateTo) {
      filterParts.push(`'DimFactDate'[PK_Date] <= DATE(${filters.dateTo.replace(/-/g, ',')})`);
    }
    if (filterParts.length > 0) {
      filterClause = filterParts.map(f => `, KEEPFILTERS(FILTER(ALL(${f.split(' = ')[0].trim().replace(/"/g, '')}), ${f}))`).join('');
    }
  }

  return `
    EVALUATE
    SUMMARIZECOLUMNS(
      ${dimCol},
      ${metricExpr}
      ${filterClause}
    )
    ORDER BY ${dimCol} ASC
  `.trim();
}

function updateSchemaMap(tableMap, columnMap) {
  if (tableMap) Object.assign(SCHEMA_MAP.tables, tableMap);
  if (columnMap) Object.assign(SCHEMA_MAP.columns, columnMap);
}

function getSchemaMap() {
  return { ...SCHEMA_MAP };
}

module.exports = {
  DAX_TEMPLATES,
  TEMPLATE_INFO,
  buildQuery,
  listTemplates,
  buildSliceQuery,
  updateSchemaMap,
  getSchemaMap,
  SCHEMA_MAP
};
