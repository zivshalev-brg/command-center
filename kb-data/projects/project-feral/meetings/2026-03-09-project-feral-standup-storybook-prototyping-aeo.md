---
title: "Project Feral Standup: Storybook Prototyping & AEO"
description: Storybook component prototyping with UI builder skill, Vercel developer access blocked, AEO/GEO ratings critically low at 1-2/10, homepage migration progressing.
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
aliases:
  - Project Feral Standup 2026-03-09
  - Feral Standup Mar 9
related:
  - "[[project-feral|Project Feral]]"
  - "[[2026-03-06-project-feral-standup-aem-contract-email-progress|AEM Contract & Email Progress (Mar 6)]]"
temporal-type: static
data-period: "2026-03"
---

# Project Feral Standup: Storybook Prototyping & AEO

> Added to KB on 2026-03-12

## Meeting Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-09 |
| **Type** | Standup |
| **Project** | [[project-feral\|Project Feral]] |
| **Participants** | Justin, Easwar, Josh, Santhosh |
| **Duration** | ~30 minutes |
| **Source** | Meeting summary |

---

## Key Takeaways

- Justin is prototyping by bringing components from Breville storybook to Beans using the UI builder skill, creating stories under XPS React
- Justin lacks Vercel developer access, causing PR deployment validation issues; requires additional license seat approval from Daniel/Rishab
- Team is successfully migrating homepage using existing content types and infrastructure provided by Josh
- AEO/GEO analysis shows low ratings (1-2 out of 10); requires cross-squad discussion to address recommendations
- Storybook MCP integration is working well for component validation, but needs access to Breville storybook locally

---

## Team Status Updates

| Team Member | Completed | In Progress | Plan | Blockers |
|-------------|-----------|-------------|------|----------|
| Justin | Raised PRs for carousel and support card components; successfully used community Storybook MCP for component validation; conducted session with Jennifer on new segments | Prototyping by bringing components from Breville storybook; building new pages using imported components; working with UI builder skill to port components | Continue cherry-picking components and building pages; need another session with Jennifer and Ziv for approval before engaging with PM | Blocked on Vercel developer access for PR deployments; cannot access Breville storybook locally (password protected) |
| Easwar | Started building headers and homepage with provided infrastructure; processing homepage migration with existing content types | Working on CMS and Mockstock for Tuesday delivery | Document and plan data capture requirements; schedule call with Oracles and squad leads on AEO/GEO | N/A |
| Josh | Provided content for integration stage one for platform; completed stage 2 for hybrid support; pushed through feature flags; added skill for feature flag control with documentation | Looking into Vercel seat issue and CI infrastructure changes | Continue focus on content type creation solution; make changes to XPS React repo for local Breville storybook access; consult with Rishab on content type creation approach | Need to determine approach for content type creation in Contentful for Beans brand; evaluating whether to change CI infrastructure across 10 repos |
| Santhosh | Completed AEO/GEO analysis over weekend showing ratings of 1-2 out of 10 | N/A | Schedule engineering call with JP, Azarhudhar, and squad leads; review AEO/GEO recommendations with team; identify Beans-specific vs. common component issues; consult with Rishab and Chauhan on Contentful AEO/GEO capabilities | N/A |

---

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Review and approve Vercel developer access request for Justin | Daniel | Not specified | **High** |
| 2 | Evaluate cost implications of additional Vercel seat | Daniel | Not specified | **High** |
| 3 | Investigate alternatives to Vercel for CI/CD to avoid licensing issues | Josh | Not specified | **High** |
| 4 | Schedule engineering call with JP, Azarhudhar, and squad leads regarding AEO/GEO | Santhosh | Not specified | **High** |
| 5 | Review and merge Justin's 4 PRs (PLP, PDP, carousel, and card support) | Easwar | Not specified | **High** |
| 6 | Send details to Rishab about Vercel seat requirements | Josh | Not specified | Medium |
| 7 | Make changes to XPS React repo to enable local Breville storybook access for Justin | Josh | Not specified | Medium |
| 8 | Continue working on content type creation solution | Josh | Not specified | Medium |
| 9 | Discuss content type creation approach with Rishab | Josh | Not specified | Medium |
| 10 | Share new release branch with Justin for future PRs | Easwar | Not specified | Medium |
| 11 | Document data capture requirements and planning | Easwar | Not specified | Medium |
| 12 | Share AEO/GEO recommendations with Josh for review | Santhosh | Not specified | Medium |
| 13 | Separate Beans-specific issues from common component issues | Santhosh | Not specified | Medium |
| 14 | Consult with Rishab and Chauhan on Contentful AEO/GEO capabilities | Santhosh | Not specified | Medium |
| 15 | Raise future PRs to new release branch once shared by Easwar | Justin | Not specified | Medium |
| 16 | Send Josh the PR that is not triggering deployment | Justin | Not specified | Medium |
| 17 | Schedule another session with Jennifer and Ziv for segment approval | Justin | Not specified | Medium |
| 18 | Review Vercel seat request and provide guidance on approach | Rishab | Not specified | Medium |
| 19 | Discuss content type creation strategy with Josh | Rishab | Not specified | Medium |
| 20 | Provide information on Contentful AEO/GEO capabilities | Rishab | Not specified | Medium |

---

## High Risks

- Vercel licensing costs and seat management may impact multiple team members and require infrastructure changes across 10 repositories
- AEO/GEO ratings are critically low (1-2 out of 10), requiring immediate cross-team coordination and remediation
- Dependency on external approvals (Daniel, Rishab) for Vercel access blocking Justin's PR workflow
- Salesforce solution progress status unclear (Anil's work not discussed)

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Action Items | 20 |
| High Priority Actions | 5 |
| Participants | 4 |

---

## Related Files

- [[project-feral|Project Feral]] — Parent project for this standup
- [[2026-03-06-project-feral-standup-aem-contract-email-progress|AEM Contract & Email Progress (Mar 6)]] — Previous standup
