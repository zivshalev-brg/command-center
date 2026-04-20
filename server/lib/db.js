const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── Database Setup ───────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, '..', '..', 'beanz-os.db');
const OLD_JSON_PATH = path.resolve(__dirname, '..', '..', 'status-store.json');

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');  // Better concurrent read performance
  _db.pragma('foreign_keys = ON');
  initSchema();
  migrateFromJson();
  return _db;
}

function initSchema() {
  _db.exec(`
    -- Thread statuses: active states (snoozed, in-progress, etc.)
    CREATE TABLE IF NOT EXISTS thread_status (
      thread_id   TEXT PRIMARY KEY,
      status      TEXT NOT NULL,          -- 'snoozed' | 'in_progress' | etc.
      snoozed_until TEXT,
      source      TEXT,                   -- 'slack' | 'email'
      subject     TEXT,                   -- cached subject line for history
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Completed threads: permanent archive. Done = never comes back.
    CREATE TABLE IF NOT EXISTS completed_threads (
      thread_id     TEXT PRIMARY KEY,
      source        TEXT,                 -- 'slack' | 'email'
      subject       TEXT,                 -- cached subject for archive display
      completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      completed_by  TEXT DEFAULT 'user'   -- future: could track who marked it
    );

    -- Dismissed items (insights, correlations, etc.)
    CREATE TABLE IF NOT EXISTS dismissed_items (
      item_id       TEXT PRIMARY KEY,
      item_type     TEXT NOT NULL DEFAULT 'unknown',
      dismissed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pinned items
    CREATE TABLE IF NOT EXISTS pinned_items (
      item_id     TEXT PRIMARY KEY,
      item_type   TEXT NOT NULL DEFAULT 'thread',
      pinned_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Action log: every user action recorded for history & learning
    CREATE TABLE IF NOT EXISTS action_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      action      TEXT NOT NULL,          -- 'mark_done' | 'snooze' | 'pin' | 'dismiss' | 'view' | etc.
      target_id   TEXT,                   -- thread_id, item_id, etc.
      target_type TEXT,                   -- 'thread' | 'insight' | 'metric' | etc.
      metadata    TEXT,                   -- JSON blob for extra context
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══ Self-Learning Tables ═══════════════════════════════════════

    -- Feedback: every up/down/pin/dismiss action
    CREATE TABLE IF NOT EXISTS learning_feedback (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,          -- 'insight' | 'metric' | 'news'
      target      TEXT NOT NULL,          -- e.g. 'COR-1', 'revenue', article id
      value       TEXT NOT NULL,          -- 'up' | 'down' | 'pin' | 'dismiss'
      context     TEXT,                   -- JSON blob
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Interactions: module/project/person view tracking
    CREATE TABLE IF NOT EXISTS learning_interactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,          -- 'module_view' | 'project_view' | 'person_view'
      module      TEXT,
      target      TEXT,
      duration    INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Insight weights: adaptive weights per target (cached computation)
    CREATE TABLE IF NOT EXISTS learning_weights (
      target      TEXT PRIMARY KEY,
      weight      REAL NOT NULL DEFAULT 1.0,
      feedback_count INTEGER DEFAULT 0,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Metric alerts: threshold-based notifications
    CREATE TABLE IF NOT EXISTS learning_alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_id   TEXT NOT NULL,
      threshold   REAL NOT NULL,
      direction   TEXT NOT NULL DEFAULT 'above',  -- 'above' | 'below'
      active      INTEGER NOT NULL DEFAULT 1,
      triggered_at TEXT,
      triggered_value REAL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Learnings: auto-derived patterns
    CREATE TABLE IF NOT EXISTS learning_patterns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern     TEXT NOT NULL,
      confidence  REAL NOT NULL DEFAULT 0.5,
      source      TEXT,                   -- 'interaction_frequency' | 'person_attention' | etc.
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User preferences (key-value store)
    CREATE TABLE IF NOT EXISTS learning_preferences (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Notes on people/projects
    CREATE TABLE IF NOT EXISTS learning_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,           -- 'person' | 'project'
      target_id   TEXT NOT NULL,
      note        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ═══ CIBE Tables (Coffee Intelligence Briefing Engine) ═══════

    -- Roaster registry
    CREATE TABLE IF NOT EXISTS cibe_roasters (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      country       TEXT NOT NULL,
      type          TEXT DEFAULT 'roaster',
      website       TEXT,
      shop_url      TEXT,
      instagram     TEXT,
      edm_from      TEXT,
      scrape_config TEXT,
      beanz_partner INTEGER DEFAULT 0,
      active        INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    -- Homepage snapshots
    CREATE TABLE IF NOT EXISTS cibe_homepage_snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      roaster_id      TEXT NOT NULL,
      screenshot_path TEXT,
      hero_text       TEXT,
      vision_summary  TEXT,
      detected_changes TEXT,
      captured_at     TEXT DEFAULT (datetime('now'))
    );

    -- Product catalogue
    CREATE TABLE IF NOT EXISTS cibe_products (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      roaster_id      TEXT NOT NULL,
      sku             TEXT,
      name            TEXT NOT NULL,
      price_cents     INTEGER,
      currency        TEXT DEFAULT 'AUD',
      weight_g        INTEGER,
      origin          TEXT,
      process         TEXT,
      roast_level     TEXT,
      is_blend        INTEGER DEFAULT 0,
      is_subscription INTEGER DEFAULT 0,
      url             TEXT,
      first_seen      TEXT DEFAULT (datetime('now')),
      last_seen       TEXT DEFAULT (datetime('now')),
      price_history   TEXT
    );

    -- EDM archive
    CREATE TABLE IF NOT EXISTS cibe_edms (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      roaster_id      TEXT,
      from_email      TEXT,
      subject         TEXT,
      received_at     TEXT,
      raw_html_path   TEXT,
      parsed_json     TEXT,
      vision_summary  TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Social media snapshots
    CREATE TABLE IF NOT EXISTS cibe_social (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      roaster_id      TEXT NOT NULL,
      platform        TEXT DEFAULT 'instagram',
      followers       INTEGER,
      posts_30d       INTEGER,
      engagement_rate REAL,
      top_posts       TEXT,
      screenshot_path TEXT,
      captured_at     TEXT DEFAULT (datetime('now'))
    );

    -- KPI history for anomaly detection
    CREATE TABLE IF NOT EXISTS cibe_kpi_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_key  TEXT NOT NULL,
      value       REAL NOT NULL,
      period      TEXT,
      source      TEXT DEFAULT 'pbi',
      captured_at TEXT DEFAULT (datetime('now'))
    );

    -- Briefing archive
    CREATE TABLE IF NOT EXISTS cibe_briefings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      week          TEXT NOT NULL,
      type          TEXT DEFAULT 'weekly',
      title         TEXT,
      content_md    TEXT,
      content_html  TEXT,
      sections      TEXT,
      model_used    TEXT,
      data_snapshot TEXT,
      sent_to       TEXT,
      sent_at       TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- Market trends
    CREATE TABLE IF NOT EXISTS cibe_trends (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword     TEXT NOT NULL,
      region      TEXT DEFAULT 'AU',
      value       REAL,
      period      TEXT,
      source      TEXT DEFAULT 'google_trends',
      captured_at TEXT DEFAULT (datetime('now'))
    );

    -- Scrape job log
    CREATE TABLE IF NOT EXISTS cibe_scrape_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type      TEXT NOT NULL,
      roaster_id    TEXT,
      status        TEXT DEFAULT 'pending',
      error         TEXT,
      duration_ms   INTEGER,
      items_found   INTEGER,
      started_at    TEXT,
      completed_at  TEXT
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_completed_date ON completed_threads(completed_at);
    CREATE INDEX IF NOT EXISTS idx_action_log_date ON action_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_action_log_action ON action_log(action);
    CREATE INDEX IF NOT EXISTS idx_action_log_target ON action_log(target_id);
    CREATE INDEX IF NOT EXISTS idx_lfb_target ON learning_feedback(target);
    CREATE INDEX IF NOT EXISTS idx_lfb_type ON learning_feedback(type);
    CREATE INDEX IF NOT EXISTS idx_lfb_date ON learning_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_lint_type ON learning_interactions(type);
    CREATE INDEX IF NOT EXISTS idx_lint_date ON learning_interactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_lint_module ON learning_interactions(module);

    -- CIBE indexes
    CREATE INDEX IF NOT EXISTS idx_cibe_products_roaster ON cibe_products(roaster_id);
    CREATE INDEX IF NOT EXISTS idx_cibe_products_last_seen ON cibe_products(last_seen);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cibe_products_unique ON cibe_products(roaster_id, name);
    CREATE INDEX IF NOT EXISTS idx_cibe_homepage_roaster ON cibe_homepage_snapshots(roaster_id);
    CREATE INDEX IF NOT EXISTS idx_cibe_homepage_date ON cibe_homepage_snapshots(captured_at);
    CREATE INDEX IF NOT EXISTS idx_cibe_kpi_metric ON cibe_kpi_history(metric_key);
    CREATE INDEX IF NOT EXISTS idx_cibe_kpi_period ON cibe_kpi_history(period);
    CREATE INDEX IF NOT EXISTS idx_cibe_briefings_week ON cibe_briefings(week);
    CREATE INDEX IF NOT EXISTS idx_cibe_edms_roaster ON cibe_edms(roaster_id);
    CREATE INDEX IF NOT EXISTS idx_cibe_scrape_log_type ON cibe_scrape_log(job_type);
  `);

  // ═══ AI Comms Tables ═══════════════════════════════════════
  _db.exec(`
    -- AI Classifications: Opus 4.5 thread analysis
    CREATE TABLE IF NOT EXISTS ai_classifications (
      thread_id       TEXT PRIMARY KEY,
      category        TEXT NOT NULL,
      subcategory     TEXT,
      priority        TEXT NOT NULL,
      sentiment       TEXT,
      action_required INTEGER DEFAULT 0,
      action_type     TEXT,
      summary         TEXT,
      confidence      REAL DEFAULT 0.5,
      message_count   INTEGER DEFAULT 0,
      model_used      TEXT,
      classified_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AI Summaries: Rich structured thread summaries (cached)
    CREATE TABLE IF NOT EXISTS ai_summaries (
      thread_id       TEXT PRIMARY KEY,
      summary_json    TEXT NOT NULL,
      message_count   INTEGER DEFAULT 0,
      attachment_hash TEXT,
      model_used      TEXT,
      summarised_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AI Drafts: Opus 4.5 response drafts
    CREATE TABLE IF NOT EXISTS ai_drafts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id           TEXT NOT NULL,
      draft_text          TEXT NOT NULL,
      draft_html          TEXT,
      tone                TEXT DEFAULT 'standard',
      custom_instructions TEXT,
      model_used          TEXT,
      status              TEXT DEFAULT 'pending',
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at             TEXT
    );

    -- Unified Threads: cross-platform matching (Slack <-> Email)
    CREATE TABLE IF NOT EXISTS unified_threads (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id_a   TEXT NOT NULL,
      thread_id_b   TEXT NOT NULL,
      match_score   REAL DEFAULT 0,
      match_type    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(thread_id_a, thread_id_b)
    );

    -- AI Comms Indexes
    CREATE INDEX IF NOT EXISTS idx_ai_class_category ON ai_classifications(category);
    CREATE INDEX IF NOT EXISTS idx_ai_class_priority ON ai_classifications(priority);
    CREATE INDEX IF NOT EXISTS idx_ai_drafts_thread ON ai_drafts(thread_id);
    CREATE INDEX IF NOT EXISTS idx_ai_drafts_status ON ai_drafts(status);
    CREATE INDEX IF NOT EXISTS idx_unified_a ON unified_threads(thread_id_a);
    CREATE INDEX IF NOT EXISTS idx_unified_b ON unified_threads(thread_id_b);
  `);

  // ═══ Comms Analytics Tables ═══════════════════════════════════
  _db.exec(`
    -- Daily aggregate metrics per dimension (topic/person/project)
    CREATE TABLE IF NOT EXISTS comms_analytics_snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date   TEXT NOT NULL,
      dimension       TEXT NOT NULL,
      dimension_key   TEXT NOT NULL,
      thread_count    INTEGER DEFAULT 0,
      message_count   INTEGER DEFAULT 0,
      avg_sentiment   REAL,
      action_required_count INTEGER DEFAULT 0,
      categories      TEXT,
      sources         TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(snapshot_date, dimension, dimension_key)
    );

    -- AI-generated narrative summaries per day
    CREATE TABLE IF NOT EXISTS comms_analytics_summaries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date   TEXT NOT NULL,
      summary_type    TEXT NOT NULL,
      summary_text    TEXT NOT NULL,
      data_hash       TEXT,
      model_used      TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(snapshot_date, summary_type)
    );

    -- Comms Analytics Indexes
    CREATE INDEX IF NOT EXISTS idx_cas_date ON comms_analytics_snapshots(snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_cas_dimension ON comms_analytics_snapshots(dimension, dimension_key);
    CREATE INDEX IF NOT EXISTS idx_cass_date ON comms_analytics_summaries(snapshot_date);
  `);

  // ═══ News Intelligence Tables ═══════════════════════════════
  _db.exec(`
    -- Read tracking per article
    CREATE TABLE IF NOT EXISTS news_read (
      article_id  TEXT PRIMARY KEY,
      read_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User notes on articles
    CREATE TABLE IF NOT EXISTS news_notes (
      article_id  TEXT PRIMARY KEY,
      note        TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AI-generated article summaries and impact assessments
    CREATE TABLE IF NOT EXISTS news_ai_cache (
      article_id      TEXT PRIMARY KEY,
      exec_summary    TEXT,
      beanz_impact    TEXT,
      ai_relevance    REAL,
      topics          TEXT,
      model_used      TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Cached digests (daily/weekly briefings)
    CREATE TABLE IF NOT EXISTS news_digests (
      id          TEXT PRIMARY KEY,
      period      TEXT NOT NULL,
      content     TEXT NOT NULL,
      article_count INTEGER DEFAULT 0,
      model_used  TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Topic frequency tracking per day
    CREATE TABLE IF NOT EXISTS news_topics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      topic       TEXT NOT NULL,
      count       INTEGER DEFAULT 0,
      snapshot_date TEXT NOT NULL,
      UNIQUE(topic, snapshot_date)
    );

    -- Competitor alerts
    CREATE TABLE IF NOT EXISTS news_competitor_alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'info',
      title       TEXT NOT NULL,
      article_id  TEXT,
      alert_type  TEXT,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_news_topics_date ON news_topics(snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_news_topics_topic ON news_topics(topic);
    CREATE INDEX IF NOT EXISTS idx_news_alerts_comp ON news_competitor_alerts(competitor);
    CREATE INDEX IF NOT EXISTS idx_news_alerts_date ON news_competitor_alerts(detected_at);
  `);

  // ═══ Chat Tables ════════════════════════════════════════════
  _db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      message_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_messages(session_id);
  `);

  // ═══ Notebook Tables (NotebookLM-style workspace) ══════════
  _db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      icon        TEXT DEFAULT '📒',
      color       TEXT DEFAULT 'var(--ac)',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notebook_sources (
      id             TEXT PRIMARY KEY,
      notebook_id    TEXT NOT NULL,
      kind           TEXT NOT NULL,            -- upload_pdf|upload_docx|upload_txt|upload_md|paste_text|paste_url|vault_page|dashboard_snapshot
      title          TEXT NOT NULL,
      url            TEXT,
      content_text   TEXT NOT NULL,
      metadata_json  TEXT,
      size           INTEGER DEFAULT 0,
      added_at       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_nb_sources_notebook ON notebook_sources(notebook_id);

    CREATE TABLE IF NOT EXISTS notebook_source_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id   TEXT NOT NULL,
      notebook_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      char_start  INTEGER DEFAULT 0,
      char_end    INTEGER DEFAULT 0,
      FOREIGN KEY(source_id) REFERENCES notebook_sources(id) ON DELETE CASCADE,
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_nb_chunks_source ON notebook_source_chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_nb_chunks_notebook ON notebook_source_chunks(notebook_id);

    CREATE TABLE IF NOT EXISTS notebook_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id TEXT NOT NULL,
      title       TEXT,
      content_md  TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'user',      -- user|ai_summary|ai_faq|ai_briefing|ai_study_guide|ai_timeline|ai_concepts|ai_actions|chat_saved
      pinned      INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_nb_notes_notebook ON notebook_notes(notebook_id);

    CREATE TABLE IF NOT EXISTS notebook_messages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id    TEXT NOT NULL,
      role           TEXT NOT NULL,            -- user|assistant
      content        TEXT NOT NULL,
      citations_json TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_nb_msg_notebook ON notebook_messages(notebook_id);
  `);

  // ═══ Genie (Databricks) Cache Table ════════════════════════
  _db.exec(`
    CREATE TABLE IF NOT EXISTS genie_cache (
      cache_key     TEXT PRIMARY KEY,
      query_type    TEXT NOT NULL,          -- 'kpis' | 'timeseries' | 'breakdown' | 'compare'
      response_json TEXT NOT NULL,
      cached_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_genie_cache_type ON genie_cache(query_type);
    CREATE INDEX IF NOT EXISTS idx_genie_cache_date ON genie_cache(cached_at);
  `);

  // Phase 2 migrations — add columns that don't exist in Phase 1 schema
  try {
    _db.exec(`ALTER TABLE cibe_homepage_snapshots ADD COLUMN page_text_hash TEXT`);
  } catch { /* column already exists */ }

  // Phase 14 migrations — extended classification fields for project tags & marketing
  try {
    _db.exec(`ALTER TABLE ai_classifications ADD COLUMN project_tags TEXT`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE ai_classifications ADD COLUMN is_marketing INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE ai_classifications ADD COLUMN urgency_reason TEXT`);
  } catch { /* column already exists */ }

  // Phase 16 — project intelligence cache for AI synthesis
  try {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS project_intelligence_cache (
        project_id    TEXT PRIMARY KEY,
        health_score  REAL,
        health_summary TEXT,
        risk_flags    TEXT,
        opportunity_flags TEXT,
        data_hash     TEXT,
        model_used    TEXT,
        generated_at  TEXT DEFAULT (datetime('now'))
      )
    `);
  } catch { /* table already exists */ }

  // Phase 15 migrations — enrichment fields on news_ai_cache
  try {
    _db.exec(`ALTER TABLE news_ai_cache ADD COLUMN enriched_summary TEXT`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE news_ai_cache ADD COLUMN brand_tags TEXT`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE news_ai_cache ADD COLUMN category_classification TEXT`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE news_ai_cache ADD COLUMN sentiment TEXT`);
  } catch { /* column already exists */ }
  try {
    _db.exec(`ALTER TABLE news_ai_cache ADD COLUMN sentiment_score REAL`);
  } catch { /* column already exists */ }
}

/** One-time migration from old status-store.json → SQLite */
function migrateFromJson() {
  if (!fs.existsSync(OLD_JSON_PATH)) return;

  // Check if we already migrated (action_log will have a migration entry)
  const migrated = _db.prepare(
    `SELECT 1 FROM action_log WHERE action = 'migration_from_json' LIMIT 1`
  ).get();
  if (migrated) return;

  console.log('[DB] Migrating from status-store.json to SQLite...');
  try {
    const old = JSON.parse(fs.readFileSync(OLD_JSON_PATH, 'utf8'));

    const insertThread = _db.prepare(
      `INSERT OR REPLACE INTO thread_status (thread_id, status, snoozed_until, updated_at) VALUES (?, ?, ?, ?)`
    );
    const insertCompleted = _db.prepare(
      `INSERT OR REPLACE INTO completed_threads (thread_id, completed_at) VALUES (?, ?)`
    );
    const insertDismissed = _db.prepare(
      `INSERT OR REPLACE INTO dismissed_items (item_id, item_type, dismissed_at) VALUES (?, ?, ?)`
    );
    const insertPinned = _db.prepare(
      `INSERT OR REPLACE INTO pinned_items (item_id, item_type, pinned_at) VALUES (?, ?, ?)`
    );

    const txn = _db.transaction(() => {
      // Migrate threads
      for (const [id, entry] of Object.entries(old.threads || {})) {
        if (entry.status === 'done') {
          // Done threads go to the permanent archive
          insertCompleted.run(id, entry.updatedAt || new Date().toISOString());
        } else {
          insertThread.run(id, entry.status, entry.snoozedUntil || null, entry.updatedAt || new Date().toISOString());
        }
      }
      // Migrate dismissed items
      for (const [id, entry] of Object.entries(old.dismissed || {})) {
        insertDismissed.run(id, entry.itemType || 'unknown', entry.dismissedAt || new Date().toISOString());
      }
      // Migrate pinned items
      for (const [id, entry] of Object.entries(old.pinned || {})) {
        insertPinned.run(id, entry.itemType || 'thread', entry.pinnedAt || new Date().toISOString());
      }
      // Record migration
      _db.prepare(
        `INSERT INTO action_log (action, metadata) VALUES (?, ?)`
      ).run('migration_from_json', JSON.stringify({
        threads: Object.keys(old.threads || {}).length,
        dismissed: Object.keys(old.dismissed || {}).length,
        pinned: Object.keys(old.pinned || {}).length
      }));
    });
    txn();

    // Rename old file so we don't re-migrate
    fs.renameSync(OLD_JSON_PATH, OLD_JSON_PATH + '.migrated');
    console.log('[DB] Migration complete. Old file renamed to status-store.json.migrated');
  } catch (e) {
    console.error('[DB] Migration failed:', e.message);
  }
}

// ─── Thread Status ─────────────────────────────────────────────

function setThreadStatus(threadId, status, snoozedUntil, meta) {
  const db = getDb();
  const now = new Date().toISOString();
  const source = meta?.source || (threadId.startsWith('email-') ? 'email' : 'slack');
  const subject = meta?.subject || null;

  if (status === 'done') {
    // Move to permanent completed_threads table — never comes back
    db.prepare(
      `INSERT OR REPLACE INTO completed_threads (thread_id, source, subject, completed_at) VALUES (?, ?, ?, ?)`
    ).run(threadId, source, subject, now);
    // Remove from active statuses
    db.prepare(`DELETE FROM thread_status WHERE thread_id = ?`).run(threadId);
    // Log the action
    logAction('mark_done', threadId, 'thread', { source, subject });
  } else if (status === 'clear') {
    // Remove from active statuses (but NOT from completed)
    db.prepare(`DELETE FROM thread_status WHERE thread_id = ?`).run(threadId);
    logAction('clear_status', threadId, 'thread');
  } else {
    // Set active status (snoozed, in_progress, etc.)
    db.prepare(
      `INSERT OR REPLACE INTO thread_status (thread_id, status, snoozed_until, source, subject, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(threadId, status, snoozedUntil || null, source, subject, now);
    logAction('set_status_' + status, threadId, 'thread', { snoozedUntil });
  }
}

function getThreadStatuses() {
  const db = getDb();
  const rows = db.prepare(`SELECT thread_id, status, snoozed_until, updated_at FROM thread_status`).all();
  const completed = db.prepare(`SELECT thread_id FROM completed_threads`).all();
  const result = {};

  // Active statuses
  for (const row of rows) {
    result[row.thread_id] = {
      status: row.status,
      snoozedUntil: row.snoozed_until,
      updatedAt: row.updated_at
    };
  }
  // Completed threads — returned as status:'done' so the frontend filters them out
  for (const row of completed) {
    result[row.thread_id] = { status: 'done' };
  }

  return result;
}

function clearExpiredSnoozes() {
  const db = getDb();
  const now = new Date().toISOString();
  const expired = db.prepare(
    `SELECT thread_id FROM thread_status WHERE status = 'snoozed' AND snoozed_until IS NOT NULL AND snoozed_until < ?`
  ).all(now);

  if (expired.length > 0) {
    const del = db.prepare(`DELETE FROM thread_status WHERE thread_id = ?`);
    const txn = db.transaction(() => {
      for (const row of expired) {
        del.run(row.thread_id);
        logAction('snooze_expired', row.thread_id, 'thread');
      }
    });
    txn();
  }
}

/** Check if a thread has been permanently completed */
function isThreadDone(threadId) {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM completed_threads WHERE thread_id = ? LIMIT 1`).get(threadId);
  return !!row;
}

/** Get all completed thread IDs (for filtering on comms load) */
function getCompletedThreadIds() {
  const db = getDb();
  return db.prepare(`SELECT thread_id FROM completed_threads`).all().map(r => r.thread_id);
}

/** Get completed threads with details, for the archive view */
function getCompletedThreads(limit, offset) {
  const db = getDb();
  limit = limit || 50;
  offset = offset || 0;
  return db.prepare(
    `SELECT thread_id, source, subject, completed_at, completed_by
     FROM completed_threads ORDER BY completed_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

// ─── Dismissed Items ───────────────────────────────────────────

function dismissItem(itemId, itemType) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO dismissed_items (item_id, item_type, dismissed_at) VALUES (?, ?, datetime('now'))`
  ).run(itemId, itemType || 'unknown');
  logAction('dismiss', itemId, itemType || 'unknown');
}

function undismissItem(itemId) {
  const db = getDb();
  db.prepare(`DELETE FROM dismissed_items WHERE item_id = ?`).run(itemId);
  logAction('undismiss', itemId, 'unknown');
}

function getDismissedItems(itemType) {
  const db = getDb();
  let rows;
  if (itemType) {
    rows = db.prepare(`SELECT item_id, item_type, dismissed_at FROM dismissed_items WHERE item_type = ?`).all(itemType);
  } else {
    rows = db.prepare(`SELECT item_id, item_type, dismissed_at FROM dismissed_items`).all();
  }
  return rows.map(r => ({ item_id: r.item_id, item_type: r.item_type, dismissed_at: r.dismissed_at }));
}

// ─── Pinned Items ──────────────────────────────────────────────

function setPinned(itemId, pinned, itemType) {
  const db = getDb();
  if (pinned) {
    db.prepare(
      `INSERT OR REPLACE INTO pinned_items (item_id, item_type, pinned_at) VALUES (?, ?, datetime('now'))`
    ).run(itemId, itemType || 'thread');
    logAction('pin', itemId, itemType || 'thread');
  } else {
    db.prepare(`DELETE FROM pinned_items WHERE item_id = ?`).run(itemId);
    logAction('unpin', itemId, itemType || 'thread');
  }
}

function getPinnedItems(itemType) {
  const db = getDb();
  let rows;
  if (itemType) {
    rows = db.prepare(`SELECT item_id, item_type, pinned_at FROM pinned_items WHERE item_type = ?`).all(itemType);
  } else {
    rows = db.prepare(`SELECT item_id, item_type, pinned_at FROM pinned_items`).all();
  }
  return rows.map(r => ({ item_id: r.item_id, item_type: r.item_type, pinned_at: r.pinned_at }));
}

// ─── Action Log ────────────────────────────────────────────────

function logAction(action, targetId, targetType, metadata) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO action_log (action, target_id, target_type, metadata) VALUES (?, ?, ?, ?)`
    ).run(action, targetId || null, targetType || null, metadata ? JSON.stringify(metadata) : null);
  } catch (e) {
    // Never let logging failure break the app
    console.error('[DB] Action log error:', e.message);
  }
}

function getActionLog(limit, offset, action) {
  const db = getDb();
  limit = limit || 100;
  offset = offset || 0;
  if (action) {
    return db.prepare(
      `SELECT * FROM action_log WHERE action = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(action, limit, offset);
  }
  return db.prepare(
    `SELECT * FROM action_log ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

// ─── Learning: Feedback ─────────────────────────────────────────

function recordFeedback(type, target, value, context) {
  const db = getDb();
  db.prepare(
    `INSERT INTO learning_feedback (type, target, value, context) VALUES (?, ?, ?, ?)`
  ).run(type, target, value, context ? JSON.stringify(context) : null);
  logAction('feedback_' + value, target, type, { value });
  // Recompute weight for this target
  recomputeWeight(target);
}

function getFeedbackHistory(limit, targetType) {
  const db = getDb();
  limit = limit || 100;
  if (targetType) {
    return db.prepare(
      `SELECT * FROM learning_feedback WHERE type = ? ORDER BY created_at DESC LIMIT ?`
    ).all(targetType, limit);
  }
  return db.prepare(
    `SELECT * FROM learning_feedback ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
}

function getFeedbackForTarget(target) {
  const db = getDb();
  return db.prepare(
    `SELECT value, created_at FROM learning_feedback WHERE target = ? ORDER BY created_at DESC`
  ).all(target);
}

// ─── Learning: Weights (with time-decay) ────────────────────────

const WEIGHT_DECAY_DAYS = 30; // Feedback older than 30 days decays
const WEIGHT_ADJUSTMENTS = { up: 0.2, down: -0.2, pin: 0.5, dismiss: -0.3 };

function recomputeWeight(target) {
  const db = getDb();
  const feedbacks = db.prepare(
    `SELECT value, created_at FROM learning_feedback WHERE target = ?`
  ).all(target);

  let weight = 1.0;
  const now = Date.now();

  for (const fb of feedbacks) {
    const adj = WEIGHT_ADJUSTMENTS[fb.value] || 0;
    // Apply time-decay: recent feedback counts more
    const ageMs = now - new Date(fb.created_at).getTime();
    const ageDays = ageMs / 86400000;
    const decayFactor = ageDays > WEIGHT_DECAY_DAYS
      ? Math.max(0.2, 1 - (ageDays - WEIGHT_DECAY_DAYS) / 90)
      : 1.0;
    weight += adj * decayFactor;
  }

  weight = Math.max(0, Math.min(3, weight)); // Clamp 0-3

  db.prepare(
    `INSERT OR REPLACE INTO learning_weights (target, weight, feedback_count, updated_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(target, weight, feedbacks.length);

  return weight;
}

function recomputeAllWeights() {
  const db = getDb();
  const targets = db.prepare(
    `SELECT DISTINCT target FROM learning_feedback`
  ).all();
  const weights = {};
  for (const { target } of targets) {
    weights[target] = recomputeWeight(target);
  }
  return weights;
}

function getInsightWeights() {
  const db = getDb();
  const rows = db.prepare(`SELECT target, weight, feedback_count FROM learning_weights`).all();
  const result = {};
  for (const r of rows) {
    result[r.target] = { weight: r.weight, feedbackCount: r.feedback_count };
  }
  return result;
}

function getWeightForTarget(target) {
  const db = getDb();
  const row = db.prepare(`SELECT weight FROM learning_weights WHERE target = ?`).get(target);
  return row ? row.weight : 1.0;
}

// ─── Learning: Interactions ─────────────────────────────────────

function recordInteraction(type, module, target, duration) {
  const db = getDb();
  db.prepare(
    `INSERT INTO learning_interactions (type, module, target, duration) VALUES (?, ?, ?, ?)`
  ).run(type, module || null, target || null, duration || 0);

  // Prune old interactions (keep last 2000)
  db.prepare(
    `DELETE FROM learning_interactions WHERE id NOT IN (SELECT id FROM learning_interactions ORDER BY id DESC LIMIT 2000)`
  ).run();
}

function getInteractionPatterns() {
  const db = getDb();
  const patterns = [];

  // Module frequency (last 30 days)
  const modCounts = db.prepare(
    `SELECT module, COUNT(*) as cnt FROM learning_interactions
     WHERE type = 'module_view' AND created_at > datetime('now', '-30 days')
     GROUP BY module ORDER BY cnt DESC`
  ).all();
  if (modCounts.length && modCounts[0].cnt > 5) {
    patterns.push({
      pattern: `Most visited module: ${modCounts[0].module}`,
      confidence: Math.min(modCounts[0].cnt / 30, 1),
      source: 'interaction_frequency',
      data: modCounts.slice(0, 5)
    });
  }

  // Person attention (last 30 days)
  const personViews = db.prepare(
    `SELECT target, COUNT(*) as cnt FROM learning_interactions
     WHERE type = 'person_view' AND created_at > datetime('now', '-30 days')
     GROUP BY target ORDER BY cnt DESC LIMIT 5`
  ).all();
  for (const pv of personViews) {
    if (pv.cnt > 3) {
      patterns.push({
        pattern: `Frequently viewed person: ${pv.target}`,
        confidence: Math.min(pv.cnt / 15, 1),
        source: 'person_attention',
        data: { target: pv.target, views: pv.cnt }
      });
    }
  }

  // Project attention (last 30 days)
  const projectViews = db.prepare(
    `SELECT target, COUNT(*) as cnt FROM learning_interactions
     WHERE type = 'project_view' AND created_at > datetime('now', '-30 days')
     GROUP BY target ORDER BY cnt DESC LIMIT 5`
  ).all();
  for (const pv of projectViews) {
    if (pv.cnt > 3) {
      patterns.push({
        pattern: `Frequently viewed project: ${pv.target}`,
        confidence: Math.min(pv.cnt / 10, 1),
        source: 'project_attention',
        data: { target: pv.target, views: pv.cnt }
      });
    }
  }

  // Peak usage hours
  const hourCounts = db.prepare(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hr, COUNT(*) as cnt
     FROM learning_interactions WHERE created_at > datetime('now', '-14 days')
     GROUP BY hr ORDER BY cnt DESC LIMIT 3`
  ).all();
  if (hourCounts.length) {
    patterns.push({
      pattern: `Peak usage: ${hourCounts.map(h => h.hr + ':00').join(', ')}`,
      confidence: 0.7,
      source: 'usage_timing',
      data: hourCounts
    });
  }

  // Feedback activity
  const fbStats = db.prepare(
    `SELECT type, value, COUNT(*) as cnt FROM learning_feedback
     WHERE created_at > datetime('now', '-30 days')
     GROUP BY type, value ORDER BY cnt DESC`
  ).all();
  if (fbStats.length) {
    const totalFb = fbStats.reduce((sum, f) => sum + f.cnt, 0);
    patterns.push({
      pattern: `${totalFb} feedback actions in last 30 days`,
      confidence: Math.min(totalFb / 50, 1),
      source: 'feedback_activity',
      data: fbStats
    });
  }

  return patterns;
}

function getInteractionStats() {
  const db = getDb();
  return {
    total: db.prepare(`SELECT COUNT(*) as cnt FROM learning_interactions`).get().cnt,
    last7d: db.prepare(`SELECT COUNT(*) as cnt FROM learning_interactions WHERE created_at > datetime('now', '-7 days')`).get().cnt,
    last30d: db.prepare(`SELECT COUNT(*) as cnt FROM learning_interactions WHERE created_at > datetime('now', '-30 days')`).get().cnt,
    totalFeedback: db.prepare(`SELECT COUNT(*) as cnt FROM learning_feedback`).get().cnt,
    feedbackLast7d: db.prepare(`SELECT COUNT(*) as cnt FROM learning_feedback WHERE created_at > datetime('now', '-7 days')`).get().cnt
  };
}

// ─── Learning: Alerts ───────────────────────────────────────────

function setAlert(metricId, threshold, direction) {
  const db = getDb();
  db.prepare(
    `INSERT INTO learning_alerts (metric_id, threshold, direction) VALUES (?, ?, ?)`
  ).run(metricId, threshold, direction || 'above');
  logAction('set_alert', metricId, 'metric', { threshold, direction });
}

function checkAlerts(metrics) {
  const db = getDb();
  const alerts = db.prepare(
    `SELECT * FROM learning_alerts WHERE active = 1`
  ).all();

  const triggered = [];
  for (const alert of alerts) {
    const metric = metrics[alert.metric_id];
    if (!metric || metric.value === undefined) continue;

    const val = metric.value;
    const fire = (alert.direction === 'above' && val > alert.threshold) ||
                 (alert.direction === 'below' && val < alert.threshold);

    if (fire) {
      db.prepare(
        `UPDATE learning_alerts SET triggered_at = datetime('now'), triggered_value = ? WHERE id = ?`
      ).run(val, alert.id);
      triggered.push({
        alertId: alert.id,
        metricId: alert.metric_id,
        metricName: metric.name || alert.metric_id,
        value: val,
        threshold: alert.threshold,
        direction: alert.direction,
        message: `${metric.name || alert.metric_id}: ${val} is ${alert.direction} threshold ${alert.threshold}`
      });
    }
  }
  return triggered;
}

function getAlerts() {
  const db = getDb();
  return db.prepare(`SELECT * FROM learning_alerts ORDER BY created_at DESC`).all();
}

function deleteAlert(alertId) {
  const db = getDb();
  db.prepare(`DELETE FROM learning_alerts WHERE id = ?`).run(alertId);
}

// ─── Learning: Notes ────────────────────────────────────────────

function addNote(targetType, targetId, note) {
  const db = getDb();
  db.prepare(
    `INSERT INTO learning_notes (target_type, target_id, note) VALUES (?, ?, ?)`
  ).run(targetType, targetId, note);
}

function getNotes(targetType, targetId) {
  const db = getDb();
  if (targetId) {
    return db.prepare(
      `SELECT * FROM learning_notes WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC`
    ).all(targetType, targetId);
  }
  return db.prepare(
    `SELECT * FROM learning_notes WHERE target_type = ? ORDER BY created_at DESC LIMIT 50`
  ).all(targetType);
}

// ─── Learning: Preferences ──────────────────────────────────────

function setPreference(key, value) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO learning_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))`
  ).run(key, typeof value === 'string' ? value : JSON.stringify(value));
}

function getPreferences() {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM learning_preferences`).all();
  const result = {};
  for (const r of rows) {
    try { result[r.key] = JSON.parse(r.value); } catch { result[r.key] = r.value; }
  }
  return result;
}

// ─── Learning: Migration from JSON ──────────────────────────────

function migrateLearningFromJson(storePath) {
  const db = getDb();
  const migrated = db.prepare(
    `SELECT 1 FROM action_log WHERE action = 'learning_migration_from_json' LIMIT 1`
  ).get();
  if (migrated) return false;

  const fs = require('fs');
  if (!fs.existsSync(storePath)) return false;

  console.log('[DB] Migrating learning-store.json to SQLite...');
  try {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));

    const txn = db.transaction(() => {
      // Feedback entries
      const insFb = db.prepare(
        `INSERT INTO learning_feedback (type, target, value, context, created_at) VALUES (?, ?, ?, ?, ?)`
      );
      for (const fb of (store.feedback || [])) {
        insFb.run(fb.type, fb.target, fb.value, fb.context ? JSON.stringify(fb.context) : null, fb.timestamp || new Date().toISOString());
      }

      // Interactions
      const insInt = db.prepare(
        `INSERT INTO learning_interactions (type, module, target, duration, created_at) VALUES (?, ?, ?, ?, ?)`
      );
      for (const it of (store.interactions || [])) {
        insInt.run(it.type, it.module, it.target, it.duration || 0, it.timestamp || new Date().toISOString());
      }

      // Alerts
      const insAlert = db.prepare(
        `INSERT INTO learning_alerts (metric_id, threshold, direction, active, created_at) VALUES (?, ?, ?, ?, ?)`
      );
      for (const a of (store.metricAlerts || [])) {
        insAlert.run(a.metricId, a.threshold, a.direction, a.active ? 1 : 0, a.created || new Date().toISOString());
      }

      // Preferences
      const insPref = db.prepare(
        `INSERT OR REPLACE INTO learning_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))`
      );
      for (const [k, v] of Object.entries(store.preferences || {})) {
        insPref.run(k, typeof v === 'string' ? v : JSON.stringify(v));
      }

      // Learnings
      const insPat = db.prepare(
        `INSERT INTO learning_patterns (pattern, confidence, source, created_at) VALUES (?, ?, ?, ?)`
      );
      for (const l of (store.learnings || [])) {
        insPat.run(l.pattern, l.confidence, l.source, l.timestamp || new Date().toISOString());
      }

      // Notes
      const insNote = db.prepare(
        `INSERT INTO learning_notes (target_type, target_id, note, created_at) VALUES (?, ?, ?, ?)`
      );
      for (const [pid, notes] of Object.entries(store.personNotes || {})) {
        for (const n of notes) {
          insNote.run('person', pid, n.note, n.timestamp || new Date().toISOString());
        }
      }
      for (const [pid, notes] of Object.entries(store.projectNotes || {})) {
        for (const n of notes) {
          insNote.run('project', pid, n.note, n.timestamp || new Date().toISOString());
        }
      }

      // Record migration
      db.prepare(
        `INSERT INTO action_log (action, metadata) VALUES (?, ?)`
      ).run('learning_migration_from_json', JSON.stringify({
        feedback: (store.feedback || []).length,
        interactions: (store.interactions || []).length,
        alerts: (store.metricAlerts || []).length
      }));
    });
    txn();

    // Recompute all weights
    recomputeAllWeights();

    // Rename old file
    fs.renameSync(storePath, storePath + '.migrated-to-sqlite');
    console.log('[DB] Learning migration complete.');
    return true;
  } catch (e) {
    console.error('[DB] Learning migration failed:', e.message);
    return false;
  }
}

// ─── Learning: Dashboard Summary ────────────────────────────────

function getLearningDashboard() {
  const stats = getInteractionStats();
  const weights = getInsightWeights();
  const patterns = getInteractionPatterns();
  const alerts = getAlerts();
  const recentFeedback = getFeedbackHistory(20);

  // Pinned & dismissed from learning_feedback
  const db = getDb();
  const pinned = db.prepare(
    `SELECT DISTINCT target FROM learning_feedback WHERE value = 'pin' AND target NOT IN (SELECT target FROM learning_feedback WHERE value = 'dismiss' AND created_at > (SELECT MAX(created_at) FROM learning_feedback lf2 WHERE lf2.target = learning_feedback.target AND lf2.value = 'pin'))`
  ).all().map(r => r.target);

  const dismissed = db.prepare(
    `SELECT DISTINCT target FROM learning_feedback WHERE value = 'dismiss'
     AND target NOT IN (SELECT target FROM learning_feedback WHERE value IN ('up','pin') AND created_at > (SELECT MAX(created_at) FROM learning_feedback lf2 WHERE lf2.target = learning_feedback.target AND lf2.value = 'dismiss'))`
  ).all().map(r => r.target);

  return {
    stats,
    weights,
    patterns,
    alerts,
    recentFeedback,
    pinnedInsights: pinned,
    dismissedInsights: dismissed,
    preferences: getPreferences()
  };
}

// ─── AI Classifications ──────────────────────────────────────────

function upsertClassification(threadId, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ai_classifications
      (thread_id, category, subcategory, priority, sentiment, action_required, action_type, summary, confidence, message_count, model_used, project_tags, is_marketing, urgency_reason, classified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    threadId, data.category, data.subcategory || null, data.priority,
    data.sentiment || null, data.actionRequired ? 1 : 0, data.actionType || null,
    data.summary || null, data.confidence || 0.5, data.messageCount || 0,
    data.modelUsed || null,
    data.projectTags ? JSON.stringify(data.projectTags) : null,
    data.isMarketing ? 1 : 0,
    data.urgencyReason || null
  );
}

function getClassification(threadId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM ai_classifications WHERE thread_id = ?`).get(threadId);
}

function getAllClassifications() {
  const db = getDb();
  return db.prepare(`SELECT * FROM ai_classifications`).all();
}

function getClassificationIfFresh(threadId, currentMessageCount) {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM ai_classifications WHERE thread_id = ? AND message_count = ?`
  ).get(threadId, currentMessageCount);
  return row || null;
}

function getCategoryCounts() {
  const db = getDb();
  return db.prepare(
    `SELECT category, COUNT(*) as count FROM ai_classifications GROUP BY category ORDER BY count DESC`
  ).all();
}

// ─── AI Summaries (cached structured summaries) ──────────────────

function upsertSummary(threadId, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ai_summaries
      (thread_id, summary_json, message_count, attachment_hash, model_used, summarised_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    threadId, JSON.stringify(data.summaryJson),
    data.messageCount || 0, data.attachmentHash || null,
    data.modelUsed || null
  );
}

function getSummaryIfFresh(threadId, currentMessageCount, attachmentHash) {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM ai_summaries WHERE thread_id = ? AND message_count = ?`
  ).get(threadId, currentMessageCount);
  if (!row) return null;
  // Invalidate if attachment hash changed
  if (attachmentHash && row.attachment_hash && row.attachment_hash !== attachmentHash) return null;
  try {
    return JSON.parse(row.summary_json);
  } catch {
    return null;
  }
}

// ─── AI Drafts ────────────────────────────────────────────────────

function insertDraft(threadId, data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO ai_drafts (thread_id, draft_text, draft_html, tone, custom_instructions, model_used, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    threadId, data.draftText, data.draftHtml || null,
    data.tone || 'standard', data.customInstructions || null,
    data.modelUsed || null
  );
  return result.lastInsertRowid;
}

function getDraft(draftId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM ai_drafts WHERE id = ?`).get(draftId);
}

function getDraftsForThread(threadId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM ai_drafts WHERE thread_id = ? ORDER BY created_at DESC`
  ).all(threadId);
}

function getPendingDrafts() {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM ai_drafts WHERE status = 'pending' ORDER BY created_at DESC`
  ).all();
}

function updateDraftStatus(draftId, status) {
  const db = getDb();
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  db.prepare(
    `UPDATE ai_drafts SET status = ?, sent_at = COALESCE(?, sent_at) WHERE id = ?`
  ).run(status, sentAt, draftId);
}

// ─── Unified Threads ──────────────────────────────────────────────

function upsertUnifiedMatch(threadIdA, threadIdB, score, matchType) {
  const db = getDb();
  // Ensure consistent ordering to avoid duplicates
  const [a, b] = threadIdA < threadIdB ? [threadIdA, threadIdB] : [threadIdB, threadIdA];
  db.prepare(`
    INSERT OR REPLACE INTO unified_threads (thread_id_a, thread_id_b, match_score, match_type)
    VALUES (?, ?, ?, ?)
  `).run(a, b, score, matchType);
}

function getUnifiedGroup(threadId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT thread_id_a, thread_id_b, match_score, match_type
    FROM unified_threads
    WHERE thread_id_a = ? OR thread_id_b = ?
  `).all(threadId, threadId);
  return rows.map(r => ({
    linkedThreadId: r.thread_id_a === threadId ? r.thread_id_b : r.thread_id_a,
    score: r.match_score,
    matchType: r.match_type
  }));
}

function clearUnifiedMatches() {
  const db = getDb();
  db.prepare(`DELETE FROM unified_threads`).run();
}

// ─── Chat ───────────────────────────────────────────────────────

function createChatSession(id, title) {
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO chat_sessions (id, title) VALUES (?, ?)`).run(id, title);
}

function addChatMessage(sessionId, role, content) {
  const db = getDb();
  db.prepare(`INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)`).run(sessionId, role, content);
  db.prepare(`UPDATE chat_sessions SET message_count = message_count + 1, updated_at = datetime('now') WHERE id = ?`).run(sessionId);
}

function getChatMessages(sessionId) {
  const db = getDb();
  return db.prepare(`SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id`).all(sessionId);
}

function listChatSessions() {
  const db = getDb();
  return db.prepare(`SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 50`).all();
}

function deleteChatSession(sessionId) {
  const db = getDb();
  db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(sessionId);
}

// ─── News Intelligence ──────────────────────────────────────────

function markNewsRead(articleId) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO news_read (article_id) VALUES (?)`).run(articleId);
}

function getNewsReadIds() {
  const db = getDb();
  return new Set(db.prepare(`SELECT article_id FROM news_read`).all().map(r => r.article_id));
}

function upsertNewsNote(articleId, note) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO news_notes (article_id, note, updated_at) VALUES (?, ?, datetime('now'))`).run(articleId, note);
}

function getNewsNote(articleId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM news_notes WHERE article_id = ?`).get(articleId);
}

function getAllNewsNotes() {
  const db = getDb();
  return db.prepare(`SELECT * FROM news_notes`).all();
}

function upsertNewsAiCache(articleId, data) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO news_ai_cache (article_id, exec_summary, beanz_impact, ai_relevance, topics, model_used)
    VALUES (?, ?, ?, ?, ?, ?)`).run(articleId, data.execSummary, data.beanzImpact, data.aiRelevance, data.topics, data.modelUsed);
}

function upsertNewsEnrichment(articleId, data) {
  const db = getDb();
  // If row exists, update enrichment columns; otherwise insert a new row with enrichment only
  const existing = db.prepare(`SELECT article_id FROM news_ai_cache WHERE article_id = ?`).get(articleId);
  if (existing) {
    db.prepare(`UPDATE news_ai_cache SET enriched_summary = ?, brand_tags = ?, category_classification = ?, sentiment = ?, sentiment_score = ? WHERE article_id = ?`)
      .run(data.enrichedSummary, data.brandTags, data.categoryClassification, data.sentiment, data.sentimentScore, articleId);
  } else {
    db.prepare(`INSERT INTO news_ai_cache (article_id, enriched_summary, brand_tags, category_classification, sentiment, sentiment_score, model_used) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(articleId, data.enrichedSummary, data.brandTags, data.categoryClassification, data.sentiment, data.sentimentScore, data.modelUsed || 'claude-haiku-4-5-20251001');
  }
}

function getNewsAiCache(articleId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM news_ai_cache WHERE article_id = ?`).get(articleId);
}

function getAllNewsAiCache() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM news_ai_cache`).all();
  const map = {};
  rows.forEach(r => { map[r.article_id] = r; });
  return map;
}

function upsertNewsDigest(id, period, content, articleCount, modelUsed) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO news_digests (id, period, content, article_count, model_used, generated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(id, period, content, articleCount, modelUsed);
}

function getNewsDigest(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM news_digests WHERE id = ?`).get(id);
}

function getLatestNewsDigest(period) {
  const db = getDb();
  return db.prepare(`SELECT * FROM news_digests WHERE period = ? ORDER BY generated_at DESC LIMIT 1`).get(period);
}

function upsertNewsTopic(topic, count, snapshotDate) {
  const db = getDb();
  db.prepare(`INSERT INTO news_topics (topic, count, snapshot_date) VALUES (?, ?, ?)
    ON CONFLICT(topic, snapshot_date) DO UPDATE SET count=excluded.count`).run(topic, count, snapshotDate);
}

function getNewsTopicTrends(days) {
  const db = getDb();
  const dateFrom = new Date(Date.now() - (days || 14) * 86400000).toISOString().slice(0, 10);
  return db.prepare(`SELECT topic, snapshot_date, count FROM news_topics WHERE snapshot_date >= ? ORDER BY snapshot_date, topic`).all(dateFrom);
}

function insertCompetitorAlert(alert) {
  const db = getDb();
  db.prepare(`INSERT INTO news_competitor_alerts (competitor, severity, title, article_id, alert_type)
    VALUES (?, ?, ?, ?, ?)`).run(alert.competitor, alert.severity, alert.title, alert.articleId, alert.alertType);
}

function getCompetitorAlerts(days) {
  const db = getDb();
  const dateFrom = new Date(Date.now() - (days || 14) * 86400000).toISOString().slice(0, 10);
  return db.prepare(`SELECT * FROM news_competitor_alerts WHERE detected_at >= ? ORDER BY detected_at DESC`).all(dateFrom);
}

// ─── Comms Analytics ─────────────────────────────────────────────

function upsertAnalyticsSnapshot(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO comms_analytics_snapshots (snapshot_date, dimension, dimension_key, thread_count, message_count, avg_sentiment, action_required_count, categories, sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date, dimension, dimension_key)
    DO UPDATE SET thread_count=excluded.thread_count, message_count=excluded.message_count,
      avg_sentiment=excluded.avg_sentiment, action_required_count=excluded.action_required_count,
      categories=excluded.categories, sources=excluded.sources
  `).run(row.snapshotDate, row.dimension, row.dimensionKey, row.threadCount, row.messageCount,
    row.avgSentiment, row.actionRequiredCount, row.categories, row.sources);
}

function getAnalyticsSnapshots(dateFrom, dateTo, dimension) {
  const db = getDb();
  if (dimension && dimension !== 'all') {
    return db.prepare(
      `SELECT * FROM comms_analytics_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? AND dimension = ? ORDER BY snapshot_date, dimension_key`
    ).all(dateFrom, dateTo, dimension);
  }
  return db.prepare(
    `SELECT * FROM comms_analytics_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? ORDER BY snapshot_date, dimension_key`
  ).all(dateFrom, dateTo);
}

function upsertAnalyticsSummary(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO comms_analytics_summaries (snapshot_date, summary_type, summary_text, data_hash, model_used)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date, summary_type)
    DO UPDATE SET summary_text=excluded.summary_text, data_hash=excluded.data_hash, model_used=excluded.model_used
  `).run(row.snapshotDate, row.summaryType, row.summaryText, row.dataHash, row.modelUsed);
}

function getAnalyticsSummary(date, type) {
  const db = getDb();
  if (type) {
    return db.prepare(
      `SELECT * FROM comms_analytics_summaries WHERE snapshot_date = ? AND summary_type = ?`
    ).get(date, type);
  }
  return db.prepare(
    `SELECT * FROM comms_analytics_summaries WHERE snapshot_date = ?`
  ).all(date);
}

function getLatestSnapshotDate() {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(snapshot_date) as latest FROM comms_analytics_snapshots`).get();
  return row ? row.latest : null;
}

// ─── Project Intelligence Cache ──────────────────────────────

function upsertProjectIntelligence(projectId, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO project_intelligence_cache
      (project_id, health_score, health_summary, risk_flags, opportunity_flags, data_hash, model_used, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    projectId, data.healthScore || 0, data.healthSummary || '',
    JSON.stringify(data.riskFlags || []), JSON.stringify(data.opportunityFlags || []),
    data.dataHash || '', data.modelUsed || ''
  );
}

function getProjectIntelligenceIfFresh(projectId, dataHash) {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM project_intelligence_cache WHERE project_id = ? AND data_hash = ?`
  ).get(projectId, dataHash);
  if (!row) return null;
  return {
    healthScore: row.health_score,
    healthSummary: row.health_summary,
    riskFlags: JSON.parse(row.risk_flags || '[]'),
    opportunityFlags: JSON.parse(row.opportunity_flags || '[]'),
    dataHash: row.data_hash,
    modelUsed: row.model_used,
    generatedAt: row.generated_at
  };
}

function getClassificationsByProject(projectName) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM ai_classifications WHERE project_tags LIKE ? ORDER BY classified_at DESC`
  ).all('%' + projectName + '%');
}

// ─── Cleanup ───────────────────────────────────────────────────

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = {
  getDb,
  // Thread status (same API surface as before)
  setThreadStatus, getThreadStatuses, clearExpiredSnoozes,
  // New: permanent completion queries
  isThreadDone, getCompletedThreadIds, getCompletedThreads,
  // Dismissed
  dismissItem, undismissItem, getDismissedItems,
  // Pinned
  setPinned, getPinnedItems,
  // Action log
  logAction, getActionLog,
  // Learning: feedback & weights
  recordFeedback, getFeedbackHistory, getFeedbackForTarget,
  recomputeWeight, recomputeAllWeights, getInsightWeights, getWeightForTarget,
  // Learning: interactions & patterns
  recordInteraction, getInteractionPatterns, getInteractionStats,
  // Learning: alerts
  setAlert, checkAlerts, getAlerts, deleteAlert,
  // Learning: notes
  addNote, getNotes,
  // Learning: preferences
  setPreference, getPreferences,
  // Learning: migration & dashboard
  migrateLearningFromJson, getLearningDashboard,
  // AI Classifications
  upsertClassification, getClassification, getAllClassifications,
  getClassificationIfFresh, getCategoryCounts,
  // AI Summaries (cached)
  upsertSummary, getSummaryIfFresh,
  // AI Drafts
  insertDraft, getDraft, getDraftsForThread, getPendingDrafts, updateDraftStatus,
  // Unified Threads
  upsertUnifiedMatch, getUnifiedGroup, clearUnifiedMatches,
  // Chat
  createChatSession, addChatMessage, getChatMessages, listChatSessions, deleteChatSession,
  // News Intelligence
  markNewsRead, getNewsReadIds,
  upsertNewsNote, getNewsNote, getAllNewsNotes,
  upsertNewsAiCache, upsertNewsEnrichment, getNewsAiCache, getAllNewsAiCache,
  upsertNewsDigest, getNewsDigest, getLatestNewsDigest,
  upsertNewsTopic, getNewsTopicTrends,
  insertCompetitorAlert, getCompetitorAlerts,
  // Comms Analytics
  upsertAnalyticsSnapshot, getAnalyticsSnapshots,
  upsertAnalyticsSummary, getAnalyticsSummary, getLatestSnapshotDate,
  // Project Intelligence
  upsertProjectIntelligence, getProjectIntelligenceIfFresh, getClassificationsByProject,
  // Lifecycle
  closeDb
};
