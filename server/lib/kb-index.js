// KB Index — scans every kb-data/* subdirectory and builds a searchable index
// of markdown + JSON files with extracted topics and entity mentions.
// Used by project-context-builder to pull the RIGHT KB docs per project,
// not just the 4 intelligence files.

'use strict';

const fs = require('fs');
const path = require('path');

let _cache = null;
let _cacheBuiltAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Directories to skip during scan
const SKIP_DIRS = new Set(['_audit', 'intelligence', 'pages', 'references']);
const MAX_FILE_SIZE = 500 * 1024; // 500KB — skip very large files
const MAX_SNIPPET = 400;

function _walkDir(dir, fileList = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return fileList; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
      _walkDir(full, fileList);
    } else if (ent.isFile()) {
      if (/\.(md|json)$/i.test(ent.name)) fileList.push(full);
    }
  }
  return fileList;
}

function _extractTopicsFromFilename(filepath) {
  const base = path.basename(filepath).toLowerCase()
    .replace(/\.(md|json)$/, '')
    .replace(/^[0-9_-]+/, '')
    .replace(/[_\-]/g, ' ');
  return base.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
}

function _extractSnippet(content, type) {
  if (type === 'json') {
    try {
      const obj = JSON.parse(content);
      if (obj.description || obj.summary) return String(obj.description || obj.summary).slice(0, MAX_SNIPPET);
      // Just first 400 chars of stringified
      return JSON.stringify(obj).slice(0, MAX_SNIPPET);
    } catch { return content.slice(0, MAX_SNIPPET); }
  }
  // Markdown — strip headers/frontmatter, grab first paragraph
  const stripped = content
    .replace(/^---[\s\S]*?---/, '')              // YAML frontmatter
    .replace(/^#+\s.*$/gm, '')                    // Headers
    .replace(/```[\s\S]*?```/g, '')               // Code blocks
    .trim();
  return stripped.slice(0, MAX_SNIPPET);
}

function _extractEntities(content) {
  // Pull PascalCase words, quoted phrases, @mentions, known beanz terms
  const entities = new Set();
  // CapitalWords (3+ in a row like "Project Feral")
  const caps = content.match(/(?:[A-Z][a-zA-Z0-9]+\s?){1,4}/g) || [];
  for (const c of caps) {
    const trimmed = c.trim();
    if (trimmed.length >= 4 && trimmed.length <= 50) entities.add(trimmed);
  }
  // @mentions
  const mentions = content.match(/@[a-z][a-z0-9.-]+/g) || [];
  for (const m of mentions) entities.add(m);
  return Array.from(entities).slice(0, 25);
}

function _categoriseDir(relDir) {
  const d = relDir.toLowerCase();
  if (d.startsWith('retention') || d.startsWith('users') || d.startsWith('voice-of-customer')) return 'retention';
  if (d.startsWith('marketing') || d.startsWith('content') || d.startsWith('communications')) return 'marketing';
  if (d.startsWith('finance') || d.startsWith('pricing')) return 'finance';
  if (d.startsWith('legal')) return 'legal';
  if (d.startsWith('architecture') || d.startsWith('developer-platform') || d.startsWith('mobile-iot') || d.startsWith('security')) return 'platform';
  if (d.startsWith('meetings')) return 'ops';
  if (d.startsWith('projects')) return 'projects';
  if (d.startsWith('analytics') || d.startsWith('features')) return 'analytics';
  if (d.startsWith('cibe') || d.startsWith('partners')) return 'coffee';
  if (d.startsWith('strategy')) return 'strategy';
  if (d.startsWith('markets')) return 'markets';
  if (d.startsWith('fulfillment') || d.startsWith('support')) return 'ops';
  return 'general';
}

function buildIndex(ctx, opts = {}) {
  if (!opts.force && _cache && (Date.now() - _cacheBuiltAt < CACHE_TTL_MS)) return _cache;
  const started = Date.now();
  const kbDir = path.join(ctx.dir, 'kb-data');
  if (!fs.existsSync(kbDir)) { _cache = []; _cacheBuiltAt = Date.now(); return _cache; }

  const files = _walkDir(kbDir);
  const index = [];

  for (const fp of files) {
    try {
      const stat = fs.statSync(fp);
      if (stat.size > MAX_FILE_SIZE) continue;
      const rel = path.relative(kbDir, fp).replace(/\\/g, '/');
      const relDir = rel.split('/').slice(0, -1).join('/');
      const ext = path.extname(fp).slice(1).toLowerCase();
      const content = fs.readFileSync(fp, 'utf-8');
      const snippet = _extractSnippet(content, ext);
      const topics = _extractTopicsFromFilename(fp);
      const entities = _extractEntities(content);
      index.push({
        rel_path: rel,
        dir: relDir,
        category: _categoriseDir(relDir),
        type: ext,
        title: _titleFromContent(content, rel, ext),
        snippet,
        topics,
        entities,
        size: stat.size,
        modified_at: stat.mtime.toISOString()
      });
    } catch (e) { /* skip bad file */ }
  }

  _cache = index;
  _cacheBuiltAt = Date.now();
  return _cache;
}

function _titleFromContent(content, rel, type) {
  if (type === 'md') {
    const h1 = content.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
  }
  if (type === 'json') {
    try {
      const obj = JSON.parse(content);
      if (obj.title || obj.name) return String(obj.title || obj.name);
    } catch {}
  }
  return path.basename(rel).replace(/\.(md|json)$/, '').replace(/[_-]/g, ' ');
}

// ─── Scoring / lookup helpers ────────────────────────────────

function _norm(s) { return String(s || '').toLowerCase(); }

// Returns top-N index entries matching a project, ordered by score.
function findForProject(ctx, project, opts = {}) {
  const index = buildIndex(ctx);
  if (!index.length) return [];
  const preferredCategories = opts.categories || null; // e.g. ['retention', 'analytics']
  const limit = opts.limit || 15;
  const tags = (project.classifier_tags || []).concat(project.aliases || []).concat([project.title]);
  const ntags = tags.map(_norm).filter(t => t && t.length >= 3);
  const peopleIds = project.people_ids || [];

  if (!ntags.length) return [];

  const scored = [];
  for (const entry of index) {
    let score = 0;
    const hay = _norm(entry.title + ' ' + entry.snippet + ' ' + entry.topics.join(' ') + ' ' + entry.entities.join(' ') + ' ' + entry.rel_path);

    // Tag matches
    for (const t of ntags) {
      if (!t) continue;
      if (_norm(entry.title).includes(t)) score += 3;
      else if (hay.includes(t)) score += 1;
    }

    // Category bonus
    if (preferredCategories && preferredCategories.includes(entry.category)) score += 1.5;

    // People mention bonus
    if (peopleIds.length) {
      for (const pid of peopleIds) {
        if (hay.includes(_norm(pid))) { score += 0.5; break; }
      }
    }

    // Freshness bonus (files modified in last 90 days)
    if (entry.modified_at) {
      const age = Date.now() - new Date(entry.modified_at).getTime();
      if (age < 30 * 24 * 3600 * 1000) score += 0.5;
    }

    if (score >= 1) scored.push({ ...entry, _score: score });
  }

  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, limit);
}

function getIndexStats() {
  if (!_cache) return { built: false };
  const byCategory = {};
  for (const e of _cache) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  return {
    built: true,
    built_at: new Date(_cacheBuiltAt).toISOString(),
    file_count: _cache.length,
    by_category: byCategory
  };
}

module.exports = { buildIndex, findForProject, getIndexStats };
