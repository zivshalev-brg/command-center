/**
 * email-queue.js — Persistent retry queue for newsletter sends.
 *
 * When a scheduled research email fails (typically because Outlook auth
 * lapsed), we enqueue the failure. As soon as Outlook reconnects, the
 * queue auto-flushes and the user gets the report they missed.
 *
 * Queue file: kb-data/intelligence/email-queue.json
 *   [
 *     { id, feed: "tech"|"coffee", period: "daily"|"weekly",
 *       reportKey, recipients?, queuedAt, attempts, lastError }
 *   ]
 *
 * Each item references a `news_digests` row by its id (reportKey), so we
 * never re-run Opus — we just rehydrate and resend.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, '..', '..', 'kb-data', 'intelligence', 'email-queue.json');

const MAX_ATTEMPTS = 5;
const MAX_AGE_DAYS = 7; // never resend a 2-week-old report; user wants today's news

function _loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('[EmailQueue] load failed:', e.message);
    return [];
  }
}

function _saveQueue(items) {
  try {
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(items || [], null, 2), 'utf8');
  } catch (e) {
    console.error('[EmailQueue] save failed:', e.message);
  }
}

function _newId() { return 'eq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

/** Add a failed send to the queue. Idempotent on (feed, period, reportKey). */
function enqueue({ feed, period, reportKey, recipients, error }) {
  if (!feed || !period || !reportKey) return null;
  const items = _loadQueue();
  // De-dup
  const existing = items.find(i => i.feed === feed && i.period === period && i.reportKey === reportKey);
  if (existing) {
    existing.attempts = (existing.attempts || 0) + 1;
    existing.lastError = error || existing.lastError;
    existing.lastAttemptAt = new Date().toISOString();
    _saveQueue(items);
    return existing;
  }
  const item = {
    id: _newId(),
    feed, period, reportKey,
    recipients: recipients || null,
    queuedAt: new Date().toISOString(),
    attempts: 1,
    lastError: error || 'unknown',
    lastAttemptAt: new Date().toISOString()
  };
  items.push(item);
  _saveQueue(items);
  console.log('[EmailQueue] queued ' + feed + ' ' + period + ' (' + reportKey + ') · queue size=' + items.length);
  return item;
}

function getQueue() { return _loadQueue(); }

function size() { return _loadQueue().length; }

function _removeById(id) {
  const items = _loadQueue().filter(i => i.id !== id);
  _saveQueue(items);
}

function _expireOldItems() {
  const items = _loadQueue();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const fresh = items.filter(i => {
    const queued = new Date(i.queuedAt || 0).getTime();
    if (queued < cutoff) {
      console.log('[EmailQueue] expired ' + i.feed + ' ' + i.period + ' (' + (MAX_AGE_DAYS) + 'd old)');
      return false;
    }
    if ((i.attempts || 0) >= MAX_ATTEMPTS) {
      console.log('[EmailQueue] giving up on ' + i.feed + ' ' + i.period + ' (' + i.attempts + ' attempts)');
      return false;
    }
    return true;
  });
  if (fresh.length !== items.length) _saveQueue(fresh);
  return fresh;
}

/**
 * Try to send everything in the queue. Returns { attempted, sent, failed, remaining }.
 * Caller passes ctx (must have msGraph + anthropicApiKey, but anthropic isn't needed
 * because the report is already cached in news_digests).
 */
async function flushQueue(ctx) {
  const items = _expireOldItems();
  if (!items.length) return { attempted: 0, sent: 0, failed: 0, remaining: 0 };

  // Lazy-require to avoid circular deps
  const tokenStore = require('./ms-token-store');
  if (!tokenStore.isAuthenticated()) {
    console.log('[EmailQueue] skipped flush — Outlook not authenticated (' + items.length + ' queued)');
    return { attempted: 0, sent: 0, failed: 0, remaining: items.length, skipped: 'not_authenticated' };
  }

  const { sendResearchEmail, getRecipientList } = require('./research-email');
  const db = require('./db');

  let sent = 0, failed = 0, attempted = 0;
  for (const item of items) {
    attempted++;
    try {
      // Rehydrate the cached report from news_digests
      const row = db.getNewsDigest ? db.getNewsDigest(item.reportKey) : null;
      let report = null;
      if (row && row.content) {
        try { report = JSON.parse(row.content); } catch { report = null; }
      }
      // Fallback: try by period
      if (!report) {
        const latest = db.getLatestNewsDigest(item.feed === 'tech' ? 'tech_research_' + item.period : 'coffee_research_' + item.period);
        if (latest && latest.content) {
          try { report = JSON.parse(latest.content); } catch {}
        }
      }
      if (!report) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = 'cached report not found';
        item.lastAttemptAt = new Date().toISOString();
        failed++;
        continue;
      }
      const recipients = item.recipients && item.recipients.length ? item.recipients : getRecipientList();
      await sendResearchEmail(ctx, report, item.feed, recipients);
      _removeById(item.id);
      sent++;
      console.log('[EmailQueue] flushed ' + item.feed + ' ' + item.period + ' to ' + recipients.length + ' recipients');
    } catch (e) {
      item.attempts = (item.attempts || 0) + 1;
      item.lastError = e.message || String(e);
      item.lastAttemptAt = new Date().toISOString();
      failed++;
      console.error('[EmailQueue] flush failed for ' + item.feed + ' ' + item.period + ':', e.message);
      // If it's an auth failure, stop trying more items now — they'll all fail
      if (/auth|token|401|403/i.test(e.message || '')) break;
    }
  }
  // Persist updated attempt counts
  _saveQueue(_loadQueue().map(i => {
    const updated = items.find(x => x.id === i.id);
    return updated || i;
  }).filter(i => {
    // Already-sent items are gone; everything else stays
    return _loadQueue().some(x => x.id === i.id);
  }));

  const remaining = _loadQueue().length;
  return { attempted, sent, failed, remaining };
}

module.exports = { enqueue, getQueue, size, flushQueue, QUEUE_FILE };
