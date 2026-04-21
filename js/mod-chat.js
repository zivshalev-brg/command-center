// ===============================================================
// CHAT TAB — AI Assistant with Full Beanz OS Context
// ===============================================================

function _chatEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function loadChatSessions() {
  fetch('/api/chat/sessions').then(function(r){return r.json();}).then(function(d) {
    state.chatSessions = d.sessions || [];
    state.chatSessionsLoaded = true;
    renderAll();
  }).catch(function(){});
}

function loadChatHistory(sessionId) {
  state.chatSessionId = sessionId;
  state.chatMessages = [];
  state.chatStreaming = false;
  state.chatStreamBuffer = '';
  renderAll();
  fetch('/api/chat/history?sessionId=' + encodeURIComponent(sessionId))
    .then(function(r){return r.json();})
    .then(function(d) {
      state.chatMessages = (d.messages || []).map(function(m) { return { role: m.role, content: m.content }; });
      renderAll();
      _chatScrollBottom();
    }).catch(function(){});
}

function startNewChat() {
  state.chatSessionId = null;
  state.chatMessages = [];
  state.chatStreaming = false;
  state.chatStreamBuffer = '';
  renderAll();
}

function deleteChatSession(sessionId) {
  fetch('/api/chat/session/' + encodeURIComponent(sessionId), { method: 'DELETE' })
    .then(function() {
      state.chatSessions = state.chatSessions.filter(function(s){return s.id !== sessionId;});
      if (state.chatSessionId === sessionId) startNewChat();
      else renderAll();
    }).catch(function(){});
}

// ── Send Message (Streaming SSE) ─────────────────────────────
async function sendChatMessage() {
  var input = document.getElementById('chat-input');
  if (!input) return;
  var text = input.value.trim();
  if (!text || state.chatStreaming) return;

  input.value = '';
  input.style.height = 'auto';
  state.chatMessages.push({ role: 'user', content: text });
  state.chatStreaming = true;
  state.chatStreamBuffer = '';
  renderAll();
  _chatScrollBottom();

  try {
    var response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.chatSessionId,
        message: text,
        history: state.chatMessages.slice(0, -1)
      })
    });

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var sseBuffer = '';

    while (true) {
      var result = await reader.read();
      if (result.done) break;

      sseBuffer += decoder.decode(result.value, { stream: true });
      var events = sseBuffer.split('\n\n');
      sseBuffer = events.pop(); // keep incomplete event

      for (var i = 0; i < events.length; i++) {
        var evt = events[i].trim();
        if (!evt) continue;

        var lines = evt.split('\n');
        var eventType = '';
        var eventData = '';

        for (var j = 0; j < lines.length; j++) {
          if (lines[j].startsWith('event:')) eventType = lines[j].slice(6).trim();
          if (lines[j].startsWith('data:')) eventData = lines[j].slice(5).trim();
        }

        if (eventType === 'delta' && eventData) {
          try {
            var d = JSON.parse(eventData);
            if (d.text) {
              state.chatStreamBuffer += d.text;
              _chatUpdateStream();
            }
          } catch {}
        }

        if (eventType === 'done' && eventData) {
          try {
            var doneData = JSON.parse(eventData);
            if (doneData.sessionId && !state.chatSessionId) {
              state.chatSessionId = doneData.sessionId;
            }
          } catch {}
          // Finalize
          state.chatMessages.push({ role: 'assistant', content: state.chatStreamBuffer });
          state.chatStreaming = false;
          state.chatStreamBuffer = '';
          renderAll();
          _chatScrollBottom();
          // Refresh session list
          loadChatSessions();
          return;
        }

        if (eventType === 'error' && eventData) {
          try {
            var errData = JSON.parse(eventData);
            state.chatMessages.push({ role: 'assistant', content: 'Error: ' + (errData.error || 'Unknown error') });
          } catch {
            state.chatMessages.push({ role: 'assistant', content: 'Error: Connection failed' });
          }
          state.chatStreaming = false;
          state.chatStreamBuffer = '';
          renderAll();
          return;
        }
      }
    }

    // Stream ended without done event
    if (state.chatStreamBuffer) {
      state.chatMessages.push({ role: 'assistant', content: state.chatStreamBuffer });
    }
    state.chatStreaming = false;
    state.chatStreamBuffer = '';
    renderAll();
    loadChatSessions();

  } catch (e) {
    state.chatMessages.push({ role: 'assistant', content: 'Error: ' + e.message });
    state.chatStreaming = false;
    state.chatStreamBuffer = '';
    renderAll();
  }
}

function _chatUpdateStream() {
  var el = document.getElementById('chat-stream-msg');
  if (el) {
    el.innerHTML = _chatRenderMd(state.chatStreamBuffer) + '<span class="chat-cursor">|</span>';
    _chatScrollBottom();
  }
}

function _chatScrollBottom() {
  setTimeout(function() {
    var el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 10);
}

// ── Sidebar ──────────────────────────────────────────────────
function renderChatSidebar() {
  var sb = $('sidebar');
  var sessions = state.chatSessions || [];

  var html = '<div class="ca-sb">';
  html += '<button class="ca-sb-refresh" onclick="startNewChat()" style="background:var(--acbg);border-color:var(--ac);color:var(--ac)">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    ' New Chat</button>';

  if (sessions.length > 0) {
    html += '<div class="ca-sb-nav" style="margin-top:var(--sp2)">';
    sessions.forEach(function(s) {
      var isActive = state.chatSessionId === s.id;
      html += '<div class="ca-sb-nav-item' + (isActive ? ' active' : '') + '" style="position:relative"' +
        ' onclick="loadChatHistory(\'' + _chatEnc(s.id) + '\')">' +
        '<span class="chat-sb-title">' + _chatEnc(s.title || 'Untitled') + '</span>' +
        '<span class="chat-sb-meta">' + (s.message_count || 0) + ' msgs</span>' +
        '<button class="chat-sb-del" onclick="event.stopPropagation();deleteChatSession(\'' + _chatEnc(s.id) + '\')" title="Delete">&#10005;</button>' +
      '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  sb.innerHTML = html;
}

// ── Main ─────────────────────────────────────────────────────
function renderChatMain() {
  var main = $('main');

  // Welcome state
  if (state.chatMessages.length === 0 && !state.chatStreaming) {
    main.innerHTML = '<div class="chat-container">' +
      '<div class="chat-welcome">' +
        '<div class="chat-welcome-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>' +
        '<h2 style="margin:var(--sp3) 0 var(--sp1)">Chat with the Obsidian Brain</h2>' +
        '<p style="color:var(--tx3);font-size:var(--f-sm);margin-bottom:var(--sp4)">Ask me anything — I search the vault for relevant knowledge plus your live comms and calendar.</p>' +
        '<div class="chat-suggestions">' +
          _chatSuggestion('What are my top action items from email this week?') +
          _chatSuggestion('Summarise the FTBP project status') +
          _chatSuggestion('What are the trending news topics?') +
          _chatSuggestion('Who has been most active in Slack?') +
          _chatSuggestion('What competitor activity should I know about?') +
          _chatSuggestion('Give me a daily briefing') +
        '</div>' +
      '</div>' +
      _chatInputBar() +
    '</div>';
    return;
  }

  // Messages + streaming
  var msgsHtml = '<div class="chat-messages" id="chat-messages">';

  state.chatMessages.forEach(function(m, idx) {
    var saveBtn = '';
    if (m.role === 'assistant') {
      // Preview summary = first 140 chars of the message
      var preview = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      saveBtn = '<div class="chat-msg-save">' + saveToNotebookButton({
        sourceType: 'chat_message',
        ref: { content: m.content, role: m.role, sessionId: state.chatSessionId || null },
        title: 'Chat · ' + (preview.slice(0, 60) || 'Assistant reply'),
        summary: preview
      }) + '</div>';
    }
    msgsHtml += '<div class="chat-msg chat-' + m.role + '">' +
      '<div class="chat-msg-role">' + (m.role === 'user' ? 'You' : 'Obsidian Brain') + '</div>' +
      '<div class="chat-msg-content">' + (m.role === 'assistant' ? _chatRenderMd(m.content) : _chatEnc(m.content)) + '</div>' +
      saveBtn +
    '</div>';
  });

  // Streaming indicator
  if (state.chatStreaming) {
    if (state.chatStreamBuffer) {
      msgsHtml += '<div class="chat-msg chat-assistant">' +
        '<div class="chat-msg-role">Obsidian Brain</div>' +
        '<div class="chat-msg-content" id="chat-stream-msg">' + _chatRenderMd(state.chatStreamBuffer) + '<span class="chat-cursor">|</span></div>' +
      '</div>';
    } else {
      msgsHtml += '<div class="chat-msg chat-assistant">' +
        '<div class="chat-msg-role">Obsidian Brain</div>' +
        '<div class="chat-msg-content"><span class="chat-thinking">Thinking</span></div>' +
      '</div>';
    }
  }

  msgsHtml += '</div>';

  main.innerHTML = '<div class="chat-container">' + msgsHtml + _chatInputBar() + '</div>';
  _chatScrollBottom();
}

function _chatInputBar() {
  return '<div class="chat-input-bar">' +
    '<textarea id="chat-input" class="chat-input" placeholder="Ask the Obsidian Brain..." rows="1"' +
    ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendChatMessage()}"' +
    ' oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\'"' +
    (state.chatStreaming ? ' disabled' : '') + '></textarea>' +
    '<button class="chat-send-btn" onclick="sendChatMessage()"' + (state.chatStreaming ? ' disabled' : '') + '>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
    '</button>' +
  '</div>';
}

function _chatSuggestion(text) {
  return '<button class="chat-suggestion" onclick="document.getElementById(\'chat-input\').value=\'' + _chatEnc(text).replace(/'/g, "\\'") + '\';sendChatMessage()">' + _chatEnc(text) + '</button>';
}

// ── Markdown Renderer (lightweight) ──────────────────────────
function _chatRenderMd(text) {
  if (!text) return '';
  var s = _chatEnc(text);
  // Code blocks
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  s = s.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Bullet lists
  s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Numbered lists
  s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Headers
  s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // Line breaks
  s = s.replace(/\n/g, '<br>');
  // Clean up
  s = s.replace(/<br><br>/g, '<br>');
  s = s.replace(/<br>(<h[234]>)/g, '$1');
  s = s.replace(/(<\/h[234]>)<br>/g, '$1');
  s = s.replace(/<br>(<ul>)/g, '$1');
  s = s.replace(/(<\/ul>)<br>/g, '$1');
  s = s.replace(/<br>(<pre>)/g, '$1');
  s = s.replace(/(<\/pre>)<br>/g, '$1');
  return s;
}
