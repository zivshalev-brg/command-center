/**
 * obsidian-comms-sync.js — Phase A: real Comms → Obsidian sync.
 *
 * Writes one page per thread (Slack + email) into 300-Comms/, plus an index
 * and per-person / per-project rollup pages. Dedup-safe (thread-id keyed),
 * and respects the AUTO-START/END markers so user annotations survive.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');

const MARK_START = '<!-- AUTO-START -->';
const MARK_END = '<!-- AUTO-END -->';

function safeRead(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null; } catch { return null; }
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

function frontmatter(fm) {
  const lines = ['---'];
  for (const k of Object.keys(fm)) {
    const v = fm[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (k === 'related' || k === 'people') {
        lines.push(k + ':');
        v.forEach(x => lines.push('  - "' + x + '"'));
      } else {
        lines.push(k + ': [' + v.map(x => JSON.stringify(String(x))).join(', ') + ']');
      }
    } else {
      lines.push(k + ': ' + JSON.stringify(String(v)));
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function writeAutoSection(filePath, autoContent) {
  // Preserves anything outside the AUTO-START/END markers.
  let finalContent;
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    const i = existing.indexOf(MARK_START);
    const j = existing.indexOf(MARK_END);
    if (i >= 0 && j > i) {
      // Replace the auto section only
      finalContent = existing.slice(0, i) + MARK_START + '\n' + autoContent + '\n' + existing.slice(j);
    } else {
      // File exists but has no markers — treat as user-edited; append under a fresh auto section
      finalContent = existing.trimEnd() + '\n\n' + MARK_START + '\n' + autoContent + '\n' + MARK_END + '\n';
    }
  } else {
    finalContent = MARK_START + '\n' + autoContent + '\n' + MARK_END + '\n';
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, finalContent, 'utf8');
}

function writeFreshPage(filePath, fm, autoContent) {
  const header = frontmatter(fm) + '\n\n';
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, header + MARK_START + '\n' + autoContent + '\n' + MARK_END + '\n', 'utf8');
    return;
  }
  // Existing file — replace only the auto-managed section, preserve user-authored parts.
  writeAutoSection(filePath, autoContent);
}

function clip(s, n) { return typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : ''; }

function buildThreadPage(thread, source, classifications) {
  const id = thread.id || thread.threadId || thread.channel_thread_ts || thread.messageId;
  const subject = thread.subject || thread.title || thread.topic || '(no subject)';
  const people = (thread.people || thread.attendees || []).filter(Boolean).slice(0, 8);
  const peopleWiki = people.map(p => '[[' + p + ']]');
  const messages = thread.messages || [];
  const lastMsg = messages.length ? messages[messages.length - 1] : null;
  const lastAt = thread.last_message_at || thread.date || (lastMsg && (lastMsg.ts || lastMsg.timestamp || lastMsg.date));
  const cls = classifications[id] || {};

  const fm = {
    title: subject,
    description: clip(cls.summary || (lastMsg && (lastMsg.text || lastMsg.body)) || '', 140),
    type: 'comms-thread',
    status: cls.action_required ? 'action-required' : 'complete',
    owner: cls.owner || 'Comms',
    market: thread.market ? [thread.market] : ['global'],
    tags: ['comms', source, cls.category || 'inbox'].filter(Boolean),
    aliases: [],
    related: peopleWiki.concat(cls.project_tags && (() => { try { return JSON.parse(cls.project_tags).map(p => '[[' + p + ']]'); } catch { return []; } })() || []),
    thread_id: id,
    source: source,
    last_activity: lastAt ? new Date(lastAt).toISOString() : '',
    priority: cls.priority || 'normal',
    action_required: !!cls.action_required,
    people: people
  };

  const autoLines = [
    '# ' + subject,
    '',
    '> ' + people.map(p => '[[' + p + ']]').join(', ') + '  ·  ' + source + '  ·  ' + (lastAt || ''),
    ''
  ];

  if (cls.summary) {
    autoLines.push('## AI Summary');
    autoLines.push(cls.summary);
    autoLines.push('');
  }
  if (cls.action_required) {
    autoLines.push('> [!action] Action required');
    autoLines.push('> ' + (cls.action_type || 'Review thread'));
    autoLines.push('');
  }

  autoLines.push('## Recent messages');
  const lastN = messages.slice(-5);
  lastN.forEach(m => {
    const sender = m.sender || m.from || m.user || '';
    const body = clip((m.text || m.body || '').replace(/\n+/g, ' '), 500);
    const ts = m.ts || m.date || m.timestamp || '';
    autoLines.push('- **' + sender + '** (' + ts + '): ' + body);
  });

  autoLines.push('');
  autoLines.push('## Meta');
  autoLines.push('- Thread ID: `' + id + '`');
  autoLines.push('- Source: ' + source);
  autoLines.push('- Messages: ' + messages.length);
  if (cls.category) autoLines.push('- Category: ' + cls.category + (cls.subcategory ? '/' + cls.subcategory : ''));
  if (cls.priority) autoLines.push('- Priority: ' + cls.priority);
  if (cls.sentiment) autoLines.push('- Sentiment: ' + cls.sentiment);

  return { fm, content: autoLines.join('\n'), id, source, subject, people, lastAt, cls };
}

function generateComms(vaultDir, ctx, opts) {
  opts = opts || {};
  const maxThreadsPerSource = opts.maxThreadsPerSource || 400;
  const commsDir = path.join(vaultDir, '300-Comms');
  fs.mkdirSync(commsDir, { recursive: true });

  // Load classifications (may fail on fresh DB)
  let classifications = {};
  try {
    const rows = db.getAllClassifications();
    rows.forEach(c => { classifications[c.thread_id] = c; });
  } catch { /* ignore */ }

  const allPages = [];

  function ingest(filePath, source) {
    const data = safeRead(filePath);
    if (!data || !data.threads) return 0;
    const entries = Object.entries(data.threads);
    entries.sort((a, b) => {
      const la = new Date(a[1].last_message_at || a[1].date || 0).getTime();
      const lb = new Date(b[1].last_message_at || b[1].date || 0).getTime();
      return lb - la;
    });
    const capped = entries.slice(0, maxThreadsPerSource);
    let written = 0;
    capped.forEach(([id, th]) => {
      if (!th.id) th.id = id;
      const page = buildThreadPage(th, source, classifications);
      const subDir = source === 'slack' ? 'Slack' : 'Email';
      const fname = slugify(page.subject) + '-' + slugify(String(page.id).slice(-8)) + '.md';
      const full = path.join(commsDir, subDir, fname);
      writeFreshPage(full, page.fm, page.content);
      allPages.push({ relPath: path.relative(vaultDir, full).replace(/\\/g, '/'), page });
      written++;
    });
    return written;
  }

  let slackWritten = 0, emailWritten = 0;
  if (ctx.commsLivePath) slackWritten = ingest(ctx.commsLivePath, 'slack');
  const emailPath = path.join(ctx.dir || process.cwd(), 'kb-data', 'intelligence', 'email-live.json');
  emailWritten = ingest(emailPath, 'email');

  // Index page (rollup)
  const actionRequired = allPages.filter(p => p.page.cls.action_required).length;
  const bySource = { slack: allPages.filter(p => p.page.source === 'slack').length, email: allPages.filter(p => p.page.source === 'email').length };
  const byPerson = {};
  allPages.forEach(p => (p.page.people || []).forEach(person => { byPerson[person] = (byPerson[person] || 0) + 1; }));
  const topPeople = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 20);

  const indexFm = {
    title: 'Communications Archive',
    description: allPages.length + ' threads across Slack + email',
    type: 'index',
    status: 'complete',
    owner: 'Platform',
    market: ['global'],
    tags: ['comms', 'index'],
    aliases: [],
    related: [],
    thread_count: allPages.length,
    slack_count: bySource.slack,
    email_count: bySource.email
  };
  const indexLines = [
    '# Communications Archive',
    '',
    '> ' + allPages.length + ' threads indexed — Slack ' + bySource.slack + ' · Email ' + bySource.email + ' · Action required ' + actionRequired,
    '',
    '## Action required',
    ''
  ];
  allPages.filter(p => p.page.cls.action_required).slice(0, 30).forEach(p => {
    indexLines.push('- [[' + p.page.subject + ']] — ' + p.page.source + ' — ' + (p.page.cls.action_type || 'review'));
  });
  indexLines.push('');
  indexLines.push('## Top people by thread count');
  indexLines.push('');
  topPeople.forEach(([person, n]) => indexLines.push('- [[' + person + ']] — ' + n + ' threads'));
  indexLines.push('');
  indexLines.push('## Recent (last 30)');
  indexLines.push('');
  allPages.slice(0, 30).forEach(p => {
    indexLines.push('- [[' + p.page.subject + ']] · ' + p.page.source + ' · ' + (p.page.lastAt || ''));
  });

  const indexPath = path.join(commsDir, '_Index.md');
  writeFreshPage(indexPath, indexFm, indexLines.join('\n'));

  return {
    slackWritten,
    emailWritten,
    total: allPages.length,
    actionRequired,
    indexPath
  };
}

module.exports = { generateComms, writeAutoSection, writeFreshPage };
