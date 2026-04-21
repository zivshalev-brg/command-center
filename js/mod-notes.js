// ===============================================================
// NOTES TAB — NotebookLM-style workspace (Sources · Chat · Studio)
// ===============================================================

function _nEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Studio artifact definitions — matches NotebookLM's 9-artifact grid
var _STUDIO_ARTIFACTS = [
  { kind: 'audio_overview', icon: '🎧', label: 'Audio Overview', hint: 'Two-host podcast script' },
  { kind: 'slide_deck',     icon: '📊', label: 'Slide Deck',     hint: '10-slide outline with bullets' },
  { kind: 'video_script',   icon: '🎬', label: 'Video Overview', hint: '4-minute narrated script' },
  { kind: 'mind_map',       icon: '🗺️', label: 'Mind Map',       hint: 'Hierarchical concept tree' },
  { kind: 'reports',        icon: '📄', label: 'Reports',        hint: 'Exec briefing report' },
  { kind: 'flashcards',     icon: '🎴', label: 'Flashcards',     hint: '12 study cards' },
  { kind: 'quiz',           icon: '❓', label: 'Quiz',           hint: '8-question MCQ' },
  { kind: 'infographic',    icon: '📈', label: 'Infographic',    hint: '6-panel visual spec' },
  { kind: 'data_table',     icon: '🗂️', label: 'Data Table',     hint: 'Structured extraction' }
];

var _NOTES_SOURCE_ICONS = {
  upload_pdf: '📄', upload_docx: '📃', upload_txt: '📝', upload_md: '📝', upload_csv: '📊',
  upload_xlsx: '📈', upload_pptx: '📽️',
  paste_text: '✂️', paste_url: '🔗', vault_page: '🧠', dashboard_snapshot: '📊', web_research: '🔬'
};

// ── Network layer ────────────────────────────────────────────
function notesLoadList() {
  fetch('/api/notebooks').then(r=>r.json()).then(d => {
    state.notebooks = d.notebooks || [];
    state.notesLoaded = true;
    renderAll();
  }).catch(()=>{});
}

function notesLoadNotebook(id) {
  state.selectedNotebookId = id;
  state.selectedNotebook = null;
  state.notesSelectedNoteId = null;
  state.notesEditor = null;
  renderAll();
  fetch('/api/notebooks/' + encodeURIComponent(id)).then(r=>r.json()).then(d => {
    state.selectedNotebook = d.notebook || null;
    renderAll();
  }).catch(()=>{});
}

function notesCreateNotebook() {
  fetch('/api/notebooks', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Untitled notebook' }) })
    .then(r=>r.json()).then(d => {
      if (d.notebook) {
        state.notebooks.unshift(d.notebook);
        notesLoadNotebook(d.notebook.id);
      }
    });
}

function notesRenameNotebook() {
  var nb = state.selectedNotebook; if (!nb) return;
  var title = prompt('Notebook title:', nb.title);
  if (!title) return;
  fetch('/api/notebooks/' + encodeURIComponent(nb.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title }) })
    .then(r=>r.json()).then(d => { if (d.notebook) { state.selectedNotebook = Object.assign({}, state.selectedNotebook, d.notebook); notesLoadList(); renderAll(); } });
}

function notesDeleteNotebook(id, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('Delete this notebook?')) return;
  fetch('/api/notebooks/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(()=>{
      state.notebooks = state.notebooks.filter(n=>n.id !== id);
      if (state.selectedNotebookId === id) { state.selectedNotebookId = null; state.selectedNotebook = null; }
      renderAll();
    });
}

// ── Add sources modal ───────────────────────────────────────
function notesOpenAddSourcesModal() {
  state.notesAddSourcesOpen = true;
  state.notesSearchMode = state.notesSearchMode || 'fast';
  renderAll();
  setTimeout(function(){ var el = document.getElementById('nb-web-search-input'); if (el) el.focus(); }, 80);
}
function notesCloseAddSourcesModal() {
  state.notesAddSourcesOpen = false;
  renderAll();
}
function notesSetSearchMode(mode) {
  state.notesSearchMode = mode;
  renderAll();
}
function notesSubmitWebSearch() {
  var el = document.getElementById('nb-web-search-input');
  var q = el ? el.value.trim() : '';
  if (!q) return;
  var mode = state.notesSearchMode || 'fast';
  var nbId = state.selectedNotebookId;
  notesCloseAddSourcesModal();
  if (typeof showToast === 'function') showToast((mode === 'deep' ? 'Deep research' : 'Fast research') + ' in progress… ~' + (mode === 'deep' ? '45s' : '15s'));
  state.notesResearchInFlight = true; renderAll();
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ kind: 'web_research', query: q, mode })
  }).then(r=>r.json()).then(function(){ state.notesResearchInFlight = false; notesLoadNotebook(nbId); if (typeof showToast === 'function') showToast('Research source added'); })
    .catch(function(){ state.notesResearchInFlight = false; renderAll(); });
}

function notesAddSource(kind) {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  // Upload flow still uses native file picker (browser-native UX)
  if (kind === 'upload') { notesCloseAddSourcesModal(); return _notesTriggerUpload(nbId); }
  // Dashboard snapshot uses inline option picker — toast-based, no prompt
  if (kind === 'dashboard_snapshot') { notesCloseAddSourcesModal(); return _notesSnapshotDashboard(nbId); }
  // All other source types render an inline subview in the modal
  state.notesAddSourcesSubview = kind;
  state.notesVaultResults = null;
  state.notesVaultQuery = '';
  renderAll();
  setTimeout(function(){
    var focusMap = { paste_text: 'nb-paste-text-title', paste_url: 'nb-paste-url-input', vault_page: 'nb-vault-search-input' };
    var el = focusMap[kind] ? document.getElementById(focusMap[kind]) : null;
    if (el) el.focus();
  }, 80);
}

function notesBackToAddSources() {
  state.notesAddSourcesSubview = null;
  state.notesVaultResults = null;
  renderAll();
}

function notesSubmitPasteText() {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  var titleEl = document.getElementById('nb-paste-text-title');
  var bodyEl = document.getElementById('nb-paste-text-body');
  var title = (titleEl && titleEl.value.trim()) || 'Pasted text';
  var content = bodyEl ? bodyEl.value.trim() : '';
  if (!content) {
    if (typeof showToast === 'function') showToast('Paste some text first', 'er');
    return;
  }
  notesCloseAddSourcesModal();
  _notesSubmitSource(nbId, { kind: 'paste_text', title: title, contentText: content });
}

function notesSubmitPasteUrl() {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  var urlEl = document.getElementById('nb-paste-url-input');
  var url = urlEl ? urlEl.value.trim() : '';
  if (!/^https?:\/\//i.test(url)) {
    if (typeof showToast === 'function') showToast('Enter a valid URL starting with http(s)://', 'er');
    return;
  }
  notesCloseAddSourcesModal();
  _notesSubmitSource(nbId, { kind: 'paste_url', url: url });
}

function notesSearchVault() {
  var qEl = document.getElementById('nb-vault-search-input');
  var q = qEl ? qEl.value.trim() : '';
  if (!q) return;
  state.notesVaultQuery = q;
  state.notesVaultLoading = true;
  renderAll();
  fetch('/api/notebooks/vault-search?q=' + encodeURIComponent(q)).then(r=>r.json()).then(function(d){
    state.notesVaultResults = d.results || [];
    state.notesVaultLoading = false;
    state.notesVaultSelected = {};
    renderAll();
  }).catch(function(){ state.notesVaultLoading = false; renderAll(); });
}

function notesToggleVaultPick(idx) {
  state.notesVaultSelected = state.notesVaultSelected || {};
  state.notesVaultSelected[idx] = !state.notesVaultSelected[idx];
  renderAll();
}

function notesSubmitVaultPicks() {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  var results = state.notesVaultResults || [];
  var picks = Object.keys(state.notesVaultSelected || {}).filter(function(k){ return state.notesVaultSelected[k]; }).map(function(k){ return results[parseInt(k,10)]; }).filter(Boolean);
  if (!picks.length) {
    if (typeof showToast === 'function') showToast('Select at least one page', 'er');
    return;
  }
  notesCloseAddSourcesModal();
  picks.forEach(function(r){
    _notesSubmitSource(nbId, { kind: 'vault_page', title: r.title, relPath: r.relPath, content: r.content, tags: r.tags });
  });
}

function _notesSubmitSource(nbId, body) {
  if (typeof showToast === 'function') showToast('Adding source…');
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  }).then(r=>r.json()).then(d => {
    if (d.source) { if (typeof showToast === 'function') showToast('Source added'); notesLoadNotebook(nbId); }
    else if (typeof showToast === 'function') showToast(d.error || 'Could not add source');
  });
}

function _notesTriggerUpload(nbId) {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.pdf,.docx,.txt,.md,.csv,.json,.html,.xlsx,.xls,.xlsm,.pptx,.ppt';
  input.multiple = true;
  input.onchange = function() {
    if (!input.files || !input.files.length) return;
    Array.from(input.files).forEach(function(file) {
      var form = new FormData(); form.append('file', file);
      state.notesUploading = true; renderAll();
      fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources', { method: 'POST', body: form })
        .then(r=>r.json()).then(()=> { state.notesUploading = false; notesLoadNotebook(nbId); })
        .catch(()=> { state.notesUploading = false; renderAll(); });
    });
  };
  input.click();
}

function _notesSnapshotDashboard(nbId) {
  var options = [];
  if (typeof _metricsData !== 'undefined' && _metricsData && _metricsData.snapshot) options.push({ label: 'Metrics snapshot', title: 'Metrics · ' + (state._metricsPeriod || 'current'), data: _metricsData.snapshot });
  if (typeof DATA !== 'undefined' && DATA.strategy) options.push({ label: 'Strategy correlations', title: 'Strategy Correlations', data: DATA.strategy });
  if (!options.length) {
    if (typeof showToast === 'function') showToast('Open Metrics or Strategy first to enable snapshots', 'er');
    return;
  }
  // Auto-snapshot all available options — avoids prompt() picker
  options.forEach(function(sel){
    _notesSubmitSource(nbId, { kind: 'dashboard_snapshot', title: sel.title, contentText: JSON.stringify(sel.data, null, 2) });
  });
}

// Drag-drop handler for the main Sources pane (not just the modal).
// Accepts dropped files anywhere in the pane; uses the same upload flow.
function _nbSourcesPaneDragOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('drag-hover'); }
function _nbSourcesPaneDragLeave(ev) { ev.currentTarget.classList.remove('drag-hover'); }
function _nbSourcesPaneDrop(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-hover');
  var nbId = state.selectedNotebookId; if (!nbId) return;
  var files = (ev.dataTransfer && ev.dataTransfer.files) || [];
  if (!files.length) return;
  Array.from(files).forEach(function(file){
    var form = new FormData(); form.append('file', file);
    state.notesUploading = true; renderAll();
    fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources', { method: 'POST', body: form })
      .then(r=>r.json()).then(()=> { state.notesUploading = false; notesLoadNotebook(nbId); })
      .catch(()=> { state.notesUploading = false; renderAll(); });
  });
}

function notesDeleteSource(sid) {
  if (!confirm('Remove this source?')) return;
  var nbId = state.selectedNotebookId;
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources/' + encodeURIComponent(sid), { method: 'DELETE' })
    .then(()=> notesLoadNotebook(nbId));
}

// ── Artifact generation (SSE) ───────────────────────────────
async function notesGenerateArtifact(kind) {
  var nbId = state.selectedNotebookId;
  if (!nbId || state.notesStreaming) return;
  state.notesStreaming = true;
  state.notesStreamKind = kind;
  state.notesStreamTitle = (_STUDIO_ARTIFACTS.find(a=>a.kind===kind)||{}).label || kind;
  state.notesStreamBuffer = '';
  state.notesStreamCitations = [];
  renderAll();
  try {
    var resp = await fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/artifact/' + encodeURIComponent(kind), { method: 'POST' });
    await _notesReadSse(resp, function(evt, data){
      if (evt === 'citations') { state.notesStreamCitations = data.citations || []; renderAll(); }
      if (evt === 'delta' && data.text) { state.notesStreamBuffer += data.text; _notesUpdateStream(); }
      if (evt === 'error') { state.notesStreamBuffer += '\n\n_Error: ' + (data.error || 'unknown') + '_'; _notesUpdateStream(); }
      if (evt === 'done') { state.notesStreaming = false; state.notesStreamKind = null; state.notesStreamBuffer = ''; notesLoadNotebook(nbId); }
    });
  } catch (e) { state.notesStreaming = false; renderAll(); }
}

function _notesUpdateStream() {
  var el = document.getElementById('nb-stream-body');
  if (el) el.innerHTML = _notesRenderCitations(state.notesStreamCitations) + '<div class="nb-note-body notes-md">' + _notesRenderMd(state.notesStreamBuffer) + '<span class="chat-cursor">▌</span></div>';
  else renderAll();
}

// ── Grounded chat ───────────────────────────────────────────
async function notesSendChat(prefilled) {
  var nbId = state.selectedNotebookId;
  var input = document.getElementById('nb-chat-input');
  var text = (prefilled || (input ? input.value : '') || '').trim();
  if (!text || !nbId || state.notesChatStreaming) return;
  if (input) { input.value = ''; input.style.height = 'auto'; }
  if (!state.selectedNotebook) state.selectedNotebook = { messages: [] };
  if (!state.selectedNotebook.messages) state.selectedNotebook.messages = [];
  state.selectedNotebook.messages.push({ role: 'user', content: text, created_at: new Date().toISOString() });
  state.notesChatStreaming = true;
  state.notesChatStreamBuffer = '';
  state.notesChatCitations = [];
  renderAll();
  try {
    var resp = await fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/chat', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message: text })
    });
    await _notesReadSse(resp, function(evt, data){
      if (evt === 'citations') state.notesChatCitations = data.citations || [];
      if (evt === 'delta' && data.text) { state.notesChatStreamBuffer += data.text; _notesUpdateChat(); }
      if (evt === 'error') { state.notesChatStreamBuffer += '\n\n_Error: ' + (data.error || 'unknown') + '_'; _notesUpdateChat(); }
      if (evt === 'done') {
        state.selectedNotebook.messages.push({ role: 'assistant', content: state.notesChatStreamBuffer, citations_json: JSON.stringify(state.notesChatCitations), created_at: new Date().toISOString() });
        state.notesChatStreaming = false; state.notesChatStreamBuffer = ''; renderAll();
      }
    });
  } catch (e) { state.notesChatStreaming = false; renderAll(); }
}

function _notesUpdateChat() {
  var el = document.getElementById('nb-chat-stream');
  if (el) el.innerHTML = _notesRenderCitationMarkers(state.notesChatStreamBuffer, state.notesChatCitations) + '<span class="chat-cursor">▌</span>';
  var wrap = document.getElementById('nb-chat-scroll');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function notesClearChat() {
  var nbId = state.selectedNotebookId;
  if (!nbId || !confirm('Clear all chat messages for this notebook?')) return;
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/messages', { method: 'DELETE' }).then(()=> notesLoadNotebook(nbId));
}

function notesSaveMessageToNotes(idx) {
  var nbId = state.selectedNotebookId;
  var nb = state.selectedNotebook; if (!nb || !nb.messages) return;
  var msg = nb.messages[idx]; if (!msg || msg.role !== 'assistant') return;
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/notes', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ title: 'Saved from chat · ' + new Date().toLocaleString(), contentMd: msg.content, kind: 'chat_saved', pinned: false })
  }).then(()=> { if (typeof showToast==='function') showToast('Saved to notes'); notesLoadNotebook(nbId); });
}

// ── Export ──────────────────────────────────────────────────
function notesExport() {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  window.open('/api/notebooks/' + encodeURIComponent(nbId) + '/export', '_blank');
}

// ── Note editor (full-pane) ─────────────────────────────────
function notesOpenNote(nid) {
  state.notesSelectedNoteId = nid;
  var nb = state.selectedNotebook; if (!nb) return;
  var n = (nb.notes || []).find(function(x){return x.id === nid;}); if (!n) return;
  state.notesEditor = { open: true, mode: 'edit', noteId: nid, title: n.title || '', contentMd: n.content_md || '', kind: n.kind, preview: false };
  renderAll();
  setTimeout(function(){ var t = document.getElementById('nb-editor-title'); if (t) t.focus(); }, 60);
}

function notesAddUserNote() {
  if (!state.selectedNotebookId) return;
  state.notesSelectedNoteId = 'new';
  state.notesEditor = { open: true, mode: 'create', noteId: null, title: '', contentMd: '', kind: 'user', preview: false };
  renderAll();
  setTimeout(function(){ var t = document.getElementById('nb-editor-title'); if (t) t.focus(); }, 60);
}

function notesCloseEditor() {
  state.notesEditor = null;
  state.notesSelectedNoteId = null;
  renderAll();
}

function notesToggleEditorPreview() {
  if (!state.notesEditor) return;
  var t = document.getElementById('nb-editor-title');
  var b = document.getElementById('nb-editor-body');
  if (t) state.notesEditor.title = t.value;
  if (b) state.notesEditor.contentMd = b.value;
  state.notesEditor.preview = !state.notesEditor.preview;
  renderAll();
}

function notesSaveEditor() {
  if (!state.notesEditor) return;
  var t = document.getElementById('nb-editor-title');
  var b = document.getElementById('nb-editor-body');
  var title = (t ? t.value : state.notesEditor.title || '').trim();
  var contentMd = (b ? b.value : state.notesEditor.contentMd || '').trim();
  if (!title && !contentMd) { notesCloseEditor(); return; }
  var nbId = state.selectedNotebookId;
  var mode = state.notesEditor.mode;
  var noteId = state.notesEditor.noteId;
  if (mode === 'edit' && noteId) {
    fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/notes/' + encodeURIComponent(noteId), {
      method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, contentMd })
    }).then(function(){ notesLoadNotebook(nbId); if (typeof showToast==='function') showToast('Saved'); });
  } else {
    fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/notes', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, contentMd, kind: 'user' })
    }).then(function(){ notesLoadNotebook(nbId); if (typeof showToast==='function') showToast('Note created'); });
  }
  state.notesEditor = null;
  state.notesSelectedNoteId = null;
}

function notesDeleteCurrentNote() {
  if (!state.notesEditor || !state.notesEditor.noteId) { notesCloseEditor(); return; }
  if (!confirm('Delete this note?')) return;
  var nid = state.notesEditor.noteId;
  var nbId = state.selectedNotebookId;
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/notes/' + encodeURIComponent(nid), { method: 'DELETE' })
    .then(()=> { notesCloseEditor(); notesLoadNotebook(nbId); });
}

function notesConvertNoteToSource() {
  if (!state.notesEditor) return;
  var t = document.getElementById('nb-editor-title');
  var b = document.getElementById('nb-editor-body');
  var title = (t ? t.value : state.notesEditor.title || '').trim() || 'Note';
  var contentMd = (b ? b.value : state.notesEditor.contentMd || '').trim();
  if (!contentMd) return;
  var nbId = state.selectedNotebookId;
  _notesSubmitSource(nbId, { kind: 'paste_text', title: '📎 ' + title, contentText: contentMd });
}

function notesPromoteToBrain() {
  if (!state.notesEditor || !state.notesEditor.noteId) {
    if (typeof showToast === 'function') showToast('Save the note first');
    return;
  }
  var nbId = state.selectedNotebookId;
  var noteId = state.notesEditor.noteId;
  fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/promote', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ noteId: noteId })
  }).then(r=>r.json()).then(d => {
    if (d.relPath) {
      if (typeof showToast === 'function') showToast('Promoted to Obsidian Brain: ' + d.relPath);
    } else {
      if (typeof showToast === 'function') showToast('Promote failed: ' + (d.error || 'unknown'));
    }
  }).catch(function(e){ if (typeof showToast === 'function') showToast('Promote failed: ' + e.message); });
}

function _notesEditorFormat(mode) {
  var ta = document.getElementById('nb-editor-body'); if (!ta) return;
  var start = ta.selectionStart, end = ta.selectionEnd;
  var before = ta.value.slice(0, start), sel = ta.value.slice(start, end), after = ta.value.slice(end);
  var wrap = function(a,b){return a+(sel||'')+b;};
  var newSel = sel, cursorOffset = null;
  switch (mode) {
    case 'bold': ta.value = before + wrap('**','**') + after; cursorOffset = sel ? 0 : 2; break;
    case 'italic': ta.value = before + wrap('*','*') + after; cursorOffset = sel ? 0 : 1; break;
    case 'code': ta.value = before + wrap('`','`') + after; cursorOffset = sel ? 0 : 1; break;
    case 'h1': case 'h2': case 'h3': {
      var hashes = mode==='h1'?'# ':mode==='h2'?'## ':'### ';
      var lineStart = before.lastIndexOf('\n') + 1;
      var line = before.slice(lineStart);
      ta.value = ta.value.slice(0, lineStart) + hashes + line + (sel||'') + after;
      cursorOffset = hashes.length; break;
    }
    case 'ul': case 'ol': case 'check': {
      var sym = mode==='ol'?'1. ':mode==='check'?'- [ ] ':'- ';
      if (sel) newSel = sel.split('\n').map(function(l){return l.length ? sym+l : l;}).join('\n');
      else newSel = sym;
      ta.value = before + newSel + after; cursorOffset = 0; break;
    }
    case 'link': {
      var label = sel || 'link text';
      ta.value = before + '[' + label + '](https://)' + after;
      start = before.length + label.length + 3; end = start + 8; cursorOffset = null; break;
    }
    case 'quote': { var block = sel ? sel.split('\n').map(function(l){return '> '+l;}).join('\n') : '> '; ta.value = before + block + after; cursorOffset = 0; newSel = block; break; }
    case 'hr': ta.value = before + '\n---\n' + after; cursorOffset = 5; break;
    case 'clear': ta.value = before + sel.replace(/[*_`#>-]/g,'').replace(/\[(.*?)\]\(.*?\)/g,'$1') + after; break;
  }
  ta.focus();
  if (mode === 'link') { ta.setSelectionRange(start, end); }
  else if (cursorOffset != null) {
    var pos = before.length + (sel ? (newSel || sel).length + (mode==='bold'?4:mode==='italic'||mode==='code'?2:0) : cursorOffset);
    ta.setSelectionRange(pos, pos);
  }
  if (state.notesEditor) state.notesEditor.contentMd = ta.value;
}

function _notesEditorKeydown(ev) {
  if ((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();notesSaveEditor();return;}
  if (ev.key==='Escape'){ev.preventDefault();notesCloseEditor();return;}
  if ((ev.ctrlKey||ev.metaKey)&&ev.key==='b'){ev.preventDefault();_notesEditorFormat('bold');return;}
  if ((ev.ctrlKey||ev.metaKey)&&ev.key==='i'){ev.preventDefault();_notesEditorFormat('italic');return;}
  if ((ev.ctrlKey||ev.metaKey)&&ev.key==='k'){ev.preventDefault();_notesEditorFormat('link');return;}
  if (ev.key==='Enter') {
    var ta = ev.target; var pos = ta.selectionStart;
    var before = ta.value.slice(0,pos); var ls = before.lastIndexOf('\n')+1; var line = before.slice(ls);
    var m = line.match(/^(\s*)(- \[[ xX]\] |- |\* |\d+\. )(.*)$/);
    if (m) {
      var indent = m[1], marker = m[2], content = m[3];
      if (!content.trim()) { ev.preventDefault(); var nb = ta.value.slice(0,ls) + indent; ta.value = nb + '\n' + ta.value.slice(pos); ta.setSelectionRange(nb.length+1, nb.length+1); return; }
      ev.preventDefault();
      var next = /^\d+\. /.test(marker) ? (parseInt(marker,10)+1)+'. ' : /^- \[[xX]\] /.test(marker) ? '- [ ] ' : marker;
      var insert = '\n' + indent + next;
      ta.value = before + insert + ta.value.slice(pos);
      ta.setSelectionRange(pos+insert.length, pos+insert.length);
    }
  }
}

// ── Collapse toggles ────────────────────────────────────────
function notesToggleSourcesPane() { state.notesSourcesCollapsed = !state.notesSourcesCollapsed; renderAll(); }
function notesToggleStudioPane() { state.notesStudioCollapsed = !state.notesStudioCollapsed; renderAll(); }

// ── Keyboard shortcut: `/` focuses chat input when in Notes tab
// (ignored if user is typing in another input/textarea/modal)
document.addEventListener('keydown', function(e) {
  if (state.module !== 'notes') return;
  if (e.key !== '/') return;
  var tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (state.notesEditor && state.notesEditor.open) return;
  if (state.notesAddSourcesOpen) return;
  var el = document.getElementById('nb-chat-input');
  if (el) { e.preventDefault(); el.focus(); }
});

// ── SSE utility ─────────────────────────────────────────────
async function _notesReadSse(resp, cb) {
  var reader = resp.body.getReader();
  var decoder = new TextDecoder();
  var buf = '';
  while (true) {
    var r = await reader.read(); if (r.done) break;
    buf += decoder.decode(r.value, { stream: true });
    var events = buf.split('\n\n'); buf = events.pop();
    for (var i=0;i<events.length;i++) {
      var evt = events[i].trim(); if (!evt) continue;
      var type = '', data = '';
      var lines = evt.split('\n');
      for (var j=0;j<lines.length;j++) {
        if (lines[j].startsWith('event:')) type = lines[j].slice(6).trim();
        if (lines[j].startsWith('data:')) data += (data?'\n':'') + lines[j].slice(5).trim();
      }
      if (!data) continue;
      try { cb(type, JSON.parse(data)); } catch {}
    }
  }
}

// ════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════
function renderNotesSidebar() {
  var sb = $('sidebar');
  if (!state.notesLoaded) notesLoadList();
  var list = state.notebooks || [];
  var html = '<div class="ca-sb">';
  html += '<button class="btn btn-p" onclick="notesCreateNotebook()" style="width:100%;justify-content:center"><span>＋</span> Create notebook</button>';
  if (list.length) {
    html += '<div class="sb-section-title" style="margin-top:var(--sp4)">Recent notebooks</div>';
    html += '<div class="ca-sb-nav">';
    list.forEach(function(nb){
      var isActive = state.selectedNotebookId === nb.id;
      html += '<div class="ca-sb-nav-item nb-row' + (isActive?' active':'') + '" onclick="notesLoadNotebook(\'' + _nEnc(nb.id) + '\')">' +
        '<span class="nb-row-icon">' + _nEnc(nb.icon || '📒') + '</span>' +
        '<span class="nb-row-title">' + _nEnc(nb.title) + '</span>' +
        '<span class="nb-row-meta">' + (nb.source_count||0) + '</span>' +
        '<button class="chat-sb-del" onclick="notesDeleteNotebook(\'' + _nEnc(nb.id) + '\', event)">✕</button>' +
      '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="padding:var(--sp4);text-align:center;color:var(--tx3);font-size:var(--f-sm);line-height:1.5">No notebooks yet.</div>';
  }
  html += '</div>';
  sb.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
// MAIN — 3-pane NotebookLM layout
// ════════════════════════════════════════════════════════════
function renderNotesMain() {
  var main = $('main');

  if (!state.selectedNotebookId) {
    main.innerHTML =
      '<div class="nblm-empty">' +
        '<div class="nblm-empty-icon"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg></div>' +
        '<h1>Notes</h1>' +
        '<p>Turn any set of sources into a reliable, grounded research workspace. Drop PDFs, Excel, PowerPoint, vault pages, dashboard snapshots, or search the web — then chat, summarise, or build studio artifacts with citations.</p>' +
        '<button class="btn btn-p" onclick="notesCreateNotebook()" style="margin-top:var(--sp4)"><span>＋</span> Create notebook</button>' +
      '</div>' +
      (state.notesAddSourcesOpen ? _nbAddSourcesModal() : '');
    return;
  }

  if (!state.selectedNotebook) {
    main.innerHTML = '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading notebook…</p></div>';
    return;
  }

  var nb = state.selectedNotebook;
  var srcCollapsed = !!state.notesSourcesCollapsed;
  var studioCollapsed = !!state.notesStudioCollapsed;

  var layoutClass = 'nblm-layout';
  if (srcCollapsed) layoutClass += ' sources-collapsed';
  if (studioCollapsed) layoutClass += ' studio-collapsed';

  main.innerHTML =
    '<div class="nblm-root">' +
      _nblmTopBar(nb) +
      '<div class="' + layoutClass + '">' +
        _nblmSourcesPane(nb, srcCollapsed) +
        _nblmChatPane(nb) +
        _nblmStudioPane(nb, studioCollapsed) +
      '</div>' +
    '</div>' +
    (state.notesAddSourcesOpen ? _nbAddSourcesModal() : '');

  // Auto-scroll chat
  var mwrap = document.getElementById('nb-chat-scroll');
  if (mwrap) mwrap.scrollTop = mwrap.scrollHeight;
}

function _nblmTopBar(nb) {
  return '<div class="nblm-topbar">' +
    '<div class="nblm-topbar-left">' +
      '<span class="nblm-nb-icon" onclick="notesRenameNotebook()" title="Rename">' + _nEnc(nb.icon || '📒') + '</span>' +
      '<h1 class="nblm-nb-title" onclick="notesRenameNotebook()" title="Rename">' + _nEnc(nb.title) + '</h1>' +
    '</div>' +
    '<div class="nblm-topbar-right">' +
      '<button class="btn btn-p" onclick="notesCreateNotebook()"><span>＋</span> Create notebook</button>' +
      '<button class="btn btn-g" onclick="notesExport()" title="Export markdown">Share</button>' +
    '</div>' +
  '</div>';
}

function _nblmSourcesPane(nb, collapsed) {
  if (collapsed) {
    return '<div class="nblm-pane nblm-pane-collapsed">' +
      '<button class="nblm-collapse-btn" onclick="notesToggleSourcesPane()" title="Expand sources"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></button>' +
      '<div class="nblm-pane-vertical-label">SOURCES</div>' +
    '</div>';
  }
  var sources = nb.sources || [];
  var list = '';
  if (sources.length) {
    list = '<div class="nblm-sources-list">' + sources.map(function(s){
      var icon = _NOTES_SOURCE_ICONS[s.kind] || '📄';
      var sizeKb = s.size ? Math.max(1, Math.round(s.size/1024)) : 0;
      return '<div class="nblm-source-card">' +
        '<div class="nblm-source-icon">' + icon + '</div>' +
        '<div class="nblm-source-body">' +
          '<div class="nblm-source-title">' + _nEnc(s.title) + '</div>' +
          '<div class="nblm-source-meta">' + s.kind.replace(/_/g,' ') + ' · ' + sizeKb + ' KB</div>' +
        '</div>' +
        '<button class="nblm-source-del" onclick="notesDeleteSource(\'' + _nEnc(s.id) + '\')">✕</button>' +
      '</div>';
    }).join('') + '</div>';
  } else {
    list = '<div class="nblm-empty-state">' +
      '<div class="nblm-empty-ico"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
      '<div class="nblm-empty-title">Saved sources will appear here</div>' +
      '<div class="nblm-empty-sub">Click <b>Add sources</b> to upload PDFs, Excel, PowerPoint, websites, vault pages, or research the web.</div>' +
    '</div>';
  }

  return '<div class="nblm-pane nblm-pane-sources"' +
    ' ondragover="_nbSourcesPaneDragOver(event)"' +
    ' ondragleave="_nbSourcesPaneDragLeave(event)"' +
    ' ondrop="_nbSourcesPaneDrop(event)">' +
    '<div class="nblm-pane-head">' +
      '<span class="nblm-pane-title">Sources</span>' +
      '<button class="nblm-collapse-btn" onclick="notesToggleSourcesPane()" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></button>' +
    '</div>' +
    '<div class="nblm-pane-drag-hint">Drop files here to add as sources</div>' +
    '<div class="nblm-pane-body">' +
      '<button class="nblm-add-sources-btn" onclick="notesOpenAddSourcesModal()">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '<span>Add sources</span>' +
      '</button>' +
      _nblmWebSearchBox() +
      list +
    '</div>' +
  '</div>';
}

function _nblmWebSearchBox() {
  var mode = state.notesSearchMode || 'fast';
  var modeLabel = mode === 'deep' ? 'Deep Research' : 'Fast Research';
  return '<div class="nblm-search-box">' +
    '<div class="nblm-search-input-row">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input type="text" id="nb-web-search-input" placeholder="Search the web for new sources" onkeydown="if(event.key===\'Enter\'){notesSubmitWebSearch()}" />' +
    '</div>' +
    '<div class="nblm-search-chip-row">' +
      '<div class="nblm-search-chip">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
        '<span>Web</span>' +
      '</div>' +
      '<div class="nblm-search-chip nblm-mode-chip" onclick="_nbToggleResearchMenu(event)">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h6"/><circle cx="17" cy="17" r="3"/><line x1="19" y1="19" x2="22" y2="22"/></svg>' +
        '<span>' + modeLabel + '</span>' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '<div class="nblm-research-menu" id="nb-research-menu" style="display:none">' +
          '<div class="nblm-research-opt' + (mode==='fast'?' active':'') + '" onclick="event.stopPropagation();notesSetSearchMode(\'fast\')"><b>Fast Research</b><br><span>Great for quick results</span></div>' +
          '<div class="nblm-research-opt' + (mode==='deep'?' active':'') + '" onclick="event.stopPropagation();notesSetSearchMode(\'deep\')"><b>Deep Research</b><br><span>In-depth report and results</span></div>' +
        '</div>' +
      '</div>' +
      '<button class="nblm-search-go" onclick="notesSubmitWebSearch()" title="Run research">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
      '</button>' +
    '</div>' +
    (state.notesResearchInFlight ? '<div class="nblm-research-progress">Researching… this may take 15-45s.</div>' : '') +
  '</div>';
}

function _nbToggleResearchMenu(ev) {
  ev.stopPropagation();
  var m = document.getElementById('nb-research-menu');
  if (m) m.style.display = m.style.display === 'block' ? 'none' : 'block';
  document.addEventListener('click', function close(){ var n = document.getElementById('nb-research-menu'); if (n) n.style.display='none'; document.removeEventListener('click', close); });
}

function _nblmChatPane(nb) {
  var messages = nb.messages || [];
  var sourceCount = (nb.sources || []).length;
  var body;
  if (!messages.length && !state.notesChatStreaming && !state.notesStreaming) {
    body = '<div class="nblm-chat-hero">' +
      '<div class="nblm-nb-bigicon">' + _nEnc(nb.icon || '📒') + '</div>' +
      '<h2 class="nblm-chat-nbtitle">' + _nEnc(nb.title) + '</h2>' +
      '<div class="nblm-chat-nbmeta">' + sourceCount + ' source' + (sourceCount===1?'':'s') + ' · ' + _nbFormatDate(nb.created_at || new Date().toISOString()) + '</div>' +
      (sourceCount ? '<div class="nblm-chat-suggestions">' +
        '<button class="chat-suggestion" onclick="notesSendChat(\'Summarise these sources in 5 bullets\')">Summarise these sources in 5 bullets</button>' +
        '<button class="chat-suggestion" onclick="notesSendChat(\'What are the most important open questions?\')">What are the most important open questions?</button>' +
        '<button class="chat-suggestion" onclick="notesSendChat(\'Give me 3 next actions with owners and deadlines\')">Give me 3 next actions with owners and deadlines</button>' +
      '</div>' : '<div class="nblm-chat-empty-hint">Add a source to start asking questions</div>') +
    '</div>';
  } else {
    var msgHtml = messages.map(function(m, i){
      var cits = []; if (m.citations_json) { try { cits = JSON.parse(m.citations_json); } catch {} }
      if (m.role === 'user') return '<div class="nblm-msg nblm-msg-user">' + _nEnc(m.content).replace(/\n/g,'<br>') + '</div>';
      return '<div class="nblm-msg nblm-msg-assistant">' + _notesRenderCitationMarkers(m.content, cits) +
        '<div class="nblm-msg-ops"><button class="btn btn-g btn-sm" onclick="notesSaveMessageToNotes(' + i + ')">💾 Save to note</button></div>' +
      '</div>';
    }).join('');
    var streamingBlock = state.notesChatStreaming
      ? '<div class="nblm-msg nblm-msg-assistant"><div id="nb-chat-stream">' + (state.notesChatStreamBuffer ? _notesRenderCitationMarkers(state.notesChatStreamBuffer, state.notesChatCitations) : '<span class="chat-thinking">Thinking</span>') + '</div></div>'
      : '';
    body = '<div class="nblm-chat-scroll" id="nb-chat-scroll">' + msgHtml + streamingBlock + '</div>';
  }

  return '<div class="nblm-pane nblm-pane-chat">' +
    '<div class="nblm-pane-head">' +
      '<span class="nblm-pane-title">Chat</span>' +
      '<div class="nblm-pane-head-actions">' +
        '<button class="nblm-chat-customize" title="Customize chat"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Customize</button>' +
        (messages.length ? '<button class="btn-icon" onclick="notesClearChat()" title="Clear chat">🗑</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="nblm-chat-body">' + body + '</div>' +
    _nblmChatInput(sourceCount) +
  '</div>';
}

function _nblmChatInput(sourceCount) {
  return '<div class="nblm-chat-input-wrap">' +
    '<div class="nblm-chat-input-inner">' +
      '<textarea id="nb-chat-input" placeholder="Start typing…" rows="1"' +
      ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();notesSendChat()}"' +
      ' oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,160)+\'px\'"' +
      (state.notesChatStreaming?' disabled':'') + '></textarea>' +
      '<span class="nblm-chat-source-badge">' + sourceCount + ' source' + (sourceCount===1?'':'s') + '</span>' +
      '<button class="nblm-chat-send" onclick="notesSendChat()"' + (state.notesChatStreaming?' disabled':'') + '>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="nblm-chat-footer">Beanz OS Assistant can be inaccurate; please double check its responses.</div>' +
  '</div>';
}

function _nblmStudioPane(nb, collapsed) {
  if (collapsed) {
    return '<div class="nblm-pane nblm-pane-collapsed">' +
      '<button class="nblm-collapse-btn" onclick="notesToggleStudioPane()" title="Expand studio"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>' +
      '<div class="nblm-pane-vertical-label">STUDIO</div>' +
    '</div>';
  }

  // If a note is being edited, show note editor in Studio pane
  if (state.notesEditor && state.notesEditor.open) return _nblmNoteEditor(nb);

  var notes = (nb.notes || []).slice().sort(function(a,b){return (b.pinned||0)-(a.pinned||0) || b.id-a.id;});
  var artifactCards = '<div class="nblm-studio-grid">' +
    _STUDIO_ARTIFACTS.map(function(a){
      var hasOne = notes.some(function(n){return n.kind==='ai_'+a.kind;});
      var running = state.notesStreamKind === a.kind;
      var cls = 'nblm-studio-card' + (running?' running':'') + (hasOne?' ready':'');
      return '<button class="' + cls + '" onclick="notesGenerateArtifact(\'' + a.kind + '\')"' + (state.notesStreaming?' disabled':'') + '>' +
        '<div class="nblm-studio-icon">' + a.icon + '</div>' +
        '<div class="nblm-studio-label">' + _nEnc(a.label) + '</div>' +
        (hasOne?'<div class="nblm-studio-tick">✓</div>':'') +
      '</button>';
    }).join('') +
  '</div>';

  var streamBlock = state.notesStreaming
    ? '<div class="nblm-stream-card">' +
        '<div class="nblm-stream-head">Generating: ' + _nEnc(state.notesStreamTitle || '') + '</div>' +
        '<div id="nb-stream-body" class="nblm-stream-body">' + _notesRenderCitations(state.notesStreamCitations) + '<div class="nb-note-body notes-md">' + _notesRenderMd(state.notesStreamBuffer || '') + '<span class="chat-cursor">▌</span></div></div>' +
      '</div>'
    : '';

  var notesList = notes.length ? '<div class="nblm-notes-list">' + notes.map(function(n){
    var kindLabel = n.kind === 'user' ? '' : n.kind === 'chat_saved' ? 'Saved · ' : (n.kind.replace(/^ai_/,'').replace(/_/g,' ') + ' · ');
    var ago = _nbFormatAgo(n.updated_at || n.created_at);
    var iconMap = { user: '📝', chat_saved: '💬', ai_audio_overview: '🎧', ai_slide_deck: '📊', ai_video_script: '🎬', ai_mind_map: '🗺️', ai_reports: '📄', ai_flashcards: '🎴', ai_quiz: '❓', ai_infographic: '📈', ai_data_table: '🗂️', ai_summary: '📝', ai_briefing: '📄', ai_faq: '❓', ai_study_guide: '🎓', ai_timeline: '🕰️', ai_concepts: '🧠', ai_actions: '✅' };
    var icon = iconMap[n.kind] || '📝';
    return '<div class="nblm-note-row" onclick="notesOpenNote(' + n.id + ')">' +
      '<div class="nblm-note-row-icon">' + icon + '</div>' +
      '<div class="nblm-note-row-body">' +
        '<div class="nblm-note-row-title">' + _nEnc(n.title || (kindLabel + 'note')) + '</div>' +
        '<div class="nblm-note-row-meta">' + kindLabel + ago + '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>' : '';

  return '<div class="nblm-pane nblm-pane-studio">' +
    '<div class="nblm-pane-head">' +
      '<span class="nblm-pane-title">Studio</span>' +
      '<button class="nblm-collapse-btn" onclick="notesToggleStudioPane()" title="Collapse"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>' +
    '</div>' +
    '<div class="nblm-studio-scroll">' +
      artifactCards +
      streamBlock +
      notesList +
    '</div>' +
    '<button class="nblm-addnote-fab" onclick="notesAddUserNote()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add note</button>' +
  '</div>';
}

function _nblmNoteEditor(nb) {
  var ed = state.notesEditor;
  var isEdit = ed.mode === 'edit';
  return '<div class="nblm-pane nblm-pane-studio nblm-note-editor-pane">' +
    '<div class="nblm-pane-head">' +
      '<div class="nblm-breadcrumb"><span onclick="notesCloseEditor()">Studio</span><span>›</span><span>Note</span></div>' +
      '<button class="btn-icon" onclick="notesDeleteCurrentNote()" title="Delete note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>' +
    '</div>' +
    '<div class="nblm-note-editor-body">' +
      '<input id="nb-editor-title" class="nblm-note-editor-title" placeholder="' + (isEdit?'Note title':'New Note') + '" value="' + _nEnc(ed.title||'') + '" oninput="if(state.notesEditor){state.notesEditor.title=this.value}" />' +
      _nblmEditorToolbar(ed) +
      (ed.preview
        ? '<div class="nblm-note-editor-preview">' + _notesRenderUserMd(ed.contentMd||'', ed.noteId) + '</div>'
        : '<textarea id="nb-editor-body" class="nblm-note-editor-textarea" placeholder="Start writing…" onkeydown="_notesEditorKeydown(event)" oninput="if(state.notesEditor){state.notesEditor.contentMd=this.value}">' + _nEnc(ed.contentMd||'') + '</textarea>') +
    '</div>' +
    '<div class="nblm-note-editor-footer">' +
      '<button class="btn btn-g btn-sm" onclick="notesConvertNoteToSource()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/></svg> Convert to source</button>' +
      '<button class="btn btn-g btn-sm" onclick="notesPromoteToBrain()" title="Save a copy into the Obsidian Brain"><span>🧠</span> Promote to brain</button>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-g btn-sm" onclick="notesCloseEditor()">Cancel</button>' +
      '<button class="btn btn-p btn-sm" onclick="notesSaveEditor()">' + (isEdit?'Save':'Create') + '</button>' +
    '</div>' +
  '</div>';
}

function _nblmEditorToolbar(ed) {
  return '<div class="nblm-editor-toolbar">' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'undo\')" title="Undo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-15-6.7L3 13"/></svg></button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'redo\')" title="Redo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0115-6.7L21 13"/></svg></button>' +
    '<span class="nb-tbar-sep"></span>' +
    '<select class="nb-tbar-sel" onchange="_notesEditorFormat(this.value);this.value=\'normal\'">' +
      '<option value="normal">Normal</option>' +
      '<option value="h1">Heading 1</option>' +
      '<option value="h2">Heading 2</option>' +
      '<option value="h3">Heading 3</option>' +
      '<option value="quote">Quote</option>' +
    '</select>' +
    '<span class="nb-tbar-sep"></span>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'bold\')" title="Bold"><b>B</b></button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'italic\')" title="Italic"><i>I</i></button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'link\')" title="Link"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'ol\')" title="Numbered list">1.</button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'ul\')" title="Bulleted list">•</button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'check\')" title="Checklist">☐</button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'code\')" title="Code">&lt;/&gt;</button>' +
    '<button class="nb-tbar-btn" onclick="_notesEditorFormat(\'clear\')" title="Clear formatting"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 17h-5"/><path d="M5 4v3h14V4"/></svg></button>' +
    '<span class="nb-tbar-spacer"></span>' +
    '<button class="nb-tbar-btn' + (ed.preview?' active':'') + '" onclick="notesToggleEditorPreview()" title="Preview">' + (ed.preview?'✎ Edit':'👁') + '</button>' +
  '</div>';
}

// ── Add sources modal ───────────────────────────────────────
function _nbAddSourcesModal() {
  // Subview-aware: when a source-type is selected, show its inline form instead of the type picker
  var sub = state.notesAddSourcesSubview;
  var body = sub ? _nbAddSourcesSubview(sub) : _nbAddSourcesPicker();
  return '<div class="nblm-modal-bg" onclick="notesCloseAddSourcesModal()">' +
    '<div class="nblm-modal" onclick="event.stopPropagation()">' +
      '<button class="nblm-modal-close" onclick="notesCloseAddSourcesModal()">✕</button>' +
      body +
    '</div>' +
  '</div>';
}

function _nbAddSourcesPicker() {
  return '<div class="nblm-modal-header">' +
      '<h2>Add sources</h2>' +
    '</div>' +
    '<div class="nblm-modal-search">' + _nblmWebSearchBox() + '</div>' +
    '<div class="nblm-dropzone" id="nb-dropzone" ondragover="event.preventDefault();this.classList.add(\'hover\')" ondragleave="this.classList.remove(\'hover\')" ondrop="event.preventDefault();this.classList.remove(\'hover\');_nbHandleDrop(event)">' +
      '<div class="nblm-dropzone-title">or drop your files</div>' +
      '<div class="nblm-dropzone-sub">pdf, docx, xlsx, pptx, csv, md, txt, and more</div>' +
      '<div class="nblm-dropzone-buttons">' +
        '<button class="nblm-dz-btn" onclick="notesAddSource(\'upload\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
          '<span>Upload files</span>' +
        '</button>' +
        '<button class="nblm-dz-btn" onclick="notesAddSource(\'paste_url\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>' +
          '<span>Websites</span>' +
        '</button>' +
        '<button class="nblm-dz-btn" onclick="notesAddSource(\'vault_page\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
          '<span>Obsidian</span>' +
        '</button>' +
        '<button class="nblm-dz-btn" onclick="notesAddSource(\'paste_text\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
          '<span>Copied text</span>' +
        '</button>' +
        '<button class="nblm-dz-btn" onclick="notesAddSource(\'dashboard_snapshot\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>' +
          '<span>Dashboard</span>' +
        '</button>' +
      '</div>' +
    '</div>';
}

function _nbAddSourcesSubview(kind) {
  var backBtn = '<button class="nblm-subview-back" onclick="notesBackToAddSources()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';
  if (kind === 'paste_url') {
    return '<div class="nblm-modal-header">' + backBtn + '<h2>Add a website</h2></div>' +
      '<div class="nblm-subview-body">' +
        '<label class="nblm-subview-label">URL</label>' +
        '<input id="nb-paste-url-input" class="nblm-subview-input" type="url" placeholder="https://example.com/article" onkeydown="if(event.key===\'Enter\'){notesSubmitPasteUrl()}" />' +
        '<div class="nblm-subview-hint">We\'ll fetch the article and chunk it into this notebook.</div>' +
        '<div class="nblm-subview-actions">' +
          '<button class="btn btn-g btn-sm" onclick="notesBackToAddSources()">Cancel</button>' +
          '<button class="btn btn-p btn-sm" onclick="notesSubmitPasteUrl()">Add source</button>' +
        '</div>' +
      '</div>';
  }
  if (kind === 'paste_text') {
    return '<div class="nblm-modal-header">' + backBtn + '<h2>Paste text</h2></div>' +
      '<div class="nblm-subview-body">' +
        '<label class="nblm-subview-label">Title</label>' +
        '<input id="nb-paste-text-title" class="nblm-subview-input" type="text" placeholder="Pasted text" />' +
        '<label class="nblm-subview-label">Content</label>' +
        '<textarea id="nb-paste-text-body" class="nblm-subview-textarea" rows="10" placeholder="Paste your text here…"></textarea>' +
        '<div class="nblm-subview-actions">' +
          '<button class="btn btn-g btn-sm" onclick="notesBackToAddSources()">Cancel</button>' +
          '<button class="btn btn-p btn-sm" onclick="notesSubmitPasteText()">Add source</button>' +
        '</div>' +
      '</div>';
  }
  if (kind === 'vault_page') {
    var results = state.notesVaultResults || [];
    var loading = !!state.notesVaultLoading;
    var selected = state.notesVaultSelected || {};
    var resultsHtml = '';
    if (loading) {
      resultsHtml = '<div class="nblm-subview-loading">Searching vault…</div>';
    } else if (state.notesVaultQuery && !results.length) {
      resultsHtml = '<div class="nblm-subview-empty">No vault pages matched "' + _nEnc(state.notesVaultQuery) + '"</div>';
    } else if (results.length) {
      resultsHtml = '<div class="nblm-vault-results">' + results.slice(0, 20).map(function(r, i){
        return '<label class="nblm-vault-row' + (selected[i] ? ' selected' : '') + '">' +
          '<input type="checkbox"' + (selected[i] ? ' checked' : '') + ' onchange="notesToggleVaultPick(' + i + ')" />' +
          '<div class="nblm-vault-row-body">' +
            '<div class="nblm-vault-row-title">' + _nEnc(r.title) + '</div>' +
            '<div class="nblm-vault-row-meta">' + _nEnc(r.relPath) + '</div>' +
          '</div>' +
        '</label>';
      }).join('') + '</div>';
    }
    var pickCount = Object.keys(selected).filter(function(k){ return selected[k]; }).length;
    return '<div class="nblm-modal-header">' + backBtn + '<h2>Pick from Obsidian vault</h2></div>' +
      '<div class="nblm-subview-body">' +
        '<div class="nblm-subview-searchrow">' +
          '<input id="nb-vault-search-input" class="nblm-subview-input" type="text" placeholder="Search vault pages…" value="' + _nEnc(state.notesVaultQuery || '') + '" onkeydown="if(event.key===\'Enter\'){notesSearchVault()}" />' +
          '<button class="btn btn-p btn-sm" onclick="notesSearchVault()">Search</button>' +
        '</div>' +
        resultsHtml +
        '<div class="nblm-subview-actions">' +
          '<button class="btn btn-g btn-sm" onclick="notesBackToAddSources()">Cancel</button>' +
          '<button class="btn btn-p btn-sm" onclick="notesSubmitVaultPicks()"' + (pickCount ? '' : ' disabled') + '>Add ' + (pickCount ? pickCount + ' source' + (pickCount === 1 ? '' : 's') : 'sources') + '</button>' +
        '</div>' +
      '</div>';
  }
  return '';
}

function _nbHandleDrop(ev) {
  var nbId = state.selectedNotebookId; if (!nbId) return;
  var files = (ev.dataTransfer && ev.dataTransfer.files) || [];
  if (!files.length) return;
  notesCloseAddSourcesModal();
  Array.from(files).forEach(function(file){
    var form = new FormData(); form.append('file', file);
    state.notesUploading = true; renderAll();
    fetch('/api/notebooks/' + encodeURIComponent(nbId) + '/sources', { method: 'POST', body: form })
      .then(r=>r.json()).then(()=> { state.notesUploading = false; notesLoadNotebook(nbId); })
      .catch(()=> { state.notesUploading = false; renderAll(); });
  });
}

// ── Helpers ─────────────────────────────────────────────────
function _nbFormatDate(iso) {
  try { var d = new Date(iso); return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric' }); } catch { return ''; }
}
function _nbFormatAgo(iso) {
  if (!iso) return 'just now';
  try {
    var d = new Date(iso); var diff = Date.now() - d.getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60); if (hr < 24) return hr + 'h ago';
    var day = Math.floor(hr / 24); if (day < 7) return day + 'd ago';
    return d.toLocaleDateString();
  } catch { return ''; }
}

// ── Markdown + citation rendering ───────────────────────────
function _notesRenderMd(text) {
  if (!text) return '';
  var s = _nEnc(text);
  s = s.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
  s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul>$&</ul>');
  s = s.replace(/\n{2,}/g, '</p><p>');
  s = '<p>' + s + '</p>';
  s = s.replace(/<p>(<h[234]>)/g, '$1').replace(/(<\/h[234]>)<\/p>/g, '$1');
  s = s.replace(/<p>(<ul>)/g, '$1').replace(/(<\/ul>)<\/p>/g, '$1');
  s = s.replace(/<p>(<pre>)/g, '$1').replace(/(<\/pre>)<\/p>/g, '$1');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function _notesRenderCitationMarkers(text, citations) {
  if (!text) return '';
  var html = _notesRenderMd(text);
  if (!citations || !citations.length) return html;
  var map = {}; citations.forEach(function(c){ map[c.n] = c; });
  html = html.replace(/\[S(\d+)\]/g, function(m, n){
    var c = map[parseInt(n,10)];
    if (!c) return '<span class="nb-cite nb-cite-invalid">[S' + n + ']</span>';
    var tip = (c.source_title + ' · chunk ' + c.chunk_index + '\n\n' + (c.snippet||'')).replace(/"/g,'&quot;');
    return '<span class="nb-cite" title="' + tip + '">[S' + n + ']</span>';
  });
  return html;
}

function _notesRenderCitations(citations) {
  if (!citations || !citations.length) return '';
  return '<div class="nb-citations-strip"><span class="nb-citations-label">Grounded in ' + citations.length + ' chunks:</span>' +
    citations.slice(0, 8).map(function(c){
      return '<span class="nb-cite-chip" title="' + _nEnc(c.snippet||'').slice(0,300) + '">S' + c.n + '. ' + _nEnc((c.source_title||'').slice(0,30)) + '</span>';
    }).join('') +
    (citations.length > 8 ? '<span class="nb-cite-chip">+' + (citations.length - 8) + '</span>' : '') +
  '</div>';
}

function _notesRenderUserMd(text, noteId) {
  if (!text) return '<p style="color:var(--tx3)">Nothing to preview.</p>';
  var idxCounter = 0;
  var withChecks = text.replace(/^- \[([ xX])\] (.+)$/gm, function(m, st, content) {
    var checked = st.toLowerCase() === 'x';
    var id = 'cb-' + (noteId || 'preview') + '-' + (idxCounter++);
    return '<li class="nb-check"><input type="checkbox" id="' + id + '"' + (checked?' checked':'') + (noteId?' onchange="_notesToggleCheckbox(' + noteId + ',' + (idxCounter-1) + ',this.checked)"':' disabled') + '><label for="' + id + '">' + _nEnc(content) + '</label></li>';
  });
  var placeholder = '@@NB_CHECK_' + Math.random().toString(36).slice(2) + '@@';
  var checkBlocks = [];
  withChecks = withChecks.replace(/(<li class="nb-check">[\s\S]*?<\/li>\n?)+/g, function(m){ checkBlocks.push('<ul class="nb-checklist">' + m + '</ul>'); return placeholder + (checkBlocks.length - 1) + '@'; });
  var html = _notesRenderMd(withChecks);
  html = html.replace(new RegExp(placeholder + '(\\d+)@', 'g'), function(m, n){ return checkBlocks[parseInt(n,10)] || ''; });
  return html;
}

function _notesToggleCheckbox(noteId, checkIndex, newChecked) {
  var nb = state.selectedNotebook; if (!nb) return;
  var note = (nb.notes || []).find(function(n){return n.id === noteId;}); if (!note) return;
  var seen = -1;
  var updated = (note.content_md||'').replace(/^- \[([ xX])\] (.+)$/gm, function(m, st, content) {
    seen++;
    if (seen === checkIndex) return '- [' + (newChecked?'x':' ') + '] ' + content;
    return m;
  });
  note.content_md = updated;
  if (state.notesEditor && state.notesEditor.noteId === noteId) state.notesEditor.contentMd = updated;
  fetch('/api/notebooks/' + encodeURIComponent(state.selectedNotebookId) + '/notes/' + encodeURIComponent(noteId), {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ contentMd: updated })
  }).catch(function(){});
}
