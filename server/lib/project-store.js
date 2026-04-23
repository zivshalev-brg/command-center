// Project Store — repository for projects and their sub-resources.
// Immutable return types: never mutate rows; always return fresh objects.

const { getDb } = require('./db');

const JSON_FIELDS = [
  'classifier_tags', 'aliases', 'people_ids',
  'strategy_correlation_ids', 'metric_keys', 'news_keywords',
  'backfill_counts', 'backfill_errors'
];
// Object-shaped JSON fields (default null instead of [])
const JSON_OBJECT_FIELDS = ['brief'];

function encodeJsonFields(obj) {
  const out = { ...obj };
  for (const k of JSON_FIELDS.concat(JSON_OBJECT_FIELDS)) {
    if (out[k] !== undefined && out[k] !== null && typeof out[k] !== 'string') {
      out[k] = JSON.stringify(out[k]);
    }
  }
  return out;
}

function decodeJsonFields(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of JSON_FIELDS) {
    if (typeof out[k] === 'string' && out[k].length) {
      try { out[k] = JSON.parse(out[k]); }
      catch { out[k] = []; }
    } else if (out[k] == null) {
      out[k] = [];
    }
  }
  for (const k of JSON_OBJECT_FIELDS) {
    if (typeof out[k] === 'string' && out[k].length) {
      try { out[k] = JSON.parse(out[k]); }
      catch { out[k] = null; }
    }
  }
  return out;
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project-' + Date.now().toString(36);
}

// ─── Projects CRUD ─────────────────────────────────────────────

function listProjects(filters = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};
  if (filters.status) { clauses.push('status = @status'); params.status = filters.status; }
  if (!filters.includeArchived) clauses.push("status != 'archived'");
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(
    `SELECT * FROM projects ${where} ORDER BY priority DESC, updated_at DESC`
  ).all(params);
  return rows.map(decodeJsonFields);
}

function getProject(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  return row ? decodeJsonFields(row) : null;
}

function createProject(data = {}) {
  const db = getDb();
  const id = data.id || slugify(data.title);
  const now = new Date().toISOString();
  const encoded = encodeJsonFields(data);

  db.prepare(`
    INSERT INTO projects (
      id, title, status, rag, priority, owner_id, team, colour, description,
      start_date, target_date, progress, classifier_tags, aliases, jira_jql,
      jira_epic_key, confluence_space, kb_path, strategy_correlation_ids,
      metric_keys, news_keywords, people_ids, source, auto_discovery_confidence,
      created_at, updated_at
    ) VALUES (
      @id, @title, @status, @rag, @priority, @owner_id, @team, @colour, @description,
      @start_date, @target_date, @progress, @classifier_tags, @aliases, @jira_jql,
      @jira_epic_key, @confluence_space, @kb_path, @strategy_correlation_ids,
      @metric_keys, @news_keywords, @people_ids, @source, @auto_discovery_confidence,
      @created_at, @updated_at
    )
  `).run({
    id,
    title: encoded.title || 'Untitled Project',
    status: encoded.status || 'active',
    rag: encoded.rag || 'green',
    priority: encoded.priority ?? 50,
    owner_id: encoded.owner_id || null,
    team: encoded.team || null,
    colour: encoded.colour || 'var(--ac)',
    description: encoded.description || null,
    start_date: encoded.start_date || null,
    target_date: encoded.target_date || null,
    progress: encoded.progress ?? 0,
    classifier_tags: encoded.classifier_tags || '[]',
    aliases: encoded.aliases || '[]',
    jira_jql: encoded.jira_jql || null,
    jira_epic_key: encoded.jira_epic_key || null,
    confluence_space: encoded.confluence_space || null,
    kb_path: encoded.kb_path || null,
    strategy_correlation_ids: encoded.strategy_correlation_ids || '[]',
    metric_keys: encoded.metric_keys || '[]',
    news_keywords: encoded.news_keywords || '[]',
    people_ids: encoded.people_ids || '[]',
    source: encoded.source || 'manual',
    auto_discovery_confidence: encoded.auto_discovery_confidence ?? null,
    created_at: now,
    updated_at: now
  });

  return getProject(id);
}

function updateProject(id, patch = {}) {
  const db = getDb();
  const existing = getProject(id);
  if (!existing) return null;

  const merged = { ...existing, ...patch };
  const encoded = encodeJsonFields(merged);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects SET
      title = @title, status = @status, rag = @rag, priority = @priority,
      owner_id = @owner_id, team = @team, colour = @colour, description = @description,
      start_date = @start_date, target_date = @target_date, progress = @progress,
      classifier_tags = @classifier_tags, aliases = @aliases, jira_jql = @jira_jql,
      jira_epic_key = @jira_epic_key, confluence_space = @confluence_space,
      kb_path = @kb_path, strategy_correlation_ids = @strategy_correlation_ids,
      metric_keys = @metric_keys, news_keywords = @news_keywords, people_ids = @people_ids,
      source = @source, auto_discovery_confidence = @auto_discovery_confidence,
      archived_at = @archived_at,
      brief = @brief, context_profile = @context_profile, brief_generated_at = @brief_generated_at,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: encoded.title,
    status: encoded.status,
    rag: encoded.rag || 'green',
    priority: encoded.priority ?? 50,
    owner_id: encoded.owner_id || null,
    team: encoded.team || null,
    colour: encoded.colour || 'var(--ac)',
    description: encoded.description || null,
    start_date: encoded.start_date || null,
    target_date: encoded.target_date || null,
    progress: encoded.progress ?? 0,
    classifier_tags: encoded.classifier_tags || '[]',
    aliases: encoded.aliases || '[]',
    jira_jql: encoded.jira_jql || null,
    jira_epic_key: encoded.jira_epic_key || null,
    confluence_space: encoded.confluence_space || null,
    kb_path: encoded.kb_path || null,
    strategy_correlation_ids: encoded.strategy_correlation_ids || '[]',
    metric_keys: encoded.metric_keys || '[]',
    news_keywords: encoded.news_keywords || '[]',
    people_ids: encoded.people_ids || '[]',
    source: encoded.source || 'manual',
    auto_discovery_confidence: encoded.auto_discovery_confidence ?? null,
    archived_at: encoded.archived_at || null,
    brief: encoded.brief || null,
    context_profile: encoded.context_profile || null,
    brief_generated_at: encoded.brief_generated_at || null,
    updated_at: now
  });

  return getProject(id);
}

function archiveProject(id) {
  return updateProject(id, { status: 'archived', archived_at: new Date().toISOString() });
}

function setBackfillState(id, state, extras = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const fields = ['backfill_state = @state'];
  const params = { id, state };
  if (state === 'running' || extras.started_at) {
    fields.push('backfill_started_at = @started_at');
    params.started_at = extras.started_at || now;
  }
  if (state === 'complete' || state === 'error') {
    fields.push('backfill_completed_at = @completed_at');
    params.completed_at = now;
  }
  if (extras.counts !== undefined) {
    fields.push('backfill_counts = @counts');
    params.counts = typeof extras.counts === 'string' ? extras.counts : JSON.stringify(extras.counts);
  }
  if (extras.errors !== undefined) {
    fields.push('backfill_errors = @errors');
    params.errors = typeof extras.errors === 'string' ? extras.errors : JSON.stringify(extras.errors);
  }
  db.prepare(`UPDATE projects SET ${fields.join(', ')}, updated_at = @now WHERE id = @id`).run({ ...params, now });
  return getProject(id);
}

function deleteProject(id) {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ─── Milestones ────────────────────────────────────────────────

function listMilestones(projectId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order, COALESCE(due_date, '9999'), id`
  ).all(projectId);
}

function addMilestone(projectId, data = {}) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO project_milestones (project_id, title, state, due_date, sort_order, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    data.title || 'Untitled milestone',
    data.state || 'upcoming',
    data.due_date || null,
    data.sort_order ?? 0,
    data.source_url || null
  );
  return db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(result.lastInsertRowid);
}

function updateMilestone(id, patch = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  if (merged.state === 'done' && !merged.completed_at) {
    merged.completed_at = new Date().toISOString();
  }
  db.prepare(`
    UPDATE project_milestones SET
      title = @title, state = @state, due_date = @due_date,
      completed_at = @completed_at, sort_order = @sort_order, source_url = @source_url
    WHERE id = @id
  `).run({
    id,
    title: merged.title,
    state: merged.state,
    due_date: merged.due_date,
    completed_at: merged.completed_at,
    sort_order: merged.sort_order ?? 0,
    source_url: merged.source_url
  });
  return db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(id);
}

function deleteMilestone(id) {
  getDb().prepare('DELETE FROM project_milestones WHERE id = ?').run(id);
}

// ─── Actions ────────────────────────────────────────────────────

function listActions(projectId, opts = {}) {
  const db = getDb();
  const where = opts.includeDone ? '' : "AND status != 'done' AND status != 'dropped'";
  return db.prepare(
    `SELECT * FROM project_actions WHERE project_id = ? ${where} ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       COALESCE(due_date, '9999'), created_at DESC`
  ).all(projectId);
}

function addAction(projectId, data = {}) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO project_actions (
      project_id, text, owner_id, due_date, status, priority, origin, origin_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    data.text || 'Untitled action',
    data.owner_id || null,
    data.due_date || null,
    data.status || 'open',
    data.priority || 'normal',
    data.origin || 'manual',
    data.origin_ref || null
  );
  return db.prepare('SELECT * FROM project_actions WHERE id = ?').get(result.lastInsertRowid);
}

function updateAction(id, patch = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_actions WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  if (merged.status === 'done' && !merged.completed_at) {
    merged.completed_at = new Date().toISOString();
  }
  db.prepare(`
    UPDATE project_actions SET
      text = @text, owner_id = @owner_id, due_date = @due_date,
      status = @status, priority = @priority, completed_at = @completed_at
    WHERE id = @id
  `).run({
    id,
    text: merged.text,
    owner_id: merged.owner_id,
    due_date: merged.due_date,
    status: merged.status,
    priority: merged.priority,
    completed_at: merged.completed_at
  });
  return db.prepare('SELECT * FROM project_actions WHERE id = ?').get(id);
}

function deleteAction(id) {
  getDb().prepare('DELETE FROM project_actions WHERE id = ?').run(id);
}

// ─── Blockers ───────────────────────────────────────────────────

function listBlockers(projectId, opts = {}) {
  const db = getDb();
  const where = opts.includeResolved ? '' : 'AND resolved_at IS NULL';
  return db.prepare(
    `SELECT * FROM project_blockers WHERE project_id = ? ${where} ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       opened_at DESC`
  ).all(projectId);
}

function addBlocker(projectId, data = {}) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO project_blockers (project_id, text, owner_id, severity, origin, origin_ref)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    data.text || 'Untitled blocker',
    data.owner_id || null,
    data.severity || 'medium',
    data.origin || 'manual',
    data.origin_ref || null
  );
  return db.prepare('SELECT * FROM project_blockers WHERE id = ?').get(result.lastInsertRowid);
}

function updateBlocker(id, patch = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_blockers WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  if (merged.resolved_at === 'now') merged.resolved_at = new Date().toISOString();
  db.prepare(`
    UPDATE project_blockers SET
      text = @text, owner_id = @owner_id, severity = @severity, resolved_at = @resolved_at
    WHERE id = @id
  `).run({
    id,
    text: merged.text,
    owner_id: merged.owner_id,
    severity: merged.severity,
    resolved_at: merged.resolved_at
  });
  return db.prepare('SELECT * FROM project_blockers WHERE id = ?').get(id);
}

function deleteBlocker(id) {
  getDb().prepare('DELETE FROM project_blockers WHERE id = ?').run(id);
}

// ─── Sources ────────────────────────────────────────────────────

function upsertSource(projectId, source) {
  const db = getDb();
  db.prepare(`
    INSERT INTO project_sources (
      project_id, source_type, source_id, title, url, relevance, link_method, last_seen_at
    ) VALUES (@project_id, @source_type, @source_id, @title, @url, @relevance, @link_method, datetime('now'))
    ON CONFLICT(project_id, source_type, source_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      relevance = MAX(excluded.relevance, relevance),
      last_seen_at = datetime('now')
  `).run({
    project_id: projectId,
    source_type: source.source_type,
    source_id: String(source.source_id),
    title: source.title || null,
    url: source.url || null,
    relevance: source.relevance ?? 0.5,
    link_method: source.link_method || 'keyword'
  });
}

function listSources(projectId, opts = {}) {
  const db = getDb();
  const clauses = ['project_id = @project_id'];
  const params = { project_id: projectId };
  if (opts.sourceType) { clauses.push('source_type = @source_type'); params.source_type = opts.sourceType; }
  if (opts.sinceIso) { clauses.push('last_seen_at >= @since'); params.since = opts.sinceIso; }
  const limit = Math.min(opts.limit || 200, 500);
  return db.prepare(
    `SELECT * FROM project_sources WHERE ${clauses.join(' AND ')} ORDER BY last_seen_at DESC LIMIT ${limit}`
  ).all(params);
}

function countSourcesByType(projectId, sinceIso = null) {
  const db = getDb();
  const clauses = ['project_id = @project_id'];
  const params = { project_id: projectId };
  if (sinceIso) { clauses.push('last_seen_at >= @since'); params.since = sinceIso; }
  const rows = db.prepare(
    `SELECT source_type, COUNT(*) AS n FROM project_sources
     WHERE ${clauses.join(' AND ')} GROUP BY source_type`
  ).all(params);
  const out = { slack: 0, email: 0, jira: 0, confluence: 0, calendar: 0 };
  for (const r of rows) out[r.source_type] = r.n;
  return out;
}

// ─── Updates (daily synthesis) ─────────────────────────────────

function upsertUpdate(record) {
  const db = getDb();
  const payload = {
    project_id: record.project_id,
    date: record.date,
    summary: record.summary || null,
    what_moved: JSON.stringify(record.what_moved || []),
    decisions: JSON.stringify(record.decisions || []),
    new_blockers: JSON.stringify(record.new_blockers || []),
    milestones_touched: JSON.stringify(record.milestones_touched || []),
    recommended_actions: JSON.stringify(record.recommended_actions || []),
    health_score: record.health_score ?? null,
    rag_suggested: record.rag_suggested || null,
    momentum_delta: record.momentum_delta ?? null,
    source_artifacts: JSON.stringify(record.source_artifacts || []),
    sources_counts: JSON.stringify(record.sources_counts || {}),
    model_used: record.model_used || null,
    token_cost: record.token_cost ?? null
  };
  db.prepare(`
    INSERT INTO project_updates (
      project_id, date, summary, what_moved, decisions, new_blockers,
      milestones_touched, recommended_actions, health_score, rag_suggested,
      momentum_delta, source_artifacts, sources_counts, model_used, token_cost
    ) VALUES (
      @project_id, @date, @summary, @what_moved, @decisions, @new_blockers,
      @milestones_touched, @recommended_actions, @health_score, @rag_suggested,
      @momentum_delta, @source_artifacts, @sources_counts, @model_used, @token_cost
    )
    ON CONFLICT(project_id, date) DO UPDATE SET
      summary = excluded.summary,
      what_moved = excluded.what_moved,
      decisions = excluded.decisions,
      new_blockers = excluded.new_blockers,
      milestones_touched = excluded.milestones_touched,
      recommended_actions = excluded.recommended_actions,
      health_score = excluded.health_score,
      rag_suggested = excluded.rag_suggested,
      momentum_delta = excluded.momentum_delta,
      source_artifacts = excluded.source_artifacts,
      sources_counts = excluded.sources_counts,
      model_used = excluded.model_used,
      token_cost = excluded.token_cost,
      generated_at = datetime('now')
  `).run(payload);
  return getUpdate(record.project_id, record.date);
}

function decodeUpdate(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of ['what_moved', 'decisions', 'new_blockers', 'milestones_touched', 'recommended_actions', 'source_artifacts']) {
    try { out[k] = out[k] ? JSON.parse(out[k]) : []; } catch { out[k] = []; }
  }
  try { out.sources_counts = out.sources_counts ? JSON.parse(out.sources_counts) : {}; } catch { out.sources_counts = {}; }
  return out;
}

function getUpdate(projectId, date) {
  const row = getDb().prepare(
    `SELECT * FROM project_updates WHERE project_id = ? AND date = ?`
  ).get(projectId, date);
  return decodeUpdate(row);
}

function getLatestUpdate(projectId) {
  const row = getDb().prepare(
    `SELECT * FROM project_updates WHERE project_id = ? ORDER BY date DESC LIMIT 1`
  ).get(projectId);
  return decodeUpdate(row);
}

function listUpdates(projectId, limit = 14) {
  const rows = getDb().prepare(
    `SELECT * FROM project_updates WHERE project_id = ? ORDER BY date DESC LIMIT ?`
  ).all(projectId, Math.min(limit, 60));
  return rows.map(decodeUpdate);
}

// ─── Candidates (auto-discovery) ───────────────────────────────

function listCandidates(status = 'pending') {
  const rows = getDb().prepare(
    `SELECT * FROM project_candidates WHERE status = ? ORDER BY confidence DESC, created_at DESC`
  ).all(status);
  return rows.map(r => ({
    ...r,
    suggested_tags: safeParse(r.suggested_tags, []),
    suggested_people: safeParse(r.suggested_people, []),
    cluster_signals: safeParse(r.cluster_signals, {})
  }));
}

function createCandidate(data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO project_candidates (
      suggested_title, suggested_description, suggested_tags, suggested_people,
      cluster_signals, confidence, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    data.suggested_title,
    data.suggested_description || null,
    JSON.stringify(data.suggested_tags || []),
    JSON.stringify(data.suggested_people || []),
    JSON.stringify(data.cluster_signals || {}),
    data.confidence ?? 0.5
  );
  return db.prepare('SELECT * FROM project_candidates WHERE id = ?').get(result.lastInsertRowid);
}

function decideCandidate(id, decision, mergedInto = null) {
  const db = getDb();
  db.prepare(`
    UPDATE project_candidates SET status = ?, merged_into = ?, decided_at = datetime('now') WHERE id = ?
  `).run(decision, mergedInto, id);
  return db.prepare('SELECT * FROM project_candidates WHERE id = ?').get(id);
}

function safeParse(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

// ─── Composite: full project for detail view ──────────────────

function getProjectFull(id) {
  const project = getProject(id);
  if (!project) return null;
  return {
    ...project,
    milestones: listMilestones(id),
    actions: listActions(id),
    blockers: listBlockers(id),
    sources: listSources(id, { limit: 50 }),
    latest_update: getLatestUpdate(id),
    recent_updates: listUpdates(id, 14)
  };
}

module.exports = {
  // Projects
  listProjects, getProject, getProjectFull, createProject, updateProject,
  archiveProject, deleteProject, setBackfillState,
  // Milestones
  listMilestones, addMilestone, updateMilestone, deleteMilestone,
  // Actions
  listActions, addAction, updateAction, deleteAction,
  // Blockers
  listBlockers, addBlocker, updateBlocker, deleteBlocker,
  // Sources
  upsertSource, listSources, countSourcesByType,
  // Updates
  upsertUpdate, getUpdate, getLatestUpdate, listUpdates,
  // Candidates
  listCandidates, createCandidate, decideCandidate,
  // Utils
  slugify
};
