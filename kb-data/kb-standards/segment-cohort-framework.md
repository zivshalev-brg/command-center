# Customer Segmentation & Cohort Framework

## Overview

Beanz uses a dual framework to track customer behavior and analytics:
- **Segments (SEG-X.Y.Z)** - Mutable behavioral states (where customers are now)
- **Cohorts (COH-X.Y)** - Fixed groupings (how/when/where customers joined)

---

## Segments (SEG-X.Y.Z) - Lifecycle Position

**Format**: `SEG-1.X.Y` where X = lifecycle stage (1-8), Y = experience level

### 8 Lifecycle Stages

**SEG-1.1.x - New Customer** (browsing, cart abandon, first order)

**SEG-1.2.x - Trialist** (FTBP active, 2 free bags, evaluating)

**SEG-1.3.x - New Subscriber** (first 2 paid deliveries, ~90 days)

**SEG-1.4.x - Active Subscriber** (3+ deliveries, established routine)

**SEG-1.5.x - Loyalist** (6+ months, highly engaged, brand advocate)

**SEG-1.6.x - At Risk** (paused, payment issues, churn signals)

**SEG-1.7.x - Inactive** (churned, no order 3+ months, win-back target)

**SEG-1.8.x - Trial Not Converted** (took FTBP, never paid, non-converter)

### Experience Levels

- **.1 = Novice** - New to specialty coffee, needs guidance
- **.2 = Experienced** - Coffee-savvy, knows preferences

### Usage Examples

**Feature Targeting**:
- "SEG-1.1.1 users need quiz-driven discovery" (New, Novice)
- "SEG-1.4.2 customers use advanced subscription features" (Active, Experienced)

**Email Targeting**:
- "E-03.7 targets SEG-1.2.x with discount expiry warnings" (Trialists)

**Personalization**:
- "F-01.4 Coffee Quiz: Primary segment = SEG-1.1.1 (New Customer, Novice)"
- "Feature priority: HIGH for SEG-1.1.x, MEDIUM for SEG-1.4.x, LOW for SEG-1.5.x"

### Key Transitions

- **SEG-1.2 → SEG-1.3** = **"Beanz Conversion"** (trial → paid subscriber) - Critical success metric
- **SEG-1.4 → SEG-1.6** = **Churn Risk** (active → at-risk) - Trigger intervention
- **SEG-1.6 → SEG-1.7** = **Churn Event** (at-risk → inactive) - Lost customer

---

## Cohorts (COH-X.Y) - Fixed Groupings

**Format**: `COH-X.Y` where X = category (1-4), Y = specific cohort

### COH-1.x - Market Entry Cohorts (by launch market)

- **COH-1.1** - AU Launch Cohort (original market, ~2021)
- **COH-1.2** - UK Launch Cohort
- **COH-1.3** - US Launch Cohort
- **COH-1.4** - DE Launch Cohort
- **COH-1.5** - NL Launch Cohort (July 2026)

**Usage**: Market performance comparison, regional retention analysis

### COH-2.x - Program Cohorts (by acquisition program)

- **COH-2.1** - FTBP v1 Cohort (cashback model)
- **COH-2.2** - FTBP v2 Cohort (discount model)

**Usage**: Program effectiveness, conversion rate comparison

### COH-3.x - Appliance Cohorts (by BRG appliance owned)

- **COH-3.1** - Breville Appliance Owner
- **COH-3.2** - Sage Appliance Owner
- **COH-3.3** - Baratza Appliance Owner
- **COH-3.4** - Lelit Appliance Owner
- **COH-3.5** - Multi-Appliance Owner (2+ BRG appliances)

**Usage**: Cross-sell analysis, appliance-to-coffee attachment rate

### COH-4.x - Channel Cohorts (by acquisition source)

- **COH-4.1** - Direct Website Acquisition
- **COH-4.2** - BRG Brand Referral
- **COH-4.3** - PBB Partner Referral
- **COH-4.4** - Recipient (eGift card, referral)

**Usage**: Channel performance, CAC analysis, attribution

---

## Usage Examples

### Analytics Queries

**Market comparison**:
- "COH-1.5 retention at 90 days vs COH-1.4" (NL vs DE market comparison)

**Program effectiveness**:
- "COH-2.2 × SEG-1.2.x conversion rate" (FTBP v2 trialists converting)

**Mature market insight**:
- "COH-1.1 has highest % SEG-1.5.x" (AU market has most loyalists due to maturity)

### Multi-Cohort Membership

Customers can belong to multiple cohorts simultaneously:

**Example Customer**:
- **Cohorts**: COH-1.5 (NL Launch) + COH-2.2 (FTBP v2) + COH-3.2 (Sage Owner) + COH-4.2 (BRG Referral)
- **Current Segment**: SEG-1.2.1 (Trialist, Novice)

**Analysis**:
- "NL launch customers with Sage appliances via BRG referral converting from FTBP v2"
- Query: `COH-1.5 ∩ COH-3.2 ∩ COH-4.2 WHERE segment = SEG-1.2.x → SEG-1.3.x`

---

## Documentation Patterns

### When Documenting Features

```markdown
**Primary Segments:** SEG-1.1.1 (New Customer, Novice)
**Secondary Segments:** SEG-1.2.x (Trialists)
**Cohort Filters:** COH-2.2 (FTBP v2) - for acquisition program analysis
```

### When Mapping Emails

```markdown
**Target Segments:** SEG-1.2.x (Trialists)
**Cohort Filter:** COH-2.2 (FTBP v2)
**Timing:** Day 12 of 14-day trial period
```

### When Documenting User Flows

```markdown
**SEG-1.1.1 path:** Homepage → Quiz → Barista's Choice → Cart → Checkout
**SEG-1.4.2 path:** Email → My Account → Manage Subscription → Swap Coffee
```

### When Analyzing Markets

```markdown
**Market Performance**:
- COH-1.5 (NL Launch) expected 90-day retention: 65-70% based on COH-1.4 (DE) benchmark
- Cross-border: COH-1.5 × Local NL vs COH-1.5 × Cross-border DE
```

---

## Key Concepts

**Mutable vs. Immutable**:
- **Segments change** as customer behavior evolves (SEG-1.1 → SEG-1.2 → SEG-1.3)
- **Cohorts never change** after assignment (COH-1.5 always = NL Launch)

**Targeting vs. Analytics**:
- **Segments** = Feature/email targeting (who sees what)
- **Cohorts** = Performance tracking (how groups perform over time)

**Lifecycle Progression**:
- Healthy: SEG-1.1 → SEG-1.2 → SEG-1.3 → SEG-1.4 → SEG-1.5
- Churn risk: SEG-1.4 → SEG-1.6 → SEG-1.7
- Failed conversion: SEG-1.2 → SEG-1.8

---

## Related Files

*(No related KB files exist yet - this is a reference document)*

---

## For Complete Details

See `CLAUDE.md` for:
- Detailed segment descriptions with entry/exit criteria
- All 13 cohorts with business context
- Complete usage examples and referencing patterns
- Multi-cohort membership patterns
- Key transitions and business definitions ("Beanz Conversion", churn events)
