/**
 * obsidian-rag.js — Keyword-based retrieval over the Obsidian Brain vault.
 *
 * Indexes all .md files in the vault on first call (then refreshes every 5 min).
 * search(query) returns the most relevant pages with content, scored by
 * title / tag / alias / body keyword overlap.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'BeanzOS-Brain');

// ── In-memory index ─────────────────────────────────────────
let _index = [];
let _indexBuiltAt = 0;
const REBUILD_MS = 5 * 60 * 1000; // 5 minutes

// Stop-words to ignore during scoring
const STOP = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'some', 'them',
  'than', 'its', 'over', 'such', 'that', 'this', 'with', 'will', 'each',
  'from', 'they', 'what', 'about', 'which', 'when', 'make', 'like', 'how',
  'does', 'into', 'just', 'also', 'more', 'other', 'could', 'would', 'there'
]);

// ── Frontmatter parser ──────────────────────────────────────
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { fm: {}, body: raw };
  var end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: raw };
  var block = raw.slice(4, end).trim();
  var body = raw.slice(end + 4).trim();

  var fm = {};
  block.split('\n').forEach(function (line) {
    var m = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (!m) return;
    var key = m[1], val = m[2].trim();
    // Array value
    if (val.startsWith('[') && val.endsWith(']')) {
      try { val = JSON.parse(val); } catch (_) {
        val = val.slice(1, -1).split(',').map(function (s) {
          return s.trim().replace(/^["']|["']$/g, '');
        }).filter(Boolean);
      }
    } else if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  });
  return { fm: fm, body: body };
}

// ── Build index ─────────────────────────────────────────────
function buildIndex() {
  if (_indexBuiltAt && Date.now() - _indexBuiltAt < REBUILD_MS) return;
  if (!fs.existsSync(VAULT_PATH)) { _index = []; return; }

  var entries = [];

  function walk(dir) {
    var names;
    try { names = fs.readdirSync(dir); } catch (_) { return; }
    names.forEach(function (name) {
      if (name.startsWith('.')) return;
      var full = path.join(dir, name);
      var stat;
      try { stat = fs.statSync(full); } catch (_) { return; }
      if (stat.isDirectory()) { walk(full); return; }
      if (!name.endsWith('.md')) return;
      // skip index/log/template files
      if (name === '_Index.md' || name === 'log.md' || name === 'index.md') return;

      try {
        var raw = fs.readFileSync(full, 'utf-8');
        var parsed = parseFrontmatter(raw);
        var relPath = path.relative(VAULT_PATH, full).replace(/\\/g, '/');
        var section = relPath.split('/')[0] || '';
        var tags = Array.isArray(parsed.fm.tags) ? parsed.fm.tags : [];
        var aliases = Array.isArray(parsed.fm.aliases) ? parsed.fm.aliases : [];

        entries.push({
          path: full,
          relPath: relPath,
          section: section,
          title: (parsed.fm.title || name.replace('.md', '')).replace(/^"|"$/g, ''),
          tags: tags,
          aliases: aliases,
          type: String(parsed.fm.type || '').replace(/^"|"$/g, ''),
          body: parsed.body,
          chars: parsed.body.length,
          lowerTitle: (parsed.fm.title || name.replace('.md', '')).toLowerCase(),
          lowerBody: parsed.body.toLowerCase(),
          lowerTags: tags.map(function (t) { return String(t).toLowerCase(); }),
          lowerAliases: aliases.map(function (a) { return String(a).toLowerCase(); })
        });
      } catch (_) { /* skip unreadable files */ }
    });
  }

  walk(VAULT_PATH);
  _index = entries;
  _indexBuiltAt = Date.now();
  console.log('[ObsidianRAG] Indexed ' + entries.length + ' vault pages (' + VAULT_PATH + ')');
}

// ── Search ──────────────────────────────────────────────────
/**
 * Search the vault for pages relevant to the query.
 * @param {string} query — user's chat message
 * @param {object} opts
 * @param {number} opts.maxResults — max pages to return (default 15)
 * @param {number} opts.maxChars — total char budget for returned content (default 60000)
 * @param {number} opts.maxPerPage — max chars per individual page (default 8000)
 * @returns {Array<{title, relPath, tags, score, content}>}
 */
function search(query, opts) {
  buildIndex();
  if (!_index.length) return [];

  var maxResults = (opts && opts.maxResults) || 15;
  var maxChars = (opts && opts.maxChars) || 60000;
  var maxPerPage = (opts && opts.maxPerPage) || 8000;

  // Tokenise query into meaningful keywords
  var keywords = query.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(function (w) { return w.length > 2 && !STOP.has(w); });

  if (!keywords.length) return [];

  // Also extract multi-word phrases (bigrams) for better matching
  var phrases = [];
  for (var p = 0; p < keywords.length - 1; p++) {
    phrases.push(keywords[p] + ' ' + keywords[p + 1]);
  }

  // Score each indexed page
  var scored = _index.map(function (entry) {
    var score = 0;

    for (var k = 0; k < keywords.length; k++) {
      var kw = keywords[k];
      var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp(escaped, 'g');

      // Title match — highest weight
      if (entry.lowerTitle.indexOf(kw) !== -1) score += 10;

      // Tag match
      for (var t = 0; t < entry.lowerTags.length; t++) {
        if (entry.lowerTags[t].indexOf(kw) !== -1) { score += 5; break; }
      }

      // Alias match
      for (var a = 0; a < entry.lowerAliases.length; a++) {
        if (entry.lowerAliases[a].indexOf(kw) !== -1) { score += 5; break; }
      }

      // Body occurrences (capped at 10 per keyword)
      var bodyMatches = (entry.lowerBody.match(re) || []).length;
      score += Math.min(bodyMatches, 10);
    }

    // Phrase bonus
    for (var ph = 0; ph < phrases.length; ph++) {
      if (entry.lowerBody.indexOf(phrases[ph]) !== -1) score += 8;
      if (entry.lowerTitle.indexOf(phrases[ph]) !== -1) score += 15;
    }

    // Section boosts — prioritise actionable knowledge
    if (entry.section.startsWith('800')) score *= 1.3;  // Knowledge Base
    if (entry.section.startsWith('600')) score *= 1.25; // Strategy
    if (entry.section.startsWith('200')) score *= 1.2;  // Projects
    if (entry.section.startsWith('100')) score *= 1.15; // People

    // Penalise huge daily news dumps (they dilute the context)
    if (entry.chars > 50000) score *= 0.6;

    return { entry: entry, score: score };
  }).filter(function (s) { return s.score > 0; });

  // Sort descending by score
  scored.sort(function (a, b) { return b.score - a.score; });

  // Collect results within char budget
  var results = [];
  var totalChars = 0;

  for (var i = 0; i < scored.length && results.length < maxResults; i++) {
    var e = scored[i].entry;
    var content = e.body.length > maxPerPage ? e.body.slice(0, maxPerPage) + '\n... [truncated]' : e.body;
    if (totalChars + content.length > maxChars) {
      // Try a shorter version
      var remaining = maxChars - totalChars;
      if (remaining > 1000) {
        content = e.body.slice(0, remaining - 20) + '\n... [truncated]';
      } else {
        continue;
      }
    }
    results.push({
      title: e.title,
      relPath: e.relPath,
      section: e.section,
      tags: e.tags,
      score: Math.round(scored[i].score * 10) / 10,
      content: content
    });
    totalChars += content.length;
  }

  return results;
}

// ── Always-include pages ────────────────────────────────────
/**
 * Returns core vault pages that should always be in the system prompt
 * (team directory, active projects, strategy correlations).
 * Respects a char budget.
 */
function getCorePages(maxChars) {
  buildIndex();
  if (!_index.length) return [];

  var budget = maxChars || 25000;
  var corePaths = [
    '100-People',
    '200-Projects',
    '600-Strategy/Correlations.md',
    '600-Strategy/KPI-Dashboard.md'
  ];

  var results = [];
  var totalChars = 0;

  for (var i = 0; i < _index.length; i++) {
    var e = _index[i];
    var isCore = false;
    for (var c = 0; c < corePaths.length; c++) {
      if (e.relPath.startsWith(corePaths[c])) { isCore = true; break; }
    }
    if (!isCore) continue;

    // Skip template/index pages
    if (e.relPath.includes('_Index') || e.relPath.includes('Template')) continue;

    var content = e.body.length > 6000 ? e.body.slice(0, 6000) + '\n... [truncated]' : e.body;
    if (totalChars + content.length > budget) continue;

    results.push({
      title: e.title,
      relPath: e.relPath,
      content: content
    });
    totalChars += content.length;
  }

  return results;
}

/** Return the vault path (for display) */
function getVaultPath() { return VAULT_PATH; }

/** Return index stats */
function getStats() {
  buildIndex();
  var sections = {};
  _index.forEach(function (e) {
    var s = e.section || 'root';
    if (!sections[s]) sections[s] = 0;
    sections[s]++;
  });
  return { totalPages: _index.length, sections: sections, vaultPath: VAULT_PATH, indexedAt: _indexBuiltAt };
}

module.exports = { search, getCorePages, getVaultPath, getStats, buildIndex };
