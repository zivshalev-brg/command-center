---
title: "Project Feral Standup: Dataset Dashboards & Segmentation"
description: PDP concepts approved, segmentation strategy unblocked with Jennifer workshop, AEM decommissioned from roster detail, dataset dashboards demonstrated, OpenClaw security discussion.
type: meeting
status: complete
owner: Product
market:
  - global
tags:
  - meetings
  - meeting-notes
  - projects
  - analytics
  - architecture
aliases:
  - Project Feral Standup 2026-03-11
  - Feral Standup Mar 11
related:
  - "[[project-feral|Project Feral]]"
  - "[[2026-03-10-project-feral-standup-email-deployment-segmentation|Email Deployment & Segmentation (Mar 10)]]"
temporal-type: static
data-period: "2026-03"
---

# Project Feral Standup: Dataset Dashboards & Segmentation

> Added to KB on 2026-03-12

## Meeting Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-11 |
| **Type** | Standup |
| **Project** | [[project-feral\|Project Feral]] |
| **Participants** | Justin, Easwar, Nagesh, Prasanna, Josh |
| **Duration** | ~30 minutes |
| **Source** | Meeting summary |

---

## Key Takeaways

- PDP concepts approved by Ziv; new designs to be integrated into storybook by Friday
- Segmentation strategy unblocked with new strategy shared by Jennifer; workshop scheduled with Ziv, Sophie, and Jennifer
- AEM successfully decommissioned from roster detail page except header and footer
- Dataset tool setup in progress with data dump from Databricks planned for end of day
- Hosting solution for dataset tool needs to be determined; options include Databricks platform or AWS hosted solutions
- Justin demonstrated comprehensive dashboards built on dataset visualizing email integration, conversion analysis, Mixpanel attribution, Fast Track V2 analysis, and churn analysis
- ChatGPT integration with exit survey data and customer support inquiries producing enriched analysis of customer feedback
- Discussion on potential OpenClaw implementation for AI agent with access to analytics data, competitor scraping, and template creation capabilities; security concerns raised requiring involvement of Stuart's team

---

## Team Status Updates

| Team Member | Completed | In Progress | Plan | Blockers |
|-------------|-----------|-------------|------|----------|
| Justin | PDP concepts approved by Ziv | Working through prototype; bringing Ziv's designs to storybook; documenting segmentation strategy formally; building dashboards on dataset for data visualization; created reporting dashboards for email integration, template analysis, conversion analysis, Mixpanel integration, Fast Track V2 analysis, and churn analysis; ChatGPT integration with exit survey data and customer support inquiries | Share storybook designs by Friday; workshop with Ziv, Sophie, and Jennifer to formalize segmentation strategy | N/A |
| Easwar | Backend monitoring ticket in current sprint; Contentful workflow changes pushed to all release branches; frontend able to create models in Contentful with PR raised on content report | Testing not yet started for QA; checking with Josh on contentful workflow closure | Start onboarding QA tickets next sprint; begin monitoring progress from next week; Santosh to set up call with all squad leads to align on next steps for repositories | N/A |
| Nagesh | Successfully decommissioned AEM from roster detail page apart from header and footer | N/A | N/A | N/A |
| Prasanna | N/A | Working on data setup in local machine; setting up dataset tool | Complete data dump from Databricks to dataset by end of day; determine hosting solution for dataset tool | Need server access for dataset tool to be accessible by multiple people; unclear if dataset can be hosted on Databricks platform |
| Josh | Passed over additional agent skill for contentful content type generation | Getting multiple requests to support more on CMS | Look into sitemap migration to Contentful; investigate AEM endpoint replacement with headless page list | N/A |

---

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Share storybook designs with new PDP concepts by Friday | Justin | 2026-03-14 | **High** |
| 2 | Conduct workshop with Ziv, Sophie, and Jennifer to formalize segmentation strategy | Justin | Not specified | **High** |
| 3 | Complete data dump from Databricks to dataset by end of day | Prasanna | 2026-03-11 | **High** |
| 4 | Discuss with Santosh Kumar about best solution for dataset hosting | Justin | Not specified | **High** |
| 5 | Engage with Stuart's team regarding OpenClaw security requirements and guardrails | Justin | Not specified | Medium |
| 6 | Start onboarding QA tickets for testing next sprint | Easwar | Next sprint | Medium |
| 7 | Check with Josh if contentful workflow ticket can be closed | Easwar | Not specified | Medium |
| 8 | Coordinate with Santosh on squad alignment call for repository planning | Easwar | Not specified | Medium |
| 9 | Update Justin on whether dataset can be hosted on Databricks platform | Prasanna | Not specified | Medium |
| 10 | Discuss with Santosh Kumar about dataset hosting options and AWS alternatives | Prasanna | Not specified | Medium |
| 11 | Investigate sitemap migration to Contentful and provide information or implementation | Josh | Not specified | Medium |
| 12 | Determine if sitemap is still served from AEM or only from Bean's frontend | Josh | Not specified | Medium |
| 13 | Set up call with all squad leads to align on repository next steps and planning | Santosh Kumar | Not specified | Medium |

---

## High Risks

- Dataset tool hosting solution unclear; need to determine if Databricks platform can host dataset or if separate AWS server required with associated costs
- OpenClaw implementation highly contentious within BRG context due to security concerns; requires security team approval and significant guardrails
- Sitemap migration from AEM to Contentful needs scoping and implementation plan

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Action Items | 13 |
| High Priority Actions | 4 |
| Participants | 5 |

---

## Related Files

- [[project-feral|Project Feral]] — Parent project for this standup
- [[2026-03-10-project-feral-standup-email-deployment-segmentation|Email Deployment & Segmentation (Mar 10)]] — Previous standup
