# Index File Guide

## Table of Contents

- [Purpose](#purpose)
- [When to Create](#when-to-create)
- [Templates](#templates)
- [YAML Rules](#yaml-rules)
- [Section Structure](#section-structure)
- [How to Update](#how-to-update)
- [Key Differences from Content Files](#key-differences-from-content-files)

---

## Purpose

`_index.md` files are **navigation hubs** for AI agents and Obsidian users. Agents read them to understand what a domain folder contains and whether it is the right place for their query (see CLAUDE.md "AI-First Navigation Strategy"). Human users see a Documents table with descriptions and status at a glance.

Unlike content documents, _index.md files do **not** have DOT diagrams, Quick Reference tables, detail sections, or Open Questions. They are lean navigation files.

---

## When to Create

Create an `_index.md` when adding a **new domain folder** under `docs/`.

**Order of operations:**
1. Create the folder (e.g., `docs/new-domain/`)
2. Create `_index.md` inside it (use the empty-folder template below)
3. Add the folder to the main MOC (`docs/_index.md`) in the appropriate tier
4. Then add content files to the folder

Never add content files to a folder that lacks an `_index.md`.

---

## Templates

### With Documents

```markdown
---
title: Domain Name
description: One-line summary of this domain area.
type: reference
status: complete
owner: Product
market:
  - global
tags:
  - domain-tag
  - index
aliases:
  - Domain Name Index
  - Alternative Name
related:
  - "[[docs/related-domain/_index|Related Domain]]"
---

# Domain Name

One-line summary of this domain area.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [[document-one]] | Description from YAML front-matter. | complete |
| [[document-two]] | Description from YAML front-matter. | draft |

## Domain Scope

**What belongs here:** Brief description of topics that belong in this domain.

**What doesn't belong here:**
- Off-topic category A --> See domain-a/
- Off-topic category B --> See domain-b/

## Related Areas

- [[docs/related-domain/_index|Related Domain]] - Brief description
- [[docs/other-domain/_index|Other Domain]] - Brief description
```

### Empty Folder

```markdown
---
title: Domain Name
description: One-line summary of this domain area.
type: reference
status: complete
owner: Product
market:
  - global
tags:
  - domain-tag
  - index
aliases:
  - Domain Name Index
  - Alternative Name
related: []
---

# Domain Name

One-line summary of this domain area.

## Documents

*No documents yet. This domain is ready for content.*

## Domain Scope

**What belongs here:** Brief description of topics that belong in this domain.

**What doesn't belong here:**
- Off-topic category A --> See domain-a/
- Off-topic category B --> See domain-b/

## Related Areas

- [[docs/related-domain/_index|Related Domain]] - Brief description
```

---

## YAML Rules

| Field | Value | Notes |
|-------|-------|-------|
| `type` | Always `reference` | _index.md files are navigation, not content |
| `status` | Always `complete` | Navigation hubs are always complete by definition |
| `tags` | `index` + domain tag | e.g., `[strategy, index]` or `[analytics, data, index]` |
| `aliases` | 2-4 recommended | Primary: "{Domain} Index" (e.g., "Strategy Index"). Add natural alternatives |
| `related` | Mirrors Related Areas section | Use `"[[docs/folder/_index\|Name]]"` format. Empty list `[]` if no related areas |
| `market` | Usually `[global]` | Use specific markets only if the domain is market-scoped |
| `owner` | Domain owner | Match the team that owns this domain area |
| `description` | Matches body intro line | Keep under 200 characters |

**Alias examples:**
- Strategy folder: `Strategy Index`, `Strategic Planning`
- Analytics folder: `Analytics Index`, `Data Index`
- Users folder: `Users Index`, `Customer Segments`

---

## Section Structure

Every _index.md has exactly these sections in this order:

### 1. `## Documents`

A **static markdown table** listing all content files in the folder.

| Column | Content |
|--------|---------|
| Document | Wikilink to the file: `[[filename]]` |
| Description | Copy the `description` field from the file's YAML front-matter |
| Status | Copy the `status` field from the file's YAML front-matter |

Sort rows **alphabetically by filename**.

**Do NOT use Dataview queries.** All document listings must be static tables maintained alongside content files. This ensures AI agents can read the table without Obsidian rendering.

### 2. `## Domain Scope`

Two parts:
- **What belongs here** -- One sentence describing the domain's coverage
- **What doesn't belong here** -- Bullet list of common misfits with pointers to the correct domain folder

### 3. `## Related Areas`

Wikilinks to related domain `_index.md` files with a brief description of the relationship. Use the path format: `[[docs/folder/_index|Display Name]]`.

Keep this list short (2-5 entries). Only include domains with a genuine conceptual relationship to this one.

---

## How to Update

### When adding a new content file

1. Open `docs/{folder}/_index.md`
2. Add a row to the Documents table with:
   - Wikilink to the new file
   - Description copied from the file's YAML `description` field
   - Status copied from the file's YAML `status` field
3. Keep rows sorted alphabetically by filename
4. If the new file connects this domain to a previously unrelated domain, add the domain to Related Areas (and update YAML `related` to match)

### When updating or removing a content file

If you change a file's `description` or `status`, update the matching row in the Documents table. When removing a file, delete its row. If this was the last file, replace the table with the empty-folder placeholder text.

---

## Project Subfolder Indexes

Project subfolder `_index.md` files (e.g., `docs/projects/project-feral/_index.md`) use a different template (`templates/project-index-template.md`) with these differences from domain indexes:

- **Has:** `## Documents` table and `## Meetings` table
- **Does NOT have:** `## Domain Scope` or `## Related Areas`
- **YAML:** `type: reference`, `status: in-progress`, `tags: [projects, index]`
- **Related:** links back to `[[docs/projects/_index|Projects]]`
- **Meetings table:** lists project-scoped meeting files from the `meetings/` subdirectory

---

## Key Differences from Content Files

| Aspect | Content File | _index.md |
|--------|-------------|-----------|
| `type` field | Varies (strategy, feature, etc.) | Always `reference` |
| `status` field | Varies by completion | Always `complete` |
| DOT diagram | Required | Never |
| Quick Reference | Common | Never |
| Detail sections | As needed | Never |
| Open Questions | As needed | Never |
| Documents table | Never | Always |
| Domain Scope | Never | Always |
