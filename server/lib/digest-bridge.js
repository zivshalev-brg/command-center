/**
 * Digest Bridge — parses beanz-digest extraction output into structured
 * live metrics that replace or overlay the static strategy-engine data.
 *
 * The extraction tool (beanz-digest) scrapes Power BI dashboards via Playwright
 * and writes JSON to ~/beanz-digest/output/{cadence}/{date}/.
 * This module reads that output and returns normalised, comparable metrics.
 */
const fs = require('fs');
const path = require('path');
const { logAction } = require('./db');

// ─── Value Parsers ───────────────────────────────────────────────────────────

/** Parse human-readable metric values like "10.68M", "712.5K", "36.5K", "59%", "233.85" */
function parseMetricValue(raw) {
  if (!raw || raw === '--' || raw === '') return null;
  const s = String(raw).trim().replace(/,/g, '');
  if (s.endsWith('%')) return { value: parseFloat(s), format: 'pct' };
  if (s.endsWith('M')) return { value: parseFloat(s) * 1_000_000, format: 'currency' };
  if (s.endsWith('K')) return { value: parseFloat(s) * 1_000, format: 'number' };
  const num = parseFloat(s);
  if (!isNaN(num)) return { value: num, format: num > 1000 ? 'number' : 'currency' };
  return null;
}

/** Parse a vs_ly string like "59%" into a decimal like 0.59 */
function parseYoY(raw) {
  if (!raw || raw === '--' || raw === '') return null;
  const s = String(raw).trim().replace('%', '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
}

/** Determine trend from YoY value */
function trendFromYoY(yoy) {
  if (yoy === null) return 'flat';
  if (yoy > 0.02) return 'up';
  if (yoy < -0.02) return 'down';
  return 'flat';
}

// ─── KPI Card Extraction ─────────────────────────────────────────────────────

/**
 * Extract structured KPI data from a page's extraction result.
 * Handles both single-cadence and multi-toggle (daily/weekly/monthly) pages.
 */
function extractKPICards(pageData) {
  const cards = {};
  const sources = [];

  // Multi-toggle pages have data under daily/weekly/monthly keys
  for (const toggle of ['daily', 'weekly', 'monthly']) {
    if (pageData[toggle]?.kpiCards) {
      sources.push({ period: toggle, kpis: pageData[toggle].kpiCards });
    }
  }
  // Single-cadence pages have kpiCards at top level
  if (pageData.kpiCards?.length) {
    sources.push({ period: pageData.cadence || 'all', kpis: pageData.kpiCards });
  }

  for (const { period, kpis } of sources) {
    for (const card of kpis) {
      if (!card.title) continue;
      const key = slugify(card.title);
      const parsed = parseMetricValue(card.value);
      if (!parsed) continue;

      cards[key] = {
        title: card.title,
        value: parsed.value,
        format: parsed.format,
        lyValue: parseMetricValue(card.ly_value)?.value || null,
        yoy: parseYoY(card.vs_ly),
        period,
        raw: card
      };
    }
  }

  return cards;
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
}

// ─── Digest Reader ───────────────────────────────────────────────────────────

/**
 * Read the latest extraction for a given cadence.
 * Returns { date, pages: { pageKey: { kpis, raw } }, summary, extractedAt }
 */
function readLatestExtraction(digestOutput, cadence) {
  const cadDir = path.join(digestOutput, cadence);
  try {
    const entries = fs.readdirSync(cadDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    if (!entries.length) return null;

    const date = entries[0];
    const folder = path.join(cadDir, date);
    const pages = {};

    const files = fs.readdirSync(folder).filter(f => f.endsWith('.json') && f !== 'summary.json');
    for (const file of files) {
      const key = file.replace('.json', '');
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf-8'));
        pages[key] = {
          kpis: extractKPICards(raw),
          raw
        };
      } catch { /* skip malformed */ }
    }

    let summary = null;
    try {
      summary = JSON.parse(fs.readFileSync(path.join(folder, 'summary.json'), 'utf-8'));
    } catch { /* optional */ }

    return {
      cadence,
      date,
      folder,
      pages,
      summary,
      extractedAt: summary?.extractedAt || null,
      pageCount: Object.keys(pages).length
    };
  } catch {
    return null;
  }
}

/**
 * Read the previous extraction for delta comparison.
 */
function readPreviousExtraction(digestOutput, cadence) {
  const cadDir = path.join(digestOutput, cadence);
  try {
    const entries = fs.readdirSync(cadDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    if (entries.length < 2) return null;
    return readLatestExtraction(digestOutput, cadence);
  } catch {
    return null;
  }
}

// ─── Live Metrics Builder ────────────────────────────────────────────────────

/**
 * Build live metrics from the best available extraction data.
 * Prefers weekly (richer data, 10 pages) over daily (2 pages).
 * Falls back to static strategy-engine data for anything not in the digest.
 */
function buildLiveMetrics(digestOutput) {
  const weekly = readLatestExtraction(digestOutput, 'weekly');
  const daily = readLatestExtraction(digestOutput, 'daily');

  // Use whichever is most recent, preferring weekly for completeness
  const primary = weekly || daily;
  if (!primary) return null;

  // Aggregate KPI cards from the best source
  const kpiSource = primary.pages?.kpi_metrics?.kpis || {};
  const perfSource = primary.pages?.performance?.kpis || {};
  const subsSource = primary.pages?.subscription?.kpis || {};
  const cancelSource = primary.pages?.cancellation?.kpis || {};

  // Build structured metrics from extracted data
  const live = {
    source: 'digest',
    cadence: primary.cadence,
    extractedAt: primary.extractedAt,
    date: primary.date,
    dataAge: dataAgeDays(primary.extractedAt),
    pageCount: primary.pageCount,
    metrics: {}
  };

  // Revenue
  const revenue = kpiSource.actual_revenue || perfSource.actual_revenue;
  if (revenue) {
    live.metrics.revenue = {
      name: 'Revenue (FY26 YTD)',
      value: revenue.value,
      format: 'currency',
      yoy: revenue.yoy,
      trend: trendFromYoY(revenue.yoy),
      status: revenue.yoy > 0.3 ? 'healthy' : revenue.yoy > 0 ? 'positive' : 'warning',
      lyValue: revenue.lyValue,
      source: 'powerbi'
    };
  }

  // Active Subscribers
  const activeSubs = kpiSource.active_subs || perfSource.active_subs;
  if (activeSubs) {
    live.metrics.active_subs = {
      name: 'Active Subscribers',
      value: activeSubs.value,
      format: 'number',
      yoy: activeSubs.yoy,
      trend: trendFromYoY(activeSubs.yoy),
      status: activeSubs.yoy > 0.5 ? 'healthy' : 'positive',
      lyValue: activeSubs.lyValue,
      source: 'powerbi'
    };
  }

  // Cancelled Subscribers (churn indicator)
  const cancelled = kpiSource.cancelled_subs || perfSource.cancelled_subs;
  if (cancelled) {
    live.metrics.cancelled_subs = {
      name: 'Cancelled Subscribers',
      value: cancelled.value,
      format: 'number',
      yoy: cancelled.yoy,
      trend: trendFromYoY(cancelled.yoy),
      status: cancelled.yoy > 1.0 ? 'critical' : cancelled.yoy > 0.5 ? 'warning' : 'positive',
      lyValue: cancelled.lyValue,
      source: 'powerbi'
    };
  }

  // New Subscribers
  const newSubs = kpiSource.new_subs || perfSource.new_subs;
  if (newSubs) {
    live.metrics.new_subs = {
      name: 'New Subscribers',
      value: newSubs.value,
      format: 'number',
      yoy: newSubs.yoy,
      trend: trendFromYoY(newSubs.yoy),
      status: newSubs.yoy > 0.3 ? 'healthy' : 'positive',
      lyValue: newSubs.lyValue,
      source: 'powerbi'
    };
  }

  // Net Subscriber Growth (derived)
  if (newSubs && cancelled) {
    const net = (newSubs.value || 0) - (cancelled.value || 0);
    live.metrics.net_subscriber_growth = {
      name: 'Net Subscriber Growth',
      value: net,
      format: 'number',
      trend: net > 0 ? 'up' : 'down',
      status: net > 0 ? 'positive' : 'critical',
      detail: `+${fmtK(newSubs.value)} new, -${fmtK(cancelled.value)} cancelled`,
      source: 'derived'
    };
  }

  // Bags Shipped
  const bags = kpiSource.bags_shipped || perfSource.bags_shipped;
  if (bags) {
    live.metrics.bags_shipped = {
      name: 'Bags Shipped (FY26 YTD)',
      value: bags.value,
      format: 'number',
      yoy: bags.yoy,
      trend: trendFromYoY(bags.yoy),
      status: bags.yoy > 0.3 ? 'healthy' : 'positive',
      lyValue: bags.lyValue,
      source: 'powerbi'
    };
  }

  // KG Shipped
  const kg = kpiSource.bags_shipped_in_kg || perfSource.bags_shipped_in_kg;
  if (kg) {
    live.metrics.kg_shipped = {
      name: 'KG Shipped (FY26 YTD)',
      value: kg.value,
      format: 'number',
      yoy: kg.yoy,
      trend: trendFromYoY(kg.yoy),
      status: 'healthy',
      lyValue: kg.lyValue,
      source: 'powerbi'
    };
  }

  // Customer Lifetime Value
  const ltv = perfSource.customer_lifetime_value;
  if (ltv) {
    live.metrics.ltv = {
      name: 'Customer LTV',
      value: ltv.value,
      format: 'currency',
      trend: 'flat',
      status: 'warning',
      detail: 'FY26 extracted from Power BI',
      source: 'powerbi'
    };
  }

  // Subscription Lifetime Value
  const sltv = perfSource.subscription_lifetime_value;
  if (sltv) {
    live.metrics.subscription_ltv = {
      name: 'Subscription LTV',
      value: sltv.value,
      format: 'currency',
      trend: 'flat',
      status: 'positive',
      source: 'powerbi'
    };
  }

  // Customers count
  const customers = perfSource.customers || kpiSource.customers;
  if (customers) {
    live.metrics.customers = {
      name: 'Customers (FY26 YTD)',
      value: customers.value,
      format: 'number',
      yoy: customers.yoy,
      trend: trendFromYoY(customers.yoy),
      status: 'healthy',
      lyValue: customers.lyValue,
      source: 'powerbi'
    };
  }

  // Total Cancellations (from cancellation page if available)
  const totalCancel = cancelSource.total_cancellations;
  if (totalCancel) {
    live.metrics.total_cancellations = {
      name: 'Total Cancellations (All Time)',
      value: totalCancel.value,
      format: 'number',
      trend: 'up',
      status: 'critical',
      source: 'powerbi'
    };
  }

  // Regional cancellation breakdown
  const regionCancel = {};
  for (const market of ['au', 'uk', 'us', 'de']) {
    const c = cancelSource[market];
    if (c) regionCancel[market.toUpperCase()] = c.value;
  }
  if (Object.keys(regionCancel).length) {
    live.metrics.cancellation_by_market = {
      name: 'Cancellations by Market',
      value: regionCancel,
      format: 'breakdown',
      status: 'info',
      source: 'powerbi'
    };
  }

  // Summary highlight data
  if (primary.summary?.highlights?.length) {
    live.highlights = primary.summary.highlights.filter(h => h.value && h.value !== '0' && h.value !== '0K');
  }

  return live;
}

function fmtK(v) {
  if (!v) return '0';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(Math.round(v));
}

function dataAgeDays(extractedAt) {
  if (!extractedAt) return null;
  const extracted = new Date(extractedAt);
  const now = new Date();
  return Math.floor((now - extracted) / 86400000);
}

// ─── Freshness Report ────────────────────────────────────────────────────────

/**
 * Build a freshness report for all cadences.
 */
function buildFreshnessReport(digestOutput) {
  const report = {
    generated: new Date().toISOString(),
    cadences: {}
  };

  for (const cadence of ['daily', 'weekly', 'monthly']) {
    const latest = readLatestExtraction(digestOutput, cadence);
    if (latest) {
      const ageDays = dataAgeDays(latest.extractedAt);
      const thresholds = { daily: 2, weekly: 8, monthly: 35 };
      const stale = ageDays !== null && ageDays > thresholds[cadence];

      report.cadences[cadence] = {
        date: latest.date,
        extractedAt: latest.extractedAt,
        pageCount: latest.pageCount,
        ageDays,
        stale,
        status: stale ? 'stale' : 'fresh'
      };
    } else {
      report.cadences[cadence] = {
        date: null,
        extractedAt: null,
        pageCount: 0,
        ageDays: null,
        stale: true,
        status: 'missing'
      };
    }
  }

  // Overall freshness
  const dailyAge = report.cadences.daily?.ageDays;
  const weeklyAge = report.cadences.weekly?.ageDays;
  const bestAge = [dailyAge, weeklyAge].filter(a => a !== null).sort((a, b) => a - b)[0];

  report.overallStatus = bestAge === null ? 'no_data' :
    bestAge <= 1 ? 'fresh' :
    bestAge <= 3 ? 'recent' :
    bestAge <= 7 ? 'aging' : 'stale';
  report.bestDataAge = bestAge;

  return report;
}

// ─── Extraction List ─────────────────────────────────────────────────────────

/**
 * List all available extractions across cadences.
 */
function listExtractions(digestOutput) {
  const result = {};
  for (const cadence of ['daily', 'weekly', 'monthly']) {
    const cadDir = path.join(digestOutput, cadence);
    try {
      result[cadence] = fs.readdirSync(cadDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const summaryPath = path.join(cadDir, d.name, 'summary.json');
          let summary = null;
          try { summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')); } catch {}
          return {
            date: d.name,
            extractedAt: summary?.extractedAt || null,
            pageCount: summary?.pagesExtracted || 0,
            kpiCount: summary?.totalKPICards || 0
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      result[cadence] = [];
    }
  }
  return result;
}

// ─── API Data Normalization ──────────────────────────────────────────────────

/**
 * Normalize Power BI REST API (DAX query) results into the same metric schema
 * used by buildLiveMetrics(). This allows API data to slot directly into the
 * existing metrics pipeline.
 *
 * @param {Object} apiData — pbi-live.json content from refresh engine
 * @returns {Object} — { metrics: { key: { title, value, format, lyValue, yoy, period, source } }, freshness, ... }
 */
function buildLiveMetricsFromAPI(apiData) {
  if (!apiData || !apiData.metrics) return null;

  const metrics = {};
  const errors = [];
  const rawKPIs = {}; // Collect KPI values from kpi_overview (current FY)
  const prevKPIs = {}; // Collect KPI values from kpi_overview_prev (previous FY)
  const fyComparison = []; // KPI by FY rows

  // Process each template's results
  for (const [templateName, templateResult] of Object.entries(apiData.metrics)) {
    if (templateResult.error) {
      errors.push({ template: templateName, error: templateResult.error });
      continue;
    }

    const rows = templateResult.rows || [];

    // Extract raw KPIs from kpi_overview (current FY)
    if (templateName === 'kpi_overview' && rows.length > 0) {
      for (const [colName, rawValue] of Object.entries(rows[0])) {
        if (colName.startsWith('[') && colName.endsWith(']')) {
          rawKPIs[colName.slice(1, -1)] = rawValue;
        }
      }
    }

    // Extract previous FY KPIs for YoY calculation
    if (templateName === 'kpi_overview_prev' && rows.length > 0) {
      for (const [colName, rawValue] of Object.entries(rows[0])) {
        if (colName.startsWith('[') && colName.endsWith(']')) {
          prevKPIs[colName.slice(1, -1)] = rawValue;
        }
      }
    }

    // Extract FY comparison rows
    if (templateName === 'kpi_by_fy') {
      rows.forEach(row => fyComparison.push(row));
    }
  }

  // Helper: compute YoY as decimal (0.61 = +61%)
  function yoy(current, previous) {
    if (!previous || previous === 0 || current == null) return null;
    return (current - previous) / Math.abs(previous);
  }

  // ── Map PBI KPI fields to frontend metric keys ──────────────────────────
  // The frontend expects specific keys (revenue, churn, ltv, etc.) with a
  // specific shape. Map the raw PBI KPI values to override static metrics.

  const r = rawKPIs; // shorthand

  const fy = r.FY || apiData.fy || '';
  const p = prevKPIs; // shorthand for previous FY

  if (r.PaidRevenue != null) {
    const revYoY = yoy(r.PaidRevenue, p.PaidRevenue);
    metrics.revenue = {
      name: `Revenue (Paid, ${fy || 'AUD'})`, value: Math.round(r.PaidRevenue),
      format: 'currency', yoy: revYoY, trend: revYoY > 0 ? 'up' : revYoY < 0 ? 'down' : 'flat',
      status: 'healthy', source: 'api',
      detail: `Total incl. free: $${(r.TotalRevenue / 1e6).toFixed(1)}M | Gross: $${(r.GrossSales / 1e6).toFixed(1)}M`
    };
  } else if (r.TotalRevenue != null) {
    const revYoY = yoy(r.TotalRevenue, p.TotalRevenue);
    metrics.revenue = {
      name: `Revenue (${fy || 'AUD'})`, value: Math.round(r.TotalRevenue),
      format: 'currency', yoy: revYoY, trend: revYoY > 0 ? 'up' : 'flat',
      status: 'healthy', source: 'api'
    };
  }

  if (r.CancelledSubs != null && r.NewSubs > 0) {
    const churnRate = Math.round((r.CancelledSubs / r.NewSubs) * 1000) / 10;
    const prevChurn = (p.CancelledSubs && p.NewSubs) ? (p.CancelledSubs / p.NewSubs) * 100 : null;
    metrics.churn = {
      name: `Churn Rate (${fy})`, value: churnRate,
      format: 'pct', yoy: prevChurn ? (churnRate - prevChurn) / Math.abs(prevChurn) : null,
      trend: churnRate > 40 ? 'up' : 'down',
      status: churnRate > 50 ? 'critical' : churnRate > 35 ? 'warning' : 'healthy',
      source: 'api',
      detail: `${(r.CancelledSubs || 0).toLocaleString()} cancelled / ${(r.NewSubs || 0).toLocaleString()} new subs in ${fy}`
    };
  }

  if (r.ActiveCoffeeSubs != null) {
    metrics.active_subs = {
      name: 'Active Coffee Subs', value: r.ActiveCoffeeSubs,
      format: 'number', trend: 'up', status: 'healthy', source: 'api',
      detail: `Active: ${(r.ActiveSubs || 0).toLocaleString()} + Paused: ${(r.PausedSubs || 0).toLocaleString()}`
    };
  }

  if (r.PaidRevenue != null && r.ActiveCoffeeSubs > 0) {
    const ltv = Math.round(r.PaidRevenue / r.ActiveCoffeeSubs);
    const prevLtv = (p.PaidRevenue && p.ActiveCoffeeSubs) ? p.PaidRevenue / p.ActiveCoffeeSubs : null;
    metrics.ltv = {
      name: `Revenue per Sub (${fy})`, value: ltv,
      format: 'currency', yoy: yoy(ltv, prevLtv),
      trend: yoy(ltv, prevLtv) > 0 ? 'up' : 'flat',
      status: ltv > 400 ? 'healthy' : 'warning',
      source: 'api',
      detail: `$${(r.PaidRevenue / 1e6).toFixed(1)}M paid / ${r.ActiveCoffeeSubs.toLocaleString()} active`
    };
  }

  if (r.TotalOrders != null) {
    const ordYoY = yoy(r.TotalOrders, p.TotalOrders);
    metrics.total_orders = {
      name: `Orders (${fy})`, value: r.TotalOrders,
      format: 'number', yoy: ordYoY, trend: ordYoY > 0 ? 'up' : 'flat',
      status: 'healthy', source: 'api'
    };
  }

  if (r.PaidBags != null) {
    const bagYoY = yoy(r.PaidBags, p.PaidBags);
    metrics.bags_shipped = {
      name: `Paid Bags (${fy})`, value: r.PaidBags,
      format: 'number', yoy: bagYoY, trend: bagYoY > 0 ? 'up' : 'flat',
      status: 'healthy', source: 'api',
      detail: `Total incl. free: ${(r.TotalBags || 0).toLocaleString()} | ${((r.TotalBagsKG || 0) / 1000).toFixed(0)} tonnes`
    };
  } else if (r.TotalBags != null) {
    metrics.bags_shipped = {
      name: `Bags Shipped (${fy})`, value: r.TotalBags,
      format: 'number', yoy: yoy(r.TotalBags, p.TotalBags),
      trend: 'up', status: 'healthy', source: 'api'
    };
  }

  if (r.AvgOrderValue != null) {
    const aovYoY = yoy(r.AvgOrderValue, p.AvgOrderValue);
    metrics.avg_order_value = {
      name: `Avg Order Value (${fy})`, value: Math.round(r.AvgOrderValue * 100) / 100,
      format: 'currency', yoy: aovYoY, trend: aovYoY > 0 ? 'up' : 'flat',
      status: 'healthy', source: 'api'
    };
  }

  if (r.FTBPOrders != null && r.TotalOrders > 0) {
    const ftbpPct = Math.round((r.FTBPOrders / r.TotalOrders) * 1000) / 10;
    metrics.ftbp_revenue_share = {
      name: `FTBP Share (${fy})`, value: Math.min(ftbpPct, 100),
      format: 'pct', trend: 'up', status: ftbpPct > 35 ? 'warning' : 'healthy',
      source: 'api',
      detail: `${(r.FTBPOrders || 0).toLocaleString()} FTBP / ${(r.TotalOrders || 0).toLocaleString()} total orders`
    };
  }

  if (r.NewSubs != null && r.CancelledSubs != null) {
    const net = (r.NewSubs || 0) - (r.CancelledSubs || 0);
    const prevNet = (p.NewSubs && p.CancelledSubs) ? p.NewSubs - p.CancelledSubs : null;
    metrics.net_subscriber_growth = {
      name: `Net New Subs (${fy})`, value: net,
      format: 'number', yoy: yoy(net, prevNet),
      trend: net > 0 ? 'up' : 'down',
      status: net > 0 ? 'healthy' : 'critical', source: 'api',
      detail: `${(r.NewSubs || 0).toLocaleString()} new - ${(r.CancelledSubs || 0).toLocaleString()} cancelled in ${fy}`
    };
  }

  return {
    metrics,
    source: 'api',
    fy: apiData.fy || null,
    prevFy: apiData.prevFy || null,
    fyComparison,
    datasetId: apiData.datasetId,
    datasetName: apiData.datasetName,
    refreshedAt: apiData.refreshedAt,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Read the latest pbi-live.json from the intelligence directory.
 * Returns null if not found or empty.
 */
function readPBILiveData(intelDir) {
  try {
    const pbiPath = path.join(intelDir, 'pbi-live.json');
    if (!fs.existsSync(pbiPath)) return null;
    const data = JSON.parse(fs.readFileSync(pbiPath, 'utf-8'));
    if (!data.metrics) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  parseMetricValue,
  parseYoY,
  readLatestExtraction,
  readPreviousExtraction,
  buildLiveMetrics,
  buildLiveMetricsFromAPI,
  readPBILiveData,
  buildFreshnessReport,
  listExtractions
};
