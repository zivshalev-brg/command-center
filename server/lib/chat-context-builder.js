/**
 * chat-context-builder.js — Assembles the system prompt for the Chat tab.
 *
 * Knowledge now comes from the Obsidian Brain vault (via obsidian-rag.js).
 * Live operational data (comms, calendar) is still read from real-time sources.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON } = require('./helpers');
const rag = require('./obsidian-rag');

function truncate(text, max) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max) + '\n... [truncated]';
}

function safeRead(filePath) {
  try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null; } catch (_) { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Build system prompt — called once per chat request
// ═══════════════════════════════════════════════════════════════

/**
 * @param {object} ctx — server context (dir, intelDir, commsLivePath, …)
 * @param {string} userQuery — the current user message (used for RAG search)
 */
function buildChatSystemPrompt(ctx, userQuery) {
  var sections = [];
  var today = new Date().toISOString().slice(0, 10);
  var db = require('./db');

  // ═══ ROLE + KNOWLEDGE SOURCE ═══
  sections.push(
    '# Role\n' +
    'You are the AI assistant for Ziv Shalev, General Manager of Beanz — a coffee subscription platform under the Breville Group (BRG).\n' +
    'Your knowledge comes from the **Obsidian Brain** vault — a curated, interlinked knowledge base covering people, projects, strategy, analytics, coffee intelligence, AI/tech research, meetings, and domain knowledge.\n' +
    'You also have access to live operational data: communications (Slack + email) and calendar.\n\n' +
    '# Today: ' + today + '\n\n' +
    '# Business Context\n' +
    '- Beanz: coffee subscription platform, markets: AU, UK, US, DE, NL (NL launching July 2026)\n' +
    '- CY25 targets: $13.5M ARR, 1M bags, 36K subscribers, 95.5% SLA\n' +
    '- FTBP (Fast-Track Barista Pack): primary acquisition engine, 41% of revenue\n' +
    '- Key initiatives: FTBP, Platinum Roasters, Project Feral (AI-first, 26 weeks), PBB (Pay-By-Bag), DE/NL expansion\n' +
    '- FY27 priorities: Retention/LTV, FTBP Conversion, Platinum Roasters, PBB, AI'
  );

  // ═══ CORE VAULT PAGES (always included) ═══
  // People, projects, strategy correlations, KPI dashboard
  var corePages = rag.getCorePages(25000);
  if (corePages.length) {
    var coreText = '# Obsidian Brain — Core Knowledge\n' +
      '_' + corePages.length + ' core pages from the vault (People, Projects, Strategy)._\n';
    corePages.forEach(function (page) {
      coreText += '\n## ' + page.title + '\n_Source: ' + page.relPath + '_\n\n' + page.content + '\n';
    });
    sections.push(truncate(coreText, 30000));
  }

  // ═══ QUERY-RELEVANT VAULT PAGES (RAG search) ═══
  if (userQuery) {
    var hits = rag.search(userQuery, { maxResults: 12, maxChars: 40000, maxPerPage: 6000 });
    // Deduplicate against core pages
    var coreSet = {};
    corePages.forEach(function (p) { coreSet[p.relPath] = true; });
    hits = hits.filter(function (h) { return !coreSet[h.relPath]; });

    if (hits.length) {
      var ragText = '# Obsidian Brain — Relevant Pages\n' +
        '_Retrieved ' + hits.length + ' pages matching your query._\n';
      hits.forEach(function (hit) {
        ragText += '\n## ' + hit.title + ' (score: ' + hit.score + ')\n' +
          '_Source: ' + hit.relPath + '_\n';
        if (hit.tags.length) ragText += '_Tags: ' + hit.tags.join(', ') + '_\n';
        ragText += '\n' + hit.content + '\n';
      });
      sections.push(truncate(ragText, 45000));
    }
  }

  // ═══ LIVE COMMUNICATIONS (Slack + Email) ═══
  try {
    var t = '# Live Communications (Slack + Email)\n';
    var classifications = {};
    try {
      var allClass = db.getAllClassifications();
      allClass.forEach(function (c) { classifications[c.thread_id] = c; });
    } catch (_) { /* DB may not have classifications */ }

    var addThreads = function (filePath, source) {
      var data = safeRead(filePath);
      if (!data || !data.threads) return;
      var threads = Object.entries(data.threads);
      threads.sort(function (a, b) { return (b[1].messages || []).length - (a[1].messages || []).length; });

      threads.slice(0, 30).forEach(function (entry) {
        var id = entry[0], th = entry[1];
        var subject = th.subject || th.title || '(no subject)';
        var people = (th.people || []).filter(Boolean).slice(0, 5).join(', ');
        var msgCount = (th.messages || []).length;
        var cls = classifications[id];

        t += '\n**' + subject + '** [' + source + ']\n';
        t += '  People: ' + people + ' | Messages: ' + msgCount + '\n';

        if (cls) {
          t += '  Category: ' + cls.category;
          if (cls.subcategory) t += '/' + cls.subcategory;
          t += ' | Priority: ' + cls.priority;
          t += ' | Sentiment: ' + cls.sentiment;
          if (cls.action_required) t += ' | ACTION REQUIRED: ' + (cls.action_type || 'yes');
          t += '\n';
          if (cls.summary) t += '  AI Summary: ' + cls.summary + '\n';
          if (cls.project_tags) {
            try { var tags = JSON.parse(cls.project_tags); if (tags.length) t += '  Projects: ' + tags.join(', ') + '\n'; } catch (_) {}
          }
        }

        var latest = th.messages && th.messages.length ? th.messages[th.messages.length - 1] : null;
        if (latest) {
          var sender = latest.sender || latest.from || '';
          var body = (latest.text || latest.body || '').replace(/\n/g, ' ').slice(0, 200);
          if (body) t += '  Latest (' + sender + '): ' + body + '\n';
        }
      });
    };

    if (ctx.commsLivePath) addThreads(ctx.commsLivePath, 'Slack');
    var emailPath = path.join(ctx.dir, 'kb-data', 'intelligence', 'email-live.json');
    addThreads(emailPath, 'Email');

    var totalClassified = Object.keys(classifications).length;
    var actionRequired = Object.values(classifications).filter(function (c) { return c.action_required; }).length;
    var critical = Object.values(classifications).filter(function (c) { return c.priority === 'critical'; }).length;
    t += '\n---\nClassified: ' + totalClassified + ' threads | Action required: ' + actionRequired + ' | Critical: ' + critical + '\n';

    sections.push(truncate(t, 25000));
  } catch (_) { /* ignore comms errors */ }

  // ═══ LIVE CALENDAR ═══
  var calData = readJSON(path.join(ctx.intelDir || '', 'calendar-live.json'));
  if (calData) {
    var t2 = '# Calendar\n';
    var events = calData.events;
    if (events && typeof events === 'object' && !Array.isArray(events)) {
      Object.entries(events).forEach(function (entry) {
        var date = entry[0], dayEvents = entry[1];
        t2 += '\n## ' + date + '\n';
        if (Array.isArray(dayEvents)) {
          dayEvents.forEach(function (ev) {
            t2 += '- ' + (ev.time || '') + ' ' + (ev.subject || 'Untitled');
            if (ev.location) t2 += ' @ ' + ev.location;
            if (ev.organizer) t2 += ' (org: ' + ev.organizer + ')';
            if (ev.attendees && ev.attendees.length > 1) t2 += ' [' + ev.attendees.slice(0, 5).join(', ') + ']';
            t2 += '\n';
          });
        }
      });
    } else if (Array.isArray(events)) {
      events.slice(0, 30).forEach(function (ev) {
        t2 += '- ' + (ev.subject || 'Untitled') + ' | ' + (ev.time || ev.start || '') + '\n';
      });
    }
    sections.push(truncate(t2, 4000));
  }

  // ═══ COMMS ANALYTICS SNAPSHOT ═══
  try {
    var latestDate = db.getLatestSnapshotDate();
    if (latestDate) {
      var snapshots = db.getAnalyticsSnapshots(latestDate, latestDate);
      if (snapshots.length > 0) {
        var t3 = '# Comms Analytics Snapshot (' + latestDate + ')\n';
        var byDim = { topic: [], person: [], project: [] };
        snapshots.forEach(function (s) { if (byDim[s.dimension]) byDim[s.dimension].push(s); });

        t3 += '\n## Top Topics\n';
        byDim.topic.sort(function (a, b) { return b.thread_count - a.thread_count; }).slice(0, 15).forEach(function (s) {
          t3 += '- ' + s.dimension_key + ': ' + s.thread_count + ' threads, ' + s.message_count + ' msgs\n';
        });

        t3 += '\n## Most Active People\n';
        byDim.person.sort(function (a, b) { return b.thread_count - a.thread_count; }).slice(0, 15).forEach(function (s) {
          t3 += '- ' + s.dimension_key + ': ' + s.thread_count + ' threads\n';
        });

        t3 += '\n## Project Mentions\n';
        byDim.project.sort(function (a, b) { return b.thread_count - a.thread_count; }).forEach(function (s) {
          t3 += '- ' + s.dimension_key + ': ' + s.thread_count + ' threads\n';
        });

        sections.push(truncate(t3, 5000));
      }
    }
  } catch (_) {}

  // ═══ RESPONSE GUIDELINES ═══
  sections.push(
    '# Response Guidelines\n' +
    '- Be concise and specific. Reference real names, dates, numbers from the data above.\n' +
    '- Use markdown formatting: **bold** key points, bullet lists for action items.\n' +
    '- When asked about people, reference their role and recent activity.\n' +
    '- When asked about action items, check threads with ACTION REQUIRED flag.\n' +
    '- When asked about projects, reference their status and latest updates.\n' +
    '- When citing vault knowledge, mention the source page for traceability.\n' +
    '- If data is insufficient, say so — don\'t fabricate.\n' +
    '- Data timestamp: ' + new Date().toISOString()
  );

  return sections.join('\n\n');
}

module.exports = { buildChatSystemPrompt };
