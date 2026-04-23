// Project seeding — runs once on first boot when `projects` table is empty.

const { getDb } = require('./db');
const store = require('./project-store');
const seedData = require('../seed/projects-seed');

function isEmpty() {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM projects').get();
  return !row || row.n === 0;
}

function seedOnce(opts = {}) {
  if (!opts.force && !isEmpty()) {
    return { seeded: false, reason: 'projects table not empty' };
  }
  const projects = seedData.projects || {};
  const ids = Object.keys(projects);
  const created = [];

  for (const id of ids) {
    const p = projects[id];
    const existing = store.getProject(id);
    if (existing && !opts.force) continue;

    if (existing && opts.force) store.deleteProject(id);

    store.createProject({
      id,
      title: p.title,
      status: p.status || 'active',
      rag: p.rag || 'green',
      priority: p.priority ?? 50,
      owner_id: p.owner_id || null,
      team: p.team || null,
      colour: p.colour || 'var(--ac)',
      description: p.description || null,
      start_date: p.start_date || null,
      target_date: p.target_date || null,
      progress: p.progress ?? 0,
      classifier_tags: p.classifier_tags || [],
      aliases: p.aliases || [],
      people_ids: p.people_ids || [],
      strategy_correlation_ids: p.strategy_correlation_ids || [],
      metric_keys: p.metric_keys || [],
      news_keywords: p.news_keywords || [],
      source: 'seed'
    });

    for (const m of p.milestones || []) store.addMilestone(id, m);
    for (const a of p.actions || []) store.addAction(id, a);
    for (const b of p.blockers || []) store.addBlocker(id, b);

    created.push(id);
  }

  return { seeded: true, count: created.length, ids: created };
}

module.exports = { seedOnce, isEmpty };
