# /beanz-digest:run

Generate a structured intelligence digest for beanz.com by scanning Outlook, Slack, Jira, Mixpanel, and BeanzGenie.

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
2. Gathers data from all 5 sources (Outlook → Slack → Jira → Mixpanel → BeanzGenie)
3. Validates BeanzGenie numbers against CY25 benchmarks
4. Synthesises a structured digest with 8 sections
5. Presents the digest in conversation
6. Offers to post to Slack or email

## Requirements

All MCP connectors must be enabled:
- Microsoft 365 (Outlook + Calendar)
- Slack
- Atlassian (Jira)
- Mixpanel
- BeanzGenie (Databricks Genie Space)

If a connector is unavailable, the digest still runs with available sources and flags gaps.

## Examples

**Morning daily briefing:**
```
/beanz-digest:run
```
→ Generates daily digest with yesterday's metrics, overnight Slack activity, Jira updates, and today's priorities.

**Monday weekly wrap:**
```
/beanz-digest:run
```
→ Auto-detects Monday, generates weekly digest with 7-day trends, sprint progress, WoW comparisons.

**Force weekly on a Thursday:**
```
/beanz-digest:run weekly
```
→ Generates rolling 7-day digest regardless of day of week.

**First of month review:**
```
/beanz-digest:run
```
→ Auto-detects 1st, generates monthly digest with MoM comparisons, market breakdown, roaster rankings, full project lifecycle review.
