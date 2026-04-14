# Beanz Business Context

> Background knowledge for the Beanz Daily Digest plugin. Claude draws on this automatically when generating digests or answering Beanz-related questions.

---

## What is Beanz?

beanz.com is Breville Group's specialty coffee subscription marketplace. Customers subscribe to receive freshly roasted coffee from 100+ roaster partners worldwide, delivered to their door on a recurring schedule. Operating across AU, US, UK, DE, and NL (launching Jul 2026).

## Key Metrics (CY25 Benchmarks)

| Metric | CY25 Value | Monthly Avg | Notes |
|---|---|---|---|
| Total coffee revenue | $15.54M AUD | ~$1.30M | All coffee incl. free/discovery bags |
| Paid coffee revenue | ~$13-14M AUD | ~$1.13M | SkuAmount > 0, matches PBI "Paid" |
| Bags shipped | 1,003,406 | ~83,617 | All bags incl. free |
| Active subscriptions | 36,584 | — | Active + Paused, BeanzSkuFlag=1, as of Mar 2026 |
| Avg subscriber LTV | $353.20 AUD | — | From dimbeanzcustomeremail |
| PBB revenue | $907,949 AUD | ~$75.7K | Powered by Beanz retail partners |
| FTBP revenue share | 41% | — | Up from 3% in CY24 |
| Platinum roasters | 18 signed | — | $2M paid, $1M machine sales |

## Key Programmes

**FTBP (Fast Track by Beanz):** Machine registration → free sample bags → paid subscription pipeline. v1 (original) and v2 (Sep 2025+, uses offer_code LIKE '%-FT-DISCOFF-%'). Primary acquisition engine — 41% of revenue in CY25.

**PBB (Powered by Beanz):** B2B white-label coffee subscriptions for retail partners. StoreCode ILIKE 'PBB%'. Growing channel — $908K in CY25.

**Project Feral:** 26-week AI-augmented retention initiative. FERAL = Fast Experimentation, Rapid AI Learning. Three pillars: Data & Insights, Front-End, Email. Five gating requirements must clear before experiments begin: CMS migration, redesign on new platform, BlueConic segments, analytics platform, Salesforce Marketing Cloud.

**Operation Freedom:** UK pilot — Barista Express + 2 years coffee for £58/mo via Klarna at 0% APR. STAMP-approved Mar 2026, must launch before Jun 30 2026.

**NL Rollout:** Netherlands market launch targeting Jul 29 2026. PROD fulfilment testing from Mar 30.

## Team (Key Names)

| Name | Role/Area |
|---|---|
| Ziv Shalev | General Manager, Beanz |
| Travis | Operations Manager |
| Hugh | Team member (design review) |
| Justin (Le Good) | Product Owner / Engineering |
| Sophie | CRM / Email |
| Candi | Team member |
| Andrew Sirotnik | Project Lead, Operation Freedom |
| Cliff | Marketing |
| Jim | Stakeholder |
| Jennifer | Segmentation / BlueConic |
| Josh | Feature flags / engineering |
| Easwar | Contentful integration / engineering |
| Kevin Bauer | Design Director |
| Nell Welch | Programme Manager, Operation Freedom |
| Ali Inayat | Finance Partner |

## Markets

AU (Australia), US (United States), UK (United Kingdom), DE (Germany), NL (Netherlands — launching Jul 2026)

## Key Deadlines (as of Mar 2026)

| Deadline | Date | Risk |
|---|---|---|
| NL PROD fulfilment testing | Mar 30 2026 | — |
| E2E Storybook prototype | Apr 6 2026 | — |
| AEM migration complete | May 29 2026 | $160K penalty if missed |
| Operation Freedom launch | Before Jun 30 2026 | FY26 boundary |
| AB testing solution ready | Jun/Jul 2026 | BRG-wide dependency |
| E2E UAT starts | Jun 29 2026 | — |
| NL go-live | Jul 29 2026 | — |
| CT subscription integration | Post-Aug 2026 | — |

## Glossary

| Term | Meaning |
|---|---|
| FTBP | Fast Track by Beanz (machine registration programme) |
| PBB | Powered by Beanz (B2B retail partner programme) |
| MOT | Minimum Order Threshold (roaster weekly KG commitment) |
| BLP | Beanz Logistics Platform |
| BCC | Beanz Control Centre (roaster portal) |
| RCC | Roaster Control Centre (legacy Salesforce portal, being replaced) |
| AEM | Adobe Experience Manager (CMS being decommissioned) |
| PBI | Power BI (reporting/dashboards) |
| SCD | Slowly Changing Dimension |
| BRG | Breville Group |
| FY | Fiscal Year (Jul 1 – Jun 30) |
| CY | Calendar Year (Jan 1 – Dec 31) |
| STAMP | Breville's project approval gate |
