// ===============================================================
// COMMS READING PANE — Clean AI-enriched reading view
// ===============================================================

// ── HTML Encoding ──
function encodeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Attachment Helpers ──

/** Return a file-type icon for an attachment based on contentType, filetype, or filename */
function _attachIcon(att) {
  var ct = (att.contentType || '').toLowerCase();
  var ft = (att.filetype || '').toLowerCase();
  var name = (att.name || '').toLowerCase();
  if (ct.includes('pdf') || ft === 'pdf' || name.endsWith('.pdf')) return '\uD83D\uDCD5';
  if (ct.includes('image') || /^(png|jpg|jpeg|gif|svg|webp|bmp|heic)$/.test(ft) || /\.(png|jpg|jpeg|gif|svg|webp)$/.test(name)) return '\uD83D\uDDBC\uFE0F';
  if (ct.includes('spreadsheet') || ct.includes('excel') || /^(xlsx?|csv|numbers)$/.test(ft) || /\.(xlsx?|csv)$/.test(name)) return '\uD83D\uDCCA';
  if (ct.includes('word') || ct.includes('document') || /^(docx?|rtf|gdoc|pages)$/.test(ft) || /\.(docx?|rtf)$/.test(name)) return '\uD83D\uDCDD';
  if (ct.includes('presentation') || /^(pptx?|key|gslides)$/.test(ft) || /\.(pptx?|key)$/.test(name)) return '\uD83D\uDCFD\uFE0F';
  if (ct.includes('zip') || ct.includes('compressed') || /^(zip|rar|7z|tar|gz|gzip)$/.test(ft) || /\.(zip|rar|7z|tar|gz)$/.test(name)) return '\uD83D\uDCE6';
  if (ct.includes('video') || /^(mp4|mov|avi|webm|mkv)$/.test(ft)) return '\uD83C\uDFA5';
  if (ct.includes('audio') || /^(mp3|wav|ogg|m4a|aac)$/.test(ft)) return '\uD83C\uDFB5';
  if (/^(js|ts|py|rb|go|java|c|cpp|css|html|json|xml|yaml|yml|sh|sql)$/.test(ft)) return '\uD83D\uDCBB';
  return '\uD83D\uDCCE';
}

/** Format file size as human-readable string.
 *  Accepts: number (bytes), or string like "45KB", "2.5MB", "1234" */
function _formatFileSize(val) {
  if (!val) return '';
  // If it's already a formatted string (e.g. "45KB", "2.5MB"), return as-is
  if (typeof val === 'string') {
    if (/\d+\s*(KB|MB|GB|B)/i.test(val)) return val;
    // Try to parse as numeric string
    var parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed <= 0) return val;
    val = parsed;
  }
  if (typeof val !== 'number' || val <= 0) return '';
  if (val < 1024) return val + ' B';
  if (val < 1048576) return Math.round(val / 1024) + ' KB';
  return (val / 1048576).toFixed(1) + ' MB';
}

// ===============================================================
// 1. renderCommsReadingPane — full right-side reading pane
// ===============================================================

function renderCommsReadingPane() {
  var threads = DATA.comms.threads || {};
  var id = state.selectedThread;
  var th = id ? threads[id] : null;

  // Empty state
  if (!th) {
    return '<div class="comms-reading"><div class="comms-reading-empty">'
      + '<div class="empty-icon">\uD83D\uDCEC</div>'
      + '<div class="empty-title">Select a conversation</div>'
      + '<div class="empty-hint">Use <kbd>J</kbd> / <kbd>K</kbd> to navigate \u00B7 <kbd>Enter</kbd> to open</div>'
      + '</div></div>';
  }

  var html = '<div class="comms-reading">';
  html += '<div class="comms-reading-scroll">';

  // ── Thread header ──
  var isSlackThread = th.sources && th.sources.includes('slack');
  var sourceType = th.sourceType || '';
  html += '<div class="comms-thread-header">';

  // Slack conversation context bar (compact, clean)
  if (isSlackThread && sourceType) {
    var ctxLabels = { channel: 'Public Channel', 'private': 'Private Channel', group: 'Group DM', dm: 'Direct Message' };
    var ctxPrefix = { channel: '# ', 'private': '\uD83D\uDD12 ', group: '', dm: '' };
    var ctxName = '';
    if (sourceType === 'channel' || sourceType === 'private') {
      ctxName = th.slackChannelName || sourceType;
    } else if (sourceType === 'group') {
      var gNames = (th.people || []).filter(function(p) { return p !== 'Ziv Shalev' && p !== 'You'; });
      ctxName = gNames.length ? gNames.map(function(n) { return n.split(' ')[0]; }).join(', ') : (th.slackChannelName || 'Group');
    } else if (sourceType === 'dm') {
      ctxName = (th.people && th.people.find(function(p) { return p !== 'Ziv Shalev' && p !== 'You'; })) || th.slackChannelName || 'Direct Message';
    }
    html += '<div class="slack-context-bar context-' + sourceType + '">';
    html += '<span class="slack-ctx-name">' + (ctxPrefix[sourceType] || '') + encodeHtml(ctxName) + '</span>';
    html += '<span class="slack-ctx-label">' + (ctxLabels[sourceType] || 'Slack') + '</span>';
    html += '</div>';
  }

  html += '<h2 class="thread-title">' + encodeHtml(th.subject) + '</h2>';

  // AI classification badges row (visible before opening)
  if (th.aiCategory || th.aiPriority || (th.aiProjectTags && th.aiProjectTags.length)) {
    html += '<div class="thread-ai-badges">';
    if (th.aiPriority === 'critical') html += '<span class="ai-badge priority-critical">\u26A0 Critical</span>';
    else if (th.aiPriority === 'high') html += '<span class="ai-badge priority-high">High Priority</span>';
    if (th.aiCategory && th.aiCategory !== 'FYI') html += '<span class="ai-badge cat-badge cat-' + th.aiCategory.toLowerCase() + '">' + encodeHtml(th.aiCategory) + '</span>';
    // Project tags — deduplicate against category name and marketing flag
    if (th.aiProjectTags && th.aiProjectTags.length) {
      var catLower = (th.aiCategory || '').toLowerCase();
      var seen = {};
      th.aiProjectTags.forEach(function(tag) {
        var tagLower = tag.toLowerCase();
        if (tagLower === catLower || tagLower === 'marketing' || seen[tagLower]) return;
        seen[tagLower] = true;
        html += '<span class="ai-badge project-badge">' + encodeHtml(tag) + '</span>';
      });
    }
    if (th.aiIsMarketing && (th.aiCategory || '').toLowerCase() !== 'marketing') {
      html += '<span class="ai-badge mkt-badge">Marketing</span>';
    }
    if (th.aiActionRequired) html += '<span class="ai-badge action-badge">\u2757 Action Required: ' + encodeHtml(th.aiActionType || 'review') + '</span>';
    html += '</div>';
  }

  html += '<div class="thread-header-meta">';

  // Source label in meta line
  if (isSlackThread) {
    html += '<span class="thread-src-label src-slack">Slack</span>';
    html += '<span>\u00B7</span>';
  } else {
    html += '<span class="thread-src-label src-email">Email</span>';
    html += '<span>\u00B7</span>';
  }

  html += '<span>' + (th.threadCount || 1) + ' message' + ((th.threadCount || 1) !== 1 ? 's' : '') + '</span>';
  html += '<span>\u00B7</span>';

  // ── Participant chips ──
  var people = th.people || [];
  if (people.length > 0) {
    html += '<div class="participant-chips">';
    var maxChips = 4;
    people.slice(0, maxChips).forEach(function(name) {
      var pi = getPersonInfo(name);
      html += '<span class="participant-chip" title="' + encodeHtml(name) + (pi.role ? ' \u2014 ' + encodeHtml(pi.role) : '') + '" style="background:' + pi.colour + '22;color:' + pi.colour + '">'
        + pi.initials + '</span>';
    });
    if (people.length > maxChips) {
      html += '<span class="participant-chip participant-more">+' + (people.length - maxChips) + '</span>';
    }
    html += '</div>';
  } else {
    html += '<span>0 participants</span>';
  }

  html += '<span>\u00B7</span>';
  html += '<span>' + relativeTime(th.lastActivity) + '</span>';
  html += '</div>';

  // Action buttons: Archive, Snooze, Pin
  html += '<div class="thread-actions">';

  // Archive
  html += '<button class="thread-action-btn" onclick="markThreadDone(\'' + id + '\')" title="Archive (E)">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  html += '</button>';

  // Snooze (with picker)
  html += '<button class="thread-action-btn" onclick="toggleSnoozePicker(\'' + id + '\')" title="Snooze (S)" style="position:relative">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  if (state.commsSnoozePickerOpen === id) {
    html += '<div class="snooze-picker">';
    html += '<div class="snooze-option" onclick="event.stopPropagation();snoozeThreadUntil(\'' + id + '\',\'3h\')">\u23F0 Later Today <span class="snooze-time">3 hours</span></div>';
    html += '<div class="snooze-option" onclick="event.stopPropagation();snoozeThreadUntil(\'' + id + '\',\'tomorrow\')">\uD83C\uDF05 Tomorrow <span class="snooze-time">9:00 AM</span></div>';
    html += '<div class="snooze-option" onclick="event.stopPropagation();snoozeThreadUntil(\'' + id + '\',\'nextweek\')">\uD83D\uDCC5 Next Week <span class="snooze-time">Mon 9 AM</span></div>';
    html += '<div class="snooze-option" style="border-top:1px solid var(--bd);margin-top:4px;padding-top:8px" onclick="event.stopPropagation()">';
    html += '<input type="date" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);padding:4px 8px;border-radius:4px;font-size:12px;width:100%" onchange="snoozeThreadUntil(\'' + id + '\',\'custom\',this.value)"/>';
    html += '</div></div>';
  }
  html += '</button>';

  // Mark read/unread
  var isUnread = th.unread;
  html += '<button class="thread-action-btn' + (isUnread ? ' active' : '') + '" onclick="toggleReadStatus(\'' + id + '\')" title="' + (isUnread ? 'Mark as Read (U)' : 'Mark as Unread (U)') + '">';
  html += isUnread
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>';
  html += '</button>';

  // Forward
  html += '<button class="thread-action-btn" onclick="openEmailComposer({mode:\'forward\',threadId:\'' + id + '\',messageId:\'' + (th.messages && th.messages.length ? encodeHtml(th.messages[th.messages.length-1].messageId || th.messages[th.messages.length-1].emailMessageId || th.messages[th.messages.length-1].graphId || '') : '') + '\'})" title="Forward (F)">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>';
  html += '</button>';

  // Pin
  var isPinned = state.commsPinned[id];
  html += '<button class="thread-action-btn' + (isPinned ? ' active' : '') + '" onclick="togglePin(\'' + id + '\')" title="Pin (P)">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  html += '</button>';

  // Save to notebook — capture full thread transcript
  var nbSourceType = isSlackThread ? 'slack_thread' : 'email_thread';
  html += saveToNotebookButton({
    sourceType: nbSourceType,
    ref: { threadId: id },
    title: th.subject || '(no subject)',
    summary: th.preview || ''
  });

  html += '</div>'; // end thread-actions
  html += '</div>'; // end comms-thread-header

  // ── In-thread search bar ──
  html += '<div class="thread-search-bar">';
  html += '<input class="thread-search-input" type="text" placeholder="Search in conversation\u2026" value="' + (state._threadSearch || '').replace(/"/g, '&quot;') + '" oninput="state._threadSearch=this.value;renderCommsMain()" />';
  if (state._threadSearch) {
    var searchQ = state._threadSearch.toLowerCase();
    var matchCount = (th.messages || []).filter(function(m) { return (m.text || '').toLowerCase().includes(searchQ) || (m.sender || '').toLowerCase().includes(searchQ); }).length;
    html += '<span class="thread-search-count">' + matchCount + ' match' + (matchCount !== 1 ? 'es' : '') + '</span>';
    html += '<button class="thread-search-clear" onclick="state._threadSearch=\'\';renderCommsMain()">&times;</button>';
  }
  html += '</div>';

  // ── AI Summary card ──
  html += renderAISummaryCard(id, th);

  // ── Messages ──
  if (th.messages && th.messages.length) {
    html += '<div class="thread-messages">';
    var msgs = th.messages;
    var isSlack = th.sources && th.sources.includes('slack');
    var hasThreadStructure = isSlack && msgs.some(function(m) { return m.isParent || m.isReply; });

    if (hasThreadStructure) {
      // Slack channel view: walk messages sequentially.
      // Standalone messages render normally; parent messages are followed
      // by their replies in an indented thread container.
      var idx = 0;
      var shownCount = 0;
      var collapsedStart = -1;

      // For long channels, collapse old messages (show first 2, collapse middle, show last 3)
      var standaloneCount = msgs.filter(function(m) { return !m.isReply; }).length;
      var shouldCollapse = standaloneCount > 6;
      var collapseAfter = shouldCollapse ? 2 : 999;
      var showLastN = shouldCollapse ? 3 : 0;
      var standalonesBeforeEnd = 0;

      while (idx < msgs.length) {
        var msg = msgs[idx];

        if (msg.isReply) {
          // Replies rendered under their parent — skip standalone rendering
          idx++;
          continue;
        }

        // Count how many standalone messages remain
        var remainingStandalone = 0;
        for (var ri = idx; ri < msgs.length; ri++) {
          if (!msgs[ri].isReply) remainingStandalone++;
        }

        // Collapse old middle section
        if (shouldCollapse && shownCount >= collapseAfter && remainingStandalone > showLastN) {
          if (collapsedStart === -1) {
            collapsedStart = idx;
            html += '<div class="msgs-collapsed" onclick="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">';
            html += '<span>\u2193 Older messages \u2014 click to expand</span>';
            html += '</div>';
            html += '<div class="msgs-hidden" style="display:none">';
          }
        }

        // Render the message
        html += buildMsgCard(msg, id);
        shownCount++;

        // If this is a thread parent, collect and render its replies
        if (msg.isParent) {
          var threadReplies = [];
          var nextIdx = idx + 1;
          while (nextIdx < msgs.length && msgs[nextIdx].isReply) {
            threadReplies.push(msgs[nextIdx]);
            nextIdx++;
          }
          if (threadReplies.length > 0) {
            html += '<div class="thread-replies-container">';
            html += '<div class="thread-replies-header">';
            html += '<span class="thread-reply-count">' + threadReplies.length + ' repl' + (threadReplies.length === 1 ? 'y' : 'ies') + '</span>';
            html += '</div>';
            html += '<div class="thread-replies-body">';
            if (threadReplies.length > 3) {
              html += buildMsgCard(threadReplies[0], id);
              html += '<div class="msgs-collapsed" onclick="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">';
              html += '<span>\u2193 ' + (threadReplies.length - 2) + ' more \u2014 expand</span></div>';
              html += '<div class="msgs-hidden" style="display:none">';
              for (var ti = 1; ti < threadReplies.length - 1; ti++) html += buildMsgCard(threadReplies[ti], id);
              html += '</div>';
              html += buildMsgCard(threadReplies[threadReplies.length - 1], id);
            } else {
              threadReplies.forEach(function(r) { html += buildMsgCard(r, id); });
            }
            html += '</div></div>';
          }
          idx = nextIdx;
        } else {
          idx++;
        }

        // Close collapsed section when we reach the last N messages
        if (collapsedStart !== -1 && shouldCollapse && remainingStandalone <= showLastN + 1) {
          html += '</div>'; // close msgs-hidden
          collapsedStart = -1;
        }
      }

      // Safety: close collapsed div if still open
      if (collapsedStart !== -1) html += '</div>';

    } else if (msgs.length > 5) {
      // Flat view with collapse (email conversations, DMs, groups with many messages)
      html += buildMsgCard(msgs[0], id);
      html += buildMsgCard(msgs[1], id);
      html += '<div class="msgs-collapsed" onclick="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">';
      html += '<span>' + (msgs.length - 4) + ' older messages \u2014 click to expand</span>';
      html += '</div>';
      html += '<div class="msgs-hidden" style="display:none">';
      for (var i = 2; i < msgs.length - 2; i++) {
        html += buildMsgCard(msgs[i], id);
      }
      html += '</div>';
      html += buildMsgCard(msgs[msgs.length - 2], id);
      html += buildMsgCard(msgs[msgs.length - 1], id);
    } else {
      msgs.forEach(function(msg) { html += buildMsgCard(msg, id); });
    }
    html += '</div>';
  }

  html += '</div>'; // end comms-reading-scroll

  // ── Suggested reply chips ──
  var suggestions = generateReplySuggestions(th);
  if (suggestions.length) {
    html += '<div class="reply-suggestions">';
    suggestions.forEach(function(s) {
      var escaped = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += '<button class="reply-chip" onclick="var ta=document.getElementById(\'commsQuickReply\');if(ta){ta.value=\'' + escaped + '\';ta.focus();ta.style.height=\'auto\';ta.style.height=ta.scrollHeight+\'px\'}">' + encodeHtml(s) + '</button>';
    });
    html += '</div>';
  }

  // ── Reply bar ──
  html += _renderReplyBar(id, th);

  html += '</div>'; // end comms-reading
  return html;
}

// ===============================================================
// 2. renderAISummaryCard — Rich structured AI summary (Phase 6)
// ===============================================================

function renderAISummaryCard(id, th) {
  // Auto-fetch if not cached
  if (!state.threadSummaries[id]) {
    fetchThreadSummary(id);
  }

  var s = state.threadSummaries[id];
  if (!s || s.loading) {
    return '<div class="ai-summary-card loading">'
      + '<div class="ai-summary-h">\uD83E\uDD16 AI Summary <span class="ai-loading">generating\u2026</span></div>'
      + '<div class="skel" style="height:40px;border-radius:6px"></div>'
      + '</div>';
  }
  if (s.error) return '';

  var html = '<div class="ai-summary-card">';
  html += '<div class="ai-summary-h">';
  html += '<span>\uD83E\uDD16</span> AI Summary';
  if (s.source === 'ai-cached') html += '<span class="ai-cached-badge">cached</span>';
  html += '<span style="flex:1"></span>';
  html += '<button class="btn-refresh-summary" onclick="delete state.threadSummaries[\'' + id + '\'];fetchThreadSummary(\'' + id + '\')" title="Regenerate summary">\uD83D\uDD04</button>';
  html += '<button class="btn-generate-draft" onclick="requestAIDraft(\'' + id + '\')">\u2728 Generate Draft</button>';
  html += '</div>';

  // Summary text
  if (s.summary) {
    html += '<div class="ai-summary-text">' + encodeHtml(s.summary) + '</div>';
  }

  // Key points
  if (s.keyPoints && s.keyPoints.length) {
    html += '<div class="ai-section">';
    html += '<div class="ai-section-label">Key Points</div>';
    html += '<ul class="ai-key-points">';
    s.keyPoints.forEach(function(kp) { html += '<li>' + encodeHtml(kp) + '</li>'; });
    html += '</ul>';
    html += '</div>';
  }

  // Decisions
  if (s.decisions && s.decisions.length) {
    html += '<div class="ai-section ai-decisions">';
    html += '<div class="ai-section-label">\u2705 Decisions</div>';
    html += '<ul>';
    s.decisions.forEach(function(d) { html += '<li>' + encodeHtml(d) + '</li>'; });
    html += '</ul>';
    html += '</div>';
  }

  // Action items
  if (s.actionItems && s.actionItems.length) {
    html += '<div class="ai-section ai-actions">';
    html += '<div class="ai-section-label">\uD83C\uDFAF Action Items</div>';
    html += '<ul>';
    s.actionItems.forEach(function(item) {
      var text = '';
      if (item.owner) text += '<strong>' + encodeHtml(item.owner) + ':</strong> ';
      text += encodeHtml(item.action || item);
      if (item.deadline) text += ' <span class="ai-deadline">' + encodeHtml(item.deadline) + '</span>';
      html += '<li>' + text + '</li>';
    });
    html += '</ul>';
    html += '</div>';
  }

  // Open questions
  if (s.openQuestions && s.openQuestions.length) {
    html += '<div class="ai-section ai-questions">';
    html += '<div class="ai-section-label">\u2753 Open Questions</div>';
    html += '<ul>';
    s.openQuestions.forEach(function(q) { html += '<li>' + encodeHtml(q) + '</li>'; });
    html += '</ul>';
    html += '</div>';
  }

  // Attachment insights
  if (s.attachmentInsights && s.attachmentInsights.length) {
    html += '<div class="ai-section ai-attach-insights">';
    html += '<div class="ai-section-label">\uD83D\uDCCE Attachment Insights</div>';
    html += '<ul>';
    s.attachmentInsights.forEach(function(a) { html += '<li>' + encodeHtml(a) + '</li>'; });
    html += '</ul>';
    html += '</div>';
  }

  // Participant details from AI
  if (s.participantDetails && s.participantDetails.length) {
    html += '<div class="ai-section ai-participants">';
    html += '<div class="ai-section-label">\uD83D\uDC65 Participants</div>';
    html += '<div class="ai-participant-list">';
    s.participantDetails.forEach(function(p) {
      var pi = getPersonInfo(p.name);
      html += '<div class="ai-participant">';
      html += '<span class="ai-participant-avatar" style="background:' + pi.colour + '22;color:' + pi.colour + '">' + pi.initials + '</span>';
      html += '<span class="ai-participant-name">' + encodeHtml(p.name) + '</span>';
      if (p.role) html += '<span class="ai-participant-role">' + encodeHtml(p.role) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // Suggested action
  if (s.suggestedAction) {
    html += '<div class="ai-suggested">\uD83D\uDCA1 ' + encodeHtml(s.suggestedAction) + '</div>';
  }

  // Quick reply chips from AI
  if (s.quickReplies && s.quickReplies.length) {
    html += '<div class="ai-quick-replies">';
    html += '<div class="ai-quick-label">Suggested replies</div>';
    s.quickReplies.forEach(function(qr) {
      var escaped = qr.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += '<button class="reply-chip" onclick="var ta=document.getElementById(\'commsQuickReply\');if(ta){ta.value=\'' + escaped + '\';ta.focus();ta.style.height=\'auto\';ta.style.height=ta.scrollHeight+\'px\'}">';
      html += encodeHtml(qr) + '</button>';
    });
    html += '</div>';
  }

  // ── Inline draft display (if one exists) ──
  var draft = (state.commsDrafts && state.commsDrafts[id]) || null;
  if (draft && draft.draftText) {
    var platform = (th.sources && th.sources.includes('slack')) ? 'slack' : 'outlook';
    html += '<div class="ai-draft-inline">';
    html += '<div class="ai-draft-label">\u270D\uFE0F AI Draft</div>';
    html += '<textarea class="ai-draft-text" id="draftText-' + id + '" rows="4">' + encodeHtml(draft.draftText) + '</textarea>';
    html += '<div class="ai-draft-actions">';
    html += '<button class="btn btn-sm btn-p" onclick="sendDraft(\'' + (draft.draftId || '') + '\',\'' + platform + '\')">Send</button>';
    html += '<button class="btn btn-sm btn-g" onclick="requestAIDraft(\'' + id + '\')">\uD83D\uDD04 Regenerate</button>';
    html += '<button class="btn btn-sm btn-g" onclick="discardDraft(\'' + id + '\')">Discard</button>';
    html += '</div></div>';
  } else if (draft && draft.loading) {
    html += '<div class="ai-draft-inline loading">';
    html += '<div class="skel" style="height:50px;border-radius:6px"></div>';
    html += '<span style="font-size:12px;color:var(--tx3)">Generating draft\u2026</span>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ===============================================================
// 3. buildMsgCard — single message card (Phase 4 + 5)
// ===============================================================

function buildMsgCard(msg, threadId) {
  var isYou = msg.sender === 'You' || msg.isYou;
  var via = msg.via || 'email';
  var pi = getPersonInfo(msg.sender);
  var avatarBg = msg.colour || pi.colour;
  var avatarTxt = msg.avatar || pi.initials;
  var hasSlackAvatar = via === 'slack' && msg.avatarUrl && msg.avatarUrl.startsWith('http');

  var isMsgPinnedCheck = state._pinnedMessages && state._pinnedMessages[threadId + ':' + (msg.slackTs || msg.messageId || msg.emailMessageId || msg.graphId || '')];
  var isReply = msg.isReply || (msg.replyToTs && msg.replyToTs !== msg.slackTs);
  var isParent = msg.isParent;
  var h = '<div class="msg-card' + (isYou ? ' msg-you' : '') + (isMsgPinnedCheck ? ' msg-pinned' : '') + (isParent ? ' msg-parent' : '') + (isReply ? ' msg-is-reply' : '') + '">';

  // Reply context indicator
  if (isReply && msg.replyToSender) {
    h += '<div class="msg-reply-context">';
    h += '<span class="reply-arrow">\u21B3</span> Replying to <strong>' + encodeHtml(msg.replyToSender) + '</strong>';
    if (msg.replyToPreview) h += ': <span class="reply-preview">' + encodeHtml(msg.replyToPreview.substring(0, 60)) + '</span>';
    h += '</div>';
  }

  // Header: avatar + sender + time
  h += '<div class="msg-header">';
  if (hasSlackAvatar && !isYou) {
    h += '<img class="msg-avatar msg-avatar-img" src="' + encodeHtml(msg.avatarUrl) + '" alt="' + encodeHtml(msg.sender) + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />';
    h += '<div class="msg-avatar msg-avatar-fallback" style="display:none;background:' + avatarBg + '22;color:' + avatarBg + '">' + avatarTxt + '</div>';
  } else {
    h += '<div class="msg-avatar" style="background:' + avatarBg + '22;color:' + avatarBg + '">' + avatarTxt + '</div>';
  }
  h += '<div class="msg-sender">';
  h += '<span class="msg-name">' + encodeHtml(msg.sender) + '</span>';
  if (pi.role && !isYou) h += '<span class="msg-role">' + encodeHtml(pi.role) + '</span>';
  h += '</div>';
  h += '<span class="msg-time">' + relativeTime(msg.time) + '</span>';
  // Delivery/read status for sent messages
  if (isYou) {
    if (via === 'email') {
      if (msg.isDelivered !== false) {
        h += '<span class="msg-status delivered" title="Delivered">\u2713</span>';
      }
      if (msg.isReadByRecipient || msg.isRead) {
        h += '<span class="msg-status read" title="Read">\u2713\u2713</span>';
      }
    } else if (via === 'slack') {
      h += '<span class="msg-status delivered" title="Sent">\u2713</span>';
    }
  }
  // Per-message action buttons
  var msgKey = threadId + ':' + (msg.slackTs || msg.messageId || msg.emailMessageId || msg.graphId || '');
  var isMsgPinned = state._pinnedMessages && state._pinnedMessages[msgKey];
  h += '<div class="msg-actions">';
  h += '<button class="msg-action-btn' + (isMsgPinned ? ' active' : '') + '" onclick="event.stopPropagation();_toggleMsgPin(\'' + encodeHtml(msgKey) + '\')" title="' + (isMsgPinned ? 'Unpin message' : 'Pin message') + '">\u2B50</button>';
  h += '<button class="msg-action-btn" onclick="event.stopPropagation();_copyMsgText(this)" title="Copy text">\uD83D\uDCCB</button>';
  h += '<button class="msg-action-btn" onclick="event.stopPropagation();_quoteMsgToReply(\'' + encodeHtml((msg.sender || '').replace(/'/g, "\\'")) + '\',\'' + encodeHtml((msg.text || '').substring(0, 200).replace(/'/g, "\\'").replace(/\n/g, ' ')) + '\')" title="Quote in reply">\u275D</button>';
  h += '</div>';
  h += '</div>';

  // Recipients — Phase 4: render To/CC with name + address tooltips
  if (msg.to && msg.to.length) {
    h += '<div class="msg-recipients">';
    h += '<strong>To:</strong> ';
    h += msg.to.map(function(r) {
      if (typeof r === 'string') return encodeHtml(r);
      var display = r.name || r.address || '';
      var title = r.address ? encodeHtml(r.address) : '';
      return '<span title="' + title + '">' + encodeHtml(display) + '</span>';
    }).join(', ');
    if (msg.cc && msg.cc.length) {
      h += ' &nbsp;<strong>CC:</strong> ';
      h += msg.cc.map(function(r) {
        if (typeof r === 'string') return encodeHtml(r);
        var display = r.name || r.address || '';
        var title = r.address ? encodeHtml(r.address) : '';
        return '<span title="' + title + '">' + encodeHtml(display) + '</span>';
      }).join(', ');
    }
    h += '</div>';
  }

  // Calendar invite detection — render RSVP card if message is a meeting invite
  if (msg.meetingType || msg.isMeetingRequest || (msg.contentType && msg.contentType.includes('calendar'))) {
    h += '<div class="msg-calendar-invite">';
    h += '<div class="cal-invite-header">';
    h += '<span class="cal-invite-icon">\uD83D\uDCC5</span>';
    h += '<span class="cal-invite-type">' + (msg.meetingType === 'cancel' ? 'Meeting Cancelled' : 'Meeting Invite') + '</span>';
    h += '</div>';
    if (msg.meetingSubject) h += '<div class="cal-invite-subject">' + encodeHtml(msg.meetingSubject || msg.subject || th.subject) + '</div>';
    if (msg.meetingStart || msg.startDateTime) {
      var start = msg.meetingStart || msg.startDateTime;
      var end = msg.meetingEnd || msg.endDateTime;
      h += '<div class="cal-invite-time">\u23F0 ' + encodeHtml(start);
      if (end) h += ' \u2192 ' + encodeHtml(end);
      h += '</div>';
    }
    if (msg.meetingLocation || msg.location) {
      h += '<div class="cal-invite-location">\uD83D\uDCCD ' + encodeHtml(msg.meetingLocation || msg.location) + '</div>';
    }
    if (msg.eventId && msg.meetingType !== 'cancel') {
      h += '<div class="cal-invite-rsvp">';
      h += '<button class="cal-rsvp-btn accept" onclick="event.stopPropagation();_rsvpCalendar(\'' + encodeHtml(msg.eventId) + '\',\'accept\')">\u2705 Accept</button>';
      h += '<button class="cal-rsvp-btn tentative" onclick="event.stopPropagation();_rsvpCalendar(\'' + encodeHtml(msg.eventId) + '\',\'tentative\')">\u2753 Tentative</button>';
      h += '<button class="cal-rsvp-btn decline" onclick="event.stopPropagation();_rsvpCalendar(\'' + encodeHtml(msg.eventId) + '\',\'decline\')">\u274C Decline</button>';
      h += '</div>';
    }
    h += '</div>';
  }

  // Body — with search highlight if active
  var msgBodyId = 'msgBody-' + threadId + '-' + (msg.messageId || msg.emailMessageId || msg.graphId || Math.random().toString(36).slice(2));
  var bodyText = msg.text || '';
  if (state._threadSearch && state._threadSearch.length >= 2) {
    var sq = state._threadSearch;
    var regex = new RegExp('(' + sq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    bodyText = bodyText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }
  h += '<div class="msg-body" id="' + msgBodyId + '">' + bodyText + '</div>';

  // Load full body for emails
  if (via === 'email' && (msg.messageId || msg.emailMessageId || msg.graphId)) {
    var emailMsgId = msg.messageId || msg.emailMessageId || msg.graphId;
    h += '<button class="msg-load-full" onclick="event.stopPropagation();loadFullEmailBody(\'' + encodeHtml(emailMsgId) + '\',\'' + threadId + '\',\'' + msgBodyId + '\')">';
    h += '\uD83D\uDCE7 Load full email</button>';
  }

  // Attachments — Phase 5: show attachment badges (lazy loaded or from thread data)
  var attachments = msg.attachments || [];
  var msgGraphId = msg.graphId || msg.emailMessageId || '';

  // If hasAttachments flag but no attachment data, trigger lazy load
  if (msg.hasAttachments && !attachments.length && msgGraphId) {
    var cached = state._attachmentCache && state._attachmentCache[msgGraphId];
    if (cached) {
      attachments = cached;
    } else {
      // Trigger background load
      _lazyLoadAttachments(msgGraphId, threadId);
      h += '<div class="msg-attachments msg-attach-loading" id="msgAtt-' + encodeHtml(msgGraphId) + '">';
      h += '<span class="msg-attach">\uD83D\uDCCE Loading attachments\u2026</span>';
      h += '</div>';
    }
  }

  if (attachments.length) {
    h += '<div class="msg-attachments" id="msgAtt-' + encodeHtml(msgGraphId) + '">';
    attachments.forEach(function(a) {
      var icon = _attachIcon(a);
      var size = _formatFileSize(a.size);
      var ct = (a.contentType || '').toLowerCase();
      var ft = (a.filetype || '').toLowerCase();
      var nm = (a.name || '').toLowerCase();
      var isImage = ct.includes('image') || /^(png|jpg|jpeg|gif|svg|webp|bmp)$/.test(ft) || /\.(png|jpg|jpeg|gif|svg|webp)$/.test(nm);
      var isPdf = ct.includes('pdf') || ft === 'pdf' || nm.endsWith('.pdf');

      h += '<div class="msg-attach-card">';

      // Inline image preview
      if (isImage && (a.contentUrl || a.urlPrivate || a.thumbnailUrl)) {
        var imgSrc = a.thumbnailUrl || a.contentUrl || a.urlPrivate || '';
        h += '<div class="attach-preview">';
        h += '<img class="attach-thumb" src="' + encodeHtml(imgSrc) + '" alt="' + encodeHtml(a.name) + '" onclick="window.open(this.src,\'_blank\')" onerror="this.style.display=\'none\'" />';
        h += '</div>';
      }

      h += '<div class="attach-info">';
      h += '<span class="attach-icon">' + icon + '</span>';
      h += '<span class="attach-name">' + encodeHtml(a.name) + '</span>';
      if (size) h += '<span class="attach-size">' + size + '</span>';
      h += '</div>';

      // Action buttons
      h += '<div class="attach-actions">';
      if (a.contentUrl || a.urlPrivate || a.urlPrivateDownload) {
        var dlUrl = a.urlPrivateDownload || a.contentUrl || a.urlPrivate;
        h += '<button class="attach-btn" onclick="window.open(\'' + encodeHtml(dlUrl) + '\',\'_blank\')" title="Download">&#x2B73;</button>';
      }
      if (a.permalink) {
        h += '<button class="attach-btn" onclick="window.open(\'' + encodeHtml(a.permalink) + '\',\'_blank\')" title="Open in source">&#x2197;</button>';
      }
      if (isPdf && (a.contentUrl || a.urlPrivate)) {
        h += '<button class="attach-btn" onclick="window.open(\'' + encodeHtml(a.contentUrl || a.urlPrivate) + '\',\'_blank\')" title="View PDF">&#x1F4C4;</button>';
      }
      h += '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  // Slack reactions on messages — show existing + quick react + picker
  if (via === 'slack' && msg.slackTs) {
    h += '<div class="msg-reactions">';
    // Show existing reactions from API data
    if (msg.reactions && msg.reactions.length) {
      msg.reactions.forEach(function(r) {
        var emoji = r.name || '';
        var count = r.count || 1;
        var youReacted = r.users && r.users.includes && r.users.includes('self');
        var emojiDisplay = _slackEmojiToUnicode(emoji);
        h += '<span class="msg-reaction-badge' + (youReacted ? ' you' : '') + '" onclick="event.stopPropagation();addSlackReaction(\'' + threadId + '\',\'' + (msg.slackTs || '') + '\',\'\',\'' + encodeHtml(emoji) + '\')" title=":' + encodeHtml(emoji) + ':">' + emojiDisplay + ' ' + count + '</span>';
      });
    }
    // Quick react buttons (always show for non-self messages)
    if (!isYou) {
      var quickEmojis = [
        {e:'\uD83D\uDC4D',n:'thumbsup'}, {e:'\u2705',n:'white_check_mark'}, {e:'\uD83D\uDC40',n:'eyes'},
        {e:'\uD83D\uDE4F',n:'pray'}, {e:'\uD83D\uDE80',n:'rocket'}, {e:'\u2764\uFE0F',n:'heart'}
      ];
      quickEmojis.forEach(function(em) {
        h += '<button class="msg-react-btn" onclick="event.stopPropagation();addSlackReaction(\'' + threadId + '\',\'' + (msg.slackTs || '') + '\',\'' + em.e + '\',\'' + em.n + '\')" title=":' + em.n + ':">' + em.e + '</button>';
      });
      // Emoji picker toggle
      var pickerId = 'emojiPicker-' + (msg.slackTs || '').replace(/\./g,'-');
      h += '<button class="msg-react-btn msg-react-more" onclick="event.stopPropagation();_toggleEmojiPicker(\'' + pickerId + '\')" title="More reactions">+</button>';
      h += '<div class="emoji-picker" id="' + pickerId + '" style="display:none">';
      var allEmojis = [
        {e:'\uD83D\uDC4D',n:'thumbsup'},{e:'\uD83D\uDC4E',n:'thumbsdown'},{e:'\u2705',n:'white_check_mark'},{e:'\u274C',n:'x'},
        {e:'\uD83D\uDC40',n:'eyes'},{e:'\uD83D\uDE4F',n:'pray'},{e:'\uD83D\uDE80',n:'rocket'},{e:'\u2764\uFE0F',n:'heart'},
        {e:'\uD83C\uDF89',n:'tada'},{e:'\uD83D\uDD25',n:'fire'},{e:'\uD83D\uDCA1',n:'bulb'},{e:'\uD83D\uDCAF',n:'100'},
        {e:'\uD83D\uDE02',n:'joy'},{e:'\uD83E\uDD14',n:'thinking_face'},{e:'\uD83D\uDC4C',n:'ok_hand'},{e:'\uD83C\uDF1F',n:'star2'},
        {e:'\u26A0\uFE0F',n:'warning'},{e:'\u2B50',n:'star'},{e:'\uD83D\uDCDD',n:'memo'},{e:'\uD83D\uDCE3',n:'mega'}
      ];
      allEmojis.forEach(function(em) {
        h += '<button class="emoji-pick-btn" onclick="event.stopPropagation();addSlackReaction(\'' + threadId + '\',\'' + (msg.slackTs || '') + '\',\'' + em.e + '\',\'' + em.n + '\');_toggleEmojiPicker(\'' + pickerId + '\')">' + em.e + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ===============================================================
// 4. Reply bar — sticky at bottom (Phase 7: Reply mode selector)
// ===============================================================

function _renderReplyBar(id, th) {
  var isSlack = th.sources && th.sources.includes('slack');
  var isEmail = !isSlack;
  var isMultiPerson = (th.people || []).length > 1;
  var sourceType = th.sourceType || '';
  var isDm = sourceType === 'dm';
  var isChannel = sourceType === 'channel' || sourceType === 'private' || sourceType === 'group';
  var channelLabel = isSlack && th.slackChannelName
    ? 'Slack \u2192 ' + th.slackChannelName
    : isEmail ? 'Email' : 'Slack';

  var html = '<div class="comms-reply-bar">';

  // Reply mode selector for multi-person email threads
  if (isEmail && isMultiPerson) {
    var mode = state.commsReplyMode || 'reply';
    html += '<div class="reply-mode-selector">';
    html += '<button class="reply-mode-btn' + (mode === 'reply' ? ' active' : '') + '" onclick="setState(\'commsReplyMode\',\'reply\');renderAll()" title="Reply to sender">Reply</button>';
    html += '<button class="reply-mode-btn' + (mode === 'replyAll' ? ' active' : '') + '" onclick="setState(\'commsReplyMode\',\'replyAll\');renderAll()" title="Reply to all">Reply All</button>';
    html += '<button class="reply-mode-btn' + (mode === 'compose' ? ' active' : '') + '" onclick="setState(\'commsReplyMode\',\'compose\');renderAll()" title="Choose recipients">Reply to\u2026</button>';
    html += '</div>';
  }

  // Reply mode selector for Slack channel/group threads (not DMs)
  if (isSlack && isChannel) {
    var sMode = state.slackReplyMode || 'thread';
    html += '<div class="reply-mode-selector">';
    html += '<button class="reply-mode-btn' + (sMode === 'thread' ? ' active' : '') + '" onclick="setState(\'slackReplyMode\',\'thread\');renderAll()" title="Reply in thread">\uD83E\uDDF5 In Thread</button>';
    html += '<button class="reply-mode-btn' + (sMode === 'channel' ? ' active' : '') + '" onclick="setState(\'slackReplyMode\',\'channel\');renderAll()" title="Reply to channel">\uD83D\uDCE2 To Channel</button>';
    if (isMultiPerson) {
      html += '<button class="reply-mode-btn' + (sMode === 'dm' ? ' active' : '') + '" onclick="setState(\'slackReplyMode\',\'dm\');renderAll()" title="Send DM to a participant">\u2709\uFE0F DM to\u2026</button>';
    }
    html += '</div>';
  }

  // For Slack DMs with multiple people (group DM)
  if (isSlack && isDm && isMultiPerson) {
    var dmMode = state.slackReplyMode || 'thread';
    html += '<div class="reply-mode-selector">';
    html += '<button class="reply-mode-btn' + (dmMode === 'thread' ? ' active' : '') + '" onclick="setState(\'slackReplyMode\',\'thread\');renderAll()" title="Reply in thread">Reply</button>';
    html += '<button class="reply-mode-btn' + (dmMode === 'dm' ? ' active' : '') + '" onclick="setState(\'slackReplyMode\',\'dm\');renderAll()" title="DM a specific person">\u2709\uFE0F DM to\u2026</button>';
    html += '</div>';
  }

  // DM participant picker (shown when "DM to…" is selected)
  if (isSlack && state.slackReplyMode === 'dm' && th.people && th.people.length) {
    html += '<div class="slack-dm-picker">';
    html += '<span class="dm-picker-label">Send DM to:</span>';
    th.people.forEach(function(name) {
      var pi = getPersonInfo(name);
      var escaped = name.replace(/'/g, "\\'");
      var selected = state._slackDmTarget === name ? ' active' : '';
      html += '<button class="reply-mode-btn slack-dm-target' + selected + '" onclick="state._slackDmTarget=\'' + escaped + '\';renderAll()" title="DM ' + encodeHtml(name) + '">';
      html += '<span class="participant-chip mini" style="background:' + pi.colour + '22;color:' + pi.colour + '">' + pi.initials + '</span> ';
      html += encodeHtml(name.split(' ')[0]);
      html += '</button>';
    });
    html += '</div>';
  }

  // Restore saved quick reply draft if available
  var savedDraft = (typeof _loadQuickReplyDraft === 'function') ? _loadQuickReplyDraft(id) : '';
  html += '<span class="reply-source">' + encodeHtml(channelLabel) + '</span>';
  html += '<textarea id="commsQuickReply" placeholder="Type a reply\u2026" rows="1" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\';if(typeof _saveQuickReplyDraft===\'function\')_saveQuickReplyDraft(\'' + id + '\',this.value)">' + encodeHtml(savedDraft) + '</textarea>';
  html += '<button class="reply-send-btn" id="commsQuickSendBtn" onclick="sendQuickReply()">Send</button>';
  html += '<button class="reply-ai-btn" onclick="requestAIDraft(\'' + id + '\')" title="AI Assist">\u2728</button>';
  html += '</div>';
  return html;
}

// ===============================================================
// 5. loadFullEmailBody — fetch full email HTML
// ===============================================================

async function loadFullEmailBody(messageId, threadId, targetElId) {
  var bodyEl = document.getElementById(targetElId);
  if (!bodyEl) return;

  var original = bodyEl.innerHTML;
  bodyEl.innerHTML = '<div class="skel" style="height:60px;border-radius:4px"></div>';

  try {
    var resp = await fetch('/api/comms/email/' + encodeURIComponent(messageId) + '/body');
    if (!resp.ok) throw new Error('Failed to load email body');
    var data = await resp.json();

    // Sanitise: strip script tags and event handlers
    var sanitised = (data.body || data.html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    bodyEl.innerHTML = '<div class="email-full-body">' + sanitised + '</div>';
  } catch (e) {
    bodyEl.innerHTML = original;
    toast('Failed to load email body', 'er');
  }
}

// ===============================================================
// 6. fetchThreadSummary — async AI summary fetch with cache
// ===============================================================

async function fetchThreadSummary(threadId) {
  if (state.threadSummaries[threadId] && !state.threadSummaries[threadId].error) return;

  state.threadSummaries[threadId] = { loading: true };
  try {
    var resp = await fetch('/api/comms/summary/' + encodeURIComponent(threadId));
    if (resp.ok) {
      state.threadSummaries[threadId] = await resp.json();
    } else {
      state.threadSummaries[threadId] = { error: true };
    }
  } catch (e) {
    state.threadSummaries[threadId] = { error: true };
  }

  // Re-render if still on the same thread
  if (state.selectedThread === threadId) {
    renderCommsMain();
  }
}

// ===============================================================
// 7. _lazyLoadAttachments — Phase 5: fetch attachment metadata
// ===============================================================

// ── Slack emoji name → Unicode mapping ──
var _emojiMap = {
  '+1':'\uD83D\uDC4D','thumbsup':'\uD83D\uDC4D','-1':'\uD83D\uDC4E','thumbsdown':'\uD83D\uDC4E',
  'heart':'\u2764\uFE0F','eyes':'\uD83D\uDC40','tada':'\uD83C\uDF89','fire':'\uD83D\uDD25',
  'rocket':'\uD83D\uDE80','100':'\uD83D\uDCAF','pray':'\uD83D\uDE4F','joy':'\uD83D\uDE02',
  'white_check_mark':'\u2705','x':'\u274C','thinking_face':'\uD83E\uDD14','ok_hand':'\uD83D\uDC4C',
  'star':'\u2B50','star2':'\uD83C\uDF1F','warning':'\u26A0\uFE0F','bulb':'\uD83D\uDCA1',
  'memo':'\uD83D\uDCDD','mega':'\uD83D\uDCE3','raised_hands':'\uD83D\uDE4C','clap':'\uD83D\uDC4F',
  'muscle':'\uD83D\uDCAA','wave':'\uD83D\uDC4B','point_up':'\u261D\uFE0F','flushed':'\uD83D\uDE33',
  'sunglasses':'\uD83D\uDE0E','sob':'\uD83D\uDE2D','sweat_smile':'\uD83D\uDE05','rolling_on_the_floor_laughing':'\uD83E\uDD23',
  'slightly_smiling_face':'\uD83D\uDE42','wink':'\uD83D\uDE09','grimacing':'\uD83D\uDE2C',
  'heavy_check_mark':'\u2714\uFE0F','boom':'\uD83D\uDCA5','coffee':'\u2615','beers':'\uD83C\uDF7B',
  'party_popper':'\uD83C\uDF89','trophy':'\uD83C\uDFC6','gem':'\uD83D\uDC8E','crown':'\uD83D\uDC51',
  'stockrocket':'\uD83D\uDE80','star_spin':'\uD83C\uDF1F'
};
function _slackEmojiToUnicode(name) {
  // Strip skin tone modifiers for lookup
  var base = (name || '').replace(/::?skin-tone-\d+/g, '').replace(/::/g, '');
  return _emojiMap[base] || (':' + name + ':');
}

// ── Per-message actions ──
if (typeof state !== 'undefined' && !state._pinnedMessages) state._pinnedMessages = {};

function _toggleMsgPin(msgKey) {
  if (!state._pinnedMessages) state._pinnedMessages = {};
  state._pinnedMessages[msgKey] = !state._pinnedMessages[msgKey];
  if (!state._pinnedMessages[msgKey]) delete state._pinnedMessages[msgKey];
  try { localStorage.setItem('beanz-pinned-msgs', JSON.stringify(state._pinnedMessages)); } catch (e) {}
  renderCommsMain();
  toast(state._pinnedMessages[msgKey] ? 'Message pinned' : 'Message unpinned', 'ok');
}

function _copyMsgText(btn) {
  var card = btn.closest('.msg-card');
  if (!card) return;
  var bodyEl = card.querySelector('.msg-body');
  if (!bodyEl) return;
  var text = bodyEl.innerText || bodyEl.textContent || '';
  navigator.clipboard.writeText(text).then(function() { toast('Copied to clipboard', 'ok'); }).catch(function() { toast('Copy failed', 'er'); });
}

function _quoteMsgToReply(sender, text) {
  var ta = document.getElementById('commsQuickReply');
  if (!ta) return;
  var quote = '> ' + sender + ': ' + text.substring(0, 150) + '\n\n';
  ta.value = quote + ta.value;
  ta.focus();
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// Load pinned messages from localStorage on init
try {
  var _savedPinnedMsgs = localStorage.getItem('beanz-pinned-msgs');
  if (_savedPinnedMsgs && typeof state !== 'undefined') state._pinnedMessages = JSON.parse(_savedPinnedMsgs);
} catch (e) {}

/** RSVP to a calendar event */
async function _rsvpCalendar(eventId, response) {
  try {
    var resp = await fetch('/api/comms/calendar/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: eventId, response: response })
    });
    var data = await resp.json();
    if (resp.ok && data.ok) {
      var labels = { accept: 'Accepted', tentative: 'Tentatively accepted', decline: 'Declined' };
      toast(labels[response] || 'Responded', 'ok');
    } else {
      toast('RSVP failed: ' + (data.error || 'Unknown error'), 'er');
    }
  } catch (e) {
    toast('RSVP failed: ' + (e.message || 'Network error'), 'er');
  }
}

/** Toggle emoji picker visibility */
function _toggleEmojiPicker(pickerId) {
  var el = document.getElementById(pickerId);
  if (el) el.style.display = el.style.display === 'none' ? 'grid' : 'none';
}

/** Tracks in-flight attachment loads to prevent duplicate requests */
var _attachmentLoadingSet = {};

async function _lazyLoadAttachments(graphId, threadId) {
  if (!graphId || _attachmentLoadingSet[graphId]) return;
  _attachmentLoadingSet[graphId] = true;

  try {
    var resp = await fetch('/api/comms/attachments/' + encodeURIComponent(graphId));
    if (!resp.ok) throw new Error('Failed to load attachments');
    var data = await resp.json();

    // Cache in state
    if (!state._attachmentCache) state._attachmentCache = {};
    var attachments = (data.attachments || []).filter(function(a) { return !a.isInline; });
    state._attachmentCache[graphId] = attachments;

    // Update the thread's message data immutably
    var th = DATA.comms.threads && DATA.comms.threads[threadId];
    if (th && th.messages) {
      th.messages = th.messages.map(function(m) {
        if ((m.graphId === graphId || m.emailMessageId === graphId) && !m.attachments) {
          return Object.assign({}, m, { attachments: attachments });
        }
        return m;
      });
    }

    // Re-render if still viewing the same thread
    if (state.selectedThread === threadId) {
      renderCommsMain();
    }
  } catch (e) {
    console.warn('[Comms] Attachment load failed for', graphId, e.message);
  } finally {
    delete _attachmentLoadingSet[graphId];
  }
}
