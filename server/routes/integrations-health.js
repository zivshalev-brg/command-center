// GET /api/integrations/health — reports the state of each external integration
// so the UI can surface missing credentials or stale refreshes at a glance.

const fs = require('fs');
const path = require('path');
const { jsonReply } = require('../lib/helpers');
const { getLastRun: getIngestorLastRun } = require('../lib/project-source-ingestor');

function _statMtime(p) {
  try { return fs.statSync(p).mtime.toISOString(); } catch { return null; }
}

function _readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function _mask(v) {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return v.slice(0, 4) + '***' + v.slice(-2);
}

module.exports = async function handleIntegrationsHealth(req, res, parts, url, ctx) {
  if (req.method !== 'GET') return jsonReply(res, 405, { error: 'GET only' });

  const intelDir = ctx.intelDir;
  const jiraLivePath = path.join(intelDir, 'jira-live.json');
  const commsLivePath = path.join(intelDir, 'comms-live.json');
  const emailLivePath = path.join(intelDir, 'email-live.json');
  const calLivePath = path.join(intelDir, 'calendar-live.json');

  const jiraLive = _readJson(jiraLivePath) || {};
  const jiraMtime = _statMtime(jiraLivePath);
  const ingestor = getIngestorLastRun();

  const atl = ctx.atlassian || {};
  const jiraConfigured = !!(atl.email && atl.token && atl.baseUrl);
  const confluenceConfigured = jiraConfigured; // same creds

  const jiraSprintsErr = jiraLive.errors && jiraLive.errors.sprints;
  const jiraMovementsErr = jiraLive.errors && jiraLive.errors.recent;
  const jiraBlockersErr = jiraLive.errors && jiraLive.errors.blockers;

  // Determine Jira health state
  let jiraState = 'unknown';
  const anyJiraData = ((jiraLive.sprints || []).length +
                      (jiraLive.recentMovements || []).length +
                      (jiraLive.blockers || []).length) > 0;
  if (!jiraConfigured) jiraState = 'not_configured';
  else if (jiraSprintsErr || jiraMovementsErr || jiraBlockersErr) jiraState = 'error';
  else if (anyJiraData) jiraState = 'healthy';
  else jiraState = 'empty';

  const payload = {
    generated_at: new Date().toISOString(),
    jira: {
      configured: jiraConfigured,
      state: jiraState,
      base_url: atl.baseUrl || null,
      email_masked: _mask(atl.email),
      last_refresh_at: jiraLive.generated_at || jiraMtime,
      snapshot_file_mtime: jiraMtime,
      sprints_count: (jiraLive.sprints || []).length,
      movements_count: (jiraLive.recentMovements || []).length,
      blockers_count: (jiraLive.blockers || []).length,
      epic_count: (jiraLive.epicProgress || []).length,
      errors: jiraLive.errors || {},
      setup_hint: jiraConfigured ? null : 'Set ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_BASE_URL in .env'
    },
    confluence: {
      configured: confluenceConfigured,
      state: confluenceConfigured ? 'configured' : 'not_configured',
      base_url: atl.baseUrl || null,
      setup_hint: confluenceConfigured ? null : 'Set ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_BASE_URL in .env'
    },
    slack: {
      configured: !!ctx.slackReadToken,
      last_live_at: _statMtime(commsLivePath)
    },
    outlook: {
      configured: !!(ctx.msGraph && ctx.msGraph.clientId),
      last_live_at: _statMtime(emailLivePath)
    },
    calendar: {
      configured: !!(ctx.msGraph && ctx.msGraph.clientId),
      last_live_at: _statMtime(calLivePath)
    },
    project_ingestor: {
      last_run_at: ingestor ? ingestor.finished_at : null,
      duration_ms: ingestor ? ingestor.duration_ms : null,
      results: ingestor ? ingestor.results : null
    },
    kb_index: (function() {
      try {
        const { getIndexStats, buildIndex } = require('../lib/kb-index');
        let stats = getIndexStats();
        if (!stats.built) { buildIndex(ctx); stats = getIndexStats(); }
        return stats;
      } catch (e) { return { built: false, error: e.message }; }
    })()
  };

  return jsonReply(res, 200, payload);
};
