// ===============================================================
// METRICS MODULE — Live Databricks Executive Dashboard
// ===============================================================
//
// All views derive from a single rich snapshot assembled by the
// server's Databricks engine. One fetch, all views.
//
// Views:
//   dashboard   — 6 hero KPIs + trend + market mix + FTBP + cohort + churn + audit + insights
//   revenue     — period rollup (FY24/25/26 + CY24/25) + 13-month waterfall + MoM/YoY
//   subscribers — active pyramid + cohort retention + churn drivers
//   ftbp        — v1 vs v2 programs + conversion + revenue share
//   markets     — revenue + SLA + bags per country + DE warning band
//   roasters    — top 15 revenue + KG + PBB breakdown
//   sla         — current 30d + monthly trend + p95 by country
//   explore     — ad-hoc slice-and-dice with SQL preview

var _metricsSnap = null;
var _metricsLoading = false;
var _metricsHealth = null;
var _sliceData = null;
var _sliceLoading = false;
var _metricsError = null;

// Digest (period-aware) state
var _digestSnap = null;
var _digestLoading = false;
var _digestError = null;

function loadMetricsEngine() {
  if (_metricsLoading) return;
  _metricsLoading = true;
  _metricsError = null;
  renderAll();
  databricksAPI.fetchHealth().then(function(h) {
    _metricsHealth = h;
    if (!h || !h.configured) {
      _metricsLoading = false;
      _metricsError = 'Databricks not configured. Check .env (DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID, DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, DATABRICKS_TENANT_ID).';
      renderAll();
      return;
    }
    return databricksAPI.fetchSnapshot().then(function(snap) {
      _metricsLoading = false;
      if (!snap || snap.error) {
        _metricsError = (snap && snap.error) || 'Snapshot failed';
      } else {
        _metricsSnap = snap;
      }
      renderAll();
    });
  }).catch(function(e) {
    _metricsLoading = false;
    _metricsError = e.message;
    renderAll();
  });
}

// ─── Formatters ──────────────────────────────────────────────
function _mEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _mCur(val) {
  if (val == null || isNaN(val)) return '--';
  var n = Math.abs(val);
  if (n >= 1e6) return '$' + (val/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (val/1e3).toFixed(1) + 'K';
  return '$' + Math.round(val).toLocaleString();
}
function _mNum(val) {
  if (val == null || isNaN(val)) return '--';
  var n = Math.abs(val);
  if (n >= 1e6) return (val/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (val/1e3).toFixed(1) + 'K';
  return Math.round(val).toLocaleString();
}
function _mPct(val, digits) {
  if (val == null || isNaN(val)) return '--';
  return (val).toFixed(digits == null ? 1 : digits) + '%';
}
function _mDays(val) {
  if (val == null || isNaN(val)) return '--';
  return Number(val).toFixed(1) + 'd';
}
function _mDelta(curr, prev, fmt) {
  if (!prev || prev === 0) return '';
  var pct = (curr - prev) / prev * 100;
  var sign = pct > 0 ? '+' : '';
  var color = pct > 0 ? 'var(--gn)' : 'var(--rd)';
  return '<span style="color:' + color + ';font-size:var(--f-xs)">' + sign + pct.toFixed(1) + '%</span>';
}

// ─── Sidebar ─────────────────────────────────────────────────
function renderMetricsSidebar() {
  var sb = $('sidebar');
  if (!state._metricsView) state._metricsView = 'dashboard';
  if (!state._metricsPeriod) state._metricsPeriod = 'FY26';

  var views = [
    { id: 'digest', icon: 'book', label: 'Digest' },
    { id: 'dashboard', icon: 'grid', label: 'Dashboard' },
    { id: 'revenue', icon: 'trend', label: 'Revenue' },
    { id: 'subscribers', icon: 'users', label: 'Subscribers' },
    { id: 'ftbp', icon: 'bolt', label: 'FTBP' },
    { id: 'markets', icon: 'globe', label: 'Markets' },
    { id: 'roasters', icon: 'bean', label: 'Roasters' },
    { id: 'sla', icon: 'truck', label: 'SLA' },
    { id: 'explore', icon: 'search', label: 'Explore' }
  ];
  var iconMap = {
    grid: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    trend: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    bolt:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    bean:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4a2 2 0 012 2v6a2 2 0 01-2 2h-4"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/></svg>',
    search:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    book:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>'
  };

  var nav = views.map(function(v) {
    return '<div class="ca-sb-nav-item' + (state._metricsView === v.id ? ' active' : '') + '"' +
      ' onclick="state._metricsView=\'' + v.id + '\';renderAll()">' +
      '<span class="ca-sb-nav-icon">' + iconMap[v.icon] + '</span><span>' + v.label + '</span></div>';
  }).join('');

  // Source pill
  var sourceLabel = 'loading', sourceColor = 'var(--or)';
  if (_metricsError) { sourceLabel = 'error'; sourceColor = 'var(--rd)'; }
  else if (_metricsSnap && _metricsSnap.source) { sourceLabel = _metricsSnap.source; sourceColor = 'var(--gn)'; }
  else if (_metricsHealth && _metricsHealth.configured) { sourceLabel = _metricsHealth.backend || 'databricks'; sourceColor = 'var(--cy)'; }

  // Freshness
  var fresh = '';
  if (_metricsSnap && _metricsSnap.generatedAt) {
    var ageMin = Math.round((Date.now() - new Date(_metricsSnap.generatedAt).getTime()) / 60000);
    fresh = '<div class="ca-sb-date-val" style="color:var(--tx3);font-size:var(--f-xs)">updated ' + (ageMin < 1 ? 'just now' : ageMin + 'm ago') + '</div>';
  }

  // Quick KPIs
  var kpis = '';
  if (_metricsSnap && _metricsSnap.mtd) {
    kpis = '<div class="ca-sb-stats">' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--gn)">' + _mCur(_metricsSnap.mtd.revenue) + '</span><span class="ca-sb-stat-label">MTD Revenue</span></div>' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--ac)">' + _mNum(_metricsSnap.activeSubs && _metricsSnap.activeSubs.active_total) + '</span><span class="ca-sb-stat-label">Active Subs</span></div>' +
    '</div>';
  }

  // Audit status pill
  var audit = '';
  if (_metricsSnap && _metricsSnap.audit) {
    var a = _metricsSnap.audit;
    var issues = (a.issues || []).length;
    var critical = (a.issues || []).filter(function(i){return i.severity==='critical';}).length;
    var clr = critical ? 'var(--rd)' : issues ? 'var(--or)' : 'var(--gn)';
    var lbl = critical ? critical + ' critical' : issues ? issues + ' warning' : 'clean';
    audit = '<div class="ca-sb-date" style="margin-top:var(--sp2)"><div class="ca-sb-date-label">Data Quality</div>' +
      '<div class="ca-sb-date-val" style="font-size:var(--f-md)"><span style="color:' + clr + '">&#9679;</span> ' + lbl + '</div></div>';
  }

  sb.innerHTML = '<div class="ca-sb">' +
    '<div class="ca-sb-date"><div class="ca-sb-date-label">Data Source</div>' +
      '<div class="ca-sb-date-val" style="font-size:var(--f-md)"><span style="color:' + sourceColor + '">&#9679;</span> ' + sourceLabel + '</div>' +
      fresh + '</div>' +
    audit +
    '<div class="ca-sb-nav">' + nav + '</div>' +
    kpis +
    '<button class="ca-sb-refresh" onclick="_mRefresh()" style="margin-top:auto">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
      ' Refresh Live Data</button>' +
  '</div>';

  if (!_metricsSnap && !_metricsLoading && !_metricsError) loadMetricsEngine();
}

// ─── Main dispatch ───────────────────────────────────────────
function renderMetricsMain() {
  var el = $('main');
  if (_metricsError) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div class="c-empty c-card-danger" style="padding:var(--sp6);text-align:left;align-items:flex-start">'
      +   '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">\u26A0</span>'
      +     '<div class="c-empty-title" style="color:var(--rd);text-align:left">Databricks error</div></div>'
      +   '<div class="c-empty-body" style="text-align:left">' + _mEnc(_metricsError) + '</div>'
      +   '<button class="c-btn c-btn-primary c-empty-action" onclick="refreshMetrics && refreshMetrics()">Retry</button>'
      + '</div></div>';
    return;
  }
  if (_metricsLoading && !_metricsSnap) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div style="padding:var(--sp3) 0 var(--sp4)">'
      +   '<div id="metricsInitProgress"></div>'
      + '</div>'
      + '<div class="c-grid-kpi" style="margin-bottom:var(--sp4)">'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:55%;margin-bottom:12px"></div><div class="c-skel" style="height:28px;width:65%;margin-bottom:6px"></div><div class="c-skel c-skel-line-sm" style="width:35%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:55%;margin-bottom:12px"></div><div class="c-skel" style="height:28px;width:70%;margin-bottom:6px"></div><div class="c-skel c-skel-line-sm" style="width:35%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:55%;margin-bottom:12px"></div><div class="c-skel" style="height:28px;width:60%;margin-bottom:6px"></div><div class="c-skel c-skel-line-sm" style="width:35%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:55%;margin-bottom:12px"></div><div class="c-skel" style="height:28px;width:55%;margin-bottom:6px"></div><div class="c-skel c-skel-line-sm" style="width:35%"></div></div>'
      + '</div>'
      + '<div class="c-skel c-skel-chart"></div>'
      + '</div>';
    setTimeout(function() {
      if (typeof showProgress === 'function') {
        showProgress('#metricsInitProgress', { label: 'Warming Databricks warehouse \u00B7 running 14 queries\u2026', indeterminate: true });
      }
    }, 0);
    return;
  }
  if (!_metricsSnap) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div class="c-empty"><div class="c-empty-icon">\uD83D\uDCC8</div>'
      +   '<div class="c-empty-title">No metrics data loaded</div>'
      +   '<div class="c-empty-body">Click Refresh to fetch a live snapshot from Databricks.</div>'
      +   '<button class="c-btn c-btn-primary c-empty-action" onclick="refreshMetrics && refreshMetrics()">Fetch snapshot</button>'
      + '</div></div>';
    return;
  }

  switch (state._metricsView) {
    case 'digest':      el.innerHTML = _mDigest();      break;
    case 'revenue':     el.innerHTML = _mRevenue();     break;
    case 'subscribers': el.innerHTML = _mSubscribers(); break;
    case 'ftbp':        el.innerHTML = _mFTBP();        break;
    case 'markets':     el.innerHTML = _mMarkets();     break;
    case 'roasters':    el.innerHTML = _mRoasters();    break;
    case 'sla':         el.innerHTML = _mSLA();         break;
    case 'explore':     el.innerHTML = _mExplore();     break;
    default:            el.innerHTML = _mDashboard();   break;
  }
}

// ─── Dashboard — 5-row hero layout ───────────────────────────
function _mDashboard() {
  var s = _metricsSnap;
  var mtd = s.mtd || {}, yest = s.yesterday || {}, subs = s.activeSubs || {};
  var mom = Array.isArray(s.mom) ? s.mom : [];
  var yoy = Array.isArray(s.yoy) ? s.yoy : [];
  var ftbpRev = (s.ftbpPrograms || []).filter(function(r){return /FTBP/.test(r.program);}).reduce(function(a,r){return a+(parseFloat(r.revenue)||0);}, 0);
  var ftbpShare = mtd.revenue > 0 ? (ftbpRev / mtd.revenue * 100) : 0;
  var churn = subs.active_total > 0 ? (subs.cancelled_30d / (subs.active_total + subs.cancelled_30d) * 100) : 0;
  var au = (s.sla30 || []).find(function(r){return r.COUNTRY==='AU';}) || {};

  // Row 1 — 6 hero KPIs
  var row1 = '<div class="mt-hero-grid">' +
    _mHero('MTD Revenue', _mCur(mtd.revenue), 'var(--gn)', _mHeroDelta(mom, 'revenue'), mtd.bags ? Math.round(mtd.bags).toLocaleString() + ' bags' : '') +
    _mHero('Active Subs', _mNum(subs.active_total), 'var(--ac)', _mHeroNet(subs.new_30d, subs.cancelled_30d), subs.paused ? _mNum(subs.paused) + ' paused' : '') +
    _mHero('Yesterday', _mCur(yest.revenue), 'var(--cy)', yest.bags ? _mNum(yest.bags) + ' bags' : '', yest.orders ? _mNum(yest.orders) + ' orders' : '') +
    _mHero('FTBP Share', _mPct(ftbpShare), ftbpShare > 45 ? 'var(--or)' : 'var(--gn)', _mCur(ftbpRev) + ' MTD', 'single-channel risk ' + (ftbpShare > 45 ? 'high' : 'ok')) +
    _mHero('Churn 30d', _mPct(churn), churn > 6 ? 'var(--rd)' : 'var(--gn)', _mNum(subs.cancelled_30d) + ' cancels', _mNum(subs.new_30d) + ' new') +
    _mHero('AU Delivery', _mDays(au.avg_lead_time), parseFloat(au.avg_lead_time) > 5 ? 'var(--or)' : 'var(--gn)', 'p95 ' + _mDays(au.p95_lead_time), _mNum(au.shipments) + ' shipments') +
  '</div>';

  // Row 2 — 90d revenue trend + revenue by market
  var daily = (s.daily30 || []).map(function(r){ return { label: r.day, value: parseFloat(r.revenue) || 0 }; });
  var marketData = (s.marketMTD || []).map(function(r){ return { label: r.Country, value: parseFloat(r.revenue) || 0, color: _mMarketColor(r.Country) }; });
  var row2 = '<div class="mt-row mt-row-2">' +
    '<div class="ca-section mt-flex-2"><div class="ca-section-title">Daily Revenue (last 30 days)</div>' +
      '<div class="ca-chart-wrap">' + (daily.length > 1 ? trendLine(daily, { width: 620, height: 220, color: 'var(--gn)', yFormat: function(v){return '$'+(v/1000).toFixed(0)+'K';} }) : '<div class="mt-empty">No trend data</div>') + '</div></div>' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Revenue by Market (MTD)</div>' +
      (marketData.length ? barChart(marketData, { barHeight: 28, gap: 8, formatVal: function(v){return _mCur(v);} }) : '<div class="mt-empty">No market data</div>') + '</div>' +
  '</div>';

  // Row 3 — FTBP program split + Top roasters
  var ftbpData = (s.ftbpPrograms || []).map(function(r){ return { label: r.program, value: parseFloat(r.revenue) || 0, color: _mProgramColor(r.program) }; }).sort(function(a,b){return b.value-a.value;});
  var roasterData = (s.topRoasters || []).slice(0, 10).map(function(r){ return { label: r.VendorName || '(unknown)', value: parseFloat(r.revenue) || 0, color: 'var(--ac)' }; });
  var row3 = '<div class="mt-row mt-row-2">' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Revenue by Program (MTD)</div>' +
      (ftbpData.length ? barChart(ftbpData, { barHeight: 28, gap: 8, formatVal: function(v){return _mCur(v);} }) : '<div class="mt-empty">No program data</div>') + '</div>' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Top 10 Roasters (MTD)</div>' +
      (roasterData.length ? barChart(roasterData, { barHeight: 22, gap: 5, formatVal: function(v){return _mCur(v);} }) : '<div class="mt-empty">No roaster data</div>') + '</div>' +
  '</div>';

  // Row 4 — Cohort heat-map + Cancellation Pareto
  var cohortHtml = _mCohortHeatmap(s.cohortRetention || []);
  var reasons = (s.cancellationReasons || []).slice(0, 10).map(function(r){
    return { label: (r.reason || '').slice(0, 60), value: parseFloat(r.cases) || 0, color: 'var(--rd)' };
  });
  var row4 = '<div class="mt-row mt-row-2">' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Cohort Retention (12 months)</div>' + cohortHtml + '</div>' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Top Cancellation Reasons (30d)</div>' +
      (reasons.length ? barChart(reasons, { barHeight: 22, gap: 5, formatVal: function(v){return _mNum(v);} }) : '<div class="mt-empty">No churn data</div>') + '</div>' +
  '</div>';

  // Row 5 — Audit + Insights
  var row5 = '<div class="mt-row mt-row-2">' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">Data-Quality Audit</div>' + _mAuditPanel(s.audit) + '</div>' +
    '<div class="ca-section mt-flex-1"><div class="ca-section-title">AI Insights</div>' + _mInsightsPanel(s.insights) + '</div>' +
  '</div>';

  return '<div class="ca-main">' +
    '<div class="ca-header"><h2>Executive Metrics</h2>' + _mSourceBadge() + '</div>' +
    row1 + row2 + row3 + row4 + row5 +
  '</div>';
}

function _mHero(title, value, color, primary, secondary) {
  return '<div class="mt-hero">' +
    '<div class="mt-hero-title">' + _mEnc(title) + '</div>' +
    '<div class="mt-hero-value" style="color:' + color + '">' + value + '</div>' +
    (primary ? '<div class="mt-hero-primary">' + primary + '</div>' : '') +
    (secondary ? '<div class="mt-hero-secondary">' + _mEnc(secondary) + '</div>' : '') +
  '</div>';
}
function _mHeroDelta(mom, field) {
  if (!Array.isArray(mom) || mom.length < 2) return '';
  var prev = mom.find(function(r){return r.period==='prev_month';});
  var before = mom.find(function(r){return r.period==='month_before';});
  if (!prev || !before) return '';
  return _mDelta(parseFloat(prev[field]), parseFloat(before[field])) + ' <span style="color:var(--tx3);font-size:var(--f-xs)">MoM</span>';
}
function _mHeroNet(newSubs, cancelled) {
  var net = (Number(newSubs)||0) - (Number(cancelled)||0);
  var sign = net > 0 ? '+' : '';
  var color = net > 0 ? 'var(--gn)' : 'var(--rd)';
  return '<span style="color:' + color + ';font-size:var(--f-xs)">' + sign + _mNum(net) + ' net (30d)</span>';
}

// ─── Cohort heat-map ─────────────────────────────────────────
function _mCohortHeatmap(rows) {
  if (!rows || !rows.length) return '<div class="mt-empty">No cohort data</div>';
  var months = ['m1_pct','m2_pct','m3_pct','m4_pct','m5_pct','m6_pct'];
  var html = '<div class="mt-cohort"><table class="mt-cohort-table"><thead><tr>' +
    '<th>Cohort</th><th>Size</th>' + months.map(function(m,i){return '<th>M'+(i+1)+'</th>';}).join('') + '</tr></thead><tbody>';
  rows.slice(0, 12).forEach(function(r) {
    html += '<tr><td class="mt-cohort-label">' + _mEnc(String(r.CohortMonth || '')) + '</td>' +
      '<td>' + _mNum(r.cohort_size) + '</td>';
    months.forEach(function(k) {
      var v = parseFloat(r[k]);
      if (isNaN(v)) { html += '<td>--</td>'; return; }
      var heat = Math.min(100, Math.max(0, v));
      var bg = 'rgba(72, 187, 120, ' + (heat/100 * 0.85).toFixed(2) + ')';
      html += '<td class="mt-heat-cell" style="background:' + bg + '">' + v.toFixed(0) + '%</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// ─── Audit + Insights panels ─────────────────────────────────
function _mAuditPanel(audit) {
  if (!audit) return '<div class="mt-empty">No audit</div>';
  var score = audit.score != null ? audit.score : 0;
  var scoreColor = score >= 3 ? 'var(--gn)' : score >= 0 ? 'var(--or)' : 'var(--rd)';
  var html = '<div class="mt-audit-score">Score: <span style="color:' + scoreColor + '">' + score + '</span> · ' +
    (audit.ok || []).length + ' ok · ' + (audit.issues || []).length + ' flagged</div>';
  if (!audit.issues || !audit.issues.length) {
    html += '<div class="mt-audit-clean">All checks passed</div>';
  } else {
    html += '<div class="mt-audit-issues">' + audit.issues.map(function(i) {
      var color = i.severity === 'critical' ? 'var(--rd)' : i.severity === 'warning' ? 'var(--or)' : 'var(--tx3)';
      return '<div class="mt-audit-issue"><span class="mt-audit-dot" style="background:' + color + '"></span>' +
        '<span class="mt-audit-metric">' + _mEnc(i.metric) + '</span>' +
        '<span class="mt-audit-detail">' + _mEnc(i.detail) + '</span></div>';
    }).join('') + '</div>';
  }
  return html;
}
function _mInsightsPanel(insights) {
  if (!insights || !insights.length) return '<div class="mt-empty">No insights generated</div>';
  return '<div class="mt-insights">' + insights.map(function(i) {
    var sev = i.severity || 'neutral';
    var color = sev === 'positive' ? 'var(--gn)' : sev === 'warning' ? 'var(--or)' : sev === 'critical' ? 'var(--rd)' : 'var(--tx3)';
    return '<div class="mt-insight">' +
      '<div class="mt-insight-header"><span class="mt-insight-dot" style="background:' + color + '"></span>' +
        '<span class="mt-insight-title">' + _mEnc(i.tile) + '</span></div>' +
      '<div class="mt-insight-detail">' + _mEnc(i.detail) + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// ─── Revenue view ────────────────────────────────────────────
function _mRevenue() {
  var s = _metricsSnap;
  var waterfall = (s.waterfall || []).map(function(r) { return { month: r.month, revenue: parseFloat(r.revenue), bags: parseInt(r.bags,10), delta: parseFloat(r.mom_delta) || 0 }; });
  var periods = s.periodKPIs || [];

  // KPI table by period
  var periodTable = '<div class="mt-data-table"><table><thead><tr>' +
    '<th>Period</th><th>Revenue</th><th>Bags</th><th>KG</th><th>Orders</th><th>Customers</th><th>FTBP Rev</th><th>FTBP %</th>' +
    '</tr></thead><tbody>' +
    periods.map(function(p) {
      var rev = parseFloat(p.revenue) || 0;
      var ftbp = parseFloat(p.ftbp_revenue) || 0;
      var share = rev > 0 ? (ftbp / rev * 100) : 0;
      return '<tr><td><b>' + _mEnc(p.period) + '</b></td>' +
        '<td>' + _mCur(rev) + '</td>' +
        '<td>' + _mNum(p.bags) + '</td>' +
        '<td>' + _mNum(p.kg) + '</td>' +
        '<td>' + _mNum(p.orders) + '</td>' +
        '<td>' + _mNum(p.customers) + '</td>' +
        '<td>' + _mCur(ftbp) + '</td>' +
        '<td>' + _mPct(share) + '</td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></div>';

  // 13-month waterfall (SVG)
  var wfSVG = _mWaterfall(waterfall);

  // MoM / YoY callouts
  var mom = s.mom || [];
  var prev = mom.find(function(r){return r.period==='prev_month';}) || {};
  var before = mom.find(function(r){return r.period==='month_before';}) || {};
  var yoy = s.yoy || [];
  var thisMo = yoy.find(function(r){return r.period==='this_month';}) || {};
  var lastYr = yoy.find(function(r){return r.period==='same_month_last_year';}) || {};

  var cards = '<div class="ca-grid">' +
    _mCard('MoM Revenue', _mCur(prev.revenue) + ' vs ' + _mCur(before.revenue), 'var(--ac)', _mDelta(parseFloat(prev.revenue), parseFloat(before.revenue))) +
    _mCard('YoY (same month)', _mCur(thisMo.revenue) + ' vs ' + _mCur(lastYr.revenue), 'var(--pu)', _mDelta(parseFloat(thisMo.revenue), parseFloat(lastYr.revenue))) +
    _mCard('Periods', String(periods.length), 'var(--tx2)') +
  '</div>';

  return '<div class="ca-main"><div class="ca-header"><h2>Revenue Analysis</h2>' + _mSourceBadge() + '</div>' +
    cards +
    '<div class="ca-section"><div class="ca-section-title">Period Rollup (AUD, BeanzSkuFlag=1, ex-cancelled)</div>' + periodTable + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">13-Month Revenue Waterfall</div>' + wfSVG + '</div>' +
  '</div>';
}

function _mWaterfall(rows) {
  if (!rows || !rows.length) return '<div class="mt-empty">No waterfall data</div>';
  var h = 280, w = 780, pad = 40;
  var max = Math.max.apply(null, rows.map(function(r){return r.revenue||0;}));
  var min = 0;
  var barW = (w - pad*2) / rows.length * 0.7;
  var gap = (w - pad*2) / rows.length * 0.3;
  var svg = '<div class="ca-chart-wrap"><svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';
  // grid
  for (var i = 0; i <= 4; i++) {
    var y = pad + (h - pad*2) * (i/4);
    var val = max * (1 - i/4);
    svg += '<line x1="' + pad + '" y1="' + y + '" x2="' + (w-pad) + '" y2="' + y + '" stroke="var(--s2)" stroke-width="1"/>' +
      '<text x="' + (pad-6) + '" y="' + (y+4) + '" text-anchor="end" fill="var(--tx3)" font-size="10">' + (val/1e6).toFixed(1) + 'M</text>';
  }
  rows.forEach(function(r, idx) {
    var rev = r.revenue || 0;
    var bh = (rev - min) / (max - min) * (h - pad*2);
    var x = pad + idx * (barW + gap);
    var y = h - pad - bh;
    var delta = r.delta || 0;
    var clr = delta > 0 ? 'var(--gn)' : delta < 0 ? 'var(--rd)' : 'var(--ac)';
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + clr + '" opacity="0.85"/>';
    svg += '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (h - pad + 14) + '" text-anchor="middle" fill="var(--tx3)" font-size="10">' + _mEnc(r.month.slice(5)) + '</text>';
    svg += '<text x="' + (x + barW/2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" fill="var(--tx)" font-size="10">' + (rev/1e6).toFixed(2) + 'M</text>';
  });
  svg += '</svg></div>';
  return svg;
}

// ─── Subscribers view ────────────────────────────────────────
function _mSubscribers() {
  var s = _metricsSnap;
  var sub = s.activeSubs || {};
  var net = (Number(sub.new_30d)||0) - (Number(sub.cancelled_30d)||0);
  var churn = sub.active_total > 0 ? (sub.cancelled_30d / (sub.active_total + sub.cancelled_30d) * 100) : 0;

  var cards = '<div class="ca-grid">' +
    _mCard('Total Base', _mNum(sub.active_total), 'var(--ac)') +
    _mCard('Active', _mNum(sub.active), 'var(--gn)') +
    _mCard('Paused', _mNum(sub.paused), 'var(--or)') +
    _mCard('New (30d)', _mNum(sub.new_30d), 'var(--gn)') +
    _mCard('Cancelled (30d)', _mNum(sub.cancelled_30d), 'var(--rd)') +
    _mCard('Net (30d)', (net>0?'+':'') + _mNum(net), net>0?'var(--gn)':'var(--rd)') +
    _mCard('Churn Rate', _mPct(churn), churn>6?'var(--rd)':'var(--gn)') +
  '</div>';

  var cohortHtml = _mCohortHeatmap(s.cohortRetention || []);
  var reasons = (s.cancellationReasons || []).slice(0, 12).map(function(r){
    return { label: (r.reason || '').slice(0, 70), value: parseFloat(r.cases) || 0, color: 'var(--rd)' };
  });

  return '<div class="ca-main"><div class="ca-header"><h2>Subscriber Health</h2>' + _mSourceBadge() + '</div>' +
    cards +
    '<div class="ca-section"><div class="ca-section-title">Cohort Retention (12 monthly cohorts)</div>' + cohortHtml + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">Top Cancellation Reasons (30d)</div>' +
      (reasons.length ? barChart(reasons, { barHeight: 22, gap: 5, formatVal: function(v){return _mNum(v);} }) : '<div class="mt-empty">No churn data</div>') + '</div>' +
  '</div>';
}

// ─── FTBP view ───────────────────────────────────────────────
function _mFTBP() {
  var s = _metricsSnap;
  var progs = s.ftbpPrograms || [];
  var v1 = progs.find(function(r){return r.program==='FTBP_v1';}) || {};
  var v2 = progs.find(function(r){return r.program==='FTBP_v2';}) || {};
  var sub = progs.find(function(r){return r.program==='Subscription';}) || {};
  var one = progs.find(function(r){return r.program==='One-off'||r.program==='Organic';}) || {};

  var totalRev = progs.reduce(function(a,r){return a + (parseFloat(r.revenue)||0);}, 0);
  var ftbpRev = (parseFloat(v1.revenue)||0) + (parseFloat(v2.revenue)||0);

  var cards = '<div class="ca-grid">' +
    _mCard('FTBP Revenue (MTD)', _mCur(ftbpRev), 'var(--ac)', _mPct(totalRev > 0 ? ftbpRev/totalRev*100 : 0) + ' of MTD') +
    _mCard('v2 Revenue', _mCur(v2.revenue), 'var(--gn)', _mNum(v2.bags) + ' bags') +
    _mCard('v1 Revenue', _mCur(v1.revenue), 'var(--cy)', _mNum(v1.bags) + ' bags') +
    _mCard('v2 Orders', _mNum(v2.orders), 'var(--ac)') +
    _mCard('v1 Orders', _mNum(v1.orders), 'var(--tx2)') +
  '</div>';

  var barData = progs.map(function(r) {
    return { label: r.program, value: parseFloat(r.revenue) || 0, color: _mProgramColor(r.program) };
  }).sort(function(a,b){return b.value-a.value;});

  return '<div class="ca-main"><div class="ca-header"><h2>FTBP Performance</h2>' + _mSourceBadge() + '</div>' +
    cards +
    '<div class="ca-section"><div class="ca-section-title">Revenue by Program (MTD)</div>' +
      (barData.length ? barChart(barData, { barHeight: 30, gap: 8, formatVal: function(v){return _mCur(v);} }) : '<div class="mt-empty">No program data</div>') + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">v1 → v2 Uplift</div>' +
      '<div style="display:flex;gap:var(--sp6);align-items:center;justify-content:center;padding:var(--sp4)">' +
        '<div style="text-align:center"><div style="color:var(--tx3);font-size:var(--f-xs)">FTBP v1</div><div style="font-size:var(--f-2xl);color:var(--cy)">' + _mCur(v1.revenue) + '</div><div style="color:var(--tx3);font-size:var(--f-xs)">' + _mNum(v1.bags) + ' bags</div></div>' +
        '<div style="font-size:var(--f-2xl);color:var(--tx3)">→</div>' +
        '<div style="text-align:center"><div style="color:var(--tx3);font-size:var(--f-xs)">FTBP v2</div><div style="font-size:var(--f-2xl);color:var(--gn)">' + _mCur(v2.revenue) + '</div><div style="color:var(--tx3);font-size:var(--f-xs)">' + _mNum(v2.bags) + ' bags</div></div>' +
      '</div></div>' +
  '</div>';
}

// ─── Markets view ────────────────────────────────────────────
function _mMarkets() {
  var s = _metricsSnap;
  var markets = s.marketMTD || [];
  var slas = s.sla30 || [];
  var slaByMkt = {};
  slas.forEach(function(r){ slaByMkt[r.COUNTRY] = r; });

  var slaDE = slaByMkt.DE ? parseFloat(slaByMkt.DE.avg_lead_time) : 0;
  var deBanner = slaDE > 7 ? '<div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg)">' +
    '<div class="ca-narrative-label" style="color:var(--rd)">DE delivery stress</div><p>Germany avg lead time ' + _mDays(slaDE) + ' — p95 ' + _mDays(slaByMkt.DE.p95_lead_time) + '. Courier/ops review recommended.</p></div>' : '';

  var table = '<div class="mt-data-table"><table><thead><tr>' +
    '<th>Market</th><th>Revenue</th><th>Bags</th><th>KG</th><th>Orders</th><th>Avg Lead</th><th>p95 Lead</th><th>Shipments</th>' +
    '</tr></thead><tbody>' +
    markets.map(function(m) {
      var sla = slaByMkt[m.Country] || {};
      return '<tr>' +
        '<td><b>' + _mEnc(m.Country || '') + '</b></td>' +
        '<td>' + _mCur(m.revenue) + '</td>' +
        '<td>' + _mNum(m.bags) + '</td>' +
        '<td>' + _mNum(m.kg) + '</td>' +
        '<td>' + _mNum(m.orders) + '</td>' +
        '<td>' + _mDays(sla.avg_lead_time) + '</td>' +
        '<td>' + _mDays(sla.p95_lead_time) + '</td>' +
        '<td>' + _mNum(sla.shipments) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';

  var revBar = markets.map(function(r){return {label:r.Country,value:parseFloat(r.revenue)||0,color:_mMarketColor(r.Country)};});
  var slaBar = slas.map(function(r){var v=parseFloat(r.avg_lead_time)||0; return {label:r.COUNTRY,value:v,color:v>6?'var(--rd)':v>4?'var(--or)':'var(--gn)'};}).sort(function(a,b){return a.value-b.value;});

  return '<div class="ca-main"><div class="ca-header"><h2>Market Performance</h2>' + _mSourceBadge() + '</div>' +
    deBanner +
    '<div class="ca-section"><div class="ca-section-title">MTD Market Rollup</div>' + table + '</div>' +
    '<div class="mt-row mt-row-2">' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Revenue by Market</div>' +
        (revBar.length ? barChart(revBar, { barHeight: 30, gap: 8, formatVal: function(v){return _mCur(v);} }) : '') + '</div>' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Avg Lead Time (30d)</div>' +
        (slaBar.length ? barChart(slaBar, { barHeight: 30, gap: 8, formatVal: function(v){return _mDays(v);} }) : '') + '</div>' +
    '</div>' +
  '</div>';
}

// ─── Roasters view ───────────────────────────────────────────
function _mRoasters() {
  var s = _metricsSnap;
  var roasters = s.topRoasters || [];
  var pbb = s.pbb || [];

  var revBar = roasters.slice(0, 15).map(function(r){return {label:r.VendorName||'(unknown)',value:parseFloat(r.revenue)||0,color:'var(--ac)'};});
  var kgBar = roasters.slice(0, 15).map(function(r){return {label:r.VendorName||'(unknown)',value:parseFloat(r.kg)||0,color:'var(--gn)'};}).sort(function(a,b){return b.value-a.value;});

  var pbbBar = pbb.slice(0, 15).map(function(r){return {label:(r.StoreCode||'') + (r.Country?' ('+r.Country+')':''),value:parseFloat(r.revenue)||0,color:'var(--pu)'};});

  return '<div class="ca-main"><div class="ca-header"><h2>Roaster Performance</h2>' + _mSourceBadge() + '</div>' +
    '<div class="mt-row mt-row-2">' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Top 15 Roasters by Revenue (MTD)</div>' +
        (revBar.length ? barChart(revBar, { barHeight: 22, gap: 5, maxItems: 15, formatVal: function(v){return _mCur(v);} }) : '<div class="mt-empty">No roaster data</div>') + '</div>' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Top 15 Roasters by KG (MTD)</div>' +
        (kgBar.length ? barChart(kgBar, { barHeight: 22, gap: 5, maxItems: 15, formatVal: function(v){return _mNum(v) + ' kg';} }) : '') + '</div>' +
    '</div>' +
    (pbbBar.length ? '<div class="ca-section"><div class="ca-section-title">Powered by Beanz (PBB) Stores</div>' +
      barChart(pbbBar, { barHeight: 24, gap: 6, maxItems: 15, formatVal: function(v){return _mCur(v);} }) + '</div>' : '') +
  '</div>';
}

// ─── SLA view ────────────────────────────────────────────────
function _mSLA() {
  var s = _metricsSnap;
  var slas = s.sla30 || [];
  var monthly = s.slaMonthly || [];

  var total = slas.reduce(function(a,r){return a+(parseInt(r.shipments,10)||0);},0);
  var avgLead = slas.length ? slas.reduce(function(a,r){return a+(parseFloat(r.avg_lead_time)||0);},0) / slas.length : 0;

  var cards = '<div class="ca-grid">' +
    _mCard('Total Shipments (30d)', _mNum(total), 'var(--ac)') +
    _mCard('Avg Lead Time', _mDays(avgLead), avgLead>5?'var(--or)':'var(--gn)') +
    _mCard('Markets', String(slas.length), 'var(--tx2)') +
  '</div>';

  var slaBar = slas.map(function(r){var v=parseFloat(r.avg_lead_time)||0; return {label:r.COUNTRY + ' (p95 ' + _mDays(r.p95_lead_time) + ')',value:v,color:v>6?'var(--rd)':v>4?'var(--or)':'var(--gn)'};}).sort(function(a,b){return a.value-b.value;});

  // Monthly trend (average across all markets)
  var byMonth = {};
  monthly.forEach(function(r) {
    if (!byMonth[r.month]) byMonth[r.month] = { total: 0, n: 0 };
    byMonth[r.month].total += parseFloat(r.avg_lead_time) || 0;
    byMonth[r.month].n++;
  });
  var trendData = Object.keys(byMonth).sort().map(function(m){return { label: m, value: byMonth[m].total/byMonth[m].n };});

  return '<div class="ca-main"><div class="ca-header"><h2>Delivery SLA</h2>' + _mSourceBadge() + '</div>' +
    cards +
    '<div class="ca-section"><div class="ca-section-title">Lead Time by Market (30d)</div>' +
      (slaBar.length ? barChart(slaBar, { barHeight: 28, gap: 8, formatVal: function(v){return _mDays(v);} }) : '') + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">Lead Time Trend (12 months, avg across markets)</div>' +
      (trendData.length > 1 ? '<div class="ca-chart-wrap">' + trendLine(trendData, { width: 720, height: 200, color: 'var(--or)', yFormat: function(v){return v.toFixed(1)+'d';} }) + '</div>' : '<div class="mt-empty">Loading trend...</div>') + '</div>' +
  '</div>';
}

// ─── Explore view ────────────────────────────────────────────
function _mExplore() {
  if (!state._sliceDim) state._sliceDim = 'market';
  if (!state._sliceMetric) state._sliceMetric = 'revenue';
  if (!state._slicePeriod) state._slicePeriod = 'FY26';

  var dims = [
    { id: 'market', label: 'Market' }, { id: 'month', label: 'Month' },
    { id: 'fy', label: 'Fiscal Year' }, { id: 'quarter', label: 'Quarter' },
    { id: 'program', label: 'Program' }, { id: 'roaster', label: 'Roaster' },
    { id: 'carrier', label: 'Carrier (SLA only)' }
  ];
  var metrics = [
    { id: 'revenue', label: 'Revenue (AUD)' }, { id: 'bags', label: 'Bags' },
    { id: 'kg', label: 'Volume (KG)' }, { id: 'orders', label: 'Orders' },
    { id: 'lead_time', label: 'Avg Lead Time' }
  ];
  var periods = [
    { id: 'FY24', label: 'FY24' }, { id: 'FY25', label: 'FY25' }, { id: 'FY26', label: 'FY26' },
    { id: 'CY24', label: 'CY24' }, { id: 'CY25', label: 'CY25' }
  ];
  var markets = ['', 'AU', 'UK', 'US', 'DE', 'NL'];

  var filterBar = '<div class="mt-explore-filters">' +
    _mSelect('Metric', metrics, state._sliceMetric, '_sliceSetMetric') +
    _mSelect('Dimension', dims, state._sliceDim, '_sliceSetDim') +
    _mSelect('Period', periods, state._slicePeriod, '_sliceSetPeriod') +
    '<div class="mt-filter-group"><label class="mt-filter-label">Market</label>' +
      '<select class="mt-filter-select" onchange="_sliceSetMarket(this.value)">' +
      markets.map(function(m){return '<option value="'+m+'"'+(state._sliceMarket===m?' selected':'')+'>'+(m||'All')+'</option>';}).join('') +
      '</select></div>' +
    '<button class="mt-filter-btn" onclick="_sliceRun()">Query</button>' +
  '</div>';

  var results = '';
  if (_sliceLoading) {
    results = '<div style="padding:var(--sp4) 0">'
      + '<div class="c-flex-between" style="margin-bottom:var(--sp3)"><span style="font-size:var(--f-sm);color:var(--tx3);font-weight:var(--fw-sb)">Querying Databricks\u2026</span></div>'
      + '<div class="c-progress c-progress-indeterminate"><div class="c-progress-fill"></div></div>'
      + '<div class="c-skel c-skel-chart" style="margin-top:var(--sp4)"></div></div>';
  } else if (_sliceData && _sliceData.error) {
    results = '<div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg)">' +
      '<div class="ca-narrative-label" style="color:var(--rd)">Query Error</div><p>' + _mEnc(_sliceData.error) + '</p>' +
      (_sliceData.sql ? '<details style="margin-top:var(--sp2)"><summary style="cursor:pointer;color:var(--tx3)">Show SQL</summary><pre class="mt-sql">' + _mEnc(_sliceData.sql) + '</pre></details>' : '') + '</div>';
  } else if (_sliceData && _sliceData.rows) {
    var rows = _sliceData.rows;
    var chartData = rows.map(function(r){return {label:String(r.dim||'?'),value:r.value,color:_mMarketColor(String(r.dim||''))};}).sort(function(a,b){return b.value-a.value;});
    var total = chartData.reduce(function(s,d){return s + d.value;}, 0);
    var fmt = state._sliceMetric==='revenue' ? _mCur : state._sliceMetric==='lead_time' ? _mDays : _mNum;

    results = '<div class="ca-grid">' +
      _mCard('Total', fmt(total), 'var(--ac)') +
      (chartData[0] ? _mCard('Top: ' + _mEnc(chartData[0].label), fmt(chartData[0].value), 'var(--gn)') : '') +
      _mCard('Items', String(chartData.length), 'var(--tx2)') +
    '</div>';
    if (chartData.length) {
      results += '<div class="ca-section"><div class="ca-section-title">' + _mEnc(state._sliceMetric) + ' by ' + _mEnc(state._sliceDim) + ' (' + _mEnc(state._slicePeriod) + ')</div>' +
        barChart(chartData, { barHeight: 26, gap: 6, maxItems: 30, formatVal: fmt }) + '</div>';
    }
    if (_sliceData.sql) {
      results += '<details style="margin-top:var(--sp3)"><summary style="font-size:var(--f-xs);color:var(--tx3);cursor:pointer">Show SQL</summary><pre class="mt-sql">' + _mEnc(_sliceData.sql) + '</pre></details>';
    }
  } else {
    results = '<div class="ca-narrative"><div class="ca-narrative-label">Explore</div>' +
      '<p>Pick a metric, dimension, and period — then click <b>Query</b>. Every query is validated against the skill\'s mandatory filters (RateType, OrderStatus, BeanzSkuFlag) before running.</p></div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Explore</h2>' + _mSourceBadge() + '</div>' +
    filterBar + results + '</div>';
}

// ─── Shared helpers ──────────────────────────────────────────
function _mCard(title, value, color, extra) {
  return '<div class="ca-card"><div class="ca-card-title">' + title + '</div>' +
    '<div class="ca-card-value" style="color:' + (color||'var(--tx)') + '">' + value + '</div>' +
    (extra ? '<div class="ca-card-meta">' + extra + '</div>' : '') + '</div>';
}
function _mSourceBadge() {
  if (!_metricsSnap) return '';
  var src = _metricsSnap.source || 'databricks';
  return '<span class="mt-source-badge" style="color:var(--gn);border:1px solid var(--gn);padding:2px 8px;border-radius:10px;margin-left:var(--sp2);font-size:var(--f-xs)">&#9679; ' + _mEnc(src) + '</span>';
}
function _mSelect(label, items, current, onchangeFn) {
  return '<div class="mt-filter-group"><label class="mt-filter-label">' + label + '</label>' +
    '<select class="mt-filter-select" onchange="' + onchangeFn + '(this.value)">' +
    items.map(function(d){return '<option value="'+d.id+'"'+(current===d.id?' selected':'')+'>'+d.label+'</option>';}).join('') +
    '</select></div>';
}
function _mMarketColor(label) {
  var colors = {
    'AU': 'var(--gn)', 'UK': 'var(--cy)', 'US': 'var(--pu)', 'DE': 'var(--or)', 'NL': 'var(--ac)'
  };
  return colors[label] || 'var(--ac)';
}
function _mProgramColor(label) {
  var colors = {
    'FTBP_v2': 'var(--gn)', 'FTBP_v1': 'var(--cy)', 'Subscription': 'var(--ac)', 'One-off': 'var(--tx3)', 'Organic': 'var(--tx3)'
  };
  return colors[label] || 'var(--ac)';
}

// ─── State setters + actions ─────────────────────────────────
function _mRefresh() {
  _metricsSnap = null;
  _metricsLoading = true;
  renderAll();
  if (typeof showToast === 'function') showToast('Refreshing live Databricks data...');
  databricksAPI.refresh().then(function(snap) {
    _metricsLoading = false;
    if (snap && !snap.error) _metricsSnap = snap;
    else _metricsError = (snap && snap.error) || 'Refresh failed';
    renderAll();
  }).catch(function(e) {
    _metricsLoading = false;
    _metricsError = e.message;
    renderAll();
  });
}
function _sliceSetDim(val)    { state._sliceDim = val; renderAll(); }
function _sliceSetMetric(val) { state._sliceMetric = val; renderAll(); }
function _sliceSetPeriod(val) { state._slicePeriod = val; renderAll(); }
function _sliceSetMarket(val) { state._sliceMarket = val; renderAll(); }
function _sliceRun() {
  _sliceLoading = true;
  _sliceData = null;
  renderAll();
  var filters = {};
  if (state._sliceMarket) filters.market = state._sliceMarket;
  databricksAPI.explore(state._sliceMetric, state._sliceDim, state._slicePeriod || 'FY26', filters).then(function(d) {
    _sliceLoading = false;
    _sliceData = d;
    renderAll();
  }).catch(function(e) {
    _sliceLoading = false;
    _sliceData = { error: e.message };
    renderAll();
  });
}

// ═════════════════════════════════════════════════════════════
// DIGEST VIEW — period-aware deep business intelligence
// ═════════════════════════════════════════════════════════════

function _digestLoad(force) {
  if (_digestLoading && !force) return;
  if (!state._digestKind) state._digestKind = 'month';
  if (!state._digestAnchor) state._digestAnchor = _mTodayYMD();
  if (state._digestLLM == null) state._digestLLM = true;

  _digestLoading = true;
  _digestError = null;
  renderAll();

  var opts = { kind: state._digestKind, anchor: state._digestAnchor, hero: state._digestLLM, force: !!force };
  databricksAPI.fetchDigest(opts).then(function(snap) {
    _digestLoading = false;
    if (!snap || snap.error) _digestError = (snap && snap.error) || 'Digest failed';
    else _digestSnap = snap;
    renderAll();
  });
}

function _mTodayYMD() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _mSetDigestKind(kind)   { state._digestKind = kind; _digestSnap = null; _digestLoad(true); }
function _mSetDigestAnchor(a)    { state._digestAnchor = a; _digestSnap = null; _digestLoad(true); }
function _mToggleLLM()           { state._digestLLM = !state._digestLLM; _digestSnap = null; _digestLoad(true); }

function _mDigest() {
  if (!state._digestKind) state._digestKind = 'month';
  if (!state._digestAnchor) state._digestAnchor = _mTodayYMD();
  if (!_digestSnap && !_digestLoading && !_digestError) _digestLoad();

  var bar = _mDigestPeriodBar();
  if (_digestError) {
    return '<div class="ca-main">' + bar +
      '<div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg);margin-top:var(--sp3)">' +
      '<div class="ca-narrative-label" style="color:var(--rd)">Digest error</div><p>' + _mEnc(_digestError) + '</p>' +
      '<button class="btn btn-sm" style="margin-top:var(--sp2)" onclick="_digestLoad(true)">Retry</button></div></div>';
  }
  if (_digestLoading && !_digestSnap) {
    return '<div class="ca-main">' + bar +
      '<div style="margin-top:var(--sp4)">'
      + '<div class="c-flex-between" style="margin-bottom:var(--sp3)"><span style="font-size:var(--f-sm);color:var(--tx3);font-weight:var(--fw-sb)">Assembling ' + _mEnc(state._digestKind) + ' digest \u00B7 18 parallel queries</span><span style="font-size:var(--f-xs);color:var(--tx3)">first load ~25s</span></div>'
      + '<div class="c-progress c-progress-indeterminate"><div class="c-progress-fill"></div></div>'
      + '<div class="c-grid-kpi" style="margin-top:var(--sp4);gap:var(--sp3)">'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:45%;margin-bottom:10px"></div><div class="c-skel" style="height:24px;width:65%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:45%;margin-bottom:10px"></div><div class="c-skel" style="height:24px;width:60%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:45%;margin-bottom:10px"></div><div class="c-skel" style="height:24px;width:55%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:45%;margin-bottom:10px"></div><div class="c-skel" style="height:24px;width:70%"></div></div>'
      + '</div></div></div>';
  }
  if (!_digestSnap) return '<div class="ca-main">' + bar + '</div>';

  var s = _digestSnap;
  var sections = [
    _mDigSection_StateOfPlay(s),
    _mDigSection_Platform(s),
    _mDigSection_Revenue(s),
    _mDigSection_Drivers(s),
    _mDigSection_Subscribers(s),
    _mDigSection_FTBP(s),
    _mDigSection_Channels(s),
    _mDigSection_Roasters(s),
    _mDigSection_Operations(s),
    _mDigSection_Signal(s),
    _mDigSection_Audit(s)
  ].join('');

  return '<div class="ca-main">' + bar + sections + '</div>';
}

function _mDigestPeriodBar() {
  var kinds = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' }, { id: 'quarter', label: 'Quarter' },
    { id: 'year', label: 'Year' }, { id: 'fiscal-year', label: 'FY' }
  ];
  var pills = kinds.map(function(k) {
    var active = state._digestKind === k.id;
    return '<button class="ds-period-pill' + (active?' active':'') + '" onclick="_mSetDigestKind(\'' + k.id + '\')">' + k.label + '</button>';
  }).join('');
  var label = _digestSnap && _digestSnap.period ? _digestSnap.period.label : state._digestKind;
  var src = _digestSnap ? (_digestSnap.source || 'databricks') : 'loading';
  var srcColor = src === 'warehouse' ? 'var(--gn)' : 'var(--tx3)';
  return '<div class="ds-period-bar">' +
    '<div class="ds-period-pills">' + pills + '</div>' +
    '<div class="ds-period-meta">' +
      '<span class="ds-period-label">' + _mEnc(label) + '</span>' +
      '<span style="color:var(--tx3);margin:0 var(--sp2)">·</span>' +
      '<input type="date" class="ds-anchor-input" value="' + _mEnc(state._digestAnchor || '') + '" onchange="_mSetDigestAnchor(this.value)"/>' +
      '<span style="color:var(--tx3);margin:0 var(--sp2)">·</span>' +
      '<label class="ds-llm-toggle" title="Use Claude for the State of Play hero line">' +
        '<input type="checkbox"' + (state._digestLLM ? ' checked' : '') + ' onchange="_mToggleLLM()"/>' +
        '<span>AI summary</span></label>' +
      '<span style="color:var(--tx3);margin:0 var(--sp2)">·</span>' +
      '<span class="ds-period-src" style="color:' + srcColor + '">&#9679; ' + _mEnc(src) + '</span>' +
      '<button class="btn btn-sm" style="margin-left:var(--sp2)" onclick="_digestLoad(true)">Refresh</button>' +
    '</div>' +
  '</div>';
}

function _mWin(rows, win) {
  if (!Array.isArray(rows)) return null;
  return rows.find(function(r){return r && r.win === win;}) || null;
}
function _mDeltaPill(curr, prev, digits) {
  if (prev == null || prev === 0 || curr == null) return '';
  var pct = ((curr - prev) / prev) * 100;
  var cls = Math.abs(pct) < 1 ? 'ds-delta-flat' : pct > 0 ? 'ds-delta-up' : 'ds-delta-down';
  var arrow = Math.abs(pct) < 1 ? '–' : pct > 0 ? '▲' : '▼';
  return '<span class="ds-delta-pill ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(digits == null ? 1 : digits) + '%</span>';
}
function _mSectionHead(title, narr) {
  return '<div class="ds-sect-head"><h3>' + _mEnc(title) + '</h3>' + (narr ? '<div class="ds-sect-narr">' + _mEnc(narr) + '</div>' : '') + '</div>';
}

function _mDigSection_StateOfPlay(s) {
  var n = (s.narratives && s.narratives.stateOfPlay) || '';
  var h = _mWin(s.headline, 'current');
  if (!h) return '';
  return '<div class="ds-sect ds-sect-hero">' +
    '<div class="ds-hero-label">State of Play · ' + _mEnc(s.period.label) + '</div>' +
    '<div class="ds-hero-narr">' + _mEnc(n) + '</div>' +
    '<div class="ds-hero-metrics">' +
      _mHeroMetric('Revenue', _mCur(h.revenue), 'var(--gn)') +
      _mHeroMetric('Bags', _mNum(h.bags), 'var(--ac)') +
      _mHeroMetric('Customers', _mNum(h.customers), 'var(--cy)') +
      _mHeroMetric('Orders', _mNum(h.orders), 'var(--pu)') +
      _mHeroMetric('AOV', _mCur(h.aov), 'var(--or)') +
    '</div>' +
  '</div>';
}
function _mHeroMetric(label, value, color) {
  return '<div class="ds-hero-metric"><div class="ds-hero-m-label">' + label + '</div><div class="ds-hero-m-value" style="color:' + color + '">' + value + '</div></div>';
}

function _mDigSection_Platform(s) {
  var curr = _mWin(s.headline, 'current');
  var prev = _mWin(s.headline, 'previous');
  var yoy = _mWin(s.headline, 'yoy');
  var ts = s.timeSeries || [];
  if (!curr) return '';
  var sparkRev = ts.map(function(r){return parseFloat(r.revenue)||0;});
  var sparkBags = ts.map(function(r){return parseFloat(r.bags)||0;});
  var sparkOrders = ts.map(function(r){return parseFloat(r.orders)||0;});

  var rows = [
    { label: 'Revenue', value: _mCur(curr.revenue), prev: prev && prev.revenue, curr: curr.revenue, yoy: yoy && yoy.revenue, color: 'var(--gn)', spark: sparkRev },
    { label: 'Bags Shipped', value: _mNum(curr.bags), prev: prev && prev.bags, curr: curr.bags, yoy: yoy && yoy.bags, color: 'var(--ac)', spark: sparkBags },
    { label: 'Coffee KG', value: _mNum(curr.kg) + ' kg', prev: prev && prev.kg, curr: curr.kg, yoy: yoy && yoy.kg, color: 'var(--cy)' },
    { label: 'Orders', value: _mNum(curr.orders), prev: prev && prev.orders, curr: curr.orders, yoy: yoy && yoy.orders, color: 'var(--pu)', spark: sparkOrders },
    { label: 'Customers', value: _mNum(curr.customers), prev: prev && prev.customers, curr: curr.customers, yoy: yoy && yoy.customers, color: 'var(--ac)' },
    { label: 'AOV', value: _mCur(curr.aov), prev: prev && prev.aov, curr: curr.aov, yoy: yoy && yoy.aov, color: 'var(--or)' },
    { label: 'Bags / Order', value: (+curr.bags_per_order).toFixed(2), prev: prev && prev.bags_per_order, curr: curr.bags_per_order, yoy: yoy && yoy.bags_per_order, color: 'var(--tx2)' },
    { label: 'FTBP Revenue', value: _mCur(curr.ftbp_revenue), prev: prev && prev.ftbp_revenue, curr: curr.ftbp_revenue, yoy: yoy && yoy.ftbp_revenue, color: 'var(--ac)' }
  ];
  var cards = rows.map(function(r) {
    return '<div class="ds-kpi-card">' +
      '<div class="ds-kpi-label">' + r.label + '</div>' +
      '<div class="ds-kpi-value" style="color:' + r.color + '">' + r.value + '</div>' +
      '<div class="ds-kpi-deltas">' +
        (r.prev != null ? '<span class="ds-kpi-d">vs prior ' + _mDeltaPill(r.curr, r.prev) + '</span>' : '') +
        (r.yoy != null ? '<span class="ds-kpi-d">YoY ' + _mDeltaPill(r.curr, r.yoy) + '</span>' : '') +
      '</div>' +
      (r.spark && r.spark.length > 1 ? '<div class="ds-kpi-spark">' + sparkline(r.spark, { width: 180, height: 28, color: r.color, showArea: true }) + '</div>' : '') +
    '</div>';
  }).join('');

  return '<div class="ds-sect">' + _mSectionHead('Platform Performance', s.narratives.headline) +
    '<div class="ds-kpi-grid">' + cards + '</div></div>';
}

function _mDigSection_Revenue(s) {
  var ts = s.timeSeries || [];
  var points = ts.map(function(r){return { label: String(r.bucket), value: parseFloat(r.revenue)||0 };});
  var chart = points.length > 1 ? trendLine(points, {
    width: 780, height: 220, color: 'var(--gn)',
    yFormat: function(v){return v>=1e6?('$'+(v/1e6).toFixed(1)+'M'):('$'+Math.round(v/1000)+'K');}
  }) : '<div class="mt-empty">Not enough buckets to plot</div>';
  var totalRev = points.reduce(function(a,p){return a+p.value;}, 0);
  var peak = points.reduce(function(m,p){return p.value > m.value ? p : m;}, { value: 0, label: '' });
  var meta = '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp2)">Total across ' + points.length + ' ' + s.period.granularity + ' buckets: ' + _mCur(totalRev) + (peak.label ? ' · Peak ' + peak.label + ' (' + _mCur(peak.value) + ')' : '') + '</div>';
  return '<div class="ds-sect">' + _mSectionHead('Revenue Trajectory', 'Binned by ' + s.period.granularity) +
    '<div class="ca-section"><div class="ca-chart-wrap">' + chart + '</div>' + meta + '</div></div>';
}

function _mDigSection_Drivers(s) {
  var segs = (s.segmentMix || []).filter(function(r){return r.win==='current';});
  var progs = (s.programMix || []).filter(function(r){return r.win==='current';}).sort(function(a,b){return (+b.revenue)-(+a.revenue);});
  var progsPrev = (s.programMix || []).filter(function(r){return r.win==='previous';});
  var byProgPrev = {}; progsPrev.forEach(function(r){byProgPrev[r.program]=r;});

  var segsTotal = segs.reduce(function(a,r){return a + (+r.bags||0);}, 0);
  var segList = segs.sort(function(a,b){return (+b.bags)-(+a.bags);}).map(function(r) {
    var pct = segsTotal ? (+r.bags / segsTotal * 100) : 0;
    return '<div class="ds-mix-row">' +
      '<div class="ds-mix-label">' + _mEnc(r.bag_size) + '</div>' +
      '<div class="ds-mix-bar" style="width:' + pct.toFixed(1) + '%;background:var(--ac)"><span>' + _mNum(r.bags) + ' · ' + pct.toFixed(0) + '%</span></div></div>';
  }).join('');

  var progsTotal = progs.reduce(function(a,r){return a + (+r.revenue||0);}, 0);
  var progList = progs.map(function(r) {
    var pct = progsTotal ? (+r.revenue / progsTotal * 100) : 0;
    var pv = byProgPrev[r.program];
    return '<div class="ds-mix-row">' +
      '<div class="ds-mix-label">' + _mEnc(r.program) + '</div>' +
      '<div class="ds-mix-bar" style="width:' + pct.toFixed(1) + '%;background:' + _mProgramColor(r.program) + '"><span>' + _mCur(r.revenue) + ' · ' + pct.toFixed(0) + '%</span></div>' +
      (pv ? '<div class="ds-mix-delta">' + _mDeltaPill(+r.revenue, +pv.revenue) + '</div>' : '') +
    '</div>';
  }).join('');

  var aov = s.aovDecomp || [];
  var aovTop = aov.slice().sort(function(a,b){return (+b.revenue)-(+a.revenue);}).slice(0, 10);
  var aovTable = '<div class="mt-data-table"><table><thead><tr><th>Market</th><th>Program</th><th>Revenue</th><th>Orders</th><th>AOV</th><th>Bags/Order</th></tr></thead><tbody>' +
    aovTop.map(function(r) {
      return '<tr><td><b>' + _mEnc(r.Country||'') + '</b></td><td>' + _mEnc(r.program) + '</td><td>' + _mCur(r.revenue) + '</td><td>' + _mNum(r.orders) + '</td><td>' + _mCur(r.aov) + '</td><td>' + (+r.bags_per_order).toFixed(2) + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  return '<div class="ds-sect">' + _mSectionHead('Revenue Drivers', s.narratives.programMix) +
    '<div class="ds-drivers-grid">' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Program Mix</div>' + (progs.length ? progList : '<div class="mt-empty">No program data</div>') + '</div>' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Bag-Size Mix</div>' + (segs.length ? segList : '<div class="mt-empty">No segment data</div>') + '</div>' +
    '</div>' +
    '<div class="ca-section"><div class="ca-section-title">AOV Decomposition (top 10 market × program)</div>' + aovTable + '</div>' +
    _mDigSubSection_Markets(s) +
  '</div>';
}

function _mDigSubSection_Markets(s) {
  var curr = (s.marketMix || []).filter(function(r){return r.win==='current';}).sort(function(a,b){return (+b.revenue)-(+a.revenue);});
  var prev = (s.marketMix || []).filter(function(r){return r.win==='previous';});
  var prevByCountry = {}; prev.forEach(function(r){prevByCountry[r.Country]=r;});
  if (!curr.length) return '';
  var rows = curr.map(function(c) {
    var p = prevByCountry[c.Country];
    return '<tr>' +
      '<td><b>' + _mEnc(c.Country||'') + '</b></td>' +
      '<td>' + _mCur(c.revenue) + ' ' + (p ? _mDeltaPill(+c.revenue, +p.revenue) : '') + '</td>' +
      '<td>' + _mNum(c.bags) + ' ' + (p ? _mDeltaPill(+c.bags, +p.bags) : '') + '</td>' +
      '<td>' + _mNum(c.orders) + '</td>' +
      '<td>' + _mNum(c.customers) + '</td>' +
      '<td>' + _mCur(c.aov) + '</td></tr>';
  }).join('');
  return '<div class="ca-section"><div class="ca-section-title">Market Mix — ' + _mEnc(s.narratives.marketMix || '') + '</div>' +
    '<div class="mt-data-table"><table><thead><tr><th>Market</th><th>Revenue</th><th>Bags</th><th>Orders</th><th>Customers</th><th>AOV</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function _mDigSection_Subscribers(s) {
  var life = _mWin(s.subscriberLifecycle, 'current') || {};
  var lifePrev = _mWin(s.subscriberLifecycle, 'previous');
  var nrr = (s.nrr && s.nrr[0]) || {};
  var cohort = s.cohortRetention || [];
  var repeat = s.repeatPurchase || [];
  var react = (s.reactivation && s.reactivation[0]) || {};

  var nrrPct = +nrr.nrr_pct || 0;
  var nrrColor = nrrPct >= 100 ? 'var(--gn)' : nrrPct >= 85 ? 'var(--or)' : 'var(--rd)';
  var nrrWidth = Math.min(130, Math.max(0, nrrPct));
  var nrrGauge = '<div class="ds-nrr-gauge">' +
    '<div class="ds-nrr-label">Net Revenue Retention</div>' +
    '<div class="ds-nrr-value" style="color:' + nrrColor + '">' + nrrPct.toFixed(0) + '%</div>' +
    '<div class="ds-nrr-bar"><div class="ds-nrr-fill" style="width:' + nrrWidth + '%;background:' + nrrColor + '"></div><div class="ds-nrr-marker" style="left:100%"><span>100%</span></div></div>' +
    '<div class="ds-nrr-meta">' + _mNum(nrr.prior_cohort_size) + ' prior customers · ' + (+nrr.customer_retention_pct||0).toFixed(0) + '% retained</div></div>';

  var lifecycle = '<div class="ds-lifecycle">' +
    '<div class="ds-lc-row"><div class="ds-lc-label">New</div><div class="ds-lc-value" style="color:var(--gn)">' + _mNum(life.new_subs) + '</div>' + (lifePrev ? _mDeltaPill(+life.new_subs, +lifePrev.new_subs) : '') + '</div>' +
    '<div class="ds-lc-row"><div class="ds-lc-label">Resumed</div><div class="ds-lc-value" style="color:var(--ac)">' + _mNum(life.resumed) + '</div>' + (lifePrev ? _mDeltaPill(+life.resumed, +lifePrev.resumed) : '') + '</div>' +
    '<div class="ds-lc-row"><div class="ds-lc-label">Paused</div><div class="ds-lc-value" style="color:var(--or)">' + _mNum(life.paused) + '</div>' + (lifePrev ? _mDeltaPill(+life.paused, +lifePrev.paused) : '') + '</div>' +
    '<div class="ds-lc-row"><div class="ds-lc-label">Cancelled</div><div class="ds-lc-value" style="color:var(--rd)">' + _mNum(life.cancelled) + '</div>' + (lifePrev ? _mDeltaPill(+life.cancelled, +lifePrev.cancelled) : '') + '</div>' +
    '<div class="ds-lc-row ds-lc-net"><div class="ds-lc-label">Net</div><div class="ds-lc-value" style="color:' + (((+life.new_subs||0) - (+life.cancelled||0)) > 0 ? 'var(--gn)' : 'var(--rd)') + '">' + (((+life.new_subs||0) - (+life.cancelled||0)) > 0 ? '+' : '') + _mNum((+life.new_subs||0) - (+life.cancelled||0)) + '</div></div>' +
  '</div>';

  var months = ['m1_pct','m2_pct','m3_pct','m4_pct','m5_pct','m6_pct','m9_pct','m12_pct'];
  var labels = ['M1','M2','M3','M4','M5','M6','M9','M12'];
  var cohortHTML = '<div class="mt-cohort"><table class="mt-cohort-table"><thead><tr><th>Cohort</th><th>Size</th>' + labels.map(function(l){return '<th>'+l+'</th>';}).join('') + '</tr></thead><tbody>' +
    cohort.slice(0,12).map(function(r) {
      return '<tr><td class="mt-cohort-label">' + _mEnc(String(r.CohortMonth||'')) + '</td><td>' + _mNum(r.cohort_size) + '</td>' +
        months.map(function(k) {
          var v = parseFloat(r[k]);
          if (isNaN(v)) return '<td>--</td>';
          var bg = 'rgba(72, 187, 120, ' + (Math.min(100,Math.max(0,v))/100 * 0.85).toFixed(2) + ')';
          return '<td class="mt-heat-cell" style="background:' + bg + '">' + v.toFixed(0) + '%</td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';

  var repeatList = repeat.map(function(r) {
    return '<div class="ds-mix-row"><div class="ds-mix-label">' + _mEnc(r.bucket) + '</div>' +
      '<div class="ds-mix-bar" style="width:100%;background:var(--cy)"><span>' + _mNum(r.customers) + ' customers · ' + _mNum(r.total_orders) + ' orders</span></div></div>';
  }).join('');

  return '<div class="ds-sect">' + _mSectionHead('Subscriber Health', (s.narratives.subscribers||'') + ' ' + (s.narratives.nrr || '')) +
    '<div class="ds-drivers-grid">' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Lifecycle</div>' + lifecycle + '</div>' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Retention Economics</div>' + nrrGauge +
        '<div style="margin-top:var(--sp3);font-size:var(--f-xs);color:var(--tx3)">Reactivation: ' + _mNum(react.reactivated) + ' returned customers (of ' + _mNum(react.new_customer_subs) + ' new subs)</div>' +
      '</div>' +
    '</div>' +
    '<div class="ca-section"><div class="ca-section-title">Cohort Retention (12 monthly cohorts, M1-M12 survival)</div>' + (cohort.length ? cohortHTML : '<div class="mt-empty">No cohort data</div>') + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">Repeat Purchase Distribution (current period)</div>' + (repeat.length ? repeatList : '<div class="mt-empty">No repeat data</div>') + '</div>' +
  '</div>';
}

function _mDigSection_FTBP(s) {
  var rows = s.ftbpFunnel || [];
  if (!rows.length) return '';
  var funnels = rows.map(function(r) {
    var regs = +r.registrations || 0;
    var first = +r.placed_first_order || 0;
    var paid = +r.converted_paid || 0;
    var recurring = +r.became_recurring || 0;
    if (!regs) return '';
    return '<div class="ca-section mt-flex-1">' +
      '<div class="ca-section-title">' + _mEnc(r.release) + '</div>' +
      '<div class="em-big-funnel">' +
        '<div class="em-bf-row"><div class="em-bf-label">Registered</div><div class="em-bf-bar" style="width:100%;background:var(--ac)"><span>' + _mNum(regs) + ' · 100%</span></div></div>' +
        '<div class="em-bf-row"><div class="em-bf-label">Placed 1st Order</div><div class="em-bf-bar" style="width:' + (first/regs*100).toFixed(1) + '%;background:var(--cy)"><span>' + _mNum(first) + ' · ' + (first/regs*100).toFixed(0) + '%</span></div></div>' +
        '<div class="em-bf-row"><div class="em-bf-label">Paid Conversion</div><div class="em-bf-bar" style="width:' + Math.max(paid/regs*100, 0.5).toFixed(1) + '%;background:var(--gn)"><span>' + _mNum(paid) + ' · ' + (paid/regs*100).toFixed(1) + '%</span></div></div>' +
        '<div class="em-bf-row"><div class="em-bf-label">Recurring</div><div class="em-bf-bar" style="width:' + Math.max(recurring/regs*100, 0.5).toFixed(1) + '%;background:var(--pu)"><span>' + _mNum(recurring) + ' · ' + (recurring/regs*100).toFixed(1) + '%</span></div></div>' +
      '</div>' +
      '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp2)">Avg ' + (+r.avg_days_to_paid||0).toFixed(1) + 'd to first paid · First paid value ' + _mCur(r.first_paid_total_value) + '</div>' +
    '</div>';
  }).join('');
  return '<div class="ds-sect">' + _mSectionHead('FTBP Funnel', s.narratives.ftbp) +
    '<div class="ds-drivers-grid">' + funnels + '</div></div>';
}

function _mDigSection_Channels(s) {
  var rows = (s.channelMix || []).filter(function(r){return r.win==='current';}).sort(function(a,b){return (+b.revenue)-(+a.revenue);});
  if (!rows.length) return '';
  var total = rows.reduce(function(a,r){return a+(+r.revenue||0);}, 0);
  var bars = rows.map(function(r) {
    var pct = total ? (+r.revenue/total*100) : 0;
    return '<div class="ds-mix-row"><div class="ds-mix-label">' + _mEnc(r.channel) + '</div>' +
      '<div class="ds-mix-bar" style="width:' + pct.toFixed(1) + '%;background:var(--ac)"><span>' + _mCur(r.revenue) + ' · ' + pct.toFixed(0) + '% · ' + _mNum(r.orders) + ' orders</span></div></div>';
  }).join('');

  var promo = (s.promotionLift || []).filter(function(r){return r.win==='current';});
  var promoBar = '';
  if (promo.length >= 2) {
    var withP = promo.find(function(r){return r.segment==='with_promo';}) || {};
    var noP = promo.find(function(r){return r.segment==='no_promo';}) || {};
    var aovLift = +noP.aov > 0 ? ((+withP.aov - +noP.aov) / +noP.aov * 100) : 0;
    promoBar = '<div class="ca-section"><div class="ca-section-title">Promotion Lift</div>' +
      '<div class="ds-promo-compare">' +
        '<div class="ds-promo-card"><div class="ds-promo-label">With promo</div><div class="ds-promo-val" style="color:var(--ac)">' + _mCur(withP.revenue) + '</div><div class="ds-promo-meta">' + _mNum(withP.orders) + ' orders · AOV ' + _mCur(withP.aov) + ' · avg disc ' + _mCur(withP.avg_discount) + '</div></div>' +
        '<div class="ds-promo-card"><div class="ds-promo-label">No promo</div><div class="ds-promo-val">' + _mCur(noP.revenue) + '</div><div class="ds-promo-meta">' + _mNum(noP.orders) + ' orders · AOV ' + _mCur(noP.aov) + '</div></div>' +
        '<div class="ds-promo-card"><div class="ds-promo-label">AOV Δ</div><div class="ds-promo-val" style="color:' + (aovLift > 0 ? 'var(--gn)' : 'var(--rd)') + '">' + (aovLift > 0 ? '+' : '') + aovLift.toFixed(1) + '%</div><div class="ds-promo-meta">with-promo vs no-promo</div></div>' +
      '</div></div>';
  }

  return '<div class="ds-sect">' + _mSectionHead('Channels & Promotions', s.narratives.channels) +
    '<div class="ca-section"><div class="ca-section-title">Channel Mix</div>' + bars + '</div>' + promoBar + '</div>';
}

function _mDigSection_Roasters(s) {
  var curr = (s.roasterTiers || []).filter(function(r){return r.win==='current';});
  var prev = (s.roasterTiers || []).filter(function(r){return r.win==='previous';});
  var prevBy = {}; prev.forEach(function(r){prevBy[r.roaster]=r;});
  if (!curr.length) return '';

  var top15 = curr.slice(0, 15);
  var revBars = top15.map(function(r){return {label: r.roaster||'(unknown)', value: parseFloat(r.revenue)||0, color: 'var(--ac)'};});

  var movers = curr.map(function(c) {
    var p = prevBy[c.roaster];
    if (!p) return null;
    return { roaster: c.roaster, delta: (+c.revenue) - (+p.revenue), curr: +c.revenue, prev: +p.revenue };
  }).filter(Boolean).sort(function(a,b){return Math.abs(b.delta) - Math.abs(a.delta);}).slice(0, 10);

  var movList = movers.map(function(m) {
    var up = m.delta > 0;
    return '<div class="ds-mover-row">' +
      '<span class="ds-mover-name">' + _mEnc(m.roaster) + '</span>' +
      '<span class="ds-mover-delta" style="color:' + (up?'var(--gn)':'var(--rd)') + '">' + (up?'+':'-') + _mCur(Math.abs(m.delta)) + '</span>' +
      '<span class="ds-mover-meta">' + _mCur(m.prev) + ' → ' + _mCur(m.curr) + '</span></div>';
  }).join('');

  var mot = s.motAchievement || [];
  var motByRoaster = {};
  mot.forEach(function(r) {
    var k = r.roaster;
    if (!motByRoaster[k]) motByRoaster[k] = { roaster: k, total: 0, tiers: {} };
    motByRoaster[k].total += +r.total_mot_qty || 0;
    motByRoaster[k].tiers[r.Tier || '?'] = (motByRoaster[k].tiers[r.Tier || '?'] || 0) + (+r.total_mot_qty || 0);
  });
  var motTop = Object.values(motByRoaster).sort(function(a,b){return b.total - a.total;}).slice(0, 10);
  var motTable = '<div class="mt-data-table"><table><thead><tr><th>Roaster</th><th>Total MOT Qty</th><th>Tiers</th></tr></thead><tbody>' +
    motTop.map(function(r){
      return '<tr><td><b>' + _mEnc(r.roaster) + '</b></td><td>' + _mNum(r.total) + '</td><td>' + Object.keys(r.tiers).join(', ') + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  return '<div class="ds-sect">' + _mSectionHead('Roasters', s.narratives.roasters) +
    '<div class="ds-drivers-grid">' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Top 15 by Revenue</div>' + barChart(revBars, { barHeight: 22, gap: 4, maxItems: 15, formatVal: function(v){return _mCur(v);} }) + '</div>' +
      '<div class="ca-section mt-flex-1"><div class="ca-section-title">Biggest Movers vs Prior</div>' + (movList || '<div class="mt-empty">No movement vs prior</div>') + '</div>' +
    '</div>' +
    (mot.length ? '<div class="ca-section"><div class="ca-section-title">MOT Achievement (top 10, current period)</div>' + motTable + '</div>' : '') +
  '</div>';
}

function _mDigSection_Operations(s) {
  var rows = s.slaDeepDive || [];
  if (!rows.length) return '';
  var byMarket = {};
  rows.forEach(function(r) {
    var m = r.market || '?';
    if (!byMarket[m]) byMarket[m] = { shipments: 0, sumLead: 0, carriers: [] };
    byMarket[m].shipments += +r.shipments || 0;
    byMarket[m].sumLead += (+r.avg_lead_time || 0) * (+r.shipments || 0);
    byMarket[m].carriers.push(r);
  });
  var marketCards = Object.keys(byMarket).sort().map(function(m) {
    var d = byMarket[m];
    var avg = d.shipments ? d.sumLead / d.shipments : 0;
    var color = avg > 6 ? 'var(--rd)' : avg > 4 ? 'var(--or)' : 'var(--gn)';
    return '<div class="ds-ops-card">' +
      '<div class="ds-ops-market">' + _mEnc(m) + '</div>' +
      '<div class="ds-ops-lead" style="color:' + color + '">' + avg.toFixed(1) + 'd</div>' +
      '<div class="ds-ops-meta">' + _mNum(d.shipments) + ' shipments · ' + d.carriers.length + ' carrier' + (d.carriers.length !== 1 ? 's' : '') + '</div>' +
    '</div>';
  }).join('');

  var table = '<div class="mt-data-table"><table><thead><tr><th>Market</th><th>Carrier</th><th>Shipments</th><th>Avg Lead</th><th>p50</th><th>p95</th><th>SLA %</th></tr></thead><tbody>' +
    rows.slice(0, 30).map(function(r) {
      var lead = +r.avg_lead_time || 0;
      var leadColor = lead > 6 ? 'var(--rd)' : lead > 4 ? 'var(--or)' : 'var(--gn)';
      return '<tr><td><b>' + _mEnc(r.market||'') + '</b></td><td>' + _mEnc(r.carrier||'') + '</td><td>' + _mNum(r.shipments) + '</td>' +
        '<td style="color:' + leadColor + '">' + lead.toFixed(1) + 'd</td>' +
        '<td>' + (+r.median_lead_time||0).toFixed(1) + 'd</td>' +
        '<td>' + (+r.p95_lead_time||0).toFixed(1) + 'd</td>' +
        '<td>' + (+r.sla_pct||0).toFixed(0) + '%</td></tr>';
    }).join('') + '</tbody></table></div>';

  return '<div class="ds-sect">' + _mSectionHead('Operations (SLA)', s.narratives.operations) +
    '<div class="ds-ops-grid">' + marketCards + '</div>' +
    '<div class="ca-section"><div class="ca-section-title">Carrier × Market Detail</div>' + table + '</div>' +
  '</div>';
}

function _mDigSection_Signal(s) {
  var currCx = (s.cancellationReasons || []).filter(function(r){return r.win==='current';});
  var prevCx = (s.cancellationReasons || []).filter(function(r){return r.win==='previous';});
  var prevByReason = {}; prevCx.forEach(function(r){prevByReason[r.reason]=r;});
  if (!currCx.length) return '';
  var rows = currCx.slice(0, 12).map(function(r) {
    var prev = prevByReason[r.reason];
    return '<tr><td>' + _mEnc(String(r.reason||'').slice(0, 80)) + '</td>' +
      '<td>' + _mNum(r.cases) + '</td>' +
      '<td>' + (prev ? _mNum(prev.cases) : '—') + '</td>' +
      '<td>' + (prev ? _mDeltaPill(+r.cases, +prev.cases) : '') + '</td></tr>';
  }).join('');
  return '<div class="ds-sect">' + _mSectionHead('Customer Signal', s.narratives.signal) +
    '<div class="ca-section"><div class="ca-section-title">Top Cancellation Reasons (current vs prior)</div>' +
      '<div class="mt-data-table"><table><thead><tr><th>Reason</th><th>Current</th><th>Prior</th><th>Δ</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
}

function _mDigSection_Audit(s) {
  var a = s.audit || {};
  var issues = (a.issues || []);
  var content;
  if (!issues.length) {
    content = '<div class="mt-audit-clean">All ' + (a.ok || []).length + ' checks passed · score ' + (a.score != null ? a.score : 0) + '</div>';
  } else {
    content = '<div class="mt-audit-issues">' + issues.map(function(i) {
      var color = i.severity === 'critical' ? 'var(--rd)' : i.severity === 'warning' ? 'var(--or)' : 'var(--tx3)';
      return '<div class="mt-audit-issue"><span class="mt-audit-dot" style="background:' + color + '"></span>' +
        '<span class="mt-audit-metric">' + _mEnc(i.metric) + '</span>' +
        '<span class="mt-audit-detail">' + _mEnc(i.detail) + '</span></div>';
    }).join('') + '</div>';
  }
  var errKeys = Object.keys(s.errors || {});
  var errBlock = errKeys.length ? '<div style="margin-top:var(--sp3);padding:var(--sp3);background:var(--rdbg);border-left:3px solid var(--rd);border-radius:4px"><b>Failed slices:</b> ' + errKeys.join(', ') + '</div>' : '';
  return '<div class="ds-sect">' + _mSectionHead('Data Quality', s.narratives.audit) +
    '<div class="ca-section">' + content + errBlock + '</div></div>';
}

// ─── Legacy no-ops (kept so other modules don't break) ───────
function loadDigestData() {}
function setCadence() {}
function setDigestView() {}
function loadLearningState() {}
function loadDigestFreshness() {}
function _mSwitchFY(fy) { state._metricsPeriod = 'FY' + fy; _mRefresh(); }
function _mDrillDown(dim, metric) {
  state._metricsView = 'explore';
  state._sliceDim = dim;
  state._sliceMetric = metric;
  _sliceData = null;
  renderAll();
  _sliceRun();
}
