const { jsonReply, readBody } = require('../lib/helpers');
const {
  setThreadStatus, getThreadStatuses, clearExpiredSnoozes,
  dismissItem, undismissItem, getDismissedItems,
  setPinned, getPinnedItems,
  getCompletedThreads, getCompletedThreadIds,
  logAction, getActionLog
} = require('../lib/db');

module.exports = async function handleStatus(req, res, parts, url, ctx) {
  // GET /api/status/threads — all thread statuses + pinned (includes completed as 'done')
  if (parts[1] === 'threads' && req.method === 'GET') {
    clearExpiredSnoozes();
    const statuses = getThreadStatuses();
    const pinned = getPinnedItems('thread');
    const pinnedMap = {};
    pinned.forEach(p => { pinnedMap[p.item_id] = true; });
    return jsonReply(res, 200, { statuses, pinned: pinnedMap });
  }

  // POST /api/status/thread — set thread status
  if (parts[1] === 'thread' && req.method === 'POST') {
    const body = await readBody(req);
    const { threadId, status, snoozedUntil, source, subject } = body;
    if (!threadId || !status) return jsonReply(res, 400, { error: 'threadId and status required' });
    setThreadStatus(threadId, status, snoozedUntil || null, { source, subject });
    return jsonReply(res, 200, { ok: true });
  }

  // POST /api/status/pin — toggle pin
  if (parts[1] === 'pin' && req.method === 'POST') {
    const body = await readBody(req);
    const { itemId, pinned, itemType } = body;
    if (!itemId) return jsonReply(res, 400, { error: 'itemId required' });
    setPinned(itemId, pinned !== false, itemType || 'thread');
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/status/dismissed — all dismissed items
  if (parts[1] === 'dismissed' && req.method === 'GET') {
    const type = url.searchParams.get('type') || null;
    const items = getDismissedItems(type);
    return jsonReply(res, 200, { items });
  }

  // POST /api/status/dismiss — dismiss an item
  if (parts[1] === 'dismiss' && req.method === 'POST') {
    const body = await readBody(req);
    const { itemId, itemType, undo } = body;
    if (!itemId) return jsonReply(res, 400, { error: 'itemId required' });
    if (undo) undismissItem(itemId);
    else dismissItem(itemId, itemType || 'unknown');
    return jsonReply(res, 200, { ok: true });
  }

  // ─── New Phase 1 Endpoints ─────────────────────────────────

  // GET /api/status/completed — completed threads archive
  if (parts[1] === 'completed' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const items = getCompletedThreads(limit, offset);
    return jsonReply(res, 200, { items, limit, offset });
  }

  // GET /api/status/completed/ids — just the IDs (for fast filtering)
  if (parts[1] === 'completed' && parts[2] === 'ids' && req.method === 'GET') {
    const ids = getCompletedThreadIds();
    return jsonReply(res, 200, { ids });
  }

  // GET /api/status/log — action history
  if (parts[1] === 'log' && req.method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const action = url.searchParams.get('action') || null;
    const entries = getActionLog(limit, offset, action);
    return jsonReply(res, 200, { entries, limit, offset });
  }

  // POST /api/status/log — manual action log entry
  if (parts[1] === 'log' && req.method === 'POST') {
    const body = await readBody(req);
    const { action, targetId, targetType, metadata } = body;
    if (!action) return jsonReply(res, 400, { error: 'action required' });
    logAction(action, targetId, targetType, metadata);
    return jsonReply(res, 200, { ok: true });
  }

  return jsonReply(res, 404, { error: 'Unknown status endpoint' });
};
