/**
 * brain.js — Route handler for Obsidian Brain operations.
 *
 *   GET  /api/brain/status             → stats (pages, chunks, last sync, score)
 *   GET  /api/brain/score              → run brain-quality and return JSON
 *   GET  /api/brain/diagnostics?hours=N → failure-cluster report
 *   POST /api/brain/feedback           → { relPath, action: pin|dismiss|up|down }
 *   POST /api/brain/snapshot           → take snapshot, returns id
 *   GET  /api/brain/snapshots          → list
 *   POST /api/brain/revert             → { id }
 *   POST /api/brain/reindex            → rebuild chunk table
 *   GET  /api/brain/proposals          → list pending meta-agent proposals
 *   POST /api/brain/proposals/:id/approve|reject → update status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { jsonReply, readBody } = require('../lib/helpers');
const db = require('../lib/db');
const snapshots = require('../lib/brain-snapshots');
const chunks = require('../lib/obsidian-chunks');
const { getVaultPath, getSyncStatus } = require('../lib/obsidian-sync');

module.exports = async function handleBrain(req, res, parts, url, ctx) {
  const vaultPath = getVaultPath();
  const sub = parts[1];

  if (sub === 'status' && req.method === 'GET') {
    const sync = getSyncStatus();
    const stats = chunks.stats();
    let pageCount = 0;
    try {
      const rag = require('../lib/obsidian-rag');
      pageCount = rag.getStats().totalPages;
    } catch {}
    return jsonReply(res, 200, {
      vaultPath,
      lastSync: sync.lastSync,
      pages: pageCount,
      chunks: stats,
      snapshots: snapshots.listSnapshots(vaultPath).slice(0, 5),
      traces: (db.getRagTraces({ sinceHours: 24, limit: 1 }) || []).length ? 'active' : 'empty'
    });
  }

  if (sub === 'score' && req.method === 'GET') {
    const probes = url.searchParams.get('probes') || 'training';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'brain-quality.js'), vaultPath, '--probes=' + probes, '--json'], { encoding: 'utf8' });
    try { return jsonReply(res, 200, JSON.parse(out.stdout)); }
    catch (e) { return jsonReply(res, 500, { error: 'score parse failed', raw: out.stdout + out.stderr }); }
  }

  if (sub === 'diagnostics' && req.method === 'GET') {
    const hours = parseInt(url.searchParams.get('hours') || '168', 10);
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'brain-diagnostics.js'), '--hours=' + hours, '--json'], { encoding: 'utf8' });
    try { return jsonReply(res, 200, JSON.parse(out.stdout)); }
    catch (e) { return jsonReply(res, 500, { error: 'diagnostics parse failed', raw: out.stdout + out.stderr }); }
  }

  if (sub === 'feedback' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    if (!body.relPath || !body.action) return jsonReply(res, 400, { error: 'relPath and action required' });
    db.recordBrainPageFeedback(body.relPath, body.action);
    return jsonReply(res, 200, { ok: true });
  }

  if (sub === 'snapshot' && req.method === 'POST') {
    try { const s = snapshots.takeSnapshot(vaultPath); return jsonReply(res, 200, s); }
    catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  if (sub === 'snapshots' && req.method === 'GET') {
    return jsonReply(res, 200, { snapshots: snapshots.listSnapshots(vaultPath) });
  }

  if (sub === 'revert' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    if (!body.id) return jsonReply(res, 400, { error: 'id required' });
    try { const r = snapshots.revertTo(vaultPath, body.id); return jsonReply(res, 200, r); }
    catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  if (sub === 'reindex' && req.method === 'POST') {
    try { const r = chunks.reindexVault(vaultPath); return jsonReply(res, 200, r); }
    catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  if (sub === 'proposals' && !parts[2] && req.method === 'GET') {
    const status = url.searchParams.get('status') || 'pending';
    return jsonReply(res, 200, { proposals: db.listBrainProposals({ status }) });
  }

  if (sub === 'proposals' && parts[2] && parts[3] && req.method === 'POST') {
    const id = parseInt(parts[2], 10);
    const action = parts[3];
    if (!['approve', 'reject', 'merge'].includes(action)) return jsonReply(res, 400, { error: 'bad action' });
    const newStatus = action === 'merge' ? 'merged' : action === 'approve' ? 'approved' : 'rejected';
    db.updateBrainProposal(id, newStatus, 'user');
    return jsonReply(res, 200, { ok: true, id, status: newStatus });
  }

  return jsonReply(res, 404, { error: 'unknown brain endpoint' });
};
