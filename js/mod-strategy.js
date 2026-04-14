// ===============================================================
// STRATEGY MODULE
// ===============================================================
function loadStrategyData() {
  DATA.strategyLoading = true;
  fetch('/api/strategy')
    .then(r => r.json())
    .then(d => { DATA.strategy = d; DATA.strategyLoading = false; renderAll(); })
    .catch(() => { DATA.strategyLoading = false; });
}

function renderStrategySidebar() {
  const sb = $('sidebar');
  const sections = [
    {id:'overview',icon:'\u2B50',label:'Performance Overview'},
    {id:'correlations',icon:'\uD83D\uDD17',label:'Data Correlations'},
    {id:'lifecycle',icon:'\u21BB',label:'Customer Lifecycle'},
    {id:'priorities',icon:'\uD83C\uDFAF',label:'FY27 Priorities'},
    {id:'feral',icon:'\uD83D\uDC3E',label:'Project Feral'},
    {id:'markets',icon:'\uD83C\uDF0D',label:'Market Positions'},
    {id:'gaps',icon:'\u26A0',label:'Data Gaps'},
    {id:'kbchat',icon:'\uD83D\uDCAC',label:'Knowledge Chat'},
    {id:'library',icon:'\uD83D\uDCDA',label:'Knowledge Library'}
  ];
  if (!state.stratSection) state.stratSection = 'overview';
  let html = '<div class="sb-section"><div class="sb-section-title">Product Strategy</div><div class="strat-nav">';
  var fullPageSections = { kbchat: true, library: true };
  sections.forEach(s => {
    const act = state.stratSection===s.id ? ' active' : '';
    if (fullPageSections[s.id]) {
      html += `<div class="nav-i${act}" onclick="state.stratSection='${s.id}';renderAll()"><span>${s.icon}</span><span class="sb-label">${s.label}</span></div>`;
    } else {
      html += `<div class="nav-i${act}" onclick="state.stratSection='${s.id}';renderAll();setTimeout(function(){var el=document.getElementById('strat-${s.id}');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},50)"><span>${s.icon}</span><span class="sb-label">${s.label}</span></div>`;
    }
  });
  html += '</div></div>';

  // Learning Engine section
  html += '<div class="sb-section"><div class="sb-section-title">Learning Engine</div>';
  html += '<div id="learningPanel" class="digest-freshness">Loading...</div>';
  html += '</div>';

  sb.innerHTML = html;
  // Load learning panel data
  renderLearningPanel();
}

// ── KB Chat state ──
if (!state.kbChatHistory) state.kbChatHistory = [];
if (!state.kbChatLoading) state.kbChatLoading = false;
if (!state.kbLibrary) state.kbLibrary = null;
if (!state.kbLibraryDoc) state.kbLibraryDoc = null;

function renderStrategyMain() {
  const el = $('main');

  // Special views that don't need strategy data
  if (state.stratSection === 'kbchat') { el.innerHTML = _renderKBChat(); _kbChatScroll(); return; }
  if (state.stratSection === 'library') { el.innerHTML = _renderKBLibrary(); return; }

  const S = DATA.strategy;
  if (!S) {
    el.innerHTML = '<div class="no-data"><div class="nd-icon">\u2B50</div>Loading strategy data...<div class="nd-sub">Connecting to KB engine</div></div>';
    return;
  }

  let html = '';

  // ── PERFORMANCE OVERVIEW ──
  html += '<div id="strat-overview">';
  html += '<div class="section-label">CY25 Performance Snapshot</div>';
  const p = S.performance;
  html += '<div class="strat-hero">';
  html += shCard('$'+fmtNum(p.revenue.cy25), 'Revenue (AUD)', p.revenue.yoy, true);
  html += shCard(fmtNum(p.bags.cy25), 'Bags Shipped', p.bags.yoy, true);
  html += shCard(fmtNum(p.subscribers.total), 'Paid Subscribers', p.subscribers.yoyTotal, true);
  html += shCard('$'+p.avgLTV.value, 'Avg LTV', p.avgLTV.yoy, true);
  html += '</div>';

  // Revenue mix comparison
  html += '<div class="card" style="margin-bottom:var(--sp4)"><div class="card-h"><h2>Revenue Mix Transformation</h2><span class="tag info">CY24 \u2192 CY25</span></div><div class="card-b"><div class="mix-comparison">';
  html += '<div class="mix-col"><h4>CY24</h4>';
  html += mixBar('FTBP Paid', S.revenueMix.cy24.ftbp, 'var(--ac)');
  html += mixBar('Beanz Sub', S.revenueMix.cy24.beanz, 'var(--gn)');
  html += mixBar('Fusion', S.revenueMix.cy24.fusion, 'var(--pu)');
  html += mixBar('Other', S.revenueMix.cy24.other, 'var(--tx3)');
  html += '</div><div class="mix-col"><h4>CY25</h4>';
  html += mixBar('FTBP Paid', S.revenueMix.cy25.ftbp, 'var(--ac)');
  html += mixBar('Beanz Sub', S.revenueMix.cy25.beanz, 'var(--gn)');
  html += mixBar('Fusion', S.revenueMix.cy25.fusion, 'var(--pu)');
  html += mixBar('Other', S.revenueMix.cy25.other, 'var(--tx3)');
  html += '</div></div></div></div>';

  // Machine revenue insight
  html += '<div class="card" style="margin-bottom:var(--sp4)"><div class="card-h"><h2>FTBP Revenue by Machine Type</h2><span class="tag corr">Oracle 21x Over-Index</span></div><div class="card-b">';
  const machines = S.machineRevenue;
  ['oracle','barista','bambino','drip'].forEach(m => {
    const d = machines[m];
    const label = m.charAt(0).toUpperCase()+m.slice(1)+' Series';
    html += '<div class="bar-row"><div class="bar-label">'+label+'</div><div class="bar-track"><div class="bar-fill" style="width:'+d.revenue+'%;background:'+(m==='oracle'?'var(--cy)':'var(--ac)')+'">'+d.revenue+'%</div></div><div class="bar-val" style="font-size:10px;color:var(--tx3)">'+d.sellout+'% sell-out</div></div>';
  });
  html += '</div></div>';
  html += '</div>';

  // ── DATA CORRELATIONS (adaptively ranked by learning engine) ──
  html += '<div id="strat-correlations">';
  const learnMeta = S._learning || {};
  const totalFb = learnMeta.totalFeedback || 0;
  html += `<div class="section-label"><span class="learning-pulse"><span class="learning-dot"></span>Data Correlations</span>`;
  if (totalFb > 0) html += `<span style="font-size:9px;color:var(--tx3);font-weight:400;margin-left:8px">${totalFb} feedback signals</span>`;
  if (S._liveDataSource) {
    const srcLabel = S._liveDataSource === 'api' ? 'API' : 'PBI Extraction';
    html += `<span style="font-size:9px;color:var(--ac);font-weight:400;margin-left:8px">· ${S._liveMetricCount || '?'} live metrics (${srcLabel})</span>`;
  }
  html += '</div>';

  // Correlations are pre-sorted by the server (pinned > weight > severity)
  const corrs = S.correlations || [];
  corrs.forEach(c => {
    const dismissed = c._dismissed;
    const pinned = c._pinned;
    const weight = c._weight || 1;
    const fbCount = c._feedbackCount || 0;

    // Dim dismissed correlations
    const dimStyle = dismissed ? 'opacity:0.4;' : '';
    const pinBorder = pinned ? 'border-left:3px solid var(--yl);' : '';

    const sevIcon = {critical:'\uD83D\uDD34',warning:'\uD83D\uDFE1',opportunity:'\uD83D\uDFE2',positive:'\u2705'}[c.severity]||'';
    const priColour = {P1:'var(--rd)',P2:'var(--or)',P3:'var(--cy)',P4:'var(--pu)',P5:'var(--gn)'}[c.priority]||'var(--tx3)';

    html += `<div class="cor-card sev-${c.severity}" style="${dimStyle}${pinBorder}">`;
    html += `<div class="cor-h"><span class="cor-sev">${sevIcon}</span><span class="cor-title">${c.title}</span>`;

    // Weight badge (only show if modified from default)
    if (fbCount > 0) {
      const wCol = weight > 1.2 ? 'var(--gn)' : weight < 0.8 ? 'var(--rd)' : 'var(--tx3)';
      html += `<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:${wCol}18;color:${wCol};margin-left:4px">${weight.toFixed(1)}w</span>`;
    }
    if (pinned) html += `<span style="color:var(--yl);font-size:11px;margin-left:4px" title="Pinned">&#9733;</span>`;

    html += `<span class="cor-priority" style="background:${priColour}22;color:${priColour}">${c.priority}</span></div>`;
    html += '<div class="cor-body">';
    html += `<div class="cor-finding">${c.finding}</div>`;
    html += '<div class="cor-data">' + c.dataPoints.map(dp => `<span class="cor-dp">${dp}</span>`).join('') + '</div>';

    // Live PBI data overlay (when available)
    if (c._liveMetrics && c._liveMetrics.length) {
      const srcBadge = c._liveSource === 'api' ? 'API' : 'PBI';
      html += `<div class="cor-live" style="margin:8px 0;padding:8px 10px;background:var(--ac)08;border:1px solid var(--ac)22;border-radius:6px">`;
      html += `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--ac);margin-bottom:4px;display:flex;align-items:center;gap:4px"><span class="learning-dot" style="width:5px;height:5px"></span>Live Data <span style="font-size:8px;background:var(--ac)18;padding:0 4px;border-radius:2px">${srcBadge}</span></div>`;
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
      c._liveMetrics.forEach(lm => {
        const statusCol = {healthy:'var(--gn)',warning:'var(--or)',critical:'var(--rd)',positive:'var(--cy)'}[lm.status] || 'var(--tx3)';
        html += `<span style="font-size:var(--f-xs);padding:2px 8px;border-radius:4px;background:var(--s2);display:inline-flex;align-items:center;gap:4px">`;
        html += `<span style="color:var(--tx3)">${lm.name}:</span>`;
        html += `<strong style="color:${statusCol}">${lm.value}</strong>`;
        if (lm.yoy) {
          const yDir = lm.yoy.startsWith('+') ? 'up' : lm.yoy.startsWith('-') ? 'down' : '';
          const yCol = yDir === 'up' ? 'var(--gn)' : yDir === 'down' ? 'var(--rd)' : 'var(--tx3)';
          html += `<span style="color:${yCol};font-size:10px">${lm.yoy}</span>`;
        }
        html += '</span>';
      });
      html += '</div></div>';
    }

    html += `<div class="cor-rec"><strong>Recommendation:</strong> ${c.recommendation}</div>`;
    if (c.segments && c.segments.length) {
      html += '<div class="cor-segments">' + c.segments.map(s => `<span class="cor-seg">${s}</span>`).join('') + '</div>';
    }
    // Feedback buttons (self-learning)
    html += `<div class="cor-feedback">`;
    html += `<button class="fb-btn fb-up${weight > 1.2 ? ' active' : ''}" onclick="event.stopPropagation();sendFeedback('insight','${c.id}','up');setTimeout(()=>{loadStrategyData()},500)" title="This insight is valuable">&#9650;</button>`;
    html += `<button class="fb-btn fb-down${weight < 0.8 ? ' active' : ''}" onclick="event.stopPropagation();sendFeedback('insight','${c.id}','down');setTimeout(()=>{loadStrategyData()},500)" title="Less relevant">&#9660;</button>`;
    html += `<button class="fb-btn fb-pin${pinned ? ' active' : ''}" onclick="event.stopPropagation();sendFeedback('insight','${c.id}','pin');setTimeout(()=>{loadStrategyData()},500)" title="Pin this insight">&#9733;</button>`;
    html += `<button class="fb-btn fb-dismiss" onclick="event.stopPropagation();sendFeedback('insight','${c.id}','dismiss');setTimeout(()=>{loadStrategyData()},500)" title="Dismiss">&#10005;</button>`;
    html += `<span class="fb-hint">${fbCount > 0 ? fbCount + ' signals' : 'Train the system'}</span>`;
    html += `</div>`;
    html += '</div></div>';
  });
  html += '</div>';

  // ── CUSTOMER LIFECYCLE ──
  html += '<div id="strat-lifecycle">';
  html += '<div class="section-label">Customer Lifecycle Flow</div>';
  html += '<div class="lifecycle-flow"><div class="lf-stages">';
  const mainFlow = ['SEG-1.1','SEG-1.2','SEG-1.3','SEG-1.4','SEG-1.5'];
  mainFlow.forEach((id,i) => {
    const stage = S.lifecycle.stages.find(s => s.id===id);
    if (!stage) return;
    html += `<div class="lf-node" style="border-color:${stage.colour}40"><div class="lf-id">${stage.id}</div><div class="lf-name">${stage.name}</div></div>`;
    if (i < mainFlow.length-1) {
      const trans = S.lifecycle.transitions.find(t => t.from===id && t.to===mainFlow[i+1]);
      const cls = trans ? trans.type : '';
      html += `<div class="lf-arrow ${cls}">\u2192</div>`;
    }
  });
  html += '</div>';

  // Churn path
  html += '<div style="margin-top:var(--sp4);display:flex;align-items:center;justify-content:center;gap:0;min-width:400px">';
  const churnFlow = ['SEG-1.6','SEG-1.7','SEG-1.8'];
  churnFlow.forEach((id,i) => {
    const stage = S.lifecycle.stages.find(s => s.id===id);
    if (!stage) return;
    html += `<div class="lf-node" style="border-color:${stage.colour}40"><div class="lf-id">${stage.id}</div><div class="lf-name">${stage.name}</div></div>`;
    if (i < churnFlow.length-1) html += '<div class="lf-arrow warning">\u2192</div>';
  });
  html += '</div>';

  // Transition metrics
  html += '<div style="margin-top:var(--sp4)">';
  html += '<div class="sb-section-title" style="margin-bottom:var(--sp2)">Key Transitions</div>';
  S.lifecycle.transitions.filter(t => t.metric).forEach(t => {
    const colour = {positive:'var(--gn)',warning:'var(--or)',negative:'var(--rd)'}[t.type]||'var(--tx3)';
    html += `<div style="display:flex;align-items:center;gap:var(--sp2);padding:4px 0;font-size:var(--f-sm)"><span style="color:${colour};font-weight:var(--fw-sb)">${t.from} \u2192 ${t.to}</span><span style="color:var(--tx3)">${t.label}</span><span style="margin-left:auto;font-weight:var(--fw-sb);color:${colour}">${t.metric}</span></div>`;
  });
  html += '</div></div>';
  html += '</div>';

  // ── FY27 PRIORITIES ──
  html += '<div id="strat-priorities">';
  html += '<div class="section-label">FY27 Strategic Priorities</div>';
  html += '<div class="priority-grid">';
  S.priorities.forEach(p => {
    html += `<div class="pri-card"><div class="pri-num">${p.id.replace('P','')}</div><div class="pri-info"><h3>${p.name}</h3><div class="pri-kpis">${p.kpis.join(' \u00B7 ')}${p.baseline?' \u2014 '+p.baseline:''}</div></div><span class="pri-status ${p.status}">${p.status}</span></div>`;
  });
  html += '</div></div>';

  // ── PROJECT FERAL ──
  html += '<div id="strat-feral">';
  html += '<div class="section-label">Project Feral (26-Week AI-First Initiative)</div>';
  html += '<div class="card"><div class="card-h"><h2>Phase Timeline</h2><span class="tag act">Week 1-3: Foundation</span></div><div class="card-b">';
  html += '<div class="feral-timeline">';
  S.projectFeral.phases.forEach(ph => {
    html += `<div class="feral-phase ${ph.status}"><div style="font-weight:var(--fw-b)">${ph.name}</div><div style="font-size:9px;margin-top:2px">Wk ${ph.weeks}</div></div>`;
  });
  html += '</div>';
  html += '<div style="margin-top:var(--sp4)">';
  S.projectFeral.workstreams.forEach(w => {
    const stCol = {active:'var(--gn)','in-progress':'var(--ac)',planned:'var(--tx3)'}[w.status]||'var(--tx3)';
    html += `<div style="display:flex;align-items:center;gap:var(--sp3);padding:6px 0;border-bottom:1px solid var(--bd)"><span style="width:8px;height:8px;border-radius:50%;background:${stCol};flex-shrink:0"></span><span style="flex:1;font-size:var(--f-md)">${w.name}</span><span style="font-size:var(--f-xs);color:${stCol};font-weight:var(--fw-sb)">${w.status}</span><span style="font-size:var(--f-xs);color:var(--tx3)">${w.lead}</span></div>`;
  });
  html += '</div></div></div>';
  html += '</div>';

  // ── MARKETS ──
  html += '<div id="strat-markets">';
  html += '<div class="section-label">Market Positions & Delivery</div>';
  html += '<div class="market-grid">';
  S.markets.forEach(m => {
    const yoyCol = m.yoy > 0 ? 'var(--rd)' : m.yoy < 0 ? 'var(--gn)' : 'var(--tx3)';
    const yoySign = m.yoy > 0 ? '+' : '';
    const statusCol = m.status==='launching' ? 'var(--or)' : 'var(--gn)';
    html += `<div class="mkt-card" style="border-top:3px solid ${statusCol}"><div class="mkt-code">${m.code}</div><div class="mkt-name">${m.name}</div>`;
    if (m.deliveryDays) {
      html += `<div class="mkt-days">${m.deliveryDays}d</div><div class="mkt-yoy" style="color:${yoyCol}">${yoySign}${m.yoy}% YoY</div>`;
    } else {
      html += `<div class="mkt-days" style="color:var(--or)">${m.launch}</div><div class="mkt-yoy" style="color:var(--tx3)">${m.note||''}</div>`;
    }
    html += '</div>';
  });
  html += '</div></div>';

  // ── DATA GAPS ──
  html += '<div id="strat-gaps">';
  html += '<div class="section-label">Data Gaps & Open Questions</div>';
  html += '<div class="card"><div class="card-h"><h2>Known Unknowns</h2><span class="tag act">' + S.dataGaps.length + ' gaps</span></div><div class="card-b"><div class="gap-list">';
  S.dataGaps.forEach(g => {
    html += `<div class="gap-item"><span class="gap-icon">\u26A0</span><span>${g}</span></div>`;
  });
  html += '</div></div></div></div>';

  el.innerHTML = html;
}

// Strategy helpers
function shCard(val, label, yoy, isPercent) {
  const delta = yoy !== undefined ? (yoy >= 0 ? '+' : '') + (isPercent ? Math.round(yoy*100) + '%' : yoy) : '';
  const cls = yoy > 0 ? 'up' : yoy < 0 ? 'down' : '';
  return `<div class="sh-card"><div class="sh-val">${val}</div><div class="sh-label">${label}</div><div class="sh-delta stat-delta ${cls}">${delta} YoY</div></div>`;
}

function fmtNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(0)+'K';
  return n.toString();
}

function mixBar(label, pct, colour) {
  return `<div class="bar-row"><div class="bar-label" style="min-width:70px">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colour}">${pct}%</div></div></div>`;
}

// ===============================================================
// KNOWLEDGE CHAT
// ===============================================================
function _enc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _renderKBChat() {
  var html = '<div class="ca-main" style="display:flex;flex-direction:column;height:100%;padding:0">';

  // Header
  html += '<div class="ca-header" style="padding:var(--sp3) var(--sp4);border-bottom:1px solid var(--bd);flex-shrink:0">' +
    '<h2 style="margin:0;display:flex;align-items:center;gap:var(--sp2)">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
      'Knowledge Chat' +
    '</h2>' +
    '<button class="btn btn-sm" onclick="state.kbChatHistory=[];renderAll()" style="font-size:var(--f-xs)">Clear</button>' +
  '</div>';

  // Messages
  html += '<div id="kb-chat-messages" style="flex:1;overflow-y:auto;padding:var(--sp4);display:flex;flex-direction:column;gap:var(--sp3)">';

  if (!state.kbChatHistory.length) {
    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--tx3);text-align:center;padding:var(--sp6)">' +
      '<div style="font-size:var(--f-lg);margin-bottom:var(--sp3)">Ask anything about Beanz</div>' +
      '<div style="font-size:var(--f-sm);max-width:450px;margin-bottom:var(--sp4)">I have access to all KPI analytics, project updates, meeting notes, strategy docs, marketing analysis, and more.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--sp2);justify-content:center;max-width:500px">';
    var suggestions = [
      'What is our churn rate by market?',
      'Summarize Project Feral progress',
      'FTBP v1 vs v2 conversion comparison',
      'Netherlands launch status and blockers',
      'What are our FY27 priorities?',
      'Platinum Roasters program status',
      'Revenue breakdown by program',
      'What are the key data gaps?'
    ];
    suggestions.forEach(function(q) {
      html += '<button class="btn btn-sm" style="font-size:var(--f-xs);background:var(--s2);border:1px solid var(--bd);color:var(--tx2)" onclick="document.getElementById(\'kb-chat-input\').value=\'' + _enc(q) + '\';sendKBChat()">' + _enc(q) + '</button>';
    });
    html += '</div></div>';
  } else {
    state.kbChatHistory.forEach(function(msg) {
      if (msg.role === 'user') {
        html += '<div style="display:flex;justify-content:flex-end"><div style="max-width:70%;padding:var(--sp3);background:var(--ac);color:#fff;border-radius:12px 12px 0 12px;font-size:var(--f-sm);line-height:1.6">' + _enc(msg.content) + '</div></div>';
      } else {
        html += '<div><div style="max-width:85%;padding:var(--sp3);background:var(--s2);border-radius:12px 12px 12px 0;font-size:var(--f-sm);line-height:1.7;color:var(--tx)">' + _formatKBResponse(msg.content) + '</div>';
        if (msg.sources && msg.sources.length) {
          html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">';
          msg.sources.forEach(function(s) {
            html += '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--acbg);color:var(--ac)">' + _enc(s) + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      }
    });
  }

  if (state.kbChatLoading) {
    html += '<div><div style="display:flex;align-items:center;gap:var(--sp2);padding:var(--sp3);background:var(--s2);border-radius:12px;max-width:200px">' +
      '<div class="ca-spinner" style="width:14px;height:14px;border-width:2px"></div>' +
      '<span style="color:var(--tx3);font-size:var(--f-sm)">Searching knowledge base...</span></div></div>';
  }

  html += '</div>';

  // Input
  html += '<div style="flex-shrink:0;padding:var(--sp3) var(--sp4);border-top:1px solid var(--bd);background:var(--s1)">' +
    '<div style="display:flex;gap:var(--sp2);align-items:flex-end">' +
      '<textarea id="kb-chat-input" placeholder="Ask about KPIs, projects, strategy..." rows="1" ' +
        'style="flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;color:var(--tx);font-family:inherit;font-size:var(--f-sm);resize:none;outline:none;line-height:1.5" ' +
        'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendKBChat()}" ' +
        'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,100)+\'px\'"' +
      '></textarea>' +
      '<button onclick="sendKBChat()" style="background:var(--ac);color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;flex-shrink:0" ' +
        (state.kbChatLoading ? 'disabled' : '') + '>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9"/></svg>' +
      '</button>' +
    '</div></div>';

  html += '</div>';
  return html;
}

function _formatKBResponse(text) {
  if (!text) return '';
  var h = _enc(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:var(--f-xs)">$1</code>');
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul style="margin:4px 0;padding-left:16px">$1</ul>');
  h = h.replace(/\n\n/g, '</p><p style="margin-top:8px">');
  h = h.replace(/\n/g, '<br>');
  return '<p>' + h + '</p>';
}

function _kbChatScroll() {
  setTimeout(function() {
    var el = document.getElementById('kb-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function sendKBChat() {
  var input = document.getElementById('kb-chat-input');
  if (!input) return;
  var message = input.value.trim();
  if (!message || state.kbChatLoading) return;

  state.kbChatHistory = state.kbChatHistory.concat([{ role: 'user', content: message }]);
  state.kbChatLoading = true;
  input.value = '';
  input.style.height = 'auto';
  renderStrategyMain();

  var apiHistory = state.kbChatHistory.slice(0, -1).map(function(m) { return { role: m.role, content: m.content }; });

  fetch('/api/strategy/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, history: apiHistory })
  }).then(function(r) { return r.json(); }).then(function(data) {
    state.kbChatLoading = false;
    state.kbChatHistory = state.kbChatHistory.concat([{
      role: 'assistant',
      content: data.response || 'No response.',
      sources: data.sources || []
    }]);
    renderStrategyMain();
  }).catch(function(e) {
    state.kbChatLoading = false;
    state.kbChatHistory = state.kbChatHistory.concat([{
      role: 'assistant', content: 'Error: ' + e.message, sources: []
    }]);
    renderStrategyMain();
  });
}

// ===============================================================
// KNOWLEDGE LIBRARY
// ===============================================================
function _renderKBLibrary() {
  if (!state.kbLibrary) {
    _loadKBLibrary();
    return '<div class="ca-main"><div class="ca-loading"><div class="ca-spinner"></div><p>Loading knowledge library...</p></div></div>';
  }

  // Viewing a specific doc
  if (state.kbLibraryDoc) {
    var doc = state.kbLibraryDoc;
    var html = '<div class="ca-main" style="max-width:800px">';
    html += '<div style="margin-bottom:var(--sp3)"><button class="btn btn-sm" onclick="state.kbLibraryDoc=null;renderAll()">&larr; Back to Library</button></div>';
    html += '<div style="font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--sp2)">' + _enc(doc.domain || '') + '</div>';
    html += '<h1 style="font-size:var(--f-2xl);margin-bottom:var(--sp4)">' + _enc(doc.name || doc.doc || '') + '</h1>';
    html += '<div class="kb-doc-content" style="font-size:var(--f-md);line-height:1.8;color:var(--tx2)">' + _renderMarkdown(doc.content || '') + '</div>';
    html += '</div>';
    return html;
  }

  // Library index
  var lib = state.kbLibrary;
  var html = '<div class="ca-main" style="max-width:900px">';
  html += '<div class="ca-header"><h2>Knowledge Library</h2><span style="font-size:var(--f-xs);color:var(--tx3)">' + (lib.totalDocs || 0) + ' documents</span></div>';

  (lib.domains || []).forEach(function(domain) {
    html += '<div style="margin-bottom:var(--sp4)">';
    html += '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp2);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
    html += '<span style="font-size:var(--f-md);font-weight:var(--fw-b);color:var(--tx)">' + _enc(domain.name) + '</span>';
    html += '<span style="font-size:var(--f-xs);color:var(--tx3)">(' + domain.docCount + ')</span>';
    html += '<span style="font-size:var(--f-xs);color:var(--tx3);margin-left:auto">click to expand</span>';
    html += '</div>';
    html += '<div style="display:none">';
    (domain.docs || []).forEach(function(doc) {
      html += '<div style="padding:var(--sp2) var(--sp3);margin-bottom:2px;background:var(--s1);border:1px solid var(--bd);border-radius:6px;cursor:pointer" onclick="loadKBDoc(\'' + _enc(domain.name) + '\',\'' + _enc(doc.name) + '\')">';
      html += '<div style="font-weight:var(--fw-sb);font-size:var(--f-sm);color:var(--tx)">' + _enc(doc.title || doc.name) + '</div>';
      if (doc.preview) html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _enc(doc.preview) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  });

  html += '</div>';
  return html;
}

function _loadKBLibrary() {
  fetch('/api/strategy/library').then(function(r) { return r.json(); }).then(function(d) {
    state.kbLibrary = d;
    renderAll();
  }).catch(function() {});
}

function loadKBDoc(domain, docName) {
  state.kbLibraryDoc = { domain: domain, name: docName, content: 'Loading...' };
  renderAll();
  fetch('/api/strategy/library/' + encodeURIComponent(domain) + '/' + encodeURIComponent(docName))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      state.kbLibraryDoc = d;
      renderAll();
    }).catch(function() {});
}

function _renderMarkdown(md) {
  if (!md) return '';
  var h = _enc(md);
  // Headings
  h = h.replace(/^#### (.+)$/gm, '<h4 style="font-size:var(--f-md);font-weight:var(--fw-b);margin:var(--sp3) 0 var(--sp2);color:var(--tx)">$1</h4>');
  h = h.replace(/^### (.+)$/gm, '<h3 style="font-size:var(--f-lg);font-weight:var(--fw-b);margin:var(--sp4) 0 var(--sp2);color:var(--tx)">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 style="font-size:var(--f-xl);font-weight:var(--fw-b);margin:var(--sp5) 0 var(--sp3);color:var(--tx)">$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1 style="font-size:var(--f-2xl);font-weight:var(--fw-b);margin:var(--sp5) 0 var(--sp3);color:var(--tx)">$1</h1>');
  // Bold, italic
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code
  h = h.replace(/`([^`]+)`/g, '<code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-size:var(--f-xs)">$1</code>');
  // Lists
  h = h.replace(/^- (.+)$/gm, '<li style="margin-bottom:2px">$1</li>');
  h = h.replace(/(<li[\s\S]*?<\/li>)/g, '<ul style="margin:4px 0;padding-left:20px">$1</ul>');
  // Tables (simple)
  h = h.replace(/\|(.+)\|/g, function(match) {
    var cells = match.split('|').filter(function(c) { return c.trim(); });
    return '<tr>' + cells.map(function(c) { return '<td style="padding:4px 8px;border:1px solid var(--bd)">' + c.trim() + '</td>'; }).join('') + '</tr>';
  });
  h = h.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table style="border-collapse:collapse;width:100%;margin:var(--sp2) 0;font-size:var(--f-sm)">$1</table>');
  // Paragraphs
  h = h.replace(/\n\n/g, '</p><p style="margin-top:8px">');
  h = h.replace(/\n/g, '<br>');
  return '<p>' + h + '</p>';
}
