# Roadmap Planning Framework

Structured approach for building and evaluating the beanz.com product roadmap. Used by the product strategist skill Workflow 3.

---

## Prioritization Scoring Model

### Dimensions

| Dimension | Weight | 3 (High) | 2 (Medium) | 1 (Low) | 0 (None/Conflict) |
|-----------|--------|----------|-----------|---------|-------------------|
| **FY27 Priority Alignment** | 30% | Directly serves a priority | Indirectly supports | Neutral | Conflicts with priorities |
| **Segment Impact** | 25% | High-value: SEG-1.4+, SEG-1.5+ | Growth: SEG-1.2, SEG-1.3 | Niche or B2B only | No clear segment |
| **Revenue Impact** | 20% | Direct revenue or retention | Indirect (engagement, NPS) | Operational efficiency | No measurable impact |
| **Effort** | 15% | Small (<2 weeks) | Medium (2-6 weeks) | Large (6+ weeks) | Massive (quarter+) |
| **Dependencies** | 10% | No blockers | Minor dependencies | Blocked by other work | Blocked by external factors |

### Scoring Formula

```
Score = (Priority × 0.30) + (Segment × 0.25) + (Revenue × 0.20) + (Effort × 0.15) + (Dependencies × 0.10)
```

**Maximum score:** 3.0 (perfect alignment, high impact, small effort, no blockers)

### Interpretation

| Score Range | Recommendation |
|------------|---------------|
| 2.5 – 3.0 | **Do now** — strong alignment, clear value |
| 2.0 – 2.4 | **Plan for next cycle** — good but not urgent |
| 1.5 – 1.9 | **Consider** — may need de-scoping or better timing |
| < 1.5 | **Defer** — insufficient alignment or too costly |

---

## Sequencing Rules

### Hard Dependencies (must sequence)

1. **Platform before product:** Infrastructure features (F-14.x) before features that depend on them
2. **Cross-border before NL launch:** F-10.x features must land before COH-1.5 (NL July 2026)
3. **Data before optimization:** Analytics features (F-11.x) before AI features (F-13.x) that consume the data
4. **Onboarding before retention:** SEG-1.2/1.3 features before SEG-1.6/1.7 interventions (fix the funnel top-down)

### Soft Preferences (apply when no hard constraint)

1. **Quick wins first:** Items scoring 2.5+ with effort score of 3 (small) ship first
2. **Revenue before engagement:** Direct revenue impact over indirect engagement features
3. **Global before market-specific:** Features that work across all markets preferred
4. **Retention before acquisition:** At FY27 stage, keeping customers (Priority 1) matters more than getting new ones (except Priority 2: FTBP)

### Conflict Resolution

When two items compete for the same resources:

| Factor | Winner |
|--------|--------|
| Higher FY27 priority number | Lower number wins (Priority 1 > Priority 5) |
| Larger segment reach | Wider segment wins |
| Active project dependency | Unblock in-flight work first |
| NL launch deadline | Time-critical items for July 2026 win |

---

## Feature Domain Map

Use this to identify which feature domain(s) a roadmap item falls into.

| Domain | ID Range | FY27 Priority Alignment | Key Contacts |
|--------|----------|------------------------|-------------|
| Account & Auth | F-01.x | Foundation (all priorities) | Platform |
| Product Discovery | F-02.x | P2 (FTBP), P1 (Retention) | Product |
| Subscriptions | F-03.x | P1 (Retention) — core | Product |
| Checkout & Payments | F-04.x | P2 (FTBP Conversion) | Platform |
| Fulfillment & Allocation | F-05.x | P3 (Platinum Roasters) | Operations |
| Roaster Operations | F-06.x | P3 (Platinum) | Operations |
| PBB Integrations | F-07.x | P4 (Expand PBB) | Platform |
| Personalization | F-08.x | P5 (AI), P1 (Retention) | Product |
| Marketing & Engagement | F-09.x | P2 (FTBP), P1 (Retention) | Marketing |
| Cross-Border | F-10.x | NL Launch (July 2026) | Platform |
| Analytics & Reporting | F-11.x | Foundation (all priorities) | Analytics |
| IoT & Connected Devices | F-12.x | P5 (AI), long-term | Product |
| AI & Agentic Tools | F-13.x | P5 (AI) | Platform |
| Platform Infrastructure | F-14.x | Foundation (all priorities) | Platform |

---

## Roadmap Item Template

When adding an item to the roadmap assessment, capture this information:

```markdown
### [Item Name] — F-XX.Y

**Problem:** [1 sentence — what customer or business pain does this solve?]
**Solution:** [1 sentence — what will we build?]
**FY27 Priority:** P[#] — [priority name]
**Target Segments:** SEG-X.Y.Z, SEG-X.Y.Z
**KPIs Impacted:** KPI-## ([name]), KPI-## ([name])
**Effort:** [Small / Medium / Large]
**Dependencies:** [F-XX.Y, or "None"]
**Active Project Conflict:** [Project name, or "None"]

**Score:** X.X / 3.0
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| FY27 Alignment | X | [reason] |
| Segment Impact | X | [reason] |
| Revenue Impact | X | [reason] |
| Effort | X | [reason] |
| Dependencies | X | [reason] |
```

---

## Quarter Planning Checklist

When building a quarterly roadmap:

- [ ] Read `docs/strategy/fy27-brand-summit.md` for current priorities
- [ ] Read `docs/projects/_index.md` and active project docs for in-flight work
- [ ] Read `docs/analytics/cy25-performance.md` for baseline metrics to improve
- [ ] List candidate items with Feature IDs (F-X.Y)
- [ ] Score each item using the prioritization model
- [ ] Sort by score, apply sequencing rules
- [ ] Check for conflicts with active projects
- [ ] Identify dependencies that need advance work
- [ ] Map items to target segments (SEG-X.Y.Z)
- [ ] Define success metrics (KPI-##) for each item
- [ ] Flag data gaps that need `beanz-query` investigation
- [ ] Present ranked list with trade-offs to stakeholders

---

## Common Roadmap Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|----------------|
| "Build everything" | Spreads resources thin, nothing ships well | Score and cut: top 3-5 items per quarter |
| Feature without segment | No clear audience = no clear success metric | Always specify SEG-X.Y.Z target |
| No baseline metric | Can't measure impact | Identify KPI-## and CY25 baseline first |
| Ignoring active projects | Creates resource conflicts and scope creep | Check `docs/projects/` before committing |
| Market-specific before global | Fragments codebase, harder to maintain | Build global, configure per-market |
| Retention after acquisition | Leaky bucket — new customers also churn | Fix retention first (FY27 Priority 1) |
| No effort estimate | Can't sequence or trade off | At minimum: Small/Medium/Large |
