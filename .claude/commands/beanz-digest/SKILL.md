# Beanz Daily Digest

> Automated intelligence briefing for beanz.com leadership. Scans Outlook, Slack, Jira, Mixpanel, and BeanzGenie, then synthesises a structured digest calibrated to the time horizon.

---

## When This Skill Fires

Activate whenever the user says any of: "daily digest", "morning briefing", "what happened today", "catch me up", "daily update", "weekly digest", "weekly summary", "weekly wrap", "monthly digest", "monthly summary", "month in review", "what did I miss", "digest", "briefing", "intelligence report", "what's happening with Beanz", "Beanz update", "give me the rundown", or any request for a summary of Beanz activity across multiple sources.

Also activates on the `/beanz-digest:run` slash command.

---

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

Execute each source in sequence. If a source fails, log the failure and continue — never block the entire digest on one source.

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

**Extract per email:** sender, subject, date, 1-2 sentence summary, action required (yes/no + what).

**For weekly/monthly:** Group by theme (Project Feral, Operation Freedom, PBB, FTBP, Roaster partnerships, NL rollout, Other).

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

**Tool:** `Mixpanel` MCP tools (use `tool_search` to discover available Mixpanel tools)

**Daily metrics to pull:**
- Unique visitors (yesterday vs day before)
- Session count and avg duration
- Key conversion events: page views → product views → add to cart → checkout → subscription created
- Subscription events: new subscriptions, cancellations, pauses, reactivations
- FTBP funnel: machine registrations → free bag claims → first paid order

**Weekly additions:**
- Day-by-day trend for the week (identify best/worst days)
- WoW comparison for all key metrics
- Top pages by traffic
- Geographic breakdown (AU, US, UK, DE)
- Funnel drop-off analysis

**Monthly additions:**
- MoM comparison for all key metrics
- Cohort retention curves
- Feature adoption trends
- Full funnel analysis with conversion rates at each step
- Top 10 events by volume

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
- [ ] Avg KG/bag is 0.25-0.35 (if outside, a filter is missing)
- [ ] Active subs ~36,000-40,000 range (if >50K, BeanzSkuFlag=1 filter is missing)
- [ ] PBB revenue is a small portion of total (~5-8%)
- [ ] No 6x inflation (check if numbers are ~6x higher than expected → RateType filter missing)

If any check fails, **do not report the number**. Instead note: "Data quality check failed for [metric] — value [X] outside expected range. Likely cause: [missing filter]. Excluded from digest."

---

## Step 3: Synthesise the Digest

### Output Structure

Produce the digest in this exact section order. **Never omit sections** — use "No data available" for empty sections.

---

#### HEADER

```
BEANZ [DAILY/WEEKLY/MONTHLY] DIGEST
[Date range] | Generated [timestamp]
Sources: Outlook | Slack | Jira | Mixpanel | BeanzGenie
(Use warning for partial data, failed for failed sources)
```

---

#### 1. EXECUTIVE SUMMARY (2-3 sentences)

The single most important paragraph. A GM should be able to read this in 10 seconds and know the state of play. Lead with the biggest win or biggest risk. Include one number.

**Daily:** "Yesterday's headline + today's priority."
**Weekly:** "Week's trajectory + key achievement + biggest risk."
**Monthly:** "Month's performance vs benchmark + strategic insight + forward look."

---

#### 2. PLATFORM PERFORMANCE (BeanzGenie + Mixpanel)

**Daily format:**
| Metric | Yesterday | MTD | vs CY25 Avg |
|---|---|---|---|
| Revenue (AUD) | $X | $X | up/down X% |
| Bags Shipped | X | X | up/down X% |
| Active Subs | X | — | vs 36,584 benchmark |
| New Subs | X | X | — |
| Cancellations | X | X | Net: +/- X |
| PBB Revenue | — | $X | — |

**Weekly format:** Add day-by-day sparkline narrative, market breakdown, WoW trends.
**Monthly format:** Add MoM comparison, market-by-market table, FTBP/PBB breakdown, top roasters, cohort indicators.

CY25 benchmarks for comparison:
- Monthly revenue avg: ~$1.30M AUD (total $15.54M / 12)
- Monthly bags avg: ~83,617 (total 1,003,406 / 12)
- Active subs benchmark: ~36,584
- PBB CY25 total: $907,949 AUD (~$75.7K/mo)

---

#### 3. PROJECT PROGRESS (Jira + Slack)

**For EACH active Beanz project, provide:**

```
[PROJECT NAME] — [Status] [Status Label]
   Phase: [phase] | Completion: [X]% | Sprint: [sprint name]
   This period: [X issues completed, X in progress, X blocked]
   Key completions: [bullet list of Done items]
   Blockers: [bullet list or "None"]
   Next milestones: [bullet list with dates]
```

Status labels: On Track | Some Issues | At Risk | On Hold

**Known key projects to always report on (even if no Jira activity found — check Slack):**
- **Project Feral** — 26-week AI retention initiative. Week ~5-6. Five gating requirements.
- **Operation Freedom** — UK Klarna bundle pilot. Must launch before FY26 end (Jun 30).
- **NL Rollout** — Netherlands launch July 2026.
- **RCC Replatforming** — Salesforce portal replacement. Blocks roaster tools.
- **CMS Migration** — AEM to Contentful. $160K penalty deadline May 29.

**Weekly/Monthly additions:** Velocity trend (issues/week), sprint burndown status, cross-project dependency map.

---

#### 4. INBOX HIGHLIGHTS (Outlook)

Group by urgency:
- **Action Required** — emails needing a response or decision today
- **FYI — Important** — updates worth knowing but no action needed
- **Informational** — routine updates, newsletters, notifications

For each: Subject | From | Date | 1-line summary | Action needed

**Weekly/Monthly:** Top themes, busiest senders, email volume trend.

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
| AEM migration deadline May 29 | Jira + Slack | Critical | Easwar | — | $160K penalty |
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

1. Present the full digest in the conversation, formatted with Slack-compatible markdown (bold with `**`, not `*`)
2. Offer: "Want me to post this to #beanz-project-updates or email it to yourself?"
3. If user confirms Slack posting, use `Slack:slack_send_message` to post (convert to Slack mrkdwn format: `*bold*` not `**bold**`)

---

## Error Handling

| Failure | Response |
|---|---|
| MCP tool not found | Use `tool_search` to discover the correct tool name, then retry |
| Source returns empty | Note "No data from [source] for this period" in the relevant section. Continue with other sources. |
| BeanzGenie SQL error | Try simplified query. If still fails, report "BeanzGenie unavailable — using last known benchmarks" |
| Jira project not found | Search more broadly with `summary ~ "beanz"`. Report discovered projects. |
| Rate limit | Wait 30 seconds and retry once. If still limited, skip source and note it. |
| Partial data | Always report what you have. Flag gaps clearly. Never fabricate numbers. |

---

## Integration with Other Skills

| Skill | How It Feeds This Digest |
|---|---|
| `beanz-genie-sql-engine` | SQL validation rules, pre-flight checklist, benchmark values |
| `beanz-institutional-kb` | Business context, project details, team structure, acronym definitions |
| `team-project-updates` | Standup template parsing, channel targeting |
| `beanz-business-intelligence` | CY25 benchmarks, FY27 strategy context |
| `ziv-voice` | Digest tone should match Ziv's communication style when posting to Slack |
