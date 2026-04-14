// ===============================================================
// TECH & AI NEWS TAB — Intelligence Feed with AI Summaries, Digest, Trends
// ===============================================================

// ── State defaults ───────────────────────────────────────────
if (!state.techNewsViewMode) state.techNewsViewMode = 'cards';
if (!state.techNewsDateRange) state.techNewsDateRange = 'all';
if (!state.techNewsPage) state.techNewsPage = 1;
if (!state.techNewsReadIds) state.techNewsReadIds = new Set();
if (!state.techNewsDigest) state.techNewsDigest = null;
if (!state.techNewsTrends) state.techNewsTrends = null;
if (!state.techNewsChatHistory) state.techNewsChatHistory = [];
if (!state.techNewsChatLoading) state.techNewsChatLoading = false;

var _techNewsPageSize = 25;

function _tnEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _tnTimeAgo(d) { var diff=Date.now()-new Date(d).getTime(); var m=Math.floor(diff/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; var dy=Math.floor(h/24); if(dy<7)return dy+'d ago'; if(dy<30)return Math.floor(dy/7)+'w ago'; return new Date(d).toLocaleDateString(); }
function _tnFmt(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : ''+n; }

// ── Data loading ─────────────────────────────────────────────
function loadTechNewsData() {
  DATA.techNewsLoading = true;
  renderAll();
  Promise.all([
    fetch('/api/tech-news').then(function(r){return r.json();}),
    fetch('/api/tech-news/read').then(function(r){return r.json();}).catch(function(){return{readIds:[]};})
  ]).then(function(results) {
    DATA.techNews = results[0];
    state.techNewsReadIds = new Set(results[1].readIds || []);
    DATA.techNewsLoading = false;
    renderAll();
  }).catch(function(e) { DATA.techNewsLoading = false; DATA.techNewsError = e.message; renderAll(); });
}

function refreshTechNews() {
  if (typeof showToast === 'function') showToast('Refreshing tech news feeds...');
  fetch('/api/tech-news/refresh').then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      if (typeof showToast === 'function') showToast(d.newArticles + ' new articles fetched');
      DATA.techNews = null; loadTechNewsData();
    }
  }).catch(function(){});
}

function markTechNewsRead(id) {
  if (state.techNewsReadIds.has(id)) return;
  state.techNewsReadIds.add(id);
  fetch('/api/tech-news/read/' + encodeURIComponent(id), { method: 'POST' }).catch(function(){});
}

function loadTechNewsDigest(period, force) {
  state.techNewsDigest = { loading: true };
  renderAll();
  var url = '/api/tech-news/digest?period=' + (period || 'daily');
  if (force) url += '&force=1';
  fetch(url).then(function(r){return r.json();}).then(function(d) {
    state.techNewsDigest = d;
    renderAll();
  }).catch(function(e) { state.techNewsDigest = { error: e.message }; renderAll(); });
}

function loadTechNewsTrends() {
  fetch('/api/tech-news/trends?days=14').then(function(r){return r.json();}).then(function(d) {
    state.techNewsTrends = d;
    renderAll();
  }).catch(function(){});
}

// ── Sidebar ──────────────────────────────────────────────────
function renderTechNewsSidebar() {
  var sb = $('sidebar');
  var news = DATA.techNews;
  var articles = news ? news.articles || [] : [];
  var unreadCount = articles.filter(function(a){return !state.techNewsReadIds.has(a.id);}).length;
  var sec = state.techNewsCategory || 'all';

  var cats = [
    { id: 'all', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', label: 'All News', count: articles.length },
    { id: 'research', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>', label: 'Research', count: '' },
    { id: 'briefing', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', label: 'Briefing', count: '' },
    { id: 'unread', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>', label: 'Unread', count: unreadCount },
    { id: 'industry', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>', label: 'Tech Press', count: articles.filter(function(a){return a.category==='industry';}).length },
    { id: 'reddit', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M14 10a2 2 0 100 4"/><path d="M10 10a2 2 0 000 4"/></svg>', label: 'Reddit', count: articles.filter(function(a){return a.category==='reddit';}).length },
    { id: 'youtube', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="4"/><polygon points="10 8 16 12 10 16"/></svg>', label: 'YouTube', count: articles.filter(function(a){return a.category==='youtube';}).length },
    { id: 'trends', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', label: 'Trends', count: '' },
    { id: 'chat', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>', label: 'Chat', count: '' }
  ];

  var nav = cats.map(function(c) {
    var isActive = sec === c.id;
    var countHtml = c.count !== '' ? '<span class="nb">' + c.count + '</span>' : '';
    return '<div class="ca-sb-nav-item' + (isActive ? ' active' : '') + '"' +
      ' onclick="state.techNewsCategory=\'' + c.id + '\';state.techNewsPage=1;renderAll();' +
      (c.id === 'briefing' ? 'if(!state.techNewsDigest)loadTechNewsDigest()' : '') +
      (c.id === 'research' ? 'if(!state.techNewsResearch)loadTechNewsResearch()' : '') +
      (c.id === 'trends' ? ';if(!state.techNewsTrends)loadTechNewsTrends()' : '') + '">' +
      '<span class="ca-sb-nav-icon">' + c.icon + '</span>' +
      '<span>' + c.label + '</span>' +
      countHtml +
    '</div>';
  }).join('');

  // Last refreshed + source status
  var statusHtml = '';
  if (news) {
    var ss = news.sourceStatus || {};
    statusHtml = '<div class="ca-sb-date">' +
      (news.lastRefreshed ? '<div class="ca-sb-date-label">Last refresh</div><div class="ca-sb-date-ago">' + _tnTimeAgo(news.lastRefreshed) + '</div>' : '') +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:4px;font-size:10px">' +
        '<span style="color:' + (ss.rss === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">RSS</span>' +
        '<span style="color:' + (ss.reddit === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">Reddit</span>' +
        '<span style="color:' + (ss.youtube === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">YT</span>' +
      '</div>' +
    '</div>';
  }

  sb.innerHTML = '<div class="ca-sb">' +
    statusHtml +
    '<button class="ca-sb-refresh" onclick="refreshTechNews()">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
      ' Refresh Feeds</button>' +
    '<div class="ca-sb-nav">' + nav + '</div>' +
    '<button class="ca-sb-refresh" style="margin-top:auto;border-color:var(--bd2)" onclick="state.techNewsCategory=\'settings\';renderAll()">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
      ' Manage Sources</button>' +
  '</div>';
}

// ── Main Content ─────────────────────────────────────────────
function renderTechNewsMain() {
  var el = $('main');

  // Settings and Research work regardless of data load state
  if (state.techNewsCategory === 'settings') { el.innerHTML = renderTechNewsSettings(); return; }
  if (state.techNewsCategory === 'research') { el.innerHTML = renderTechNewsResearch(); return; }

  if (DATA.techNewsLoading || (!DATA.techNews && !DATA.techNewsError)) {
    el.innerHTML = '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading tech news...</p></div>';
    return;
  }
  if (DATA.techNewsError) {
    el.innerHTML = '<div class="ca-loading"><p>Failed to load tech news: ' + _tnEnc(DATA.techNewsError) + '</p><button class="btn btn-sm" onclick="loadTechNewsData()" style="margin-top:12px">Retry</button></div>';
    return;
  }
  if (!DATA.techNews || !DATA.techNews.articles) {
    el.innerHTML = '<div class="ca-loading"><p>No tech news data. Click Refresh to fetch.</p></div>';
    return;
  }

  // Special views
  if (state.techNewsCategory === 'briefing') { el.innerHTML = renderTechNewsBriefing(); return; }
  if (state.techNewsCategory === 'trends') { el.innerHTML = renderTechNewsTrends(); return; }
  if (state.techNewsCategory === 'chat') { el.innerHTML = renderTechNewsChat(); _techNewsChatScrollToBottom(); return; }

  // Article list
  var articles = _tnFilterArticles(DATA.techNews.articles);
  var totalCount = articles.length;
  var pageArticles = articles.slice(0, state.techNewsPage * _techNewsPageSize);
  var hasMore = pageArticles.length < totalCount;

  var html = '<div class="ca-main">';

  // Header with view modes
  html += '<div class="ca-header"><h2>Tech & AI News Feed</h2><div style="display:flex;gap:var(--sp2);align-items:center;flex-wrap:wrap">' +
    _tnSortPicker() + _tnViewToggle() + _tnDateFilter() +
    '</div></div>';

  // Search
  html += '<div style="margin-bottom:var(--sp3)"><input class="filter-input" placeholder="Search tech news..." value="' + _tnEnc(state.techNewsSearch || '') + '" oninput="state.techNewsSearch=this.value;state.techNewsPage=1;renderTechNewsMain()" style="width:100%"/></div>';

  // Stats row
  var stats = DATA.techNews.stats || {};
  html += '<div class="nw-stats">' +
    _tnStatChip(stats.totalArticles || 0, 'Total') +
    _tnStatChip(stats.lastWeekCount || 0, 'This Week') +
    _tnStatChip((stats.byCategory || {}).industry || 0, 'Tech Press') +
    _tnStatChip((stats.byCategory || {}).reddit || 0, 'Reddit') +
    _tnStatChip((stats.byCategory || {}).youtube || 0, 'YouTube') +
    '</div>';

  // Articles
  html += '<div class="nw-section-label">Articles (' + totalCount + ')</div>';

  if (!pageArticles.length) {
    html += '<div class="ca-loading" style="padding:var(--sp6)"><p>No articles match your filters.</p></div>';
  } else {
    html += '<div class="nw-list nw-' + (state.techNewsViewMode || 'cards') + '">';
    pageArticles.forEach(function(a) { html += _tnRenderArticle(a); });
    html += '</div>';
  }

  if (hasMore) {
    html += '<div style="text-align:center;padding:var(--sp4)"><button class="btn btn-sm" onclick="state.techNewsPage++;renderTechNewsMain()">Load More (' + (totalCount - pageArticles.length) + ' remaining)</button></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Filtering ────────────────────────────────────────────────
function _tnFilterArticles(articles) {
  var result = articles.slice();
  var cat = state.techNewsCategory;

  // Category
  if (cat === 'unread') result = result.filter(function(a){return !state.techNewsReadIds.has(a.id);});
  else if (cat === 'pinned') result = result.filter(function(a){return a.pinned;});
  else if (cat && cat !== 'all' && cat !== 'briefing' && cat !== 'trends' && cat !== 'chat') {
    result = result.filter(function(a){return a.category === cat;});
  }

  // Search
  if (state.techNewsSearch) {
    var q = state.techNewsSearch.toLowerCase();
    result = result.filter(function(a) {
      return (a.title||'').toLowerCase().includes(q) || (a.summary||'').toLowerCase().includes(q) ||
        (a.source||'').toLowerCase().includes(q) || (a.author||'').toLowerCase().includes(q);
    });
  }

  // Date range
  if (state.techNewsDateRange && state.techNewsDateRange !== 'all') {
    var cutoff;
    if (state.techNewsDateRange === 'today') cutoff = Date.now() - 86400000;
    else if (state.techNewsDateRange === 'week') cutoff = Date.now() - 7 * 86400000;
    else if (state.techNewsDateRange === 'month') cutoff = Date.now() - 30 * 86400000;
    if (cutoff) result = result.filter(function(a){return new Date(a.publishedAt).getTime() > cutoff;});
  }

  // Sort
  var sort = state.techNewsSort || 'date';
  if (sort === 'relevance') result.sort(function(a,b){return (b.relevanceScore||0)-(a.relevanceScore||0);});
  else if (sort === 'engagement') result.sort(function(a,b){return ((b.engagement?.redditScore||0)+(b.engagement?.youtubeViews||0))-((a.engagement?.redditScore||0)+(a.engagement?.youtubeViews||0));});
  else result.sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);});

  return result;
}

// ── Article Rendering ────────────────────────────────────────
function _tnRenderArticle(a) {
  var isRead = state.techNewsReadIds.has(a.id);
  var relPct = Math.round((a.relevanceScore || 0) * 100);
  var relColor = relPct > 60 ? 'var(--gn)' : relPct > 30 ? 'var(--or)' : 'var(--tx3)';
  var mode = state.techNewsViewMode || 'cards';

  // Headlines mode: ultra-compact
  if (mode === 'headlines') {
    return '<div class="nw-headline' + (isRead ? '' : ' nw-unread') + '" onclick="openTechNewsDetail(\'' + a.id + '\')">' +
      '<span class="nw-hl-source">' + _tnEnc(a.category) + '</span>' +
      '<span class="nw-hl-title">' + (a.pinned ? '&#9733; ' : '') + _tnEnc(a.title) + '</span>' +
      '<span class="nw-hl-time">' + _tnTimeAgo(a.publishedAt) + '</span>' +
      (a.hasNote ? '<span class="nw-note-dot">&#9998;</span>' : '') +
    '</div>';
  }

  // Compact mode: single row
  if (mode === 'compact') {
    var eng = '';
    if (a.engagement && a.engagement.redditScore) eng = '&#9650;' + a.engagement.redditScore;
    else if (a.engagement && a.engagement.youtubeViews) eng = '&#9654;' + _tnFmt(a.engagement.youtubeViews);

    return '<div class="nw-compact' + (isRead ? '' : ' nw-unread') + '" onclick="openTechNewsDetail(\'' + a.id + '\')">' +
      '<span class="nw-c-badge nw-badge-' + a.category + '">' + _tnEnc(a.category.slice(0,3)) + '</span>' +
      '<span class="nw-c-title">' + (a.pinned ? '&#9733; ' : '') + _tnEnc(a.title) + '</span>' +
      '<span class="nw-c-source">' + _tnEnc(a.sourceName || a.source) + '</span>' +
      (eng ? '<span class="nw-c-eng">' + eng + '</span>' : '') +
      '<span class="nw-c-rel" style="color:' + relColor + '">' + relPct + '%</span>' +
      '<span class="nw-c-time">' + _tnTimeAgo(a.publishedAt) + '</span>' +
      (a.hasNote ? '<span class="nw-note-dot">&#9998;</span>' : '') +
    '</div>';
  }

  // Cards mode (default)
  var hasImage = a.image && a.image.startsWith('http');
  var summary = a.aiEnrichedSummary || a.aiSummary || (a.summary || '').slice(0, 200);
  if (summary.length >= 200 && !a.aiEnrichedSummary && !a.aiSummary) summary += '...';

  // Engagement string
  var engStr = '';
  if (a.engagement && a.engagement.redditScore) engStr = ' &middot; &#9650;' + a.engagement.redditScore;
  else if (a.engagement && a.engagement.youtubeViews) engStr = ' &middot; &#9654;' + _tnFmt(a.engagement.youtubeViews);

  // Sentiment badge (prominent)
  var sentBadge = '';
  if (a.sentiment && a.sentiment !== 'neutral') {
    var sentColor = a.sentiment === 'positive' ? 'var(--gn)' : a.sentiment === 'negative' ? 'var(--rd)' : 'var(--or)';
    var sentIcon = a.sentiment === 'positive' ? '&#9650;' : a.sentiment === 'negative' ? '&#9660;' : '&#9670;';
    var sentLabel = a.sentiment.charAt(0).toUpperCase() + a.sentiment.slice(1);
    sentBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:' + sentColor + '18;color:' + sentColor + ';font-weight:600">' + sentIcon + ' ' + sentLabel + '</span>';
  } else if (a.sentiment === 'neutral') {
    sentBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:var(--s3);color:var(--tx3);font-weight:600">Neutral</span>';
  }

  // Category badge
  var catBadge = '';
  if (a.category_classification && a.category_classification !== 'other') {
    catBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:var(--ac)18;color:var(--ac);font-weight:600">' + _tnEnc(_tnCatLabel(a.category_classification)) + '</span>';
  }

  // Thumbnail
  var thumbHtml = '';
  if (hasImage) {
    thumbHtml = '<div class="news-card-thumb"><img src="' + a.image + '" alt="" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/></div>';
  }

  // Tags row: source badge + category + sentiment — no brand tags for tech news
  var tagsRow = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
    '<span class="news-source-badge news-badge-' + a.category + '">' + _tnEnc(a.category) + '</span>' +
    catBadge +
    (a.videoId ? '<span class="news-yt-badge">&#9654; Video</span>' : '') +
    sentBadge +
  '</div>';

  return '<div class="news-card' + (isRead ? '' : ' nw-unread') + '" data-cat="' + a.category + '" onclick="openTechNewsDetail(\'' + a.id + '\')">' +
    '<div class="news-card-row">' +
      thumbHtml +
      '<div class="news-card-content">' +
        tagsRow +
        '<h2 class="news-card-title">' + _tnEnc(a.title) + '</h2>' +
        '<div class="news-card-meta">' + _tnEnc(a.sourceName || a.source) + (a.author ? ' &middot; ' + _tnEnc(a.author) : '') + engStr + ' &middot; ' + _tnTimeAgo(a.publishedAt) + '</div>' +
        '<div class="news-card-summary">' + _tnEnc(summary) + '</div>' +
        (a.beanzImpact ? '<div class="nw-card-impact" style="border-left-color:#8b5cf6;background:#8b5cf610"><span class="nw-impact-label" style="color:#8b5cf6">Tech Relevance</span> ' + _tnEnc(a.beanzImpact) + '</div>' : '') +
        '<div class="news-card-footer">' +
          '<div class="cor-feedback news-card-fb" style="margin-left:0">' +
            '<button class="fb-btn fb-up" onclick="event.stopPropagation();sendFeedback(\'tech-news\',\'' + a.id + '\',\'up\')" title="Relevant">&#9650;</button>' +
            '<button class="fb-btn fb-down" onclick="event.stopPropagation();sendFeedback(\'tech-news\',\'' + a.id + '\',\'down\')" title="Not relevant">&#9660;</button>' +
            '<button class="fb-btn fb-dismiss" onclick="event.stopPropagation();sendFeedback(\'tech-news\',\'' + a.id + '\',\'dismiss\');setTimeout(function(){DATA.techNews=null;loadTechNewsData()},300)" title="Dismiss">&#10005;</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ── Category label helper ───────────────────────────────────
function _tnCatLabel(cat) {
  var labels = {
    product_review: 'Review', complaint: 'Complaint', education: 'Education',
    tutorial: 'Tutorial', entertainment: 'Entertainment', news: 'News',
    discussion: 'Discussion', question: 'Question', recommendation: 'Rec',
    industry_news: 'Industry', product_launch: 'Launch', opinion: 'Opinion',
    research: 'Research', other: 'Other'
  };
  return labels[cat] || cat;
}

// ── Briefing View ────────────────────────────────────────────
function renderTechNewsBriefing() {
  var d = state.techNewsDigest;
  if (!d || d.loading) return '<div class="ca-main"><div class="ca-header"><h2>Daily Briefing</h2></div><div class="ca-loading"><div class="ca-spinner"></div><p>Generating your briefing... this takes about 30 seconds</p></div></div>';
  if (d.error || !d.digest) return '<div class="ca-main"><div class="ca-header"><h2>Daily Briefing</h2></div><div class="ca-loading"><p>Could not generate briefing.</p><button class="btn btn-sm" style="margin-top:8px" onclick="loadTechNewsDigest(\'daily\')">Retry</button></div></div>';

  var dig = d.digest;
  var html = '<div class="ca-main" style="max-width:800px">';

  // Header
  html += '<div class="ca-header"><h2>Daily Briefing</h2><div style="display:flex;gap:var(--sp2);align-items:center">';
  html += '<button class="ca-day-btn' + (state._techNewsBriefPeriod !== 'weekly' ? ' active' : '') + '" onclick="state._techNewsBriefPeriod=\'daily\';loadTechNewsDigest(\'daily\')">Daily</button>';
  html += '<button class="ca-day-btn' + (state._techNewsBriefPeriod === 'weekly' ? ' active' : '') + '" onclick="state._techNewsBriefPeriod=\'weekly\';loadTechNewsDigest(\'weekly\')">Weekly</button>';
  html += '<button class="btn btn-sm" style="margin-left:var(--sp3)" onclick="loadTechNewsDigest(state._techNewsBriefPeriod||\'daily\',true)">Regenerate</button>';
  html += '</div></div>';

  // Catchy headline
  if (dig.headline) {
    html += '<div style="font-size:var(--f-2xl);font-weight:var(--fw-b);line-height:1.3;margin-bottom:var(--sp4);color:var(--tx)">' + _tnEnc(dig.headline) + '</div>';
  }

  // Executive Summary — conversational lead
  if (dig.executive_summary) {
    html += '<div style="font-size:var(--f-md);line-height:1.7;color:var(--tx2);margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s2);border-radius:var(--r2);border-left:3px solid var(--ac)">' +
      _tnEnc(dig.executive_summary) + '</div>';
  }

  // ── TOP STORIES ──
  if (dig.top_stories && dig.top_stories.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Top Stories</div>';
    dig.top_stories.forEach(function(s, i) {
      var hasImg = s.image && s.image.startsWith('http');
      html += '<div style="margin-bottom:var(--sp4);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">';
      if (hasImg) {
        html += '<div style="margin-bottom:var(--sp3);border-radius:8px;overflow:hidden;max-height:200px"><img src="' + s.image + '" alt="" style="width:100%;object-fit:cover" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/></div>';
      }
      html += '<div style="font-size:9px;text-transform:uppercase;color:var(--tx3);letter-spacing:0.5px;margin-bottom:4px">' + _tnEnc(s.source || '') + '</div>';
      html += '<div style="font-size:var(--f-lg);font-weight:var(--fw-sb);line-height:1.35;margin-bottom:var(--sp2)">';
      if (s.url) html += '<a href="' + _tnEnc(s.url) + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _tnEnc(s.title) + ' &#8599;</a>';
      else html += _tnEnc(s.title);
      html += '</div>';
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _tnEnc(s.analysis || '') + '</div>';
      if (s.quote) {
        html += '<div style="margin:var(--sp3) 0;padding:var(--sp3) var(--sp4);border-left:3px solid var(--ac);background:var(--s2);font-style:italic;font-size:var(--f-sm);line-height:1.5;color:var(--tx)">"' + _tnEnc(s.quote) + '"</div>';
      }
      if (s.beanz_relevance) {
        html += '<div style="font-size:12px;color:#8b5cf6;margin-top:var(--sp2)">&#9889; ' + _tnEnc(s.beanz_relevance) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // ── PRODUCT SPOTLIGHT ──
  if (dig.product_spotlight && dig.product_spotlight.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Product Spotlight</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--sp3)">';
    dig.product_spotlight.forEach(function(p) {
      var sentColor = p.sentiment === 'positive' ? 'var(--gn)' : p.sentiment === 'negative' ? 'var(--rd)' : 'var(--or)';
      html += '<div style="padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);border-top:3px solid ' + sentColor + '">' +
        '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _tnEnc(p.product || '') + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);margin-bottom:var(--sp2)">' + _tnEnc(p.brand || '') +
          ' <span style="color:' + sentColor + '">' + _tnEnc(p.sentiment || '') + '</span></div>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _tnEnc(p.what_people_say || '') + '</div>' +
        (p.url ? '<a href="' + _tnEnc(p.url) + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ac);margin-top:4px;display:block">Read more &#8599;</a>' : '') +
        '</div>';
    });
    html += '</div></div>';
  }

  // ── COMPLAINTS RADAR ──
  if (dig.complaints_radar && dig.complaints_radar.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg);color:var(--rd)">Complaints Radar</div>';
    dig.complaints_radar.forEach(function(c) {
      var sevColor = c.severity === 'high' ? 'var(--rd)' : c.severity === 'medium' ? 'var(--or)' : 'var(--tx3)';
      html += '<div style="margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);border-left:3px solid ' + sevColor + '">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
          '<strong>' + _tnEnc(c.brand || '') + '</strong>' +
          '<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:' + sevColor + '18;color:' + sevColor + ';font-weight:600">' + _tnEnc(c.severity || '') + '</span>' +
        '</div>' +
        '<div style="font-size:var(--f-sm);color:var(--tx2);margin-bottom:4px">' + _tnEnc(c.issue || '') + '</div>';
      if (c.source_quote) {
        html += '<div style="font-style:italic;font-size:12px;color:var(--tx3);padding-left:12px;border-left:2px solid var(--bd)">"' + _tnEnc(c.source_quote) + '"</div>';
      }
      if (c.thread_url) {
        html += '<a href="' + _tnEnc(c.thread_url) + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ac);margin-top:4px;display:inline-block">View thread &#8599;</a>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // ── YOUTUBE INSIGHTS ──
  if (dig.youtube_insights && dig.youtube_insights.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg);color:var(--rd)">YouTube Insights</div>';
    dig.youtube_insights.forEach(function(yt) {
      var sentColor = yt.sentiment === 'positive' ? 'var(--gn)' : yt.sentiment === 'negative' ? 'var(--rd)' : yt.sentiment === 'mixed' ? 'var(--or)' : 'var(--tx3)';
      var ytLink = yt.videoId ? 'https://www.youtube.com/watch?v=' + yt.videoId : '';
      html += '<div style="margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">';
      // Embed thumbnail
      if (yt.videoId) {
        html += '<div style="margin-bottom:var(--sp2);border-radius:8px;overflow:hidden;position:relative;cursor:pointer" onclick="window.open(\'' + ytLink + '\',\'_blank\')">' +
          '<img src="https://i.ytimg.com/vi/' + yt.videoId + '/hqdefault.jpg" alt="" style="width:100%;display:block" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px"></div></div>' +
          '</div>';
      }
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
        '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--rd);color:#fff;font-weight:600">&#9654; ' + _tnEnc(yt.channel || '') + '</span>' +
        '<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:' + sentColor + '18;color:' + sentColor + ';font-weight:600">' + _tnEnc(yt.sentiment || '') + '</span>' +
        '</div>';
      html += '<div style="font-weight:var(--fw-sb);margin-bottom:var(--sp2)">';
      if (ytLink) html += '<a href="' + ytLink + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _tnEnc(yt.title || '') + ' &#8599;</a>';
      else html += _tnEnc(yt.title || '');
      html += '</div>';
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _tnEnc(yt.summary || '') + '</div>';
      if (yt.standout_quote) {
        html += '<div style="margin:var(--sp2) 0;padding:var(--sp2) var(--sp3);border-left:3px solid var(--rd);font-style:italic;font-size:var(--f-sm);color:var(--tx)">"' + _tnEnc(yt.standout_quote) + '"</div>';
      }
      if (yt.beanz_relevance) {
        html += '<div style="font-size:12px;color:#8b5cf6;margin-top:4px">&#9889; ' + _tnEnc(yt.beanz_relevance) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // ── REDDIT PULSE ──
  if (dig.reddit_pulse) {
    var rp = dig.reddit_pulse;
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg);color:var(--pu)">Reddit Pulse</div>';
    if (rp.summary) {
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2);margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s2);border-radius:var(--r2);border-left:3px solid var(--pu)">' + _tnEnc(rp.summary) + '</div>';
    }
    if (rp.trending_topics && rp.trending_topics.length) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp3)">';
      rp.trending_topics.forEach(function(t) { html += '<span class="ca-topic-chip">' + _tnEnc(t) + '</span>'; });
      html += '</div>';
    }
    if (rp.hot_threads && rp.hot_threads.length) {
      rp.hot_threads.forEach(function(ht) {
        html += '<div style="margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
            '<span style="font-size:11px;color:var(--pu);font-weight:600">r/' + _tnEnc(ht.subreddit || '') + '</span>' +
            (ht.upvotes ? '<span style="font-size:11px;color:var(--or)">&#9650; ' + ht.upvotes + '</span>' : '') +
          '</div>' +
          '<div style="font-weight:var(--fw-sb);margin-bottom:4px">';
        if (ht.url) html += '<a href="' + _tnEnc(ht.url) + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _tnEnc(ht.title || '') + ' &#8599;</a>';
        else html += _tnEnc(ht.title || '');
        html += '</div>';
        if (ht.insight) html += '<div style="font-size:var(--f-sm);color:var(--tx2);margin-bottom:4px">' + _tnEnc(ht.insight) + '</div>';
        if (ht.top_comment_quote) {
          html += '<div style="font-style:italic;font-size:12px;color:var(--tx3);padding-left:12px;border-left:2px solid var(--pu)">"' + _tnEnc(ht.top_comment_quote) + '"</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
  }

  // ── TRENDS ──
  if (dig.trends && dig.trends.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Trends</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--sp3)">';
    dig.trends.forEach(function(t) {
      html += '<div style="padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);border-top:3px solid var(--ac)">' +
        '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _tnEnc(t.trend || '') + '</div>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _tnEnc(t.description || '') + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);margin-top:4px">' + _tnEnc(t.evidence || '') + '</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // ── INNOVATION CORNER ──
  if (dig.innovation_corner) {
    html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:linear-gradient(135deg,var(--s2),var(--s1));border:1px solid var(--ac);border-radius:var(--r2)">' +
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--ac);margin-bottom:var(--sp2)">Innovation Corner</div>' +
      '<div style="font-size:var(--f-md);line-height:1.6;color:var(--tx)">' + _tnEnc(dig.innovation_corner) + '</div></div>';
  }

  // ── RECOMMENDED ACTIONS ──
  if (dig.recommended_actions && dig.recommended_actions.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Recommended Actions</div>';
    dig.recommended_actions.forEach(function(a, i) {
      html += '<div style="display:flex;gap:var(--sp3);align-items:flex-start;margin-bottom:var(--sp2);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">' +
        '<span style="background:var(--ac);color:#fff;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (i+1) + '</span>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _tnEnc(a) + '</div></div>';
    });
    html += '</div>';
  }

  if (d.generated_at) html += '<div style="font-size:10px;color:var(--tx3);margin-top:var(--sp4)">Generated: ' + _tnTimeAgo(d.generated_at) + (d.cached ? ' (cached)' : '') + '</div>';

  html += '</div>';
  return html;
}

// ── Trends View ──────────────────────────────────────────────
function renderTechNewsTrends() {
  var t = state.techNewsTrends;
  if (!t) return '<div class="ca-main"><div class="ca-header"><h2>Trending Topics</h2></div><div class="ca-loading"><div class="ca-spinner"></div><p>Loading trends...</p></div></div>';

  var html = '<div class="ca-main"><div class="ca-header"><h2>Trending Topics</h2></div>';

  // Emerging
  if (t.emerging && t.emerging.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--gn)">&#9650; Emerging</div><div class="nw-trend-list">';
    t.emerging.forEach(function(tp) { html += _tnTrendChip(tp, 'var(--gn)'); });
    html += '</div></div>';
  }

  // Trending
  if (t.trending && t.trending.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--ac)">&#10548; Trending</div><div class="nw-trend-list">';
    t.trending.forEach(function(tp) { html += _tnTrendChip(tp, 'var(--ac)'); });
    html += '</div></div>';
  }

  // All topics
  if (t.topics && t.topics.length) {
    html += '<div class="ca-section"><div class="ca-section-title">All Topics (last 14 days)</div><div class="nw-trend-list">';
    t.topics.forEach(function(tp) {
      var color = tp.status === 'emerging' ? 'var(--gn)' : tp.status === 'trending' ? 'var(--ac)' : tp.status === 'declining' ? 'var(--rd)' : 'var(--tx3)';
      html += _tnTrendChip(tp, color);
    });
    html += '</div></div>';
  }

  // Declining
  if (t.declining && t.declining.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--rd)">&#9660; Declining</div><div class="nw-trend-list">';
    t.declining.forEach(function(tp) { html += _tnTrendChip(tp, 'var(--rd)'); });
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

function _tnTrendChip(tp, color) {
  var arrow = tp.delta > 0 ? '&#9650;' : tp.delta < 0 ? '&#9660;' : '';
  return '<div class="nw-trend-chip" onclick="state.techNewsSearch=\'' + _tnEnc(tp.topic) + '\';state.techNewsCategory=\'all\';state.techNewsPage=1;renderAll()">' +
    '<span class="nw-trend-name">' + _tnEnc(tp.topic) + '</span>' +
    '<span class="nw-trend-count">' + tp.thisWeek + '</span>' +
    (tp.delta !== 0 ? '<span style="color:' + color + ';font-size:10px">' + arrow + ' ' + Math.abs(tp.delta) + '%</span>' : '') +
  '</div>';
}

// ── Detail Panel ─────────────────────────────────────────────
function openTechNewsDetail(id) {
  var a = (DATA.techNews && DATA.techNews.articles || []).find(function(x){return x.id===id;});
  if (!a) return;
  state.selectedTechNewsItem = id;
  markTechNewsRead(id);
  if (typeof trackInteraction === 'function') trackInteraction('tech_news_view', 'tech-news', id);

  var relPct = Math.round((a.relevanceScore || 0) * 100);
  var relColor = relPct > 60 ? 'var(--gn)' : relPct > 30 ? 'var(--or)' : 'var(--tx3)';
  var imgSrc = a.image || _tnPlaceholder(a.category);

  // Extract videoId from URL if missing
  var videoId = a.videoId;
  if (!videoId && a.url) {
    var vm = a.url.match(/(?:watch\?v=|youtu\.be\/|videos\/)([a-zA-Z0-9_-]{11})/);
    if (vm) videoId = vm[1];
  }

  // YouTube embed
  var embedHtml = '';
  if (videoId) {
    embedHtml = '<div class="news-detail-embed"><div class="news-yt-container"><iframe src="https://www.youtube.com/embed/' + videoId + '" frameborder="0" allowfullscreen></iframe></div></div>';
  }

  // Transcript section
  var transcriptHtml = '';
  if (videoId) {
    transcriptHtml = '<div class="news-detail-section" id="tn-transcript-section">' +
      '<div class="news-detail-section-header">' +
      '<span>&#128221; Transcript</span>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-sm" id="tn-transcript-btn" onclick="event.stopPropagation();loadTechTranscript(\'' + videoId + '\')">Load</button>' +
        '<button class="btn btn-sm" id="tn-transcript-paste-toggle" onclick="event.stopPropagation();toggleTechTranscriptPaste(\'' + videoId + '\')" style="border-color:var(--bd2)" title="Paste transcript manually">Paste</button>' +
      '</div>' +
      '</div>' +
      '<div id="tn-transcript-content" class="news-transcript-body" style="display:none"></div>' +
      '<div id="tn-transcript-paste-area" style="display:none;padding:var(--sp3)">' +
        '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2)">Copy the transcript from YouTube (click <b>...</b> &gt; <b>Show transcript</b> on the video page) and paste below:</div>' +
        '<textarea id="tn-transcript-paste-input" style="width:100%;min-height:120px;padding:var(--sp2);border:1px solid var(--bd);border-radius:var(--r2);background:var(--bg2);color:var(--tx);font-size:var(--f-sm);resize:vertical" placeholder="0:00\nHello and welcome...\n0:15\nToday we are going to..."></textarea>' +
        '<div style="display:flex;gap:6px;margin-top:var(--sp2)">' +
          '<button class="btn btn-sm" onclick="submitPastedTechTranscript(\'' + videoId + '\')">Save Transcript</button>' +
          '<button class="btn btn-sm" style="border-color:var(--bd2)" onclick="toggleTechTranscriptPaste()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // AI Summary section — prefer enriched summary
  var aiHtml = '';
  var displaySummary = a.aiEnrichedSummary || a.aiSummary;
  if (displaySummary) {
    aiHtml = '<div class="ca-narrative" style="margin:var(--sp3) 0">' +
      '<div class="ca-narrative-label">AI Summary</div><p>' + _tnEnc(displaySummary) + '</p></div>';
  }
  if (a.beanzImpact) {
    aiHtml += '<div class="ca-narrative" style="margin:var(--sp3) 0;border-left-color:#8b5cf6;background:#8b5cf610">' +
      '<div class="ca-narrative-label" style="color:#8b5cf6">Tech Relevance</div><p>' + _tnEnc(a.beanzImpact) + '</p></div>';
  }

  // Sentiment + Category enrichment row
  var enrichRow = '';
  if (a.sentiment || a.category_classification) {
    enrichRow = '<div class="nw-detail-enrich">';
    if (a.sentiment) {
      var dSentChar = a.sentiment === 'positive' ? '&#9650;' : a.sentiment === 'negative' ? '&#9660;' : a.sentiment === 'mixed' ? '&#9670;' : '&#9679;';
      var dSentColor = a.sentiment === 'positive' ? 'var(--gn)' : a.sentiment === 'negative' ? 'var(--rd)' : a.sentiment === 'mixed' ? 'var(--or)' : 'var(--tx3)';
      var scoreLabel = a.sentiment_score != null ? ' (' + (a.sentiment_score > 0 ? '+' : '') + a.sentiment_score.toFixed(1) + ')' : '';
      enrichRow += '<span class="nw-detail-sent" style="color:' + dSentColor + '">' + dSentChar + ' ' + _tnEnc(a.sentiment) + scoreLabel + '</span>';
    }
    if (a.category_classification) {
      enrichRow += '<span class="nw-cat-badge" style="margin-left:var(--sp2)">' + _tnEnc(_tnCatLabel(a.category_classification)) + '</span>';
    }
    enrichRow += '</div>';
  }
  aiHtml += enrichRow;

  // AI Topics
  var topicsHtml = '';
  if (a.aiTopics && a.aiTopics.length) {
    topicsHtml = '<div style="margin:var(--sp2) 0">' + a.aiTopics.map(function(t){return '<span class="ca-topic-chip">' + _tnEnc(t) + '</span>';}).join(' ') + '</div>';
  } else if (a.tags && a.tags.length) {
    topicsHtml = '<div style="margin:var(--sp2) 0">' + a.tags.map(function(t){return '<span class="tag">' + _tnEnc(t) + '</span>';}).join(' ') + '</div>';
  }

  // Engagement
  var engHtml = '';
  if (a.engagement && a.engagement.redditScore) engHtml = '<div class="news-detail-eng">Reddit: &#9650;' + a.engagement.redditScore + ' &middot; ' + a.engagement.redditComments + ' comments</div>';
  if (a.engagement && a.engagement.youtubeViews) engHtml = '<div class="news-detail-eng">YouTube: &#9654;' + _tnFmt(a.engagement.youtubeViews) + ' views</div>';

  var html = '<div class="news-detail">' +
    (!a.videoId ? '<div class="news-detail-hero"><img src="' + imgSrc + '" alt="" onerror="this.style.display=\'none\'" /></div>' : '') +
    embedHtml +
    '<div class="news-detail-body">' +
      '<div class="news-detail-badges"><span class="news-source-badge news-badge-' + a.category + '">' + _tnEnc(a.category) + '</span><span class="news-detail-source">' + _tnEnc(a.sourceName || a.source) + '</span></div>' +
      '<a href="' + _tnEnc(a.url) + '" target="_blank" rel="noopener" class="news-detail-title">' + _tnEnc(a.title) + '</a>' +
      '<div class="news-detail-meta">' + _tnEnc(a.author || 'Unknown') + ' &middot; ' + new Date(a.publishedAt).toLocaleDateString() + ' &middot; ' + _tnTimeAgo(a.publishedAt) + '</div>' +
      aiHtml +
      '<div class="news-detail-summary">' + _tnEnc(a.summary || 'No summary available.') + '</div>' +
      '<div class="news-detail-relevance"><span class="news-rel-label">Relevance</span><div class="news-rel-track" style="height:6px"><div class="news-rel-fill" style="width:' + relPct + '%;height:100%;background:' + relColor + '"></div></div><span style="font-size:var(--f-sm);font-weight:var(--fw-sb)">' + relPct + '%</span></div>' +
      topicsHtml + engHtml + transcriptHtml +
      // Note section
      '<div class="nw-note-section"><label style="font-size:var(--f-xs);color:var(--tx3)">Personal Note</label>' +
        '<textarea class="nw-note-input" placeholder="Add a note..." onblur="saveTechNewsNote(\'' + a.id + '\',this.value)">' + _tnEnc(_getTechNewsNote(a.id)) + '</textarea></div>' +
      // Share + open
      '<div style="display:flex;gap:var(--sp2);margin-top:var(--sp3)">' +
        '<a href="' + _tnEnc(a.url) + '" target="_blank" rel="noopener" class="btn news-detail-open">Open Source &#8599;</a>' +
        '<button class="btn" onclick="shareTechNewsToSlack(\'' + a.id + '\')">Share to Slack</button>' +
      '</div>' +
      '<div class="cor-feedback news-detail-fb">' +
        '<button class="fb-btn fb-up" onclick="sendFeedback(\'tech-news\',\'' + a.id + '\',\'up\')">&#9650;</button>' +
        '<button class="fb-btn fb-down" onclick="sendFeedback(\'tech-news\',\'' + a.id + '\',\'down\')">&#9660;</button>' +
        '<button class="fb-btn fb-pin" onclick="sendFeedback(\'tech-news\',\'' + a.id + '\',\'pin\')">&#9733; Pin</button>' +
        '<button class="fb-btn fb-dismiss" onclick="sendFeedback(\'tech-news\',\'' + a.id + '\',\'dismiss\');closePanel()">&#10005; Dismiss</button>' +
      '</div>' +
    '</div></div>';

  openPanel(_tnEnc(a.title).slice(0, 60), html);
}

// ── Notes ────────────────────────────────────────────────────
var _techNewsNotesCache = {};
function _getTechNewsNote(id) { return _techNewsNotesCache[id] || ''; }
function saveTechNewsNote(id, text) {
  _techNewsNotesCache[id] = text;
  fetch('/api/tech-news/note/' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: text })
  }).catch(function(){});
}
// Load notes on init
fetch('/api/tech-news/notes').then(function(r){return r.json();}).then(function(d) {
  if (d.notes) _techNewsNotesCache = d.notes;
}).catch(function(){});

// ── Share to Slack ───────────────────────────────────────────
function shareTechNewsToSlack(id) {
  var a = (DATA.techNews && DATA.techNews.articles || []).find(function(x){return x.id===id;});
  if (!a) return;
  var text = '*' + a.title + '*\n' + a.url + (a.aiSummary ? '\n> ' + a.aiSummary : '');
  // Open the send modal pre-filled for Slack
  if (typeof openSendModal === 'function') {
    openSendModal({ platform: 'slack', body: text });
  } else if (typeof showToast === 'function') {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(a.title + '\n' + a.url).then(function() {
      showToast('Link copied to clipboard');
    });
  }
}

// ── YouTube Transcript ───────────────────────────────────────
async function loadTechTranscript(videoId) {
  var btn = document.getElementById('tn-transcript-btn');
  var content = document.getElementById('tn-transcript-content');
  var pasteToggle = document.getElementById('tn-transcript-paste-toggle');
  if (!btn || !content) return;
  btn.textContent = 'Loading...'; btn.disabled = true;
  content.style.display = 'block';
  content.innerHTML = '<div style="color:var(--tx3);padding:var(--sp3)">Fetching transcript...</div>';
  try {
    var resp = await fetch('/api/tech-news/transcript/' + videoId);
    var data = await resp.json();
    if (data.error || !data.segments || !data.segments.length) {
      // Show failure with manual paste prompt
      content.innerHTML = '<div class="news-transcript-empty">' +
        '<div style="margin-bottom:var(--sp2)">&#9888; ' + _tnEnc(data.error || 'No transcript available') + '</div>' +
        '<div style="font-size:var(--f-xs);color:var(--tx3)">Click <b>Paste</b> above to add a transcript manually from YouTube.</div>' +
      '</div>';
      btn.textContent = 'Retry'; btn.disabled = false;
      if (pasteToggle) pasteToggle.style.display = '';
      return;
    }
    _renderTechTranscriptContent(videoId, data, content);
    btn.textContent = 'Loaded';
    if (pasteToggle) pasteToggle.style.display = 'none';
  } catch (e) {
    content.innerHTML = '<div class="news-transcript-empty">&#10060; Failed: ' + _tnEnc(e.message) + '</div>';
    btn.textContent = 'Retry'; btn.disabled = false;
  }
}

function _renderTechTranscriptContent(videoId, data, container) {
  var durMins = Math.floor(data.duration / 60), durSecs = Math.floor(data.duration % 60);
  var sourceTag = data.source === 'manual' ? ' <span style="color:var(--or);font-size:10px">(pasted)</span>' : '';

  var tHtml = '<div class="news-transcript-header">' +
    '<span>&#128221; ' + data.segmentCount + ' segments &middot; ' + durMins + 'm ' + durSecs + 's' + sourceTag + '</span>' +
    '<div style="display:flex;gap:6px">' +
      '<button class="btn btn-sm" onclick="summarizeTechTranscript(\'' + videoId + '\')" id="tn-transcript-summarize-btn" title="AI Summary">&#10024; Summarize</button>' +
      '<button class="btn btn-sm" onclick="copyTechTranscriptText(\'' + videoId + '\')" title="Copy full text">&#128203; Copy</button>' +
    '</div></div>';

  // AI summary (if already generated)
  if (data.aiSummary) {
    tHtml += _renderTechTranscriptAiSummary(data.aiSummary);
  }

  tHtml += '<div class="news-transcript-summary"><strong>Preview:</strong> ' + _tnEnc(data.summary) + '</div>';

  // Search
  tHtml += '<div style="margin:var(--sp2) 0"><input class="filter-input" placeholder="Search transcript..." id="tn-transcript-search" oninput="_filterTechTranscriptChunks(this.value)" style="width:100%;font-size:var(--f-xs)"/></div>';

  tHtml += '<div class="news-transcript-segments" id="tn-transcript-segments">';
  var chunkStart = 0, chunkText = '';
  data.segments.forEach(function(seg, i) {
    if (i === 0) chunkStart = seg.start;
    chunkText += seg.text + ' ';
    var nextStart = (data.segments[i + 1] || {}).start || Infinity;
    if (nextStart - chunkStart >= 30 || i === data.segments.length - 1) {
      var ts = Math.floor(chunkStart / 60) + ':' + Math.floor(chunkStart % 60).toString().padStart(2, '0');
      tHtml += '<div class="news-transcript-chunk" data-text="' + _tnEnc(chunkText.trim().toLowerCase()) + '"><a href="https://www.youtube.com/watch?v=' + videoId + '&t=' + Math.floor(chunkStart) + '" target="_blank" rel="noopener" class="news-ts-link">' + ts + '</a><span class="news-ts-text">' + _tnEnc(chunkText.trim()) + '</span></div>';
      chunkText = ''; chunkStart = nextStart;
    }
  });
  tHtml += '</div>';
  container.innerHTML = tHtml;

  // Store text for copy
  container.dataset.fullText = data.text || '';
}

function _renderTechTranscriptAiSummary(ai) {
  var html = '<div class="ca-narrative" style="margin:var(--sp2) 0;border-left-color:#8b5cf6">';
  if (ai.headline) html += '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _tnEnc(ai.headline) + '</div>';
  if (ai.bullets && ai.bullets.length) {
    html += '<ul style="margin:4px 0;padding-left:16px">';
    ai.bullets.forEach(function(b) { html += '<li style="font-size:var(--f-sm);margin-bottom:2px">' + _tnEnc(b) + '</li>'; });
    html += '</ul>';
  }
  if (ai.beanz_relevance) html += '<div style="font-size:var(--f-xs);color:#8b5cf6;margin-top:4px"><b>Tech Relevance:</b> ' + _tnEnc(ai.beanz_relevance) + '</div>';
  if (ai.topics && ai.topics.length) {
    html += '<div style="margin-top:4px">';
    ai.topics.forEach(function(t) { html += '<span class="ca-topic-chip">' + _tnEnc(t) + '</span> '; });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function _filterTechTranscriptChunks(query) {
  var chunks = document.querySelectorAll('#tn-transcript-segments .news-transcript-chunk');
  var q = (query || '').toLowerCase();
  chunks.forEach(function(el) {
    if (!q || el.dataset.text.includes(q)) {
      el.style.display = '';
      if (q) {
        var span = el.querySelector('.news-ts-text');
        if (span) span.innerHTML = span.textContent.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
      }
    } else {
      el.style.display = 'none';
    }
  });
}

function toggleTechTranscriptPaste(videoId) {
  var area = document.getElementById('tn-transcript-paste-area');
  if (!area) return;
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

async function submitPastedTechTranscript(videoId) {
  var input = document.getElementById('tn-transcript-paste-input');
  var content = document.getElementById('tn-transcript-content');
  if (!input || !input.value.trim()) {
    if (typeof showToast === 'function') showToast('Please paste transcript text first');
    return;
  }
  try {
    var resp = await fetch('/api/tech-news/transcript/' + videoId + '/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.value })
    });
    var data = await resp.json();
    if (data.error) {
      if (typeof showToast === 'function') showToast('Error: ' + data.error);
      return;
    }
    // Hide paste area, show transcript
    var area = document.getElementById('tn-transcript-paste-area');
    if (area) area.style.display = 'none';
    content.style.display = 'block';
    _renderTechTranscriptContent(videoId, data, content);
    var btn = document.getElementById('tn-transcript-btn');
    if (btn) { btn.textContent = 'Loaded'; btn.disabled = true; }
    if (typeof showToast === 'function') showToast('Transcript saved (' + data.segmentCount + ' segments)');
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to save: ' + e.message);
  }
}

async function summarizeTechTranscript(videoId) {
  var btn = document.getElementById('tn-transcript-summarize-btn');
  if (!btn) return;
  btn.textContent = 'Summarizing...'; btn.disabled = true;
  try {
    var resp = await fetch('/api/tech-news/transcript/' + videoId + '/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    var data = await resp.json();
    if (data.error) {
      if (typeof showToast === 'function') showToast('Summarize failed: ' + data.error);
      btn.textContent = '&#10024; Summarize'; btn.disabled = false;
      return;
    }
    // Insert summary after the header
    var header = document.querySelector('.news-transcript-header');
    if (header) {
      var div = document.createElement('div');
      div.innerHTML = _renderTechTranscriptAiSummary(data);
      header.after(div.firstChild);
    }
    btn.textContent = '&#10004; Summarized'; btn.disabled = true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed: ' + e.message);
    btn.textContent = '&#10024; Summarize'; btn.disabled = false;
  }
}

function copyTechTranscriptText(videoId) {
  var content = document.getElementById('tn-transcript-content');
  var text = content ? content.dataset.fullText : '';
  if (!text) { if (typeof showToast === 'function') showToast('No text to copy'); return; }
  navigator.clipboard.writeText(text).then(function() {
    if (typeof showToast === 'function') showToast('Transcript copied to clipboard');
  }).catch(function() {
    if (typeof showToast === 'function') showToast('Copy failed');
  });
}

// ── Chat View ───────────────────────────────────────────────
function renderTechNewsChat() {
  var html = '<div class="ca-main" style="display:flex;flex-direction:column;height:100%;padding:0">';

  // Header
  html += '<div class="ca-header" style="padding:var(--sp3) var(--sp4);border-bottom:1px solid var(--bd);flex-shrink:0">' +
    '<h2 style="margin:0;display:flex;align-items:center;gap:var(--sp2)">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
      'Tech News Chat' +
    '</h2>' +
    '<button class="btn btn-sm" onclick="state.techNewsChatHistory=[];renderAll()" style="font-size:var(--f-xs)">Clear Chat</button>' +
  '</div>';

  // Messages area
  html += '<div class="nw-chat-messages" id="tn-chat-messages" style="flex:1;overflow-y:auto;padding:var(--sp4);display:flex;flex-direction:column;gap:var(--sp3)">';

  if (!state.techNewsChatHistory.length) {
    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--tx3);text-align:center;padding:var(--sp6)">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3;margin-bottom:var(--sp3)"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
      '<div style="font-size:var(--f-lg);margin-bottom:var(--sp2)">Ask anything about the tech news</div>' +
      '<div style="font-size:var(--f-sm);max-width:400px">Ask about AI breakthroughs, tech trends, startup news, developer tools, open-source projects, or anything from the feed.</div>' +
    '</div>';
  } else {
    state.techNewsChatHistory.forEach(function(msg) {
      if (msg.role === 'user') {
        html += '<div class="nw-chat-msg nw-chat-user">' +
          '<div class="nw-chat-bubble nw-chat-bubble-user">' + _tnEnc(msg.content) + '</div>' +
        '</div>';
      } else {
        html += '<div class="nw-chat-msg nw-chat-assistant">' +
          '<div class="nw-chat-bubble nw-chat-bubble-assistant">' + _tnChatFormatResponse(msg.content) + '</div>';
        if (msg.sources && msg.sources.length) {
          html += '<div class="nw-chat-sources">';
          msg.sources.forEach(function(s) {
            html += '<a href="' + _tnEnc(s.url || '#') + '" target="_blank" rel="noopener" class="nw-chat-source-link">' +
              _tnEnc(s.title || 'Source') +
              (s.date ? ' <span class="nw-chat-source-date">' + _tnTimeAgo(s.date) + '</span>' : '') +
            '</a>';
          });
          html += '</div>';
        }
        html += '</div>';
      }
    });
  }

  if (state.techNewsChatLoading) {
    html += '<div class="nw-chat-msg nw-chat-assistant">' +
      '<div class="nw-chat-bubble nw-chat-bubble-assistant" style="display:flex;align-items:center;gap:var(--sp2)">' +
        '<div class="ca-spinner" style="width:14px;height:14px;border-width:2px"></div>' +
        '<span style="color:var(--tx3)">Thinking...</span>' +
      '</div>' +
    '</div>';
  }

  html += '</div>';

  // Input bar
  html += '<div class="nw-chat-input-bar" style="flex-shrink:0;padding:var(--sp3) var(--sp4);border-top:1px solid var(--bd);background:var(--s1)">' +
    '<div style="display:flex;gap:var(--sp2);align-items:flex-end">' +
      '<textarea id="tn-chat-input" class="nw-chat-textarea" placeholder="Ask about AI breakthroughs, tech trends, startup news..." rows="1" ' +
        'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendTechNewsChat()}" ' +
        'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'"' +
      '></textarea>' +
      '<button class="nw-chat-send-btn" onclick="sendTechNewsChat()" id="tn-chat-send"' +
        (state.techNewsChatLoading ? ' disabled' : '') + '>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9"/></svg>' +
      '</button>' +
    '</div>' +
  '</div>';

  html += '</div>';
  return html;
}

function _tnChatFormatResponse(text) {
  if (!text) return '';
  // Convert markdown-like formatting to HTML
  var html = _tnEnc(text);
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Bullet points
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}

function _techNewsChatScrollToBottom() {
  setTimeout(function() {
    var el = document.getElementById('tn-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function sendTechNewsChat() {
  var input = document.getElementById('tn-chat-input');
  if (!input) return;
  var message = input.value.trim();
  if (!message || state.techNewsChatLoading) return;

  // Add user message to history
  state.techNewsChatHistory = state.techNewsChatHistory.concat([{ role: 'user', content: message }]);
  state.techNewsChatLoading = true;
  input.value = '';
  input.style.height = 'auto';
  renderTechNewsMain();

  // Build history for API (only role + content)
  var apiHistory = state.techNewsChatHistory.slice(0, -1).map(function(m) {
    return { role: m.role, content: m.content };
  });

  fetch('/api/tech-news/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, history: apiHistory })
  }).then(function(r) { return r.json(); }).then(function(data) {
    state.techNewsChatLoading = false;
    if (data.error) {
      state.techNewsChatHistory = state.techNewsChatHistory.concat([{
        role: 'assistant',
        content: 'Error: ' + data.error,
        sources: []
      }]);
    } else {
      state.techNewsChatHistory = state.techNewsChatHistory.concat([{
        role: 'assistant',
        content: data.response || 'No response received.',
        sources: data.sources || []
      }]);
    }
    renderTechNewsMain();
  }).catch(function(e) {
    state.techNewsChatLoading = false;
    state.techNewsChatHistory = state.techNewsChatHistory.concat([{
      role: 'assistant',
      content: 'Failed to connect: ' + e.message,
      sources: []
    }]);
    renderTechNewsMain();
  });
}

// ── UI Helpers ───────────────────────────────────────────────
function _tnSortPicker() {
  var s = state.techNewsSort || 'date';
  return '<div class="ca-date-picker">' +
    '<button class="ca-day-btn' + (s === 'date' ? ' active' : '') + '" onclick="state.techNewsSort=\'date\';state.techNewsPage=1;renderTechNewsMain()">Latest</button>' +
    '<button class="ca-day-btn' + (s === 'relevance' ? ' active' : '') + '" onclick="state.techNewsSort=\'relevance\';state.techNewsPage=1;renderTechNewsMain()">Relevant</button>' +
    '<button class="ca-day-btn' + (s === 'engagement' ? ' active' : '') + '" onclick="state.techNewsSort=\'engagement\';state.techNewsPage=1;renderTechNewsMain()">Popular</button>' +
    '</div>';
}

function _tnViewToggle() {
  var m = state.techNewsViewMode || 'cards';
  return '<div class="ca-date-picker">' +
    '<button class="ca-day-btn' + (m === 'cards' ? ' active' : '') + '" onclick="state.techNewsViewMode=\'cards\';renderTechNewsMain()" title="Cards">&#9638;</button>' +
    '<button class="ca-day-btn' + (m === 'compact' ? ' active' : '') + '" onclick="state.techNewsViewMode=\'compact\';renderTechNewsMain()" title="Compact">&#9776;</button>' +
    '<button class="ca-day-btn' + (m === 'headlines' ? ' active' : '') + '" onclick="state.techNewsViewMode=\'headlines\';renderTechNewsMain()" title="Headlines">&#9472;</button>' +
    '</div>';
}

function _tnDateFilter() {
  var r = state.techNewsDateRange || 'all';
  return '<div class="ca-date-picker" style="margin-left:4px">' +
    ['all','today','week','month'].map(function(d) {
      var label = d === 'all' ? 'All' : d === 'today' ? '24h' : d === 'week' ? '7d' : '30d';
      return '<button class="ca-day-btn' + (r === d ? ' active' : '') + '" onclick="state.techNewsDateRange=\'' + d + '\';state.techNewsPage=1;renderTechNewsMain()">' + label + '</button>';
    }).join('') +
    '</div>';
}

function _tnStatChip(val, label) {
  return '<div class="stat-chip"><span class="stat-n">' + val + '</span><span class="stat-l">' + label + '</span></div>';
}

function _tnPlaceholder(cat) {
  var icons = { industry: '%F0%9F%92%BB', reddit: '%F0%9F%97%A8', youtube: '%E2%96%B6', competitors: '%F0%9F%8E%AF' };
  var icon = icons[cat] || '%F0%9F%93%B0';
  var colors = { industry: ['%23ede9fe','%238b5cf6'], reddit: ['%23fff3e0','%23ff6b00'], youtube: ['%23fce4ec','%23dc2626'], competitors: ['%23f3e5f5','%239333ea'] };
  var c = colors[cat] || ['%23f5f5f5','%23888'];
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='" + c[0] + "'/><text x='50%25' y='50%25' text-anchor='middle' dominant-baseline='central' font-size='48'>" + icon + "</text></svg>";
}

// ===============================================================
// TECH NEWS SETTINGS — Manage Sources
// ===============================================================

var _techNewsSourcesCache = null;

function _loadTechNewsSources(cb) {
  fetch('/api/tech-news/sources').then(function(r){return r.json();}).then(function(d) {
    _techNewsSourcesCache = d.sources || {};
    if (cb) cb();
  }).catch(function(){});
}

function renderTechNewsSettings() {
  if (!_techNewsSourcesCache) {
    _loadTechNewsSources(function() { renderTechNewsMain(); });
    return '<div class="ca-main"><div class="ca-loading"><div class="ca-spinner"></div><p>Loading source settings...</p></div></div>';
  }

  var src = _techNewsSourcesCache;
  var html = '<div class="ca-main">';
  html += '<div class="ca-header"><h2>Manage Tech News Sources</h2>' +
    '<button class="btn btn-sm" onclick="state.techNewsCategory=\'all\';renderAll()">&#8592; Back to Feed</button></div>';

  // ── Reddit Subreddits ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--or)">Reddit Subreddits</div>';
  html += '<div class="nw-src-list">';
  if (src.reddit) {
    Object.keys(src.reddit).forEach(function(key) {
      var s = src.reddit[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">r/' + _tnEnc(s.subreddit) + '</span>' +
        '<span class="nw-src-key">' + _tnEnc(key) + '</span>' +
        '<button class="nw-src-remove" onclick="removeTechNewsSource(\'reddit\',\'' + _tnEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="tn-add-reddit" class="nw-src-input" placeholder="Enter subreddit name (e.g. MachineLearning)" />' +
    '<button class="btn btn-sm" onclick="addTechNewsRedditSource()">Add Subreddit</button>' +
  '</div></div>';

  // ── YouTube Channels ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--rd)">YouTube Channels</div>';
  html += '<div class="nw-src-list">';
  if (src.youtube) {
    Object.keys(src.youtube).forEach(function(key) {
      var s = src.youtube[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">' + _tnEnc(s.name) + '</span>' +
        '<span class="nw-src-key">' + _tnEnc(s.channelId || '') + '</span>' +
        '<button class="nw-src-remove" onclick="removeTechNewsSource(\'youtube\',\'' + _tnEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="tn-add-yt-name" class="nw-src-input" placeholder="Channel name (e.g. Fireship)" style="flex:1" />' +
    '<input id="tn-add-yt-id" class="nw-src-input" placeholder="@handle, URL, or channel ID" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addTechNewsYouTubeSource()">Add Channel</button>' +
  '</div>' +
  '<div style="font-size:10px;color:var(--tx3);margin-top:4px">Enter a @handle (e.g. @Fireship), channel URL, or UC... channel ID. The handle will be auto-resolved.</div>' +
  '</div>';

  // ── Podcasts (YouTube-based) ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--gn)">Podcasts <span style="font-size:10px;font-weight:400;color:var(--tx3)">(via YouTube)</span></div>';
  html += '<div class="nw-src-list">';
  if (src.podcasts) {
    Object.keys(src.podcasts).forEach(function(key) {
      var s = src.podcasts[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">' + _tnEnc(s.name) + '</span>' +
        '<span class="nw-src-key">' + _tnEnc(s.channelId || '') + '</span>' +
        '<button class="nw-src-remove" onclick="removeTechNewsSource(\'podcasts\',\'' + _tnEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  if (!src.podcasts || !Object.keys(src.podcasts).length) {
    html += '<div style="font-size:var(--f-xs);color:var(--tx3);padding:8px 0">No podcasts configured. Add a podcast YouTube channel below.</div>';
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="tn-add-pod-name" class="nw-src-input" placeholder="Podcast name (e.g. Latent Space)" style="flex:1" />' +
    '<input id="tn-add-pod-id" class="nw-src-input" placeholder="@handle, URL, or channel ID" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addTechNewsPodcastSource()">Add Podcast</button>' +
  '</div>' +
  '<div style="font-size:10px;color:var(--tx3);margin-top:4px">Add the YouTube channel of any podcast. Episodes will be transcribed from YouTube captions. If captions are unavailable you will be notified.</div>' +
  '</div>';

  // ── RSS Websites ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--ac)">RSS Websites</div>';
  html += '<div class="nw-src-list">';
  if (src.rss) {
    Object.keys(src.rss).forEach(function(key) {
      var s = src.rss[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">' + _tnEnc(s.name) + '</span>' +
        '<span class="nw-src-key" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + _tnEnc(s.url) + '</span>' +
        '<button class="nw-src-remove" onclick="removeTechNewsSource(\'rss\',\'' + _tnEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="tn-add-rss-name" class="nw-src-input" placeholder="Site name" style="flex:0.5" />' +
    '<input id="tn-add-rss-url" class="nw-src-input" placeholder="RSS feed URL (e.g. https://example.com/feed/)" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addTechNewsRSSSource()">Add Website</button>' +
  '</div></div>';

  // ── Actions ──
  html += '<div class="ca-section" style="display:flex;gap:var(--sp3);flex-wrap:wrap">' +
    '<button class="btn" onclick="refreshTechNews();if(typeof showToast===\'function\')showToast(\'Refreshing with updated sources...\')">Refresh Now with New Sources</button>' +
    '<button class="btn" style="color:var(--tx3)" onclick="resetTechNewsSourcesDefaults()">Reset to Defaults</button>' +
  '</div>';

  html += '</div>';
  return html;
}

function addTechNewsRedditSource() {
  var input = document.getElementById('tn-add-reddit');
  if (!input || !input.value.trim()) return;
  var sub = input.value.trim().replace(/^r\//, '');
  fetch('/api/tech-news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'reddit', subreddit: sub, name: sub })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added r/' + sub + ' — refreshing feeds...');
      renderAll();
      _reloadTechNewsAfterSourceChange();
    }
  }).catch(function(){});
}

function addTechNewsYouTubeSource() {
  var nameEl = document.getElementById('tn-add-yt-name');
  var idEl = document.getElementById('tn-add-yt-id');
  if (!nameEl || !idEl || !nameEl.value.trim() || !idEl.value.trim()) return;
  var name = nameEl.value.trim();
  var channelId = idEl.value.trim();
  fetch('/api/tech-news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'youtube', name: name, channelId: channelId })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added YouTube: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadTechNewsAfterSourceChange();
    }
  }).catch(function(){});
}

function addTechNewsPodcastSource() {
  var nameEl = document.getElementById('tn-add-pod-name');
  var idEl = document.getElementById('tn-add-pod-id');
  if (!nameEl || !idEl || !nameEl.value.trim() || !idEl.value.trim()) return;
  var name = nameEl.value.trim();
  var channelId = idEl.value.trim();
  fetch('/api/tech-news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'podcast', name: name, channelId: channelId })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added podcast: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadTechNewsAfterSourceChange();
    } else if (d.error) {
      if (typeof showToast === 'function') showToast(d.error, 'error');
    }
  }).catch(function(){});
}

function addTechNewsRSSSource() {
  var nameEl = document.getElementById('tn-add-rss-name');
  var urlEl = document.getElementById('tn-add-rss-url');
  if (!nameEl || !urlEl || !nameEl.value.trim() || !urlEl.value.trim()) return;
  var name = nameEl.value.trim();
  var url = urlEl.value.trim();
  fetch('/api/tech-news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rss', name: name, url: url })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added RSS: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadTechNewsAfterSourceChange();
    }
  }).catch(function(){});
}

/** Reload tech news data after a source change — polls until refresh completes */
function _reloadTechNewsAfterSourceChange() {
  // Give the server a few seconds to fetch from the new source, then reload
  setTimeout(function() {
    DATA.techNews = null;
    loadTechNewsData();
    if (typeof showToast === 'function') showToast('Feed updated with new sources');
  }, 4000);
}

function removeTechNewsSource(type, key) {
  fetch('/api/tech-news/sources/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type, key: key })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Removed ' + key);
      renderAll();
    }
  }).catch(function(){});
}

function resetTechNewsSourcesDefaults() {
  fetch('/api/tech-news/sources', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rss: {
        techcrunch: { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
        theverge: { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' },
        arstechnica: { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
        hackernews: { url: 'https://hnrss.org/frontpage', name: 'Hacker News' },
        mittech: { url: 'https://www.technologyreview.com/feed/', name: 'MIT Technology Review' }
      },
      reddit: {
        technology: { subreddit: 'technology', name: 'r/technology' },
        machinelearning: { subreddit: 'MachineLearning', name: 'r/MachineLearning' },
        artificial: { subreddit: 'artificial', name: 'r/artificial' }
      },
      youtube: {
        fireship: { channelId: 'UCsBjURrPoezykLs9EqgamOA', name: 'Fireship' },
        twominutepapers: { channelId: 'UCbfYPyITQ-7l4upoX8nvctg', name: 'Two Minute Papers' },
        yannickilcher: { channelId: 'UCZHmQk67mSJgfCCTn7xBfew', name: 'Yannic Kilcher' }
      }
    })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _techNewsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Sources reset to defaults');
      renderAll();
    }
  }).catch(function(){});
}

// ===============================================================
// RESEARCH — Deep AI & Productivity Analysis
// ===============================================================

if (!state.techNewsResearch) state.techNewsResearch = null;
if (!state.techNewsResearchStatus) state.techNewsResearchStatus = null;
if (!state.techNewsResearchPeriod) state.techNewsResearchPeriod = 'daily';

function loadTechNewsResearch(force) {
  var period = state.techNewsResearchPeriod || 'daily';
  if (force) {
    // Fire-and-forget: start generation, then poll
    state.techNewsResearch = { loading: true };
    renderAll();
    fetch('/api/tech-news/research/generate?period=' + period, { method: 'POST' }).then(function(r){return r.json();}).then(function(d) {
      if (d.ok) {
        if (typeof showToast === 'function') showToast('Research report generating with Opus... polling for results');
        _pollResearchStatus();
      } else if (d.error) {
        state.techNewsResearch = { error: d.error };
        renderAll();
      }
    }).catch(function(e) { state.techNewsResearch = { error: e.message }; renderAll(); });
  } else {
    // Try to fetch existing report
    state.techNewsResearch = { loading: true };
    renderAll();
    fetch('/api/tech-news/research?period=' + period).then(function(r){return r.json();}).then(function(d) {
      if (d.generating) {
        // Generation in progress from before — start polling
        state.techNewsResearch = { loading: true };
        _pollResearchStatus();
      } else if (d.report) {
        state.techNewsResearch = d;
      } else if (d.error) {
        state.techNewsResearch = { error: d.error };
      } else {
        state.techNewsResearch = null; // No report yet — show actions
      }
      renderAll();
    }).catch(function(e) { state.techNewsResearch = { error: e.message }; renderAll(); });
  }
}

function _pollResearchStatus() {
  var poll = setInterval(function() {
    fetch('/api/tech-news/research/status').then(function(r){return r.json();}).then(function(d) {
      state.techNewsResearchStatus = d;
      if (!d.generating) {
        clearInterval(poll);
        // Notify about podcast transcript failures
        if (d.podcastFailures && d.podcastFailures.length > 0 && typeof showToast === 'function') {
          showToast(d.podcastFailures.length + ' podcast episode(s) could not be transcribed — YouTube captions unavailable', 'warning');
        }
        // Generation done — fetch the report
        fetch('/api/tech-news/research').then(function(r){return r.json();}).then(function(d2) {
          if (d2.report) {
            state.techNewsResearch = d2;
            if (typeof showToast === 'function') showToast('Research report ready!');
          } else if (d.generateError) {
            state.techNewsResearch = { error: d.generateError };
          }
          renderAll();
        });
      } else {
        renderAll();
      }
    }).catch(function() { clearInterval(poll); });
  }, 5000);
}

// ── Email functions ──
function emailTechResearch() {
  if (typeof showToast === 'function') showToast('Sending research report via email...');
  fetch('/api/tech-news/research/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok) {
        if (typeof showToast === 'function') showToast('Report emailed to ' + (d.recipients || []).join(', '));
      } else {
        if (typeof showToast === 'function') showToast('Email failed: ' + (d.error || 'unknown'), 'er');
      }
    }).catch(function(e) { if (typeof showToast === 'function') showToast('Email failed: ' + e.message, 'er'); });
}

function saveResearchRecipients() {
  var input = document.getElementById('research-email-input');
  var status = document.getElementById('research-email-status');
  if (!input) return;
  var recipients = input.value.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e && e.includes('@'); });
  fetch('/api/tech-news/research/email/recipients', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: recipients })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      state._researchRecipients = recipients;
      if (status) status.textContent = 'Saved ' + recipients.length + ' recipients. Daily emails will be sent after each report generation.';
      if (status) status.style.color = 'var(--gn)';
    }
  }).catch(function() {});
}

// Load recipients on init
fetch('/api/tech-news/research/email/recipients').then(function(r) { return r.json(); }).then(function(d) {
  state._researchRecipients = d.recipients || [];
}).catch(function() {});

function transcribeAllTechNews() {
  if (typeof showToast === 'function') showToast('Starting bulk transcription...');
  fetch('/api/tech-news/research/transcribe-all', { method: 'POST' }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      if (typeof showToast === 'function') showToast('Transcribing ' + d.total + ' videos...');
      _pollTranscriptionStatus();
    }
  }).catch(function(){});
}

function _pollTranscriptionStatus() {
  var poll = setInterval(function() {
    fetch('/api/tech-news/research/status').then(function(r){return r.json();}).then(function(d) {
      state.techNewsResearchStatus = d;
      if (!d.transcribing) {
        clearInterval(poll);
        if (d.podcastFailures && d.podcastFailures.length > 0 && typeof showToast === 'function') {
          showToast(d.podcastFailures.length + ' podcast episode(s) could not be transcribed — YouTube captions unavailable', 'warning');
        }
        if (typeof showToast === 'function') showToast('Transcription complete!');
      }
      renderAll();
    }).catch(function() { clearInterval(poll); });
  }, 3000);
}

function renderTechNewsResearch() {
  var r = state.techNewsResearch;
  var status = state.techNewsResearchStatus;

  // Loading state
  if (r && r.loading) {
    var elapsed = '';
    if (status && status.generating && status.generateStarted) {
      elapsed = ' (' + Math.round((Date.now() - status.generateStarted) / 1000) + 's elapsed)';
    }
    return '<div class="ca-main"><div class="ca-header"><h2>AI & Productivity Research</h2></div>' +
      '<div class="ca-loading"><div class="ca-spinner"></div><p>Generating deep research report with Opus...' + elapsed + '</p>' +
      '<p style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp2)">This typically takes 3-5 minutes for large context. Polling every 5 seconds.</p></div></div>';
  }

  // No report yet — show actions
  if (!r || r.error || !r.report) {
    var html = '<div class="ca-main" style="max-width:900px">';
    var _rPeriod = state.techNewsResearchPeriod || 'daily';
    html += '<div class="ca-header"><h2>AI & Productivity Research</h2>' +
      '<div style="display:flex;gap:var(--sp2)">' +
        '<button class="ca-day-btn' + (_rPeriod === 'daily' ? ' active' : '') + '" onclick="state.techNewsResearchPeriod=\'daily\';state.techNewsResearch=null;loadTechNewsResearch()">Daily</button>' +
        '<button class="ca-day-btn' + (_rPeriod === 'weekly' ? ' active' : '') + '" onclick="state.techNewsResearchPeriod=\'weekly\';state.techNewsResearch=null;loadTechNewsResearch()">Weekly</button>' +
      '</div></div>';

    // Transcription status
    if (status && status.transcribing) {
      var pct = status.transcribeTotal > 0 ? Math.round((status.transcribeDone / status.transcribeTotal) * 100) : 0;
      html += '<div style="padding:var(--sp4);background:var(--s2);border:1px solid var(--bd);border-radius:10px;margin-bottom:var(--sp4)">' +
        '<div style="font-weight:var(--fw-sb);margin-bottom:var(--sp2)">Transcribing Videos...</div>' +
        '<div style="background:var(--s3);border-radius:4px;height:8px;overflow:hidden;margin-bottom:var(--sp2)"><div style="background:var(--ac);height:100%;width:' + pct + '%;transition:width 0.3s"></div></div>' +
        '<div style="font-size:var(--f-xs);color:var(--tx3)">' + status.transcribeDone + ' / ' + status.transcribeTotal + ' (' + status.transcribeSkipped + ' cached, ' + status.transcribeFailed + ' failed)</div>' +
        (status.transcribeCurrent ? '<div style="font-size:var(--f-xs);color:var(--tx2);margin-top:4px">Current: ' + _tnEnc(status.transcribeCurrent) + '</div>' : '') +
      '</div>';
    }

    html += '<div style="padding:var(--sp5);background:var(--s1);border:1px solid var(--bd);border-radius:12px;text-align:center">' +
      '<div style="font-size:var(--f-2xl);margin-bottom:var(--sp3)">Deep AI Research Brief</div>' +
      '<div style="font-size:var(--f-sm);color:var(--tx2);max-width:500px;margin:0 auto var(--sp4);line-height:1.7">Transcribes all YouTube videos, analyzes every article and Reddit thread, then produces an extensive research report with trends, quotes, tool analysis, and predictions.</div>' +
      (r && r.error ? '<div style="color:var(--rd);font-size:var(--f-sm);margin-bottom:var(--sp3)">' + _tnEnc(r.error) + '</div>' : '') +
      '<div style="display:flex;gap:var(--sp3);justify-content:center;flex-wrap:wrap">' +
        '<button class="btn" style="background:var(--gn);color:#000;padding:10px 24px;font-size:var(--f-md)" onclick="loadTechNewsResearch(true)">Generate Research Report</button>' +
      '</div>' +
      '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp3)">Videos are auto-transcribed in the background on every feed refresh.</div>' +
    '</div>';
    html += '</div>';
    return html;
  }

  // ── Render full report ──
  var rpt = r.report;
  var html = '<div class="ca-main" style="max-width:900px">';

  // Header
  html += '<div style="margin-bottom:var(--sp5)">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--sp3)">' +
      '<div>' +
        '<h1 style="font-size:var(--f-3xl);font-weight:var(--fw-b);line-height:1.2;color:var(--tx);margin-bottom:6px">' + _tnEnc(rpt.title || 'AI Research Brief') + '</h1>' +
        (rpt.subtitle ? '<div style="font-size:var(--f-md);color:var(--ac);font-weight:var(--fw-sb)">' + _tnEnc(rpt.subtitle) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:var(--sp2);align-items:center">' +
        '<button class="ca-day-btn' + ((state.techNewsResearchPeriod||'daily') === 'daily' ? ' active' : '') + '" onclick="state.techNewsResearchPeriod=\'daily\';state.techNewsResearch=null;loadTechNewsResearch()">Daily</button>' +
        '<button class="ca-day-btn' + ((state.techNewsResearchPeriod||'daily') === 'weekly' ? ' active' : '') + '" onclick="state.techNewsResearchPeriod=\'weekly\';state.techNewsResearch=null;loadTechNewsResearch()">Weekly</button>' +
        '<button class="btn btn-sm" style="margin-left:var(--sp2)" onclick="loadTechNewsResearch(true)">Regenerate</button>' +
        '<button class="btn btn-sm" style="margin-left:var(--sp2);background:var(--ac);color:#fff;border:none" onclick="emailTechResearch()">Email Report</button>' +
      '</div>' +
    '</div>';
  if (rpt.meta) {
    html += '<div style="display:flex;gap:var(--sp4);font-size:var(--f-xs);color:var(--tx3)">' +
      '<span>' + (rpt.meta.videos_analyzed || 0) + ' videos</span>' +
      '<span>' + (rpt.meta.articles_analyzed || 0) + ' articles</span>' +
      '<span>' + (rpt.meta.reddit_threads || 0) + ' reddit threads</span>' +
      (rpt.meta.total_transcript_minutes ? '<span>' + rpt.meta.total_transcript_minutes + ' min transcripts</span>' : '') +
    '</div>';
  }
  html += '</div>';

  // Executive Summary
  if (rpt.executive_summary) {
    html += '<div style="font-size:var(--f-md);line-height:1.8;color:var(--tx2);margin-bottom:var(--sp6);padding:var(--sp5);background:var(--s2);border-radius:12px;border-left:4px solid var(--ac)">' +
      _tnEnc(rpt.executive_summary).replace(/\n\n/g, '</p><p style="margin-top:var(--sp3)">') +
    '</div>';
  }

  // ── TRENDS ──
  if (rpt.trends && rpt.trends.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin-bottom:var(--sp4)">Trends & Signals</div>';
    rpt.trends.forEach(function(t) {
      var confColor = t.confidence === 'high' ? 'var(--gn)' : t.confidence === 'emerging' ? 'var(--or)' : 'var(--ac)';
      html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px;border-left:4px solid ' + confColor + '">';
      html += '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp2)">' +
        '<span style="font-size:var(--f-lg);font-weight:var(--fw-b);color:var(--tx)">' + _tnEnc(t.trend) + '</span>' +
        '<span style="font-size:9px;padding:2px 8px;border-radius:8px;background:' + confColor + '18;color:' + confColor + ';font-weight:var(--fw-sb)">' + _tnEnc(t.confidence || '') + '</span>' +
        (t.category ? '<span style="font-size:9px;padding:2px 8px;border-radius:8px;background:var(--s3);color:var(--tx3)">' + _tnEnc(t.category) + '</span>' : '') +
      '</div>';
      html += '<div style="font-size:var(--f-md);line-height:1.7;color:var(--tx2);margin-bottom:var(--sp3)">' + _tnEnc(t.analysis || '') + '</div>';
      if (t.evidence && t.evidence.length) {
        t.evidence.forEach(function(e) {
          var link = e.url || (e.videoId ? 'https://www.youtube.com/watch?v=' + e.videoId + (e.timestamp ? '&t=' + e.timestamp : '') : '#');
          var isVideo = e.videoId || (link && link.includes('youtube'));
          var isReddit = link && link.includes('reddit');
          var linkLabel = isVideo ? '&#9654; Watch' : isReddit ? '&#9651; View Thread' : '&#8599; Read Article';
          var linkColor = isVideo ? 'var(--rd)' : isReddit ? 'var(--or)' : 'var(--ac)';
          var tsLabel = e.timestamp ? ' at ' + Math.floor(e.timestamp/60) + ':' + ('0'+Math.floor(e.timestamp%60)).slice(-2) : '';
          var thumb = e.videoId ? 'https://img.youtube.com/vi/' + e.videoId + '/mqdefault.jpg' : null;
          html += '<div style="margin:var(--sp2) 0;padding:var(--sp3);border-left:3px solid var(--ac);background:var(--s2);border-radius:0 8px 8px 0">';
          if (thumb) {
            html += '<a href="' + _tnEnc(link) + '" target="_blank" rel="noopener" style="display:block;margin-bottom:8px;border-radius:6px;overflow:hidden;position:relative">' +
              '<img src="' + thumb + '" alt="" style="width:100%;display:block;border-radius:6px" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
              '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:14px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px"></div></div>' +
            '</a>';
          }
          html += '<div style="font-style:italic;font-size:var(--f-sm);line-height:1.6;color:var(--tx)">"' + _tnEnc(e.quote || '') + '"</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">' +
              '<span style="font-size:var(--f-xs);color:var(--tx3)">— ' + _tnEnc(e.source || 'Source') + tsLabel + '</span>' +
              '<a href="' + _tnEnc(link) + '" target="_blank" rel="noopener" style="font-size:var(--f-xs);font-weight:var(--fw-sb);color:' + linkColor + ';text-decoration:none;padding:2px 8px;border:1px solid ' + linkColor + ';border-radius:4px;white-space:nowrap">' + linkLabel + '</a>' +
            '</div></div>';
        });
      }
      if (t.implications) {
        html += '<div style="font-size:var(--f-sm);color:var(--gn);margin-top:var(--sp2)"><strong>Implications:</strong> ' + _tnEnc(t.implications) + '</div>';
      }
      if (t.tools_mentioned && t.tools_mentioned.length) {
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:var(--sp2)">' +
          t.tools_mentioned.map(function(tm) { return '<span style="font-size:9px;padding:2px 8px;border-radius:6px;background:var(--acbg);color:var(--ac);font-weight:var(--fw-sb)">' + _tnEnc(tm) + '</span>'; }).join('') +
        '</div>';
      }
      html += '</div>';
    });
  }

  // ── DEEP DIVES ──
  if (rpt.deep_dives && rpt.deep_dives.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Deep Dives</div>';
    rpt.deep_dives.forEach(function(dd) {
      html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">';
      html += '<h3 style="font-size:var(--f-lg);font-weight:var(--fw-b);color:var(--ac);margin-bottom:var(--sp3)">' + _tnEnc(dd.title) + '</h3>';
      html += '<div style="font-size:var(--f-md);line-height:1.8;color:var(--tx2);margin-bottom:var(--sp3)">' + _tnEnc(dd.synthesis || '') + '</div>';
      if (dd.key_quotes && dd.key_quotes.length) {
        dd.key_quotes.forEach(function(q) {
          var link = q.url || (q.videoId ? 'https://www.youtube.com/watch?v=' + q.videoId + (q.timestamp ? '&t=' + q.timestamp : '') : '#');
          var isVideo = q.videoId || (link && link.includes('youtube'));
          var isReddit = link && link.includes('reddit');
          var linkLabel = isVideo ? '&#9654; Watch' : isReddit ? '&#9651; View Thread' : '&#8599; Read';
          var linkColor = isVideo ? 'var(--rd)' : isReddit ? 'var(--or)' : 'var(--pu)';
          var tsLabel = q.timestamp ? ' at ' + Math.floor(q.timestamp/60) + ':' + ('0'+Math.floor(q.timestamp%60)).slice(-2) : '';
          html += '<div style="margin:var(--sp2) 0;padding:var(--sp3);border-left:3px solid var(--pu);background:var(--s2);border-radius:0 8px 8px 0">' +
            '<div style="font-style:italic;font-size:var(--f-sm);line-height:1.6;color:var(--tx)">"' + _tnEnc(q.quote || '') + '"</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">' +
              '<span style="font-size:var(--f-xs);color:var(--tx3)">— ' + _tnEnc(q.speaker || 'Source') + tsLabel + '</span>' +
              '<a href="' + _tnEnc(link) + '" target="_blank" rel="noopener" style="font-size:var(--f-xs);font-weight:var(--fw-sb);color:' + linkColor + ';text-decoration:none;padding:2px 8px;border:1px solid ' + linkColor + ';border-radius:4px;white-space:nowrap">' + linkLabel + '</a>' +
            '</div></div>';
        });
      }
      if (dd.takeaway) {
        html += '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--or);margin-top:var(--sp3);padding:var(--sp3);background:var(--orbg);border-radius:8px">Takeaway: ' + _tnEnc(dd.takeaway) + '</div>';
      }
      html += '</div>';
    });
  }

  // ── TOOLS & PRODUCTS ──
  if (rpt.tools_and_products && rpt.tools_and_products.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Tools & Products Radar</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp3)">';
    rpt.tools_and_products.forEach(function(tool) {
      var sentColor = tool.sentiment === 'positive' ? 'var(--gn)' : tool.sentiment === 'negative' ? 'var(--rd)' : tool.sentiment === 'mixed' ? 'var(--or)' : 'var(--tx3)';
      html += '<div style="padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px;border-top:3px solid ' + sentColor + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp2)">' +
          '<span style="font-weight:var(--fw-b);font-size:var(--f-md)">' + _tnEnc(tool.name) + '</span>' +
          '<span style="font-size:9px;padding:2px 6px;border-radius:6px;background:' + sentColor + '18;color:' + sentColor + '">' + _tnEnc(tool.sentiment || '') + '</span>' +
        '</div>' +
        (tool.category ? '<div style="font-size:9px;color:var(--tx3);margin-bottom:var(--sp2)">' + _tnEnc(tool.category) + (tool.mentions ? ' &middot; ' + tool.mentions + ' mentions' : '') + '</div>' : '') +
        '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _tnEnc(tool.what_people_say || '') + '</div>';
      if (tool.best_quote && tool.best_quote.quote) {
        var tqLink = tool.best_quote.url || '#';
        html += '<div style="margin-top:var(--sp2);font-style:italic;font-size:var(--f-xs);color:var(--tx3);border-left:2px solid var(--bd);padding-left:8px">"' + _tnEnc(tool.best_quote.quote) + '"' +
          (tool.best_quote.source ? ' — <a href="' + _tnEnc(tqLink) + '" target="_blank" rel="noopener" style="color:var(--ac)">' + _tnEnc(tool.best_quote.source) + ' &#8599;</a>' : '') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // ── PREDICTIONS & DEBATES ──
  if (rpt.predictions_and_debates && rpt.predictions_and_debates.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Predictions & Debates</div>';
    rpt.predictions_and_debates.forEach(function(debate) {
      html += '<div style="margin-bottom:var(--sp4);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">' +
        '<h3 style="font-size:var(--f-md);font-weight:var(--fw-b);color:var(--yl);margin-bottom:var(--sp3)">' + _tnEnc(debate.topic) + '</h3>';
      if (debate.positions && debate.positions.length) {
        debate.positions.forEach(function(pos, pi) {
          var posColor = pi === 0 ? 'var(--gn)' : pi === 1 ? 'var(--rd)' : 'var(--tx3)';
          html += '<div style="margin-bottom:var(--sp2);padding:var(--sp3);border-left:3px solid ' + posColor + ';background:var(--s2);border-radius:0 8px 8px 0">' +
            '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:' + posColor + ';margin-bottom:4px">' + _tnEnc(pos.position || '') + '</div>' +
            (pos.quote ? '<div style="font-style:italic;font-size:var(--f-xs);color:var(--tx2)">"' + _tnEnc(pos.quote) + '"</div>' : '') +
            '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:4px">— ' + _tnEnc(pos.advocate || 'Unknown') + '</div></div>';
        });
      }
      html += '</div>';
    });
  }

  // ── REDDIT INTELLIGENCE ──
  if (rpt.reddit_intelligence) {
    var ri = rpt.reddit_intelligence;
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4);color:var(--or)">Reddit Intelligence</div>';
    if (ri.community_sentiment) {
      html += '<div style="font-size:var(--f-md);line-height:1.7;color:var(--tx2);margin-bottom:var(--sp4);padding:var(--sp4);background:var(--s2);border-radius:12px;border-left:4px solid var(--or)">' + _tnEnc(ri.community_sentiment) + '</div>';
    }
    if (ri.hot_debates && ri.hot_debates.length) {
      html += '<div style="margin-bottom:var(--sp3);font-weight:var(--fw-sb);color:var(--tx)">Hot Debates</div>';
      ri.hot_debates.forEach(function(hd) {
        html += '<div style="margin-bottom:var(--sp2);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:8px">' +
          '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:4px">' +
            '<span style="font-size:var(--f-xs);color:var(--or);font-weight:var(--fw-sb)">' + _tnEnc(hd.subreddit || '') + '</span>' +
            (hd.upvotes ? '<span style="font-size:var(--f-xs);color:var(--tx3)">&#9650; ' + hd.upvotes + '</span>' : '') +
          '</div>' +
          '<a href="' + _tnEnc(hd.url || '#') + '" target="_blank" rel="noopener" style="font-weight:var(--fw-sb);color:var(--tx)">' + _tnEnc(hd.title || '') + '</a>' +
          (hd.key_insight ? '<div style="font-size:var(--f-sm);color:var(--tx2);margin-top:4px">' + _tnEnc(hd.key_insight) + '</div>' : '') +
        '</div>';
      });
    }
    if (ri.emerging_tools && ri.emerging_tools.length) {
      html += '<div style="margin-top:var(--sp3);font-weight:var(--fw-sb);color:var(--tx);margin-bottom:var(--sp2)">Emerging Tools (Reddit buzz)</div>' +
        '<div style="display:flex;gap:var(--sp2);flex-wrap:wrap">';
      ri.emerging_tools.forEach(function(et) {
        html += '<a href="' + _tnEnc(et.url || '#') + '" target="_blank" rel="noopener" style="padding:var(--sp2) var(--sp3);background:var(--acbg);border:1px solid var(--ac3);border-radius:8px;font-size:var(--f-sm);color:var(--ac);text-decoration:none">' +
          _tnEnc(et.name || '') + '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:2px">' + _tnEnc(et.context || '') + '</div></a>';
      });
      html += '</div>';
    }
  }

  // ── READING LIST ──
  if (rpt.reading_list && rpt.reading_list.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Must-Read / Must-Watch</div>';
    rpt.reading_list.forEach(function(item) {
      var typeIcon = item.type === 'video' ? '&#9654;' : item.type === 'reddit' ? '&#9651;' : '&#9679;';
      var typeColor = item.type === 'video' ? 'var(--rd)' : item.type === 'reddit' ? 'var(--or)' : 'var(--ac)';
      var rlLabel = item.type === 'video' ? '&#9654; Watch' : item.type === 'reddit' ? '&#9651; Thread' : '&#8599; Read';
      // Extract videoId from URL for thumbnail
      var rlVidMatch = (item.url || '').match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      var rlThumb = rlVidMatch ? 'https://img.youtube.com/vi/' + rlVidMatch[1] + '/mqdefault.jpg' : null;
      html += '<div style="display:flex;gap:var(--sp3);align-items:center;margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:8px">';
      if (rlThumb) {
        html += '<a href="' + _tnEnc(item.url || '#') + '" target="_blank" rel="noopener" style="flex-shrink:0;width:120px;height:68px;border-radius:6px;overflow:hidden;position:relative;display:block">' +
          '<img src="' + rlThumb + '" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:10px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px"></div></div>' +
        '</a>';
      } else {
        html += '<span style="color:' + typeColor + ';font-size:var(--f-lg);flex-shrink:0">' + typeIcon + '</span>';
      }
      html += '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:var(--fw-sb);color:var(--tx);font-size:var(--f-md)">' + _tnEnc(item.title || '') + '</div>' +
          (item.duration ? '<span style="font-size:var(--f-xs);color:var(--tx3)">' + _tnEnc(item.duration) + '</span>' : '') +
          '<div style="font-size:var(--f-sm);color:var(--tx2);margin-top:2px">' + _tnEnc(item.why || '') + '</div>' +
        '</div>' +
        '<a href="' + _tnEnc(item.url || '#') + '" target="_blank" rel="noopener" style="flex-shrink:0;font-size:var(--f-sm);font-weight:var(--fw-sb);color:' + typeColor + ';text-decoration:none;padding:6px 14px;border:1px solid ' + typeColor + ';border-radius:6px;white-space:nowrap">' + rlLabel + '</a>' +
      '</div>';
    });
  }

  // ── BOTTOM LINE ──
  if (rpt.bottom_line) {
    html += '<div style="margin:var(--sp6) 0;padding:var(--sp5);background:linear-gradient(135deg,var(--acbg),var(--s2));border:2px solid var(--ac);border-radius:12px">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--ac);margin-bottom:var(--sp2);font-weight:var(--fw-b)">The Bottom Line</div>' +
      '<div style="font-size:var(--f-lg);line-height:1.7;color:var(--tx);font-weight:var(--fw-m)">' + _tnEnc(rpt.bottom_line) + '</div>' +
    '</div>';
  }

  // Generated timestamp
  if (r.generated_at) {
    html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp4);text-align:center">' +
      'Generated: ' + _tnTimeAgo(r.generated_at) + (r.cached ? ' (cached)' : '') +
      ' &middot; <a href="#" onclick="event.preventDefault();loadTechNewsResearch(true)" style="color:var(--ac)">Regenerate</a>' +
      ' &middot; <a href="#" onclick="event.preventDefault();emailTechResearch()" style="color:var(--ac)">Email Report</a></div>';

  // Email recipients manager
  html += '<div style="margin-top:var(--sp4);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">' +
    '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--tx);margin-bottom:var(--sp2)">Daily Email Recipients</div>' +
    '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2)">Reports are sent daily after generation. Add email addresses below.</div>' +
    '<div style="display:flex;gap:var(--sp2);align-items:center">' +
      '<input id="research-email-input" style="flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;color:var(--tx);font-size:var(--f-sm);font-family:inherit" placeholder="email@example.com, another@example.com" value="' + _tnEnc((state._researchRecipients || []).join(', ')) + '" />' +
      '<button class="btn btn-sm" onclick="saveResearchRecipients()">Save</button>' +
    '</div>' +
    '<div id="research-email-status" style="font-size:var(--f-xs);color:var(--tx3);margin-top:4px"></div>' +
  '</div>';
  }

  html += '</div>';
  return html;
}
