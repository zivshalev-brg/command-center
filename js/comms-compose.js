// ===============================================================
// COMMS COMPOSE — Email Composer Overlay (Graph API)
// Full-screen compose form for new/reply/replyAll/forward emails
// Sends via POST /api/comms/send|reply|forward/email endpoints
// ===============================================================

// ── State Initialisation ──
if (typeof state !== 'undefined') {
  if (state.commsComposerOpen === undefined) state.commsComposerOpen = false;
  if (state.commsComposerData === undefined) state.commsComposerData = null;
}

// ── Constants ──
const COMPOSER_FROM = 'ziv.shalev@breville.com';
const COMPOSER_MAX_AC = 8;
let _acInput = null;

// ── Escape helpers ──
function _escH(s) { return !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _escA(s) { return !s ? '' : String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _cleanR(v) { return (v || '').replace(/,\s*$/, '').trim(); }

// ===============================================================
// 1. openEmailComposer(options)
//    Opens the email composer overlay with normalised options.
//    For reply/forward modes, auto-populates fields from thread data.
// ===============================================================
function openEmailComposer(options) {
  var o = options || {};
  var mode = o.mode || 'new';
  var d = {
    mode: mode, to: o.to || '', cc: o.cc || '', bcc: o.bcc || '',
    subject: o.subject || '', body: o.body || '',
    messageId: o.messageId || null, threadId: o.threadId || null,
    importance: o.importance || 'normal', platform: 'email'
  };

  // Auto-populate from thread for reply/forward
  if ((mode === 'reply' || mode === 'replyAll' || mode === 'forward') && d.threadId) {
    var th = (DATA.comms.threads && DATA.comms.threads[d.threadId])
      || (DATA.comms.topics && DATA.comms.topics[d.threadId]);
    if (th) {
      if (!d.to && th.replyEmail) d.to = th.replyEmail;
      if (!d.subject) {
        var pfx = mode === 'forward' ? 'Fwd: ' : 'Re: ';
        var raw = th.replySubject || th.subject || '';
        d.subject = raw.startsWith(pfx) ? raw : pfx + raw;
      }
      if (mode === 'replyAll' && !d.cc) {
        // Phase 7: collect actual email addresses from per-message To/CC
        var myEmail = COMPOSER_FROM.toLowerCase();
        var replyTo = (d.to || '').toLowerCase();
        var ccSet = {};
        if (th.messages) {
          th.messages.forEach(function(m) {
            (m.to || []).forEach(function(r) {
              if (r.address && r.address.toLowerCase() !== myEmail && r.address.toLowerCase() !== replyTo) {
                ccSet[r.address.toLowerCase()] = r.address;
              }
            });
            (m.cc || []).forEach(function(r) {
              if (r.address && r.address.toLowerCase() !== myEmail && r.address.toLowerCase() !== replyTo) {
                ccSet[r.address.toLowerCase()] = r.address;
              }
            });
          });
        }
        var ccFromMessages = Object.keys(ccSet).map(function(k) { return ccSet[k]; });
        if (ccFromMessages.length) {
          d.cc = ccFromMessages.join(', ');
        } else if (th.people) {
          // Fallback: look up addresses from DATA.people
          d.cc = th.people
            .filter(function(p) { return p !== 'Ziv Shalev' && p !== 'You'; })
            .map(function(name) {
              for (var pid in DATA.people) {
                if (DATA.people[pid].n === name && DATA.people[pid].email) return DATA.people[pid].email;
              }
              return null;
            }).filter(Boolean).join(', ');
        }
      }
      if (mode === 'forward') d.to = '';
    }
  }

  state.commsComposerOpen = true;
  state.commsComposerData = d;
  renderEmailComposer();
  _cStartAutoSave();
}

// ===============================================================
// 2. renderEmailComposer()
//    Renders the full composer overlay and injects into DOM.
//    Creates #emailComposerContainer if not already present.
// ===============================================================
function renderEmailComposer() {
  var c = $('emailComposerContainer');
  if (!c) { c = document.createElement('div'); c.id = 'emailComposerContainer'; document.body.appendChild(c); }
  if (!state.commsComposerOpen || !state.commsComposerData) { c.innerHTML = ''; return; }

  var d = state.commsComposerData;
  var showCC = !!(d.cc || d.bcc);
  var titles = { 'new': 'New Email', reply: 'Reply', replyAll: 'Reply All', forward: 'Forward' };

  // Row + autocomplete-field builders
  var _row = function(label, inner) {
    return '<div class="email-composer-row"><label>' + label + '</label>' + inner + '</div>';
  };
  var _acField = function(id, val, ph) {
    return '<div class="email-composer-input-wrap">'
      + '<input type="text" id="' + id + '" value="' + _escA(val) + '" class="email-composer-input" placeholder="' + ph + '" autocomplete="off"'
      + ' oninput="renderRecipientAutocomplete(\'' + id + '\',this.value)" onfocus="renderRecipientAutocomplete(\'' + id + '\',this.value)" />'
      + '<div class="recipient-autocomplete" id="' + id + '-ac"></div></div>';
  };

  var html = '<div class="email-composer-overlay" onclick="if(event.target===this)_cTryClose()">'
    + '<div class="email-composer-dialog">'
    // Header
    + '<div class="email-composer-header"><h3>' + (titles[d.mode] || 'Compose') + '</h3>'
    + '<button class="email-composer-close" onclick="_cTryClose()">&times;</button></div>'
    // Form fields
    + '<div class="email-composer-form">'
    + _row('From', '<input type="text" value="' + COMPOSER_FROM + '" readonly class="email-composer-input readonly" />')
    + '<div class="email-composer-row"><label>To</label>' + _acField('composerTo', d.to, 'Recipient email')
      + (showCC ? '' : '<button class="email-composer-link" onclick="_cShowCC()">CC/BCC</button>') + '</div>'
    + '<div class="email-composer-row" id="composerCcRow" style="' + (showCC ? '' : 'display:none')
      + '"><label>CC</label>' + _acField('composerCc', d.cc, 'CC recipients') + '</div>'
    + '<div class="email-composer-row" id="composerBccRow" style="' + (showCC ? '' : 'display:none')
      + '"><label>BCC</label>' + _acField('composerBcc', d.bcc, 'BCC recipients') + '</div>'
    + _row('Subject', '<input type="text" id="composerSubject" value="' + _escA(d.subject) + '" class="email-composer-input" placeholder="Email subject" />')
    // Rich text formatting toolbar
    + '<div class="email-composer-row email-composer-format-bar">'
      + '<button class="fmt-btn" onclick="_cFmt(\'bold\')" title="Bold (Ctrl+B)"><b>B</b></button>'
      + '<button class="fmt-btn" onclick="_cFmt(\'italic\')" title="Italic (Ctrl+I)"><i>I</i></button>'
      + '<button class="fmt-btn" onclick="_cFmt(\'underline\')" title="Underline (Ctrl+U)"><u>U</u></button>'
      + '<span class="fmt-sep"></span>'
      + '<button class="fmt-btn" onclick="_cFmt(\'ul\')" title="Bullet list">&#x2022;</button>'
      + '<button class="fmt-btn" onclick="_cFmt(\'ol\')" title="Numbered list">1.</button>'
      + '<button class="fmt-btn" onclick="_cFmt(\'link\')" title="Insert link">&#x1F517;</button>'
    + '</div>'
    + '<div class="email-composer-row email-composer-body-row">'
      + '<textarea id="composerBody" class="email-composer-textarea" placeholder="Write your message... (use **bold**, *italic*, - lists)" oninput="_cAutoGrow(this)">' + _escH(d.body) + '</textarea></div>'
    // File attachment row
    + '<div class="email-composer-row email-composer-attach-row">'
      + '<input type="file" id="composerFileInput" multiple style="display:none" onchange="_cFilesChanged(this)" />'
      + '<button class="btn btn-sm btn-g" onclick="$(\'composerFileInput\').click()" title="Attach files">&#x1F4CE; Attach Files</button>'
      + '<div class="composer-attach-list" id="composerAttachList"></div>'
    + '</div>'
    + '<div class="email-composer-row email-composer-importance-row"><label>Importance</label>'
      + '<select id="composerImportance" class="email-composer-select">'
      + '<option value="normal"' + (d.importance === 'normal' ? ' selected' : '') + '>Normal</option>'
      + '<option value="high"' + (d.importance === 'high' ? ' selected' : '') + '>High</option>'
      + '</select></div>'
    + '</div>'
    // Toolbar
    + '<div class="email-composer-toolbar">'
    + '<button class="btn btn-sm email-composer-ai" id="composerAiBtn" onclick="_cAIDraft()"><span class="ai-sparkle">&#x2728;</span> AI Assist</button>'
    + '<span style="flex:1"></span>'
    + '<span class="email-composer-charcount" id="composerCharCount">0 chars</span>'
    + '<span class="email-composer-via">Sending via Microsoft Graph</span>'
    + '<button class="btn btn-sm btn-g" onclick="_cTryClose()">Cancel</button>'
    + '<button class="btn btn-sm btn-p" id="composerSendBtn" onclick="_cSend()">Send</button>'
    + '</div></div></div>';

  c.innerHTML = html;

  // Bind char count + auto-grow after DOM injection
  setTimeout(function() {
    var ta = $('composerBody');
    if (ta) { _cUpdateCount(); ta.addEventListener('input', _cUpdateCount); _cAutoGrow(ta); }
  }, 0);
}

// ===============================================================
// 3. renderRecipientAutocomplete(inputId, query)
//    Shows autocomplete dropdown searching DATA.people by name/email.
//    Max 8 results. Each shows: avatar initials + name + email + role.
// ===============================================================
function renderRecipientAutocomplete(inputId, query) {
  var acEl = $(inputId + '-ac');
  if (!acEl) return;

  // Only autocomplete the last comma-separated token
  var tokens = (query || '').split(',');
  var last = (tokens[tokens.length - 1] || '').trim().toLowerCase();
  if (!last) { acEl.innerHTML = ''; acEl.style.display = 'none'; return; }
  _acInput = inputId;

  var matches = [];
  for (var pid in DATA.people) {
    var pe = DATA.people[pid];
    if (!pe.email) continue;
    if (pe.n.toLowerCase().indexOf(last) !== -1 || pe.email.toLowerCase().indexOf(last) !== -1) matches.push(pe);
    if (matches.length >= COMPOSER_MAX_AC) break;
  }
  if (!matches.length) { acEl.innerHTML = ''; acEl.style.display = 'none'; return; }

  var html = '';
  matches.forEach(function(pe) {
    var ini = pe.initials || pe.n.slice(0, 2).toUpperCase();
    var col = pe.colour || 'var(--s3)';
    html += '<div class="ac-item" onmousedown="_acSelect(\'' + inputId + '\',\'' + _escA(pe.email) + '\')">'
      + '<div class="ac-avatar" style="background:' + col + '22;color:' + col + '">' + ini + '</div>'
      + '<div class="ac-info"><div class="ac-name">' + _escH(pe.n) + '</div>'
      + '<div class="ac-detail">' + _escH(pe.email) + (pe.role ? ' &middot; ' + _escH(pe.role) : '') + '</div></div></div>';
  });
  acEl.innerHTML = html;
  acEl.style.display = 'block';
}

function _acSelect(inputId, email) {
  var inp = $(inputId);
  if (!inp) return;
  var tokens = inp.value.split(',').map(function(t) { return t.trim(); });
  tokens[tokens.length - 1] = email;
  inp.value = tokens.join(', ') + ', ';
  inp.focus();
  var acEl = $(inputId + '-ac');
  if (acEl) { acEl.innerHTML = ''; acEl.style.display = 'none'; }
  _acInput = null;
}

// Dismiss autocomplete on outside click
document.addEventListener('click', function(e) {
  if (!_acInput) return;
  var acEl = $(_acInput + '-ac'), inp = $(_acInput);
  if (acEl && !acEl.contains(e.target) && e.target !== inp) {
    acEl.innerHTML = ''; acEl.style.display = 'none'; _acInput = null;
  }
});

// ===============================================================
// 4. sendEmailViaGraph(options)
//    Async. Validates inputs, sends via appropriate Graph API
//    endpoint, shows sending state, handles success/error.
// ===============================================================
async function sendEmailViaGraph(options) {
  var o = options || {};
  var mode = o.mode || 'new';
  var to = (o.to || '').trim(), cc = (o.cc || '').trim(), bcc = (o.bcc || '').trim();
  var subject = (o.subject || '').trim(), bodyText = (o.body || '').trim();
  var messageId = o.messageId || null, importance = o.importance || 'normal';

  // Input validation
  if ((mode === 'new' || mode === 'forward') && !to) { toast('Please enter a recipient', 'er'); return false; }
  if (mode === 'new' && !subject) { toast('Please enter a subject', 'er'); return false; }
  if (!bodyText) { toast('Please enter a message body', 'er'); return false; }

  // Convert markdown-like formatting + newlines to HTML
  var formatted = bodyText
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<u>$1</u>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  var bodyHtml = formatted.split('\n\n')
    .map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');

  // Sending state on button
  var sendBtn = $('composerSendBtn');
  if (sendBtn) { sendBtn.textContent = 'Sending...'; sendBtn.disabled = true; }

  try {
    var endpoint, payload;
    if (mode === 'reply' || mode === 'replyAll') {
      endpoint = '/api/comms/reply/email';
      payload = { messageId: messageId, bodyHtml: bodyHtml, replyAll: mode === 'replyAll' };
    } else if (mode === 'forward') {
      endpoint = '/api/comms/forward/email';
      payload = { messageId: messageId, to: to, bodyHtml: bodyHtml };
    } else {
      endpoint = '/api/comms/send/email';
      payload = { to: to, cc: cc || undefined, bcc: bcc || undefined, subject: subject, bodyHtml: bodyHtml, importance: importance };
    }

    var resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = await resp.json();

    if (resp.ok && data.ok !== false) {
      toast('Email sent!', 'ok');
      closeEmailComposer(true);
      // Refresh comms to show the sent message
      if (typeof DATA !== 'undefined') DATA._commsLiveLoaded = false;
      if (typeof loadCommsLive === 'function') loadCommsLive();
      _logCompose('email_sent', { mode: mode, to: to });
      return true;
    }
    toast('Send failed: ' + (data.error || data.message || 'Unknown error'), 'er');
    return false;
  } catch (e) {
    toast('Send failed: ' + (e.message || 'Network error'), 'er');
    return false;
  } finally {
    if (sendBtn) { sendBtn.textContent = 'Send'; sendBtn.disabled = false; }
  }
}

// ===============================================================
// 5. replyEmailViaGraph(messageId, bodyHtml, replyAll)
//    Convenience wrapper — delegates to sendEmailViaGraph.
// ===============================================================
function replyEmailViaGraph(messageId, bodyHtml, replyAll) {
  return sendEmailViaGraph({ mode: replyAll ? 'replyAll' : 'reply', messageId: messageId, body: bodyHtml });
}

// ===============================================================
// 6. closeEmailComposer(force)
//    Closes the composer. If body has content and not forced, prompts
//    "Discard draft?" confirmation before closing.
// ===============================================================
function closeEmailComposer(force) {
  if (!force) {
    var bodyEl = $('composerBody');
    if (bodyEl && bodyEl.value.trim().length > 0 && !confirm('Discard draft?')) return;
  }
  state.commsComposerOpen = false;
  state.commsComposerData = null;
  _cStopAutoSave();
  _cClearDraftLocal();
  _composerAttachments = [];
  var c = $('emailComposerContainer');
  if (c) c.innerHTML = '';
}

// ===============================================================
// 7. requestAIDraftForComposer(threadId)
//    Async. Calls POST /api/comms/draft, populates body textarea
//    with generated draft. Shows loading state on AI button.
// ===============================================================
async function requestAIDraftForComposer(threadId) {
  var cd = state.commsComposerData;
  if (!cd) return;

  var aiBtn = $('composerAiBtn'), bodyEl = $('composerBody');
  if (aiBtn) { aiBtn.innerHTML = '<span class="ai-sparkle">&#x2728;</span> Generating...'; aiBtn.disabled = true; }

  try {
    var subEl = $('composerSubject');
    var instructions = (subEl && subEl.value) ? 'Subject: ' + subEl.value : '';

    var resp = await fetch('/api/comms/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: threadId || cd.threadId || null, replyType: cd.mode, customInstructions: instructions })
    });
    var data = await resp.json();

    if (resp.ok && data.draft) {
      if (bodyEl) { bodyEl.value = data.draft; _cAutoGrow(bodyEl); _cUpdateCount(); }
      toast('AI draft generated', 'ok');
      _logCompose('ai_draft', { threadId: threadId || cd.threadId });
    } else {
      toast('AI draft failed: ' + (data.error || 'Unknown error'), 'er');
    }
  } catch (e) {
    toast('AI draft failed: ' + (e.message || 'Network error'), 'er');
  } finally {
    if (aiBtn) { aiBtn.innerHTML = '<span class="ai-sparkle">&#x2728;</span> AI Assist'; aiBtn.disabled = false; }
  }
}

// ===============================================================
// Internal helpers — UI glue
// ===============================================================
function _cAutoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(120, Math.min(el.scrollHeight, 400)) + 'px';
}

function _cUpdateCount() {
  var b = $('composerBody'), c = $('composerCharCount');
  if (b && c) { var l = b.value.length; c.textContent = l + ' char' + (l !== 1 ? 's' : ''); }
}

function _cShowCC() {
  var cc = $('composerCcRow'), bcc = $('composerBccRow');
  if (cc) cc.style.display = '';
  if (bcc) bcc.style.display = '';
}

function _cTryClose() { closeEmailComposer(false); }

function _cSend() {
  var d = state.commsComposerData || {};
  sendEmailViaGraph({
    mode: d.mode || 'new',
    to: _cleanR(($('composerTo') || {}).value || ''),
    cc: _cleanR(($('composerCc') || {}).value || ''),
    bcc: _cleanR(($('composerBcc') || {}).value || ''),
    subject: ($('composerSubject') || {}).value || '',
    body: ($('composerBody') || {}).value || '',
    messageId: d.messageId,
    importance: ($('composerImportance') || {}).value || 'normal'
  });
}

function _cAIDraft() {
  var d = state.commsComposerData || {};
  requestAIDraftForComposer(d.threadId);
}

// ── Rich text formatting helpers ──
var _composerAttachments = [];

function _cFmt(type) {
  var ta = $('composerBody');
  if (!ta) return;
  var start = ta.selectionStart, end = ta.selectionEnd;
  var sel = ta.value.substring(start, end);
  var insert = '';
  switch (type) {
    case 'bold': insert = '**' + (sel || 'bold text') + '**'; break;
    case 'italic': insert = '*' + (sel || 'italic text') + '*'; break;
    case 'underline': insert = '_' + (sel || 'underlined text') + '_'; break;
    case 'ul': insert = '\n- ' + (sel || 'list item'); break;
    case 'ol': insert = '\n1. ' + (sel || 'list item'); break;
    case 'link':
      var url = prompt('Enter URL:');
      if (url) insert = '[' + (sel || 'link text') + '](' + url + ')';
      else return;
      break;
  }
  ta.value = ta.value.substring(0, start) + insert + ta.value.substring(end);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = start + insert.length;
  _cAutoGrow(ta);
  _cUpdateCount();
}

function _cFilesChanged(input) {
  var files = input.files;
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    _composerAttachments.push(files[i]);
  }
  _cRenderAttachList();
  input.value = ''; // reset input
}

function _cRemoveAttach(idx) {
  _composerAttachments.splice(idx, 1);
  _cRenderAttachList();
}

function _cRenderAttachList() {
  var el = $('composerAttachList');
  if (!el) return;
  if (!_composerAttachments.length) { el.innerHTML = ''; return; }
  var html = '';
  _composerAttachments.forEach(function(f, i) {
    var size = f.size < 1048576 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB';
    html += '<span class="composer-attach-item">';
    html += '\uD83D\uDCCE ' + _escH(f.name) + ' (' + size + ')';
    html += '<button class="composer-attach-remove" onclick="_cRemoveAttach(' + i + ')">&times;</button>';
    html += '</span>';
  });
  el.innerHTML = html;
}

/** Log composer interactions for the self-learning engine */
function _logCompose(action, meta) {
  try {
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'interaction', action: action, module: 'comms-compose', meta: meta || {} })
    });
  } catch (e) { /* non-critical telemetry */ }
}

// ── Draft Auto-Save (localStorage) ──
var _draftAutoSaveTimer = null;

function _cStartAutoSave() {
  if (_draftAutoSaveTimer) clearInterval(_draftAutoSaveTimer);
  _draftAutoSaveTimer = setInterval(function() {
    _cSaveDraftLocal();
  }, 5000); // every 5 seconds
}

function _cStopAutoSave() {
  if (_draftAutoSaveTimer) { clearInterval(_draftAutoSaveTimer); _draftAutoSaveTimer = null; }
}

function _cSaveDraftLocal() {
  var d = state.commsComposerData;
  if (!d) return;
  var body = $('composerBody');
  var to = $('composerTo');
  var cc = $('composerCc');
  var bcc = $('composerBcc');
  var subject = $('composerSubject');
  var draft = {
    mode: d.mode,
    to: to ? to.value : d.to,
    cc: cc ? cc.value : d.cc,
    bcc: bcc ? bcc.value : d.bcc,
    subject: subject ? subject.value : d.subject,
    body: body ? body.value : d.body,
    messageId: d.messageId,
    threadId: d.threadId,
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem('beanz-composer-draft', JSON.stringify(draft));
  } catch (e) { /* localStorage full or unavailable */ }
}

function _cLoadDraftLocal() {
  try {
    var raw = localStorage.getItem('beanz-composer-draft');
    if (!raw) return null;
    var draft = JSON.parse(raw);
    // Only restore if saved within last 24 hours
    if (draft.savedAt) {
      var age = Date.now() - new Date(draft.savedAt).getTime();
      if (age > 86400000) { localStorage.removeItem('beanz-composer-draft'); return null; }
    }
    return draft;
  } catch (e) { return null; }
}

function _cClearDraftLocal() {
  try { localStorage.removeItem('beanz-composer-draft'); } catch (e) {}
}

// Also auto-save quick reply drafts per thread
function _saveQuickReplyDraft(threadId, text) {
  if (!threadId) return;
  try {
    var drafts = JSON.parse(localStorage.getItem('beanz-quick-drafts') || '{}');
    if (text && text.trim()) { drafts[threadId] = { text: text, savedAt: new Date().toISOString() }; }
    else { delete drafts[threadId]; }
    localStorage.setItem('beanz-quick-drafts', JSON.stringify(drafts));
  } catch (e) {}
}

function _loadQuickReplyDraft(threadId) {
  if (!threadId) return '';
  try {
    var drafts = JSON.parse(localStorage.getItem('beanz-quick-drafts') || '{}');
    var d = drafts[threadId];
    if (!d) return '';
    // Expire after 24h
    if (d.savedAt && Date.now() - new Date(d.savedAt).getTime() > 86400000) {
      delete drafts[threadId];
      localStorage.setItem('beanz-quick-drafts', JSON.stringify(drafts));
      return '';
    }
    return d.text || '';
  } catch (e) { return ''; }
}

// ── Keyboard: Escape closes composer ──
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && state.commsComposerOpen) {
    e.preventDefault();
    e.stopPropagation();
    _cTryClose();
  }
});
