/**
 * jira-api.js — Comprehensive Jira Cloud REST API v3 client.
 * Provides rich issue data, sprint tracking, board config, epics,
 * comments, linked issues, and project-level analytics.
 */
'use strict';

const https = require('https');

var _cache = {};
var CACHE_TTL = 5 * 60 * 1000; // 5 min

// Custom field IDs (discovered from breville.atlassian.net)
var CF = {
  STORY_POINTS: 'customfield_10008',
  SPRINT: 'customfield_10003',
  EPIC_LINK: 'customfield_10004',
  EPIC_NAME: 'customfield_10006',
  RANK: 'customfield_10002',
  FLAGGED: 'customfield_10400',
  STORY_POINTS_AI: 'customfield_14096',
  ESTIMATED_EFFORTS: 'customfield_11669',
  STORY_POINT_ESTIMATE: 'customfield_11286'
};

function cachedFetch(key, ttl, fn) {
  var entry = _cache[key];
  if (entry && Date.now() - entry.ts < (ttl || CACHE_TTL)) return Promise.resolve(entry.data);
  return fn().then(function(data) { _cache[key] = { data: data, ts: Date.now() }; return data; });
}

function jiraRequest(ctx, apiPath, postBody) {
  var atlassian = ctx.atlassian || {};
  if (!atlassian.email || !atlassian.token || !atlassian.baseUrl) return Promise.reject(new Error('Atlassian credentials not configured'));
  var url = new URL(apiPath, atlassian.baseUrl);
  var method = postBody ? 'POST' : 'GET';
  var headers = {
    'Authorization': 'Basic ' + Buffer.from(atlassian.email + ':' + atlassian.token).toString('base64'),
    'Accept': 'application/json'
  };
  if (postBody) headers['Content-Type'] = 'application/json';
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Jira')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('Jira request timeout')); });
    if (postBody) req.write(JSON.stringify(postBody));
    req.end();
  });
}

// ─── Single Issue Full Detail ─────────────────────────────────

async function getIssueDetail(ctx, issueKey) {
  var baseUrl = (ctx.atlassian || {}).baseUrl || '';
  var issue = await jiraRequest(ctx, '/rest/api/3/issue/' + issueKey + '?expand=changelog,renderedFields&fields=*all');
  var f = issue.fields || {};
  var rf = issue.renderedFields || {};

  // Parse description
  var descText = f.description ? _adfToText(f.description) : '';
  var descHtml = rf.description || '';

  // Comments
  var comments = (f.comment && f.comment.comments ? f.comment.comments : []).map(function(c) {
    return {
      id: c.id,
      author: c.author ? c.author.displayName : 'Unknown',
      authorAvatar: c.author && c.author.avatarUrls ? c.author.avatarUrls['24x24'] : '',
      body: c.body ? _adfToText(c.body) : '',
      bodyHtml: (rf.comment && rf.comment.comments) ? (rf.comment.comments.find(function(rc) { return rc.id === c.id; }) || {}).body || '' : '',
      created: c.created || '',
      updated: c.updated || ''
    };
  });

  // Attachments
  var attachments = (f.attachment || []).map(function(a) {
    return {
      id: a.id,
      filename: a.filename || '',
      size: a.size || 0,
      sizeLabel: a.size ? (a.size > 1048576 ? (a.size / 1048576).toFixed(1) + ' MB' : Math.round(a.size / 1024) + ' KB') : '',
      mimeType: a.mimeType || '',
      isImage: /^image\//.test(a.mimeType || ''),
      thumbnailUrl: a.thumbnail || null,
      contentUrl: a.content || null,
      author: a.author ? a.author.displayName : '',
      created: a.created || ''
    };
  });

  // Changelog (status transitions + key changes)
  var changelog = [];
  if (issue.changelog && issue.changelog.histories) {
    issue.changelog.histories.forEach(function(h) {
      (h.items || []).forEach(function(item) {
        changelog.push({
          author: h.author ? h.author.displayName : 'System',
          date: h.created || '',
          field: item.field || '',
          from: item.fromString || '',
          to: item.toString || ''
        });
      });
    });
  }
  // Sort newest first
  changelog.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  // Linked issues
  var links = (f.issuelinks || []).map(function(l) {
    var linked = l.outwardIssue || l.inwardIssue;
    return {
      type: l.type ? l.type.name : '',
      direction: l.outwardIssue ? (l.type ? l.type.outward : '') : (l.type ? l.type.inward : ''),
      key: linked ? linked.key : '',
      summary: linked && linked.fields ? (linked.fields.summary || '') : '',
      status: linked && linked.fields && linked.fields.status ? linked.fields.status.name : '',
      statusCategory: linked && linked.fields && linked.fields.status && linked.fields.status.statusCategory ? linked.fields.status.statusCategory.key : '',
      priority: linked && linked.fields && linked.fields.priority ? linked.fields.priority.name : '',
      url: baseUrl + '/browse/' + (linked ? linked.key : '')
    };
  });

  // Subtasks
  var subtasks = (f.subtasks || []).map(function(st) {
    var sf = st.fields || {};
    return {
      key: st.key,
      summary: sf.summary || '',
      status: sf.status ? sf.status.name : '',
      statusCategory: sf.status && sf.status.statusCategory ? sf.status.statusCategory.key : '',
      assignee: sf.assignee ? sf.assignee.displayName : 'Unassigned',
      priority: sf.priority ? sf.priority.name : '',
      url: baseUrl + '/browse/' + st.key
    };
  });

  // Worklogs
  var worklogs = (f.worklog && f.worklog.worklogs ? f.worklog.worklogs : []).map(function(w) {
    return {
      author: w.author ? w.author.displayName : '',
      timeSpent: w.timeSpent || '',
      timeSpentSeconds: w.timeSpentSeconds || 0,
      started: w.started || '',
      comment: w.comment ? _adfToText(w.comment) : ''
    };
  });

  // Sprint info
  var sprint = f[CF.SPRINT];
  var activeSprint = Array.isArray(sprint) ? sprint.find(function(s) { return s.state === 'active'; }) : null;

  return {
    key: issue.key,
    id: issue.id,
    summary: f.summary || '',
    description: descText,
    descriptionHtml: descHtml,
    status: f.status ? f.status.name : 'Unknown',
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.key : '',
    priority: f.priority ? f.priority.name : 'Medium',
    type: f.issuetype ? f.issuetype.name : 'Task',
    isSubtask: f.issuetype ? !!f.issuetype.subtask : false,
    assignee: f.assignee ? f.assignee.displayName : 'Unassigned',
    assigneeAvatar: f.assignee && f.assignee.avatarUrls ? f.assignee.avatarUrls['24x24'] : '',
    reporter: f.reporter ? f.reporter.displayName : '',
    reporterAvatar: f.reporter && f.reporter.avatarUrls ? f.reporter.avatarUrls['24x24'] : '',
    created: f.created || '',
    updated: f.updated || '',
    dueDate: f.duedate || null,
    resolution: f.resolution ? f.resolution.name : null,
    resolutionDate: f.resolutiondate || null,
    labels: f.labels || [],
    components: (f.components || []).map(function(c) { return c.name; }),
    fixVersions: (f.fixVersions || []).map(function(v) { return { name: v.name, released: v.released, releaseDate: v.releaseDate }; }),
    parent: f.parent ? { key: f.parent.key, summary: (f.parent.fields || {}).summary || '', type: (f.parent.fields || {}).issuetype ? f.parent.fields.issuetype.name : '' } : null,
    storyPoints: f[CF.STORY_POINTS] || f[CF.STORY_POINT_ESTIMATE] || null,
    sprint: activeSprint ? { name: activeSprint.name, goal: activeSprint.goal || '', endDate: activeSprint.endDate } : null,
    timeTracking: f.timetracking || null,
    flagged: !!(f[CF.FLAGGED] && f[CF.FLAGGED].length),
    project: f.project ? f.project.key : '',
    projectName: f.project ? f.project.name : '',
    url: baseUrl + '/browse/' + issue.key,
    // Rich data
    comments: comments,
    attachments: attachments,
    changelog: changelog.slice(0, 50),
    links: links,
    subtasks: subtasks,
    worklogs: worklogs,
    watches: f.watches ? { count: f.watches.watchCount, watching: f.watches.isWatching } : null,
    votes: f.votes ? { count: f.votes.votes } : null
  };
}

// ─── Rich Issue Formatter ────────────────────────────────────

function formatIssueRich(issue, baseUrl) {
  var f = issue.fields || {};
  var sprint = f[CF.SPRINT];
  var activeSprint = Array.isArray(sprint) ? sprint.find(function(s) { return s.state === 'active'; }) : (sprint && sprint.state === 'active' ? sprint : null);

  // Parse ADF description to plain text
  var descText = '';
  if (f.description && f.description.content) {
    descText = _adfToText(f.description).slice(0, 500);
  } else if (typeof f.description === 'string') {
    descText = f.description.slice(0, 500);
  }

  return {
    key: issue.key,
    id: issue.id,
    summary: f.summary || '',
    description: descText,
    status: f.status ? f.status.name : 'Unknown',
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.key : 'undefined',
    priority: f.priority ? f.priority.name : 'Medium',
    type: f.issuetype ? f.issuetype.name : 'Task',
    isSubtask: f.issuetype ? !!f.issuetype.subtask : false,
    assignee: f.assignee ? f.assignee.displayName : 'Unassigned',
    assigneeId: f.assignee ? f.assignee.accountId : null,
    reporter: f.reporter ? f.reporter.displayName : '',
    created: f.created || '',
    updated: f.updated || '',
    dueDate: f.duedate || null,
    resolution: f.resolution ? f.resolution.name : null,
    resolutionDate: f.resolutiondate || null,
    labels: f.labels || [],
    project: f.project ? f.project.key : '',
    projectName: f.project ? f.project.name : '',
    // Hierarchy
    parent: f.parent ? { key: f.parent.key, summary: (f.parent.fields || {}).summary || '', type: (f.parent.fields || {}).issuetype ? f.parent.fields.issuetype.name : '' } : null,
    subtasks: (f.subtasks || []).map(function(st) {
      return { key: st.key, summary: (st.fields || {}).summary || '', status: (st.fields || {}).status ? st.fields.status.name : '' };
    }),
    // Linked issues
    links: (f.issuelinks || []).map(function(l) {
      var linked = l.outwardIssue || l.inwardIssue;
      return {
        type: l.type ? l.type.name : '',
        direction: l.outwardIssue ? 'outward' : 'inward',
        directionLabel: l.outwardIssue ? (l.type ? l.type.outward : '') : (l.type ? l.type.inward : ''),
        key: linked ? linked.key : '',
        summary: linked && linked.fields ? (linked.fields.summary || '') : '',
        status: linked && linked.fields && linked.fields.status ? linked.fields.status.name : ''
      };
    }),
    // Estimation
    storyPoints: f[CF.STORY_POINTS] || f[CF.STORY_POINT_ESTIMATE] || null,
    timeTracking: f.timetracking ? {
      originalEstimate: f.timetracking.originalEstimate || null,
      remainingEstimate: f.timetracking.remainingEstimate || null,
      timeSpent: f.timetracking.timeSpent || null
    } : null,
    // Sprint
    sprint: activeSprint ? { id: activeSprint.id, name: activeSprint.name, state: activeSprint.state, goal: activeSprint.goal || '', endDate: activeSprint.endDate || null } : null,
    // Components & versions
    components: (f.components || []).map(function(c) { return c.name; }),
    fixVersions: (f.fixVersions || []).map(function(v) { return { name: v.name, released: v.released, releaseDate: v.releaseDate || null }; }),
    // Comments count
    commentCount: f.comment ? (f.comment.total || f.comment.comments ? f.comment.comments.length : 0) : 0,
    // Flags
    flagged: !!(f[CF.FLAGGED] && f[CF.FLAGGED].length),
    // URL
    url: (baseUrl || '') + '/browse/' + issue.key
  };
}

// Simple ADF to plain text
function _adfToText(adf) {
  if (!adf || !adf.content) return '';
  var text = '';
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(function(node) {
      if (node.type === 'text') text += node.text || '';
      if (node.type === 'hardBreak') text += '\n';
      if (node.content) walk(node.content);
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') text += '\n';
    });
  }
  walk(adf.content);
  return text.trim();
}

// ─── Rich Search ─────────────────────────────────────────────

var RICH_FIELDS = ['summary', 'status', 'priority', 'assignee', 'reporter', 'updated', 'created',
  'issuetype', 'labels', 'project', 'parent', 'subtasks', 'issuelinks', 'components',
  'fixVersions', 'duedate', 'resolution', 'resolutiondate', 'timetracking', 'comment',
  'description', CF.STORY_POINTS, CF.SPRINT, CF.FLAGGED, CF.STORY_POINT_ESTIMATE];

function searchIssues(ctx, jql, maxResults, skipProjectScope) {
  var fullJql;
  if (skipProjectScope) {
    fullJql = jql;
  } else {
    var project = (ctx.atlassian || {}).jiraProject || 'BEANZ';
    fullJql = 'project = ' + project + ' AND (' + jql + ')';
  }
  return jiraRequest(ctx, '/rest/api/3/search/jql', {
    jql: fullJql,
    maxResults: maxResults || 50,
    fields: RICH_FIELDS
  });
}

function searchIssuesRich(ctx, jql, maxResults, skipProjectScope) {
  var baseUrl = (ctx.atlassian || {}).baseUrl || '';
  return searchIssues(ctx, jql, maxResults, skipProjectScope)
    .then(function(resp) { return (resp.issues || []).map(function(i) { return formatIssueRich(i, baseUrl); }); });
}

// ─── Sprint APIs ─────────────────────────────────────────────

function getBoards(ctx, projectKey) {
  var path = '/rest/agile/1.0/board?maxResults=50';
  if (projectKey) path += '&projectKeyOrId=' + projectKey;
  return cachedFetch('boards-' + (projectKey || 'all'), CACHE_TTL, function() {
    return jiraRequest(ctx, path).then(function(resp) {
      return (resp.values || []).map(function(b) {
        return {
          id: b.id, name: b.name, type: b.type,
          projectKey: b.location ? b.location.projectKey : null,
          projectName: b.location ? b.location.displayName : null
        };
      });
    });
  });
}

function getActiveSprints(ctx, boardId) {
  return cachedFetch('sprints-active-' + boardId, CACHE_TTL, function() {
    return jiraRequest(ctx, '/rest/agile/1.0/board/' + boardId + '/sprint?state=active')
      .then(function(resp) {
        return (resp.values || []).map(function(s) {
          return {
            id: s.id, name: s.name, state: s.state,
            goal: s.goal || '', startDate: s.startDate || null,
            endDate: s.endDate || null, completeDate: s.completeDate || null,
            boardId: boardId
          };
        });
      });
  });
}

function getSprintIssues(ctx, sprintId) {
  var baseUrl = (ctx.atlassian || {}).baseUrl || '';
  return cachedFetch('sprint-issues-' + sprintId, CACHE_TTL, function() {
    return jiraRequest(ctx, '/rest/agile/1.0/sprint/' + sprintId + '/issue?maxResults=100&fields=' + RICH_FIELDS.join(','))
      .then(function(resp) {
        return (resp.issues || []).map(function(i) { return formatIssueRich(i, baseUrl); });
      });
  });
}

function getClosedSprints(ctx, boardId, count) {
  return cachedFetch('sprints-closed-' + boardId, CACHE_TTL, function() {
    return jiraRequest(ctx, '/rest/agile/1.0/board/' + boardId + '/sprint?state=closed&maxResults=' + (count || 5))
      .then(function(resp) {
        return (resp.values || []).sort(function(a, b) { return new Date(b.completeDate || 0) - new Date(a.completeDate || 0); });
      });
  });
}

// ─── Comprehensive Project Dashboard ─────────────────────────

async function getFullProjectDashboard(ctx) {
  var baseUrl = (ctx.atlassian || {}).baseUrl || '';

  // Parallel: all open issues, epics, active sprints, overdue, recently resolved
  var results = await Promise.allSettled([
    searchIssuesRich(ctx, 'resolution = Unresolved ORDER BY priority DESC, updated DESC', 100, true),
    searchIssuesRich(ctx, 'issuetype in (Epic, Initiative) AND resolution = Unresolved ORDER BY updated DESC', 100, true),
    _getAllActiveSprints(ctx),
    searchIssuesRich(ctx, 'duedate < now() AND resolution = Unresolved ORDER BY duedate ASC', 30, true),
    searchIssuesRich(ctx, 'resolved >= -14d ORDER BY resolved DESC', 50, true),
    _getIssueCount(ctx, 'resolution = Unresolved'),
    _getIssueCount(ctx, 'resolved >= -7d'),
    _getIssueCount(ctx, 'created >= -7d')
  ]);

  var openIssues = results[0].status === 'fulfilled' ? results[0].value : [];
  var epics = results[1].status === 'fulfilled' ? results[1].value : [];
  var sprints = results[2].status === 'fulfilled' ? results[2].value : [];
  var overdue = results[3].status === 'fulfilled' ? results[3].value : [];
  var recentlyResolved = results[4].status === 'fulfilled' ? results[4].value : [];
  var totalOpen = results[5].status === 'fulfilled' ? results[5].value : openIssues.length;
  var resolvedThisWeek = results[6].status === 'fulfilled' ? results[6].value : 0;
  var createdThisWeek = results[7].status === 'fulfilled' ? results[7].value : 0;

  // Group open issues by Jira project
  var byProject = {};
  openIssues.forEach(function(i) {
    var pk = i.project || 'Unknown';
    if (!byProject[pk]) byProject[pk] = { key: pk, name: i.projectName || pk, issues: [], statusBreakdown: {}, typeBreakdown: {}, assigneeBreakdown: {} };
    byProject[pk].issues.push(i);
    var s = i.status; byProject[pk].statusBreakdown[s] = (byProject[pk].statusBreakdown[s] || 0) + 1;
    var t = i.type; byProject[pk].typeBreakdown[t] = (byProject[pk].typeBreakdown[t] || 0) + 1;
    var a = i.assignee; byProject[pk].assigneeBreakdown[a] = (byProject[pk].assigneeBreakdown[a] || 0) + 1;
  });
  var projects = Object.values(byProject).sort(function(a, b) { return b.issues.length - a.issues.length; });

  // Blockers (high priority unresolved)
  var blockers = openIssues.filter(function(i) {
    return i.priority === 'Highest' || i.priority === 'High' || i.status === 'Blocked' || i.flagged;
  });

  // Sprint summaries with issue counts
  var sprintSummaries = [];
  for (var si = 0; si < sprints.length; si++) {
    var sp = sprints[si];
    var sprintIssues = openIssues.filter(function(i) { return i.sprint && i.sprint.id === sp.id; });
    var doneCount = 0; var totalPoints = 0; var donePoints = 0;
    sprintIssues.forEach(function(i) {
      if (i.statusCategory === 'done') doneCount++;
      var pts = i.storyPoints || 0;
      totalPoints += pts;
      if (i.statusCategory === 'done') donePoints += pts;
    });
    sprintSummaries.push({
      id: sp.id, name: sp.name, goal: sp.goal, endDate: sp.endDate, boardId: sp.boardId,
      issueCount: sprintIssues.length, doneCount: doneCount,
      totalPoints: totalPoints, donePoints: donePoints,
      daysRemaining: sp.endDate ? Math.max(0, Math.ceil((new Date(sp.endDate) - Date.now()) / 86400000)) : null
    });
  }

  return {
    summary: {
      totalOpen: totalOpen,
      createdThisWeek: createdThisWeek,
      resolvedThisWeek: resolvedThisWeek,
      blockerCount: blockers.length,
      overdueCount: overdue.length,
      epicCount: epics.length,
      sprintCount: sprints.length
    },
    blockers: blockers,
    overdue: overdue,
    epics: epics,
    sprints: sprintSummaries,
    recentlyResolved: recentlyResolved.slice(0, 20),
    byProject: projects,
    allOpen: openIssues,
    error: null
  };
}

async function _getAllActiveSprints(ctx) {
  // Get boards, then active sprints for each
  var boards = await getBoards(ctx);
  var allSprints = [];
  var seen = new Set();
  for (var bi = 0; bi < boards.length; bi++) {
    try {
      var sprints = await getActiveSprints(ctx, boards[bi].id);
      sprints.forEach(function(s) {
        if (!seen.has(s.id)) { seen.add(s.id); s.boardName = boards[bi].name; allSprints.push(s); }
      });
    } catch { /* skip board */ }
    // Rate limit protection
    if (bi > 0 && bi % 5 === 0) await new Promise(function(r) { setTimeout(r, 500); });
  }
  return allSprints;
}

async function _getIssueCount(ctx, jql) {
  try {
    var resp = await jiraRequest(ctx, '/rest/api/3/search/jql/count', { jql: jql });
    return resp.count || 0;
  } catch { return 0; }
}

// ─── Legacy compat exports ───────────────────────────────────

function getRecentActivity(ctx, days) {
  days = days || 7;
  return cachedFetch('jira-recent-' + days, CACHE_TTL, function() {
    return searchIssuesRich(ctx, 'updated >= -' + days + 'd ORDER BY updated DESC', 30);
  });
}

function getBlockers(ctx) {
  return cachedFetch('jira-blockers', CACHE_TTL, function() {
    return searchIssuesRich(ctx, '(status = Blocked OR priority in (Highest, High)) AND resolution = Unresolved ORDER BY priority DESC', 20);
  });
}

module.exports = {
  jiraRequest, searchIssues, searchIssuesRich,
  getRecentActivity, getBlockers, getIssueDetail,
  getBoards, getActiveSprints, getSprintIssues, getClosedSprints,
  getFullProjectDashboard,
  _getAllActiveSprints, _getIssueCount,
  CF, RICH_FIELDS, formatIssueRich
};
