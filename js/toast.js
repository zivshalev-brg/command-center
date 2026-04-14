// ===============================================================
// TOAST
// ===============================================================
function toast(msg, type) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type||'ok') + ' show';
  setTimeout(() => t.classList.remove('show'), 3000);
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
