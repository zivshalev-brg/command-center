# Beanz ID Prefix Conventions

**Version:** 1.0
**Status:** Active
**Last Updated:** 2025-01-27

---

## Table of Contents

- [Overview](#overview)
- [Complete Prefix Reference](#complete-prefix-reference)
- [Naming Conventions](#naming-conventions)
- [Domain Ranges](#domain-ranges-reserved-prefixes)
- [File Naming Conventions](#file-naming-conventions)
- [Usage Examples](#usage-examples)
- [Relationship Verbs](#relationship-verbs-allowed)
- [Migration Path](#migration-path)
- [Governance](#governance)
- [FAQs](#faqs)
- [Tools & Automation](#tools--automation)

## Overview

All artifacts in the Beanz ecosystem use stable, hierarchical IDs for traceability, AI-friendly documentation, and cross-system reference. IDs follow a consistent pattern: **PREFIX + numeric hierarchy + optional slug**.

**Key Principles:**
- **Stable:** IDs never change or get reused (even when deprecated)
- **Hierarchical:** Numeric dots indicate parent-child relationships (X.Y or X.Y.Z)
- **Consistent:** All IDs use dash separator (PREFIX-## or PREFIX-X.Y)
- **Traceable:** Link across artifacts (Feature â†’ Page â†’ API â†’ Event â†’ KPI)
- **Tool-agnostic:** Works in Jira, Confluence, CSV, markdown, code comments, diagrams

---

## Complete Prefix Reference

### Core Artifacts

| Prefix | Entity | Pattern | Example | Beanz Context |
|--------|--------|---------|---------|---------------|
| **DOC** | Discovery Document (legacy) | DOC-XX.Y | `DOC-01.1 System Components` | **Legacy/historical format** from the requirements-discovery project. Not used in current KB files. |
| **P** | Page/Screen | P-X.Y | `P-02.2 Checkout` | Web pages, mobile screens, RCC/BCC portal pages |
| **F** | Feature/Capability | F-X.Y | `F-05.1 Roaster Allocation` | Platform features, BaaS services, product capabilities |
| **R** | Rule/Policy | R-X.Y | `R-5.1 No Repeat Roaster` | Business logic, allocation rules, compliance policies |
| **SEG** | Customer Segment | SEG-X.Y.Z | `SEG-1.4.2 Active Subscriber (Experienced)` | Lifecycle segments with experience levels (Novice/Experienced) |
| **COH** | Customer Cohort | COH-X.Y | `COH-2.1 FTBP v1 Cohort` | Time-based or program-based customer groupings for analytics |
| **REQ** | Generic Requirement | REQ-### | `REQ-042 Multi-currency support` | Fallback for uncategorized requirements |

### Communication Artifacts

| Prefix | Entity | Pattern | Example | Beanz Context |
|--------|--------|---------|---------|---------------|
| **E** | Email | E-X.Y | `E-03.1 Order Confirmation` | Transactional emails (Cordial, Marketing Cloud) |
| **N** | Notification | N-X.Y | `N-03.1 Push: Order Shipped` | Push notifications, SMS, in-app alerts |
| **M** | Modal/Dialog | M-X.Y | `M-4.1 Address Picker` | UI overlays, confirmation dialogs, popups |

### Technical Artifacts

| Prefix | Entity | Pattern | Example | Beanz Context |
|--------|--------|---------|---------|---------------|
| **A** | API Endpoint | A-X.Y | `A-7.3 POST /orders/create` | AWS microservices, BCC APIs, PBB integrations |
| **EV** | Event | EV-## | `EV-2 order.created` | Event-driven architecture, webhooks, AsyncAPI |
| **W** | Workflow/Job | W-X.Y | `W-4.1 BLP Fulfillment` | Backend processes, batch jobs, automation workflows |

### Design & Measurement

| Prefix | Entity | Pattern | Example | Beanz Context |
|--------|--------|---------|---------|---------------|
| **C** | Component | C-X.Y | `C-1.2 Button Primary` | React components, design system, BaaS widgets |
| **KPI** | Metric | KPI-## | `KPI-1 Checkout Conversion` | Success metrics (MRR, Churn, LTV, Mixpanel/Databricks) |

### Special Purpose

| Prefix | Entity | Pattern | Example | Beanz Context |
|--------|--------|---------|---------|---------------|
| **ADR** | Architecture Decision | ADR-### | `ADR-001 Auth0 Migration` | Major technical/strategic decisions |
| **TEST** | Test Case/Suite | TEST-## | `TEST-23 Cross-border Flow` | Test scenarios, acceptance tests, QA cases |
| **VOC** | Voice of Customer Theme | VOC-## | `VOC-1 Subscription Confusion` | Customer pain themes from tickets/surveys |

---

## Naming Conventions

### General Rules

**ID Format:**
- Uppercase prefix letters: `P`, `F`, `DOC` (not `p`, `f`, `doc`)
- All IDs use dash separator: `P-02.2`, `F-05.1`, `DOC-01.3`, `EV-2`, `KPI-1`
- Numeric hierarchy with dots for hierarchical artifacts: `P-02.2`, `F-05.1`
- Flat numbering for non-hierarchical artifacts: `EV-2`, `KPI-1`, `VOC-1`
- No special characters except hyphens and dots

**Optional Slug:**
- Lowercase with hyphens: `P-02.2-checkout`, `F-05.1-roaster-allocation`
- Used in filenames, human-readable references
- Not part of canonical ID

**Examples:**
- âœ… Canonical ID: `P-02.2`
- âœ… With slug: `P-02.2 Checkout` (in documentation)
- âœ… In filename: `P-02.2-checkout.md`
- âŒ Wrong: `P-02.2`, `P2.2`, `P2-2`

### Hierarchical Numbering

**Pattern:** `PREFIX-X.Y[.Z]`

- **X** = Domain/category number
- **Y** = Sequence within domain
- **Z** = Optional sub-item (rare, use sparingly)

**Examples:**
- `F-05.1`, `F-05.2`, `F-05.3` = All in "Fulfillment & Allocation" domain (F-05.x)
- `P-02.0`, `P-02.1`, `P-02.2` = All in "Purchase Flow" section (P-02.x)
- `A-7.1`, `A-7.2`, `A-7.3` = All Payment Service endpoints (A-7.x)

**Reserve .0 for parent/overview:**
- `F-05.0` = Fulfillment & Allocation (parent feature)
- `F-05.1` = Roaster Allocation Rule (child)
- `F-05.2` = BLP White-label Fulfillment (child)

---

## Domain Ranges (Reserved Prefixes)

### Pages (P-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **P-01.x** | Discovery & Browse | P-01.0 Homepage, P-01.1 Search Results, P-01.2 Coffee Quiz, P-01.8 Large Bags PLP |
| **P-02.x** | Purchase Flow | P-02.0 Cart, P-02.1 Checkout Info, P-02.2 Checkout Payment, P-02.3 Order Confirmation |
| **P-03.x** | Account Management | P-03.0 My Account, P-03.1 Profile, P-03.2 My Subscriptions, P-03.3 Order History |
| **P-04.x** | eGift Cards | P-04.0 Gift Card Hub, P-04.1 Purchase Gift Card, P-04.2 Redeem Gift Card |
| **P-05.x** | Promotions | P-05.0 Offers Hub, P-05.1 Campaign Landing Page, P-05.2 Promo Code Entry |
| **P-06.x** | Support & Service | P-06.0 Contact Us, P-06.1 FAQs, P-06.2 Returns Portal, P-06.3 Live Chat |
| **P-07.x** | Content & Education | P-07.0 Brew Guides, P-07.1 Roaster Stories, P-07.2 Coffee Education |
| **P-08.x** | Legal & Compliance | P-08.0 Terms of Service, P-08.1 Privacy Policy, P-08.2 Cookie Policy |
| **P-09.x** | Navigation & Utility | P-09.0 Site Map, P-09.1 404 Error, P-09.2 Maintenance Page |
| **P-10.x** | BCC Portal (B2B) | P-10.0 BCC Dashboard, P-10.1 SKU Management, P-10.2 Order Visibility |
| **P-11.x** | Roaster Portal | P-11.0 Roaster Dashboard, P-11.1 Inventory Management, P-11.2 Analytics |

### Features (F-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **F-01.x** | Account & Authentication | F-01.0 User Account, F-01.1 Login, F-01.2 Registration, F-01.3 Password Reset |
| **F-02.x** | Product Discovery | F-02.0 Search, F-02.1 Coffee Quiz, F-02.2 Barista's Choice, F-02.3 Recommendations |
| **F-03.x** | Subscriptions | F-03.0 Subscription Base, F-03.1 Frequency Management, F-03.2 Swaps, F-03.3 Pause/Cancel |
| **F-04.x** | Checkout & Payments | F-04.0 Cart, F-04.1 Checkout Flow, F-04.2 Multi-currency, F-04.3 Adyen Integration |
| **F-05.x** | Fulfillment & Allocation | F-05.0 Fulfillment, F-05.1 Roaster Allocation, F-05.2 BLP Fulfillment, F-05.3 Volume Balancing |
| **F-06.x** | Roaster Operations (B2B) | F-06.0 BCC Platform, F-06.1 Roaster Onboarding, F-06.2 SKU Management, F-06.3 Invoicing |
| **F-07.x** | PBB Integrations | F-07.0 PBB Platform, F-07.1 Headless APIs, F-07.2 Widgets, F-07.3 Partner Onboarding |
| **F-08.x** | Personalization | F-08.0 CDP Integration, F-08.1 Recommendations, F-08.2 Segmentation, F-08.3 A/B Testing |
| **F-09.x** | Marketing & Engagement | F-09.0 Campaigns, F-09.1 Beanz Offers, F-09.2 Voucherify, F-09.3 Gamification |
| **F-10.x** | Cross-Border | F-10.0 Cross-Border Base, F-10.1 NLâ†’DE Shipping, F-10.2 Multi-currency, F-10.3 Compliance |
| **F-11.x** | Analytics & Reporting | F-11.0 Analytics Platform, F-11.1 Dashboards, F-11.2 KPI Tracking, F-11.3 Exports |
| **F-12.x** | IOT & Connected Devices | F-12.0 IOT Platform, F-12.1 Appliance Registration, F-12.2 Usage Tracking |
| **F-13.x** | AI & Agentic Tools | F-13.0 MCP Framework, F-13.1 Chatbots, F-13.2 AI Recommendations |
| **F-14.x** | Platform Infrastructure | F-14.0 BaaS Core, F-14.1 API Gateway, F-14.2 Widget Framework, F-14.3 Multi-tenancy |

### APIs (A-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **A-1.x** | Authentication & Identity | A-1.1 POST /auth/login, A-1.2 POST /auth/register, A-1.3 POST /auth/refresh |
| **A-2.x** | Customer Service | A-2.1 GET /customers/{id}, A-2.2 PATCH /customers/{id}, A-2.3 GET /customers/{id}/orders |
| **A-3.x** | Product Service | A-3.1 GET /products, A-3.2 GET /products/{id}, A-3.3 POST /products/search |
| **A-4.x** | Order Service | A-4.1 POST /orders/create, A-4.2 GET /orders/{id}, A-4.3 PATCH /orders/{id}/status |
| **A-5.x** | Subscription Service | A-5.1 POST /subscriptions, A-5.2 PATCH /subscriptions/{id}/frequency, A-5.3 POST /subscriptions/{id}/pause |
| **A-6.x** | Roaster Service (BCC) | A-6.1 POST /roasters/onboard, A-6.2 POST /roasters/{id}/skus, A-6.3 GET /roasters/{id}/orders |
| **A-7.x** | Payment Service | A-7.1 POST /payments/create, A-7.2 POST /payments/{id}/capture, A-7.3 POST /payments/refund |
| **A-8.x** | Fulfillment Service | A-8.1 POST /fulfillment/allocate, A-8.2 POST /fulfillment/label, A-8.3 GET /fulfillment/{id}/tracking |
| **A-9.x** | Inventory Service | A-9.1 GET /inventory/available, A-9.2 PATCH /inventory/{sku}, A-9.3 POST /inventory/reserve |
| **A-10.x** | PBB Integration APIs | A-10.1 GET /pbb/products, A-10.2 POST /pbb/orders, A-10.3 GET /pbb/inventory |

### Events (EV-##)

| ID | Event Name | Description |
|----|------------|-------------|
| **EV-1** | customer.registered | New customer account created |
| **EV-2** | order.created | Order placed successfully |
| **EV-3** | order.shipped | Order dispatched from fulfillment |
| **EV-4** | order.delivered | Order delivered to customer |
| **EV-5** | subscription.created | New subscription started |
| **EV-6** | subscription.updated | Subscription modified (frequency, products) |
| **EV-7** | subscription.paused | Subscription temporarily paused |
| **EV-8** | subscription.cancelled | Subscription permanently cancelled |
| **EV-9** | payment.succeeded | Payment processed successfully |
| **EV-10** | payment.failed | Payment failed (card declined, etc.) |
| **EV-11** | inventory.updated | Inventory levels changed |
| **EV-12** | allocation.completed | Roaster allocation finalized |
| **EV-13** | fulfillment.requested | Fulfillment job initiated |
| **EV-14** | fulfillment.completed | Fulfillment completed |
| **EV-15** | roaster.onboarded | New roaster partner activated |
| **EV-16** | sku.created | New product SKU added |
| **EV-17** | cart.abandoned | Cart not converted after 24h |

### Workflows (W-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **W-1.x** | Customer Onboarding | W-1.1 Welcome Flow, W-1.2 Email Verification, W-1.3 Profile Completion |
| **W-2.x** | Order Processing | W-2.1 Order Validation, W-2.2 Payment Processing, W-2.3 Order Confirmation |
| **W-3.x** | Subscription Billing | W-3.1 Recurring Billing Cycle, W-3.2 Payment Retry, W-3.3 Dunning Management |
| **W-4.x** | Fulfillment | W-4.1 BLP Label Generation, W-4.2 Roaster Assignment, W-4.3 Shipment Tracking |
| **W-5.x** | Allocation | W-5.1 Roaster Selection Algorithm, W-5.2 Variety Engine, W-5.3 Inventory Balancing |
| **W-6.x** | Roaster Onboarding | W-6.1 Partner Registration, W-6.2 SKU Import, W-6.3 Approval Workflow |
| **W-7.x** | Cross-Border Processing | W-7.1 Tax Calculation, W-7.2 Customs Documentation, W-7.3 Cross-border Shipping |
| **W-8.x** | Data Sync | W-8.1 ERP Sync (D365), W-8.2 CRM Sync (Salesforce), W-8.3 Analytics Sync (Databricks) |

### Customer Segments (SEG-X.Y.Z)

**Pattern:** SEG-1.X.Y where:
- **1** = B2C Lifecycle-Experience matrix (B2B segments would use SEG-2.x)
- **X** = Lifecycle stage (1-8)
- **Y** = Experience level (1=Novice, 2=Experienced)

| ID | Segment Name | Experience Level | Description |
|----|--------------|------------------|-------------|
| **SEG-1.1.1** | New Customer (Novice) | Novice | First-time visitor, no coffee knowledge, needs education |
| **SEG-1.1.2** | New Customer (Experienced) | Experienced | First-time on platform but coffee-savvy, wants efficiency |
| **SEG-1.2.1** | Trialist (Novice) | Novice | Active trial, learning coffee preferences, needs brew help |
| **SEG-1.2.2** | Trialist (Experienced) | Experienced | Active trial, knows preferences, wants quick setup |
| **SEG-1.3.1** | New Subscriber (Novice) | Novice | First 2 deliveries, learning subscription tools |
| **SEG-1.3.2** | New Subscriber (Experienced) | Experienced | First 2 deliveries, familiar with subscriptions |
| **SEG-1.4.1** | Active Subscriber (Novice) | Novice | 3+ deliveries, still learning, needs ongoing education |
| **SEG-1.4.2** | Active Subscriber (Experienced) | Experienced | 3+ deliveries, self-sufficient, wants personalization |
| **SEG-1.5.1** | Loyalist (Novice) | Novice | 6+ months, consistent orders, developed preferences |
| **SEG-1.5.2** | Loyalist (Experienced) | Experienced | 6+ months, enthusiast level, explores variety |
| **SEG-1.6.1** | At Risk (Novice) | Novice | Paused/disrupted, needs re-engagement and support |
| **SEG-1.6.2** | At Risk (Experienced) | Experienced | Paused/disrupted, needs value reminder |
| **SEG-1.7.1** | Inactive (Novice) | Novice | 3+ months no order, was subscriber, needs win-back |
| **SEG-1.7.2** | Inactive (Experienced) | Experienced | 3+ months no order, was subscriber, needs incentive |
| **SEG-1.8.1** | Trial Not Converted (Novice) | Novice | Took free trial but never paid, needs barrier removal |
| **SEG-1.8.2** | Trial Not Converted (Experienced) | Experienced | Took free trial but never paid, needs value demonstration |

**Segment Transitions:**
- New Customer (SEG-1.1) â†’ Trialist (SEG-1.2) via first order
- Trialist (SEG-1.2) â†’ New Subscriber (SEG-1.3) via subscription creation
- New Subscriber (SEG-1.3) â†’ Active Subscriber (SEG-1.4) via 90 days + 3+ orders
- Active Subscriber (SEG-1.4) â†’ Loyalist (SEG-1.5) via 6+ months + consistent engagement
- Any active segment â†’ At Risk (SEG-1.6) via pause/disruption
- At Risk (SEG-1.6) â†’ Inactive (SEG-1.7) via 90+ days no activity
- Trialist (SEG-1.2) â†’ Trial Not Converted (SEG-1.8) via trial ended, no paid order

**Experience Level Indicators:**
- **Novice (.1):** New to specialty coffee, needs education, guidance, brew help, product intro
- **Experienced (.2):** Coffee enthusiast, knows preferences, wants efficiency, personalization

### Customer Cohorts (COH-X.Y)

**Pattern:** COH-X.Y where X = cohort category, Y = specific cohort

Cohorts are **fixed groupings** that never change (unlike segments which reflect current state). Used for comparative analytics and cohort-specific messaging.

| Range | Domain | Examples | Usage |
|-------|--------|----------|-------|
| **COH-1.x** | Market Entry Cohorts | COH-1.1 AU Launch, COH-1.2 UK Launch, COH-1.3 US Launch, COH-1.4 DE Launch, COH-1.5 NL Launch (July 2026) | Track performance by market launch wave |
| **COH-2.x** | Program Cohorts | COH-2.1 FTBP v1 (Cashback), COH-2.2 FTBP v2 (Discount), COH-2.3 Campaign X | Compare promotional program effectiveness |
| **COH-3.x** | Appliance Acquisition | COH-3.1 Breville Owners, COH-3.2 Sage Owners, COH-3.3 Baratza Owners, COH-3.4 Lelit Owners, COH-3.5 Multi-Appliance | Analyze by BRG appliance ownership |
| **COH-4.x** | Channel Cohorts | COH-4.1 Direct Website, COH-4.2 BRG Brand Referral, COH-4.3 PBB Partner, COH-4.4 Gift Recipient | Track acquisition channel performance |

**Key Distinction:**
- **Segments (SEG)** = Current behavioral state (changes over time)
- **Cohorts (COH)** = Acquisition/enrollment context (never changes)

**Multi-Cohort Membership:**
A customer can belong to multiple cohorts simultaneously:
- COH-1.5 (NL Launch) + COH-2.2 (FTBP v2) + COH-3.1 (Breville Owner)

### Rules (R-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **R-1.x** | Authentication & Security | R-1.1 Password Complexity, R-1.2 Session Timeout, R-1.3 Multi-factor Auth |
| **R-2.x** | Payment & Billing | R-2.1 Minimum Order Value, R-2.2 Payment Method Restrictions, R-2.3 Refund Policy |
| **R-3.x** | Subscription Management | R-3.1 Minimum Subscription Duration, R-3.2 Pause Limits, R-3.3 Cancellation Window |
| **R-4.x** | Tax & Compliance | R-4.1 VAT Calculation (EU), R-4.2 GST Calculation (AU), R-4.3 Sales Tax (US) |
| **R-5.x** | Allocation Logic | R-5.1 No Repeat Roaster (3 deliveries), R-5.2 Variety Requirements, R-5.3 Fallback to Bestseller |
| **R-6.x** | Inventory Management | R-6.1 Stock Reservation, R-6.2 Low Stock Threshold, R-6.3 Out-of-Stock Substitution |
| **R-7.x** | Roaster Eligibility | R-7.1 Quality Standards, R-7.2 Volume Commitments, R-7.3 Partnership Tiers |
| **R-8.x** | Cross-Border Shipping | R-8.1 Shipping Restrictions, R-8.2 Customs Value Limits, R-8.3 Prohibited Items |

### Emails (E-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **E-01.x** | Account & Authentication | E-01.1 Welcome Email, E-01.2 Password Reset, E-01.3 Email Verification |
| **E-02.x** | Order Lifecycle | E-02.1 Order Confirmation, E-02.2 Order Shipped, E-02.3 Order Delivered |
| **E-03.x** | Subscription Management | E-03.1 Subscription Created, E-03.2 Subscription Paused, E-03.3 Subscription Cancelled |
| **E-04.x** | Payment & Billing | E-04.1 Invoice, E-04.2 Payment Failed, E-04.3 Payment Retry Reminder |
| **E-05.x** | Marketing | E-05.1 Newsletter, E-05.2 Campaign Offer, E-05.3 Product Launch |
| **E-06.x** | Roaster Communications | E-06.1 Roaster Onboarding, E-06.2 Order Notification, E-06.3 Payment Reconciliation |
| **E-07.x** | Support & Service | E-07.1 Support Ticket Created, E-07.2 Support Ticket Resolved, E-07.3 Feedback Request |

### Notifications (N-X.Y)

| Range | Domain | Examples |
|-------|--------|----------|
| **N-01.x** | Order Updates | N-01.1 Order Confirmed, N-01.2 Order Shipped, N-01.3 Delivery Today |
| **N-02.x** | Subscription Alerts | N-02.1 Upcoming Delivery, N-02.2 Payment Failed, N-02.3 Subscription Expiring |
| **N-03.x** | Promotional | N-03.1 Special Offer, N-03.2 New Roaster, N-03.3 Limited Edition |
| **N-04.x** | Account Activity | N-04.1 Login From New Device, N-04.2 Password Changed, N-04.3 Profile Updated |

### KPIs (Key Performance Indicators)

| ID | Metric Name | Description | Source |
|----|-------------|-------------|--------|
| **KPI-1** | Checkout Conversion Rate | % of carts that complete checkout | Mixpanel, Databricks |
| **KPI-2** | Subscription Conversion Rate | % of visitors who start subscription | Mixpanel |
| **KPI-3** | MRR (Monthly Recurring Revenue) | Total recurring revenue per month | Chargebee, Databricks |
| **KPI-4** | Churn Rate | % of subscriptions cancelled per month | Chargebee, Databricks |
| **KPI-5** | LTV (Lifetime Value) | Average customer lifetime value | Databricks |
| **KPI-6** | Add-to-Cart Rate | % of visitors who add to cart | Mixpanel |
| **KPI-7** | Cart Abandonment Rate | % of carts not converted | Mixpanel |
| **KPI-8** | NPS (Net Promoter Score) | Customer satisfaction score | Surveys, Zendesk |
| **KPI-9** | Roaster Retention Rate | % of roasters remaining active | Salesforce, BCC |
| **KPI-10** | Cross-Border Conversion | % of NLâ†’DE orders vs total NL | Mixpanel, Databricks |
| **KPI-11** | Average Order Value (AOV) | Average transaction value | Mixpanel, Databricks |
| **KPI-12** | Subscription Duration | Average months before churn | Chargebee, Databricks |

---

## File Naming Conventions

### Pattern: `{ID}-{slug}.md`

**Examples:**
- `P-02.2-checkout.md`
- `F-05.1-roaster-allocation.md`
- `DOC-01.1-system-components.md`
- `R-5.1-no-repeat-roaster.md`
- `E-03.1-order-confirmation.md`
- `A-7.3-create-order.md`

### Directory Structure

```
/docs
  /pages           P-X.Y-{slug}.md
  /features        F-X.Y-{slug}.md
  /emails          E-X.Y-{slug}.md
  /notifications   N-X.Y-{slug}.md
  /components      C-X.Y-{slug}.md
  /rules           R-X.Y-{slug}.md
  /workflows       W-X.Y-{slug}.md
  /segments        SEG-X.Y.Z-{slug}.md
  /cohorts         COH-X.Y-{slug}.md
  /apis            openapi.yaml (with A-X.Y mapping)
  /events          asyncapi.yaml (with EV-## mapping)
  /kpis            KPI-##-{slug}.md
  /voc             VOC-##-{slug}.md
/requirements-discovery
  /discovery       DOC-XX.Y-{slug}.md
/relations
  edges.csv        (relationships between IDs)
/catalog.csv       (all artifacts in one index)
```

---

## Usage Examples

### In YAML Front-Matter

**Page:**
```yaml
---
id: P-02.2
type: page
title: Checkout
status: live
owner: Web UX Team
tags: [checkout, payments, purchase-flow]
relations:
  - { relation: calls, target_id: A-7.3, notes: "Create order API" }
  - { relation: impacts, target_id: KPI-1, notes: "Checkout conversion" }
---
```

**Feature:**
```yaml
---
id: F-05.1
type: feature
title: Roaster Allocation Rule
status: review
owner: Subscriptions Team
tags: [allocation, variety, subscriptions]
relations:
  - { relation: impacts, target_id: P-03.2, notes: "Affects subscription page" }
  - { relation: depends_on, target_id: R-5.1, notes: "Uses repeat prevention rule" }
  - { relation: emits, target_id: EV-12, notes: "Allocation completed event" }
acceptance:
  - "Given X=3 deliveries lookback, when selecting roaster, then exclude roasters from last X deliveries unless override=true"
  - "Given no eligible roasters available, when allocation runs, then fallback to bestseller"
api_refs: ["/allocations/create"]
event_refs: ["allocation.completed"]
---
```

**Discovery:**
```yaml
---
doc_id: DOC-01.3
title: Technical Challenges & Dependencies
description: Critical blockers including data model flexibility, variant management, and auth standardization
status: complete
owner: Platform Team
tags: [domain:strategy, domain:architecture, phase:discovery]
source_of_truth: markdown
last_updated: 2025-01-27
---
```

**Email with Segment/Cohort Targeting:**
```yaml
---
id: E-03.2
type: email
title: Upcoming Subscription Order Reminder
status: live
owner: Lifecycle Marketing
tags: [email, subscription, reminder]
target_segments:
  - SEG-1.3.1  # New Subscribers (Novice) - need more education
  - SEG-1.3.2  # New Subscribers (Experienced)
  - SEG-1.4.1  # Active Subscribers (Novice)
  - SEG-1.4.2  # Active Subscribers (Experienced)
exclude_segments:
  - SEG-1.6.x  # At Risk (may find reminders annoying)
  - SEG-1.7.x  # Inactive (not subscribed)
cohorts_applicable:
  - COH-2.1    # FTBP v1: Include cashback balance reminder
  - COH-2.2    # FTBP v2: Include discount savings summary
content_variations:
  novice: "What to expect section, how to modify order, brew guides"
  experienced: "Minimal text, prominent CTA buttons, quick actions"
relations:
  - { relation: consumes, target_id: EV-6, notes: "Triggered by subscription.updated event" }
  - { relation: targets, target_id: SEG-1.3.x, notes: "Primary segment: new subscribers" }
  - { relation: varies_by, target_id: COH-2.1, notes: "Cashback messaging variant" }
---
```

### In Relationships (edges.csv)

```csv
source_id,relation,target_id,notes
F-05.1,depends_on,R-5.1,Allocation uses repeat prevention rule
F-05.1,impacts,P-03.2,Affects subscription management page
P-03.2,calls,A-5.1,Page calls subscription API
A-5.1,emits,EV-6,API emits subscription.updated event
EV-6,triggers,E-03.2,Event triggers subscription updated email
F-05.1,measures,KPI-4,Allocation affects churn rate
DOC-01.3,blocks,F-05.2,Variant management issue blocks feature
VOC-1,impacts,P-03.2,Subscription confusion affects this page
```

### In Catalog (catalog.csv)

```csv
id,type,title,owner,status,tags,url_or_ref
DOC-01.3,discovery,Technical Challenges,Platform,complete,"strategy;blockers",requirements-discovery/beanz-framework/discovery/DOC-01-strategy-vision/DOC-01.3-technical-challenges.md
P-02.2,page,Checkout,Web UX,live,"checkout;payments",https://beanz.com/checkout
F-05.1,feature,Roaster Allocation,Subscriptions,review,"allocation;variety",docs/features/F-05.1-roaster-allocation.md
R-5.1,rule,No Repeat Roaster,Subscriptions,approved,"allocation;rules",docs/rules/R-5.1-no-repeat-roaster.md
A-5.1,api,PATCH /subscriptions/frequency,Platform,live,"api;subscriptions",/subscriptions/{id}/frequency
EV-6,event,subscription.updated,Platform,live,"events;subscriptions",subscription/updated
E-03.2,email,Subscription Updated,Lifecycle,live,"email;subscriptions",cordial://templates/sub-updated
KPI-4,kpi,Churn Rate,Analytics,live,"metrics;subscriptions",databricks://dashboards/churn
VOC-1,voc_theme,Subscription Confusion,UX Research,complete,"voc;subscriptions",requirements-discovery/voc/VOC-1-subscription-confusion.md
```

### In Code Comments

```javascript
/**
 * Roaster Allocation Engine
 * Feature: F-05.1 Roaster Allocation Rule
 * Rule: R-5.1 No Repeat Roaster in 3 Deliveries
 * Emits: EV-12 allocation.completed
 * Calls: A-9.1 GET /inventory/available
 */
async function allocateRoaster(subscriptionId, deliveryNumber) {
  // Implementation
}
```

### In Jira Stories

**Story Title:**
```
[F-05.1] Implement Roaster Allocation Rule
```

**Story Description:**
```
Feature ID: F-05.1
Related Rule: R-5.1
Impacted Pages: P-03.2
API Endpoints: A-5.1
Events Emitted: EV-12
KPIs Affected: KPI-4 (Churn Rate)
Addresses: VOC-1 (Subscription confusion)

As a subscription customer
When my next delivery is allocated
I want to receive a different roaster than my last 3 deliveries
So I can experience variety in my subscription
```

---

## Relationship Verbs (Allowed)

Use these standardized verbs in `edges.csv` and YAML `relations`:

| Verb | Meaning | Example |
|------|---------|---------|
| **blocks** | X prevents Y from being implemented | `DOC-01.3 blocks F-05.2` (variant management issue) |
| **depends_on** | X requires Y to exist first | `F-05.1 depends_on R-5.1` (feature needs rule) |
| **impacts** | X affects Y | `F-05.1 impacts P-03.2` (feature changes page) |
| **addresses** | X solves/mitigates Y | `F-05.1 addresses VOC-1` (feature fixes customer pain) |
| **calls** | X invokes Y (API/service) | `P-02.2 calls A-7.3` (page calls API) |
| **emits** | X generates Y (event) | `A-7.3 emits EV-2` (API emits event) |
| **consumes** | X subscribes to Y (event) | `E-03.1 consumes EV-2` (email triggered by event) |
| **triggers** | X initiates Y (workflow/email) | `EV-2 triggers E-02.1` (event triggers email) |
| **uses** | X leverages Y (component/service) | `P-02.2 uses C-1.2` (page uses component) |
| **measures** | X tracks Y (KPI) | `F-03.1 measures KPI-3` (feature affects MRR) |
| **includes** | X contains Y | `F-05.0 includes F-05.1` (parent feature contains child) |
| **is_part_of** | Y is part of X (inverse of includes) | `F-05.1 is_part_of F-05.0` |

**Anti-patterns (avoid):**
- âŒ Generic verbs: "relates to", "associated with", "linked to"
- âŒ Ambiguous verbs: "needs", "has", "contains" (use specific verbs above)

---

## Migration Path

### DOC-XX.Y Format (Legacy)

The `DOC-XX.Y` prefix was used during the original requirements-discovery project phase. In the current beanz-knowledge-base, files use descriptive names without ID prefixes (e.g., `system-components.md` not `DOC-01.1-system-components.md`).

### Active Prefixes

The following ID prefixes are actively used in KB documentation for referencing entities:
- `F-X.Y` - Features and capabilities
- `P-X.Y` - Pages and screens
- `SEG-X.Y.Z` - Customer segments
- `COH-X.Y` - Customer cohorts
- `E-X.Y` - Emails
- `R-X.Y` - Rules and policies

### Adopt as Needed

Additional prefixes are available for use when documentation scope expands:
- `A-X.Y` - API endpoints
- `EV-##` - Events
- `W-X.Y` - Workflows
- `N-X.Y` - Notifications
- `C-X.Y` - Components
- `M-X.Y` - Modals/dialogs
- `KPI-##` - Metrics
- `ADR-###` - Architecture decisions
- `TEST-##` - Test cases

---

## Governance

### Ownership Rules

**Who Assigns IDs:**
- Product team assigns `F#.#` (features) and `P#.#` (pages)
- Engineering assigns `A#.#` (APIs), `EV#` (events), `W#.#` (workflows)
- UX assigns `C#.#` (components), `M#.#` (modals)
- Marketing assigns `E#.#` (emails), `N#.#` (notifications)
- Business Analysts assign `R#.#` (rules)

**ID Registry:**
- Maintain `catalog.csv` as single source of truth
- No ID reuse (even for deprecated artifacts)
- Archive deprecated IDs (mark status = `deprecated`)

### Validation Rules

**Required for any ID:**
- Present in `catalog.csv`
- Has `owner` field populated
- Has `status` field populated
- Has meaningful `title`

**Optional but Recommended:**
- Relationships documented in `edges.csv`
- File exists at expected path
- YAML front-matter complete

---

## FAQs

**Q: Do I always need a full YAML file for every ID?**
A: No. Start with a row in `catalog.csv`. Create a full file (markdown + YAML) only when complexity demands it (Lite vs Full criteria).

**Q: Can I have multiple IDs for the same artifact?**
A: No. One artifact = one canonical ID. Use `relations` to link related artifacts.

**Q: What if I'm not sure which prefix to use?**
A: Start with `REQ-###` (generic requirement). Refine to specific prefix later.

**Q: Can I change an ID after it's assigned?**
A: No. IDs are stable and never change. If you need to rename, deprecate the old ID and create a new one.

**Q: How do I handle versioning?**
A: IDs don't version. Use `status` lifecycle (draft â†’ review â†’ approved â†’ live â†’ deprecated). Document breaking changes in ADRs.

**Q: What about sub-features?**
A: Use hierarchy: `F-05.0` (parent), `F-05.1`, `F-05.2`, `F-05.3` (children). Or use `includes` relation.

**Q: Should APIs map 1:1 to OpenAPI paths?**
A: Ideally yes. `A-7.3 POST /orders/create` maps to OpenAPI `operationId`. Document mapping in API spec.

**Q: How do Events map to AsyncAPI?**
A: `EV-2 order.created` maps to AsyncAPI channel/message name. Document in event spec.

---

## Tools & Automation

### Recommended Validations (CI)

- âœ… Unique IDs (no duplicates in `catalog.csv`)
- âœ… Allowed relation verbs (from approved list)
- âœ… No dangling IDs (all relations target existing IDs)
- âœ… Status lifecycle compliance (draft â†’ review â†’ approved â†’ live)
- âœ… Required fields populated (id, type, title, owner, status)
- âœ… File naming matches ID (`F-05.1-*.md` for id `F-05.1`)
- âœ… All IDs use dash separator (no `P2.2`, must be `P-02.2`)

### Recommended Reports

- Show all artifacts by owner
- Show all artifacts by status
- Show all blockers (`blocks` relation)
- Show all dependencies (`depends_on` relation)
- Show orphaned artifacts (no incoming relations)
- Show high-impact artifacts (many `impacts` relations)

---

**END OF DOCUMENT**

