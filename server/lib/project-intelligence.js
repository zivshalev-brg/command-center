/**
 * project-intelligence.js — Aggregation engine for project intelligence.
 * Gathers data from all sources (comms, calendar, strategy, KB, news, metrics,
 * Jira/Confluence, learning) for a given project and optionally synthesizes
 * an AI health summary via Anthropic Claude.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { buildStrategyPayload } = require('./strategy-engine');
const { searchIssues, searchIssuesRich, getFullProjectDashboard } = require('./jira-api');
const MODELS = require('./ai-models');

// ─── Project-to-Data Mapping ─────────────────────────────────
// Maps each project ID (from DATA.projects in data.js) to its
// intelligence gathering parameters. Aliases are used for keyword
// matching in comms threads. classifierTags match KNOWN_PROJECTS
// in ai-classifier.js.

const PROJECT_DATA_MAP = {
  feral: {
    title: 'Project Feral',
    classifierTags: ['Project Feral', 'Cancellation Flow', 'Collections', 'Onboarding', 'Email Lifecycle'],
    aliases: ['feral', 'cancellation flow', 'collections experiment', 'onboarding email', 'retention experiment'],
    jiraSearch: ['feral', 'cancellation flow', 'collections', 'onboarding', 'retention'],
    kbPath: 'projects/project-feral',
    strategyCorrelationIds: ['COR-1', 'COR-8'],
    metricKeys: ['cancelled_subs', 'new_subs', 'net_subscriber_growth', 'churn_rate'],
    newsKeywords: ['retention', 'churn', 'cancellation', 'subscription retention']
  },
  mice: {
    title: 'MICE 2026',
    classifierTags: ['MICE'],
    aliases: ['mice', 'mice 2026', 'melbourne international coffee expo', 'coffee expo'],
    jiraSearch: ['MICE', 'coffee expo'],
    kbPath: null,
    strategyCorrelationIds: [],
    metricKeys: [],
    newsKeywords: ['MICE', 'coffee expo', 'trade show']
  },
  woc: {
    title: 'WOC San Diego',
    classifierTags: ['WOC'],
    aliases: ['woc', 'world of coffee', 'san diego', 'woc san diego'],
    jiraSearch: ['WOC', 'world of coffee', 'san diego'],
    kbPath: null,
    strategyCorrelationIds: [],
    metricKeys: [],
    newsKeywords: ['world of coffee', 'specialty coffee association']
  },
  marax3: {
    title: 'MaraX3 Platinum Roasters',
    classifierTags: ['MaraX3', 'Platinum Roasters'],
    aliases: ['marax3', 'mara x3', 'platinum roasters', 'lelit marax'],
    jiraSearch: ['MaraX3', 'platinum roaster', 'LELIT'],
    kbPath: null,
    strategyCorrelationIds: ['COR-6'],
    metricKeys: ['platinum_revenue'],
    newsKeywords: ['MaraX3', 'LELIT', 'platinum roaster']
  },
  'brand-summit': {
    title: 'FY27 Brand Summit',
    classifierTags: ['Brand Summit'],
    aliases: ['brand summit', 'fy27 brand', 'sizzle reel'],
    jiraSearch: ['brand summit'],
    kbPath: null,
    strategyCorrelationIds: [],
    metricKeys: [],
    newsKeywords: []
  },
  'machine-integration': {
    title: 'Machine Integration Strategy',
    classifierTags: ['Machine Integration', 'Beanz on Breville'],
    aliases: ['machine integration', 'beanz on breville', 'machine launch narrative'],
    jiraSearch: ['machine integration', 'beanz on breville'],
    kbPath: null,
    strategyCorrelationIds: [],
    metricKeys: [],
    newsKeywords: []
  },
  'power-bi-pl': {
    title: 'Power BI P&L Report',
    classifierTags: [],
    aliases: ['power bi', 'p&l report', 'pl report', 'finance report'],
    jiraSearch: ['power bi', 'P&L'],
    kbPath: null,
    strategyCorrelationIds: [],
    metricKeys: [],
    newsKeywords: []
  }
};

// ─── Comms Activity Aggregation ──────────────────────────────

function getProjectCommsActivity(ctx, projectId) {
  const map = PROJECT_DATA_MAP[projectId];
  if (!map) return [];

  // 1. Get threads tagged by AI classifier
  var taggedThreadIds = new Set();
  for (var tag of map.classifierTags) {
    var rows = db.getClassificationsByProject(tag);
    rows.forEach(function(r) { taggedThreadIds.add(r.thread_id); });
  }

  // 2. Load live comms threads
  var slackThreads = {};
  if (ctx.commsLivePath && fs.existsSync(ctx.commsLivePath)) {
    try {
      var slackData = JSON.parse(fs.readFileSync(ctx.commsLivePath, 'utf8'));
      slackThreads = slackData.threads || {};
    } catch { /* ignore */ }
  }

  var emailThreads = {};
  var emailPath = path.join(ctx.intelDir || '', 'email-live.json');
  if (fs.existsSync(emailPath)) {
    try {
      var emailData = JSON.parse(fs.readFileSync(emailPath, 'utf8'));
      emailThreads = emailData.threads || {};
    } catch { /* ignore */ }
  }

  var allThreads = { ...slackThreads, ...emailThreads };

  // 3. Match threads: AI-tagged OR keyword match in subject/preview
  var aliasPattern = new RegExp(map.aliases.join('|'), 'i');
  var results = [];

  for (var tid of Object.keys(allThreads)) {
    var th = allThreads[tid];
    var matched = taggedThreadIds.has(tid);
    if (!matched) {
      var text = (th.subject || '') + ' ' + (th.preview || '');
      if (aliasPattern.test(text)) matched = true;
    }
    if (!matched) continue;

    var classification = db.getClassification(tid);
    results.push({
      threadId: tid,
      subject: th.subject || '',
      source: (th.sources || [])[0] || 'unknown',
      sourceType: th.sourceType || '',
      priority: classification ? classification.priority : (th.aiPriority || 'medium'),
      category: classification ? classification.category : '',
      sentiment: classification ? classification.sentiment : '',
      actionRequired: classification ? classification.action_required === 1 : false,
      actionType: classification ? classification.action_type : '',
      summary: classification ? classification.summary : '',
      lastActivity: th.lastActivity || '',
      lastSender: th.lastSender || '',
      people: th.people || [],
      messageCount: th.threadCount || (th.messages || []).length
    });
  }

  results.sort(function(a, b) { return new Date(b.lastActivity) - new Date(a.lastActivity); });
  return results.slice(0, 25);
}

// ─── Calendar Events ─────────────────────────────────────────

function getProjectCalendarEvents(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map) return { upcoming: [], recent: [] };

  var calPath = path.join(ctx.intelDir || '', 'calendar-live.json');
  if (!fs.existsSync(calPath)) return { upcoming: [], recent: [] };

  var events;
  try {
    events = JSON.parse(fs.readFileSync(calPath, 'utf8'));
  } catch { return { upcoming: [], recent: [] }; }

  var allEvents = Array.isArray(events) ? events : (events.events || events.value || []);
  var aliasPattern = new RegExp(map.aliases.join('|'), 'i');
  var now = Date.now();
  var upcoming = [];
  var recent = [];

  for (var i = 0; i < allEvents.length; i++) {
    var ev = allEvents[i];
    var subj = ev.subject || ev.title || '';
    if (!aliasPattern.test(subj) && !aliasPattern.test(ev.bodyPreview || '')) continue;
    var start = new Date(ev.start ? (ev.start.dateTime || ev.start) : ev.startTime || '');
    var item = {
      subject: subj,
      start: start.toISOString(),
      location: ev.location ? (ev.location.displayName || '') : '',
      attendees: (ev.attendees || []).map(function(a) { return a.emailAddress ? a.emailAddress.name : a.name || ''; }).filter(Boolean).slice(0, 5),
      isOnline: !!(ev.isOnlineMeeting || ev.onlineMeeting)
    };
    if (start.getTime() >= now) upcoming.push(item);
    else if (start.getTime() > now - 14 * 86400000) recent.push(item);
  }

  upcoming.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
  recent.sort(function(a, b) { return new Date(b.start) - new Date(a.start); });
  return { upcoming: upcoming.slice(0, 10), recent: recent.slice(0, 10) };
}

// ─── Strategy Alignment ──────────────────────────────────────

function getProjectStrategyAlignment(projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map) return [];

  try {
    var payload = buildStrategyPayload();
    var correlations = payload.correlations || [];
    var aliasPattern = new RegExp(map.aliases.join('|'), 'i');

    return correlations.filter(function(c) {
      if (map.strategyCorrelationIds.indexOf(c.id) >= 0) return true;
      var text = (c.title || '') + ' ' + (c.finding || '') + ' ' + (c.recommendation || '');
      return aliasPattern.test(text);
    }).map(function(c) {
      return {
        id: c.id, title: c.title, severity: c.severity,
        finding: (c.finding || '').slice(0, 200),
        recommendation: (c.recommendation || '').slice(0, 200),
        dataPoints: (c.dataPoints || []).slice(0, 4)
      };
    });
  } catch { return []; }
}

// ─── KB Documents ────────────────────────────────────────────

function getProjectKBDocs(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map || !map.kbPath) return [];

  var kbDir = path.join(ctx.kbDir || path.join(__dirname, '..', '..', 'kb-data'), map.kbPath);
  if (!fs.existsSync(kbDir)) return [];

  var docs = [];
  function walkDir(dir, depth) {
    if (depth > 2) return;
    try {
      var entries = fs.readdirSync(dir);
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fp = path.join(dir, entry);
        var stat = fs.statSync(fp);
        if (stat.isDirectory()) { walkDir(fp, depth + 1); continue; }
        if (!entry.endsWith('.md') && !entry.endsWith('.json')) continue;
        if (entry.startsWith('_')) continue;

        var content = '';
        try { content = fs.readFileSync(fp, 'utf8').slice(0, 500); } catch { continue; }

        var dateMatch = entry.match(/^(\d{4}-\d{2}-\d{2})/);
        var type = fp.includes('meeting') ? 'meeting' : (fp.includes('status') ? 'status' : 'document');

        docs.push({
          title: entry.replace(/\.md$|\.json$/, '').replace(/-/g, ' '),
          type: type,
          date: dateMatch ? dateMatch[1] : '',
          preview: content.replace(/^---[\s\S]*?---/, '').replace(/^#+\s*/gm, '').trim().slice(0, 200),
          path: path.relative(ctx.kbDir || '', fp).replace(/\\/g, '/')
        });
      }
    } catch { /* ignore */ }
  }

  walkDir(kbDir, 0);
  docs.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  return docs.slice(0, 15);
}

// ─── News & Research ─────────────────────────────────────────

function getProjectNews(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map || !map.newsKeywords.length) return [];

  var store;
  try {
    var storePath = ctx.newsStore || path.join(__dirname, '..', '..', 'news-store.json');
    if (!fs.existsSync(storePath)) return [];
    store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch { return []; }

  var articles = store.articles || [];
  var pattern = new RegExp(map.newsKeywords.join('|'), 'i');
  var aiCache = {};
  try { aiCache = db.getAllNewsAiCache(); } catch { /* no cache */ }

  var matches = [];
  for (var i = 0; i < articles.length && matches.length < 10; i++) {
    var a = articles[i];
    var ai = aiCache[a.id];
    var text = (a.title || '') + ' ' + (a.summary || '') + ' ' + (ai && ai.exec_summary ? ai.exec_summary : '');
    if (!pattern.test(text)) continue;
    matches.push({
      title: a.title || '', url: a.url || '', source: a.sourceName || a.source || '',
      date: (a.publishedAt || '').slice(0, 10),
      summary: ai && ai.exec_summary ? ai.exec_summary : (a.summary || '').slice(0, 150),
      category: a.category || ''
    });
  }
  return matches.slice(0, 5);
}

// ─── Metrics ─────────────────────────────────────────────────

function getProjectMetrics(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map || !map.metricKeys.length) return [];

  var pbiPath = path.join(ctx.intelDir || '', 'pbi-live.json');
  if (!fs.existsSync(pbiPath)) return [];

  try {
    var pbi = JSON.parse(fs.readFileSync(pbiPath, 'utf8'));
    var metrics = pbi.metrics || pbi.kpis || pbi;
    if (!metrics || typeof metrics !== 'object') return [];

    var results = [];
    for (var key of map.metricKeys) {
      if (metrics[key] !== undefined) {
        var m = typeof metrics[key] === 'object' ? metrics[key] : { value: metrics[key] };
        results.push({
          key: key,
          label: (key || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }),
          value: m.value !== undefined ? m.value : m,
          change: m.change || m.yoy || null,
          trend: m.trend || null
        });
      }
    }
    return results;
  } catch { return []; }
}

// ─── KB Project Updates (static) ─────────────────────────────

function getProjectUpdates(ctx, projectId) {
  var updatesPath = path.join(ctx.intelDir || '', 'project-updates.json');
  if (!fs.existsSync(updatesPath)) return null;

  try {
    var data = JSON.parse(fs.readFileSync(updatesPath, 'utf8'));
    var projects = data.projects || {};
    // Try direct ID match, then underscore variant
    var key = projectId.replace(/-/g, '_');
    var match = projects[projectId] || projects[key] || projects['project_' + key] || null;
    return match;
  } catch { return null; }
}

// ─── Learning Data ───────────────────────────────────────────

function getProjectLearningData(projectId) {
  try {
    var weight = db.getWeightForTarget('project:' + projectId);
    var interactions = db.getInteractionStats ? db.getInteractionStats() : {};
    var projectViews = 0;
    if (interactions && interactions.byTarget) {
      projectViews = interactions.byTarget[projectId] || 0;
    }
    return { weight: weight || 1.0, viewCount: projectViews };
  } catch { return { weight: 1.0, viewCount: 0 }; }
}

// ─── Jira Issues ─────────────────────────────────────────────


async function getProjectJiraIssues(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map) return { recent: [], blockers: [], done: [], total: 0, error: null };
  if (!ctx.atlassian || !ctx.atlassian.token) return { recent: [], blockers: [], done: [], total: 0, error: 'Jira not configured' };

  try {
    // Search for issues matching this project's keywords using rich format
    var keywords = (map.jiraSearch || []);
    if (!keywords.length) return { recent: [], blockers: [], done: [], total: 0, error: null };

    var textClauses = keywords.map(function(kw) { return 'text ~ "' + kw.replace(/"/g, '\\"') + '"'; });
    var jql = '(' + textClauses.join(' OR ') + ') ORDER BY updated DESC';
    var issues = await searchIssuesRich(ctx, jql, 50, true);

    var blockers = issues.filter(function(i) {
      return i.statusCategory !== 'done' && (i.priority === 'Highest' || i.priority === 'High' || i.status === 'Blocked' || i.flagged);
    });
    var active = issues.filter(function(i) { return i.statusCategory !== 'done'; });
    var done = issues.filter(function(i) { return i.statusCategory === 'done'; });

    return {
      recent: active.slice(0, 20),
      blockers: blockers,
      done: done.slice(0, 10),
      total: issues.length,
      error: null
    };
  } catch (e) {
    return { recent: [], blockers: [], done: [], total: 0, error: e.message };
  }
}

/** Get full Jira dashboard data (all projects, sprints, epics, blockers) */
async function getAllJiraActivity(ctx) {
  if (!ctx.atlassian || !ctx.atlassian.token) return { summary: {}, byProject: [], epics: [], sprints: [], blockers: [], overdue: [], recentlyResolved: [], allOpen: [], error: 'Jira not configured' };

  try {
    return await getFullProjectDashboard(ctx);
  } catch (e) {
    return { summary: {}, byProject: [], epics: [], sprints: [], blockers: [], overdue: [], recentlyResolved: [], allOpen: [], error: e.message };
  }
}

// ─── Master Aggregation ──────────────────────────────────────

async function aggregateProjectIntelligence(ctx, projectId) {
  var map = PROJECT_DATA_MAP[projectId];
  if (!map) return null;

  // Sync data sources
  var commsActivity = getProjectCommsActivity(ctx, projectId);
  var calendar = getProjectCalendarEvents(ctx, projectId);
  var strategy = getProjectStrategyAlignment(projectId);
  var kbDocs = getProjectKBDocs(ctx, projectId);
  var news = getProjectNews(ctx, projectId);
  var metrics = getProjectMetrics(ctx, projectId);
  var updates = getProjectUpdates(ctx, projectId);
  var learning = getProjectLearningData(projectId);

  // Async: Jira issues (live API call)
  var jira = await getProjectJiraIssues(ctx, projectId);

  // Compute summary stats
  var actionRequired = commsActivity.filter(function(t) { return t.actionRequired; }).length;
  var negativeThreads = commsActivity.filter(function(t) { return t.sentiment === 'negative' || t.sentiment === 'urgent'; }).length;
  var recentComms = commsActivity.filter(function(t) {
    return t.lastActivity && new Date(t.lastActivity).getTime() > Date.now() - 7 * 86400000;
  }).length;

  var result = {
    projectId: projectId,
    title: map.title,
    commsActivity: commsActivity,
    commsStats: {
      total: commsActivity.length,
      thisWeek: recentComms,
      actionRequired: actionRequired,
      negative: negativeThreads
    },
    calendar: calendar,
    strategy: strategy,
    kbDocs: kbDocs,
    news: news,
    metrics: metrics,
    jira: jira,
    updates: updates,
    learning: learning,
    aggregatedAt: new Date().toISOString()
  };

  // Compute data hash for AI synthesis caching
  var hashInput = JSON.stringify({
    commsCount: commsActivity.length,
    actionRequired: actionRequired,
    calendarCount: calendar.upcoming.length + calendar.recent.length,
    strategyCount: strategy.length,
    jiraCount: jira.total,
    metricsSnapshot: metrics.map(function(m) { return m.key + ':' + m.value; }).join(','),
    updatesLatest: updates ? updates.latest : ''
  });
  result.dataHash = crypto.createHash('md5').update(hashInput).digest('hex');

  return result;
}

// ─── AI Synthesis ────────────────────────────────────────────

function synthesizeProjectHealth(apiKey, projectId, aggregated) {
  if (!apiKey || !aggregated) return Promise.resolve(null);

  // Check cache first
  var cached = db.getProjectIntelligenceIfFresh(projectId, aggregated.dataHash);
  if (cached) return Promise.resolve(cached);

  var https = require('https');
  var context = '';
  context += 'Project: ' + aggregated.title + '\n';
  if (aggregated.updates) {
    context += 'Status: ' + (aggregated.updates.status || 'unknown') + '\n';
    context += 'Lead: ' + (aggregated.updates.lead || 'unknown') + '\n';
    context += 'Latest: ' + (aggregated.updates.latest || '').slice(0, 500) + '\n';
    if (aggregated.updates.blockers) context += 'Known blockers: ' + aggregated.updates.blockers.join('; ') + '\n';
  }
  context += '\nComms activity: ' + aggregated.commsStats.total + ' threads (' + aggregated.commsStats.thisWeek + ' this week, ' + aggregated.commsStats.actionRequired + ' need action, ' + aggregated.commsStats.negative + ' negative)\n';
  if (aggregated.commsActivity.length > 0) {
    context += 'Recent threads:\n';
    aggregated.commsActivity.slice(0, 10).forEach(function(t) {
      context += '- [' + t.source + '] ' + t.subject + ' (priority: ' + t.priority + ', sentiment: ' + t.sentiment + ')' + (t.actionRequired ? ' ACTION REQUIRED' : '') + '\n';
      if (t.summary) context += '  Summary: ' + t.summary.slice(0, 150) + '\n';
    });
  }
  if (aggregated.calendar.upcoming.length) {
    context += '\nUpcoming meetings: ' + aggregated.calendar.upcoming.map(function(e) { return e.subject; }).join(', ') + '\n';
  }
  if (aggregated.strategy.length) {
    context += '\nStrategic correlations:\n';
    aggregated.strategy.forEach(function(c) { context += '- ' + c.title + ' (' + c.severity + '): ' + c.finding + '\n'; });
  }
  if (aggregated.metrics.length) {
    context += '\nKey metrics:\n';
    aggregated.metrics.forEach(function(m) { context += '- ' + m.label + ': ' + m.value + (m.change ? ' (' + m.change + ')' : '') + '\n'; });
  }

  var systemPrompt = 'You are a project health analyst for Beanz (coffee subscription platform, Breville Group). ' +
    'Analyze the project intelligence data and produce a concise health assessment. ' +
    'Return valid JSON: {"healthScore":0-100,"healthSummary":"3 sentences max","riskFlags":["string"],"opportunityFlags":["string"],"nextActions":["string"]}. ' +
    'healthScore: 80-100=on track, 60-79=needs attention, 40-59=at risk, 0-39=critical. ' +
    'Be specific and actionable. Reference actual data from the context.';

  var body = JSON.stringify({
    model: MODELS.SONNET,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Assess this project:\n\n' + context.slice(0, 4000) }]
  });

  return new Promise(function(resolve, reject) {
    var chunks = [];
    var req = https.request({
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, function(res) {
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try {
          var d = JSON.parse(Buffer.concat(chunks).toString());
          if (d.content && d.content[0]) {
            var jsonMatch = d.content[0].text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              var synthesis = JSON.parse(jsonMatch[0]);
              var result = {
                healthScore: synthesis.healthScore || 50,
                healthSummary: synthesis.healthSummary || '',
                riskFlags: synthesis.riskFlags || [],
                opportunityFlags: synthesis.opportunityFlags || [],
                nextActions: synthesis.nextActions || [],
                dataHash: aggregated.dataHash,
                modelUsed: MODELS.SONNET,
                generatedAt: new Date().toISOString()
              };
              db.upsertProjectIntelligence(projectId, result);
              resolve(result);
            } else { resolve(null); }
          } else { resolve(null); }
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', function() { resolve(null); });
    req.setTimeout(60000, function() { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

// ─── Overview (all projects, fast, cached data only) ─────────

function getProjectsOverview(ctx) {
  var overview = {};

  for (var projectId of Object.keys(PROJECT_DATA_MAP)) {
    var map = PROJECT_DATA_MAP[projectId];
    var comms = getProjectCommsActivity(ctx, projectId);
    var calendar = getProjectCalendarEvents(ctx, projectId);

    var actionRequired = comms.filter(function(t) { return t.actionRequired; }).length;
    var thisWeek = comms.filter(function(t) {
      return t.lastActivity && new Date(t.lastActivity).getTime() > Date.now() - 7 * 86400000;
    }).length;
    var negative = comms.filter(function(t) { return t.sentiment === 'negative' || t.sentiment === 'urgent'; }).length;

    // Check cached AI synthesis
    var cached = null;
    try {
      var allCache = db.getDb().prepare('SELECT health_score, generated_at FROM project_intelligence_cache WHERE project_id = ?').get(projectId);
      if (allCache) cached = { healthScore: allCache.health_score, generatedAt: allCache.generated_at };
    } catch { /* no cache */ }

    overview[projectId] = {
      title: map.title,
      commsTotal: comms.length,
      commsThisWeek: thisWeek,
      actionRequired: actionRequired,
      negative: negative,
      meetingsThisWeek: calendar.upcoming.filter(function(e) {
        return new Date(e.start).getTime() < Date.now() + 7 * 86400000;
      }).length,
      latestActivity: comms.length > 0 ? comms[0].lastActivity : null,
      healthScore: cached ? cached.healthScore : null,
      healthGeneratedAt: cached ? cached.generatedAt : null
    };
  }

  return overview;
}

module.exports = {
  PROJECT_DATA_MAP,
  aggregateProjectIntelligence,
  synthesizeProjectHealth,
  getProjectsOverview,
  getProjectCommsActivity,
  getProjectCalendarEvents,
  getProjectStrategyAlignment,
  getProjectKBDocs,
  getProjectNews,
  getProjectMetrics,
  getProjectUpdates,
  getProjectLearningData,
  getProjectJiraIssues,
  getAllJiraActivity
};
