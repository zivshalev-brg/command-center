// Jira issue → project linker.
// Reads jira-live.json snapshot and optionally calls jira-api if project has jira_jql.

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

async function ingestJira(ctx, projects) {
  const jiraPath = path.join(ctx.intelDir, 'jira-live.json');
  const live = _readJson(jiraPath) || {};

  const peopleDirectory = _peopleDir(ctx);
  let upserted = 0;
  let skipped = 0;

  // Collate all Jira items (issues) we have from the snapshot
  const items = [];
  const seen = new Set();
  const push = (src, issue) => {
    if (!issue || !issue.key) return;
    if (seen.has(issue.key)) return;
    seen.add(issue.key);
    items.push({ src, ...issue });
  };
  (live.openIssues || []).forEach(i => push('open', i));
  (live.overdue || []).forEach(i => push('overdue', i));
  (live.allEpics || []).forEach(i => push('epic', i));
  (live.recentMovements || []).forEach(i => push('movement', i));
  (live.blockers || []).forEach(i => push('blocker', i));
  (live.epicProgress || []).forEach(e => {
    if (e && e.epic) push('epic', e.epic);
    (e.issues || []).forEach(i => push('epic_issue', i));
  });
  (live.sprints || []).forEach(s => (s.issues || []).forEach(i => push('sprint', i)));

  for (const item of items) {
    const subject = item.summary || item.title || '';
    const body = (item.description || '') + ' ' + (item.labels || []).join(' ');
    const participants = [item.assignee, item.reporter].filter(Boolean);

    for (const project of projects) {
      // Project-specific epic pin: auto-match regardless of score
      if (project.jira_epic_key && item.epicKey === project.jira_epic_key) {
        store.upsertSource(project.id, {
          source_type: 'jira',
          source_id: item.key,
          title: subject,
          url: item.url || null,
          relevance: 0.95,
          link_method: 'epic_pin'
        });
        upserted++;
        continue;
      }

      const { score, method } = scoreCandidate({
        project, subject, body, participants, peopleDirectory
      });
      if (score < 0.45) { skipped++; continue; }

      store.upsertSource(project.id, {
        source_type: 'jira',
        source_id: item.key,
        title: subject,
        url: item.url || null,
        relevance: score,
        link_method: method
      });
      upserted++;
    }
  }

  return { source_type: 'jira', upserted, skipped, item_count: items.length };
}

module.exports = { ingestJira };
