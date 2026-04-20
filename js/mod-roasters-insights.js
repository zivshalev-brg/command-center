// ===============================================================
// ROASTERS INSIGHTS MODULE — iframe embed of Next.js app at :3000
// ===============================================================

var _riStatus = null; // { backend: boolean, frontend: boolean, port: number, checkedAt }

var RI_FRONTEND_URL = 'http://localhost:3005';
var RI_BACKEND_URL = 'http://localhost:8000';

// The Roasters Insights app ships with its own sidebar/navigation, so we don't
// duplicate the route list here — just load the homepage and let the app navigate.

// ── Status check (both backend + frontend) ───────────────────
function riCheckStatus() {
  var now = Date.now();
  if (_riStatus && _riStatus.checkedAt && (now - _riStatus.checkedAt) < 10000) return Promise.resolve(_riStatus);

  // Backend: hit a real endpoint that returns data
  var backendCheck = fetch(RI_BACKEND_URL + '/api/overview', { mode: 'cors' })
    .then(function(r) { return r.ok; }).catch(function() { return false; });
  // Frontend: use the server-side ping which scans ports and verifies it's the right app
  var frontendCheck = fetch('/api/roasters-insights/ping')
    .then(function(r) { return r.json(); })
    .then(function(j) { return j && j.ok ? j : null; })
    .catch(function() { return null; });

  return Promise.all([backendCheck, frontendCheck]).then(function(res) {
    var f = res[1];
    if (f && f.url) RI_FRONTEND_URL = f.url;
    _riStatus = { backend: res[0], frontend: !!f, port: f ? f.port : null, checkedAt: now };
    return _riStatus;
  });
}

// ── Sidebar ──────────────────────────────────────────────────
// Minimal sidebar — just status and controls. The Roasters Insights app
// has its own in-iframe navigation so we don't duplicate it.
function renderRoastersInsightsSidebar() {
  var sb = $('sidebar');

  sb.innerHTML = '<div class="ca-sb">' +
    '<div class="ca-sb-date"><div class="ca-sb-date-label">Status</div>' +
      '<div class="ca-sb-date-val" style="font-size:var(--f-md);line-height:1.7">' +
        '<div><span id="riBackendDot" style="color:var(--tx3)">&#9679;</span> <span id="riBackendLabel">Backend</span></div>' +
        '<div><span id="riFrontendDot" style="color:var(--tx3)">&#9679;</span> <span id="riFrontendLabel">Frontend</span></div>' +
      '</div></div>' +
    '<div class="ca-sb-date" style="margin-top:var(--sp2)"><div class="ca-sb-date-label">Source</div>' +
      '<div class="ca-sb-date-val" style="font-size:var(--f-md);color:var(--tx2)">Roasters Insights<br/>87+ roasters &middot; US/UK/AU/DE</div></div>' +
    '<div style="margin-top:auto;padding-top:var(--sp3);display:flex;flex-direction:column;gap:6px">' +
      '<button class="ca-sb-refresh" onclick="_riOpenExternal()">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        ' Open in New Tab</button>' +
      '<button class="ca-sb-refresh" onclick="_riRestart()">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/></svg>' +
        ' Reload</button>' +
    '</div>' +
  '</div>';

  riCheckStatus().then(function(s) {
    var bd = document.getElementById('riBackendDot');
    var fd = document.getElementById('riFrontendDot');
    var bl = document.getElementById('riBackendLabel');
    var fl = document.getElementById('riFrontendLabel');
    if (bd) bd.style.color = s.backend ? 'var(--gn)' : 'var(--rd)';
    if (fd) fd.style.color = s.frontend ? 'var(--gn)' : 'var(--rd)';
    if (bl) bl.textContent = 'Backend (:8000)';
    if (fl) fl.textContent = s.port ? ('Frontend (:' + s.port + ')') : 'Frontend';
  });
}

// ── Main ─────────────────────────────────────────────────────
function renderRoastersInsightsMain() {
  var el = $('main');
  var src = RI_FRONTEND_URL + '/';

  // Strip padding so the iframe is edge-to-edge; restore on teardown via state dispatch.
  el.style.padding = '0';
  el.style.gap = '0';

  el.innerHTML =
    '<div id="riFallback" style="display:none;padding:var(--sp4)">' +
      '<div class="ca-narrative" style="border-left-color:var(--or);background:var(--orbg)">' +
        '<div class="ca-narrative-label" style="color:var(--or)">Roasters Insights not running</div>' +
        '<p>Start the app with:</p>' +
        '<pre style="background:var(--s2);padding:var(--sp3);border-radius:var(--r2);font-size:12px;overflow-x:auto">' +
'# Backend (FastAPI on :8000)\n' +
'cd "C:/Users/Ziv.Shalev/.claude/roasters-insights-export/backend"\n' +
'python -m uvicorn src.main:app --port 8000 --reload\n' +
'\n' +
'# Frontend (Next.js on :3005)\n' +
'cd "C:/Users/Ziv.Shalev/.claude/roasters-insights-export/frontend"\n' +
'PORT=3005 npm run dev' +
'</pre>' +
        '<p style="margin-top:var(--sp3)">Once both are running, click <b>Reload</b> in the sidebar.</p>' +
      '</div>' +
    '</div>' +
    '<iframe id="riFrame" src="' + src + '" ' +
      'style="flex:1;width:100%;border:none;background:var(--bg);display:block;min-height:0"></iframe>';

  setTimeout(function() {
    riCheckStatus().then(function(s) {
      if (!s.frontend) {
        var fb = document.getElementById('riFallback');
        var frame = document.getElementById('riFrame');
        if (fb) fb.style.display = 'block';
        if (frame) frame.style.display = 'none';
      } else if (s.url && document.getElementById('riFrame').src.indexOf(s.url) !== 0) {
        // Auto-detected a different port — swap iframe to it
        document.getElementById('riFrame').src = s.url;
      }
    });
  }, 800);
}

// ── Actions ──────────────────────────────────────────────────
function _riOpenExternal() {
  window.open(RI_FRONTEND_URL + '/', '_blank');
}

function _riRestart() {
  _riStatus = null;
  renderAll();
  if (typeof showToast === 'function') showToast('Re-checking Roasters Insights status...');
}

