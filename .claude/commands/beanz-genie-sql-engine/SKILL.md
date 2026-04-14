---
name: beanz-genie-sql-engine
description: >
  Maximise data quality and accuracy when querying BeanzGenie (Databricks Genie Space) by
  writing validated SQL directly instead of natural language. Use this skill whenever anyone
  queries BeanzGenie, asks for Beanz data, revenue, volume, subscriptions, FTBP, PBB, cohort
  analysis, shipment SLA, roaster MOT, cancellation survey, or any analytics question that touches
  the Beanz data warehouse. Also triggers when building dashboards, reports, slide decks, or
  strategic analyses that need verified Beanz numbers. Even if the user just says "pull the data",
  "check the numbers", "query genie", "what does genie say", or "get me the latest figures" — this
  skill applies. Do NOT skip this skill for any BeanzGenie interaction.
---

# Beanz Genie SQL Engine

> Query BeanzGenie with hand-crafted SQL for maximum accuracy and control.
> This skill writes SQL directly and sends it via BeanzGenie, eliminating
> natural-language-to-SQL translation errors.

## Quick Start

Before writing ANY BeanzGenie query, read this skill. It prevents the most common data quality
errors that have caused incorrect numbers in past sessions.

**Key difference from the natural language approach:** Instead of asking Genie to interpret
English and generate SQL (which can miss filters, pick wrong columns, or misinterpret dates),
this skill writes the SQL itself and sends it as-is.

## How to Send SQL to BeanzGenie

BeanzGenie accepts SQL passed as a query string. Wrap your SQL in a clear instruction:

```
Execute this SQL: <YOUR SQL HERE>
```

Genie will recognise the SQL and execute it against the warehouse. If Genie attempts to
reinterpret or rewrite the SQL, prefix with:

```
Run the following SQL exactly as written, do not modify it: <YOUR SQL HERE>
```

---

## Core Workflow

```
1. Classify the question → pick the right table(s) from Schema Map
2. Write SQL → apply mandatory filters (RateType, OrderStatus, dates)
3. Validate SQL → run through the pre-flight checklist before sending
4. Execute via BeanzGenie MCP → query_space + poll_response loop
5. Validate response → run data quality checks against KB benchmarks
6. Surface data gaps → flag NULLs, missing periods, known issues
```

---

## Critical Rules (Memorise These)

### Rule 1: RateType Filter (Mandatory for ALL factbeanzorder Queries)
**ALWAYS** include `RateType = 'AUD-MonthEnd'` on every `factbeanzorder` query — not just revenue.

**Why:** `factbeanzorder` stores every order line **6 times** — once per exchange rate type
(Local, AUD-MonthEnd, EUR-Constant, USD-Constant, AUD-Budget, Constant). Without this filter,
`SUM(Quantity)`, `SUM(Quantity_by_KG)`, `COUNT(*)`, and `SUM(SkuAmount)` all inflate by **6x**.

- `SkuAmount` is the primary revenue field (varies by RateType — that's the point)
- `Quantity`, `Quantity_by_KG`, `Discount` are **identical** across all 6 rate types
- `Net_Sales` is NOT the correct revenue field
- Default Genie RateType is `'Local'` — you must explicitly filter for `AUD-MonthEnd`
- Other valid RateTypes: `EUR-Constant`, `USD-Constant`, `AUD-Budget`, `Constant`
- If user doesn't specify currency, default to `AUD-MonthEnd`

**Verified Jul 2025:** 94,929 order lines per RateType. Without filter = 569,574 (6x inflation).

### Rule 2: Exclude Cancelled Orders
**ALWAYS** include `lower(f.OrderStatus) <> 'cancelled'` in every revenue/volume query.
This must appear in your WHERE clause — no exceptions.

### Rule 3: Date Convention
- Default to **Calendar Year** unless user says "Fiscal Year"
- BRG Fiscal Year runs **July 1 → June 30** (FY26 = Jul 2025 – Jun 2026)
- Always use explicit date ranges: `f.OrderDate >= '2025-01-01' AND f.OrderDate < '2026-01-01'`
- For month breakdowns, JOIN to `dimdate` and use `d.Month_Name` for readable labels

### Rule 4: Store Code Patterns
Programs are identified by StoreCode prefix in dimbeanzstore:
- `PBB%` → Powered by Beanz (retail partners)
- Always JOIN to `dimbeanzstore` for Country/Region context

### Rule 5: Program Detection
Read `references/program-detection.md` for the full detection pattern matrix. Key SQL patterns:
- **FTBP v2 orders**: `f.offer_code LIKE '%-FT-DISCOFF-%'`
- **PBB**: `s.StoreCode ILIKE 'PBB%'`
- **Fusion GWP**: `f.source = 'GWP' AND f.exact_offer_code LIKE 'FusionFree2bag%'`
- **Coffee Essentials**: `f.is_part_of_bundle = 1`

### Rule 6: KG Data Gap (Severity: LOW for Coffee SKUs)
`Quantity_by_KG` in factbeanzorder was previously reported as NULL from July 2025 onwards.

**Updated finding (Mar 2026 audit):** For coffee SKUs (`BeanzSkuFlag = 1`), `Quantity_by_KG`
is populated **99.98%+ of the time** across all months Jul 2025 – Mar 2026. The NULL issue
is negligible (0–87 lines per month out of 37K–65K).

The original warning likely referred to non-coffee items (`BeanzSkuFlag = 0`), which **always**
have `Quantity_by_KG = NULL` (machines, parts, digital training have no weight).

**Updated rule:** Use `SUM(f.Quantity_by_KG)` directly for KG when querying with `BeanzSkuFlag = 1`.
No fallback calculation needed for coffee SKUs.

**Fallback (only if querying ALL SKUs including non-coffee):**
- Option A: `ana_prd_gold.edw.factbeanzorderdailysummary.OrderedWeight` (pre-aggregated, reliable for KG)
- Option B: `f.Quantity * p.BAGSIZE_in_KG` (JOIN to dimbeanzproduct on ProductCodeKey)

### Rule 7: BeanzSkuFlag Filter (Coffee vs Non-Coffee)
`factbeanzorder` contains **all marketplace order lines** — not just coffee. This includes
espresso machines, spare parts, accessories, and digital training SKUs.

**For coffee-only analysis, ALWAYS include:** `f.BeanzSkuFlag = 1`

Without this filter, bag counts include machine units and spare parts. In Jul 2025:
- `BeanzSkuFlag = 0`: 55,863 lines, 64,350 units, $8.7M revenue, 0.57 kg (machines/parts)
- `BeanzSkuFlag = 1`: 39,066 lines, 76,816 bags, $1.3M revenue, 22,994 kg (coffee)

Non-coffee items have `Quantity_by_KG = NULL` and dominate revenue (~87% in Jul 2025).

**When to omit this filter:** Only when the user explicitly asks about total marketplace revenue
(coffee + equipment), or when analysing multi-brand orders via `factbeanzmborders`.

### Rule 8: dimbeanzsubscription Also Requires BeanzSkuFlag = 1

`dimbeanzsubscription` contains ALL subscription types — not just coffee. This includes machine
purchase subscriptions, accessories, and digital training programs (BeanzSkuFlag = 0).

**For coffee subscription analysis, ALWAYS include:** `BeanzSkuFlag = 1`

**PBI's "Active Subscriptions" definition (Subscription_KPI's page):**
```
SubscriptionStatus IN ('Active', 'Paused') AND BeanzSkuFlag = 1
```
= 33,719 Active + 2,865 Paused = **36,584 total** ≈ PBI's displayed **36,600** (<0.05% gap ✓)

Without `BeanzSkuFlag = 1`: returns 57,012 — inflated by 23K non-coffee subs (wrong).
Without `'Paused'` in status: returns 33,719 — misses 2,865 paused coffee subs (wrong).

**dimbeanzsubscription full schema (12 columns):**
SubscriptionId, SubscriptionStatus, SubscriptionCreationDate, SubscriptionCancelDate,
CohortMonth, BeanzSkuFlag, DiscoverySkuFlag, SubscriptionDurationDays, SubscriptionDurationWeeks,
SubscriptionDurationMonth, SubscriptionType, FiscalYearNumber

**Note:** dimbeanzsubscription is NOT SCD Type 2 — it's 1:1 (one row per SubscriptionId).
No deduplication needed. No JOIN to dimexchangerate required (no rate multiplier).

### Rule 9: factbeanzshipment — ORDERDATE Is NOT a Date (Critical Schema Bug)

**ORDERDATE in `factbeanzshipment` stores day-of-week as an integer (1–7), NOT a calendar date.**

Verified Mar 2026: `MIN(ORDERDATE) = 1, MAX(ORDERDATE) = 7` across 1.28M rows.

**Consequences:**
- `WHERE ORDERDATE >= '2025-01-01'` always returns **0 rows** (integer vs string comparison fails silently)
- All SLA patterns in the original skill documentation using `ORDERDATE` for date filtering are **broken**
- `OrderSLAFlg` measures ship-on-time (always 100%) — not useful as a delivery SLA metric

**Correct date columns to use in factbeanzshipment:**
- `SHIPPINGDATE` — full timestamp of shipment dispatch (use for "shipped in period" queries)
- `DeliveryDate` — full timestamp of delivery (use for SLA delivery analysis)
- `CARRIERSCANDATE` — first carrier scan timestamp

**Correct SLA query skeleton:**
```sql
SELECT COUNTRY, DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM') AS Month,
  COUNT(*) AS Total_Shipments,
  ROUND(AVG(LeadTime), 2) AS Avg_LeadTime_Days
FROM ana_prd_gold.edw.factbeanzshipment
WHERE SHIPPINGDATE >= '2025-01-01' AND SHIPPINGDATE < '2026-01-01'
  AND LeadTime IS NOT NULL
GROUP BY COUNTRY, DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM')
ORDER BY COUNTRY, Month
```

**Note:** `LeadTime` is the correct SLA metric (days from order placement to delivery). Use avg LeadTime
by market to assess performance. CY25 benchmarks from pre-verified data: AU ≈ 5.83d, UK ≈ 3.97d,
US ≈ 5.72d, DE ≈ 5.17d.

### Rule 9: Revenue Definition — SQL vs Power BI

**PBI "Free Units = Paid" filter = `SkuAmount > 0` (non-zero revenue bags).**
This is NOT the same as `DiscoverySkuFlag = 0`. Key insight from PBI validation (Mar 2026):
- DiscoverySkuFlag=1 bags WITH revenue (partner-paid FTBP/PBB): ~271K bags in FY25 — PBI counts these as "Paid"
- DiscoverySkuFlag=0 or 1 bags with $0 revenue: ~259K bags in FY25 — PBI excludes these as "Free"

**CY25 benchmark table (all-year SQL, coffee orders, AUD-MonthEnd):**

| Definition | SQL Filter | Revenue (CY25) | Bags (CY25) | Notes |
|---|---|---|---|---|
| All coffee (incl. free) | BeanzSkuFlag=1, non-cancelled | $15.54M AUD | 1,003,406 | SQL default — most complete |
| PBI "Paid" match | BeanzSkuFlag=1, SkuAmount>0 | ~$13–14M AUD est. | ~700K est. | SkuAmount>0 verified vs PBI FY25 ✓ |
| Legacy "paid" (WRONG for PBI match) | DiscoverySkuFlag=0 or NULL | $8.58M AUD | 376,840 | Does NOT match PBI "Paid" filter |
| True free bags (no revenue) | SkuAmount=0, BeanzSkuFlag=1 | $0 | ~260K est. | Zero-price discovery bags |

**FY25 verified benchmarks (Jul 2024 – Jun 2025, SkuAmount>0):**
- Total paid bags: **561,971** ≈ PBI 562K (**<0.1% gap ✓ for all markets individually**)
- Total paid revenue: **$12.31M** vs PBI **$11.6M** (5.8% gap → fully explained by PBB revenue treatment below)

**PBB revenue gap explained (verified Mar 2026):**
- SQL US non-PBB revenue: $5,850,246 ≈ PBI US $5.9M (<1% gap ✓)
- SQL US PBB revenue: $771,984 (46,153 PBB bags)
- SQL non-PBB global: $12.31M - $772K = $11.53M ≈ PBI $11.6M (**0.6% gap ✓**)
- **Conclusion: PBI Topline uses a different (lower) revenue calculation for PBB orders** — likely the Beanz partner-fee rate, not the full SkuAmount. PBB bags ARE counted in the bag total (562K includes PBB), but PBB revenue ≠ SkuAmount.
- PBB has a dedicated "Paid OrderType Metrics..." page in PBI for the full PBB revenue view.

**To match PBI bag count AND non-PBB revenue separately:**
```sql
-- For bags (562K): SkuAmount > 0 across ALL stores including PBB
-- For revenue ($11.6M): SkuAmount > 0 AND StoreCode NOT ILIKE 'PBB%'
-- Note: can't get both to match simultaneously from factbeanzorder with SkuAmount alone
```

**PBI Topline_Global Metrics page definitions (captured Mar 2026):**
- "Bags Shipped: Number of Bags ordered and shipped (excluding Cancelled orders)"
- "Actual Revenue: Amount paid by Customers for Beanz orders (excluding Cancelled orders, including PBB revenue, and VAT calc for DE)"
- "Free Units = Paid" slicer → effectively removes $0-price bags from both bag count and revenue

**When to use each filter:**
- Match PBI exactly → `SkuAmount > 0`
- Coffee-only total → `BeanzSkuFlag = 1` (no discovery filter)
- Exclude partner-funded bags → `DiscoverySkuFlag = 0` (but this doesn't match PBI)

### Rule 10: Daily Summary Ghost Rows (Known Issue from Oct 2025)
`factbeanzorderdailysummary` contains phantom rows with `NULL` ProductCodeKey, StoreCode, and
BAGSIZE_in_Grams from **October 2025 onwards**. These rows have `OrderedQty > 0` but
`OrderedWeight = NULL`.

**Impact on OrderedQty:**
- Jul–Sep 2025: ~2% phantom rows (negligible)
- Oct 2025: **40%** phantom rows
- Jan 2026: **61%** phantom rows
- Feb 2026: **68%** phantom rows

**Rules for daily summary:**
- `SUM(OrderedWeight)` is **safe** — phantom rows contribute NULL, so KG totals are correct
- `SUM(OrderedQty)` is **NOT safe** — phantom rows inflate bag counts by 40–68%
- For reliable bag counts, filter: `WHERE BAGSIZE_in_Grams IS NOT NULL AND BAGSIZE_in_Grams > 0`
- **Best practice:** Use `factbeanzorder` with Rules 1 + 2 + 7 for bag counts instead

---

## Schema Map — Which Table for What

Read `references/schema-reference.md` for full column details. Quick lookup:

| Question Domain | Primary Table | Key Joins |
|---|---|---|
| Revenue, orders, margins | `factbeanzorder` | dimexchangerate, dimbeanzstore, dimdate |
| Subscriptions (status, duration) | `dimbeanzsubscription` | — |
| Subscription events (create, cancel, pause) | `factbeanzsubscription` | — |
| Shipments, SLA, delivery times | `factbeanzshipment` | dimdate |
| FTBP registrations, conversion | `factbeanzftbpprodregistration` | — |
| Cancellation reasons | `factbeanzcancellationsurvey` | — |
| Roaster MOT, weekly SKU volume | `factbeanzroastermotskudata` | — |
| Roaster MOT summary | `factbeanzroastermotsummary` | — |
| Daily order summary | `factbeanzorderdailysummary` | — ⚠️ OrderedQty unreliable from Oct 2025+ (ghost rows). Use OrderedWeight for KG only. |
| Multi-brand equipment orders | `factbeanzmborders` | dimexchangerate, dimbeanzstore |
| Product attributes, pricing, inventory | `dimbeanzproduct` | — |
| Customer email/engagement metrics | `dimbeanzcustomeremail` | — |
| Promotions, coupons, discounts | `dimbeanzpromotion` | — |
| Order detail (grind, brew, flavour) | `dimbeanzorder` | — |
| Store/market lookup | `dimbeanzstore` | — |
| Exchange rates | `dimexchangerate` | — |
| Calendar/fiscal dates | `dimdate` | — |

All tables live in schema: `ana_prd_gold.edw`

---

## SQL Construction Guide

### Standard Revenue Query Skeleton

Every revenue query MUST start from this skeleton:

```sql
SELECT
  <dimensions>,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1              -- coffee SKUs only (omit for total marketplace)
  AND f.OrderDate >= '<START_DATE>'
  AND f.OrderDate < '<END_DATE_EXCLUSIVE>'
GROUP BY <dimensions>
ORDER BY <dimensions>
```

### Standard Volume Query Skeleton

For bag counts and KG (coffee only):

```sql
SELECT
  <dimensions>,
  SUM(f.Quantity) AS Total_Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS Total_KG
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'     -- REQUIRED: deduplicates the 6x rate multiplier
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1              -- REQUIRED: excludes machines, parts, training
  AND f.OrderDate >= '<START_DATE>'
  AND f.OrderDate < '<END_DATE_EXCLUSIVE>'
GROUP BY <dimensions>
ORDER BY <dimensions>
```

**Sanity check after running:** Avg KG/bag should be 0.25–0.35. If it's < 0.1 or > 1.0,
a filter is missing (likely RateType or BeanzSkuFlag).

**Date range note:** Use `>=` start and `<` end-exclusive for clean month/year boundaries.
- March 2026 → `>= '2026-03-01' AND < '2026-04-01'`
- CY25 → `>= '2025-01-01' AND < '2026-01-01'`
- FY26 → `>= '2025-07-01' AND < '2026-07-01'`

### Adding Month Breakdown

JOIN to dimdate for readable month labels:

```sql
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
```

Then use `d.Month_Name` in SELECT and GROUP BY.

### Adding Country Breakdown

The `dimbeanzstore` JOIN is already in the skeleton. Use `s.Country` in SELECT and GROUP BY.

### Pre-Flight Checklist

Before sending ANY SQL to Genie, verify:

- [ ] All table names are fully qualified: `ana_prd_gold.edw.<table>`
- [ ] `RateType = 'AUD-MonthEnd'` present (for ALL factbeanzorder queries — revenue, volume, counts)
- [ ] `lower(f.OrderStatus) <> 'cancelled'` present
- [ ] `f.BeanzSkuFlag = 1` present (for coffee-only analysis — omit only for total marketplace queries)
- [ ] Date range uses explicit dates with `>=` and `<` pattern
- [ ] JOIN keys are correct (ExchangeRateKey, StoreCode, PK_Date, ProductCodeKey)
- [ ] GROUP BY matches all non-aggregated columns in SELECT
- [ ] No accidental CROSS JOIN or missing ON clause
- [ ] ROUND applied to monetary values
- [ ] If using daily summary for bags: filter `BAGSIZE_in_Grams IS NOT NULL AND BAGSIZE_in_Grams > 0`
- [ ] **Post-query sanity:** Avg KG/bag should be 0.25–0.35 for coffee

---

## Polling Pattern

BeanzGenie is async. Always follow this pattern:

```
1. Call query_space → get conversation_id + message_id
2. Poll poll_response with both IDs
3. Check status field:
   - FILTERING_CONTEXT → poll again
   - PENDING_WAREHOUSE → poll again
   - ASKING_AI → poll again
   - EXECUTING_QUERY → poll again
   - COMPLETED → extract results
   - FAILED → report error, retry with simpler query
4. Max 8 polls before timeout warning
```

### Conversation Threading
- Each query_space call starts a NEW conversation by default
- Pass `conversation_id` to continue an existing conversation (follow-up queries)
- Follow-ups inherit context — useful for iterative analysis

---

## Data Quality Audit Checklist

Run these checks on EVERY query result before presenting to user:

### Completeness Checks
- [ ] All requested months/periods present (no gaps)
- [ ] All expected markets/countries present
- [ ] No unexpected NULL values in key metrics
- [ ] Row count plausible for the query scope

### Accuracy Checks
- [ ] Revenue totals within benchmark tolerance
- [ ] Volume (KG/bags) within benchmark tolerance
- [ ] Subscription counts within benchmark tolerance
- [ ] YoY growth rates mathematically consistent

### Consistency Checks
- [ ] Sum of parts equals total (market breakdown sums to global)
- [ ] Revenue per KG within reasonable range ($2-8 AUD/KG)
- [ ] Average order value within reasonable range ($20-80 AUD)
- [ ] No duplicate months or dimension values

### Known Issue Checks
- [ ] RateType filter applied (without it, bags/KG/revenue inflate 6x)
- [ ] BeanzSkuFlag = 1 applied for coffee queries (without it, machine units inflate bag counts ~1.8x)
- [ ] If using daily summary for bags: BAGSIZE_in_Grams IS NOT NULL filter applied (Oct 2025+ ghost rows inflate 40–68%)
- [ ] Exchange rate applied correctly (not double-converted)
- [ ] Fiscal vs Calendar year alignment correct
- [ ] PBB StoreCode filter correctly applied (ILIKE 'PBB%')
- [ ] Avg KG/bag in range 0.25–0.35 (if outside, a filter is missing)

### Benchmark Values (CY25)

> **Last verified: March 2026** against live BeanzGenie data (BeanzSkuFlag=1, AUD-MonthEnd, non-cancelled).

| Benchmark | CY25 Value | Tolerance | Notes |
|---|---|---|---|
| Total coffee revenue (all orders incl. free/discovery) | $15.54M AUD | ±3% | Verified Mar 2026. Previous benchmark ($13.5M) was stale — captured before year-end. |
| Total coffee revenue (SkuAmount>0, PBI "Paid" match) | ~$13–14M AUD est. | ±5% | CY25 estimate; FY25 verified = $12.31M SQL vs PBI $11.6M (5.8% gap, US-specific — under investigation) |
| Total coffee revenue (DiscoverySkuFlag=0) | $8.58M AUD | ±5% | Legacy filter — does NOT match PBI "Paid". Excludes partner-funded bags with revenue. |
| Total bags shipped (all, incl. free/discovery) | 1,003,406 | ±3% | Verified Mar 2026 |
| Total bags shipped (SkuAmount>0, PBI "Paid" match, CY25 est.) | ~700K est. | ±5% | FY25 verified = 561,971 bags vs PBI 562K (<0.1% gap ✓ for all markets) |
| Total bags shipped (DiscoverySkuFlag=0) | 376,840 | ±5% | Legacy — NOT the PBI "Paid" match. Many discovery bags have revenue and are included in PBI. |
| Free/discovery bags (SkuAmount=0, truly free) | ~259K (FY25) | ±5% | Zero-price bags excluded by PBI "Paid" filter. Cross DiscoverySkuFlag values: flag=0 (30K) + flag=1 (229K) |
| Total KG shipped (coffee, incl. free) | 298,181 kg | ±3% | Avg KG/bag = 0.297 ✓ (within 0.25–0.35 sanity range) |
| Currently active subscriptions (as of Mar 2026) | ~36,584 | ±2% | BeanzSkuFlag=1 + Status IN ('Active','Paused'). Verified against PBI 36,600 (<0.05% gap ✓). Without BeanzSkuFlag=1: 57,012 (wrong). Without Paused: 33,719 (wrong). |
| Avg spend per subscriber | $353.20 | ±10% | From dimbeanzcustomeremail LTV |
| SLA performance (ship-on-time) | 100% | — | OrderSLAFlg = shipped within SLA window — not a useful KPI (always 100%). See Rule 9. |
| PBB CY25 revenue | $907,949 AUD | ±5% | Verified Mar 2026 (was ~$908K ✓) |
| PBB CY24 revenue | ~$560K AUD | ±10% | Not re-verified |
| Top roaster by revenue (CY25) | ONYX $618K AUD | ±5% | 76.4% gross margin |
| Top roaster by KG volume (CY25) | Olympia 12,486 kg | ±5% | 35,959 bags |
| Roaster gross margin range (CY25) | 32–85% | — | ST. ALi outlier (32.4%); typical 60–85% |
| Revenue per KG range by roaster (CY25) | $23–$82 AUD/kg | — | Veneziano low ($22.96); ONYX high ($81.72) |
| Avg KG per bag range by roaster (CY25) | 0.232–0.361 kg | — | Fleet average ~0.297 kg/bag |
| Typical 6-month cohort retention (CY24–CY25) | 35–55% | — | Holiday cohorts (Nov/Dec) churn faster (~35–42%) |
| Largest monthly cohort (CY24–CY25) | Dec 2024: 7,803 new subs | — | Dec 2025: 7,678; Nov 2025: 7,101 |
| FTBP v1 free bags (CY25) | 188,736 bags | ±3% | AU top market (85,690). ftbp_Flag=1. All SkuAmount=0. |
| FTBP v1 paid bags (CY25) | 224,437 bags, $5.55M AUD | ±5% | US $2.21M (76.8K bags), UK $1.87M (85.7K), AU $1.02M (45K), DE $0.45M (17K) |
| FTBP v2 free bags (CY25) | 108,124 bags | ±5% | Sep–Dec 2025 only (4 months). ftbp_Flag=2. |
| FTBP v2 paid bags (CY25) | **24,481 bags, $524K AUD** | ±5% | Sep:76, Oct:1,790, Nov:6,900, Dec:15,715. Dec=2.3× Nov. NOTE: earlier figure of 12,215 was DiscoverySkuFlag=1 only — incorrect. |
| FTBP v2 paid bags by roaster (CY25) | **106 roasters, 24,481 bags total** | ±3% | ONYX #1: 1,225 bags $30K; Volcano 827; Methodical 805; Madcap 740; Workshop 704. **Do NOT LIMIT** — top 15 alone = only ~39% of bags. JOIN factbeanzproduct on ProductCodeKey for VendorName. |
| FTBP v2 customers (PBI FTBP_Overview, Mar 2026) | ~80,335 total | ±5% | 80.2% on-demand, 19.8% subscription (PBI "FTBP Promo: 2" filter) |
| MOT season (CY25, Platinum tier) | 13 weeks tracked | — | Top thresholds: Methodical 150 kg/wk, Olympia 145, Equator 140 |
| MOT AU achievement (PBI, week ending Mar 7 2026) | 180.7% (1,055 KG vs 583.9 threshold) | — | AU-specific from PBI. Country thresholds (wk Mar 15): US=1,724 KG, UK=920, AU=605, DE=241 |
| factbeanzroastermotskudata — VENDOR_NAME | NOT in table directly | — | **JOIN via ProductCodeKey→dimbeanzproduct to get VendorName.** Must pre-aggregate before joining to factbeanzroastermotsummary (else MOT_QTY inflates 10×). See sql-patterns.md Section 15.2. |
| Machine sales per roaster (CY25, top 3 UK, Local) | Origin £262K, Kiss the Hippo £127K, 200 Degrees £116K | ±10% | factbeanzmborders, RoasterFlg='Y'. AU: Veneziano $34.8K. US: ONYX $16.3K |
| Total machine/non-coffee revenue (CY25, AUD-MonthEnd) | ~$135M+ AUD | ±5% | BeanzSkuFlag=0 in factbeanzorder. US ~$59.3M, UK ~$33.5M, DE ~$29.6M, AU ~$12.1M |
| WEB_FLAVOURCATEGORY values | Chocolate, Fruit, Caramel | — | Plus NULL/blank/--None-- for untagged |
| Known origin countries in catalog | Ethiopia, Brazil, Colombia, Peru, Guatemala, Kenya, El Salvador, Rwanda, Costa Rica, Burundi | — | Blanks/--None-- likely blends |

**⚠️ Power BI vs SQL Revenue Definition Mismatch:**
Power BI "Actual Revenue" uses a "Free Units: Paid" filter which excludes free/discovery bags.
SQL queries WITHOUT a DiscoverySkuFlag filter include all non-cancelled orders ($15.54M).
Always clarify which definition the user wants before quoting revenue.

If results deviate beyond tolerance, investigate before reporting.

---

## Error Recovery

### Genie Rejects or Rewrites Your SQL
1. Prefix with: "Run the following SQL exactly as written, do not modify it:"
2. If still rejected, break into simpler sub-queries
3. Remove ORDER BY if Genie complains about query complexity

### Date Range Returns Empty
1. Check date format: must be `'YYYY-MM-DD'` string
2. Verify the table's date column name (OrderDate vs FactDate vs ORDERDATE)
3. Try CAST if needed: `CAST(f.OrderDate AS DATE)`

### NULL KG Values
1. If querying with `BeanzSkuFlag = 1`: `Quantity_by_KG` is populated 99.98%+ — no action needed
2. If querying ALL SKUs (including non-coffee): non-coffee items always have NULL KG — this is expected
3. Fallback for all-SKU KG: `ana_prd_gold.edw.factbeanzorderdailysummary.OrderedWeight`
4. Fallback option B: `f.Quantity * p.BAGSIZE_in_KG` (JOIN to dimbeanzproduct on ProductCodeKey)
   **Caution:** dimbeanzproduct has 155K rows (SCD Type 2) — JOIN is safe (1:1 on ProductCodeKey)
   but ensure RateType filter is applied to avoid 6x inflation on the fact side

### Inflated Bag/Volume Counts
If bag counts or KG seem unreasonably high:
1. Check `RateType = 'AUD-MonthEnd'` is present → without it, 6x inflation
2. Check `BeanzSkuFlag = 1` is present → without it, machine units inflate bags ~1.8x
3. If using daily summary: check `BAGSIZE_in_Grams IS NOT NULL` → ghost rows inflate 40–68% from Oct 2025+
4. Sanity check: Avg KG/bag should be 0.25–0.35 for coffee

### Genie Timeout
1. Remove ORDER BY (sorting adds compute time)
2. Reduce dimensions (max 2-3 per query)
3. Shorten date range
4. Split into multiple queries

---

## Integration with Other Skills

| Skill | How This Skill Feeds It |
|---|---|
| beanz-institutional-kb | This skill provides live data; KB provides benchmarks and context |
| beanz-business-intelligence | Query verified numbers for slide decks |
| beanz-slide-architect | Supply data-fidelity-checked metrics for visual prompts |
| ralph-wiggum-loop | Use audit checklist above as validation criteria |
| deck-builder-v2 | Ground presentation numbers in Genie-verified data |

---

## Reference Files

| File | When to Read |
|---|---|
| `references/schema-reference.md` | When you need column-level detail for any table |
| `references/sql-patterns.md` | When formulating any query — use pre-validated SQL templates |
| `references/program-detection.md` | When filtering by acquisition program (FTBP, PBB, Fusion, CE) |
