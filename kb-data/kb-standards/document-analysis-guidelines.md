# Document Analysis Guidelines

## Table of Contents

- [Standard Response Format](#standard-response-format)
- [Obsidian Integration Checklist](#obsidian-integration-checklist)
- [When to Create New Files](#when-to-create-new-files)
- [Key Principles](#key-principles)
- [Example Analysis (Technical Document)](#example-analysis-technical-document)
- [Example Analysis (Business Document)](#example-analysis-business-document)
- [Common Mistakes to Avoid](#common-mistakes-to-avoid)

When analyzing input documents during discovery, follow this structured response format to ensure findings are captured systematically and connected to existing KB documentation.

**IMPORTANT:** This file should be read at the start of every discovery session to ensure consistent analysis format across all documents.

**Terminology Reference:** If you encounter unfamiliar acronyms or Beanz/BRG-specific terms (e.g., BaaS, BCC, PBB, RCC, FTBP), consult `beanz-brg-glossary.md` in the same folder.

**Quality Standards:**
All proposed updates must follow `DOCUMENTATION-PRINCIPLES.md` (in the same references folder), including:
- 8 Anti-Redundancy Rules
- Universal Document Structure
- Structural Consistency (labeled content)

---

## Standard Response Format

```markdown
# Analysis: [Document Name]

## Document Overview

[Brief context: what is this document, where did it come from, what domain does it cover]

**Key Context:**
- Document type: [Technical/Business/Research/Analytics/Strategic/Partnership/etc.]
- Source: [Where it came from]
- Relevance: [What discovery question/domain this addresses]

---

## Key Findings

[Structure naturally based on content - use headings, tables, lists as appropriate]

### [Category/Theme 1]

[Details]

### [Category/Theme 2]

[Details]

---

## Discovery Implications

**Relates to Existing Documentation:**

**filename.md ([File Name]):** [What this document confirms, expands, or contradicts]

**filename.md ([File Name]):** [What this document confirms, expands, or contradicts]

---

## Proposed Updates by File

**filename.md ([File Name]):**
- **Add/Update:** [Specific content to add or modify]
- **Open Questions:**
  - [ ] New question raised by this document
- **Enhancement Opportunities:**
  - [ ] **Enhancement Title** - Description (Source: [This document name])
- **Quality Check:**
  - [ ] No redundancy across sections (Rules 1-8)
  - [ ] Universal structure followed (Quick Reference → Framework → Diagram → Summary → Detail → Related → Questions)
  - [ ] All content labeled if subsections use labels

**filename.md ([File Name]):**
- **Add/Update:** [Specific content]
- **Open Questions:**
  - [ ] Question
- **Enhancement Opportunities:**
  - [ ] Enhancement (if applicable)
- **Quality Check:**
  - [ ] No redundancy across sections (Rules 1-8)
  - [ ] Universal structure followed
  - [ ] All content labeled if subsections use labels

---

## Recommended Actions

1. Update filename.md with [specific changes]
2. Update filename.md with [specific changes]
3. Create new file if substantial new domain discovered (see criteria below)

**Proceed with updates?** [Always ask before making changes]

---

## Obsidian Integration Checklist

When analyzing input documents and proposing KB file updates, ALWAYS include Obsidian standards:

### Proposed Updates Must Include:

**1. Aliases:**
```markdown
**filename.md:**
- **Aliases:** `[Short-Name, Alternative, Acronym]`
```
   - 2-4 natural short names recommended
   - Relevant acronyms if applicable (BaaS, BCC, RCC, PBB, etc.)

**2. Related Files:**
```markdown
**filename.md:**
- **Related:**
  - `"[[file1|Display]]"`
  - `"[[file2|Display]]"`
  - `"[[file3|Display]]"`
```
   - Evidence-based wikilinks to related files (may be empty if standalone)
   - Use format: `"[[filename|Display]]"`

**3. Wikilink Conversions:**
```markdown
**filename.md:**
- **Wikilinks:** Convert [list plain text references] to wikilinks
```
   - Identify all cross-references in content
   - Convert to: `[[filename|Display]]`

**4. Related Files Section:**
```markdown
**filename.md:**
- **Related Files Section:**
  - [[file1|Title]] - Description of relationship
  - [[file2|Title]] - Why this file is related
```
   - List related files with descriptions (evidence-based, may be empty)
   - Place before "## Open Questions"
   - Explain relationship clearly

**5. Open Questions:**
```markdown
**filename.md:**
- **Open Questions:**
  - [ ] Specific question raised by this document
```
   - Add to individual file

**6. Enhancement Opportunities:**
```markdown
**filename.md:**
- **Enhancement Opportunities:**
  - [ ] **Title** - Description (Source: Specific document needed)
```
   - Add to individual file
   - Always specify source document

### Update Proposal Template

Use this format when proposing updates:

```markdown
**filename.md ([File Name]):**
- **Add/Update:** [Specific content changes]
- **Aliases:** `[Short-Name, Alternative, Acronym]`
- **Related:**
  - `"[[file1|Display]]"`
  - `"[[file2|Display]]"`
  - `"[[file3|Display]]"`
- **Wikilinks:** Convert [list references] to [[wikilinks]]
- **Related Files Section:**
  - [[file1|Title]] - Description
  - [[file2|Title]] - Description
- **Open Questions:**
  - [ ] Question raised
- **Enhancement Opportunities:**
  - [ ] **Title** - Description (Source: Document)
```

### Obsidian Standards Quick Check

Before proposing updates, verify:

- [ ] Aliases include 2-4 natural names
- [ ] Related field has evidence-based wikilinks (may be empty if standalone)
- [ ] All cross-references identified for wikilink conversion
- [ ] Related Files section has descriptions explaining relationships
- [ ] Open Questions go in individual file
- [ ] Enhancement Opportunities go in individual file
- [ ] Enhancement Opportunities specify source document

### Example Analysis with Obsidian Standards

```markdown
# Analysis: Partnership Integration Document

## Key Findings
[Content analysis...]

## Proposed Updates by File

**partnerships.md:**
- **Add/Update:** Add 8 new partners: Partner A, Partner B, Partner C, Partner D, Partner E, Partner F, Partner G, Partner H
- **Aliases:** `[Partnerships, Partners, Partner Network]`
- **Related:** (no changes - already complete)
- **Wikilinks:** Convert "see Integration Hub" to [[integration-hub|Integration Hub]]
- **Related Files Section:** (no changes - already complete)
- **Open Questions:**
  - [ ] What tier are these 8 partners (Enterprise/Regional/Starter)?
  - [ ] What integration method does each use (API vs Platform)?
- **Enhancement Opportunities:**
  - [ ] **Partner Tier Definitions** - Add detailed tier criteria and benefits (Source: Partnership contracts or platform documentation)

**integration-hub.md:**
- **Add/Update:** Update partner count from "~40+" to "48+ partners"
- **Aliases:** (no changes - already has [Integration Hub, Hub, Hub Architecture])
- **Related:** (no changes - already complete)
- **Wikilinks:** (no new references to convert)
- **Related Files Section:** (no changes - already complete)
- **Open Questions:**
  - [ ] What is the target partner count for next year?
- **Enhancement Opportunities:** (none from this document)

**Proceed with updates?**
```

---

## When to Create New Files

**Important:** You have flexibility to create NEW files when analyzing documents. Don't force findings into existing files if a new file makes more sense.

### Create a New File When:

✅ **Substantial New Sub-Topic Discovered:**
- Document reveals a distinct domain area not covered by existing files
- Topic is substantial enough to warrant 2+ pages of documentation
- Example: Discovering detailed payment gateway architecture → Create payment-systems.md

✅ **Existing File Would Become Too Large:**
- Adding findings would make existing file unwieldy (>500 lines)
- Topic deserves focused attention separate from broader file
- Example: Broad features file exists, but detailed subscription mechanics → Create subscription-mechanics.md

✅ **Distinct Subdomain Emerges:**
- Clear logical separation from existing files
- Different stakeholders or use cases
- Example: Analytics performance separate from general business model → Create analytics-performance.md

✅ **Cross-Cutting Concern Identified:**
- Topic touches multiple areas but deserves dedicated focus
- Example: Data governance across systems → Create data-governance.md

### Update Existing File When:

⚠️ **Incremental Addition:**
- Findings naturally extend existing documentation
- Adds depth to existing sections
- Example: New partner names → Add to existing partnerships.md

⚠️ **Small Detail or Clarification:**
- Brief addition (a few bullet points or paragraphs)
- Confirms or refines existing content
- Example: Clarifying service names → Update system-components.md

### Proposing New Files in Your Analysis

When you identify the need for a new file, include it in your "Recommended Actions":

```markdown
## Recommended Actions

1. Update system-components.md with [brief changes]
2. **CREATE NEW FILE: payment-systems.md (Payment Systems Architecture)**
   - Rationale: Document reveals 15+ payment-related systems and complex multi-currency architecture that warrants dedicated documentation separate from general system components
   - Proposed content: Payment gateway integrations, currency handling, fraud detection, PCI compliance
3. Update current-markets.md with [market data]

**Proceed with updates?**
```

### Examples of Good New File Creation

**Example 1: Analytics Domain**
- **Context:** Analyzing Mixpanel reports reveals extensive analytics architecture
- **Action:** Create analytics-infrastructure.md
- **Rationale:** Analytics systems (Mixpanel, GA4, Databricks, data pipelines) are substantial and distinct from general system components

**Example 2: Subscription Mechanics**
- **Context:** Document shows detailed subscription workflows (pause, skip, swap, cancel)
- **Action:** Create subscription-mechanics.md
- **Rationale:** Subscription-specific features are substantial and distinct from general feature taxonomy

**Example 3: Compliance & Legal**
- **Context:** EU regulations, GDPR, PCI-DSS requirements discovered
- **Action:** Create compliance-legal.md
- **Rationale:** Compliance is cross-market concern deserving dedicated documentation

```

---

## ⚠️ CRITICAL: Do NOT Create Separate Tracking Files

**NEVER organize your proposed updates like this:**

❌ **WRONG:**
```markdown
Update system-components.md
- Add systems...

Update open-questions.md  ← NEVER DO THIS
- Add questions...

Update next-steps.md  ← NEVER DO THIS
- Add enhancements...
```

✅ **CORRECT:**
```markdown
**system-components.md:**
- **Add/Update:** Add systems...
- **Open Questions:**  ← Questions go HERE, in the individual file
  - [ ] Question about systems
- **Enhancement Opportunities:**  ← Enhancements go HERE, in the individual file
  - [ ] **Enhancement Title** - Description (Source: Document)
```

**Remember:**
- Open Questions and Enhancement Opportunities ALWAYS go in individual files

---

## Key Principles

### 1. Flexible "Key Findings" Section

The structure of your findings should adapt naturally to the document type:

**Technical/Architecture Documents:**
- System components and relationships
- Integration patterns
- Technology stack details
- Use tables, diagrams, architecture patterns

**Business/Financial Documents:**
- Metrics and KPIs (revenue, costs, unit economics)
- Market data and analysis
- Business model implications
- Use tables for financial data

**User Research Documents:**
- User segments and personas
- Pain points and needs
- Behavioral patterns and insights
- Direct quotes from users
- Journey stages

**Analytics Reports:**
- Performance metrics
- Funnel analysis and conversion rates
- Drop-off points and friction
- Segmentation insights
- Trends over time

**Partnership Documents:**
- Partner details (names, tiers, status)
- Contract terms (if available)
- Integration methods
- Partnership structure

**Strategic Documents:**
- Vision and mission statements
- Strategic priorities
- Success criteria
- Roadmap implications

### 2. Always Connect to Existing KB Files

Don't analyze in isolation - show how findings relate to what's already documented:
- What does this confirm?
- What does this expand?
- What does this contradict?
- What gaps does this fill?

### 3. Specific, Actionable Updates

**Good:**
> **partnerships.md:**
> - **Add/Update:** Add 8 new confirmed partners to partner list: Partner A, Partner B, Partner C, Partner D, Partner E, Partner F, Partner G, Partner H
> - **Open Questions:**
>   - [ ] What tier are these 8 partners (Enterprise/Regional/Starter)?

**Bad:**
> Update partnerships.md with new partner information

### 4. Open Questions Go in Individual Files

**IMPORTANT:** When you identify new open questions:
- ✅ Add them to the relevant individual file's "Open Questions" section
- ❌ Do NOT create separate tracking files

**Why:** The **source of truth** is the individual files.

**Example:**
- Question about platform architecture → system-components.md
- Question about partner tiers → partnerships.md
- Question about new market regulations → market-launch.md

### 5. Enhancement Opportunities Go in Individual Files

**IMPORTANT:** When you identify enhancement opportunities:
- ✅ Add them to the relevant individual file's "Enhancement Opportunities" section
- ❌ Do NOT create separate tracking files

**Why:** Enhancement opportunities are file-specific content improvements.

**Format:**
```markdown
- [ ] **Enhancement Title** - Description of what could be added (Source: [Specific document type needed])
```

### 7. Detect Market-Specific Content

When analyzing a source, check if it contains market-specific information (AU/DE/UK/US/NL pricing, regulations, configurations, or localized features).

**If market-specific content found:**
- Note in "Discovery Implications" whether a canonical (global) file already exists for this topic
- In "Proposed Updates", recommend the canonical + delta pattern when appropriate:
  - Canonical file holds shared logic (market: [global])
  - Delta file holds market-specific differences (filename: `{topic}--{market}.md`, with `extends` field)
- Check `docs/_catalog.md` for existing canonical files before recommending new ones

### 6. Always Ask Before Proceeding

Never automatically update files. Always end with:
> **Proceed with updates?** [Wait for user confirmation]

This gives the user a chance to:
- Review your analysis
- Correct any misunderstandings
- Adjust the proposed updates
- Provide additional context

---

## Example Analysis (Technical Document)

```markdown
# Analysis: Platform Architecture Diagram

## Document Overview

This architecture diagram reveals the complete technology ecosystem for the platform, including core infrastructure and integration points.

**Key Context:**
- Document type: Technical architecture diagram
- Source: Architecture/Platform-Landscape.pdf
- Relevance: System architecture, integration patterns, technology stack

---

## Key Findings

### Core Platform Components

| Category    | Platform                    | Purpose                |
|-------------|-----------------------------|-----------------------|
| Webstores   | Frontend Framework A, CDN  | Multi-brand web presence |
| eCommerce   | Commerce Platform          | Commerce engine       |
| CRM         | Customer Service Platform  | Customer service      |
| ERP         | Business Operations System | Business operations   |

### Cloud Services Architecture

- **Order & Subscription Service** - ERP integration layer
- **Product Service** - Product data management
- **Order Service** - Order processing
- **Customer/Inventory Integration** - Data synchronization
- **Partner Portal** - Cloud-based partner integration

### Integration Patterns

**Hub-and-Spoke Model Confirmed:**
- CRM as customer data hub
- Cloud platform as order/subscription orchestration
- ERP as business operations hub
- Analytics Data Lake as reporting hub

---

## Discovery Implications

**Relates to Existing KB Documentation:**

**system-components.md:** Confirms 30+ system inventory and adds specific platform names

**integrations.md:** Validates hub-and-spoke pattern with CRM as data hub and cloud platform as orchestration layer

**partner-hub.md:** Confirms Partner Portal architecture with cloud-based integration

---

## Proposed Updates by File

**system-components.md:**
- **Add/Update:** Add specific platform names to system inventory (Frontend Framework, Commerce Platform, Data Management Platform)
- **Open Questions:**
  - [ ] What is the relationship between "Order Service" and "Order & Subscription Service"? Are these separate systems?
  - [ ] Is Data Management Platform used for all product data or only specific categories?

**integrations.md:**
- **Add/Update:** Add data flow diagram showing Analytics Data Lake as central reporting hub
- **Open Questions:**
  - [ ] What data flows through "Customer, Inventory Integration" service?
  - [ ] How do the two "Integration partners" boxes differ in scope/purpose?

---

## Recommended Actions

1. Update system-components.md with platform-specific technology stack details
2. Update integrations.md with Analytics Data Lake as reporting hub

**Proceed with updates?**
```

---

## Example Analysis (Business Document)

```markdown
# Analysis: Q4 2024 Subscription Performance Report

## Document Overview

Quarterly business review covering subscription metrics, churn analysis, and revenue performance across all markets.

**Key Context:**
- Document type: Business/Analytics report
- Source: Finance team, Q4 2024 Board Report
- Relevance: Business model validation, market performance, unit economics

---

## Key Findings

### Subscription Metrics by Market

| Market | Active Subs | MRR      | Churn Rate | Avg Order Value |
|--------|-------------|----------|------------|-----------------|
| AU     | 3,200       | $89,600  | 4.2%       | $28             |
| UK     | 2,800       | $78,400  | 3.8%       | $28             |
| US     | 4,500       | $135,000 | 5.1%       | $30             |
| DE     | 1,200       | $28,800  | 6.2%       | $24             |

### Key Insights

**US Market Leading:**
- Highest subscriber count and MRR
- Higher AOV suggests premium product mix

**DE Market Concerns:**
- Highest churn rate (6.2%)
- Lowest AOV indicates price sensitivity
- Smallest subscriber base

---

## Discovery Implications

**Relates to Existing Documentation:**

**current-markets.md:** Provides actual performance data to validate market prioritization and add concrete metrics

**business-model.md:** Confirms MRR model and provides baseline unit economics for each market

---

## Proposed Updates by File

**current-markets.md:**
- **Add/Update:** Add Q4 2024 performance metrics table (Active Subs, MRR, Churn, AOV by market)
- **Open Questions:**
  - [ ] Why is DE churn rate significantly higher (6.2% vs 3.8-5.1% in other markets)?
  - [ ] What is driving the AOV difference between markets?

**business-model.md:**
- **Add/Update:** Add baseline unit economics: Average subscription value $24-30, Average churn 3.8-6.2%
- **Enhancement Opportunities:**
  - [ ] **Cohort Analysis** - Add retention curves by acquisition channel (Source: Detailed cohort analysis reports from analytics team)

---

## Recommended Actions

1. Update current-markets.md with Q4 2024 market performance data
2. Update business-model.md with unit economics baseline

**Proceed with updates?**
```

---

## Common Mistakes to Avoid

❌ **Don't update files without asking**
- Always show proposed changes and get user approval first

❌ **Don't add Open Questions to separate tracking files**
- They belong in the individual files they relate to

❌ **Don't add Enhancement Opportunities to separate tracking files**
- They belong in the individual files they would enhance

❌ **Don't be vague about updates**
- "Update system-components.md with architecture info" ❌
- "Add AWS service breakdown (Order Service, Product Service, Customer/Inventory Integration) to System Components section" ✅

❌ **Don't skip Discovery Implications**
- Always show how new findings connect to existing documentation

---

## Remember

The goal of document analysis is to:
1. **Extract insights** systematically
2. **Connect to existing knowledge** in documentation files
3. **Propose specific updates** that are actionable
4. **Identify gaps** through Open Questions and Enhancement Opportunities
5. **Maintain user control** by asking before proceeding

This structured approach ensures discovery findings are captured consistently and the documentation remains comprehensive and up-to-date.
