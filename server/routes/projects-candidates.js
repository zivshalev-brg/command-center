// /api/projects-candidates — auto-discovered candidate projects.

const { jsonReply, readBody } = require('../lib/helpers');
const store = require('../lib/project-store');
const discovery = require('../lib/project-discovery');

async function parseBody(req) { try { return await readBody(req); } catch { return {}; } }

module.exports = async function handleProjectsCandidates(req, res, parts, url, ctx) {
  // parts starts at 'projects-candidates'
  const normalized = parts[0] === 'projects-candidates' ? parts.slice(1) : parts;
  const first = normalized[0];

  if (!first && req.method === 'GET') {
    const status = url.searchParams.get('status') || 'pending';
    const candidates = store.listCandidates(status);
    return jsonReply(res, 200, { candidates });
  }

  if (first === 'discover' && req.method === 'POST') {
    const body = await parseBody(req);
    try {
      // Use combined discovery (tag-based + open-ended)
      const fn = discovery.discoverAll || discovery.discoverCandidates;
      const result = await fn(ctx, body);
      return jsonReply(res, 200, result);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // POST /api/projects-candidates/reclassify — re-run AI classifier on all threads
  // with the latest project list, bypassing cache
  if (first === 'reclassify' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY required' });
    try {
      const fs = require('fs');
      const path = require('path');
      const comms = (() => { try { return JSON.parse(fs.readFileSync(ctx.commsLivePath, 'utf-8')); } catch { return {}; } })();
      const email = (() => { try { return JSON.parse(fs.readFileSync(path.join(ctx.intelDir, 'email-live.json'), 'utf-8')); } catch { return {}; } })();
      const threadsMap = Object.assign({}, comms.threads || {}, email.threads || {});
      const batch = Object.entries(threadsMap)
        .filter(([_, t]) => t && (t.subject || (Array.isArray(t.messages) && t.messages.length)))
        .slice(0, 200)   // cap per run to protect API budget
        .map(([threadId, thread]) => ({ threadId, thread }));

      const { processClassificationQueue } = require('../lib/ai-classifier');
      const db = require('../lib/db');
      // Respond immediately — run in background
      jsonReply(res, 202, { ok: true, state: 'running', thread_count: batch.length });
      processClassificationQueue(ctx.anthropicApiKey, batch, db)
        .then(r => console.log('[Reclassify]', 'classified:', r.classified, 'errors:', r.errors))
        .catch(e => console.error('[Reclassify]', e.message));
      return;
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // Per-candidate actions
  const id = Number(first);
  if (!id || Number.isNaN(id)) return jsonReply(res, 404, { error: 'unknown endpoint' });
  const action = normalized[1];

  if (action === 'accept' && req.method === 'POST') {
    const body = await parseBody(req);
    try {
      const out = await discovery.acceptCandidate(ctx, id, body);
      return jsonReply(res, 200, out);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  if (action === 'reject' && req.method === 'POST') {
    try {
      const out = discovery.rejectCandidate(id);
      return jsonReply(res, 200, out);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  if (action === 'merge' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.project_id) return jsonReply(res, 400, { error: 'project_id required' });
    try {
      const out = discovery.mergeCandidateInto(id, body.project_id);
      return jsonReply(res, 200, out);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  return jsonReply(res, 404, { error: 'unknown action' });
};
