/**
 * obsidian-chunks.js — Phase E semantic retrieval infrastructure.
 *
 * Chunks vault pages into overlapping ~600-char windows and optionally
 * computes + caches embeddings. Gracefully degrades to keyword-only mode
 * when no embedding API key is configured.
 *
 * Storage: beanz-os.db → obsidian_chunks table.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 150;

function ensureChunkSchema() {
  const d = db.getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS obsidian_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      rel_path    TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      char_start  INTEGER DEFAULT 0,
      char_end    INTEGER DEFAULT 0,
      content_hash TEXT,
      embedding   BLOB,
      embed_model TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_obsidian_chunks_path ON obsidian_chunks(rel_path);
    CREATE INDEX IF NOT EXISTS idx_obsidian_chunks_hash ON obsidian_chunks(content_hash);
  `);
}

function chunkText(text) {
  if (!text) return [];
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(text.length, pos + CHUNK_SIZE);
    let cut = end;
    if (end < text.length) {
      const lookback = Math.max(pos + CHUNK_SIZE - 250, pos + 1);
      const window = text.slice(lookback, end);
      const para = window.lastIndexOf('\n\n');
      const sent = window.lastIndexOf('. ');
      if (para >= 0) cut = lookback + para + 2;
      else if (sent >= 0) cut = lookback + sent + 2;
    }
    out.push({ content: text.slice(pos, cut).trim(), start: pos, end: cut });
    if (cut >= text.length) break;
    pos = Math.max(cut - CHUNK_OVERLAP, pos + 1);
  }
  return out.filter(c => c.content.length > 30);
}

function hashContent(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

/** Re-chunk the entire vault. Deletes chunks for pages that no longer exist. Returns counts. */
function reindexVault(vaultPath) {
  ensureChunkSchema();
  const d = db.getDb();
  if (!fs.existsSync(vaultPath)) return { pages: 0, chunks: 0, removed: 0 };

  const seen = new Set();
  let pages = 0, totalChunks = 0;

  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      if (e.name.startsWith('.')) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); return; }
      if (!e.name.endsWith('.md')) return;
      if (e.name === 'log.md' || e.name === 'index.md') return;
      const relPath = path.relative(vaultPath, full).replace(/\\/g, '/');
      seen.add(relPath);
      let raw; try { raw = fs.readFileSync(full, 'utf-8'); } catch { return; }
      // Strip frontmatter + AUTO markers for chunking
      let body = raw;
      if (body.startsWith('---')) {
        const end = body.indexOf('\n---', 3);
        if (end !== -1) body = body.slice(end + 4).trim();
      }
      body = body.replace(/<!-- AUTO-(START|END) -->/g, '').trim();
      const hash = hashContent(body);

      // Skip if we already have chunks for this hash
      const existing = d.prepare('SELECT COUNT(*) AS n FROM obsidian_chunks WHERE rel_path = ? AND content_hash = ?').get(relPath, hash);
      if (existing && existing.n > 0) { pages++; totalChunks += existing.n; return; }

      // Re-chunk
      d.prepare('DELETE FROM obsidian_chunks WHERE rel_path = ?').run(relPath);
      const chunks = chunkText(body);
      const stmt = d.prepare(`INSERT INTO obsidian_chunks (rel_path, chunk_index, content, char_start, char_end, content_hash) VALUES (?,?,?,?,?,?)`);
      const tx = d.transaction(rows => rows.forEach(r => stmt.run(r.rel_path, r.chunk_index, r.content, r.char_start, r.char_end, r.content_hash)));
      tx(chunks.map((c, i) => ({ rel_path: relPath, chunk_index: i, content: c.content, char_start: c.start, char_end: c.end, content_hash: hash })));
      pages++;
      totalChunks += chunks.length;
    });
  })(vaultPath);

  // Remove chunks for deleted pages
  const existingPaths = d.prepare('SELECT DISTINCT rel_path FROM obsidian_chunks').all();
  let removed = 0;
  existingPaths.forEach(row => {
    if (!seen.has(row.rel_path)) {
      d.prepare('DELETE FROM obsidian_chunks WHERE rel_path = ?').run(row.rel_path);
      removed++;
    }
  });
  return { pages, chunks: totalChunks, removed };
}

/** Keyword search over chunks — the semantic fallback when no embedding key is present. */
function searchChunks(query, opts) {
  ensureChunkSchema();
  const d = db.getDb();
  const maxResults = (opts && opts.maxResults) || 20;
  const kws = query.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (!kws.length) return [];
  const rows = d.prepare('SELECT rel_path, chunk_index, content FROM obsidian_chunks LIMIT 10000').all();
  const scored = rows.map(r => {
    const lb = r.content.toLowerCase();
    let score = 0;
    kws.forEach(kw => { score += Math.min(((lb.match(new RegExp(kw, 'g')) || []).length), 8); });
    return { ...r, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);
  return scored;
}

function stats() {
  ensureChunkSchema();
  const d = db.getDb();
  const total = d.prepare('SELECT COUNT(*) AS n FROM obsidian_chunks').get().n;
  const withEmbed = d.prepare('SELECT COUNT(*) AS n FROM obsidian_chunks WHERE embedding IS NOT NULL').get().n;
  const pages = d.prepare('SELECT COUNT(DISTINCT rel_path) AS n FROM obsidian_chunks').get().n;
  return { totalChunks: total, embeddedChunks: withEmbed, pages };
}

module.exports = { reindexVault, searchChunks, chunkText, stats };
