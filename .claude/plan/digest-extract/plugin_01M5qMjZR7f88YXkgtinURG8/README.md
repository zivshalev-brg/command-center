# Beanz Daily Digest v2

An intelligence briefing plugin for beanz.com — Breville Group's specialty coffee subscription marketplace. Scans **7 data sources** and produces a structured digest calibrated to the time horizon.

**What's new in v2:** Teams chat search, SharePoint document scanning, full email/calendar content extraction via read_resource, meeting transcript support, 17 exact Mixpanel query schemas (insights, funnels, flows, retention), cross-source intelligence synthesis, and expanded error handling.

## Installation

Upload this plugin as a zip to Cowork, or install via CLI:

```bash
# From zip
# 1. Download beanz-daily-digest.zip
# 2. Open Cowork → Plugins → "+" → Upload → select zip

# From CLI
claude plugin install ./beanz-daily-digest
```

## What It Does

Every morning, run `/beanz-digest:run` and get a complete briefing covering:

| Section | Sources | What You Get |
|---|---|---|
| Executive Summary | All 7 | 2-3 sentence state-of-play with cross-validated numbers |
| Platform Performance | BeanzGenie + Mixpanel | Revenue, bags, subs, sessions, funnels, PBB — with benchmark comparisons |
| Project Progress | Jira + Slack | Per-project health, sprint status, velocity, blockers |
| Inbox & Comms Highlights | Outlook + Teams + SharePoint | Action-required emails/chats, recent documents, meeting transcripts |
| Slack Activity | Slack | Decisions, active discussions, structured updates |
| Risks & Blockers | Cross-source | Synthesised from Jira, Slack, Outlook, Teams |
| Decisions Needed | Cross-source | Pending decisions that need your input |
| Forward Look | All | Today/week/month priorities and milestones |

## Time Horizon Logic

The digest automatically adjusts depth based on when you run it:

| When | Type | Lookback | Depth |
|---|---|---|---|
| 1st of month | **Monthly** | Full previous month | MoM comparisons, retention curves, device/geo/traffic breakdowns, FTBP funnel, market breakdown, roaster rankings |
| Monday | **Weekly** | Previous 7 days | WoW trends, sprint progress, velocity, search/quiz engagement, user flows |
| Any other day | **Daily** | Previous 24h | Yesterday's snapshot, overnight activity, today's priorities |

Override anytime: `/beanz-digest:run weekly` forces a weekly digest on any day.

## Data Sources (7 sources, was 5)

| Source | Connector | Tools Used | What It Pulls |
|---|---|---|---|
| **Outlook (email)** | Microsoft 365 | outlook_email_search, read_resource | Beanz emails, full body extraction, action items |
| **Outlook (calendar)** | Microsoft 365 | outlook_calendar_search, read_resource | Meetings, agendas, attendees |
| **Teams** | Microsoft 365 | chat_message_search, read_resource | Cross-functional chats, meeting transcripts |
| **SharePoint** | Microsoft 365 | sharepoint_search, sharepoint_folder_search, read_resource | Recent docs, meeting notes, reports |
| **Slack** | Slack | slack_search, slack_read_channel, slack_read_thread | Channel messages, structured updates, decisions |
| **Jira** | Atlassian | searchJiraIssuesUsingJql, getJiraIssue, getVisibleJiraProjects | Project health, sprint progress, issue updates |
| **Mixpanel** | Mixpanel | Run-Query, Get-Events, Get-Query-Schema, Get-Report, List-Dashboards | 17 pre-built queries: sessions, funnels, retention, geo, device, traffic |
| **BeanzGenie** | Databricks Genie | query_space, poll_response | Revenue, bags, KG, subscriptions, PBB, FTBP via validated SQL |

## Mixpanel Configuration

Hardcoded for zero-config operation:
- **Project ID:** 2716537 (Breville PROD)
- **Workspace ID:** 3252768 (Beanz)
- **17 pre-built queries** covering daily/weekly/monthly insights, funnels, flows, and retention
- **Pre-flight validation** — verifies event names exist before querying
- **Saved dashboard discovery** — pulls pre-built analyses if available

## BeanzGenie SQL Safety

All BeanzGenie queries use validated SQL with mandatory filters:
- `RateType = 'AUD-MonthEnd'` (prevents 6x row inflation)
- `BeanzSkuFlag = 1` (coffee only — excludes machines/accessories)
- `lower(OrderStatus) <> 'cancelled'`
- Revenue field: `SkuAmount` (not Net_Sales)

Results are checked against CY25 benchmarks before reporting.

## Plugin Structure

```
beanz-daily-digest/
├── .claude-plugin/plugin.json    # Manifest (v2.0.0)
├── .mcp.json                     # 5 MCP connectors (MS365 covers Outlook+Teams+SharePoint)
├── README.md                     # This file
├── commands/
│   └── run.md                    # /beanz-digest:run command
└── skills/
    ├── daily-digest/
    │   └── SKILL.md              # Core digest engine (7 sources, 17 Mixpanel queries)
    └── beanz-context/
        └── SKILL.md              # Institutional knowledge (auto-activated)
```

## Requirements

- Claude Pro, Team, or Enterprise subscription
- Cowork or Claude Code
- MCP connectors enabled for: Microsoft 365, Slack, Atlassian, Mixpanel, Databricks
- Appropriate permissions in each connected service
