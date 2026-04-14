// ===============================================================
// COMMS MODULE — Clean Inbox Orchestrator
// ===============================================================
// Delegates rendering to:
//   comms-inbox.js    — Thread list pane
//   comms-reading.js  — Reading pane + AI summary
//   comms-compose.js  — Email composer overlay
//   comms-drafts.js   — AI draft API functions

// ── Shared Helper Functions ──

// Normalise short date strings: "16 Mar", "Mar 16", "Mar 16 2026", etc.
// Returns a Date-parseable string with year appended when missing.
function _normaliseDateStr(raw) {
  if (!raw) return raw;
  var s = raw.trim();
  var currentYear = new Date().getFullYear();
  // "Mar 16" or "16 Mar" (no year) — append current year
  if (/^\w{3}\s\d{1,2}$/.test(s) || /^\d{1,2}\s\w{3}$/.test(s)) {
    return s + ' ' + currentYear;
  }
  return s;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  if (/ago|today|yesterday/i.test(dateStr)) return dateStr;
  var now = new Date();
  try {
    var normalised = _normaliseDateStr(dateStr);
    var d = new Date(normalised);
    if (isNaN(d)) return dateStr;
    var diffMs = now - d;
    var diffDays = Math.floor(diffMs / 86400000);

    // Today: show time like "4:52 PM"
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Yesterday
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    // This week: "2d ago"
    if (diffDays < 7) return diffDays + 'd ago';
    // Older: show short date "14 Mar"
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  } catch (e) { return dateStr; }
}

function getPersonInfo(name) {
  if (!name || name === 'You') return { role: 'You', initials: 'ZS', colour: 'var(--ac)' };
  for (var key in DATA.people) {
    var pe = DATA.people[key];
    if (pe.n === name) return {
      role: pe.role || '',
      initials: pe.initials || name.slice(0, 2).toUpperCase(),
      colour: pe.colour || 'var(--s3)'
    };
  }
  // Fuzzy match by first name
  for (var key2 in DATA.people) {
    var pe2 = DATA.people[key2];
    if (name.includes(pe2.n.split(' ')[0]) && pe2.n.split(' ')[0].length > 2) {
      return {
        role: pe2.role || '',
        initials: pe2.initials || '',
        colour: pe2.colour || 'var(--s3)'
      };
    }
  }
  var parts = name.split(' ');
  return {
    role: '',
    initials: (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase(),
    colour: 'var(--tx3)'
  };
}

function computeThreadScore(th, id) {
  // Primary sort: timestamp (newest first). Score = epoch ms / 1000 so
  // a 1-minute difference = 60 points — dominates all priority bonuses.
  var score = 0;
  try {
    var act = th.lastActivity || '';
    var normalised = _normaliseDateStr(act);
    var d = new Date(normalised);
    if (!isNaN(d)) {
      score = d.getTime() / 1000; // seconds since epoch — huge number, ensures chronological order
    }
  } catch (e) { /* ignore */ }

  // AI-driven priority bonuses — significant enough to reorder within the same day
  // but not so large that old critical items override today's new messages
  if (state.commsPinned[id]) score += 3600; // +1 hour equiv
  if (th.aiPriority === 'critical') score += 7200; // +2 hours equiv
  else if (th.aiPriority === 'high') score += 3600; // +1 hour equiv
  if (th.aiActionRequired) score += 1800; // +30 min equiv
  if (th.unread) score += 900; // +15 min equiv
  // Deprioritize FYI and Social categories
  if (th.aiCategory === 'FYI' || th.aiCategory === 'Social') score -= 600;
  if (th.aiCategory === 'External' && !th.aiActionRequired) score -= 300;
  return score;
}

function getTimeGroup(dateStr) {
  if (!dateStr) return 'Older';
  try {
    var now = new Date();
    var normalised = _normaliseDateStr(dateStr);
    var d = new Date(normalised);
    if (isNaN(d)) return 'Older';
    var diffDays = Math.floor((now - d) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    return 'Older';
  } catch (e) { return 'Older'; }
}

// ── Client-Side Thread Enrichment ──

function enrichThreadsClient() {
  var threads = DATA.comms.threads || {};
  for (var id in threads) {
    var th = threads[id];
    if (!th.projectLinks || !th.projectLinks.length) {
      th.projectLinks = [];
      var text = ((th.subject || '') + ' ' + (th.preview || '')).toLowerCase();
      for (var pid in DATA.projects) {
        var proj = DATA.projects[pid];
        if (proj.title && text.includes(proj.title.toLowerCase())) {
          th.projectLinks.push(pid);
        }
      }
    }
    if ((!th.peopleLinks || !th.peopleLinks.length) && th.people && th.people.length) {
      th.peopleLinks = [];
      th.people.forEach(function(name) {
        if (!name) return; // skip null/undefined names from Slack API
        for (var ppid in DATA.people) {
          var pe = DATA.people[ppid];
          if (pe.n === name || (name.length > 3 && pe.n.includes(name.split(' ')[0]))) {
            if (th.peopleLinks.indexOf(ppid) === -1) th.peopleLinks.push(ppid);
            break;
          }
        }
      });
    }
    if (!th.aiPriority && (th.priority === 'fyi' || th.priority === 'auto')) {
      var kwText = ((th.subject || '') + ' ' + (th.preview || '')).toLowerCase();
      if (/urgent|critical|blocker|asap|escalat/.test(kwText)) th.priority = 'action';
    }
    th.smartScore = computeThreadScore(th, id);
  }
}

// ── Suggested Reply Generation ──

function generateReplySuggestions(thread) {
  if (thread.replyDraft) {
    var draft = thread.replyDraft.split('\n')[0].slice(0, 60);
    return [draft + (thread.replyDraft.length > 60 ? '...' : ''), 'Use full draft'];
  }
  var suggestions = [];
  var lastSender = thread.lastSender ? thread.lastSender.split(' ')[0] : 'there';
  var lastMsg = (thread.messages && thread.messages.length)
    ? thread.messages[thread.messages.length - 1] : null;
  var lastText = (lastMsg && lastMsg.text || '').toLowerCase();
  if (lastMsg && lastMsg.sender === 'You') return [];
  var isQuestion = lastText.includes('?')
    || /\b(can you|could you|do you|would you|what|when|where|how|should|thoughts)\b/.test(lastText);
  var isRequest = /\b(please|need|update|review|approve|confirm|check|share|send)\b/.test(lastText);
  var isMeeting = /\b(call|meeting|sync|catch up|chat|discuss|calendar)\b/.test(lastText);
  if (thread.priority === 'critical') {
    suggestions.push('On it — will action today.');
    if (isQuestion) suggestions.push('Good question, let me check and come back to you.');
    else suggestions.push('Thanks ' + lastSender + ', reviewing now.');
    suggestions.push('Let me loop in the right people.');
  } else if (thread.priority === 'action') {
    suggestions.push('Thanks ' + lastSender + ', noted.');
    if (isRequest) suggestions.push("I'll get this done today.");
    else if (isQuestion) suggestions.push('Let me look into this and circle back.');
    else if (isMeeting) suggestions.push("Let's find a time — I'll send an invite.");
    else suggestions.push("I'll review and follow up.");
  } else {
    suggestions.push('Thanks ' + lastSender + '!');
    suggestions.push('Noted, thanks for the update.');
    if (isQuestion) suggestions.push('Good question — let me check.');
  }
  return suggestions.slice(0, 3);
}

// ── Inline Slack Actions ──

async function sendInlineSlack(threadId, channel, threadTs) {
  var ta = $('inlineReplyText-' + threadId);
  if (!ta) ta = $('commsQuickReply');
  if (!ta || !ta.value.trim()) { toast('Please enter a message', 'er'); return; }
  var text = ta.value.trim();
  if (channel) {
    try {
      var payload = { channel: channel, text: text };
      if (threadTs) payload.thread_ts = threadTs;
      var resp = await fetch('/api/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await resp.json();
      if (data.ok) {
        ta.value = '';
        toast('Sent to Slack!', 'ok');
        DATA._commsLiveLoaded = false;
        if (typeof loadCommsLive === 'function') loadCommsLive();
        return;
      }
      console.warn('Slack send failed:', data.error);
    } catch (e) { console.warn('Slack send error:', e); }
  }
  openSendModal(threadId, 'slack');
}

async function addSlackReaction(threadId, msgTs, emoji, emojiName) {
  var th = DATA.comms.threads && DATA.comms.threads[threadId];
  if (!th || !th.slackChannel) { toast('Not a Slack thread', 'er'); return; }
  var timestamp = msgTs || th.slackThreadTs;
  if (!timestamp) { toast('No message timestamp', 'er'); return; }
  try {
    var resp = await fetch('/api/slack/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: th.slackChannel, timestamp: timestamp, name: emojiName })
    });
    var data = await resp.json();
    if (data.ok) toast(emoji + ' Reacted!', 'ok');
    else if (data.error === 'already_reacted') toast('Already reacted ' + emoji, 'ok');
    else toast('Reaction failed: ' + (data.error || 'unknown'), 'er');
  } catch (e) { toast('Reaction failed', 'er'); }
}

// ===============================================================
// RENDER: Sidebar — 56px thin icon rail
// ===============================================================

function renderCommsSidebar() {
  var sb = $('sidebar');
  var threads = DATA.comms.threads || {};

  // Count unread per source
  var unreadCounts = { all: 0, email: 0, slack: 0 };
  for (var id in threads) {
    var th = threads[id];
    if (state.threadStatus[id] === 'done') continue;
    if (th.unread) {
      unreadCounts.all++;
      (th.sources || []).forEach(function(s) {
        if (unreadCounts[s] !== undefined) unreadCounts[s]++;
      });
    }
  }

  var html = '<div class="comms-icon-rail">';

  // Source icons
  var items = [
    { key: 'all',   svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>', label: 'All', count: unreadCounts.all },
    { key: 'email', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>', label: 'Email', count: unreadCounts.email },
    { key: 'slack', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z"/><path d="M10 9.5C10 10.33 9.33 11 8.5 11h-5C2.67 11 2 10.33 2 9.5S2.67 8 3.5 8h5c.83 0 1.5.67 1.5 1.5z"/><path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z"/></svg>', label: 'Slack', count: unreadCounts.slack }
  ];

  items.forEach(function(item) {
    var active = state.commsSource === item.key ? ' active' : '';
    var badge = item.count > 0 ? '<span class="icon-rail-badge">' + item.count + '</span>' : '';
    html += '<div class="icon-rail-btn' + active + '" onclick="setState(\'commsSource\',\'' + item.key + '\')" title="' + item.label + '">';
    html += badge;
    html += '<span class="icon-rail-svg">' + item.svg + '</span>';
    html += '</div>';
  });

  html += '<div class="icon-rail-sep"></div>';

  // Compose
  html += '<div class="icon-rail-btn" onclick="openSendModal(null,\'outlook\')" title="Compose">';
  html += '<span class="icon-rail-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>';
  html += '</div>';

  // Sync
  html += '<div class="icon-rail-btn" onclick="triggerManualRefresh()" title="Sync">';
  html += '<span class="icon-rail-svg" id="refreshIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg></span>';
  html += '</div>';

  // Spacer
  html += '<div style="flex:1"></div>';

  // Auth status (compact)
  html += '<div id="outlookAuthStatus" class="icon-rail-auth"></div>';

  // Refresh status
  html += '<div id="refreshStatus" class="icon-rail-status"></div>';

  html += '</div>';
  sb.innerHTML = html;

  if (typeof updateRefreshStatusUI === 'function') updateRefreshStatusUI();
  if (typeof checkOutlookAuth === 'function') checkOutlookAuth();
}

// ===============================================================
// RENDER: Main — Thread list + Reading pane
// ===============================================================

function renderCommsMain() {
  var el = $('main');
  var html = '';

  // Thread list + Reading pane side by side (CSS grid)
  html += renderCommsThreadList() + renderCommsReadingPane();

  el.innerHTML = html;

  // Email composer overlay
  if (state.commsComposerOpen && typeof renderEmailComposer === 'function') {
    var container = document.getElementById('emailComposerContainer');
    if (container) container.innerHTML = renderEmailComposer();
  }
}
