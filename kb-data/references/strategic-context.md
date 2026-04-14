# Beanz Strategic Context

Quick reference for the product strategist skill. Distilled from KB strategy and performance documents.

**Source documents:** `[[fy27-brand-summit|FY27 Brand Summit]]`, `[[cy25-performance|CY25 Performance]]`, `[[project-feral|Project Feral]]`

---

## Strategic Arc: CY25 → FY26 → FY27

| Phase | Theme | Status |
|-------|-------|--------|
| **CY25** | Proved Demand | Complete — $13.5M ARR, 1M bags, 36K subscribers |
| **FY26** | Built the Engine | Complete — Beanz 2.0, BLP, Platinum program, NL/DE prep |
| **FY27** | Path to Profit | Current — monetize the engine, retention focus |

---

## FY27 Five Priorities

### Priority 1: Beanz Retention & LTV
- **Goal:** Reduce churn, increase lifetime value
- **Levers:** Lifecycle comms, cross-sell/upsell, UX optimization
- **Key metrics:** Churn rate (KPI-4), LTV (KPI-5), subscription duration (KPI-12)
- **Target segments:** SEG-1.4.x (Active), SEG-1.6.x (At Risk)
- **Active project:** Project Feral — 4 experiment workstreams targeting retention

### Priority 2: FTBP Conversion
- **Goal:** Convert machine owners to paid subscribers at lower cost
- **Levers:** FTBP v2 optimizations, onboarding improvements
- **Key metrics:** Trial → Paid conversion rate, FTBP revenue share
- **Baselines:** v2: 16.5% conversion, v1: 11.4%. FTBP = 41% of CY25 revenue
- **Target segments:** SEG-1.2.x (Trialists), SEG-1.8.x (Trial Not Converted)

### Priority 3: Scale Platinum Roasters
- **Goal:** Grow roaster partnerships, increase partner-driven revenue
- **Levers:** Volume commitments, content creation, machine sales tie-ins
- **Baselines:** 18 partners signed, $2M paid to partners, $1M machine sales (FY26H1)
- **Target segments:** B2B (SEG-2.x scope)

### Priority 4: Expand PBB
- **Goal:** Bring more manufacturers and retailers into the ecosystem
- **Levers:** Headless APIs (F-07.x), widget framework, partner onboarding
- **Features:** F-07.0 PBB Platform, F-07.1 Headless APIs, F-07.2 Widgets

### Priority 5: Invest in AI Horizontally
- **Goal:** Scale personalization and forecasting
- **Levers:** ML recommendations (F-08.1, F-13.x), demand forecasting, intelligence platform
- **Active project:** Project Feral (26-week AI-first initiative)

---

## CY25 Performance Baselines

### Revenue & Growth

| Metric | CY23 | CY24 | CY25 | CY25 YoY |
|--------|------|------|------|-----------|
| Revenue (ARR) | $4.43M | $8.38M | $13.5M | +61% |
| Bags Shipped | — | 618K | 1,008K | +63% |
| Orders | — | 290K | 474K | +63% |

### Subscription Health

| Metric | CY25 Value | YoY Change |
|--------|-----------|------------|
| Total paid subscribers | 36,036 | +52% |
| New subscriptions | 19,544 | +42% |
| Cancelled subscriptions | 15,297 | +75% |
| Active subscriptions (YE) | 21,685 | +39% |
| Avg KG per subscriber | 5.8 KG | +5% |
| Avg spend per subscriber | $353 AUD | -1% |

**Warning sign:** Cancellations grew faster (+75%) than new subscriptions (+42%). Net subscriber growth is decelerating. This validates Priority 1 (Retention).

### Subscription Mix (Year-End Active)

| Type | Share |
|------|-------|
| Beanz Subscriptions | 38% |
| FTBP v1 | 32% |
| FTBP v2 | 17% |
| Fusion | 14% |

### Revenue by Machine Type (FTBP)

| Machine | Sell-out Share | Customer Share | Revenue Share |
|---------|--------------|---------------|---------------|
| Oracle Series | 1% | 5% | 21% |
| Barista Series | 70% | 68% | 64% |
| Bambino Series | 20% | 12% | 11% |
| Drip | 4% | 2% | 2% |

**Insight:** Oracle Series massively over-indexes (1% of machines → 21% of revenue). Premium users are disproportionately valuable.

### Operational Metrics by Market

| Market | Delivery Days | YoY Change |
|--------|-------------|------------|
| AU | 5.83 | +10% |
| UK | 3.97 | +8% |
| US | 5.72 | -2% |
| DE | 5.17 | +16% |

---

## Active Projects

### Project Feral (26-week AI-first initiative)
- **Status:** Active (draft doc in KB)
- **Goal:** Accelerate customer retention through AI-first development
- **Three enabling systems:** Knowledge Base + Intelligence Platform + AI-First Development
- **Four experiment workstreams:**
  1. Cancellation Flow — reduce churn at the point of cancel
  2. Coffee Collections — curated product groupings for engagement
  3. Onboarding Questionnaires — improve first-time experience
  4. Email Strategy — optimize lifecycle communications
- **Timeline:** 26 weeks, 5 phases (Foundation → Technical Enablement → Experiment Development → Scale → Optimise)

---

## Key Business Concepts

| Concept | Definition | Relevance |
|---------|-----------|-----------|
| **BaaS** | Beanz as a Service — platform strategy enabling multi-tenant coffee subscriptions | The north star: every feature should advance BaaS |
| **Beanz Conversion** | Transition from trial (SEG-1.2) to first paid order (SEG-1.3) | Critical success metric for Priority 2 |
| **Two-Phase Allocation** | Load balancing algorithm: Phase 1 prioritizes roasters below MOT; Phase 2 optimizes surplus | Affects subscription variety and roaster satisfaction |
| **MOT** | Minimum Order Target — weekly guaranteed minimum volume to roaster partners | Contractual obligation influencing allocation |
| **FTBP** | Fast-Track Barista Pack — machine-attached trial program (2 free bags + discount) | Primary acquisition engine (41% of revenue) |
| **BLP** | Beanz Label Printing — in-house automated fulfillment | Operational cost and speed advantage |

---

## Decision Heuristics

When evaluating any product decision, apply these filters:

1. **Does it reduce churn?** If yes, it aligns with Priority 1 (highest weight).
2. **Does it improve FTBP conversion?** If yes, it aligns with Priority 2.
3. **Does it serve high-value segments?** Oracle Series owners (COH-3.x) and Loyalists (SEG-1.5.x) generate disproportionate value.
4. **Does it scale across markets?** Global features (market: global) preferred over market-specific unless NL launch requires it.
5. **Does it conflict with Project Feral?** Check the 4 experiment workstreams before proposing overlapping work.
6. **Is the data available to measure it?** If no KPI exists (KPI-1 to KPI-12), measurement is a prerequisite.
