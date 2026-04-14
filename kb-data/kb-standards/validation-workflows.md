# Validation Workflows for KB Files

## Table of Contents

- [Three Types of Validation](#three-types-of-validation)
- [AI Self-Validation Checklist](#1-ai-self-validation-checklist)
- [Automated Script Validation](#2-automated-script-validation)
- [Manual Quality Review](#3-manual-quality-review)
- [Troubleshooting Validation Errors](#troubleshooting-validation-errors)
- [Validation Workflow Summary](#validation-workflow-summary)
- [Success Criteria](#success-criteria)

## Overview

This guide explains when and how to validate KB files using automated scripts and manual quality checks.

---

## Three Types of Validation

### 1. AI Self-Validation (Before Presenting to User)
**When**: After creating or updating any KB file, BEFORE showing user
**Purpose**: Catch structural and quality issues before user review
**Method**: Run AI Self-Validation Checklist (see below)

### 2. Automated Script Validation (After User Approval)
**When**: After user approves changes and files are updated
**Purpose**: Verify technical correctness (YAML, wikilinks, aliases)
**Method**: Run Python validation scripts

### 3. Manual Quality Review (Periodic)
**When**: Quarterly review or when completing major documentation updates
**Purpose**: Deep quality check for content, clarity, and completeness
**Method**: Human review against Documentation Principles

---

## 1. AI Self-Validation Checklist

**CRITICAL**: Run this BEFORE presenting any KB file output to user

### Structure & Format Checks

**Universal Document Structure (UDS-01)**:
- [ ] Order: YAML → H1 → Quick Ref → Framework → Diagram → Summary → Details → Related Files → Open Questions
- [ ] All sections present and in correct order

**YAML Front-Matter**:
- [ ] All 9 fields complete: title, description, type, status, owner, market, tags, aliases, related
- [ ] Aliases: 2-4 items recommended
- [ ] Related: wikilinks with double quotes around each
- [ ] Description: One sentence ending with period

**H1 Heading**:
- [ ] MUST use EXACT format: `# Title`
- [ ] Title matches YAML title field

**Wikilinks**:
- [ ] Format: `[[filename|Display Text]]`
- [ ] NO folder paths (not `[[folder/filename]]`)
- [ ] NO extra spaces or typos
- [ ] All wikilink targets exist

### Content Quality Checks (8 Anti-Redundancy Rules)

**Quick Reference (QR-01)**:
- [ ] ≤50 words total
- [ ] ≤10 seconds to comprehend
- [ ] Self-contained (readable without context)
- [ ] Format justified (bullets for ≥2 facts, paragraph for single idea)

**Framework Section (FR-01)**:
- [ ] Pattern explanation present
- [ ] Key Concepts = one-sentence definitions ONLY
- [ ] NO stories, timelines, or examples in Framework

**Rule AR-01 - Framework = Definitions Only**:
- [ ] Each concept defined in 5-10 words
- [ ] No stories, timelines, or examples

**Rule AR-02 - One Story Per Section**:
- [ ] Each conceptual story told in ONE dedicated H2 section
- [ ] No topic repeated in multiple H2 sections

**Rule AR-03 - No "Strategic Context" Duplicates**:
- [ ] No "Strategic Context" subsection that duplicates dedicated sections later

**Rule AR-04 - Diagrams Show Relationships**:
- [ ] Diagram shows connections/flows/relationships
- [ ] Diagram doesn't just restate text content

**Rule AR-05 - Summary ≠ Detail**:
- [ ] Different information in summary table vs detail sections
- [ ] No duplication between overview and details

**Rule AR-06 - Related Files = Links Only**:
- [ ] One line per wikilink
- [ ] Explains WHY files are related, not WHAT they contain

**Rule AR-07 - Open Questions = Blockers Only**:
- [ ] Questions where answers would update THIS file
- [ ] No "nice-to-know" analytics questions

**Rule AR-08 - Enhancement Opportunities Moved**:
- [ ] Enhancement Opportunities tracked in individual files (not separate tracking files)
- [ ] Or individual enhancements listed with source documents specified

### Structural Consistency (SC-01)

**Labeled Content**:
- [ ] If subsections use labels (Attributes:, Behaviour:, Key Systems:), ALL content must be labeled
- [ ] No unlabeled orphaned text at section level

### Obsidian Integration

**Aliases**:
- [ ] 2-4 items recommended
- [ ] Natural search terms (no DOC-XX.Y ID prefixes)
- [ ] Array format correct (square brackets, commas)

**Related Files**:
- [ ] Wikilinks with double quotes: `"[[filename|Display]]"`
- [ ] Each has one-line description of relationship

**Wikilinks Throughout Content**:
- [ ] Format: `[[filename|Display]]`
- [ ] NO folder paths: `[[folder/filename]]` is WRONG
- [ ] NO extra spaces: `[[filename a]]` is WRONG (typo "a")
- [ ] All targets exist

### Common Errors to NEVER Make

**❌ H1 Format Errors**:
- `# DOC-XX.Y — Title` (legacy format with ID prefix)
- `#Title` (missing space after #)
- ✅ CORRECT: `# Title`

**❌ Wikilink Format Errors**:
- `[[users/user-segments|B2C Users]]` (has folder path)
- `[[user-segments a|Users]]` (extra space "a" typo)
- `[[folder/filename|Users]]` (has folder path)
- ✅ CORRECT: `[[user-segments|B2C Users]]`

**❌ Aliases Errors**:
- `[B2C-Users]` (only 1 item, need 2-4)
- `[B2C-Users, Segments, Cohorts, Customers, Users, People]` (too many, max 4)
- ✅ CORRECT: `[B2C-Users, Segments, Cohorts]`

### Decision Rule

**If ANY check fails → FIX IT before presenting output to user**

Only show compliant, validated output.

---

## 2. Automated Script Validation

**Location**: `scripts/`

### When to Run

**Always run after**:
- Creating new KB files
- Updating existing KB files
- Batch updates to multiple files

### The Validation Suite (8 Scripts)

#### Script 1: check-yaml-completeness.py

**Purpose**: Validates YAML front-matter has all required fields

**Command**:
```bash
cd scripts
python check-yaml-completeness.py
```

**Checks**:
- ✅ All 9 fields present: title, description, type, status, owner, market, tags, aliases, related
- ✅ aliases field is array with 2-4 items
- ✅ related field is array
- ✅ No extra/unknown fields

**Expected Output**:
```
Checking YAML completeness...
✅ All KB files passed validation
```

**If Fails**:
```
❌ DOC-03.1-b2c-users.md: Missing field 'aliases'
❌ system-components.md: 'related' field is empty but source mentions other docs
```

**Fix**:
- Add missing fields to YAML
- Ensure aliases have 2-4 items; related is evidence-based (may be empty)
- Verify field names match exactly (case-sensitive)

---

#### Script 2: check-alias-uniqueness.py

**Purpose**: Ensures no duplicate aliases across all KB files

**Command**:
```bash
cd scripts
python check-alias-uniqueness.py
```

**Checks**:
- ✅ No alias used in multiple files
- ✅ Aliases are unique across repository

**Expected Output**:
```
Checking alias uniqueness...
✅ All aliases are unique across 47 files
```

**If Fails**:
```
❌ Duplicate alias "Systems" found in:
   - DOC-17.1-system-components.md
   - DOC-17.2-tech-stack.md
```

**Fix**:
- Make aliases more specific (e.g., "System Components" vs "Tech Stack")
- Remove duplicate aliases from one file

---

#### Script 3: check-wikilink-resolution.py

**Purpose**: Verifies all wikilinks point to existing files

**Command**:
```bash
cd scripts
python check-wikilink-resolution.py
```

**Checks**:
- ✅ All wikilinks use correct format: `[[filename|Display]]`
- ✅ Target files exist in repository
- ✅ No broken links

**Expected Output**:
```
Checking wikilink resolution...
✅ All 234 wikilinks resolved successfully across 47 files
```

**If Fails**:
```
❌ DOC-03.1-b2c-users.md:
   Broken wikilink: [[DOC-04.5-voc-analysis|VOC Analysis]] (target file not found)

❌ DOC-17.1-system-components.md:
   Invalid format: [[folder/DOC-17.2|Tech Stack]] (contains folder path)
```

**Fix**:
- Verify target file exists with exact filename
- Remove folder paths from wikilinks (Obsidian resolves by filename only)
- Fix typos in filenames
- Use correct display text with pipe character

---

#### Script 4: check-orphan-files.py

**Purpose**: Detects files with zero incoming wikilinks (unreachable content)

**Command**:
```bash
cd scripts
python check-orphan-files.py
```

**Checks**:
- Builds wikilink index from body + YAML `related` field across all files
- Identifies non-index files that no other file links to
- `_index.md` and `_catalog.md` exempt

**Expected Output**:
```
Checking orphan files...
[OK] Orphan check complete (warnings only)
```

**If Warns**:
```
[WARN]  features/quiz-flow.md: No incoming wikilinks (orphan)
```

**Fix**:
- Add a wikilink to the orphaned file from a related file or its parent `_index.md`
- Or add it to the YAML `related` field of a topically connected file

**Exit codes:** 0 = always (warnings only)

---

#### Script 5: check-doc-length.py

**Purpose**: Warns about oversized (>500 lines) or stub (<10 lines) files

**Command**:
```bash
cd scripts
python check-doc-length.py
```

**Checks**:
- Counts body lines (excluding YAML front-matter) for each markdown file
- Warns if >500 lines (consider splitting into sub-topics)
- Warns if <10 lines (possible stub or placeholder)
- `_index.md` exempt from min-length check

**Expected Output**:
```
Checking document lengths...
[OK] Document length check complete (warnings only)
```

**If Warns**:
```
[WARN]  architecture/beanz-hub.md: 612 lines (>500, consider splitting)
[WARN]  features/placeholder.md: 3 lines (<10, possible stub)
```

**Fix**:
- Oversized: Split into focused sub-topic files
- Stubs: Expand content or delete if placeholder

**Exit codes:** 0 = always (warnings only)

---

#### Script 6: check-tag-taxonomy.py

**Purpose**: Warns about tags not in the approved taxonomy

**Command**:
```bash
python scripts/check-tag-taxonomy.py
```

**Checks**:
- Tags in each file against approved list in `references/tag-taxonomy.md`

**Exit codes:** 0 = always (warnings only)

---

#### Script 7: check-index-completeness.py

**Purpose**: Validates folder _index.md files exist and link all content docs

**Command**:
```bash
python scripts/check-index-completeness.py
```

**Checks**:
- Every docs/ subfolder has an _index.md
- Every content file is wikilinked from its folder _index.md
- Main MOC links all 25 folders
- Required sections present, no residual Dataview blocks

**Exit codes:** 1 = errors found, 0 = all pass

---

#### Script 8: check-data-freshness.py

**Purpose**: Detects stale dynamic documents based on review cycle

**Command**:
```bash
python scripts/check-data-freshness.py
```

**Checks**:
- Documents with `temporal-type: dynamic` and `review-cycle` set
- Uses HDX four-state model: fresh, due, overdue, delinquent
- Checks git log for last modification date

**Exit codes:** 0 = always (warnings only)

---

### Running All Scripts at Once

Use the unified validation runner:

```bash
python scripts/validate-all.py
```

This runs all 8 scripts in sequence and reports a summary. Scripts 1-4 produce errors (exit code 1 on failure); scripts 5-8 produce warnings only (exit code 0).

---

## 3. Manual Quality Review

**When**: Quarterly review cycle or major documentation update

### Quality Review Checklist

**Content Quality**:
- [ ] Information is accurate and up-to-date
- [ ] No redundancy within file (say everything once)
- [ ] No redundancy with linked files (use wikilinks instead)
- [ ] All 8 Anti-Redundancy Rules followed
- [ ] Universal Document Structure (UDS-01) followed

**Clarity & Readability**:
- [ ] Quick Reference is scannable in ≤10 seconds
- [ ] Framework section defines all terms before using them
- [ ] Diagrams show relationships, not just lists
- [ ] Summary tables have Purpose columns
- [ ] Detail sections are logically organized

**Completeness**:
- [ ] All relevant information included
- [ ] No major gaps or placeholders
- [ ] Open Questions documented where appropriate
- [ ] Related Files section includes key connections

**Obsidian Integration**:
- [ ] All cross-references are wikilinks
- [ ] Wikilinks use correct format
- [ ] Aliases enable fast search
- [ ] Related files explain relationships

**Technical Accuracy**:
- [ ] Examples are correct and tested
- [ ] IDs follow conventions (F-X.Y, P-X.Y, SEG-X.Y.Z, etc.)
- [ ] Terminology consistent with glossary
- [ ] Status field accurately reflects completion

---

## Troubleshooting Validation Errors

### YAML Errors

**Error**: "Missing field 'aliases'"
- **Fix**: Add `aliases: [Short-Name, Alternative, Acronym]` to YAML

**Error**: "aliases field has only 1 item (need 2-4)"
- **Fix**: Add 1-3 more natural names or acronyms to aliases array

**Error**: "Invalid YAML syntax at line X"
- **Fix**: Check for:
  - Missing colons after field names
  - Incorrect indentation (use 2 spaces)
  - Missing quotes around wikilinks in related field

### Alias Errors

**Error**: "Duplicate alias 'Systems' found in multiple files"
- **Fix**: Make aliases more specific:
  - DOC-17.1: `[DOC-17.1, System Components, Components]`
  - DOC-17.2: `[DOC-17.2, Tech Stack, Technologies]`

**Error**: "Duplicate alias found"
- **Fix**: Make alias more specific or unique

### Wikilink Errors

**Error**: "Broken wikilink: [[filename|Display]] (target file not found)"
- **Fix Options**:
  1. Verify file exists with exact filename
  2. Check for typos in filename
  3. Create the missing KB file if needed
  4. Remove wikilink if target shouldn't exist

**Error**: "Invalid format: [[folder/filename|Display]] (contains folder path)"
- **Fix**: Remove folder path: `[[filename|Display]]`

**Error**: "Invalid format: [[filename]] (missing display text)"
- **Fix**: Add display text: `[[filename|Display Text]]`

---

## Validation Workflow Summary

**Before presenting to user** (AI Self-Validation):
1. Run AI Self-Validation Checklist
2. Fix all structural and quality issues
3. Only show compliant output

**After user approves changes** (Automated Scripts):
1. Run `python scripts/validate-all.py` (all 8 scripts)
2. Fix any errors found

**Periodic quality review** (Manual Review):
1. Review content quality
2. Verify accuracy and completeness
3. Check for redundancy
4. Ensure documentation principles followed

---

## Success Criteria

✅ **Validation successful when**:
- AI Self-Validation passes (all checks ✅)
- All 8 automated scripts pass (no errors)
- Manual review confirms quality standards met
- User approves final output

❌ **Validation failed when**:
- Any automated script reports errors
- Any AI Self-Validation check fails
- Manual review identifies quality issues
- User requests revisions

---

## Obsidian CLI Quick Checks

When Obsidian is running, use the CLI for fast spot-checks. These complement (don't replace) the Python scripts.

### One-liner health check
```bash
bash scripts/obsidian-vault-health.sh
```

### Individual CLI commands
```bash
# Link health (alias-aware — catches links Python misses via alias resolution)
obsidian vault=beanz-knowledge-base unresolved total        # Count broken links
obsidian vault=beanz-knowledge-base unresolved format=tsv   # List broken links

# Graph navigation
obsidian vault=beanz-knowledge-base backlinks file="filename"  # Who links to this file?
obsidian vault=beanz-knowledge-base links file="filename"      # What does this file link to?
obsidian vault=beanz-knowledge-base orphans total              # Files with no incoming links
obsidian vault=beanz-knowledge-base deadends total             # Files with no outgoing links

# File discovery (faster than grep, respects aliases)
obsidian vault=beanz-knowledge-base search query="topic" limit=10
obsidian vault=beanz-knowledge-base aliases total              # Total alias count

# Structure validation
obsidian vault=beanz-knowledge-base outline file="filename"    # Heading tree
obsidian vault=beanz-knowledge-base wordcount file="filename"  # Word count
obsidian vault=beanz-knowledge-base tags counts sort=count     # Tag inventory

# Vault overview
obsidian vault=beanz-knowledge-base files total                # Total file count
obsidian vault=beanz-knowledge-base files folder=docs total    # Docs file count
```

### CLI vs Python: When to use which

| Need | Use CLI | Use Python |
|------|---------|------------|
| Quick link check after editing | `unresolved total` | — |
| Full YAML schema validation | — | `check-yaml-completeness.py` |
| Find files by topic | `search query="..."` | Grep |
| Tag taxonomy compliance | — | `check-tag-taxonomy.py` |
| Orphan detection | `orphans` (fast) | `check-orphan-files.py` (KB-aware) |
| Dead-end detection | `deadends` (CLI only) | — |
| Temporal freshness | — | `check-data-freshness.py` |
| Heading structure | `outline` (CLI only) | — |
| CI/CD gate | — | `validate-all.py` |

---

## For More Information

**8 Anti-Redundancy Rules**: `DOCUMENTATION-PRINCIPLES.md`

**Universal Document Structure**: `DOCUMENTATION-PRINCIPLES.md`

**Obsidian Standards**: `obsidian-standards.md`
