// Project source ingestor — runs all per-source ingestors in series and
// populates project_sources. Safe to call on every refresh tick.

const store = require('./project-store');
const { ingestSlack } = require('./ingestors/ingest-slack');
const { ingestEmail } = require('./ingestors/ingest-email');
const { ingestJira } = require('./ingestors/ingest-jira');
const { ingestConfluence } = require('./ingestors/ingest-confluence');
const { ingestCalendar } = require('./ingestors/ingest-calendar');

let _running = false;
let _lastRun = null;

async function runAllIngestors(ctx, opts = {}) {
  if (_running && !opts.force) return { skipped: true, reason: 'already_running' };
  _running = true;
  const started = Date.now();
  const projects = store.listProjects();

  const results = [];
  for (const fn of [ingestSlack, ingestEmail, ingestJira, ingestCalendar, ingestConfluence]) {
    try {
      const r = await fn(ctx, projects);
      results.push(r);
    } catch (e) {
      results.push({ error: e.message, fn: fn.name });
    }
  }

  _running = false;
  _lastRun = {
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    results
  };
  return _lastRun;
}

function getLastRun() { return _lastRun; }

function startScheduler(ctx, opts = {}) {
  const interval = opts.intervalMs || (15 * 60 * 1000); // 15 minutes
  // First run 60s after boot (let other refreshers populate)
  setTimeout(() => {
    runAllIngestors(ctx).catch(e => console.error('[ProjectIngest] Initial run failed:', e.message));
  }, 60 * 1000);
  setInterval(() => {
    runAllIngestors(ctx).catch(e => console.error('[ProjectIngest] Scheduled run failed:', e.message));
  }, interval);
  console.log(`[ProjectIngest] Scheduler started — interval: ${Math.round(interval/60000)}min`);
}

module.exports = { runAllIngestors, getLastRun, startScheduler };
