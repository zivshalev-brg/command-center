---
title: "Project Feral Standup: AEM Contract & Email Progress"
description: AEM contract grace period to May 29 ($160K risk), email template API wrapper due end of sprint, segmentation nearing approval, Contentful agentic scope discussion.
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
  - analytics
  - marketing
aliases:
  - Project Feral Standup 2026-03-06
  - Feral Standup Mar 6
related:
  - "[[project-feral|Project Feral]]"
  - "[[2026-03-05-project-feral-standup-budget-cms-walkthrough|Budget & CMS Walkthrough (Mar 5)]]"
temporal-type: static
data-period: "2026-03"
---

# Project Feral Standup: AEM Contract & Email Progress

> Added to KB on 2026-03-12

## Meeting Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-06 |
| **Type** | Standup |
| **Project** | [[project-feral\|Project Feral]] |
| **Participants** | Justin, Easwar, Nagesh, Prasanna, Santhosh, Sophie |
| **Duration** | ~30 minutes |
| **Source** | Meeting summary |

---

## Key Takeaways

- Adobe has proposed a grace period until May 29th to sign the AEM contract extension. If migration is not complete by then, a six-month full rate contract costing approximately $160K will be required
- Original migration deadline was May 13th, now extended to May 29th — approximately 2 more weeks
- The team is not considered "problem children" and has flexibility to complete migration efficiently
- End-to-end prototype and storybook development is progressing well with fast-track landing page and PDP pages created
- Email template solution API wrapper expected to be ready by end of sprint
- Contentful integration is ready, but discussions ongoing about agentic capabilities and scope limitations
- Email experimentation may begin within the next couple of months, ahead of website AB testing
- Segmentation strategy work is nearing completion with final approval from Ziv expected early next week

---

## Team Status Updates

| Team Member | Completed | In Progress | Plan | Blockers |
|-------------|-----------|-------------|------|----------|
| Justin | Created fast-track landing page; started PDP page in storybook | Working on end-to-end prototype and storybook; segmentation strategy handed over to Jennifer for final updates | Continue prototype development over next couple weeks; call with Jennifer on Monday for segmentation approval; discuss with Ziv on email template requirements | Waiting for email template solution from Anil's team |
| Easwar | Contentful integration ready; pages can be created consuming Contentful and rendered | Capturing journeys requiring discussion; working on agentic Contentful scope with Rishab and Josh | Finalize what can be updated via agents vs. manual process; complete email template API wrapper by end of sprint | Discussion needed on Contentful model update restrictions; concerns about data loss with model changes |
| Nagesh | Dash upgrades completed; posted Confluence page | N/A | Close dash upgrades ticket | Need clarification on migration tracker decision options |
| Prasanna | First three tasks complete | Working on additional table creations | Complete table creation today; start data dictionary update | N/A |
| Santhosh | Met with PAM on Wednesday regarding personalization | Working on personalization with PAM; broader discussion on Blueconic ongoing | Schedule meeting with Miles and team on OGO early next week | N/A |
| Sophie | N/A | Using redesign and CMS migration as litmus test for analytics dashboard prerequisites | Determine when to start experimentation based on redesign progress | N/A |

---

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Complete segmentation transition rules updates with Ziv | Jennifer | Not specified | **High** |
| 2 | Get final approval from Ziv on segmentation strategy | Jennifer | Early next week | **High** |
| 3 | Complete email template solution API wrapper | Anil's team | End of sprint | **High** |
| 4 | Finalize scope of agentic Contentful capabilities | Rishab, Josh | Not specified | **High** |
| 5 | Call with Jennifer on Monday regarding segmentation strategy | Justin | 2026-03-10 | **High** |
| 6 | Understand Marketing Cloud HTML code requirements for email templates | Justin | Not specified | Medium |
| 7 | Work with Ziv to ensure template generation app adheres to marketing guidelines | Justin | Not specified | Medium |
| 8 | Discuss with Ziv and Ray on email experimentation approach at workshop | Justin | Not specified | Medium |
| 9 | Schedule meeting with Miles and team on OGO | Santhosh | Early next week | Medium |
| 10 | Work with Josh and Rishab on Contentful agentic scope discussion | Santhosh | Not specified | Medium |
| 11 | Discuss whether email segments will be Salesforce segments or Blueconic segments | Justin, Abby, Chris Wilson | Not specified | Medium |
| 12 | Complete remaining table creations | Prasanna | 2026-03-06 | Medium |
| 13 | Start data dictionary update | Prasanna | Not specified | Medium |
| 14 | Refinement session to discuss migration sequencing options | Team | 2026-03-06 | Medium |

---

## High Risks

- Contentful agentic capabilities scope not finalized — discussion between Rishab and Josh needed to determine what agents can update vs. manual processes to avoid data loss
- Potential for data loss when renaming existing Contentful models
- Segmentation strategy awaiting final approval from Ziv
- Email template HTML code requirements for Marketing Cloud need to be understood before Ziv's app can generate templates
- Decision needed on whether segments will be Salesforce segments or Blueconic segments for email campaigns

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Action Items | 14 |
| High Priority Actions | 5 |
| Participants | 6 |

---

## Related Files

- [[project-feral|Project Feral]] — Parent project for this standup
- [[2026-03-05-project-feral-standup-budget-cms-walkthrough|Budget & CMS Walkthrough (Mar 5)]] — Previous standup
