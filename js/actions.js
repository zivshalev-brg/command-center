// ===============================================================
// ACTIONS
// ===============================================================
// ─── Comms Live: server-side refresh engine + client polling ───
let _commsPollingInterval = null;
let _commsSeenThreadIds = new Set(); // tracks thread IDs user has seen
let _commsUnreadCount = 0;
let _lastRefreshStatus = null;

/** Trigger manual refresh (sync button) */
async function triggerManualRefresh() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.style.animation = 'spin 1s linear infinite';
  try {
    await fetch('/api/refresh/now', { method: 'POST' });
    // Wait a moment for the refresh engine to process, then reload
    setTimeout(async () => {
      await loadCommsLive(false);
      if (icon) icon.style.animation = '';
      updateRefreshStatusUI();
    }, 3000);
  } catch {
    if (icon) icon.style.animation = '';
  }
}

/** Fetch and display refresh engine status */
async function updateRefreshStatusUI() {
  try {
    const resp = await fetch('/api/refresh/status');
    if (!resp.ok) return;
    _lastRefreshStatus = await resp.json();
    const el = document.getElementById('refreshStatus');
    if (!el) return;

    const parts = [];
    if (_lastRefreshStatus.slack.lastRefresh) {
      const ago = _timeSince(_lastRefreshStatus.slack.lastRefresh);
      parts.push('Slack: ' + ago + (_lastRefreshStatus.slack.error ? ' \u26A0' : ''));
    }
    if (_lastRefreshStatus.outlook.lastRefresh) {
      const ago = _timeSince(_lastRefreshStatus.outlook.lastRefresh);
      parts.push('Mail: ' + ago + (_lastRefreshStatus.outlook.error ? ' \u26A0' : ''));
    }
    if (_lastRefreshStatus.ai && _lastRefreshStatus.ai.lastClassify) {
      const ago = _timeSince(_lastRefreshStatus.ai.lastClassify);
      parts.push('AI: ' + ago + (_lastRefreshStatus.ai.error ? ' \u26A0' : ''));
    }
    if (parts.length) {
      el.innerHTML = parts.join(' \u00B7 ');
      el.title = [
        _lastRefreshStatus.slack.error ? 'Slack: ' + _lastRefreshStatus.slack.error : '',
        _lastRefreshStatus.outlook.error ? 'Outlook: ' + _lastRefreshStatus.outlook.error : '',
        _lastRefreshStatus.ai && _lastRefreshStatus.ai.error ? 'AI: ' + _lastRefreshStatus.ai.error : ''
      ].filter(Boolean).join('\n') || 'All sources syncing normally';
    } else {
      el.innerHTML = 'Not synced yet';
    }
  } catch {}
}

/** Check Outlook auth status and render Connect button if needed */
async function checkOutlookAuth() {
  try {
    var resp = await fetch('/api/auth/status');
    if (!resp.ok) return;
    var data = await resp.json();
    var el = document.getElementById('outlookAuthStatus');
    if (!el) return;
    if (data.outlook && data.outlook.connected) {
      el.innerHTML = '<div class="auth-connected">'
        + '<span class="auth-dot connected"></span>'
        + '<span class="auth-label">' + (data.outlook.email || 'Connected') + '</span>'
        + '</div>';
    } else {
      el.innerHTML = '<a href="/auth/outlook" class="auth-connect-btn" title="Connect your Outlook mailbox">'
        + '\u2709\uFE0F Connect Outlook'
        + '</a>';
    }
  } catch (e) { /* silent */ }
}

function _timeSince(isoDate) {
  const secs = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (secs < 30) return 'just now';
  if (secs < 60) return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  return hrs + 'h ago';
}

async function loadCommsLive(silent) {
  try {
    // Server refresh engine runs in background — just read cached data
    const resp = await fetch('/api/comms');
    if (!resp.ok) return;
    const liveData = await resp.json();
    if (liveData && liveData.threads) {
      const existing = DATA.comms.threads || {};
      const freshIds = new Set(Object.keys(liveData.threads));
      let added = 0;
      let updated = 0;

      // Remove stale threads that no longer exist in the API response
      // (e.g., old per-message Slack threads replaced by consolidated channel threads)
      for (const id of Object.keys(existing)) {
        if (!freshIds.has(id)) {
          delete existing[id];
        }
      }

      for (const [id, th] of Object.entries(liveData.threads)) {
        if (!existing[id]) {
          th.unread = !_commsSeenThreadIds.has(id);
          existing[id] = th;
          added++;
        } else {
          // Merge: always update from fresh server data
          const wasUnread = existing[id].unread;
          Object.assign(existing[id], th);
          // Preserve client-side unread state unless thread was explicitly seen
          existing[id].unread = _commsSeenThreadIds.has(id) ? false : (wasUnread || th.unread);
          updated++;
        }
      }
      DATA.comms.threads = existing;
      DATA._commsLiveLoaded = true;

      // Enrich threads with smart scores, project/people linking
      enrichThreadsClient();

      // Count unread (Slack + email)
      _commsUnreadCount = Object.entries(DATA.comms.threads).filter(([id,th]) => th.unread).length;
      updateCommsUnreadBadge();

      // Always re-render the comms UI after data loads.
      // Use renderCommsMain() directly for efficiency on silent polling,
      // full renderAll() on initial/non-silent loads.
      if (state.module === 'comms') {
        renderCommsMain();
        renderCommsSidebar();
      }
      if (!silent && added > 0) toast(added + ' new thread' + (added>1?'s':''), 'ok');
    }
  } catch(e) {
    console.warn('[Comms] loadCommsLive error:', e);
  }
}

function markThreadSeen(id) {
  _commsSeenThreadIds.add(id);
  const th = DATA.comms.threads && DATA.comms.threads[id];
  if (th) th.unread = false;
  _commsUnreadCount = Object.entries(DATA.comms.threads || {}).filter(([,t]) => t.unread && t.sources && t.sources.includes('slack')).length;
  updateCommsUnreadBadge();
}

function updateCommsUnreadBadge() {
  const badge = $('commsUnreadBadgeRail');
  if (badge) {
    badge.textContent = _commsUnreadCount;
    badge.style.display = _commsUnreadCount > 0 ? '' : 'none';
  }
}

function startCommsPolling() {
  if (_commsPollingInterval) return;
  // Server refresh engine handles Slack/Outlook fetches in background.
  // Client just reads the cached data every 30s (fast file read, no API calls).
  _commsPollingInterval = setInterval(() => {
    if (state.module === 'comms') {
      loadCommsLive(true);
      updateRefreshStatusUI();
    }
  }, 30000); // 30 seconds
}

function stopCommsPolling() {
  if (_commsPollingInterval) { clearInterval(_commsPollingInterval); _commsPollingInterval = null; }
}

// ─── Nav Rail ────────────────────────────────────────────────
var _navRailItems = [
  { mod:'summary', label:'Summary', key:'1', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
  { mod:'comms', label:'Comms', key:'2', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>', badgeId:'commsUnreadBadgeRail' },
  { mod:'calendar', label:'Calendar', key:'3', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { mod:'projects', label:'Projects', key:'4', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
  { mod:'people', label:'People', key:'5', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  { mod:'metrics', label:'Metrics', key:'6', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>' },
  { mod:'strategy', label:'Strategy', key:'7', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
  { sep: true },
  { mod:'news', label:'Coffee', key:'8', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>' },
  { mod:'technews', label:'AI & Tech', key:'9', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><circle cx="12" cy="10" r="3"/></svg>' },
  { sep: true },
  { mod:'digest', label:'Digest', key:'0', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>' },
  { mod:'commsanalytics', label:'Analytics', key:'', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/><circle cx="18" cy="7" r="3"/></svg>' },
  { mod:'chat', label:'Chat', key:'', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
  { mod:'notes', label:'Notes', key:'', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20"/><line x1="9" y1="7" x2="16" y2="7"/><line x1="9" y1="11" x2="16" y2="11"/></svg>' },
  { sep: true },
  { mod:'emailmarketing', label:'Emails', key:'', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' }
];

var _navRailRendered = false;

function renderNavRail() {
  var rail = $('navRail');
  if (!rail) return;

  // Only build DOM once, then just update active state
  if (_navRailRendered) {
    rail.querySelectorAll('.nr-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.mod === state.module);
    });
    return;
  }

  var html = '';
  _navRailItems.forEach(function(item) {
    if (item.sep) { html += '<div class="nr-sep"></div>'; return; }
    var isActive = state.module === item.mod;
    html += '<div class="nr-item' + (isActive ? ' active' : '') + '" data-mod="' + item.mod + '" onclick="switchModule(\'' + item.mod + '\')" title="' + item.label + (item.key ? ' (' + item.key + ')' : '') + '">';
    html += item.icon;
    html += '<span class="nr-label">' + item.label + '</span>';
    if (item.key) html += '<span class="nr-key">' + item.key + '</span>';
    if (item.badgeId) html += '<span class="nr-badge" id="' + item.badgeId + '" style="display:none">0</span>';
    html += '</div>';
  });
  rail.innerHTML = html;
  _navRailRendered = true;
}

function switchModule(mod, tabEl) {
  state.module = mod;
  state.selectedTopic = null;
  state.selectedProject = null;
  state.selectedPerson = null;
  closePanel();
  trackInteraction('module_view', mod, mod);
  renderAll();
  // Auto-load live comms data when switching to comms + start polling
  if (mod === 'comms') { loadCommsLive(); startCommsPolling(); checkOutlookAuth(); if (typeof loadPendingDrafts === 'function') loadPendingDrafts(); }
  else { stopCommsPolling(); }
  // Auto-load all live data for summary dashboard
  if (mod === 'summary') {
    if (!DATA.strategy && !DATA.strategyLoading && typeof loadStrategyData === 'function') loadStrategyData();
    if (typeof loadProjectIntelOverview === 'function') loadProjectIntelOverview();
    if (typeof loadProjectJiraOverview === 'function' && !_projectIntelJira && !_projectJiraLoading) loadProjectJiraOverview();
    loadCommsLive(true);
  }
  // Auto-load digest data when switching to metrics (if not already loaded)
  if (mod === 'metrics' && !DATA.digest && !DATA.digestLoading) {
    loadDigestData();
  }
  // Auto-load strategy data when switching to strategy
  if (mod === 'strategy' && !DATA.strategy && !DATA.strategyLoading) {
    loadStrategyData();
  }
  // Auto-load news data when switching to news
  if (mod === 'news' && !DATA.news && !DATA.newsLoading) {
    loadNewsData();
  }
  // Auto-load tech news data when switching to technews
  if (mod === 'technews' && !DATA.techNews && !DATA.techNewsLoading) {
    loadTechNewsData();
  }
  // Auto-load project enrichment and intelligence data when switching to projects
  if (mod === 'projects') {
    if (!_projectEnrichment && !_projectEnrichmentLoading) loadProjectEnrichment();
    if (!_projectIntelOverview && !_projectIntelOverviewLoading) loadProjectIntelOverview();
  }
  // Auto-load chat sessions
  if (mod === 'chat' && !state.chatSessionsLoaded) {
    loadChatSessions();
  }
  // Auto-load email marketing data
  if (mod === 'emailmarketing' && !DATA.emailMarketing && !DATA.emLoading) {
    loadEmailMarketingData();
  }
  // Auto-load comms analytics data
  if (mod === 'commsanalytics' && !state.commsAnalyticsData && !state.commsAnalyticsLoading) {
    loadCommsAnalyticsData();
  }
  // Auto-load metrics engine data
  if (mod === 'metrics' || mod === 'strategy') {
    loadMetricsEngine();
    loadMetricsEngineLearning();
    loadLearningState();
    loadDigestFreshness();
  }
}

function selectTopic(id) { state.selectedTopic = id; closePanel(); renderAll(); }
function selectThread(id) {
  state.selectedThread = id;
  markThreadSeen(id);
  // Mark email as read via Graph API
  var th = DATA.comms.threads && DATA.comms.threads[id];
  if (th && th.unread && th.sources && th.sources.includes('email')) {
    var lastMsg = th.messages && th.messages.length ? th.messages[th.messages.length - 1] : null;
    if (lastMsg && lastMsg.messageId) {
      fetch('/api/comms/email/' + encodeURIComponent(lastMsg.messageId) + '/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: true })
      }).catch(function() {});
    }
  }
  closePanel();
  renderAll();
}
function selectProject(id) { state.selectedProject = id; trackInteraction('project_view','projects',id); if (id && !_projectIntelDetail[id] && !_projectIntelDetailLoading[id]) loadProjectIntelDetail(id); renderAll(); }
function selectPerson(id) { state.selectedPerson = id; trackInteraction('person_view','people',id); renderAll(); }

function markDone(id) { state.topicStatus[id] = 'done'; renderAll(); toast('Marked as done','ok'); }
function markThreadDone(id) {
  state.threadStatus[id] = 'done';
  // Send source + subject metadata so the archive has context
  const th = DATA.comms.threads && DATA.comms.threads[id];
  const source = th?.sources?.includes('email') ? 'email' : 'slack';
  const subject = th?.subject || null;
  fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'done', source, subject }) }).catch(()=>{});
  advanceToNextThread(id);
  toast('Archived','ok');
}
function snoozeThread(id) {
  state.threadStatus[id] = 'snoozed';
  fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'snoozed' }) }).catch(()=>{});
  state.selectedThread = null;
  renderAll();
  toast('Snoozed','ok');
}

// ── Comms Triage Actions ──
function advanceToNextThread(currentId) {
  const ids = getVisibleThreadIds();
  const idx = ids.indexOf(currentId);
  if (idx >= 0 && idx < ids.length - 1) selectThread(ids[idx + 1]);
  else if (idx > 0) selectThread(ids[idx - 1]);
  else { state.selectedThread = null; renderAll(); }
}
function togglePin(id) {
  if (!id) return;
  state.commsPinned[id] = !state.commsPinned[id];
  if (!state.commsPinned[id]) delete state.commsPinned[id];
  fetch('/api/status/pin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId:id, pinned:!!state.commsPinned[id], itemType:'thread' }) }).catch(()=>{});
  renderAll();
  toast(state.commsPinned[id] ? 'Pinned' : 'Unpinned', 'ok');
}
function toggleReadStatus(id) {
  if (!id) return;
  const th = DATA.comms.threads && DATA.comms.threads[id];
  if (!th) return;
  const wasUnread = th.unread;
  th.unread = !wasUnread;
  if (!th.unread) markThreadSeen(id);
  else _commsSeenThreadIds.delete(id);
  // Sync with Graph API for emails
  if (th.sources && th.sources.includes('email')) {
    const lastMsg = th.messages && th.messages.length ? th.messages[th.messages.length - 1] : null;
    if (lastMsg && (lastMsg.messageId || lastMsg.emailMessageId || lastMsg.graphId)) {
      const msgId = lastMsg.messageId || lastMsg.emailMessageId || lastMsg.graphId;
      fetch('/api/comms/email/' + encodeURIComponent(msgId) + '/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: !wasUnread })
      }).catch(function() {});
    }
  }
  _commsUnreadCount = Object.entries(DATA.comms.threads || {}).filter(([,t]) => t.unread).length;
  updateCommsUnreadBadge();
  renderAll();
  toast(wasUnread ? 'Marked as read' : 'Marked as unread', 'ok');
}
function toggleSnoozePicker(id) {
  if (!id) return;
  state.commsSnoozePickerOpen = state.commsSnoozePickerOpen === id ? null : id;
  renderAll();
}
function snoozeThreadUntil(id, preset, customDate) {
  const now = new Date();
  let until;
  switch (preset) {
    case '3h': until = new Date(now.getTime() + 3 * 3600000); break;
    case 'tomorrow': {
      const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
      until = t; break;
    }
    case 'nextweek': {
      const t = new Date(now); t.setDate(t.getDate() + (8 - t.getDay()) % 7 || 7); t.setHours(9, 0, 0, 0);
      until = t; break;
    }
    case 'custom': until = customDate ? new Date(customDate + 'T09:00:00') : null; break;
  }
  if (until) {
    state.commsSnoozed[id] = { until: until.toISOString() };
    state.threadStatus[id] = 'snoozed';
    fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'snoozed', snoozedUntil:until.toISOString() }) }).catch(()=>{});
    state.commsSnoozePickerOpen = null;
    advanceToNextThread(id);
    toast('Snoozed until ' + until.toLocaleDateString('en-AU', {weekday:'short',month:'short',day:'numeric'}), 'ok');
  }
}
function focusQuickReply() {
  const ta = document.getElementById('commsQuickReply');
  if (ta) ta.focus();
}
function sendQuickReply() {
  const ta = document.getElementById('commsQuickReply');
  const btn = document.getElementById('commsQuickSendBtn');
  if (!ta || !ta.value.trim()) return;
  const id = state.selectedThread;
  const th = DATA.comms.threads && DATA.comms.threads[id];
  if (!th) return;
  const isSlack = th.sources && th.sources.includes('slack') && th.slackChannel;
  if (isSlack) {
    const text = ta.value.trim();
    const slackMode = state.slackReplyMode || 'thread';

    // Determine target channel and thread_ts based on reply mode
    let targetChannel = th.slackChannel;
    let targetThreadTs = th.slackThreadTs || undefined;
    let toastLabel = 'Slack';

    if (slackMode === 'thread') {
      // Reply in thread — use thread_ts
      toastLabel = 'thread';
    } else if (slackMode === 'channel') {
      // Reply to channel — no thread_ts (post to channel root)
      targetThreadTs = undefined;
      toastLabel = 'channel';
    } else if (slackMode === 'dm') {
      // DM to specific person — need to find/create DM channel
      const dmTarget = state._slackDmTarget;
      if (!dmTarget) { toast('Select a person to DM', 'er'); return; }
      // Find the target user's Slack userId from thread messages
      let targetUserId = null;
      if (th.messages) {
        for (const m of th.messages) {
          if (m.sender === dmTarget && m.userId) {
            targetUserId = m.userId;
            break;
          }
        }
      }
      if (!targetUserId) {
        toast('Could not find Slack user for ' + dmTarget, 'er');
        return;
      }
      // Open DM via conversations.open then send
      if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
      ta.disabled = true;
      fetch('/api/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: targetUserId, text: text })
      })
        .then(r => r.json())
        .then(d => {
          if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
          ta.disabled = false;
          if (d.ok) {
            ta.value = ''; ta.style.height = 'auto';
            toast('DM sent to ' + dmTarget.split(' ')[0] + '!', 'ok');
            setTimeout(() => loadCommsLive(true), 3000);
          } else {
            toast('DM failed: ' + (d.error || 'unknown'), 'er');
          }
        })
        .catch(() => {
          if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
          ta.disabled = false;
          toast('DM failed', 'er');
        });
      return; // DM handled separately
    }

    // Standard Slack send (thread or channel mode)
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
    ta.disabled = true;
    const payload = { channel: targetChannel, text: text };
    if (targetThreadTs) payload.thread_ts = targetThreadTs;
    fetch('/api/slack/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
      .then(r => r.json())
      .then(d => {
        if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
        ta.disabled = false;
        if (d.ok) {
          // Optimistic local append
          const now = new Date();
          const timeStr = now.toLocaleDateString('en-AU',{month:'short',day:'numeric'}) + ', ' + now.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:true});
          if (!th.messages) th.messages = [];
          th.messages.push({ sender:'You', text:text, time:timeStr, via:'slack', avatar:'ZS', colour:'var(--ac)' });
          th.threadCount = (th.threadCount || 0) + 1;
          th.lastSender = 'You';
          th.preview = text.slice(0,120);
          ta.value = '';
          ta.style.height = 'auto';
          toast('Sent to ' + toastLabel + '!','ok');
          renderAll();
          // Background refresh for server sync
          setTimeout(() => loadCommsLive(true), 3000);
        } else {
          toast('Send failed: '+(d.error||'unknown'),'er');
        }
      })
      .catch(() => {
        if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
        ta.disabled = false;
        toast('Send failed','er');
      });
  } else {
    // Email: route through modern composer with reply mode
    const replyMode = state.commsReplyMode || 'reply';
    const bodyText = ta.value.trim();
    const lastMsg = th.messages && th.messages.length ? th.messages[th.messages.length - 1] : null;
    const messageId = lastMsg ? (lastMsg.messageId || lastMsg.emailMessageId || lastMsg.graphId) : null;

    if (replyMode === 'compose') {
      // Open composer with empty To for manual selection
      openEmailComposer({
        mode: 'new',
        subject: 'Re: ' + (th.subject || ''),
        body: bodyText,
        threadId: id,
        messageId: messageId
      });
    } else {
      // Collect CC addresses from per-message To/CC (Phase 7)
      let ccAddresses = '';
      if (replyMode === 'replyAll' && th.messages) {
        const myEmail = (typeof COMPOSER_FROM !== 'undefined' ? COMPOSER_FROM : 'ziv.shalev@breville.com').toLowerCase();
        const ccSet = new Set();
        th.messages.forEach(function(m) {
          (m.to || []).forEach(function(r) {
            if (r.address && r.address.toLowerCase() !== myEmail) ccSet.add(r.address);
          });
          (m.cc || []).forEach(function(r) {
            if (r.address && r.address.toLowerCase() !== myEmail) ccSet.add(r.address);
          });
        });
        // Also remove the reply-to address from CC
        const replyTo = (th.replyEmail || '').toLowerCase();
        ccSet.delete(replyTo);
        ccAddresses = Array.from(ccSet).join(', ');
      }

      openEmailComposer({
        mode: replyMode,
        to: th.replyEmail || '',
        cc: ccAddresses,
        subject: '',
        body: bodyText,
        threadId: id,
        messageId: messageId
      });
    }

    // Clear the textarea after opening composer
    ta.value = '';
    ta.style.height = 'auto';
  }
}
function snoozeTopic(id) { state.topicStatus[id] = 'snoozed'; renderAll(); toast('Snoozed','ok'); }

// ── Actions & Decisions Panel ──
function _getTriageItems(filter) {
  const threads = DATA.comms.threads || {};
  const items = [];
  for (const [id, th] of Object.entries(threads)) {
    if (state.threadStatus[id] === 'done') continue;
    if (filter === 'decisions') {
      if (th.priority !== 'critical') continue;
    } else {
      if (th.priority !== 'critical' && th.priority !== 'action') continue;
    }
    items.push({ id, ...th });
  }
  // Sort: critical first, then by lastActivity (newest first)
  const priOrder = { critical: 0, action: 1 };
  items.sort((a, b) => {
    const pa = priOrder[a.priority] ?? 9, pb = priOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.lastActivity || '').localeCompare(a.lastActivity || '');
  });
  return items;
}

function _sourceIcon(th) {
  if (th.sources && th.sources.includes('email')) return '<span class="tp-src" title="Email">&#9993;</span>';
  if (th.sources && th.sources.includes('slack')) return '<span class="tp-src" title="Slack">#</span>';
  return '';
}

function _renderTriagePanel(mode) {
  const items = _getTriageItems(mode);
  const title = mode === 'decisions'
    ? items.length + ' Decision' + (items.length !== 1 ? 's' : '')
    : items.length + ' Action' + (items.length !== 1 ? 's' : '');

  if (!items.length) {
    openPanel(title, '<div style="padding:24px;text-align:center;opacity:.6">All clear — nothing pending</div>');
    state.panelMode = mode;
    return;
  }

  let html = '<div class="triage-panel-list">';
  for (const item of items) {
    const isSnoozed = state.threadStatus[item.id] === 'snoozed';
    const priBadge = item.priority === 'critical'
      ? '<span class="tp-pri critical">CRITICAL</span>'
      : '<span class="tp-pri action">ACTION</span>';
    const people = (item.people || []).filter(p => p !== 'Ziv Shalev').slice(0, 3).join(', ');
    const preview = (item.preview || '').slice(0, 120);

    html += `<div class="tp-card${isSnoozed ? ' snoozed' : ''}">
      <div class="tp-head">
        ${priBadge} ${_sourceIcon(item)}
        <span class="tp-subj">${item.subject || item.id}</span>
      </div>
      <div class="tp-meta">${people}${item.lastActivity ? ' &middot; ' + item.lastActivity : ''}</div>
      <div class="tp-preview">${preview}</div>
      <div class="tp-actions">
        <button class="tp-btn tp-done" onclick="markThreadDoneFromPanel('${item.id}','${mode}')">&#10003; Done</button>
        <button class="tp-btn tp-snooze" onclick="snoozeThreadFromPanel('${item.id}','${mode}')">&#9208; Snooze</button>
        <button class="tp-btn tp-open" onclick="openThreadFromPanel('${item.id}')">&#8594; Open</button>
      </div>
    </div>`;
  }
  html += '</div>';
  openPanel(title, html);
  state.panelMode = mode;
}

function showActionsPanel() { _renderTriagePanel('actions'); }
function showDecisionsPanel() { _renderTriagePanel('decisions'); }

function markThreadDoneFromPanel(id, mode) {
  state.threadStatus[id] = 'done';
  const th = DATA.comms.threads && DATA.comms.threads[id];
  const source = th?.sources?.includes('email') ? 'email' : 'slack';
  const subject = th?.subject || null;
  fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'done', source, subject }) }).catch(()=>{});
  renderAll(); // updates badge counts
  _renderTriagePanel(mode); // re-render panel with item removed
  toast('Archived','ok');
}

function snoozeThreadFromPanel(id, mode) {
  state.threadStatus[id] = 'snoozed';
  fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'snoozed' }) }).catch(()=>{});
  renderAll();
  _renderTriagePanel(mode);
  toast('Snoozed','ok');
}

function openThreadFromPanel(id) {
  closePanel();
  state.module = 'comms';
  state.selectedThread = id;
  loadCommsLive();
  startCommsPolling();
  renderAll();
}

// Persisted dismiss for news/metrics/correlations
function dismissItemPersist(itemId, itemType) {
  if (!state._dismissed) state._dismissed = {};
  state._dismissed[itemId] = itemType;
  fetch('/api/status/dismiss', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId, itemType }) }).catch(()=>{});
}
function undismissItemPersist(itemId) {
  if (state._dismissed) delete state._dismissed[itemId];
  fetch('/api/status/dismiss', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId, undo:true }) }).catch(()=>{});
}
function isItemDismissed(itemId) {
  return state._dismissed && !!state._dismissed[itemId];
}
// Clear thread status (undo done/snooze)
function clearThreadStatus(id) {
  delete state.threadStatus[id];
  delete state.commsSnoozed[id];
  fetch('/api/status/thread', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ threadId:id, status:'clear' }) }).catch(()=>{});
  renderAll();
  toast('Restored','ok');
}

function toggleSidebar() { state.sidebarCollapsed = !state.sidebarCollapsed; renderAll(); }

// Cross-module navigation
function navToPerson(pid) { state.selectedPerson=pid; switchModule('people'); }
function navToProject(pid) { state.selectedProject=pid; switchModule('projects'); }
function navToComm(cid) { state.selectedTopic=cid; state.selectedThread=cid; switchModule('comms'); }
function navToCalendar() { switchModule('calendar'); }
function navToSummary() { switchModule('summary'); }

// ─── Digest Freshness & Extraction ─────────────────────────────
let _digestFreshnessCache = null;

async function loadDigestFreshness() {
  try {
    const resp = await fetch('/api/digest/freshness');
    if (!resp.ok) return;
    _digestFreshnessCache = await resp.json();
    renderDigestFreshnessUI();
  } catch {}
}

function renderDigestFreshnessUI() {
  const el = document.getElementById('digestFreshness');
  if (!el || !_digestFreshnessCache) return;

  const f = _digestFreshnessCache;
  let html = '';

  // Overall status badge
  const statusColors = { fresh: 'var(--gn)', recent: 'var(--cy)', aging: 'var(--or)', stale: 'var(--rd)', no_data: 'var(--tx3)' };
  const statusLabels = { fresh: 'Fresh', recent: 'Recent', aging: 'Aging', stale: 'Stale', no_data: 'No Data' };
  const col = statusColors[f.overallStatus] || 'var(--tx3)';

  html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">`;
  html += `<span style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0"></span>`;
  html += `<span style="font-size:10px;font-weight:600;color:${col}">${statusLabels[f.overallStatus]}</span>`;
  if (f.bestDataAge !== null && f.bestDataAge !== undefined) {
    html += `<span style="font-size:9px;color:var(--tx3)">${f.bestDataAge === 0 ? 'today' : f.bestDataAge + 'd ago'}</span>`;
  }
  html += '</div>';

  // Per-cadence status
  for (const [cad, info] of Object.entries(f.cadences || {})) {
    if (!info.date && info.status === 'missing') continue;
    const cadCol = info.stale ? 'var(--or)' : 'var(--gn)';
    const cadLabel = cad.charAt(0).toUpperCase() + cad.slice(1);
    html += `<div style="font-size:9px;color:var(--tx3);padding:1px 0">`;
    html += `<span style="color:${cadCol}">${cadLabel}</span>: ${info.date || 'none'}`;
    if (info.pageCount) html += ` (${info.pageCount}p)`;
    html += '</div>';
  }

  // Trigger button
  html += `<button class="cadence-btn" style="margin-top:6px;padding:2px 8px;font-size:9px;width:100%" onclick="triggerDigestExtraction()">Run Extraction</button>`;

  el.innerHTML = html;
}

async function triggerDigestExtraction(cadence) {
  cadence = cadence || 'daily';
  toast('Starting Power BI extraction...', 'info');
  try {
    const resp = await fetch('/api/digest/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence, headless: true })
    });
    const json = await resp.json();
    if (json.ok) {
      toast(`Extraction started (${cadence}) — will take ~2 min`, 'ok');
    } else {
      toast(json.error || 'Extraction failed', 'err');
    }
  } catch (e) {
    toast('Could not trigger extraction: ' + e.message, 'err');
  }
}

/** Force reload metrics engine data (clears cache) */
async function refreshMetricsData() {
  DATA._metricsEngine = null;
  _metricsData = null;
  _metricsLoading = false;
  loadMetricsEngine();
  await loadMetricsEngineLearning();
  await loadDigestFreshness();
  renderAll();
}

// ═══════════════════════════════════════════════════════════════
// LEARNING ENGINE DASHBOARD
// ═══════════════════════════════════════════════════════════════

async function renderLearningPanel() {
  const el = document.getElementById('learningPanel');
  if (!el) return;

  // Use cached learning state or fetch
  if (!DATA._learningState) await loadLearningState();
  const ls = DATA._learningState;
  if (!ls) { el.innerHTML = '<span style="font-size:9px;color:var(--tx3)">No data</span>'; return; }

  let html = '';

  // Stats summary
  const stats = ls.stats || {};
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">';
  html += lStatBox(stats.totalFeedback || 0, 'Feedback');
  html += lStatBox(stats.last7d || 0, 'Views (7d)');
  html += lStatBox(stats.feedbackLast7d || 0, 'Signals (7d)');
  html += lStatBox(Object.keys(ls.weights || {}).length, 'Weights');
  html += '</div>';

  // Patterns
  const patterns = ls.patterns || [];
  if (patterns.length) {
    html += '<div style="margin-bottom:6px">';
    patterns.slice(0, 4).forEach(p => {
      const confPct = Math.round(p.confidence * 100);
      const confCol = confPct > 70 ? 'var(--gn)' : confPct > 40 ? 'var(--or)' : 'var(--tx3)';
      html += `<div style="font-size:9px;color:var(--tx2);padding:2px 0;display:flex;justify-content:space-between">`;
      html += `<span>${p.pattern}</span>`;
      html += `<span style="color:${confCol};font-weight:600">${confPct}%</span>`;
      html += '</div>';
    });
    html += '</div>';
  }

  // Active alerts
  const alerts = ls.alerts || [];
  const activeAlerts = alerts.filter(a => a.active);
  if (activeAlerts.length) {
    html += '<div style="font-size:9px;color:var(--or);font-weight:600;margin-bottom:2px">Active Alerts</div>';
    activeAlerts.forEach(a => {
      const dir = a.direction === 'above' ? '>' : '<';
      html += `<div style="font-size:9px;color:var(--tx3);padding:1px 0">${a.metric_id} ${dir} ${a.threshold}</div>`;
    });
  }

  // Pinned insights
  const pinned = ls.pinnedInsights || [];
  if (pinned.length) {
    html += `<div style="font-size:9px;color:var(--yl);margin-top:4px">&#9733; ${pinned.length} pinned</div>`;
  }

  el.innerHTML = html;
}

function lStatBox(val, label) {
  return `<div style="text-align:center;padding:4px;background:var(--s2);border-radius:4px"><div style="font-size:12px;font-weight:700;color:var(--cy)">${val}</div><div style="font-size:8px;color:var(--tx3)">${label}</div></div>`;
}

/** Check metric alerts and show toasts for triggered ones */
async function checkMetricAlerts() {
  if (!DATA._metricsEngine?.metrics) return;
  try {
    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_alerts', metrics: DATA._metricsEngine.metrics })
    });
    const json = await resp.json();
    if (json.triggered && json.triggered.length) {
      json.triggered.forEach(t => {
        toast(`Alert: ${t.message}`, 'err');
      });
    }
  } catch {}
}
