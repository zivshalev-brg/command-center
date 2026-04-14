<!-- Condensed from DOCUMENTATION-PRINCIPLES.md and common-mistakes.md. Update both if rules change. -->

# Essential Rules Quick Reference

Condensed rules for all kb-author workflows. For full details with examples, see the source files.

## 8 Anti-Redundancy Rules (One-Sentence Summaries)

| Rule | Summary |
|------|---------|
| AR-01 | Framework section = one-sentence definitions only (no stories, timelines, examples) |
| AR-02 | Each conceptual story told in ONE dedicated H2 section (no repeats) |
| AR-03 | No "Strategic Context" subsections duplicating later dedicated sections |
| AR-04 | Diagrams show relationships/flows, not restating table data |
| AR-05 | Summary table and detail sections contain DIFFERENT information |
| AR-06 | Related Files = wikilinks + one-line purpose only (no content summaries) |
| AR-07 | Open Questions = blockers only (answers would update THIS file) |
| AR-08 | Enhancement opportunities tracked in individual files, not separate tracking files |

**Full rules with examples:** `references/DOCUMENTATION-PRINCIPLES.md`

## Universal Document Structure (UDS-01)

```
---
[YAML front-matter - 9 required fields]
---
# Title
## Quick Reference (≤50 words, ≤10s scannable)
## [Domain] Framework (definitions only)
## [Visual Diagram] (DOT or Mermaid — REQUIRED)
## [Summary Table] (all items with Purpose columns)
## [Detail Sections] (organized by topic)
## Related Files (wikilinks + one-line descriptions)
## Open Questions (blockers only)
```

## YAML Template

### Required Fields (9)

```yaml
---
title: Plain Title
description: One sentence ending with period.   # ≤200 characters
type: strategy                                   # strategy | ... | meeting | ... | support (14 values)
status: draft                                    # draft | in-progress | complete | superseded
owner: Team Name                                 # Finance | Platform | Product | Marketing | Operations | Legal
market: [global]                                 # global | au | de | uk | us | nl
tags: [tag1, tag2]                               # From approved taxonomy, ≤6 per file
aliases: [Short-Name, Alternative]               # 2-4 items recommended
related:                                         # Evidence-based links (may be empty)
  - "[[filename|Display]]"
---
```

### Optional Fields (5)

```yaml
# temporal-type: atemporal | static | dynamic
# data-period: FY25
# review-cycle: annual | quarterly | monthly | as-needed
# superseded-by: "[[newer-file]]"
# supersedes: "[[older-file]]"
```

## 5 Most Common Errors

### 1. H1 Format
- **Wrong:** `# DOC-01.1 — Title` or `#Title`
- **Right:** `# Title` (plain, matches YAML title)

### 2. Wikilink Format
- **Wrong:** `[[folder/filename|Text]]` or `[[filename]]`
- **Right:** `[[filename|Display Text]]` (no folder paths, always display text)

### 3. Aliases Count
- **Wrong:** 1 alias or 5+ aliases
- **Right:** 2-4 natural search terms (no DOC-XX.Y prefixes)

### 4. Related Field Quotes
- **Wrong:** `- [[file|Text]]` (unquoted in YAML)
- **Right:** `- "[[file|Text]]"` (quoted in YAML)

### 5. Description Length
- **Wrong:** Multiple sentences or >200 characters
- **Right:** One sentence ending with period, ≤200 characters

## Key Checks

- **Source Fidelity:** Every fact must exist in the source — no speculation
- **Label Fidelity:** Use exact source column headers, don't rename
- **Column Preservation:** Summary tables include ALL source columns
- **Related Links:** Evidence-based only (can you point to source text?)
- **Diagrams:** DOT or Mermaid (type-based). DOT for architecture/state machines/ERDs/agent workflows. Mermaid for sequences/timelines/Gantt/journeys/simple flows. Show relationships, not lists.

## For More Information

- **Full Anti-Redundancy Rules:** `references/DOCUMENTATION-PRINCIPLES.md`
- **Error Gallery:** `references/common-mistakes.md`
- **YAML Standards:** `references/obsidian-standards.md`
- **Validation:** `references/validation-workflows.md`
