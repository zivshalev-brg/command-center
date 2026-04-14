---
title: Beanz Hub
description: Unified B2B service platform encompassing BCC, Beanz Connect, and Powered by Beanz product streams.
type: architecture
status: draft
owner: Platform
market:
  - global
tags:
  - b2b
  - platform
  - bcc
  - pbb
  - beanz-connect
aliases:
  - Hub
  - B2B Platform
  - Beanz B2B
related:
  - "[[brg-tech-landscape|BRG Tech Landscape]]"
  - "[[platinum-roaster-program|Platinum Roaster Program]]"
  - "[[beanz-label-printing|Beanz Label Printing]]"
temporal-type: atemporal
---

# Beanz Hub

## Quick Reference

- Umbrella B2B platform with three product streams: BCC, Beanz Connect, PBB
- Connects 30+ roaster partners and 7+ retail partners through a central control center

## Hub Framework

### Key Concepts

- **Beanz Hub** = Umbrella term for the B2B stream, unified scalable service platform
- **BCC** = Beanz Control Center, self-service portal replacing RCC (Salesforce)
- **Beanz Connect** = Roaster fulfillment integrations (BLP, machine sales)
- **PBB** = Powered by Beanz, retail partner and manufacturer integration layer
- **RCC** = Roaster Control Centre, legacy Salesforce portal being replaced by BCC

## Hub Architecture

```dot
digraph beanz_hub {
    rankdir=TB;
    fontname="Arial";
    compound=true;
    node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];
    edge [fontname="Arial", fontsize=9];

    // Parent brands (top)
    BRG [label="Breville | Lelit | Baratza", fillcolor="#E8E8E8", color="#999999"];

    // Roaster Partners (left)
    ROASTERS [label="Roaster Partners\n(30+)", fillcolor="#FFF4CC", color="#F0B429"];

    // Hub cluster with 3 streams side-by-side
    subgraph cluster_hub {
        label=<<B>beanz hub</B>>;
        fontname="Arial";
        fontsize=14;
        style="rounded";
        color="#4A90D9";

        beanzconnect [shape=none, label=<
<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" BGCOLOR="#D4E7C5" COLOR="#7FA650">
<TR><TD><B>beanzconnect</B></TD></TR>
<TR><TD>Shopify</TD></TR>
<TR><TD>WooCommerce</TD></TR>
<TR><TD>bLP</TD></TR>
<TR><TD>ShipStation</TD></TR>
<TR><TD>Salesforce</TD></TR>
</TABLE>>];

        bcc [shape=none, label=<
<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" BGCOLOR="#D4E7C5" COLOR="#7FA650">
<TR><TD><B>BCC</B></TD></TR>
<TR><TD ALIGN="LEFT">Roaster &amp; coffee SKU data</TD></TR>
<TR><TD ALIGN="LEFT">Finished goods SKU data</TD></TR>
<TR><TD ALIGN="LEFT">SKU management</TD></TR>
<TR><TD ALIGN="LEFT">Vendor management</TD></TR>
<TR><TD ALIGN="LEFT">Volume balancing</TD></TR>
<TR><TD ALIGN="LEFT">Order validation</TD></TR>
<TR><TD ALIGN="LEFT">Shipping events/tracking</TD></TR>
<TR><TD ALIGN="LEFT">Pricing management</TD></TR>
<TR><TD ALIGN="LEFT">Payments &amp; invoicing</TD></TR>
<TR><TD ALIGN="LEFT">Salesforce integration</TD></TR>
<TR><TD ALIGN="LEFT">Inventory management</TD></TR>
</TABLE>>];

        pbb [shape=none, label=<
<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" BGCOLOR="#D4E7C5" COLOR="#7FA650">
<TR><TD><B>Powered by beanz</B></TD></TR>
<TR><TD>Shopify</TD></TR>
<TR><TD>API</TD></TR>
<TR><TD>EDI</TD></TR>
</TABLE>>];

        // Force streams side-by-side
        {rank=same; beanzconnect; bcc; pbb;}
    }

    // Retail Partners (right)
    RETAIL [shape=none, label=<
<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" BGCOLOR="#FFF4CC" COLOR="#F0B429">
<TR><TD><B>Retail Partners</B></TD></TR>
<TR><TD>Seattle Coffee Gear</TD></TR>
<TR><TD>Crate &amp; Barrel</TD></TR>
<TR><TD>Williams Sonoma</TD></TR>
<TR><TD>John Lewis &amp; Partners</TD></TR>
<TR><TD>Sur La Table</TD></TR>
<TR><TD>AeroPress</TD></TR>
<TR><TD>acaia</TD></TR>
</TABLE>>];

    // Consumer platform (bottom)
    BEANZ_COM [label="beanz.com", fillcolor="#E8E8E8", color="#999999"];

    // Ranking: ROASTERS and RETAIL at same level (both outside cluster)
    {rank=same; ROASTERS; RETAIL;}

    // Ranking: BRG above hub, beanz.com below
    BRG -> ROASTERS [style=invis];
    RETAIL -> BEANZ_COM [style=invis];

    // BRG ↔ Hub (compound edge to cluster boundary)
    BRG -> bcc [lhead=cluster_hub, dir=both];

    // beanz.com ↔ Hub (compound edge from cluster boundary)
    bcc -> BEANZ_COM [ltail=cluster_hub, dir=both];

    // Data flows: Roasters ↔ beanzconnect (4 channels, no rank effect)
    ROASTERS -> beanzconnect [dir=both, label="Products", constraint=false];
    ROASTERS -> beanzconnect [dir=both, label="Order", constraint=false];
    ROASTERS -> beanzconnect [dir=both, label="Shipping", constraint=false];
    ROASTERS -> beanzconnect [dir=both, label="Payment", constraint=false];

    // Data flows: PBB ↔ Retail (4 channels, symmetric)
    pbb -> RETAIL [dir=both, label="Products", constraint=false];
    pbb -> RETAIL [dir=both, label="Order", constraint=false];
    pbb -> RETAIL [dir=both, label="Shipping", constraint=false];
    pbb -> RETAIL [dir=both, label="Payment", constraint=false];
}
```

**Legend:** Green = product streams (inside hub cluster), Yellow = external partners, Grey = parent brands/consumer platform. All arrows are bidirectional: 4 data flow channels (Products, Order, Shipping, Payment) symmetric on both sides; BRG and beanz.com connect to the hub as a whole.

## Product Streams

| Stream | Purpose | Key Systems | Partner Type |
|--------|---------|-------------|--------------|
| **BCC** | Self-service portal for roasters, PBB partners, and Beanz managers | Replaces RCC (Salesforce) | All |
| **Beanz Connect** | Seamless roaster fulfillment connections | Shopify, WooCommerce, ShipStation | Roasters |
| **PBB** | Retail partner and manufacturer integration | Shopify, API, EDI | Retail partners |

## Beanz Control Center (BCC)

**Purpose:** One-stop shop for roasters, PBB partners, and Beanz managers to interact and manage required actions.

**Key Principle:** Self-service is core — giving users control with minimal friction.

**Note:** BCC is the rebuilt version of the current RCC (Roaster Control Centre) Salesforce portal.

**BCC Capabilities:**

- Roaster & coffee SKU data
- Finished goods SKU data
- SKU management
- Vendor management
- Volume balancing
- Order validation
- Shipping events/tracking
- Pricing management
- Payments & invoicing
- Salesforce integration (customer data, CRM sync)
- Inventory management (stock availability from D365/ERP)

## Beanz Connect

**Purpose:** Enabling seamless connections with roasters for any fulfillment requirement.

**Key Initiatives:**

- **BLP (Beanz Label Printing):** Streamlining and automating label production for partners
- **Roaster Machine Sales:** Direct integration for machine orders and fulfillment

**Integration Stack:** Shopify, WooCommerce (e-commerce); ShipStation (shipping); Salesforce (customer data sync)

## Powered by Beanz (PBB)

**Purpose:** Integration layer with retail partners and manufacturers.

**Capabilities:**

- Ingesting manufacturers' products to sell on beanz.com
- Supporting retail and distribution partnerships at scale

**Integration Stack:** Shopify, API, EDI

**Current Retail Partners:** Seattle Coffee Gear, Crate&Barrel, Williams Sonoma, John Lewis & Partners, Sur La Table, AeroPress, acaia

## Related Files

- [[platinum-roaster-program|Platinum Roaster Program]] - Roaster partner operations managed through Hub
- [[beanz-label-printing|Beanz Label Printing]] - BLP shipping flows managed through Beanz Connect

## Open Questions

- [ ] What is the timeline for BCC fully replacing the legacy RCC Salesforce portal?
- [ ] Which markets is Beanz Hub currently operational in?
