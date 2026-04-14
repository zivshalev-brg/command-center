---
title: "Operation Freedom: Product Requirements"
description: Product requirements for the UK machine + coffee bundle pilot, covering bundling, discount delivery, payments, and FTBP safeguards.
type: strategy
status: draft
owner: Product
market:
  - uk
tags:
  - projects
  - pricing
  - acquisition
  - features
aliases:
  - Op Freedom Requirements
  - Operation Freedom PRD
  - Bundle Requirements
temporal-type: dynamic
review-cycle: monthly
related:
  - "[[operation-freedom|Operation Freedom]]"
  - "[[ftbp|Fast-Track Barista Pack]]"
  - "[[2026-03-12-operation-freedom-working-session-bundling-kickoff|Bundling Kickoff Meeting]]"
---

# Operation Freedom: Product Requirements

## Summary

UK pilot: Barista Express + 2 years of coffee sold as a single bundle on sageappliances.com. £58/mo, £0 upfront, financed via Klarna. Customer sees "50% off your machine" — funded by the beans margin (same mechanism as FTBP, applied upfront). Post-purchase, customer receives a coffee credit on beanz.com to redeem against subscription orders.


---

## 1. Bundle Storefront

### What the customer sees

| Element     | Requirement                                                                   |
| ----------- | ----------------------------------------------------------------------------- |
| **Listing** | Dedicated bundle PDP with its own SKU, separate from standard Barista Express |
| **PLP**     | Bundle appears on espresso machine PLP alongside standard machines            |
| **Machine** | Barista Express Impress — colour selector (Brushed Stainless Steel, Black)    |
| **Coffee**  | "2 years of specialty coffee from the UK's best roasters"                     |
| **Price**   | £58/mo for 24 months, £0 down                                                 |
| **Payment** | Klarna only                                                                   |
|             |                                                                               |

### Bundle composition

The "50% off machine" display is locked (discount = £314.95). Open question: does the discount need to match the FTBP 25% rate, or can it be higher?

| Line Item | Scenario A: Current pricing | Scenario B: 25% off beans |
|-----------|---------------------------|--------------------------|
| Barista Express Impress | £629.95 | £629.95 |
| Coffee Credit | £1,077.00 (107 bags × £10) | £1,259.80 (126 bags × £10) |
| Discount (displayed as 50% off machine) | -£314.95 (~29% off beans) | -£314.95 (25% off beans) |
| **Bundle total** | **£1,392.00** | **£1,574.80** |
| **Monthly (24 × Klarna)** | **£58.00/mo** | **£65.62/mo** |

Scenario A is what the current UX designs use. Scenario B aligns the discount to the FTBP 25% rate but increases the monthly to £65.62.

### Cart behaviour

| Requirement  | Detail                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Quantity     | Locked to 1                                                             |
| Breakdown    | Machine (strikethrough RRP) + Coffee Credit as "Included with purchase" |
| Promo codes  | Blocked or hidden for this SKU (scope TBD)                              |
| Checkout CTA | Klarna-specific                                                         |

### Decision: Bundle pricing logic

Existing soft bundle logic uses proportional discounts. The current UX requires the cart to show the machine at exactly 50% off. Three options:

| Criteria               | A: Soft Bundle — Fixed Split                        | B: Soft Bundle — Proportional Split                                         | C: Hard Bundle                                         |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Type**               | Two SKUs (machine + coffee), custom discount split  | Two SKUs (machine + coffee), standard proportional split                    | Single bundle SKU, one price                           |
| **PDP / marketing**    | "50% off your machine"                              | "50% off your machine" (same — marketing copy is independent of cart logic) | "50% off your machine"                                 |
| **Cart display**       | Machine £315 + Coffee £1,077 (two line items)       | Machine ~£514 + Coffee ~£878 (two line items)                               | Single line item: £1,392                               |
| **Total / monthly**    | £1,392 / £58                                        | £1,392 / £58 (identical)                                                    | £1,392 / £58 (identical)                               |
| **Pricing logic**      | New logic required                                  | Existing logic works as-is                                                  | No split calculation needed                            |
| **Inventory tracking** | Machine and coffee tracked separately               | Machine and coffee tracked separately                                       | Single SKU — components not tracked individually       |
| **Reporting**          | Revenue attributed to machine and coffee separately | Revenue attributed to machine and coffee separately                         | Revenue as one line — needs manual split for reporting |
| **Scalability**        | Per-machine config                                  | Automatic for any machine                                                   | New SKU per machine variant                            |
| **Dev effort**         | Medium                                              | None                                                                        | Low (but operational overhead per variant)             |

The PDP, PLP, and all marketing materials can use "50% off" regardless of which option is chosen. The difference is cart display, return handling, and reporting.

If Option A, three sub-approaches:

| Sub-option | Approach |
|------------|----------|
| A1 | Adapt existing soft bundle logic for fixed-price components |
| A2 | Build new pricing logic |
| A3 | Hardcode for MVP (single SKU, single market) |

---

## 2. Discount Delivery Mechanism

How does the customer receive and redeem their coffee value on beanz.com?

| Criteria                   | A: GiveX Gift Card                                                | B: Fixed Bag Discount Code                                                                                                                             | C: Value Cap Code                                                                                     | D: Credit/Points                               |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **How it works**           | Preloaded digital gift card issued post-checkout                  | Subscription discount code: 100% off per order for X free bags (e.g., £1,077 ÷ £10 = 107 small bags)                                                   | Subscription discount code: 100% off per order until £1,077 value exhausted                           | Credit loaded into Beanz account, auto-applied |
| **Existing integration**   | Yes — GiveX in cart/checkout                                      | Yes — existing Voucherify capability                                                                                                                   | No — not done before in Voucherify, extra dev required                                                | No — new build required                        |
| **Restrict to beanz.com**  | No — works cross-brand (Sage/Breville/Beanz)                      | Yes                                                                                                                                                    | Yes                                                                                                   | Yes                                            |
| **Customer flexibility**   | Full — any beans, any time, no subscription required              | Requires active beanz.com subscription<br><br>Discount code will only work for a single small bags subscription.<br><br>Customer cannot change coffee. | Requires active beanz.com subscription<br><br>Discount code will only work for a single subscription. | Full — any beans, any time                     |
| **Return/cancel scenario** | "Total loss" — funds irrecoverable from GiveX                     | Code deactivated — no loss                                                                                                                             | Code deactivated — no loss                                                                            | Credit revoked — no loss                       |
| **Misuse risk**            | Customer could buy a machine with the gift card instead of coffee | Restricted to coffee                                                                                                                                   | Restricted to coffee                                                                                  | Restricted to coffee                           |
| **Variable bag prices**    | Handled — spend any amount                                        | Bag count fixed regardless of price chosen                                                                                                             | Handled — draws down by actual order value                                                            | Handled — draws down by actual order value     |
| **Customer messaging**     | "£1,077 gift card"                                                | "107 free bags"                                                                                                                                        | "£1,077 coffee credit"                                                                                | "£1,077 coffee credit"                         |
| **MVP feasibility**        | Can manage manually for low-volume pilot                          | Can manage manually for low-volume pilot                                                                                                               | Extra dev needed — not ideal for MVP                                                                  | Not viable for MVP                             |


---

## 3. Klarna Payment Integration

This bundle uses a different Klarna structure than today's standard purchases.

| Aspect                 | Today (standard)      | Operation Freedom                       |
| ---------------------- | --------------------- | --------------------------------------- |
| **Interest**           | Standard Klarna rates | 0% APR                                  |
| **Merchant fee**       | Standard              | Different structure                     |
| **Merchant of Record** | Breville              | Klarna                                  |
| **Payment capture**    | Standard              | Full bundle value as single transaction |
| **Term**               | Standard              | Fixed 24 months                         |

### Payment flow

1. Customer adds bundle to cart → selects Klarna → credit assessment
2. If approved: first £58 payment captured, order confirmed
3. Klarna reimburses Breville for full bundle value upfront (net of fees)
4. Customer pays Klarna £58/mo for remaining 23 months
5. Post-checkout: Coffee Credit issued (mechanism per section 2)

### Open items

| Item                                             | Status                      |
| ------------------------------------------------ | --------------------------- |
| Same Klarna agreement or new?                    | Investigating               |
| Existing Adyen pipeline or separate integration? | Investigating               |
| Actual zero-interest merchant fee?               | Awaiting confirmation       |
| Can financing be restricted to bundle SKU only?  | Adyen confirmed, Klarna TBC |
| Digital on-ramp program alignment?               | To request walkthrough      |

---

## 4. FTBP Safeguards

Both [[ftbp|FTBP v2]] and Operation Freedom give 25% off beans. A customer must not receive both.

| Safeguard         | Requirement                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **At purchase**   | Bundle purchase must not trigger FTBP machine registration                                |
| **Post-purchase** | Customer cannot register the bundled machine for FTBP separately                          |
| **Detection**     | Operation Freedom customers flagged in Salesforce/Chargebee, excluded from FTBP campaigns |

### Edge cases

| Scenario                                                          | Resolution needed           | Answer |
| ----------------------------------------------------------------- | --------------------------- | ------ |
| Customer already has active FTBP discount from a previous machine | Can they buy the bundle?    | Yes    |
| Customer exhausts Coffee Credit, then registers machine for FTBP  | Should this be allowed?     | No     |
| Customer returns machine but has remaining Coffee Credit balance  | What happens to the credit? | TBC    |

---

## Open Decisions

| #   | Decision                     | Options                                                 | Priority     |
| --- | ---------------------------- | ------------------------------------------------------- | ------------ |
| 1   | Discount delivery mechanism  | GiveX / Promo code / Credit system                      | **Critical** |
| 2   | Bundle pricing display       | Soft fixed split / Soft proportional / Hard bundle      | High         |
| 3   | Klarna integration structure | Existing pipeline / Separate agreement                  | High         |
| 4   | Coffee credit value & monthly price | See below — cadence-based calc (£1,040 / £56.46/mo) vs current designs (£1,077 / £58/mo) | **Critical** |
| 5   | Promo code exclusion scope   | All promos blocked / Specific promos only               | Medium       |
| 6   | FTBP double-dip prevention   | Technical block / Process-based / Both                  | Medium       |

### Decision 4: Coffee credit value

The "2 bags every 2 weeks for 2 years at £10/bag" cadence (based on Barista's Choice 200–225g small bag) produces **104 bags × £10 = £1,040**, not the £1,077 used in current UX designs.

| | Cadence-based | Current designs |
|---|---|---|
| **Basis** | 2 bags × 52 deliveries × £10 | Reverse-engineered to hit £1,392 total |
| **Coffee credit** | £1,040 | £1,077 |
| **Bundle total** | £1,355 | £1,392 |
| **Monthly** | £56.46/mo | £58.00/mo |

**To clarify with Ziv, Andrew, Ali:** Is £58/mo the locked price point, or should we recalculate from the delivery cadence? If £58/mo is locked, what is the basis for the coffee credit value?
