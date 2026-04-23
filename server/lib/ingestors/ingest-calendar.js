// Calendar event → project linker. Reads calendar-live.json.

const fs = require('fs');
const path = require('path');
const { scoreCandidate } = require('./matcher');
const store = require('../project-store');

function _readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function _peopleDir(ctx) {
  return _readJson(path.join(ctx.intelDir, 'team-directory.json')) || {};
}

async function ingestCalendar(ctx, projects) {
  const p = path.join(ctx.intelDir, 'calendar-live.json');
  const live = _readJson(p);
  if (!live || !Array.isArray(live.events)) {
    return { source_type: 'calendar', upserted: 0, skipped: 0, reason: 'no_data' };
  }

  const peopleDirectory = _peopleDir(ctx);
  let upserted = 0;
  let skipped = 0;

  for (const ev of live.events) {
    const subject = ev.subject || ev.title || '';
    const body = (ev.bodyPreview || ev.body || '').slice(0, 400);
    const participants = (ev.attendees || []).map(a => a.name || a.emailAddress || a);
    if (ev.organizer) participants.push(ev.organizer.name || ev.organizer);

    for (const project of projects) {
      const { score, method } = scoreCandidate({ project, subject, body, participants, peopleDirectory });
      if (score < 0.45) { skipped++; continue; }

      store.upsertSource(project.id, {
        source_type: 'calendar',
        source_id: String(ev.id || ev.iCalUId || `${subject}_${ev.start || ''}`),
        title: subject,
        url: ev.webLink || null,
        relevance: score,
        link_method: method
      });
      upserted++;
    }
  }

  return { source_type: 'calendar', upserted, skipped, event_count: live.events.length };
}

module.exports = { ingestCalendar };
