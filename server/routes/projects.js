const path = require('path');
const { jsonReply, readJSON } = require('../lib/helpers');
const { getRecentActivity, getBlockers } = require('../lib/jira-api');
const { getRecentPages } = require('../lib/confluence-api');

module.exports = async function handleProjects(req, res, parts, url, ctx) {
  // GET /api/projects/enriched — projects with Jira + Confluence data
  if (parts[1] === 'enriched' && req.method === 'GET') {
    const baseProjects = readJSON(path.join(ctx.intelDir, 'project-updates.json'));
    const result = {
      projects: baseProjects || {},
      jira: { recent: [], blockers: [], error: null },
      confluence: { pages: [], error: null },
      lastSynced: new Date().toISOString()
    };

    // Enrich with Jira data (graceful fallback if not configured)
    try {
      const [recent, blockers] = await Promise.all([
        getRecentActivity(ctx, 7),
        getBlockers(ctx)
      ]);
      result.jira.recent = recent;
      result.jira.blockers = blockers;
    } catch (e) {
      result.jira.error = e.message;
    }

    // Enrich with Confluence data
    try {
      result.confluence.pages = await getRecentPages(ctx);
    } catch (e) {
      result.confluence.error = e.message;
    }

    return jsonReply(res, 200, result);
  }

  return jsonReply(res, 404, { error: 'Unknown projects endpoint' });
};
