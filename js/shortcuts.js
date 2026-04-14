// ===============================================================
// KEYBOARD SHORTCUTS
// ===============================================================
document.addEventListener('keydown', e => {
  // Ignore if in input/textarea
  if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return;

  if (e.key==='Escape') {
    if ($('paletteBg').classList.contains('show')) { closePalette(); return; }
    if ($('sendModal').classList.contains('show')) { closeModal(); return; }
    if ($('kbModal').classList.contains('show')) { $('kbModal').classList.remove('show'); return; }
    if (state.panelOpen) { closePanel(); return; }
  }
  if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); openPalette(); return; }
  if (e.key==='1') switchModule('summary');
  if (e.key==='2') switchModule('comms');
  if (e.key==='3') switchModule('calendar');
  if (e.key==='4') switchModule('projects');
  if (e.key==='5') switchModule('people');
  if (e.key==='6') switchModule('metrics');
  if (e.key==='7') switchModule('strategy');
  if (e.key==='8') switchModule('news');
  if (e.key==='9') switchModule('technews');
  if (e.key==='0') switchModule('digest');
  // R = reply in comms, refresh elsewhere. Shift+R always refreshes.
  if (e.shiftKey && (e.key==='R')) { triggerRefresh(); return; }
  if ((e.key==='r'||e.key==='R') && state.module !== 'comms') triggerRefresh();
  if (e.key==='b'||e.key==='B') toggleSidebar();
  if (e.key==='?') $('kbModal').classList.add('show');
  if (e.key==='a' && !e.shiftKey && !e.ctrlKey && !e.metaKey && state.module !== 'comms') { showActionsPanel(); return; }
  if (e.key==='D' && e.shiftKey) { showDecisionsPanel(); return; }

  // ── Comms-specific shortcuts ──
  if (state.module === 'comms') {
    // Triage (only with selected thread)
    if (state.selectedThread) {
      if (e.key==='e'||e.key==='E') { e.preventDefault(); markThreadDone(state.selectedThread); return; }
      if (e.key==='r') { e.preventDefault(); focusQuickReply(); return; }
      if (e.key==='s') { e.preventDefault(); toggleSnoozePicker(state.selectedThread); return; }
      if (e.key==='p') { e.preventDefault(); togglePin(state.selectedThread); return; }
      if (e.key==='x'||e.key==='X') { e.preventDefault(); toggleReadStatus(state.selectedThread); return; }
    }
    // Global comms shortcuts
    if (e.key==='f') { e.preventDefault(); setState('commsFocus', state.commsFocus === 'focused' ? 'other' : 'focused'); return; }
    if (e.key==='d') { e.preventDefault(); setState('commsDensity', state.commsDensity === 'comfortable' ? 'compact' : 'comfortable'); return; }
    if (e.key==='/') {
      e.preventDefault();
      const searchEl = document.querySelector('.comms-list-search');
      if (searchEl) searchEl.focus();
      return;
    }
    if (e.key==='Enter' && !state.selectedThread) {
      const ids = getVisibleThreadIds();
      if (ids.length) selectThread(ids[0]);
      return;
    }
    // Escape clears snooze picker first
    if (e.key==='Escape' && state.commsSnoozePickerOpen) {
      state.commsSnoozePickerOpen = null; renderAll(); return;
    }
  }

  // j/k navigation — uses smart sorted visible thread list
  if (e.key==='j'||e.key==='k') {
    if (state.module==='comms') {
      const ids = getVisibleThreadIds();
      if (!ids.length) return;
      const idx = ids.indexOf(state.selectedThread);
      if (e.key==='j') selectThread(ids[Math.min(idx+1, ids.length-1)] || ids[0]);
      if (e.key==='k' && idx>0) selectThread(ids[idx-1]);
    }
  }
});
