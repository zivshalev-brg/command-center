#!/usr/bin/env node
/**
 * brain-diagnostics.js — Cluster RAG failure traces into actionable buckets.
 *
 * Usage: node scripts/brain-diagnostics.js [--hours=168] [--json]
 *
 * Clusters the last N hours of rag_traces into:
 *   empty     — zero hits returned
 *   weak      — top score < 5
 *   unused    — Claude didn't cite any returned pages
 *   dismissed — user dismissed the answer
 *
 * Prints each bucket's top queries + top implicated relPaths → what a meta-agent would target.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HOURS = (() => {
  for (const a of process.argv.slice(2)) if (a.startsWith('--hours=')) return parseInt(a.slice('--hours='.length), 10);
  return 168;
})();
const JSON_OUT = process.argv.includes('--json');

let Database;
try { Database = require('better-sqlite3'); } catch (e) {
  console.error('better-sqlite3 required. run: npm install');
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'beanz-os.db');
if (!fs.existsSync(dbPath)) { console.error('DB not found: ' + dbPath); process.exit(1); }

const db = new Database(dbPath, { readonly: true });
const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_traces'").get();
if (!hasTable) { console.log('No rag_traces yet. Run some chat queries first.'); process.exit(0); }

const rows = db.prepare(`SELECT query, hits_json, hit_count, top_score, was_answered, cited_paths, user_feedback, created_at
  FROM rag_traces
  WHERE created_at >= datetime('now', '-' || ? || ' hours')
  ORDER BY id DESC`).all(HOURS);

const buckets = { empty: [], weak: [], unused: [], dismissed: [], healthy: [] };
const pathMisses = {}; // relPath → miss count
const queryCounts = {};

for (const r of rows) {
  const q = (r.query || '').slice(0, 140);
  queryCounts[q] = (queryCounts[q] || 0) + 1;
  if (r.hit_count === 0) { buckets.empty.push(r); continue; }
  if (r.top_score < 5) { buckets.weak.push(r); continue; }
  if (r.user_feedback === 'dismiss') { buckets.dismissed.push(r); continue; }
  let hits = []; try { hits = JSON.parse(r.hits_json || '[]'); } catch {}
  let cited = []; try { cited = JSON.parse(r.cited_paths || '[]'); } catch {}
  if (hits.length && cited.length === 0 && r.was_answered === 1) {
    buckets.unused.push(r);
    hits.forEach(h => { if (h.relPath) pathMisses[h.relPath] = (pathMisses[h.relPath] || 0) + 1; });
    continue;
  }
  buckets.healthy.push(r);
}

const summary = {
  window_hours: HOURS,
  total_traces: rows.length,
  buckets: {
    empty: buckets.empty.length,
    weak: buckets.weak.length,
    unused: buckets.unused.length,
    dismissed: buckets.dismissed.length,
    healthy: buckets.healthy.length
  },
  top_empty_queries: topItems(buckets.empty.map(r => r.query), 10),
  top_weak_queries: topItems(buckets.weak.map(r => r.query), 10),
  top_unused_paths: topPairsFromCounter(pathMisses, 10)
};

function topItems(arr, n) {
  const c = {};
  arr.forEach(x => { if (x) c[x] = (c[x] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([q, count]) => ({ q, count }));
}
function topPairsFromCounter(c, n) {
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([path, count]) => ({ path, count }));
}

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('── Brain Diagnostics (last ' + HOURS + 'h) ──');
  console.log('total=' + summary.total_traces + '  empty=' + summary.buckets.empty + '  weak=' + summary.buckets.weak + '  unused=' + summary.buckets.unused + '  dismissed=' + summary.buckets.dismissed + '  healthy=' + summary.buckets.healthy);
  if (summary.top_empty_queries.length) {
    console.log('\nTop EMPTY queries (target for new pages):');
    summary.top_empty_queries.forEach(x => console.log('  ×' + x.count + '  ' + x.q));
  }
  if (summary.top_weak_queries.length) {
    console.log('\nTop WEAK queries (target for scoring boosts):');
    summary.top_weak_queries.forEach(x => console.log('  ×' + x.count + '  ' + x.q));
  }
  if (summary.top_unused_paths.length) {
    console.log('\nTop UNUSED returned paths (candidates for demotion or dismissal):');
    summary.top_unused_paths.forEach(x => console.log('  ×' + x.count + '  ' + x.path));
  }
}

db.close();
