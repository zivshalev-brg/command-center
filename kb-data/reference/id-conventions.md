---
title: ID Conventions
description: Hierarchical ID system for features, pages, segments, cohorts, emails, and notifications.
type: reference
status: complete
owner: Product
market:
  - global
tags:
  - reference
aliases:
  - ID System
  - Naming Conventions
  - Entity IDs
related:
  - "[[glossary|Glossary]]"
  - "[[page-inventory|Page Inventory]]"
temporal-type: atemporal
---

# ID Conventions

## Quick Reference

- Hierarchical IDs provide traceability across features, pages, segments, and communications
- Format: `PREFIX-major.minor` (or `.minor.sub` for segments)

## ID Framework

### Key Concepts

- **Hierarchical ID** = Dot-separated prefix system encoding entity type, domain, and item
- **Prefix** = Letter code identifying entity type (F, P, SEG, COH, E, N)
- **Stability** = Once assigned, an ID is never reassigned to a different entity

## ID Hierarchy

```dot
digraph id_hierarchy {
    rankdir=TD;
    fontname="Arial";
    node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];
    edge [fontname="Arial", fontsize=9];

    ROOT [label="Beanz ID System", fillcolor="#E8E8E8", color="#999999"];

    F [label="F-XX.Y\nFeatures", fillcolor="#BBD8F0", color="#4A90D9"];
    P [label="P-XX.Y\nPages", fillcolor="#BBD8F0", color="#4A90D9"];
    SEG [label="SEG-X.Y.Z\nSegments", fillcolor="#D4E7C5", color="#7FA650"];
    COH [label="COH-X.Y\nCohorts", fillcolor="#D4E7C5", color="#7FA650"];
    E [label="E-XX.Y\nEmails", fillcolor="#FFF4CC", color="#F0B429"];
    N [label="N-XX.Y\nNotifications", fillcolor="#FFF4CC", color="#F0B429"];

    F1 [label="F-05\nAllocation", fillcolor="#BBD8F0", color="#4A90D9", fontsize=9];
    F2 [label="F-05.1\nRoaster Allocation", fillcolor="#BBD8F0", color="#4A90D9", fontsize=9];
    SEG1 [label="SEG-1\nB2C", fillcolor="#D4E7C5", color="#7FA650", fontsize=9];
    SEG2 [label="SEG-1.4\nSubscription", fillcolor="#D4E7C5", color="#7FA650", fontsize=9];
    SEG3 [label="SEG-1.4.2\nActive Subscriber", fillcolor="#D4E7C5", color="#7FA650", fontsize=9];

    ROOT -> F;
    ROOT -> P;
    ROOT -> SEG;
    ROOT -> COH;
    ROOT -> E;
    ROOT -> N;

    F -> F1 [style=dashed];
    F1 -> F2 [style=dashed];
    SEG -> SEG1 [style=dashed];
    SEG1 -> SEG2 [style=dashed];
    SEG2 -> SEG3 [style=dashed];
}
```

**Legend:** Blue = product entities (features, pages), Green = customer entities (segments, cohorts), Yellow = communication entities (emails, notifications). Dashed edges show drill-down examples.

## ID Prefixes

| Prefix | Entity | Format | Example |
|--------|--------|--------|---------|
| **F** | Feature | F-XX.Y | F-05.1 Roaster Allocation |
| **P** | Page/Screen | P-XX.Y | P-02.2 Checkout |
| **SEG** | Customer Segment | SEG-X.Y.Z | SEG-1.4.2 Active Subscriber |
| **COH** | Customer Cohort | COH-X.Y | COH-1.5 NL Launch Cohort |
| **E** | Email | E-XX.Y | E-03.1 Order Confirmation |
| **N** | Notification | N-XX.Y | N-01.1 Delivery Update |

## Structure Rules

### Features (F-XX.Y)

- **Major** (XX): Feature domain (01–14)
- **Minor** (Y): Specific capability within the domain
- Example: F-05 = Allocation domain, F-05.1 = Roaster Allocation

### Pages (P-XX.Y)

- **Major** (XX): Page group (01–11)
- **Minor** (Y): Specific page or screen variant
- Example: P-02 = Checkout group, P-02.2 = Checkout page

### Segments (SEG-X.Y.Z)

- **X**: Top-level segment class (1 = B2C, 2 = B2B)
- **Y**: Segment category within the class
- **Z**: Specific segment within the category
- Example: SEG-1.4.2 = B2C → Subscription status → Active Subscriber

### Cohorts (COH-X.Y)

- **X**: Cohort dimension (1 = Lifecycle, 2 = Coffee experience)
- **Y**: Specific cohort within the dimension
- Example: COH-1.5 = Lifecycle → NL Launch Cohort

### Emails (E-XX.Y)

- **Major** (XX): Email category (01 = Transactional, 02 = Marketing, 03 = Lifecycle)
- **Minor** (Y): Specific template
- Example: E-03.1 = Lifecycle → Order Confirmation

### Notifications (N-XX.Y)

- **Major** (XX): Notification category
- **Minor** (Y): Specific notification type
- Example: N-01.1 = Delivery → Delivery Update

## Usage Guidelines

1. **Always use IDs** when referencing features, pages, segments, cohorts, or communications in documentation
2. **IDs are stable** — once assigned, an ID should not be reassigned to a different entity
3. **Use in wikilinks** — include the ID in the display text for precision (e.g. F-01 Quiz Flow)
4. **Cross-reference** — link the ID back to its source document for traceability

## Related Files

- [[glossary|Glossary]] — Term definitions and acronyms
- [[page-inventory|Page Inventory]] — Page inventory (P-01 to P-11)
- [[emails-and-notifications|Emails and Notifications]] — Email and notification IDs (E-X.Y, N-X.Y)

## Open Questions

- [ ] Are there additional ID prefixes needed beyond F, P, SEG, COH, E, N?
