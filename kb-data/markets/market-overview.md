---
title: Market Overview
description: Five beanz.com markets with launch dates, currencies, brands, and operational configuration.
type: market
status: complete
owner: Product
market:
  - global
  - au
  - de
  - uk
  - us
  - nl
tags:
  - markets
  - cross-border
aliases:
  - Market Overview
  - Markets Summary
  - Beanz Markets
temporal-type: dynamic
data-period: CY2025
review-cycle: quarterly
related:
  - "[[cy25-performance|CY25 Performance]]"
  - "[[fy27-brand-summit|FY27 Brand Summit]]"
  - "[[beanz-label-printing|Beanz Label Printing]]"
---

# Market Overview

## Quick Reference

- 5 markets across 4 currencies
- NL (July 2026) is the first cross-border market, fulfilled via DE and vice-versa

## Markets Framework

### Key Concepts

- **Breville markets** = AU, US (Breville brand)
- **Sage markets** = UK, DE, NL (Sage Appliances brand)
- **EUR markets** = DE, NL (shared currency, cross-border fulfillment)

## Market Launch Timeline

```dot
digraph launch_timeline {
    rankdir=LR;
    fontname="Helvetica,Arial,sans-serif";
    node [shape=box, style="rounded,filled", fontname="Helvetica,Arial,sans-serif", fontsize=11];
    edge [fontname="Helvetica,Arial,sans-serif", fontsize=9];

    US [label="US\nSep 2020", fillcolor="#80B1D3", color="#4A7FA0"];
    UK [label="UK\nNov 2021", fillcolor="#80B1D3", color="#4A7FA0"];
    AU [label="AU\nDec 2022", fillcolor="#80B1D3", color="#4A7FA0"];
    DE [label="DE\nJun 2024", fillcolor="#80B1D3", color="#4A7FA0"];
    NL [label="NL\nJul 2026\n(planned)", fillcolor="#FFFFB3", color="#D4C640"];

    US -> UK -> AU -> DE -> NL;
}
```

## Market Configuration

| Market | First Order | Currency | Tax Model       | Language |
| ------ | ----------- | -------- | --------------- | -------- |
| **US** | 2020-09-07  | USD      | State sales tax | English  |
| **UK** | 2021-11-18  | GBP      | VAT             | English  |
| **AU** | 2022-12-02  | AUD      | GST             | English  |
| **DE** | 2024-06-26  | EUR      | VAT             | German   |
| **NL** | Jul 2026    | EUR      | VAT             | Dutch    |


