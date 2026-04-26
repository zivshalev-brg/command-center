/**
 * brain-policy.js — Formalised rules for how the Obsidian brain is kept in sync.
 *
 * Publishes:
 *   - getPolicy(ctx): returns the full policy + live status per section
 *   - writePolicyPage(ctx): regenerates 000-Standards/Brain-Update-Policy.md
 *
 * The policy is a single source of truth that tells Beanz OS (and the user):
 *   - which tab / data source feeds which vault section
 *   - how often
 *   - what the conflict resolution rule is (auto-only, user-owned, merge, etc.)
 *   - what the pruning rule is
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath } = require('./obsidian-sync');
const { writeFreshPage } = require('./obsidian-comms-sync');

// ═══ Canonical policy ═══════════════════════════════════════════

const POLICY = [
  {
    section: '000-Dashboard',
    source: 'obsidian-sync (static)',
    cadence: 'on full sync',
    rule: 'auto-regenerated',
    pruning: 'none',
    notes: 'Navigation page, always fresh.'
  },
  {
    section: '000-Standards',
    source: 'Static KB + this file',
    cadence: 'on full sync',
    rule: 'user-owned (AUTO markers if mixed)',
    pruning: 'none',
    notes: 'Authoring standards; user edits preserved.'
  },
  {
    section: '100-People',
    source: 'kb-data/intelligence/team-directory.json + learning_notes',
    cadence: 'on-change (sync) + daily',
    rule: 'AUTO-START/END markers preserve user edits',
    pruning: 'never',
    notes: 'Linked to projects automatically.'
  },
  {
    section: '200-Projects',
    source: 'kb-data/intelligence/project-updates.json + Jira + project_intelligence_cache',
    cadence: 'every 60 min + on-change',
    rule: 'AUTO markers; user notes preserved',
    pruning: 'archive after status=complete for 6 months',
    notes: 'AI health score appended daily.'
  },
  {
    section: '300-Comms',
    source: 'comms-live.json + email-live.json',
    cadence: 'every 10 min (threads active in last 90d)',
    rule: 'regen idempotent by thread id',
    pruning: 'older than 90 days → monthly rollup pages',
    notes: 'Slack + Outlook unified.'
  },
  {
    section: '400-Coffee-Intelligence',
    source: 'news-store.json + CIBE briefings + roasters DB',
    cadence: 'daily (news) + on-scrape (roasters)',
    rule: 'append-only',
    pruning: 'news pages >60 days with 0 backlinks → _Archive/',
    notes: 'Daily + weekly research digests.'
  },
  {
    section: '500-AI-Tech-Intelligence',
    source: 'tech-news-store.json + research digests',
    cadence: 'daily',
    rule: 'append-only',
    pruning: 'same as 400',
    notes: 'Daily + weekly research digests.'
  },
  {
    section: '600-Strategy',
    source: 'kb-data/strategy/* + strategy-engine',
    cadence: 'on-change',
    rule: 'AUTO markers; user narrative preserved',
    pruning: 'never',
    notes: '8 correlations regenerated; KPI dashboard from PBI live.'
  },
  {
    section: '700-Meetings',
    source: 'kb-data/meetings/*',
    cadence: 'on-change',
    rule: 'user-owned',
    pruning: 'never',
    notes: 'Transcripts + notes; user hand-edits.'
  },
  {
    section: '800-Knowledge-Base',
    source: 'kb-data/* (non-meeting, non-strategy, non-intelligence)',
    cadence: 'on-change',
    rule: 'user-owned',
    pruning: 'never',
    notes: 'Domain knowledge; user-authored.'
  },
  {
    section: '900-Learning',
    source: 'SQLite (learning_patterns, learning_feedback, learning_preferences)',
    cadence: 'daily',
    rule: 'auto-only',
    pruning: 'keep last 500 feedback rows',
    notes: 'Adaptive weights and learned patterns.'
  },
  {
    section: '900-Notebooks',
    source: 'Notebook promote action',
    cadence: 'on-promote',
    rule: 'user-owned; AUTO markers for studio artifacts',
    pruning: 'never',
    notes: 'Phase F: notebook ↔ brain bi-directional.'
  },
  {
    section: '950-Daily-Summaries',
    source: 'daily-summaries.js (Opus for Summary/Projects/Metrics/Strategy/Intel; Sonnet for Comms/News; Haiku for Calendar/People/Notes)',
    cadence: '07:00 AEST daily',
    rule: 'auto-only, append new date folder',
    pruning: 'archive folders older than 180 days to _Archive/',
    notes: 'One MD per tab per day.'
  },
  {
    section: '951-Weekly-Summaries',
    source: 'daily-summaries.js runWeeklyRollup (Opus)',
    cadence: 'Sunday 08:00 AEST',
    rule: 'auto-only, one file per ISO week',
    pruning: 'never',
    notes: 'Week synthesis of daily summaries.'
  },
  {
    section: 'Templates',
    source: 'Static',
    cadence: 'on full sync',
    rule: 'user-owned',
    pruning: 'never',
    notes: 'Note templates.'
  }
];

// ═══ Section stat gathering ═════════════════════════════════════

function scanSection(vault, section) {
  const dir = path.join(vault, section);
  if (!fs.existsSync(dir)) return { pages: 0, totalBytes: 0, latest: null };
  let pages = 0, bytes = 0, latest = 0;
  function walk(d) {
    let entries = [];
    try { entries = fs.readdirSync(d); } catch { return; }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const full = path.join(d, name);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.md')) continue;
      pages++;
      bytes += stat.size;
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
  }
  walk(dir);
  return { pages, totalBytes: bytes, latest: latest ? new Date(latest).toISOString() : null };
}

// ═══ Public API ═════════════════════════════════════════════════

function getPolicy(ctx) {
  const vault = getVaultPath();
  const sections = POLICY.map(p => {
    const s = scanSection(vault, p.section);
    return { ...p, pages: s.pages, totalBytes: s.totalBytes, lastModified: s.latest };
  });
  const totals = sections.reduce((acc, s) => ({
    pages: acc.pages + s.pages,
    totalBytes: acc.totalBytes + s.totalBytes
  }), { pages: 0, totalBytes: 0 });

  // Today's daily summaries status
  let todaySummaries = null;
  try {
    const db = require('./db');
    const today = new Date().toISOString().slice(0, 10);
    const d = db.getDb();
    const rows = d.prepare('SELECT tab, rel_path, model, content_chars, skipped, error FROM daily_summary_runs WHERE date = ? ORDER BY id DESC').all(today);
    todaySummaries = { date: today, runs: rows };
  } catch {}

  return {
    vaultPath: vault,
    policy: sections,
    totals,
    todaySummaries,
    lastPolicyCheckedAt: new Date().toISOString()
  };
}

function writePolicyPage(ctx) {
  const vault = getVaultPath();
  const state = getPolicy(ctx);
  const lines = [
    '# Beanz OS — Brain Update Policy',
    '',
    '> Auto-generated from [brain-policy.js](../../../server/lib/brain-policy.js). The single source of truth for how the vault stays in sync.',
    '',
    '**Generated:** ' + state.lastPolicyCheckedAt,
    '**Vault:** `' + state.vaultPath + '`',
    '**Total pages:** ' + state.totals.pages + ' (' + Math.round(state.totals.totalBytes / 1024) + ' KB)',
    '',
    '## Sections',
    '',
    '| Section | Source | Cadence | Conflict rule | Pruning | Pages | Last mod |',
    '|---|---|---|---|---|---|---|'
  ];
  state.policy.forEach(p => {
    const mod = p.lastModified ? p.lastModified.slice(0, 10) : '-';
    lines.push('| **' + p.section + '** | ' + p.source + ' | ' + p.cadence + ' | ' + p.rule + ' | ' + p.pruning + ' | ' + p.pages + ' | ' + mod + ' |');
  });
  lines.push('');
  lines.push('## Notes per section');
  lines.push('');
  state.policy.forEach(p => {
    lines.push('### ' + p.section);
    lines.push(p.notes);
    lines.push('');
  });
  lines.push('## Operating principles');
  lines.push('');
  lines.push('1. **User edits are sacred.** Auto-sync never overwrites content between `<!-- AUTO-START -->` and `<!-- AUTO-END -->` markers without warning. Outside markers = user-owned.');
  lines.push('2. **Append over destroy.** News and comms append new pages; stale pages move to `_Archive/` — never deleted.');
  lines.push('3. **Idempotent generators.** Running any sync twice produces the same vault state.');
  lines.push('4. **Entities are linkified.** People, projects, roasters referenced by name get `[[wikilinks]]` automatically ([server/lib/obsidian-entities.js](../../../server/lib/obsidian-entities.js)).');
  lines.push('5. **RAG is feedback-weighted.** Pinned pages get +1.2^N boost; dismissed pages get ×0.8^N penalty (decayed). See [server/lib/decay.js](../../../server/lib/decay.js).');
  lines.push('6. **Notebook promotion is one-way from UI.** A note only lands in `900-Notebooks/` when Ziv clicks "Promote to brain" — never automatically.');
  lines.push('');
  lines.push('## Models used');
  lines.push('');
  lines.push('| Task | Model |');
  lines.push('|---|---|');
  lines.push('| Notebook chat + artifacts + research | **Opus 4.7** (prompt-cached sources) |');
  lines.push('| Daily summaries: Summary / Projects / Metrics / Strategy / Intel | **Opus 4.7** |');
  lines.push('| Daily summaries: Comms / News | **Sonnet 4.6** |');
  lines.push('| Daily summaries: Calendar / People / Notes | **Haiku 4.5** |');
  lines.push('| Weekly rollup | **Opus 4.7** |');
  lines.push('| Comms classifier + drafter | Opus 4.7 |');
  lines.push('| News / tech research digests | Sonnet 4.6 |');
  lines.push('');

  const fm = {
    title: 'Brain Update Policy',
    description: 'Rules for how the Beanz OS Obsidian brain is kept in sync.',
    type: 'reference',
    status: 'complete',
    owner: 'Platform',
    market: ['global'],
    tags: ['standards', 'brain', 'policy', 'meta'],
    aliases: ['Policy', 'Brain Rules', 'Sync Rules'],
    related: ['[[Beanz OS — Knowledge Brain]]'],
    generated_at: state.lastPolicyCheckedAt,
    confidence: 'high',
    review_cycle: 'quarterly'
  };
  const full = path.join(vault, '000-Standards', 'Brain-Update-Policy.md');
  writeFreshPage(full, fm, lines.join('\n'));
  return { relPath: '000-Standards/Brain-Update-Policy.md', pages: state.totals.pages };
}

module.exports = { getPolicy, writePolicyPage, POLICY };
