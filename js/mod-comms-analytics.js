// ===============================================================
// COMMS ANALYTICS TAB — Communication Intelligence Dashboard
// ===============================================================

async function loadCommsAnalyticsData() {
  if (state.commsAnalyticsLoading) return;
  state.commsAnalyticsLoading = true;
  renderAll();
  try {
    var resp = await fetch('/api/comms-analytics?days=' + (state.commsAnalyticsDays || 14));
    if (!resp.ok) throw new Error('API error ' + resp.status);
    state.commsAnalyticsData = await resp.json();
  } catch (e) {
    console.error('[CommsAnalytics] Load failed:', e);
    state.commsAnalyticsData = { error: e.message };
  }
  state.commsAnalyticsLoading = false;
  renderAll();
}

function caChangeDays(days) {
  state.commsAnalyticsDays = days;
  state.commsAnalyticsData = null;
  loadCommsAnalyticsData();
}

function caRefresh() {
  fetch('/api/comms-analytics/snapshot', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok) {
        if (typeof showToast === 'function') showToast('Snapshot: ' + d.topics + ' topics, ' + d.people + ' people, ' + d.projects + ' projects');
        setTimeout(function() { state.commsAnalyticsData = null; loadCommsAnalyticsData(); }, 1000);
      } else {
        if (typeof showToast === 'function') showToast(d.error || 'Snapshot failed', 'error');
      }
    })
    .catch(function() { if (typeof showToast === 'function') showToast('Snapshot request failed', 'error'); });
}

// ── Sidebar ──────────────────────────────────────────────────
function renderCommsAnalyticsSidebar() {
  var sb = $('sidebar');
  var d = state.commsAnalyticsData;
  var sec = state.commsAnalyticsSection || 'overview';
  var seg = d && d.segments ? d.segments : null;

  // Date stamp
  var dateStamp = '';
  if (d && d.snapshotDate) {
    var ago = d.generatedAt ? _caTimeAgo(d.generatedAt) : '';
    dateStamp = '<div class="ca-sb-date">' +
      '<div class="ca-sb-date-label">Last snapshot</div>' +
      '<div class="ca-sb-date-val">' + d.snapshotDate + '</div>' +
      (ago ? '<div class="ca-sb-date-ago">' + ago + '</div>' : '') +
      '</div>';
  }

  // Refresh button
  var refreshBtn = '<button class="ca-sb-refresh" onclick="caRefresh()">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
    ' Refresh Snapshot</button>';

  // Nav sections
  var sections = [
    { id: 'overview', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', label: 'Overview' },
    { id: 'topics', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>', label: 'Topics' },
    { id: 'people', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>', label: 'People' },
    { id: 'projects', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>', label: 'Projects' }
  ];

  var nav = sections.map(function(s) {
    return '<div class="ca-sb-nav-item' + (sec === s.id ? ' active' : '') + '"' +
      ' onclick="state.commsAnalyticsSection=\'' + s.id + '\';state.commsAnalyticsDrilldown=null;renderAll()">' +
      '<span class="ca-sb-nav-icon">' + s.icon + '</span>' +
      '<span>' + s.label + '</span>' +
    '</div>';
  }).join('');

  // Segment breakdown (marketing vs work)
  var segmentBlock = '';
  if (seg) {
    var workPct = d.overview && d.overview.totalThreads > 0 ? Math.round(seg.work.threads / d.overview.totalThreads * 100) : 0;
    var mktPct = 100 - workPct;
    var beanzPct = seg.work.threads > 0 ? Math.round(seg.beanzProject.threads / seg.work.threads * 100) : 0;

    segmentBlock = '<div class="ca-sb-segment">' +
      '<div class="ca-sb-segment-title">Email Segments</div>' +
      // Marketing vs Work bar
      '<div class="ca-sb-seg-row">' +
        '<div class="ca-sb-seg-bar">' +
          '<div class="ca-sb-seg-fill" style="width:' + workPct + '%;background:var(--ac)"></div>' +
          '<div class="ca-sb-seg-fill" style="width:' + mktPct + '%;background:var(--or)"></div>' +
        '</div>' +
        '<div class="ca-sb-seg-labels">' +
          '<span><span class="ca-sb-dot" style="background:var(--ac)"></span>Work ' + seg.work.threads + '</span>' +
          '<span><span class="ca-sb-dot" style="background:var(--or)"></span>Marketing ' + seg.marketing.threads + '</span>' +
        '</div>' +
      '</div>' +
      // Beanz projects vs Other work (within work)
      '<div class="ca-sb-seg-row" style="margin-top:8px">' +
        '<div class="ca-sb-seg-sub-title">Within Work</div>' +
        '<div class="ca-sb-seg-bar">' +
          '<div class="ca-sb-seg-fill" style="width:' + beanzPct + '%;background:var(--gn)"></div>' +
          '<div class="ca-sb-seg-fill" style="width:' + (100 - beanzPct) + '%;background:var(--tx3)"></div>' +
        '</div>' +
        '<div class="ca-sb-seg-labels">' +
          '<span><span class="ca-sb-dot" style="background:var(--gn)"></span>Beanz ' + seg.beanzProject.threads + '</span>' +
          '<span><span class="ca-sb-dot" style="background:var(--tx3)"></span>Other ' + seg.nonBeanzWork.threads + '</span>' +
        '</div>' +
      '</div>' +
      // Source split
      '<div class="ca-sb-seg-row" style="margin-top:8px">' +
        '<div class="ca-sb-seg-sub-title">Sources</div>' +
        '<div class="ca-sb-seg-labels">' +
          '<span><span class="ca-sb-dot" style="background:var(--cy)"></span>Email ' + seg.email.threads + '</span>' +
          '<span><span class="ca-sb-dot" style="background:var(--pu)"></span>Slack ' + seg.slack.threads + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Quick stats
  var stats = '';
  if (d && !d.error) {
    stats = '<div class="ca-sb-stats">' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val">' + (d.topics || []).length + '</span><span class="ca-sb-stat-label">topics</span></div>' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val">' + (d.people || []).length + '</span><span class="ca-sb-stat-label">people</span></div>' +
      '<div class="ca-sb-stat"><span class="ca-sb-stat-val">' + (d.projects || []).length + '</span><span class="ca-sb-stat-label">projects</span></div>' +
      (d.coverage ? '<div class="ca-sb-stat"><span class="ca-sb-stat-val">' + d.coverage.pct + '%</span><span class="ca-sb-stat-label">classified</span></div>' : '') +
    '</div>';
  }

  sb.innerHTML =
    '<div class="ca-sb">' +
      dateStamp +
      refreshBtn +
      '<div class="ca-sb-nav">' + nav + '</div>' +
      stats +
      segmentBlock +
    '</div>';

  if (!state.commsAnalyticsData && !state.commsAnalyticsLoading) {
    loadCommsAnalyticsData();
  }
}

// ── Main Content ─────────────────────────────────────────────
function renderCommsAnalyticsMain() {
  var main = $('main');
  var d = state.commsAnalyticsData;

  if (state.commsAnalyticsLoading && !d) {
    main.innerHTML = '<div style="padding:var(--sp4)">'
      + '<div class="c-grid-kpi" style="margin-bottom:var(--sp4)">'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:50%;margin-bottom:10px"></div><div class="c-skel" style="height:28px;width:55%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:50%;margin-bottom:10px"></div><div class="c-skel" style="height:28px;width:60%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:50%;margin-bottom:10px"></div><div class="c-skel" style="height:28px;width:70%"></div></div>'
      +   '<div class="c-skel-kpi"><div class="c-skel c-skel-line-sm" style="width:50%;margin-bottom:10px"></div><div class="c-skel" style="height:28px;width:45%"></div></div>'
      + '</div>'
      + '<div class="c-skel c-skel-chart" style="margin-bottom:var(--sp4)"></div>'
      + '<div class="c-grid-2">'
      +   '<div class="c-skel c-skel-chart" style="height:180px"></div>'
      +   '<div class="c-skel c-skel-chart" style="height:180px"></div>'
      + '</div></div>';
    return;
  }

  if (!d || d.error) {
    main.innerHTML = '<div style="padding:var(--sp4)"><div class="c-empty">'
      + '<div class="c-empty-icon">\uD83D\uDCCA</div>'
      + '<div class="c-empty-title">No analytics data yet</div>'
      + '<div class="c-empty-body">Snapshots are generated every 4 hours automatically. Generate the first one now to see topic trends, person activity, and category mix.</div>'
      + '<button class="c-btn c-btn-primary c-empty-action" onclick="caRefresh()">Generate First Snapshot</button>'
      + '</div></div>';
    return;
  }

  if (state.commsAnalyticsDrilldown) {
    main.innerHTML = renderCaDrilldown(d);
    return;
  }

  switch (state.commsAnalyticsSection) {
    case 'topics': main.innerHTML = renderCaTopics(d); break;
    case 'people': main.innerHTML = renderCaPeople(d); break;
    case 'projects': main.innerHTML = renderCaProjects(d); break;
    default: main.innerHTML = renderCaOverview(d); break;
  }
}

// ── Date Range Picker ────────────────────────────────────────
function caDatePicker() {
  var days = state.commsAnalyticsDays || 14;
  return '<div class="ca-date-picker">' +
    [7, 14, 30].map(function(d) {
      return '<button class="ca-day-btn' + (days === d ? ' active' : '') + '" onclick="caChangeDays(' + d + ')">' + d + 'd</button>';
    }).join('') +
    '</div>';
}

// ── Overview Section ─────────────────────────────────────────
function renderCaOverview(d) {
  var ov = d.overview || {};
  var seg = d.segments || {};
  var dailyTrend = ov.dailyTrend || [];

  var trendData = dailyTrend.map(function(pt) {
    return { label: pt.date.slice(5), value: pt.threads };
  });

  // AI summary narrative
  var narrative = '';
  if (d.summaries && d.summaries.daily_overview) {
    narrative = '<div class="ca-narrative">' +
      '<div class="ca-narrative-label">AI Daily Briefing</div>' +
      '<p>' + _caEnc(d.summaries.daily_overview) + '</p>' +
      '</div>';
  }

  // Segment donuts row
  var workPct = ov.totalThreads > 0 ? Math.round((seg.work ? seg.work.threads : 0) / ov.totalThreads * 100) : 0;
  var beanzPct = seg.work && seg.work.threads > 0 ? Math.round((seg.beanzProject ? seg.beanzProject.threads : 0) / seg.work.threads * 100) : 0;

  var segCards = '<div class="ca-seg-row">' +
    // Marketing vs Work donut
    '<div class="ca-seg-card">' +
      '<div class="ca-seg-donut">' +
        miniDonut(workPct, { size: 56, strokeWidth: 6, color: 'var(--ac)', label: workPct + '%' }) +
      '</div>' +
      '<div class="ca-seg-info">' +
        '<div class="ca-seg-title">Work vs Marketing</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--ac)"></span>Work: ' + (seg.work ? seg.work.threads : 0) + ' threads</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--or)"></span>Marketing: ' + (seg.marketing ? seg.marketing.threads : 0) + ' threads</div>' +
      '</div>' +
    '</div>' +
    // Beanz vs Other donut
    '<div class="ca-seg-card">' +
      '<div class="ca-seg-donut">' +
        miniDonut(beanzPct, { size: 56, strokeWidth: 6, color: 'var(--gn)', label: beanzPct + '%' }) +
      '</div>' +
      '<div class="ca-seg-info">' +
        '<div class="ca-seg-title">Beanz Projects vs Other</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--gn)"></span>Beanz: ' + (seg.beanzProject ? seg.beanzProject.threads : 0) + ' threads</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--tx3)"></span>Other: ' + (seg.nonBeanzWork ? seg.nonBeanzWork.threads : 0) + ' threads</div>' +
      '</div>' +
    '</div>' +
    // Source split
    '<div class="ca-seg-card">' +
      '<div class="ca-seg-donut">' +
        miniDonut(ov.totalThreads > 0 ? Math.round((seg.email ? seg.email.threads : 0) / ov.totalThreads * 100) : 0,
          { size: 56, strokeWidth: 6, color: 'var(--cy)', label: (seg.email ? seg.email.threads : 0) + '' }) +
      '</div>' +
      '<div class="ca-seg-info">' +
        '<div class="ca-seg-title">Sources</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--cy)"></span>Email: ' + (seg.email ? seg.email.threads : 0) + '</div>' +
        '<div class="ca-seg-detail"><span class="ca-sb-dot" style="background:var(--pu)"></span>Slack: ' + (seg.slack ? seg.slack.threads : 0) + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Summary metric cards
  var cards = '<div class="ca-grid">' +
    caCard('Total Threads', ov.totalThreads || 0, [], 'var(--tx)') +
    caCard('Active Topics', (d.topics || []).length, [], 'var(--ac)') +
    caCard('Active People', (d.people || []).length, [], 'var(--gn)') +
    caCard('Action Required', ov.actionRequired || 0, [], 'var(--rd)') +
    '</div>';

  // Thread volume chart
  var chart = '';
  if (trendData.length > 1) {
    chart = '<div class="ca-section">' +
      '<div class="ca-section-title">Thread Volume (Daily)</div>' +
      '<div class="ca-chart-wrap">' + trendLine(trendData, { width: 700, height: 200, color: 'var(--ac)' }) + '</div>' +
      '</div>';
  }

  // Top topics bar chart
  var topicBars = '';
  if (d.topics && d.topics.length > 0) {
    var barData = d.topics.slice(0, 10).map(function(t) {
      return { label: t.key, value: t.threadCount, color: 'var(--ac)' };
    });
    topicBars = '<div class="ca-section">' +
      '<div class="ca-section-title">Top Topics by Thread Count</div>' +
      barChart(barData, { barHeight: 24, gap: 4, maxItems: 10 }) +
      '</div>';
  }

  return '<div class="ca-main">' +
    '<div class="ca-header"><h2>Comms Analytics</h2>' + caDatePicker() + '</div>' +
    narrative + segCards + cards + chart + topicBars +
    '</div>';
}

// ── Topics Section ───────────────────────────────────────────
function renderCaTopics(d) {
  var topics = d.topics || [];

  var narrative = '';
  if (d.summaries && d.summaries.topic_trends) {
    narrative = '<div class="ca-narrative"><div class="ca-narrative-label">AI Topic Analysis</div><p>' +
      _caEnc(d.summaries.topic_trends) + '</p></div>';
  }

  var ov = d.overview || {};
  var dailyTrend = (ov.dailyTrend || []).map(function(pt) {
    return { label: pt.date.slice(5), value: pt.threads };
  });
  var volumeChart = dailyTrend.length > 1 ? (
    '<div class="ca-section"><div class="ca-section-title">Total Topic Volume</div>' +
    '<div class="ca-chart-wrap">' + trendLine(dailyTrend, { width: 700, height: 180, color: 'var(--ac)' }) + '</div></div>'
  ) : '';

  var topicCards = topics.map(function(t) {
    return _caEntityCard(t, 'topic', 'var(--ac)');
  }).join('');

  return '<div class="ca-main">' +
    '<div class="ca-header"><h2>Topic Analysis</h2>' + caDatePicker() + '</div>' +
    narrative + volumeChart +
    '<div class="ca-section"><div class="ca-section-title">All Topics (' + topics.length + ')</div>' +
    '<div class="ca-topic-grid">' + topicCards + '</div></div></div>';
}

// ── People Section ───────────────────────────────────────────
function renderCaPeople(d) {
  var people = d.people || [];

  var narrative = '';
  if (d.summaries && d.summaries.people_activity) {
    narrative = '<div class="ca-narrative"><div class="ca-narrative-label">AI People Analysis</div><p>' +
      _caEnc(d.summaries.people_activity) + '</p></div>';
  }

  var barData = people.slice(0, 15).map(function(p) {
    return { label: p.key, value: p.messageCount, color: 'var(--gn)' };
  });
  var chart = barData.length > 0 ? (
    '<div class="ca-section"><div class="ca-section-title">Most Active People (by messages)</div>' +
    barChart(barData, { barHeight: 24, gap: 4, maxItems: 15 }) + '</div>'
  ) : '';

  var peopleCards = people.map(function(p) {
    return _caEntityCard(p, 'person', 'var(--gn)');
  }).join('');

  return '<div class="ca-main">' +
    '<div class="ca-header"><h2>People Activity</h2>' + caDatePicker() + '</div>' +
    narrative + chart +
    '<div class="ca-section"><div class="ca-section-title">All People (' + people.length + ')</div>' +
    '<div class="ca-topic-grid">' + peopleCards + '</div></div></div>';
}

// ── Projects Section ─────────────────────────────────────────
function renderCaProjects(d) {
  var projects = d.projects || [];

  var narrative = '';
  if (d.summaries && d.summaries.project_pulse) {
    narrative = '<div class="ca-narrative"><div class="ca-narrative-label">AI Project Pulse</div><p>' +
      _caEnc(d.summaries.project_pulse) + '</p></div>';
  }

  var barData = projects.slice(0, 10).map(function(p) {
    return { label: p.key, value: p.threadCount, color: 'var(--pu)' };
  });
  var chart = barData.length > 0 ? (
    '<div class="ca-section"><div class="ca-section-title">Projects by Thread Count</div>' +
    barChart(barData, { barHeight: 24, gap: 4, maxItems: 10 }) + '</div>'
  ) : '';

  var projectCards = projects.map(function(p) {
    var topTopics = (p.topTopics || []).map(function(t) {
      return '<span class="ca-topic-chip">' + _caEnc(t) + '</span>';
    }).join('');
    var pplList = (p.people || []).slice(0, 4).map(function(n) { return _caEnc(n); }).join(', ');
    var extra = (topTopics ? '<div style="margin-top:4px">' + topTopics + '</div>' : '') +
      (pplList ? '<div style="margin-top:4px;font-size:10px;color:var(--tx3)">' + pplList + '</div>' : '');
    return _caEntityCard(p, 'project', 'var(--pu)', extra);
  }).join('');

  return '<div class="ca-main">' +
    '<div class="ca-header"><h2>Project Pulse</h2>' + caDatePicker() + '</div>' +
    narrative + chart +
    '<div class="ca-section"><div class="ca-section-title">All Projects (' + projects.length + ')</div>' +
    '<div class="ca-topic-grid">' + projectCards + '</div></div></div>';
}

// ── Drilldown View ───────────────────────────────────────────
function renderCaDrilldown(d) {
  var dd = state.commsAnalyticsDrilldown;
  if (!dd) return '';

  var dimension = dd.dimension;
  var key = dd.key;
  var list = dimension === 'topic' ? d.topics : dimension === 'person' ? d.people : d.projects;
  var entry = (list || []).find(function(e) { return e.key === key; });

  if (!entry) {
    return '<div class="ca-main"><div class="ca-header"><h2>' + _caEnc(key) + '</h2>' +
      '<button class="btn btn-sm" onclick="state.commsAnalyticsDrilldown=null;renderAll()">&#8592; Back</button></div>' +
      '<p>No data found.</p></div>';
  }

  var color = dimension === 'topic' ? 'var(--ac)' : dimension === 'person' ? 'var(--gn)' : 'var(--pu)';
  var trendData = (entry.trend || []).map(function(v, i) {
    var dateLabel = d.dates && d.dates[i] ? d.dates[i].slice(5) : '' + i;
    return { label: dateLabel, value: v };
  });

  var trendChart = trendData.length > 1 ? (
    '<div class="ca-section"><div class="ca-section-title">Daily Activity</div>' +
    '<div class="ca-chart-wrap">' + trendLine(trendData, { width: 700, height: 200, color: color }) + '</div></div>'
  ) : '';

  var sentLabel = entry.avgSentiment != null ? Math.round(entry.avgSentiment * 100) + '%' : '--';
  var dimLabel = dimension.charAt(0).toUpperCase() + dimension.slice(1);

  var stats = '<div class="ca-grid">' +
    caCard('Threads', entry.threadCount, [], color) +
    caCard('Messages', entry.messageCount, [], 'var(--gn)') +
    caCard('Avg Sentiment', sentLabel, [], 'var(--cy)') +
    (entry.actionRequired > 0 ? caCard('Action Required', entry.actionRequired, [], 'var(--rd)') : '') +
    '</div>';

  return '<div class="ca-main">' +
    '<div class="ca-header">' +
      '<button class="ca-back-btn" onclick="state.commsAnalyticsDrilldown=null;renderAll()">&#8592;</button>' +
      '<h2>' + _caEnc(key) + ' <span style="font-size:12px;color:var(--tx3);font-weight:400">' + dimLabel + '</span></h2>' +
      caDatePicker() +
    '</div>' +
    stats + trendChart +
    '</div>';
}

// ── Helpers ──────────────────────────────────────────────────
function caCard(title, value, sparkData, color) {
  var spark = sparkData && sparkData.length > 2 ? sparkline(sparkData, { width: 80, height: 24, color: color || 'var(--ac)' }) : '';
  return '<div class="ca-card">' +
    '<div class="ca-card-title">' + title + '</div>' +
    '<div class="ca-card-value" style="color:' + (color || 'var(--tx)') + '">' + value + '</div>' +
    (spark ? '<div class="ca-card-spark">' + spark + '</div>' : '') +
    '</div>';
}

function _caEntityCard(entry, dimension, color, extraHtml) {
  var sentLabel = entry.avgSentiment != null ? Math.round(entry.avgSentiment * 100) + '%' : '--';
  var arrow = entry.direction === 'up' ? '<span class="ca-trend-up">&#9650;</span>' :
              entry.direction === 'down' ? '<span class="ca-trend-down">&#9660;</span>' : '<span style="color:var(--tx3)">&#8212;</span>';
  var safeKey = _caEnc(entry.key).replace(/'/g, "\\'");
  return '<div class="ca-topic-card" onclick="state.commsAnalyticsDrilldown={key:\'' + safeKey + '\',dimension:\'' + dimension + '\'};renderAll()">' +
    '<div class="ca-topic-header">' +
      '<span class="ca-topic-name">' + _caEnc(entry.key) + '</span>' +
      arrow +
    '</div>' +
    '<div class="ca-topic-stats">' +
      '<span>' + entry.threadCount + ' threads</span>' +
      '<span>' + entry.messageCount + ' msgs</span>' +
      '<span>Sentiment ' + sentLabel + '</span>' +
      (entry.actionRequired > 0 ? '<span class="ca-action-badge">' + entry.actionRequired + ' action</span>' : '') +
    '</div>' +
    (extraHtml || '') +
    '<div class="ca-topic-spark">' + sparkline(entry.trend || [], { width: 160, height: 28, color: color }) + '</div>' +
  '</div>';
}

function _caEnc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _caTimeAgo(isoStr) {
  var diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}
