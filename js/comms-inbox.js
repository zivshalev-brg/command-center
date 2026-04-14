// ===============================================================
// COMMS INBOX — Clean Gmail-style thread list (unified email+slack)
// ===============================================================

// ── 1. getVisibleThreadIds — filter by source, search, status ──

function getVisibleThreadIds() {
  var threads = DATA.comms.threads || {};

  return Object.entries(threads)
    .filter(function(entry) {
      var id = entry[0];
      var th = entry[1];
      // Hide done threads
      if (state.threadStatus[id] === 'done') return false;
      // Hide snoozed threads
      if (state.commsSnoozed[id]) return false;
      // Source filter
      if (state.commsSource !== 'all' && !(th.sources || []).includes(state.commsSource)) return false;
      // Slack sub-filter (by conversation type)
      if (state.commsSource === 'slack' && state.commsSlackFilter && state.commsSlackFilter !== 'all') {
        if (th.sourceType !== state.commsSlackFilter) return false;
      }
      // AI Category filter
      if (state.commsCategoryFilter && state.commsCategoryFilter !== 'all') {
        if (state.commsCategoryFilter === 'action') {
          if (!th.aiActionRequired) return false;
        } else if (state.commsCategoryFilter === 'urgent') {
          if (th.aiPriority !== 'critical' && th.aiPriority !== 'high') return false;
        } else {
          if (th.aiCategory !== state.commsCategoryFilter) return false;
        }
      }
      // Project filter (from cross-module navigation)
      if (state.commsProjectFilter) {
        var projTags = th.aiProjectTags || [];
        var projMatch = false;
        var projMap = (typeof PROJECT_DATA_MAP !== 'undefined') ? PROJECT_DATA_MAP : null;
        var projAliases = [];
        if (projMap && projMap[state.commsProjectFilter]) {
          projAliases = projMap[state.commsProjectFilter].classifierTags || [];
        }
        for (var pi = 0; pi < projTags.length; pi++) {
          for (var pa = 0; pa < projAliases.length; pa++) {
            if (projTags[pi].toLowerCase().indexOf(projAliases[pa].toLowerCase()) >= 0) { projMatch = true; break; }
          }
          if (projMatch) break;
        }
        if (!projMatch) {
          var projTitle = (DATA.projects[state.commsProjectFilter] || {}).title || state.commsProjectFilter;
          var hayLower = ((th.subject || '') + ' ' + (th.preview || '')).toLowerCase();
          if (hayLower.indexOf(projTitle.toLowerCase()) < 0) return false;
        }
      }
      // Search filter
      if (state.commsSearch) {
        var q = state.commsSearch.toLowerCase();
        var hay = ((th.subject || '') + ' ' + (th.preview || '') + ' ' + (th.people || []).join(' ') + ' ' + (th.slackChannelName || '') + ' ' + (th.aiCategory || '') + ' ' + ((th.aiProjectTags || []).join(' '))).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort(function(a, b) {
      return computeThreadScore(b[1], b[0]) - computeThreadScore(a[1], a[0]);
    })
    .map(function(entry) { return entry[0]; });
}

// ── 2. buildInboxRow — clean 3-column Gmail row ──
//
// All rows (email + slack) share the same visual structure:
//  ┌─┬────┬──────────────────────────────────────┐
//  │●│ AV │ Display Name              src · 2h   │
//  │ │    │ Subject line (bold if unread)         │
//  │ │    │ Preview text in muted color...        │
//  └─┴────┴──────────────────────────────────────┘

function buildInboxRow(id, th) {
  var selected = state.selectedThread === id ? ' selected' : '';
  var unread = th.unread ? ' unread' : '';
  var isSlack = th.sources && th.sources.includes('slack');
  var sourceType = th.sourceType || '';

  // Determine display name and avatar based on source type
  var displayName = '';
  var avatarText = '';
  var avatarBg = '';
  var avatarColor = '';

  if (isSlack && (sourceType === 'channel' || sourceType === 'private') && th.slackChannelName) {
    // Channels / private channels — show channel name
    displayName = (sourceType === 'private' ? '\uD83D\uDD12 ' : '# ') + th.slackChannelName;
    avatarText = '#';
    avatarBg = sourceType === 'private' ? 'var(--orbg)' : 'var(--s3)';
    avatarColor = sourceType === 'private' ? 'var(--or)' : 'var(--tx2)';
  } else if (isSlack && sourceType === 'group') {
    // Group DMs — show participant names
    var groupNames = (th.people || []).filter(function(p) { return p && p !== 'Ziv Shalev' && p !== 'You'; });
    displayName = groupNames.length ? groupNames.slice(0, 3).map(function(n) { return n.split(' ')[0]; }).join(', ') : (th.slackChannelName || 'Group');
    if (groupNames.length > 3) displayName += ' +' + (groupNames.length - 3);
    var gpi = groupNames.length ? getPersonInfo(groupNames[0]) : { initials: 'GR', colour: 'var(--cy)' };
    avatarText = gpi.initials;
    avatarBg = (gpi.colour || 'var(--cy)') + '22';
    avatarColor = gpi.colour || 'var(--cy)';
  } else {
    // DMs (slack) and emails — show person name
    var senderName = th.lastSender
      || (th.people && th.people.find(function(p) { return p !== 'Ziv Shalev' && p !== 'You'; }))
      || 'Unknown';
    displayName = senderName;
    var pi = getPersonInfo(senderName);
    avatarText = pi.initials;
    avatarBg = (pi.colour || 'var(--s3)') + '22';
    avatarColor = pi.colour || 'var(--tx3)';
  }

  var h = '<div class="comms-thread-row' + selected + unread + '" onclick="selectThread(\'' + id + '\')">';

  // Col 1: Urgency dot (AI priority overrides unread dot when available)
  h += '<div class="thread-dot-col">';
  if (th.aiPriority === 'critical') h += '<div class="urgency-dot critical"></div>';
  else if (th.aiPriority === 'high') h += '<div class="urgency-dot high"></div>';
  else if (th.unread) h += '<div class="unread-dot"></div>';
  h += '</div>';

  // Col 2: Avatar (always initials or # — no SVGs)
  h += '<div class="thread-avatar" style="background:' + avatarBg + ';color:' + avatarColor + '">';
  h += avatarText;
  h += '</div>';

  // Col 3: Content
  h += '<div class="thread-content">';

  // Line 1: Display name + source label + time
  h += '<div class="thread-line1">';
  h += '<span class="thread-sender">' + encodeHtml(displayName) + '</span>';

  // Tiny source label (no SVGs — just text)
  var srcLabel = isSlack ? 'Slack' : 'Email';
  h += '<span class="thread-src-label src-' + (isSlack ? 'slack' : 'email') + '">' + srcLabel + '</span>';

  // AI category pill
  if (th.aiCategory && th.aiCategory !== 'FYI') {
    h += '<span class="ai-tag cat-' + th.aiCategory.toLowerCase() + '">' + encodeHtml(th.aiCategory) + '</span>';
  }
  // Project tag pills (max 2, deduplicated against category)
  if (th.aiProjectTags && th.aiProjectTags.length) {
    var catL = (th.aiCategory || '').toLowerCase();
    var seenTags = {};
    th.aiProjectTags.slice(0, 3).forEach(function(tag) {
      var tl = tag.toLowerCase();
      if (tl === catL || tl === 'marketing' || seenTags[tl]) return;
      seenTags[tl] = true;
      h += '<span class="ai-tag project-tag">' + encodeHtml(tag) + '</span>';
    });
  }
  // Marketing indicator (only if not already the category)
  if (th.aiIsMarketing && (th.aiCategory || '').toLowerCase() !== 'marketing') h += '<span class="ai-tag mkt-tag">MKT</span>';

  if (state.commsPinned[id]) h += '<span class="thread-pin" title="Pinned">\u2605</span>';
  h += '<span class="thread-time">' + relativeTime(th.lastActivity) + '</span>';
  h += '</div>';

  // Line 2: Subject — for Slack channels show last sender + message, for email show subject
  var subject = th.subject || 'No subject';
  if (isSlack && (sourceType === 'channel' || sourceType === 'private') && th.lastSender) {
    // Channel: show "LastSender: message preview" as subject line
    var chanPreview = (th.lastSender || '') + ': ' + (th.preview || '').substring(0, 60);
    h += '<div class="thread-subject">' + encodeHtml(chanPreview) + '</div>';
  } else {
    h += '<div class="thread-subject">' + encodeHtml(subject) + '</div>';
  }

  // Line 3: Preview (prefer AI summary) + meta counts
  h += '<div class="thread-preview">';
  if (isSlack && (sourceType === 'channel' || sourceType === 'private')) {
    if (th.threadCount > 1) h += '<span class="thread-meta-count">' + th.threadCount + ' msgs</span>';
    if (th.hasThreads || th.totalThreadReplies > 0) h += '<span class="thread-meta-count">\uD83D\uDDE8 threads</span>';
  } else {
    // Prefer AI summary over raw preview
    var previewText = th.aiFullSummary || th.aiSummary || th.preview || '';
    if (th.aiFullSummary || th.aiSummary) {
      h += '<span class="ai-preview-badge">\u2728</span>';
    }
    h += encodeHtml(previewText.substring(0, 120));
  }
  if (th.people && th.people.length > 1) {
    h += ' <span class="thread-meta-count">' + th.people.length + ' people</span>';
  }
  if (!isSlack && th.threadCount > 1) h += ' <span class="thread-meta-count">' + th.threadCount + ' msgs</span>';
  if (th.attachmentCount) h += ' <span class="thread-meta-count">\uD83D\uDCCE ' + th.attachmentCount + '</span>';
  // Action required indicator
  if (th.aiActionRequired) h += ' <span class="thread-meta-count action-required">Action</span>';
  h += '</div>';

  h += '</div>'; // end thread-content
  h += '</div>'; // end comms-thread-row
  return h;
}

// ── 3. renderCommsThreadList — search + source tabs + thread list ──

function renderCommsThreadList() {
  var threads = DATA.comms.threads || {};
  var html = '<div class="comms-list">';

  // Search bar
  html += '<div class="comms-list-header">';
  html += '<input class="comms-search" type="text" placeholder="Search conversations\u2026"';
  html += ' value="' + (state.commsSearch || '').replace(/"/g, '&quot;') + '"';
  html += ' oninput="state.commsSearch=this.value;renderCommsMain()" />';
  html += '</div>';

  // Project filter banner
  if (state.commsProjectFilter) {
    var projTitle = (DATA.projects[state.commsProjectFilter] || {}).title || state.commsProjectFilter;
    html += '<div style="display:flex;align-items:center;padding:6px 12px;background:var(--ac)11;border-bottom:1px solid var(--bd);font-size:var(--f-xs)">';
    html += '<span style="color:var(--ac);font-weight:600">Filtered: ' + (projTitle.replace(/</g,'&lt;')) + '</span>';
    html += '<button class="btn btn-sm" style="margin-left:auto;padding:2px 8px;font-size:10px" onclick="state.commsProjectFilter=null;renderAll()">Clear</button>';
    html += '</div>';
  }

  // Source tabs (All / Email / Slack)
  html += '<div class="comms-source-tabs">';
  var sources = [
    { key: 'all', label: 'All' },
    { key: 'email', label: 'Email' },
    { key: 'slack', label: 'Slack' }
  ];
  sources.forEach(function(s) {
    var active = state.commsSource === s.key ? ' active' : '';
    // Count visible threads per source
    var count = 0;
    for (var tid in threads) {
      if (state.threadStatus[tid] === 'done' || state.commsSnoozed[tid]) continue;
      if (s.key === 'all' || (threads[tid].sources || []).includes(s.key)) count++;
    }
    html += '<div class="comms-source-tab' + active + '" onclick="setState(\'commsSource\',\'' + s.key + '\');setState(\'commsSlackFilter\',\'all\')">';
    html += s.label;
    if (count > 0) html += ' <span class="source-tab-count">' + count + '</span>';
    html += '</div>';
  });
  html += '</div>';

  // Slack sub-filter pills (only when Slack tab is active)
  if (state.commsSource === 'slack') {
    // Count per type
    var typeCounts = { all: 0, dm: 0, group: 0, channel: 0, 'private': 0 };
    for (var tid in threads) {
      var t = threads[tid];
      if (state.threadStatus[tid] === 'done' || state.commsSnoozed[tid]) continue;
      if (!(t.sources || []).includes('slack')) continue;
      typeCounts.all++;
      if (t.sourceType && typeCounts[t.sourceType] !== undefined) typeCounts[t.sourceType]++;
    }

    html += '<div class="comms-slack-filters">';
    var slackFilters = [
      { key: 'all', label: 'All' },
      { key: 'dm', label: 'DMs' },
      { key: 'group', label: 'Groups' },
      { key: 'channel', label: 'Channels' },
      { key: 'private', label: 'Private' }
    ];
    var activeFilter = state.commsSlackFilter || 'all';
    slackFilters.forEach(function(f) {
      var act = activeFilter === f.key ? ' active' : '';
      var cnt = typeCounts[f.key] || 0;
      if (f.key !== 'all' && cnt === 0) return; // hide empty filters
      html += '<button class="slack-filter-btn' + act + '" onclick="setState(\'commsSlackFilter\',\'' + f.key + '\')">';
      html += f.label;
      if (cnt > 0) html += ' <span class="filter-count">' + cnt + '</span>';
      html += '</button>';
    });
    html += '</div>';
  }

  // AI category + urgency quick-filters (only when classified threads exist)
  var hasAiTags = false;
  var catCounts = {};
  var actionCount = 0, urgentCount = 0;
  for (var ctid in threads) {
    var ct = threads[ctid];
    if (state.threadStatus[ctid] === 'done' || state.commsSnoozed[ctid]) continue;
    if (state.commsSource !== 'all' && !(ct.sources || []).includes(state.commsSource)) continue;
    if (ct.aiCategory) {
      hasAiTags = true;
      catCounts[ct.aiCategory] = (catCounts[ct.aiCategory] || 0) + 1;
    }
    if (ct.aiActionRequired) actionCount++;
    if (ct.aiPriority === 'critical' || ct.aiPriority === 'high') urgentCount++;
  }

  if (hasAiTags) {
    var activeCategory = state.commsCategoryFilter || 'all';
    html += '<div class="comms-category-filters">';
    // Quick toggles
    html += '<button class="cat-filter-btn' + (activeCategory === 'all' ? ' active' : '') + '" onclick="setState(\'commsCategoryFilter\',\'all\')">All</button>';
    if (urgentCount > 0) {
      html += '<button class="cat-filter-btn urgent' + (activeCategory === 'urgent' ? ' active' : '') + '" onclick="setState(\'commsCategoryFilter\',\'urgent\')">\u26A0 Urgent ' + urgentCount + '</button>';
    }
    if (actionCount > 0) {
      html += '<button class="cat-filter-btn action' + (activeCategory === 'action' ? ' active' : '') + '" onclick="setState(\'commsCategoryFilter\',\'action\')">Action ' + actionCount + '</button>';
    }
    // Top categories (show top 4 non-FYI)
    var sortedCats = Object.entries(catCounts).filter(function(e) { return e[0] !== 'FYI'; })
      .sort(function(a, b) { return b[1] - a[1]; }).slice(0, 4);
    sortedCats.forEach(function(entry) {
      var cat = entry[0], cnt = entry[1];
      html += '<button class="cat-filter-btn cat-' + cat.toLowerCase() + (activeCategory === cat ? ' active' : '') + '" onclick="setState(\'commsCategoryFilter\',\'' + cat + '\')">' + cat + ' ' + cnt + '</button>';
    });
    html += '</div>';
  }

  // Thread list
  var visibleIds = getVisibleThreadIds();
  html += '<div class="comms-list-scroll">';

  if (!DATA._commsLiveLoaded && Object.keys(threads).length === 0) {
    // Skeleton loading
    for (var s = 0; s < 6; s++) {
      html += '<div class="skel skel-row" style="height:72px;margin:8px 12px;border-radius:8px"></div>';
    }
  } else if (visibleIds.length === 0) {
    // Empty state
    html += '<div class="comms-empty">';
    html += '<div class="comms-empty-icon">\u{1F4ED}</div>';
    html += '<div class="comms-empty-text">No conversations</div>';
    html += '</div>';
  } else {
    // Group by time
    var timeGroups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Older': [] };
    visibleIds.forEach(function(id) {
      var th = threads[id];
      var grp = getTimeGroup(th.lastActivity);
      timeGroups[grp].push(id);
    });

    var timeOrder = ['Today', 'Yesterday', 'This Week', 'Older'];
    timeOrder.forEach(function(tg) {
      var ids = timeGroups[tg];
      if (!ids.length) return;
      html += '<div class="comms-time-header">' + tg + '</div>';
      ids.forEach(function(id) {
        html += buildInboxRow(id, threads[id]);
      });
    });
  }

  html += '</div></div>';
  return html;
}
