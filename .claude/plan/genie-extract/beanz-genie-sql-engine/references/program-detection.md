# Program Detection Patterns

> How to identify and filter Beanz acquisition programs in analytics queries.
> These patterns are the ONLY reliable way to segment by program.

---

## Program Detection Matrix

| Program | Status | Detection Method | Table | Filter |
|---|---|---|---|---|
| **Coffee Essentials** | Closed (active subs remain) | Bundle flag | factbeanzorder | `is_part_of_bundle = 1` |
| **Fusion (GWP)** | Closed | Offer code | factbeanzorder | `source = 'GWP' AND exact_offer_code LIKE 'FusionFree2bag%'` |
| **Fusion (Cashback)** | Closed | Offer code | factbeanzorder | `exact_offer_code = 'Cashback Promotion Aug 2023'` or `'Cashback Promotion Oct 2023'` |
| **FTBP v1** | Closed (replaced by v2) | Campaign lookup | factbeanzftbpprodregistration | `FTBP_Release = 'FTBP v1'` (registrations) |
| **FTBP v1 (orders)** | Closed | Promotion ID join | factbeanzorder | `external_promotion_id` → `ftbp_campaign_lookup.program_version = 'FTBP v1'` |
| **FTBP v2** | **Active** | Campaign lookup | factbeanzftbpprodregistration | `FTBP_Release = 'FTBP v2'` (registrations) |
| **FTBP v2 (orders)** | **Active** | Offer code | factbeanzorder | `offer_code LIKE '%-FT-DISCOFF-%'` |
| **PBB** | **Active** | StoreCode prefix | dimbeanzstore | `StoreCode ILIKE 'PBB%'` |
| **Cancellation Retention** | Active | Offer code | factbeanzorder | `offer_code LIKE 'Can_Disc_01%'` |

---

## Program Details

### Coffee Essentials (Dec 2021 – Jul 2023)
- ~5,700 customers
- Mechanic: Appliance bundle + 12-bag subscription commitment at 20% off
- Revenue share CY25: 2%
- Detection: `is_part_of_bundle = 1` in salesforce_orders

### Fusion (Jul – Oct 2023)
- ~32,800 customers
- Two variants:
  - GWP: 2 free bags via gift-with-purchase
  - Cashback: Cashback promotion via OPIA
- Revenue share CY25: 19%
- Active subscription share CY25: 14%

### FTBP v1 (Sep 2024 – Oct 2025)
- ~125,600 customers
- Mechanic: 2/4/6 free bags → cashback via Hyperwallet
- Conversion rate: 11.4%
- Active subscription share CY25: 32%
- Revenue share CY25: Part of the 41% FTBP Paid total

### FTBP v2 (Sep 2025 – Present)
- ~74,000+ customers
- Mechanic: 2 free bags → upfront discount (25%/20%)
- Conversion rate: 16.5% (first 12 weeks)
- Active subscription share CY25: 17%
- Key change: Payment required upfront at registration
- Discount rates: AU/US/UK 25%, DE 20%, Baratza 25%

**FTBP v2 Customer Segments:**

| Segment | Description | Detection |
|---|---|---|
| Sub+FreeBags | Chose subscription at registration | `SignUpOrderType` in factbeanzftbpprodregistration |
| FBO Converted | Chose free bags only, later subscribed | `SignUpOrderType = 'FBO'` AND `Has_PaidOrdere = true` |
| FBO Not Converted | Chose free bags only, never subscribed | `SignUpOrderType = 'FBO'` AND `Has_PaidOrdere = false` |

**FTBP v2 Savings Caps:**

| Market | Cap | Term |
|---|---|---|
| AU | $750 AUD | 3 years |
| US | $700 USD | 4 years |
| UK | £650 GBP | 4 years |
| DE | €750 EUR | 4 years |

### PBB — Powered by Beanz (Active)
- 7 live retail partners: Seattle Coffee Gear, Williams Sonoma, Crate & Barrel, John Lewis, Sur La Table, AeroPress, acaia
- Pipeline: Mazer, KeepCup
- CY25 revenue: ~$908K AUD (+62% YoY)
- CY25 volume: 9,215 KG (H1 only — H2 KG data may be partially NULL for PBB StoreCode rows)
- 14% of US volume
- Almost entirely US-based (99% of revenue), UK emerging ($10K in CY25)
- Detection: `StoreCode ILIKE 'PBB%'` in dimbeanzstore

---

## Revenue Mix by Program (CY25)

| Revenue Stream | CY24 Share | CY25 Share |
|---|---|---|
| FTBP Paid | 3% | **41%** |
| Beanz Subscription | 36% | 33% |
| Fusion | 45% | 19% |
| Non-subscription | 6% | 5% |
| Coffee Essentials | 9% | 2% |
| PBB | 0% | ~0% (rounds down at $908K vs $13.5M) |

---

## Active Subscription Mix (Year End CY25)

| Type | Share |
|---|---|
| Beanz Subscriptions | 38% |
| FTBP v1 | 32% |
| FTBP v2 | 17% |
| Fusion | 14% |

---

## Query Tips by Program

### Querying FTBP Data
- For **registration** metrics → use `factbeanzftbpprodregistration`
- For **revenue** from FTBP customers → use `factbeanzorder` with offer_code filter
- For **conversion rates** → compare registration count vs `Has_PaidOrdere = true` count
- For **v1 vs v2 split** → use `FTBP_Release` column in registration table

### Querying PBB Data
- Always filter `dimbeanzstore.StoreCode ILIKE 'PBB%'`
- JOIN to factbeanzorder for revenue (with exchange rate JOIN + `RateType = 'AUD-MonthEnd'`)
- **Always include `BeanzSkuFlag = 1`** for coffee volume queries
- `Quantity_by_KG` may still have some NULLs for PBB rows specifically — use daily summary `OrderedWeight` as fallback for PBB KG
- For partner-level breakdown, the StoreCode contains partner identifiers (e.g. PBB_SCG, PBB_WS, PBB_JLP)

### Querying Fusion Data
- Legacy program — declining share
- Two variants need different offer_code filters
- Active subs still exist but no new acquisitions

### Querying Beanz Subscription Data
- These are direct organic subscribers (not acquired through any program)
- Largest single subscription type at 38% of active base
- No special detection filter needed — it's the "default" when no program flag matches

---

## Known Data Quality Issues by Program

| Issue | Program | Severity | Workaround |
|---|---|---|---|
| **6x RateType row multiplier** | ALL programs | **Critical** | Always filter `RateType = 'AUD-MonthEnd'` — without it ALL aggregates inflate 6x |
| **Non-coffee SKUs in factbeanzorder** | ALL programs | **Critical** | Filter `BeanzSkuFlag = 1` for coffee-only analysis |
| **Daily summary ghost rows (Oct 2025+)** | ALL programs | **High** | `OrderedQty` unreliable (40–68% phantom). Use `OrderedWeight` for KG or factbeanzorder for bags |
| KG NULL for some PBB rows | PBB | Low | Use daily summary `OrderedWeight` as PBB KG fallback. For coffee SKUs overall, KG is 99.98%+ populated |
| Brand Summit model used $49K PBB baseline | PBB | High | Actual CY25 revenue is $908K — 18x higher |
| FTBP v1 → v2 overlap period | FTBP | Low | Sep-Oct 2025 has both versions active |
| Fusion codes inconsistent across markets | Fusion | Low | Use both GWP and Cashback detection patterns |
| Coffee Essentials bundle flag may miss edge cases | CE | Low | Cross-reference with date range (Dec 2021 – Jul 2023) |
| `PBB_JLP` mapped to Region = Americas (should be EMEA) | PBB | Low | Override in queries if region accuracy needed |
| Some lelit/baratza stores have NULL Country | ALL | Low | These are newer brand stores; Country mapping incomplete |
