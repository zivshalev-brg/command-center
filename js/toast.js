// ===============================================================
// TOAST
// ===============================================================
function toast(msg, type) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type||'ok') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Toast with an undo button. onUndo fires if user clicks Undo within 5s.
function showUndoToast(msg, onUndo, durationMs) {
  const t = $('toast');
  if (!t) return;
  durationMs = durationMs || 5000;
  t.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = msg;
  t.appendChild(label);
  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.style.cssText = 'margin-left:12px;padding:3px 10px;background:var(--ac);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700';
  let dismissed = false;
  btn.onclick = () => {
    if (dismissed) return;
    dismissed = true;
    t.classList.remove('show');
    if (typeof onUndo === 'function') onUndo();
  };
  t.appendChild(btn);
  t.className = 'toast ok show';
  setTimeout(() => { if (!dismissed) t.classList.remove('show'); }, durationMs);
}

function triggerRefresh() {
  const btn = $('refreshBtn');
  btn.classList.add('spinning');
  toast('Run  /refresh-dashboard  in Claude Code to pull live data', 'ok');
  setTimeout(() => {
    btn.classList.remove('spinning');
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 2000);
  }, 3000);
}
