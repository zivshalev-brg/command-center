# Obsidian Integration Standards for Beanz Knowledge Base

All KB documentation must be Obsidian-friendly. This document defines standards for YAML front-matter, wikilinks, related files, file structure, and linking patterns.

## Table of Contents

- [1. YAML Front-Matter Standards](#1-yaml-front-matter-standards)
- [2. Wikilink Standards](#2-wikilink-standards)
- [3. Related Files Section Standard](#3-related-files-section-standard)
- [4. File Structure Standard (UDS-01)](#4-file-structure-standard-uds-01)
- [5. MOC Standards](#5-moc-standards)
- [6. Validation Checklist](#6-validation-checklist)
- [7. Common Mistakes](#7-common-mistakes)
- [8. Quick Reference Card](#8-quick-reference-card)

---

## 1. YAML Front-Matter Standards

Every KB file MUST include complete YAML front-matter with all 9 fields:

```yaml
---
title: Plain Title
description: One-sentence summary of content.
type: strategy | market | user | feature | architecture | reference | analytics | finance | legal | marketing | meeting | operations | platform | support
status: draft | in-progress | complete | superseded
owner: Platform | Product | Finance | Marketing | Operations | Legal
market: [global]
tags: [architecture, payments, integration]
aliases: [Short-Name, Alternative, Acronym]
related:
  - "[[filename|Display Text]]"
---
```

### Field Requirements

| Field | Required | Format |
|-------|----------|--------|
| `title` | Yes | Plain title, no ID prefix |
| `description` | Yes | One sentence ending with period, ≤200 characters |
| `type` | Yes | One of 14 allowed values (see template above) |
| `status` | Yes | `draft` \| `in-progress` \| `complete` \| `superseded` |
| `owner` | Yes | Team responsible |
| `market` | Yes | List of markets: `global`, `au`, `de`, `uk`, `us`, `nl` |
| `tags` | Yes | Flat tags, ≤6 per file. See `references/tag-taxonomy.md` for approved vocabulary |
| `aliases` | Yes | 2-4 items recommended |
| `related` | Yes | Wikilinks to related files (may be empty if standalone) |
| `temporal-type` | Optional | `atemporal` \| `static` \| `dynamic`. For docs with time-bound content |
| `data-period` | Optional | Time period covered (e.g., `FY25`). Required if static or dynamic |
| `review-cycle` | Optional | `annual` \| `quarterly` \| `monthly` \| `as-needed` |
| `superseded-by` | Optional | Wikilink to newer version (e.g., `"[[newer-file]]"`) |
| `supersedes` | Optional | Wikilink to older version (e.g., `"[[older-file]]"`) |

### Aliases Guidelines

**Purpose:** Enable fast search and discovery in Obsidian.

**Rules:**
1. Include 2-4 natural short names users would search for
2. Include relevant acronyms if applicable
3. Use Title Case for natural names
4. NO DOC-XX.Y or ID prefixes

**Good:**
```yaml
aliases: [Platform, Platform Strategy, Service Platform]
aliases: [Systems, System Inventory, Components]
aliases: [Markets, Current Markets, Market Operations]
```

**Bad:**
```yaml
aliases: [Systems]                    # Too few
aliases: [DOC-01.1, Systems]          # DOC-XX.Y prefix not used in this KB
aliases: [systems, components]        # Should be Title Case
```

### Related Field Guidelines

**Purpose:** Explicit relationships for Obsidian graph view and navigation.

**Rules:**
1. Use wikilink format with quotes: `"[[filename|Display]]"`
2. Only include files mentioned in source or with explicit relationships
3. Empty related field is OK if source mentions no other documents
4. Relationships should be meaningful (dependencies, context, related domains)
5. Files MUST exist in the repository

**Good:**
```yaml
related:
  - "[[tech-stack|Tech Stack]]"
  - "[[integrations|Integrations]]"
```

**Bad:**
```yaml
related:
  - [[tech-stack|Tech Stack]]           # Missing quotes
  - Tech Stack                          # Plain text, not wikilink
  - "[[nonexistent-file|Fake File]]"    # File doesn't exist
```

---

## 2. Wikilink Standards

### Core Format

```markdown
[[filename|Display Text]]
```

- Use filename without extension for stability
- Use shortened display text for readability
- NO folder paths (not `[[folder/filename]]`) -- exception: `_index.md` files may use folder paths for disambiguation

### When to Create Wikilinks

**Always link:**
- First mention of a KB file in each major section
- Cross-domain references
- Related Files section entries
- List and table references to KB files

**Don't over-link:**
- Same paragraph repetition (link once per paragraph)
- Generic words ("system" without referring to a specific file)
- Table of contents duplicate links

### 6 Linking Patterns

**Pattern 1 -- In-Text References:**
```markdown
The [[system-components|System Components]] document provides a comprehensive catalog.
```

**Pattern 2 -- Lists:**
```markdown
Key documents:
- [[system-components|System Components]] - 30+ systems catalog
- [[tech-stack|Tech Stack]] - Platform technologies and dependencies
```

**Pattern 3 -- Tables:**
```markdown
| Domain | Key Document | Purpose |
|--------|--------------|---------|
| Architecture | [[system-components\|Systems]] | Component catalog |
```
Note: Escape the pipe with `\|` inside wikilinks in tables.

**Pattern 4 -- Section Cross-Links:**
```markdown
**See also:** [[integrations|Integrations]] for detailed architecture.
```

**Pattern 5 -- YAML Related Field:**
```yaml
related:
  - "[[tech-stack|Tech Stack]]"
  - "[[integrations|Integrations]]"
```

**Pattern 6 -- Related Files Section:**
```markdown
## Related Files

- [[tech-stack|Tech Stack]] - Technologies powering these systems
- [[integrations|Integrations]] - How these systems connect
```

### Cross-Domain Linking

Link across domains when files have meaningful relationships:

```markdown
# In architecture file
The [[platform-strategy|Platform Strategy]] informs technical decisions...

# In strategy file
Technical foundation provided by [[system-architecture|System Architecture]]...

# In features file
These features serve users described in [[user-segments|User Segments]]...
```

### Linking Frequency

- **First section:** Link liberally (establish context)
- **Within section:** Link first mention only, don't repeat
- **Across sections:** Re-link on first mention per H2 section

---

## 3. Related Files Section Standard

**Required placement:** Before `## Open Questions` in every KB file.

### Format

```markdown
## Related Files

- [[filename|Title]] - Description of relationship (WHY related)
- [[filename|Title]] - How they connect
```

### Writing Effective Descriptions

Descriptions should answer WHY the file is related, not WHAT it contains.

**Good:**
```markdown
- [[tech-stack|Tech Stack]] - Technologies powering these systems
- [[integrations|Integrations]] - Hub-and-spoke patterns connecting components
- [[platform-strategy|Platform Strategy]] - Strategic vision requiring this architecture
```

**Bad:**
```markdown
- [[tech-stack|Tech Stack]]                      # No description
- [[integrations|Integrations]] - Related        # Generic, unhelpful
- [[web-orchestration-services|WOS]] - See this  # Vague
```

### Selection Criteria

Choose related files based on:
1. **Direct dependencies** - Files that must be understood together
2. **Same domain context** - Sibling files in same domain
3. **Cross-domain relationships** - Files from different domains providing essential context
4. **Strategic connections** - Files that inform decision-making

**Do NOT include:**
- Circular-only relationships (linking back just because the other file links here)
- Distant relationships (too tenuous to be useful)
- Invented relationships not supported by source content

---

## 4. File Structure Standard (UDS-01)

**Mandatory section order:**

```markdown
---
[YAML front-matter with all 9 fields]
---

# Title

## Quick Reference
[2-5 lines answering "what am I looking at?" -- ≤50 words, ≤10s scannable]

## [Domain] Framework
[Pattern explanation + Key Concepts as one-sentence definitions]

## [Visual Diagram]
[DOT or Mermaid diagram showing relationships/flows]

## [Summary Table]
[All items with Purpose columns]

## [Detail Sections]
[Organized logically by topic]

## Related Files
- [[file|Title]] - Description

## Open Questions
- [ ] Questions requiring clarification (blockers only)
```

### Content Guidelines

- **Quick Reference:** Brief, self-contained, scannable in ≤10 seconds
- **Framework:** Definitions only (one sentence per concept), no stories or timelines
- **Main Content:** Free-form organization, use headings/tables/lists as appropriate
- **Open Questions:** Blockers only (answers would update THIS file)
- **Enhancement Opportunities:** Optional section, tracked separately

---

## 5. MOC Standards

**File:** `docs/_index.md` (main navigation hub)

### Required Elements

1. **All Areas table** - Every domain with description
2. **Domain organization** - All files by domain with wikilinks
3. **Navigation by theme** - Architecture, Strategy, Users, Features, Markets
4. **Status indicators** - Domain summary with file counts

### Update MOC When

- New file created: Add to domain section
- Statistics change: Update counts
- File status changes: Update status indicators
- New navigation patterns identified: Add to appropriate section

---

## 6. Validation Checklist

Use when creating or updating KB files:

### YAML Front-Matter
- [ ] All 9 fields present (title, description, type, status, owner, market, tags, aliases, related)
- [ ] Aliases: 2-4 items, Title Case, natural names (no DOC-XX.Y)
- [ ] Related: wikilinks to existing files with quotes (may be empty if standalone)
- [ ] Status: draft / in-progress / complete / superseded
- [ ] Type: one of 13 allowed values
- [ ] Tags: flat tags from approved taxonomy (see `references/tag-taxonomy.md`), ≤6 per file
- [ ] Description: one sentence ending with period, ≤200 characters

### Wikilinks
- [ ] All cross-references converted to wikilinks
- [ ] Format: `[[filename|Display Text]]`
- [ ] Display text is shortened and readable
- [ ] All wikilink targets exist in repository
- [ ] No folder paths (except _index.md files)

### Related Files Section
- [ ] Placed before `## Open Questions`
- [ ] Each entry has description explaining WHY related
- [ ] No invented relationships

### File Structure
- [ ] H1 heading: `# Title` (no prefix)
- [ ] Quick Reference section present
- [ ] Main content logically organized
- [ ] Related Files before Open Questions
- [ ] Open Questions present (blockers only)

### MOC Updates
- [ ] New file added to `docs/_index.md`
- [ ] Statistics updated if changed

### Automated Validation
```bash
python scripts/validate-all.py       # Runs all 8 content validation checks
python scripts/generate-catalog.py   # Regenerate file catalog
```

---

## 7. Common Mistakes

### YAML Mistakes

**Missing fields:**
```yaml
# BAD - incomplete YAML
---
type: architecture
title: System Components
tags: [architecture]
---

# GOOD - all 9 fields
---
title: System Components
description: Comprehensive catalog of 30+ integrated systems.
type: architecture
status: draft
owner: Platform
tags: [architecture, integration]
aliases: [Systems, Components, System Inventory]
related:
  - "[[tech-stack|Tech Stack]]"
  - "[[integrations|Integrations]]"
---
```

### Wikilink Mistakes

**Plain text instead of wikilink:**
```markdown
# BAD
See system components for details.

# GOOD
See [[system-components|System Components]] for details.
```

**Missing display text:**
```markdown
# BAD
[[system-components]]

# GOOD
[[system-components|System Components]]
```

**Over-linking in same paragraph:**
```markdown
# BAD
The [[system-components|System Components]] details [[system-components|systems]] that [[system-components|form the architecture]].

# GOOD
The [[system-components|System Components]] details systems that form the architecture.
```

**Unquoted YAML wikilinks:**
```yaml
# BAD
related:
  - [[tech-stack|Tech Stack]]

# GOOD
related:
  - "[[tech-stack|Tech Stack]]"
```

### Related Files Mistakes

**No descriptions:**
```markdown
# BAD
- [[tech-stack|Tech Stack]]
- [[integrations|Integrations]]

# GOOD
- [[tech-stack|Tech Stack]] - Technologies powering these systems
- [[integrations|Integrations]] - How these systems connect
```

### Structure Mistakes

**Wrong section order:**
```markdown
# BAD
## Open Questions
...
## Related Files
...

# GOOD
## Related Files
...
## Open Questions
...
```

---

## 8. Quick Reference Card

### YAML Template (Copy-Paste)
```yaml
---
title:
description:
type: strategy
status: draft
owner: Platform
market: [global]
tags: [domain-tag, topic-tag]
aliases: [, , ]
related:
  - "[[|]]"
# temporal-type: atemporal   # Optional: atemporal | static | dynamic
# data-period: FY25          # Optional: time period covered
# review-cycle: annual       # Optional: annual | quarterly | monthly | as-needed
# superseded-by: "[[new]]"  # Optional: link to newer version
# supersedes: "[[old]]"     # Optional: link to older version
---
```

### Wikilink Format
```markdown
[[filename|Display Text]]
```

### Related Files Template
```markdown
## Related Files

- [[filename|Title]] - Description of relationship
- [[filename|Title]] - Why this file is related
```

### Section Order
1. YAML front-matter (9 fields)
2. H1 Heading (plain title, no prefix)
3. Quick Reference (≤50 words)
4. Framework (definitions only)
5. Visual Diagram (DOT or Mermaid)
6. Summary Table
7. Detail Sections
8. Related Files
9. Open Questions (blockers only)

### Wikilink Decision Tree

```
Is this a KB file reference?
  → Yes → Is this the first mention in this section?
    → Yes → Create wikilink: [[filename|Display Text]]
    → No  → Skip (already linked above)
  → No  → Use plain text
```
