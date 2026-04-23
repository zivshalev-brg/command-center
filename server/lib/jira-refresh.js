'use strict';

// Scheduled Jira cache writer. Pulls sprints, recent movements, blockers and
// epic progress from the Jira API on an interval and writes a single JSON
// snapshot at kb-data/intelligence/jira-live.json that all consumers read from.
// This avoids hitting Jira on every digest/summary render.

const fs = require('fs');
const path = require('path');
const {
  getRecentActivity, getBlockers, getSprintIssues, searchIssues, searchIssuesRich, _getAllActiveSprints
} = require('./jira-api');

const CACHE_FILE = 'jira-live.json';

function cachePath(ctx) {
  return path.join(ctx.intelDir, CACHE_FILE);
}

/**
 * Build a compact Jira snapshot. Shape:
 *   {
 *     generated_at, sprints: [...], recentMovements: [...],
 *     blockers: [...], epicProgress: [...], lastRefresh, error?
 *   }
 */
async function buildJiraSnapshot(ctx) {
  const out = {
    generated_at: new Date().toISOString(),
    sprints: [],
    recentMovements: [],
    blockers: [],
    epicProgress: [],
    openIssues: [],
    overdue: [],
    allEpics: [],
    lastRefresh: new Date().toISOString(),
    errors: {}
  };

  // 1. Active sprints (all boards) + their issue counts
  try {
    const sprints = await _getAllActiveSprints(ctx);
    out.sprints = (sprints || []).map(function(s) {
      return {
        id: s.id, name: s.name, state: s.state,
        startDate: s.startDate, endDate: s.endDate, boardId: s.originBoardId,
        issueCount: s.issueCount || null,
        doneCount: s.doneCount || null
      };
    });
  } catch (e) { out.errors.sprints = e.message; }

  // 2. Recent activity — last 7 days, classify as movement type
  try {
    const recent = await getRecentActivity(ctx, 7);
    out.recentMovements = (recent || []).slice(0, 30).map(function(i) {
      return {
        key: i.key, summary: i.summary || i.fields?.summary,
        status: i.status || i.fields?.status?.name,
        type: i.issuetype || i.fields?.issuetype?.name,
        priority: i.priority || i.fields?.priority?.name,
        assignee: i.assignee || i.fields?.assignee?.displayName || null,
        updated: i.updated || i.fields?.updated,
        url: i.url || null,
        epic: i.epic || i.fields?.customfield_10014 || null
      };
    });
  } catch (e) { out.errors.recent = e.message; }

  // 3. Active blockers
  try {
    const b = await getBlockers(ctx);
    out.blockers = (b || []).slice(0, 20).map(function(i) {
      return {
        key: i.key, summary: i.summary || i.fields?.summary,
        status: i.status || i.fields?.status?.name,
        assignee: i.assignee || i.fields?.assignee?.displayName || null,
        daysBlocked: i.daysBlocked || null,
        url: i.url || null
      };
    });
  } catch (e) { out.errors.blockers = e.message; }

  // 4. Epic progress — epics updated in the last 30 days
  try {
    const epics = await searchIssuesRich(ctx, 'issuetype = Epic AND updated >= -30d ORDER BY updated DESC', 15, false);
    out.epicProgress = (epics || []).map(function(i) {
      return {
        key: i.key,
        name: i.summary || i.fields?.summary,
        status: i.status || i.fields?.status?.name,
        updated: i.updated || i.fields?.updated,
        url: i.url || null
      };
    });
  } catch (e) { out.errors.epicProgress = e.message; }

  // 5. All open issues — cross-project, so ingestor can match via classifier_tags
  //    regardless of Jira project scope.
  try {
    const open = await searchIssuesRich(ctx, 'resolution = Unresolved AND updated >= -90d ORDER BY updated DESC', 150, true);
    out.openIssues = (open || []).map(function(i) {
      return {
        key: i.key,
        summary: i.summary,
        status: i.status,
        type: i.issuetype,
        priority: i.priority,
        assignee: i.assignee,
        reporter: i.reporter,
        labels: i.labels || [],
        components: i.components || [],
        updated: i.updated,
        url: i.url
      };
    });
  } catch (e) { out.errors.openIssues = e.message; }

  // 6. Overdue — cross-project
  try {
    const overdue = await searchIssuesRich(ctx, 'duedate < now() AND resolution = Unresolved ORDER BY duedate ASC', 50, true);
    out.overdue = (overdue || []).map(function(i) {
      return {
        key: i.key,
        summary: i.summary,
        status: i.status,
        priority: i.priority,
        assignee: i.assignee,
        dueDate: i.duedate || i.dueDate,
        url: i.url
      };
    });
  } catch (e) { out.errors.overdue = e.message; }

  // 7. Epics — cross-project, recent-ish
  try {
    const epics = await searchIssuesRich(ctx, 'issuetype = Epic AND updated >= -90d ORDER BY updated DESC', 60, true);
    out.allEpics = (epics || []).map(function(i) {
      return {
        key: i.key,
        summary: i.summary,
        status: i.status,
        assignee: i.assignee,
        labels: i.labels || [],
        updated: i.updated,
        url: i.url
      };
    });
  } catch (e) { out.errors.allEpics = e.message; }

  return out;
}

/** Refresh + write the cache atomically. */
async function refreshJiraCache(ctx) {
  const snap = await buildJiraSnapshot(ctx);
  const target = cachePath(ctx);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(snap, null, 2), 'utf8');
  fs.renameSync(tmp, target);
  return snap;
}

/** Read the cache file. Returns null if missing. */
function readJiraCache(ctx) {
  try {
    const p = cachePath(ctx);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

/**
 * Start an interval that refreshes the cache every N minutes.
 * Returns the interval handle so the caller can stop it.
 */
function startJiraRefreshScheduler(ctx, intervalMinutes) {
  const minutes = intervalMinutes || 30;
  const ms = minutes * 60 * 1000;

  // Initial refresh on startup (async, no blocking)
  refreshJiraCache(ctx).then(function(s) {
    console.log('[jira-refresh] initial snapshot written, sprints=' + s.sprints.length + ' movements=' + s.recentMovements.length);
  }).catch(function(e) { console.error('[jira-refresh] initial failed:', e.message); });

  return setInterval(function() {
    refreshJiraCache(ctx).then(function() {
      // silent ok
    }).catch(function(e) { console.error('[jira-refresh] interval failed:', e.message); });
  }, ms);
}

module.exports = { buildJiraSnapshot, refreshJiraCache, readJiraCache, startJiraRefreshScheduler };
