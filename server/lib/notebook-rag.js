/**
 * notebook-rag.js — Lightweight per-notebook search over source chunks.
 * TF-IDF-ish scoring: boost keyword matches, normalize by length.
 */

'use strict';

const store = require('./notebook-store');
const ingest = require('./notebook-ingest');

/** Auto-heal: for any source in this notebook with content_text but no chunks, chunk it now. */
function rechunkMissingSources(notebookId) {
  const sources = store.getSourcesForNotebook(notebookId, { withText: true });
  if (!sources || !sources.length) return { rechunked: 0 };
  let rechunked = 0;
  for (const s of sources) {
    if (!s.content_text || s.content_text.length < 20) continue;
    // Check if this source has chunks
    const db = require('./db').getDb();
    const row = db.prepare('SELECT COUNT(*) AS n FROM notebook_source_chunks WHERE source_id = ?').get(s.id);
    if (row && row.n > 0) continue;
    try {
      const chunks = ingest.chunkText(s.content_text);
      store.upsertChunks(s.id, notebookId, chunks);
      rechunked++;
    } catch (e) { /* swallow — best-effort */ }
  }
  return { rechunked };
}

const STOPWORDS = new Set(['the','a','an','of','to','and','or','in','on','for','with','is','are','was','were','be','been','being','has','have','had','do','does','did','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','at','by','from','as','but','if','then','so','not','no','yes','can','could','should','would','may','might','will','shall','what','which','who','whom','whose','how','when','where','why']);

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function search(notebookId, query, { maxResults = 10, maxChars = 40000 } = {}) {
  if (!query || !notebookId) return [];
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const chunks = store.getAllChunksForNotebook(notebookId);
  if (!chunks.length) return [];

  const scored = chunks.map(c => {
    const low = (c.content || '').toLowerCase();
    let hits = 0, unique = 0;
    for (const t of tokens) {
      const count = (low.match(new RegExp('\\b' + escapeRegex(t) + '\\b', 'g')) || []).length;
      if (count > 0) unique++;
      hits += count;
    }
    const score = hits + unique * 2;
    return { ...c, score };
  }).filter(c => c.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const out = [];
  let chars = 0;
  for (const c of scored) {
    if (out.length >= maxResults) break;
    if (chars + c.content.length > maxChars) break;
    out.push(c);
    chars += c.content.length;
  }
  return out;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Build a numbered source citation block for use in LLM prompts. */
function buildCitationBlock(chunks) {
  return chunks.map((c, i) => `[S${i + 1}] ${c.source_title} (chunk ${c.chunk_index})\n${c.content}`).join('\n\n---\n\n');
}

/** Convert the notebook's full sources into a grounded context string,
 *  capped at maxChars. Uses every chunk if under cap; otherwise RAG-selects.
 *  Self-heals: if no chunks exist but sources have content, re-chunks first. */
function buildFullContext(notebookId, query, maxChars = 60000) {
  let all = store.getAllChunksForNotebook(notebookId);
  if (!all.length) {
    const r = rechunkMissingSources(notebookId);
    if (r.rechunked > 0) all = store.getAllChunksForNotebook(notebookId);
  }
  if (!all.length) return { chunks: [], text: '' };
  const totalChars = all.reduce((s, c) => s + c.content.length, 0);
  if (totalChars <= maxChars) {
    return { chunks: all, text: buildCitationBlock(all) };
  }
  const hits = search(notebookId, query || all[0].content.slice(0, 200), { maxResults: 30, maxChars });
  return { chunks: hits, text: buildCitationBlock(hits) };
}

module.exports = { search, buildCitationBlock, buildFullContext, rechunkMissingSources };
