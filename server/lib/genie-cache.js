'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

// ─── Genie Cache ─────────────────────────────────────────────
// SQLite-backed cache for Databricks Genie query results.
// Uses SHA-256 hashes of SQL text as keys with configurable TTL.

// ─── Schema initialisation ───────────────────────────────────

let _initialised = false;

function ensureTable() {
  if (_initialised) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS genie_cache (
      query_hash  TEXT PRIMARY KEY,
      sql_text    TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ttl_minutes INTEGER DEFAULT 60,
      row_count   INTEGER DEFAULT 0,
      metric_key  TEXT
    );
  `);
  _initialised = true;
}

// ─── Hash helper ─────────────────────────────────────────────

function hashSQL(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

// ─── Cache operations ────────────────────────────────────────

/**
 * Look up a cached result for the given SQL.
 * Returns the parsed result object if found and within TTL, or null.
 * @param {string} sql
 * @returns {Object|null} - { columns, rows, rowCount } or null
 */
function getCached(sql) {
  ensureTable();

  if (!sql || typeof sql !== 'string') return null;

  const db = getDb();
  const hash = hashSQL(sql);

  const row = db.prepare(`
    SELECT result_json, created_at, ttl_minutes
    FROM genie_cache
    WHERE query_hash = ?
  `).get(hash);

  if (!row) return null;

  // Check TTL expiry
  const createdAt = new Date(row.created_at + 'Z').getTime();
  const ttlMs = (row.ttl_minutes || 60) * 60 * 1000;
  const now = Date.now();

  if (now - createdAt > ttlMs) {
    // Expired — remove and return null
    db.prepare('DELETE FROM genie_cache WHERE query_hash = ?').run(hash);
    return null;
  }

  try {
    return JSON.parse(row.result_json);
  } catch {
    // Corrupt entry — remove it
    db.prepare('DELETE FROM genie_cache WHERE query_hash = ?').run(hash);
    return null;
  }
}

/**
 * Store a query result in the cache.
 * @param {string} sql - The SQL query text
 * @param {Object} result - { columns, rows, rowCount }
 * @param {number} [ttlMinutes=60] - Cache lifetime in minutes
 * @param {string} [metricKey] - Optional metric identifier for targeted invalidation
 */
function setCache(sql, result, ttlMinutes, metricKey) {
  ensureTable();

  if (!sql || typeof sql !== 'string') {
    throw new Error('sql must be a non-empty string');
  }
  if (!result || typeof result !== 'object') {
    throw new Error('result must be an object');
  }

  const db = getDb();
  const hash = hashSQL(sql);
  const resultJson = JSON.stringify(result);
  const rowCount = result.rowCount || (result.rows ? result.rows.length : 0);

  db.prepare(`
    INSERT OR REPLACE INTO genie_cache (query_hash, sql_text, result_json, created_at, ttl_minutes, row_count, metric_key)
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
  `).run(hash, sql, resultJson, ttlMinutes || 60, rowCount, metricKey || null);
}

/**
 * Delete all cached entries.
 */
function invalidateAll() {
  ensureTable();
  const db = getDb();
  db.prepare('DELETE FROM genie_cache').run();
}

/**
 * Delete cached entries for a specific metric key.
 * @param {string} metricKey
 */
function invalidateMetric(metricKey) {
  ensureTable();

  if (!metricKey) return;

  const db = getDb();
  db.prepare('DELETE FROM genie_cache WHERE metric_key = ?').run(metricKey);
}

/**
 * Return cache statistics.
 * @returns {{ entries: number, hitRate: string, oldestEntry: string|null }}
 */
function getCacheStats() {
  ensureTable();
  const db = getDb();

  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM genie_cache').get();
  const entries = countRow ? countRow.cnt : 0;

  const oldestRow = db.prepare(
    'SELECT MIN(created_at) AS oldest FROM genie_cache'
  ).get();

  // Hit rate is approximate — based on expired vs total entries
  const expiredRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM genie_cache
    WHERE (julianday('now') - julianday(created_at)) * 24 * 60 > ttl_minutes
  `).get();
  const expired = expiredRow ? expiredRow.cnt : 0;
  const valid = entries - expired;
  const hitRate = entries > 0
    ? `${Math.round((valid / entries) * 100)}%`
    : 'N/A';

  return {
    entries,
    hitRate,
    oldestEntry: (oldestRow && oldestRow.oldest) ? oldestRow.oldest : null
  };
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = { getCached, setCache, invalidateAll, invalidateMetric, getCacheStats };
