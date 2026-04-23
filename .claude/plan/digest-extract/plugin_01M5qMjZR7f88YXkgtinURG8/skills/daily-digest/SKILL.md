---
name: daily-digest
description: >
  Automated intelligence briefing for beanz.com leadership. Use when the user
  says "daily digest", "morning briefing", "what happened today", "catch me up",
  "weekly digest", "weekly summary", "weekly wrap", "monthly digest", "monthly
  summary", "month in review", "what did I miss", "digest", "briefing",
  "intelligence report", "what's happening with Beanz", "Beanz update",
  "give me the rundown", or any request for a summary of Beanz activity across
  multiple sources.
---

# Beanz Daily Digest

Scan **7 sources** — Outlook, Teams, SharePoint, Slack, Jira, Mixpanel, and BeanzGenie — then synthesise a structured digest calibrated to the time horizon.

**Source inventory:**
| # | Source | MCP Connector | Key Tools |
|---|---|---|---|
| 1 | Outlook (email) | Microsoft 365 | `outlook_email_search`, `read_resource` (mail URI) |
| 2 | Outlook (calendar) | Microsoft 365 | `outlook_calendar_search`, `read_resource` (calendar URI) |
| 3 | Teams (chat) | Microsoft 365 | `chat_message_search`, `read_resource` (teams URI, meeting-transcript URI) |
| 4 | SharePoint (docs) | Microsoft 365 | `sharepoint_search`, `sharepoint_folder_search`, `read_resource` (file URI) |
| 5 | Slack | Slack | `slack_search_public_and_private`, `slack_read_channel`, `slack_read_thread` |
| 6 | Jira | Atlassian | `searchJiraIssuesUsingJql`, `getJiraIssue`, `getVisibleJiraProjects` |
| 7 | Mixpanel | Mixpanel | `Run-Query`, `Get-Events`, `Get-Query-Schema`, `Get-Report`, `List-Dashboards` |
| 8 | BeanzGenie | Databricks Genie | `query_space_*`, `poll_response_*` |

**Cross-source intelligence rules:**
- **Revenue triangulation:** BeanzGenie SkuAmount is the source of truth for revenue. Mixpanel `Orders` event is the source of truth for conversion behaviour. If Mixpanel order count is significantly different from BeanzGenie, investigate which filters differ.
- **Project status triangulation:** Jira tracks issue-level progress. Slack #beanz-project-updates tracks team narrative. Cross-reference: if Jira shows a project stalling but Slack updates say "on track", flag the discrepancy.
- **Communication coverage:** Email is primary for external/corporate comms. Teams is primary for BRG cross-functional. Slack is primary for the Beanz team. SharePoint is primary for documents. Always surface unique intel from each source — don't assume everything is duplicated.
- **Decision tracking:** Decisions may appear in email (approvals), Teams (meeting follow-ups), Slack (channel discussions), or Jira (status transitions). Deduplicate decisions across sources and report the most authoritative version with all sources cited.

## Step 1: Detect Time Horizon

Before gathering data, determine the digest type from the **current date** and any user override.

### Auto-Detection Rules

| Condition | Digest Type | Lookback Window | Depth |
|---|---|---|---|
| 1st of the month (any day of week) | **Monthly** | Full previous calendar month | Deep — trends, MoM comparisons, cohort shifts, full project lifecycle |
| Monday (and NOT 1st of month) | **Weekly** | Previous 7 days (Mon–Sun) | Medium — weekly velocity, sprint progress, WoW comparisons |
| Any other day | **Daily** | Previous 24 hours | Light — yesterday's activity, overnight changes, today's priorities |

### User Override

If the user explicitly requests a different horizon ("give me the weekly digest" on a Wednesday, or "monthly summary" on the 15th), honour the override. Set the lookback window accordingly:

- **Daily override**: previous 24 hours from now
- **Weekly override**: previous 7 calendar days
- **Monthly override**: previous full calendar month (1st to last day)

### Date Variables

Calculate and use these throughout:

```
TODAY          = current date (YYYY-MM-DD)
YESTERDAY      = TODAY - 1 day
WEEK_START     = most recent Monday (or TODAY - 6 days for rolling 7-day)
WEEK_END       = most recent Sunday
MONTH_START    = 1st day of previous month
MONTH_END      = last day of previous month
CURRENT_MONTH  = 1st day of current month
```

Announce the detected horizon at the start: "Generating **[Daily/Weekly/Monthly]** digest for [date range]..."

---

## Step 2: Gather Data from All Sources

Execute sources in priority order. If a source fails, log the failure and continue — never block the entire digest on one source.

**Source execution order and priority:**

| Priority | Source | Section | Why This Order |
|---|---|---|---|
| 1 | **Mixpanel** (pre-flight) | 2.4.0 | Validate events exist before querying |
| 2 | **BeanzGenie** | 2.5 | Revenue/subscription numbers are the backbone |
| 3 | **Mixpanel** (queries) | 2.4.1–2.4.5 | Traffic/funnel data complements BeanzGenie |
| 4 | **Outlook** (email + calendar) | 2.1 | Inbox highlights need to be fresh |
| 5 | **Teams** | 2.1b | Catches comms outside Slack/email |
| 6 | **SharePoint** | 2.1c | Documents change less frequently |
| 7 | **Slack** | 2.2 | Structured updates from #beanz-project-updates |
| 8 | **Jira** | 2.3 | Project progress — complements Slack updates |

**Parallelisation tip:** Sources 2+3 (BeanzGenie + Mixpanel queries) are independent and can run simultaneously if the agent supports parallel tool calls. Similarly, sources 4+5+6 (Outlook + Teams + SharePoint) can run in parallel since they all use the Microsoft 365 connector.

### 2.1 Outlook (Microsoft 365)

**Tool:** `Microsoft 365:outlook_email_search`

**Daily:** Search for emails from the last 24 hours matching Beanz-related terms.
**Weekly:** Search for emails from the past 7 days.
**Monthly:** Search for emails from the previous calendar month.

**Search terms** (use multiple queries if needed):
- `Beanz OR beanz.com OR "coffee subscription"`
- `FTBP OR "Fast Track" OR PBB OR "Powered by Beanz"`
- `"Project Feral" OR "Operation Freedom" OR "NL rollout"`
- `roaster OR Platinum OR MOT OR "Brand Summit"`
- Sender names: Travis, Hugh, Justin, Sophie, Candi, Andrew Sirotnik, Cliff, Jim, Jennifer, Josh, Easwar, Kevin Bauer, Nell Welch, Ali Inayat, Slade, Pam Liang

**Also check calendar** with `Microsoft 365:outlook_calendar_search`:
- Today's meetings (daily)
- This week's meetings (weekly)
- Key meetings from previous month (monthly)

**Calendar search queries:**
```
Tool: Microsoft 365:outlook_calendar_search
query: "Beanz"
afterDateTime: "{YESTERDAY}" / "{WEEK_START}" / "{MONTH_START}"
beforeDateTime: "{TODAY}" / "today" / "{MONTH_END}"
limit: 20
```

Also search for: `"Feral"`, `"PBB"`, `"Operation Freedom"`, `"coffee"`, `"NL rollout"`.

**Read full calendar event details** for important meetings:
```
Tool: Microsoft 365:read_resource
Parameter: uri = "calendar:///events/{eventId}"
```

**Extract from calendar events:** meeting subject, attendees, time, location/Teams link, agenda notes, and any attached documents.

**Meeting transcripts** (if available for Teams meetings):
```
Tool: Microsoft 365:read_resource
Parameter: uri = "meeting-transcript:///{meetingId}"
```

If transcripts are available, extract: key decisions, action items, mentions of Beanz/Feral/PBB, and any commitments with deadlines.

**Extract per email:** sender, subject, date, 1–2 sentence summary, action required (yes/no + what).

**For weekly/monthly:** Group by theme (Project Feral, Operation Freedom, PBB, FTBP, Roaster partnerships, NL rollout, Other).

#### 2.1.3 Full Email Content Extraction

After identifying key emails via `outlook_email_search`, use `Microsoft 365:read_resource` to read the full body of the most important ones (max 10 per digest run to stay within rate limits).

**How to read full email content:**
```
Tool: Microsoft 365:read_resource
Parameter: uri = "mail:///messages/{messageId}"
```

The `messageId` is returned in the search results. Read full content for:
- Emails flagged as "Action Required"
- Emails from key stakeholders (Travis, Justin, Andrew Sirotnik, Nell Welch, Ali Inayat)
- Emails with subjects containing "decision", "approval", "deadline", "launch"
- Emails with attachments (use the full body to understand attachment context)

**Extract from full body:** specific action items, deadlines, decisions, approval requests, and any embedded data or links.

---

### 2.1b Microsoft Teams Chat Messages

**Tool:** `Microsoft 365:chat_message_search`

Search Teams chats for Beanz-related discussions that may not appear in Slack or email. Many cross-functional conversations happen in Teams, especially with BRG corporate stakeholders.

**Daily:** Search last 24 hours.
**Weekly:** Search last 7 days.
**Monthly:** Search previous calendar month.

**Search queries (run each separately):**
```
Query: "Beanz OR beanz.com OR coffee subscription"
afterDateTime: "{YESTERDAY}" (daily) / "{WEEK_START}" (weekly) / "{MONTH_START}" (monthly)
limit: 25
```
```
Query: "Project Feral OR Operation Freedom OR NL rollout"
afterDateTime: "{lookback_start}"
limit: 25
```
```
Query: "FTBP OR PBB OR Powered by Beanz"
afterDateTime: "{lookback_start}"
limit: 25
```
```
Query: "roaster OR Platinum OR Brand Summit OR MOT"
afterDateTime: "{lookback_start}"
limit: 15
```

**Filter by key senders** (if results are noisy, add `sender` param):
- Andrew Sirotnik, Nell Welch, Ali Inayat, Kevin Bauer, Pam Liang (more likely to use Teams than Slack)

**Read full message content** when a search result looks important:
```
Tool: Microsoft 365:read_resource
Parameter: uri = "teams:///chats/{chatId}/messages/{messageId}"
```

**Extract:** decisions, action items, meeting follow-ups, escalations. Flag any Teams message that contradicts or adds context to Slack/email information.

**For weekly/monthly:** Group Teams findings alongside email in the INBOX HIGHLIGHTS section. Tag source as `[Teams]` vs `[Email]` vs `[Slack]`.

---

### 2.1c SharePoint Documents

**Tools:** `Microsoft 365:sharepoint_search`, `Microsoft 365:sharepoint_folder_search`, `Microsoft 365:read_resource`

Search SharePoint for recently modified Beanz-related documents, reports, and meeting notes.

**Step 1: Search for recent documents**
```
Tool: Microsoft 365:sharepoint_search
Parameter: query = "Beanz OR FTBP OR Feral OR PBB"
Parameter: afterDateTime = "{lookback_start}T00:00:00Z" (ISO 8601)
Parameter: limit = 20
```

**Additional targeted searches:**
```
query: "coffee subscription report"
query: "Operation Freedom"
query: "NL rollout Netherlands"
query: "Brand Summit"
```

**Step 2: Search known folders**
```
Tool: Microsoft 365:sharepoint_folder_search
Parameter: name = "Beanz"
```
```
name = "Feral"
```
```
name = "Coffee"
```

**Step 3: Read key documents**
For important documents found in search results:
```
Tool: Microsoft 365:read_resource
Parameter: uri = "file:///{driveId}/{itemId}"
```

**Priority documents to surface:**
- Meeting notes or minutes (especially steering committee, sprint reviews)
- Updated project plans, timelines, or Gantt charts
- Financial reports, budget updates, revenue summaries
- Presentation decks shared recently (Brand Summit, quarterly reviews)
- Policy or process documents that were recently modified

**Daily:** Only surface documents modified in the last 24h.
**Weekly:** Documents modified in the last 7 days, grouped by project.
**Monthly:** All documents from the previous month, highlighting new/major revisions vs minor edits.

**Extract per document:** title, author, last modified date, folder path, 1-sentence summary of what changed.

**Report in digest as a new section under INBOX HIGHLIGHTS or as a standalone "📄 RECENT DOCUMENTS" section.**

---

### 2.2 Slack

**Tools:** `Slack:slack_search_public_and_private`, `Slack:slack_search_channels`, `Slack:slack_read_channel`, `Slack:slack_read_thread`

#### Step 2.2.1: Find channels

Search for channels containing: `beanz`, `feral`, `pbb`, `coffee`, `roaster`. Cache the channel IDs.

Key channels to always check:
- `#beanz-project-updates` — structured project updates (machine-parseable, follows standup template)
- `#project-feral` — main Feral channel
- `#feral-experiments`, `#feral-data`, `#feral-dev`
- Any channel with `beanz` in the name

#### Step 2.2.2: Read recent messages

**Daily:** Read last 24h of messages from each key channel.
**Weekly:** Read last 7 days. Focus on threads with replies (indicates active discussion).
**Monthly:** Search for key terms across the full month. Focus on decisions, milestones, and blockers.

#### Step 2.2.3: Parse structured updates

Messages in `#beanz-project-updates` follow a specific template with these parseable sections:
- `*— METADATA —*` → Phase, Completion %, Status, Target Date
- `*— COMPLETED TODAY —*` → Task name, Deliverable, Location, Involved, Impact
- `*— IN PROGRESS —*` → Task name, % complete, Expected completion, Dependencies, Confidence
- `*— BLOCKERS & RISKS —*` → Active blockers, Risks with likelihood
- `*— DECISIONS —*` → Made today, Needed, Scope/timeline changes
- `*— FORWARD LOOK —*` → Tomorrow's priorities, Upcoming milestones

Extract these fields programmatically. For weekly/monthly digests, track completion % changes over time and identify velocity trends.

#### Step 2.2.4: Surface decisions and blockers

Across ALL channels, flag:
- Any message containing: "decided", "decision", "approved", "blocked", "blocker", "risk", "deadline", "launch", "delayed", "moved", "cancelled", "escalate"
- Any thread with 5+ replies (indicates active debate)
- Any message from leadership or key stakeholders

---

### 2.3 Jira (Atlassian)

**Tools:** `Atlassian:searchJiraIssuesUsingJql`, `Atlassian:getJiraIssue`, `Atlassian:getVisibleJiraProjects` (deferred — use `tool_search` to load first)

#### Step 2.3.1: Discover Beanz projects

First, use `Atlassian:getVisibleJiraProjects` to find all accessible projects. Look for projects with keys or names containing: BEANZ, BNZ, FERAL, PBB, FREEDOM, NL, COFFEE, or any Beanz-related term.

Cache project keys for use in JQL queries.

#### Step 2.3.2: Project-level progress (CRITICAL — not just issues)

For EACH Beanz-related project found, gather:

**a) Project health overview:**
```jql
project = {KEY} ORDER BY updated DESC
```
- Count total issues by status (To Do, In Progress, In Review, Done, Blocked)
- Calculate: % complete = Done / Total
- Identify: issues in "Blocked" or equivalent status

**b) Recent activity (scoped to time horizon):**

Daily:
```jql
project = {KEY} AND updated >= -1d ORDER BY updated DESC
```

Weekly:
```jql
project = {KEY} AND updated >= -7d ORDER BY updated DESC
```

Monthly:
```jql
project = {KEY} AND updated >= -30d ORDER BY updated DESC
```

**c) Sprint progress** (if the project uses sprints):
```jql
project = {KEY} AND sprint in openSprints() ORDER BY priority DESC
```
Extract: sprint name, sprint goal, days remaining, issues completed vs remaining, burndown trajectory.

**d) Velocity indicators:**

For weekly/monthly, compare:
- Issues closed this period vs previous period
- Average time in "In Progress" status
- New issues created vs resolved (inflow vs outflow)

**e) Critical path items:**
```jql
project = {KEY} AND priority in (Critical, Highest, Blocker) AND status != Done ORDER BY priority DESC
```

**f) Recently completed (wins):**
```jql
project = {KEY} AND status changed to Done DURING ({PERIOD_START}, {PERIOD_END}) ORDER BY updated DESC
```

#### Step 2.3.3: Cross-project summary

Build a project-by-project summary table:

| Project | Total Issues | Done | In Progress | Blocked | % Complete | Sprint | Velocity Trend |
|---|---|---|---|---|---|---|---|
| FERAL | 42 | 18 | 12 | 2 | 43% | Sprint 5 | ↑ improving |
| PBB | 28 | 22 | 4 | 0 | 79% | — | → steady |

#### Step 2.3.4: Issue-level highlights

After project summaries, list individual issue highlights:
- Status transitions (especially → Done, → Blocked)
- New critical/high priority issues
- Issues with approaching or overdue due dates
- Issues assigned to the user (Ziv)

---

### 2.4 Mixpanel

**Configuration (HARDCODED — do not change):**
- **Project ID:** `2716537` (Breville PROD)
- **Workspace ID:** `3252768` (Beanz)
- Always pass both `project_id` and `workspace_id` on every Mixpanel call

**Tools (exact MCP names):**
| Tool | Purpose |
|---|---|
| `Mixpanel:Run-Query` | Execute insights, funnels, flows, retention queries |
| `Mixpanel:Get-Events` | List available events (use `query` param to filter) |
| `Mixpanel:Get-Query-Schema` | Get full JSON schema for a report type before building complex queries |
| `Mixpanel:Get-Report` | Retrieve saved Mixpanel reports by `bookmark_id` |
| `Mixpanel:Get-Property-Names` | List event or user properties |
| `Mixpanel:Get-Property-Values` | Get distinct values for a property |
| `Mixpanel:Get-Projects` | List accessible projects (use to verify project_id) |
| `Mixpanel:List-Dashboards` | List saved dashboards |
| `Mixpanel:Get-Dashboard` | Retrieve a saved dashboard by ID |

#### 2.4.0 Pre-flight: Verify Events Exist

Before running queries, validate that key events still exist (event names may change):

```
Tool: Mixpanel:Get-Events
Parameters: project_id = 2716537, workspace_id = 3252768, query = "Order"
```

Run for: `"Order"`, `"Checkout"`, `"Cart"`, `"Beanz"`, `"session"`, `"Page"`.

If a key event is missing from results, check for renamed variants using `Get-Events` with broader queries. **Do NOT run a query referencing an event that doesn't exist** — it will return zeros and pollute the digest.

#### 2.4.0b Pull Saved Reports (if available)

Check for saved Mixpanel reports/dashboards that may contain pre-built analyses:

```
Tool: Mixpanel:List-Dashboards
Parameters: project_id = 2716537, workspace_id = 3252768
```

If dashboards with names containing "Beanz", "Daily", "Weekly", "Funnel", "Retention" exist, retrieve them with `Get-Dashboard` and use their data instead of running duplicate queries. Saved reports may have curated filters and breakdowns that are more accurate than generic queries.

#### 2.4.0c Discover Properties for Dynamic Breakdowns

Before running breakdown queries, verify which properties are available:

```
Tool: Mixpanel:Get-Property-Names
Parameters: project_id = 2716537, workspace_id = 3252768, resource_type = "Event"
```

**Key properties to look for (for breakdowns and filters):**
- `mp_country_code` — geographic breakdown (AU, US, UK, DE, NL)
- `$current_url` — page URL for top-pages analysis
- `$browser` — browser breakdown
- `$device` — mobile vs desktop
- `$referring_domain` — traffic source
- `$utm_source`, `$utm_medium`, `$utm_campaign` — marketing attribution

If a property doesn't exist, skip that breakdown rather than running a query that returns empty results.

**For specific event properties:**
```
Tool: Mixpanel:Get-Property-Names
Parameters: project_id = 2716537, workspace_id = 3252768, resource_type = "Event", event = "Orders"
```

**To check distinct values of a property (e.g., country codes):**
```
Tool: Mixpanel:Get-Property-Values
Parameters: project_id = 2716537, workspace_id = 3252768, resource_type = "Event", property = "mp_country_code", event = "$session_start"
```

**Key Beanz Events (verified from workspace 3252768):**

| Category | Event Name | Notes |
|---|---|---|
| Sessions | `$session_start`, `$session_end` | Automatic Mixpanel events |
| Page Views | `Page Viewed`, `PDP Page Views`, `ALL PLP PAGE VIEWS` | Use `Page Viewed` for total traffic |
| Shopping | `Add to Cart(New Beanz)`, `Carts`, `Checkout`, `Checkout (v2)` | `Checkout (v2)` is the current flow |
| Orders | `Orders`, `PAYMENT/PLACE_ORDER_SUCCESS` | Use `Orders` for order counts |
| Cart Actions | `CART/ADD_LINE_ITEMS_SUCCESS`, `CART/SET_CHECKOUT_STEP`, `CART/PROMO_CODE_HANDLER_SUCCESS` | Granular cart funnel |
| Subscriptions | `My Beanz - Save Subscription`, `My Beanz - Cancel Subscription`, `My Beanz - Clicked Change Coffee` | Subscription management |
| Registration | `Registration Page Viewed`, `Email Signup`, `Email Signup combined` | Top-of-funnel |
| Login | `login_success` | Authenticated sessions |
| Search | `GS Search String Submitted`, `Input Changed In PLP Search Box (Beanz)` | On-site search |
| PDP | `Select Button on PDP(Beanz)`, `PDP/ADD_TO_CART`, `PDP/ROASTER_PAGE` | Product detail interactions |
| PLP | `PLP/FILTER_SELECT`, `PLP/PDP_HIT` | Collection page behaviour |
| Quiz | `Find my Perfect Coffee (Beanz)` | Recommendation quiz |
| Video | `Beanz Video Interaction` | Content engagement |
| Scroll | `Scroll Depth` | Engagement depth |

#### 2.4.1 Daily Mixpanel Queries

Run each query using `Mixpanel:Run-Query` with `project_id: 2716537`, `workspace_id: 3252768`.

**Query D-MX1: Yesterday's key metrics (sessions, page views, orders)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Daily Snapshot",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Page Viewed", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "unique"}}
    ],
    "dateRange": {"type": "relative", "range": "yesterday"},
    "chartType": "table"
  }
}
```

**Query D-MX2: Yesterday's subscription management events**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Sub Management Daily",
    "metrics": [
      {"eventName": "My Beanz - Save Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Cancel Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Clicked Change Coffee", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - View History", "measurement": {"type": "basic", "math": "total"}}
    ],
    "dateRange": {"type": "relative", "range": "yesterday"},
    "chartType": "table"
  }
}
```

**Query D-MX3: Yesterday's cart & checkout funnel (insights view)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Cart-Checkout Daily",
    "metrics": [
      {"eventName": "PDP Page Views", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Add to Cart(New Beanz)", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Checkout (v2)", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS", "measurement": {"type": "basic", "math": "unique"}}
    ],
    "dateRange": {"type": "relative", "range": "yesterday"},
    "chartType": "table"
  }
}
```

#### 2.4.2 Daily Mixpanel Funnels

**Query D-MX4: Purchase funnel (conversion rates)**
```json
{
  "report_type": "funnels",
  "report": {
    "name": "Beanz Purchase Funnel Daily",
    "metrics": [
      {"eventName": "Page Viewed"},
      {"eventName": "PDP Page Views"},
      {"eventName": "Add to Cart(New Beanz)"},
      {"eventName": "Checkout (v2)"},
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS"}
    ],
    "dateRange": {"type": "relative", "range": "yesterday"},
    "conversionTime": {"unit": "day", "value": 1},
    "chartType": "steps"
  }
}
```

#### 2.4.3 Weekly Mixpanel Queries

**Query W-MX1: 7-day trend (line chart)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz 7-Day Trends",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "Add to Cart(New Beanz)", "measurement": {"type": "basic", "math": "total"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "day", "value": 7}},
    "chartType": "line",
    "unit": "day",
    "timeComparison": {"type": "relative", "unit": "week"}
  }
}
```

**Query W-MX2: Weekly funnel with WoW comparison**
```json
{
  "report_type": "funnels",
  "report": {
    "name": "Beanz Weekly Funnel WoW",
    "metrics": [
      {"eventName": "Page Viewed"},
      {"eventName": "PDP Page Views"},
      {"eventName": "Add to Cart(New Beanz)"},
      {"eventName": "Checkout (v2)"},
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS"}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "day", "value": 7}},
    "conversionTime": {"unit": "day", "value": 7},
    "chartType": "steps",
    "timeComparison": {"type": "relative", "unit": "week"}
  }
}
```

**Query W-MX3: Weekly search & quiz engagement**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Search + Quiz Weekly",
    "metrics": [
      {"eventName": "GS Search String Submitted", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "GS Search String Submitted", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Find my Perfect Coffee (Beanz)", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "Find my Perfect Coffee (Beanz)", "measurement": {"type": "basic", "math": "unique"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "day", "value": 7}},
    "chartType": "line",
    "unit": "day"
  }
}
```

**Query W-MX4: User flows — what happens after PDP view (weekly)**
```json
{
  "report_type": "flows",
  "report": {
    "name": "Beanz Post-PDP Flows",
    "metrics": [
      {"eventName": "PDP Page Views"}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "day", "value": 7}},
    "stepsAfter": 3
  }
}
```

#### 2.4.4 Monthly Mixpanel Queries

**Query M-MX1: 30-day overview with MoM comparison**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Monthly Overview MoM",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Page Viewed", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Save Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Cancel Subscription", "measurement": {"type": "basic", "math": "total"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "table",
    "timeComparison": {"type": "relative", "unit": "month"}
  }
}
```

**Query M-MX2: Monthly retention — users who ordered, then ordered again**
```json
{
  "report_type": "retention",
  "report": {
    "name": "Beanz Order Retention Monthly",
    "metrics": [
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS"},
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS"}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 3}},
    "retentionUnit": "month",
    "chartType": "curve"
  }
}
```

**Query M-MX2b: Site visitor retention — users who visited, then returned**
```json
{
  "report_type": "retention",
  "report": {
    "name": "Beanz Visitor Retention Monthly",
    "metrics": [
      {"eventName": "$session_start"},
      {"eventName": "$session_start"}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 3}},
    "retentionUnit": "week",
    "chartType": "curve"
  }
}
```

**Query M-MX3: Geographic breakdown (monthly sessions + orders by country)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Geo Breakdown Monthly",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}}
    ],
    "breakdowns": [
      {"metric": {"type": "property", "propertyName": "mp_country_code", "propertyType": "string", "resource": "event"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "table",
    "timeComparison": {"type": "relative", "unit": "month"}
  }
}
```

**Query M-MX4: Top pages by traffic (monthly)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Top Pages Monthly",
    "metrics": [
      {"eventName": "Page Viewed", "measurement": {"type": "basic", "math": "total"}}
    ],
    "breakdowns": [
      {"metric": {"type": "property", "propertyName": "$current_url", "propertyType": "string", "resource": "event"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "table"
  }
}
```

**Query M-MX4b: Device breakdown (monthly — mobile vs desktop)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Device Breakdown Monthly",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}}
    ],
    "breakdowns": [
      {"metric": {"type": "property", "propertyName": "$device", "propertyType": "string", "resource": "event"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "table",
    "timeComparison": {"type": "relative", "unit": "month"}
  }
}
```

**Query M-MX4c: Traffic source attribution (monthly)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Traffic Sources Monthly",
    "metrics": [
      {"eventName": "$session_start", "measurement": {"type": "basic", "math": "unique"}},
      {"eventName": "Orders", "measurement": {"type": "basic", "math": "total"}}
    ],
    "breakdowns": [
      {"metric": {"type": "property", "propertyName": "$referring_domain", "propertyType": "string", "resource": "event"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "table"
  }
}
```

**Query M-MX5: FTBP funnel — machine registration to first paid order (monthly)**
```json
{
  "report_type": "funnels",
  "report": {
    "name": "Beanz FTBP Funnel Monthly",
    "metrics": [
      {"eventName": "Registration Page Viewed"},
      {"eventName": "Email Signup"},
      {"eventName": "Add to Cart(New Beanz)"},
      {"eventName": "PAYMENT/PLACE_ORDER_SUCCESS"}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "conversionTime": {"unit": "month", "value": 1},
    "chartType": "steps",
    "timeComparison": {"type": "relative", "unit": "month"}
  }
}
```

**Query M-MX6: Subscription management actions (monthly trend)**
```json
{
  "report_type": "insights",
  "report": {
    "name": "Beanz Sub Management Monthly",
    "metrics": [
      {"eventName": "My Beanz - Save Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Cancel Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz -  Initial Cancel Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz -  Redeem Cancel Subscription", "measurement": {"type": "basic", "math": "total"}},
      {"eventName": "My Beanz - Clicked Change Coffee", "measurement": {"type": "basic", "math": "total"}}
    ],
    "dateRange": {"type": "relative", "range": {"unit": "month", "value": 1}},
    "chartType": "line",
    "unit": "day",
    "timeComparison": {"type": "relative", "unit": "month"}
  }
}
```

Note: `My Beanz -  Initial Cancel Subscription` tracks cancel intent, `My Beanz -  Redeem Cancel Subscription` tracks retention offer acceptance. The ratio of Redeem/Initial is the retention save rate.

#### 2.4.5 Mixpanel Data Quality Checks

After receiving Mixpanel results, validate:
- [ ] Session counts plausible (daily ~5K-20K unique users for beanz.com)
- [ ] Order counts cross-check with BeanzGenie `yesterday_bags` (Mixpanel orders ≈ BeanzGenie bag orders ÷ avg bags/order)
- [ ] Funnel conversion rates are in expected ranges (PDP→ATC ~5-15%, ATC→Checkout ~30-50%, Checkout→Order ~50-70%)
- [ ] Zero-result queries get flagged — do not silently omit

If a query fails, simplify: drop breakdowns, widen date range, or fall back to a basic event count.

**Extract specific numbers.** Never report "good" or "stable" without the actual figures.

---

### 2.5 BeanzGenie (Databricks)

**Tool:** `BeanzGenie:query_space_*` → `BeanzGenie:poll_response_*`

**CRITICAL SQL RULES (violations produce wrong numbers):**
- **ALWAYS** include `RateType = 'AUD-MonthEnd'` on every factbeanzorder query (without it, metrics inflate **6x**)
- **ALWAYS** exclude cancelled: `lower(f.OrderStatus) <> 'cancelled'`
- **ALWAYS** use `BeanzSkuFlag = 1` for coffee-only metrics
- **Revenue field:** `SkuAmount` (NOT `Net_Sales`)
- **Date convention:** Calendar Year default. BRG Fiscal Year = Jul 1 → Jun 30.
- **Exchange rate join:** Always JOIN to `dimexchangerate` on `ExchangeRateKey`

#### Daily SQL Queries

Send each query prefixed with: `Run the following SQL exactly as written, do not modify it:`

**Query 1: Yesterday's snapshot**
```sql
SELECT
  'yesterday_revenue' AS metric,
  ROUND(SUM(f.SkuAmount), 2) AS value
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL

SELECT 'yesterday_bags', SUM(f.Quantity)
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL

SELECT 'yesterday_kg', ROUND(SUM(f.Quantity_by_KG), 2)
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND f.OrderDate = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL

SELECT 'yesterday_new_subs', COUNT(*)
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE BeanzSkuFlag = 1 AND CAST(CreatedDate AS DATE) = DATEADD(DAY, -1, CURRENT_DATE())

UNION ALL

SELECT 'yesterday_cancellations', COUNT(*)
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE BeanzSkuFlag = 1 AND SubscriptionStatus = 'Cancelled'
  AND CAST(CancelledDate AS DATE) = DATEADD(DAY, -1, CURRENT_DATE())
```

**Query 2: Current month MTD**
```sql
SELECT
  'mtd_revenue' AS metric,
  ROUND(SUM(f.SkuAmount), 2) AS value
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()

UNION ALL

SELECT 'mtd_bags', SUM(f.Quantity)
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
```

**Query 3: Active subscriptions (point-in-time)**
```sql
SELECT
  'active_subs_total' AS metric,
  COUNT(*) AS value
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionStatus IN ('Active', 'Paused') AND BeanzSkuFlag = 1

UNION ALL

SELECT 'active_subs', COUNT(*)
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionStatus = 'Active' AND BeanzSkuFlag = 1

UNION ALL

SELECT 'paused_subs', COUNT(*)
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionStatus = 'Paused' AND BeanzSkuFlag = 1
```

**Query 4: PBB MTD performance**
```sql
SELECT
  s.StoreName,
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1 AND s.StoreCode ILIKE 'PBB%'
  AND f.OrderDate >= DATE_TRUNC('MONTH', CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY s.StoreName, s.Country
ORDER BY Revenue DESC
LIMIT 10
```

#### Weekly Additional Queries

**Query W1: Daily revenue for the past 7 days**
```sql
SELECT
  f.OrderDate,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATEADD(DAY, -7, CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY f.OrderDate
ORDER BY f.OrderDate
```

**Query W2: Revenue by market for the week**
```sql
SELECT
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATEADD(DAY, -7, CURRENT_DATE())
  AND f.OrderDate < CURRENT_DATE()
GROUP BY s.Country
ORDER BY Revenue DESC
```

**Query W3: New subs vs cancellations for the week**
```sql
SELECT 'new_subs_7d' AS metric, COUNT(*) AS value
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE BeanzSkuFlag = 1 AND CAST(CreatedDate AS DATE) >= DATEADD(DAY, -7, CURRENT_DATE())

UNION ALL

SELECT 'cancellations_7d', COUNT(*)
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE BeanzSkuFlag = 1 AND SubscriptionStatus = 'Cancelled'
  AND CAST(CancelledDate AS DATE) >= DATEADD(DAY, -7, CURRENT_DATE())
```

#### Monthly Additional Queries

**Query M1: Full previous month by market**
```sql
SELECT
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS KG
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -1, CURRENT_DATE()))
  AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY s.Country
ORDER BY Revenue DESC
```

**Query M2: MoM comparison (previous month vs month before)**
```sql
SELECT
  CASE
    WHEN f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -1, CURRENT_DATE()))
     AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
    THEN 'previous_month'
    ELSE 'month_before'
  END AS period,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags,
  COUNT(DISTINCT f.OrderNumber) AS Orders
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -2, CURRENT_DATE()))
  AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY period
```

**Query M3: FTBP performance for the month**
```sql
SELECT
  CASE WHEN f.offer_code LIKE '%-FT-DISCOFF-%' THEN 'FTBP_v2'
       WHEN f.ftbp_Flag = 1 THEN 'FTBP_v1'
       ELSE 'Organic' END AS program,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -1, CURRENT_DATE()))
  AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY program
ORDER BY Revenue DESC
```

**Query M4: Top 10 roasters for the month**
```sql
SELECT
  p.VendorName,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS KG
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd' AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= DATE_TRUNC('MONTH', DATEADD(MONTH, -1, CURRENT_DATE()))
  AND f.OrderDate < DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY p.VendorName
ORDER BY Revenue DESC
LIMIT 10
```

#### Data Quality Checks (Run on EVERY query result)

After receiving BeanzGenie results, validate:
- [ ] Revenue figures are plausible (daily ~$40-80K AUD, monthly ~$1-1.5M AUD for coffee)
- [ ] Bag counts are plausible (daily ~2-4K, monthly ~70-100K)
- [ ] Avg KG/bag is 0.25–0.35 (if outside, a filter is missing)
- [ ] Active subs ~36,000-40,000 range (if >50K, BeanzSkuFlag=1 filter is missing)
- [ ] PBB revenue is a small portion of total (~5-8%)
- [ ] No 6x inflation (check if numbers are ~6x higher than expected → RateType filter missing)

If any check fails, **do not report the number**. Instead note: "⚠️ Data quality check failed for [metric] — value [X] outside expected range. Likely cause: [missing filter]. Excluded from digest."

---

## Step 3: Synthesise the Digest

### Output Structure

Produce the digest in this exact section order. **Never omit sections** — use "No data available" for empty sections.

---

#### HEADER

```
☕ BEANZ [DAILY/WEEKLY/MONTHLY] DIGEST
[Date range] | Generated [timestamp]
Sources: ✅ Outlook | ✅ Teams | ✅ SharePoint | ✅ Slack | ✅ Jira | ✅ Mixpanel | ✅ BeanzGenie
(Use ⚠️ for partial data, ❌ for failed sources)
```

---

#### 1. EXECUTIVE SUMMARY (2–3 sentences)

The single most important paragraph. A GM should be able to read this in 10 seconds and know the state of play. Lead with the biggest win or biggest risk. Include one number.

**Daily:** "Yesterday's headline + today's priority."
**Weekly:** "Week's trajectory + key achievement + biggest risk."
**Monthly:** "Month's performance vs benchmark + strategic insight + forward look."

---

#### 2. PLATFORM PERFORMANCE (BeanzGenie + Mixpanel)

**Daily format:**
| Metric | Yesterday (Genie) | Yesterday (Mixpanel) | MTD | vs CY25 Avg |
|---|---|---|---|---|
| Revenue (AUD) | $X | — | $X | ↑/↓ X% |
| Bags Shipped | X | — | X | ↑/↓ X% |
| Active Subs | X | — | — | vs 36,584 benchmark |
| New Subs | X | — | X | — |
| Cancellations | X | — | X | Net: +/- X |
| PBB Revenue | — | — | $X | — |
| **Sessions** | — | X unique / X total | — | — |
| **Page Views** | — | X | — | — |
| **Orders (events)** | — | X total / X unique | — | — |
| **PDP→ATC Rate** | — | X% | — | — |
| **Funnel Conv %** | — | Page→PDP→ATC→Checkout→Order | — | — |
| **Sub Saves** | — | X | — | — |
| **Sub Cancels** | — | X | — | — |

**Cross-validation:** Compare BeanzGenie order count with Mixpanel `Orders` event count. Flag discrepancies >15%.

**Weekly format:** Add day-by-day sparkline narrative from Mixpanel line chart (Query W-MX1), market breakdown, WoW funnel comparison (Query W-MX2), WoW trends.
**Monthly format:** Add MoM comparison (Query M-MX1), market-by-market table, FTBP/PBB breakdown, top roasters, cohort retention curves (Query M-MX2), top pages (Query M-MX3).

CY25 benchmarks for comparison:
- Monthly revenue avg: ~$1.30M AUD (total $15.54M / 12)
- Monthly bags avg: ~83,617 (total 1,003,406 / 12)
- Active subs benchmark: ~36,584
- PBB CY25 total: $907,949 AUD (~$75.7K/mo)

---

#### 3. PROJECT PROGRESS (Jira + Slack)

**For EACH active Beanz project, provide:**

```
🚀 [PROJECT NAME] — [Status emoji] [Status]
   Phase: [phase] | Completion: [X]% | Sprint: [sprint name]
   This period: [X issues completed, X in progress, X blocked]
   Key completions: [bullet list of Done items]
   Blockers: [bullet list or "None"]
   Next milestones: [bullet list with dates]
```

Status emojis: 🟢 On Track | 🟡 Some Issues | 🔴 At Risk | ⏸️ On Hold

**Known key projects to always report on (even if no Jira activity found — check Slack):**
- **Project Feral** — 26-week AI retention initiative. Week ~5-6. Five gating requirements.
- **Operation Freedom** — UK Klarna bundle pilot. Must launch before FY26 end (Jun 30).
- **NL Rollout** — Netherlands launch July 2026.
- **RCC Replatforming** — Salesforce portal replacement. Blocks roaster tools.
- **CMS Migration** — AEM → Contentful. $160K penalty deadline May 29.

**Weekly/Monthly additions:** Velocity trend (issues/week), sprint burndown status, cross-project dependency map.

---

#### 4. INBOX & COMMS HIGHLIGHTS (Outlook + Teams + SharePoint)

Group by urgency, combining all Microsoft sources:
- 🔴 **Action Required** — emails/Teams messages needing a response or decision today
- 🟡 **FYI — Important** — updates worth knowing but no action needed
- ⚪ **Informational** — routine updates, newsletters, notifications

For each: Subject | From | Source `[Email]` `[Teams]` | Date | 1-line summary | Action needed

**SharePoint Documents (📄 RECENT DOCUMENTS sub-section):**
List recently modified documents:
| Document | Author | Modified | Folder | Summary |
|---|---|---|---|---|
| [title] | [author] | [date] | [folder path] | [1-line what changed] |

**Weekly/Monthly:** Top themes, busiest senders, email+Teams volume trend, document revision summary.

---

#### 5. SLACK ACTIVITY (Slack)

- **Decisions made** — who decided what, in which channel, affecting what
- **Active discussions** — threads with high engagement
- **Structured project updates** — parsed from #beanz-project-updates
- **Notable mentions** — anything mentioning Ziv or key Beanz initiatives

**Weekly/Monthly:** Decision log, blocker history, team activity heatmap (who's posting most).

---

#### 6. RISKS & BLOCKERS (cross-source synthesis)

Cross-reference Jira blockers, Slack-mentioned risks, email escalations, and Feral gating requirements.

| Risk/Blocker | Source | Severity | Owner | Days Open | Impact |
|---|---|---|---|---|---|
| AEM migration deadline May 29 | Jira + Slack | 🔴 Critical | Easwar | — | $160K penalty |
| ... | ... | ... | ... | ... | ... |

**Known standing risks to always check:**
- AEM migration deadline (May 29, $160K penalty)
- Vercel licensing blocking PR deployment
- AB testing blocked until BRG-wide solution (June/July)
- AEO/GEO ratings critically low (1-2/10)

---

#### 7. DECISIONS NEEDED (cross-source synthesis)

Decisions surfaced from any source that need Ziv's input:

| Decision | Context | Deadline | Raised By | Source |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

---

#### 8. FORWARD LOOK

**Daily:** Today's priorities, meetings, deadlines.
**Weekly:** This week's key milestones, meetings, deliverables due.
**Monthly:** Next month's strategic priorities, upcoming launches, budget deadlines.

---

## Step 4: Deliver the Digest

1. **Validate completeness** before presenting:
   - All 8 digest sections present (even if some say "No data available")
   - Source header shows status for all 7 sources (✅/⚠️/❌)
   - At least ONE real number in the Executive Summary
   - Platform Performance table has both BeanzGenie AND Mixpanel data (or flags gaps)
   - Cross-validation checks completed (BeanzGenie vs Mixpanel order counts)

2. Present the full digest in the conversation, formatted with Slack-compatible markdown (bold with `**`, not `*`)

3. Offer: "Want me to post this to #beanz-project-updates or email it to yourself?"

4. If user confirms Slack posting, use `Slack:slack_send_message` to post (convert to Slack mrkdwn format: `*bold*` not `**bold**`). Note: Slack has a 40,000 character limit per message. If the digest exceeds this, split into 2-3 messages: (1) Executive Summary + Platform Performance, (2) Project Progress + Inbox, (3) Risks + Decisions + Forward Look.

---

## Error Handling

| Source | Failure | Response |
|---|---|---|
| **Any** | MCP tool not found | Use `tool_search` to discover the correct tool name, then retry |
| **Any** | Source returns empty | Note "No data from [source] for this period" in the relevant section. Continue with other sources. |
| **Any** | Rate limit | Wait 30 seconds and retry once. If still limited, skip source and note it. |
| **Any** | Partial data | Always report what you have. Flag gaps clearly. Never fabricate numbers. |
| **Outlook** | Email search returns 0 results | Broaden search terms (remove quotes, use OR). Try `sender` filter instead of `query`. |
| **Outlook** | read_resource fails for email | Skip full body read, use search result summary instead. Note "[summary only]" in digest. |
| **Teams** | chat_message_search returns 0 | Try simpler single-word queries ("Beanz", "Feral"). Some org configurations limit Teams search. |
| **Teams** | Tool not available | Skip Teams section entirely. Note "❌ Teams" in header. Teams is supplementary, not critical. |
| **SharePoint** | sharepoint_search returns 0 | Try `sharepoint_folder_search` with folder names. Check if SharePoint is configured for this tenant. |
| **SharePoint** | read_resource fails for file | Note document title and metadata only. Do not attempt to read binary files (xlsx, pptx). |
| **Mixpanel** | Run-Query returns error | Check event name exists with `Get-Events`. Simplify query (remove breakdowns, widen date range). |
| **Mixpanel** | Run-Query returns 0 results | Verify event name with `Get-Events` query filter. Try alternative event names from the events table. |
| **Mixpanel** | Retention/Funnel query fails | Fall back to basic insights query counting each event separately. Note "funnel unavailable" in digest. |
| **Mixpanel** | project_id/workspace_id rejected | Use `Get-Projects` to re-discover project_id. Workspace may have been reorganised. |
| **BeanzGenie** | SQL error | Try simplified query. If still fails, report "BeanzGenie unavailable — using last known benchmarks" |
| **Jira** | Project not found | Search more broadly with `summary ~ "beanz"`. Report discovered projects. |

---

## Integration with Other Skills

| Skill | How It Feeds This Digest |
|---|---|
| `beanz-genie-sql-engine` | SQL validation rules, pre-flight checklist, benchmark values |
| `beanz-institutional-kb` | Business context, project details, team structure, acronym definitions |
| `team-project-updates` | Standup template parsing, channel targeting |
| `beanz-business-intelligence` | CY25 benchmarks, FY27 strategy context |
| `ziv-voice` | Digest tone should match Ziv's communication style when posting to Slack |
