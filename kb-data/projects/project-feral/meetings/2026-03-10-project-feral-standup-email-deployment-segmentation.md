---
title: "Project Feral Standup: Email Deployment & Segmentation"
description: First production email deployment strategy, Marketing Cloud API pending, segmentation critical dependency for email success reporting, deck builder tool evolution.
type: meeting
status: complete
owner: Product
market:
  - global
tags:
  - meetings
  - meeting-notes
  - projects
  - marketing
  - analytics
aliases:
  - Project Feral Standup 2026-03-10
  - Feral Standup Mar 10
related:
  - "[[project-feral|Project Feral]]"
  - "[[2026-03-09-project-feral-standup-storybook-prototyping-aeo|Storybook Prototyping & AEO (Mar 9)]]"
temporal-type: static
data-period: "2026-03"
---

# Project Feral Standup: Email Deployment & Segmentation

> Added to KB on 2026-03-12

## Meeting Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-10 |
| **Type** | Standup |
| **Project** | [[project-feral\|Project Feral]] |
| **Participants** | Justin, Easwar, Prasanna, Anil |
| **Duration** | ~30 minutes |
| **Source** | Meeting summary |

---

## Key Takeaways

- First production deployment will focus on email campaigns, which can proceed in parallel without requiring Mocha support
- Marketing Cloud API will be available in a couple of days, enabling automated email template integration
- Customer segmentation strategy is a critical dependency for email success reporting and must be finalized before first email deployment
- Ziv's deck builder tool has evolved to design email templates and web pages, which will integrate with the analytics platform for automated prototyping
- A/B testing on the website will only be implemented after the redesign goes live, but email A/B testing can begin earlier with semi-automated processes

---

## Team Status Updates

| Team Member | Completed | In Progress | Plan | Blockers |
|-------------|-----------|-------------|------|----------|
| Justin | Set up PBI desktop and PBI MCP; extracted DAX definitions from existing Beans dashboards; added new enrichment flows and tables for email and Mixpanel reporting | Story prototyping; building QA processes to validate against Power BI; building data dictionary as JSON file locally; working with agents to document tables and fields | Change solution to integrate with Marketing Cloud API; populate data dictionary table from JSON file; work with Ziv on automated page design in Storybook | Segmentation strategy blocked by Jennifer finalizing business rules with Ziv (expected completion in couple days) |
| Easwar | Contentful integration mostly complete except type creation | Josh working on creating types for controlled updates; pages already being built and consumed | N/A | N/A |
| Prasanna | Documenting completed work | Starting data dictionary update work | Connect with Justin by Thursday with queries; set up dataset application next week; focus on data cleanup after table creation | Needs access to Salesforce Marketing Cloud files; waiting for Justin's JSON file for data dictionary; email template work paused pending API availability |
| Anil | N/A | Working on API development | Share contacts by today for skill/wrapper development | N/A |

---

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Finalize segmentation strategy business rules with Ziv | Jennifer | Couple of days | **High** |
| 2 | Share JSON data dictionary file with Prasanna | Justin | Not specified | **High** |
| 3 | Change email template solution to integrate with Marketing Cloud API | Justin | When API available | **High** |
| 4 | Provide walkthrough of PBI MCP and QA validation process to Prasanna | Justin | Not specified | Medium |
| 5 | Work with Ziv on integrating deck builder with Storybook for automated page design | Justin | Not specified | Medium |
| 6 | Engage with AJ, Prasanna, Ian, and Tyler on new segmentation strategy reporting in Power BI | Justin | Not specified | Medium |
| 7 | Connect with Justin by Thursday with queries on data dictionary | Prasanna | 2026-03-13 | Medium |
| 8 | Pause Salesforce Marketing Cloud file access work until API is available | Prasanna | N/A | Medium |
| 9 | Set up dataset application next week | Prasanna | Next week | Medium |
| 10 | Review and work with Justin's JSON data dictionary file once shared | Prasanna | Not specified | Medium |
| 11 | Complete Contentful type creation work with Josh | Easwar | Not specified | Medium |
| 12 | Share API contacts by today | Anil | 2026-03-10 | Medium |
| 13 | Drive A/B testing solution for website | Santhosh | Not specified | Medium |
| 14 | Attend Ziv's deck builder session with Vijay and team | Raam | Not specified | Low |

---

## High Risks

- Customer segmentation business rules must be finalized before first email campaign can be deployed, as this is critical for measuring email success and customer lifecycle reporting
- Marketing Cloud API availability is blocking the email template integration work
- Data dictionary JSON file is still work in progress, which may delay Prasanna's data dictionary update work
- A/B testing solution for website has not been finalized yet, though this is not blocking immediate email deployment

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Action Items | 14 |
| High Priority Actions | 3 |
| Participants | 4 |

---

## Related Files

- [[project-feral|Project Feral]] — Parent project for this standup
- [[2026-03-09-project-feral-standup-storybook-prototyping-aeo|Storybook Prototyping & AEO (Mar 9)]] — Previous standup
