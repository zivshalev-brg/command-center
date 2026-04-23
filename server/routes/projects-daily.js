// /api/projects-daily — daily synthesis read/regenerate/history.
// Mounts under /api/projects-daily (distinct from CRUD to keep routing simple).
//
// Routes:
//   GET    /api/projects-daily/:id                       → today (or ?date=YYYY-MM-DD)
//   GET    /api/projects-daily/:id?synthesize=1          → trigger if missing
//   POST   /api/projects-daily/:id/regenerate            → force synthesis
//   GET    /api/projects-daily/:id/history?days=14       → last N updates
//   POST   /api/projects-daily/run-all                   → synthesize all (force)

const { jsonReply } = require('../lib/helpers');
const store = require('../lib/project-store');
const { synthesizeProject, synthesizeAll } = require('../lib/project-synthesis');

function _todayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

module.exports = async function handleProjectsDaily(req, res, parts, url, ctx) {
  // parts may be ['projects-daily', ...] or sliced — normalise
  const normalized = parts[0] === 'projects-daily' ? parts.slice(1) : parts;
  const id = normalized[0];
  const sub = normalized[1];

  if (!id && sub === 'run-all' && req.method === 'POST') {
    const r = await synthesizeAll(ctx, { force: true });
    return jsonReply(res, 200, r);
  }
  if (id === 'run-all' && req.method === 'POST') {
    const r = await synthesizeAll(ctx, { force: true });
    return jsonReply(res, 200, r);
  }

  if (!id) return jsonReply(res, 400, { error: 'project id required' });

  const project = store.getProject(id);
  if (!project) return jsonReply(res, 404, { error: 'project not found' });

  const date = url.searchParams.get('date') || _todayDate();
  const synthesize = url.searchParams.get('synthesize') === '1';

  if (!sub && req.method === 'GET') {
    let update = store.getUpdate(id, date);
    if (!update && synthesize) {
      try {
        update = await synthesizeProject(ctx, id, { date, force: true });
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }
    if (!update) {
      // Return latest prior update
      const latest = store.getLatestUpdate(id);
      return jsonReply(res, 200, { update: null, latest });
    }
    return jsonReply(res, 200, { update });
  }

  if (sub === 'regenerate' && req.method === 'POST') {
    try {
      const update = await synthesizeProject(ctx, id, { date, force: true });
      return jsonReply(res, 200, { update });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  if (sub === 'history' && req.method === 'GET') {
    const days = Math.min(60, Number(url.searchParams.get('days') || 14));
    const updates = store.listUpdates(id, days);
    return jsonReply(res, 200, { updates });
  }

  return jsonReply(res, 404, { error: 'Unknown projects-daily endpoint' });
};
