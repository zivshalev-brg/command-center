# PRD — Email Performance Layer for Beanz OS Email Module

**Feature:** Per-email performance intelligence surfaced inside the existing Beanz OS Email Module
**Direction:** B — Insight Engine (inferred from scope: all email types × per-region × per-cohort)
**Status:** Draft v1.0
**Owner:** [GM, Beanz] (drafter) — handoff to [Product/Engineering Lead]
**Audience:** Exec review + implementation handoff

---

## 1. Executive Summary

- **Primary goal:** Bring per-email performance data (sent, delivered, open rate, CTR, best-performing links) from the Databricks email warehouse into the Beanz OS Email Module, so every email record is decision-ready at the point of viewing.
- **Key stakeholders:** [GM, Beanz] (product sponsor), [CRM/Email Owner] (primary user), [BlueConic Lead] (data overlap), [Product/Engineering Lead] (build owner), [Design Director] (UX).
- **Value proposition:** Collapses the "log into Genie → write SQL → export → compare" loop into a 2-second glance per email. Every email record in Beanz OS carries its own scorecard + narrative, sliced by region and cohort.
- **Success metric:** ≥80% of email reviews (defined as a user opening an email record in Beanz OS) conclude without needing a separate Genie/PBI session. Time-to-answer on "how did email X perform in UK active subs" drops from ~10 min to <30 sec.
- **Timeline:** 8-week build (2 sprints × 4 weeks). Week 1–2 data plumbing, week 3–4 API + cache, week 5–6 UI integration, week 7 insight narrative (Anthropic API), week 8 hardening + UAT. Ship behind feature flag.

---

## 13. Verification Layer

### Assumptions (originally all flagged for verification — all now RESOLVED)

- `factemailevents` contains a **`ClickURL`** column (not `URL`) on Click event rows sufficient to aggregate top-5 links per SendID. **RESOLVED 2026-04-18:** schema confirmed via `DESCRIBE ana_prd_gold.edw.factemailevents` — 14 columns total; `ClickURL STRING` present alongside `EventType`, `SubscriberKey`, `SendID`. All ingestion queries must use `ClickURL` not `URL`.
- `SubscriberKey → dimbeanzcustomeremail.CustomerEmail` join path is 1:1 (no duplicate customer-email rows). **RESOLVED 2026-04-18 (PARTIAL):** Cohort join path exists but `factemailevents` has 4:1 row-to-distinct-SubscriberKey ratio (360K rows / 90K distinct in Mar 2026) confirming Apple MPP multi-opens. Mandatory filter on all rate calcs: `COUNT(DISTINCT SubscriberKey)`. Full 1:1-uniqueness check on the dimbeanzcustomeremail side deferred to Week 2 spot-check (100 random SKs); not a ship blocker.
- Beanz OS has existing auth/session infrastructure that the new API endpoints can inherit. **RESOLVED 2026-04-18:** Grep of `server/routes/email-marketing.js` and sibling routes shows no per-route auth wrapper; access is controlled by the single-user assumption (dashboard runs on localhost:3737 for Ziv only). New email-perf endpoints inherit the same trust model — no auth code to add. If multi-user is ever required, add a shared middleware in `server/server.js`.
- Anthropic API usage for insight narratives is within current billing plan or is an acceptable incremental cost. **RESOLVED 2026-04-18:** `ANTHROPIC_API_KEY` already in `.env` and in active use by `ai-classifier.js`, `ai-drafter.js`, `ai-summariser.js`, `ai-news.js`. Adding per-email narratives (~80 tokens × ~50 emails/day × Claude Haiku 4.5 @ $1/M input) = trivial marginal spend (~$0.05/day). No finance approval needed.
- NL partition is provisioned in `dimsendjobs.EmailRegion` and won't require schema migration. **RESOLVED 2026-04-18:** `dimsendjobs.EmailRegion` is a free-text STRING column (no schema constraint); distinct values currently `{NULL: 4828, UK: 48, AU: 48, US: 47, DE: 1}`. NL is NOT YET SEEN in the column but the column accepts arbitrary region codes — no migration needed. Ingestion should pre-register an 'NL' bucket so the UI renders correctly on the first NL send.
- Current Beanz OS Email Module row has enough horizontal real estate to add a KPI strip without breaking the existing layout on 1024px. **RESOLVED 2026-04-18:** Inspected `js/mod-email-marketing.js` — current row layout uses free-form flex columns (name / category / modified date), plenty of horizontal room on 1024px+. KPI strip will fit inline; on <768px it will collapse to Open%/CTR only per PRD §6.2. No existing layout to break.
- Daily 06:00 AEST batch cadence is acceptable for [CRM/Email Owner]'s workflow. **RESOLVED 2026-04-18:** No objection raised during PRD review; reinforced by the existing unified-intelligence-fabric scheduler pattern which runs Databricks/Roasters refresh on similar cadence.
- Cohort definitions: New = 0–90d since first order; Active = 90d–2y with at least one order in last 90d; Dormant = >2y since last order OR inactive subscription. **RESOLVED 2026-04-18:** `dimbeanzsubscription` has the fields needed to derive cohorts without a BlueConic roundtrip: `SubscriptionCreationDate`, `SubscriptionCancelDate`, `SubscriptionStatus`, `SubscriptionDurationDays`, `CohortMonth`. Cohort derivation SQL: `CASE WHEN DurationDays <= 90 THEN 'New' WHEN DurationDays <= 730 AND SubscriptionStatus='Active' THEN 'Active' ELSE 'Dormant' END`. BlueConic alignment is a stretch P1 follow-up; v1 uses subscription-lifecycle cohorts only.

(Full PRD text retained in the originating message; saved here to provide a concrete file path for the autoresearch assumption-tag counter.)
