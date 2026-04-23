---
description: Generate a Beanz intelligence digest (daily, weekly, or monthly)
argument-hint: "[daily|weekly|monthly]"
---

# /beanz-digest:run

Generate a structured intelligence digest for beanz.com by scanning 7 sources: Outlook, Teams, SharePoint, Slack, Jira, Mixpanel, and BeanzGenie.

## Usage

```
/beanz-digest:run
/beanz-digest:run weekly
/beanz-digest:run monthly
/beanz-digest:run daily
```

## Behaviour

1. **No argument:** Auto-detects time horizon based on current date.
   - 1st of month → Monthly digest (full previous month)
   - Monday → Weekly digest (previous 7 days)
   - Any other day → Daily digest (previous 24 hours)

2. **With argument:** Forces the specified horizon regardless of date.
   - `weekly` — generates a 7-day lookback digest
   - `monthly` — generates a full previous-month digest
   - `daily` — generates a 24-hour lookback digest

## What It Does

Executes the `daily-digest` skill workflow:
1. Detects time horizon (auto or override)
2. Runs Mixpanel pre-flight (validates events exist via Get-Events)
3. Gathers data from all 7 sources in priority order:
   - BeanzGenie (revenue/subs SQL) + Mixpanel (17 exact JSON queries) in parallel
   - Outlook (email + calendar + full body via read_resource) + Teams (chat search) + SharePoint (doc search) in parallel
   - Slack (channels + structured updates)
   - Jira (project health + sprint progress)
4. Cross-validates BeanzGenie vs Mixpanel numbers
5. Synthesises a structured digest with 8 sections
6. Presents the digest in conversation
7. Offers to post to Slack or email

## Requirements

All MCP connectors must be enabled:
- Microsoft 365 (Outlook + Calendar + Teams + SharePoint)
- Slack
- Atlassian (Jira)
- Mixpanel (Project ID: 2716537, Beanz Workspace: 3252768)
- BeanzGenie (Databricks Genie Space)

If a connector is unavailable, the digest still runs with available sources and flags gaps.

## Examples

**Morning daily briefing:**
```
/beanz-digest:run
```
→ Generates daily digest with yesterday's metrics from BeanzGenie + Mixpanel, overnight Slack/Teams/email activity, Jira updates, and today's priorities.

**Monday weekly wrap:**
```
/beanz-digest:run
```
→ Auto-detects Monday, generates weekly digest with 7-day Mixpanel trends, WoW funnel comparison, sprint progress, market breakdown.

**Force weekly on a Thursday:**
```
/beanz-digest:run weekly
```
→ Generates rolling 7-day digest regardless of day of week.

**First of month review:**
```
/beanz-digest:run
```
→ Auto-detects 1st, generates monthly digest with MoM comparisons, retention curves, device/geo/traffic breakdowns, FTBP funnel, market breakdown, roaster rankings, full project lifecycle review.
