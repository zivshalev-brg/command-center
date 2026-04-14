// ===============================================================
// DAILY SUMMARY MODULE — Live Intelligence Dashboard
// Pulls from: Comms (AI classified), Strategy, Projects, Jira,
// Calendar, Metrics, News — all live data
// ===============================================================

function _sEnc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _sRelTime(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(iso).toLocaleDateString('en-AU', {month:'short', day:'numeric'});
}

function statCard(value, label, sub, trend, color) {
  var arrow = trend === 'up' ? '&#9650;' : trend === 'down' ? '&#9660;' : '';
  var c = color || (trend === 'up' ? 'var(--gn)' : trend === 'down' ? 'var(--rd)' : 'var(--tx2)');
  return '<div class="ca-card"><div class="ca-card-value" style="color:' + c + '">' + (arrow ? '<span style="font-size:0.7em">' + arrow + '</span> ' : '') + value + '</div>' +
    '<div class="ca-card-title">' + label + '</div>' +
    (sub ? '<div style="font-size:var(--f-xs);color:var(--tx3)">' + sub + '</div>' : '') + '</div>';
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderSummarySidebar() {
  var sb = $('sidebar');
  var sections = [
    {id:'schedule',icon:'📅',label:"Today's Schedule"},
    {id:'actions',icon:'🔴',label:'Actions Required'},
    {id:'comms',icon:'💬',label:'Comms Pulse'},
    {id:'strategy',icon:'🔗',label:'Strategy & Correlations'},
    {id:'projects',icon:'📊',label:'Project Pulse'},
    {id:'jira',icon:'🎯',label:'Jira Sprint Status'},
    {id:'people',icon:'👥',label:'People in Focus'},
    {id:'metrics',icon:'📈',label:'Key Metrics'},
    {id:'news',icon:'📰',label:'News Highlights'}
  ];
  var html = '<div class="sb-section"><div class="sb-section-title">Daily Briefing</div><div class="summary-nav">';
  sections.forEach(function(s) {
    var act = state.summarySection === s.id ? ' active' : '';
    html += '<div class="nav-i' + act + '" onclick="state.summarySection=\'' + s.id + '\';renderSummarySidebar();var el=document.getElementById(\'sum-' + s.id + '\');if(el)el.scrollIntoView({behavior:\'smooth\',block:\'start\'})">';
    html += '<span>' + s.icon + '</span><span class="sb-label">' + s.label + '</span></div>';
  });
  html += '</div></div>';

  // Live status counts in sidebar
  var threads = DATA.comms.threads || {};
  var actionCount = 0;
  for (var tid in threads) {
    var th = threads[tid];
    if (state.threadStatus[tid] === 'done') continue;
    if (th.aiActionRequired || th.aiPriority === 'critical' || th.aiPriority === 'high') actionCount++;
  }
  if (actionCount > 0) {
    html += '<div class="sb-section"><div class="sb-section-title">Status</div>';
    html += '<div style="padding:0 12px;font-size:12px;color:var(--rd)">' + actionCount + ' threads need action</div>';
    html += '</div>';
  }

  sb.innerHTML = html;
}

// ─── Main Render ─────────────────────────────────────────────

function renderSummaryMain() {
  var el = $('main');
  try { _renderSummaryMainInner(el); } catch(e) {
    console.error('[Summary] Render error:', e);
    el.innerHTML = '<div class="ca-loading"><p>Summary error: ' + e.message + '</p></div>';
  }
}

function _renderSummaryMainInner(el) {
  var html = '';
  var threads = DATA.comms.threads || {};

  // Trigger lazy loads
  if (typeof loadCalendarLive === 'function' && typeof _calLiveData !== 'undefined' && !_calLiveData) loadCalendarLive();
  if (!DATA.strategy && !DATA.strategyLoading && typeof loadStrategyData === 'function') loadStrategyData();
  if (!_projectIntelOverview && !_projectIntelOverviewLoading && typeof loadProjectIntelOverview === 'function') loadProjectIntelOverview();
  if (!_projectIntelJira && !_projectJiraLoading && typeof loadProjectJiraOverview === 'function') loadProjectJiraOverview();

  // ═══ 1. TODAY'S SCHEDULE ═══
  var day = DATA.comms.days[state.selectedDay];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var monthLabel = day.date ? months[parseInt(day.date.split('-')[1], 10) - 1] : '';
  html += '<div class="summary-section" id="sum-schedule"><div class="summary-section-h"><h2>📅 ' + _sEnc(day.label) + ' ' + day.num + ' ' + monthLabel + '</h2><span class="summary-goto" onclick="switchModule(\'calendar\')">Calendar →</span></div>';
  html += '<div class="card"><div class="schedule-compact">';
  day.events.forEach(function(e) {
    html += '<div class="tl-i' + (e.hl ? ' hl' : '') + '"><div class="tl-t">' + _sEnc(e.t) + '</div><div class="tl-c"><div class="t">' + _sEnc(e.title) + '</div><div class="m">' + _sEnc(e.meta) + '</div></div></div>';
  });
  html += '</div></div></div>';

  // ═══ 2. ACTIONS REQUIRED (AI-classified) ═══
  var actions = [];
  for (var tid in threads) {
    var th = threads[tid];
    if (state.threadStatus[tid] === 'done' || (state.commsSnoozed && state.commsSnoozed[tid])) continue;
    if (th.aiActionRequired || th.aiPriority === 'critical' || th.aiPriority === 'high' || th.priority === 'critical' || th.priority === 'action') {
      actions.push({id: tid, thread: th});
    }
  }
  actions.sort(function(a, b) {
    var pa = a.thread.aiPriority || a.thread.priority || 'medium';
    var pb = b.thread.aiPriority || b.thread.priority || 'medium';
    var order = {critical:0,high:1,action:1,medium:2,low:3};
    return (order[pa] || 2) - (order[pb] || 2);
  });

  if (actions.length) {
    html += '<div class="summary-section" id="sum-actions"><div class="summary-section-h"><h2>🔴 Actions Required</h2><span class="tag crit">' + actions.length + '</span><span class="summary-goto" onclick="switchModule(\'comms\')">Comms →</span></div>';
    actions.slice(0, 12).forEach(function(a) {
      var t = a.thread;
      var prio = t.aiPriority || t.priority || 'medium';
      var accentCls = prio === 'critical' ? ' accent-r' : prio === 'high' ? ' accent-o' : '';
      var tagCls = prio === 'critical' ? 'crit' : prio === 'high' ? 'act' : 'info';
      var src = (t.sources || [])[0] || '';
      var srcIcon = src === 'slack' ? 'S' : src === 'email' ? 'E' : '?';
      html += '<div class="card' + accentCls + '" style="margin-bottom:8px"><div class="card-h">';
      html += '<span style="font-size:10px;font-weight:700;color:var(--ac);min-width:14px">' + srcIcon + '</span>';
      html += '<h2 style="font-size:var(--f-md);cursor:pointer;flex:1" onclick="navToComm(\'' + _sEnc(a.id) + '\')">' + _sEnc(t.subject) + '</h2>';
      html += '<span class="tag ' + tagCls + '">' + _sEnc(prio) + '</span>';
      if (t.aiActionType) html += '<span class="tag" style="font-size:9px">' + _sEnc(t.aiActionType) + '</span>';
      html += '</div>';
      if (t.aiSummary || t.preview) {
        html += '<div style="font-size:var(--f-sm);color:var(--tx2);padding:0 var(--sp3) 8px">' + _sEnc(t.aiSummary || t.preview).slice(0, 200) + '</div>';
      }
      html += '<div class="act-strip">';
      html += '<button class="btn btn-sm btn-s" onclick="markThreadDone(\'' + _sEnc(a.id) + '\')">✓ Done</button>';
      html += '<button class="btn btn-sm btn-d" onclick="snoozeThread(\'' + _sEnc(a.id) + '\')">⏸ Snooze</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }

  // ═══ 3. COMMS PULSE (live stats from AI classifications) ═══
  var commsStats = { total: 0, unread: 0, slack: 0, email: 0, positive: 0, negative: 0, categories: {} };
  for (var cid in threads) {
    var ct = threads[cid];
    if (state.threadStatus[cid] === 'done') continue;
    commsStats.total++;
    if (ct.unread) commsStats.unread++;
    if ((ct.sources || []).includes('slack')) commsStats.slack++;
    if ((ct.sources || []).includes('email')) commsStats.email++;
    if (ct.aiSentiment === 'positive') commsStats.positive++;
    if (ct.aiSentiment === 'negative' || ct.aiSentiment === 'urgent') commsStats.negative++;
    var cat = ct.aiCategory || 'Unclassified';
    commsStats.categories[cat] = (commsStats.categories[cat] || 0) + 1;
  }

  html += '<div class="summary-section" id="sum-comms"><div class="summary-section-h"><h2>💬 Comms Pulse</h2><span class="summary-goto" onclick="switchModule(\'comms\')">Comms →</span></div>';
  html += '<div class="metrics-grid" style="margin-bottom:12px">';
  html += statCard(commsStats.total, 'Active Threads', commsStats.unread + ' unread', '', 'var(--ac)');
  html += statCard(commsStats.slack, 'Slack', '', '', 'var(--ac)');
  html += statCard(commsStats.email, 'Email', '', '', 'var(--bl)');
  html += statCard(actions.length, 'Action Required', '', actions.length > 5 ? 'down' : '', 'var(--rd)');
  html += statCard(commsStats.negative, 'Negative', '', commsStats.negative > 0 ? 'down' : '', 'var(--or)');
  html += statCard(commsStats.positive, 'Positive', '', commsStats.positive > 0 ? 'up' : '', 'var(--gn)');
  html += '</div>';

  // Category breakdown
  var cats = Object.entries(commsStats.categories).sort(function(a, b) { return b[1] - a[1]; });
  if (cats.length) {
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
    cats.forEach(function(c) {
      html += '<span style="font-size:10px;padding:2px 8px;background:var(--s2);border-radius:4px">' + _sEnc(c[0]) + ': ' + c[1] + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ═══ 4. STRATEGY & CORRELATIONS (live) ═══
  html += '<div class="summary-section" id="sum-strategy"><div class="summary-section-h"><h2>🔗 Strategy & Correlations</h2><span class="summary-goto" onclick="switchModule(\'strategy\')">Strategy →</span></div>';
  if (DATA.strategy && DATA.strategy.correlations) {
    DATA.strategy.correlations.forEach(function(c) {
      var sevColor = c.severity === 'critical' ? 'var(--rd)' : c.severity === 'warning' ? 'var(--or)' : c.severity === 'positive' ? 'var(--gn)' : c.severity === 'opportunity' ? 'var(--ac)' : 'var(--tx3)';
      html += '<div style="margin-bottom:10px;padding:10px;background:var(--s1);border-radius:8px;border-left:3px solid ' + sevColor + '">';
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html += '<span style="font-weight:600;font-size:var(--f-sm);flex:1">' + _sEnc(c.title) + '</span>';
      html += '<span class="tag" style="font-size:9px;background:' + sevColor + '22;color:' + sevColor + '">' + _sEnc(c.severity) + '</span>';
      html += '</div>';
      html += '<div style="font-size:var(--f-xs);color:var(--tx2);margin-top:4px">' + _sEnc(c.finding || '').slice(0, 200) + '</div>';
      if (c.recommendation) html += '<div style="font-size:var(--f-xs);color:var(--ac);margin-top:4px">→ ' + _sEnc(c.recommendation).slice(0, 150) + '</div>';
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:var(--f-sm);color:var(--tx3);padding:8px">Loading strategy data...</div>';
  }
  html += '</div>';

  // ═══ 5. PROJECT PULSE (live from intelligence) ═══
  html += '<div class="summary-section" id="sum-projects"><div class="summary-section-h"><h2>📊 Project Pulse</h2><span class="summary-goto" onclick="switchModule(\'projects\')">Projects →</span></div>';
  for (var pid in DATA.projects) {
    var p = DATA.projects[pid];
    var intel = _projectIntelOverview ? (_projectIntelOverview[pid] || {}) : {};
    html += '<div class="pulse-row" onclick="navToProject(\'' + pid + '\')">';
    // Health dot
    if (intel.healthScore !== null && intel.healthScore !== undefined) {
      var hc = intel.healthScore >= 80 ? 'var(--gn)' : intel.healthScore >= 60 ? 'var(--or)' : 'var(--rd)';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:' + hc + ';flex-shrink:0"></span>';
    }
    html += '<span class="dot" style="background:' + p.colour + '"></span>';
    html += '<span class="pulse-name">' + _sEnc(p.title) + '</span>';
    html += '<div class="pulse-bar"><div class="pulse-fill" style="width:' + p.progress + '%;background:' + p.colour + '"></div></div>';
    html += '<span class="pulse-pct">' + p.progress + '%</span>';
    // Live indicators
    if (intel.actionRequired > 0) html += '<span style="font-size:10px;color:var(--rd);font-weight:600">' + intel.actionRequired + ' action</span>';
    else if (p.blockers.length) html += '<span class="pulse-blockers">⚠ ' + p.blockers.length + '</span>';
    if (intel.commsThisWeek > 0) html += '<span style="font-size:10px;color:var(--ac)">' + intel.commsThisWeek + ' comms</span>';
    html += '</div>';
  }
  html += '</div>';

  // ═══ 6. JIRA SPRINT STATUS (live) ═══
  html += '<div class="summary-section" id="sum-jira"><div class="summary-section-h"><h2>🎯 Jira Sprint Status</h2><span class="summary-goto" onclick="switchModule(\'projects\')">Projects →</span></div>';
  if (_projectIntelJira && _projectIntelJira.sprints && _projectIntelJira.sprints.length) {
    _projectIntelJira.sprints.forEach(function(sp) {
      var pct = sp.issueCount > 0 ? Math.round(sp.doneCount / sp.issueCount * 100) : 0;
      var dColor = sp.daysRemaining !== null && sp.daysRemaining <= 2 ? 'var(--rd)' : sp.daysRemaining <= 5 ? 'var(--or)' : 'var(--tx3)';
      html += '<div style="margin-bottom:10px;padding:8px;background:var(--s1);border-radius:6px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
      html += '<span style="font-weight:600;font-size:12px;flex:1">' + _sEnc(sp.name) + '</span>';
      html += '<span style="font-size:10px;color:var(--ac)">' + sp.doneCount + '/' + sp.issueCount + ' (' + pct + '%)</span>';
      if (sp.daysRemaining !== null) html += '<span style="font-size:10px;color:' + dColor + '">' + sp.daysRemaining + 'd left</span>';
      html += '</div>';
      html += '<div class="prog-bar" style="height:3px"><div class="prog-fill" style="width:' + pct + '%;background:var(--gn)"></div></div>';
      html += '</div>';
    });
    // Summary stats
    var jSm = _projectIntelJira.summary || {};
    if (jSm.blockerCount > 0 || jSm.overdueCount > 0) {
      html += '<div style="display:flex;gap:12px;font-size:11px;margin-top:4px">';
      if (jSm.blockerCount > 0) html += '<span style="color:var(--rd);font-weight:600">' + jSm.blockerCount + ' blockers</span>';
      if (jSm.overdueCount > 0) html += '<span style="color:var(--or)">' + jSm.overdueCount + ' overdue</span>';
      if (jSm.resolvedThisWeek > 0) html += '<span style="color:var(--gn)">' + jSm.resolvedThisWeek + ' resolved this week</span>';
      html += '</div>';
    }
  } else if (_projectJiraLoading) {
    html += '<div style="font-size:var(--f-sm);color:var(--tx3);padding:8px"><div class="ca-spinner" style="width:16px;height:16px;display:inline-block"></div> Loading Jira...</div>';
  } else {
    html += '<div style="font-size:var(--f-sm);color:var(--tx3);padding:8px">No active sprints</div>';
  }
  html += '</div>';

  // ═══ 7. PEOPLE IN FOCUS ═══
  var focusPeople = new Set();
  day.events.forEach(function(e) {
    for (var ppid in DATA.people) {
      var pe = DATA.people[ppid];
      if (e.meta && e.meta.includes(pe.n.split(' ')[0])) focusPeople.add(ppid);
      if (e.title && e.title.includes(pe.n)) focusPeople.add(ppid);
    }
  });
  for (var ftid in threads) {
    var ft = threads[ftid];
    if ((ft.aiActionRequired || ft.aiPriority === 'critical' || ft.aiPriority === 'high') && state.threadStatus[ftid] !== 'done' && ft.peopleLinks) {
      ft.peopleLinks.forEach(function(ppid) { focusPeople.add(ppid); });
    }
  }
  if (focusPeople.size) {
    html += '<div class="summary-section" id="sum-people"><div class="summary-section-h"><h2>👥 People in Focus</h2><span class="summary-goto" onclick="switchModule(\'people\')">People →</span></div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
    focusPeople.forEach(function(ppid) {
      var pe = DATA.people[ppid];
      if (!pe) return;
      html += '<div class="focus-person" onclick="navToPerson(\'' + ppid + '\')"><div class="fp-avatar" style="background:' + pe.colour + '33;color:' + pe.colour + '">' + pe.initials + '</div><span class="fp-name">' + _sEnc(pe.n) + '</span></div>';
    });
    html += '</div></div>';
  }

  // ═══ 8. KEY METRICS ═══
  var m = DATA.metrics || {};
  var ms = m.subscribers || {};
  html += '<div class="summary-section" id="sum-metrics"><div class="summary-section-h"><h2>📈 Key Metrics</h2><span class="summary-goto" onclick="switchModule(\'metrics\')">Metrics →</span></div>';
  html += '<div class="metrics-grid">';
  html += statCard((ms.total || 0).toLocaleString(), 'Active Subscribers', ms.yoyGrowth ? '+' + ms.yoyGrowth + '% YoY' : '', 'up');
  html += statCard(ms.markets || '5', 'Markets', '', '');
  html += statCard(ms.avgDeliveries || '--', 'Avg Deliveries', 'per subscriber', '');
  html += statCard(ms.yoyGrowth ? '+' + ms.yoyGrowth + '%' : '--', 'YoY Growth', 'subscribers', 'up');
  html += '</div></div>';

  // ═══ 9. NEWS HIGHLIGHTS ═══
  html += '<div class="summary-section" id="sum-news"><div class="summary-section-h"><h2>📰 News Highlights</h2><span class="summary-goto" onclick="switchModule(\'news\')">News →</span></div>';
  if (DATA.news && DATA.news.articles && DATA.news.articles.length) {
    var topNews = DATA.news.articles.filter(function(a) { return a.relevanceScore > 0.5 || a.aiRelevance > 0.5; }).slice(0, 5);
    if (!topNews.length) topNews = DATA.news.articles.slice(0, 5);
    topNews.forEach(function(a) {
      html += '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:var(--f-sm)">';
      html += '<span style="font-size:10px;color:var(--ac);min-width:50px">' + _sEnc(a.sourceName || a.source || '') + '</span>';
      html += '<div style="flex:1">';
      html += '<div style="cursor:pointer" onclick="switchModule(\'news\')">' + _sEnc(a.title || '') + '</div>';
      if (a.aiSummary || a.summary) html += '<div style="font-size:10px;color:var(--tx3);margin-top:2px">' + _sEnc((a.aiSummary || a.summary || '')).slice(0, 120) + '</div>';
      html += '</div>';
      html += '<span style="font-size:10px;color:var(--tx3)">' + _sRelTime(a.publishedAt) + '</span>';
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:var(--f-sm);color:var(--tx3);padding:8px">News loading on next refresh...</div>';
  }
  html += '</div>';

  el.innerHTML = html;
}
