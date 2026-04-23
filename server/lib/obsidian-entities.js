/**
 * obsidian-entities.js — Phase C entity resolution.
 *
 * Extracts known entities (people, projects, roasters, products, markets) from
 * arbitrary text and wraps mentions in [[wikilinks]] that resolve to vault pages.
 *
 * Known entities are loaded lazily from:
 *   kb-data/intelligence/team-directory.json    → people
 *   kb-data/intelligence/project-updates.json   → projects
 *   kb-data/roasters/*.json                     → roasters
 *   Static list                                  → products, markets
 */

'use strict';

const fs = require('fs');
const path = require('path');

let _cache = null;
let _cacheBuiltAt = 0;
const CACHE_MS = 15 * 60 * 1000;

function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function buildEntityIndex(baseDir) {
  if (_cache && Date.now() - _cacheBuiltAt < CACHE_MS) return _cache;
  const kbDir = path.join(baseDir || process.cwd(), 'kb-data', 'intelligence');
  const entities = [];

  const pushEntity = (name, type, aliases = []) => {
    if (!name) return;
    const clean = String(name).trim();
    if (clean.length < 2) return;
    entities.push({ name: clean, type, aliases: aliases.filter(Boolean) });
  };

  const team = loadJson(path.join(kbDir, 'team-directory.json'));
  if (team && team.people) team.people.forEach(p => pushEntity(p.name, 'person', [p.email, p.slack, p.preferred_name].filter(Boolean)));

  const projects = loadJson(path.join(kbDir, 'project-updates.json'));
  if (projects && projects.projects) projects.projects.forEach(p => pushEntity(p.name, 'project', p.aliases || []));

  const roastersDir = path.join(baseDir || process.cwd(), 'kb-data', 'roasters');
  if (fs.existsSync(roastersDir)) {
    fs.readdirSync(roastersDir).forEach(f => {
      if (!f.endsWith('.json')) return;
      const r = loadJson(path.join(roastersDir, f));
      if (r && r.name) pushEntity(r.name, 'roaster', r.aliases || []);
    });
  }

  // Static fallback entities we always resolve
  ['AU', 'UK', 'US', 'DE', 'NL'].forEach(m => pushEntity(m, 'market'));
  ['FTBP', 'FTBP v1', 'FTBP v2', 'PBB', 'Project Feral', 'Platinum Roaster Program', 'BIEDM'].forEach(p => pushEntity(p, 'product'));
  ['Beanz', 'Breville'].forEach(b => pushEntity(b, 'brand'));

  // Build fast lookup — each entity's longest spelling comes first
  entities.forEach(e => { e._search = [e.name, ...e.aliases].filter(Boolean).sort((a, b) => b.length - a.length); });
  entities.sort((a, b) => (b._search[0] || '').length - (a._search[0] || '').length);

  _cache = entities;
  _cacheBuiltAt = Date.now();
  return entities;
}

/** Turn a string into [[wikilink]] on the first mention of each matched entity. */
function linkify(text, opts) {
  if (!text || typeof text !== 'string') return text;
  opts = opts || {};
  const entities = buildEntityIndex(opts.baseDir);
  const seen = new Set();
  let out = text;

  // Skip if the text is clearly code
  if (out.match(/^\s*(```|    )/m) && !opts.force) return text;

  entities.forEach(e => {
    for (const phrase of e._search) {
      if (phrase.length < 3 && e.type !== 'market') continue;
      if (seen.has(phrase.toLowerCase())) continue;
      // Match whole-word, not inside existing [[...]] or URLs
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rgx = new RegExp('(?<![\\[\\w/-])(' + escaped + ')(?!\\w|\\]\\])', opts.caseSensitive ? '' : 'i');
      if (rgx.test(out)) {
        out = out.replace(rgx, '[[' + e.name + ']]');
        seen.add(phrase.toLowerCase());
        break;
      }
    }
  });
  return out;
}

function extractMentions(text, opts) {
  if (!text) return [];
  const entities = buildEntityIndex(opts && opts.baseDir);
  const out = [];
  entities.forEach(e => {
    for (const phrase of e._search) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('\\b' + escaped + '\\b', 'i').test(text)) { out.push(e); break; }
    }
  });
  return out;
}

module.exports = { linkify, extractMentions, buildEntityIndex };
