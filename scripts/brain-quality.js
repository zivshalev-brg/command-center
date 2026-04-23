#!/usr/bin/env node
/**
 * brain-quality.js — Mechanical brain-quality score.
 *
 * Usage:
 *   node scripts/brain-quality.js [vault-path] [--probes=training|holdout|both] [--json]
 *
 * Prints (single-line, greppable):
 *   score=XX.X  H=XX  R=XX  U=XX  pages=N  broken=N  orphans=N  probe_hits=N
 *
 * Three sub-scores:
 *   H = Hygiene       (frontmatter, broken wikilinks, dead paths, dup titles, stale pages)
 *   R = Retrieval     (avg hits against probe set; 0-hit queries are the key signal)
 *   U = User-truth    (pin rate − dismiss rate from brain_page_feedback, 7-day window)
 *
 * Blended score = 0.35*H + 0.45*R + 0.20*U, on a 0-100 scale.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VAULT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : (process.env.OBSIDIAN_VAULT_PATH || path.join(process.env.USERPROFILE || process.env.HOME || '', 'BeanzOS-Brain'));

const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const PROBE_SET = (() => {
  for (const f of flags) if (f.startsWith('--probes=')) return f.slice('--probes='.length);
  return 'training';
})();
const JSON_OUT = flags.has('--json');

if (!fs.existsSync(VAULT)) {
  console.log('score=0 H=0 R=0 U=0 pages=0 broken=0 orphans=0 probe_hits=0 error=vault_missing');
  process.exit(1);
}

// ─── Walk vault ─────────────────────────────────────────────
const pages = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!name.endsWith('.md')) continue;
    if (name === '_Index.md' || name === 'index.md' || name === 'log.md') continue;
    const raw = fs.readFileSync(full, 'utf-8');
    const { fm, body } = parseFm(raw);
    const rel = path.relative(VAULT, full).replace(/\\/g, '/');
    pages.push({
      relPath: rel,
      section: rel.split('/')[0] || 'root',
      title: (fm.title || name.replace('.md', '')).replace(/^"|"$/g, ''),
      fm,
      body,
      chars: body.length,
      mtime: st.mtime.getTime()
    });
  }
})(VAULT);

function parseFm(raw) {
  if (!raw.startsWith('---')) return { fm: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).trim();
  const fm = {};
  block.split('\n').forEach(line => {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (!m) return;
    let val = m[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      try { val = JSON.parse(val); } catch { val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); }
    } else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    fm[m[1]] = val;
  });
  return { fm, body };
}

// ─── Score-H (Hygiene) ──────────────────────────────────────
const REQUIRED_FM = ['title', 'type'];
const PREFERRED_FM = ['description', 'status', 'owner', 'market', 'tags', 'aliases', 'related'];
let validFm = 0;
let brokenLinks = 0;
let deadPaths = 0;
const titleCount = {};
pages.forEach(p => {
  const hasRequired = REQUIRED_FM.every(k => p.fm[k] && String(p.fm[k]).length);
  const preferredMatched = PREFERRED_FM.filter(k => p.fm[k] !== undefined).length;
  if (hasRequired && preferredMatched >= 4) validFm++;
  titleCount[p.title.toLowerCase()] = (titleCount[p.title.toLowerCase()] || 0) + 1;

  // Count wikilinks + check they resolve
  const wikilinks = (p.body.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g) || []);
  wikilinks.forEach(wl => {
    const target = wl.replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
    if (!target) return;
    const resolved = pages.some(q => q.title.toLowerCase() === target.toLowerCase() || q.relPath.toLowerCase().endsWith('/' + target.toLowerCase() + '.md'));
    if (!resolved) brokenLinks++;
  });

  // Relative .md links
  const relLinks = (p.body.match(/\]\(([^)]+\.md)\)/g) || []);
  relLinks.forEach(l => {
    const m = l.match(/\(([^)]+)\)/);
    if (!m) return;
    const target = m[1];
    if (target.startsWith('http')) return;
    const resolved = pages.some(q => q.relPath.endsWith(target));
    if (!resolved) deadPaths++;
  });
});

const duplicateTitles = Object.values(titleCount).filter(c => c > 1).length;
const staleDays = 60;
const staleCutoff = Date.now() - staleDays * 86400000;
const stalePages = pages.filter(p => p.mtime < staleCutoff).length;

// Backlink graph → orphan detection
const incoming = {};
pages.forEach(p => {
  const wikilinks = (p.body.match(/\[\[([^\]|#]+)/g) || []).map(wl => wl.replace(/^\[\[/, '').toLowerCase());
  wikilinks.forEach(target => {
    pages.forEach(q => {
      if (q.title.toLowerCase() === target) incoming[q.relPath] = (incoming[q.relPath] || 0) + 1;
    });
  });
});
const orphans = pages.filter(p => !incoming[p.relPath] && !p.section.startsWith('000') && !p.section.startsWith('Templates')).length;

// Wikilink density (avg, capped)
const totalWikilinks = pages.reduce((s, p) => s + (p.body.match(/\[\[/g) || []).length, 0);
const wikilinkDensity = pages.length ? Math.min(totalWikilinks / pages.length, 10) : 0;

// Hygiene 0-100
const fmHygiene = pages.length ? (validFm / pages.length) : 0;
const linkIntegrity = Math.max(0, 1 - (brokenLinks + deadPaths) / Math.max(totalWikilinks, 1));
const nonOrphanPct = pages.length ? (1 - orphans / pages.length) : 1;
const stalePenalty = Math.max(0, 1 - stalePages / Math.max(pages.length, 1) * 2);
const dupPenalty = Math.max(0, 1 - duplicateTitles / Math.max(pages.length, 1) * 3);
const H = 100 * (0.25 * fmHygiene + 0.25 * linkIntegrity + 0.20 * nonOrphanPct + 0.15 * Math.min(wikilinkDensity / 5, 1) + 0.10 * stalePenalty + 0.05 * dupPenalty);

// ─── Score-R (Retrieval) ────────────────────────────────────
const probeFile = PROBE_SET === 'holdout' ? 'brain-probes-holdout.json' : 'brain-probes-training.json';
const probes = JSON.parse(fs.readFileSync(path.join(__dirname, probeFile), 'utf-8')).queries;

// Lightweight keyword search — mirrors obsidian-rag.js logic but simpler so it can run standalone
const STOP = new Set(['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','has','have','been','some','them','than','its','over','such','that','this','with','will','each','from','they','what','about','which','when','make','like','how','does','into','just','also','more','other','could','would','there']);

function probeHits(q) {
  const kws = q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  if (!kws.length) return { count: 0, topScore: 0 };
  let hits = 0, topScore = 0;
  pages.forEach(p => {
    let score = 0;
    const lt = p.title.toLowerCase();
    const lb = p.body.toLowerCase();
    kws.forEach(kw => {
      if (lt.includes(kw)) score += 10;
      const bodyMatches = (lb.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(bodyMatches, 10);
    });
    if (score >= 5) { hits++; if (score > topScore) topScore = score; }
  });
  return { count: hits, topScore };
}

const probeResults = probes.map(q => ({ q, ...probeHits(q) }));
const avgHits = probeResults.reduce((s, r) => s + r.count, 0) / probeResults.length;
const zeroHitQueries = probeResults.filter(r => r.count === 0).length;
const strongHitRate = probeResults.filter(r => r.count >= 3).length / probeResults.length;

// Retrieval 0-100
const R = 100 * (
  0.40 * Math.min(avgHits / 8, 1) +         // target: avg 8 hits per query
  0.35 * strongHitRate +                     // % queries with ≥3 relevant pages
  0.25 * (1 - zeroHitQueries / probeResults.length) // 0-hit queries = worst case
);

// ─── Score-U (User truth) ───────────────────────────────────
let U = 50;
let pinRate = 0, dismissRate = 0, thumbsUpRate = 0, thumbsDownRate = 0;
try {
  const dbPath = path.join(__dirname, '..', 'beanz-os.db');
  if (fs.existsSync(dbPath)) {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='brain_page_feedback'").get();
    if (hasTable) {
      const agg = db.prepare(`SELECT
        SUM(pins) as pins, SUM(dismisses) as dismisses,
        SUM(thumbs_up) as up, SUM(thumbs_down) as down,
        COUNT(*) as n FROM brain_page_feedback`).get();
      const total = Math.max((agg.pins||0) + (agg.dismisses||0) + (agg.up||0) + (agg.down||0), 1);
      pinRate = (agg.pins||0) / total;
      dismissRate = (agg.dismisses||0) / total;
      thumbsUpRate = (agg.up||0) / total;
      thumbsDownRate = (agg.down||0) / total;
      U = 50 + 50 * ((pinRate + thumbsUpRate) - (dismissRate + thumbsDownRate));
      U = Math.max(0, Math.min(100, U));
    }
    // Also: % of chat traces with ≥3 hits
    const hasTraces = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_traces'").get();
    if (hasTraces) {
      const traceAgg = db.prepare(`SELECT
        SUM(CASE WHEN hit_count >= 3 THEN 1 ELSE 0 END) as strong,
        COUNT(*) as n FROM rag_traces
        WHERE created_at >= datetime('now','-7 days')`).get();
      if (traceAgg && traceAgg.n > 0) {
        const strongRate = traceAgg.strong / traceAgg.n;
        U = (U + 100 * strongRate) / 2;
      }
    }
    db.close();
  }
} catch (_) { /* no db yet — leave U at 50 baseline */ }

// ─── Blended score ──────────────────────────────────────────
const score = 0.35 * H + 0.45 * R + 0.20 * U;

if (JSON_OUT) {
  console.log(JSON.stringify({
    score: +score.toFixed(2), H: +H.toFixed(2), R: +R.toFixed(2), U: +U.toFixed(2),
    pages: pages.length, broken: brokenLinks + deadPaths, orphans,
    stale: stalePages, duplicates: duplicateTitles,
    probes: { set: PROBE_SET, n: probes.length, avgHits: +avgHits.toFixed(2), zeroHit: zeroHitQueries, strongHitRate: +strongHitRate.toFixed(2) },
    feedback: { pinRate: +pinRate.toFixed(3), dismissRate: +dismissRate.toFixed(3), thumbsUpRate: +thumbsUpRate.toFixed(3), thumbsDownRate: +thumbsDownRate.toFixed(3) }
  }, null, 2));
} else {
  console.log(
    'score=' + score.toFixed(2) +
    ' H=' + H.toFixed(1) +
    ' R=' + R.toFixed(1) +
    ' U=' + U.toFixed(1) +
    ' pages=' + pages.length +
    ' broken=' + (brokenLinks + deadPaths) +
    ' orphans=' + orphans +
    ' probe_hits=' + avgHits.toFixed(2) +
    ' zero_hit=' + zeroHitQueries +
    ' stale=' + stalePages
  );
}
