// Projects API — fetch wrappers + DB ↔ DATA.projects shape bridge.
// All project fetches flow through this module so the rest of the app
// can migrate gradually from the legacy DATA.projects dict to DB-backed data.

// ─── In-memory caches ──────────────────────────────────────────
var _projectsOverviewCache = null;      // array of overview rows
var _projectsOverviewLoadedAt = 0;
var _projectsFullCache = {};            // { id: full project }
var _archivedProjects = {};             // id → shape (archived only)

// ─── Shape bridges (DB row → legacy DATA.projects row) ─────────

function _toLegacyProjectShape(dbProject, full) {
  var milestones = (full && full.milestones) || [];
  var blockers = (full && full.blockers) || [];
  var actions = (full && full.actions) || [];
  return {
    // Legacy fields (preserved for existing render code)
    title: dbProject.title,
    status: dbProject.status,
    colour: dbProject.colour,
    owner: dbProject.owner_id,
    progress: dbProject.progress,
    desc: dbProject.description || '',
    milestones: milestones.map(function(m){ return { t: m.title, s: m.state, id: m.id, due: m.due_date }; }),
    blockers: blockers.map(function(b){ return b.text; }),
    nextActions: actions.map(function(a){ return a.text; }),
    people: dbProject.people_ids || [],
    commLinks: dbProject.classifier_tags || [],
    // New fields (used by uplifted views)
    id: dbProject.id,
    rag: dbProject.rag || 'green',
    priority: dbProject.priority ?? 50,
    team: dbProject.team,
    start_date: dbProject.start_date,
    target_date: dbProject.target_date,
    aliases: dbProject.aliases || [],
    classifier_tags: dbProject.classifier_tags || [],
    metric_keys: dbProject.metric_keys || [],
    news_keywords: dbProject.news_keywords || [],
    // Provenance / archive / backfill fields
    source: dbProject.source || 'manual',
    auto_discovery_confidence: dbProject.auto_discovery_confidence,
    archived_at: dbProject.archived_at,
    backfill_state: dbProject.backfill_state,
    backfill_started_at: dbProject.backfill_started_at,
    backfill_completed_at: dbProject.backfill_completed_at,
    backfill_counts: dbProject.backfill_counts,
    // Brief fields
    brief: dbProject.brief || null,
    context_profile: dbProject.context_profile,
    brief_generated_at: dbProject.brief_generated_at,
    _full: full || null,
    _overview: null
  };
}

// ─── Loaders ──────────────────────────────────────────────────

async function loadProjectsFromDb() {
  try {
    // Fetch ALL projects (active + archived). Split into active DATA.projects
    // and _archivedProjects for the Archived tab.
    var resp = await fetch('/api/projects?all=1');
    if (!resp.ok) return null;
    var data = await resp.json();
    var list = data.projects || [];
    var activeList = list.filter(function(p){ return p.status !== 'archived'; });
    var archivedList = list.filter(function(p){ return p.status === 'archived'; });

    // Only fetch /full for active projects (archived rarely need full detail)
    var fullResponses = await Promise.all(activeList.map(function(p) {
      return fetch('/api/projects/' + encodeURIComponent(p.id) + '/full')
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function(){ return null; });
    }));
    var dict = {};
    for (var i = 0; i < activeList.length; i++) {
      var p = activeList[i];
      var full = fullResponses[i] ? fullResponses[i].project : null;
      dict[p.id] = _toLegacyProjectShape(p, full);
      if (full) _projectsFullCache[p.id] = full;
    }
    var archDict = {};
    for (var j = 0; j < archivedList.length; j++) {
      var ap = archivedList[j];
      archDict[ap.id] = _toLegacyProjectShape(ap, null);
    }
    _archivedProjects = archDict;
    if (typeof DATA !== 'undefined') DATA.projects = dict;
    return dict;
  } catch (e) {
    console.warn('[Projects] loadProjectsFromDb failed:', e);
    return null;
  }
}

async function apiUnarchiveProject(id) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active', archived_at: null })
  });
  if (!resp.ok) throw new Error('Unarchive failed: ' + resp.status);
  await loadProjectsFromDb();
  delete _projectsFullCache[id];
  return true;
}

async function apiBackfillContext(id) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(id) + '/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!resp.ok) throw new Error('Backfill failed: ' + resp.status);
  return resp.json();
}

async function loadProjectsOverview(force) {
  if (!force && _projectsOverviewCache && (Date.now() - _projectsOverviewLoadedAt) < 30000) {
    return _projectsOverviewCache;
  }
  try {
    var resp = await fetch('/api/projects/overview');
    if (!resp.ok) return null;
    var data = await resp.json();
    _projectsOverviewCache = data.projects || [];
    _projectsOverviewLoadedAt = Date.now();
    // Merge overview fields onto DATA.projects
    if (typeof DATA !== 'undefined' && DATA.projects) {
      for (var i = 0; i < _projectsOverviewCache.length; i++) {
        var row = _projectsOverviewCache[i];
        if (DATA.projects[row.id]) DATA.projects[row.id]._overview = row;
      }
    }
    return _projectsOverviewCache;
  } catch (e) {
    console.warn('[Projects] overview failed:', e);
    return null;
  }
}

async function loadProjectFull(id, force) {
  if (!force && _projectsFullCache[id]) return _projectsFullCache[id];
  try {
    var resp = await fetch('/api/projects/' + encodeURIComponent(id) + '/full');
    if (!resp.ok) return null;
    var data = await resp.json();
    _projectsFullCache[id] = data.project;
    if (typeof DATA !== 'undefined' && DATA.projects && DATA.projects[id]) {
      DATA.projects[id]._full = data.project;
      // Refresh milestones/blockers/actions from the full payload
      var patched = _toLegacyProjectShape(data.project, data.project);
      DATA.projects[id].milestones = patched.milestones;
      DATA.projects[id].blockers = patched.blockers;
      DATA.projects[id].nextActions = patched.nextActions;
    }
    return data.project;
  } catch (e) {
    console.warn('[Projects] loadProjectFull failed:', e);
    return null;
  }
}

// ─── Mutations ────────────────────────────────────────────────

async function apiCreateProject(body) {
  var resp = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Create failed: ' + resp.status);
  var data = await resp.json();
  await loadProjectsFromDb();
  return data.project;
}

async function apiUpdateProject(id, patch) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!resp.ok) throw new Error('Update failed: ' + resp.status);
  var data = await resp.json();
  await loadProjectsFromDb();
  delete _projectsFullCache[id];
  return data.project;
}

async function apiArchiveProject(id) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!resp.ok) throw new Error('Archive failed: ' + resp.status);
  await loadProjectsFromDb();
  delete _projectsFullCache[id];
  return true;
}

async function apiAddMilestone(projectId, body) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/milestones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Add milestone failed');
  delete _projectsFullCache[projectId];
  return (await resp.json()).milestone;
}

async function apiUpdateMilestone(mid, body) {
  var resp = await fetch('/api/projects/milestones/' + mid, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Update milestone failed');
  return (await resp.json()).milestone;
}

async function apiDeleteMilestone(mid) {
  var resp = await fetch('/api/projects/milestones/' + mid, { method: 'DELETE' });
  return resp.ok;
}

async function apiAddAction(projectId, body) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Add action failed');
  delete _projectsFullCache[projectId];
  return (await resp.json()).action;
}

async function apiUpdateAction(aid, body) {
  var resp = await fetch('/api/projects/actions/' + aid, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Update action failed');
  return (await resp.json()).action;
}

async function apiDeleteAction(aid) {
  var resp = await fetch('/api/projects/actions/' + aid, { method: 'DELETE' });
  return resp.ok;
}

async function apiAddBlocker(projectId, body) {
  var resp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/blockers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Add blocker failed');
  delete _projectsFullCache[projectId];
  return (await resp.json()).blocker;
}

async function apiUpdateBlocker(bid, body) {
  var resp = await fetch('/api/projects/blockers/' + bid, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Update blocker failed');
  return (await resp.json()).blocker;
}

async function apiDeleteBlocker(bid) {
  var resp = await fetch('/api/projects/blockers/' + bid, { method: 'DELETE' });
  return resp.ok;
}
