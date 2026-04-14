const path = require('path');
const fs = require('fs');
const { jsonReply, readJSON, latestFolder } = require('../lib/helpers');
const { buildStrategyPayload } = require('../lib/strategy-engine');
const { loadLearningStore, computeInsightWeights } = require('../lib/learning');
const { buildLiveMetrics, buildLiveMetricsFromAPI, readPBILiveData, buildFreshnessReport } = require('../lib/digest-bridge');

/** Read most recent digest data from beanz-digest/output/daily/ */
function readLatestDigest(digestOutput) {
  const dailyDir = path.join(digestOutput, 'daily');
  const latestDate = latestFolder(dailyDir);
  if (!latestDate) return null;

  const folder = path.join(dailyDir, latestDate);
  const kpis = readJSON(path.join(folder, 'kpi_metrics.json'));
  const perf = readJSON(path.join(folder, 'performance.json'));
  const subs = readJSON(path.join(folder, 'subscriptions.json'));

  if (!kpis && !perf && !subs) return null;
  return { date: latestDate, kpis, performance: perf, subscriptions: subs, folder };
}

/** Read previous day's digest for delta comparison */
function readPreviousDigest(digestOutput) {
  const dailyDir = path.join(digestOutput, 'daily');
  try {
    const entries = fs.readdirSync(dailyDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name).sort().reverse();
    if (entries.length < 2) return null;
    const folder = path.join(dailyDir, entries[1]);
    return {
      date: entries[1],
      kpis: readJSON(path.join(folder, 'kpi_metrics.json')),
      performance: readJSON(path.join(folder, 'performance.json'))
    };
  } catch { return null; }
}

module.exports = function handleMetrics(req, res, parts, url, ctx) {
  const powerbi = readJSON(path.join(ctx.intelDir, 'powerbi-context.json'));
  const strategy = buildStrategyPayload();
  const store = loadLearningStore(ctx.learningStore);

  // FY parameter — if provided, metrics should reflect that FY
  const requestedFY = url.searchParams ? url.searchParams.get('fy') : null;

  // Try to load live digest data
  const latestDigest = readLatestDigest(ctx.digestOutput);
  const prevDigest = latestDigest ? readPreviousDigest(ctx.digestOutput) : null;

  // Build live metrics from Power BI extraction output (Playwright scraping)
  const liveMetrics = buildLiveMetrics(ctx.digestOutput);
  const freshness = buildFreshnessReport(ctx.digestOutput);

  // Build live metrics from Power BI REST API (DAX queries via SSO token)
  // If an FY was requested, try to load FY-specific data
  const pbiLiveData = readPBILiveData(ctx.intelDir);
  const apiMetrics = pbiLiveData ? buildLiveMetricsFromAPI(pbiLiveData) : null;

  // Static fallback metrics (from strategy-engine.js)
  const staticMetrics = {
    revenue: {
      name: 'Revenue (CY25)', value: strategy.performance.revenue.cy25, format: 'currency',
      yoy: strategy.performance.revenue.yoy, trend: 'up', status: 'healthy'
    },
    churn: {
      name: 'Annual Churn Rate', value: 42.4, format: 'pct',
      target: 35, trend: 'up', status: 'critical',
      detail: `${strategy.performance.subscribers.cancelled.toLocaleString()} cancelled / ${strategy.performance.subscribers.total.toLocaleString()} total`
    },
    ltv: {
      name: 'Avg LTV', value: strategy.performance.avgLTV.value, format: 'currency',
      yoy: strategy.performance.avgLTV.yoy, trend: 'flat', status: 'warning',
      detail: 'Flat despite 61% revenue growth'
    },
    ftbp_conversion: {
      name: 'FTBP v2 Conversion', value: 16.5, format: 'pct',
      baseline: 11.4, target: 20, trend: 'up', status: 'positive',
      detail: `v2: ${strategy.ftbp.v2.paidCustomers.toLocaleString()} paid from ${strategy.ftbp.v2.signups.toLocaleString()} signups`
    },
    delivery_sla: {
      name: 'Delivery SLA', value: strategy.performance.sla.value, format: 'pct',
      target: 97, yoy: strategy.performance.sla.yoy, trend: 'down', status: 'warning'
    },
    net_subscriber_growth: {
      name: 'Net Subscriber Growth',
      value: strategy.performance.subscribers.new - strategy.performance.subscribers.cancelled,
      format: 'number', trend: 'down', status: 'warning',
      detail: `+${strategy.performance.subscribers.new.toLocaleString()} new, -${strategy.performance.subscribers.cancelled.toLocaleString()} cancelled`
    },
    ftbp_revenue_share: {
      name: 'FTBP Revenue Share', value: strategy.revenueMix.cy25.ftbp, format: 'pct',
      trend: 'up', status: 'warning',
      detail: 'Single-channel risk: 3% to 41% in one year'
    },
    bags_shipped: {
      name: 'Bags Shipped (CY25)', value: strategy.performance.bags.cy25, format: 'number',
      yoy: strategy.performance.bags.yoy, trend: 'up', status: 'healthy'
    }
  };

  // Merge: API data > extraction data > static data (highest priority wins)
  let metrics = { ...staticMetrics };

  // Layer 2: extraction data overrides static
  if (liveMetrics && Object.keys(liveMetrics.metrics).length > 0) {
    for (const [key, val] of Object.entries(liveMetrics.metrics)) {
      if (val) metrics[key] = val;
    }
  }

  // Layer 3 (highest priority): API data overrides everything
  if (apiMetrics && Object.keys(apiMetrics.metrics).length > 0) {
    for (const [key, val] of Object.entries(apiMetrics.metrics)) {
      if (val) metrics[key] = val;
    }
  }

  // Remove any null entries
  for (const [key, val] of Object.entries(metrics)) {
    if (val === null || val === undefined) delete metrics[key];
  }

  const computed = {
    generated: new Date().toISOString(),
    source: apiMetrics ? 'api' : (liveMetrics ? 'live' : (latestDigest ? 'digest' : 'static')),
    extractedAt: apiMetrics?.refreshedAt || liveMetrics?.extractedAt || (latestDigest ? latestDigest.date : null),
    dataAge: liveMetrics?.dataAge || null,
    fy: apiMetrics?.fy || null,
    prevFy: apiMetrics?.prevFy || null,
    fyComparison: apiMetrics?.fyComparison || null,
    apiData: apiMetrics ? { datasetId: apiMetrics.datasetId, datasetName: apiMetrics.datasetName, refreshedAt: apiMetrics.refreshedAt, errors: apiMetrics.errors } : null,
    freshness,
    topMetrics: store.preferences.topMetrics,
    metrics,
    digest: latestDigest ? {
      date: latestDigest.date,
      kpis: latestDigest.kpis,
      performance: latestDigest.performance,
      subscriptions: latestDigest.subscriptions,
      previousDate: prevDigest ? prevDigest.date : null,
      previousKpis: prevDigest ? prevDigest.kpis : null
    } : null,
    liveHighlights: liveMetrics?.highlights || [],
    businessMetrics: powerbi?.meaningful_business_metrics || [],
    alerts: store.metricAlerts.filter(a => a.active)
  };

  return jsonReply(res, 200, computed);
};

module.exports.handleCorrelations = function(req, res, parts, url, ctx) {
  const strategy = buildStrategyPayload();
  const store = loadLearningStore(ctx.learningStore);
  const weights = computeInsightWeights(store);

  // Load live metrics for dynamic correlation enrichment
  const liveMetrics = buildLiveMetrics(ctx.digestOutput);
  const pbiLiveData = readPBILiveData(ctx.intelDir);
  const apiMetrics = pbiLiveData ? buildLiveMetricsFromAPI(pbiLiveData) : null;

  // Merge live metrics (API > extraction > none)
  const lm = {};
  if (liveMetrics && liveMetrics.metrics) Object.assign(lm, liveMetrics.metrics);
  if (apiMetrics && apiMetrics.metrics) Object.assign(lm, apiMetrics.metrics);

  const corrs = strategy.correlations.map(c => {
    const enriched = {
      ...c,
      weight: weights[c.id] || 1,
      pinned: store.pinnedInsights.includes(c.id),
      dismissed: store.dismissedInsights.includes(c.id),
      liveData: null
    };

    // Enrich each correlation with live PBI data
    enriched.liveData = enrichCorrelation(c.id, lm);
    if (enriched.liveData) {
      enriched._hasLiveData = true;
      // Dynamically recompute severity if live data differs significantly
      const sev = recomputeSeverity(c.id, enriched.liveData, c.severity);
      if (sev) enriched.liveSeverity = sev;
    }

    return enriched;
  });

  const sevScore = { critical: 4, warning: 3, opportunity: 2, positive: 1 };
  corrs.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
    return (b.weight * (sevScore[b.severity] || 1)) - (a.weight * (sevScore[a.severity] || 1));
  });

  const dataSource = apiMetrics ? 'api' : (liveMetrics ? 'extraction' : 'static');
  return jsonReply(res, 200, { correlations: corrs, weights, dataSource });
};

/** Enrich a correlation with matching live PBI metrics */
function enrichCorrelation(corId, lm) {
  const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(Math.round(v));
  const fmtPct = v => v !== null && v !== undefined ? (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%' : null;

  switch (corId) {
    case 'COR-1': { // Cancellation Acceleration vs Growth
      const cancel = lm.cancelled_subs;
      const newS = lm.new_subs;
      const net = lm.net_subscriber_growth;
      if (!cancel && !newS) return null;
      return {
        metrics: [
          cancel ? { label: 'Cancellations', value: fmtK(cancel.value), yoy: fmtPct(cancel.yoy), status: cancel.status } : null,
          newS ? { label: 'New Subscribers', value: fmtK(newS.value), yoy: fmtPct(newS.yoy), status: newS.status } : null,
          net ? { label: 'Net Growth', value: (net.value > 0 ? '+' : '') + fmtK(net.value), status: net.status } : null
        ].filter(Boolean),
        summary: cancel && newS ? `Live: ${fmtK(cancel.value)} cancelled (${fmtPct(cancel.yoy)} YoY) vs ${fmtK(newS.value)} new (${fmtPct(newS.yoy)} YoY)` : null
      };
    }
    case 'COR-2': { // Oracle Revenue Over-Index
      const rev = lm.revenue;
      const ltv = lm.ltv;
      if (!rev && !ltv) return null;
      return {
        metrics: [
          rev ? { label: 'Total Revenue', value: '$' + fmtK(rev.value), yoy: fmtPct(rev.yoy), status: rev.status } : null,
          ltv ? { label: 'Avg LTV', value: '$' + Math.round(ltv.value), status: ltv.status } : null
        ].filter(Boolean),
        summary: rev ? `Live Revenue: $${fmtK(rev.value)} (${fmtPct(rev.yoy)} YoY)` : null
      };
    }
    case 'COR-3': { // FTBP v2 Conversion Leap
      const ftbp = lm.ftbp_conversion;
      if (!ftbp) return null;
      return {
        metrics: [
          { label: 'FTBP Conversion', value: ftbp.value + '%', status: ftbp.status },
          ftbp.target ? { label: 'Target', value: ftbp.target + '%' } : null,
          ftbp.baseline ? { label: 'Baseline (v1)', value: ftbp.baseline + '%' } : null
        ].filter(Boolean),
        summary: `Live: ${ftbp.value}% conversion (target: ${ftbp.target || '20'}%)`
      };
    }
    case 'COR-4': { // Large Bag Adoption
      const bags = lm.bags_shipped;
      const kg = lm.kg_shipped;
      if (!bags && !kg) return null;
      return {
        metrics: [
          bags ? { label: 'Bags Shipped', value: fmtK(bags.value), yoy: fmtPct(bags.yoy), status: bags.status } : null,
          kg ? { label: 'KG Shipped', value: fmtK(kg.value), yoy: fmtPct(kg.yoy), status: kg.status } : null
        ].filter(Boolean),
        summary: bags ? `Live: ${fmtK(bags.value)} bags (${fmtPct(bags.yoy)} YoY)` : null
      };
    }
    case 'COR-5': { // DE Delivery Deterioration
      const sla = lm.delivery_sla;
      const cancelByMarket = lm.cancellation_by_market;
      const metrics = [];
      if (sla) metrics.push({ label: 'Delivery SLA', value: sla.value + '%', yoy: fmtPct(sla.yoy), status: sla.status });
      if (cancelByMarket && typeof cancelByMarket.value === 'object' && cancelByMarket.value.DE) {
        metrics.push({ label: 'DE Cancellations', value: fmtK(cancelByMarket.value.DE), status: 'warning' });
      }
      if (metrics.length === 0) return null;
      return { metrics, summary: sla ? `Live SLA: ${sla.value}% (${fmtPct(sla.yoy)} YoY)` : null };
    }
    case 'COR-6': { // Platinum Flywheel
      const rev = lm.revenue;
      if (!rev) return null;
      return {
        metrics: [
          { label: 'Total Revenue', value: '$' + fmtK(rev.value), yoy: fmtPct(rev.yoy), status: rev.status }
        ],
        summary: `Live Revenue: $${fmtK(rev.value)} — Platinum share tracked separately`
      };
    }
    case 'COR-7': { // FTBP Single-Channel Risk
      const ftbpShare = lm.ftbp_revenue_share;
      const rev = lm.revenue;
      const metrics = [];
      if (ftbpShare) metrics.push({ label: 'FTBP Revenue Share', value: ftbpShare.value + '%', status: ftbpShare.status });
      if (rev) metrics.push({ label: 'Total Revenue', value: '$' + fmtK(rev.value), status: rev.status });
      if (metrics.length === 0) return null;
      return { metrics, summary: ftbpShare ? `Live: FTBP is ${ftbpShare.value}% of revenue` : null };
    }
    case 'COR-8': { // LTV Flat While Revenue Grows
      const ltv = lm.ltv;
      const rev = lm.revenue;
      const subs = lm.active_subs;
      const metrics = [];
      if (ltv) metrics.push({ label: 'Avg LTV', value: '$' + Math.round(ltv.value), status: ltv.status });
      if (rev) metrics.push({ label: 'Revenue', value: '$' + fmtK(rev.value), yoy: fmtPct(rev.yoy), status: rev.status });
      if (subs) metrics.push({ label: 'Active Subs', value: fmtK(subs.value), yoy: fmtPct(subs.yoy), status: subs.status });
      if (metrics.length === 0) return null;
      return { metrics, summary: ltv && rev ? `Live: LTV $${Math.round(ltv.value)} while revenue ${fmtPct(rev.yoy)} YoY` : null };
    }
    default: return null;
  }
}

/** Dynamically recompute severity based on live data */
function recomputeSeverity(corId, liveData, baseSeverity) {
  if (!liveData || !liveData.metrics) return null;
  // COR-1: If cancellations are growing faster than new subs, escalate to critical
  if (corId === 'COR-1') {
    const cancel = liveData.metrics.find(m => m.label === 'Cancellations');
    const newS = liveData.metrics.find(m => m.label === 'New Subscribers');
    if (cancel?.yoy && newS?.yoy) {
      const cancelGrowth = parseFloat(cancel.yoy);
      const newGrowth = parseFloat(newS.yoy);
      if (cancelGrowth > newGrowth + 30) return 'critical'; // Cancellations growing much faster
      if (cancelGrowth > newGrowth) return 'warning';
    }
  }
  // COR-3: If FTBP conversion exceeds target, upgrade to positive
  if (corId === 'COR-3') {
    const conv = liveData.metrics.find(m => m.label === 'FTBP Conversion');
    const target = liveData.metrics.find(m => m.label === 'Target');
    if (conv && target) {
      const convVal = parseFloat(conv.value);
      const targetVal = parseFloat(target.value);
      if (convVal >= targetVal) return 'positive';
    }
  }
  // COR-5: If SLA drops below 95%, escalate
  if (corId === 'COR-5') {
    const sla = liveData.metrics.find(m => m.label === 'Delivery SLA');
    if (sla) {
      const slaVal = parseFloat(sla.value);
      if (slaVal < 93) return 'critical';
      if (slaVal < 95) return 'warning';
    }
  }
  return null;
}
