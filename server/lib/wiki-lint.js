/**
 * wiki-lint.js — Vault Quality Checker for Beanz OS Brain
 *
 * Scans the Obsidian vault for:
 * - Orphan pages (no incoming wikilinks)
 * - Broken wikilinks (link to non-existent pages)
 * - Missing frontmatter fields
 * - Stale data (not updated in 30+ days)
 * - Quality score per page
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath, appendLog } = require('./obsidian-sync');

function lintVault() {
  var vaultDir = getVaultPath();
  if (!fs.existsSync(vaultDir)) return { error: 'Vault not found at ' + vaultDir };

  var pages = {};       // slug -> { path, title, frontmatter, outgoingLinks, incomingLinks, issues }
  var allSlugs = {};    // slug -> filePath
  var issues = [];
  var totalPages = 0;

  // ── Pass 1: Scan all pages, extract frontmatter and wikilinks ──
  _walkDir(vaultDir, function(fp) {
    if (!fp.endsWith('.md')) return;
    var relPath = path.relative(vaultDir, fp);
    var slug = path.basename(fp, '.md');
    totalPages++;

    var content = fs.readFileSync(fp, 'utf-8');
    var fm = _parseFrontmatter(content);
    var links = _extractWikilinks(content);

    allSlugs[slug] = relPath;

    pages[slug] = {
      path: relPath,
      title: fm.title || slug,
      frontmatter: fm,
      outgoingLinks: links,
      incomingLinks: [],
      issues: [],
      qualityScore: 0
    };
  });

  // ── Pass 2: Build incoming link map ──
  for (var slug in pages) {
    pages[slug].outgoingLinks.forEach(function(linkSlug) {
      // Strip folder paths for matching
      var baseName = linkSlug.includes('/') ? linkSlug.split('/').pop() : linkSlug;
      var targetSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var fullSlug = linkSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var target = pages[targetSlug] || pages[baseName] || pages[fullSlug] || pages[linkSlug];
      if (target) {
        target.incomingLinks.push(slug);
      }
    });
  }

  // ── Pass 3: Check each page for issues ──
  var orphanPages = [];
  var brokenLinks = [];
  var missingFrontmatter = [];
  var stalePages = [];

  var requiredFields = ['title', 'description', 'type', 'status', 'owner', 'tags'];

  for (var slug in pages) {
    var page = pages[slug];
    var pageIssues = [];

    // Orphan check (skip index files and log)
    if (page.incomingLinks.length === 0 && !slug.startsWith('_') && slug !== 'Home' && slug !== 'index' && slug !== 'log') {
      pageIssues.push('orphan');
      orphanPages.push({ slug: slug, path: page.path, title: page.title });
    }

    // Broken link check
    page.outgoingLinks.forEach(function(linkSlug) {
      // Skip very short links (YAML parsing artifacts like "D", "P")
      if (linkSlug.length <= 2) return;
      // Skip common template/example placeholders
      if (['filename', 'file1', 'file2', 'MOD', 'Display Text', 'newer-file', 'older-file'].indexOf(linkSlug) >= 0) return;

      // Strip folder paths: "100-People/_Index" → "_Index"
      var baseName = linkSlug.includes('/') ? linkSlug.split('/').pop() : linkSlug;
      // Normalize: "Claude Code" → "claude-code"
      var normalized = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var fullNormalized = linkSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!pages[normalized] && !pages[baseName] && !allSlugs[baseName] && !allSlugs[normalized] && !pages[fullNormalized] && !pages[linkSlug]) {
        pageIssues.push('broken-link: ' + linkSlug);
        brokenLinks.push({ from: slug, to: linkSlug, fromPath: page.path });
      }
    });

    // Missing frontmatter check
    var missingFields = [];
    requiredFields.forEach(function(field) {
      if (!page.frontmatter[field] || page.frontmatter[field] === '' || page.frontmatter[field] === '[]') {
        missingFields.push(field);
      }
    });
    if (missingFields.length > 0) {
      pageIssues.push('missing-fm: ' + missingFields.join(', '));
      missingFrontmatter.push({ slug: slug, path: page.path, missing: missingFields });
    }

    // Stale check (if valid_from exists and is >30 days old, or if review_cycle is overdue)
    if (page.frontmatter.valid_from) {
      var validDate = new Date(page.frontmatter.valid_from);
      var daysSince = Math.floor((Date.now() - validDate.getTime()) / 86400000);
      if (daysSince > 30) {
        pageIssues.push('stale: ' + daysSince + ' days since valid_from');
        stalePages.push({ slug: slug, path: page.path, daysSince: daysSince, validFrom: page.frontmatter.valid_from });
      }
    }

    // Quality score (0-100)
    var score = 50; // baseline
    if (page.frontmatter.title) score += 5;
    if (page.frontmatter.description && page.frontmatter.description.length > 10) score += 10;
    if (page.frontmatter.tags && page.frontmatter.tags !== '[]') score += 5;
    if (page.frontmatter.aliases && page.frontmatter.aliases !== '[]') score += 5;
    if (page.frontmatter.related && page.frontmatter.related !== '[]') score += 5;
    if (page.frontmatter.sources) score += 5;
    if (page.frontmatter.valid_from) score += 5;
    if (page.incomingLinks.length > 0) score += 5;
    if (page.incomingLinks.length > 3) score += 5;
    if (pageIssues.length === 0) score += 10; // no issues bonus
    if (pageIssues.some(function(i) { return i === 'orphan'; })) score -= 15;
    if (pageIssues.some(function(i) { return i.startsWith('broken-link'); })) score -= 10;
    if (pageIssues.some(function(i) { return i.startsWith('stale'); })) score -= 10;
    score = Math.max(0, Math.min(100, score));

    page.issues = pageIssues;
    page.qualityScore = score;
  }

  // ── Aggregate stats ──
  var totalScore = 0;
  var pageCount = 0;
  var scores = [];
  for (var s in pages) {
    totalScore += pages[s].qualityScore;
    scores.push(pages[s].qualityScore);
    pageCount++;
  }
  var avgScore = pageCount > 0 ? Math.round(totalScore / pageCount) : 0;

  // Distribution
  var excellent = scores.filter(function(s) { return s >= 80; }).length;
  var good = scores.filter(function(s) { return s >= 60 && s < 80; }).length;
  var needsWork = scores.filter(function(s) { return s >= 40 && s < 60; }).length;
  var poor = scores.filter(function(s) { return s < 40; }).length;

  var report = {
    summary: {
      totalPages: totalPages,
      averageQuality: avgScore,
      distribution: { excellent: excellent, good: good, needsWork: needsWork, poor: poor },
      orphanPages: orphanPages.length,
      brokenLinks: brokenLinks.length,
      missingFrontmatter: missingFrontmatter.length,
      stalePages: stalePages.length
    },
    orphanPages: orphanPages.slice(0, 20),
    brokenLinks: brokenLinks.slice(0, 20),
    missingFrontmatter: missingFrontmatter.slice(0, 20),
    stalePages: stalePages.slice(0, 20),
    lintedAt: new Date().toISOString()
  };

  // Log the lint
  try {
    var logDetails = '- **Quality score:** ' + avgScore + '/100\n' +
      '- **Pages:** ' + totalPages + '\n' +
      '- **Orphans:** ' + orphanPages.length + '\n' +
      '- **Broken links:** ' + brokenLinks.length + '\n' +
      '- **Missing frontmatter:** ' + missingFrontmatter.length + '\n' +
      '- **Stale pages:** ' + stalePages.length + '\n';
    appendLog(getVaultPath(), 'lint | Vault quality check', logDetails);
  } catch (_) {}

  console.log('[WikiLint] Quality: ' + avgScore + '/100, ' + totalPages + ' pages, ' + orphanPages.length + ' orphans, ' + brokenLinks.length + ' broken links');
  return report;
}

// ─── Helpers ─────────────────────────────────────────────────

function _walkDir(dir, callback) {
  try {
    fs.readdirSync(dir).forEach(function(f) {
      if (f.startsWith('.')) return;
      var fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) _walkDir(fp, callback);
      else callback(fp);
    });
  } catch (_) {}
}

function _parseFrontmatter(content) {
  var fm = {};
  var match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fm;
  var lines = match[1].split('\n');
  var currentKey = null;
  var currentIsArray = false;

  lines.forEach(function(line) {
    // Multi-line array item: "  - value"
    if (currentKey && currentIsArray && line.match(/^\s+-\s+/)) {
      var item = line.replace(/^\s+-\s+/, '').replace(/^"(.*)"$/, '$1').trim();
      if (item) fm[currentKey] = (fm[currentKey] || '') + (fm[currentKey] ? ', ' : '') + item;
      return;
    }

    // Multi-line related with wikilinks: '  - "[[...]]"'
    if (currentKey && currentIsArray && line.match(/^\s+-\s*"/)) {
      var item = line.replace(/^\s+-\s*"?/, '').replace(/"?\s*$/, '').trim();
      if (item) fm[currentKey] = (fm[currentKey] || '') + (fm[currentKey] ? ', ' : '') + item;
      return;
    }

    var m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!m) { currentKey = null; currentIsArray = false; return; }

    currentKey = m[1];
    var val = m[2].trim();

    // Inline array: [item1, item2]
    if (val.startsWith('[') && val.endsWith(']')) {
      var inner = val.slice(1, -1).trim();
      fm[currentKey] = inner.length > 0 ? inner : '';
      currentIsArray = false;
    } else if (val === '' || val === '[]') {
      // Empty value — might be start of multi-line array
      fm[currentKey] = '';
      currentIsArray = true;
    } else {
      fm[currentKey] = val.replace(/^"(.*)"$/, '$1').trim();
      currentIsArray = false;
    }
  });
  return fm;
}

function _extractWikilinks(content) {
  var links = [];
  var re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  var m;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

module.exports = { lintVault };
