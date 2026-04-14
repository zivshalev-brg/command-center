---
title: Page Inventory
description: Complete catalog of 65 beanz.com pages across 10 categories with URL patterns, authentication, and external dependencies.
type: feature
status: draft
owner: Product
market:
  - global
tags:
  - pages
  - platform
  - ux
aliases:
  - Page Inventory
  - Page Catalog
  - P-Series Pages
related:
  - "[[emails-and-notifications|Emails and Notifications]]"
  - "[[beanz-hub|Beanz Hub]]"
  - "[[id-conventions|ID Conventions]]"
  - "[[user-flows|User Flows]]"
temporal-type: static
data-period: "2025-11-01"
---

# Page Inventory

> **Baseline snapshot as of 1 November 2025.** Source: `page-inventory-baseline-v1.0-2025-10-31.csv`. This represents the pre-redesign state of beanz.com.

## Quick Reference

- 65 validated pages across 10 categories (P-1.x through P-10.x)
- 4 active markets (AU, UK, US, DE); NL launching July 2026
- 8 pages require authentication (P-3.1 through P-3.8); P-3.0 Login and P-10.1 BCC do not
- P-7.1 root page does not exist — 24 individual Dial-In video pages do

## Page Framework

### Pattern: P-X.Y

- **P-1.x through P-10.x** = 10 major page categories
- **P-X.Y.Z** = Sub-pages within a category (e.g., P-7.1.1 = individual Dial-In video)

### Key Concepts

- **PLP** = Product Listing Page (shop coffee)
- **PDP** = Product Detail Page (individual product)
- **CLP** = Category Listing Page (Large Bags, Festive Coffee)
- **BCC** = Beanz Control Center (B2B roaster portal)
- **FTBP** = Fast-Track Barista Pack (trial program)

## Category Overview

| Category | Pages | Auth | Notes |
|----------|-------|------|-------|
| **P-1.x** Discovery & Browse | 9 | No | Core product discovery |
| **P-2.x** Purchase Flow | 3 | No | Cart, Checkout, Confirmation |
| **P-3.x** Account Management | 9 | Yes (except P-3.0 Login) | Post-login customer portal |
| **P-4.x** eGift Cards | 2 | No | Gift card purchase flow |
| **P-5.x** Promotions | 8 | No | Campaign landing pages |
| **P-6.x** Support | 3 | No | Customer service pages |
| **P-7.x** Education | 24 | No | Dial-In videos (root page does not exist) |
| **P-8.x** Legal | 5 | No | Terms, policies, compliance |
| **P-9.x** Navigation | 1 | No | Site map |
| **P-10.x** B2B Portal | 1 | Yes | BCC Portal (Salesforce) |

## P-1.x Discovery & Browse (9 pages)

| Page ID | Page Name | Page Type | URL Pattern |
|---------|-----------|-----------|-------------|
| **P-1.1** | Homepage | homepage | `/en-au` |
| **P-1.2** | Shop Coffee (PLP) | product_listing | `/coffee` |
| **P-1.3** | Product Detail Page (PDP) | product_detail | `/coffee/roasters/{roaster}/{product}` |
| **P-1.4** | Coffee Quiz | interactive_quiz | `/quiz.html` |
| **P-1.5** | Our Roasters (Listing) | roaster_listing | `/coffee/roasters` |
| **P-1.6** | Roaster Detail Page | roaster_detail | `/coffee/roasters/{roaster}` |
| **P-1.7** | Barista's Choice | curated_collection | `/baristas-choice` |
| **P-1.8** | Large Bags (CLP) | category_listing | `/coffee/large-bags.html` |
| **P-1.9** | Festive Holiday Coffee | category_listing | `/coffee/festive-holiday-coffee.html` |

P-1.8 and P-1.9 are Category Listing Pages (CLP) — PLP-type experiences for specific product categories. "Collection" is a separate new requirement and should not be used to describe CLPs.

## P-2.x Purchase Flow (3 pages)

| Page ID | Page Name | Page Type | URL Pattern |
|---------|-----------|-----------|-------------|
| **P-2.1** | Cart | cart | `/transaction/{locale}/cart` |
| **P-2.2** | Checkout | checkout | `/transaction/{locale}/checkout` |
| **P-2.3** | Order Confirmation | order_confirmation | `/transaction/{locale}/order-confirmation` |

Transaction pages use a separate URL subdirectory (`/transaction/`).

## P-3.x Account Management (9 pages)

All P-3.x pages require authentication except Login (P-3.0), which is the entry point.

| Page ID | Page Name | Page Type | URL Pattern | Auth |
|---------|-----------|-----------|-------------|------|
| **P-3.0** | Login / Authentication | authentication | `/auth` | No |
| **P-3.1** | My Account - Dashboard | account_dashboard | `/my-account/dashboard` | Yes |
| **P-3.2** | My Account - Settings | account_details | `/my-account/account-settings` | Yes |
| **P-3.3** | My Account - Orders | order_listing | `/my-account/orders` | Yes |
| **P-3.4** | My Account - Subscriptions | subscription_listing | `/my-account/subscriptions` | Yes |
| **P-3.5** | My Account - Manage Subscription | subscription_detail | `/my-account/subscriptions/{id}` | Yes |
| **P-3.6** | My Account - Coffee Savings | discount_savings | `/my-account/coffee-savings` | Yes |
| **P-3.7** | My Account - Cashback Rewards | cashback_rewards | `/my-account/my-rewards` | Yes |
| **P-3.8** | My Account - My Appliances | appliances | `/my-account/my-appliances` | Yes |

Login supports `?path=` parameter for post-login redirect. Manage Subscription (P-3.5) URL requires an active subscription ID.

**Subscription management features (P-3.5):**

- Change to Barista's Choice or Single SKU
- Edit subscription details
- View subscription history
- Cancel subscription

## P-4.x eGift Cards (2 pages)

| Page ID | Page Name | Page Type | URL Pattern |
|---------|-----------|-----------|-------------|
| **P-4.1** | eGift Cards - About | gift_cards_about | `/gift-cards/about-egift-cards` |
| **P-4.2** | eGift Cards - Purchase | gift_cards_product_detail | `/gift-cards/egift-cards` |

## P-5.x Promotions (8 pages)

| Page ID | Page Name | Markets | URL Pattern |
|---------|-----------|---------|-------------|
| **P-5.1** | Promotions | AU, UK, US, DE | `/promotions.html` |
| **P-5.2** | Fast-Track Barista Pack | AU, UK, US, DE | `/promotions/fast-track-barista-pack.html` |
| **P-5.3** | London Coffee Festival | UK only | `/promotions/london-coffee-festival.html` |
| **P-5.4** | Frankfurt Coffee Festival | DE only | `/promotions/frankfurt-coffee-festival.html` |
| **P-5.5** | Berlin Coffee Festival | DE only | `/promotions/berlin-coffee-festival.html` |
| **P-5.6** | Fast-Track Breville | AU, US | `/promotions/breville/fast-track` |
| **P-5.7** | Fast-Track Sage | UK, DE | `/promotions/sage/fast-track` |
| **P-5.8** | Fast-Track Baratza | AU, UK, US | `/promotions/baratza/fast-track` |

**Brand strategy:** Breville brand (AU, US) · Sage brand (UK, DE) · Baratza (AU, UK, US — not DE).

## P-6.x Support (3 pages)

| Page ID | Page Name | Page Type | URL Pattern |
|---------|-----------|-----------|-------------|
| **P-6.1** | Contact Us | support | `/support/contact-us.html` |
| **P-6.2** | Returns Policy | support | `/support/returns-policy.html` |
| **P-6.3** | eGift Card FAQ | support | `/support/egift-card-faqs.html` |

Contact Us integrates with Salesforce for support ticket creation and tracking.

## P-7.x Education — Dial-In Videos (24 pages)

**Root page P-7.1 does not exist.** Individual video pages (P-7.1.1 through P-7.1.24) are accessible at `/dial-in-videos/{roaster}/{product}.html`.

**Distribution by market:**

- AU: 6 videos (Market Lane, Mecca, Pablo & Rusty's, Proud Mary, ST. ALi, Veneziano)
- UK: 6 videos (Caravan, Kickback, Next Round, Notes, Redemption, Workshop)
- US: 7 videos (Boon Boona, DOMA, Equator, Madcap, Methodical, Olympia, Onyx)
- DE: 5 videos (19 Grams, Coffee Circle, Five Elephant, Fjord, Heilandt)

Videos are hosted on YouTube and linked from shipping and Dial-In email campaigns.

## P-8.x Legal (5 pages)

| Page ID | Page Name | URL Pattern | External Redirect |
|---------|-----------|-------------|-------------------|
| **P-8.1** | Terms of Use | `/legal/terms-of-use.html` | No |
| **P-8.2** | Promotional Terms | `/legal/promotional-terms-and-conditions.html` | No |
| **P-8.3** | Gift Card Terms | `/legal/egift-card-terms-and-conditions.html` | No |
| **P-8.4** | Privacy Policy | `breville.com/legal/privacy-policy.html` | **Yes** |
| **P-8.5** | Cookie Policy | `breville.com/legal/cookie-policy.html` | **Yes** |

Privacy Policy and Cookie Policy redirect to Breville.com (shared BRG infrastructure).

## P-9.x Navigation (1 page)

| Page ID | Page Name | Page Type | URL Pattern |
|---------|-----------|-----------|-------------|
| **P-9.1** | Site Map | navigation | `/sitemap.html` |

## P-10.x B2B Portal (1 page)

| Page ID | Page Name | URL Pattern | Auth Required |
|---------|-----------|-------------|---------------|
| **P-10.1** | BCC Portal - Login | `mybreville.my.site.com/BrevilleSagePartners/s/login` | Yes |

**Market-specific experience IDs:** beanzENAU (AU) · beanzENGB (UK) · beanzENUS (US) · beanzDEDE (DE). Platform: Salesforce Experience Cloud.

## URL Pattern Structure

The current site uses two URL patterns — a hybrid that will be standardised to language-country in the rebuild/redesign.

### Language-Country Pattern (new standard)

`https://www.beanz.com/{lang}-{country}/{path}`

| Market | Example |
|--------|---------|
| AU | `https://www.beanz.com/en-au/coffee` |
| UK | `https://www.beanz.com/en-gb/coffee` |
| US | `https://www.beanz.com/en-us/coffee` |
| DE | `https://www.beanz.com/de-de/coffee` |

**Pages using this pattern:** Homepage (P-1.1), PLP (P-1.2), PDP (P-1.3), Roasters (P-1.5, P-1.6), Barista's Choice (P-1.7), eGift Cards (P-4.x), Login (P-3.0), all My Account pages (P-3.1–P-3.8).

### Legacy Pattern (country/language)

`https://www.beanz.com/{country}/{lang}/{path}.html`

| Market | Example |
|--------|---------|
| AU | `https://www.beanz.com/au/en/quiz.html` |
| UK | `https://www.beanz.com/uk/en/promotions.html` |

**Pages using this pattern:** Coffee Quiz (P-1.4), CLPs (P-1.8, P-1.9), Promotions (P-5.x), Support (P-6.x), Dial-In Videos (P-7.x), Legal (P-8.x), Site Map (P-9.1).

### Transaction Pattern

`https://www.beanz.com/transaction/{lang}-{country}/{path}`

Used by Cart (P-2.1), Checkout (P-2.2), Order Confirmation (P-2.3).

## External Dependencies

| System | Purpose | Pages Affected |
|--------|---------|----------------|
| **YouTube** | Video hosting for Dial-In content | P-7.1.x (24 pages) |
| **Salesforce** | Support tickets + BCC portal | P-6.1 (Service Cloud) · P-10.1 (Experience Cloud) |
| **Carrier tracking** | Package tracking (DHL, UPS, ShipStation) | P-3.3 → external carrier sites |
| **Breville.com** | Shared legal pages | P-8.4 Privacy Policy · P-8.5 Cookie Policy |

## Market-Specific Pages

Most pages are available across all markets (AU, UK, US, DE). Market-specific pages:

| Page | Markets |
|------|---------|
| P-5.3 London Coffee Festival | UK only |
| P-5.4 Frankfurt Coffee Festival | DE only |
| P-5.5 Berlin Coffee Festival | DE only |
| P-5.6 Fast-Track Breville | AU, US |
| P-5.7 Fast-Track Sage | UK, DE |
| P-5.8 Fast-Track Baratza | AU, UK, US |

Dial-In videos are also market-specific: AU (6) · UK (6) · US (7) · DE (5).

## Related Files

- [[emails-and-notifications|Emails and Notifications]] — email campaigns that drive traffic to pages
- [[beanz-hub|Beanz Hub]] — BCC portal architecture and B2B platform context
- [[id-conventions|ID Conventions]] — P-X.Y page ID system specification
- [[user-flows|User Flows]] — navigation paths and journeys between pages

## Open Questions

- [ ] Why does P-7.1 (Dial-In Videos root page) not exist when 24 individual video pages exist?
- [ ] What pages will launch first for NL market — MVP page set vs full set?
- [ ] Which specific carrier tracking systems are integrated per market?
- [ ] Are analytics data (Monthly Views, Conv Rate, Bounce Rate, RPV) available for population?
