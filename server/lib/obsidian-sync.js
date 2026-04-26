/**
 * Obsidian Vault Sync Engine for Beanz OS Command Center
 *
 * Reads all system data (KB files, SQLite, news stores, learning data)
 * and generates a complete Obsidian vault of interlinked markdown files.
 *
 * Usage:
 *   const { syncVault, getSyncStatus } = require('./obsidian-sync');
 *   await syncVault(ctx);
 */

const fs = require('fs');
const path = require('path');
const { getDb, getAllNewsAiCache, getNewsReadIds, getAllNewsNotes, getLatestNewsDigest, getCompetitorAlerts } = require('./db');
const { loadNewsStore, NEWS_SOURCES } = require('./news-engine');
const { loadLearningStore } = require('./learning');

// ─── Vault Path ──────────────────────────────────────────────
const DEFAULT_VAULT_PATH = path.join(process.env.USERPROFILE || process.env.HOME || '', 'BeanzOS-Brain');

function getVaultPath() {
  return process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT_PATH;
}

// ─── Sync State ──────────────────────────────────────────────
const _syncState = {
  lastSync: null,
  pagesGenerated: 0,
  vaultPath: null,
  errors: []
};

function getSyncStatus() {
  return {
    lastSync: _syncState.lastSync,
    pagesGenerated: _syncState.pagesGenerated,
    vaultPath: _syncState.vaultPath
  };
}

// ─── Helper Functions ────────────────────────────────────────

function slugify(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Generate Obsidian-compliant YAML frontmatter following Beanz KB 9-field standard */
function frontmatter(obj) {
  // Ensure all 9 required fields exist with defaults
  var fm = {
    title: obj.title || '',
    description: obj.description || '',
    type: obj.type || 'reference',
    status: obj.status || 'complete',
    owner: obj.owner || 'Platform',
    market: obj.market || ['global'],
    tags: obj.tags || [],
    aliases: obj.aliases || [],
    related: obj.related || []
  };
  // Merge any additional fields
  for (var k in obj) {
    if (!fm.hasOwnProperty(k)) fm[k] = obj[k];
  }
  var lines = ['---'];
  for (var key in fm) {
    var value = fm[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) { lines.push(key + ': []'); continue; }
      // Related uses wikilink format
      if (key === 'related') {
        lines.push(key + ':');
        value.forEach(function(v) { lines.push('  - "' + v + '"'); });
      } else {
        lines.push(key + ': [' + value.map(function(v) { return JSON.stringify(String(v)); }).join(', ') + ']');
      }
    } else {
      lines.push(key + ': ' + JSON.stringify(String(value)));
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function wikilink(name) {
  if (!name) return '';
  return `[[${name}]]`;
}

function callout(type, title, content) {
  const lines = [`> [!${type}] ${title}`];
  if (content) {
    const contentLines = String(content).split('\n');
    for (const line of contentLines) {
      lines.push(`> ${line}`);
    }
  }
  return lines.join('\n');
}

function heading(level, text) {
  return `${'#'.repeat(level)} ${text}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writePage(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
  _syncState.pagesGenerated++;
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function youtubeTimestampUrl(videoId, timestamp) {
  if (!videoId) return '';
  const seconds = Math.floor(Number(timestamp) || 0);
  return seconds > 0
    ? `https://youtube.com/watch?v=${videoId}&t=${seconds}s`
    : `https://youtube.com/watch?v=${videoId}`;
}

// ─── Section Generators ──────────────────────────────────────

function generateDashboard(vaultDir) {
  const content = [
    frontmatter({
      title: 'Beanz OS — Knowledge Brain',
      description: 'Central dashboard for the Beanz OS knowledge vault.',
      type: 'reference',
      status: 'complete',
      owner: 'Platform',
      market: ['global'],
      tags: ['navigation', 'index'],
      aliases: ['Home', 'Dashboard', 'Brain']
    }),
    heading(1, 'Beanz OS — Knowledge Brain'),
    '',
    `**Date:** ${todayStr()}`,
    `**Last sync:** ${nowIso()}`,
    '',
    heading(2, 'Sections'),
    '',
    `- ${wikilink('100-People/_Index')} — Team directory`,
    `- ${wikilink('200-Projects/_Index')} — Project tracker`,
    `- ${wikilink('300-Comms/_Index')} — Communications archive`,
    `- ${wikilink('400-Coffee-Intelligence/_Index')} — Coffee news & research`,
    `- ${wikilink('500-AI-Tech-Intelligence/_Index')} — AI & tech research`,
    `- ${wikilink('600-Strategy/_Index')} — Strategy & correlations`,
    `- ${wikilink('700-Meetings/_Index')} — Meeting notes`,
    `- ${wikilink('800-Knowledge-Base/_Index')} — Domain knowledge`,
    `- ${wikilink('900-Learning/_Index')} — Self-learning engine`,
    `- ${wikilink('Templates/_Index')} — Note templates`,
    `- ${wikilink('000-Standards/KB-Author-Skill')} — KB authoring standards & tag taxonomy`,
    ''
  ].join('\n');
  writePage(path.join(vaultDir, '000-Dashboard', 'Home.md'), content);
}

function generatePeople(vaultDir, ctx) {
  const dirPath = path.join(vaultDir, '100-People');
  const teamFile = path.join(ctx.intelDir, 'team-directory.json');
  const teamData = safeReadJson(teamFile);
  const team = (teamData && teamData.team) ? teamData.team : [];

  // Load learning notes for people
  let personNotes = {};
  try {
    const db = getDb();
    const rows = db.prepare("SELECT target_id, note FROM learning_notes WHERE target_type = 'person'").all();
    for (const row of rows) {
      personNotes[row.target_id] = personNotes[row.target_id]
        ? personNotes[row.target_id] + '\n' + row.note
        : row.note;
    }
  } catch { /* db not available */ }

  // Load project data for cross-linking
  const projFile = path.join(ctx.intelDir, 'project-updates.json');
  const projData = safeReadJson(projFile);
  const projects = (projData && projData.projects) ? projData.projects : {};

  const indexLinks = [];

  for (const person of team) {
    if (!person.name) continue;
    const fileName = slugify(person.name) + '.md';
    const personSlug = slugify(person.name);

    // Find linked projects
    const linkedProjects = [];
    for (const [key, proj] of Object.entries(projects)) {
      if (proj.lead && proj.lead.toLowerCase().includes(person.name.split(' ')[0].toLowerCase())) {
        linkedProjects.push({ name: key, role: 'Lead' });
      }
    }

    const notes = personNotes[person.name] || personNotes[personSlug] || '';

    const relatedLinks = linkedProjects.map(function(p) { return '[[' + slugify(p.name) + '|' + p.name + ']]'; });
    const content = [
      frontmatter({
        title: person.name,
        description: (person.role || 'Team member') + ' at Beanz, ' + (person.location || 'Global') + '.',
        type: 'reference',
        status: 'complete',
        owner: 'Operations',
        market: [person.location ? person.location.toLowerCase().replace(/\/.+/, '').trim() : 'global'],
        tags: ['person', person.tier || 'team', 'users'],
        aliases: [person.name.split(' ')[0], person.role ? person.role.split(',')[0].trim() : person.name],
        related: relatedLinks,
        role: person.role || '',
        location: person.location || '',
        email: person.email || '',
        scope: person.scope || '',
        reports_to: person.reports_to || '',
        tier: person.tier || '',
        sources: ['kb-data/intelligence/team-directory.json'],
        valid_from: teamData.generated || '2026-02-24',
        confidence: 'high',
        review_cycle: 'quarterly'
      }),
      heading(1, person.name),
      '',
      `**Role:** ${person.role || 'N/A'}`,
      `**Location:** ${person.location || 'N/A'}`,
      `**Scope:** ${person.scope || 'N/A'}`,
      `**Reports to:** ${person.reports_to ? wikilink(person.reports_to) : 'N/A'}`,
      '',
      heading(2, 'Linked Projects'),
      linkedProjects.length > 0
        ? linkedProjects.map(p => `- ${wikilink(p.name)} — ${p.role}`).join('\n')
        : '- _No linked projects detected_',
      '',
      heading(2, 'Notes'),
      notes || '_No notes yet._',
      ''
    ].join('\n');

    writePage(path.join(dirPath, fileName), content);
    indexLinks.push(`- ${wikilink(person.name)} — ${person.role || ''}`);
  }

  const indexContent = [
    frontmatter({ tags: ['index', 'people'], type: 'index' }),
    heading(1, 'People'),
    '',
    `${team.length} team members`,
    '',
    ...indexLinks,
    ''
  ].join('\n');
  writePage(path.join(dirPath, '_Index.md'), indexContent);
}

function generateProjects(vaultDir, ctx) {
  const dirPath = path.join(vaultDir, '200-Projects');
  const projFile = path.join(ctx.intelDir, 'project-updates.json');
  const projData = safeReadJson(projFile);
  const projects = (projData && projData.projects) ? projData.projects : {};

  const indexLinks = [];

  for (const [key, proj] of Object.entries(projects)) {
    const fileName = slugify(key) + '.md';
    const status = proj.status || 'unknown';
    const lead = proj.lead || 'Unassigned';

    const prettyName = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    const leadLink = lead !== 'Unassigned' ? '[[' + slugify(lead) + '|' + lead + ']]' : '';
    const sections = [
      frontmatter({
        title: prettyName,
        description: (proj.latest || prettyName + ' project.').slice(0, 200).replace(/\n/g, ' '),
        type: 'strategy',
        status: status === 'active' ? 'in-progress' : status === 'testing' ? 'in-progress' : status === 'planning' ? 'draft' : 'complete',
        owner: 'Product',
        market: ['global'],
        tags: ['projects', status, proj.ai_focus ? 'ai' : 'platform'].filter(Boolean),
        aliases: [prettyName, key.replace(/_/g, '-')],
        related: leadLink ? [leadLink] : [],
        lead: lead,
        sources: ['kb-data/intelligence/project-updates.json'],
        valid_from: projData.generated || '2026-02-24',
        confidence: 'high',
        review_cycle: 'weekly'
      }),
      heading(1, key),
      '',
      `**Status:** ${status}`,
      `**Lead:** ${wikilink(lead)}`,
      ''
    ];

    if (proj.latest) {
      sections.push(heading(2, 'Latest Update'));
      sections.push(String(proj.latest));
      sections.push('');
    }

    if (proj.workstreams_active && proj.workstreams_active.length > 0) {
      sections.push(heading(2, 'Workstreams'));
      for (const ws of proj.workstreams_active) {
        sections.push(`- ${ws}`);
      }
      sections.push('');
    }

    if (proj.blockers && proj.blockers.length > 0) {
      sections.push(heading(2, 'Blockers'));
      for (const blocker of proj.blockers) {
        sections.push(`- ${blocker}`);
      }
      sections.push('');
    }

    // Gather any extra key_data fields
    const knownKeys = new Set(['status', 'lead', 'latest', 'workstreams_active', 'blockers']);
    const extraKeys = Object.keys(proj).filter(k => !knownKeys.has(k));
    if (extraKeys.length > 0) {
      sections.push(heading(2, 'Key Data'));
      for (const k of extraKeys) {
        const val = proj[k];
        if (typeof val === 'object') {
          sections.push(`**${k}:** \`${JSON.stringify(val)}\``);
        } else {
          sections.push(`**${k}:** ${val}`);
        }
      }
      sections.push('');
    }

    writePage(path.join(dirPath, fileName), sections.join('\n'));
    indexLinks.push(`- ${wikilink(key)} — ${status} (${lead})`);
  }

  const indexContent = [
    frontmatter({ tags: ['index', 'projects'], type: 'index' }),
    heading(1, 'Projects'),
    '',
    `${Object.keys(projects).length} tracked projects`,
    '',
    ...indexLinks,
    ''
  ].join('\n');
  writePage(path.join(dirPath, '_Index.md'), indexContent);
}

function generateCommsPlaceholder(vaultDir) {
  const content = [
    frontmatter({ tags: ['index', 'comms'], type: 'index' }),
    heading(1, 'Communications Archive'),
    '',
    callout('info', 'Coming Soon', 'Comms archive will be populated in a future update. Thread volume is too high for initial sync.'),
    ''
  ].join('\n');
  writePage(path.join(vaultDir, '300-Comms', '_Index.md'), content);
}

// ─── News / Research Helpers ─────────────────────────────────

function convertResearchReportToMarkdown(report) {
  if (!report) return '_No report data available._';
  const sections = [];

  if (report.title) sections.push(heading(1, report.title));
  if (report.subtitle) sections.push(`*${report.subtitle}*`);
  sections.push('');

  if (report.executive_summary) {
    sections.push(heading(2, 'Executive Summary'));
    sections.push(report.executive_summary);
    sections.push('');
  }

  if (report.trends && report.trends.length > 0) {
    sections.push(heading(2, 'Trends'));
    for (const trend of report.trends) {
      sections.push(heading(3, `${trend.trend} (${trend.confidence || 'N/A'})`));
      if (trend.category) sections.push(`**Category:** ${trend.category}`);
      sections.push('');
      if (trend.analysis) {
        sections.push(trend.analysis);
        sections.push('');
      }

      if (trend.evidence && trend.evidence.length > 0) {
        for (const ev of trend.evidence) {
          const sourceLink = ev.videoId
            ? `[${ev.source || 'Source'}](${youtubeTimestampUrl(ev.videoId, ev.timestamp)})`
            : ev.url
              ? `[${ev.source || 'Source'}](${ev.url})`
              : (ev.source || 'Unknown source');
          sections.push(callout('quote', sourceLink, ev.quote));
          sections.push('');
        }
      }

      if (trend.implications) {
        sections.push(callout('tip', 'Implications', trend.implications));
        sections.push('');
      }

      if (trend.tools_mentioned && trend.tools_mentioned.length > 0) {
        sections.push(`**Tools mentioned:** ${trend.tools_mentioned.map(t => wikilink(t)).join(', ')}`);
        sections.push('');
      }
    }
  }

  if (report.deep_dives && report.deep_dives.length > 0) {
    sections.push(heading(2, 'Deep Dives'));
    for (const dive of report.deep_dives) {
      sections.push(heading(3, dive.title));
      if (dive.synthesis) {
        sections.push(dive.synthesis);
        sections.push('');
      }
      if (dive.key_quotes && dive.key_quotes.length > 0) {
        for (const kq of dive.key_quotes) {
          const speaker = kq.videoId
            ? `[${kq.speaker || 'Speaker'}](${youtubeTimestampUrl(kq.videoId, kq.timestamp)})`
            : (kq.speaker || 'Speaker');
          sections.push(callout('quote', speaker, kq.quote));
          sections.push('');
        }
      }
      if (dive.takeaway) {
        sections.push(callout('tip', 'Takeaway', dive.takeaway));
        sections.push('');
      }
    }
  }

  if (report.podcast_highlights && report.podcast_highlights.length > 0) {
    sections.push(heading(2, 'Podcast Highlights'));
    for (const p of report.podcast_highlights) {
      const url = p.url || (p.videoId ? `https://www.youtube.com/watch?v=${p.videoId}` : '');
      const title = url ? `[${p.episode_title || 'Episode'}](${url})` : (p.episode_title || 'Episode');
      sections.push(heading(3, `${p.show ? p.show + ' — ' : ''}${title}`));
      if (p.host_summary) {
        sections.push(p.host_summary);
        sections.push('');
      }
      if (p.key_segments && p.key_segments.length > 0) {
        for (const seg of p.key_segments) {
          const segUrl = seg.url || (p.videoId && seg.timestamp ? `${url}&t=${Math.floor(seg.timestamp)}s` : url);
          const speaker = segUrl ? `[${seg.speaker || 'Speaker'}](${segUrl})` : (seg.speaker || 'Speaker');
          const ts = seg.timestamp ? ` _[${Math.floor(seg.timestamp/60)}:${('0'+Math.floor(seg.timestamp%60)).slice(-2)}]_` : '';
          sections.push(callout('quote', `${speaker}${ts}${seg.topic ? ' — ' + seg.topic : ''}`, seg.quote));
          sections.push('');
        }
      }
      if (p.takeaway) {
        sections.push(callout('tip', 'Takeaway', p.takeaway));
        sections.push('');
      }
    }
  }

  if (report.tools_and_products && report.tools_and_products.length > 0) {
    sections.push(heading(2, 'Tools & Products'));
    sections.push('');
    sections.push('| Tool | Category | Mentions | Sentiment | What People Say |');
    sections.push('|------|----------|----------|-----------|-----------------|');
    for (const tool of report.tools_and_products) {
      const name = wikilink(tool.name);
      sections.push(`| ${name} | ${tool.category || ''} | ${tool.mentions || ''} | ${tool.sentiment || ''} | ${tool.what_people_say || ''} |`);
    }
    sections.push('');
    // Add best quotes under the table
    for (const tool of report.tools_and_products) {
      if (tool.best_quote && tool.best_quote.quote) {
        sections.push(callout('quote', `${tool.name} — ${tool.best_quote.source || 'Anonymous'}`, tool.best_quote.quote));
        sections.push('');
      }
    }
  }

  if (report.predictions_and_debates && report.predictions_and_debates.length > 0) {
    sections.push(heading(2, 'Predictions & Debates'));
    for (const debate of report.predictions_and_debates) {
      sections.push(heading(3, debate.topic));
      if (debate.positions && debate.positions.length > 0) {
        for (const pos of debate.positions) {
          sections.push(callout('warning', `${pos.advocate || 'Unknown'}`, `**${pos.position}**\n\n${pos.quote || ''}`));
          sections.push('');
        }
      }
    }
  }

  if (report.reading_list && report.reading_list.length > 0) {
    sections.push(heading(2, 'Reading List'));
    for (const item of report.reading_list) {
      const link = item.url ? `[${item.title}](${item.url})` : item.title;
      sections.push(`- ${link} (${item.type || 'link'}) — ${item.why || ''}`);
    }
    sections.push('');
  }

  if (report.bottom_line) {
    sections.push(heading(2, 'Bottom Line'));
    sections.push(callout('abstract', 'TL;DR', report.bottom_line));
    sections.push('');
  }

  return sections.join('\n');
}

function generateNewsSection(vaultDir, ctx, sectionDir, storePath, digestDailyKey, digestWeeklyKey, sectionTitle) {
  const newsDir = path.join(vaultDir, sectionDir);
  const store = loadNewsStore(storePath);
  const articles = store.articles || [];
  const indexLinks = [];

  // Group articles by date
  const byDate = {};
  for (const article of articles) {
    const dateKey = article.publishedAt
      ? String(article.publishedAt).slice(0, 10)
      : (article.fetched ? String(article.fetched).slice(0, 10) : 'undated');
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(article);
  }

  // Generate daily news pages
  const newsSubDir = path.join(newsDir, 'News');
  const sortedDates = Object.keys(byDate).sort().reverse();
  for (const dateKey of sortedDates) {
    const dayArticles = byDate[dateKey];
    const sections = [
      frontmatter({ tags: ['news', sectionDir.toLowerCase()], date: dateKey }),
      heading(1, `${sectionTitle} News — ${dateKey}`),
      '',
      `${dayArticles.length} articles`,
      ''
    ];

    for (const art of dayArticles) {
      const title = art.title || 'Untitled';
      const source = art.sourceName || art.source || '';
      const link = art.link || art.url || '';
      sections.push(heading(3, link ? `[${title}](${link})` : title));
      if (source) sections.push(`**Source:** ${source}`);
      if (art.summary) sections.push(art.summary);
      if (art.description) sections.push(art.description);
      sections.push('');
    }

    writePage(path.join(newsSubDir, `${dateKey}.md`), sections.join('\n'));
    indexLinks.push(`- ${wikilink(`${dateKey}`)} — ${dayArticles.length} articles`);
  }

  // Generate research digest pages
  const researchDir = path.join(newsDir, 'Research');

  for (const [key, label] of [[digestDailyKey, 'Daily'], [digestWeeklyKey, 'Weekly']]) {
    try {
      const digest = getLatestNewsDigest(key);
      if (digest && digest.content) {
        let report = null;
        try { report = JSON.parse(digest.content); } catch { /* not JSON */ }

        const dateStr = digest.generated_at ? String(digest.generated_at).slice(0, 10) : todayStr();
        const fileName = `${label}-${dateStr}.md`;

        if (report && report.title) {
          const content = [
            frontmatter({ tags: ['research', label.toLowerCase(), sectionDir.toLowerCase()], date: dateStr, period: key }),
            convertResearchReportToMarkdown(report),
            ''
          ].join('\n');
          writePage(path.join(researchDir, fileName), content);
        } else {
          // Plain text digest
          const content = [
            frontmatter({ tags: ['research', label.toLowerCase()], date: dateStr }),
            heading(1, `${sectionTitle} ${label} Research — ${dateStr}`),
            '',
            String(digest.content),
            ''
          ].join('\n');
          writePage(path.join(researchDir, fileName), content);
        }
        indexLinks.push(`- ${wikilink(`${label}-${dateStr}`)} — ${label} research digest`);
      }
    } catch { /* digest not available */ }
  }

  // Section index
  const indexContent = [
    frontmatter({ tags: ['index', sectionDir.toLowerCase()], type: 'index' }),
    heading(1, sectionTitle),
    '',
    heading(2, 'News'),
    indexLinks.filter(l => !l.includes('research')).join('\n') || '_No news articles synced yet._',
    '',
    heading(2, 'Research Digests'),
    indexLinks.filter(l => l.includes('research')).join('\n') || '_No research digests available yet._',
    ''
  ].join('\n');
  writePage(path.join(newsDir, '_Index.md'), indexContent);
}

function generateCoffeeIntelligence(vaultDir, ctx) {
  // News + research
  generateNewsSection(
    vaultDir, ctx,
    '400-Coffee-Intelligence',
    ctx.newsStore,
    'coffee_research_daily',
    'coffee_research_weekly',
    'Coffee Intelligence'
  );

  // Roasters from CIBE
  const roasterDir = path.join(vaultDir, '400-Coffee-Intelligence', 'Roasters');
  try {
    const db = getDb();
    const roasters = db.prepare('SELECT * FROM cibe_roasters WHERE active = 1').all();
    const roasterLinks = [];

    for (const r of roasters) {
      const fileName = slugify(r.name) + '.md';
      const content = [
        frontmatter({
          tags: ['roaster', r.country || 'unknown'],
          country: r.country || '',
          partner: r.beanz_partner ? 'yes' : 'no'
        }),
        heading(1, r.name),
        '',
        `**Country:** ${r.country || 'N/A'}`,
        `**Type:** ${r.type || 'roaster'}`,
        r.website ? `**Website:** [${r.website}](${r.website})` : '',
        r.instagram ? `**Instagram:** ${r.instagram}` : '',
        r.shop_url ? `**Shop:** [${r.shop_url}](${r.shop_url})` : '',
        `**Beanz Partner:** ${r.beanz_partner ? 'Yes' : 'No'}`,
        ''
      ].filter(Boolean).join('\n');

      writePage(path.join(roasterDir, fileName), content);
      roasterLinks.push(`- ${wikilink(r.name)} — ${r.country || ''} ${r.beanz_partner ? '(Partner)' : ''}`);
    }

    // Append roaster links to index
    if (roasterLinks.length > 0) {
      const indexPath = path.join(vaultDir, '400-Coffee-Intelligence', '_Index.md');
      const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';
      const appendContent = [
        '',
        heading(2, 'Roasters'),
        `${roasters.length} active roasters`,
        '',
        ...roasterLinks,
        ''
      ].join('\n');
      writePage(indexPath, existing + appendContent);
    }
  } catch { /* db or table not available */ }
}

function generateAiTechIntelligence(vaultDir, ctx) {
  generateNewsSection(
    vaultDir, ctx,
    '500-AI-Tech-Intelligence',
    ctx.techNewsStore,
    'tech_research_daily',
    'tech_research_weekly',
    'AI & Tech Intelligence'
  );
}

function generateStrategy(vaultDir, ctx) {
  const stratDir = path.join(vaultDir, '600-Strategy');
  const kbStratDir = path.join(ctx.kbDir, 'strategy');
  const indexLinks = [];

  // Copy strategy KB files with added frontmatter
  if (fs.existsSync(kbStratDir)) {
    const files = fs.readdirSync(kbStratDir).filter(f => !f.startsWith('_'));
    for (const file of files) {
      const srcPath = path.join(kbStratDir, file);
      const stat = fs.statSync(srcPath);
      if (!stat.isFile()) continue;

      const raw = fs.readFileSync(srcPath, 'utf-8');
      const baseName = path.basename(file, path.extname(file));

      if (file.endsWith('.md')) {
        const hasExistingFrontmatter = raw.trimStart().startsWith('---');
        const content = hasExistingFrontmatter
          ? raw
          : frontmatter({ tags: ['strategy'], source: 'kb-data' }) + '\n' + raw;
        writePage(path.join(stratDir, file), content);
      } else if (file.endsWith('.json')) {
        const data = safeReadJson(srcPath);
        const content = [
          frontmatter({ tags: ['strategy', 'data'], source: 'kb-data' }),
          heading(1, baseName.replace(/-/g, ' ')),
          '',
          '```json',
          JSON.stringify(data, null, 2),
          '```',
          ''
        ].join('\n');
        writePage(path.join(stratDir, baseName + '.md'), content);
      }

      indexLinks.push(`- ${wikilink(baseName)}`);
    }
  }

  // Generate Correlations.md — the 8 data correlations
  const correlations = [
    { id: 'COR-1', title: 'Cancellation acceleration vs growth', type: 'critical', detail: 'Cancellation rate accelerating despite revenue growth — structural retention problem.' },
    { id: 'COR-2', title: 'Oracle 21x revenue over-index', type: 'opportunity', detail: 'Oracle machines generate 21x more subscription revenue per unit — massive LTV opportunity.' },
    { id: 'COR-3', title: 'FTBP v2 conversion leap', type: 'positive', detail: 'FTBP v2 showing significant conversion improvement over v1.' },
    { id: 'COR-4', title: 'Large bag adoption accelerating', type: 'positive', detail: 'Customers shifting to larger bag sizes — higher AOV and retention signal.' },
    { id: 'COR-5', title: 'DE delivery deterioration', type: 'warning', detail: 'Germany delivery SLA declining — risk to new market growth.' },
    { id: 'COR-6', title: 'Platinum flywheel working', type: 'positive', detail: 'Platinum Roaster Program creating positive engagement flywheel.' },
    { id: 'COR-7', title: 'FTBP single-channel risk', type: 'warning', detail: 'FTBP heavily concentrated in one acquisition channel.' },
    { id: 'COR-8', title: 'Flat LTV despite revenue growth', type: 'warning', detail: 'LTV not growing proportionally with revenue — churn offsetting gains.' }
  ];

  const corSections = [
    frontmatter({ tags: ['strategy', 'correlations'] }),
    heading(1, 'Strategic Data Correlations'),
    '',
    `8 active correlations as of ${todayStr()}`,
    ''
  ];
  for (const cor of correlations) {
    const calloutType = cor.type === 'critical' ? 'danger'
      : cor.type === 'warning' ? 'warning'
        : cor.type === 'opportunity' ? 'tip'
          : 'success';
    corSections.push(heading(3, `${cor.id}: ${cor.title}`));
    corSections.push(callout(calloutType, cor.type.toUpperCase(), cor.detail));
    corSections.push('');
  }
  writePage(path.join(stratDir, 'Correlations.md'), corSections.join('\n'));
  indexLinks.push(`- ${wikilink('Correlations')}`);

  // Generate KPI-Dashboard.md from PBI data if available
  const pbiLivePath = path.join(ctx.intelDir, 'pbi-live.json');
  const pbiData = safeReadJson(pbiLivePath);
  if (pbiData) {
    const kpiSections = [
      frontmatter({ tags: ['strategy', 'kpi', 'metrics'] }),
      heading(1, 'KPI Dashboard'),
      '',
      `**Source:** Power BI live data`,
      `**Last updated:** ${pbiData.lastRefreshed || 'unknown'}`,
      ''
    ];

    if (pbiData.metrics && typeof pbiData.metrics === 'object') {
      kpiSections.push(heading(2, 'Key Metrics'));
      kpiSections.push('');
      kpiSections.push('| Metric | Value |');
      kpiSections.push('|--------|-------|');
      for (const [key, val] of Object.entries(pbiData.metrics)) {
        kpiSections.push(`| ${key} | ${val} |`);
      }
      kpiSections.push('');
    } else {
      kpiSections.push('```json');
      kpiSections.push(JSON.stringify(pbiData, null, 2).slice(0, 5000));
      kpiSections.push('```');
      kpiSections.push('');
    }

    writePage(path.join(stratDir, 'KPI-Dashboard.md'), kpiSections.join('\n'));
    indexLinks.push(`- ${wikilink('KPI-Dashboard')}`);
  }

  // Section index
  const indexContent = [
    frontmatter({ tags: ['index', 'strategy'], type: 'index' }),
    heading(1, 'Strategy'),
    '',
    ...indexLinks,
    ''
  ].join('\n');
  writePage(path.join(stratDir, '_Index.md'), indexContent);
}

function generateMeetings(vaultDir, ctx) {
  const meetDir = path.join(vaultDir, '700-Meetings');
  const kbMeetDir = path.join(ctx.kbDir, 'meetings');
  const indexLinks = [];

  if (fs.existsSync(kbMeetDir)) {
    const entries = fs.readdirSync(kbMeetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue;
      const entryPath = path.join(kbMeetDir, entry.name);

      if (entry.isDirectory()) {
        // Subdirectory of meeting notes (e.g. 2026-02/)
        const subFiles = fs.readdirSync(entryPath).filter(f => !f.startsWith('_'));
        for (const file of subFiles) {
          const filePath = path.join(entryPath, file);
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;
          const baseName = path.basename(file, path.extname(file));
          const raw = fs.readFileSync(filePath, 'utf-8');

          if (file.endsWith('.md')) {
            const hasExistingFrontmatter = raw.trimStart().startsWith('---');
            const content = hasExistingFrontmatter
              ? raw
              : frontmatter({ tags: ['meeting'], folder: entry.name }) + '\n' + raw;
            writePage(path.join(meetDir, entry.name, file), content);
          } else if (file.endsWith('.json')) {
            const data = safeReadJson(filePath);
            const content = [
              frontmatter({ tags: ['meeting', 'data'], folder: entry.name }),
              heading(1, baseName.replace(/-/g, ' ')),
              '',
              '```json',
              JSON.stringify(data, null, 2),
              '```',
              ''
            ].join('\n');
            writePage(path.join(meetDir, entry.name, baseName + '.md'), content);
          }
          indexLinks.push(`- ${wikilink(baseName)} (${entry.name})`);
        }
      } else if (entry.isFile()) {
        const baseName = path.basename(entry.name, path.extname(entry.name));
        const raw = fs.readFileSync(entryPath, 'utf-8');

        if (entry.name.endsWith('.md')) {
          const hasExistingFrontmatter = raw.trimStart().startsWith('---');
          const content = hasExistingFrontmatter
            ? raw
            : frontmatter({ tags: ['meeting'] }) + '\n' + raw;
          writePage(path.join(meetDir, entry.name), content);
        }
        indexLinks.push(`- ${wikilink(baseName)}`);
      }
    }
  }

  const indexContent = [
    frontmatter({ tags: ['index', 'meetings'], type: 'index' }),
    heading(1, 'Meetings'),
    '',
    indexLinks.length > 0 ? indexLinks.join('\n') : '_No meeting notes found._',
    ''
  ].join('\n');
  writePage(path.join(meetDir, '_Index.md'), indexContent);
}

function generateKnowledgeBase(vaultDir, ctx) {
  const kbOutDir = path.join(vaultDir, '800-Knowledge-Base');
  const kbDir = ctx.kbDir;
  const indexLinks = [];

  // Skip directories already handled by other sections
  const skipDirs = new Set(['intelligence', 'strategy', 'meetings']);

  if (!fs.existsSync(kbDir)) {
    writePage(path.join(kbOutDir, '_Index.md'), [
      frontmatter({ tags: ['index', 'knowledge-base'], type: 'index' }),
      heading(1, 'Knowledge Base'),
      '',
      '_No kb-data directory found._',
      ''
    ].join('\n'));
    return;
  }

  const topEntries = fs.readdirSync(kbDir, { withFileTypes: true });

  for (const entry of topEntries) {
    if (entry.name.startsWith('_') || entry.name === 'skill.md') continue;

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;

      const subDir = path.join(kbDir, entry.name);
      const subOutDir = path.join(kbOutDir, entry.name);
      const subLinks = [];

      // Recursive walker for nested directories
      var _walkKB = function(srcDir, outDir) {
        if (!fs.existsSync(srcDir)) return;
        var entries = fs.readdirSync(srcDir).filter(function(f) { return !f.startsWith('_'); });
        entries.forEach(function(file) {
          var filePath = path.join(srcDir, file);
          var stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            _walkKB(filePath, path.join(outDir, file));
            return;
          }
          var baseName = path.basename(file, path.extname(file));
          if (file.endsWith('.md')) {
            var raw = fs.readFileSync(filePath, 'utf-8');
            var hasExistingFrontmatter = raw.trimStart().startsWith('---');
            var content = hasExistingFrontmatter
              ? raw
              : frontmatter({ tags: ['knowledge-base', entry.name], source: 'kb-data' }) + '\n' + raw;
            writePage(path.join(outDir, file), content);
            subLinks.push('- ' + wikilink(baseName));
            _syncState.pagesGenerated++;
          } else if (file.endsWith('.json')) {
            var data = safeReadJson(filePath);
            if (!data) return;
            writePage(path.join(outDir, baseName + '.md'), [
              frontmatter({ tags: ['knowledge-base', entry.name], source: 'kb-data', format: 'json' }),
              heading(1, baseName),
              '',
              jsonToReadableMarkdown(data),
              ''
            ].join('\n'));
            subLinks.push('- ' + wikilink(baseName));
            _syncState.pagesGenerated++;
          }
        });
      };
      _walkKB(subDir, subOutDir);

      if (subLinks.length > 0) {
        indexLinks.push(`### ${entry.name}`);
        indexLinks.push(...subLinks);
        indexLinks.push('');
      }
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
      const filePath = path.join(kbDir, entry.name);
      const baseName = path.basename(entry.name, path.extname(entry.name));

      if (entry.name.endsWith('.md') && entry.name !== 'skill.md') {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const hasExistingFrontmatter = raw.trimStart().startsWith('---');
        const content = hasExistingFrontmatter
          ? raw
          : frontmatter({ tags: ['knowledge-base'], source: 'kb-data' }) + '\n' + raw;
        writePage(path.join(kbOutDir, entry.name), content);
        indexLinks.push(`- ${wikilink(baseName)}`);
      } else if (entry.name.endsWith('.json')) {
        const data = safeReadJson(filePath);
        if (data) {
          const readableMd = jsonToReadableMarkdown(data, baseName);
          const content = [
            frontmatter({ tags: ['knowledge-base', 'data'], source: 'kb-data' }),
            readableMd,
            ''
          ].join('\n');
          writePage(path.join(kbOutDir, baseName + '.md'), content);
          indexLinks.push(`- ${wikilink(baseName)}`);
        }
      }
    }
  }

  const indexContent = [
    frontmatter({ tags: ['index', 'knowledge-base'], type: 'index' }),
    heading(1, 'Knowledge Base'),
    '',
    `Sourced from ${topEntries.filter(e => e.isDirectory() && !skipDirs.has(e.name) && !e.name.startsWith('_')).length} kb-data domains`,
    '',
    ...indexLinks,
    ''
  ].join('\n');
  writePage(path.join(kbOutDir, '_Index.md'), indexContent);
}

/** Convert a JSON object to readable markdown */
function jsonToReadableMarkdown(data, title) {
  const sections = [heading(1, title.replace(/-/g, ' '))];
  sections.push('');

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'object' && item !== null) {
        const label = item.name || item.title || item.id || JSON.stringify(item).slice(0, 60);
        sections.push(heading(3, String(label)));
        for (const [k, v] of Object.entries(item)) {
          if (k === 'name' || k === 'title' || k === 'id') continue;
          if (typeof v === 'object') {
            sections.push(`**${k}:** \`${JSON.stringify(v)}\``);
          } else {
            sections.push(`**${k}:** ${v}`);
          }
        }
        sections.push('');
      } else {
        sections.push(`- ${item}`);
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        sections.push(heading(2, key));
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              const label = item.name || item.title || item.id || '';
              sections.push(heading(3, String(label || key)));
              for (const [k, v] of Object.entries(item)) {
                if (k === 'name' || k === 'title' || k === 'id') continue;
                if (typeof v === 'object') {
                  sections.push(`**${k}:** \`${JSON.stringify(v)}\``);
                } else {
                  sections.push(`**${k}:** ${v}`);
                }
              }
              sections.push('');
            } else {
              sections.push(`- ${item}`);
            }
          }
        } else {
          for (const [k, v] of Object.entries(value)) {
            if (typeof v === 'object') {
              sections.push(`**${k}:** \`${JSON.stringify(v)}\``);
            } else {
              sections.push(`**${k}:** ${v}`);
            }
          }
        }
        sections.push('');
      } else {
        sections.push(`**${key}:** ${value}`);
      }
    }
  } else {
    sections.push(String(data));
  }

  return sections.join('\n');
}

function generateLearning(vaultDir) {
  const learnDir = path.join(vaultDir, '900-Learning');
  const indexLinks = [];

  try {
    const db = getDb();

    // Patterns
    const patterns = db.prepare('SELECT * FROM learning_patterns ORDER BY confidence DESC').all();
    const patternSections = [
      frontmatter({ tags: ['learning', 'patterns'] }),
      heading(1, 'Learned Patterns'),
      '',
      `${patterns.length} patterns derived from usage`,
      ''
    ];
    for (const p of patterns) {
      patternSections.push(`- **${p.pattern}** (confidence: ${(p.confidence || 0).toFixed(2)}, source: ${p.source || 'unknown'}) — ${p.created_at || ''}`);
    }
    patternSections.push('');
    writePage(path.join(learnDir, 'Patterns.md'), patternSections.join('\n'));
    indexLinks.push(`- ${wikilink('Patterns')} — ${patterns.length} learned patterns`);

    // Feedback log (last 100)
    const feedback = db.prepare('SELECT * FROM learning_feedback ORDER BY created_at DESC LIMIT 100').all();
    const fbSections = [
      frontmatter({ tags: ['learning', 'feedback'] }),
      heading(1, 'Feedback Log'),
      '',
      `Last ${feedback.length} feedback entries`,
      '',
      '| Date | Type | Target | Value |',
      '|------|------|--------|-------|'
    ];
    for (const f of feedback) {
      fbSections.push(`| ${f.created_at || ''} | ${f.type || ''} | ${f.target || ''} | ${f.value || ''} |`);
    }
    fbSections.push('');
    writePage(path.join(learnDir, 'Feedback-Log.md'), fbSections.join('\n'));
    indexLinks.push(`- ${wikilink('Feedback-Log')} — recent feedback entries`);

    // Preferences
    const prefs = db.prepare('SELECT * FROM learning_preferences ORDER BY key').all();
    const prefSections = [
      frontmatter({ tags: ['learning', 'preferences'] }),
      heading(1, 'Preferences'),
      '',
      `${prefs.length} stored preferences`,
      ''
    ];
    for (const p of prefs) {
      prefSections.push(`- **${p.key}:** ${p.value} _(updated: ${p.updated_at || ''}_ )`);
    }
    prefSections.push('');
    writePage(path.join(learnDir, 'Preferences.md'), prefSections.join('\n'));
    indexLinks.push(`- ${wikilink('Preferences')} — user preferences`);

  } catch {
    // DB not available — write placeholder
    writePage(path.join(learnDir, 'Patterns.md'), [
      frontmatter({ tags: ['learning'] }),
      heading(1, 'Learned Patterns'),
      '',
      '_Database not available — no patterns to display._',
      ''
    ].join('\n'));
    indexLinks.push(`- ${wikilink('Patterns')} — not yet available`);
  }

  const indexContent = [
    frontmatter({ tags: ['index', 'learning'], type: 'index' }),
    heading(1, 'Self-Learning Engine'),
    '',
    'Feedback, patterns, and preferences derived from Beanz OS usage.',
    '',
    ...indexLinks,
    ''
  ].join('\n');
  writePage(path.join(learnDir, '_Index.md'), indexContent);
}

function generateTemplates(vaultDir) {
  const tplDir = path.join(vaultDir, 'Templates');

  writePage(path.join(tplDir, 'Person.md'), [
    frontmatter({ tags: ['person', 'template'], role: '', location: '', email: '', scope: '', reports_to: '', tier: '' }),
    heading(1, '{{Name}}'),
    '',
    '**Role:** {{role}}',
    '**Location:** {{location}}',
    '**Scope:** {{scope}}',
    '**Reports to:** [[{{reports_to}}]]',
    '',
    heading(2, 'Linked Projects'),
    '- ',
    '',
    heading(2, 'Notes'),
    '',
    ''
  ].join('\n'));

  writePage(path.join(tplDir, 'Project.md'), [
    frontmatter({ tags: ['project', 'template'], status: '', lead: '' }),
    heading(1, '{{Project Name}}'),
    '',
    '**Status:** {{status}}',
    '**Lead:** [[{{lead}}]]',
    '',
    heading(2, 'Latest Update'),
    '',
    '',
    heading(2, 'Workstreams'),
    '- ',
    '',
    heading(2, 'Blockers'),
    '- ',
    '',
    heading(2, 'Key Data'),
    '',
    ''
  ].join('\n'));

  writePage(path.join(tplDir, 'Research-Report.md'), [
    frontmatter({ tags: ['research', 'template'], date: '{{date}}', period: '' }),
    heading(1, '{{Title}}'),
    '*{{Subtitle}}*',
    '',
    heading(2, 'Executive Summary'),
    '',
    '',
    heading(2, 'Trends'),
    '',
    heading(3, '{{Trend Name}}'),
    '**Confidence:** {{high|medium|emerging}}',
    '',
    callout('quote', 'Source', '{{quote}}'),
    '',
    callout('tip', 'Implications', '{{implications}}'),
    '',
    heading(2, 'Tools & Products'),
    '| Tool | Category | Mentions | Sentiment |',
    '|------|----------|----------|-----------|',
    '| | | | |',
    '',
    heading(2, 'Reading List'),
    '- [{{Title}}]({{url}}) — {{why}}',
    '',
    heading(2, 'Bottom Line'),
    '',
    ''
  ].join('\n'));

  writePage(path.join(tplDir, 'Daily-News.md'), [
    frontmatter({ tags: ['news', 'template'], date: '{{date}}' }),
    heading(1, 'News — {{date}}'),
    '',
    heading(3, '{{Article Title}}'),
    '**Source:** {{source}}',
    '{{summary}}',
    '',
    ''
  ].join('\n'));

  writePage(path.join(tplDir, 'Meeting-Note.md'), [
    frontmatter({ tags: ['meeting', 'template'], date: '{{date}}', attendees: [] }),
    heading(1, '{{Meeting Title}}'),
    '',
    '**Date:** {{date}}',
    '**Attendees:** {{attendees}}',
    '',
    heading(2, 'Agenda'),
    '- ',
    '',
    heading(2, 'Discussion'),
    '',
    '',
    heading(2, 'Action Items'),
    '- [ ] ',
    '',
    heading(2, 'Decisions'),
    '- ',
    '',
    ''
  ].join('\n'));

  // Templates index
  writePage(path.join(tplDir, '_Index.md'), [
    frontmatter({ tags: ['index', 'templates'], type: 'index' }),
    heading(1, 'Templates'),
    '',
    `- ${wikilink('Person')} — New team member page`,
    `- ${wikilink('Project')} — New project page`,
    `- ${wikilink('Research-Report')} — Research digest template`,
    `- ${wikilink('Daily-News')} — Daily news digest template`,
    `- ${wikilink('Meeting-Note')} — Meeting notes template`,
    ''
  ].join('\n'));
}

// ─── Main Sync Function ─────────────────────────────────────

// ─── Activity Log ────────────────────────────────────────────
function appendLog(vaultDir, action, details) {
  var logPath = path.join(vaultDir, 'log.md');
  var timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  var date = new Date().toISOString().slice(0, 10);
  var entry = '\n## [' + date + '] ' + action + '\n' + details + '\n';

  // Create log file if it doesn't exist
  if (!fs.existsSync(logPath)) {
    var header = frontmatter({
      title: 'Activity Log',
      description: 'Append-only chronological record of all vault changes.',
      type: 'reference',
      status: 'complete',
      owner: 'Platform',
      market: ['global'],
      tags: ['navigation', 'index'],
      aliases: ['Log', 'Activity', 'Changelog']
    }) + '\n# Activity Log\n\nAppend-only record of ingestions, syncs, and changes.\n';
    fs.writeFileSync(logPath, header, 'utf-8');
  }

  fs.appendFileSync(logPath, entry, 'utf-8');
}

// ─── Rich Index ──────────────────────────────────────────────
function generateRichIndex(vaultDir, ctx) {
  var indexPath = path.join(vaultDir, 'index.md');
  var sections = [];

  // Scan vault for all .md files
  var allPages = [];
  function _scanDir(dir, prefix) {
    try {
      fs.readdirSync(dir).forEach(function(f) {
        var fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) {
          if (f.startsWith('.')) return;
          _scanDir(fp, prefix + f + '/');
        } else if (f.endsWith('.md') && f !== 'index.md' && f !== 'log.md') {
          var content = fs.readFileSync(fp, 'utf-8');
          // Parse frontmatter
          var fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          var meta = {};
          if (fmMatch) {
            fmMatch[1].split('\n').forEach(function(line) {
              var m = line.match(/^(\w+):\s*"?([^"]*)"?$/);
              if (m) meta[m[1]] = m[2];
            });
          }
          // First heading
          var headingMatch = content.match(/^#\s+(.+)/m);
          var title = meta.title || (headingMatch ? headingMatch[1] : f.replace('.md', ''));
          var desc = meta.description || '';
          var relPath = prefix + f;
          var wl = '[[' + f.replace('.md', '') + '|' + title + ']]';

          allPages.push({
            title: title,
            description: desc,
            type: meta.type || 'unknown',
            status: meta.status || '',
            tags: meta.tags || '',
            path: relPath,
            wikilink: wl,
            section: prefix.split('/')[0] || 'root'
          });
        }
      });
    } catch (_) {}
  }
  _scanDir(vaultDir, '');

  // Group by top-level section
  var bySection = {};
  allPages.forEach(function(p) {
    if (!bySection[p.section]) bySection[p.section] = [];
    bySection[p.section].push(p);
  });

  // Build index content
  var lines = [
    frontmatter({
      title: 'Knowledge Base Index',
      description: 'Content-oriented catalog of all pages with summaries and metadata.',
      type: 'reference',
      status: 'complete',
      owner: 'Platform',
      market: ['global'],
      tags: ['navigation', 'index'],
      aliases: ['Index', 'Catalog', 'Table of Contents']
    }),
    '# Knowledge Base Index',
    '',
    '**Total pages:** ' + allPages.length + '  ',
    '**Last indexed:** ' + nowIso(),
    ''
  ];

  // Section order
  var sectionOrder = ['000-Dashboard', '000-Standards', '100-People', '200-Projects', '300-Comms',
    '400-Coffee-Intelligence', '500-AI-Tech-Intelligence', '600-Strategy', '700-Meetings',
    '800-Knowledge-Base', '900-Learning', 'Templates'];

  sectionOrder.forEach(function(sec) {
    var pages = bySection[sec];
    if (!pages || pages.length === 0) return;
    lines.push('## ' + sec.replace(/^\d+-/, '') + ' (' + pages.length + ')');
    lines.push('');
    // Sort by title
    pages.sort(function(a, b) { return a.title.localeCompare(b.title); });
    pages.forEach(function(p) {
      var meta = '';
      if (p.type && p.type !== 'unknown') meta += ' `' + p.type + '`';
      if (p.status) meta += ' *' + p.status + '*';
      lines.push('- ' + p.wikilink + meta + (p.description ? ' — ' + p.description.slice(0, 100) : ''));
    });
    lines.push('');
  });

  // Any sections not in the order
  Object.keys(bySection).forEach(function(sec) {
    if (sectionOrder.includes(sec)) return;
    var pages = bySection[sec];
    if (!pages || pages.length === 0) return;
    lines.push('## ' + sec + ' (' + pages.length + ')');
    lines.push('');
    pages.forEach(function(p) {
      lines.push('- ' + p.wikilink + (p.description ? ' — ' + p.description.slice(0, 100) : ''));
    });
    lines.push('');
  });

  writePage(indexPath, lines.join('\n'));
  return allPages.length;
}

async function syncVault(ctx) {
  const vaultDir = getVaultPath();

  // Reset state
  _syncState.pagesGenerated = 0;
  _syncState.vaultPath = vaultDir;
  _syncState.errors = [];

  ensureDir(vaultDir);

  // Generate all sections
  try { generateDashboard(vaultDir); }
  catch (err) { _syncState.errors.push(`Dashboard: ${err.message}`); }

  try { generatePeople(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`People: ${err.message}`); }

  try { generateProjects(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`Projects: ${err.message}`); }

  try { generateCommsPlaceholder(vaultDir); }
  catch (err) { _syncState.errors.push(`Comms: ${err.message}`); }

  try { generateCoffeeIntelligence(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`Coffee Intel: ${err.message}`); }

  try { generateAiTechIntelligence(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`AI/Tech Intel: ${err.message}`); }

  try { generateStrategy(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`Strategy: ${err.message}`); }

  try { generateMeetings(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`Meetings: ${err.message}`); }

  try { generateKnowledgeBase(vaultDir, ctx); }
  catch (err) { _syncState.errors.push(`Knowledge Base: ${err.message}`); }

  try { generateLearning(vaultDir); }
  catch (err) { _syncState.errors.push(`Learning: ${err.message}`); }

  try { generateTemplates(vaultDir); }
  catch (err) { _syncState.errors.push(`Templates: ${err.message}`); }

  // Brain update policy page (Phase 5) — regenerated every sync with live stats
  try {
    const { writePolicyPage } = require('./brain-policy');
    writePolicyPage(ctx);
    _syncState.pagesGenerated++;
  } catch (err) { _syncState.errors.push('Brain Policy: ' + err.message); }

  // Generate rich index (must be last — scans all generated files)
  try {
    var indexedCount = generateRichIndex(vaultDir, ctx);
    _syncState.pagesGenerated++; // index.md itself
  } catch (err) { _syncState.errors.push('Rich Index: ' + err.message); }

  // Append to activity log
  try {
    var logDetails = '- **Pages generated:** ' + _syncState.pagesGenerated + '\n' +
      '- **Vault path:** `' + vaultDir + '`\n' +
      (indexedCount ? '- **Pages indexed:** ' + indexedCount + '\n' : '') +
      (_syncState.errors.length > 0 ? '- **Errors:** ' + _syncState.errors.join(', ') + '\n' : '- **Errors:** None\n');
    appendLog(vaultDir, 'sync | Full vault sync', logDetails);
  } catch (err) { /* non-critical */ }

  _syncState.lastSync = nowIso();

  return {
    success: true,
    pagesGenerated: _syncState.pagesGenerated,
    vaultPath: vaultDir,
    errors: _syncState.errors,
    syncedAt: _syncState.lastSync
  };
}

module.exports = { syncVault, getSyncStatus, appendLog, getVaultPath };
