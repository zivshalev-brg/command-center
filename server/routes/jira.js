const { jsonReply } = require('../lib/helpers');
const { getRecentActivity, getBlockers, getSprintIssues, getIssueDetail } = require('../lib/jira-api');
const { getRecentPages, searchContent } = require('../lib/confluence-api');

async function handleJira(req, res, parts, url, ctx) {
  // GET /api/jira/recent — recent activity
  if (parts[1] === 'recent' && req.method === 'GET') {
    try {
      const days = parseInt(url.searchParams.get('days')) || 7;
      const issues = await getRecentActivity(ctx, days);
      return jsonReply(res, 200, { issues, project: ctx.atlassian?.jiraProject });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // GET /api/jira/blockers — active blockers
  if (parts[1] === 'blockers' && req.method === 'GET') {
    try {
      const issues = await getBlockers(ctx);
      return jsonReply(res, 200, { issues });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // GET /api/jira/sprint — current sprint
  if (parts[1] === 'sprint' && req.method === 'GET') {
    try {
      const issues = await getSprintIssues(ctx);
      return jsonReply(res, 200, { issues });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // GET /api/jira/issue/:key — full issue detail
  if (parts[1] === 'issue' && parts[2] && req.method === 'GET') {
    try {
      var detail = await getIssueDetail(ctx, parts[2]);
      return jsonReply(res, 200, detail);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to fetch issue: ' + e.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown jira endpoint' });
}

async function handleConfluence(req, res, parts, url, ctx) {
  // GET /api/confluence/recent — recent pages
  if (parts[1] === 'recent' && req.method === 'GET') {
    try {
      const pages = await getRecentPages(ctx);
      return jsonReply(res, 200, { pages, space: ctx.atlassian?.confluenceSpace });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // GET /api/confluence/search?q=... — search
  if (parts[1] === 'search' && req.method === 'GET') {
    try {
      const q = url.searchParams.get('q') || '';
      if (!q) return jsonReply(res, 400, { error: 'q parameter required' });
      const pages = await searchContent(ctx, q);
      return jsonReply(res, 200, { pages });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown confluence endpoint' });
}

module.exports = { handleJira, handleConfluence };
