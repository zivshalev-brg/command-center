---
name: kb-author
description: Use when creating or updating knowledge base files in beanz.com KB. Enforces documentation standards (8 Anti-Redundancy Rules, Universal Document Structure), YAML templates, Obsidian integration, and validation workflows. Primary use analyzing input documents and translating findings into structured markdown files with proper wikilinks, aliases, and metadata. Run AI Self-Validation Checklist before presenting output.
---

# Beanz Knowledge Base Framework

## Table of Contents

- [When to Use This Skill](#when-to-use-this-skill) - Triggers and scope
- [Quick Reference Hub](#-quick-reference-hub) - Common tasks and lookups
- [Critical Requirements](#-critical-reference-files-are-not-optional) - MUST READ references
- [Quick Start Workflows](#quick-start-workflows) - 3 workflows
- [AI Self-Validation Checklist](#ai-self-validation-checklist) - Run before presenting output
- [YAML Template](#yaml-template-9-required-fields) - 9 required fields
- [Reference Files Guide](#reference-files-guide) - When to load which reference

---

## When to Use This Skill

**Document Analysis** (Most Common):
- User shares PDF, spreadsheet, Confluence page, technical diagram
- Need to extract findings and propose KB file updates
- Requires structured analysis format with Obsidian standards

**KB File Management**:
- Creating new markdown files in `docs/` folders
- Updating existing KB files with new findings
- Enforcing quality standards (8 Anti-Redundancy Rules, Universal Document Structure)

**Quality Gates**:
- Running validation scripts (YAML, wikilinks, aliases)
- Applying AI Self-Validation Checklist before presenting output
- Converting plain text references to wikilinks

---

## Quick Reference Hub

### Most Common Tasks
1. **Analyzing input documents** → [Workflow 1](#workflow-1-analyzing-input-documents)
2. **Creating new KB files** → [Workflow 2](#workflow-2-creating-new-kb-files)
3. **Running validation** → [Workflow 3](#workflow-3-running-validation)
4. **Creating/updating _index.md** → See `references/index-file-guide.md`
5. **Meeting reports** → Use `meeting-analyzer` skill (NOT kb-author)

### Essential Cheat Sheets
- **YAML Template** → [9 Required Fields](#yaml-template-9-required-fields)
- **Wikilink Format** → `[[filename|Display Text]]` (no folder paths, except _index.md)
- **8 Anti-Redundancy Rules** → See `references/DOCUMENTATION-PRINCIPLES.md`
- **Common Errors** → See `references/common-mistakes.md`
- **Validation Commands** → See `references/validation-workflows.md`

### Quick Lookups
- **Segments & Cohorts** → See `references/segment-cohort-framework.md`
- **ID Conventions** → F-X.Y, P-X.Y, SEG-X.Y.Z, COH-X.Y, E-X.Y, N-X.Y

---

## CRITICAL: Reference Files Are NOT Optional

**BLOCKING REQUIREMENT:** Before ANY workflow, read `references/essential-rules.md` (~120 lines). Then load workflow-specific references:

| Workflow | Additional Required References | Approx. Lines |
|----------|-------------------------------|---------------|
| **W1: Analyze** | + `document-analysis-guidelines.md` | ~760 total |
| **W2: Create** | + `DOCUMENTATION-PRINCIPLES.md` + `obsidian-standards.md` + `graphviz-quick-guide.md` | ~1,809 total |
| **W3: Validate** | + `validation-workflows.md` | ~628 total |

**Why:** essential-rules.md provides rule summaries for all workflows. Full reference files add examples and detailed guidance only when needed. W1 analysis saves ~51% context vs loading everything; W3 validation saves ~60%.

### Quality Gate

**BEFORE any workflow, confirm:**
- [ ] I have read essential-rules.md IN FULL
- [ ] I have read the workflow-specific references listed above
- [ ] I can explain AR-05 "Summary ≠ Detail" from the rules
- [ ] I can explain QR-01 "Quick Reference" format criteria

---

## Workflows

The DOT diagrams below are the authoritative workflows. Follow the edges for your situation. Reference details (commands, templates, rules) that don't fit in node labels are in the [Node Reference](#node-reference) sections after each diagram.

**Decision 1** routes requests → **Decision 6** drives file creation → **Decision 4** chains post-analysis steps. Decisions 2, 3, 5, 8 are consulted at specific nodes within those flows.


### Decision 1: Which Workflow?

Routes requests to the right workflow. After analysis completes, see Decision 4 for next steps.

#### Node Reference (Decision 1)

- **`w1` / `w1u` (Analyze)**: Read `references/essential-rules.md` + `references/document-analysis-guidelines.md` first (BLOCKING). Include Obsidian standards in every proposed update (aliases, related, wikilinks). Run AI Self-Validation Checklist before presenting.
- **`discover` (File Discovery)**: See `references/file-discovery-protocol.md`. CLI shortcut: `obsidian vault=beanz-knowledge-base search query="topic" limit=10`
- **`w3` (Validation)**: See [validation commands](#validation-commands-validate-node) below.
- **Meeting transcript**: Use `meeting-analyzer` skill (NOT kb-author).

```dot
digraph workflow_routing {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="User request\nreceived", fillcolor="#E8E8E8"];
    what [shape=diamond, label="What did the\nuser provide?", fillcolor="#FFF4CC"];
    meeting_skill [label="Use meeting-analyzer skill"];
    w1 [label="Run Workflow 1:\nAnalyze Document"];
    exist [shape=diamond, label="Does file\nalready exist?", fillcolor="#FFF4CC"];
    discover [label="Run Workflow 1.5:\nFile Discovery"];
    w3 [label="Run Workflow 3:\nRun Validation"];
    w2 [label="Run Workflow 2:\nCreate New File"];
    w1u [label="Run Workflow 1:\nUpdate Existing File"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> what;
    what -> meeting_skill [label="Meeting transcript"];
    what -> w1 [label="Document/image/PDF"];
    what -> exist [label="Request to create KB file"];
    what -> w3 [label="Request to run checks"];
    meeting_skill -> done;
    exist -> discover [label="no"];
    exist -> w1u [label="yes"];
    discover -> w2;
    w1 -> done [label="then Decision 4"];
    w2 -> done;
    w3 -> done;
    w1u -> done [label="then Decision 4"];
}
```

### Decision 2: Detail Sections Needed?

```dot
digraph detail_sections {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="Determine\noutput format", fillcolor="#E8E8E8"];
    format [shape=diamond, label="What is the\nsource format?", fillcolor="#FFF4CC"];
    extra [shape=diamond, label="Does source have\nnarrative beyond\ntable cells?", fillcolor="#FFF4CC"];

    uds [label="Use standard UDS structure\nwith detail sections", fillcolor="#D4E7C5"];
    keep_list [label="Keep as bullet list\nDo NOT convert to table", fillcolor="#D4E7C5"];
    detail [label="Add detail sections\nfor extra content only", fillcolor="#D4E7C5"];
    table_rules [label="Table IS the doc — NO detail sections\n\n1. Preserve ALL source columns\n2. Use exact source column headers\n3. Blank cells = 'not specified in source'", fillcolor="#D4E7C5"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> format;
    format -> uds [label="Narrative text"];
    format -> keep_list [label="Bullet list"];
    format -> extra [label="Table"];
    extra -> detail [label="yes"];
    extra -> table_rules [label="no"];
    uds -> done;
    keep_list -> done;
    detail -> done;
    table_rules -> done;
}
```

### Decision 3: Should I Add This Related Link?

```dot
digraph related_link {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="Evaluate\nrelated link", fillcolor="#E8E8E8"];
    evidence [shape=diamond, label="Can I point to a\nspecific word/phrase\nin the source?", fillcolor="#FFF4CC"];
    drop [label="STOP: Do NOT\nadd the link", shape=octagon, fillcolor="#FFD4CC", color="#E07856"];
    index [shape=diamond, label="Is target an\n_index.md file?", fillcolor="#FFF4CC"];
    scope [shape=diamond, label="Does source explicitly\ndiscuss that\ndomain's scope?", fillcolor="#FFF4CC"];
    add [label="Add link with\nevidence-based description", fillcolor="#D4E7C5"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> evidence;
    evidence -> drop [label="no"];
    evidence -> index [label="yes"];
    index -> scope [label="yes"];
    index -> add [label="no"];
    scope -> add [label="yes"];
    scope -> drop [label="no"];
    add -> done;
    drop -> done;
}
```

### Decision 4: What Comes Next? (Workflow Chaining)

**Note:** D4 is the high-level chaining view. If D4 routes you to "Create New File" or "Run Validation", follow **Decision 6** for the detailed step-by-step flow (D6 includes approval, MOC updates, and validation loops that D4 abbreviates).

```dot
digraph workflow_chain {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="Workflow 1\ncomplete", fillcolor="#E8E8E8"];
    new_topic [shape=diamond, label="New topic\ndiscovered?", fillcolor="#FFF4CC"];
    present [label="Present analysis\nto user"];
    w2 [label="Run Workflow 2:\nCreate New File"];
    approved [shape=diamond, label="User approved\nfile creation?", fillcolor="#FFF4CC"];
    update_approved [shape=diamond, label="User approved\nupdates?", fillcolor="#FFF4CC"];
    w3 [label="Run Workflow 3:\nRun Validation"];
    update_moc [label="Update MOC\n(docs/_index.md)"];
    done [label="Done", shape=doublecircle, fillcolor="#D4E7C5"];

    start -> new_topic;
    new_topic -> present [label="no — update only"];
    new_topic -> w2 [label="yes"];
    present -> update_approved;
    update_approved -> w3 [label="yes"];
    update_approved -> present [label="no — revise"];
    w2 -> approved;
    approved -> w2 [label="no — revise"];
    approved -> update_moc [label="yes"];
    update_moc -> w3;
    w3 -> done;
}
```

### Decision 5: Market-Specific Content?

```dot
digraph market_content {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="Evaluate\nmarket content", fillcolor="#E8E8E8"];
    has_market [shape=diamond, label="Source contains\nmarket-specific\ncontent?", fillcolor="#FFF4CC"];
    global [label="Create standard file\nmarket: [global]", fillcolor="#D4E7C5"];
    canonical [shape=diamond, label="Does a global/canonical\nfile exist for\nthis topic?", fillcolor="#FFF4CC"];
    create_both [label="Create canonical file\n(market: [global])\nthen create delta file", fillcolor="#D4E7C5"];
    create_delta [label="Create delta file only", fillcolor="#D4E7C5"];

    rules [label="Delta file rules:\n- Filename: {topic}--{market}.md\n- YAML: extends: \"[[canonical-file]]\"\n- Content: ONLY market differences\n- Related: must link to canonical", fillcolor="#BBD8F0"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> has_market;
    has_market -> global [label="no"];
    has_market -> canonical [label="yes"];
    canonical -> create_delta [label="yes"];
    canonical -> create_both [label="no"];
    create_both -> rules;
    create_delta -> rules;
    rules -> done;
    global -> done;
}
```

### Decision 6: KB File Creation Process Cycle

```dot
digraph creation_cycle {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="New KB file\nneeded", fillcolor="#E8E8E8"];
    discover [label="Run File Discovery\n(Workflow 1.5)"];
    exists [shape=diamond, label="File already\nexists?", fillcolor="#FFF4CC"];
    update [label="Update existing file\n(Workflow 1)"];
    draft [label="Draft file using\nUDS-01 structure"];
    check_market [shape=diamond, label="Source contains\nmarket-specific content?\n(see Decision 5)", fillcolor="#FFF4CC"];
    check_temporal [shape=diamond, label="Source contains\nmetrics/dates/\nfiscal years?", fillcolor="#FFF4CC"];
    classify_temporal [label="Classify temporal type\nper Decision Tree 7\n(temporal-data-guide.md)"];
    check_diagram [label="Check for diagram\n(DOT or Mermaid)"];
    diagram_found [shape=diamond, label="Diagram found?", fillcolor="#FFF4CC"];
    add_diagram [label="Add diagram\n(see Decision Tree 8)"];
    checklist [shape=diamond, label="AI Self-Validation\nChecklist passes?", fillcolor="#FFF4CC"];
    fix [label="Fix failing checks"];
    present [label="Present to user"];
    approved [shape=diamond, label="User approved?", fillcolor="#FFF4CC"];
    revise [label="Revise per feedback"];
    create_file [label="Create file +\nUpdate MOC +\nUpdate folder _index", fillcolor="#D4E7C5"];
    validate [label="Run validation scripts +\ncatalog regeneration"];
    scripts_pass [shape=diamond, label="All scripts\npass?", fillcolor="#FFF4CC"];
    fix_scripts [label="Fix validation errors"];
    commit [label="Create atomic commit", fillcolor="#D4E7C5"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> discover;
    discover -> exists;
    exists -> update [label="yes"];
    exists -> draft [label="no"];
    update -> validate;
    draft -> check_market;
    check_market -> check_temporal [label="no — global\nor multi-market"];
    check_market -> check_temporal [label="yes — apply\nDecision 5 rules"];
    check_temporal -> classify_temporal [label="yes"];
    check_temporal -> check_diagram [label="no"];
    classify_temporal -> check_diagram;
    check_diagram -> diagram_found;
    diagram_found -> checklist [label="yes"];
    diagram_found -> add_diagram [label="no"];
    add_diagram -> check_diagram [label="verify"];
    checklist -> present [label="all pass"];
    checklist -> fix [label="failures found"];
    fix -> checklist [label="re-run"];
    present -> approved;
    approved -> create_file [label="yes"];
    approved -> revise [label="no"];
    revise -> checklist [label="re-validate"];
    create_file -> validate;
    validate -> scripts_pass;
    scripts_pass -> commit [label="yes"];
    scripts_pass -> fix_scripts [label="no"];
    fix_scripts -> validate [label="re-run"];
    commit -> done;
}
```

#### Node Reference (Decision 6)

- **`draft` (UDS-01 structure)**: `YAML → H1 → Quick Ref (≤50 words) → Framework → Diagram (REQUIRED) → Summary Table → Detail Sections → Related Files → Open Questions`
- **`check_diagram`**: Every KB file must have at least one diagram (DOT or Mermaid) — see Decision 8. Must show something tables don't (AR-04).
- **`create_file`**: Update MOC (`docs/_index.md`) + folder `_index.md`. For new domains, follow `references/domain-management-guide.md`.
- **`cli_quick`**: `obsidian vault=beanz-knowledge-base unresolved total` + `obsidian vault=beanz-knowledge-base backlinks file="new-file-name"`
- **Commit message format**: New file: `"Add {domain}: {title}"`, Update: `"Update {domain}: {title} — {summary}"`. Always include `Co-Authored-By: Claude <noreply@anthropic.com>`.

**This KB does NOT use DOC-XX.Y format** — filenames are `b2c-users.md` not `DOC-03.1-b2c-users.md`, H1 is `# B2C Users` not `# DOC-03.1 — B2C Users`.

#### Validation commands (`validate` node)

```bash
# Optional CLI quick-check (requires Obsidian running)
obsidian vault=beanz-knowledge-base unresolved total

# Required: runs all 8 scripts (1-4 error, 5-8 warning)
python scripts/validate-all.py

# Required: regenerate catalog
python scripts/generate-catalog.py
```

See `references/validation-workflows.md` for detailed examples.

### Decision 8: Diagram Format Selection (DOT vs Mermaid)

Use this tree during Workflow 2 (Creation) when adding diagrams to KB files, and during file updates when reviewing existing diagrams. Check Mermaid-exclusive types first, then apply complexity thresholds for shared types, finally check DOT-preferred categories.

```dot
digraph diagram_format_decision {
    rankdir=TB;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif", shape=box, style="rounded,filled"];
    edge [fontname="Helvetica,Arial,sans-serif", fontsize=10];

    // Entry
    start [shape=doublecircle, label="Need diagram\nfor KB file", fillcolor="#E8E8E8"];

    // Mermaid-exclusive branch
    exclusive_check [label="Is it sequence/\ntimeline/Gantt/journey/\npie/quadrant?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];
    use_mermaid_exclusive [label="Use Mermaid\n(exclusive type)", fillcolor="#BBD8F0", color="#4A90D9"];

    // Shared types - complexity checks
    shared_type [label="Type with\ncomplexity threshold?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];

    state_check [label="State machine\nwith ≤15 states?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];
    erd_check [label="ERD with\n≤5 tables?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];
    class_check [label="Class diagram\nwith ≤8 classes?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];
    flowchart_check [label="Simple flowchart?\n(narrative/process)", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];

    use_mermaid_simple [label="Use Mermaid\n(simple case)", fillcolor="#BBD8F0", color="#4A90D9"];
    use_dot_complex [label="Use DOT\n(complex/\nlayout-critical)", fillcolor="#D4E7C5", color="#7FA650"];

    // DOT-preferred types
    dot_preferred [label="Architecture/\nagent workflow/\ncomplex flowchart?", shape=diamond, fillcolor="#FFF4CC", color="#F0B429"];
    use_dot_preferred [label="Use DOT\n(preferred for type)", fillcolor="#D4E7C5", color="#7FA650"];

    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    // Flow
    start -> exclusive_check;

    // Mermaid-exclusive path
    exclusive_check -> use_mermaid_exclusive [label="yes"];

    // Shared types path
    exclusive_check -> shared_type [label="no"];
    shared_type -> state_check [label="state machine"];
    shared_type -> erd_check [label="ERD"];
    shared_type -> class_check [label="class diagram"];
    shared_type -> flowchart_check [label="flowchart"];

    state_check -> use_mermaid_simple [label="yes"];
    state_check -> use_dot_complex [label="no"];

    erd_check -> use_mermaid_simple [label="yes"];
    erd_check -> use_dot_complex [label="no"];

    class_check -> use_mermaid_simple [label="yes"];
    class_check -> use_dot_complex [label="no"];

    flowchart_check -> use_mermaid_simple [label="yes"];
    flowchart_check -> use_dot_complex [label="no"];

    // DOT-preferred path
    shared_type -> dot_preferred [label="none of above"];
    dot_preferred -> use_dot_preferred [label="yes"];
    dot_preferred -> use_mermaid_simple [label="no (default)"];

    use_mermaid_exclusive -> done;
    use_mermaid_simple -> done;
    use_dot_complex -> done;
    use_dot_preferred -> done;
}
```

---

## AI Self-Validation Checklist

**Run this checklist BEFORE presenting ANY KB file output to user.** Fix all failures before presenting.

```dot
digraph validation_loop {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="KB file\ndrafted", fillcolor="#E8E8E8"];

    check_structure [label="Check Structure\n& Format\n(UDS, YAML, diagram, tags)"];
    struct_pass [shape=diamond, label="All structure\nchecks pass?", fillcolor="#FFF4CC"];
    fix_structure [label="Fix structure\nfailures"];

    check_content [label="Check Content\nQuality\n(Anti-Redundancy +\nTemporal Rules)"];
    content_pass [shape=diamond, label="All content\nchecks pass?", fillcolor="#FFF4CC"];
    fix_content [label="Fix content\nfailures"];

    check_table [label="Check Table-as-Source\nRules\n(columns, blanks, detail)"];
    table_pass [shape=diamond, label="All table\nchecks pass?", fillcolor="#FFF4CC"];
    fix_table [label="Fix table\nfailures"];

    check_obsidian [label="Check Obsidian\nIntegration\n(related, wikilinks)"];
    obsidian_pass [shape=diamond, label="All Obsidian\nchecks pass?", fillcolor="#FFF4CC"];
    fix_obsidian [label="Fix Obsidian\nfailures"];

    check_antipattern [label="Anti-Pattern Scan\n(every pattern in\ncommon-mistakes.md)"];
    antipattern_pass [shape=diamond, label="All patterns\npass?", fillcolor="#FFF4CC"];
    fix_antipattern [label="Fix anti-pattern\nfailures"];

    present [label="Present output\nto user", fillcolor="#D4E7C5"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> check_structure;
    check_structure -> struct_pass;
    struct_pass -> check_content [label="yes"];
    struct_pass -> fix_structure [label="no"];
    fix_structure -> check_structure [label="re-check"];

    check_content -> content_pass;
    content_pass -> check_table [label="yes"];
    content_pass -> fix_content [label="no"];
    fix_content -> check_content [label="re-check"];

    check_table -> table_pass;
    table_pass -> check_obsidian [label="yes"];
    table_pass -> fix_table [label="no"];
    fix_table -> check_table [label="re-check"];

    check_obsidian -> obsidian_pass;
    obsidian_pass -> check_antipattern [label="yes"];
    obsidian_pass -> fix_obsidian [label="no"];
    fix_obsidian -> check_obsidian [label="re-check"];

    check_antipattern -> antipattern_pass;
    antipattern_pass -> present [label="yes"];
    antipattern_pass -> fix_antipattern [label="no"];
    fix_antipattern -> check_antipattern [label="re-check"];

    present -> done;
}
```

### Structure & Format

- [ ] **UDS-01**: Section order: YAML → H1 → Quick Ref → Framework → Diagram (REQUIRED) → Summary → Details → Related Files → Open Questions
- [ ] **Diagram**: File includes at least one diagram (DOT or Mermaid) showing relationships, flows, or hierarchy (not restating lists/tables — AR-04). Use DOT for architecture/state machines/ERDs/agent workflows; Mermaid for sequences/timelines/Gantt/journeys/simple flows.
- [ ] **MOC Updated**: New file added to `docs/_index.md` under appropriate status section
- [ ] **Folder _index updated**: New file added to folder `_index.md` Documents table
- [ ] **YAML**: All 9 fields present (title, description, type, status, owner, market, tags, aliases, related)
- [ ] **Aliases**: 2-4 items recommended, natural names only (NO DOC-XX.Y)
- [ ] **Related**: Files with content relationships to source topic (may be empty if no clear connections)
- [ ] **Description**: One sentence, ends with period, ≤200 characters
- [ ] **Type**: One of: strategy, market, user, feature, architecture, reference, analytics, finance, legal, marketing, meeting, operations, platform, support
- [ ] **Meeting Exemption**: Files with `type: meeting` follow meeting-report-template (NOT UDS-01). Exempt from Quick Reference, Framework, diagram, and Anti-Redundancy Rules.
- [ ] **H1**: Plain title, matches YAML title, no DOC-XX.Y prefix
- [ ] **Tags**: Flat tags from approved taxonomy (`references/tag-taxonomy.md`), ≤6 per file, no colon prefixes
- [ ] **Wikilinks**: Format `[[filename|Display Text]]`, no folder paths (except _index.md), all targets exist
- [ ] **Market Detection**: If source discusses specific markets, followed [Decision Tree 5](#decision-5-market-specific-content) (canonical vs delta)
- [ ] **Delta File**: If delta, filename uses `--{market}` suffix, has `extends` field, contains ONLY market-specific content

### Content Quality (8 Anti-Redundancy Rules)

- [ ] **Source Fidelity**: Every fact in the file exists in the source document — no synthesized definitions, no filled-in blanks, no speculation presented as fact
- [ ] **Label Fidelity**: Use exact source column headers/labels as section labels. Don't rename for clarity (e.g., don't rename "Attributes" to "Entry Criteria"). Flag potential renames as Open Questions instead.
- [ ] **QR-01**: Quick Reference ≤50 words, self-contained, ≤10s to comprehend
- [ ] **FR-01**: Framework = one-sentence definitions only, no stories/timelines
- [ ] **AR-01–08**: Each story told once; no duplicated content across sections; diagrams show relationships not lists; summary ≠ detail content; related files = links + one-line purpose only; open questions = blockers only
- [ ] **SC-01**: If subsections use labels, ALL content must be labeled
- [ ] **Temporal Classification**: If doc contains numbers/metrics/KPIs/dates, `temporal-type` is set. See `references/temporal-data-guide.md`
- [ ] **Data Period**: If temporal-type is static or dynamic, `data-period` is set
- [ ] **Period Labels**: Time-bound sections have period in heading (e.g., "Revenue (FY25)")
- [ ] **Alias Scoping**: If period-specific file, aliases include the period (e.g., "FY25 Results" not "Annual Results")

### Table-as-Source Rules

- [ ] **Column Preservation**: Summary tables must include ALL source columns. Compress by reducing row detail, not by dropping columns.
- [ ] **Detail Section Necessity**: If source is a table with no additional narrative, the table IS the complete documentation. Don't create detail sections that merely reformat table cells into labeled paragraphs (AR-05 violation). Detail sections should only exist if they add information beyond what's in the table.
- [ ] **Blank Cells**: Preserve blank cells as "*(not specified in source)*" — don't fill in plausible content.

### Obsidian Integration

- [ ] **Related files inference**: Examine source content for domains/topics mentioned (communications, features, analytics, systems, etc.) → check catalog for relevant files → link based on content overlap (not folder structure)
- [ ] **Related field - _index exclusion**: Never link to domain `_index.md` files unless source content explicitly discusses that domain's scope. Don't link to parent folders just because of file location.
- [ ] **Related field - evidence required**: For each related link, identify the specific source content (word/phrase/concept) that indicates the relationship. If no source evidence exists, don't add the link.
- [ ] Related files format: wikilinks with double quotes `"[[filename|Display]]"`, one-line description of WHY related
- [ ] All file references throughout content converted to wikilinks

### Anti-Pattern Scan

Iterate every numbered pattern in `references/common-mistakes.md` and record PASS/FAIL with one-line evidence:

- [ ] For EACH pattern in common-mistakes.md: checked output against WRONG examples → recorded PASS or FAIL with evidence
- [ ] **Priority patterns** (extra scrutiny): Source Fidelity (Content Quality checklist), Label Fidelity (Content Quality checklist), Column Preservation (Table-as-Source checklist), Quick Reference word count (common-mistakes #11), Diagram presence (common-mistakes #12)
- [ ] All FAIL items fixed before proceeding
- [ ] Scan summary reported (e.g., "Anti-Pattern Scan: 12/12 PASS")

**See**: `references/common-mistakes.md` for detailed error patterns with examples (count all numbered sections)

**Decision Rule: If ANY check fails → FIX IT before presenting output**

---

## Common Scenarios

### Scenario: Source is a Table

**Source:** Customer cohort table with columns: Cohort, Attributes, Behaviour, Needs, Focus

**Correct Approach:**
- Create summary table with ALL 5 source columns
- Use exact source column headers (Attributes, not "Entry Criteria")
- NO detail sections (table is complete as-is, no additional narrative to add)
- Note blank cells: "*(not specified in source)*"
- Diagram shows relationships/flow between items (not restating the table)

**Wrong Approach:**
- Drop "Behaviour" column from summary
- Rename "Attributes" to "Entry Criteria"
- Create detail sections that restate table cells as labeled paragraphs
- Fill in blank cells with plausible content
- Add "Definition:" labels that don't exist in source

### Scenario: Related Field Links

**Correct:** Link to `[[communications/_index|Communications]]` because source "Focus" column explicitly describes communication strategies (welcome emails, brew guides, win-back offers).

**Wrong:** Link to `[[_index|Users Index]]` because the file lives in `docs/users/`. That's folder-structure linking, not content-based.

**Test:** For each related link, can you point to the specific word/phrase in the source that evidences the relationship? If not, don't add the link.

### Scenario: Market-Specific Source Document

**Source:** AU payment gateway configuration with Adyen-specific settings

**Correct Approach:**
- Check if `payments.md` (canonical) exists
- If yes: create `payments--au.md` (delta) with `extends: "[[payments]]"`
- Delta contains ONLY AU-specific content (Adyen config, AUD, AU regulations)
- Shared payment logic stays in canonical file

**Wrong Approach:**
- Create standalone `payments-au.md` duplicating shared payment logic
- Add AU content as a section in the canonical `payments.md`

---

## YAML Template (9 Required Fields)

```yaml
---
title: Plain Title                    # NO DOC-XX.Y prefix
description: One sentence ending with period.  # ≤200 characters
type: strategy                        # strategy | market | user | feature | architecture | reference | analytics | finance | legal | marketing | meeting | operations | platform | support
status: draft                         # draft | in-progress | complete | superseded
owner: Team Name                      # Finance | Platform | Product | Marketing | Operations | Legal
market: [global]                      # global | au | de | uk | us | nl
tags: [strategy, b2b]                # Flat tags from approved taxonomy (see tag-taxonomy.md)
aliases: [Short-Name, Alternative, Acronym]  # 2-4 items recommended (NO doc_id)
related:                              # Infer from source content (may be empty if no clear connections)
  - "[[filename|Display]]"            # Link based on content overlap, not folder structure
# OPTIONAL — only for market delta files:
# extends: "[[canonical-file]]"
# TEMPORAL METADATA (add for docs with time-bound content):
# temporal-type: atemporal | static | dynamic
# data-period: FY25
# review-cycle: annual | quarterly | monthly | as-needed
# SUPERSESSION (add when a newer version exists):
# superseded-by: "[[newer-file]]"
# supersedes: "[[older-file]]"
---
```

---

## Reference Files Guide

**When to Load Each Reference:**

```dot
digraph ref_loading {
    rankdir=TD;
    fontname="Helvetica,Arial,sans-serif";
    node [fontname="Helvetica,Arial,sans-serif" shape=box style="rounded,filled" fillcolor="#BBD8F0"];
    edge [fontname="Helvetica,Arial,sans-serif" fontsize=10];

    start [shape=doublecircle, label="Task\nreceived", fillcolor="#E8E8E8"];
    block [label="ALWAYS read first:\nessential-rules.md\n(~120 lines)", fillcolor="#FFD4CC", color="#E07856"];
    refs_read [shape=diamond, label="Read both\nmandatory files?", fillcolor="#FFF4CC"];
    task_type [shape=diamond, label="What is the\ntask type?", fillcolor="#FFF4CC"];

    analyze [label="Load:\n+ document-analysis-guidelines.md\n+ common-mistakes.md\n+ obsidian-standards.md"];
    create [label="Load:\n+ DOCUMENTATION-PRINCIPLES.md\n+ obsidian-standards.md\n+ graphviz-quick-guide.md\n+ file-discovery-protocol.md\n+ tag-taxonomy.md\n+ common-mistakes.md"];
    validate [label="Load:\n+ validation-workflows.md"];

    has_segments [shape=diamond, label="Involves segments\nor cohorts?", fillcolor="#FFF4CC"];
    load_seg [label="Also load:\nsegment-cohort-framework.md"];

    has_ids [shape=diamond, label="Involves feature/page\nIDs?", fillcolor="#FFF4CC"];
    load_ids [label="Also load:\nid-prefix-conventions.md"];

    has_terms [shape=diamond, label="Unfamiliar BRG\nterminology?", fillcolor="#FFF4CC"];
    load_terms [label="Also load:\nbeanz-brg-glossary.md"];

    has_temporal [shape=diamond, label="Source contains\nmetrics/dates/\nfiscal years?", fillcolor="#FFF4CC"];
    load_temporal [label="Also load:\ntemporal-data-guide.md"];

    has_index [shape=diamond, label="Creating or updating\n_index.md?", fillcolor="#FFF4CC"];
    load_index [label="Also load:\nindex-file-guide.md"];

    has_domain [shape=diamond, label="Adding/renaming/removing\na domain folder?", fillcolor="#FFF4CC"];
    load_domain [label="Also load:\ndomain-management-guide.md"];

    proceed [label="Proceed with\ntask", fillcolor="#D4E7C5"];
    done [shape=doublecircle, label="Done", fillcolor="#D4E7C5"];

    start -> block;
    block -> refs_read;
    refs_read -> task_type [label="yes"];
    refs_read -> block [label="no — read\nthem now"];
    task_type -> analyze [label="Analyze\ndocument"];
    task_type -> create [label="Create\nnew file"];
    task_type -> validate [label="Run\nvalidation"];

    analyze -> has_segments;
    create -> has_segments;
    validate -> has_segments;

    has_segments -> load_seg [label="yes"];
    has_segments -> has_ids [label="no"];
    load_seg -> has_ids;

    has_ids -> load_ids [label="yes"];
    has_ids -> has_terms [label="no"];
    load_ids -> has_terms;

    has_terms -> load_terms [label="yes"];
    has_terms -> has_temporal [label="no"];
    load_terms -> has_temporal;

    has_temporal -> load_temporal [label="yes"];
    has_temporal -> has_index [label="no"];
    load_temporal -> has_index;

    has_index -> load_index [label="yes"];
    has_index -> has_domain [label="no"];
    load_index -> has_domain;

    has_domain -> load_domain [label="yes"];
    has_domain -> proceed [label="no"];
    load_domain -> proceed;

    proceed -> done;
}
```

### Always Read First (BLOCKING REQUIREMENT)
- **essential-rules.md** - Condensed rules quick reference (~120 lines, all workflows)

### Workflow-Specific (load after essential-rules.md)
- **W1 Analyze:** + document-analysis-guidelines.md
- **W2 Create:** + DOCUMENTATION-PRINCIPLES.md, obsidian-standards.md, graphviz-quick-guide.md
- **W3 Validate:** + validation-workflows.md

### Load When Needed
- **validation-workflows.md** - Running validation scripts, troubleshooting errors
- **common-mistakes.md** - Quick reference for format errors (scan all numbered patterns)
- **segment-cohort-framework.md** - Customer segmentation details (SEG-X.Y.Z, COH-X.Y)
- **obsidian-standards.md** - YAML field requirements, wikilink syntax, linking patterns
- **id-prefix-conventions.md** - F-X.Y, P-X.Y, E-X.Y, N-X.Y specifications
- **beanz-brg-glossary.md** - BRG, BaaS, BCC, PBB, FTBP terminology
- **file-discovery-protocol.md** - 4-step protocol for checking existing files before creating new ones
- **tag-taxonomy.md** - Approved tag vocabulary (85 tags: domain, entity, topic, structural)
- **graphviz-quick-guide.md** - Graphviz/DOT diagram syntax for KB files (Beanz color palette, common patterns)
- **temporal-data-guide.md** - Temporal classification (atemporal/static/dynamic), data periods, supersession, mixed-file rules
- **index-file-guide.md** - _index.md template, creation/update workflow for folder navigation files
- **domain-management-guide.md** - Full checklist for adding, renaming, or removing a domain folder
- **essential-rules.md** - Condensed quick reference for all workflows (~120 lines, loaded first always)

**Progressive Disclosure:** Skill.md = overview + workflows + pointers. Reference files = complete details, examples, tables.
