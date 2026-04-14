# Domain Management Guide

How to add, rename, or remove a domain folder in the Beanz KB.

## Table of Contents

- [Adding a New Domain](#adding-a-new-domain)
- [Files That Reference Domains](#files-that-reference-domains)
- [Gotchas](#gotchas)
- [Renaming a Domain](#renaming-a-domain)
- [Removing a Domain](#removing-a-domain)

---

## Adding a New Domain

### Naming Convention

Domain folder names are **short, plural nouns** in lowercase with hyphens:
`features/`, `markets/`, `partners/`, `projects/`

Avoid abstract or overlapping names. The folder name becomes the domain tag.

### Checklist

Run through every item. Skipping one will cause validation failures.

#### 1. Create the folder and index file

- [ ] Create `docs/{domain}/`
- [ ] Create `docs/{domain}/_index.md` using `templates/index-template.md`
- [ ] See `references/index-file-guide.md` for _index.md content rules

#### 2. Update the main MOC

- [ ] Edit `docs/_index.md` — add a row to the correct tier table in **All Areas**
- [ ] Format: `| [[docs/{domain}/_index\|Display Name]] | Brief description |`
- [ ] `check-index-completeness.py` validates this link exists

#### 3. Update the tag taxonomy (two places)

- [ ] Edit `.claude/skills/kb-author/references/tag-taxonomy.md` — add `{domain}` to the Domain Tags line alphabetically
- [ ] Edit `scripts/check-tag-taxonomy.py` — add `'{domain}'` to the hardcoded `APPROVED_TAGS` set (Domain section, alphabetically)
- [ ] Both must match. The script does **not** read the reference file — it has its own list.

#### 4. Update domain count references

Search for the old count and replace with the new one. Known locations:

| File | What to update |
|------|---------------|
| `CLAUDE.md` | "N domain areas" in Project Overview |
| `CLAUDE.md` | Repository Structure tree (add folder line) |
| `README.md` | "N domain areas" in Repository Structure section |
| `README.md` | Repository Structure tree (add folder line) |
| `docs/ai-automation/intelligence-platform.md` | DOT diagram label (`N domains`) |
| `docs/ai-automation/intelligence-platform.md` | Prose ("N domain indexes") |
| `docs/ai-automation/intelligence-platform.md` | Empty domains count (if applicable) |

| `.claude/skills/kb-author/references/validation-workflows.md` | "Main MOC links all N folders" |

To find others that may have been added since this guide was written:

```
Grep: pattern="\\d+ domain" across all .md files
```

#### 5. Regenerate catalog

```bash
python scripts/generate-catalog.py
```

This auto-discovers folders — no hardcoded list to update.

#### 6. Validate

```bash
python scripts/validate-all.py
python scripts/check-rule-consistency.py
```

All checks must pass with 0 errors. Tag taxonomy warnings mean step 3 was incomplete.

#### 7. Commit on a branch and create a PR

```bash
git checkout -b docs/add-{domain}-domain
# ... stage and commit ...
gh pr create
```

---

## Files That Reference Domains

Validation scripts **auto-discover** folders (no hardcoded lists) — except `check-tag-taxonomy.py` which has a hardcoded `APPROVED_TAGS` set.

| File | Type | Auto-discovers? |
|------|------|-----------------|
| `scripts/check-index-completeness.py` | Validation | Yes — scans `docs/` subdirectories |
| `scripts/check-tag-taxonomy.py` | Validation | **No** — hardcoded `APPROVED_TAGS` |
| `scripts/generate-catalog.py` | Catalog | Yes — recursive scan |
| `scripts/check-orphan-files.py` | Validation | Yes — recursive scan |
| `.claude/skills/kb-author/references/tag-taxonomy.md` | Reference | Manual — domain tag list |
| `docs/_index.md` | MOC | Manual — tier tables |
| `CLAUDE.md` | Project instructions | Manual — count + tree |
| `README.md` | Repo docs | Manual — count + tree |

---

## Gotchas

1. **Tag taxonomy has two sources.** The reference file (`tag-taxonomy.md`) and the validation script (`check-tag-taxonomy.py`) each maintain their own domain tag list. Update both or the script will warn on every file in the new domain.

2. **Domain counts are scattered.** Multiple files reference the total count in prose, DOT diagrams, and tree structures. Use `Grep` to find all occurrences before committing.

3. **Skill reference files aren't validated.** Files under `.claude/skills/` are not checked by `validate-all.py` or `check-rule-consistency.py`. Stale counts in skill references (like `architecture-design.md` or `validation-workflows.md`) will only be caught by manual review or code review.

4. **Structure tree style.** In CLAUDE.md and README.md, only the **first** folder in each tier gets the `# Tier Name` comment. Added folders in the same tier have no comment — this is intentional.

---

## Renaming a Domain

1. Rename the folder: `docs/old-name/` → `docs/new-name/`
2. Update the `_index.md` YAML (title, description, tags)
3. Find and replace all wikilinks referencing the old folder name
4. Follow steps 2–6 from the [Adding](#adding-a-new-domain) checklist (MOC, tags, counts, catalog, validate)
5. Run `python scripts/check-wikilink-resolution.py` to catch broken links

---

## Projects Use Subfolders

Unlike other domains, `docs/projects/` uses **subfolders per project** (e.g., `docs/projects/project-feral/`). Each subfolder contains:
- Project documents (main doc, status reports)
- A `meetings/` subdirectory for project-scoped meeting reports
- An `_index.md` with Documents and Meetings tables (no Domain Scope/Related Areas)

Use `templates/project-index-template.md` for new project subfolder indexes. The `check-index-completeness.py` script validates these subfolders automatically.

Non-project files (like `ideas-backlog.md`) remain at the `docs/projects/` root.

---

## Removing a Domain

1. Move or delete all content files in the domain
2. Delete the folder and its `_index.md`
3. Remove the row from `docs/_index.md`
4. Remove the domain tag from both `tag-taxonomy.md` and `check-tag-taxonomy.py`
5. Update domain counts (reverse of adding)
6. Regenerate catalog and validate
