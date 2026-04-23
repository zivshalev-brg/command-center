// Thin TTL wrapper around project_updates table for the daily route.
// The DB is already the persistent store; this layer avoids regenerating
// within a short window unless explicitly forced.

const store = require('./project-store');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedOrNull(projectId, date, ttlMs) {
  const update = store.getUpdate(projectId, date);
  if (!update) return null;
  if (update.generated_at) {
    const age = Date.now() - new Date(update.generated_at.replace(' ', 'T') + 'Z').getTime();
    if (age > (ttlMs || DEFAULT_TTL_MS)) return { ...update, stale: true };
  }
  return update;
}

function touchUpdate(projectId, date) {
  // Touch the row so TTL restarts — used when a user regenerates intentionally.
  // For our single-row-per-day model this is a no-op: upsertUpdate handles refresh.
  return store.getUpdate(projectId, date);
}

module.exports = { getCachedOrNull, touchUpdate };
