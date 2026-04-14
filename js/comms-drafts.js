// ===============================================================
// COMMS DRAFTS — AI draft generation API
// ===============================================================

if (typeof state !== 'undefined') {
  if (!state.commsDrafts) state.commsDrafts = {};
}

function _setDraft(threadId, value) {
  state.commsDrafts = Object.assign({}, state.commsDrafts, { [threadId]: value });
}
function _removeDraft(threadId) {
  var updated = Object.assign({}, state.commsDrafts);
  delete updated[threadId];
  state.commsDrafts = updated;
}
function _getThread(threadId) {
  return (typeof DATA !== 'undefined' && DATA.comms && DATA.comms.threads)
    ? DATA.comms.threads[threadId] || null : null;
}

// ── 1. requestAIDraft ──

async function requestAIDraft(threadId, customInstructions) {
  _setDraft(threadId, { loading: true });
  renderAll();
  try {
    var resp = await fetch('/api/comms/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: threadId, replyType: 'reply', customInstructions: customInstructions || '' })
    });
    if (!resp.ok) {
      var eb = await resp.json().catch(function() { return {}; });
      throw new Error(eb.error || 'Server returned ' + resp.status);
    }
    var data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Draft generation failed');
    _setDraft(threadId, {
      draftId: data.draftId,
      draftText: data.draftText,
      draftHtml: data.draftHtml,
      suggestedSubject: data.suggestedSubject,
      confidence: data.confidence,
      loading: false
    });
    toast('Draft generated', 'ok');
  } catch (e) {
    _setDraft(threadId, { error: e.message || 'Unknown error', loading: false });
    toast('Draft failed: ' + (e.message || 'Unknown error'), 'er');
  }
  if (state.selectedThread === threadId) renderCommsMain();
}

// ── 2. sendDraft ──

async function sendDraft(draftId, platform, options) {
  if (!draftId || !platform) { toast('Missing draft or platform', 'er'); return; }
  var threadId = null;
  for (var tid in state.commsDrafts) {
    if (state.commsDrafts[tid] && state.commsDrafts[tid].draftId === draftId) {
      threadId = tid;
      break;
    }
  }
  if (threadId) {
    _setDraft(threadId, Object.assign({}, state.commsDrafts[threadId], { sending: true }));
    renderAll();
  }
  try {
    var resp = await fetch('/api/comms/draft/' + encodeURIComponent(draftId) + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ platform: platform }, options || {}))
    });
    if (!resp.ok) {
      var eb = await resp.json().catch(function() { return {}; });
      throw new Error(eb.error || 'Send failed');
    }
    var data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Send failed');
    if (threadId) _removeDraft(threadId);
    toast('Sent!', 'ok');
    if (typeof DATA !== 'undefined') {
      DATA._commsLiveLoaded = false;
      if (typeof loadCommsLive === 'function') loadCommsLive();
    }
    renderAll();
  } catch (e) {
    if (threadId && state.commsDrafts[threadId]) {
      var reverted = Object.assign({}, state.commsDrafts[threadId]);
      delete reverted.sending;
      _setDraft(threadId, reverted);
      renderAll();
    }
    toast(e.message || 'Send failed', 'er');
  }
}

// ── 3. discardDraft ──

function discardDraft(threadId) {
  var draft = state.commsDrafts && state.commsDrafts[threadId];
  // Server-side discard (best-effort)
  if (draft && draft.draftId) {
    fetch('/api/comms/draft/' + encodeURIComponent(draft.draftId) + '/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(function() {});
  }
  _removeDraft(threadId);
  toast('Draft discarded', 'ok');
  renderAll();
}

// ── 4. loadPendingDrafts ──

async function loadPendingDrafts() {
  try {
    var resp = await fetch('/api/comms/drafts');
    if (!resp.ok) return;
    var data = await resp.json();
    if (!data.ok || !Array.isArray(data.drafts)) return;
    var map = {};
    data.drafts.forEach(function(d) {
      map[d.thread_id] = {
        draftId: d.id,
        draftText: d.draft_text,
        draftHtml: d.draft_html,
        tone: d.tone,
        status: d.status,
        createdAt: d.created_at,
        loading: false
      };
    });
    state.commsDrafts = map;
  } catch (e) { /* drafts are non-critical */ }
}

// ── 5. getDraftForThread ──

function getDraftForThread(threadId) {
  if (!threadId || !state.commsDrafts || !state.commsDrafts[threadId]) return null;
  return state.commsDrafts[threadId];
}
