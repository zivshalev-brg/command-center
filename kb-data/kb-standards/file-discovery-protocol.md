# File Discovery Protocol

Before creating any KB file, check what already exists to prevent duplicates.

## Step 1: Check Catalog (Fastest)

Read `docs/_catalog.md` for complete file list with metadata.

- Auto-generated index of ALL files in docs/
- Shows: File path, title, type, status, owner, tags
- Grouped by domain folder
- Updated by running `python scripts/generate-catalog.py`

```bash
# Check what exists before creating new file
Read docs/_catalog.md

# Look for similar titles or overlapping topics
# Check status (draft, in-progress, complete)
```

## Step 2: Check Domain Folder

Read `docs/{domain}/_index.md` - Documents table shows all files in that domain.

- Static table maintained alongside content files
- Shows description and status for each file
- Provides domain context and related areas

```bash
# Before creating docs/users/cohorts.md, check:
Read docs/users/_index.md

# Documents table will show:
# - customer-cohorts.md (already exists)
# - Any other user-related files
```

## Step 3: Search by Content (If Needed)

Use Grep to search for specific terms across KB.

**When to use:**
- Looking for mentions of specific features, segments, or concepts
- Checking if topic already covered in different domain
- Finding all references to a specific term

```bash
# Search for mentions of a specific term across all KB files
Grep pattern="TERM" path="docs" output_mode="files_with_matches"

# Search for specific IDs or patterns
Grep pattern="PATTERN" path="docs" output_mode="content"
```

## Step 4: Document in Analysis

Always include discovery findings in your analysis response:

**Files Found:**
- `docs/users/user-segments.md` - Customer segments (status: complete)
- `docs/reference/glossary.md` - MISSING (recommend creating)

**Missing Dependencies:**
- Glossary file needed for terminology
- ID conventions file not found

**Overlap Risk:**
- None detected OR
- Potential overlap with `docs/features/personalization.md` - recommend consolidating

This prevents duplicate files, missing dependencies, fragmented information, and redundant content creation.
