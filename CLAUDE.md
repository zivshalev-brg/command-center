# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beanz OS Command Center — executive intelligence dashboard for Beanz (coffee subscription platform, part of Breville Group). Unifies Slack, Outlook email, calendar, projects, people, Power BI metrics, strategic correlations, news, and coffee intelligence into a single interface with AI-powered classification, summarisation, and drafting.

## Running the Application

```bash
# Start the server (serves frontend + API on port 3737)
node server/server.js

# Or via npm
npm start
```

Open `http://localhost:3737` in a browser. The server auto-starts background refresh schedulers for Slack (60s), Outlook (2min), CIBE scraping (daily/weekly), and news (daily).

## Architecture

### Frontend (No build step, no framework)

Single HTML entry point (`index.html`) loads vanilla JS modules via `<script>` tags in dependency order. No bundler, no transpiler, no npm frontend dependencies.

**Script load order matters** — later scripts depend on globals from earlier ones:
```
data.js → state.js → mod-*.js → comms-*.js → charts.js → toast.js → learning.js → modal.js → actions.js → palette.js → shortcuts.js
```

**Global objects:**
- `DATA` — all application data (comms threads, calendar, projects, people, metrics). Populated from `data.js` (static) and `loadCommsLive()` (dynamic API fetch).
- `state` — UI state (selected module/thread/person, filters, panel state). Mutated directly or via `setState(key, val)` which triggers `renderAll()`.
- `renderAll()` — central render dispatch. Reads `state.module` and calls the appropriate `render{Module}Sidebar()` + `render{Module}Main()` pair.

**Module pattern:** Each tab has a `mod-{name}.js` file exporting `render{Name}Sidebar()` and `render{Name}Main()`. The Comms module is split into sub-files:
- `comms-inbox.js` — thread list (Gmail-style rows, source filtering, search)
- `comms-reading.js` — reading pane (message cards, AI summary, reply bar)
- `comms-compose.js` — email composer overlay
- `comms-drafts.js` — AI draft generation API calls

**9 Tabs:** Daily Summary (1), Comms (2), Calendar (3), Projects (4), People (5), Metrics (6), Strategy (7), News (8), Intel (9). Keyboard shortcuts 1-9 switch tabs.

### Backend (`server/`)

Pure Node.js HTTP server (no Express). Custom `.env` parser, custom static file serving, custom API router.

**Entry point:** `server/server.js` — creates HTTP server, parses `.env`, builds shared `ctx` object passed to all route handlers.

**Routing pattern:** `handleAPI()` inspects URL path segments and dispatches to route handler functions. Each handler receives `(req, res, parts, url, ctx)`.

**Route files** (`server/routes/`): `comms.js`, `metrics.js`, `strategy.js`, `cibe.js`, `intelligence.js`, `powerbi-live.js`, `feedback.js`, `jira.js`, `news.js`, `slack.js`, `status.js`, `projects.js`, `digest.js`.

**Library files** (`server/lib/`): API clients (Slack, Outlook/Graph, Jira, Confluence, Power BI), AI integration (classifier, drafter, summariser via Anthropic API), refresh engine, database, thread matcher, news engine, CIBE scraping.

### Data Flow

1. **Refresh engine** (`server/lib/refresh-engine.js`) polls Slack and Outlook on intervals, writes to `comms-live.json` and `email-live.json`
2. **`GET /api/comms`** merges live Slack + email data, applies thread matching, returns unified thread list
3. **`loadCommsLive()`** (client, in `actions.js`) fetches `/api/comms`, merges into `DATA.comms.threads`, calls `enrichThreadsClient()` for project/people linking, then re-renders
4. **AI enrichment**: Thread classification, summarisation, and draft generation happen server-side via Anthropic Claude API

### Database

SQLite via `better-sqlite3` (`beanz-os.db`). WAL mode. Schema defined in `server/lib/db.js`.

Key tables: `thread_status`, `completed_threads`, `dismissed_items`, `pinned_items`, `feedback`, `insights`, `actions` (audit log), `learning_store`.

### Self-Learning Engine

User feedback (pin/dismiss/thumbs up/down) adjusts insight weights stored in SQLite. Weights influence ranking of correlations, metrics, and suggestions. Tracked via `POST /api/feedback` and `server/lib/learning.js`.

## Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/comms` | GET | Unified inbox (Slack + email threads) |
| `/api/comms/summary/:id` | GET | AI thread summary (classify + summarise + quick replies) |
| `/api/comms/draft/:id` | POST | AI draft generation |
| `/api/comms/send` | POST | Send email via Graph API |
| `/api/comms/attachments/:id` | GET | Message attachment metadata |
| `/api/slack/send` | POST | Send Slack message |
| `/api/slack/react` | POST | Add Slack emoji reaction |
| `/api/strategy` | GET | Strategic correlations with adaptive weights |
| `/api/metrics` | GET | Power BI live metrics |
| `/api/refresh/now` | POST | Trigger manual refresh |
| `/api/refresh/status` | GET | Refresh engine status |
| `/api/feedback` | POST | Submit user feedback |
| `/api/cibe/*` | GET | Coffee Intelligence (roasters, briefings, anomalies) |

## External Integrations

All credentials in `.env`. Never hardcode tokens.

- **Slack**: Dual-token architecture — `SLACK_USER_TOKEN` (xoxp-) for reads, `SLACK_BOT_TOKEN` (xoxb-) for writes
- **Microsoft Graph (Outlook)**: OAuth2 delegated flow. Auth at `/auth/outlook`, callback at `/auth/callback`. Tokens cached in `.ms-tokens.json`
- **Anthropic Claude API**: Server-side only, used by `ai-classifier.js`, `ai-drafter.js`, `ai-summariser.js`
- **Atlassian (Jira/Confluence)**: Basic auth with API token
- **Power BI**: SSO token captured by external `beanz-digest` tool

## Conventions

- **No frontend build step.** Edit JS/CSS files directly; refresh the browser.
- **HTML rendering via string concatenation.** All UI is built by constructing HTML strings and setting `innerHTML`. Use `encodeHtml()` for user-supplied text.
- **Comms thread IDs** are string keys in `DATA.comms.threads`. Slack threads use `slack-{channelId}-{threadTs}` format; email threads use Graph message IDs.
- **Null safety in Slack data.** Slack API can return null participant names in thread.people arrays. Always guard with `if (!name) return;` in loops over people arrays.
- **`enrichThreadsClient()`** runs after every data load — links threads to projects/people, computes smart scores. Errors here silently prevent rendering if not caught.
- **CSS design tokens** are CSS custom properties defined at the top of `css/styles.css` (e.g., `--ac`, `--bg`, `--tx`, `--s3`). Dark theme is default; `.light` class on body toggles light theme.
- **`$()` is `getElementById`**, not jQuery. Defined in `state.js`.

## Knowledge Base

`kb-data/` contains 24 domain directories with JSON files (team directory, project updates, Power BI context, strategy docs). These are read by server routes to provide context-aware intelligence. The `kb-data/intelligence/` directory also stores live data files (`comms-live.json`, `email-live.json`) written by the refresh engine.
