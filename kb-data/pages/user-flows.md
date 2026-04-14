---
title: User Flows
description: Navigation paths and user journeys across beanz.com pages.
type: feature
status: draft
owner: Product
market:
  - global
tags:
  - pages
  - ux
  - navigation
aliases:
  - User Flows
  - User Journeys
  - Page Navigation
related:
  - "[[page-inventory|Page Inventory]]"
  - "[[emails-and-notifications|Emails and Notifications]]"
temporal-type: static
data-period: "2025-11-01"
---

# User Flows

> **Baseline snapshot as of 1 November 2025.** Represents the pre-redesign state of beanz.com user journeys.

The complete page topology: how users navigate between beanz.com pages through discovery, purchase, account management, and support paths.

## Complete User Flow

```mermaid
flowchart LR
    HOME["P-1.1 Homepage<br>/en-au"] --> PLP["P-1.2 Shop Coffee PLP<br>/coffee"] & QUIZ["P-1.4 Coffee Quiz<br>/quiz.html"] & LARGEBAGS["P-1.8 Large Bags<br>/coffee/large-bags.html"] & ROASTERS["P-1.5 Our Roasters<br>/coffee/roasters"] & PROMO["P-5.1 Promotions<br>/promotions.html"] & EGIFT_ABOUT["P-4.1 eGift Cards About<br>/gift-cards/about-egift-cards"] & CONTACT["P-6.1 Contact Us<br>/support/contact-us.html"] & RETURNS["P-6.2 Returns Policy<br>/support/returns-policy.html"] & EGIFT_FAQ["P-6.3 eGift Card FAQ<br>/support/egift-card-faqs.html"] & TOS["P-8.1 Terms of Use<br>/legal/terms-of-use.html"] & PROMO_TERMS["P-8.2 Promotional Terms<br>/legal/promotional-terms-and-conditions.html"] & GIFT_TERMS["P-8.3 Gift Card Terms<br>/legal/egift-card-terms-and-conditions.html"] & PRIVACY["P-8.4 Privacy Policy<br>breville.com/legal/privacy-policy.html"] & COOKIE["P-8.5 Cookie Policy<br>breville.com/legal/cookie-policy.html"] & SITEMAP["P-9.1 Site Map<br>/sitemap.html"] & LOGIN["P-3.0 Login<br>/auth"] & BC_PDP@{ label: "P-1.7 Barista's Choice<br>/baristas-choice" }
    PLP --> PDP["P-1.3 Product Detail Page<br>/coffee/roasters/.../..."]
    QUIZ --> PDP & BC_PDP
    EDM["EDM Campaigns<br>EMAIL"] --> LARGEBAGS & FESTIVE["P-1.9 Festive Holiday Coffee<br>/coffee/festive-holiday-coffee.html"]
    ROASTERS --> RDP["P-1.6 Roaster Detail<br>/coffee/roasters/..."]
    RDP --> PDP & DIALIN["P-7.1.x Dial-In Videos<br>(24 individual videos)<br>/dial-in-videos/.../..."]
    SHIPPING_EMAIL["Shipping<br>EMAIL"] --> DIALIN & TRACK["Track Package<br>Carrier Website<br>EXTERNAL"]
    DIALIN_EMAIL["Dial-In Video Email<br>EMAIL"] --> DIALIN
    DIALIN --> YOUTUBE["Video Player<br>YouTube<br>EXTERNAL"]
    PDP --> CART["P-2.1 Cart<br>/transaction/.../cart"]
    BC_PDP --> CART
    LARGEBAGS --> CART
    FESTIVE --> CART
    EGIFT_PDP["P-4.2 eGift Cards Purchase<br>/gift-cards/egift-cards"] --> CART
    CART --> CHK["P-2.2 Checkout<br>/transaction/.../checkout"]
    CHK --> ORDER_CONFIRM["P-2.3 Order Confirmation<br>/transaction/.../order-confirmation"]
    ORDER_CONFIRM --> CONFIRM_EMAIL["Confirmation<br>EMAIL"]
    CONFIRM_EMAIL --> ROASTER_EMAIL["Order with Roaster<br>EMAIL"]
    ROASTER_EMAIL --> SHIPPING_EMAIL & DIALIN_EMAIL
    EGIFT_ABOUT --> EGIFT_PDP
    PROMO --> FTBP["P-5.2 Fast-Track Barista Pack<br>/promotions/fast-track-barista-pack.html"] & LONDON_FEST["P-5.3 London Coffee Festival<br>/promotions/london-coffee-festival.html<br>(UK only)"] & FRANKFURT_FEST["P-5.4 Frankfurt Coffee Festival<br>/promotions/frankfurt-coffee-festival.html<br>(DE only)"] & BERLIN_FEST["P-5.5 Berlin Coffee Festival<br>/promotions/berlin-coffee-festival.html<br>(DE only)"] & FT_BREV["P-5.6 Fast-Track Breville<br>/promotions/breville/fast-track<br>(AU, US only)"] & FT_SAGE["P-5.7 Fast-Track Sage<br>/promotions/sage/fast-track<br>(UK, DE only)"] & FT_BARA["P-5.8 Fast-Track Baratza<br>/promotions/baratza/fast-track<br>(AU, UK, US)"]
    CONTACT --> CREATE_TICKET["Create Support Ticket<br>Salesforce<br>EXTERNAL"] & VIEW_TICKET["View Support Ticket<br>Salesforce<br>EXTERNAL"]
    LOGIN --> ACCT_DASH["P-3.1 My Account Dashboard<br>/my-account/dashboard"]
    ACCT_DASH --> ACCT_ORDERS["P-3.3 Orders<br>/my-account/orders"] & ACCT_SUBS["P-3.4 Subscriptions<br>/my-account/subscriptions"] & ACCT_DISCOUNT["P-3.6 Coffee Savings<br>/my-account/coffee-savings"] & ACCT_CASHBACK["P-3.7 Cashback Rewards<br>/my-account/my-rewards"] & ACCT_APPLIANCES["P-3.8 My Appliances<br>/my-account/my-appliances"] & ACCT_DET["P-3.2 Account Settings<br>/my-account/account-settings"]
    ACCT_ORDERS --> VIEW_ORDER["View Order Details"]
    VIEW_ORDER --> TRACK
    ACCT_SUBS --> ACCT_MANAGE_SUB["P-3.5 Manage Subscription<br>/my-account/subscriptions/{id}"]
    ACCT_MANAGE_SUB --> CHANGE_COFFEE["Change Coffee"] & EDIT_SUB["Edit Subscription Details"] & VIEW_SUB_HISTORY["View Subscription History"] & CANCEL_SUB["Cancel Subscription"]
    CHANGE_COFFEE --> CHANGE_BARISTAS["Change to Baristas Choice"] & CHANGE_SINGLE["Change to Single SKU"]

    BC_PDP@{ shape: rect}
    style PRIVACY fill:#FFE0B2,stroke:#FF6F00,stroke-width:2px
    style COOKIE fill:#FFE0B2,stroke:#FF6F00,stroke-width:2px
    style EDM fill:#BBDEFB,stroke:#2962FF,stroke-width:2px
    style DIALIN fill:#FFFFFF,stroke:#000000,stroke-width:2px
    style SHIPPING_EMAIL fill:#BBDEFB,stroke:#2962FF,stroke-width:2px
    style TRACK fill:#E1BEE7,stroke:#AA00FF,stroke-width:2px
    style DIALIN_EMAIL fill:#BBDEFB,stroke:#2962FF,stroke-width:2px
    style YOUTUBE fill:#E1BEE7,stroke:#AA00FF,stroke-width:2px
    style CONFIRM_EMAIL fill:#BBDEFB,stroke:#2962FF,stroke-width:2px
    style ROASTER_EMAIL fill:#BBDEFB,stroke:#2962FF,stroke-width:2px
    style CREATE_TICKET fill:#E1BEE7,stroke:#AA00FF,stroke-width:2px
    style VIEW_TICKET fill:#E1BEE7,stroke:#AA00FF,stroke-width:2px
```

| Color | Meaning |
|-------|---------|
| Default (gray) | beanz.com pages |
| Blue | Email touchpoints |
| Purple | External systems (YouTube, Salesforce, carriers) |
| Orange | External redirects (Breville.com) |

## Entry Points

| Type | Pages |
|------|-------|
| **Direct** | Homepage (P-1.1), Coffee Quiz (P-1.4), Login (P-3.0), Barista's Choice (P-1.7) |
| **Campaign** | Promotions (P-5.x), FTBP, Coffee Festivals, Fast-Track appliance pages |
| **Email** | EDM → Large Bags / Festive CLPs; Shipping → Dial-In / Tracking; Dial-In Email → Videos |


## Related Files

- [[page-inventory|Page Inventory]] — complete page catalog with IDs, URLs, types, and market availability
- [[emails-and-notifications|Emails and Notifications]] — email triggers that create entry points into the flow

## Open Questions

- [ ] What is the "Support" link from Dashboard — does it go to Contact Us (P-6.1) or a separate page?
- [ ] Do promotion sub-pages (P-5.2–P-5.8) link to Cart directly, or route through PDP first?
- [ ] Are there personalization rules that change page content by segment?
- [ ] Are there planned pages for NL market launch (July 2026)?
