---
title: "Project Feral Standup: Cadence, Personalization & Contentful"
description: Meeting cadence reduced to twice weekly, personalization three-layer solution finalized, Contentful demo next week, subscription CT postponed post-August, AB testing blocked until June/July.
type: meeting
status: complete
owner: Product
market:
  - global
tags:
  - meetings
  - meeting-notes
  - projects
  - architecture
  - marketing
  - analytics
aliases:
  - Project Feral Standup 2026-03-12
  - Feral Standup Mar 12
related:
  - "[[project-feral|Project Feral]]"
  - "[[2026-03-11-project-feral-standup-dataset-dashboards-segmentation|Dataset Dashboards & Segmentation (Mar 11)]]"
temporal-type: static
data-period: "2026-03"
---

# Project Feral Standup: Cadence, Personalization & Contentful

> Added to KB on 2026-03-12

## Meeting Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-12 |
| **Type** | Standup |
| **Project** | [[project-feral\|Project Feral]] |
| **Participants** | Santhosh, Prasanna, Easwar, Justin, Sophie, Raam |
| **Duration** | ~30 minutes |
| **Source** | Meeting summary |

---

## Key Takeaways

- Meeting frequency will be reduced from daily to twice weekly (Tuesday and Thursday) due to overlap with other ceremonies and maturity of technical foundations
- Most agentic development foundations are sorted out; consideration to merge this meeting with Mocha Standup
- Contentful integration demo scheduled for next week (Tuesday or Wednesday)
- Dataset integration with Databricks faces technical limitations requiring SQLite database, needs further discussion
- Personalization approach finalized: three-layer solution using segmentation, CDP, and Ninetail for content personalization
- AEO/GEO recommendations compiled, review meeting scheduled for Tuesday next week
- Hotjar integration exists on Breville; plan to enable for Beans production with freemium tier initially
- AB testing and experimentation blocked until BRG-wide solution ready (June/July timeline)
- Subscription integration with CT postponed to post-August; will continue with current subscription model for launch

---

## Decisions

### Decision 1: Meeting Cadence Reduced

| Field | Detail |
|-------|--------|
| **Decision** | Standup frequency reduced from daily to twice weekly (Tuesday and Thursday) |
| **Rationale** | Overlap with other ceremonies; agentic development foundations are mature; consideration to merge with Mocha Standup |
| **Stakeholders** | All team members |

### Decision 2: Personalization Three-Layer Architecture

| Field | Detail |
|-------|--------|
| **Decision** | Three-layer personalization solution: segmentation + CDP (hub) + Ninetail (UI) |
| **Rationale** | CDP serves as centralized hub, Ninetail handles content personalization at the UI layer |
| **Stakeholders** | Santhosh, Rishab, Pam |

### Decision 3: CT Subscription Integration Postponed

| Field | Detail |
|-------|--------|
| **Decision** | Subscription integration with CT postponed to post-August; continue with current subscription model for launch |
| **Rationale** | Timeline constraints; current model sufficient for NL launch |
| **Stakeholders** | Easwar, Justin |

---

## Team Status Updates

| Team Member | Completed | In Progress | Plan | Blockers |
|-------------|-----------|-------------|------|----------|
| Santhosh | Personalization flow sorted with CDP as hub and Ninetail for UI; AEO/GEO recommendations compiled based on requirements and codebase; Hotjar integration completed for Breville and FTVP | Working with Rishab and Pam on content personalization solution; reviewing common AEO/GEO changes across all brands | Present personalization solution at BRG level; SEO review meeting Tuesday next week with squad leads; determine Hotjar licensing requirements | N/A |
| Prasanna | Discussion with Helen and Nasper regarding Dataset integration with Databricks | Dataset integration setup | Follow-up discussion with Santhosh and Raam on Dataset solution | Dataset cannot directly access Unity catalog; SQLite database still required for Dataset functionality |
| Easwar | Infrastructure and wiring setup complete for Contentful; Hotjar enabled for carton checker | Contentful migration using existing setup; Hotjar script integration for Beans production | Demo Contentful integration next week; enable Hotjar for Beans with configuration from Justin | N/A |
| Justin | Marketing cloud email template showing progress (updated by Rishab); Storybook looking good | Tracking foundation items in backlog | Configure Hotjar surveys as proof of concept; segment call tomorrow with Sophie, Ziv, and Ray; work on experimentation timeline with Sophie and Ziv | AB testing blocked until BRG-wide solution ready (June/July) |
| Sophie | N/A | Focused on redesign piece and target dates; experimentation pathway activities identified | Define target dates for redesign; check Hotjar licensing and budget availability; work on experimentation timeline with Justin and Ziv | No budget allocated for Hotjar premium features this financial year; request submitted for next financial year |

---

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Schedule follow-up discussion with Santhosh and Raam regarding Dataset integration solution | Prasanna | Not specified | **High** |
| 2 | Map out Dataset solution architecture with Santhosh | Prasanna | Not specified | **High** |
| 3 | Review AEO/GEO recommendations with squad leads | Santhosh | Tuesday next week | **High** |
| 4 | Demo Contentful integration with component and page | Easwar | Next week Tue/Wed | **High** |
| 5 | Connect with analytics team (Helen and team) to discuss Dataset integration approach | Santhosh | Not specified | Medium |
| 6 | Connect with Hotjar team to determine licensing tiers and pricing | Santhosh | Not specified | Medium |
| 7 | Enable Hotjar script integration for Beans production | Easwar | Not specified | Medium |
| 8 | Work with Rishab to add Hotjar configurations | Easwar | Not specified | Medium |
| 9 | Continue with current subscription model (no changes required) | Easwar | N/A | Medium |
| 10 | Follow-up discussion on payment switch | Easwar | Not specified | Medium |
| 11 | Attend or review recording of segment call with Sophie, Ziv, and Ray | Justin | 2026-03-13 | Medium |
| 12 | Log into Hotjar and configure test survey | Justin | Not specified | Medium |
| 13 | Create ticket for Hotjar integration to Beans production | Justin | Not specified | Medium |
| 14 | Cancel Monday meetings; continue with Tuesday and Thursday schedule | Justin | Not specified | Medium |
| 15 | Work with Sophie and Ziv on experimentation timeline | Justin | Not specified | Medium |
| 16 | Check with Nick regarding Hotjar budget and licensing options | Sophie | Not specified | Medium |
| 17 | Define target dates for redesign piece | Sophie | Not specified | Medium |
| 18 | Work with Justin and Ziv on experimentation pathway timeline | Sophie | Not specified | Medium |
| 19 | Participate in offline discussion with Santhosh and Prasanna regarding Dataset solution | Raam | Not specified | Medium |

---

## High Risks

- Dataset integration requires SQLite database despite goal to use single data source and platform (Databricks Unity catalog cannot be directly accessed)
- AB testing and experimentation capabilities blocked until BRG-wide solution is ready (June/July timeline)
- Hotjar premium features (heat maps, session recording) have no budget allocated for current financial year; only freemium tier available
- CT subscription integration timeline pushed to post-August, requiring continued use of current subscription model

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Action Items | 19 |
| High Priority Actions | 4 |
| Decisions | 3 |
| Participants | 6 |

---

## Related Files

- [[project-feral|Project Feral]] — Parent project for this standup
- [[2026-03-11-project-feral-standup-dataset-dashboards-segmentation|Dataset Dashboards & Segmentation (Mar 11)]] — Previous standup
