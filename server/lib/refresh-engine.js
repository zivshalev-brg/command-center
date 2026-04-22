const fs = require('fs');
const path = require('path');
const { buildSlackThreads } = require('./slack-api');
const { logAction } = require('./db');
const MODELS = require('./ai-models');

// ─── Comms Refresh Engine ─────────────────────────────────────
// Server-side scheduled refresh for Slack and Outlook.
// Writes fresh data to comms-live.json and email-live.json,
// then the existing /api/comms endpoint merges + serves them.

let _refreshState = {
  slack: { lastRefresh: null, refreshing: false, threadCount: 0, error: null },
  outlook: { lastRefresh: null, refreshing: false, threadCount: 0, error: null },
  pbi: { lastRefresh: null, refreshing: false, metricCount: 0, error: null },
  ai: { lastClassify: null, classifying: false, classifiedCount: 0, error: null },
  matching: { lastMatch: null, matching: false, matchCount: 0, error: null },
  intervalId: null
};

/**
 * Refresh Slack threads via bot API.
 * Writes result to comms-live.json.
 */
async function refreshSlack(ctx) {
  // Need at least one Slack token (bot or user)
  if (!ctx.slackToken && !ctx.slackReadToken) return;
  if (_refreshState.slack.refreshing) return;
  _refreshState.slack.refreshing = true;
  _refreshState.slack.error = null;

  try {
    // Use slackReadToken for reads (user token preferred), slackToken (bot) for writes
    const readToken = ctx.slackReadToken || ctx.slackToken;
    const writeToken = ctx.slackToken;
    const freshThreads = await buildSlackThreads(readToken, writeToken);
    const freshCount = Object.keys(freshThreads).length;

    // Merge with existing persisted threads so older conversations aren't lost
    // between refreshes (API only returns a window of recent conversations)
    let existing = {};
    fs.mkdirSync(path.dirname(ctx.commsLivePath), { recursive: true });
    if (fs.existsSync(ctx.commsLivePath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(ctx.commsLivePath, 'utf8'));
        existing = prev.threads || {};
      } catch { /* corrupt file, start fresh */ }
    }

    // Start with existing threads, then overwrite with fresh data
    // Fresh threads always win (they have the latest messages)
    const merged = { ...existing, ...freshThreads };

    // Prune threads older than 90 days to prevent unbounded growth
    const PRUNE_CUTOFF = Date.now() - 90 * 86400000;
    for (const id of Object.keys(merged)) {
      const la = merged[id].lastActivity;
      if (la && new Date(la).getTime() < PRUNE_CUTOFF) delete merged[id];
    }

    const mergedCount = Object.keys(merged).length;
    const slackData = { threads: merged, refreshedAt: new Date().toISOString() };
    fs.writeFileSync(ctx.commsLivePath, JSON.stringify(slackData, null, 2));
    _refreshState.slack.threadCount = mergedCount;

    _refreshState.slack.lastRefresh = new Date().toISOString();
    const keptFromPrev = mergedCount - freshCount;
    logAction('slack_refresh', null, 'system', { threadCount: mergedCount, fresh: freshCount, persisted: keptFromPrev > 0 ? keptFromPrev : 0 });
    console.log(`[Refresh] Slack: ${freshCount} fresh + ${keptFromPrev > 0 ? keptFromPrev : 0} persisted = ${mergedCount} total threads`);
  } catch (e) {
    _refreshState.slack.error = e.message;
    console.error('[Refresh] Slack failed:', e.message);
  }
  _refreshState.slack.refreshing = false;
}

/**
 * Refresh Outlook emails via MS Graph API.
 * Writes result to email-live.json.
 */
async function refreshOutlook(ctx) {
  if (!ctx.msGraph || (!ctx.msGraph.accessToken && !ctx.msGraph.clientId)) {
    return; // No MS Graph config
  }
  if (_refreshState.outlook.refreshing) return;
  _refreshState.outlook.refreshing = true;
  _refreshState.outlook.error = null;

  try {
    // Dynamic import to avoid errors when outlook-api.js has issues
    const { fetchOutlookEmails } = require('./outlook-api');
    const result = await fetchOutlookEmails(ctx.msGraph, { maxMessages: 200, sinceDays: 14 });

    if (result.emailCount > 0) {
      const emailPath = path.join(ctx.dir, 'kb-data', 'intelligence', 'email-live.json');
      fs.mkdirSync(path.dirname(emailPath), { recursive: true });
      fs.writeFileSync(emailPath, JSON.stringify({
        threads: result.threads,
        refreshedAt: result.refreshedAt
      }, null, 2));
      _refreshState.outlook.threadCount = result.emailCount;
    }
    _refreshState.outlook.lastRefresh = new Date().toISOString();
    logAction('outlook_refresh', null, 'system', {
      emailCount: result.emailCount,
      messageCount: result.messageCount
    });
    console.log(`[Refresh] Outlook: ${result.emailCount} threads (${result.messageCount} messages)`);
  } catch (e) {
    _refreshState.outlook.error = e.message;
    // Don't spam logs if Graph is simply not configured or not connected
    if (!e.message.includes('not configured') && !e.message.includes('not connected') && !e.message.includes('re-authenticate')) {
      console.error('[Refresh] Outlook failed:', e.message);
    }
  }
  _refreshState.outlook.refreshing = false;
}

/**
 * Refresh Power BI metrics via REST API.
 * Uses SSO token captured by beanz-digest Playwright sessions.
 * Writes result to pbi-live.json.
 */
async function refreshPowerBI(ctx) {
  if (!ctx.pbi?.tokenPath || _refreshState.pbi.refreshing) return;
  _refreshState.pbi.refreshing = true;
  _refreshState.pbi.error = null;

  try {
    const pbiApi = require('./powerbi-api');
    const dax = require('./powerbi-dax');

    // Check token availability
    const tokenStatus = pbiApi.getTokenStatus(ctx);
    if (!tokenStatus.available) {
      _refreshState.pbi.error = tokenStatus.reason;
      _refreshState.pbi.refreshing = false;
      return;
    }

    // Get datasets
    const datasets = await pbiApi.getDatasets(ctx);
    if (datasets.length === 0) {
      _refreshState.pbi.error = 'No datasets found';
      _refreshState.pbi.refreshing = false;
      return;
    }

    const datasetId = datasets[0].id;
    const metrics = {};

    // Run standard DAX query templates
    const templates = ['kpi_overview', 'regional_breakdown', 'subscription_health'];
    for (const templateName of templates) {
      try {
        const query = dax.buildQuery(templateName);
        const result = await pbiApi.executeDAXQuery(ctx, datasetId, query);
        metrics[templateName] = { rows: result.rows, columns: result.columns };
      } catch (e) {
        metrics[templateName] = { error: e.message };
      }
    }

    // Write to pbi-live.json
    const pbiData = {
      datasetId,
      datasetName: datasets[0].name,
      metrics,
      refreshedAt: new Date().toISOString()
    };
    const pbiLivePath = path.join(ctx.dir, 'kb-data', 'intelligence', 'pbi-live.json');
    fs.mkdirSync(path.dirname(pbiLivePath), { recursive: true });
    fs.writeFileSync(pbiLivePath, JSON.stringify(pbiData, null, 2));

    const metricCount = Object.values(metrics).reduce((sum, m) => sum + (m.rows?.length || 0), 0);
    _refreshState.pbi.metricCount = metricCount;
    _refreshState.pbi.lastRefresh = new Date().toISOString();
    logAction('pbi_refresh', null, 'system', { metricCount, templates: templates.length });
    console.log(`[Refresh] PowerBI: ${metricCount} metrics from ${templates.length} queries`);
  } catch (e) {
    _refreshState.pbi.error = e.message;
    if (!e.message.includes('No valid Power BI token')) {
      console.error('[Refresh] PowerBI failed:', e.message);
    }
  }
  _refreshState.pbi.refreshing = false;
}

// ─── AI Classification & Cross-Platform Matching ────────────

/**
 * Load all cached threads from Slack and Outlook caches.
 * Returns a merged object of { threadId: threadData }.
 */
function loadAllCachedThreads(ctx) {
  const threads = {};
  // Load Slack threads
  if (fs.existsSync(ctx.commsLivePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(ctx.commsLivePath, 'utf8'));
      Object.assign(threads, data.threads || {});
    } catch { /* ignore corrupt cache */ }
  }
  // Load email threads
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
 * Classify new/changed threads using the AI classifier.
 * Batches up to 20 threads per cycle to control cost.
 */
async function classifyNewThreads(ctx) {
  if (!ctx.anthropicApiKey || _refreshState.ai.classifying) return;
  _refreshState.ai.classifying = true;
  _refreshState.ai.error = null;

  try {
    const { processClassificationQueue, getCachedClassification } = require('./ai-classifier');
    const db = require('./db');

    // Load all current threads from both caches
    const allThreads = loadAllCachedThreads(ctx);

    // Find threads that need classification (new or changed message count)
    const toClassify = [];
    for (const [threadId, thread] of Object.entries(allThreads)) {
      const msgCount = (thread.messages || []).length;
      const cached = getCachedClassification(db, threadId, msgCount);
      if (!cached) {
        toClassify.push({ threadId, thread });
      }
    }

    if (toClassify.length === 0) {
      _refreshState.ai.classifying = false;
      return;
    }

    // Classify max 40 threads per cycle — proactive analysis for all new emails
    const batch = toClassify.slice(0, 40);
    console.log(`[AI] Classifying ${batch.length} threads (${toClassify.length} total need classification)`);

    const result = await processClassificationQueue(ctx.anthropicApiKey, batch, db);
    _refreshState.ai.classifiedCount = result.classified;
    _refreshState.ai.lastClassify = new Date().toISOString();
    console.log(`[AI] Classified ${result.classified} threads (${result.errors} errors)`);
  } catch (e) {
    _refreshState.ai.error = e.message;
    console.error('[AI] Classification failed:', e.message);
  }
  _refreshState.ai.classifying = false;
}

/**
 * Find cross-platform matches between Slack and email threads.
 * Matches by participant, subject similarity, and timing.
 */
async function matchCrossPlatformThreads(ctx) {
  if (_refreshState.matching.matching) return;
  _refreshState.matching.matching = true;
  _refreshState.matching.error = null;

  try {
    const { findCrossPlatformMatches, persistMatches } = require('./thread-matcher');
    const { getSlackUsers } = require('./slack-api');
    const db = require('./db');

    // Load threads from both caches
    const allThreads = loadAllCachedThreads(ctx);
    const slackThreads = {};
    const emailThreads = {};
    for (const [id, th] of Object.entries(allThreads)) {
      if (id.startsWith('slack-')) slackThreads[id] = th;
      else if (id.startsWith('email-')) emailThreads[id] = th;
    }

    const slackUsers = getSlackUsers();
    const matches = findCrossPlatformMatches(slackThreads, emailThreads, slackUsers);

    if (matches.length > 0) {
      persistMatches(db, matches);
      console.log(`[Match] Found ${matches.length} cross-platform thread matches`);
    }

    _refreshState.matching.matchCount = matches.length;
    _refreshState.matching.lastMatch = new Date().toISOString();
  } catch (e) {
    _refreshState.matching.error = e.message;
    console.error('[Match] Cross-platform matching failed:', e.message);
  }
  _refreshState.matching.matching = false;
}

/**
 * Proactively summarise high-priority email threads that have been classified
 * but not yet summarised. Runs after classification to pre-compute summaries
 * so they're ready before the user opens the thread.
 *
 * Only summarises email threads classified as high/critical priority or actionRequired.
 * Max 10 threads per cycle to control API costs.
 */
async function summariseNewThreads(ctx) {
  if (!ctx.anthropicApiKey) return;
  if (_refreshState.summarise?.summarising) return;

  if (!_refreshState.summarise) {
    _refreshState.summarise = { lastSummarise: null, summarising: false, summarisedCount: 0, error: null };
  }
  _refreshState.summarise.summarising = true;
  _refreshState.summarise.error = null;

  try {
    const { summariseThread } = require('./ai-summariser');
    const db = require('./db');

    const allThreads = loadAllCachedThreads(ctx);
    const toSummarise = [];

    for (const [threadId, thread] of Object.entries(allThreads)) {
      // Only email threads for proactive summary (Slack threads are visible inline)
      if (!threadId.startsWith('email-')) continue;

      const msgCount = (thread.messages || []).length;
      if (msgCount === 0) continue;

      // Check if classification exists and is high/critical or action-required
      const classification = db.getClassificationIfFresh(threadId, msgCount);
      if (!classification) continue;
      const isHighPriority = classification.priority === 'critical' || classification.priority === 'high';
      const needsAction = classification.action_required === 1;
      if (!isHighPriority && !needsAction) continue;

      // Check if we already have a fresh summary
      const existingSummary = db.getSummaryIfFresh(threadId, msgCount, null);
      if (existingSummary) continue;

      toSummarise.push({ threadId, thread });
    }

    if (toSummarise.length === 0) {
      _refreshState.summarise.summarising = false;
      return;
    }

    // Summarise max 10 per cycle (cost control)
    const batch = toSummarise.slice(0, 10);
    console.log(`[AI] Proactive summary: ${batch.length} threads (${toSummarise.length} total need summaries)`);

    let summarised = 0;
    // Process 3 at a time
    for (let i = 0; i < batch.length; i += 3) {
      const chunk = batch.slice(i, i + 3);
      const results = await Promise.allSettled(
        chunk.map(async ({ threadId, thread }) => {
          const summary = await summariseThread(ctx.anthropicApiKey, thread, []);
          db.upsertSummary(threadId, {
            summaryJson: summary,
            messageCount: (thread.messages || []).length,
            attachmentHash: null,
            modelUsed: MODELS.OPUS
          });
          return summary;
        })
      );
      summarised += results.filter(r => r.status === 'fulfilled').length;
    }

    _refreshState.summarise.summarisedCount = summarised;
    _refreshState.summarise.lastSummarise = new Date().toISOString();
    console.log(`[AI] Proactive summary: completed ${summarised} of ${batch.length}`);
  } catch (e) {
    _refreshState.summarise.error = e.message;
    console.error('[AI] Proactive summary failed:', e.message);
  }
  _refreshState.summarise.summarising = false;
}

/**
 * Run a full refresh of all sources, then trigger AI post-processing.
 */
async function refreshAll(ctx) {
  await Promise.allSettled([
    refreshSlack(ctx),
    refreshOutlook(ctx),
    refreshPowerBI(ctx)
  ]);
  // Trigger AI classification and cross-platform matching after data is fresh
  // Use setTimeout to avoid blocking the response
  setTimeout(() => classifyNewThreads(ctx), 2000);
  setTimeout(() => matchCrossPlatformThreads(ctx), 5000);

  // Trigger daily analytics snapshot (once per day, async fire-and-forget)
  setTimeout(() => {
    try {
      const { getLatestSnapshotDate } = require('./db');
      const today = new Date().toISOString().slice(0, 10);
      if (getLatestSnapshotDate() !== today) {
        const { generateDailySnapshot, generateAISummaries } = require('./comms-analytics-engine');
        generateDailySnapshot(ctx);
        generateAISummaries(ctx).catch(e => console.error('[Analytics] Refresh AI summary error:', e.message));
      }
    } catch (e) { console.error('[Analytics] Refresh snapshot error:', e.message); }
  }, 10000);
}

/**
 * Start the background refresh scheduler.
 * Default intervals:
 *   - Slack: every 60 seconds (bot API is fast and rate-limit-friendly)
 *   - Outlook: every 120 seconds (Graph API is fast but heavier)
 *   - Full refresh: every 5 minutes
 */
function startRefreshScheduler(ctx, options = {}) {
  const slackInterval = options.slackInterval || 60000;   // 60s
  const outlookInterval = options.outlookInterval || 120000; // 2 min
  const fullInterval = options.fullInterval || 300000;      // 5 min

  // Immediate first refresh
  console.log('[Refresh] Starting background refresh engine...');
  const slackMode = ctx.slackUserToken ? 'user token (full inbox)' : ctx.slackToken ? 'bot token (joined channels only)' : 'NOT configured';
  console.log(`[Refresh] Slack: ${slackMode} (every ${slackInterval/1000}s)`);
  const pbiInterval = options.pbiInterval || 300000;         // 5 min
  console.log(`[Refresh] Outlook: ${ctx.msGraph?.accessToken || ctx.msGraph?.clientId ? 'configured' : 'NOT configured'} (every ${outlookInterval/1000}s)`);
  console.log(`[Refresh] PowerBI: ${ctx.pbi?.tokenPath ? 'configured' : 'NOT configured'} (every ${pbiInterval/1000}s)`);

  // Stagger initial loads
  setTimeout(() => refreshSlack(ctx), 2000);
  setTimeout(() => refreshOutlook(ctx), 5000);
  setTimeout(() => refreshPowerBI(ctx), 8000);

  // Set up intervals
  const slackTimer = setInterval(() => refreshSlack(ctx), slackInterval);
  const outlookTimer = setInterval(() => refreshOutlook(ctx), outlookInterval);
  const pbiTimer = setInterval(() => refreshPowerBI(ctx), pbiInterval);

  // AI classification: every 120s, staggered after data refresh
  const classifyInterval = options.classifyInterval || 120000; // 2 min
  const matchInterval = options.matchInterval || 300000;       // 5 min
  console.log(`[Refresh] AI classify: ${ctx.anthropicApiKey ? 'configured' : 'NOT configured'} (every ${classifyInterval/1000}s)`);
  console.log(`[Refresh] Cross-platform matching: every ${matchInterval/1000}s`);

  // Proactive summary interval (every 3 min, after classification)
  const summariseInterval = options.summariseInterval || 180000; // 3 min
  console.log(`[Refresh] Proactive summary: ${ctx.anthropicApiKey ? 'configured' : 'NOT configured'} (every ${summariseInterval/1000}s)`);

  // Stagger AI initial loads after data is available
  setTimeout(() => classifyNewThreads(ctx), 15000);
  setTimeout(() => matchCrossPlatformThreads(ctx), 20000);
  setTimeout(() => summariseNewThreads(ctx), 25000); // After classification

  const classifyTimer = setInterval(() => classifyNewThreads(ctx), classifyInterval);
  const matchTimer = setInterval(() => matchCrossPlatformThreads(ctx), matchInterval);
  const summariseTimer = setInterval(() => summariseNewThreads(ctx), summariseInterval);

  // ── Daily newsletter scheduler (weekdays ~8 AM local) ──
  var _lastNewsletterDate = null;
  var newsletterTimer = setInterval(function() {
    var now = new Date();
    var day = now.getDay(); // 0=Sun, 6=Sat
    var hour = now.getHours();
    var today = now.toISOString().slice(0, 10);
    // Weekdays only, between 8:00-8:10 AM, once per day
    if (day >= 1 && day <= 5 && hour === 8 && now.getMinutes() < 10 && _lastNewsletterDate !== today) {
      _lastNewsletterDate = today;
      sendDailyNewsletters(ctx);
    }
  }, 60000); // check every minute

  _refreshState.intervalId = { slackTimer, outlookTimer, pbiTimer, classifyTimer, matchTimer, summariseTimer, newsletterTimer };

  return _refreshState;
}

/**
 * Send daily coffee + AI research newsletters via Outlook.
 * Called by the scheduler at ~8 AM weekdays.
 */
async function sendDailyNewsletters(ctx) {
  console.log('[Newsletter] Attempting daily send...');
  try {
    var { sendResearchEmail } = require('./research-email');
    var { sendEmail } = require('./outlook-api');

    // Check Outlook is connected by testing token
    if (!ctx.msGraph || !ctx.msGraph.accessToken) {
      console.warn('[Newsletter] Skipped — Outlook not connected. Authenticate at /auth/outlook');
      return;
    }

    // Coffee newsletter
    try {
      var coffeeRecipients = (process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS || '').split(',').map(function(e) { return e.trim(); }).filter(Boolean);
      if (coffeeRecipients.length > 0) {
        var db = require('./db');
        var cached = db.getLatestNewsDigest('coffee_research_daily');
        var report = null;
        if (cached && cached.content) {
          try { report = JSON.parse(cached.content); } catch { report = null; }
        }
        if (report) {
          await sendResearchEmail(ctx, report, 'coffee', coffeeRecipients);
          console.log('[Newsletter] Coffee email sent to', coffeeRecipients.length, 'recipients');
        } else {
          console.log('[Newsletter] No coffee research report cached — skipping');
        }
      }
    } catch (e) {
      console.error('[Newsletter] Coffee email failed:', e.message);
    }

    // AI/Tech newsletter
    try {
      var { getRecipientList } = require('./research-email');
      var techRecipients = getRecipientList();
      if (techRecipients.length > 0) {
        var db2 = require('./db');
        var techCached = db2.getLatestNewsDigest('tech_research_daily');
        var techReport = null;
        if (techCached && techCached.content) {
          try { techReport = JSON.parse(techCached.content); } catch { techReport = null; }
        }
        if (techReport) {
          await sendResearchEmail(ctx, techReport, 'tech', techRecipients);
          console.log('[Newsletter] AI/Tech email sent to', techRecipients.length, 'recipients');
        } else {
          console.log('[Newsletter] No tech research report cached — skipping');
        }
      }
    } catch (e) {
      console.error('[Newsletter] AI/Tech email failed:', e.message);
    }

    logAction('newsletter_send', null, 'system', { date: new Date().toISOString().slice(0, 10) });
  } catch (e) {
    console.error('[Newsletter] Daily send failed:', e.message);
  }
}

/**
 * Stop the refresh scheduler.
 */
function stopRefreshScheduler() {
  if (_refreshState.intervalId) {
    if (_refreshState.intervalId.slackTimer) clearInterval(_refreshState.intervalId.slackTimer);
    if (_refreshState.intervalId.outlookTimer) clearInterval(_refreshState.intervalId.outlookTimer);
    if (_refreshState.intervalId.pbiTimer) clearInterval(_refreshState.intervalId.pbiTimer);
    if (_refreshState.intervalId.classifyTimer) clearInterval(_refreshState.intervalId.classifyTimer);
    if (_refreshState.intervalId.matchTimer) clearInterval(_refreshState.intervalId.matchTimer);
    if (_refreshState.intervalId.summariseTimer) clearInterval(_refreshState.intervalId.summariseTimer);
    if (_refreshState.intervalId.newsletterTimer) clearInterval(_refreshState.intervalId.newsletterTimer);
    _refreshState.intervalId = null;
    console.log('[Refresh] Scheduler stopped');
  }
}

/**
 * Get current refresh status (for API endpoint).
 */
function getRefreshStatus() {
  return {
    slack: {
      lastRefresh: _refreshState.slack.lastRefresh,
      refreshing: _refreshState.slack.refreshing,
      threadCount: _refreshState.slack.threadCount,
      error: _refreshState.slack.error
    },
    outlook: {
      lastRefresh: _refreshState.outlook.lastRefresh,
      refreshing: _refreshState.outlook.refreshing,
      threadCount: _refreshState.outlook.threadCount,
      error: _refreshState.outlook.error
    },
    pbi: {
      lastRefresh: _refreshState.pbi.lastRefresh,
      refreshing: _refreshState.pbi.refreshing,
      metricCount: _refreshState.pbi.metricCount,
      error: _refreshState.pbi.error
    },
    ai: {
      lastClassify: _refreshState.ai.lastClassify,
      classifying: _refreshState.ai.classifying,
      classifiedCount: _refreshState.ai.classifiedCount,
      error: _refreshState.ai.error
    },
    matching: {
      lastMatch: _refreshState.matching.lastMatch,
      matching: _refreshState.matching.matching,
      matchCount: _refreshState.matching.matchCount,
      error: _refreshState.matching.error
    },
    summarise: _refreshState.summarise || { lastSummarise: null, summarising: false, summarisedCount: 0, error: null },
    schedulerRunning: !!_refreshState.intervalId
  };
}

module.exports = {
  refreshSlack,
  refreshOutlook,
  refreshPowerBI,
  refreshAll,
  classifyNewThreads,
  summariseNewThreads,
  matchCrossPlatformThreads,
  startRefreshScheduler,
  stopRefreshScheduler,
  getRefreshStatus
};
