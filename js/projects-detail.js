// Uplifted project detail view — split layout with left rail + main tabs.
// Shadows _renderProjectDetail in mod-projects.js (loaded after).

var _projectsDetailTab = 'today';         // today | timeline | actions | sources | team | history
var _projectsDetailLoading = {};          // id → bool
var _projectsDailyCache = {};             // id → today's update
var _projectsDailyLoading = {};
var _projectsHistoryCache = {};           // id → [updates]
var _projectsHistoryLoading = {};

function setProjectDetailTab(tab) {
  _projectsDetailTab = tab;
  renderAll();
}

async function loadProjectDaily(id, opts) {
  if (_projectsDailyLoading[id]) return;
  _projectsDailyLoading[id] = true;
  try {
    var url = '/api/projects-daily/' + encodeURIComponent(id);
    if (opts && opts.synthesize) url += '?synthesize=1';
    var resp = await fetch(url);
    if (resp.ok) {
      var data = await resp.json();
      _projectsDailyCache[id] = data.update || data.latest || null;
    }
  } catch (e) { console.warn('[Projects] daily load failed:', e); }
  _projectsDailyLoading[id] = false;
  renderAll();
}

async function refreshProjectContext(id) {
  try {
    await apiBackfillContext(id);
    if (typeof toast === 'function') toast('Backfilling context from Slack, Email, Jira, Confluence, Calendar, KB…', 'ok');
    // Poll for completion every 2s, up to 60s
    var attempts = 0;
    var poll = setInterval(async function() {
      attempts++;
      try {
        var resp = await fetch('/api/projects/' + encodeURIComponent(id));
        if (resp.ok) {
          var data = await resp.json();
          var state = data.project && data.project.backfill_state;
          if (state === 'complete' || state === 'error') {
            clearInterval(poll);
            // Refresh full project data + re-render
            if (typeof loadProjectsFromDb === 'function') await loadProjectsFromDb();
            if (typeof loadProjectFull === 'function') await loadProjectFull(id, true);
            renderAll();
            var counts = data.project.backfill_counts;
            if (typeof counts === 'string') { try { counts = JSON.parse(counts); } catch { counts = null; } }
            if (counts) {
              var total = (counts.slack || 0) + (counts.email || 0) + (counts.jira || 0) + (counts.confluence || 0) + (counts.calendar || 0) + (counts.kb || 0);
              if (typeof toast === 'function') toast('Context backfill complete: ' + total + ' sources', 'ok');
            } else {
              if (typeof toast === 'function') toast('Context backfill ' + state, state === 'error' ? 'err' : 'ok');
            }
          }
        }
      } catch (e) {}
      if (attempts >= 30) clearInterval(poll);
    }, 2000);
  } catch (e) {
    if (typeof toast === 'function') toast('Backfill failed: ' + e.message, 'err');
  }
}

async function regenerateProjectDaily(id) {
  if (_projectsDailyLoading[id]) return;
  _projectsDailyLoading[id] = true;
  renderAll();
  try {
    var resp = await fetch('/api/projects-daily/' + encodeURIComponent(id) + '/regenerate', { method: 'POST' });
    if (resp.ok) {
      var data = await resp.json();
      _projectsDailyCache[id] = data.update;
      if (typeof toast === 'function') toast('Daily update regenerated', 'ok');
    } else {
      if (typeof toast === 'function') toast('Regen failed', 'err');
    }
  } catch (e) {
    if (typeof toast === 'function') toast('Regen error: ' + e.message, 'err');
  }
  _projectsDailyLoading[id] = false;
  renderAll();
}

async function loadProjectHistory(id) {
  if (_projectsHistoryLoading[id]) return;
  _projectsHistoryLoading[id] = true;
  try {
    var resp = await fetch('/api/projects-daily/' + encodeURIComponent(id) + '/history?days=14');
    if (resp.ok) _projectsHistoryCache[id] = (await resp.json()).updates || [];
  } catch (e) {}
  _projectsHistoryLoading[id] = false;
  renderAll();
}

async function toggleActionDone(aid, currentStatus) {
  var newStatus = currentStatus === 'done' ? 'open' : 'done';
  try {
    await fetch('/api/projects/actions/' + aid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    // Refresh current project's full
    if (state.selectedProject) {
      await loadProjectFull(state.selectedProject, true);
      renderAll();
    }
  } catch (e) {
    if (typeof toast === 'function') toast('Update failed', 'err');
  }
}

async function toggleMilestoneDone(mid, currentState) {
  var newState = currentState === 'done' ? 'upcoming' : 'done';
  try {
    await fetch('/api/projects/milestones/' + mid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState })
    });
    if (state.selectedProject) {
      await loadProjectFull(state.selectedProject, true);
      renderAll();
    }
  } catch (e) {}
}

async function resolveBlocker(bid) {
  try {
    await fetch('/api/projects/blockers/' + bid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved_at: 'now' })
    });
    if (state.selectedProject) {
      await loadProjectFull(state.selectedProject, true);
      renderAll();
    }
  } catch (e) {}
}

function _pdEnc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _pdRag(rag) {
  var map = { green: { bg: 'var(--gn)', lbl: 'Green' }, amber: { bg: 'var(--or)', lbl: 'Amber' }, red: { bg: 'var(--rd)', lbl: 'Red' } };
  var v = map[rag] || map.green;
  return '<span style="background:' + v.bg + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">' + v.lbl + '</span>';
}

function _pdHealthBar(score) {
  if (score == null) return '';
  var col = score >= 80 ? 'var(--gn)' : score >= 60 ? 'var(--or)' : score >= 40 ? '#e67e22' : 'var(--rd)';
  return '<div style="display:flex;align-items:center;gap:8px">' +
    '<span style="font-size:24px;font-weight:700;color:' + col + '">' + Math.round(score) + '</span>' +
    '<div style="flex:1;height:6px;background:var(--s2);border-radius:3px;overflow:hidden">' +
      '<div style="width:' + score + '%;height:100%;background:' + col + '"></div>' +
    '</div>' +
    '</div>';
}

function _pdRelTime(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function _pdPersonName(pid) {
  if (!pid) return '—';
  var p = DATA.people && DATA.people[pid];
  return p ? (p.n || pid) : pid;
}

// ─── Tabs layout ────────────────────────────────────────────────

function renderProjectDetailUplifted(id) {
  var p = DATA.projects[id];
  if (!p) return '<div class="empty-state">Project not found.</div>';

  // Kick off loads
  if (!p._full && !_projectsDetailLoading[id]) {
    _projectsDetailLoading[id] = true;
    loadProjectFull(id).then(function(){ _projectsDetailLoading[id] = false; renderAll(); });
  }
  if (_projectsDailyCache[id] === undefined && !_projectsDailyLoading[id]) loadProjectDaily(id);
  if (_projectsDetailTab === 'history' && !_projectsHistoryCache[id] && !_projectsHistoryLoading[id]) loadProjectHistory(id);

  var full = p._full || { milestones: p.milestones || [], actions: [], blockers: [], sources: [] };
  var daily = _projectsDailyCache[id];

  var html = '<div class="proj-detail-v2" style="display:grid;grid-template-columns:280px 1fr;gap:16px;height:100%;overflow:hidden">';

  // ── Left Rail ─────────────────────────────────────
  html += _renderProjectLeftRail(id, p, full, daily);

  // ── Main Pane ─────────────────────────────────────
  html += '<div style="overflow-y:auto;padding-right:4px">';

  // Back button + title row
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
    '<button onclick="selectProject(null)" style="padding:6px 10px;background:transparent;border:1px solid var(--bd);border-radius:4px;color:var(--tx);cursor:pointer;font-size:12px">← Portfolio</button>' +
    '<h1 style="margin:0;font-size:22px;color:var(--tx)">' + _pdEnc(p.title) + '</h1>' +
    '<button onclick="openEditProjectModal(\'' + id + '\')" style="margin-left:auto;padding:6px 10px;background:transparent;border:1px solid var(--bd);border-radius:4px;color:var(--tx);cursor:pointer;font-size:12px">Edit</button>' +
  '</div>';

  // Tab bar
  html += '<div style="display:flex;gap:4px;border-bottom:1px solid var(--bd);margin-bottom:14px">';
  var tabs = ['today', 'timeline', 'actions', 'sources', 'team', 'history'];
  var tabLabels = { today: 'Today', timeline: 'Timeline', actions: 'Actions', sources: 'Sources', team: 'Team', history: 'History' };
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var active = _projectsDetailTab === t;
    html += '<button onclick="setProjectDetailTab(\'' + t + '\')" style="padding:8px 14px;background:' +
      (active ? 'var(--s2)' : 'transparent') + ';border:none;border-bottom:2px solid ' +
      (active ? 'var(--ac)' : 'transparent') + ';color:' +
      (active ? 'var(--tx)' : 'var(--tx3)') + ';cursor:pointer;font-weight:' +
      (active ? '700' : '500') + ';font-size:13px">' + tabLabels[t] + '</button>';
  }
  html += '</div>';

  // Tab content
  if (_projectsDetailTab === 'today') html += _renderTabToday(id, p, full, daily);
  else if (_projectsDetailTab === 'timeline') html += _renderTabTimeline(id, p, full);
  else if (_projectsDetailTab === 'actions') html += _renderTabActions(id, p, full);
  else if (_projectsDetailTab === 'sources') html += _renderTabSources(id, p, full);
  else if (_projectsDetailTab === 'team') html += _renderTabTeam(id, p);
  else if (_projectsDetailTab === 'history') html += _renderTabHistory(id);

  html += '</div>'; // main pane
  html += '</div>'; // grid
  return html;
}

function _renderProjectLeftRail(id, p, full, daily) {
  var html = '<div style="background:var(--s1);border-radius:10px;padding:16px;position:sticky;top:0;align-self:start;max-height:calc(100vh - 80px);overflow-y:auto">';

  // Colour + status
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
    '<span style="width:10px;height:10px;border-radius:50%;background:' + (p.colour || 'var(--ac)') + '"></span>' +
    '<span style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:0.5px">' + _pdEnc(p.status) + '</span>' +
  '</div>';

  // Source badge (provenance)
  var srcBadge = typeof _pgSourceBadge === 'function' ? _pgSourceBadge(p) : '';
  if (srcBadge) html += '<div style="margin-bottom:10px">' + srcBadge + '</div>';

  // Context profile badge (from brief)
  if (p.context_profile) {
    var profileColors = {
      retention: 'var(--gn)', growth: 'var(--ac)', marketing: 'var(--pu)',
      platform: 'var(--bl)', legal: 'var(--rd)', finance: 'var(--or)',
      coffee: 'var(--or)', events: 'var(--cy)', analytics: 'var(--pu)',
      strategy: 'var(--ac)', ops: 'var(--tx3)', general: 'var(--tx3)'
    };
    var profCol = profileColors[p.context_profile] || 'var(--tx3)';
    html += '<div style="margin-bottom:10px">' +
      '<span title="Context profile drives source weights + KB scope" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:transparent;border:1px solid ' + profCol + ';color:' + profCol + ';border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px">' +
      '\u25C6 ' + _pdEnc(p.context_profile) +
      '</span>' +
    '</div>';
  }

  // Brief one-liner
  if (p.brief && typeof p.brief === 'object' && p.brief.one_liner) {
    html += '<div style="margin-bottom:12px;padding:8px 10px;background:var(--s2);border-radius:6px;border-left:2px solid var(--ac)">' +
      '<div style="font-size:9px;color:var(--tx3);font-weight:700;letter-spacing:0.4px;margin-bottom:3px">BRIEF</div>' +
      '<div style="font-size:11px;color:var(--tx);line-height:1.4">' + _pdEnc(p.brief.one_liner) + '</div>' +
    '</div>';
  }

  // Health + RAG
  var healthScore = daily ? daily.health_score : null;
  if (healthScore != null) {
    html += '<div style="margin-bottom:10px"><div style="font-size:10px;color:var(--tx3);margin-bottom:4px">HEALTH</div>' +
      _pdHealthBar(healthScore) + '</div>';
  }
  html += '<div style="margin-bottom:12px"><div style="font-size:10px;color:var(--tx3);margin-bottom:4px">RAG</div>' + _pdRag(p.rag || 'green') + '</div>';

  // Progress
  html += '<div style="margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx3);margin-bottom:4px"><span>PROGRESS</span><span>' + (p.progress || 0) + '%</span></div>' +
    '<div style="height:6px;background:var(--s2);border-radius:3px;overflow:hidden"><div style="width:' + (p.progress || 0) + '%;height:100%;background:' + (p.colour || 'var(--ac)') + '"></div></div>' +
  '</div>';

  // Owner
  html += '<div style="margin-bottom:10px"><div style="font-size:10px;color:var(--tx3);margin-bottom:2px">OWNER</div>' +
    '<div style="font-size:13px;font-weight:600">' + _pdEnc(_pdPersonName(p.owner)) + '</div></div>';

  if (p.team) html += '<div style="margin-bottom:10px"><div style="font-size:10px;color:var(--tx3);margin-bottom:2px">TEAM</div><div style="font-size:13px">' + _pdEnc(p.team) + '</div></div>';

  // Timing
  if (p.start_date || p.target_date) {
    html += '<div style="margin-bottom:10px">';
    if (p.start_date) html += '<div style="font-size:10px;color:var(--tx3)">STARTED <span style="color:var(--tx)">' + _pdEnc(p.start_date) + '</span></div>';
    if (p.target_date) html += '<div style="font-size:10px;color:var(--tx3)">TARGET <span style="color:var(--tx)">' + _pdEnc(p.target_date) + '</span></div>';
    html += '</div>';
  }

  // Signal counts
  if (daily && daily.sources_counts) {
    var sc = daily.sources_counts;
    var total = (sc.slack || 0) + (sc.email || 0) + (sc.jira || 0) + (sc.confluence || 0) + (sc.calendar || 0);
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">' +
      '<div style="font-size:10px;color:var(--tx3);margin-bottom:6px">24h SIGNALS · ' + total + '</div>';
    var icons = { slack: 'Slack', email: 'Email', jira: 'Jira', confluence: 'Wiki', calendar: 'Cal' };
    for (var k in icons) {
      if (sc[k] > 0) html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span style="color:var(--tx2)">' + icons[k] + '</span><span style="font-weight:600">' + sc[k] + '</span></div>';
    }
    html += '</div>';
  }

  // Quick actions
  var backfillState = p.backfill_state || 'idle';
  var backfillRunning = backfillState === 'running';
  var backfillLabel = backfillRunning ? '\u23F3 Backfilling context…' : '\u21BB Refresh KB context';
  html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd);display:flex;flex-direction:column;gap:6px">' +
    '<button onclick="regenerateProjectDaily(\'' + id + '\')" style="padding:7px;background:var(--ac);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">Regenerate Today\'s Update</button>' +
    '<button onclick="refreshProjectContext(\'' + id + '\')" ' + (backfillRunning ? 'disabled ' : '') +
      'style="padding:7px;background:' + (backfillRunning ? 'var(--s3)' : 'transparent') + ';color:var(--tx);border:1px solid var(--bd);border-radius:4px;cursor:' + (backfillRunning ? 'wait' : 'pointer') + ';font-size:11px;font-weight:600">' + backfillLabel + '</button>' +
    '<button onclick="openEditProjectModal(\'' + id + '\')" style="padding:7px;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:4px;cursor:pointer;font-size:11px">Edit Project</button>' +
  '</div>';

  // Backfill context summary (if counts available)
  var counts = p.backfill_counts;
  if (counts && typeof counts === 'object') {
    var total = (counts.slack || 0) + (counts.email || 0) + (counts.jira || 0) + (counts.confluence || 0) + (counts.calendar || 0) + (counts.kb || 0);
    if (total > 0) {
      html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">' +
        '<div style="font-size:10px;color:var(--tx3);margin-bottom:6px">CONTEXT SOURCES \u00B7 ' + total + '</div>';
      var parts = [];
      if (counts.slack) parts.push('Slack ' + counts.slack);
      if (counts.email) parts.push('Email ' + counts.email);
      if (counts.jira) parts.push('Jira ' + counts.jira);
      if (counts.confluence) parts.push('Confluence ' + counts.confluence);
      if (counts.calendar) parts.push('Calendar ' + counts.calendar);
      if (counts.kb) parts.push('KB ' + counts.kb);
      html += '<div style="font-size:10px;color:var(--tx2);line-height:1.5">' + parts.join(' \u00B7 ') + '</div>' +
      '</div>';
    }
  }

  html += '</div>';
  return html;
}

function _renderTabToday(id, p, full, daily) {
  if (_projectsDailyLoading[id]) {
    return '<div style="padding:40px;text-align:center;color:var(--tx3)">Synthesizing today\'s update…</div>';
  }
  if (!daily) {
    return '<div style="padding:40px;text-align:center;background:var(--s1);border-radius:10px">' +
      '<div style="color:var(--tx3);margin-bottom:12px">No daily update yet.</div>' +
      '<button onclick="loadProjectDaily(\'' + id + '\', {synthesize:1})" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">Generate Today\'s Update</button>' +
    '</div>';
  }

  var html = '';

  // Hero summary
  html += '<div style="background:var(--s1);border-radius:10px;padding:18px;margin-bottom:14px;border-left:4px solid ' +
    (p.colour || 'var(--ac)') + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:11px;color:var(--tx3);font-weight:700">TODAY · ' + _pdEnc(daily.date) + '</span>' +
      '<span style="font-size:10px;color:var(--tx3)">via ' + _pdEnc(daily.model_used || 'deterministic') + '</span>' +
    '</div>' +
    '<p style="font-size:15px;line-height:1.6;margin:0;color:var(--tx)">' + _pdEnc(daily.summary) + '</p>' +
  '</div>';

  var fKey = id + ':' + daily.date;
  // What moved
  html += _renderBulletCard('What moved', daily.what_moved, 'var(--gn)', fKey + ':what_moved');
  // Decisions
  html += _renderBulletCard('Decisions', daily.decisions, 'var(--bl)', fKey + ':decisions');
  // New blockers
  html += _renderBulletCard('New blockers (24h)', daily.new_blockers, 'var(--rd)', fKey + ':new_blockers');
  // Milestones touched
  html += _renderBulletCard('Milestones touched', daily.milestones_touched, 'var(--pu)', fKey + ':milestones');

  // Recommended actions
  if (daily.recommended_actions && daily.recommended_actions.length) {
    html += '<div style="background:var(--s1);border-radius:10px;padding:14px;margin-bottom:10px">' +
      '<div style="font-size:11px;color:var(--tx3);font-weight:700;margin-bottom:10px">RECOMMENDED NEXT ACTIONS</div>';
    for (var i = 0; i < daily.recommended_actions.length; i++) {
      var ra = daily.recommended_actions[i];
      var txt = typeof ra === 'string' ? ra : (ra && ra.text);
      var pri = typeof ra === 'object' && ra.priority ? ra.priority : 'normal';
      var ow = typeof ra === 'object' && ra.owner_id ? ra.owner_id : null;
      var priCol = { urgent: 'var(--rd)', high: 'var(--or)', normal: 'var(--tx3)', low: 'var(--tx3)' }[pri] || 'var(--tx3)';
      html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd);font-size:13px">' +
        '<span style="color:' + priCol + ';font-weight:700;font-size:10px;text-transform:uppercase;min-width:55px">' + _pdEnc(pri) + '</span>' +
        '<span style="flex:1;line-height:1.4">' + _pdEnc(txt) + '</span>';
      if (ow) html += '<span style="font-size:11px;color:var(--tx3)">' + _pdEnc(_pdPersonName(ow)) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Source artifacts
  if (daily.source_artifacts && daily.source_artifacts.length) {
    html += '<div style="background:var(--s1);border-radius:10px;padding:14px;margin-bottom:10px">' +
      '<div style="font-size:11px;color:var(--tx3);font-weight:700;margin-bottom:8px">SOURCE ARTIFACTS (' + daily.source_artifacts.length + ')</div>';
    for (var i = 0; i < Math.min(10, daily.source_artifacts.length); i++) {
      var a = daily.source_artifacts[i];
      html += '<div style="padding:6px 0;font-size:12px;border-bottom:1px solid var(--bd);display:flex;gap:8px">' +
        '<span style="color:var(--ac);font-weight:700;text-transform:uppercase;font-size:10px;min-width:55px">' + _pdEnc(a.source || a.source_type || '') + '</span>' +
        '<span style="flex:1;color:var(--tx2);line-height:1.4">' + _pdEnc(a.excerpt || a.title || a.source_id) + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  return html;
}

function _renderBulletCard(title, bullets, accent, feedbackKey) {
  if (!bullets || !bullets.length) return '';
  var html = '<div style="background:var(--s1);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid ' + (accent || 'var(--tx3)') + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
    '<div style="font-size:11px;color:var(--tx3);font-weight:700">' + title.toUpperCase() + ' · ' + bullets.length + '</div>';
  if (feedbackKey) {
    html += '<div style="display:flex;gap:4px">' +
      '<button onclick="sendProjectFeedback(\'' + feedbackKey + '\',\'up\')" style="background:transparent;border:1px solid var(--bd);color:var(--gn);width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px" title="Useful">▲</button>' +
      '<button onclick="sendProjectFeedback(\'' + feedbackKey + '\',\'down\')" style="background:transparent;border:1px solid var(--bd);color:var(--rd);width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px" title="Not useful">▼</button>' +
    '</div>';
  }
  html += '</div>';
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    var txt = typeof b === 'string' ? b : (b && (b.text || b.title));
    if (!txt) continue;
    html += '<div style="font-size:13px;line-height:1.5;padding:4px 0;display:flex;gap:8px">' +
      '<span style="color:' + (accent || 'var(--tx3)') + '">•</span>' +
      '<span style="flex:1">' + _pdEnc(txt) + '</span>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

async function sendProjectFeedback(key, value) {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'feedback',
        type: 'project_daily',
        target: key,
        value,
        context: { module: 'projects' }
      })
    });
    if (typeof toast === 'function') toast('Feedback recorded', 'ok');
  } catch (e) {}
}

function _renderTabTimeline(id, p, full) {
  var milestones = full.milestones || [];
  var blockers = full.blockers || [];
  if (!milestones.length && !blockers.length) return '<div class="empty-state" style="padding:30px;text-align:center;color:var(--tx3)">No milestones or blockers yet.</div>';

  var html = '';

  if (milestones.length) {
    html += '<div style="background:var(--s1);border-radius:10px;padding:16px;margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--tx3)">MILESTONES</div>' +
        '<button onclick="addMilestoneInline(\'' + id + '\')" style="padding:4px 10px;background:var(--ac);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:700">+ Add</button>' +
      '</div>';

    for (var i = 0; i < milestones.length; i++) {
      var m = milestones[i];
      var stateCol = m.state === 'done' ? 'var(--gn)' : m.state === 'active' ? 'var(--ac)' : m.state === 'slipped' ? 'var(--rd)' : 'var(--tx3)';
      var stateIcon = m.state === 'done' ? '✓' : m.state === 'active' ? '●' : '○';
      html += '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd)">' +
        '<span style="color:' + stateCol + ';font-size:16px;cursor:pointer" onclick="toggleMilestoneDone(' + m.id + ',\'' + m.state + '\')">' + stateIcon + '</span>' +
        '<span style="flex:1;font-size:13px;' + (m.state === 'done' ? 'text-decoration:line-through;color:var(--tx3)' : '') + '">' + _pdEnc(m.title) + '</span>';
      if (m.due_date) html += '<span style="font-size:11px;color:var(--tx3)">due ' + _pdEnc(m.due_date) + '</span>';
      html += '<span style="font-size:10px;color:' + stateCol + ';text-transform:uppercase">' + _pdEnc(m.state) + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  if (blockers.length) {
    html += '<div style="background:var(--s1);border-radius:10px;padding:16px;margin-bottom:12px;border-left:3px solid var(--rd)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--rd)">BLOCKERS · ' + blockers.length + '</div>' +
        '<button onclick="addBlockerInline(\'' + id + '\')" style="padding:4px 10px;background:var(--rd);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:700">+ Add</button>' +
      '</div>';
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      var sev = b.severity || 'medium';
      var sevCol = { critical: 'var(--rd)', high: 'var(--or)', medium: 'var(--tx3)', low: 'var(--tx3)' }[sev];
      html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd);align-items:center">' +
        '<span style="color:' + sevCol + ';font-weight:700;font-size:10px;text-transform:uppercase;min-width:60px">' + sev + '</span>' +
        '<span style="flex:1;font-size:13px">' + _pdEnc(b.text) + '</span>' +
        '<span style="font-size:10px;color:var(--tx3)">' + _pdRelTime(b.opened_at) + '</span>' +
        '<button onclick="resolveBlocker(' + b.id + ')" style="padding:3px 8px;background:var(--gn);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px">Resolve</button>' +
      '</div>';
    }
    html += '</div>';
  }

  return html;
}

function _renderTabActions(id, p, full) {
  var actions = full.actions || [];
  if (!actions.length) {
    return '<div class="empty-state" style="padding:30px;text-align:center;color:var(--tx3)">' +
      '<div>No open actions.</div>' +
      '<button onclick="addActionInline(\'' + id + '\')" style="margin-top:12px;padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">+ Add Action</button>' +
    '</div>';
  }
  var html = '<div style="background:var(--s1);border-radius:10px;padding:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--tx3)">OPEN ACTIONS · ' + actions.length + '</div>' +
      '<button onclick="addActionInline(\'' + id + '\')" style="padding:4px 10px;background:var(--ac);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:700">+ Add</button>' +
    '</div>';
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    var priCol = { urgent: 'var(--rd)', high: 'var(--or)', normal: 'var(--tx3)', low: 'var(--tx3)' }[a.priority] || 'var(--tx3)';
    var originLabel = a.origin === 'ai_synthesis' ? 'AI' : a.origin === 'manual' ? '' : a.origin;
    html += '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd);align-items:flex-start">' +
      '<input type="checkbox"' + (a.status === 'done' ? ' checked' : '') + ' onchange="toggleActionDone(' + a.id + ',\'' + a.status + '\')" style="margin-top:2px" />' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;line-height:1.5;' + (a.status === 'done' ? 'text-decoration:line-through;color:var(--tx3)' : '') + '">' + _pdEnc(a.text) + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:4px;font-size:10px;color:var(--tx3)">' +
          '<span style="color:' + priCol + ';font-weight:600;text-transform:uppercase">' + _pdEnc(a.priority) + '</span>';
    if (a.owner_id) html += '<span>' + _pdEnc(_pdPersonName(a.owner_id)) + '</span>';
    if (a.due_date) html += '<span>due ' + _pdEnc(a.due_date) + '</span>';
    if (originLabel) html += '<span style="background:var(--s2);padding:1px 6px;border-radius:8px">' + _pdEnc(originLabel) + '</span>';
    html += '</div></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function _renderTabSources(id, p, full) {
  var sources = (full.sources || []).slice();
  sources.sort(function(a, b) {
    var aT = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    var bT = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return bT - aT;
  });
  if (!sources.length) return '<div class="empty-state" style="padding:30px;text-align:center;color:var(--tx3)">No linked sources yet. Run /api/projects-daily/' + id + '/regenerate to populate.</div>';

  var byType = { slack: [], email: [], jira: [], confluence: [], calendar: [] };
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    (byType[s.source_type] = byType[s.source_type] || []).push(s);
  }

  var html = '';
  var labels = { slack: 'Slack Threads', email: 'Email Threads', jira: 'Jira Issues', confluence: 'Confluence Pages', calendar: 'Calendar Events' };
  var colours = { slack: 'var(--ac)', email: 'var(--bl)', jira: 'var(--pu)', confluence: 'var(--gn)', calendar: 'var(--or)' };
  for (var k in labels) {
    var arr = byType[k];
    if (!arr || !arr.length) continue;
    html += '<div style="background:var(--s1);border-radius:10px;padding:14px;margin-bottom:10px;border-left:3px solid ' + colours[k] + '">' +
      '<div style="font-size:11px;color:var(--tx3);font-weight:700;margin-bottom:8px">' + labels[k].toUpperCase() + ' · ' + arr.length + '</div>';
    for (var j = 0; j < Math.min(20, arr.length); j++) {
      var s = arr[j];
      var linkOpen = s.url ? '<a href="' + _pdEnc(s.url) + '" target="_blank" style="color:inherit;text-decoration:none">' : '<a href="#" onclick="navigateToSource(\'' + s.source_type + '\',\'' + _pdEnc(s.source_id) + '\');return false" style="color:inherit;text-decoration:none">';
      html += linkOpen + '<div style="padding:5px 0;border-bottom:1px solid var(--bd);display:flex;gap:8px;font-size:12px">' +
        '<span style="flex:1;color:var(--tx);line-height:1.4">' + _pdEnc(s.title || s.source_id) + '</span>' +
        '<span style="font-size:10px;color:var(--tx3)">' + _pdRelTime(s.last_seen_at) + '</span>' +
        '<span style="font-size:10px;color:var(--tx3);min-width:40px;text-align:right">' + (s.relevance ? (s.relevance * 100).toFixed(0) + '%' : '') + '</span>' +
      '</div></a>';
    }
    html += '</div>';
  }
  return html;
}

function navigateToSource(type, sourceId) {
  if (type === 'slack' || type === 'email') {
    state.module = 'comms';
    state.selectedThread = sourceId;
    renderAll();
  }
}

function _renderTabTeam(id, p) {
  var ids = (p.people_ids || p.people || []);
  if (!ids.length) return '<div class="empty-state" style="padding:30px;text-align:center;color:var(--tx3)">No people linked to this project.</div>';
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">';
  for (var i = 0; i < ids.length; i++) {
    var pid = ids[i];
    var pp = (DATA.people && DATA.people[pid]) || { n: pid, role: '', initials: '?' };
    html += '<div onclick="navToPerson(\'' + pid + '\')" style="background:var(--s1);border-radius:8px;padding:12px;cursor:pointer;display:flex;gap:10px;align-items:center">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:' + (pp.colour || 'var(--ac)') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">' + _pdEnc(pp.initials || pp.n.charAt(0)) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pdEnc(pp.n) + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _pdEnc(pp.role || '') + '</div>' +
      '</div>' +
      (pid === p.owner ? '<span style="background:var(--ac);color:#fff;padding:2px 6px;border-radius:8px;font-size:9px;font-weight:700">OWNER</span>' : '') +
    '</div>';
  }
  html += '</div>';
  return html;
}

function _renderTabHistory(id) {
  var list = _projectsHistoryCache[id];
  if (!list) return '<div style="padding:30px;text-align:center;color:var(--tx3)">Loading history…</div>';
  if (!list.length) return '<div style="padding:30px;text-align:center;color:var(--tx3)">No past updates yet.</div>';

  var html = '';
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    html += '<div style="background:var(--s1);border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid ' + (u.rag_suggested === 'red' ? 'var(--rd)' : u.rag_suggested === 'amber' ? 'var(--or)' : 'var(--gn)') + '">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx3);margin-bottom:4px">' +
        '<span style="font-weight:700">' + _pdEnc(u.date) + '</span>' +
        '<span>' + (u.health_score != null ? 'H' + Math.round(u.health_score) : '') + ' · via ' + _pdEnc(u.model_used || '') + '</span>' +
      '</div>' +
      '<div style="font-size:13px;line-height:1.5;color:var(--tx)">' + _pdEnc(u.summary || '') + '</div>' +
    '</div>';
  }
  return html;
}

// ─── Inline add helpers ─────────────────────────────────────────

async function addMilestoneInline(id) {
  var values = await openModal({
    title: 'Add Milestone',
    maxWidth: '520px',
    submitLabel: 'Add Milestone',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Pilot launch complete' },
      { name: 'due_date', label: 'Target date', type: 'date' },
      { name: 'state', label: 'State', type: 'select', value: 'upcoming',
        options: [{ value: 'upcoming', label: 'Upcoming' }, { value: 'active', label: 'Active' }, { value: 'done', label: 'Done' }, { value: 'slipped', label: 'Slipped' }] }
    ]
  });
  if (!values) return;
  try {
    await apiAddMilestone(id, values);
    await loadProjectFull(id, true);
    renderAll();
    if (typeof toast === 'function') toast('Milestone added', 'ok');
  } catch (e) { if (typeof toast === 'function') toast('Add failed: ' + e.message, 'err'); }
}

async function addActionInline(id) {
  var p = DATA && DATA.projects && DATA.projects[id];
  var peopleIds = p ? (p.people_ids || p.people || []) : [];
  var ownerOptions = [{ value: '', label: '— unassigned —' }].concat(peopleIds.map(function(pid) {
    return { value: pid, label: (DATA.people && DATA.people[pid] && DATA.people[pid].n) || pid };
  }));
  var values = await openModal({
    title: 'Add Action',
    maxWidth: '520px',
    submitLabel: 'Add Action',
    fields: [
      { name: 'text', label: 'Action', type: 'text', required: true, placeholder: 'e.g. Follow up with Ally on US launch' },
      { name: 'priority', label: 'Priority', type: 'select', value: 'normal',
        options: [{ value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }] },
      { name: 'owner_id', label: 'Assign to', type: 'select', value: '', options: ownerOptions },
      { name: 'due_date', label: 'Due date', type: 'date' }
    ]
  });
  if (!values) return;
  try {
    await apiAddAction(id, values);
    await loadProjectFull(id, true);
    renderAll();
    if (typeof toast === 'function') toast('Action added', 'ok');
  } catch (e) { if (typeof toast === 'function') toast('Add failed: ' + e.message, 'err'); }
}

async function addBlockerInline(id) {
  var values = await openModal({
    title: 'Add Blocker',
    maxWidth: '520px',
    submitLabel: 'Add Blocker',
    fields: [
      { name: 'text', label: 'Blocker', type: 'textarea', required: true, placeholder: 'What\'s blocking progress?' },
      { name: 'severity', label: 'Severity', type: 'select', value: 'medium',
        options: [{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }] }
    ]
  });
  if (!values) return;
  try {
    await apiAddBlocker(id, values);
    await loadProjectFull(id, true);
    renderAll();
    if (typeof toast === 'function') toast('Blocker added', 'ok');
  } catch (e) { if (typeof toast === 'function') toast('Add failed: ' + e.message, 'err'); }
}

// ─── Wire into mod-projects.js ──────────────────────────────────
// Override _renderProjectDetail by wrapping the call in renderProjectsMain.
// We monkey-patch by replacing the function AFTER mod-projects.js is loaded.
(function() {
  if (typeof renderProjectsMain !== 'function') return;
  var _origMain = renderProjectsMain;
  renderProjectsMain = function() {
    var el = $('main');
    var panelEl = document.getElementById('jira-detail-panel');
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.id = 'jira-detail-panel';
      document.body.appendChild(panelEl);
    }
    if (typeof _renderJiraDetailPanel === 'function') {
      panelEl.innerHTML = state._jiraDetailKey ? _renderJiraDetailPanel() : '';
    }

    if (state.selectedProject && DATA.projects[state.selectedProject]) {
      el.innerHTML = renderProjectDetailUplifted(state.selectedProject);
    } else {
      // Grid view — call legacy for now (Phase 6 will uplift)
      _origMain();
    }
  };
})();
