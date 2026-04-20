/**
 * notebook-rag.js — Lightweight per-notebook search over source chunks.
 * TF-IDF-ish scoring: boost keyword matches, normalize by length.
 */

'use strict';

const store = require('./notebook-store');

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
 *  capped at maxChars. Uses every chunk if under cap; otherwise RAG-selects. */
function buildFullContext(notebookId, query, maxChars = 60000) {
  const all = store.getAllChunksForNotebook(notebookId);
  if (!all.length) return { chunks: [], text: '' };
  const totalChars = all.reduce((s, c) => s + c.content.length, 0);
  if (totalChars <= maxChars) {
    return { chunks: all, text: buildCitationBlock(all) };
  }
  const hits = search(notebookId, query || all[0].content.slice(0, 200), { maxResults: 30, maxChars });
  return { chunks: hits, text: buildCitationBlock(hits) };
}

module.exports = { search, buildCitationBlock, buildFullContext };
