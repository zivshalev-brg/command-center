/**
 * comms-analytics-engine.js — Extracts daily analytics from comms data.
 * Groups threads by topic, person, and project. Generates snapshots + AI summaries.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SENTIMENT_MAP = { positive: 1, neutral: 0.5, negative: 0, urgent: 0.25 };
const BEANZ_PROJECTS = [
  'FTBP', 'Platinum Roasters', 'Project Feral', 'PBB', 'DE Launch', 'NL Launch',
  'Affordability', 'Oracle', 'Cancellation Flow', 'Collections', 'Onboarding',
  'Email Lifecycle', 'MICE', 'WOC', 'Brand Summit', 'Machine Integration',
  'MaraX3', 'Barista Touch Impress', 'Beanz on Breville', 'Marketing'
];
const STOP_WORDS = new Set([
  're', 'fw', 'fwd', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'not', 'no',
  'so', 'if', 'about', 'up', 'out', 'just', 'also', 'than', 'then', 'now',
  'all', 'any', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'same', 'into', 'over', 'after', 'before'
]);

/**
 * Load all threads from Slack + email caches.
 */
function loadAllThreads(ctx) {
  const threads = {};
  const slackPath = ctx.commsLivePath;
  if (slackPath && fs.existsSync(slackPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(slackPath, 'utf8'));
      Object.assign(threads, data.threads || {});
    } catch { /* ignore corrupt cache */ }
  }
  const emailPath = path.join(ctx.dir, 'kb-data', 'intelligence', 'email-live.json');
  if (fs.existsSync(emailPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(emailPath, 'utf8'));
      Object.assign(threads, data.threads || {});
    } catch { /* ignore corrupt cache */ }
  }
  return threads;
}

/**
 * Extract keywords from a subject line for topic fallback.
 */
function extractKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Extract daily metrics from all threads.
 * Returns { topics, people, projects, segments, ... } maps.
 */
function extractDailyMetrics(ctx) {
  const db = require('./db');
  const allThreads = loadAllThreads(ctx);
  const threadIds = Object.keys(allThreads);

  const topics = {};   // key -> { threadCount, messageCount, sentiments, actionRequired, sources }
  const people = {};   // key -> { threadCount, messageCount, sentiments, topTopics }
  const projects = {}; // key -> { threadCount, messageCount, sentiments, people, topTopics }

  // Segmentation counters
  const segments = {
    marketing: { threads: 0, messages: 0 },
    work: { threads: 0, messages: 0 },
    beanzProject: { threads: 0, messages: 0 },
    nonBeanzWork: { threads: 0, messages: 0 },
    slack: { threads: 0, messages: 0 },
    email: { threads: 0, messages: 0 }
  };

  let totalClassified = 0;
  let totalThreads = threadIds.length;

  for (const [threadId, thread] of Object.entries(allThreads)) {
    const msgCount = (thread.messages || []).length;
    const source = threadId.startsWith('slack-') ? 'slack' : 'email';

    // Source counters
    segments[source].threads++;
    segments[source].messages += msgCount;

    // Get AI classification if available
    const classification = db.getClassificationIfFresh(threadId, msgCount);
    if (classification) totalClassified++;

    // Marketing vs Work segmentation
    const isMarketing = classification && classification.is_marketing === 1;
    if (isMarketing) {
      segments.marketing.threads++;
      segments.marketing.messages += msgCount;
    } else {
      segments.work.threads++;
      segments.work.messages += msgCount;
    }

    // Beanz project vs non-Beanz work (only within work emails)
    let hasBeanzProject = false;
    let projectTags = [];
    if (classification && classification.project_tags) {
      try { projectTags = JSON.parse(classification.project_tags); } catch { /* ignore */ }
    }
    if (!Array.isArray(projectTags)) projectTags = [];
    // Also check subject fallback for known projects
    if (projectTags.length === 0) {
      const subject = (thread.subject || thread.title || '').toLowerCase();
      const KNOWN = BEANZ_PROJECTS;
      projectTags = KNOWN.filter(p => subject.includes(p.toLowerCase()));
    }
    if (projectTags.length > 0) hasBeanzProject = true;

    if (!isMarketing) {
      if (hasBeanzProject) {
        segments.beanzProject.threads++;
        segments.beanzProject.messages += msgCount;
      } else {
        segments.nonBeanzWork.threads++;
        segments.nonBeanzWork.messages += msgCount;
      }
    }

    // -- TOPICS --
    let topicKey = 'Uncategorised';
    if (classification && classification.category) {
      topicKey = classification.category;
      if (classification.subcategory && classification.subcategory !== 'unclassified') {
        topicKey += '/' + classification.subcategory;
      }
    } else {
      // Fallback: keyword extraction from subject
      const subject = thread.subject || thread.title || '';
      const keywords = extractKeywords(subject);
      if (keywords.length > 0) topicKey = keywords.slice(0, 2).join(' ');
    }

    if (!topics[topicKey]) topics[topicKey] = { threadCount: 0, messageCount: 0, sentiments: [], actionRequired: 0, slack: 0, email: 0 };
    topics[topicKey].threadCount++;
    topics[topicKey].messageCount += msgCount;
    topics[topicKey][source]++;
    if (classification) {
      if (classification.sentiment) topics[topicKey].sentiments.push(SENTIMENT_MAP[classification.sentiment] ?? 0.5);
      if (classification.action_required) topics[topicKey].actionRequired++;
    }

    // -- PEOPLE --
    const threadPeople = (thread.people || []).filter(Boolean);
    for (const name of threadPeople) {
      if (!name || typeof name !== 'string') continue;
      const pKey = name.trim();
      if (!pKey) continue;
      if (!people[pKey]) people[pKey] = { threadCount: 0, messageCount: 0, sentiments: [], topTopics: {} };
      people[pKey].threadCount++;
      people[pKey].messageCount += Math.max(1, Math.ceil(msgCount / threadPeople.length));
      if (classification && classification.sentiment) {
        people[pKey].sentiments.push(SENTIMENT_MAP[classification.sentiment] ?? 0.5);
      }
      if (topicKey !== 'Uncategorised') {
        people[pKey].topTopics[topicKey] = (people[pKey].topTopics[topicKey] || 0) + 1;
      }
    }

    // -- PROJECTS (uses projectTags already extracted above for segmentation) --
    for (const proj of projectTags) {
      if (!projects[proj]) projects[proj] = { threadCount: 0, messageCount: 0, sentiments: [], people: new Set(), topTopics: {} };
      projects[proj].threadCount++;
      projects[proj].messageCount += msgCount;
      threadPeople.forEach(p => { if (p) projects[proj].people.add(p); });
      if (classification && classification.sentiment) {
        projects[proj].sentiments.push(SENTIMENT_MAP[classification.sentiment] ?? 0.5);
      }
      if (topicKey !== 'Uncategorised') {
        projects[proj].topTopics[topicKey] = (projects[proj].topTopics[topicKey] || 0) + 1;
      }
    }
  }

  // Convert Sets to arrays for serialisation
  for (const proj of Object.values(projects)) {
    proj.people = Array.from(proj.people);
  }

  return { topics, people, projects, segments, totalThreads, totalClassified };
}

/**
 * Generate and persist a daily snapshot into SQLite.
 */
function generateDailySnapshot(ctx) {
  const db = require('./db');
  const today = new Date().toISOString().slice(0, 10);
  const { topics, people, projects } = extractDailyMetrics(ctx);

  const writeDimension = (dimension, data) => {
    for (const [key, val] of Object.entries(data)) {
      const avgSentiment = val.sentiments.length > 0
        ? val.sentiments.reduce((a, b) => a + b, 0) / val.sentiments.length
        : null;
      const sources = JSON.stringify({ slack: val.slack || 0, email: val.email || 0 });
      const categories = val.topTopics ? JSON.stringify(
        Object.entries(val.topTopics).sort((a, b) => b[1] - a[1]).slice(0, 5)
      ) : null;

      db.upsertAnalyticsSnapshot({
        snapshotDate: today,
        dimension,
        dimensionKey: key,
        threadCount: val.threadCount,
        messageCount: val.messageCount,
        avgSentiment: avgSentiment,
        actionRequiredCount: val.actionRequired || 0,
        categories: categories || sources,
        sources
      });
    }
  };

  writeDimension('topic', topics);
  writeDimension('person', people);
  writeDimension('project', projects);

  console.log(`[Analytics] Snapshot generated for ${today}: ${Object.keys(topics).length} topics, ${Object.keys(people).length} people, ${Object.keys(projects).length} projects`);
  return { date: today, topics: Object.keys(topics).length, people: Object.keys(people).length, projects: Object.keys(projects).length };
}

/**
 * Generate AI narrative summaries for today's snapshot.
 */
async function generateAISummaries(ctx, snapshotDate) {
  if (!ctx.anthropicApiKey) return { generated: 0 };

  const db = require('./db');
  const date = snapshotDate || new Date().toISOString().slice(0, 10);
  const snapshots = db.getAnalyticsSnapshots(date, date);

  if (!snapshots || snapshots.length === 0) return { generated: 0 };

  // Build a hash to skip re-generation
  const dataHash = crypto.createHash('sha256')
    .update(JSON.stringify(snapshots))
    .digest('hex')
    .slice(0, 16);

  // Check if summaries already exist with same hash
  const existing = db.getAnalyticsSummary(date, 'daily_overview');
  if (existing && existing.data_hash === dataHash) return { generated: 0, cached: true };

  // Group snapshots by dimension
  const byDimension = { topic: [], person: [], project: [] };
  for (const s of snapshots) {
    if (byDimension[s.dimension]) byDimension[s.dimension].push(s);
  }

  // Build prompt
  const topTopics = byDimension.topic.sort((a, b) => b.thread_count - a.thread_count).slice(0, 10);
  const topPeople = byDimension.person.sort((a, b) => b.thread_count - a.thread_count).slice(0, 10);
  const topProjects = byDimension.project.sort((a, b) => b.thread_count - a.thread_count).slice(0, 10);

  const promptData = {
    date,
    totalTopics: byDimension.topic.length,
    totalPeople: byDimension.person.length,
    totalProjects: byDimension.project.length,
    topTopics: topTopics.map(t => ({ name: t.dimension_key, threads: t.thread_count, messages: t.message_count, sentiment: t.avg_sentiment })),
    topPeople: topPeople.map(p => ({ name: p.dimension_key, threads: p.thread_count, messages: p.message_count })),
    topProjects: topProjects.map(p => ({ name: p.dimension_key, threads: p.thread_count, messages: p.message_count }))
  };

  const systemPrompt = 'You are an executive communication analyst for Ziv Shalev, GM of Beanz (coffee subscription, Breville Group). ' +
    'Generate concise, insight-driven summaries of daily communication patterns. Be specific about trends, anomalies, and actionable observations. ' +
    'Respond with valid JSON containing exactly 4 keys: daily_overview, topic_trends, people_activity, project_pulse. Each value is a 2-3 sentence narrative string.';

  const userMessage = `Analyse today's communication data (${date}) and generate narrative summaries:\n\n${JSON.stringify(promptData, null, 2)}`;

  try {
    const { callAnthropic } = require('./ai-classifier');
    const raw = await callAnthropic(ctx.anthropicApiKey, systemPrompt, userMessage, 800);

    // Parse response — expect JSON
    let summaries;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      summaries = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { summaries = null; }

    if (!summaries) {
      // Fallback: use raw text as daily_overview
      summaries = { daily_overview: raw, topic_trends: '', people_activity: '', project_pulse: '' };
    }

    const MODEL = 'claude-opus-4-20250514';
    const types = ['daily_overview', 'topic_trends', 'people_activity', 'project_pulse'];
    let generated = 0;
    for (const type of types) {
      if (summaries[type]) {
        db.upsertAnalyticsSummary({
          snapshotDate: date,
          summaryType: type,
          summaryText: summaries[type],
          dataHash,
          modelUsed: MODEL
        });
        generated++;
      }
    }

    console.log(`[Analytics] AI summaries generated for ${date}: ${generated} narratives`);
    return { generated };
  } catch (e) {
    console.error('[Analytics] AI summary generation failed:', e.message);
    return { generated: 0, error: e.message };
  }
}

/**
 * Assemble full dashboard payload for the API.
 */
function getAnalyticsDashboard(ctx, days) {
  const db = require('./db');
  days = days || 14;
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const snapshots = db.getAnalyticsSnapshots(dateFrom, dateTo);
  const summariesRaw = db.getAnalyticsSummary(dateTo);
  const summaries = {};
  if (Array.isArray(summariesRaw)) {
    summariesRaw.forEach(s => { summaries[s.summary_type] = s.summary_text; });
  }

  // Group by dimension
  const byDim = { topic: {}, person: {}, project: {} };
  const dailyTotals = {};

  for (const s of snapshots) {
    const dim = s.dimension;
    const key = s.dimension_key;
    if (!byDim[dim]) continue;

    if (!byDim[dim][key]) {
      byDim[dim][key] = { key, threadCount: 0, messageCount: 0, sentiments: [], trend: {}, actionRequired: 0 };
    }
    byDim[dim][key].threadCount += s.thread_count;
    byDim[dim][key].messageCount += s.message_count;
    if (s.avg_sentiment != null) byDim[dim][key].sentiments.push(s.avg_sentiment);
    byDim[dim][key].actionRequired += s.action_required_count;
    byDim[dim][key].trend[s.snapshot_date] = s.thread_count;

    // Daily totals
    if (!dailyTotals[s.snapshot_date]) dailyTotals[s.snapshot_date] = { threads: 0, messages: 0 };
    // Only count topics to avoid double-counting
    if (dim === 'topic') {
      dailyTotals[s.snapshot_date].threads += s.thread_count;
      dailyTotals[s.snapshot_date].messages += s.message_count;
    }
  }

  // Build date range for trend arrays
  const dates = [];
  for (let d = new Date(dateFrom); d <= new Date(dateTo); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const buildEntries = (dimData) => {
    return Object.values(dimData)
      .map(entry => {
        const avgSentiment = entry.sentiments.length > 0
          ? entry.sentiments.reduce((a, b) => a + b, 0) / entry.sentiments.length
          : null;
        const trendArr = dates.map(d => entry.trend[d] || 0);
        const recent = trendArr.slice(-3).reduce((a, b) => a + b, 0);
        const earlier = trendArr.slice(-6, -3).reduce((a, b) => a + b, 0);
        const direction = recent > earlier ? 'up' : recent < earlier ? 'down' : 'flat';
        return {
          key: entry.key,
          threadCount: entry.threadCount,
          messageCount: entry.messageCount,
          avgSentiment,
          actionRequired: entry.actionRequired,
          trend: trendArr,
          direction
        };
      })
      .sort((a, b) => b.threadCount - a.threadCount);
  };

  // Live metrics for coverage + segmentation
  const { totalThreads, totalClassified, segments } = extractDailyMetrics(ctx);

  // Snapshot timestamp
  const latestSnapshotDate = db.getLatestSnapshotDate();

  const dailyTrend = dates.map(d => ({
    date: d,
    threads: (dailyTotals[d] || {}).threads || 0,
    messages: (dailyTotals[d] || {}).messages || 0
  }));

  return {
    dateRange: { from: dateFrom, to: dateTo },
    snapshotDate: latestSnapshotDate,
    generatedAt: new Date().toISOString(),
    coverage: {
      total: totalThreads,
      classified: totalClassified,
      pct: totalThreads > 0 ? Math.round(totalClassified / totalThreads * 1000) / 10 : 0
    },
    segments,
    overview: {
      totalThreads,
      totalMessages: Object.values(byDim.topic).reduce((s, t) => s + t.messageCount, 0),
      avgSentiment: null,
      actionRequired: Object.values(byDim.topic).reduce((s, t) => s + t.actionRequired, 0),
      dailyTrend
    },
    topics: buildEntries(byDim.topic),
    people: buildEntries(byDim.person),
    projects: buildEntries(byDim.project).map(p => {
      // Enrich projects with people and topTopics from latest snapshot
      const latest = snapshots.filter(s => s.dimension === 'project' && s.dimension_key === p.key);
      let topTopics = [];
      let pplSet = new Set();
      for (const s of latest) {
        try {
          const cats = JSON.parse(s.categories || '[]');
          if (Array.isArray(cats)) cats.forEach(c => { if (Array.isArray(c)) topTopics.push(c[0]); });
        } catch { /* ignore */ }
      }
      return { ...p, people: Array.from(pplSet), topTopics: [...new Set(topTopics)].slice(0, 3) };
    }),
    summaries,
    dates
  };
}

module.exports = {
  loadAllThreads,
  extractDailyMetrics,
  generateDailySnapshot,
  generateAISummaries,
  getAnalyticsDashboard
};
