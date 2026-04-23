// CRUD + full-detail routes for projects, milestones, actions, blockers.
// Mounts under /api/projects.
//
// Routes:
//   GET    /api/projects                       → list active
//   GET    /api/projects?all=1                 → include archived
//   GET    /api/projects/overview              → grid overview with counts/health
//   GET    /api/projects/:id                   → single project (plain)
//   GET    /api/projects/:id/full              → full with milestones/actions/blockers/sources/updates
//   POST   /api/projects                       → create
//   PATCH  /api/projects/:id                   → update
//   DELETE /api/projects/:id                   → archive (soft)
//   DELETE /api/projects/:id?hard=1            → hard delete
//   POST   /api/projects/:id/milestones        → add milestone
//   PATCH  /api/projects/milestones/:mid       → update milestone
//   DELETE /api/projects/milestones/:mid       → delete milestone
//   POST   /api/projects/:id/actions           → add action
//   PATCH  /api/projects/actions/:aid          → update action
//   DELETE /api/projects/actions/:aid          → delete action
//   POST   /api/projects/:id/blockers          → add blocker
//   PATCH  /api/projects/blockers/:bid         → update blocker
//   DELETE /api/projects/blockers/:bid         → delete blocker

const { jsonReply, readBody } = require('../lib/helpers');
const store = require('../lib/project-store');

const RESERVED = new Set(['intelligence', 'enriched', 'overview', 'milestones', 'actions', 'blockers', 'daily', 'candidates', 'discover']);

async function parseBody(req) {
  try { return await readBody(req); } catch { return {}; }
}

function buildOverview() {
  const projects = store.listProjects();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return projects.map(p => {
    const actions = store.listActions(p.id);
    const blockers = store.listBlockers(p.id);
    const counts = store.countSourcesByType(p.id, since24h);
    const latest = store.getLatestUpdate(p.id);
    return {
      ...p,
      open_actions: actions.length,
      urgent_actions: actions.filter(a => a.priority === 'urgent').length,
      open_blockers: blockers.length,
      critical_blockers: blockers.filter(b => b.severity === 'critical').length,
      sources_24h: counts,
      latest_update: latest ? {
        date: latest.date,
        summary: latest.summary,
        health_score: latest.health_score,
        rag_suggested: latest.rag_suggested,
        momentum_delta: latest.momentum_delta
      } : null
    };
  });
}

module.exports = async function handleProjectsCrud(req, res, parts, url, ctx) {
  // parts: ['projects', ...]
  const second = parts[1];

  // GET /api/projects (list) — no second part, no ID
  if (!second && req.method === 'GET') {
    const all = url.searchParams.get('all') === '1';
    const list = store.listProjects({ includeArchived: all });
    return jsonReply(res, 200, { projects: list, count: list.length });
  }

  // POST /api/projects (create)
  if (!second && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.title) return jsonReply(res, 400, { error: 'title is required' });
    const project = store.createProject(body);
    // Fire-and-forget context backfill
    try {
      const { backfillNewProjectContext } = require('../lib/project-context-builder');
      backfillNewProjectContext(ctx, project.id).catch(e => console.error('[Backfill]', project.id, e.message));
    } catch (e) { console.error('[Backfill] setup failed:', e.message); }
    return jsonReply(res, 201, { project, backfill: 'running' });
  }

  // GET /api/projects/overview
  if (second === 'overview' && req.method === 'GET') {
    return jsonReply(res, 200, { projects: buildOverview(), generated_at: new Date().toISOString() });
  }

  // Sub-resource routes first (they use ID in parts[2], not parts[1])
  if (second === 'milestones' && parts[2]) {
    const mid = Number(parts[2]);
    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      const updated = store.updateMilestone(mid, body);
      if (!updated) return jsonReply(res, 404, { error: 'milestone not found' });
      return jsonReply(res, 200, { milestone: updated });
    }
    if (req.method === 'DELETE') {
      store.deleteMilestone(mid);
      return jsonReply(res, 200, { ok: true });
    }
  }

  if (second === 'actions' && parts[2]) {
    const aid = Number(parts[2]);
    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      const updated = store.updateAction(aid, body);
      if (!updated) return jsonReply(res, 404, { error: 'action not found' });
      return jsonReply(res, 200, { action: updated });
    }
    if (req.method === 'DELETE') {
      store.deleteAction(aid);
      return jsonReply(res, 200, { ok: true });
    }
  }

  if (second === 'blockers' && parts[2]) {
    const bid = Number(parts[2]);
    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      const updated = store.updateBlocker(bid, body);
      if (!updated) return jsonReply(res, 404, { error: 'blocker not found' });
      return jsonReply(res, 200, { blocker: updated });
    }
    if (req.method === 'DELETE') {
      store.deleteBlocker(bid);
      return jsonReply(res, 200, { ok: true });
    }
  }

  // Project-scoped routes: /api/projects/:id[/...]
  if (second && !RESERVED.has(second)) {
    const id = second;
    const sub = parts[2];

    // Single project
    if (!sub && req.method === 'GET') {
      const project = store.getProject(id);
      if (!project) return jsonReply(res, 404, { error: 'not found' });
      return jsonReply(res, 200, { project });
    }

    if (!sub && req.method === 'PATCH') {
      const body = await parseBody(req);
      const updated = store.updateProject(id, body);
      if (!updated) return jsonReply(res, 404, { error: 'not found' });
      return jsonReply(res, 200, { project: updated });
    }

    if (!sub && req.method === 'DELETE') {
      const hard = url.searchParams.get('hard') === '1';
      if (hard) {
        store.deleteProject(id);
        return jsonReply(res, 200, { ok: true, mode: 'deleted' });
      }
      const archived = store.archiveProject(id);
      if (!archived) return jsonReply(res, 404, { error: 'not found' });
      return jsonReply(res, 200, { project: archived, mode: 'archived' });
    }

    if (sub === 'full' && req.method === 'GET') {
      const full = store.getProjectFull(id);
      if (!full) return jsonReply(res, 404, { error: 'not found' });
      return jsonReply(res, 200, { project: full });
    }

    if (sub === 'brief' && req.method === 'GET') {
      const { getProjectBrief } = require('../lib/project-brief-builder');
      const brief = getProjectBrief(id);
      return jsonReply(res, 200, { brief });
    }
    if (sub === 'brief' && req.method === 'POST') {
      try {
        const { buildProjectBrief } = require('../lib/project-brief-builder');
        const brief = await buildProjectBrief(ctx, id, {});
        return jsonReply(res, 200, { brief });
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }

    if (sub === 'backfill' && req.method === 'POST') {
      const body = await parseBody(req);
      try {
        const { backfillNewProjectContext } = require('../lib/project-context-builder');
        // Fire-and-forget; respond immediately
        backfillNewProjectContext(ctx, id, { force: !!body.force }).catch(e => console.error('[Backfill]', id, e.message));
        return jsonReply(res, 202, { ok: true, state: 'running' });
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }

    if (sub === 'milestones' && req.method === 'POST') {
      const body = await parseBody(req);
      const milestone = store.addMilestone(id, body);
      return jsonReply(res, 201, { milestone });
    }

    if (sub === 'actions' && req.method === 'POST') {
      const body = await parseBody(req);
      const action = store.addAction(id, body);
      return jsonReply(res, 201, { action });
    }

    if (sub === 'blockers' && req.method === 'POST') {
      const body = await parseBody(req);
      const blocker = store.addBlocker(id, body);
      return jsonReply(res, 201, { blocker });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown projects endpoint', method: req.method, parts });
};
