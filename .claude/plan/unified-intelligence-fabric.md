# Implementation Plan: Unified Intelligence Fabric

Connect four new data sources (**Databricks metrics**, **Roasters Insights**, **News feeds — Coffee + AI**, **Jira project updates**) into four consumer surfaces (**Self-Learning**, **Obsidian Brain**, **Daily Digest**, **Summary Page**).

## Task Type
- [x] **Fullstack** (backend data plumbing + frontend rendering)

## Design Principles
1. **One canonical cache per source** under `kb-data/intelligence/*.json` (pattern already used for comms-live, email-live, metrics-live)
2. **Additive** — no rewrites of existing subsystems; each new input is an optional context key + new UI section
3. **Reuse existing seams** — `refresh-engine.js` for scheduled pulls, `daily-digest.js:gatherContextData()` for context assembly, `obsidian-sync.js` for vault materialisation, `learning-feedback` for signal capture
4. **Fail-soft** — a missing source must never break the digest/summary/brain; each input gets its own try/catch + status flag

---

## Phase 0 — Source Adapters (foundation, ~4h)

Before any consumer changes, each of the 4 inputs must have a stable JSON-cache + server endpoint.

### 0.1 Databricks Metrics — **already exists** (carry forward)
- Cache: `kb-data/intelligence/metrics-live.json` (✓ built in prior session)
- Endpoint: `/api/metrics` returns `snapshot` + flat `metrics` (✓)
- **New in this plan**: expose `/api/metrics/anomalies` that diffs current snapshot vs prior snapshot (stored in SQLite `metrics_snapshot_history` table) and returns a ranked list of period-over-period shocks (>15% swings, new >$100K country deltas, SLA regressions, etc.) — feeds digest "KPI Anomalies" + learning patterns.

### 0.2 Roasters Insights proxy — **new**
- **New file**: `server/routes/roasters-insights.js` — proxies relevant endpoints from `localhost:8000` (FastAPI) to the command-center, adds caching.
  - `GET /api/roasters-insights/overview` → cached from `:8000/api/overview` (15-min TTL)
  - `GET /api/roasters-insights/movements` → daily diff of `snapshot_dates[0]` vs `[1]`: price changes, new/removed products, top-5 brand moves (calls `:8000/api/trends/new-products/{date}` + `:8000/api/changes`)
  - `GET /api/roasters-insights/competitive-signals` → strong signals only (cross-brand clusters, pricing outliers) from `:8000/api/ai/reports`
- **New file**: `server/lib/roasters-insights-client.js` — a tiny HTTP client that calls the FastAPI app, with 2s timeout and graceful fallback to last cached file.
- Cache file: `kb-data/intelligence/roasters-insights-live.json` (refreshed daily at 06:00 by the scheduler)

### 0.3 News — already fetched, needs unified digest-shape endpoint
- Existing: `server/routes/news.js:/api/news/digest`, `server/routes/tech-news.js:/api/tech-news/digest` — both return different shapes. Summary page already filters `relevance_score > 0.5`.
- **New endpoint**: `server/routes/news.js` exports `/api/news/combined-digest?period=daily|weekly` that merges coffee news + tech news into a single priority-ranked list with: `[{title, source, domain:'coffee'|'ai', summary, published_at, relevance_score, roaster_mentioned?}]` — one shape to feed digest + summary + brain.

### 0.4 Jira cache + movements
- Existing: `server/routes/jira.js:/api/jira/recent?days=7` hits Jira API live (no cache).
- **New file**: `server/lib/jira-refresh.js` — runs every 30 min, writes `kb-data/intelligence/jira-live.json` with `{sprints, recentMovements, blockers, epicProgress, lastRefresh}`.
- **Extend refresh-engine.js**: add `refreshJira()` on 30-min interval.
- `routes/jira.js` adds `/api/jira/movements` reading from the cache; existing live endpoints keep passing through for on-demand fetches.

**Deliverable of Phase 0**: four canonical JSON caches + stable backend endpoints. Zero frontend changes yet. Validate each endpoint individually (curl).

---

## Phase 1 — Self-Learning extensions (~2h)

Current weights live in SQLite `learning_weights` keyed by arbitrary `target` strings (insight IDs). The learning surface already accepts `type ∈ {insight, metric, news}` — we just need to register a handful of new target types and wire feedback into them.

### 1.1 New feedback target types
- `roaster:<id>` — pin/dismiss/thumbs on Roasters Insights cards shown in Summary/Digest
- `jira-move:<issueKey>` — thumbs on Jira movement cards
- `anomaly:<metric>` — feedback on Databricks anomaly alerts (signals whether the anomaly was actually noteworthy)
- existing `news:<articleId>` — reused unchanged

### 1.2 Pattern derivation — extend `server/lib/db.js:derivePatterns()` (around line 1039)
- Add pattern: "user dismisses repeated X-country Jira movements" → suppress that country filter
- Add pattern: "user consistently pins Roaster:ONYX updates" → elevate ONYX to a `followed_roasters` preference
- Add pattern: "anomaly feedback negative rate > 60% over 5 signals" → widen anomaly threshold from 15% → 25%

### 1.3 Alert table extension
- Add `alert_scope` column to `learning_alerts` (default `'metric'`, new values `'roaster'`, `'news-topic'`, `'jira-epic'`) so the existing alert UI can set alerts on non-metric targets.

### 1.4 Weight consumption
- `getLearningDashboard()` already aggregates weights — no change needed.
- `learning.js` frontend feedback calls already POST to `/api/feedback` — just extend frontend to emit target strings in the new format when rendering new cards.

**Deliverable**: `feedbackStore` accepts the 4 new target namespaces; patterns derive from them; users see their feedback shape Summary ranking.

---

## Phase 2 — Obsidian Brain expansion (~3h)

`obsidian-sync.js` (around line 1369-1411) already generates sections. We add 4 new page generators and extend 2 existing sections.

### 2.1 New pages (materialise once per daily sync)
| Path | Source | Update cadence |
|------|--------|----------------|
| `400-Coffee-Intelligence/Roaster-Insights-Weekly.md` | `/api/roasters-insights/movements` (7-day window) | Daily |
| `400-Coffee-Intelligence/Competitive-Signals.md` | `/api/roasters-insights/competitive-signals` | Daily |
| `600-Strategy/Databricks-KPI-Live.md` | `kb-data/intelligence/metrics-live.json` (KPI block) | Daily |
| `600-Strategy/KPI-Anomalies.md` | `/api/metrics/anomalies` | Daily |
| `200-Projects/_Jira-Movements-This-Week.md` | `kb-data/intelligence/jira-live.json` | Daily |

Each page uses a standard frontmatter block: `type: intelligence-page`, `source:`, `last_refreshed:`, `tags: [auto-generated, <source>]`.

### 2.2 Extend existing sections
- `400-Coffee-Intelligence/`: the current page is static roaster list. **Add** `News-Pulse.md` — top 20 coffee articles from last 7 days (from new `/api/news/combined-digest?period=weekly&domain=coffee`).
- `500-AI-Tech-Intelligence/`: add `AI-News-Pulse.md` — same shape, `domain=ai`.
- `900-Learning/`: add `Recent-Feedback-Signal-Report.md` — last 30 days of feedback segmented by target type (insight/roaster/anomaly/jira) so the user can audit what the brain "learnt".

### 2.3 RAG index impact
- No code change needed — the RAG index rebuilds every 5 minutes and picks up the new files automatically.
- **Verify**: boost config in `obsidian-rag.js` already includes 400, 500, 600, 900 sections — no changes to search weighting required.

**Deliverable**: running `/api/obsidian/sync` materialises 5 new intelligence pages; chat can answer "what changed at ONYX this week?" or "what metric anomalies did we see?" using the indexed vault.

---

## Phase 3 — Daily Digest augmentation (~3h)

Add 4 new context gatherers + extend the Anthropic prompt schema with 3 new output sections.

### 3.1 New `gatherContextData()` blocks — `server/routes/daily-digest.js:118-289`

Insert in this order (fail-soft, each in its own try/catch, status flag written to `context.sources`):

```js
// After existing news block (line 241)
try {
  const combined = await fetch(`${base}/api/news/combined-digest?period=daily`).then(r => r.json());
  context.newsDigest = { coffee: combined.coffee || [], ai: combined.ai || [], combined: combined.items || [] };
  context.sources.news = 'ok';
} catch (e) { context.sources.news = 'error: ' + e.message; }

// After existing Jira block (~line 254)
try {
  const jira = readJSON(path.join(ctx.intelDir, 'jira-live.json'));
  context.jiraMovements = jira ? { sprints: jira.sprints, movements: jira.recentMovements, blockers: jira.blockers } : null;
  context.sources.jira = jira ? 'ok' : 'stale';
} catch (e) { context.sources.jira = 'error: ' + e.message; }

// NEW — Databricks anomalies
try {
  const anomalies = await fetch(`${base}/api/metrics/anomalies`).then(r => r.json());
  context.metricsAnomalies = anomalies.anomalies || [];
  context.sources.databricks = 'ok';
} catch (e) { context.sources.databricks = 'error: ' + e.message; }

// NEW — Roasters Insights
try {
  const ri = await fetch(`${base}/api/roasters-insights/movements`).then(r => r.json());
  context.roasterIntel = ri;
  context.sources.roastersInsights = 'ok';
} catch (e) { context.sources.roastersInsights = 'unavailable'; }
```

### 3.2 Extend prompt schema — `server/routes/daily-digest.js:292-361`

Add three new output sections to the JSON template in `buildDigestPrompt()`:

- **`industryPulse`** (1–2 headlines each for Coffee + AI) — 2 bullets
- **`competitiveSignals`** (strongest 3 roaster moves with source + Beanz implication) — 3 bullets
- **`kpiAnomalies`** (Databricks anomalies worth flagging, with suggested owner for each) — up to 5 bullets

Update `parseDigestResponse()` to pass through the new keys.

### 3.3 Frontend renderer — `js/mod-digest.js`

Add 3 new section blocks after the existing 8 (pattern already established at `mod-digest.js:90-264`). Each section:
- Title + icon + count badge
- List rendering pattern reused from existing sections
- Feedback buttons (pin/thumbs) wired to new target types from Phase 1

### 3.4 Source-status chip
- Extend the `source_status` pill row at the top of the digest to show the 4 new sources (Databricks, Roasters Insights, News-Combined, Jira) with coloured dots.

**Deliverable**: digest produces 3 new sections with real data; running "Generate Now" produces an 11-section payload.

---

## Phase 4 — Summary page new cards (~3h)

Three new cards, inserted between existing "Strategy & Correlations" and "Project Pulse" (around `mod-summary.js` line 190).

### 4.1 Card: "Industry Pulse"
- Two columns: Coffee (left, 4 items) / AI & Tech (right, 4 items) — pulled from `/api/news/combined-digest?period=daily`
- Each item: source domain, title, one-sentence AI summary, relevance score
- Feedback: thumbs on each card → `news:<articleId>` (existing target type)

### 4.2 Card: "Competitive Roaster Moves"
- Top 5 moves from `/api/roasters-insights/movements` (new products, price changes, promotions)
- Format: `<roaster> — <move> <delta>` with timestamp + market chip
- Feedback: pin/dismiss → `roaster:<id>` (new target type)
- Link: "Explore" button → switches to Roasters Insights tab deep-linked to the roaster

### 4.3 Card: "KPI Anomalies"
- From `/api/metrics/anomalies`, ranked by severity
- Format: `<metric> <direction arrow> <delta>% vs prior <period>` — colour-coded by severity
- Click: drill into Metrics → Explore tab pre-filtered
- Feedback: thumbs → `anomaly:<metric>` (new target type)

### 4.4 Extend "Jira Sprint Status" card (not a new card — augment)
- Existing card at `mod-summary.js:256-283` — add a "Last 7 days" secondary block showing top 5 movements (status transitions, newly blocked, done → in-review) from `kb-data/intelligence/jira-live.json`.

**Deliverable**: 3 new cards, 1 augmented card, all consuming Phase-0 caches, all wired to learning feedback.

---

## Phase 5 — Scheduling & Ops (~1h)

### 5.1 `refresh-engine.js` additions
- `refreshDatabricks()` — daily at 05:00, regenerates `metrics-live.json` (calls existing `scripts/refresh-metrics.js` logic in-process)
- `refreshRoastersInsights()` — daily at 06:00, hits proxy routes and writes cache
- `refreshJira()` — every 30 min (as above)
- News keeps its existing 24h schedule

### 5.2 Startup snapshot
- On server start, if `roasters-insights-live.json` is missing or >48h stale, refresh once. Same pattern as existing `pbi-live.json`.

### 5.3 Health endpoint
- Extend `/api/status` to report freshness of all intelligence files (dated OK / stale / missing).

---

## Key Files Map

| File | Operation | Phase | Description |
|------|-----------|-------|-------------|
| `server/lib/roasters-insights-client.js` | Create | 0.2 | Thin HTTP client for localhost:8000 |
| `server/routes/roasters-insights.js` | Create | 0.2 | Proxy routes + caching |
| `server/lib/jira-refresh.js` | Create | 0.4 | Scheduled Jira cache writer |
| `server/routes/jira.js` | Extend | 0.4 | Add `/api/jira/movements` reading cache |
| `server/routes/news.js` | Extend | 0.3 | Add `/api/news/combined-digest` |
| `server/routes/metrics.js` | Extend | 0.1 | Add `/api/metrics/anomalies` + history table |
| `server/lib/db.js` | Extend | 1.1, 1.3 | New target-type validation + `alert_scope` column |
| `server/lib/db.js:derivePatterns()` | Extend | 1.2 | New pattern detectors |
| `server/lib/obsidian-sync.js` | Extend | 2.1, 2.2 | 5 new page generators + 2 section extensions |
| `server/routes/daily-digest.js:gatherContextData` | Extend | 3.1 | 4 new try/catch blocks |
| `server/routes/daily-digest.js:buildDigestPrompt` | Extend | 3.2 | 3 new JSON sections |
| `js/mod-digest.js` | Extend | 3.3 | 3 new section renderers |
| `js/mod-summary.js` | Extend | 4.1–4.4 | 3 new cards + augment Jira card |
| `js/learning.js` | Extend | 1.4 | Emit new target-type feedback |
| `server/lib/refresh-engine.js` | Extend | 5.1 | 3 new refresh functions + intervals |
| `server/routes/status.js` | Extend | 5.3 | Freshness report |
| `server/server.js` | Extend | 0.2, 5.1 | Mount new routes + register schedulers |

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Roasters Insights backend down → digest/summary stall | 2s timeout + fall back to cached `roasters-insights-live.json`; flag `source_status: 'stale'` |
| Databricks MCP not callable from the long-running server | Use the already-written `scripts/refresh-metrics.js` via `child_process.spawn` from `refreshDatabricks()` (uses `.env` creds if present, else retains last snapshot) |
| Digest prompt grows too long (context blow-up) | Cap each new context key: anomalies ≤ 10, news ≤ 20, movements ≤ 15, Jira ≤ 15 items — truncate before injection |
| Learning table noise from new sources | `feedback_count` is tracked per target; patterns only fire above 5-signal threshold (already enforced in `derivePatterns`) |
| Anthropic token spend grows with prompt size | Extract `buildDigestPrompt` into two calls if combined context exceeds 120K tokens: first call summarises context, second generates digest |
| Obsidian vault bloats with daily-regenerated pages | Generator pattern is idempotent (overwrites in place); no history kept in vault — history lives in SQLite |
| Frontend card density overwhelms summary page | Make the 3 new cards collapsible + remember collapsed state in `learning_preferences` |

---

## Rollout Order (Recommended)

1. **Phase 0** — get all 4 data caches populated and curl-verified, merge to main
2. **Phase 3** — digest first (it's the easiest payoff; stakeholder-visible)
3. **Phase 4** — summary cards (visual confirmation of data)
4. **Phase 2** — Obsidian pages (invisible until chat queries hit them)
5. **Phase 1** — learning signals (requires Phase 3 + 4 cards to be live)
6. **Phase 5** — scheduling + ops (last, because up to this point everything can be manually triggered)

Estimated total: **~15 hours** engineering, split across 5 PRs aligned to phases.

---

## SESSION_ID (for /ccg:execute use)
- Not applicable — external model wrappers (`~/.claude/bin/codeagent-wrapper`) are not installed on this machine; plan was synthesised from Explore-agent reports and in-session codebase knowledge without Codex/Gemini dispatch.
- CODEX_SESSION: N/A
- GEMINI_SESSION: N/A
