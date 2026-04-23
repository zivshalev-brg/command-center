// Project auto-discovery UI strip — surfaces candidates for accept/reject/merge.

var _projectCandidates = null;
var _projectCandidatesLoading = false;
var _projectCandidatesLoadedAt = 0;

var _integrationsHealth = null;
var _integrationsHealthLoading = false;
var _integrationsHealthLoadedAt = 0;

async function loadIntegrationsHealth(force) {
  if (_integrationsHealthLoading) return;
  if (!force && _integrationsHealth && (Date.now() - _integrationsHealthLoadedAt) < 60000) return;
  _integrationsHealthLoading = true;
  try {
    var resp = await fetch('/api/integrations/health');
    if (resp.ok) {
      _integrationsHealth = await resp.json();
      _integrationsHealthLoadedAt = Date.now();
    }
  } catch (e) {}
  _integrationsHealthLoading = false;
  renderAll();
}

function _pdcRelTime(iso) {
  if (!iso) return 'never';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function _chipState(state) {
  var map = {
    healthy:        { col: 'var(--gn)', dot: '●', lbl: 'live' },
    configured:     { col: 'var(--ac)', dot: '●', lbl: 'ready' },
    empty:          { col: 'var(--or)', dot: '●', lbl: 'empty' },
    error:          { col: 'var(--rd)', dot: '⚠', lbl: 'error' },
    not_configured: { col: 'var(--tx3)', dot: '○', lbl: 'off' }
  };
  return map[state] || map.not_configured;
}

function renderIntegrationsHealthChips() {
  if (_integrationsHealth === null && !_integrationsHealthLoading) {
    loadIntegrationsHealth();
    return '';
  }
  if (!_integrationsHealth) return '';
  var h = _integrationsHealth;

  var chips = [
    { key: 'jira', lbl: 'Jira', state: h.jira.state, meta: h.jira.sprints_count + ' sprints · ' + h.jira.movements_count + ' updates', hint: h.jira.setup_hint, refresh: h.jira.last_refresh_at },
    { key: 'confluence', lbl: 'Confluence', state: h.confluence.state, meta: h.confluence.base_url || '', hint: h.confluence.setup_hint },
    { key: 'slack', lbl: 'Slack', state: h.slack.configured ? 'healthy' : 'not_configured', refresh: h.slack.last_live_at },
    { key: 'outlook', lbl: 'Outlook', state: h.outlook.configured ? 'healthy' : 'not_configured', refresh: h.outlook.last_live_at },
    { key: 'calendar', lbl: 'Calendar', state: h.calendar.configured ? 'healthy' : 'not_configured', refresh: h.calendar.last_live_at },
    { key: 'ingest', lbl: 'Ingestor', state: h.project_ingestor.last_run_at ? 'healthy' : 'empty', refresh: h.project_ingestor.last_run_at }
  ];

  var html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:var(--s1);border-radius:8px;font-size:11px">';
  html += '<span style="color:var(--tx3);font-weight:700;margin-right:4px;display:flex;align-items:center">INTEGRATIONS</span>';
  for (var i = 0; i < chips.length; i++) {
    var c = chips[i];
    var s = _chipState(c.state);
    var tip = c.hint || (c.meta ? (c.lbl + ' · ' + c.meta) : c.lbl);
    if (c.refresh) tip += ' · ' + _pdcRelTime(c.refresh);
    var clickable = c.key === 'jira' ? 'onclick="triggerJiraRefresh()"' : (c.key === 'ingest' ? 'onclick="triggerProjectDiscovery()"' : '');
    html += '<span title="' + _pdcEnc(tip) + '" ' + clickable + ' style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:var(--s2);border-radius:12px;border:1px solid var(--bd);' + (clickable ? 'cursor:pointer;' : '') + '">' +
      '<span style="color:' + s.col + ';font-weight:700">' + s.dot + '</span>' +
      '<span style="color:var(--tx);font-weight:600">' + c.lbl + '</span>' +
      '<span style="color:var(--tx3);font-size:10px">· ' + s.lbl + '</span>' +
    '</span>';
  }
  html += '<button onclick="loadIntegrationsHealth(true)" style="padding:3px 8px;background:transparent;border:1px solid var(--bd);border-radius:12px;color:var(--tx3);cursor:pointer;font-size:10px;margin-left:auto">Refresh</button>';
  html += '</div>';
  return html;
}

async function triggerJiraRefresh() {
  if (typeof toast === 'function') toast('Refreshing Jira snapshot…', 'ok');
  // No explicit refresh endpoint — just reload health (scheduler refreshes on interval)
  await loadIntegrationsHealth(true);
}

async function loadProjectCandidates(force) {
  if (_projectCandidatesLoading) return;
  if (!force && _projectCandidates && (Date.now() - _projectCandidatesLoadedAt) < 120000) return;
  _projectCandidatesLoading = true;
  try {
    var resp = await fetch('/api/projects-candidates?status=pending');
    if (resp.ok) {
      var data = await resp.json();
      _projectCandidates = data.candidates || [];
      _projectCandidatesLoadedAt = Date.now();
    }
  } catch (e) {}
  _projectCandidatesLoading = false;
  renderAll();
}

async function triggerProjectDiscovery() {
  if (typeof toast === 'function') toast('Scanning for candidates…', 'ok');
  try {
    var resp = await fetch('/api/projects-candidates/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (resp.ok) {
      var data = await resp.json();
      if (typeof toast === 'function') toast('Found ' + data.created + ' new candidate' + (data.created === 1 ? '' : 's'), 'ok');
      await loadProjectCandidates(true);
    } else {
      if (typeof toast === 'function') toast('Discovery failed', 'err');
    }
  } catch (e) {
    if (typeof toast === 'function') toast('Discovery error: ' + e.message, 'err');
  }
}

async function acceptCandidate(id) {
  try {
    var resp = await fetch('/api/projects-candidates/' + id + '/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (resp.ok) {
      var data = await resp.json();
      if (typeof toast === 'function') toast('Project created: ' + (data.project && data.project.title), 'ok');
      if (typeof loadProjectsFromDb === 'function') await loadProjectsFromDb();
      if (typeof loadProjectsOverview === 'function') await loadProjectsOverview(true);
      await loadProjectCandidates(true);
    }
  } catch (e) { if (typeof toast === 'function') toast('Accept failed: ' + e.message, 'err'); }
}

async function rejectCandidate(id) {
  // Optimistic: hide card immediately, show undo toast. Only commit after 5s.
  var cand = (_projectCandidates || []).find(function(c){ return c.id === id; });
  if (!cand) return;
  _projectCandidates = _projectCandidates.filter(function(c){ return c.id !== id; });
  renderAll();

  var undone = false;
  var timer = setTimeout(async function() {
    if (undone) return;
    try {
      await fetch('/api/projects-candidates/' + id + '/reject', { method: 'POST' });
    } catch (e) {}
  }, 5000);

  if (typeof showUndoToast === 'function') {
    showUndoToast('Rejected "' + (cand.suggested_title || 'candidate') + '"', function() {
      undone = true;
      clearTimeout(timer);
      _projectCandidates.push(cand);
      _projectCandidates.sort(function(a,b){ return b.confidence - a.confidence; });
      renderAll();
    });
  } else if (typeof toast === 'function') {
    toast('Rejected', 'ok');
  }
}

async function mergeCandidateIntoExisting(id) {
  var items = Object.entries(DATA.projects || {}).map(function(entry) {
    var pid = entry[0], p = entry[1];
    return {
      id: pid,
      title: p.title,
      status: p.status,
      owner: p.owner ? ((DATA.people && DATA.people[p.owner] && DATA.people[p.owner].n) || p.owner) : '—',
      rag: p.rag || 'green',
      colour: p.colour || 'var(--ac)'
    };
  });

  var ragCol = function(rag) { return rag === 'red' ? 'var(--rd)' : rag === 'amber' ? 'var(--or)' : 'var(--gn)'; };

  var chosen = await openChoicePicker({
    title: 'Merge into which project?',
    filterPlaceholder: 'Filter projects…',
    items: items,
    renderItem: function(it) {
      return '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + ragCol(it.rag) + ';flex-shrink:0"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700">' + _pdcEnc(it.title) + '</div>' +
          '<div style="font-size:11px;color:var(--tx3)">' + _pdcEnc(it.status) + ' · ' + _pdcEnc(it.owner) + '</div>' +
        '</div>' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + it.colour + '"></span>' +
      '</div>';
    }
  });
  if (!chosen) return;

  try {
    var resp = await fetch('/api/projects-candidates/' + id + '/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: chosen.id })
    });
    if (resp.ok) {
      if (typeof toast === 'function') toast('Merged into ' + chosen.title, 'ok');
      if (typeof loadProjectsFromDb === 'function') await loadProjectsFromDb();
      await loadProjectCandidates(true);
    } else {
      if (typeof toast === 'function') toast('Merge failed', 'err');
    }
  } catch (e) { if (typeof toast === 'function') toast('Merge error: ' + e.message, 'err'); }
}

function _pdcEnc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// SVG confidence ring — 28px diameter, stroke-based
function _confidenceRing(pct) {
  var r = 10;
  var circumference = 2 * Math.PI * r;
  var offset = circumference * (1 - pct / 100);
  var col = pct >= 80 ? 'var(--gn)' : pct >= 60 ? 'var(--or)' : 'var(--rd)';
  return '<svg width="28" height="28" viewBox="0 0 28 28" style="transform:rotate(-90deg)">' +
    '<circle cx="14" cy="14" r="' + r + '" fill="none" stroke="var(--s3)" stroke-width="3"/>' +
    '<circle cx="14" cy="14" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round"' +
    ' stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
    '<text x="14" y="14" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="var(--tx)" transform="rotate(90 14 14)">' + pct + '</text>' +
    '</svg>';
}

// Source-type chip with color-coded background
function _sourceChip(label, count, colour) {
  return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;background:' + colour + ';color:#fff">' + label + ' ' + count + '</span>';
}

function renderProjectDiscoveryStrip() {
  // Kick off load if needed
  if (_projectCandidates === null && !_projectCandidatesLoading) {
    loadProjectCandidates();
    return '';
  }
  if (!_projectCandidates || !_projectCandidates.length) {
    return '<div style="background:var(--s1);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--tx3)">' +
      '<span style="font-weight:600">\u2728 No pending candidate projects.</span>' +
      '<button onclick="triggerProjectDiscovery()" style="padding:3px 10px;background:transparent;border:1px solid var(--bd);border-radius:12px;color:var(--tx);cursor:pointer;font-size:11px;margin-left:auto">Scan now</button>' +
    '</div>';
  }

  var html = '<div style="background:linear-gradient(135deg,var(--s1),var(--s2));border-radius:10px;padding:12px 14px;margin-bottom:12px;border:1px dashed var(--ac)">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
    '<span style="font-size:12px;font-weight:700;color:var(--ac)">\u2728 SUGGESTED PROJECTS \u00B7 ' + _projectCandidates.length + '</span>' +
    '<span style="font-size:10px;color:var(--tx3)">Detected from clustered thread patterns</span>' +
    '<button onclick="triggerProjectDiscovery()" style="padding:3px 10px;background:transparent;border:1px solid var(--bd);border-radius:12px;color:var(--tx);cursor:pointer;font-size:10px;margin-left:auto">\u21BB Rescan</button>' +
  '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px">';
  for (var i = 0; i < _projectCandidates.length; i++) {
    var c = _projectCandidates[i];
    var conf = c.confidence ? Math.round(c.confidence * 100) : 0;

    // Count sources by type from cluster_signals.thread_ids (rough: prefix match)
    var clusterSig = c.cluster_signals || {};
    var threadIds = clusterSig.thread_ids || [];
    var slackCount = 0, emailCount = 0;
    for (var ti = 0; ti < threadIds.length; ti++) {
      if (String(threadIds[ti]).indexOf('slack-') === 0) slackCount++;
      else if (String(threadIds[ti]).indexOf('email-') === 0) emailCount++;
    }
    var peopleCount = (c.suggested_people || []).length;

    html += '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px">';
    // Header row: title + confidence ring
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;font-weight:700;line-height:1.3">' + _pdcEnc(c.suggested_title) + '</div>' +
        (c.suggested_description ? '<div style="font-size:11px;color:var(--tx2);margin-top:3px;line-height:1.4">' + _pdcEnc(c.suggested_description) + '</div>' : '') +
      '</div>' +
      '<div style="flex-shrink:0">' + _confidenceRing(conf) + '</div>' +
    '</div>';
    // Source chips
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
    if (slackCount) html += _sourceChip('S', slackCount, 'var(--ac)');
    if (emailCount) html += _sourceChip('E', emailCount, 'var(--bl)');
    html += '<span style="font-size:10px;color:var(--tx3);padding:2px 4px">\u00B7 ' + peopleCount + ' people</span>';
    html += '</div>';
    // Tag chips
    if (c.suggested_tags && c.suggested_tags.length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
      for (var j = 0; j < Math.min(4, c.suggested_tags.length); j++) {
        html += '<span style="font-size:9px;background:var(--s3);color:var(--tx);padding:2px 7px;border-radius:8px;font-weight:500">' + _pdcEnc(c.suggested_tags[j]) + '</span>';
      }
      if (c.suggested_tags.length > 4) html += '<span style="font-size:9px;color:var(--tx3);padding:2px">+' + (c.suggested_tags.length - 4) + '</span>';
      html += '</div>';
    }
    // Action bar: primary (Accept) / secondary (Merge) / tertiary link (Reject)
    html += '<div style="display:flex;gap:6px;align-items:center;margin-top:4px">' +
      '<button onclick="acceptCandidate(' + c.id + ')" style="flex:1;padding:7px 10px;background:var(--gn);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">\u2713 Accept</button>' +
      '<button onclick="mergeCandidateIntoExisting(' + c.id + ')" style="padding:7px 10px;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">Merge\u2026</button>' +
      '<button onclick="rejectCandidate(' + c.id + ')" title="Reject (can undo)" style="padding:7px 4px;background:transparent;color:var(--tx3);border:none;cursor:pointer;font-size:11px;text-decoration:underline">Reject</button>' +
    '</div>';

    html += '</div>';
  }
  html += '</div></div>';
  return html;
}

// Inject into the uplifted grid
(function() {
  if (typeof renderProjectsGridUplifted !== 'function') return;
  var _orig = renderProjectsGridUplifted;
  renderProjectsGridUplifted = function() {
    return renderIntegrationsHealthChips() + renderProjectDiscoveryStrip() + _orig();
  };
})();
