// ===============================================================
// PROJECTS MODULE — AI-Powered Project Intelligence Hub
// ===============================================================

// Project-to-classifier tag mapping (mirrors server-side PROJECT_DATA_MAP)
var PROJECT_DATA_MAP = {
  feral: { classifierTags: ['Project Feral', 'Cancellation Flow', 'Collections', 'Onboarding', 'Email Lifecycle'] },
  mice: { classifierTags: ['MICE'] },
  woc: { classifierTags: ['WOC'] },
  marax3: { classifierTags: ['MaraX3', 'Platinum Roasters'] },
  'brand-summit': { classifierTags: ['Brand Summit'] },
  'machine-integration': { classifierTags: ['Machine Integration', 'Beanz on Breville'] },
  'power-bi-pl': { classifierTags: [] }
};

// Jira/Confluence enrichment data
let _projectEnrichment = null;
let _projectEnrichmentLoading = false;

// Project intelligence data
let _projectIntelOverview = null;
let _projectIntelOverviewLoading = false;
let _projectIntelOverviewAt = 0;
let _projectIntelJira = null; // global Jira activity across all projects
let _projectIntelDetail = {};
let _projectIntelDetailLoading = {};

async function loadProjectEnrichment() {
  if (_projectEnrichment || _projectEnrichmentLoading) return;
  _projectEnrichmentLoading = true;
  try {
    const resp = await fetch('/api/projects/enriched');
    if (resp.ok) {
      _projectEnrichment = await resp.json();
      renderAll();
    }
  } catch {}
  _projectEnrichmentLoading = false;
}

async function loadProjectIntelOverview() {
  if (_projectIntelOverviewLoading) return;
  if (_projectIntelOverview && Date.now() - _projectIntelOverviewAt < 60000) return;
  _projectIntelOverviewLoading = true;
  try {
    var resp = await fetch('/api/projects/intelligence');
    if (resp.ok) {
      var data = await resp.json();
      _projectIntelOverview = data.projects || {};
      _projectIntelOverviewAt = Date.now();
      renderAll();
    }
  } catch (e) {
    console.error('[Projects] Intel load failed:', e);
  }
  _projectIntelOverviewLoading = false;
  // Load Jira separately (async, doesn't block overview)
  if (!_projectIntelJira) loadProjectJiraOverview();
}

var _projectJiraLoading = false;
async function loadProjectJiraOverview() {
  if (_projectJiraLoading || _projectIntelJira) return;
  _projectJiraLoading = true;
  try {
    var resp = await fetch('/api/projects/intelligence/jira');
    if (resp.ok) {
      _projectIntelJira = await resp.json();
      renderAll();
    }
  } catch (e) {
    console.error('[Projects] Jira load failed:', e);
  }
  _projectJiraLoading = false;
}

async function loadProjectIntelDetail(projectId, synthesize) {
  if (_projectIntelDetailLoading[projectId]) return;
  _projectIntelDetailLoading[projectId] = true;
  renderAll();
  try {
    var url = '/api/projects/intelligence/' + projectId;
    if (synthesize) url += '?synthesize=1';
    var resp = await fetch(url);
    if (resp.ok) {
      _projectIntelDetail[projectId] = await resp.json();
    }
  } catch {}
  _projectIntelDetailLoading[projectId] = false;
  renderAll();
}

// ─── Helpers ─────────────────────────────────────────────────

function _pEnc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _pRelTime(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(iso).toLocaleDateString('en-AU', {month:'short', day:'numeric'});
}

function _pHealthColor(score) {
  if (score === null || score === undefined) return 'var(--tx3)';
  if (score >= 80) return 'var(--gn)';
  if (score >= 60) return 'var(--or)';
  if (score >= 40) return '#e67e22';
  return 'var(--rd)';
}

function _pHealthLabel(score) {
  if (score === null || score === undefined) return 'Unknown';
  if (score >= 80) return 'On Track';
  if (score >= 60) return 'Needs Attention';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

function _pSourceIcon(source) {
  if (source === 'slack') return '<span style="color:var(--ac);font-weight:700;font-size:10px">S</span>';
  if (source === 'email') return '<span style="color:var(--bl);font-weight:700;font-size:10px">E</span>';
  return '<span style="color:var(--tx3);font-weight:700;font-size:10px">?</span>';
}

function _renderJiraRow(i, showPriority) {
  var sc = i.statusCategory === 'done' ? 'gn' : i.statusCategory === 'indeterminate' ? 'bl' : 'tx3';
  var h = '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center;font-size:12px">';
  if (showPriority) {
    var pc = i.priority === 'Highest' ? 'var(--rd)' : i.priority === 'High' ? 'var(--or)' : 'var(--tx3)';
    h += '<span style="color:' + pc + ';font-size:10px;min-width:14px">' + (i.flagged ? '⚑' : '●') + '</span>';
  }
  h += '<a href="#" onclick="openJiraDetail(\'' + _pEnc(i.key) + '\');return false" style="font-size:10px;font-weight:600;color:var(--ac);min-width:90px">' + _pEnc(i.key) + '</a>';
  h += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--s2);color:var(--tx3);min-width:40px;text-align:center">' + _pEnc(i.type) + '</span>';
  h += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="openJiraDetail(\'' + _pEnc(i.key) + '\')">' + _pEnc(i.summary) + '</span>';
  if (i.storyPoints) h += '<span style="font-size:10px;color:var(--pu);min-width:20px;text-align:center">' + i.storyPoints + 'sp</span>';
  if (i.parent) h += '<span style="font-size:9px;color:var(--tx3);cursor:pointer" onclick="openJiraDetail(\'' + _pEnc(i.parent.key) + '\')">' + _pEnc(i.parent.key) + '</span>';
  h += '<span class="tag" style="font-size:9px;color:var(--' + sc + ')">' + _pEnc(i.status) + '</span>';
  h += '<span style="font-size:10px;color:var(--tx3);min-width:80px;text-align:right">' + _pEnc(i.assignee) + '</span>';
  h += '<span style="font-size:10px;color:var(--tx3)">' + _pRelTime(i.updated) + '</span>';
  h += '</div>';
  return h;
}

function _pSentimentDot(s) {
  if (s === 'positive') return '<span style="color:var(--gn)" title="positive">●</span>';
  if (s === 'negative' || s === 'urgent') return '<span style="color:var(--rd)" title="' + s + '">●</span>';
  return '<span style="color:var(--tx3)" title="neutral">●</span>';
}

// ─── Sidebar ─────────────────────────────────────────────────

function renderProjectsSidebar() {
  var sb = $('sidebar');
  var html = '<div class="sb-section">';
  html += '<div class="sb-section-title" style="display:flex;align-items:center;justify-content:space-between;padding-right:4px">' +
    '<span>Workstreams</span>' +
    '<button onclick="openCreateProjectModal()" title="New project (Ctrl+Shift+P)" ' +
    'style="padding:2px 8px;background:var(--ac);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:700">+ New</button>' +
  '</div>';

  // Sort by activity if intel available
  var projectIds = Object.keys(DATA.projects);
  if (_projectIntelOverview) {
    projectIds.sort(function(a, b) {
      var ia = _projectIntelOverview[a] || {};
      var ib = _projectIntelOverview[b] || {};
      return (ib.actionRequired || 0) - (ia.actionRequired || 0) || (ib.commsThisWeek || 0) - (ia.commsThisWeek || 0);
    });
  }

  for (var i = 0; i < projectIds.length; i++) {
    var id = projectIds[i];
    var proj = DATA.projects[id];
    var act = state.selectedProject === id ? ' act' : '';
    var intel = _projectIntelOverview ? (_projectIntelOverview[id] || {}) : {};

    // Activity badges
    var badges = '';
    if (intel.actionRequired > 0) {
      badges += '<span class="nb" style="background:var(--rd)">' + intel.actionRequired + '</span>';
    } else if (proj.blockers && proj.blockers.length) {
      badges += '<span class="nb">' + proj.blockers.length + '</span>';
    }
    if (intel.commsThisWeek > 0) {
      badges += '<span style="font-size:9px;color:var(--tx3);margin-left:4px">' + intel.commsThisWeek + '</span>';
    }

    // Health dot
    var healthDot = '';
    if (intel.healthScore !== null && intel.healthScore !== undefined) {
      healthDot = '<span style="width:6px;height:6px;border-radius:50%;background:' + _pHealthColor(intel.healthScore) + ';display:inline-block;margin-right:4px"></span>';
    }

    html += '<div class="nav-i' + act + '" onclick="selectProject(\'' + id + '\')">' +
      healthDot +
      '<span class="dot" style="background:' + proj.colour + '"></span>' +
      '<span class="sb-label">' + _pEnc(proj.title) + '</span>' +
      badges + '</div>';
  }
  html += '</div>';

  // Load intelligence overview if not loaded
  if (!_projectIntelOverview && !_projectIntelOverviewLoading) {
    loadProjectIntelOverview();
  }

  sb.innerHTML = html;
}

// ─── Main View ───────────────────────────────────────────────

function renderProjectsMain() {
  var el = $('main');

  // Jira detail panel overlay
  var panelEl = document.getElementById('jira-detail-panel');
  if (!panelEl) {
    panelEl = document.createElement('div');
    panelEl.id = 'jira-detail-panel';
    document.body.appendChild(panelEl);
  }
  panelEl.innerHTML = state._jiraDetailKey ? _renderJiraDetailPanel() : '';

  if (state.selectedProject && DATA.projects[state.selectedProject]) {
    el.innerHTML = _renderProjectDetail(state.selectedProject);
    // Auto-load detail intelligence
    if (!_projectIntelDetail[state.selectedProject] && !_projectIntelDetailLoading[state.selectedProject]) {
      loadProjectIntelDetail(state.selectedProject);
    }
  } else {
    el.innerHTML = _renderProjectsGrid();
    // Auto-load overview intelligence
    if (!_projectIntelOverview && !_projectIntelOverviewLoading) {
      loadProjectIntelOverview();
    }
  }
}

// ─── Overview Grid ───────────────────────────────────────────

function _renderProjectsGrid() {
  var html = '<div class="proj-grid">';

  for (var _e = Object.entries(DATA.projects), _i = 0; _i < _e.length; _i++) {
    var id = _e[_i][0], p = _e[_i][1];
    var intel = _projectIntelOverview ? (_projectIntelOverview[id] || {}) : {};

    html += '<div class="proj-card" onclick="selectProject(\'' + id + '\')">';
    html += '<h3>' + _pEnc(p.title) + '</h3>';
    html += '<div class="proj-status"><span class="dot" style="background:' + p.colour + '"></span>' + _pEnc(p.status) + (p.owner ? ' · ' + _pEnc((DATA.people[p.owner] || {}).n || p.owner) : '') + '</div>';
    html += '<div class="prog-bar"><div class="prog-fill" style="width:' + p.progress + '%;background:' + p.colour + '"></div></div>';

    // Static meta
    html += '<div class="proj-meta"><span>' + p.milestones.filter(function(m){return m.s==='done';}).length + '/' + p.milestones.length + ' milestones</span>';
    if (p.blockers.length) html += '<span style="color:var(--rd)">⚠ ' + p.blockers.length + ' blocker' + (p.blockers.length > 1 ? 's' : '') + '</span>';
    html += '</div>';

    // Live intelligence indicators
    if (_projectIntelOverview) {
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);font-size:10px;color:var(--tx3)">';

      // Health score
      if (intel.healthScore !== null && intel.healthScore !== undefined) {
        html += '<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:50%;background:' + _pHealthColor(intel.healthScore) + '"></span>' + Math.round(intel.healthScore) + '</span>';
      }

      // Comms activity
      if (intel.commsTotal > 0) {
        html += '<span>' + intel.commsTotal + ' threads</span>';
      }
      if (intel.commsThisWeek > 0) {
        html += '<span style="color:var(--ac)">' + intel.commsThisWeek + ' this week</span>';
      }

      // Action required
      if (intel.actionRequired > 0) {
        html += '<span style="color:var(--rd);font-weight:600">' + intel.actionRequired + ' action</span>';
      }

      // Meetings
      if (intel.meetingsThisWeek > 0) {
        html += '<span>' + intel.meetingsThisWeek + ' meetings</span>';
      }

      // Last activity
      if (intel.latestActivity) {
        html += '<span style="margin-left:auto">' + _pRelTime(intel.latestActivity) + '</span>';
      }

      html += '</div>';
    }

    html += '</div>';
  }
  html += '</div>';

  // ── Full Jira Dashboard ──
  if (_projectIntelJira && (_projectIntelJira.byProject || []).length > 0) {
    var jd = _projectIntelJira;
    var sm = jd.summary || {};

    // ── Stats bar ──
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">';
    var stats = [
      { label: 'Open Issues', value: sm.totalOpen || 0, color: 'var(--ac)' },
      { label: 'Created (7d)', value: sm.createdThisWeek || 0, color: 'var(--bl)' },
      { label: 'Resolved (7d)', value: sm.resolvedThisWeek || 0, color: 'var(--gn)' },
      { label: 'Blockers', value: sm.blockerCount || 0, color: 'var(--rd)' },
      { label: 'Overdue', value: sm.overdueCount || 0, color: 'var(--or)' },
      { label: 'Epics', value: sm.epicCount || 0, color: 'var(--pu)' },
      { label: 'Active Sprints', value: sm.sprintCount || 0, color: 'var(--ac)' }
    ];
    stats.forEach(function(s) {
      html += '<div style="padding:10px 16px;background:var(--s2);border-radius:8px;min-width:100px;border-left:3px solid ' + s.color + '">';
      html += '<div style="font-size:20px;font-weight:700;color:' + s.color + '">' + s.value + '</div>';
      html += '<div style="font-size:10px;color:var(--tx3)">' + s.label + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // ── Active Sprints ──
    if (jd.sprints && jd.sprints.length) {
      html += '<div class="card" style="margin-top:12px"><div class="card-h"><h2>Active Sprints</h2><span class="tag info">' + jd.sprints.length + '</span></div><div class="card-b">';
      jd.sprints.forEach(function(sp) {
        var pct = sp.issueCount > 0 ? Math.round(sp.doneCount / sp.issueCount * 100) : 0;
        html += '<div style="margin-bottom:14px;padding:10px;background:var(--s1);border-radius:8px;border-left:3px solid var(--ac)">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
        html += '<span style="font-weight:600;font-size:var(--f-sm)">' + _pEnc(sp.name) + '</span>';
        html += '<span style="font-size:10px;color:var(--ac)">' + sp.doneCount + '/' + sp.issueCount + ' done (' + pct + '%)</span>';
        if (sp.daysRemaining !== null) {
          var dColor = sp.daysRemaining <= 2 ? 'var(--rd)' : sp.daysRemaining <= 5 ? 'var(--or)' : 'var(--tx3)';
          html += '<span style="font-size:10px;color:' + dColor + ';margin-left:auto">' + sp.daysRemaining + 'd remaining</span>';
        }
        if (sp.totalPoints > 0) html += '<span style="font-size:10px;color:var(--tx3)">' + sp.donePoints + '/' + sp.totalPoints + ' pts</span>';
        html += '</div>';
        html += '<div class="prog-bar" style="height:4px"><div class="prog-fill" style="width:' + pct + '%;background:var(--gn)"></div></div>';
        if (sp.goal) {
          html += '<div style="font-size:11px;color:var(--tx2);margin-top:6px;white-space:pre-wrap;max-height:80px;overflow:hidden">' + _pEnc(sp.goal).slice(0, 300) + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    }

    // ── Blockers & High Priority ──
    if (jd.blockers && jd.blockers.length) {
      html += '<div class="card accent-r"><div class="card-h"><h2>Blockers & High Priority</h2><span class="tag crit">' + jd.blockers.length + '</span></div><div class="card-b">';
      jd.blockers.slice(0, 15).forEach(function(i) {
        html += _renderJiraRow(i, true);
      });
      html += '</div></div>';
    }

    // ── Overdue ──
    if (jd.overdue && jd.overdue.length) {
      html += '<div class="card" style="border-left:3px solid var(--or)"><div class="card-h"><h2>Overdue</h2><span class="tag" style="background:var(--or)22;color:var(--or)">' + jd.overdue.length + '</span></div><div class="card-b">';
      jd.overdue.slice(0, 10).forEach(function(i) {
        html += '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center;font-size:12px">';
        html += '<a href="' + _pEnc(i.url) + '" target="_blank" style="font-size:10px;font-weight:600;color:var(--ac);min-width:90px">' + _pEnc(i.key) + '</a>';
        html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pEnc(i.summary) + '</span>';
        html += '<span style="font-size:10px;color:var(--or)">Due ' + _pEnc((i.dueDate || '').slice(0, 10)) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(i.assignee) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // ── Epics & Initiatives ──
    if (jd.epics && jd.epics.length) {
      html += '<div class="card"><div class="card-h"><h2>Epics & Initiatives</h2><span class="tag info">' + jd.epics.length + '</span></div><div class="card-b">';
      jd.epics.forEach(function(e) {
        html += _renderJiraRow(e, false);
      });
      html += '</div></div>';
    }

    // ── Recently Resolved ──
    if (jd.recentlyResolved && jd.recentlyResolved.length) {
      html += '<div class="card"><div class="card-h"><h2>Recently Resolved (14d)</h2><span class="tag" style="background:var(--gn)22;color:var(--gn)">' + jd.recentlyResolved.length + '</span></div><div class="card-b">';
      jd.recentlyResolved.forEach(function(i) {
        html += '<div style="display:flex;gap:6px;margin-bottom:3px;align-items:center;font-size:12px;color:var(--tx3)">';
        html += '<span style="color:var(--gn)">✓</span>';
        html += '<a href="' + _pEnc(i.url) + '" target="_blank" style="font-size:10px;font-weight:600;color:var(--ac);min-width:90px">' + _pEnc(i.key) + '</a>';
        html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pEnc(i.summary) + '</span>';
        html += '<span style="font-size:10px">' + _pEnc(i.assignee) + '</span>';
        html += '<span style="font-size:10px">' + _pRelTime(i.resolutionDate || i.updated) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // ── All Issues by Project ──
    html += '<div class="card"><div class="card-h"><h2>All Issues by Project</h2></div><div class="card-b">';
    jd.byProject.forEach(function(proj) {
      html += '<details style="margin-bottom:8px"><summary style="cursor:pointer;font-weight:600;font-size:var(--f-sm);display:flex;align-items:center;gap:8px">';
      html += '<span>' + _pEnc(proj.key) + '</span>';
      html += '<span style="font-weight:400;color:var(--tx3)">' + _pEnc(proj.name) + '</span>';
      html += '<span style="font-size:10px;color:var(--ac);margin-left:auto">' + proj.issues.length + ' issues</span>';
      // Mini status breakdown
      var sbd = proj.statusBreakdown || {};
      Object.keys(sbd).forEach(function(s) { html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--s2);color:var(--tx3)">' + _pEnc(s) + ': ' + sbd[s] + '</span>'; });
      html += '</summary>';
      html += '<div style="padding:6px 0 0 16px">';
      proj.issues.forEach(function(i) { html += _renderJiraRow(i, false); });
      html += '</div></details>';
    });
    html += '</div></div>';
  } else if (_projectJiraLoading) {
    html += '<div style="text-align:center;padding:20px;color:var(--tx3);margin-top:16px"><div class="ca-spinner" style="width:20px;height:20px;margin:0 auto 8px"></div>Loading Jira data...</div>';
  }

  return html;
}

// ─── Project Detail View ─────────────────────────────────────

function _renderProjectDetail(id) {
  var p = DATA.projects[id];
  var intel = _projectIntelDetail[id] || null;
  var project = intel ? intel.project : null;
  var synthesis = intel ? intel.synthesis : null;
  var loading = _projectIntelDetailLoading[id];
  var html = '';

  // ── Header card ──
  html += '<div class="card"><div class="card-h"><h2>' + _pEnc(p.title) + '</h2>';
  html += '<span class="tag" style="background:' + p.colour + '22;color:' + p.colour + '">' + _pEnc(p.status) + '</span>';
  if (synthesis) {
    html += '<span style="margin-left:8px;font-size:var(--f-sm);font-weight:600;color:' + _pHealthColor(synthesis.healthScore) + '">' + Math.round(synthesis.healthScore) + '/100</span>';
  }
  html += '</div>';
  html += '<div class="card-b">' + _pEnc(p.desc);
  html += '<div class="prog-bar" style="margin-top:12px"><div class="prog-fill" style="width:' + p.progress + '%;background:' + p.colour + '"></div></div>';
  html += '<span style="font-size:10px;color:var(--tx3)">' + p.progress + '% complete</span>';
  html += '</div></div>';

  // ── AI Health Summary (Section A) ──
  if (synthesis) {
    html += '<div class="card" style="border-left:3px solid ' + _pHealthColor(synthesis.healthScore) + '">';
    html += '<div class="card-h"><h2>AI Health Assessment</h2>';
    html += '<span style="font-size:var(--f-sm);color:' + _pHealthColor(synthesis.healthScore) + ';font-weight:600">' + _pHealthLabel(synthesis.healthScore) + '</span></div>';
    html += '<div class="card-b">';
    html += '<p style="margin:0 0 10px;line-height:1.5">' + _pEnc(synthesis.healthSummary) + '</p>';
    if (synthesis.riskFlags && synthesis.riskFlags.length) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
      synthesis.riskFlags.forEach(function(f) { html += '<span class="tag crit" style="font-size:10px">' + _pEnc(f) + '</span>'; });
      html += '</div>';
    }
    if (synthesis.opportunityFlags && synthesis.opportunityFlags.length) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
      synthesis.opportunityFlags.forEach(function(f) { html += '<span class="tag" style="font-size:10px;background:var(--gn)22;color:var(--gn)">' + _pEnc(f) + '</span>'; });
      html += '</div>';
    }
    if (synthesis.nextActions && synthesis.nextActions.length) {
      html += '<div style="margin-top:8px;font-size:var(--f-sm)">';
      synthesis.nextActions.forEach(function(a) { html += '<div style="display:flex;gap:6px;margin-bottom:4px"><span style="color:var(--ac)">→</span>' + _pEnc(a) + '</div>'; });
      html += '</div>';
    }
    html += '<div style="text-align:right;font-size:10px;color:var(--tx3);margin-top:8px">Generated ' + _pRelTime(synthesis.generatedAt) + '</div>';
    html += '</div></div>';
  } else if (!loading) {
    html += '<div class="card" style="border-left:3px solid var(--tx3)">';
    html += '<div class="card-h"><h2>AI Health Assessment</h2></div>';
    html += '<div class="card-b"><button class="btn btn-sm" onclick="loadProjectIntelDetail(\'' + id + '\',true)">Generate AI Summary</button>';
    html += '<span style="font-size:10px;color:var(--tx3);margin-left:8px">Uses Claude Sonnet for analysis</span>';
    html += '</div></div>';
  }

  // ── Comms Activity (Section B) ──
  if (project && project.commsActivity && project.commsActivity.length > 0) {
    var comms = project.commsActivity;
    var stats = project.commsStats || {};
    html += '<div class="card"><div class="card-h"><h2>Comms Activity</h2>';
    html += '<span class="tag info">' + comms.length + ' threads</span>';
    if (stats.actionRequired > 0) html += '<span class="tag crit" style="margin-left:4px">' + stats.actionRequired + ' action</span>';
    html += '</div><div class="card-b">';

    // Group by time bucket
    var today = [], thisWeek = [], older = [];
    var now = Date.now();
    comms.forEach(function(t) {
      var age = now - new Date(t.lastActivity).getTime();
      if (age < 86400000) today.push(t);
      else if (age < 604800000) thisWeek.push(t);
      else older.push(t);
    });

    function renderCommsBucket(label, items) {
      if (!items.length) return '';
      var h = '<div style="font-size:10px;font-weight:600;color:var(--tx3);margin:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px">' + label + '</div>';
      items.forEach(function(t) {
        var prioColor = t.priority === 'critical' ? 'var(--rd)' : t.priority === 'high' ? 'var(--or)' : 'var(--tx3)';
        h += '<div class="nav-i" onclick="navToComm(\'' + _pEnc(t.threadId) + '\')" style="margin:0;padding:4px 8px;font-size:var(--f-sm);align-items:center">';
        h += _pSourceIcon(t.source) + ' ';
        h += _pSentimentDot(t.sentiment) + ' ';
        h += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pEnc(t.subject) + '</span>';
        if (t.actionRequired) h += '<span class="tag crit" style="font-size:9px;padding:1px 5px">Action</span>';
        h += '<span style="font-size:10px;color:' + prioColor + ';min-width:40px;text-align:right">' + (t.priority || '') + '</span>';
        h += '<span style="font-size:10px;color:var(--tx3);min-width:50px;text-align:right">' + _pRelTime(t.lastActivity) + '</span>';
        h += '</div>';
      });
      return h;
    }

    html += renderCommsBucket('Today', today);
    html += renderCommsBucket('This Week', thisWeek);
    html += renderCommsBucket('Earlier', older.slice(0, 10));

    html += '<div style="text-align:center;margin-top:8px"><a href="#" onclick="navToCommsFiltered(\'' + id + '\');return false" style="font-size:var(--f-xs);color:var(--ac)">View all in Comms →</a></div>';
    html += '</div></div>';
  } else if (loading) {
    html += '<div class="card"><div class="card-h"><h2>Comms Activity</h2></div><div class="card-b"><div class="ca-spinner" style="width:20px;height:20px"></div></div></div>';
  }

  // ── Calendar & Meetings (Section C) ──
  if (project && project.calendar) {
    var cal = project.calendar;
    var totalCal = (cal.upcoming || []).length + (cal.recent || []).length;
    if (totalCal > 0) {
      html += '<div class="card"><div class="card-h"><h2>Meetings</h2><span class="tag info">' + totalCal + '</span></div><div class="card-b">';
      if (cal.upcoming.length) {
        html += '<div style="font-size:10px;font-weight:600;color:var(--gn);margin-bottom:4px">UPCOMING</div>';
        cal.upcoming.forEach(function(e) {
          html += '<div style="display:flex;gap:8px;margin-bottom:6px;font-size:var(--f-sm);align-items:center">';
          html += '<span style="min-width:80px;font-size:10px;color:var(--ac)">' + new Date(e.start).toLocaleDateString('en-AU', {month:'short',day:'numeric'}) + '</span>';
          html += '<span style="flex:1">' + _pEnc(e.subject) + '</span>';
          if (e.attendees.length) html += '<span style="font-size:10px;color:var(--tx3)">' + e.attendees.slice(0, 3).join(', ') + '</span>';
          html += '</div>';
        });
      }
      if (cal.recent.length) {
        html += '<div style="font-size:10px;font-weight:600;color:var(--tx3);margin:8px 0 4px">RECENT</div>';
        cal.recent.forEach(function(e) {
          html += '<div style="display:flex;gap:8px;margin-bottom:6px;font-size:var(--f-sm);color:var(--tx3)">';
          html += '<span style="min-width:80px;font-size:10px">' + new Date(e.start).toLocaleDateString('en-AU', {month:'short',day:'numeric'}) + '</span>';
          html += '<span style="flex:1">' + _pEnc(e.subject) + '</span>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    }
  }

  // ── Strategy Alignment (Section D) ──
  if (project && project.strategy && project.strategy.length > 0) {
    html += '<div class="card"><div class="card-h"><h2>Strategic Alignment</h2><span class="tag info">' + project.strategy.length + ' correlations</span></div><div class="card-b">';
    project.strategy.forEach(function(c) {
      var sevColor = c.severity === 'critical' ? 'var(--rd)' : c.severity === 'warning' ? 'var(--or)' : c.severity === 'positive' ? 'var(--gn)' : 'var(--ac)';
      html += '<div style="margin-bottom:10px;padding:8px;background:var(--s2);border-radius:6px;border-left:3px solid ' + sevColor + '">';
      html += '<div style="font-weight:600;font-size:var(--f-sm)">' + _pEnc(c.title) + ' <span class="tag" style="font-size:9px;background:' + sevColor + '22;color:' + sevColor + '">' + _pEnc(c.severity) + '</span></div>';
      html += '<div style="font-size:var(--f-xs);color:var(--tx2);margin-top:4px">' + _pEnc(c.finding) + '</div>';
      if (c.dataPoints && c.dataPoints.length) {
        html += '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">';
        c.dataPoints.forEach(function(dp) {
          html += '<span style="font-size:10px;padding:2px 6px;background:var(--s1);border-radius:4px">' + _pEnc(typeof dp === 'string' ? dp : dp.label || JSON.stringify(dp)) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Milestones ──
  html += '<div class="card"><div class="card-h"><h2>Milestones</h2></div><div class="card-b"><div class="milestone-track">';
  p.milestones.forEach(function(m) { html += '<div class="ms-item ' + m.s + '">' + (m.s === 'done' ? '✓ ' : '') + _pEnc(m.t) + '</div>'; });
  html += '</div></div></div>';

  // ── Blockers ──
  if (p.blockers.length) {
    html += '<div class="card accent-r"><div class="card-h"><h2>Blockers</h2><span class="tag crit">' + p.blockers.length + '</span></div><div class="card-b">';
    p.blockers.forEach(function(b) { html += '<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--rd)">●</span>' + _pEnc(b) + '</div>'; });
    html += '</div></div>';
  }

  // ── Next Actions ──
  if (p.nextActions.length) {
    html += '<div class="card"><div class="card-h"><h2>Next Actions</h2></div><div class="card-b">';
    p.nextActions.forEach(function(a) { html += '<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--ac)">→</span>' + _pEnc(a) + '</div>'; });
    html += '</div></div>';
  }

  // ── Key Metrics (Section F) ──
  if (project && project.metrics && project.metrics.length > 0) {
    html += '<div class="card"><div class="card-h"><h2>Key Metrics</h2></div><div class="card-b">';
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    project.metrics.forEach(function(m) {
      html += '<div style="padding:8px 12px;background:var(--s2);border-radius:6px;min-width:120px">';
      html += '<div style="font-size:10px;color:var(--tx3);text-transform:uppercase">' + _pEnc(m.label) + '</div>';
      html += '<div style="font-size:18px;font-weight:700;color:var(--tx)">' + _pEnc(String(m.value)) + '</div>';
      if (m.change) {
        var changeColor = String(m.change).includes('-') ? 'var(--rd)' : 'var(--gn)';
        html += '<div style="font-size:10px;color:' + changeColor + '">' + _pEnc(String(m.change)) + '</div>';
      }
      html += '</div>';
    });
    html += '</div></div></div>';
  }

  // ── News & Research (Section G) ──
  if (project && project.news && project.news.length > 0) {
    html += '<div class="card"><div class="card-h"><h2>Related News</h2></div><div class="card-b">';
    project.news.forEach(function(n) {
      html += '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:var(--f-sm)">';
      html += '<span style="color:var(--ac);font-size:10px;min-width:60px">' + _pEnc(n.source) + '</span>';
      html += '<div style="flex:1"><div>' + _pEnc(n.title) + '</div>';
      if (n.summary) html += '<div style="font-size:10px;color:var(--tx3);margin-top:2px">' + _pEnc(n.summary).slice(0, 120) + '</div>';
      html += '</div>';
      html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(n.date) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── KB Documents (Section H) ──
  if (project && project.kbDocs && project.kbDocs.length > 0) {
    html += '<div class="card"><div class="card-h"><h2>Knowledge Base</h2><span class="tag info">' + project.kbDocs.length + ' docs</span></div><div class="card-b">';
    var docsByType = {};
    project.kbDocs.forEach(function(d) { if (!docsByType[d.type]) docsByType[d.type] = []; docsByType[d.type].push(d); });
    Object.keys(docsByType).forEach(function(type) {
      html += '<div style="font-size:10px;font-weight:600;color:var(--tx3);margin:8px 0 4px;text-transform:uppercase">' + _pEnc(type) + 's</div>';
      docsByType[type].forEach(function(d) {
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;font-size:var(--f-sm)">';
        html += '<span style="color:var(--ac)">📄</span>';
        html += '<span style="flex:1">' + _pEnc(d.title) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(d.date) + '</span>';
        html += '</div>';
      });
    });
    html += '</div></div>';
  }

  // ── People ──
  if (p.people.length) {
    html += '<div class="card"><div class="card-h"><h2>People</h2></div><div class="card-b"><div class="people">';
    p.people.forEach(function(pid) {
      var pe = DATA.people[pid];
      if (pe) html += '<span class="per" onclick="navToPerson(\'' + pid + '\')">' + _pEnc(pe.n) + '</span>';
    });
    html += '</div></div></div>';
  }

  // ── Live Jira Issues (from project intelligence) ──
  if (project && project.jira && project.jira.total > 0) {
    var jiraI = project.jira;

    // Blockers
    if (jiraI.blockers && jiraI.blockers.length) {
      html += '<div class="card accent-r"><div class="card-h"><h2>Jira Blockers</h2><span class="tag crit">' + jiraI.blockers.length + '</span></div><div class="card-b">';
      jiraI.blockers.forEach(function(issue) {
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">';
        html += '<span style="color:var(--rd)">●</span>';
        html += '<a href="' + _pEnc(issue.url) + '" target="_blank" style="font-size:10px;font-weight:700;min-width:80px;color:var(--ac)">' + _pEnc(issue.key) + '</a>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(issue.summary) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(issue.assignee) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // Active issues
    if (jiraI.recent && jiraI.recent.length) {
      html += '<div class="card"><div class="card-h"><h2>Jira Issues</h2><span class="tag info">' + jiraI.recent.length + ' active / ' + jiraI.total + ' total</span></div><div class="card-b">';
      jiraI.recent.forEach(function(issue) {
        var sc = issue.statusCategory === 'done' ? 'gn' : issue.statusCategory === 'indeterminate' ? 'bl' : 'tx3';
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">';
        html += '<a href="' + _pEnc(issue.url) + '" target="_blank" style="font-size:10px;font-weight:700;color:var(--ac);min-width:80px">' + _pEnc(issue.key) + '</a>';
        html += '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--s2);color:var(--tx3)">' + _pEnc(issue.type) + '</span>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(issue.summary) + '</span>';
        html += '<span class="tag" style="font-size:9px;color:var(--' + sc + ')">' + _pEnc(issue.status) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(issue.assignee) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pRelTime(issue.updated) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // Recently completed
    if (jiraI.done && jiraI.done.length) {
      html += '<div class="card"><div class="card-h"><h2>Recently Completed</h2><span class="tag" style="background:var(--gn)22;color:var(--gn)">' + jiraI.done.length + '</span></div><div class="card-b">';
      jiraI.done.forEach(function(issue) {
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;color:var(--tx3)">';
        html += '<span style="color:var(--gn)">✓</span>';
        html += '<a href="' + _pEnc(issue.url) + '" target="_blank" style="font-size:10px;font-weight:700;min-width:80px;color:var(--ac)">' + _pEnc(issue.key) + '</a>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(issue.summary) + '</span>';
        html += '<span style="font-size:10px">' + _pRelTime(issue.updated) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (jiraI.error) {
      html += '<div style="font-size:10px;color:var(--tx3);margin-bottom:8px">⚠ Jira: ' + _pEnc(jiraI.error) + '</div>';
    }
  }

  // ── Jira & Confluence (Section I — existing enrichment fallback) ──
  if (_projectEnrichment) {
    var jira = _projectEnrichment.jira || {};
    if (jira.recent && jira.recent.length) {
      html += '<div class="card"><div class="card-h"><h2>Jira Activity (7d)</h2><span class="tag info">' + jira.recent.length + ' issues</span></div><div class="card-b">';
      jira.recent.slice(0, 8).forEach(function(issue) {
        var sc = issue.statusCategory === 'done' ? 'gn' : issue.statusCategory === 'indeterminate' ? 'bl' : 'tx3';
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">';
        html += '<span style="font-size:10px;font-weight:700;color:var(--ac);min-width:70px">' + _pEnc(issue.key) + '</span>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(issue.summary) + '</span>';
        html += '<span class="tag" style="font-size:9px;color:var(--' + sc + ')">' + _pEnc(issue.status) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(issue.assignee) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }
    if (jira.blockers && jira.blockers.length) {
      html += '<div class="card accent-r"><div class="card-h"><h2>Jira Blockers</h2><span class="tag crit">' + jira.blockers.length + '</span></div><div class="card-b">';
      jira.blockers.forEach(function(issue) {
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">';
        html += '<span style="color:var(--rd)">●</span>';
        html += '<span style="font-size:10px;font-weight:700;min-width:70px">' + _pEnc(issue.key) + '</span>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(issue.summary) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(issue.assignee) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }
    var conf = _projectEnrichment.confluence || {};
    if (conf.pages && conf.pages.length) {
      html += '<div class="card"><div class="card-h"><h2>Confluence Docs</h2></div><div class="card-b">';
      conf.pages.slice(0, 8).forEach(function(pg) {
        var ago = pg.lastModified ? _pRelTime(pg.lastModified) : '';
        html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">';
        html += '<span style="color:var(--ac)">📄</span>';
        html += '<span style="flex:1;font-size:var(--f-sm)">' + _pEnc(pg.title) + '</span>';
        html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(pg.lastAuthor || '') + ' · ' + ago + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }
    if (_projectEnrichment.lastSynced) {
      html += '<div style="text-align:right;font-size:10px;color:var(--tx3);margin-top:8px">Jira/Confluence synced: ' + new Date(_projectEnrichment.lastSynced).toLocaleTimeString('en-AU', {hour:'numeric',minute:'2-digit'}) + '</div>';
    }
  } else if (!_projectEnrichmentLoading) {
    loadProjectEnrichment();
  }

  // ── Loading indicator for intelligence ──
  if (loading) {
    html += '<div style="text-align:center;padding:20px;color:var(--tx3)"><div class="ca-spinner" style="width:20px;height:20px;margin:0 auto 8px"></div>Loading intelligence data...</div>';
  }

  return html;
}

// ─── Cross-Module Navigation ─────────────────────────────────

// ─── Jira Issue Detail Panel ─────────────────────────────────

var _jiraDetailCache = {};
var _jiraDetailLoading = {};

async function openJiraDetail(issueKey) {
  if (_jiraDetailLoading[issueKey]) return;
  state._jiraDetailKey = issueKey;
  renderAll();

  // Escape-to-close (one-shot, removed on close)
  if (!state._jiraEscHandler) {
    state._jiraEscHandler = function(e) { if (e.key === 'Escape') closeJiraDetail(); };
    document.addEventListener('keydown', state._jiraEscHandler);
  }

  if (_jiraDetailCache[issueKey]) return;
  _jiraDetailLoading[issueKey] = true;
  try {
    var resp = await fetch('/api/jira/issue/' + issueKey);
    if (resp.ok) {
      _jiraDetailCache[issueKey] = await resp.json();
    }
  } catch (e) {
    console.error('[Jira] Detail load failed:', e);
  }
  _jiraDetailLoading[issueKey] = false;
  renderAll();
}

function closeJiraDetail() {
  state._jiraDetailKey = null;
  if (state._jiraEscHandler) {
    document.removeEventListener('keydown', state._jiraEscHandler);
    state._jiraEscHandler = null;
  }
  renderAll();
}

function _renderJiraDetailPanel() {
  var key = state._jiraDetailKey;
  if (!key) return '';
  var d = _jiraDetailCache[key];
  var loading = _jiraDetailLoading[key];

  // Uplifted: uses .panel-overlay / .panel-header / .panel-body for slide-in aesthetic
  var html = '<div class="panel-overlay open panel-jira">';

  // Panel header
  html += '<div class="panel-header">';
  html += '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">';
  html += '<span style="font-size:10px;color:var(--tx3);font-weight:700;letter-spacing:0.5px">JIRA · ' + _pEnc(key) + '</span>';
  if (d && d.url) html += '<a href="' + _pEnc(d.url) + '" target="_blank" style="font-size:10px;color:var(--ac);text-decoration:none">Open \u2197</a>';
  html += '</div>';
  html += '<button class="panel-close" onclick="closeJiraDetail()" title="Close (Esc)">\u00D7</button>';
  html += '</div>';

  // Panel body wrapper
  html += '<div class="panel-body">';

  if (loading && !d) {
    html += '<div style="text-align:center;padding:60px"><div class="ca-spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><div style="color:var(--tx3);font-size:12px">Loading ticket...</div></div>';
    html += '</div></div>';
    return html;
  }
  if (!d) { html += '</div></div>'; return html; }

  // ── Hero card (matches uplifted project detail aesthetic) ──
  var sc = d.statusCategory === 'done' ? 'gn' : d.statusCategory === 'indeterminate' ? 'bl' : 'tx3';
  var pc = d.priority === 'Highest' ? 'rd' : d.priority === 'High' ? 'or' : 'tx3';
  var heroBorder = d.statusCategory === 'done' ? 'var(--gn)' : pc === 'rd' ? 'var(--rd)' : pc === 'or' ? 'var(--or)' : 'var(--ac)';
  html += '<div style="background:var(--s1);border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid ' + heroBorder + '">';
  html += '<h2 style="margin:0 0 10px;font-size:18px;line-height:1.35">' + _pEnc(d.summary) + '</h2>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--s2);color:var(--' + sc + ')">' + _pEnc(d.status) + '</span>';
  html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--s2);color:var(--' + pc + ')">' + _pEnc(d.priority) + '</span>';
  html += '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--s2);color:var(--tx3)">' + _pEnc(d.type) + '</span>';
  html += '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--s2);color:var(--tx3)">' + _pEnc(d.project) + '</span>';
  if (d.flagged) html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--rd);color:#fff">Flagged</span>';
  if (d.storyPoints) html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--pu);color:#fff">' + d.storyPoints + ' SP</span>';
  html += '</div>';
  html += '</div>';

  // ── Meta grid ──
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">';
  html += '<div><span style="color:var(--tx3)">Assignee:</span> ' + _pEnc(d.assignee) + '</div>';
  html += '<div><span style="color:var(--tx3)">Reporter:</span> ' + _pEnc(d.reporter) + '</div>';
  html += '<div><span style="color:var(--tx3)">Created:</span> ' + _pRelTime(d.created) + '</div>';
  html += '<div><span style="color:var(--tx3)">Updated:</span> ' + _pRelTime(d.updated) + '</div>';
  if (d.dueDate) html += '<div><span style="color:var(--tx3)">Due:</span> <span style="color:' + (new Date(d.dueDate) < Date.now() ? 'var(--rd)' : 'var(--tx)') + '">' + _pEnc(d.dueDate) + '</span></div>';
  if (d.resolution) html += '<div><span style="color:var(--tx3)">Resolution:</span> ' + _pEnc(d.resolution) + '</div>';
  if (d.parent) html += '<div><span style="color:var(--tx3)">Parent:</span> <a href="#" onclick="openJiraDetail(\'' + _pEnc(d.parent.key) + '\');return false" style="color:var(--ac)">' + _pEnc(d.parent.key) + '</a> ' + _pEnc(d.parent.summary).slice(0, 40) + '</div>';
  if (d.sprint) html += '<div><span style="color:var(--tx3)">Sprint:</span> ' + _pEnc(d.sprint.name) + '</div>';
  if (d.labels.length) html += '<div style="grid-column:1/3"><span style="color:var(--tx3)">Labels:</span> ' + d.labels.map(function(l) { return '<span style="font-size:10px;padding:1px 6px;background:var(--s2);border-radius:3px;margin-right:3px">' + _pEnc(l) + '</span>'; }).join('') + '</div>';
  if (d.components.length) html += '<div><span style="color:var(--tx3)">Components:</span> ' + d.components.map(function(c) { return _pEnc(c); }).join(', ') + '</div>';
  if (d.fixVersions.length) html += '<div><span style="color:var(--tx3)">Fix Version:</span> ' + d.fixVersions.map(function(v) { return _pEnc(v.name); }).join(', ') + '</div>';
  html += '</div>';

  // ── Time tracking ──
  if (d.timeTracking && (d.timeTracking.originalEstimate || d.timeTracking.timeSpent)) {
    html += '<div style="padding:8px;background:var(--s2);border-radius:6px;margin-bottom:12px;font-size:12px;display:flex;gap:16px">';
    if (d.timeTracking.originalEstimate) html += '<span><span style="color:var(--tx3)">Estimated:</span> ' + _pEnc(d.timeTracking.originalEstimate) + '</span>';
    if (d.timeTracking.timeSpent) html += '<span><span style="color:var(--tx3)">Logged:</span> ' + _pEnc(d.timeTracking.timeSpent) + '</span>';
    if (d.timeTracking.remainingEstimate) html += '<span><span style="color:var(--tx3)">Remaining:</span> ' + _pEnc(d.timeTracking.remainingEstimate) + '</span>';
    html += '</div>';
  }

  // ── Description ──
  if (d.description) {
    html += '<div class="card"><div class="card-h"><h2>Description</h2></div><div class="card-b">';
    if (d.descriptionHtml) html += '<div style="font-size:var(--f-sm);line-height:1.5">' + d.descriptionHtml + '</div>';
    else html += '<div style="font-size:var(--f-sm);line-height:1.5;white-space:pre-wrap">' + _pEnc(d.description) + '</div>';
    html += '</div></div>';
  }

  // ── Subtasks ──
  if (d.subtasks && d.subtasks.length) {
    html += '<div class="card"><div class="card-h"><h2>Subtasks</h2><span class="tag info">' + d.subtasks.length + '</span></div><div class="card-b">';
    d.subtasks.forEach(function(st) {
      var stc = st.statusCategory === 'done' ? 'gn' : 'tx3';
      html += '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center;font-size:12px">';
      html += '<span style="color:var(--' + stc + ')">' + (st.statusCategory === 'done' ? '✓' : '○') + '</span>';
      html += '<a href="#" onclick="openJiraDetail(\'' + _pEnc(st.key) + '\');return false" style="font-size:10px;font-weight:600;color:var(--ac);min-width:80px">' + _pEnc(st.key) + '</a>';
      html += '<span style="flex:1">' + _pEnc(st.summary) + '</span>';
      html += '<span class="tag" style="font-size:9px;color:var(--' + stc + ')">' + _pEnc(st.status) + '</span>';
      html += '<span style="font-size:10px;color:var(--tx3)">' + _pEnc(st.assignee) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Linked Issues ──
  if (d.links && d.links.length) {
    html += '<div class="card"><div class="card-h"><h2>Linked Issues</h2><span class="tag info">' + d.links.length + '</span></div><div class="card-b">';
    d.links.forEach(function(l) {
      var lc = l.statusCategory === 'done' ? 'gn' : 'tx3';
      html += '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center;font-size:12px">';
      html += '<span style="font-size:10px;color:var(--tx3);min-width:90px">' + _pEnc(l.direction) + '</span>';
      html += '<a href="#" onclick="openJiraDetail(\'' + _pEnc(l.key) + '\');return false" style="font-size:10px;font-weight:600;color:var(--ac);min-width:80px">' + _pEnc(l.key) + '</a>';
      html += '<span style="flex:1">' + _pEnc(l.summary) + '</span>';
      html += '<span class="tag" style="font-size:9px;color:var(--' + lc + ')">' + _pEnc(l.status) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Attachments ──
  if (d.attachments && d.attachments.length) {
    html += '<div class="card"><div class="card-h"><h2>Attachments</h2><span class="tag info">' + d.attachments.length + '</span></div><div class="card-b">';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    d.attachments.forEach(function(a) {
      html += '<div style="padding:8px;background:var(--s2);border-radius:6px;min-width:150px;max-width:200px">';
      if (a.isImage && a.thumbnailUrl) html += '<img src="' + _pEnc(a.thumbnailUrl) + '" style="max-width:100%;border-radius:4px;margin-bottom:4px" />';
      html += '<div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pEnc(a.filename) + '</div>';
      html += '<div style="font-size:10px;color:var(--tx3)">' + _pEnc(a.sizeLabel) + ' · ' + _pEnc(a.author) + ' · ' + _pRelTime(a.created) + '</div>';
      html += '</div>';
    });
    html += '</div></div></div>';
  }

  // ── Comments ──
  if (d.comments && d.comments.length) {
    html += '<div class="card"><div class="card-h"><h2>Comments</h2><span class="tag info">' + d.comments.length + '</span></div><div class="card-b">';
    d.comments.forEach(function(c) {
      html += '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--bd)">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      if (c.authorAvatar) html += '<img src="' + _pEnc(c.authorAvatar) + '" style="width:20px;height:20px;border-radius:50%" />';
      html += '<span style="font-weight:600;font-size:12px">' + _pEnc(c.author) + '</span>';
      html += '<span style="font-size:10px;color:var(--tx3)">' + _pRelTime(c.created) + '</span>';
      html += '</div>';
      if (c.bodyHtml) html += '<div style="font-size:var(--f-sm);line-height:1.5">' + c.bodyHtml + '</div>';
      else html += '<div style="font-size:var(--f-sm);line-height:1.5;white-space:pre-wrap">' + _pEnc(c.body) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Activity History ──
  if (d.changelog && d.changelog.length) {
    html += '<div class="card"><div class="card-h"><h2>Activity</h2><span class="tag info">' + d.changelog.length + '</span></div><div class="card-b">';
    d.changelog.slice(0, 30).forEach(function(c) {
      html += '<div style="display:flex;gap:6px;margin-bottom:3px;font-size:11px;color:var(--tx3)">';
      html += '<span style="min-width:70px">' + _pRelTime(c.date) + '</span>';
      html += '<span style="min-width:80px">' + _pEnc(c.author) + '</span>';
      html += '<span style="color:var(--tx2)">' + _pEnc(c.field) + '</span>';
      if (c.from) html += '<span>' + _pEnc(c.from).slice(0, 20) + '</span>';
      html += '<span style="color:var(--ac)">→</span>';
      html += '<span style="font-weight:500;color:var(--tx)">' + _pEnc(c.to).slice(0, 30) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // ── Worklogs ──
  if (d.worklogs && d.worklogs.length) {
    html += '<div class="card"><div class="card-h"><h2>Work Log</h2></div><div class="card-b">';
    d.worklogs.forEach(function(w) {
      html += '<div style="display:flex;gap:6px;margin-bottom:4px;font-size:12px">';
      html += '<span style="min-width:70px;color:var(--tx3)">' + _pRelTime(w.started) + '</span>';
      html += '<span style="font-weight:600;min-width:80px">' + _pEnc(w.author) + '</span>';
      html += '<span style="color:var(--ac)">' + _pEnc(w.timeSpent) + '</span>';
      if (w.comment) html += '<span style="color:var(--tx3)"> — ' + _pEnc(w.comment).slice(0, 60) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  html += '</div>'; // close .panel-body
  html += '</div>'; // close .panel-overlay
  return html;
}

function navToCommsFiltered(projectId) {
  state.module = 'comms';
  state.commsProjectFilter = projectId;
  renderAll();
}
