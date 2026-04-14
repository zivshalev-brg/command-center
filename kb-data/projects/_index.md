---
title: Projects
description: Cross-functional projects, initiatives, and programs with defined goals and timelines.
type: reference
status: complete
owner: Product
market:
  - global
tags:
  - projects
  - index
aliases:
  - Projects Index
  - Initiatives
  - Programs
related:
  - "[[docs/strategy/_index|Strategy]]"
  - "[[docs/markets/_index|Markets]]"
  - "[[docs/features/_index|Features]]"
---

# Projects

Cross-functional projects, initiatives, and programs for beanz.com — from small spikes to multi-quarter strategic efforts.

## Documents

| Project | Status | Description |
|---------|--------|-------------|
| [[docs/projects/project-feral/_index\|Project Feral]] | In Progress | 26-week AI-first initiative: KB + Intelligence Platform + rapid experimentation for retention |
| [[docs/projects/operation-freedom/_index\|Operation Freedom]] | In Progress | UK pilot: zero-upfront Barista Express + 2yr coffee bundle via Klarna financing |
| [[docs/projects/ideas-backlog\|Ideas Backlog]] | In Progress | 42 active product ideas across 8 themes from Jira Product Discovery (BNZID) |

## Domain Scope

**What belongs here:** Named projects, initiatives, and work programs that span domains or have their own lifecycle. Each project gets its own subfolder (e.g., `projects/project-feral/`) containing project documents and a `meetings/` subdirectory for project-scoped meeting reports. The Documents table above serves as the active project portfolio.

**Project lifecycle conventions:**
- Status maps to lifecycle: `draft` (scoping) → `in-progress` (active) → `complete` (delivered)
- Active projects: use `temporal-type: dynamic` with `review-cycle: monthly`
- Completed projects: use `temporal-type: static` with `data-period` set to the project timeframe
- Evolving projects: use `superseded-by` when scope or version changes significantly

**What doesn't belong here:**
- Domain-specific features → See features/
- Ongoing operations → See the relevant domain folder
- Strategic vision and direction → See strategy/
- Market-specific launches (as market docs) → See markets/

## Related Areas

- [[docs/strategy/_index|Strategy]] - Strategic direction that drives project priorities
- [[docs/markets/_index|Markets]] - Market launches often tracked as projects
- [[docs/features/_index|Features]] - Feature work that projects may encompass
