// ===============================================================
// METRICS MODULE — Genie-Powered Executive Dashboard
// ===============================================================

var _metricsData = null;
var _metricsLoading = false;
var _genieStatus = null;
var _sliceData = null;
var _sliceLoading = false;
var _genieViewData = {}; // per-view cached render data

function loadMetricsEngine(fy) {
  if (_metricsLoading) return;
  _metricsLoading = true;
  renderAll();
  var period = fy ? 'FY' + fy : (state._metricsPeriod || 'FY26');
  // Load from /api/metrics (Power BI + static).
  // When Databricks token is configured, Genie will be used automatically via /api/genie/kpis.
  fetch('/api/metrics' + (fy ? '?fy=' + fy : '')).then(function(r){return r.json();}).then(function(d) {
    _metricsData = { metrics: d.metrics, source: d.source || 'static', period: period };
    _metricsLoading = false;
    // Check Genie status in background — if configured, overlay with live data
    metricsAPI.getStatus().then(function(status) {
      _genieStatus = status;
      if (status && status.configured) {
        metricsAPI.fetchKPIs(period).then(function(gd) {
          if (gd && gd.metrics && Object.keys(gd.metrics).length > 0) {
            _metricsData = gd;
            renderAll();
          }
        }).catch(function() {});
      }
    }).catch(function() {});
    renderAll();
  }).catch(function() { _metricsLoading = false; renderAll(); });
}

function _mEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _mFmtVal(val, fmt) {
  if (val == null || val === undefined) return '--';
  if (fmt === 'currency') return '$' + (Math.abs(val) >= 1000000 ? (val/1000000).toFixed(1) + 'M' : Math.abs(val) >= 1000 ? (val/1000).toFixed(1) + 'K' : val.toLocaleString());
  if (fmt === 'pct') return val + '%';
  if (fmt === 'days') return val.toFixed(1) + 'd';
  if (fmt === 'number') return val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(1) + 'K' : val.toLocaleString();
  return String(val);
}
function _mFmtDelta(val) {
  if (val == null) return '';
  var sign = val > 0 ? '+' : '';
  return sign + Math.round(val) + '%';
}

// ── Sidebar ──────────────────────────────────────────────────
function renderMetricsSidebar() {
  var sb = $('sidebar');
  if (!state._metricsView) state._metricsView = 'dashboard';
  if (!state._metricsPeriod) state._metricsPeriod = 'FY26';
  if (!state._metricsMarket) state._metricsMarket = '';

  var views = [
    { id: 'dashboard', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', label: 'Dashboard' },
    { id: 'revenue', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>', label: 'Revenue' },
    { id: 'subscribers', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', label: 'Subscribers' },
    { id: 'ftbp', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', label: 'FTBP' },
    { id: 'markets', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>', label: 'Markets' },
    { id: 'roasters', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>', label: 'Roasters' },
    { id: 'sla', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4a2 2 0 012 2v6a2 2 0 01-2 2h-4"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/></svg>', label: 'SLA' },
    { id: 'explore', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M3 14h7v7H3z"/><path d="M17 14v7"/><path d="M14 17h7"/></svg>', label: 'Explore' }
  ];

  var nav = views.map(function(v) {
    return '<div class="ca-sb-nav-item' + (state._metricsView === v.id ? ' active' : '') + '"' +
      ' onclick="state._metricsView=\'' + v.id + '\';_genieViewData._lastKey=null;renderAll()">' +
      '<span class="ca-sb-nav-icon">' + v.icon + '</span><span>' + v.label + '</span></div>';
  }).join('');

  // Period selector
  var periods = ['FY24','FY25','FY26','CY24','CY25'];
  var periodBtns = periods.map(function(p) {
    var active = state._metricsPeriod === p ? ' style="background:var(--ac);color:#fff"' : '';
    return '<button class="btn btn-sm btn-s"' + active + ' onclick="_mSetPeriod(\'' + p + '\')">' + p + '</button>';
  }).join('');

  // Market filter
  var markets = ['','AU','UK','US','DE','NL'];
  var marketBtns = markets.map(function(m) {
    var label = m || 'All';
    var active = state._metricsMarket === m ? ' style="background:var(--ac);color:#fff"' : '';
    return '<button class="btn btn-sm btn-s"' + active + ' onclick="_mSetMarket(\'' + m + '\')">' + label + '</button>';
  }).join('');

  // Source badge
  var source = _metricsData ? (_metricsData.source || 'static') : 'loading';
  var srcColor = source === 'genie' ? 'var(--gn)' : source === 'api' ? 'var(--cy)' : source === 'static' ? 'var(--tx3)' : 'var(--or)';

  // Quick KPIs
  var kpis = '';
  if (_metricsData && _metricsData.metrics) {
    var md = _metricsData.metrics;
    var rev = md.revenue || {};
    var subs = md.active_subs || md.net_subscriber_growth || {};
    kpis = '<div class="ca-sb-stats">' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--gn)">' + _mFmtVal(rev.value, rev.format || 'currency') + '</span><span class="ca-sb-stat-label">Revenue</span></div>' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--ac)">' + _mFmtVal(subs.value, subs.format || 'number') + '</span><span class="ca-sb-stat-label">Subs</span></div>' +
    '</div>';
  }

  sb.innerHTML = '<div class="ca-sb">' +
    '<div class="ca-sb-date"><div class="ca-sb-date-label">Data Source</div>' +
      '<div class="ca-sb-date-val" style="font-size:var(--f-md)"><span style="color:' + srcColor + '">&#9679;</span> ' + source + ' &middot; ' + state._metricsPeriod + '</div></div>' +
    '<div class="ca-sb-date" style="margin-top:var(--sp2)"><div class="ca-sb-date-label">Period</div>' +
      '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' + periodBtns + '</div></div>' +
    '<div class="ca-sb-date" style="margin-top:var(--sp2)"><div class="ca-sb-date-label">Market</div>' +
      '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' + marketBtns + '</div></div>' +
    '<div class="ca-sb-nav">' + nav + '</div>' +
    kpis +
    '<button class="ca-sb-refresh" onclick="_mRefresh()" style="margin-top:auto">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
      ' Refresh Data</button>' +
  '</div>';

  if (!_metricsData && !_metricsLoading) loadMetricsEngine();
}

// ── Main Content Dispatch ────────────────────────────────────
function renderMetricsMain() {
  var el = $('main');
  if (_metricsLoading && !_metricsData) {
    el.innerHTML = '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading metrics from ' + (state._metricsPeriod || 'FY26') + '...</p></div>';
    return;
  }
  if (!_metricsData) {
    el.innerHTML = '<div class="ca-loading"><p>No metrics data. Click Refresh to load.</p></div>';
    return;
  }

  switch (state._metricsView) {
    case 'revenue': el.innerHTML = _mRenderRevenue(); break;
    case 'subscribers': el.innerHTML = _mRenderSubscribers(); break;
    case 'ftbp': el.innerHTML = _mRenderFTBP(); break;
    case 'markets': el.innerHTML = _mRenderMarkets(); break;
    case 'roasters': el.innerHTML = _mRenderRoasters(); break;
    case 'sla': el.innerHTML = _mRenderSLA(); break;
    case 'explore': el.innerHTML = _mRenderExplore(); break;
    default: el.innerHTML = _mRenderDashboard(); break;
  }

  // Lazy-load view-specific data from Genie
  _mLoadViewData();
}

// ── Dashboard View ───────────────────────────────────────────
function _mRenderDashboard() {
  var m = _metricsData.metrics || {};

  var kpiDefs = [
    { key: 'revenue', color: 'var(--gn)', drillDim: 'market', drillMetric: 'revenue' },
    { key: 'churn_rate', altKey: 'churn', color: 'var(--rd)', drillDim: 'month', drillMetric: 'cancellations' },
    { key: 'ltv', color: 'var(--or)', drillDim: 'market', drillMetric: 'revenue' },
    { key: 'ftbp_conversion', color: 'var(--ac)', drillDim: 'month', drillMetric: 'revenue' },
    { key: 'delivery_sla', color: 'var(--cy)', drillDim: 'market', drillMetric: 'lead_time' },
    { key: 'active_subs', altKey: 'net_subscriber_growth', color: 'var(--pu)', drillDim: 'market', drillMetric: 'subscriptions' },
    { key: 'bags_shipped', color: 'var(--gn)', drillDim: 'market', drillMetric: 'bags' },
    { key: 'ftbp_revenue_share', color: 'var(--or)', drillDim: 'program', drillMetric: 'revenue' }
  ];

  var cards = '<div class="mt-kpi-grid">';
  kpiDefs.forEach(function(kpi) {
    var metric = m[kpi.key] || (kpi.altKey ? m[kpi.altKey] : null);
    if (!metric) return;
    cards += _mKPICard(metric, kpi.color, kpi.drillDim, kpi.drillMetric);
  });
  cards += '</div>';

  // Revenue trend (from async Genie load)
  var vd = _genieViewData.dashboard || {};
  var revChart = '';
  if (vd.revenueTrend && vd.revenueTrend.length > 1) {
    revChart = '<div class="ca-section"><div class="ca-section-title">Revenue Trend (' + state._metricsPeriod + ')</div>' +
      '<div class="ca-chart-wrap">' + trendLine(vd.revenueTrend, { width: 600, height: 200, color: 'var(--gn)', yFormat: function(v){return '$'+(v/1000).toFixed(0)+'K';} }) + '</div></div>';
  } else {
    revChart = _mLoadingSection('Loading revenue trend...');
  }

  var mixChart = '';
  if (vd.revenueMix && vd.revenueMix.length) {
    mixChart = '<div class="ca-section"><div class="ca-section-title">Revenue by Market</div>' +
      barChart(vd.revenueMix, { barHeight: 28, gap: 6, formatVal: function(v){return '$'+(v/1000000).toFixed(2)+'M';} }) + '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Executive Metrics</h2>' + _mSourceBadge() + '</div>' +
    cards + '<div style="display:flex;gap:var(--sp4);flex-wrap:wrap">' + revChart + mixChart + '</div></div>';
}

function _mKPICard(metric, color, drillDim, drillMetric) {
  var statusColor = metric.status === 'healthy' || metric.status === 'positive' ? 'var(--gn)' :
                    metric.status === 'critical' ? 'var(--rd)' :
                    metric.status === 'warning' ? 'var(--or)' : 'var(--tx3)';
  var trendArrow = metric.trend === 'up' ? '&#9650;' : metric.trend === 'down' ? '&#9660;' : '&#8212;';
  var yoyStr = metric.yoy != null ? _mFmtDelta(metric.yoy * 100) + ' YoY' : '';
  var drill = drillDim ? ' onclick="_mDrillDown(\'' + drillDim + '\',\'' + drillMetric + '\')" style="cursor:pointer" title="Click to explore"' : '';

  return '<div class="mt-kpi-card"' + drill + '>' +
    '<div class="mt-kpi-header"><span class="mt-kpi-name">' + _mEnc(metric.name) + '</span>' +
      '<span class="mt-kpi-status" style="background:' + statusColor + '">' + _mEnc(metric.status || '') + '</span></div>' +
    '<div class="mt-kpi-value" style="color:' + color + '">' + _mFmtVal(metric.value, metric.format) + '</div>' +
    '<div class="mt-kpi-meta"><span style="color:' + statusColor + '">' + trendArrow + ' ' + yoyStr + '</span></div>' +
    (metric.detail ? '<div class="mt-kpi-detail">' + _mEnc(metric.detail) + '</div>' : '') +
  '</div>';
}

// ── Revenue View ─────────────────────────────────────────────
function _mRenderRevenue() {
  var vd = _genieViewData.revenue || {};
  var period = state._metricsPeriod;

  var topCards = '<div class="ca-grid">';
  if (vd.total != null) {
    topCards += _mCard('Total Revenue', _mFmtVal(vd.total, 'currency'), 'var(--gn)');
    if (vd.yoyGrowth != null) topCards += _mCard('YoY Growth', _mFmtDelta(vd.yoyGrowth), vd.yoyGrowth > 0 ? 'var(--gn)' : 'var(--rd)');
  } else {
    topCards += _mCard(period + ' Revenue', '--', 'var(--tx3)');
  }
  topCards += '</div>';

  var trendChart = '';
  if (vd.trend && vd.trend.length > 1) {
    trendChart = '<div class="ca-section"><div class="ca-section-title">Monthly Revenue (' + period + ')</div>' +
      '<div class="ca-chart-wrap">' + trendLine(vd.trend, { width: 600, height: 200, color: 'var(--gn)', yFormat: function(v){return '$'+(v/1000).toFixed(0)+'K';} }) + '</div></div>';
  } else {
    trendChart = _mLoadingSection('Revenue trend loading...');
  }

  var marketChart = '';
  if (vd.byMarket && vd.byMarket.length) {
    marketChart = '<div class="ca-section"><div class="ca-section-title">Revenue by Market</div>' +
      barChart(vd.byMarket, { barHeight: 28, gap: 6, formatVal: function(v){return '$'+(v/1000000).toFixed(2)+'M';} }) + '</div>';
  }

  var programChart = '';
  if (vd.byProgram && vd.byProgram.length) {
    programChart = '<div class="ca-section"><div class="ca-section-title">Revenue by Program</div>' +
      barChart(vd.byProgram, { barHeight: 28, gap: 6, formatVal: function(v){return '$'+(v/1000000).toFixed(2)+'M';} }) + '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Revenue Analysis</h2>' + _mSourceBadge() + '</div>' +
    topCards + trendChart +
    '<div style="display:flex;gap:var(--sp4);flex-wrap:wrap">' + marketChart + programChart + '</div></div>';
}

// ── Subscribers View ─────────────────────────────────────────
function _mRenderSubscribers() {
  var vd = _genieViewData.subscribers || {};

  var cards = '<div class="ca-grid">';
  cards += _mCard('Active Subs', vd.activeSubs != null ? _mFmtVal(vd.activeSubs, 'number') : '--', 'var(--ac)');
  cards += _mCard('New Subs', vd.newSubs != null ? _mFmtVal(vd.newSubs, 'number') : '--', 'var(--gn)');
  cards += _mCard('Cancelled', vd.cancelled != null ? _mFmtVal(vd.cancelled, 'number') : '--', 'var(--rd)');
  cards += _mCard('Net Growth', vd.netGrowth != null ? _mFmtVal(vd.netGrowth, 'number') : '--', 'var(--or)');
  cards += _mCard('Churn Rate', vd.churnRate != null ? vd.churnRate + '%' : '--', 'var(--rd)');
  cards += _mCard('Avg LTV', vd.avgLtv != null ? _mFmtVal(vd.avgLtv, 'currency') : '--', 'var(--or)');
  cards += '</div>';

  var trendChart = '';
  if (vd.trend && vd.trend.length > 1) {
    trendChart = '<div class="ca-section"><div class="ca-section-title">Subscriptions (Monthly)</div>' +
      '<div class="ca-chart-wrap">' + trendLine(vd.trend, { width: 600, height: 200, color: 'var(--ac)' }) + '</div></div>';
  } else {
    trendChart = _mLoadingSection('Subscription trend loading...');
  }

  var byMarket = '';
  if (vd.byMarket && vd.byMarket.length) {
    byMarket = '<div class="ca-section"><div class="ca-section-title">Active Subs by Market</div>' +
      barChart(vd.byMarket, { barHeight: 28, gap: 6 }) + '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Subscriber Health</h2>' + _mSourceBadge() + '</div>' +
    cards + trendChart + byMarket + '</div>';
}

// ── FTBP View ────────────────────────────────────────────────
function _mRenderFTBP() {
  var vd = _genieViewData.ftbp || {};

  var cards = '<div class="ca-grid">';
  cards += _mCard('v2 Registrations', vd.v2Registrations != null ? _mFmtVal(vd.v2Registrations, 'number') : '--', 'var(--ac)');
  cards += _mCard('v2 Conversion', vd.v2Conversion != null ? vd.v2Conversion + '%' : '--', 'var(--gn)');
  cards += _mCard('v1 Conversion', vd.v1Conversion != null ? vd.v1Conversion + '%' : '--', 'var(--tx3)');
  cards += _mCard('Revenue Share', vd.revenueShare != null ? vd.revenueShare + '%' : '--', 'var(--or)');
  cards += '</div>';

  var trendChart = '';
  if (vd.trend && vd.trend.length > 1) {
    trendChart = '<div class="ca-section"><div class="ca-section-title">FTBP Revenue (Monthly)</div>' +
      '<div class="ca-chart-wrap">' + trendLine(vd.trend, { width: 600, height: 200, color: 'var(--ac)' }) + '</div></div>';
  } else {
    trendChart = _mLoadingSection('FTBP trend loading...');
  }

  var convComparison = '';
  if (vd.v1Conversion != null && vd.v2Conversion != null) {
    convComparison = '<div class="ca-section"><div class="ca-section-title">v1 vs v2 Conversion Rate</div>' +
      '<div style="display:flex;gap:var(--sp4);align-items:center;justify-content:center;padding:var(--sp4)">' +
        miniDonut(Math.round(vd.v1Conversion / 20 * 100), { size: 64, strokeWidth: 7, color: 'var(--tx3)', label: vd.v1Conversion + '%' }) +
        '<span style="font-size:var(--f-2xl);color:var(--tx3)">&#8594;</span>' +
        miniDonut(Math.round(vd.v2Conversion / 20 * 100), { size: 64, strokeWidth: 7, color: 'var(--gn)', label: vd.v2Conversion + '%' }) +
      '</div></div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>FTBP Performance</h2>' + _mSourceBadge() + '</div>' +
    cards + trendChart + convComparison + '</div>';
}

// ── Markets View ─────────────────────────────────────────────
function _mRenderMarkets() {
  var vd = _genieViewData.markets || {};

  var cards = '<div class="ca-grid">';
  cards += _mCard('Active Markets', '5 (AU, UK, US, DE, NL)', 'var(--ac)');
  if (vd.avgSLA != null) cards += _mCard('Avg Lead Time', vd.avgSLA + 'd', 'var(--or)');
  cards += '</div>';

  var deliveryChart = '';
  if (vd.deliveryByMarket && vd.deliveryByMarket.length) {
    deliveryChart = '<div class="ca-section"><div class="ca-section-title">Avg Delivery Days by Market</div>' +
      barChart(vd.deliveryByMarket, { barHeight: 28, gap: 6, formatVal: function(v){return v.toFixed(1)+'d';} }) + '</div>';
  } else {
    deliveryChart = _mLoadingSection('Delivery data loading...');
  }

  var revenueChart = '';
  if (vd.revenueByMarket && vd.revenueByMarket.length) {
    revenueChart = '<div class="ca-section"><div class="ca-section-title">Revenue by Market</div>' +
      barChart(vd.revenueByMarket, { barHeight: 28, gap: 6, formatVal: function(v){return '$'+(v/1000000).toFixed(2)+'M';} }) + '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Market Performance</h2>' + _mSourceBadge() + '</div>' +
    cards + '<div style="display:flex;gap:var(--sp4);flex-wrap:wrap">' + deliveryChart + revenueChart + '</div></div>';
}

// ── Roasters View (NEW) ──────────────────────────────────────
function _mRenderRoasters() {
  var vd = _genieViewData.roasters || {};

  var cards = '<div class="ca-grid">';
  cards += _mCard('Active Roasters', vd.roasterCount != null ? String(vd.roasterCount) : '--', 'var(--ac)');
  cards += _mCard('Avg MOT Achievement', vd.avgMOT != null ? vd.avgMOT + '%' : '--', 'var(--gn)');
  cards += '</div>';

  var revenueChart = '';
  if (vd.revenueByRoaster && vd.revenueByRoaster.length) {
    revenueChart = '<div class="ca-section"><div class="ca-section-title">Revenue by Roaster</div>' +
      barChart(vd.revenueByRoaster, { barHeight: 26, gap: 5, maxItems: 15, formatVal: function(v){return '$'+(v/1000).toFixed(0)+'K';} }) + '</div>';
  } else {
    revenueChart = _mLoadingSection('Roaster data loading...');
  }

  var volumeChart = '';
  if (vd.volumeByRoaster && vd.volumeByRoaster.length) {
    volumeChart = '<div class="ca-section"><div class="ca-section-title">Volume (KG) by Roaster</div>' +
      barChart(vd.volumeByRoaster, { barHeight: 26, gap: 5, maxItems: 15, formatVal: function(v){return (v/1000).toFixed(1)+'t';} }) + '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Roaster Performance</h2>' + _mSourceBadge() + '</div>' +
    cards + '<div style="display:flex;gap:var(--sp4);flex-wrap:wrap">' + revenueChart + volumeChart + '</div></div>';
}

// ── SLA View (NEW) ───────────────────────────────────────────
function _mRenderSLA() {
  var vd = _genieViewData.sla || {};

  var cards = '<div class="ca-grid">';
  cards += _mCard('Avg Lead Time', vd.avgLeadTime != null ? vd.avgLeadTime.toFixed(1) + 'd' : '--', 'var(--or)');
  cards += _mCard('Total Shipments', vd.totalShipments != null ? _mFmtVal(vd.totalShipments, 'number') : '--', 'var(--ac)');
  cards += '</div>';

  var byMarketChart = '';
  if (vd.byMarket && vd.byMarket.length) {
    byMarketChart = '<div class="ca-section"><div class="ca-section-title">Lead Time by Market</div>' +
      barChart(vd.byMarket, { barHeight: 28, gap: 6, formatVal: function(v){return v.toFixed(1)+'d';} }) + '</div>';
  } else {
    byMarketChart = _mLoadingSection('SLA data loading...');
  }

  var carrierChart = '';
  if (vd.byCarrier && vd.byCarrier.length) {
    carrierChart = '<div class="ca-section"><div class="ca-section-title">Performance by Carrier</div>' +
      barChart(vd.byCarrier, { barHeight: 28, gap: 6, formatVal: function(v){return v.toFixed(1)+'d';} }) + '</div>';
  }

  var trendChart = '';
  if (vd.trend && vd.trend.length > 1) {
    trendChart = '<div class="ca-section"><div class="ca-section-title">Lead Time Trend (Monthly)</div>' +
      '<div class="ca-chart-wrap">' + trendLine(vd.trend, { width: 600, height: 200, color: 'var(--or)' }) + '</div></div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Delivery SLA</h2>' + _mSourceBadge() + '</div>' +
    cards + '<div style="display:flex;gap:var(--sp4);flex-wrap:wrap">' + byMarketChart + carrierChart + '</div>' + trendChart + '</div>';
}

// ── Explore View ─────────────────────────────────────────────
function _mRenderExplore() {
  if (!state._sliceDim) state._sliceDim = 'market';
  if (!state._sliceMetric) state._sliceMetric = 'revenue';

  var dims = [
    { id: 'market', label: 'Market' }, { id: 'month', label: 'Month' }, { id: 'fy', label: 'Fiscal Year' },
    { id: 'quarter', label: 'Quarter' }, { id: 'program', label: 'Program' }, { id: 'roaster', label: 'Roaster' },
    { id: 'carrier', label: 'Carrier' }, { id: 'cohort', label: 'Cohort' }, { id: 'status', label: 'Sub Status' },
    { id: 'reason', label: 'Cancel Reason' }
  ];
  var metrics = [
    { id: 'revenue', label: 'Revenue (AUD)' }, { id: 'bags', label: 'Bags Shipped' },
    { id: 'kg', label: 'Volume (KG)' }, { id: 'subscriptions', label: 'Active Subs' },
    { id: 'cancellations', label: 'Cancellations' }, { id: 'lead_time', label: 'Avg Lead Time' }
  ];
  var markets = ['', 'AU', 'UK', 'US', 'DE', 'NL'];

  var filterBar = '<div class="mt-explore-filters">' +
    _mSelectFilter('Dimension', dims, state._sliceDim, '_sliceSetDim') +
    _mSelectFilter('Metric', metrics, state._sliceMetric, '_sliceSetMetric') +
    '<div class="mt-filter-group"><label class="mt-filter-label">Market</label>' +
      '<select class="mt-filter-select" onchange="_sliceSetFilter(\'market\',this.value)">' +
      markets.map(function(m){return '<option value="'+m+'"'+(state._sliceMarket===m?' selected':'')+'>'+( m||'All')+'</option>';}).join('') +
      '</select></div>' +
    '<button class="mt-filter-btn" onclick="_sliceRun()">Query</button>' +
  '</div>';

  var results = '';
  if (_sliceLoading) {
    results = '<div class="ca-loading"><div class="ca-spinner"></div><p>Querying Databricks...</p></div>';
  } else if (_sliceData && _sliceData.error) {
    results = '<div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg)">' +
      '<div class="ca-narrative-label" style="color:var(--rd)">Query Error</div><p>' + _mEnc(_sliceData.error) + '</p></div>';
  } else if (_sliceData && _sliceData.rows) {
    var rows = _sliceData.rows;
    var chartData = rows.map(function(r) {
      var dimVal = r.dim != null ? r.dim : r[Object.keys(r)[0]];
      var metVal = r.value != null ? r.value : r[Object.keys(r)[1]];
      return { label: String(dimVal || '?'), value: parseFloat(metVal) || 0, color: _sliceColor(String(dimVal || '')) };
    }).sort(function(a,b){return b.value - a.value;});

    var total = chartData.reduce(function(s,d){return s + d.value;}, 0);
    var fmt = state._sliceMetric === 'revenue' ? 'currency' : state._sliceMetric === 'lead_time' ? 'days' : 'number';

    results = '<div class="ca-grid" style="margin-bottom:var(--sp3)">' +
      _mCard('Total', _mFmtVal(total, fmt), 'var(--ac)') +
      (chartData[0] ? _mCard('Top: ' + chartData[0].label, _mFmtVal(chartData[0].value, fmt), 'var(--gn)') : '') +
      _mCard('Items', String(chartData.length), 'var(--tx2)') +
    '</div>';

    if (chartData.length) {
      results += '<div class="ca-section"><div class="ca-section-title">' + _mEnc(state._sliceMetric) + ' by ' + _mEnc(state._sliceDim) +
        (_sliceData.source ? ' <span style="color:var(--tx3);font-size:var(--f-xs)">(' + _sliceData.source + ')</span>' : '') +
        '</div>' +
        barChart(chartData, { barHeight: 30, gap: 8, formatVal: function(v){return _mFmtVal(v, fmt);} }) + '</div>';
    }

    if (_sliceData.sql) {
      results += '<details style="margin-top:var(--sp3)"><summary style="font-size:var(--f-xs);color:var(--tx3);cursor:pointer">View SQL</summary>' +
        '<pre style="background:var(--s2);padding:var(--sp3);border-radius:var(--r2);font-size:11px;overflow-x:auto;margin-top:var(--sp2)">' + _mEnc(_sliceData.sql) + '</pre></details>';
    }

    if (_sliceData.columns && rows.length) {
      var cols = _sliceData.columns;
      results += '<div class="ca-section"><div class="ca-section-title">Raw Data (' + rows.length + ' rows)</div>' +
        '<div class="mt-data-table"><table><thead><tr>' +
        cols.map(function(c){return '<th>'+_mEnc(c)+'</th>';}).join('') + '</tr></thead><tbody>' +
        rows.slice(0,50).map(function(row){
          return '<tr>' + cols.map(function(c){var v=row[c];return '<td>'+(v!=null?_mEnc(String(v)):'--')+'</td>';}).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }
  } else {
    results = '<div class="ca-narrative"><div class="ca-narrative-label">Explore</div>' +
      '<p>Select a dimension and metric, then click <b>Query</b> to slice your Databricks data.</p></div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Explore Metrics</h2>' + _mSourceBadge() + '</div>' +
    filterBar + results + '</div>';
}

// ── Async Data Loading for Views ─────────────────────────────
function _mLoadViewData() {
  // Skip Genie API calls when not configured — views will show "--" values from KPI fallback
  if (!_genieStatus || !_genieStatus.configured) return;

  var view = state._metricsView || 'dashboard';
  var period = state._metricsPeriod || 'FY26';
  var market = state._metricsMarket || '';
  var filters = market ? { market: market } : {};
  var vdKey = view + ':' + period + ':' + market;

  if (_genieViewData._lastKey === vdKey) return;
  _genieViewData._lastKey = vdKey;

  if (view === 'dashboard') {
    metricsAPI.fetchTimeSeries('revenue', 'month', period, filters).then(function(d) {
      if (d && d.series) _genieViewData.dashboard = Object.assign(_genieViewData.dashboard || {}, { revenueTrend: d.series });
      renderMetricsMain();
    });
    metricsAPI.fetchBreakdown('revenue', 'market', period, filters).then(function(d) {
      if (d && d.rows) _genieViewData.dashboard = Object.assign(_genieViewData.dashboard || {}, {
        revenueMix: d.rows.map(function(r){return { label: r.dim, value: r.value, color: _sliceColor(r.dim) };})
      });
      renderMetricsMain();
    });
  } else if (view === 'revenue') {
    Promise.all([
      metricsAPI.fetchTimeSeries('revenue', 'month', period, filters),
      metricsAPI.fetchBreakdown('revenue', 'market', period, filters),
      metricsAPI.fetchBreakdown('revenue', 'program', period, filters)
    ]).then(function(results) {
      var ts = results[0], mkts = results[1], progs = results[2];
      _genieViewData.revenue = {
        total: mkts && mkts.total ? mkts.total : null,
        trend: ts && ts.series ? ts.series : null,
        byMarket: mkts && mkts.rows ? mkts.rows.map(function(r){return {label:r.dim,value:r.value,color:_sliceColor(r.dim)};}) : null,
        byProgram: progs && progs.rows ? progs.rows.map(function(r){return {label:r.dim,value:r.value,color:_sliceColor(r.dim)};}) : null
      };
      renderMetricsMain();
    });
  } else if (view === 'subscribers') {
    Promise.all([
      metricsAPI.fetchBreakdown('subscriptions', 'market', period, filters),
      metricsAPI.fetchTimeSeries('subscriptions', 'month', period, filters)
    ]).then(function(results) {
      var mkts = results[0], ts = results[1];
      _genieViewData.subscribers = {
        activeSubs: mkts && mkts.total ? mkts.total : null,
        trend: ts && ts.series ? ts.series : null,
        byMarket: mkts && mkts.rows ? mkts.rows.map(function(r){return {label:r.dim,value:r.value,color:_sliceColor(r.dim)};}) : null
      };
      renderMetricsMain();
    });
  } else if (view === 'ftbp') {
    metricsAPI.fetchTimeSeries('revenue', 'month', period, Object.assign({}, filters, { program: 'FTBP' })).then(function(d) {
      _genieViewData.ftbp = { trend: d && d.series ? d.series : null };
      renderMetricsMain();
    });
  } else if (view === 'markets') {
    Promise.all([
      metricsAPI.fetchBreakdown('lead_time', 'market', period, filters),
      metricsAPI.fetchBreakdown('revenue', 'market', period, filters)
    ]).then(function(results) {
      var sla = results[0], rev = results[1];
      _genieViewData.markets = {
        deliveryByMarket: sla && sla.rows ? sla.rows.map(function(r){return {label:r.dim+' ('+r.value.toFixed(1)+'d)',value:r.value,color:r.value>6?'var(--rd)':r.value>5?'var(--or)':'var(--gn)'};}) : null,
        revenueByMarket: rev && rev.rows ? rev.rows.map(function(r){return {label:r.dim,value:r.value,color:_sliceColor(r.dim)};}) : null,
        avgSLA: sla && sla.rows && sla.rows.length ? (sla.rows.reduce(function(s,r){return s+r.value;},0)/sla.rows.length).toFixed(1) : null
      };
      renderMetricsMain();
    });
  } else if (view === 'roasters') {
    Promise.all([
      metricsAPI.fetchBreakdown('revenue', 'roaster', period, filters),
      metricsAPI.fetchBreakdown('kg', 'roaster', period, filters)
    ]).then(function(results) {
      var rev = results[0], vol = results[1];
      _genieViewData.roasters = {
        revenueByRoaster: rev && rev.rows ? rev.rows.map(function(r){return {label:r.dim,value:r.value,color:'var(--ac)'};}) : null,
        volumeByRoaster: vol && vol.rows ? vol.rows.map(function(r){return {label:r.dim,value:r.value,color:'var(--gn)'};}) : null,
        roasterCount: rev && rev.rows ? rev.rows.length : null
      };
      renderMetricsMain();
    });
  } else if (view === 'sla') {
    Promise.all([
      metricsAPI.fetchBreakdown('lead_time', 'market', period, filters),
      metricsAPI.fetchBreakdown('lead_time', 'carrier', period, filters),
      metricsAPI.fetchTimeSeries('lead_time', 'month', period, filters)
    ]).then(function(results) {
      var mkts = results[0], carriers = results[1], ts = results[2];
      _genieViewData.sla = {
        byMarket: mkts && mkts.rows ? mkts.rows.map(function(r){return {label:r.dim,value:r.value,color:r.value>6?'var(--rd)':r.value>5?'var(--or)':'var(--gn)'};}) : null,
        byCarrier: carriers && carriers.rows ? carriers.rows.map(function(r){return {label:r.dim,value:r.value,color:'var(--cy)'};}) : null,
        trend: ts && ts.series ? ts.series : null,
        avgLeadTime: mkts && mkts.rows && mkts.rows.length ? mkts.rows.reduce(function(s,r){return s+r.value;},0)/mkts.rows.length : null,
        totalShipments: mkts && mkts.total ? mkts.total : null
      };
      renderMetricsMain();
    });
  }
}

// ── Shared Helpers ───────────────────────────────────────────
function _mCard(title, value, color) {
  return '<div class="ca-card"><div class="ca-card-title">' + title + '</div><div class="ca-card-value" style="color:' + (color || 'var(--tx)') + '">' + value + '</div></div>';
}

function _mSourceBadge() {
  var src = _metricsData ? (_metricsData.source || 'static') : '?';
  var color = src === 'genie' ? 'var(--gn)' : src === 'api' ? 'var(--cy)' : 'var(--tx3)';
  return '<span style="font-size:var(--f-xs);color:' + color + ';border:1px solid ' + color + ';padding:2px 8px;border-radius:10px;margin-left:var(--sp2)">' + src + '</span>';
}

function _mLoadingSection(msg) {
  if (!_genieStatus || !_genieStatus.configured) {
    return '<div class="ca-section"><div class="ca-narrative" style="min-height:80px"><div class="ca-narrative-label">Connect Databricks</div>' +
      '<p>Add <code>DATABRICKS_HOST</code>, <code>DATABRICKS_TOKEN</code>, and <code>DATABRICKS_GENIE_SPACE_ID</code> to .env to enable live charts.</p></div></div>';
  }
  return '<div class="ca-section"><div class="ca-loading" style="min-height:120px"><div class="ca-spinner"></div><p>' + (msg || 'Loading...') + '</p></div></div>';
}

function _mSelectFilter(label, items, current, onchangeFn) {
  return '<div class="mt-filter-group"><label class="mt-filter-label">' + label + '</label>' +
    '<select class="mt-filter-select" onchange="' + onchangeFn + '(this.value)">' +
    items.map(function(d){return '<option value="'+d.id+'"'+(current===d.id?' selected':'')+'>'+d.label+'</option>';}).join('') +
    '</select></div>';
}

// ── State Setters ────────────────────────────────────────────
function _mSetPeriod(p) {
  state._metricsPeriod = p;
  _metricsData = null;
  _genieViewData = {};
  loadMetricsEngine();
}

function _mSetMarket(m) {
  state._metricsMarket = m;
  _genieViewData = {};
  _genieViewData._lastKey = null;
  renderAll();
}

function _mRefresh() {
  metricsAPI.clearCache();
  _metricsData = null;
  _genieViewData = {};
  _metricsLoading = false;
  loadMetricsEngine();
  if (typeof showToast === 'function') showToast('Refreshing metrics...');
}

function _mDrillDown(dim, metric) {
  state._metricsView = 'explore';
  state._sliceDim = dim;
  state._sliceMetric = metric;
  state._sliceMarket = state._metricsMarket || '';
  _sliceData = null;
  renderAll();
  _sliceRun();
}

function _sliceSetDim(val) { state._sliceDim = val; renderAll(); }
function _sliceSetMetric(val) { state._sliceMetric = val; renderAll(); }
function _sliceSetFilter(key, val) {
  if (key === 'market') state._sliceMarket = val;
  renderAll();
}

function _sliceRun() {
  _sliceLoading = true;
  _sliceData = null;
  renderAll();

  var filters = {};
  if (state._sliceMarket) filters.market = state._sliceMarket;

  metricsAPI.fetchBreakdown(state._sliceMetric, state._sliceDim, state._metricsPeriod || 'FY26', filters).then(function(d) {
    _sliceLoading = false;
    _sliceData = d;
    renderAll();
  }).catch(function(e) {
    _sliceLoading = false;
    _sliceData = { error: e.message };
    renderAll();
  });
}

function _sliceColor(label) {
  var colors = {
    'AU': 'var(--gn)', 'UK': 'var(--cy)', 'US': 'var(--pu)', 'DE': 'var(--or)', 'NL': 'var(--ac)',
    'FTBP': 'var(--ac)', 'Platinum': 'var(--pu)', 'Subscription': 'var(--gn)', 'Beanz': 'var(--cy)', 'Fusion': 'var(--or)',
    'Active': 'var(--gn)', 'Cancelled': 'var(--rd)', 'Paused': 'var(--or)'
  };
  return colors[label] || 'var(--ac)';
}

function _mSwitchFY(fy) { _mSetPeriod('FY' + fy); }

// Legacy support — called from other modules
function loadDigestData() {}
function setCadence() {}
function setDigestView() {}
function loadLearningState() {}
function loadDigestFreshness() {}
