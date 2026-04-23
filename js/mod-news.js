// ===============================================================
// NEWS TAB — Intelligence Feed with AI Summaries, Digest, Trends
// ===============================================================

// ── State defaults ───────────────────────────────────────────
if (!state.newsViewMode) state.newsViewMode = 'cards';
if (!state.newsDateRange) state.newsDateRange = 'all';
if (!state.newsPage) state.newsPage = 1;
if (!state.newsReadIds) state.newsReadIds = new Set();
if (!state.newsDigest) state.newsDigest = null;
if (!state.newsTrends) state.newsTrends = null;
if (!state.newsChatHistory) state.newsChatHistory = [];
if (!state.newsChatLoading) state.newsChatLoading = false;
if (!state.newsBrandFilter) state.newsBrandFilter = null;

var _newsPageSize = 25;

function _nEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _nTimeAgo(d) { var diff=Date.now()-new Date(d).getTime(); var m=Math.floor(diff/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; var dy=Math.floor(h/24); if(dy<7)return dy+'d ago'; if(dy<30)return Math.floor(dy/7)+'w ago'; return new Date(d).toLocaleDateString(); }
function _nFmt(n) { return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : ''+n; }

// ── Pipeline health badge ────────────────────────────────────
// Shows OK / stale / error based on the latest /pipeline/health response.
// `kind` is 'coffee' or 'tech' — determines which endpoint to call.
window._nwPipelineHealth = window._nwPipelineHealth || {};
function _nwPipelineBadge(kind) {
  var h = window._nwPipelineHealth[kind];
  if (!h) { _nwLoadPipelineHealth(kind); return '<span class="nw-pipe-badge nw-pipe-loading" title="Checking pipeline...">&#9679;</span>'; }
  var cls = h.ok ? 'nw-pipe-ok' : 'nw-pipe-warn';
  var tip = 'Articles: ' + (h.store && h.store.articleCount || 0) +
    ' • Transcripts usable: ' + (h.transcripts && h.transcripts.usable || 0) + '/' + (h.transcripts && h.transcripts.total || 0) +
    (h.digest && h.digest.daily && h.digest.daily.ageHours != null ? ' • Digest: ' + Math.round(h.digest.daily.ageHours) + 'h old' : ' • No digest') +
    (h.warnings && h.warnings.length ? '\n⚠ ' + h.warnings.join('\n⚠ ') : '');
  return '<span class="nw-pipe-badge ' + cls + '" title="' + _nEnc(tip) + '" onclick="_nwLoadPipelineHealth(\'' + kind + '\', true)">&#9679;</span>';
}
function _nwLoadPipelineHealth(kind, force) {
  if (window._nwPipelineHealth[kind] && !force) return;
  var endpoint = kind === 'tech' ? '/api/tech-news/pipeline/health' : '/api/news/pipeline/health';
  fetch(endpoint).then(function(r) { return r.json(); }).then(function(h) {
    window._nwPipelineHealth[kind] = h;
    if (kind === 'tech' && typeof renderTechNewsMain === 'function') renderTechNewsMain();
    else if (typeof renderNewsMain === 'function') renderNewsMain();
  }).catch(function() {
    window._nwPipelineHealth[kind] = { ok: false, warnings: ['health endpoint unreachable'] };
  });
}

// ── Data loading ─────────────────────────────────────────────
function loadNewsData() {
  DATA.newsLoading = true;
  renderAll();
  Promise.all([
    fetch('/api/news').then(function(r){return r.json();}),
    fetch('/api/news/read').then(function(r){return r.json();}).catch(function(){return{readIds:[]};})
  ]).then(function(results) {
    DATA.news = results[0];
    state.newsReadIds = new Set(results[1].readIds || []);
    DATA.newsLoading = false;
    renderAll();
  }).catch(function(e) { DATA.newsLoading = false; DATA.newsError = e.message; renderAll(); });
}

function refreshNews() {
  if (typeof showToast === 'function') showToast('Refreshing news feeds...');
  fetch('/api/news/refresh').then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      if (typeof showToast === 'function') showToast(d.newArticles + ' new articles fetched');
      DATA.news = null; loadNewsData();
    }
  }).catch(function(){});
}

function markNewsRead(id) {
  if (state.newsReadIds.has(id)) return;
  state.newsReadIds.add(id);
  fetch('/api/news/read/' + encodeURIComponent(id), { method: 'POST' }).catch(function(){});
}

function loadNewsDigest(period, force) {
  state.newsDigest = { loading: true };
  renderAll();
  var url = '/api/news/digest?period=' + (period || 'daily');
  if (force) url += '&force=1';
  fetch(url).then(function(r){return r.json();}).then(function(d) {
    state.newsDigest = d;
    renderAll();
  }).catch(function(e) { state.newsDigest = { error: e.message }; renderAll(); });
}

function loadNewsTrends() {
  fetch('/api/news/trends?days=14').then(function(r){return r.json();}).then(function(d) {
    state.newsTrends = d;
    renderAll();
  }).catch(function(){});
}

// ── Sidebar ──────────────────────────────────────────────────
function renderNewsSidebar() {
  var sb = $('sidebar');
  var news = DATA.news;
  var articles = news ? news.articles || [] : [];
  var unreadCount = articles.filter(function(a){return !state.newsReadIds.has(a.id);}).length;
  var sec = state.newsCategory || 'all';

  var cats = [
    { id: 'all', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', label: 'All News', count: articles.length },
    { id: 'research', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>', label: 'Research', count: '' },
    { id: 'briefing', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', label: 'Briefing', count: '' },
    { id: 'unread', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>', label: 'Unread', count: unreadCount },
    { id: 'industry', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>', label: 'Coffee Industry', count: articles.filter(function(a){return a.category==='industry';}).length },
    { id: 'reddit', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M14 10a2 2 0 100 4"/><path d="M10 10a2 2 0 000 4"/></svg>', label: 'Reddit', count: articles.filter(function(a){return a.category==='reddit';}).length },
    { id: 'youtube', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="4"/><polygon points="10 8 16 12 10 16"/></svg>', label: 'YouTube', count: articles.filter(function(a){return a.category==='youtube';}).length },
    { id: 'trends', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', label: 'Trends', count: '' },
    { id: 'chat', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>', label: 'Chat', count: '' }
  ];

  var nav = cats.map(function(c) {
    var isActive = sec === c.id;
    var countHtml = c.count !== '' ? '<span class="nb">' + c.count + '</span>' : '';
    return '<div class="ca-sb-nav-item' + (isActive ? ' active' : '') + '"' +
      ' onclick="state.newsCategory=\'' + c.id + '\';state.newsPage=1;renderAll();' +
      (c.id === 'research' ? 'if(!state.coffeeResearch)loadCoffeeResearch()' : '') +
      (c.id === 'briefing' ? 'if(!state.newsDigest)loadNewsDigest()' : '') +
      (c.id === 'trends' ? ';if(!state.newsTrends)loadNewsTrends()' : '') + '">' +
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
      (news.lastRefreshed ? '<div class="ca-sb-date-label">Last refresh</div><div class="ca-sb-date-ago">' + _nTimeAgo(news.lastRefreshed) + '</div>' : '') +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:4px;font-size:10px">' +
        '<span style="color:' + (ss.rss === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">RSS</span>' +
        '<span style="color:' + (ss.reddit === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">Reddit</span>' +
        '<span style="color:' + (ss.youtube === 'ok' ? 'var(--gn)' : 'var(--rd)') + '">YT</span>' +
      '</div>' +
    '</div>';
  }

  sb.innerHTML = '<div class="ca-sb">' +
    statusHtml +
    '<button class="ca-sb-refresh" onclick="refreshNews()">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
      ' Refresh Feeds</button>' +
    '<div class="ca-sb-nav">' + nav + '</div>' +
    '<button class="ca-sb-refresh" style="margin-top:auto;border-color:var(--bd2)" onclick="state.newsCategory=\'settings\';renderAll()">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
      ' Manage Sources</button>' +
  '</div>';
}

// ── Main Content ─────────────────────────────────────────────
function renderNewsMain() {
  var el = $('main');

  // Settings and Research work regardless of data load state
  if (state.newsCategory === 'settings') { el.innerHTML = renderNewsSettings(); return; }
  if (state.newsCategory === 'research') { el.innerHTML = renderCoffeeResearch(); return; }

  if (DATA.newsLoading || (!DATA.news && !DATA.newsError)) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div class="c-grid-auto">'
      +   '<div class="c-skel-card"><div class="c-skel c-skel-line-sm" style="width:30%;margin-bottom:10px"></div><div class="c-skel c-skel-title" style="width:85%"></div><div class="c-skel c-skel-line" style="width:70%"></div></div>'
      +   '<div class="c-skel-card"><div class="c-skel c-skel-line-sm" style="width:40%;margin-bottom:10px"></div><div class="c-skel c-skel-title" style="width:75%"></div><div class="c-skel c-skel-line" style="width:80%"></div></div>'
      +   '<div class="c-skel-card"><div class="c-skel c-skel-line-sm" style="width:35%;margin-bottom:10px"></div><div class="c-skel c-skel-title" style="width:90%"></div><div class="c-skel c-skel-line" style="width:60%"></div></div>'
      +   '<div class="c-skel-card"><div class="c-skel c-skel-line-sm" style="width:30%;margin-bottom:10px"></div><div class="c-skel c-skel-title" style="width:70%"></div><div class="c-skel c-skel-line" style="width:75%"></div></div>'
      + '</div></div>';
    return;
  }
  if (DATA.newsError) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div class="c-empty c-card-danger" style="align-items:flex-start;text-align:left">'
      +   '<div class="c-empty-icon">\u26A0</div>'
      +   '<div class="c-empty-title" style="color:var(--rd)">Failed to load news</div>'
      +   '<div class="c-empty-body">' + _nEnc(DATA.newsError) + '</div>'
      +   '<button class="c-btn c-btn-primary c-empty-action" onclick="loadNewsData()">Retry</button>'
      + '</div></div>';
    return;
  }
  if (!DATA.news || !DATA.news.articles) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)">'
      + '<div class="c-empty">'
      +   '<div class="c-empty-icon">\u2615</div>'
      +   '<div class="c-empty-title">No coffee news yet</div>'
      +   '<div class="c-empty-body">Click Refresh to pull from coffee industry sources.</div>'
      +   '<button class="c-btn c-btn-primary c-empty-action" onclick="loadNewsData()">Refresh feed</button>'
      + '</div></div>';
    return;
  }

  // Special views
  if (state.newsCategory === 'briefing') { el.innerHTML = renderNewsBriefing(); return; }
  if (state.newsCategory === 'trends') { el.innerHTML = renderNewsTrends(); return; }
  if (state.newsCategory === 'competitors') { el.innerHTML = renderNewsCompetitors(); return; }
  if (state.newsCategory === 'chat') { el.innerHTML = renderNewsChat(); _newsChatScrollToBottom(); return; }

  // Article list
  var articles = _nFilterArticles(DATA.news.articles);
  var totalCount = articles.length;
  var pageArticles = articles.slice(0, state.newsPage * _newsPageSize);
  var hasMore = pageArticles.length < totalCount;

  var html = '<div class="ca-main">';

  // Header with view modes
  html += '<div class="ca-header"><h2>News Feed ' + _nwPipelineBadge('coffee') + '</h2><div style="display:flex;gap:var(--sp2);align-items:center;flex-wrap:wrap">' +
    _nSortPicker() + _nViewToggle() + _nDateFilter() +
    '</div></div>';

  // Search
  html += '<div style="margin-bottom:var(--sp3)"><input class="filter-input" placeholder="Search news..." value="' + _nEnc(state.newsSearch || '') + '" oninput="state.newsSearch=this.value;state.newsPage=1;renderNewsMain()" style="width:100%"/></div>';

  // Brand filter buttons
  var _brands = ['breville','sage','lelit','baratza','beanz'];
  html += '<div class="nw-brand-filters">';
  html += '<span style="font-size:var(--f-xs);color:var(--tx3);margin-right:var(--sp2)">Brand:</span>';
  html += '<button class="nw-brand-fbtn' + (!state.newsBrandFilter ? ' active' : '') + '" onclick="state.newsBrandFilter=null;state.newsPage=1;renderNewsMain()">All</button>';
  _brands.forEach(function(b) {
    var isActive = state.newsBrandFilter === b;
    html += '<button class="nw-brand-fbtn nw-brand-' + b.replace(/[^a-z]/g, '') + (isActive ? ' active' : '') + '" onclick="state.newsBrandFilter=\'' + b + '\';state.newsPage=1;renderNewsMain()">' + b.charAt(0).toUpperCase() + b.slice(1) + '</button>';
  });
  html += '</div>';

  // Stats row
  var stats = DATA.news.stats || {};
  html += '<div class="nw-stats">' +
    _nStatChip(stats.totalArticles || 0, 'Total') +
    _nStatChip(stats.lastWeekCount || 0, 'This Week') +
    _nStatChip((stats.byCategory || {}).industry || 0, 'Industry') +
    _nStatChip((stats.byCategory || {}).reddit || 0, 'Reddit') +
    _nStatChip((stats.byCategory || {}).youtube || 0, 'YouTube') +
    '</div>';

  // Articles
  html += '<div class="nw-section-label">Articles (' + totalCount + ')</div>';

  if (!pageArticles.length) {
    html += '<div class="c-empty" style="padding:var(--sp6)">'
      + '<div class="c-empty-icon">\uD83D\uDD0D</div>'
      + '<div class="c-empty-title">No articles match your filters</div>'
      + '<div class="c-empty-body">Try clearing search or switching sort/date filters.</div>'
      + '</div>';
  } else {
    html += '<div class="nw-list nw-' + (state.newsViewMode || 'cards') + '">';
    pageArticles.forEach(function(a) { html += _nRenderArticle(a); });
    html += '</div>';
  }

  if (hasMore) {
    html += '<div style="text-align:center;padding:var(--sp4)"><button class="btn btn-sm" onclick="state.newsPage++;renderNewsMain()">Load More (' + (totalCount - pageArticles.length) + ' remaining)</button></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Filtering ────────────────────────────────────────────────
function _nFilterArticles(articles) {
  var result = articles.slice();
  var cat = state.newsCategory;

  // Category
  if (cat === 'unread') result = result.filter(function(a){return !state.newsReadIds.has(a.id);});
  else if (cat === 'pinned') result = result.filter(function(a){return a.pinned;});
  else if (cat && cat !== 'all' && cat !== 'briefing' && cat !== 'trends' && cat !== 'competitors' && cat !== 'chat') {
    result = result.filter(function(a){return a.category === cat;});
  }

  // Search
  if (state.newsSearch) {
    var q = state.newsSearch.toLowerCase();
    result = result.filter(function(a) {
      return (a.title||'').toLowerCase().includes(q) || (a.summary||'').toLowerCase().includes(q) ||
        (a.source||'').toLowerCase().includes(q) || (a.author||'').toLowerCase().includes(q);
    });
  }

  // Brand filter
  if (state.newsBrandFilter) {
    var bf = state.newsBrandFilter.toLowerCase();
    result = result.filter(function(a) {
      return a.brand_tags && a.brand_tags.some(function(t) { return t.toLowerCase() === bf; });
    });
  }

  // Date range
  if (state.newsDateRange && state.newsDateRange !== 'all') {
    var cutoff;
    if (state.newsDateRange === 'today') cutoff = Date.now() - 86400000;
    else if (state.newsDateRange === 'week') cutoff = Date.now() - 7 * 86400000;
    else if (state.newsDateRange === 'month') cutoff = Date.now() - 30 * 86400000;
    if (cutoff) result = result.filter(function(a){return new Date(a.publishedAt).getTime() > cutoff;});
  }

  // Sort
  var sort = state.newsSort || 'date';
  if (sort === 'relevance') result.sort(function(a,b){return (b.relevanceScore||0)-(a.relevanceScore||0);});
  else if (sort === 'engagement') result.sort(function(a,b){return ((b.engagement?.redditScore||0)+(b.engagement?.youtubeViews||0))-((a.engagement?.redditScore||0)+(a.engagement?.youtubeViews||0));});
  else result.sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);});

  return result;
}

// ── Article Rendering ────────────────────────────────────────
function _nRenderArticle(a) {
  var isRead = state.newsReadIds.has(a.id);
  var relPct = Math.round((a.relevanceScore || 0) * 100);
  var relColor = relPct > 60 ? 'var(--gn)' : relPct > 30 ? 'var(--or)' : 'var(--tx3)';
  var mode = state.newsViewMode || 'cards';

  // Headlines mode: ultra-compact
  if (mode === 'headlines') {
    return '<div class="nw-headline' + (isRead ? '' : ' nw-unread') + '" onclick="openNewsDetail(\'' + a.id + '\')">' +
      '<span class="nw-hl-source">' + _nEnc(a.category) + '</span>' +
      '<span class="nw-hl-title">' + (a.pinned ? '&#9733; ' : '') + _nEnc(a.title) + '</span>' +
      '<span class="nw-hl-time">' + _nTimeAgo(a.publishedAt) + '</span>' +
      (a.hasNote ? '<span class="nw-note-dot">&#9998;</span>' : '') +
    '</div>';
  }

  // Compact mode: single row
  if (mode === 'compact') {
    var eng = '';
    if (a.engagement && a.engagement.redditScore) eng = '&#9650;' + a.engagement.redditScore;
    else if (a.engagement && a.engagement.youtubeViews) eng = '&#9654;' + _nFmt(a.engagement.youtubeViews);

    return '<div class="nw-compact' + (isRead ? '' : ' nw-unread') + '" onclick="openNewsDetail(\'' + a.id + '\')">' +
      '<span class="nw-c-badge nw-badge-' + a.category + '">' + _nEnc(a.category.slice(0,3)) + '</span>' +
      '<span class="nw-c-title">' + (a.pinned ? '&#9733; ' : '') + _nEnc(a.title) + '</span>' +
      '<span class="nw-c-source">' + _nEnc(a.sourceName || a.source) + '</span>' +
      (eng ? '<span class="nw-c-eng">' + eng + '</span>' : '') +
      '<span class="nw-c-rel" style="color:' + relColor + '">' + relPct + '%</span>' +
      '<span class="nw-c-time">' + _nTimeAgo(a.publishedAt) + '</span>' +
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
  else if (a.engagement && a.engagement.youtubeViews) engStr = ' &middot; &#9654;' + _nFmt(a.engagement.youtubeViews);

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
    catBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:var(--ac)18;color:var(--ac);font-weight:600">' + _nEnc(_nCatLabel(a.category_classification)) + '</span>';
  }

  // Brand tags (colored pills)
  var brandHtml = '';
  if (a.brand_tags && a.brand_tags.length) {
    brandHtml = a.brand_tags.map(function(b) {
      var bc = b === 'breville' ? '#3b82f6' : b === 'sage' ? '#06b6d4' : b === 'lelit' ? '#a855f7' : b === 'baratza' ? '#f59e0b' : b === 'beanz' ? '#22c55e' : 'var(--tx3)';
      return '<span style="font-size:10px;padding:2px 7px;border-radius:8px;background:' + bc + '20;color:' + bc + ';font-weight:600">' + _nEnc(b.charAt(0).toUpperCase() + b.slice(1)) + '</span>';
    }).join(' ');
  }

  // Thumbnail
  var thumbHtml = '';
  if (hasImage) {
    thumbHtml = '<div class="news-card-thumb"><img src="' + a.image + '" alt="" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/></div>';
  }

  // Tags row: source badge + category + sentiment + brand tags — all visible
  var tagsRow = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
    '<span class="news-source-badge news-badge-' + a.category + '">' + _nEnc(a.category) + '</span>' +
    catBadge +
    (a.videoId ? '<span class="news-yt-badge">&#9654; Video</span>' : '') +
    sentBadge +
    brandHtml +
  '</div>';

  return '<div class="news-card' + (isRead ? '' : ' nw-unread') + '" data-cat="' + a.category + '" onclick="openNewsDetail(\'' + a.id + '\')">' +
    '<div class="news-card-row">' +
      thumbHtml +
      '<div class="news-card-content">' +
        tagsRow +
        '<h2 class="news-card-title">' + _nEnc(a.title) + '</h2>' +
        '<div class="news-card-meta">' + _nEnc(a.sourceName || a.source) + (a.author ? ' &middot; ' + _nEnc(a.author) : '') + engStr + ' &middot; ' + _nTimeAgo(a.publishedAt) + '</div>' +
        '<div class="news-card-summary">' + _nEnc(summary) + '</div>' +
        (a.beanzImpact ? '<div class="nw-card-impact"><span class="nw-impact-label">Beanz Impact</span> ' + _nEnc(a.beanzImpact) + '</div>' : '') +
        '<div class="news-card-footer">' +
          '<div class="cor-feedback news-card-fb" style="margin-left:0">' +
            '<button class="fb-btn fb-up" onclick="event.stopPropagation();sendFeedback(\'news\',\'' + a.id + '\',\'up\')" title="Relevant">&#9650;</button>' +
            '<button class="fb-btn fb-down" onclick="event.stopPropagation();sendFeedback(\'news\',\'' + a.id + '\',\'down\')" title="Not relevant">&#9660;</button>' +
            '<button class="fb-btn fb-dismiss" onclick="event.stopPropagation();sendFeedback(\'news\',\'' + a.id + '\',\'dismiss\');setTimeout(function(){DATA.news=null;loadNewsData()},300)" title="Dismiss">&#10005;</button>' +
          '</div>' +
          saveToNotebookButton({
            sourceType: a.videoId ? 'news_video' : 'news_article',
            ref: a.videoId ? { videoId: a.videoId, articleId: a.id } : { url: a.url, title: a.title, summary: summary },
            title: a.title,
            summary: summary
          }) +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ── Category label helper ───────────────────────────────────
function _nCatLabel(cat) {
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
function renderNewsBriefing() {
  var d = state.newsDigest;
  if (!d || d.loading) return '<div class="ca-main"><div class="ca-header"><h2>Daily Briefing</h2></div>'
    + '<div style="padding:var(--sp4) 0">'
    + '<div class="c-flex-between" style="margin-bottom:var(--sp3)"><span style="font-size:var(--f-sm);color:var(--tx3);font-weight:var(--fw-sb)">Generating your briefing\u2026</span><span style="font-size:var(--f-xs);color:var(--tx3)">~30s</span></div>'
    + '<div class="c-progress c-progress-indeterminate"><div class="c-progress-fill"></div></div>'
    + '<div class="c-stack" style="margin-top:var(--sp4)">'
    +   '<div class="c-skel c-skel-line-lg" style="width:40%"></div>'
    +   '<div class="c-skel c-skel-line" style="width:95%"></div>'
    +   '<div class="c-skel c-skel-line" style="width:88%"></div>'
    +   '<div class="c-skel c-skel-line" style="width:72%"></div>'
    + '</div></div></div>';
  if (d.error || !d.digest) return '<div class="ca-main"><div class="ca-header"><h2>Daily Briefing</h2></div>'
    + '<div class="c-empty c-card-danger" style="align-items:flex-start;text-align:left">'
    +   '<div class="c-empty-icon">\u26A0</div>'
    +   '<div class="c-empty-title" style="color:var(--rd)">Could not generate briefing</div>'
    +   '<button class="c-btn c-btn-primary c-empty-action" onclick="loadNewsDigest(\'daily\')">Retry</button>'
    + '</div></div>';

  var dig = d.digest;
  var html = '<div class="ca-main" style="max-width:800px">';

  // Header
  html += '<div class="ca-header"><h2>Daily Briefing</h2><div style="display:flex;gap:var(--sp2);align-items:center">';
  html += '<button class="ca-day-btn' + (state._newsBriefPeriod !== 'weekly' ? ' active' : '') + '" onclick="state._newsBriefPeriod=\'daily\';loadNewsDigest(\'daily\')">Daily</button>';
  html += '<button class="ca-day-btn' + (state._newsBriefPeriod === 'weekly' ? ' active' : '') + '" onclick="state._newsBriefPeriod=\'weekly\';loadNewsDigest(\'weekly\')">Weekly</button>';
  html += '<button class="btn btn-sm" style="margin-left:var(--sp3)" onclick="loadNewsDigest(state._newsBriefPeriod||\'daily\',true)">Regenerate</button>';
  html += '<button class="btn btn-sm" style="background:var(--ac);color:#fff;border:none" onclick="postBriefingToSlack()" id="slack-briefing-btn">Post to Slack</button>';
  html += '</div></div>';

  // Catchy headline
  if (dig.headline) {
    html += '<div style="font-size:var(--f-2xl);font-weight:var(--fw-b);line-height:1.3;margin-bottom:var(--sp4);color:var(--tx)">' + _nEnc(dig.headline) + '</div>';
  }

  // Executive Summary — conversational lead
  if (dig.executive_summary) {
    html += '<div style="font-size:var(--f-md);line-height:1.7;color:var(--tx2);margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s2);border-radius:var(--r2);border-left:3px solid var(--ac)">' +
      _nEnc(dig.executive_summary) + '</div>';
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
      html += '<div style="font-size:9px;text-transform:uppercase;color:var(--tx3);letter-spacing:0.5px;margin-bottom:4px">' + _nEnc(s.source || '') + '</div>';
      html += '<div style="font-size:var(--f-lg);font-weight:var(--fw-sb);line-height:1.35;margin-bottom:var(--sp2)">';
      if (s.url) html += '<a href="' + _nEnc(s.url) + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _nEnc(s.title) + ' &#8599;</a>';
      else html += _nEnc(s.title);
      html += '</div>';
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _nEnc(s.analysis || '') + '</div>';
      if (s.quote) {
        html += '<div style="margin:var(--sp3) 0;padding:var(--sp3) var(--sp4);border-left:3px solid var(--ac);background:var(--s2);font-style:italic;font-size:var(--f-sm);line-height:1.5;color:var(--tx)">"' + _nEnc(s.quote) + '"</div>';
      }
      if (s.beanz_relevance) {
        html += '<div style="font-size:12px;color:var(--ac);margin-top:var(--sp2)">&#9889; ' + _nEnc(s.beanz_relevance) + '</div>';
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
        '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _nEnc(p.product || '') + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);margin-bottom:var(--sp2)">' + _nEnc(p.brand || '') +
          ' <span style="color:' + sentColor + '">' + _nEnc(p.sentiment || '') + '</span></div>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _nEnc(p.what_people_say || '') + '</div>' +
        (p.url ? '<a href="' + _nEnc(p.url) + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ac);margin-top:4px;display:block">Read more &#8599;</a>' : '') +
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
          '<strong>' + _nEnc(c.brand || '') + '</strong>' +
          '<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:' + sevColor + '18;color:' + sevColor + ';font-weight:600">' + _nEnc(c.severity || '') + '</span>' +
        '</div>' +
        '<div style="font-size:var(--f-sm);color:var(--tx2);margin-bottom:4px">' + _nEnc(c.issue || '') + '</div>';
      if (c.source_quote) {
        html += '<div style="font-style:italic;font-size:12px;color:var(--tx3);padding-left:12px;border-left:2px solid var(--bd)">"' + _nEnc(c.source_quote) + '"</div>';
      }
      if (c.thread_url) {
        html += '<a href="' + _nEnc(c.thread_url) + '" target="_blank" rel="noopener" style="font-size:11px;color:var(--ac);margin-top:4px;display:inline-block">View thread &#8599;</a>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // ── COMPETITOR WATCH ──
  if (dig.competitor_watch && dig.competitor_watch.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg);color:var(--or)">Competitor Watch</div>';
    dig.competitor_watch.forEach(function(cw) {
      var sentColor = cw.sentiment === 'positive' ? 'var(--gn)' : cw.sentiment === 'negative' ? 'var(--rd)' : 'var(--tx3)';
      html += '<div style="margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);border-left:3px solid ' + sentColor + '">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--sp2)">' +
          '<strong style="font-size:var(--f-md)">' + _nEnc(cw.brand || '') + '</strong>' +
          '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:' + sentColor + '18;color:' + sentColor + ';font-weight:600">' + _nEnc(cw.sentiment || 'neutral') + '</span>' +
        '</div>' +
        '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _nEnc(cw.summary || '') + '</div>';
      if (cw.mentions && cw.mentions.length) {
        html += '<div style="margin-top:var(--sp2);font-size:11px;color:var(--tx3)">' +
          cw.mentions.map(function(m) { return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 6px;background:var(--s3);border-radius:4px">' + _nEnc(m) + '</span>'; }).join('') +
          '</div>';
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
        '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--rd);color:#fff;font-weight:600">&#9654; ' + _nEnc(yt.channel || '') + '</span>' +
        '<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:' + sentColor + '18;color:' + sentColor + ';font-weight:600">' + _nEnc(yt.sentiment || '') + '</span>' +
        '</div>';
      html += '<div style="font-weight:var(--fw-sb);margin-bottom:var(--sp2)">';
      if (ytLink) html += '<a href="' + ytLink + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _nEnc(yt.title || '') + ' &#8599;</a>';
      else html += _nEnc(yt.title || '');
      html += '</div>';
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _nEnc(yt.summary || '') + '</div>';
      if (yt.standout_quote) {
        html += '<div style="margin:var(--sp2) 0;padding:var(--sp2) var(--sp3);border-left:3px solid var(--rd);font-style:italic;font-size:var(--f-sm);color:var(--tx)">"' + _nEnc(yt.standout_quote) + '"</div>';
      }
      if (yt.beanz_relevance) {
        html += '<div style="font-size:12px;color:var(--ac);margin-top:4px">&#9889; ' + _nEnc(yt.beanz_relevance) + '</div>';
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
      html += '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2);margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s2);border-radius:var(--r2);border-left:3px solid var(--pu)">' + _nEnc(rp.summary) + '</div>';
    }
    if (rp.trending_topics && rp.trending_topics.length) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp3)">';
      rp.trending_topics.forEach(function(t) { html += '<span class="ca-topic-chip">' + _nEnc(t) + '</span>'; });
      html += '</div>';
    }
    if (rp.hot_threads && rp.hot_threads.length) {
      rp.hot_threads.forEach(function(ht) {
        html += '<div style="margin-bottom:var(--sp3);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
            '<span style="font-size:11px;color:var(--pu);font-weight:600">r/' + _nEnc(ht.subreddit || '') + '</span>' +
            (ht.upvotes ? '<span style="font-size:11px;color:var(--or)">&#9650; ' + ht.upvotes + '</span>' : '') +
          '</div>' +
          '<div style="font-weight:var(--fw-sb);margin-bottom:4px">';
        if (ht.url) html += '<a href="' + _nEnc(ht.url) + '" target="_blank" rel="noopener" style="color:var(--tx);text-decoration:none">' + _nEnc(ht.title || '') + ' &#8599;</a>';
        else html += _nEnc(ht.title || '');
        html += '</div>';
        if (ht.insight) html += '<div style="font-size:var(--f-sm);color:var(--tx2);margin-bottom:4px">' + _nEnc(ht.insight) + '</div>';
        if (ht.top_comment_quote) {
          html += '<div style="font-style:italic;font-size:12px;color:var(--tx3);padding-left:12px;border-left:2px solid var(--pu)">"' + _nEnc(ht.top_comment_quote) + '"</div>';
        }
        html += '</div>';
      });
    }
    if (rp.brand_mentions && rp.brand_mentions.length) {
      html += '<div style="margin-top:var(--sp2)">';
      rp.brand_mentions.forEach(function(bm) {
        var bmSent = typeof bm === 'object' ? bm : { brand: '', context: bm, sentiment: 'neutral' };
        var bmColor = bmSent.sentiment === 'positive' ? 'var(--gn)' : bmSent.sentiment === 'negative' ? 'var(--rd)' : 'var(--tx3)';
        html += '<div style="font-size:12px;margin-bottom:4px"><span style="font-weight:600;color:' + bmColor + '">' + _nEnc(bmSent.brand || '') + '</span> ' + _nEnc(bmSent.context || (typeof bm === 'string' ? bm : '')) + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  // ── TRENDS ──
  if (dig.trends && dig.trends.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Trends</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--sp3)">';
    dig.trends.forEach(function(t) {
      html += '<div style="padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);border-top:3px solid var(--ac)">' +
        '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _nEnc(t.trend || '') + '</div>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _nEnc(t.description || '') + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);margin-top:4px">' + _nEnc(t.evidence || '') + '</div>' +
        '</div>';
    });
    html += '</div></div>';
  }

  // ── INNOVATION CORNER ──
  if (dig.innovation_corner) {
    html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:linear-gradient(135deg,var(--s2),var(--s1));border:1px solid var(--ac);border-radius:var(--r2)">' +
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--ac);margin-bottom:var(--sp2)">Innovation Corner</div>' +
      '<div style="font-size:var(--f-md);line-height:1.6;color:var(--tx)">' + _nEnc(dig.innovation_corner) + '</div></div>';
  }

  // ── RECOMMENDED ACTIONS ──
  if (dig.recommended_actions && dig.recommended_actions.length) {
    html += '<div style="margin-bottom:var(--sp5)"><div class="ca-section-title" style="font-size:var(--f-lg)">Recommended Actions</div>';
    dig.recommended_actions.forEach(function(a, i) {
      html += '<div style="display:flex;gap:var(--sp3);align-items:flex-start;margin-bottom:var(--sp2);padding:var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)">' +
        '<span style="background:var(--ac);color:#fff;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (i+1) + '</span>' +
        '<div style="font-size:var(--f-sm);line-height:1.5;color:var(--tx2)">' + _nEnc(a) + '</div></div>';
    });
    html += '</div>';
  }

  // Slack status + generated time
  if (state._briefingSlackStatus) {
    var slackColor = state._briefingSlackStatus === 'sent' ? 'var(--gn)' : state._briefingSlackStatus === 'error' ? 'var(--rd)' : 'var(--tx3)';
    html += '<div style="font-size:11px;color:' + slackColor + ';margin-top:var(--sp2)">' +
      (state._briefingSlackStatus === 'sent' ? 'Posted to Slack' : state._briefingSlackStatus === 'sending' ? 'Posting to Slack...' : 'Slack post failed') + '</div>';
  }

  if (d.generated_at) html += '<div style="font-size:10px;color:var(--tx3);margin-top:var(--sp4)">Generated: ' + _nTimeAgo(d.generated_at) + (d.cached ? ' (cached)' : '') + '</div>';

  html += '</div>';
  return html;
}

function postBriefingToSlack() {
  state._briefingSlackStatus = 'sending';
  renderAll();
  var period = state._newsBriefPeriod || 'daily';
  fetch('/api/news/digest/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period: period })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      state._briefingSlackStatus = 'sent';
      if (typeof showToast === 'function') showToast('Briefing posted to Slack');
    } else {
      state._briefingSlackStatus = 'error';
      if (typeof showToast === 'function') showToast('Slack post failed: ' + (d.error || 'unknown'), 'er');
    }
    renderAll();
  }).catch(function(e) {
    state._briefingSlackStatus = 'error';
    if (typeof showToast === 'function') showToast('Slack post failed: ' + e.message, 'er');
    renderAll();
  });
}

// ── Trends View ──────────────────────────────────────────────
function renderNewsTrends() {
  var t = state.newsTrends;
  if (!t) return '<div class="ca-main"><div class="ca-header"><h2>Trending Topics</h2></div>'
    + '<div class="c-stack" style="padding:var(--sp4) 0">'
    +   '<div class="c-skel-card"><div class="c-skel c-skel-line" style="width:60%"></div><div class="c-skel c-skel-line-sm" style="width:30%;margin-top:8px"></div></div>'
    +   '<div class="c-skel-card"><div class="c-skel c-skel-line" style="width:55%"></div><div class="c-skel c-skel-line-sm" style="width:25%;margin-top:8px"></div></div>'
    +   '<div class="c-skel-card"><div class="c-skel c-skel-line" style="width:70%"></div><div class="c-skel c-skel-line-sm" style="width:35%;margin-top:8px"></div></div>'
    + '</div></div>';

  var html = '<div class="ca-main"><div class="ca-header"><h2>Trending Topics</h2></div>';

  // Emerging
  if (t.emerging && t.emerging.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--gn)">&#9650; Emerging</div><div class="nw-trend-list">';
    t.emerging.forEach(function(tp) { html += _nTrendChip(tp, 'var(--gn)'); });
    html += '</div></div>';
  }

  // Trending
  if (t.trending && t.trending.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--ac)">&#10548; Trending</div><div class="nw-trend-list">';
    t.trending.forEach(function(tp) { html += _nTrendChip(tp, 'var(--ac)'); });
    html += '</div></div>';
  }

  // All topics
  if (t.topics && t.topics.length) {
    html += '<div class="ca-section"><div class="ca-section-title">All Topics (last 14 days)</div><div class="nw-trend-list">';
    t.topics.forEach(function(tp) {
      var color = tp.status === 'emerging' ? 'var(--gn)' : tp.status === 'trending' ? 'var(--ac)' : tp.status === 'declining' ? 'var(--rd)' : 'var(--tx3)';
      html += _nTrendChip(tp, color);
    });
    html += '</div></div>';
  }

  // Declining
  if (t.declining && t.declining.length) {
    html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--rd)">&#9660; Declining</div><div class="nw-trend-list">';
    t.declining.forEach(function(tp) { html += _nTrendChip(tp, 'var(--rd)'); });
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

function _nTrendChip(tp, color) {
  var arrow = tp.delta > 0 ? '&#9650;' : tp.delta < 0 ? '&#9660;' : '';
  return '<div class="nw-trend-chip" onclick="state.newsSearch=\'' + _nEnc(tp.topic) + '\';state.newsCategory=\'all\';state.newsPage=1;renderAll()">' +
    '<span class="nw-trend-name">' + _nEnc(tp.topic) + '</span>' +
    '<span class="nw-trend-count">' + tp.thisWeek + '</span>' +
    (tp.delta !== 0 ? '<span style="color:' + color + ';font-size:10px">' + arrow + ' ' + Math.abs(tp.delta) + '%</span>' : '') +
  '</div>';
}

// ── Competitors View ─────────────────────────────────────────
function renderNewsCompetitors() {
  var alerts = DATA.news ? DATA.news.competitorAlerts || [] : [];

  var html = '<div class="ca-main"><div class="ca-header"><h2>Competitor Intelligence</h2></div>';

  if (!alerts.length) {
    html += '<div class="c-empty" style="padding:var(--sp6)">'
      + '<div class="c-empty-icon">\u2705</div>'
      + '<div class="c-empty-title">No competitor alerts</div>'
      + '<div class="c-empty-body">Run a refresh to scan latest articles for competitor movement.</div>'
      + '</div>';
    html += '</div>';
    return html;
  }

  // Group by competitor
  var byComp = {};
  alerts.forEach(function(a) {
    if (!byComp[a.competitor]) byComp[a.competitor] = [];
    byComp[a.competitor].push(a);
  });

  for (var comp in byComp) {
    var compAlerts = byComp[comp];
    var critCount = compAlerts.filter(function(a){return a.severity === 'critical';}).length;
    html += '<div class="ca-section">' +
      '<div class="ca-section-title">' + _nEnc(comp) +
      (critCount > 0 ? ' <span class="ca-action-badge">' + critCount + ' critical</span>' : '') +
      ' <span style="font-weight:normal;color:var(--tx3)">(' + compAlerts.length + ' alerts)</span></div>';

    compAlerts.forEach(function(a) {
      var sevColor = a.severity === 'critical' ? 'var(--rd)' : a.severity === 'warning' ? 'var(--or)' : 'var(--ac)';
      html += '<div class="nw-comp-alert">' +
        '<span class="nw-comp-sev" style="background:' + sevColor + '">' + _nEnc(a.severity) + '</span>' +
        '<span class="nw-comp-title">' + _nEnc(a.title) + '</span>' +
        '<span class="nw-comp-type">' + _nEnc(a.alert_type || '') + '</span>' +
        '<span class="nw-comp-time">' + _nTimeAgo(a.detected_at) + '</span>' +
      '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── Detail Panel ─────────────────────────────────────────────
function openNewsDetail(id) {
  var a = (DATA.news && DATA.news.articles || []).find(function(x){return x.id===id;});
  if (!a) return;
  state.selectedNewsItem = id;
  markNewsRead(id);
  if (typeof trackInteraction === 'function') trackInteraction('news_view', 'news', id);

  var relPct = Math.round((a.relevanceScore || 0) * 100);
  var relColor = relPct > 60 ? 'var(--gn)' : relPct > 30 ? 'var(--or)' : 'var(--tx3)';
  var imgSrc = a.image || _nPlaceholder(a.category);

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
    transcriptHtml = '<div class="news-detail-section" id="transcript-section">' +
      '<div class="news-detail-section-header">' +
      '<span>&#128221; Transcript</span>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-sm" id="transcript-btn" onclick="event.stopPropagation();loadTranscript(\'' + videoId + '\')">Load</button>' +
        '<button class="btn btn-sm" id="transcript-paste-toggle" onclick="event.stopPropagation();toggleTranscriptPaste(\'' + videoId + '\')" style="border-color:var(--bd2)" title="Paste transcript manually">Paste</button>' +
      '</div>' +
      '</div>' +
      '<div id="transcript-content" class="news-transcript-body" style="display:none"></div>' +
      '<div id="transcript-paste-area" style="display:none;padding:var(--sp3)">' +
        '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2)">Copy the transcript from YouTube (click <b>...</b> &gt; <b>Show transcript</b> on the video page) and paste below:</div>' +
        '<textarea id="transcript-paste-input" style="width:100%;min-height:120px;padding:var(--sp2);border:1px solid var(--bd);border-radius:var(--r2);background:var(--bg2);color:var(--tx);font-size:var(--f-sm);resize:vertical" placeholder="0:00\nHello and welcome...\n0:15\nToday we are going to..."></textarea>' +
        '<div style="display:flex;gap:6px;margin-top:var(--sp2)">' +
          '<button class="btn btn-sm" onclick="submitPastedTranscript(\'' + videoId + '\')">Save Transcript</button>' +
          '<button class="btn btn-sm" style="border-color:var(--bd2)" onclick="toggleTranscriptPaste()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // AI Summary section — prefer enriched summary
  var aiHtml = '';
  var displaySummary = a.aiEnrichedSummary || a.aiSummary;
  if (displaySummary) {
    aiHtml = '<div class="ca-narrative" style="margin:var(--sp3) 0">' +
      '<div class="ca-narrative-label">AI Summary</div><p>' + _nEnc(displaySummary) + '</p></div>';
  }
  if (a.beanzImpact) {
    aiHtml += '<div class="ca-narrative" style="margin:var(--sp3) 0;border-left-color:var(--gn);background:var(--gnbg)">' +
      '<div class="ca-narrative-label" style="color:var(--gn)">Beanz Impact</div><p>' + _nEnc(a.beanzImpact) + '</p></div>';
  }

  // Sentiment + Category enrichment row
  var enrichRow = '';
  if (a.sentiment || a.category_classification || (a.brand_tags && a.brand_tags.length)) {
    enrichRow = '<div class="nw-detail-enrich">';
    if (a.sentiment) {
      var dSentChar = a.sentiment === 'positive' ? '&#9650;' : a.sentiment === 'negative' ? '&#9660;' : a.sentiment === 'mixed' ? '&#9670;' : '&#9679;';
      var dSentColor = a.sentiment === 'positive' ? 'var(--gn)' : a.sentiment === 'negative' ? 'var(--rd)' : a.sentiment === 'mixed' ? 'var(--or)' : 'var(--tx3)';
      var scoreLabel = a.sentiment_score != null ? ' (' + (a.sentiment_score > 0 ? '+' : '') + a.sentiment_score.toFixed(1) + ')' : '';
      enrichRow += '<span class="nw-detail-sent" style="color:' + dSentColor + '">' + dSentChar + ' ' + _nEnc(a.sentiment) + scoreLabel + '</span>';
    }
    if (a.category_classification) {
      enrichRow += '<span class="nw-cat-badge" style="margin-left:var(--sp2)">' + _nEnc(_nCatLabel(a.category_classification)) + '</span>';
    }
    if (a.brand_tags && a.brand_tags.length) {
      enrichRow += '<span style="margin-left:var(--sp2)">' + a.brand_tags.map(function(b) {
        return '<span class="nw-brand-pill nw-brand-' + _nEnc(b.replace(/[^a-z]/g, '')) + '">' + _nEnc(b) + '</span>';
      }).join('') + '</span>';
    }
    enrichRow += '</div>';
  }
  aiHtml += enrichRow;

  // AI Topics
  var topicsHtml = '';
  if (a.aiTopics && a.aiTopics.length) {
    topicsHtml = '<div style="margin:var(--sp2) 0">' + a.aiTopics.map(function(t){return '<span class="ca-topic-chip">' + _nEnc(t) + '</span>';}).join(' ') + '</div>';
  } else if (a.tags && a.tags.length) {
    topicsHtml = '<div style="margin:var(--sp2) 0">' + a.tags.map(function(t){return '<span class="tag">' + _nEnc(t) + '</span>';}).join(' ') + '</div>';
  }

  // Engagement
  var engHtml = '';
  if (a.engagement && a.engagement.redditScore) engHtml = '<div class="news-detail-eng">Reddit: &#9650;' + a.engagement.redditScore + ' &middot; ' + a.engagement.redditComments + ' comments</div>';
  if (a.engagement && a.engagement.youtubeViews) engHtml = '<div class="news-detail-eng">YouTube: &#9654;' + _nFmt(a.engagement.youtubeViews) + ' views</div>';

  var html = '<div class="news-detail">' +
    (!a.videoId ? '<div class="news-detail-hero"><img src="' + imgSrc + '" alt="" onerror="this.style.display=\'none\'" /></div>' : '') +
    embedHtml +
    '<div class="news-detail-body">' +
      '<div class="news-detail-badges"><span class="news-source-badge news-badge-' + a.category + '">' + _nEnc(a.category) + '</span><span class="news-detail-source">' + _nEnc(a.sourceName || a.source) + '</span></div>' +
      '<a href="' + _nEnc(a.url) + '" target="_blank" rel="noopener" class="news-detail-title">' + _nEnc(a.title) + '</a>' +
      '<div class="news-detail-meta">' + _nEnc(a.author || 'Unknown') + ' &middot; ' + new Date(a.publishedAt).toLocaleDateString() + ' &middot; ' + _nTimeAgo(a.publishedAt) + '</div>' +
      aiHtml +
      '<div class="news-detail-summary">' + _nEnc(a.summary || 'No summary available.') + '</div>' +
      '<div class="news-detail-relevance"><span class="news-rel-label">Relevance</span><div class="news-rel-track" style="height:6px"><div class="news-rel-fill" style="width:' + relPct + '%;height:100%;background:' + relColor + '"></div></div><span style="font-size:var(--f-sm);font-weight:var(--fw-sb)">' + relPct + '%</span></div>' +
      topicsHtml + engHtml + transcriptHtml +
      // Note section
      '<div class="nw-note-section"><label style="font-size:var(--f-xs);color:var(--tx3)">Personal Note</label>' +
        '<textarea class="nw-note-input" placeholder="Add a note..." onblur="saveNewsNote(\'' + a.id + '\',this.value)">' + _nEnc(_getNewsNote(a.id)) + '</textarea></div>' +
      // Share + open
      '<div style="display:flex;gap:var(--sp2);margin-top:var(--sp3)">' +
        '<a href="' + _nEnc(a.url) + '" target="_blank" rel="noopener" class="btn news-detail-open">Open Source &#8599;</a>' +
        '<button class="btn" onclick="shareNewsToSlack(\'' + a.id + '\')">Share to Slack</button>' +
      '</div>' +
      '<div class="cor-feedback news-detail-fb">' +
        '<button class="fb-btn fb-up" onclick="sendFeedback(\'news\',\'' + a.id + '\',\'up\')">&#9650;</button>' +
        '<button class="fb-btn fb-down" onclick="sendFeedback(\'news\',\'' + a.id + '\',\'down\')">&#9660;</button>' +
        '<button class="fb-btn fb-pin" onclick="sendFeedback(\'news\',\'' + a.id + '\',\'pin\')">&#9733; Pin</button>' +
        '<button class="fb-btn fb-dismiss" onclick="sendFeedback(\'news\',\'' + a.id + '\',\'dismiss\');closePanel()">&#10005; Dismiss</button>' +
      '</div>' +
    '</div></div>';

  openPanel(_nEnc(a.title).slice(0, 60), html);
}

// ── Notes ────────────────────────────────────────────────────
var _newsNotesCache = {};
function _getNewsNote(id) { return _newsNotesCache[id] || ''; }
function saveNewsNote(id, text) {
  _newsNotesCache[id] = text;
  fetch('/api/news/note/' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: text })
  }).catch(function(){});
}
// Load notes on init
fetch('/api/news/notes').then(function(r){return r.json();}).then(function(d) {
  if (d.notes) _newsNotesCache = d.notes;
}).catch(function(){});

// ── Share to Slack ───────────────────────────────────────────
function shareNewsToSlack(id) {
  var a = (DATA.news && DATA.news.articles || []).find(function(x){return x.id===id;});
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
async function loadTranscript(videoId) {
  var btn = document.getElementById('transcript-btn');
  var content = document.getElementById('transcript-content');
  var pasteToggle = document.getElementById('transcript-paste-toggle');
  if (!btn || !content) return;
  btn.textContent = 'Loading...'; btn.disabled = true;
  content.style.display = 'block';
  content.innerHTML = '<div style="color:var(--tx3);padding:var(--sp3)">Fetching transcript...</div>';
  try {
    var resp = await fetch('/api/news/transcript/' + videoId);
    var data = await resp.json();
    if (data.error || !data.segments || !data.segments.length) {
      // Show failure with manual paste prompt
      content.innerHTML = '<div class="news-transcript-empty">' +
        '<div style="margin-bottom:var(--sp2)">&#9888; ' + _nEnc(data.error || 'No transcript available') + '</div>' +
        '<div style="font-size:var(--f-xs);color:var(--tx3)">Click <b>Paste</b> above to add a transcript manually from YouTube.</div>' +
      '</div>';
      btn.textContent = 'Retry'; btn.disabled = false;
      if (pasteToggle) pasteToggle.style.display = '';
      return;
    }
    _renderTranscriptContent(videoId, data, content);
    btn.textContent = 'Loaded';
    if (pasteToggle) pasteToggle.style.display = 'none';
  } catch (e) {
    content.innerHTML = '<div class="news-transcript-empty">&#10060; Failed: ' + _nEnc(e.message) + '</div>';
    btn.textContent = 'Retry'; btn.disabled = false;
  }
}

function _renderTranscriptContent(videoId, data, container) {
  var durMins = Math.floor(data.duration / 60), durSecs = Math.floor(data.duration % 60);
  var sourceTag = data.source === 'manual' ? ' <span style="color:var(--or);font-size:10px">(pasted)</span>' : '';

  var tHtml = '<div class="news-transcript-header">' +
    '<span>&#128221; ' + data.segmentCount + ' segments &middot; ' + durMins + 'm ' + durSecs + 's' + sourceTag + '</span>' +
    '<div style="display:flex;gap:6px">' +
      '<button class="btn btn-sm" onclick="summarizeTranscript(\'' + videoId + '\')" id="transcript-summarize-btn" title="AI Summary">&#10024; Summarize</button>' +
      '<button class="btn btn-sm" onclick="copyTranscriptText(\'' + videoId + '\')" title="Copy full text">&#128203; Copy</button>' +
    '</div></div>';

  // AI summary (if already generated)
  if (data.aiSummary) {
    tHtml += _renderTranscriptAiSummary(data.aiSummary);
  }

  tHtml += '<div class="news-transcript-summary"><strong>Preview:</strong> ' + _nEnc(data.summary) + '</div>';

  // Search
  tHtml += '<div style="margin:var(--sp2) 0"><input class="filter-input" placeholder="Search transcript..." id="transcript-search" oninput="_filterTranscriptChunks(this.value)" style="width:100%;font-size:var(--f-xs)"/></div>';

  tHtml += '<div class="news-transcript-segments" id="transcript-segments">';
  var chunkStart = 0, chunkText = '';
  data.segments.forEach(function(seg, i) {
    if (i === 0) chunkStart = seg.start;
    chunkText += seg.text + ' ';
    var nextStart = (data.segments[i + 1] || {}).start || Infinity;
    if (nextStart - chunkStart >= 30 || i === data.segments.length - 1) {
      var ts = Math.floor(chunkStart / 60) + ':' + Math.floor(chunkStart % 60).toString().padStart(2, '0');
      tHtml += '<div class="news-transcript-chunk" data-text="' + _nEnc(chunkText.trim().toLowerCase()) + '"><a href="https://www.youtube.com/watch?v=' + videoId + '&t=' + Math.floor(chunkStart) + '" target="_blank" rel="noopener" class="news-ts-link">' + ts + '</a><span class="news-ts-text">' + _nEnc(chunkText.trim()) + '</span></div>';
      chunkText = ''; chunkStart = nextStart;
    }
  });
  tHtml += '</div>';
  container.innerHTML = tHtml;

  // Store text for copy
  container.dataset.fullText = data.text || '';
}

function _renderTranscriptAiSummary(ai) {
  var html = '<div class="ca-narrative" style="margin:var(--sp2) 0;border-left-color:var(--ac)">';
  if (ai.headline) html += '<div style="font-weight:var(--fw-sb);margin-bottom:4px">' + _nEnc(ai.headline) + '</div>';
  if (ai.bullets && ai.bullets.length) {
    html += '<ul style="margin:4px 0;padding-left:16px">';
    ai.bullets.forEach(function(b) { html += '<li style="font-size:var(--f-sm);margin-bottom:2px">' + _nEnc(b) + '</li>'; });
    html += '</ul>';
  }
  if (ai.beanz_relevance) html += '<div style="font-size:var(--f-xs);color:var(--gn);margin-top:4px"><b>Beanz:</b> ' + _nEnc(ai.beanz_relevance) + '</div>';
  if (ai.topics && ai.topics.length) {
    html += '<div style="margin-top:4px">';
    ai.topics.forEach(function(t) { html += '<span class="ca-topic-chip">' + _nEnc(t) + '</span> '; });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function _filterTranscriptChunks(query) {
  var chunks = document.querySelectorAll('#transcript-segments .news-transcript-chunk');
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

function toggleTranscriptPaste(videoId) {
  var area = document.getElementById('transcript-paste-area');
  if (!area) return;
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

async function submitPastedTranscript(videoId) {
  var input = document.getElementById('transcript-paste-input');
  var content = document.getElementById('transcript-content');
  if (!input || !input.value.trim()) {
    if (typeof showToast === 'function') showToast('Please paste transcript text first');
    return;
  }
  try {
    var resp = await fetch('/api/news/transcript/' + videoId + '/manual', {
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
    var area = document.getElementById('transcript-paste-area');
    if (area) area.style.display = 'none';
    content.style.display = 'block';
    _renderTranscriptContent(videoId, data, content);
    var btn = document.getElementById('transcript-btn');
    if (btn) { btn.textContent = 'Loaded'; btn.disabled = true; }
    if (typeof showToast === 'function') showToast('Transcript saved (' + data.segmentCount + ' segments)');
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed to save: ' + e.message);
  }
}

async function summarizeTranscript(videoId) {
  var btn = document.getElementById('transcript-summarize-btn');
  if (!btn) return;
  btn.textContent = 'Summarizing...'; btn.disabled = true;
  try {
    var resp = await fetch('/api/news/transcript/' + videoId + '/summarize', {
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
      div.innerHTML = _renderTranscriptAiSummary(data);
      header.after(div.firstChild);
    }
    btn.textContent = '&#10004; Summarized'; btn.disabled = true;
  } catch (e) {
    if (typeof showToast === 'function') showToast('Failed: ' + e.message);
    btn.textContent = '&#10024; Summarize'; btn.disabled = false;
  }
}

function copyTranscriptText(videoId) {
  var content = document.getElementById('transcript-content');
  var text = content ? content.dataset.fullText : '';
  if (!text) { if (typeof showToast === 'function') showToast('No text to copy'); return; }
  navigator.clipboard.writeText(text).then(function() {
    if (typeof showToast === 'function') showToast('Transcript copied to clipboard');
  }).catch(function() {
    if (typeof showToast === 'function') showToast('Copy failed');
  });
}

// ── Chat View ───────────────────────────────────────────────
function renderNewsChat() {
  var html = '<div class="ca-main" style="display:flex;flex-direction:column;height:100%;padding:0">';

  // Header
  html += '<div class="ca-header" style="padding:var(--sp3) var(--sp4);border-bottom:1px solid var(--bd);flex-shrink:0">' +
    '<h2 style="margin:0;display:flex;align-items:center;gap:var(--sp2)">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
      'News Chat' +
    '</h2>' +
    '<button class="btn btn-sm" onclick="state.newsChatHistory=[];renderAll()" style="font-size:var(--f-xs)">Clear Chat</button>' +
  '</div>';

  // Messages area
  html += '<div class="nw-chat-messages" id="nw-chat-messages" style="flex:1;overflow-y:auto;padding:var(--sp4);display:flex;flex-direction:column;gap:var(--sp3)">';

  if (!state.newsChatHistory.length) {
    html += '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:var(--tx3);text-align:center;padding:var(--sp6)">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3;margin-bottom:var(--sp3)"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
      '<div style="font-size:var(--f-lg);margin-bottom:var(--sp2)">Ask anything about the news</div>' +
      '<div style="font-size:var(--f-sm);max-width:400px">I have access to all articles, YouTube transcripts, Reddit discussions, and AI summaries. Try asking about trends, competitor activity, or coffee industry developments.</div>' +
    '</div>';
  } else {
    state.newsChatHistory.forEach(function(msg) {
      if (msg.role === 'user') {
        html += '<div class="nw-chat-msg nw-chat-user">' +
          '<div class="nw-chat-bubble nw-chat-bubble-user">' + _nEnc(msg.content) + '</div>' +
        '</div>';
      } else {
        html += '<div class="nw-chat-msg nw-chat-assistant">' +
          '<div class="nw-chat-bubble nw-chat-bubble-assistant">' + _nChatFormatResponse(msg.content) + '</div>';
        if (msg.sources && msg.sources.length) {
          html += '<div class="nw-chat-sources">';
          msg.sources.forEach(function(s) {
            html += '<a href="' + _nEnc(s.url || '#') + '" target="_blank" rel="noopener" class="nw-chat-source-link">' +
              _nEnc(s.title || 'Source') +
              (s.date ? ' <span class="nw-chat-source-date">' + _nTimeAgo(s.date) + '</span>' : '') +
            '</a>';
          });
          html += '</div>';
        }
        html += '</div>';
      }
    });
  }

  if (state.newsChatLoading) {
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
      '<textarea id="nw-chat-input" class="nw-chat-textarea" placeholder="Ask about news, trends, videos..." rows="1" ' +
        'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendNewsChat()}" ' +
        'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'"' +
      '></textarea>' +
      '<button class="nw-chat-send-btn" onclick="sendNewsChat()" id="nw-chat-send"' +
        (state.newsChatLoading ? ' disabled' : '') + '>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9"/></svg>' +
      '</button>' +
    '</div>' +
  '</div>';

  html += '</div>';
  return html;
}

function _nChatFormatResponse(text) {
  if (!text) return '';
  // Convert markdown-like formatting to HTML
  var html = _nEnc(text);
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

function _newsChatScrollToBottom() {
  setTimeout(function() {
    var el = document.getElementById('nw-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function sendNewsChat() {
  var input = document.getElementById('nw-chat-input');
  if (!input) return;
  var message = input.value.trim();
  if (!message || state.newsChatLoading) return;

  // Add user message to history
  state.newsChatHistory = state.newsChatHistory.concat([{ role: 'user', content: message }]);
  state.newsChatLoading = true;
  input.value = '';
  input.style.height = 'auto';
  renderNewsMain();

  // Build history for API (only role + content)
  var apiHistory = state.newsChatHistory.slice(0, -1).map(function(m) {
    return { role: m.role, content: m.content };
  });

  fetch('/api/news/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, history: apiHistory })
  }).then(function(r) { return r.json(); }).then(function(data) {
    state.newsChatLoading = false;
    if (data.error) {
      state.newsChatHistory = state.newsChatHistory.concat([{
        role: 'assistant',
        content: 'Error: ' + data.error,
        sources: []
      }]);
    } else {
      state.newsChatHistory = state.newsChatHistory.concat([{
        role: 'assistant',
        content: data.response || 'No response received.',
        sources: data.sources || []
      }]);
    }
    renderNewsMain();
  }).catch(function(e) {
    state.newsChatLoading = false;
    state.newsChatHistory = state.newsChatHistory.concat([{
      role: 'assistant',
      content: 'Failed to connect: ' + e.message,
      sources: []
    }]);
    renderNewsMain();
  });
}

// ── UI Helpers ───────────────────────────────────────────────
function _nSortPicker() {
  var s = state.newsSort || 'date';
  return '<div class="ca-date-picker">' +
    '<button class="ca-day-btn' + (s === 'date' ? ' active' : '') + '" onclick="state.newsSort=\'date\';state.newsPage=1;renderNewsMain()">Latest</button>' +
    '<button class="ca-day-btn' + (s === 'relevance' ? ' active' : '') + '" onclick="state.newsSort=\'relevance\';state.newsPage=1;renderNewsMain()">Relevant</button>' +
    '<button class="ca-day-btn' + (s === 'engagement' ? ' active' : '') + '" onclick="state.newsSort=\'engagement\';state.newsPage=1;renderNewsMain()">Popular</button>' +
    '</div>';
}

function _nViewToggle() {
  var m = state.newsViewMode || 'cards';
  return '<div class="ca-date-picker">' +
    '<button class="ca-day-btn' + (m === 'cards' ? ' active' : '') + '" onclick="state.newsViewMode=\'cards\';renderNewsMain()" title="Cards">&#9638;</button>' +
    '<button class="ca-day-btn' + (m === 'compact' ? ' active' : '') + '" onclick="state.newsViewMode=\'compact\';renderNewsMain()" title="Compact">&#9776;</button>' +
    '<button class="ca-day-btn' + (m === 'headlines' ? ' active' : '') + '" onclick="state.newsViewMode=\'headlines\';renderNewsMain()" title="Headlines">&#9472;</button>' +
    '</div>';
}

function _nDateFilter() {
  var r = state.newsDateRange || 'all';
  return '<div class="ca-date-picker" style="margin-left:4px">' +
    ['all','today','week','month'].map(function(d) {
      var label = d === 'all' ? 'All' : d === 'today' ? '24h' : d === 'week' ? '7d' : '30d';
      return '<button class="ca-day-btn' + (r === d ? ' active' : '') + '" onclick="state.newsDateRange=\'' + d + '\';state.newsPage=1;renderNewsMain()">' + label + '</button>';
    }).join('') +
    '</div>';
}

function _nStatChip(val, label) {
  return '<div class="stat-chip"><span class="stat-n">' + val + '</span><span class="stat-l">' + label + '</span></div>';
}

function _nPlaceholder(cat) {
  var icons = { industry: '%E2%98%95', reddit: '%F0%9F%97%A8', youtube: '%E2%96%B6', competitors: '%F0%9F%8E%AF' };
  var icon = icons[cat] || '%F0%9F%93%B0';
  var colors = { industry: ['%23e8f4fd','%233b82f6'], reddit: ['%23fff3e0','%23ff6b00'], youtube: ['%23fce4ec','%23dc2626'], competitors: ['%23f3e5f5','%239333ea'] };
  var c = colors[cat] || ['%23f5f5f5','%23888'];
  return "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='" + c[0] + "'/><text x='50%25' y='50%25' text-anchor='middle' dominant-baseline='central' font-size='48'>" + icon + "</text></svg>";
}

// ===============================================================
// NEWS SETTINGS — Manage Sources
// ===============================================================

var _newsSourcesCache = null;

function _loadNewsSources(cb) {
  fetch('/api/news/sources').then(function(r){return r.json();}).then(function(d) {
    _newsSourcesCache = d.sources || {};
    if (cb) cb();
  }).catch(function(){});
}

function renderNewsSettings() {
  if (!_newsSourcesCache) {
    _loadNewsSources(function() { renderNewsMain(); });
    return '<div class="ca-main"><div class="ca-loading"><div class="ca-spinner"></div><p>Loading source settings...</p></div></div>';
  }

  var src = _newsSourcesCache;
  var html = '<div class="ca-main">';
  html += '<div class="ca-header"><h2>Manage News Sources</h2>' +
    '<button class="btn btn-sm" onclick="state.newsCategory=\'all\';renderAll()">&#8592; Back to Feed</button></div>';

  // ── Reddit Subreddits ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--or)">Reddit Subreddits</div>';
  html += '<div class="nw-src-list">';
  if (src.reddit) {
    Object.keys(src.reddit).forEach(function(key) {
      var s = src.reddit[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">r/' + _nEnc(s.subreddit) + '</span>' +
        '<span class="nw-src-key">' + _nEnc(key) + '</span>' +
        '<button class="nw-src-remove" onclick="removeNewsSource(\'reddit\',\'' + _nEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="nw-add-reddit" class="nw-src-input" placeholder="Enter subreddit name (e.g. CoffeeGear)" />' +
    '<button class="btn btn-sm" onclick="addRedditSource()">Add Subreddit</button>' +
  '</div></div>';

  // ── YouTube Channels ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--rd)">YouTube Channels</div>';
  html += '<div class="nw-src-list">';
  if (src.youtube) {
    Object.keys(src.youtube).forEach(function(key) {
      var s = src.youtube[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">' + _nEnc(s.name) + '</span>' +
        '<span class="nw-src-key">' + _nEnc(s.channelId || '') + '</span>' +
        '<button class="nw-src-remove" onclick="removeNewsSource(\'youtube\',\'' + _nEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="nw-add-yt-name" class="nw-src-input" placeholder="Channel name (e.g. Kyle Rowsell)" style="flex:1" />' +
    '<input id="nw-add-yt-id" class="nw-src-input" placeholder="@handle, URL, or channel ID" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addYouTubeSource()">Add Channel</button>' +
  '</div>' +
  '<div style="font-size:10px;color:var(--tx3);margin-top:4px">Enter a @handle (e.g. @JamesHoffmann), channel URL, or UC... channel ID. The handle will be auto-resolved.</div>' +
  '</div>';

  // ── Podcasts (YouTube-based) ──
  html += '<div class="ca-section"><div class="ca-section-title" style="color:var(--gn)">Podcasts <span style="font-size:10px;font-weight:400;color:var(--tx3)">(via YouTube)</span></div>';
  html += '<div class="nw-src-list">';
  if (src.podcasts) {
    Object.keys(src.podcasts).forEach(function(key) {
      var s = src.podcasts[key];
      html += '<div class="nw-src-item">' +
        '<span class="nw-src-name">' + _nEnc(s.name) + '</span>' +
        '<span class="nw-src-key">' + _nEnc(s.channelId || '') + '</span>' +
        '<button class="nw-src-remove" onclick="removeNewsSource(\'podcasts\',\'' + _nEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  if (!src.podcasts || !Object.keys(src.podcasts).length) {
    html += '<div style="font-size:var(--f-xs);color:var(--tx3);padding:8px 0">No podcasts configured. Add a podcast YouTube channel below.</div>';
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="nw-add-pod-name" class="nw-src-input" placeholder="Podcast name (e.g. Cat & Cloud)" style="flex:1" />' +
    '<input id="nw-add-pod-id" class="nw-src-input" placeholder="@handle, URL, or channel ID" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addPodcastSource()">Add Podcast</button>' +
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
        '<span class="nw-src-name">' + _nEnc(s.name) + '</span>' +
        '<span class="nw-src-key" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + _nEnc(s.url) + '</span>' +
        '<button class="nw-src-remove" onclick="removeNewsSource(\'rss\',\'' + _nEnc(key) + '\')" title="Remove">&#10005;</button>' +
      '</div>';
    });
  }
  html += '</div>';
  html += '<div class="nw-src-add">' +
    '<input id="nw-add-rss-name" class="nw-src-input" placeholder="Site name" style="flex:0.5" />' +
    '<input id="nw-add-rss-url" class="nw-src-input" placeholder="RSS feed URL (e.g. https://example.com/feed/)" style="flex:1" />' +
    '<button class="btn btn-sm" onclick="addRSSSource()">Add Website</button>' +
  '</div></div>';

  // ── Actions ──
  html += '<div class="ca-section" style="display:flex;gap:var(--sp3);flex-wrap:wrap">' +
    '<button class="btn" onclick="refreshNews();if(typeof showToast===\'function\')showToast(\'Refreshing with updated sources...\')">Refresh Now with New Sources</button>' +
    '<button class="btn" style="color:var(--tx3)" onclick="resetNewsSourcesDefaults()">Reset to Defaults</button>' +
  '</div>';

  html += '</div>';
  return html;
}

function addRedditSource() {
  var input = document.getElementById('nw-add-reddit');
  if (!input || !input.value.trim()) return;
  var sub = input.value.trim().replace(/^r\//, '');
  fetch('/api/news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'reddit', subreddit: sub, name: sub })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added r/' + sub + ' — refreshing feeds...');
      renderAll();
      _reloadNewsAfterSourceChange();
    }
  }).catch(function(){});
}

function addYouTubeSource() {
  var nameEl = document.getElementById('nw-add-yt-name');
  var idEl = document.getElementById('nw-add-yt-id');
  if (!nameEl || !idEl || !nameEl.value.trim() || !idEl.value.trim()) return;
  var name = nameEl.value.trim();
  var channelId = idEl.value.trim();
  fetch('/api/news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'youtube', name: name, channelId: channelId })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added YouTube: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadNewsAfterSourceChange();
    }
  }).catch(function(){});
}

function addPodcastSource() {
  var nameEl = document.getElementById('nw-add-pod-name');
  var idEl = document.getElementById('nw-add-pod-id');
  if (!nameEl || !idEl || !nameEl.value.trim() || !idEl.value.trim()) return;
  var name = nameEl.value.trim();
  var channelId = idEl.value.trim();
  fetch('/api/news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'podcast', name: name, channelId: channelId })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added podcast: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadNewsAfterSourceChange();
    } else if (d.error) {
      if (typeof showToast === 'function') showToast(d.error, 'error');
    }
  }).catch(function(){});
}

function addRSSSource() {
  var nameEl = document.getElementById('nw-add-rss-name');
  var urlEl = document.getElementById('nw-add-rss-url');
  if (!nameEl || !urlEl || !nameEl.value.trim() || !urlEl.value.trim()) return;
  var name = nameEl.value.trim();
  var url = urlEl.value.trim();
  fetch('/api/news/sources/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rss', name: name, url: url })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Added RSS: ' + name + ' — refreshing feeds...');
      renderAll();
      _reloadNewsAfterSourceChange();
    }
  }).catch(function(){});
}

/** Reload news data after a source change — polls until refresh completes */
function _reloadNewsAfterSourceChange() {
  // Give the server a few seconds to fetch from the new source, then reload
  setTimeout(function() {
    DATA.news = null;
    loadNewsData();
    if (typeof showToast === 'function') showToast('Feed updated with new sources');
  }, 4000);
}

function removeNewsSource(type, key) {
  fetch('/api/news/sources/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type, key: key })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Removed ' + key);
      renderAll();
    }
  }).catch(function(){});
}

function resetNewsSourcesDefaults() {
  fetch('/api/news/sources', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rss: {
        dailycoffeenews: { url: 'https://dailycoffeenews.com/feed/', name: 'Daily Coffee News' },
        sprudge: { url: 'https://sprudge.com/feed', name: 'Sprudge' },
        perfectdailygrind: { url: 'https://perfectdailygrind.com/feed/', name: 'Perfect Daily Grind' },
        worldcoffeeportal: { url: 'https://www.worldcoffeeportal.com/Latest/News?format=feed&type=rss', name: 'World Coffee Portal' },
        baristamagazine: { url: 'https://www.baristamagazine.com/feed/', name: 'Barista Magazine' }
      },
      reddit: {
        coffee: { subreddit: 'coffee', name: 'r/coffee' },
        espresso: { subreddit: 'espresso', name: 'r/espresso' },
        roasting: { subreddit: 'roasting', name: 'r/roasting' }
      },
      youtube: {
        jameshoffmann: { channelId: 'UCMb0O2CdPBNi-QqPk5T3gsQ', name: 'James Hoffmann' },
        lancehedrick: { channelId: 'UCvNpZQzurSNZQ8e2QNGNXsA', name: 'Lance Hedrick' },
        sprometheus: { channelId: 'UCiolFxnJSOPMmV1mh9EYyIQ', name: 'Sprometheus' }
      }
    })
  }).then(function(r){return r.json();}).then(function(d) {
    if (d.ok) {
      _newsSourcesCache = d.sources;
      if (typeof showToast === 'function') showToast('Sources reset to defaults');
      renderAll();
    }
  }).catch(function(){});
}

// ===============================================================
// COFFEE RESEARCH — Deep Coffee Industry Analysis
// ===============================================================
if (!state.coffeeResearch) state.coffeeResearch = null;
if (!state.coffeeResearchStatus) state.coffeeResearchStatus = null;
if (!state.coffeeResearchPeriod) state.coffeeResearchPeriod = 'daily';

function loadCoffeeResearch(force) {
  var period = state.coffeeResearchPeriod || 'daily';
  if (force) {
    state.coffeeResearch = { loading: true }; renderAll();
    fetch('/api/news/research/generate?period=' + period, { method: 'POST' }).then(function(r){return r.json();}).then(function(d) {
      if (d.ok) { if (typeof showToast === 'function') showToast('Coffee research generating...'); _pollCoffeeResearch(); }
      else if (d.error) { state.coffeeResearch = { error: d.error }; renderAll(); }
    }).catch(function(e) { state.coffeeResearch = { error: e.message }; renderAll(); });
  } else {
    state.coffeeResearch = { loading: true }; renderAll();
    fetch('/api/news/research?period=' + period).then(function(r){return r.json();}).then(function(d) {
      if (d.generating) { state.coffeeResearch = { loading: true }; _pollCoffeeResearch(); }
      else if (d.report) { state.coffeeResearch = d; }
      else if (d.error) { state.coffeeResearch = { error: d.error }; }
      else { state.coffeeResearch = null; }
      renderAll();
    }).catch(function(e) { state.coffeeResearch = { error: e.message }; renderAll(); });
  }
}

function _pollCoffeeResearch() {
  var poll = setInterval(function() {
    fetch('/api/news/research/status').then(function(r){return r.json();}).then(function(d) {
      state.coffeeResearchStatus = d;
      if (!d.generating) {
        clearInterval(poll);
        // Notify about podcast transcript failures
        if (d.podcastFailures && d.podcastFailures.length > 0 && typeof showToast === 'function') {
          showToast(d.podcastFailures.length + ' podcast episode(s) could not be transcribed — YouTube captions unavailable', 'warning');
        }
        fetch('/api/news/research?period=' + (state.coffeeResearchPeriod || 'daily')).then(function(r){return r.json();}).then(function(d2) {
          if (d2.report) { state.coffeeResearch = d2; if (typeof showToast === 'function') showToast('Coffee research ready!'); }
          else if (d.generateError) { state.coffeeResearch = { error: d.generateError }; }
          renderAll();
        });
      } else { renderAll(); }
    }).catch(function() { clearInterval(poll); });
  }, 5000);
}

function renderCoffeeResearch() {
  var r = state.coffeeResearch;
  var status = state.coffeeResearchStatus;
  var _p = state.coffeeResearchPeriod || 'daily';

  if (r && r.loading) {
    var elapsed = (status && status.generating && status.generateStarted) ? ' (' + Math.round((Date.now() - status.generateStarted) / 1000) + 's)' : '';
    return '<div class="ca-main"><div class="ca-header"><h2>Coffee Industry Research</h2></div><div class="ca-loading"><div class="ca-spinner"></div><p>Generating with Opus...' + elapsed + '</p><p style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp2)">Typically 3-5 minutes. Polling every 5s.</p></div></div>';
  }

  if (!r || r.error || !r.report) {
    var html = '<div class="ca-main" style="max-width:900px">';
    html += '<div class="ca-header"><h2>Coffee Industry Research</h2>' +
      '<div style="display:flex;gap:var(--sp2)">' +
        '<button class="ca-day-btn' + (_p === 'daily' ? ' active' : '') + '" onclick="state.coffeeResearchPeriod=\'daily\';state.coffeeResearch=null;loadCoffeeResearch()">Daily</button>' +
        '<button class="ca-day-btn' + (_p === 'weekly' ? ' active' : '') + '" onclick="state.coffeeResearchPeriod=\'weekly\';state.coffeeResearch=null;loadCoffeeResearch()">Weekly</button>' +
      '</div></div>';
    html += '<div style="padding:var(--sp5);background:var(--s1);border:1px solid var(--bd);border-radius:12px;text-align:center">' +
      '<div style="font-size:var(--f-2xl);margin-bottom:var(--sp3)">Deep Coffee Industry Research Brief</div>' +
      '<div style="font-size:var(--f-sm);color:var(--tx2);max-width:500px;margin:0 auto var(--sp4);line-height:1.7">Analyzes all coffee YouTube transcripts, RSS articles, and Reddit threads to produce an extensive research report on coffee industry trends.</div>' +
      (r && r.error ? '<div style="color:var(--rd);font-size:var(--f-sm);margin-bottom:var(--sp3)">' + _nEnc(r.error) + '</div>' : '') +
      '<button class="btn" style="background:var(--gn);color:#000;padding:10px 24px;font-size:var(--f-md)" onclick="loadCoffeeResearch(true)">Generate Research Report</button>' +
      '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp3)">Videos are auto-transcribed on every feed refresh.</div>' +
    '</div></div>';
    return html;
  }

  // Render full report — reuse same structure as tech research
  var rpt = r.report;
  var html = '<div class="ca-main" style="max-width:900px">';
  html += '<div style="margin-bottom:var(--sp5)"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--sp3)"><div>' +
    '<h1 style="font-size:var(--f-3xl);font-weight:var(--fw-b);line-height:1.2;color:var(--tx);margin-bottom:6px">' + _nEnc(rpt.title || 'Coffee Research Brief') + '</h1>' +
    (rpt.subtitle ? '<div style="font-size:var(--f-md);color:var(--ac);font-weight:var(--fw-sb)">' + _nEnc(rpt.subtitle) + '</div>' : '') +
    '</div><div style="display:flex;gap:var(--sp2);align-items:center">' +
      '<button class="ca-day-btn' + (_p === 'daily' ? ' active' : '') + '" onclick="state.coffeeResearchPeriod=\'daily\';state.coffeeResearch=null;loadCoffeeResearch()">Daily</button>' +
      '<button class="ca-day-btn' + (_p === 'weekly' ? ' active' : '') + '" onclick="state.coffeeResearchPeriod=\'weekly\';state.coffeeResearch=null;loadCoffeeResearch()">Weekly</button>' +
      '<button class="btn btn-sm" style="margin-left:var(--sp2)" onclick="loadCoffeeResearch(true)">Regenerate</button>' +
      '<button class="btn btn-sm" style="margin-left:var(--sp2);background:var(--ac);color:#fff;border:none" onclick="emailCoffeeResearch()">Email Report</button>' +
    '</div></div>';
  if (rpt.meta) {
    html += '<div style="display:flex;gap:var(--sp4);font-size:var(--f-xs);color:var(--tx3)">' +
      '<span>' + (rpt.meta.videos_analyzed||0) + ' videos</span><span>' + (rpt.meta.articles_analyzed||0) + ' articles</span><span>' + (rpt.meta.reddit_threads||0) + ' reddit</span></div>';
  }
  html += '</div>';

  // Brand Sentiment Dashboard
  if (rpt.brand_sentiment && rpt.brand_sentiment.brands) {
    var bs = rpt.brand_sentiment;
    html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-lg);font-weight:var(--fw-b);color:var(--tx)">Brand Sentiment Dashboard</div>' +
      '<span style="font-size:var(--f-xs);color:var(--tx3)">' + (bs.total_mentions || 0) + ' total mentions</span></div>';
    if (bs.summary) html += '<div style="font-size:var(--f-sm);color:var(--tx2);margin-bottom:var(--sp3)">' + _nEnc(bs.summary) + '</div>';

    // Brand cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--sp3)">';
    bs.brands.forEach(function(brand) {
      if (!brand.name) return;
      var sentColor = brand.sentiment === 'positive' ? 'var(--gn)' : brand.sentiment === 'negative' ? 'var(--rd)' : brand.sentiment === 'mixed' ? 'var(--or)' : 'var(--tx3)';
      var sentIcon = brand.sentiment === 'positive' ? '&#9650;' : brand.sentiment === 'negative' ? '&#9660;' : '&#9670;';

      html += '<div style="background:var(--s2);border-radius:10px;padding:var(--sp3);border-top:3px solid ' + sentColor + '">';
      // Header
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp2)">' +
        '<span style="font-weight:var(--fw-b);font-size:var(--f-md);color:var(--tx)">' + _nEnc(brand.name) + '</span>' +
        '<span style="font-size:var(--f-2xl);font-weight:var(--fw-b);color:' + sentColor + '">' + (brand.mentions || 0) + '</span>' +
      '</div>';
      html += '<div style="margin-bottom:var(--sp2)"><span style="font-size:9px;padding:2px 8px;border-radius:8px;background:' + sentColor + '18;color:' + sentColor + ';font-weight:var(--fw-sb)">' + sentIcon + ' ' + _nEnc(brand.sentiment || 'N/A') + '</span></div>';

      // Complaints
      if (brand.complaints && brand.complaints.length) {
        brand.complaints.forEach(function(c) {
          var sevColor = c.severity === 'high' ? 'var(--rd)' : c.severity === 'medium' ? 'var(--or)' : 'var(--tx3)';
          html += '<div style="margin:4px 0;padding:6px 8px;border-left:3px solid ' + sevColor + ';background:var(--rdbg);border-radius:0 6px 6px 0;font-size:var(--f-xs)">' +
            '<div style="color:var(--rd);font-weight:var(--fw-sb)">&#9888; ' + _nEnc(c.issue || '') + '</div>' +
            (c.quote ? '<div style="font-style:italic;color:var(--tx2);margin-top:2px">"' + _nEnc(c.quote) + '"</div>' : '') +
            '<div style="color:var(--tx3);margin-top:2px">' + _nEnc(c.source || '') + (c.url ? ' <a href="' + _nEnc(c.url) + '" target="_blank" style="color:var(--ac)">&#8599;</a>' : '') + '</div>' +
          '</div>';
        });
      }

      // Compliments
      if (brand.compliments && brand.compliments.length) {
        brand.compliments.forEach(function(c) {
          html += '<div style="margin:4px 0;padding:6px 8px;border-left:3px solid var(--gn);background:var(--gnbg);border-radius:0 6px 6px 0;font-size:var(--f-xs)">' +
            '<div style="color:var(--gn);font-weight:var(--fw-sb)">&#10004; ' + _nEnc(c.praise || '') + '</div>' +
            (c.quote ? '<div style="font-style:italic;color:var(--tx2);margin-top:2px">"' + _nEnc(c.quote) + '"</div>' : '') +
            '<div style="color:var(--tx3);margin-top:2px">' + _nEnc(c.source || '') + (c.url ? ' <a href="' + _nEnc(c.url) + '" target="_blank" style="color:var(--ac)">&#8599;</a>' : '') + '</div>' +
          '</div>';
        });
      }

      html += '</div>';
    });
    html += '</div></div>';
  }

  if (rpt.executive_summary) html += '<div style="font-size:var(--f-md);line-height:1.8;color:var(--tx2);margin-bottom:var(--sp6);padding:var(--sp5);background:var(--s2);border-radius:12px;border-left:4px solid var(--ac)">' + _nEnc(rpt.executive_summary).replace(/\n\n/g,'</p><p style="margin-top:var(--sp3)">') + '</div>';

  // Trends
  if (rpt.trends && rpt.trends.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin-bottom:var(--sp4)">Trends & Signals</div>';
    rpt.trends.forEach(function(t) {
      var cc = t.confidence === 'high' ? 'var(--gn)' : t.confidence === 'emerging' ? 'var(--or)' : 'var(--ac)';
      html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px;border-left:4px solid ' + cc + '">';
      html += '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp2)"><span style="font-size:var(--f-lg);font-weight:var(--fw-b);color:var(--tx)">' + _nEnc(t.trend) + '</span>' +
        '<span style="font-size:9px;padding:2px 8px;border-radius:8px;background:' + cc + '18;color:' + cc + '">' + _nEnc(t.confidence||'') + '</span></div>';
      html += '<div style="font-size:var(--f-md);line-height:1.7;color:var(--tx2);margin-bottom:var(--sp3)">' + _nEnc(t.analysis||'') + '</div>';
      if (t.evidence) t.evidence.forEach(function(e) {
        var link = e.url || (e.videoId ? 'https://www.youtube.com/watch?v=' + e.videoId + (e.timestamp?'&t='+e.timestamp:'') : '#');
        var isVideo = e.videoId || (link && link.includes('youtube'));
        var isReddit = link && link.includes('reddit');
        var linkLabel = isVideo ? '&#9654; Watch' : isReddit ? '&#9651; View Thread' : '&#8599; Read Article';
        var linkColor = isVideo ? 'var(--rd)' : isReddit ? 'var(--or)' : 'var(--ac)';
        var tsLabel = e.timestamp ? ' at ' + Math.floor(e.timestamp/60) + ':' + ('0'+Math.floor(e.timestamp%60)).slice(-2) : '';
        var thumb = e.videoId ? 'https://img.youtube.com/vi/' + e.videoId + '/mqdefault.jpg' : null;
        html += '<div style="margin:var(--sp2) 0;padding:var(--sp3);border-left:3px solid var(--ac);background:var(--s2);border-radius:0 8px 8px 0">';
        if (thumb) {
          html += '<a href="' + _nEnc(link) + '" target="_blank" rel="noopener" style="display:block;margin-bottom:8px;border-radius:6px;overflow:hidden;position:relative">' +
            '<img src="' + thumb + '" alt="" style="width:100%;display:block;border-radius:6px" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
            '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:14px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px"></div></div>' +
          '</a>';
        }
        html += '<div style="font-style:italic;font-size:var(--f-sm);line-height:1.6;color:var(--tx)">"' + _nEnc(e.quote||'') + '"</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">' +
            '<span style="font-size:var(--f-xs);color:var(--tx3)">— ' + _nEnc(e.source||'') + tsLabel + '</span>' +
            '<a href="' + _nEnc(link) + '" target="_blank" rel="noopener" style="font-size:var(--f-xs);font-weight:var(--fw-sb);color:' + linkColor + ';text-decoration:none;padding:2px 8px;border:1px solid ' + linkColor + ';border-radius:4px;white-space:nowrap">' + linkLabel + '</a>' +
          '</div></div>';
      });
      if (t.implications) html += '<div style="font-size:var(--f-sm);color:var(--gn);margin-top:var(--sp2)"><strong>Implications:</strong> ' + _nEnc(t.implications) + '</div>';
      html += '</div>';
    });
  }

  // Deep dives
  if (rpt.deep_dives && rpt.deep_dives.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Deep Dives</div>';
    rpt.deep_dives.forEach(function(dd) {
      html += '<div style="margin-bottom:var(--sp5);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">';
      html += '<h3 style="font-size:var(--f-lg);font-weight:var(--fw-b);color:var(--ac);margin-bottom:var(--sp3)">' + _nEnc(dd.title) + '</h3>';
      html += '<div style="font-size:var(--f-md);line-height:1.8;color:var(--tx2);margin-bottom:var(--sp3)">' + _nEnc(dd.synthesis||'') + '</div>';
      if (dd.key_quotes) dd.key_quotes.forEach(function(q) {
        var link = q.url || (q.videoId ? 'https://www.youtube.com/watch?v=' + q.videoId + (q.timestamp?'&t='+q.timestamp:'') : '#');
        var isVideo = q.videoId || (link && link.includes('youtube'));
        var isReddit = link && link.includes('reddit');
        var linkLabel = isVideo ? '&#9654; Watch' : isReddit ? '&#9651; Thread' : '&#8599; Read';
        var linkColor = isVideo ? 'var(--rd)' : isReddit ? 'var(--or)' : 'var(--pu)';
        var tsLabel = q.timestamp ? ' at ' + Math.floor(q.timestamp/60) + ':' + ('0'+Math.floor(q.timestamp%60)).slice(-2) : '';
        var thumb = q.videoId ? 'https://img.youtube.com/vi/' + q.videoId + '/mqdefault.jpg' : null;
        html += '<div style="margin:var(--sp2) 0;padding:var(--sp3);border-left:3px solid var(--pu);background:var(--s2);border-radius:0 8px 8px 0">';
        if (thumb) {
          html += '<a href="' + _nEnc(link) + '" target="_blank" rel="noopener" style="display:block;margin-bottom:8px;border-radius:6px;overflow:hidden;position:relative">' +
            '<img src="' + thumb + '" alt="" style="width:100%;display:block;border-radius:6px" onerror="this.parentElement.style.display=\'none\'" loading="lazy"/>' +
            '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:14px solid #fff;border-top:8px solid transparent;border-bottom:8px solid transparent;margin-left:3px"></div></div>' +
          '</a>';
        }
        html += '<div style="font-style:italic;font-size:var(--f-sm);color:var(--tx)">"' + _nEnc(q.quote||'') + '"</div>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">' +
            '<span style="font-size:var(--f-xs);color:var(--tx3)">— ' + _nEnc(q.speaker||'') + tsLabel + '</span>' +
            '<a href="' + _nEnc(link) + '" target="_blank" rel="noopener" style="font-size:var(--f-xs);font-weight:var(--fw-sb);color:' + linkColor + ';text-decoration:none;padding:2px 8px;border:1px solid ' + linkColor + ';border-radius:4px;white-space:nowrap">' + linkLabel + '</a>' +
          '</div></div>';
      });
      if (dd.takeaway) html += '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--or);margin-top:var(--sp3);padding:var(--sp3);background:var(--orbg);border-radius:8px">Takeaway: ' + _nEnc(dd.takeaway) + '</div>';
      html += '</div>';
    });
  }

  // Tools
  if (rpt.tools_and_products && rpt.tools_and_products.length) {
    html += '<div class="ca-section-title" style="font-size:var(--f-xl);margin:var(--sp6) 0 var(--sp4)">Products & Equipment Radar</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp3)">';
    rpt.tools_and_products.forEach(function(tool) {
      var sc = tool.sentiment === 'positive' ? 'var(--gn)' : tool.sentiment === 'negative' ? 'var(--rd)' : 'var(--or)';
      html += '<div style="padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px;border-top:3px solid ' + sc + '">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:var(--sp2)"><span style="font-weight:var(--fw-b)">' + _nEnc(tool.name) + '</span>' +
        '<span style="font-size:9px;padding:2px 6px;border-radius:6px;background:' + sc + '18;color:' + sc + '">' + _nEnc(tool.sentiment||'') + '</span></div>' +
        '<div style="font-size:var(--f-sm);line-height:1.6;color:var(--tx2)">' + _nEnc(tool.what_people_say||'') + '</div>';
      if (tool.best_quote && tool.best_quote.quote) {
        var tqLink = tool.best_quote.url || '#';
        html += '<div style="margin-top:var(--sp2);font-style:italic;font-size:var(--f-xs);color:var(--tx3);border-left:2px solid var(--bd);padding-left:8px">"' + _nEnc(tool.best_quote.quote) + '"' +
          (tool.best_quote.source ? ' — <a href="' + _nEnc(tqLink) + '" target="_blank" rel="noopener" style="color:var(--ac)">' + _nEnc(tool.best_quote.source) + ' &#8599;</a>' : '') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // Bottom line
  if (rpt.bottom_line) {
    html += '<div style="margin:var(--sp6) 0;padding:var(--sp5);background:linear-gradient(135deg,var(--acbg),var(--s2));border:2px solid var(--ac);border-radius:12px">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--ac);margin-bottom:var(--sp2);font-weight:var(--fw-b)">The Bottom Line</div>' +
      '<div style="font-size:var(--f-lg);line-height:1.7;color:var(--tx);font-weight:var(--fw-m)">' + _nEnc(rpt.bottom_line) + '</div></div>';
  }

  if (r.generated_at) html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:var(--sp4);text-align:center">Generated: ' + _nTimeAgo(r.generated_at) + (r.cached ? ' (cached)' : '') +
    ' &middot; <a href="#" onclick="event.preventDefault();emailCoffeeResearch()" style="color:var(--ac)">Email Report</a></div>';

  // Email recipients
  html += '<div style="margin-top:var(--sp4);padding:var(--sp4);background:var(--s1);border:1px solid var(--bd);border-radius:12px">' +
    '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--tx);margin-bottom:var(--sp2)">Daily Email Recipients</div>' +
    '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2)">Coffee research reports sent daily after generation.</div>' +
    '<div style="display:flex;gap:var(--sp2);align-items:center">' +
      '<input id="coffee-email-input" style="flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;color:var(--tx);font-size:var(--f-sm);font-family:inherit" placeholder="email@example.com" value="' + _nEnc((state._coffeeRecipients || []).join(', ')) + '" />' +
      '<button class="btn btn-sm" onclick="saveCoffeeRecipients()">Save</button>' +
    '</div>' +
    '<div id="coffee-email-status" style="font-size:var(--f-xs);color:var(--tx3);margin-top:4px"></div>' +
  '</div>';

  html += '</div>';
  return html;
}

// ── Coffee email functions ──
function emailCoffeeResearch() {
  if (typeof showToast === 'function') showToast('Sending coffee research email...');
  fetch('/api/news/research/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok) { if (typeof showToast === 'function') showToast('Coffee report emailed to ' + (d.recipients || []).join(', ')); }
      else { if (typeof showToast === 'function') showToast('Failed: ' + (d.error || ''), 'er'); }
    }).catch(function(e) { if (typeof showToast === 'function') showToast('Failed: ' + e.message, 'er'); });
}

function saveCoffeeRecipients() {
  var input = document.getElementById('coffee-email-input');
  var status = document.getElementById('coffee-email-status');
  if (!input) return;
  var recipients = input.value.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e && e.includes('@'); });
  fetch('/api/news/research/email/recipients', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: recipients })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      state._coffeeRecipients = recipients;
      if (status) { status.textContent = 'Saved ' + recipients.length + ' recipients.'; status.style.color = 'var(--gn)'; }
    }
  }).catch(function() {});
}

// Load coffee recipients on init
fetch('/api/news/research/email/recipients').then(function(r) { return r.json(); }).then(function(d) {
  state._coffeeRecipients = d.recipients || [];
}).catch(function() {});
