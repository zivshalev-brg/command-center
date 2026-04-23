// Uplifted portfolio grid — live health, RAG, momentum, 24h signals.
// Replaces the legacy _renderProjectsGrid via wrapper in renderProjectsMain.

function _pgEnc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _pgRagBadge(rag) {
  var map = { green: '#34c759', amber: '#ff9500', red: '#ff3b30' };
  var c = map[rag] || map.green;
  return '<span style="background:' + c + ';color:#fff;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase">' + (rag || 'green') + '</span>';
}

function _pgHealthDot(score) {
  if (score == null) return '<span style="width:10px;height:10px;border-radius:50%;background:var(--tx3);display:inline-block"></span>';
  var col = score >= 80 ? 'var(--gn)' : score >= 60 ? 'var(--or)' : score >= 40 ? '#e67e22' : 'var(--rd)';
  return '<span style="width:10px;height:10px;border-radius:50%;background:' + col + ';display:inline-block"></span>';
}

function _pgSourceBadge(p) {
  var src = p.source || 'manual';
  if (src === 'auto_discovered') {
    var conf = p.auto_discovery_confidence ? Math.round(p.auto_discovery_confidence * 100) : null;
    return '<span class="source-badge source-badge-auto" title="Auto-discovered from clustered threads">AUTO' + (conf != null ? ' · ' + conf + '%' : '') + '</span>';
  }
  if (src === 'seed') return '<span class="source-badge source-badge-seed" title="Seeded demo data">SEED</span>';
  return '<span class="source-badge source-badge-manual" title="Manually created">MANUAL</span>';
}

function _pgArchivedBadge(p) {
  if (!p.archived_at) return '';
  var relTime = _pgRelTime(p.archived_at);
  return '<span class="archived-badge" title="Archived ' + relTime + '">ARCHIVED · ' + relTime + '</span>';
}

function _pgMomentumArrow(delta) {
  if (delta == null || delta === 0) return '→';
  if (delta > 0.2) return '<span style="color:var(--gn)">↑↑</span>';
  if (delta > 0) return '<span style="color:var(--gn)">↑</span>';
  if (delta < -0.2) return '<span style="color:var(--rd)">↓↓</span>';
  return '<span style="color:var(--or)">↓</span>';
}

function _pgRelTime(iso) {
  if (!iso) return '—';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function renderProjectsViewToggle() {
  var view = (typeof state !== 'undefined' && state.projectsView) || 'active';
  var archivedCount = _archivedProjects ? Object.keys(_archivedProjects).length : 0;
  return '<div class="projects-view-toggle">' +
    '<button class="' + (view === 'active' ? 'active' : '') + '" onclick="setProjectsView(\'active\')">Active</button>' +
    '<button class="' + (view === 'archived' ? 'active' : '') + '" onclick="setProjectsView(\'archived\')">Archived' + (archivedCount ? ' · ' + archivedCount : '') + '</button>' +
  '</div>';
}

function setProjectsView(view) {
  if (typeof state === 'undefined') return;
  state.projectsView = view;
  state.selectedProject = null;
  if (typeof renderAll === 'function') renderAll();
}

function renderProjectsGridUplifted() {
  var view = (typeof state !== 'undefined' && state.projectsView) || 'active';
  var isArchived = view === 'archived';

  var projects = isArchived
    ? Object.values(_archivedProjects || {})
    : Object.values(DATA.projects || {});

  // Ensure overview data loaded (async); legacy intel flag also kicks in for compat
  if (!isArchived && !_projectsOverviewCache && !_projectsOverviewLoadedAt) {
    if (typeof loadProjectsOverview === 'function') loadProjectsOverview();
  }

  // Sort: urgent/critical first, then by priority desc (or archived_at desc for archived)
  if (isArchived) {
    projects.sort(function(a, b) {
      return (new Date(b.archived_at || 0).getTime()) - (new Date(a.archived_at || 0).getTime());
    });
  } else {
    projects.sort(function(a, b) {
      var aU = (a._overview && a._overview.urgent_actions) || 0;
      var bU = (b._overview && b._overview.urgent_actions) || 0;
      if (aU !== bU) return bU - aU;
      var aC = (a._overview && a._overview.critical_blockers) || 0;
      var bC = (b._overview && b._overview.critical_blockers) || 0;
      if (aC !== bC) return bC - aC;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  // Portfolio summary bar
  var totalUrgent = 0, totalBlockers = 0, totalSignals24h = 0, redCount = 0, amberCount = 0, greenCount = 0;
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    var o = p._overview || {};
    totalUrgent += (o.urgent_actions || 0);
    totalBlockers += (o.open_blockers || 0);
    var sc = o.sources_24h || {};
    totalSignals24h += (sc.slack || 0) + (sc.email || 0) + (sc.jira || 0) + (sc.confluence || 0) + (sc.calendar || 0);
    var rag = (o.latest_update && o.latest_update.rag_suggested) || p.rag || 'green';
    if (rag === 'red') redCount++;
    else if (rag === 'amber') amberCount++;
    else greenCount++;
  }

  var html = '';
  // Segmented control
  html += renderProjectsViewToggle();

  // Archived view: simplified layout, no portfolio tiles
  if (isArchived) {
    if (!projects.length) {
      return html + '<div style="text-align:center;padding:40px;color:var(--tx3);background:var(--s1);border-radius:10px">No archived projects. Archive one from the Active tab to see it here.</div>';
    }
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">';
    for (var ai = 0; ai < projects.length; ai++) {
      var ap = projects[ai];
      html += _renderArchivedCard(ap);
    }
    html += '</div>';
    return html;
  }

  // Portfolio header strip
  html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px">';
  var tiles = [
    { lbl: 'Active', val: projects.length, col: 'var(--ac)' },
    { lbl: 'Green', val: greenCount, col: 'var(--gn)' },
    { lbl: 'Amber', val: amberCount, col: 'var(--or)' },
    { lbl: 'Red', val: redCount, col: 'var(--rd)' },
    { lbl: 'Blockers', val: totalBlockers, col: 'var(--rd)' },
    { lbl: 'Signals 24h', val: totalSignals24h, col: 'var(--pu)' }
  ];
  for (var i = 0; i < tiles.length; i++) {
    var t = tiles[i];
    html += '<div style="background:var(--s1);padding:10px 12px;border-radius:8px;border-left:3px solid ' + t.col + '">' +
      '<div style="font-size:20px;font-weight:700;color:' + t.col + '">' + t.val + '</div>' +
      '<div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:0.5px">' + t.lbl + '</div>' +
    '</div>';
  }
  html += '</div>';

  // Grid of cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">';

  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    var o = p._overview || {};
    var latest = o.latest_update || null;
    var rag = (latest && latest.rag_suggested) || p.rag || 'green';
    var healthScore = latest ? latest.health_score : null;
    var momentum = latest ? latest.momentum_delta : null;
    var sc = o.sources_24h || {};
    var totalSignals = (sc.slack || 0) + (sc.email || 0) + (sc.jira || 0) + (sc.confluence || 0) + (sc.calendar || 0);
    var ownerName = p.owner ? ((DATA.people && DATA.people[p.owner] && DATA.people[p.owner].n) || p.owner) : '—';
    var ragBorder = rag === 'red' ? '#ff3b30' : rag === 'amber' ? '#ff9500' : 'var(--bd)';

    html += '<div class="proj-card-v2" onclick="selectProject(\'' + p.id + '\')" style="background:var(--s1);border:1px solid var(--bd);border-left:4px solid ' + ragBorder + ';border-radius:10px;padding:14px;cursor:pointer;transition:transform 0.1s,box-shadow 0.1s" onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.2)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">';

    // Header row
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
      _pgHealthDot(healthScore) +
      '<span style="font-size:14px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pgEnc(p.title) + '</span>' +
      _pgSourceBadge(p) +
      _pgRagBadge(rag) +
    '</div>';

    // Status + owner
    html += '<div style="display:flex;gap:8px;font-size:11px;color:var(--tx3);margin-bottom:8px">' +
      '<span>' + _pgEnc(p.status) + '</span>' +
      '<span>·</span>' +
      '<span>' + _pgEnc(ownerName) + '</span>';
    if (healthScore != null) html += '<span style="margin-left:auto;font-weight:700;color:' + (healthScore >= 70 ? 'var(--gn)' : healthScore >= 50 ? 'var(--or)' : 'var(--rd)') + '">H' + Math.round(healthScore) + ' ' + _pgMomentumArrow(momentum) + '</span>';
    html += '</div>';

    // Progress bar
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">' +
      '<div style="flex:1;height:4px;background:var(--s2);border-radius:2px;overflow:hidden"><div style="width:' + (p.progress || 0) + '%;height:100%;background:' + (p.colour || 'var(--ac)') + '"></div></div>' +
      '<span style="font-size:10px;color:var(--tx3);min-width:30px;text-align:right">' + (p.progress || 0) + '%</span>' +
    '</div>';

    // Hero summary from latest update
    if (latest && latest.summary) {
      html += '<div style="font-size:12px;line-height:1.4;color:var(--tx2);margin-bottom:10px;max-height:60px;overflow:hidden;position:relative">' + _pgEnc(latest.summary.slice(0, 180)) + (latest.summary.length > 180 ? '…' : '') + '</div>';
    } else if (p.desc || p.description) {
      html += '<div style="font-size:12px;line-height:1.4;color:var(--tx3);margin-bottom:10px;max-height:60px;overflow:hidden">' + _pgEnc((p.desc || p.description).slice(0, 140)) + '</div>';
    }

    // Meta grid
    var milestoneDone = (p.milestones || []).filter(function(m){ return (m.s || m.state) === 'done'; }).length;
    var milestoneTotal = (p.milestones || []).length;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;padding-top:10px;border-top:1px solid var(--bd)">' +
      '<div style="color:var(--tx3)"><span style="color:var(--tx2);font-weight:600">' + milestoneDone + '/' + milestoneTotal + '</span> milestones</div>' +
      '<div style="color:var(--tx3);text-align:right">' + (o.open_actions || 0) + ' open action' + ((o.open_actions === 1) ? '' : 's') + '</div>';

    if (o.open_blockers) html += '<div style="color:var(--rd)">⚠ ' + o.open_blockers + ' blocker' + (o.open_blockers === 1 ? '' : 's') + (o.critical_blockers ? ' (' + o.critical_blockers + ' crit)' : '') + '</div>';
    else html += '<div style="color:var(--gn)">no blockers</div>';

    html += '<div style="color:var(--tx3);text-align:right">' + totalSignals + ' signal' + (totalSignals === 1 ? '' : 's') + ' 24h</div>';

    html += '</div>';

    // Signals breakdown (compact) — 24h + KB backfill totals
    if (totalSignals > 0 || (p.backfill_counts && Object.keys(p.backfill_counts).length)) {
      html += '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">';
      var sources = [['slack', 'S', 'var(--ac)'], ['email', 'E', 'var(--bl)'], ['jira', 'J', 'var(--pu)'], ['confluence', 'W', 'var(--gn)'], ['calendar', 'C', 'var(--or)']];
      for (var j = 0; j < sources.length; j++) {
        var srcKey = sources[j][0], lbl = sources[j][1], col = sources[j][2];
        if (sc[srcKey]) html += '<span title="24h signal" style="font-size:9px;background:' + col + ';color:#fff;padding:1px 5px;border-radius:3px;font-weight:700">' + lbl + ' ' + sc[srcKey] + '</span>';
      }
      // KB context chip (shows backfill happened)
      if (p.backfill_counts && typeof p.backfill_counts === 'object') {
        var bc = p.backfill_counts;
        var kbTotal = (bc.slack || 0) + (bc.email || 0) + (bc.jira || 0) + (bc.confluence || 0) + (bc.calendar || 0) + (bc.kb || 0);
        if (kbTotal > 0) html += '<span title="KB context backfill: ' + kbTotal + ' sources" style="font-size:9px;background:transparent;color:var(--tx3);padding:1px 5px;border:1px solid var(--bd);border-radius:3px;font-weight:600">\u2605 ' + kbTotal + '</span>';
      }
      // Backfill-running indicator
      if (p.backfill_state === 'running') {
        html += '<span title="Backfilling context…" style="font-size:9px;background:var(--or);color:#fff;padding:1px 5px;border-radius:3px;font-weight:700">\u23F3 Ingesting</span>';
      }
      html += '</div>';
    }

    // Last update
    if (latest) {
      html += '<div style="font-size:10px;color:var(--tx3);margin-top:8px">Update: ' + _pgRelTime(latest.date) + '</div>';
    } else {
      html += '<div style="font-size:10px;color:var(--tx3);margin-top:8px">No update yet</div>';
    }

    html += '</div>'; // card
  }

  html += '</div>'; // grid

  return html;
}

function _renderArchivedCard(p) {
  var ownerName = p.owner ? ((DATA.people && DATA.people[p.owner] && DATA.people[p.owner].n) || p.owner) : '—';
  var rag = p.rag || 'green';
  var ragBorder = rag === 'red' ? '#ff3b30' : rag === 'amber' ? '#ff9500' : 'var(--bd)';
  var html = '<div class="proj-card-v2 proj-card-archived" style="background:var(--s1);border:1px solid var(--bd);border-left:4px solid ' + ragBorder + ';border-radius:10px;padding:14px;transition:opacity 0.15s">';
  // Header
  html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
    '<span style="font-size:14px;font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pgEnc(p.title) + '</span>' +
    _pgSourceBadge(p) +
    _pgArchivedBadge(p) +
  '</div>';
  // Meta
  html += '<div style="display:flex;gap:8px;font-size:11px;color:var(--tx3);margin-bottom:8px">' +
    '<span>' + _pgEnc(p.status) + '</span>' +
    '<span>·</span>' +
    '<span>' + _pgEnc(ownerName) + '</span>' +
    (p.archived_at ? '<span style="margin-left:auto">Archived ' + _pgRelTime(p.archived_at) + '</span>' : '') +
  '</div>';
  // Description
  if (p.desc || p.description) {
    html += '<div style="font-size:12px;line-height:1.4;color:var(--tx3);margin-bottom:10px;max-height:60px;overflow:hidden">' + _pgEnc((p.desc || p.description).slice(0, 140)) + '</div>';
  }
  // Actions: Unarchive (primary) + View
  html += '<div style="display:flex;gap:6px;margin-top:8px;padding-top:10px;border-top:1px solid var(--bd)">' +
    '<button onclick="unarchiveProjectFromCard(\'' + p.id + '\')" style="flex:1;padding:6px 10px;background:var(--ac);color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700">\u2190 Unarchive</button>' +
    '<button onclick="selectProject(\'' + p.id + '\')" style="padding:6px 12px;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:5px;cursor:pointer;font-size:11px">View</button>' +
  '</div>';
  html += '</div>';
  return html;
}

async function unarchiveProjectFromCard(id) {
  try {
    await apiUnarchiveProject(id);
    if (typeof toast === 'function') toast('Unarchived', 'ok');
    if (typeof renderAll === 'function') renderAll();
  } catch (e) {
    if (typeof toast === 'function') toast('Unarchive failed: ' + e.message, 'err');
  }
}

// ─── Wire into render dispatch ──────────────────────────────────
// Override renderProjectsMain: if no project selected, render the new grid.
(function() {
  if (typeof renderProjectsMain !== 'function') return;
  var _prev = renderProjectsMain;
  renderProjectsMain = function() {
    var panelEl = document.getElementById('jira-detail-panel');
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.id = 'jira-detail-panel';
      document.body.appendChild(panelEl);
    }
    if (typeof _renderJiraDetailPanel === 'function') {
      panelEl.innerHTML = state._jiraDetailKey ? _renderJiraDetailPanel() : '';
    }

    var el = $('main');
    if (state.selectedProject && DATA.projects[state.selectedProject]) {
      el.innerHTML = renderProjectDetailUplifted(state.selectedProject);
    } else {
      el.innerHTML = renderProjectsGridUplifted();
    }
  };
})();
