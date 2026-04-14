// ===============================================================
// PANEL (slide-in)
// ===============================================================
function openPanel(title, html) {
  $('panelTitle').textContent = title;
  $('panelBody').innerHTML = html;
  $('panel').classList.add('open');
  state.panelOpen = true;
}
function closePanel() { $('panel').classList.remove('open'); state.panelOpen = false; }

function showReply(id) {
  const th = (DATA.comms.threads && DATA.comms.threads[id]) || (DATA.comms.topics && DATA.comms.topics[id]);
  if (!th) return;

  // For email threads, open the email composer
  const isEmail = th.sources && th.sources.includes('email');
  if (isEmail && typeof openEmailComposer === 'function') {
    const replyTo = th.replyTo || th.replyEmail || (th.people || []).find(p => p !== 'Ziv Shalev' && p !== 'You') || '';
    openEmailComposer({
      mode: 'reply',
      to: replyTo,
      subject: th.replySubject || th.subject || '',
      body: th.replyDraft || '',
      threadId: id
    });
    return;
  }

  // For Slack threads, open inline or modal
  if (th.slackChannel) {
    openSendModal(id, 'slack');
    return;
  }

  // Fallback: panel reply
  const subject = th.replySubject || th.subject || '';
  const replyTo = th.replyTo || '';
  let html = '<div class="reply-box"><div class="reply-h"><span class="lb">To: ' + replyTo + '</span><span class="ch">' + subject + '</span></div>';
  html += '<textarea class="reply-ta" id="replyText">' + (th.replyDraft || '') + '</textarea>';
  html += '<div class="reply-f"><button class="btn btn-g" onclick="copyReply()">Copy</button>';
  html += '<div style="display:flex;gap:6px"><button class="btn btn-outlook" onclick="openSendModal(\'' + id + '\',\'outlook\')">Email</button>';
  html += '<button class="btn btn-slack" onclick="openSendModal(\'' + id + '\',\'slack\')">Slack</button></div></div></div>';
  openPanel('Reply to ' + replyTo, html);
}

function showContext(id) {
  const tp = (DATA.comms.threads && DATA.comms.threads[id]) || (DATA.comms.topics && DATA.comms.topics[id]);
  if (!tp) return;
  if (tp.context) {
    const html = tp.context.map(function(c) {
      return c.isBiz
        ? '<div class="biz"><div class="bl">' + c.label + '</div><div class="ct">' + c.text + '</div>' + (c.meta ? '<div class="cm">' + c.meta + '</div>' : '') + '</div>'
        : '<div class="ctx"><div class="cl">' + c.label + '</div><div class="ct">' + c.text + '</div>' + (c.meta ? '<div class="cm">' + c.meta + '</div>' : '') + '</div>';
    }).join('');
    openPanel('Context \u2014 ' + (tp.subject || tp.title), html);
  } else if (tp.messages) {
    const html = tp.messages.map(function(m) {
      return '<div class="ctx"><div class="cl">' + m.sender + ' via ' + m.via + '</div><div class="ct">' + m.text + '</div><div class="cm">' + m.time + '</div></div>';
    }).join('');
    openPanel('Context \u2014 ' + tp.subject, html);
  }
}

// ===============================================================
// SEND MODAL (Email via Graph API + Slack)
// ===============================================================
let activeSendTab = 'outlook';
let currentSendTopicId = null;
let _sendingInProgress = false;

function openSendModal(id, tab) {
  currentSendTopicId = id;
  const tp = id ? ((DATA.comms.threads && DATA.comms.threads[id]) || (DATA.comms.topics && DATA.comms.topics[id])) : null;

  // Pre-fill fields
  const draft = $('replyText')?.value || (tp && tp.replyDraft) || '';
  $('modalTo').value = (tp && tp.replyEmail) || '';
  $('modalCc').value = '';
  $('modalBcc').value = '';
  $('modalSubject').value = (tp && (tp.replySubject || tp.subject)) || '';
  $('modalBody').value = draft;
  $('slackBody').value = draft;
  const st = $('slackTarget');
  if (st) st.value = (tp && tp.slackId) || '';
  $('modalTitle').textContent = tp ? ('Send to ' + (tp.replyTo || tp.lastSender || '')) : 'Compose';

  // Reset CC/BCC visibility
  const ccContainer = $('ccBccFields');
  if (ccContainer) ccContainer.style.display = 'none';

  switchSendTab(tab || 'outlook');
  $('sendModal').classList.add('show');
}

function switchSendTab(tab) {
  activeSendTab = tab;
  $('tabOutlook').classList.toggle('active', tab === 'outlook');
  $('tabSlack').classList.toggle('active', tab === 'slack');
  $('outlookFields').style.display = tab === 'outlook' ? '' : 'none';
  $('slackFields').style.display = tab === 'slack' ? '' : 'none';
  $('btnSendOutlook').style.display = tab === 'outlook' ? '' : 'none';
  $('btnSendSlack').style.display = tab === 'slack' ? '' : 'none';
  if (tab === 'slack') populateSlackTargets();
}

function closeModal() { $('sendModal').classList.remove('show'); }

function toggleCcBcc() {
  const el = $('ccBccFields');
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ─── Email: Send via Microsoft Graph API ─────────────────────
async function sendViaOutlook() {
  if (_sendingInProgress) return;
  const to = $('modalTo').value.trim();
  const cc = $('modalCc') ? $('modalCc').value.trim() : '';
  const bcc = $('modalBcc') ? $('modalBcc').value.trim() : '';
  const subject = $('modalSubject').value.trim();
  const body = $('modalBody').value.trim();

  if (!to) { toast('Please enter a recipient', 'er'); return; }
  if (!subject) { toast('Please enter a subject', 'er'); return; }

  // Convert plain text body to HTML paragraphs
  const bodyHtml = body.split('\n\n').map(function(para) {
    return '<p>' + para.replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
  }).join('\n');

  // Parse comma-separated addresses
  var toList = to.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  var ccList = cc ? cc.split(',').map(function(e) { return e.trim(); }).filter(Boolean) : [];
  var bccList = bcc ? bcc.split(',').map(function(e) { return e.trim(); }).filter(Boolean) : [];

  const btn = $('btnSendOutlook');
  const origText = btn ? btn.textContent : '';
  _sendingInProgress = true;
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

  try {
    // Check if this is a reply to an existing email thread
    const tp = currentSendTopicId ? (DATA.comms.threads && DATA.comms.threads[currentSendTopicId]) : null;
    const emailMessageId = tp && tp.emailMessageId;

    let resp;
    if (emailMessageId) {
      // Reply to existing email
      resp = await fetch('/api/comms/reply/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: emailMessageId, bodyHtml: bodyHtml, replyAll: ccList.length > 0 })
      });
    } else {
      // New email
      resp = await fetch('/api/comms/send/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toList, cc: ccList, bcc: bccList, subject: subject, bodyHtml: bodyHtml })
      });
    }

    const data = await resp.json();
    if (data.ok) {
      closeModal();
      toast('Email sent via Graph API!', 'ok');
      // Refresh comms to reflect sent email
      DATA._commsLiveLoaded = false;
      if (typeof loadCommsLive === 'function') loadCommsLive();
    } else {
      toast('Send failed: ' + (data.error || 'Unknown error'), 'er');
    }
  } catch (e) {
    toast('Send failed: ' + e.message, 'er');
  }

  _sendingInProgress = false;
  if (btn) { btn.textContent = origText; btn.disabled = false; }
}

// ─── Email: AI Assist button in modal ─────────────────────────
async function aiAssistModal() {
  const btn = $('btnAiAssist');
  if (btn) { btn.textContent = '\u2728 Generating...'; btn.disabled = true; }
  try {
    const threadId = currentSendTopicId;
    if (!threadId) { toast('Open a thread first to use AI Assist', 'er'); return; }
    const resp = await fetch('/api/comms/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: threadId, replyType: 'reply' })
    });
    const data = await resp.json();
    if (data.ok && data.draftText) {
      const bodyEl = activeSendTab === 'slack' ? $('slackBody') : $('modalBody');
      if (bodyEl) bodyEl.value = data.draftText;
      if (data.suggestedSubject && $('modalSubject') && !$('modalSubject').value) {
        $('modalSubject').value = data.suggestedSubject;
      }
      toast('AI draft generated', 'ok');
    } else {
      toast('AI draft failed: ' + (data.error || 'unknown'), 'er');
    }
  } catch (e) {
    toast('AI draft failed: ' + e.message, 'er');
  }
  if (btn) { btn.textContent = '\u2728 AI Assist'; btn.disabled = false; }
}

// ─── Slack: Populate recipients dropdown ──────────────────────
let _slackChannelsCache = null;
async function populateSlackTargets() {
  const sel = $('slackTarget');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Select recipient --</option>';

  // People from team directory (anyone with a slackId)
  const peopleGroup = document.createElement('optgroup');
  peopleGroup.label = 'People (DM)';
  var sortedPeople = Object.entries(DATA.people)
    .filter(function(e) { return e[1].slackId; })
    .sort(function(a, b) { return a[1].n.localeCompare(b[1].n); });
  sortedPeople.forEach(function(entry) {
    var p = entry[1];
    var opt = document.createElement('option');
    opt.value = p.slackId;
    opt.textContent = p.n + (p.role ? ' \u00B7 ' + p.role : '');
    peopleGroup.appendChild(opt);
  });
  if (peopleGroup.children.length) sel.appendChild(peopleGroup);

  // Channels from API
  var channelGroup = document.createElement('optgroup');
  channelGroup.label = 'Channels';
  try {
    if (!_slackChannelsCache) {
      var resp = await fetch('/api/comms/channels');
      if (resp.ok) {
        var data = await resp.json();
        if (data.ok) _slackChannelsCache = data.channels;
      }
    }
    if (_slackChannelsCache && _slackChannelsCache.length) {
      _slackChannelsCache
        .sort(function(a, b) { return a.name.localeCompare(b.name); })
        .forEach(function(ch) {
          var opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = '#' + ch.name + (ch.memberCount ? ' (' + ch.memberCount + ')' : '');
          channelGroup.appendChild(opt);
        });
    }
  } catch(e) { /* channels unavailable */ }
  if (!channelGroup.children.length) {
    [['C090HAX2V4H','#beanz-load-balancing'],['C046MM8NHHB','#beanz-bof'],['C05L5AA1ABW','#beanz-on-breville']].forEach(function(pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = pair[1];
      channelGroup.appendChild(opt);
    });
  }
  sel.appendChild(channelGroup);
  if (currentVal) sel.value = currentVal;
}

// ─── Slack: Character counter ─────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var sb = document.getElementById('slackBody');
  if (sb) sb.addEventListener('input', function() {
    var cc = document.getElementById('slackCharCount');
    if (cc) cc.textContent = sb.value.length;
  });
});

// ─── Slack: File upload from modal ────────────────────────────
function uploadSlackFileFromModal() {
  var target = $('slackTarget').value;
  if (!target) { toast('Select a recipient first', 'er'); return; }
  var input = document.createElement('input');
  input.type = 'file';
  input.onchange = async function() {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function() {
      try {
        var resp = await fetch('/api/slack/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: target, content: reader.result, filename: file.name, title: file.name })
        });
        var data = await resp.json();
        if (data.ok) toast('File shared to Slack!', 'ok');
        else toast('Upload failed: ' + (data.error || 'unknown'), 'er');
      } catch(e) { toast('Upload failed', 'er'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Slack: Open DM modal for a person ────────────────────────
function openSlackDM(slackId, personName) {
  currentSendTopicId = null;
  $('modalTo').value = '';
  if ($('modalCc')) $('modalCc').value = '';
  if ($('modalBcc')) $('modalBcc').value = '';
  $('modalSubject').value = '';
  $('modalBody').value = '';
  $('slackBody').value = '';
  $('modalTitle').textContent = 'Slack DM to ' + personName;
  switchSendTab('slack');
  setTimeout(function() { $('slackTarget').value = slackId; }, 100);
  $('sendModal').classList.add('show');
}

// ─── Slack: Send via API ──────────────────────────────────────
async function sendViaSlack() {
  if (_sendingInProgress) return;
  var target = $('slackTarget').value;
  var body = $('slackBody').value;
  if (!target) { toast('Please select a Slack recipient', 'er'); return; }
  if (!body.trim()) { toast('Please enter a message', 'er'); return; }

  // Resolve thread_ts
  var threadTs = null;
  if (currentSendTopicId) {
    var tp = (DATA.comms.threads && DATA.comms.threads[currentSendTopicId]) || (DATA.comms.topics && DATA.comms.topics[currentSendTopicId]);
    if (tp && tp.slackThreadTs) threadTs = tp.slackThreadTs;
  }

  if (/^[CUG]\w{8,}$/.test(target)) {
    _sendingInProgress = true;
    var btn = $('btnSendSlack');
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
    try {
      var payload = { channel: target, text: body };
      if (threadTs) payload.thread_ts = threadTs;
      var resp = await fetch('/api/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await resp.json();
      if (data.ok) {
        closeModal();
        toast('Message sent to Slack!', 'ok');
        DATA._commsLiveLoaded = false;
        if (typeof loadCommsLive === 'function') loadCommsLive();
        _sendingInProgress = false;
        if (btn) { btn.textContent = 'Send via Slack'; btn.disabled = false; }
        return;
      }
      console.warn('Slack API send failed:', data.error);
      toast('Slack send failed: ' + (data.error || 'unknown'), 'er');
    } catch (e) {
      console.warn('Slack API send error:', e);
      toast('Slack send failed', 'er');
    }
    _sendingInProgress = false;
    if (btn) { btn.textContent = 'Send via Slack'; btn.disabled = false; }
    return;
  }

  // Fallback: clipboard + deep link
  try { await navigator.clipboard.writeText(body); } catch(e) {}
  window.location.href = 'slack://user?team=T061FA5PB&id=' + target;
  closeModal();
  toast('\u2713 Message copied \u2014 Slack opening, Ctrl+V and send', 'ok');
}

function copyReply() {
  var ta = $('replyText');
  if (ta) { ta.select(); document.execCommand('copy'); toast('Copied to clipboard', 'ok'); }
}
