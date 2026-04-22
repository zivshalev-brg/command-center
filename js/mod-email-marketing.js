// ===============================================================
// EMAIL TAB — Performance dashboard (Databricks) + SFMC templates
// ===============================================================
//
// Two sub-views:
//   'performance' — live Databricks per-send metrics (CTR, open rate,
//                   unsubs, bounces). Default view.
//   'templates'   — SFMC template browser with perf overlay.

if (!state.emFilter) state.emFilter = 'all';
if (!state.emSearch) state.emSearch = '';
if (!state.emSort) state.emSort = 'modified';
if (!state.emPreview) state.emPreview = null;
if (!state.emView) state.emView = 'performance';
if (!state.emPerfDays) state.emPerfDays = 90;
if (!state.emPerfRegion) state.emPerfRegion = '';
if (!state.emPerfKind) state.emPerfKind = '';
if (!state.emPerfSort) state.emPerfSort = 'sentDate';
if (!state.emPerfSearch) state.emPerfSearch = '';
if (!state.emPerfDetail) state.emPerfDetail = null;

// Cached data from Databricks
var _emPerfData = null;
var _emPerfLoading = false;
var _emPerfError = null;
var _emLinksData = null;
var _emLinksLoading = false;
var _emPerfByName = {}; // EmailName → aggregated metrics (for templates overlay)

function _emEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _emFmtN(v) {
  if (v == null || isNaN(v)) return '--';
  var n = parseFloat(v);
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}
function _emFmtPct(v, digits) {
  if (v == null || isNaN(v)) return '--';
  return parseFloat(v).toFixed(digits == null ? 1 : digits) + '%';
}
function _emTimeAgo(d) {
  if(!d)return'';
  var diff=Date.now()-new Date(d).getTime();
  var m=Math.floor(diff/60000);
  if(m<1)return'just now'; if(m<60)return m+'m ago';
  var h=Math.floor(m/60); if(h<24)return h+'h ago';
  var dy=Math.floor(h/24); if(dy<7)return dy+'d ago';
  if(dy<30)return Math.floor(dy/7)+'w ago';
  return new Date(d).toLocaleDateString();
}
function _emShortDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }); } catch { return d; }
}

function _emKindOf(name, isBIEDM, isWelcome) {
  var n = String(name || '').toLowerCase();
  if (String(isBIEDM).toLowerCase() === 'true' || n.startsWith('biedm')) return 'BIEDM';
  if (String(isWelcome).toLowerCase() === 'true' || n.includes('welcome')) return 'Welcome';
  if (n.includes('orderconfirmation') || n.includes('ordershipment') || n.includes('orderpartial')) return 'Transactional';
  if (n.includes('subscription') || n.includes('cardexpiry') || n.includes('oos') || n.includes('discountending') || n.includes('cancellation') || n.includes('paused') || n.includes('paymentfailure')) return 'Lifecycle';
  if (n.includes('ratemycoffee') || n.includes('dialin')) return 'Engagement';
  if (n.includes('mice') || n.includes('bei') || n.includes('freebeanspromo') || n.includes('bonuscoffee') || n.includes('springbonus')) return 'Promo';
  if (n.includes('doubleoptin') || n.includes('leadcapture')) return 'Lead';
  return 'Other';
}
function _emKindColor(k) {
  return {
    BIEDM: 'var(--ac)', Welcome: 'var(--gn)', Transactional: 'var(--cy)',
    Lifecycle: 'var(--pu)', Engagement: 'var(--or)', Promo: 'var(--rd)',
    Lead: 'var(--tx2)', Other: 'var(--tx3)'
  }[k] || 'var(--tx3)';
}
function _emRegionColor(r) {
  return { AU:'var(--gn)', UK:'var(--cy)', US:'var(--pu)', DE:'var(--or)', NL:'var(--ac)', Global:'var(--tx3)' }[r] || 'var(--tx3)';
}

// ─── Data loaders ────────────────────────────────────────────
function loadEmailPerfData(force) {
  if (_emPerfLoading && !force) return;
  _emPerfLoading = true;
  _emPerfError = null;
  renderAll();
  var q = 'days=' + (state.emPerfDays || 90) + '&minSends=20';
  fetch('/api/databricks/email/sends?' + q).then(function(r){return r.json();}).then(function(d) {
    _emPerfLoading = false;
    if (d && d.ok && d.sends) {
      _emPerfData = d.sends;
      // Index by EmailName for templates overlay
      _emPerfByName = {};
      d.sends.forEach(function(s) {
        var n = s.EmailName;
        if (!n) return;
        if (!_emPerfByName[n]) _emPerfByName[n] = { sends:0, opens:0, clicks:0, unsubs:0, bounces:0, send_count:0 };
        var a = _emPerfByName[n];
        a.sends += parseInt(s.sends,10)||0;
        a.opens += parseInt(s.opens,10)||0;
        a.clicks += parseInt(s.clicks,10)||0;
        a.unsubs += parseInt(s.unsubs,10)||0;
        a.bounces += parseInt(s.bounces,10)||0;
        a.send_count++;
      });
      Object.keys(_emPerfByName).forEach(function(k) {
        var a = _emPerfByName[k];
        a.open_rate = a.sends > 0 ? Math.round(1000 * a.opens / a.sends) / 10 : 0;
        a.ctr = a.sends > 0 ? Math.round(10000 * a.clicks / a.sends) / 100 : 0;
      });
    } else {
      _emPerfError = (d && d.error) || 'Failed to load email performance';
    }
    renderAll();
  }).catch(function(e) {
    _emPerfLoading = false;
    _emPerfError = e.message;
    renderAll();
  });
}

function loadEmailLinksData() {
  if (_emLinksLoading || _emLinksData) return;
  _emLinksLoading = true;
  fetch('/api/databricks/email/links?days=' + (state.emPerfDays || 90)).then(function(r){return r.json();}).then(function(d) {
    _emLinksLoading = false;
    if (d && d.ok && d.links) _emLinksData = d.links;
    renderAll();
  }).catch(function() { _emLinksLoading = false; renderAll(); });
}

function loadEmailMarketingData() {
  DATA.emLoading = true;
  renderAll();
  fetch('/api/email-marketing').then(function(r){return r.json();}).then(function(d) {
    DATA.emailMarketing = d;
    DATA.emLoading = false;
    renderAll();
  }).catch(function(e) { DATA.emLoading = false; DATA.emError = e.message; renderAll(); });
}

function loadEmailPreview(id) {
  state.emPreview = { loading: true, id: id };
  renderAll();
  fetch('/api/email-marketing/preview/' + id).then(function(r){return r.json();}).then(function(d) {
    if (d.error) { state.emPreview = { error: d.error }; }
    else { state.emPreview = d; }
    renderAll();
  }).catch(function(e) { state.emPreview = { error: e.message }; renderAll(); });
}

// ─── Filter + sort helpers ───────────────────────────────────
function _emFilteredPerf() {
  if (!_emPerfData) return [];
  var rows = _emPerfData.slice();
  if (state.emPerfRegion) rows = rows.filter(function(r){return (r.EmailRegion||'') === state.emPerfRegion;});
  if (state.emPerfKind) rows = rows.filter(function(r){return _emKindOf(r.EmailName, r.IsBIEDM, r.IsWelcomeJourney) === state.emPerfKind;});
  if (state.emPerfSearch) {
    var q = state.emPerfSearch.toLowerCase();
    rows = rows.filter(function(r){
      return (r.EmailName||'').toLowerCase().includes(q) || (r.Subject||'').toLowerCase().includes(q);
    });
  }
  var s = state.emPerfSort;
  rows.sort(function(a,b) {
    if (s === 'sends') return (parseInt(b.sends,10)||0) - (parseInt(a.sends,10)||0);
    if (s === 'openRate') return (parseFloat(b.open_rate)||0) - (parseFloat(a.open_rate)||0);
    if (s === 'ctr') return (parseFloat(b.ctr)||0) - (parseFloat(a.ctr)||0);
    if (s === 'unsubRate') return (parseFloat(b.unsub_rate)||0) - (parseFloat(a.unsub_rate)||0);
    if (s === 'name') return (a.EmailName||'').localeCompare(b.EmailName||'');
    return new Date(b.SentDate||0) - new Date(a.SentDate||0);
  });
  return rows;
}

// ─── Sidebar ─────────────────────────────────────────────────
function renderEmailMarketingSidebar() {
  var sb = $('sidebar');

  var html = '<div class="ca-sb">';

  // View switcher
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">View</div>' +
    '<div style="display:flex;gap:4px;margin-top:4px">' +
    '<button class="btn btn-sm" style="flex:1' + (state.emView==='performance'?';background:var(--ac);color:#fff':'') + '" onclick="state.emView=\'performance\';state.emPerfDetail=null;state.emPreview=null;renderAll()">Performance</button>' +
    '<button class="btn btn-sm" style="flex:1' + (state.emView==='templates'?';background:var(--ac);color:#fff':'') + '" onclick="state.emView=\'templates\';state.emPerfDetail=null;renderAll()">Templates</button>' +
    '</div></div>';

  if (state.emView === 'performance') {
    html += _emSidebarPerf();
  } else {
    html += _emSidebarTemplates();
  }

  html += '</div>';
  sb.innerHTML = html;

  // Auto-load perf data
  if (state.emView === 'performance' && !_emPerfData && !_emPerfLoading && !_emPerfError) loadEmailPerfData();
  if (state.emView === 'templates' && !DATA.emailMarketing && !DATA.emLoading) loadEmailMarketingData();
}

function _emSidebarPerf() {
  var rows = _emFilteredPerf();
  var kinds = ['', 'BIEDM', 'Welcome', 'Transactional', 'Lifecycle', 'Engagement', 'Promo', 'Lead', 'Other'];
  var regions = ['', 'AU', 'UK', 'US', 'DE', 'NL'];
  var days = [30, 60, 90, 180, 365];

  // Aggregates
  var sends = rows.reduce(function(a,r){return a + (parseInt(r.sends,10)||0);}, 0);
  var opens = rows.reduce(function(a,r){return a + (parseInt(r.opens,10)||0);}, 0);
  var clicks = rows.reduce(function(a,r){return a + (parseInt(r.clicks,10)||0);}, 0);
  var openRate = sends > 0 ? (opens/sends*100) : 0;
  var ctr = sends > 0 ? (clicks/sends*100) : 0;

  var html = '';

  // Summary KPIs
  html += '<div class="ca-sb-stats">' +
    '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--ac)">' + rows.length + '</span><span class="ca-sb-stat-label">Sends</span></div>' +
    '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--gn)">' + openRate.toFixed(1) + '%</span><span class="ca-sb-stat-label">Avg Open</span></div>' +
  '</div>';
  html += '<div class="ca-sb-stats" style="margin-top:var(--sp2)">' +
    '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--cy)">' + _emFmtN(sends) + '</span><span class="ca-sb-stat-label">Recipients</span></div>' +
    '<div class="ca-sb-stat"><span class="ca-sb-stat-val" style="color:var(--or)">' + ctr.toFixed(2) + '%</span><span class="ca-sb-stat-label">Avg CTR</span></div>' +
  '</div>';

  // Lookback
  html += '<div class="ca-sb-date" style="margin-top:var(--sp3)"><div class="ca-sb-date-label">Lookback</div>' +
    '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' +
    days.map(function(d) {
      var active = state.emPerfDays === d ? ' style="background:var(--ac);color:#fff"' : '';
      return '<button class="btn btn-sm"' + active + ' onclick="state.emPerfDays=' + d + ';_emPerfData=null;_emLinksData=null;loadEmailPerfData(true)">' + d + 'd</button>';
    }).join('') + '</div></div>';

  // Region filter
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">Region</div>' +
    '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' +
    regions.map(function(r) {
      var active = state.emPerfRegion === r ? ' style="background:var(--ac);color:#fff"' : '';
      return '<button class="btn btn-sm"' + active + ' onclick="state.emPerfRegion=\'' + r + '\';renderAll()">' + (r||'All') + '</button>';
    }).join('') + '</div></div>';

  // Kind filter
  html += '<div class="ca-sb-nav">';
  kinds.forEach(function(k) {
    var label = k || 'All Kinds';
    var count = k ? _emPerfData ? _emPerfData.filter(function(r){return _emKindOf(r.EmailName, r.IsBIEDM, r.IsWelcomeJourney)===k;}).length : 0 : (_emPerfData||[]).length;
    var active = state.emPerfKind === k ? ' active' : '';
    html += '<div class="ca-sb-nav-item' + active + '" onclick="state.emPerfKind=\'' + k + '\';renderAll()">' +
      '<span>' + label + '</span><span class="nb">' + count + '</span></div>';
  });
  html += '</div>';

  // Refresh
  html += '<button class="ca-sb-refresh" style="margin-top:auto" onclick="_emPerfData=null;_emLinksData=null;_emPerfByName={};loadEmailPerfData(true)">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
    ' Refresh Performance</button>';

  return html;
}

function _emSidebarTemplates() {
  var emails = DATA.emailMarketing ? DATA.emailMarketing.emails || [] : [];
  var catMap = {};
  emails.forEach(function(e) { var c = e.category || 'Uncategorised'; catMap[c] = (catMap[c]||0)+1; });
  var cats = Object.entries(catMap).sort(function(a,b){return b[1]-a[1];});

  var html = '';
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">Templates</div><div class="ca-sb-date-val" style="font-size:var(--f-2xl);font-weight:var(--fw-b)">' + emails.length + '</div></div>';
  html += '<button class="ca-sb-refresh" onclick="DATA.emailMarketing=null;loadEmailMarketingData()">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Refresh</button>';
  html += '<div style="padding:var(--sp2) var(--sp3)"><input class="filter-input" placeholder="Search templates..." value="' + _emEnc(state.emSearch) + '" oninput="state.emSearch=this.value;renderAll()" style="width:100%"/></div>';
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">Sort by</div><div style="display:flex;gap:4px;flex-wrap:wrap">' +
    '<button class="btn btn-sm"' + (state.emSort==='modified'?' style="background:var(--ac);color:#fff"':'') + ' onclick="state.emSort=\'modified\';renderAll()">Modified</button>' +
    '<button class="btn btn-sm"' + (state.emSort==='created'?' style="background:var(--ac);color:#fff"':'') + ' onclick="state.emSort=\'created\';renderAll()">Created</button>' +
    '<button class="btn btn-sm"' + (state.emSort==='name'?' style="background:var(--ac);color:#fff"':'') + ' onclick="state.emSort=\'name\';renderAll()">Name</button>' +
    '</div></div>';
  html += '<div class="ca-sb-nav">' +
    '<div class="ca-sb-nav-item' + (state.emFilter==='all'?' active':'') + '" onclick="state.emFilter=\'all\';renderAll()"><span>All Emails</span><span class="nb">' + emails.length + '</span></div>';
  cats.forEach(function(c) {
    var safe = (c[0]||'').replace(/'/g, "\\'");
    html += '<div class="ca-sb-nav-item' + (state.emFilter===c[0]?' active':'') + '" onclick="state.emFilter=\'' + safe + '\';renderAll()"><span>' + _emEnc(c[0]) + '</span><span class="nb">' + c[1] + '</span></div>';
  });
  html += '</div>';
  return html;
}

// ─── Main ────────────────────────────────────────────────────
function renderEmailMarketingMain() {
  var el = $('main');

  // Detail panel — highest priority
  if (state.emPerfDetail) { el.innerHTML = _emRenderPerfDetail(); return; }
  if (state.emPreview) { el.innerHTML = _emRenderPreview(); return; }

  if (state.emView === 'performance') { el.innerHTML = _emRenderPerf(); return; }
  el.innerHTML = _emRenderTemplates();
}

// ─── Performance grid ────────────────────────────────────────
function _emRenderPerf() {
  if (_emPerfLoading && !_emPerfData) {
    return '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading email performance from Databricks... first query takes ~20s</p></div>';
  }
  if (_emPerfError) {
    return '<div class="ca-main"><div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg)">' +
      '<div class="ca-narrative-label" style="color:var(--rd)">Email perf error</div><p>' + _emEnc(_emPerfError) + '</p>' +
      '<button class="btn btn-sm" style="margin-top:var(--sp2)" onclick="_emPerfError=null;loadEmailPerfData(true)">Retry</button></div></div>';
  }
  if (!_emPerfData) return '<div class="ca-loading"><p>No email data.</p></div>';

  var rows = _emFilteredPerf();

  // Header + hero KPIs
  var totalSends = rows.reduce(function(a,r){return a+(parseInt(r.sends,10)||0);}, 0);
  var totalOpens = rows.reduce(function(a,r){return a+(parseInt(r.opens,10)||0);}, 0);
  var totalClicks = rows.reduce(function(a,r){return a+(parseInt(r.clicks,10)||0);}, 0);
  var totalUnsubs = rows.reduce(function(a,r){return a+(parseInt(r.unsubs,10)||0);}, 0);
  var totalBounces = rows.reduce(function(a,r){return a+(parseInt(r.bounces,10)||0);}, 0);
  var avgOpen = totalSends > 0 ? (totalOpens/totalSends*100) : 0;
  var avgCTR = totalSends > 0 ? (totalClicks/totalSends*100) : 0;
  var avgUnsub = totalSends > 0 ? (totalUnsubs/totalSends*100) : 0;
  var avgBounce = totalSends > 0 ? (totalBounces/totalSends*100) : 0;

  var hero = '<div class="mt-hero-grid" style="margin-bottom:var(--sp4)">' +
    _emHero('Sends', rows.length + ' campaigns', 'var(--ac)', _emFmtN(totalSends) + ' recipients') +
    _emHero('Avg Open Rate', _emFmtPct(avgOpen), 'var(--gn)', _emFmtN(totalOpens) + ' opens') +
    _emHero('Avg CTR', _emFmtPct(avgCTR, 2), avgCTR > 3 ? 'var(--gn)' : 'var(--or)', _emFmtN(totalClicks) + ' clicks') +
    _emHero('Unsub Rate', _emFmtPct(avgUnsub, 2), avgUnsub > 0.3 ? 'var(--rd)' : 'var(--gn)', _emFmtN(totalUnsubs) + ' unsubs') +
    _emHero('Bounce Rate', _emFmtPct(avgBounce, 2), avgBounce > 2 ? 'var(--rd)' : 'var(--gn)', _emFmtN(totalBounces) + ' bounces') +
    _emHero('Lookback', state.emPerfDays + 'd', 'var(--cy)',
      (rows[rows.length-1] && rows[rows.length-1].SentDate ? 'oldest ' + _emShortDate(rows[rows.length-1].SentDate) : '')) +
  '</div>';

  // Search + sort bar
  var toolbar = '<div class="mt-explore-filters" style="margin-bottom:var(--sp4)">' +
    '<div class="mt-filter-group" style="flex:1;min-width:280px"><label class="mt-filter-label">Search</label>' +
      '<input class="mt-filter-select" type="text" placeholder="name or subject..." value="' + _emEnc(state.emPerfSearch) + '" oninput="state.emPerfSearch=this.value;renderAll()"/></div>' +
    '<div class="mt-filter-group"><label class="mt-filter-label">Sort</label>' +
      '<select class="mt-filter-select" onchange="state.emPerfSort=this.value;renderAll()">' +
        '<option value="sentDate"' + (state.emPerfSort==='sentDate'?' selected':'') + '>Most recent</option>' +
        '<option value="sends"' + (state.emPerfSort==='sends'?' selected':'') + '>Most sends</option>' +
        '<option value="openRate"' + (state.emPerfSort==='openRate'?' selected':'') + '>Best open rate</option>' +
        '<option value="ctr"' + (state.emPerfSort==='ctr'?' selected':'') + '>Best CTR</option>' +
        '<option value="unsubRate"' + (state.emPerfSort==='unsubRate'?' selected':'') + '>Highest unsubs</option>' +
        '<option value="name"' + (state.emPerfSort==='name'?' selected':'') + '>Name (A-Z)</option>' +
      '</select></div>' +
    '<div style="align-self:flex-end;font-size:var(--f-xs);color:var(--tx3);padding:0 var(--sp3) 8px">' + rows.length + ' of ' + _emPerfData.length + ' sends</div>' +
  '</div>';

  // Grid of cards
  var grid;
  if (!rows.length) {
    grid = '<div class="mt-empty">No sends match your filters.</div>';
  } else {
    grid = '<div class="em-perf-grid">';
    rows.forEach(function(r) {
      grid += _emPerfCard(r);
    });
    grid += '</div>';
  }

  return '<div class="ca-main"><div class="ca-header"><h2>Email Performance</h2>' +
    '<span class="mt-source-badge" style="color:var(--gn);border:1px solid var(--gn);padding:2px 8px;border-radius:10px;margin-left:var(--sp2);font-size:var(--f-xs)">&#9679; databricks</span></div>' +
    hero + toolbar + grid +
  '</div>';
}

function _emHero(title, value, color, primary) {
  return '<div class="mt-hero">' +
    '<div class="mt-hero-title">' + _emEnc(title) + '</div>' +
    '<div class="mt-hero-value" style="color:' + color + '">' + value + '</div>' +
    (primary ? '<div class="mt-hero-primary">' + _emEnc(primary) + '</div>' : '') +
  '</div>';
}

function _emPerfCard(r) {
  var kind = _emKindOf(r.EmailName, r.IsBIEDM, r.IsWelcomeJourney);
  var region = r.EmailRegion || '';
  var openRate = parseFloat(r.open_rate) || 0;
  var ctr = parseFloat(r.ctr) || 0;
  var cto = parseFloat(r.click_to_open) || 0;
  var unsub = parseFloat(r.unsub_rate) || 0;
  var bounce = parseFloat(r.bounce_rate) || 0;
  var sends = parseInt(r.sends, 10) || 0;
  var safeName = String(r.EmailName || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  // Health colors
  var openColor = openRate >= 40 ? 'var(--gn)' : openRate >= 25 ? 'var(--or)' : 'var(--rd)';
  var ctrColor = ctr >= 3 ? 'var(--gn)' : ctr >= 1 ? 'var(--or)' : 'var(--rd)';
  var unsubColor = unsub > 0.5 ? 'var(--rd)' : unsub > 0.2 ? 'var(--or)' : 'var(--gn)';

  return '<div class="em-perf-card" onclick="_emOpenDetail(\'' + safeName + '\')">' +
    // Top bar: kind + region
    '<div class="em-perf-card-top" style="background:linear-gradient(90deg,' + _emKindColor(kind) + '40,transparent)">' +
      '<span class="em-chip" style="background:' + _emKindColor(kind) + '22;color:' + _emKindColor(kind) + '">' + kind + '</span>' +
      (region ? '<span class="em-chip" style="background:' + _emRegionColor(region) + '22;color:' + _emRegionColor(region) + ';margin-left:4px">' + region + '</span>' : '') +
      '<span class="em-perf-card-date">' + _emShortDate(r.SentDate) + '</span>' +
    '</div>' +
    // Name + subject
    '<div class="em-perf-card-body">' +
      '<div class="em-perf-card-name" title="' + _emEnc(r.EmailName||'') + '">' + _emEnc(r.EmailName || '') + '</div>' +
      (r.Subject ? '<div class="em-perf-card-subject" title="' + _emEnc(r.Subject) + '">' + _emEnc(r.Subject) + '</div>' : '') +
      // Metrics grid
      '<div class="em-perf-card-metrics">' +
        '<div class="em-metric"><div class="em-metric-label">SENDS</div><div class="em-metric-value">' + _emFmtN(sends) + '</div></div>' +
        '<div class="em-metric"><div class="em-metric-label">OPEN</div><div class="em-metric-value" style="color:' + openColor + '">' + openRate.toFixed(1) + '%</div></div>' +
        '<div class="em-metric"><div class="em-metric-label">CTR</div><div class="em-metric-value" style="color:' + ctrColor + '">' + ctr.toFixed(2) + '%</div></div>' +
        '<div class="em-metric"><div class="em-metric-label">CTO</div><div class="em-metric-value">' + cto.toFixed(1) + '%</div></div>' +
        '<div class="em-metric"><div class="em-metric-label">UNSUB</div><div class="em-metric-value" style="color:' + unsubColor + '">' + unsub.toFixed(2) + '%</div></div>' +
        '<div class="em-metric"><div class="em-metric-label">BOUNCE</div><div class="em-metric-value">' + bounce.toFixed(2) + '%</div></div>' +
      '</div>' +
      // Funnel bar
      _emFunnelBar(sends, parseInt(r.opens,10)||0, parseInt(r.clicks,10)||0) +
    '</div>' +
  '</div>';
}

function _emFunnelBar(sends, opens, clicks) {
  if (!sends) return '';
  var openPct = Math.min(100, opens/sends * 100);
  var clickPct = Math.min(100, clicks/sends * 100);
  return '<div class="em-funnel">' +
    '<div class="em-funnel-track">' +
      '<div class="em-funnel-sent" style="width:100%"><span>Sent</span></div>' +
      '<div class="em-funnel-open" style="width:' + openPct.toFixed(1) + '%"><span>Open</span></div>' +
      '<div class="em-funnel-click" style="width:' + clickPct.toFixed(1) + '%"><span>Click</span></div>' +
    '</div>' +
  '</div>';
}

// ─── Detail panel ────────────────────────────────────────────
function _emOpenDetail(emailName) {
  state.emPerfDetail = { name: emailName, loading: true, templateLoading: true };
  renderAll();
  loadEmailLinksData();

  // Kick off perf lookup
  fetch('/api/databricks/email/by-name?name=' + encodeURIComponent(emailName) + '&days=' + (state.emPerfDays || 90))
    .then(function(r){return r.json();}).then(function(d) {
      if (!state.emPerfDetail || state.emPerfDetail.name !== emailName) return;
      state.emPerfDetail = Object.assign({}, state.emPerfDetail, { loading: false, data: d.data });
      renderAll();
    }).catch(function() {
      if (!state.emPerfDetail || state.emPerfDetail.name !== emailName) return;
      state.emPerfDetail = Object.assign({}, state.emPerfDetail, { loading: false, error: 'Lookup failed' });
      renderAll();
    });

  // Kick off template lookup: need SFMC list, then find by EmailName, then fetch HTML
  _emLoadTemplateForDetail(emailName);
}

function _emLoadTemplateForDetail(emailName) {
  function setTemplate(patch) {
    if (!state.emPerfDetail || state.emPerfDetail.name !== emailName) return;
    state.emPerfDetail = Object.assign({}, state.emPerfDetail, patch);
    renderAll();
  }

  function findAndFetch() {
    if (!DATA.emailMarketing || !DATA.emailMarketing.emails) {
      setTemplate({ templateLoading: false, templateStatus: 'no-templates' });
      return;
    }
    var exact = DATA.emailMarketing.emails.find(function(e){return e.name === emailName;});
    var fuzzy = exact || DATA.emailMarketing.emails.find(function(e){
      var n = e.name || '';
      // Try stripping common suffix variations
      return n === emailName ||
             n.replace(/\s+$/, '') === emailName.replace(/\s+$/, '') ||
             (emailName.length > 10 && n.toLowerCase().includes(emailName.toLowerCase())) ||
             (emailName.length > 10 && emailName.toLowerCase().includes(n.toLowerCase()));
    });
    if (!fuzzy) {
      setTemplate({ templateLoading: false, templateStatus: 'not-found' });
      return;
    }
    setTemplate({ templateLoading: true, templateMatch: fuzzy });
    fetch('/api/email-marketing/preview/' + fuzzy.id).then(function(r){return r.json();}).then(function(t) {
      if (t && t.error) setTemplate({ templateLoading: false, templateStatus: 'preview-error', templateError: t.error });
      else setTemplate({ templateLoading: false, templateStatus: 'loaded', template: t });
    }).catch(function(e) {
      setTemplate({ templateLoading: false, templateStatus: 'preview-error', templateError: e.message });
    });
  }

  // If we don't have templates yet, load them first
  if (!DATA.emailMarketing && !DATA.emLoading) {
    DATA.emLoading = true;
    fetch('/api/email-marketing').then(function(r){return r.json();}).then(function(d) {
      DATA.emailMarketing = d;
      DATA.emLoading = false;
      findAndFetch();
    }).catch(function() {
      DATA.emLoading = false;
      setTemplate({ templateLoading: false, templateStatus: 'fetch-failed' });
    });
  } else if (DATA.emLoading) {
    // Poll until done, then match
    var tries = 0;
    var poll = setInterval(function() {
      tries++;
      if (DATA.emailMarketing || tries > 30) {
        clearInterval(poll);
        findAndFetch();
      }
    }, 500);
  } else {
    findAndFetch();
  }
}

function _emRenderPerfDetail() {
  var d = state.emPerfDetail;
  var back = '<button class="btn btn-g" style="display:inline-flex;align-items:center;gap:4px" onclick="state.emPerfDetail=null;renderAll()">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';

  if (d.loading && !d.data) return '<div class="em-split"><div class="em-split-left">' + back + '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading performance for ' + _emEnc(d.name) + '...</p></div></div>' + _emRenderTemplatePane(d) + '</div>';
  if (d.error) return '<div class="em-split"><div class="em-split-left">' + back + '<div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg);margin-top:var(--sp3)"><p>' + _emEnc(d.error) + '</p></div></div>' + _emRenderTemplatePane(d) + '</div>';
  if (!d.data) return '<div class="em-split"><div class="em-split-left">' + back + '<div class="ca-narrative" style="margin-top:var(--sp3)"><p>No performance data for this email in the selected window.</p></div></div>' + _emRenderTemplatePane(d) + '</div>';

  var data = d.data;
  var sends = parseInt(data.sends,10)||0;
  var opens = parseInt(data.opens,10)||0;
  var clicks = parseInt(data.clicks,10)||0;
  var unsubs = parseInt(data.unsubs,10)||0;
  var bounces = parseInt(data.bounces,10)||0;

  var sendRows = (_emPerfData || []).filter(function(r){return r.EmailName === d.name;}).sort(function(a,b){return new Date(b.SentDate||0) - new Date(a.SentDate||0);});
  var linkRows = (_emLinksData || []).filter(function(r){return r.EmailName === d.name;}).slice(0, 30);

  // Header
  var header = '<div class="ca-header" style="align-items:flex-start;flex-wrap:wrap;gap:var(--sp2)">' + back +
    '<div style="margin-left:var(--sp3);flex:1;min-width:0">' +
      '<h2 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--f-lg)">' + _emEnc(d.name) + '</h2>' +
      (d.templateMatch && d.templateMatch.subject ? '<div style="font-size:var(--f-xs);color:var(--tx2);margin-top:2px">Subject: ' + _emEnc(d.templateMatch.subject) + '</div>' : '') +
    '</div>' +
  '</div>';

  // KPI cards
  var cards = '<div class="em-detail-kpis">' +
    '<div class="ca-card"><div class="ca-card-title">Total Sends</div><div class="ca-card-value">' + _emFmtN(sends) + '</div><div class="ca-card-meta">' + (data.send_count||0) + ' send jobs</div></div>' +
    '<div class="ca-card"><div class="ca-card-title">Open Rate</div><div class="ca-card-value" style="color:var(--gn)">' + _emFmtPct(data.open_rate) + '</div><div class="ca-card-meta">' + _emFmtN(opens) + ' opens</div></div>' +
    '<div class="ca-card"><div class="ca-card-title">CTR</div><div class="ca-card-value" style="color:var(--ac)">' + _emFmtPct(data.ctr, 2) + '</div><div class="ca-card-meta">' + _emFmtN(clicks) + ' clicks</div></div>' +
    '<div class="ca-card"><div class="ca-card-title">Unsubs</div><div class="ca-card-value" style="color:var(--rd)">' + _emFmtN(unsubs) + '</div><div class="ca-card-meta">' + (sends?((unsubs/sends*100).toFixed(2)+'%'):'--') + '</div></div>' +
    '<div class="ca-card"><div class="ca-card-title">Bounces</div><div class="ca-card-value" style="color:var(--or)">' + _emFmtN(bounces) + '</div><div class="ca-card-meta">' + (sends?((bounces/sends*100).toFixed(2)+'%'):'--') + '</div></div>' +
    '<div class="ca-card"><div class="ca-card-title">Date Range</div><div class="ca-card-value" style="font-size:var(--f-md)">' + _emShortDate(data.first_send) + '</div><div class="ca-card-meta">→ ' + _emShortDate(data.last_send) + '</div></div>' +
  '</div>';

  var funnel = '<div class="ca-section"><div class="ca-section-title">Funnel</div>' + _emBigFunnel(sends, opens, clicks, unsubs) + '</div>';

  var histTable = '<div class="ca-section"><div class="ca-section-title">Send History (' + sendRows.length + ')</div>' +
    '<div class="mt-data-table"><table><thead><tr>' +
    '<th>Sent</th><th>Region</th><th>Sends</th><th>Open %</th><th>CTR</th><th>CTO</th><th>Unsub %</th>' +
    '</tr></thead><tbody>' +
    sendRows.map(function(r) {
      return '<tr>' +
        '<td>' + _emShortDate(r.SentDate) + '</td>' +
        '<td>' + _emEnc(r.EmailRegion||'--') + '</td>' +
        '<td>' + _emFmtN(r.sends) + '</td>' +
        '<td>' + _emFmtPct(r.open_rate) + '</td>' +
        '<td>' + _emFmtPct(r.ctr, 2) + '</td>' +
        '<td>' + _emFmtPct(r.click_to_open) + '</td>' +
        '<td>' + _emFmtPct(r.unsub_rate, 2) + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div></div>';

  var linksSection = '';
  if (linkRows.length) {
    linksSection = '<div class="ca-section"><div class="ca-section-title">Top Clicked Links</div>' +
      '<div class="mt-data-table"><table><thead><tr><th>URL</th><th>Unique</th><th>Total</th></tr></thead><tbody>' +
      linkRows.map(function(l) {
        var urlDisplay = l.ClickURL ? l.ClickURL.replace(/^https?:\/\//, '').slice(0, 70) : '';
        return '<tr>' +
          '<td><a href="' + _emEnc(l.ClickURL) + '" target="_blank" style="color:var(--ac);text-decoration:none;word-break:break-all">' + _emEnc(urlDisplay) + '</a></td>' +
          '<td>' + _emFmtN(l.unique_clicks) + '</td>' +
          '<td>' + _emFmtN(l.total_clicks) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div></div>';
  } else if (_emLinksLoading) {
    linksSection = '<div class="ca-section"><div class="ca-section-title">Top Clicked Links</div><div class="mt-empty">Loading...</div></div>';
  }

  var left = '<div class="em-split-left">' + header + cards + funnel + histTable + linksSection + '</div>';
  var right = _emRenderTemplatePane(d);

  return '<div class="em-split">' + left + right + '</div>';
}

function _emRenderTemplatePane(d) {
  var right = '<div class="em-split-right">';
  right += '<div class="em-split-right-header">';
  right += '<span style="font-size:var(--f-xs);color:var(--tx3);text-transform:uppercase;letter-spacing:0.5px;font-weight:var(--fw-m)">Rendered Template</span>';

  if (d.templateLoading) {
    right += '</div><div class="ca-loading" style="flex:1"><div class="ca-spinner"></div><p>Looking up template...</p></div></div>';
    return right;
  }

  if (d.templateStatus === 'not-found' || d.templateStatus === 'no-templates') {
    right += '</div><div class="em-split-right-body"><div class="mt-empty" style="margin:var(--sp4)">No SFMC template matched <code>' + _emEnc(d.name) + '</code>.<br/><br/><small>Databricks tracks the EmailName from send jobs; some sends come from journeys or AmpScript that don\'t map 1:1 to an asset.</small></div></div></div>';
    return right;
  }

  if (d.templateStatus === 'preview-error' || d.templateStatus === 'fetch-failed') {
    right += '</div><div class="em-split-right-body"><div class="ca-narrative" style="border-left-color:var(--rd);background:var(--rdbg);margin:var(--sp3)"><p>Template preview failed: ' + _emEnc(d.templateError || 'unknown') + '</p></div></div></div>';
    return right;
  }

  if (d.templateStatus === 'loaded' && d.template) {
    var t = d.template;
    right += '<span style="margin-left:auto;font-size:var(--f-xs);color:var(--tx3)">' + _emEnc(t.name || d.name) + '</span>';
    right += '</div>';

    if (t.subject) right += '<div class="em-template-meta">Subject: <strong>' + _emEnc(t.subject) + '</strong></div>';
    if (t.preheader) right += '<div class="em-template-meta" style="color:var(--tx3)">Preheader: ' + _emEnc(t.preheader) + '</div>';

    if (t.html) {
      right += '<div id="em-template-iframe-host" class="em-template-frame"></div>';
      // Mount iframe after DOM insertion
      setTimeout(function() {
        var host = document.getElementById('em-template-iframe-host');
        if (!host || host._emMounted) return;
        host._emMounted = true;
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff';
        iframe.sandbox = 'allow-same-origin';
        host.appendChild(iframe);
        var doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open(); doc.write(t.html); doc.close();
      }, 50);
    } else {
      right += '<div class="em-split-right-body"><div class="mt-empty" style="margin:var(--sp4)">Template loaded but no HTML available.</div></div>';
    }
    right += '</div>';
    return right;
  }

  right += '</div></div>';
  return right;
}

function _emBigFunnel(sends, opens, clicks, unsubs) {
  if (!sends) return '<div class="mt-empty">No send data</div>';
  var openPct = opens/sends * 100;
  var clickPct = clicks/sends * 100;
  var unsubPct = unsubs/sends * 100;
  return '<div class="em-big-funnel">' +
    '<div class="em-bf-row"><div class="em-bf-label">Delivered</div><div class="em-bf-bar" style="width:100%;background:var(--ac)"><span>' + _emFmtN(sends) + ' · 100%</span></div></div>' +
    '<div class="em-bf-row"><div class="em-bf-label">Opened</div><div class="em-bf-bar" style="width:' + openPct.toFixed(1) + '%;background:var(--gn)"><span>' + _emFmtN(opens) + ' · ' + openPct.toFixed(1) + '%</span></div></div>' +
    '<div class="em-bf-row"><div class="em-bf-label">Clicked</div><div class="em-bf-bar" style="width:' + clickPct.toFixed(1) + '%;background:var(--cy)"><span>' + _emFmtN(clicks) + ' · ' + clickPct.toFixed(2) + '%</span></div></div>' +
    '<div class="em-bf-row"><div class="em-bf-label">Unsubscribed</div><div class="em-bf-bar" style="width:' + Math.max(unsubPct, 0.2).toFixed(2) + '%;background:var(--rd)"><span>' + _emFmtN(unsubs) + ' · ' + unsubPct.toFixed(2) + '%</span></div></div>' +
  '</div>';
}

// ─── Templates view (with perf overlay) ──────────────────────
function _emGetEmails() {
  if (!DATA.emailMarketing || !DATA.emailMarketing.emails) return [];
  var emails = DATA.emailMarketing.emails.slice();
  if (state.emFilter && state.emFilter !== 'all') {
    emails = emails.filter(function(e) { return (e.category || 'Uncategorised') === state.emFilter; });
  }
  if (state.emSearch) {
    var q = state.emSearch.toLowerCase();
    emails = emails.filter(function(e) {
      return (e.name||'').toLowerCase().includes(q) || (e.category||'').toLowerCase().includes(q) || (e.description||'').toLowerCase().includes(q);
    });
  }
  if (state.emSort === 'modified') emails.sort(function(a,b){return new Date(b.modifiedDate)-new Date(a.modifiedDate);});
  else if (state.emSort === 'created') emails.sort(function(a,b){return new Date(b.createdDate)-new Date(a.createdDate);});
  else if (state.emSort === 'name') emails.sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});
  return emails;
}

function _emRenderTemplates() {
  if (DATA.emLoading || (!DATA.emailMarketing && !DATA.emError)) {
    return '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading email templates from SFMC...</p></div>';
  }
  if (DATA.emError) {
    return '<div class="ca-loading"><p style="color:var(--rd)">Failed: ' + _emEnc(DATA.emError) + '</p><button class="btn btn-sm" onclick="DATA.emError=null;loadEmailMarketingData()" style="margin-top:12px">Retry</button></div>';
  }
  if (!DATA.emailMarketing || !DATA.emailMarketing.emails || !DATA.emailMarketing.emails.length) {
    return '<div class="ca-loading"><p>No email templates found in SFMC.</p></div>';
  }

  // Kick off perf overlay load if not done
  if (!_emPerfData && !_emPerfLoading) loadEmailPerfData();

  var emails = _emGetEmails();
  var html = '<div class="ca-main">';
  html += '<div class="ca-header"><h2>Email Templates</h2><span style="font-size:var(--f-xs);color:var(--tx3);margin-left:var(--sp2)">' + emails.length + ' templates · perf from last ' + (state.emPerfDays || 90) + 'd</span></div>';

  if (!emails.length) {
    html += '<div style="text-align:center;padding:var(--sp8);color:var(--tx3)">No emails match your search.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--sp3)">';
    emails.forEach(function(em) {
      var marketMatch = (em.name || '').match(/- (AU|UK|US|DE|NL|Global) -/i);
      var market = marketMatch ? marketMatch[1].toUpperCase() : '';
      var marketColor = _emRegionColor(market);
      var prefix = (em.name || '').split(' - ')[0] || '';
      var perf = _emPerfByName[em.name] || null;

      html += '<div class="em-tmpl-card" onclick="loadEmailPreview(' + em.id + ')">';
      if (market) html += '<div style="height:3px;background:' + marketColor + '"></div>';
      html += '<div style="padding:var(--sp3)">';
      html += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:var(--f-md);font-weight:var(--fw-sb);color:var(--tx);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical" title="' + _emEnc(em.name) + '">' + _emEnc(em.name) + '</div>' +
        '</div>' +
        (market ? '<span class="em-chip" style="background:' + marketColor + '22;color:' + marketColor + ';flex-shrink:0">' + market + '</span>' : '') +
      '</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">';
      if (prefix && prefix !== em.name) html += '<span class="em-chip" style="background:var(--s3);color:var(--tx2)">' + _emEnc(prefix) + '</span>';
      if (em.type) html += '<span class="em-chip" style="background:var(--acbg);color:var(--ac)">' + _emEnc(em.type) + '</span>';
      if (em.status) {
        var sc = em.status.toLowerCase() === 'active' ? 'var(--gn)' : em.status.toLowerCase() === 'draft' ? 'var(--or)' : 'var(--tx3)';
        html += '<span class="em-chip" style="background:' + sc + '22;color:' + sc + '">' + _emEnc(em.status) + '</span>';
      }
      html += '</div>';

      // Perf overlay (Databricks)
      if (perf && perf.sends) {
        html += '<div class="em-tmpl-perf">' +
          '<div class="em-tmpl-perf-row">' +
            '<span class="em-tmpl-perf-k">Sent</span><span class="em-tmpl-perf-v">' + _emFmtN(perf.sends) + '</span>' +
            '<span class="em-tmpl-perf-k">Open</span><span class="em-tmpl-perf-v" style="color:var(--gn)">' + perf.open_rate + '%</span>' +
            '<span class="em-tmpl-perf-k">CTR</span><span class="em-tmpl-perf-v" style="color:' + (perf.ctr >= 3 ? 'var(--gn)' : 'var(--or)') + '">' + perf.ctr + '%</span>' +
          '</div>' +
          '<div class="em-tmpl-perf-row" style="margin-top:4px;color:var(--tx3);font-size:10px">' +
            perf.send_count + ' send jobs · ' + _emFmtN(perf.clicks) + ' clicks · ' + _emFmtN(perf.unsubs) + ' unsubs' +
          '</div>' +
        '</div>';
      } else {
        html += '<div class="em-tmpl-perf em-tmpl-perf-none">No sends in last ' + (state.emPerfDays || 90) + 'd</div>';
      }

      if (em.category) html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:8px">' + _emEnc(em.category) + '</div>';
      html += '<div style="font-size:9px;color:var(--tx3);margin-top:6px">Modified ' + _emTimeAgo(em.modifiedDate) + ' · click to preview</div>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ─── Template preview (SFMC HTML) ────────────────────────────
function _emRenderPreview() {
  var p = state.emPreview;
  if (p.loading) return '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading email preview...</p></div>';
  if (p.error) return '<div class="ca-loading"><p style="color:var(--rd)">' + _emEnc(p.error) + '</p><button class="btn btn-sm" onclick="state.emPreview=null;renderAll()" style="margin-top:12px">Back</button></div>';

  var html = '<div style="display:flex;flex-direction:column;height:100%;padding:var(--sp3)">';
  html += '<div style="display:flex;align-items:center;gap:var(--sp3);margin-bottom:var(--sp3);flex-shrink:0">' +
    '<button class="btn btn-g" onclick="state.emPreview=null;renderAll()" style="display:flex;align-items:center;gap:4px">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:var(--f-lg);font-weight:var(--fw-sb);color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _emEnc(p.name || '') + '</div>' +
      (p.subject ? '<div style="font-size:var(--f-xs);color:var(--tx2)">Subject: ' + _emEnc(p.subject) + '</div>' : '') +
    '</div>' +
    (p.name ? '<button class="btn btn-sm" onclick="_emOpenDetail(\'' + String(p.name).replace(/'/g, "\\'") + '\')">View Performance</button>' : '') +
  '</div>';
  if (p.preheader) html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2);padding:var(--sp2) var(--sp3);background:var(--s2);border-radius:6px">Preheader: ' + _emEnc(p.preheader) + '</div>';
  if (p.html) {
    html += '<div id="em-preview-container" style="flex:1;border:1px solid var(--bd);border-radius:8px;overflow:hidden;background:#fff;min-height:400px"></div>';
  } else {
    html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;border:1px solid var(--bd);border-radius:8px;color:var(--tx3)">No HTML preview available</div>';
  }
  html += '</div>';
  if (p.html) {
    setTimeout(function() {
      var container = document.getElementById('em-preview-container');
      if (!container) return;
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none';
      iframe.sandbox = 'allow-same-origin';
      container.appendChild(iframe);
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open(); doc.write(p.html); doc.close();
    }, 50);
  }
  return html;
}
