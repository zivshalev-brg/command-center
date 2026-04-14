/**
 * wiki-ingest.js — Smart Ingest Pipeline for Beanz OS Brain
 *
 * When new data arrives (research reports, meeting notes, articles),
 * extracts entities and updates existing wiki pages.
 * One ingest → 10-15 page updates. Knowledge compounds.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { appendLog, getVaultPath } = require('./obsidian-sync');

// ─── Entity Pages ────────────────────────────────────────────

/** Ensure an entity page exists, create if not. Returns the file path. */
function ensureEntityPage(category, name, defaults) {
  var vaultDir = getVaultPath();
  var dir, prefix;
  if (category === 'tool') { dir = path.join(vaultDir, '500-AI-Tech-Intelligence', 'Tools'); prefix = '500-AI-Tech-Intelligence'; }
  else if (category === 'coffee-tool') { dir = path.join(vaultDir, '400-Coffee-Intelligence', 'Products'); prefix = '400-Coffee-Intelligence'; }
  else if (category === 'trend') { dir = path.join(vaultDir, '500-AI-Tech-Intelligence', 'Trends'); prefix = '500-AI-Tech-Intelligence'; }
  else if (category === 'person') { dir = path.join(vaultDir, '100-People'); prefix = '100-People'; }
  else { dir = path.join(vaultDir, '800-Knowledge-Base', 'entities'); prefix = '800-Knowledge-Base'; }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  var slug = _slugify(name);
  var filePath = path.join(dir, slug + '.md');

  if (!fs.existsSync(filePath)) {
    var content = '---\n' +
      'title: "' + _esc(name) + '"\n' +
      'description: "' + _esc((defaults && defaults.description) || name + '.') + '"\n' +
      'type: "reference"\n' +
      'status: "complete"\n' +
      'owner: "Platform"\n' +
      'market: ["global"]\n' +
      'tags: ["' + category + '"' + (defaults && defaults.tags ? ', ' + defaults.tags.map(function(t) { return '"' + t + '"'; }).join(', ') : '') + ']\n' +
      'aliases: ["' + _esc(name) + '"]\n' +
      'related: []\n' +
      'first_seen: "' + new Date().toISOString().slice(0, 10) + '"\n' +
      '---\n\n' +
      '# ' + name + '\n\n' +
      (defaults && defaults.category ? '**Category:** ' + defaults.category + '\n\n' : '') +
      '## Mentions\n\n' +
      '_Auto-populated by smart ingest._\n';
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return filePath;
}

/** Append a mention/reference to an entity page */
function addMentionToEntity(filePath, mention) {
  if (!fs.existsSync(filePath)) return;
  var content = fs.readFileSync(filePath, 'utf-8');
  var date = new Date().toISOString().slice(0, 10);

  // Check if this exact mention already exists (dedup by source + date)
  var mentionKey = mention.source + '-' + date;
  if (content.includes(mentionKey)) return;

  // Find ## Mentions section and append
  var mentionSection = '## Mentions';
  var idx = content.indexOf(mentionSection);
  if (idx === -1) {
    // Add section
    content += '\n\n## Mentions\n';
    idx = content.length;
  } else {
    idx = content.indexOf('\n', idx) + 1;
  }

  var entry = '\n### [' + date + '] ' + _esc(mention.source) + ' <!-- ' + mentionKey + ' -->\n';
  if (mention.sentiment) entry += '**Sentiment:** ' + mention.sentiment + '\n';
  if (mention.quote) entry += '\n> ' + _esc(mention.quote).replace(/\n/g, '\n> ') + '\n';
  if (mention.context) entry += '\n' + _esc(mention.context) + '\n';
  if (mention.url) entry += '\n[Source](' + mention.url + ')\n';

  // Insert after the Mentions header
  var before = content.slice(0, idx);
  var after = content.slice(idx);
  // Remove the placeholder text
  after = after.replace('_Auto-populated by smart ingest._\n', '');
  content = before + entry + after;

  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Research Report Ingest ──────────────────────────────────

/** Ingest a research report — extract entities, create/update pages */
function ingestResearchReport(report, feedType) {
  if (!report) return { pagesUpdated: 0 };
  var vaultDir = getVaultPath();
  if (!fs.existsSync(vaultDir)) return { pagesUpdated: 0 };

  var pagesUpdated = 0;
  var entitiesCreated = 0;
  var date = new Date().toISOString().slice(0, 10);
  var category = feedType === 'tech' ? 'tool' : 'coffee-tool';

  // 1. Extract tools/products and create entity pages
  if (report.tools_and_products) {
    report.tools_and_products.forEach(function(tool) {
      var fp = ensureEntityPage(category, tool.name, {
        description: tool.what_people_say ? tool.what_people_say.slice(0, 150) + '.' : tool.name + ' — ' + (tool.category || 'tool') + '.',
        category: tool.category,
        tags: [tool.category || 'tool']
      });
      addMentionToEntity(fp, {
        source: feedType + '-research-' + date,
        sentiment: tool.sentiment,
        quote: tool.best_quote ? tool.best_quote.quote : null,
        context: tool.what_people_say,
        url: tool.best_quote ? tool.best_quote.url : null
      });
      pagesUpdated++;
    });
  }

  // 2. Extract trends and create trend summary pages
  if (report.trends) {
    var trendsDir = path.join(vaultDir, feedType === 'tech' ? '500-AI-Tech-Intelligence' : '400-Coffee-Intelligence', 'Trends');
    if (!fs.existsSync(trendsDir)) fs.mkdirSync(trendsDir, { recursive: true });

    var monthFile = path.join(trendsDir, date.slice(0, 7) + '.md');
    var trendContent = '---\ntitle: "Trends — ' + date.slice(0, 7) + '"\ndescription: "Monthly trend compilation from research reports."\ntype: "analytics"\nstatus: "in-progress"\nowner: "Platform"\nmarket: ["global"]\ntags: ["research", "trends"]\naliases: ["Trends ' + date.slice(0, 7) + '"]\nrelated: []\n---\n\n# Trends — ' + date.slice(0, 7) + '\n\n';
    report.trends.forEach(function(t) {
      trendContent += '## ' + t.trend + '\n';
      trendContent += '**Confidence:** ' + (t.confidence || 'medium') + ' | **Category:** ' + (t.category || 'general') + '\n\n';
      trendContent += (t.analysis || '') + '\n\n';
      if (t.evidence && t.evidence.length) {
        t.evidence.forEach(function(e) {
          var link = e.url || '';
          trendContent += '> "' + (e.quote || '').replace(/\n/g, ' ') + '"\n> — ' + (e.source || '') + (link ? ' [↗](' + link + ')' : '') + '\n\n';
        });
      }
      if (t.implications) trendContent += '> [!tip] Implications\n> ' + t.implications + '\n\n';
      if (t.tools_mentioned && t.tools_mentioned.length) {
        trendContent += '**Tools:** ' + t.tools_mentioned.map(function(tm) { return '[[' + _slugify(tm) + '|' + tm + ']]'; }).join(', ') + '\n\n';
      }
      trendContent += '---\n\n';
    });
    fs.writeFileSync(monthFile, trendContent, 'utf-8');
    pagesUpdated++;
  }

  // 3. Update reading list as a standalone page
  if (report.reading_list && report.reading_list.length) {
    var readingDir = path.join(vaultDir, feedType === 'tech' ? '500-AI-Tech-Intelligence' : '400-Coffee-Intelligence', 'Reading');
    if (!fs.existsSync(readingDir)) fs.mkdirSync(readingDir, { recursive: true });
    var readingFile = path.join(readingDir, 'reading-list-' + date + '.md');
    var rlContent = '---\ntitle: "Reading List — ' + date + '"\ndescription: "Curated reading list from research report."\ntype: "reference"\nstatus: "complete"\nowner: "Platform"\nmarket: ["global"]\ntags: ["research", "reading-list"]\naliases: []\nrelated: []\n---\n\n# Reading List — ' + date + '\n\n';
    report.reading_list.forEach(function(item) {
      var icon = item.type === 'video' ? '▶' : item.type === 'reddit' ? '△' : '●';
      rlContent += '- ' + icon + ' [' + (item.title || '') + '](' + (item.url || '') + ')' + (item.duration ? ' _' + item.duration + '_' : '') + '\n';
      if (item.why) rlContent += '  ' + item.why + '\n';
    });
    fs.writeFileSync(readingFile, rlContent, 'utf-8');
    pagesUpdated++;
  }

  // 4. Log the ingest
  try {
    var logDetails = '- **Feed:** ' + feedType + '\n' +
      '- **Report:** ' + (report.title || 'Untitled') + '\n' +
      '- **Trends:** ' + (report.trends || []).length + '\n' +
      '- **Tools extracted:** ' + (report.tools_and_products || []).length + '\n' +
      '- **Pages updated:** ' + pagesUpdated + '\n';
    appendLog(vaultDir, 'ingest | ' + feedType + ' research report', logDetails);
  } catch (_) {}

  console.log('[WikiIngest] ' + feedType + ' research: ' + pagesUpdated + ' pages updated, ' + (report.tools_and_products || []).length + ' tools extracted');
  return { pagesUpdated: pagesUpdated, entitiesCreated: entitiesCreated };
}

/** Ingest a meeting note — extract decisions and action items */
function ingestMeetingNote(title, content, attendees) {
  var vaultDir = getVaultPath();
  if (!fs.existsSync(vaultDir)) return;
  var date = new Date().toISOString().slice(0, 10);

  // Update attendee people pages with meeting reference
  (attendees || []).forEach(function(name) {
    var slug = _slugify(name);
    var peoplePath = path.join(vaultDir, '100-People', slug + '.md');
    if (fs.existsSync(peoplePath)) {
      addMentionToEntity(peoplePath, {
        source: 'meeting-' + date,
        context: 'Attended: ' + title
      });
    }
  });

  try {
    appendLog(vaultDir, 'ingest | Meeting note: ' + title, '- **Attendees:** ' + (attendees || []).join(', ') + '\n');
  } catch (_) {}
}

// ─── Helpers ─────────────────────────────────────────────────

function _slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function _esc(s) {
  return (s || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

module.exports = { ingestResearchReport, ingestMeetingNote, ensureEntityPage, addMentionToEntity };
