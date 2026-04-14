/**
 * project-intelligence.js — Route handler for project intelligence endpoints.
 * GET /api/projects/intelligence — overview for all projects (fast, cached)
 * GET /api/projects/intelligence/jira — all Jira activity across all projects
 * GET /api/projects/intelligence/:projectId — full detail for one project
 */
'use strict';

const { jsonReply, readBody } = require('../lib/helpers');
const {
  aggregateProjectIntelligence,
  synthesizeProjectHealth,
  getProjectsOverview,
  getAllJiraActivity,
  PROJECT_DATA_MAP
} = require('../lib/project-intelligence');

module.exports = async function handleProjectIntelligence(req, res, parts, url, ctx) {
  var projectId = parts[2] || null;

  // GET /api/projects/intelligence — overview for all projects
  if (!projectId) {
    try {
      var overview = getProjectsOverview(ctx);
      return jsonReply(res, 200, { projects: overview });
    } catch (e) {
      console.error('[ProjectIntel] Overview error:', e.message);
      return jsonReply(res, 500, { error: 'Failed to load project overview: ' + e.message });
    }
  }

  // GET /api/projects/intelligence/jira — all Jira activity
  if (projectId === 'jira') {
    try {
      var jiraAll = await getAllJiraActivity(ctx);
      return jsonReply(res, 200, jiraAll);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Jira fetch failed: ' + e.message });
    }
  }

  // GET /api/projects/intelligence/:projectId — full detail
  if (!PROJECT_DATA_MAP[projectId]) {
    return jsonReply(res, 404, { error: 'Unknown project: ' + projectId });
  }

  try {
    var aggregated = await aggregateProjectIntelligence(ctx, projectId);
    if (!aggregated) {
      return jsonReply(res, 404, { error: 'No data for project: ' + projectId });
    }

    // Optional AI synthesis
    var synthesis = null;
    var doSynthesize = url.searchParams.get('synthesize') === '1';
    if (doSynthesize && ctx.anthropicApiKey) {
      synthesis = await synthesizeProjectHealth(ctx.anthropicApiKey, projectId, aggregated);
    }

    return jsonReply(res, 200, {
      project: aggregated,
      synthesis: synthesis,
      cached: !doSynthesize
    });
  } catch (e) {
    console.error('[ProjectIntel] Detail error for ' + projectId + ':', e.message);
    return jsonReply(res, 500, { error: 'Failed to load project intelligence: ' + e.message });
  }
};
