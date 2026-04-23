// Project scheduler — fires daily synthesis at configured hour in local time.
// Uses setTimeout chain (not cron) to avoid new deps, mirrors other schedulers.

const { synthesizeAll } = require('./project-synthesis');
const { runAllIngestors } = require('./project-source-ingestor');
const { discoverCandidates } = require('./project-discovery');

function _msUntilNext(hour = 7, minute = 0) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function startProjectScheduler(ctx, opts = {}) {
  const synthesisHour = opts.synthesisHour ?? 7;
  const synthesisMinute = opts.synthesisMinute ?? 0;
  const skipWeekends = !!opts.skipWeekends;

  async function tick() {
    const day = new Date().getDay();
    if (skipWeekends && (day === 0 || day === 6)) {
      console.log('[ProjectSynth] Skipped (weekend)');
    } else {
      try {
        // Always refresh sources first, then synthesize
        console.log('[ProjectSynth] Running pre-synthesis ingestion');
        await runAllIngestors(ctx, { force: true });
        const r = await synthesizeAll(ctx, { concurrency: 2 });
        console.log(`[ProjectSynth] Synthesized ${r.count} projects:`, r.results.map(x => `${x.id}:${x.mode || 'err'}`).join(' '));
        try {
          const d = await discoverCandidates(ctx);
          if (d.created > 0) console.log(`[ProjectDiscovery] Created ${d.created} candidate projects`);
        } catch (e) { console.error('[ProjectDiscovery] failed:', e.message); }
      } catch (e) {
        console.error('[ProjectSynth] tick failed:', e.message);
      }
    }
    // schedule next
    const ms = _msUntilNext(synthesisHour, synthesisMinute);
    setTimeout(tick, ms);
  }

  const ms = _msUntilNext(synthesisHour, synthesisMinute);
  const hrs = (ms / 1000 / 60 / 60).toFixed(1);
  console.log(`[ProjectSynth] Scheduler started — next synthesis at ${synthesisHour}:${String(synthesisMinute).padStart(2,'0')} (in ${hrs}h)`);
  setTimeout(tick, ms);
}

module.exports = { startProjectScheduler };
