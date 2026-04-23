// Email thread → project linker. Mirrors Slack ingestor.

const fs = require('fs');
const path = require('path');
const { scoreCandidate } = require('./matcher');
const store = require('../project-store');
const { getDb } = require('../db');

const MIN_RELEVANCE = 0.45;

function _readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function _peopleDir(ctx) {
  return _readJson(path.join(ctx.intelDir, 'team-directory.json')) || {};
}

function _classifierTagsFor(threadId) {
  try {
    const row = getDb().prepare(
      `SELECT project_tags FROM ai_classifications WHERE thread_id = ?`
    ).get(threadId);
    if (!row || !row.project_tags) return null;
    try { return JSON.parse(row.project_tags); } catch { return null; }
  } catch { return null; }
}

async function ingestEmail(ctx, projects) {
  const emailPath = path.join(ctx.intelDir, 'email-live.json');
  const live = _readJson(emailPath);
  if (!live) return { source_type: 'email', upserted: 0, skipped: 0, reason: 'no_data' };

  // Could be shape { threads: {...} } or { emails: [...] }
  const threadsMap = live.threads || {};
  const peopleDirectory = _peopleDir(ctx);
  let upserted = 0;
  let skipped = 0;
  const ids = Object.keys(threadsMap);

  for (const threadId of ids) {
    const t = threadsMap[threadId];
    if (!t) continue;
    if (Array.isArray(t.sources) && !t.sources.includes('email')) continue;

    const subject = t.subject || '';
    const firstMsg = Array.isArray(t.messages) && t.messages.length ? (t.messages[0].text || t.messages[0].bodyPreview || '') : '';
    const body = (t.preview || '') + ' ' + (firstMsg || '').slice(0, 800);
    const participants = t.people || [];
    const classifierProjectTags = _classifierTagsFor(threadId);

    for (const project of projects) {
      const { score, method } = scoreCandidate({
        project, subject, body, participants, peopleDirectory, classifierProjectTags
      });
      if (score < MIN_RELEVANCE) { skipped++; continue; }

      store.upsertSource(project.id, {
        source_type: 'email',
        source_id: threadId,
        title: subject,
        url: null,
        relevance: score,
        link_method: method
      });
      upserted++;
    }
  }

  return { source_type: 'email', upserted, skipped, thread_count: ids.length };
}

module.exports = { ingestEmail };
