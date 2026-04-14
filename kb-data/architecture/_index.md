---
title: Architecture
description: System components, tech stack, and integrations.
type: reference
status: complete
owner: Platform
market:
  - global
tags:
  - architecture
  - index
aliases:
  - Architecture Index
  - Tech Stack
related:
  - "[[docs/strategy/_index|Strategy]]"
  - "[[docs/features/_index|Features]]"
---

# Architecture

System components, tech stack, and integrations for beanz.com.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [[beanz-hub\|Beanz Hub]] | Unified B2B service platform encompassing BCC, Beanz Connect, and Powered by Beanz product streams. | draft |
| [[brg-tech-landscape\|BRG Tech Landscape]] | Multi-hub composable technology architecture spanning all Breville Group brands and beanz.com. Includes physical infrastructure, external ecosystem, and full vendor inventory. | draft |
| [[kb-platform-architecture\|KB Platform Architecture]] | Skills, validation pipelines, quality gates, and progressive reference loading for the KB platform. | complete |
| [[web-orchestration-services\|Web Orchestration Services]] | Full microservices catalog (34 services) spanning integration, data, utility, digital customer, and micro frontend services across BRG brand properties. | draft |

## Domain Scope

**What belongs here:** System components, tech stack, integration patterns, data flows, API architecture, and technical infrastructure.

**What doesn't belong here:**
- Business requirements → See features/
- Strategic technical direction → See strategy/
- Developer documentation → See developer-platform/

## System Layers

| Layer | Key Systems |
|-------|-------------|
| Frontend | Vercel, Cloudflare, Contentful, AEM (legacy) |
| D2C Commerce | commercetools |
| Promotions | Voucherify, commercetools Promotions (shipping fee discounts) |
| CRM / Marketing / B2B / Portals | Salesforce (Service, Marketing, Commerce, Experience Cloud) |
| Orchestration | AWS custom microservices (Order, Subscription, Product, Inventory) |
| ERP | Microsoft Dynamics 365 |
| EDI | Data Masons |
| PIM | Pimcore |
| Data | Databricks, Mixpanel, Power BI |
| Identity | BlueConic (CDI) |
| Marketing | Cordial, BlueConic |

## Related Areas

- [[docs/strategy/_index|Strategy]] - Architectural decisions
- [[docs/features/_index|Features]] - Features built on this stack
