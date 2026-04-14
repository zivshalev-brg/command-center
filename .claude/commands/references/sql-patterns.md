# Beanz Genie SQL Patterns

> Pre-validated SQL query templates for BeanzGenie.
> Copy, modify date ranges/filters, and send directly.
> All queries use fully qualified table names in `ana_prd_gold.edw`.

---

## Table of Contents

1. [Revenue Queries](#1-revenue-queries)
2. [Volume / KG Queries](#2-volume--kg-queries)
3. [Subscription Queries](#3-subscription-queries)
4. [PBB (Powered by Beanz) Queries](#4-pbb-queries)
5. [FTBP Queries](#5-ftbp-queries)
6. [Shipment / SLA Queries](#6-shipment--sla-queries)
7. [Roaster / MOT Queries](#7-roaster--mot-queries)
8. [Customer Queries](#8-customer-queries)
9. [Cancellation Survey Queries](#9-cancellation-survey-queries)
10. [Product / SKU Queries](#10-product--sku-queries)
11. [Roaster Revenue & Volume Analysis](#11-roaster-revenue--volume-analysis)
12. [Product Attribute Analysis](#12-product-attribute-analysis)
13. [Cohort Analysis](#13-cohort-analysis)
14. [FTBP Free vs Paid Bags](#14-ftbp-free-vs-paid-bags)
15. [MOT per Roaster](#15-mot-per-roaster)
16. [Machine Sales per Roaster](#16-machine-sales-per-roaster)

---

## 1. Revenue Queries

### 1.1 Total revenue by month (Calendar Year)
```sql
SELECT
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```
**Expected benchmark:** CY25 total ≈ $15.54M AUD (all coffee, incl. free/discovery). Note: query 1.1 is missing `BeanzSkuFlag = 1` — add it to exclude machines.

**To match PBI "Paid" filter** → add `AND f.SkuAmount > 0` (not `DiscoverySkuFlag = 0`). PBI "Paid" = non-zero revenue bags, including FTBP/PBB partner-funded discovery bags.
- `DiscoverySkuFlag = 0` DOES NOT match PBI ($8.58M CY25 vs ~$13-14M for PBI-equivalent)
- `SkuAmount > 0` gives bags that match PBI near-perfectly (<0.1% gap for FY25: 561,971 vs PBI 562K ✓)
- Revenue with SkuAmount>0: FY25 SQL $12.31M vs PBI $11.6M (5.8% gap — US-specific, likely PBB DAX adjustment in PBI)

### 1.2 Revenue by market by month
```sql
SELECT
  s.Country,
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country, d.Month_Name
ORDER BY s.Country, MIN(f.OrderDate)
```

### 1.3 Revenue by market (Fiscal Year)
```sql
SELECT
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2025-07-01'
  AND f.OrderDate < '2026-07-01'
GROUP BY s.Country
ORDER BY Revenue DESC
```

### 1.4 Revenue in local currency
```sql
SELECT
  s.Country,
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue_Local
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'Local'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country, d.Month_Name
ORDER BY s.Country, MIN(f.OrderDate)
```

### 1.5 Revenue YoY comparison
```sql
SELECT
  YEAR(f.OrderDate) AS CalendarYear,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2023-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY YEAR(f.OrderDate)
ORDER BY CalendarYear
```
**Expected benchmark:** CY23 ≈ $4.4M, CY24 ≈ $8.4M, CY25 ≈ $15.54M (all coffee incl. free). Note: add `AND f.BeanzSkuFlag = 1` for coffee-only.

### 1.6 Margin analysis
```sql
SELECT
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  ROUND(SUM(f.ItemPurchasePrice), 2) AS COGS,
  ROUND(SUM(f.ShippingCost), 2) AS ShippingCost,
  ROUND(SUM(f.SkuAmount) - SUM(f.ItemPurchasePrice) - SUM(f.ShippingCost), 2) AS Margin
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country
ORDER BY Revenue DESC
```

### 1.7 Single month revenue (template)
```sql
SELECT
  ROUND(SUM(f.SkuAmount), 2) AS Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2026-03-01'
  AND f.OrderDate < '2026-04-01'
```
**Usage:** Replace date range for any single-month pull.

---

## 2. Volume / KG Queries

### 2.1 Total coffee bags shipped by month
```sql
SELECT
  d.Month_Name,
  SUM(f.Quantity) AS Total_Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS Total_KG,
  ROUND(SUM(f.Quantity_by_KG) / NULLIF(SUM(f.Quantity), 0), 3) AS Avg_KG_Per_Bag
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```
**Sanity check:** Avg_KG_Per_Bag should be 0.25–0.35. If outside this range, a filter is missing.

### 2.2 KG shipped by market by month
```sql
SELECT
  s.Country,
  d.Month_Name,
  SUM(f.Quantity) AS Total_Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS Total_KG
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country, d.Month_Name
ORDER BY s.Country, MIN(f.OrderDate)
```
**Note:** `Quantity_by_KG` is populated 99.98%+ for coffee SKUs (BeanzSkuFlag=1) across all periods. No fallback needed.

### 2.3 KG shipped (quick check via daily summary)
```sql
SELECT
  d.Month_Name,
  ROUND(SUM(ds.OrderedWeight), 2) AS Total_KG
FROM ana_prd_gold.edw.factbeanzorderdailysummary ds
INNER JOIN ana_prd_gold.edw.dimdate d
  ON ds.FactDate = d.PK_Date
WHERE ds.FactDate >= '2025-07-01'
  AND ds.FactDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(ds.FactDate)
```
**⚠️ Note:** `OrderedWeight` (KG) from daily summary is safe and reliable.
`OrderedQty` (bags) is NOT reliable from Oct 2025+ due to ghost rows — use query 2.1 instead.

### 2.4 Bags from daily summary (with ghost row filter)
If you must use the daily summary for bag counts, filter out ghost rows:
```sql
SELECT
  d.Month_Name,
  SUM(CASE WHEN ds.BAGSIZE_in_Grams IS NOT NULL AND ds.BAGSIZE_in_Grams > 0
      THEN ds.OrderedQty ELSE 0 END) AS Total_Bags_Clean,
  ROUND(SUM(ds.OrderedWeight), 2) AS Total_KG
FROM ana_prd_gold.edw.factbeanzorderdailysummary ds
INNER JOIN ana_prd_gold.edw.dimdate d
  ON ds.FactDate = d.PK_Date
WHERE ds.FactDate >= '2025-07-01'
  AND ds.FactDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(ds.FactDate)
```
**⚠️ Note:** Even with the filter, bag counts from daily summary run 1–8% lower than
factbeanzorder. Use query 2.1 as the source of truth for bags.

---

## 3. Subscription Queries

### 3.1 Active subscriptions at period end (PBI-aligned)
```sql
SELECT
  COUNT(*) AS Active_Subscriptions
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionStatus IN ('Active', 'Paused')
  AND BeanzSkuFlag = 1
```
**Expected benchmark:** Current coffee subs (Mar 2026) ≈ 36,584. Verified against PBI Subscription_KPI's "Active Subscriptions" = 36,600 (<0.05% gap ✓).

**Critical filters (both required to match PBI):**
1. `BeanzSkuFlag = 1` — dimbeanzsubscription contains ALL subscription types (coffee + machines + accessories). Without this, you get ~57K (includes 23K non-coffee subs flagged 0).
2. `SubscriptionStatus IN ('Active', 'Paused')` — PBI's "Active Subscriptions" metric includes both Active (33,719) + Paused (2,865) coffee subs. `'Active'` alone gives 33,719, not 36,584.

**Breakdown (as of Mar 2026):**
| Status | BeanzSkuFlag=1 | BeanzSkuFlag=0 |
|--------|---------------|---------------|
| Active | 33,719 | 23,293 |
| Paused | 2,865 | 5,242 |
| Cancelled | 67,792 | 20,944 |

**SubscriptionType distribution for Active+Paused (BeanzSkuFlag=1):**
- Other: dominant (~30K+ — includes various coffee program types)
- Beanz Subscription: ~5,236
- Fusion: ~3,921
- Coffee Essentials: ~94
- FTBP: ~11

### 3.2 New vs cancelled subscriptions by month
```sql
SELECT
  d.Month_Name,
  SUM(CASE WHEN sub.SubscriptionCreationDate = d.PK_Date THEN 1 ELSE 0 END) AS New_Subs,
  SUM(CASE WHEN sub.SubscriptionCancelDate = d.PK_Date THEN 1 ELSE 0 END) AS Cancelled_Subs
FROM ana_prd_gold.edw.dimbeanzsubscription sub
INNER JOIN ana_prd_gold.edw.dimdate d
  ON d.PK_Date BETWEEN '2025-01-01' AND '2025-12-31'
WHERE (sub.SubscriptionCreationDate BETWEEN '2025-01-01' AND '2025-12-31')
   OR (sub.SubscriptionCancelDate BETWEEN '2025-01-01' AND '2025-12-31')
GROUP BY d.Month_Name
ORDER BY MIN(d.PK_Date)
```
**Note:** This is a simplified pattern. If Genie struggles with the CASE approach, split into two queries:

**New subs by month:**
```sql
SELECT
  DATE_FORMAT(SubscriptionCreationDate, 'yyyy-MM') AS Month,
  COUNT(*) AS New_Subs
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionCreationDate >= '2025-01-01'
  AND SubscriptionCreationDate < '2026-01-01'
GROUP BY DATE_FORMAT(SubscriptionCreationDate, 'yyyy-MM')
ORDER BY Month
```

**Cancelled subs by month:**
```sql
SELECT
  DATE_FORMAT(SubscriptionCancelDate, 'yyyy-MM') AS Month,
  COUNT(*) AS Cancelled_Subs
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionCancelDate >= '2025-01-01'
  AND SubscriptionCancelDate < '2026-01-01'
GROUP BY DATE_FORMAT(SubscriptionCancelDate, 'yyyy-MM')
ORDER BY Month
```

### 3.3 Subscription duration distribution
```sql
SELECT
  SubscriptionDurationMonth AS Tenure_Months,
  COUNT(*) AS Sub_Count
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionCancelDate >= '2025-01-01'
  AND SubscriptionCancelDate < '2026-01-01'
GROUP BY SubscriptionDurationMonth
ORDER BY SubscriptionDurationMonth
```

### 3.4 Subscription events by type
```sql
SELECT
  EventName,
  DATE_FORMAT(EventDate, 'yyyy-MM') AS Month,
  COUNT(*) AS Event_Count
FROM ana_prd_gold.edw.factbeanzsubscription
WHERE EventDate >= '2025-01-01'
  AND EventDate < '2026-01-01'
GROUP BY EventName, DATE_FORMAT(EventDate, 'yyyy-MM')
ORDER BY Month, EventName
```

---

## 4. PBB Queries

### 4.1 PBB revenue by month
```sql
SELECT
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS PBB_Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND s.StoreCode ILIKE 'PBB%'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```
**Expected benchmark:** CY25 ≈ $908K AUD

### 4.2 PBB revenue by country (CY24 vs CY25)
```sql
SELECT
  YEAR(f.OrderDate) AS CalendarYear,
  s.Country,
  ROUND(SUM(f.SkuAmount), 2) AS PBB_Revenue,
  SUM(f.Quantity) AS PBB_Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND s.StoreCode ILIKE 'PBB%'
  AND f.OrderDate >= '2024-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY YEAR(f.OrderDate), s.Country
ORDER BY CalendarYear, PBB_Revenue DESC
```

### 4.3 PBB as % of US volume
```sql
SELECT
  d.Month_Name,
  SUM(CASE WHEN s.StoreCode ILIKE 'PBB%' THEN f.Quantity ELSE 0 END) AS PBB_Bags,
  SUM(f.Quantity) AS Total_US_Bags,
  ROUND(
    SUM(CASE WHEN s.StoreCode ILIKE 'PBB%' THEN f.Quantity ELSE 0 END) * 100.0
    / NULLIF(SUM(f.Quantity), 0),
    1
  ) AS PBB_Pct
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE lower(f.OrderStatus) <> 'cancelled'
  AND s.Country = 'US'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```
**Expected benchmark:** ~14% of US volume

### 4.4 PBB FY26 YTD
```sql
SELECT
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS PBB_Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND s.StoreCode ILIKE 'PBB%'
  AND f.OrderDate >= '2025-07-01'
  AND f.OrderDate < '2026-04-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```

---

## 5. FTBP Queries

### 5.1 FTBP registrations by month (v1 vs v2)
```sql
SELECT
  FTBP_Release,
  DATE_FORMAT(ProductRegistrationDate, 'yyyy-MM') AS Month,
  COUNT(*) AS Registrations
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE IsFTBPRegistration = true
  AND ProductRegistrationDate >= '2025-01-01'
  AND ProductRegistrationDate < '2026-01-01'
GROUP BY FTBP_Release, DATE_FORMAT(ProductRegistrationDate, 'yyyy-MM')
ORDER BY Month, FTBP_Release
```

### 5.2 FTBP conversion rate
```sql
SELECT
  FTBP_Release,
  COUNT(*) AS Total_Registrations,
  SUM(CASE WHEN Has_PaidOrdere = true THEN 1 ELSE 0 END) AS Converted,
  ROUND(
    SUM(CASE WHEN Has_PaidOrdere = true THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS Conversion_Rate_Pct
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE IsFTBPRegistration = true
  AND ProductRegistrationDate >= '2024-01-01'
  AND ProductRegistrationDate < '2026-01-01'
GROUP BY FTBP_Release
ORDER BY FTBP_Release
```
**Expected benchmark:** v1 ≈ 11.4%, v2 ≈ 16.5%

### 5.3 FTBP v2 revenue contribution
```sql
SELECT
  d.Month_Name,
  ROUND(SUM(f.SkuAmount), 2) AS FTBP_V2_Revenue
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimdate d
  ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.offer_code LIKE '%-FT-DISCOFF-%'
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY d.Month_Name
ORDER BY MIN(f.OrderDate)
```

### 5.4 FTBP by retailer
```sql
SELECT
  RetailerName,
  COUNT(*) AS Registrations
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE IsFTBPRegistration = true
  AND ProductRegistrationDate >= '2025-01-01'
  AND ProductRegistrationDate < '2026-01-01'
GROUP BY RetailerName
ORDER BY Registrations DESC
```

### 5.5 FTBP days to registration
```sql
SELECT
  FTBP_Release,
  BusinessUnit,
  ROUND(AVG(DaysToRegistration), 1) AS Avg_Days_To_Reg
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE IsFTBPRegistration = true
  AND ProductRegistrationDate >= '2025-01-01'
  AND ProductRegistrationDate < '2026-01-01'
GROUP BY FTBP_Release, BusinessUnit
ORDER BY FTBP_Release, BusinessUnit
```

---

## 6. Shipment / SLA Queries

### 6.1 SLA performance by market
```sql
SELECT
  COUNTRY,
  DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM') AS Month,
  COUNT(*) AS Total_Shipments,
  SUM(CASE WHEN OrderSLAFlg = true THEN 1 ELSE 0 END) AS On_Time,
  ROUND(
    SUM(CASE WHEN OrderSLAFlg = true THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS SLA_Pct
FROM ana_prd_gold.edw.factbeanzshipment
WHERE SHIPPINGDATE >= '2025-01-01'
  AND SHIPPINGDATE < '2026-01-01'
GROUP BY COUNTRY, DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM')
ORDER BY COUNTRY, Month
```
**⚠️ Note:** `OrderSLAFlg` measures ship-on-time (always 100% in CY25 — not a useful delivery KPI).
Use query 6.2 `LeadTime` as the real SLA metric instead. CY25 benchmarks: AU≈5.83d, UK≈3.97d, US≈5.72d, DE≈5.17d.
**CRITICAL:** `ORDERDATE` in factbeanzshipment is day-of-week INT (1–7), not a date — always use `SHIPPINGDATE` for date filtering.

### 6.2 Average delivery time by market
```sql
SELECT
  COUNTRY,
  DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM') AS Month,
  ROUND(AVG(LeadTime), 2) AS Avg_LeadTime_Days
FROM ana_prd_gold.edw.factbeanzshipment
WHERE SHIPPINGDATE >= '2025-01-01'
  AND SHIPPINGDATE < '2026-01-01'
  AND LeadTime IS NOT NULL
GROUP BY COUNTRY, DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM')
ORDER BY COUNTRY, Month
```
**Expected benchmarks (CY25 avg, verified Mar 2026):** AU ≈ 5.83d, UK ≈ 3.97d, US ≈ 5.72d, DE ≈ 5.17d

### 6.3 Bags shipped by country by month (from shipment table)
```sql
SELECT
  COUNTRY,
  DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM') AS Month,
  COUNT(*) AS Bags_Shipped
FROM ana_prd_gold.edw.factbeanzshipment
WHERE SHIPPINGDATE >= '2025-01-01'
  AND SHIPPINGDATE < '2026-01-01'
GROUP BY COUNTRY, DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM')
ORDER BY COUNTRY, Month
```
**Note:** factbeanzshipment does not have a `Quantity` or `ORDERSTATUS` column — use `COUNT(*)` for shipment counts. For bag-level volume, use `factbeanzorder` (query 2.1).

### 6.4 Carrier performance
```sql
SELECT
  CARRIER,
  COUNTRY,
  COUNT(*) AS Shipment_Count,
  ROUND(AVG(LeadTime), 2) AS Avg_LeadTime_Days,
  ROUND(
    SUM(CASE WHEN OrderSLAFlg = true THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS SLA_Pct
FROM ana_prd_gold.edw.factbeanzshipment
WHERE SHIPPINGDATE >= '2025-01-01'
  AND SHIPPINGDATE < '2026-01-01'
  AND LeadTime IS NOT NULL
GROUP BY CARRIER, COUNTRY
ORDER BY COUNTRY, Shipment_Count DESC
```

---

## 7. Roaster / MOT Queries

### 7.1 Weekly MOT by roaster (last 4 weeks)
```sql
SELECT
  Week_Start_Date,
  VENDOR_NAME,
  Tier,
  MOT_QTY
FROM ana_prd_gold.edw.factbeanzroastermotsummary
WHERE Week_Start_Date >= DATE_ADD(CURRENT_DATE(), -28)
ORDER BY Week_Start_Date, VENDOR_NAME
```

### 7.2 Roaster volume by SKU (last 4 weeks)
```sql
SELECT
  SKUCODE,
  Flavor,
  SUM(MOT_QTY_SKU) AS Total_Qty
FROM ana_prd_gold.edw.factbeanzroastermotskudata
WHERE Week_Start_Date >= DATE_ADD(CURRENT_DATE(), -28)
GROUP BY SKUCODE, Flavor
ORDER BY Total_Qty DESC
```

### 7.3 Barista's Choice vs standard split (last 12 weeks)
```sql
SELECT
  Week_Start_Date,
  SUM(BC_QTY) AS BC_Qty,
  SUM(NonBC_QTY) AS NonBC_Qty,
  ROUND(
    SUM(BC_QTY) * 100.0 / NULLIF(SUM(BC_QTY) + SUM(NonBC_QTY), 0),
    1
  ) AS BC_Pct
FROM ana_prd_gold.edw.factbeanzroastermotskudata
WHERE Week_Start_Date >= DATE_ADD(CURRENT_DATE(), -84)
GROUP BY Week_Start_Date
ORDER BY Week_Start_Date
```

---

## 8. Customer Queries

### 8.1 Customers served
```sql
SELECT
  s.Country,
  YEAR(f.OrderDate) AS CalendarYear,
  COUNT(DISTINCT f.SubscriptionUniqueKey) AS Distinct_Customers
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.OrderDate >= '2024-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country, YEAR(f.OrderDate)
ORDER BY CalendarYear, Country
```
**⚠️ Note:** RateType filter is mandatory even for COUNT DISTINCT — without it,
the 6x row multiplier doesn't change the distinct count but JOIN behaviour may differ.
**Expected benchmark:** CY25 ≈ 156,000

### 8.2 Customer engagement brackets
```sql
SELECT
  Last_Order_Bracket,
  COUNT(*) AS Customer_Count
FROM ana_prd_gold.edw.dimbeanzcustomeremail
GROUP BY Last_Order_Bracket
ORDER BY Customer_Count DESC
```

### 8.3 Average LTV
```sql
SELECT
  YEAR(FirstPaidOrderDate) AS Cohort_Year,
  ROUND(AVG(TotalAmountSpent), 2) AS Avg_LTV
FROM ana_prd_gold.edw.dimbeanzcustomeremail
WHERE FirstPaidOrderDate IS NOT NULL
GROUP BY YEAR(FirstPaidOrderDate)
ORDER BY Cohort_Year
```
**Expected benchmark:** ≈ $353 AUD

---

## 9. Cancellation Survey Queries

### 9.1 Top cancellation reasons
```sql
SELECT
  Question,
  YEAR(SurveyDate) AS Survey_Year,
  COUNT(*) AS Response_Count
FROM ana_prd_gold.edw.factbeanzcancellationsurvey
WHERE SurveyDate >= '2024-01-01'
  AND SurveyDate < '2026-01-01'
GROUP BY Question, YEAR(SurveyDate)
ORDER BY Survey_Year, Response_Count DESC
```

### 9.2 Cancellation reasons by market
```sql
SELECT
  Question,
  COUNT(*) AS Response_Count
FROM ana_prd_gold.edw.factbeanzcancellationsurvey
WHERE SurveyDate >= '2025-01-01'
  AND SurveyDate < '2026-01-01'
GROUP BY Question
ORDER BY Response_Count DESC
```

---

## 10. Product / SKU Queries

### 10.1 Top-selling coffee SKUs by revenue
```sql
SELECT
  f.SKUCODE,
  p.ProductName,
  p.VendorName,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags_Sold,
  ROUND(SUM(f.Quantity_by_KG), 2) AS KG_Sold
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY f.SKUCODE, p.ProductName, p.VendorName
ORDER BY Revenue DESC
LIMIT 20
```
**Note:** dimbeanzproduct is SCD Type 2 (155K rows, ~41K unique products).
JOIN on ProductCodeKey is 1:1 per order line — no fan-out risk.

### 10.2 SKU COGS / margin
```sql
SELECT
  ProductCodeKey AS SKUCODE,
  ProductName,
  VendorName,
  RRP,
  ItemPurchasePrice,
  Product_Margin
FROM ana_prd_gold.edw.dimbeanzproduct
WHERE Country = 'UK'
ORDER BY Product_Margin DESC
```

### 10.3 Inventory levels — low stock
```sql
SELECT
  ProductName,
  VendorName,
  AVAILABLE_INVENTORY,
  INVENTORY_LEVEL
FROM ana_prd_gold.edw.dimbeanzproduct
WHERE INVENTORY_LEVEL = 'Low'
   OR AVAILABLE_INVENTORY < 50
ORDER BY AVAILABLE_INVENTORY ASC
```

---

## 11. Roaster Revenue & Volume Analysis

### 11.1 Revenue and margin by roaster
```sql
-- do not modify this query
SELECT
  p.VendorName,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  ROUND(SUM(f.ItemPurchasePrice), 2) AS COGS,
  ROUND(SUM(f.SkuAmount) - SUM(f.ItemPurchasePrice), 2) AS Gross_Profit,
  ROUND(
    (SUM(f.SkuAmount) - SUM(f.ItemPurchasePrice)) * 100.0
    / NULLIF(SUM(f.SkuAmount), 0),
    1
  ) AS Margin_Pct
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01' AND f.OrderDate < '2026-01-01'
GROUP BY p.VendorName
ORDER BY Revenue DESC
LIMIT 20
```
**Expected benchmarks (CY25, verified Mar 2026):**
- Top revenue: ONYX ($618K, 76.4%), Methodical ($591K, 71.5%), Olympia ($515K, 65.7%)
- Highest margin: Skylark (85.2%), Small Batch (84.2%), Redemption (83.3%), Caravan (81.8%)
- Lowest margin outlier: ST. ALi (32.4%) — investigate COGS vs pricing
- Typical margin range: 60–85% for premium specialty roasters
- **Note:** Genie rewrites `/ NULLIF()` as `try_divide()` — acceptable, result is identical

### 11.2 KG volume and revenue efficiency by roaster
```sql
-- do not modify this query
SELECT
  p.VendorName,
  SUM(f.Quantity) AS Bags,
  ROUND(SUM(f.Quantity_by_KG), 2) AS Total_KG,
  ROUND(SUM(f.SkuAmount) / NULLIF(SUM(f.Quantity), 0), 2) AS Revenue_Per_Bag,
  ROUND(SUM(f.SkuAmount) / NULLIF(SUM(f.Quantity_by_KG), 0), 2) AS Revenue_Per_KG,
  ROUND(SUM(f.Quantity_by_KG) / NULLIF(SUM(f.Quantity), 0), 3) AS Avg_KG_Per_Bag
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01' AND f.OrderDate < '2026-01-01'
GROUP BY p.VendorName
ORDER BY Total_KG DESC
LIMIT 20
```
**Expected benchmarks (CY25, verified Mar 2026):**
- Top KG: Olympia (12,486 kg), Equator (11,863 kg), Methodical (11,840 kg)
- Most bags: ST. ALi (40,496) with low rev/bag ($7.92) — high-volume low-price positioning
- Highest revenue/bag: ONYX ($24.68), DOMA ($23.93), Counter Culture ($20.98)
- Highest revenue/KG: ONYX ($81.72), Volcano ($68.52), Skylark ($63.95)
- Avg KG/bag range: 0.232 (Volcano) to 0.361 (DOMA); fleet average ~0.297 ✓

---

## 12. Product Attribute Analysis

### 12.1 Revenue by flavor category
```sql
-- do not modify this query
SELECT
  p.WEB_FLAVOURCATEGORY,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01' AND f.OrderDate < '2026-01-01'
  AND p.WEB_FLAVOURCATEGORY IS NOT NULL
  AND p.WEB_FLAVOURCATEGORY NOT IN ('', '--None--')
GROUP BY p.WEB_FLAVOURCATEGORY
ORDER BY Revenue DESC
```
**Note:** Three main flavor categories: Chocolate, Fruit, Caramel. Exclude `NULL`, `''`, `'--None--'` values — these are SCD Type 2 historical records with no flavor tagged.

### 12.2 Revenue by origin country
```sql
-- do not modify this query
SELECT
  p.WEB_COUNTRY,
  ROUND(SUM(f.SkuAmount), 2) AS Revenue,
  SUM(f.Quantity) AS Bags,
  COUNT(DISTINCT p.ItemNumber) AS Distinct_SKUs
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.OrderDate >= '2025-01-01' AND f.OrderDate < '2026-01-01'
  AND p.WEB_COUNTRY IS NOT NULL
  AND p.WEB_COUNTRY NOT IN ('', '--None--')
GROUP BY p.WEB_COUNTRY
ORDER BY Revenue DESC
```
**Known origin countries in catalog:** Ethiopia, Brazil, Colombia, Peru, Guatemala, Kenya, El Salvador, Rwanda, Costa Rica, Burundi.

### 12.3 Product catalog by flavor × origin (for single origin vs blend analysis)
```sql
-- do not modify this query
SELECT
  WEB_FLAVOURCATEGORY,
  WEB_COUNTRY,
  COUNT(DISTINCT ItemNumber) AS Products
FROM ana_prd_gold.edw.dimbeanzproduct
WHERE WEB_FLAVOURCATEGORY IS NOT NULL
  AND WEB_FLAVOURCATEGORY NOT IN ('', '--None--')
  AND WEB_COUNTRY IS NOT NULL
  AND WEB_COUNTRY NOT IN ('', '--None--')
GROUP BY WEB_FLAVOURCATEGORY, WEB_COUNTRY
ORDER BY Products DESC
LIMIT 30
```
**Verified catalog distribution (Mar 2026):**
- Chocolate: Brazil (164 products), Colombia (100), Peru (33), Guatemala (31)
- Fruit: Ethiopia (168), Colombia (77), Costa Rica (31), Kenya (26), El Salvador (23), Peru (21), Rwanda (19)
- Caramel: Colombia (76), Brazil (31), Guatemala (28), El Salvador (16)
- **Note:** `WEB_COUNTRY = '--None--'` likely represents blends (multi-origin). Filter it out for single-origin analysis, or include it to count blends.

---

## 13. Cohort Analysis

### 13.1 Subscription cohort retention by month
```sql
-- do not modify this query
SELECT
  CohortMonth,
  COUNT(*) AS Total_Subs,
  SUM(CASE WHEN SubscriptionStatus = 'Active' THEN 1 ELSE 0 END) AS Currently_Active,
  ROUND(
    SUM(CASE WHEN SubscriptionStatus = 'Active' THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS Retention_Pct
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE CohortMonth IS NOT NULL
GROUP BY CohortMonth
ORDER BY CohortMonth DESC
LIMIT 24
```
**Expected benchmarks (CY24–CY25, verified Mar 2026):**

| CohortMonth | Total_Subs | Currently_Active | Retention_Pct |
|---|---|---|---|
| 2026-03 | 1,654 | 1,547 | 93.5% ⚠️ too new |
| 2026-02 | 3,016 | 2,457 | 81.5% ⚠️ too new |
| 2026-01 | 3,931 | 2,905 | 73.9% ⚠️ too new |
| 2025-12 | 7,678 | 3,188 | 41.5% (holiday churn) |
| 2025-11 | 7,101 | 2,456 | 34.6% (low — promo cohort) |
| 2025-10 | 4,005 | 1,641 | 41.0% |
| 2025-09 | 3,480 | 2,248 | 64.6% (above avg) |
| 2025-08 | 4,251 | 2,851 | 67.1% (above avg) |
| 2025-07 | 2,609 | 1,428 | 54.7% |
| 2025-06 | 2,688 | 1,328 | 49.4% |
| 2025-05 | 4,356 | 2,507 | 57.6% |
| 2025-04 | 4,651 | 2,754 | 59.2% |
| 2025-03 | 3,566 | 1,747 | 49.0% |
| 2025-02 | 2,601 | 1,210 | 46.5% |
| 2025-01 | 4,439 | 2,166 | 48.8% |
| 2024-12 | 7,803 | 4,138 | 53.0% |
| 2024-11 | 5,412 | 2,762 | 51.0% |
| 2024-10 | 2,252 | 801 | 35.6% |

**Key insights:**
- Typical 6–12 month retention: **35–55%**
- Holiday cohorts (Nov/Dec) churn faster: ~35–41% retained vs 50–67% for organic months
- Aug/Sep 2025 are standout retention cohorts (64–67%)
- Largest cohorts: Dec 2024 (7,803), Dec 2025 (7,678), Nov 2025 (7,101) — holiday campaigns
- ⚠️ Cohorts <3 months old show artificially high retention — use 6+ month-old cohorts for meaningful analysis

### 13.2 Monthly new subscription acquisitions
```sql
-- do not modify this query
SELECT
  DATE_FORMAT(SubscriptionCreationDate, 'yyyy-MM') AS Month,
  COUNT(*) AS New_Subs
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE SubscriptionCreationDate >= '2024-01-01'
  AND SubscriptionCreationDate < '2026-04-01'
GROUP BY DATE_FORMAT(SubscriptionCreationDate, 'yyyy-MM')
ORDER BY Month
```
**Usage:** Pair with query 13.1 to identify which acquisition months retain well vs churn fast. Large cohort + low retention = promotional acquisition with poor fit.

### 13.3 Annual cohort rollup (current retention by acquisition year)
```sql
-- do not modify this query
SELECT
  DATE_FORMAT(CohortMonth, 'yyyy') AS Cohort_Year,
  COUNT(*) AS Total_Subs,
  SUM(CASE WHEN SubscriptionStatus = 'Active' THEN 1 ELSE 0 END) AS Currently_Active,
  ROUND(
    SUM(CASE WHEN SubscriptionStatus = 'Active' THEN 1 ELSE 0 END) * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS Retention_Pct
FROM ana_prd_gold.edw.dimbeanzsubscription
WHERE CohortMonth IS NOT NULL
GROUP BY DATE_FORMAT(CohortMonth, 'yyyy')
ORDER BY Cohort_Year DESC
```

---

## SQL Anti-Patterns (Don't Do This)

| Bad Pattern | Why It Fails | Correct Pattern |
|---|---|---|
| Missing `ana_prd_gold.edw.` prefix | Genie can't find table | Always fully qualify table names |
| Using `Net_Sales` for revenue | Wrong column | Use `SkuAmount` with RateType filter |
| Omitting `RateType = 'AUD-MonthEnd'` | **6x inflation** on ALL aggregates (bags, KG, revenue, counts) | Always include in WHERE via dimexchangerate JOIN |
| Omitting `f.BeanzSkuFlag = 1` for coffee queries | Includes machines, parts, training (~1.8x bag inflation) | Always include for coffee-only analysis |
| Omitting `lower(OrderStatus) <> 'cancelled'` | Inflates numbers with cancelled orders | Always include in WHERE |
| `BETWEEN '2025-01-01' AND '2025-12-31'` for year | May miss Dec 31 edge cases | Use `>= '2025-01-01' AND < '2026-01-01'` |
| Using `SUM(OrderedQty)` from daily summary for bags | Ghost rows inflate 40–68% from Oct 2025+ | Use factbeanzorder with RateType + BeanzSkuFlag filters |
| Querying `Quantity_by_KG` without `BeanzSkuFlag = 1` | Non-coffee items always have NULL KG | Add `BeanzSkuFlag = 1` or use daily summary `OrderedWeight` |
| Missing GROUP BY column | SQL error | Every non-aggregate in SELECT must be in GROUP BY |
| Too many dimensions (4+) | Timeout | Max 2-3 dimensions per query |
| `ORDER BY` on large result set | Slow | Remove if not essential |
| Avg KG/bag outside 0.25–0.35 | Missing filter (likely RateType or BeanzSkuFlag) | Check all three mandatory filters |
| `WHERE ORDERDATE >= 'date'` on factbeanzshipment | **ORDERDATE is day-of-week INT (1–7), not a date** — always returns 0 rows | Use `WHERE SHIPPINGDATE >= 'date'` instead |
| `SUM(Quantity)` on factbeanzshipment | factbeanzshipment has no Quantity column | Use `COUNT(*)` for shipment counts |

---

## 14. FTBP Free vs Paid Bags

> **Key column:** `ftbp_Flag` in `factbeanzorder` — pre-computed program version flag.
> - `1` = FTBP v1 (Sep 2024 – Oct 2025)
> - `2` = FTBP v2 (Sep 2025 – present)
> - `NULL` / `0` = not FTBP
>
> **Free vs Paid split:** `SkuAmount = 0` → free/discovery bags; `SkuAmount > 0` → paid bags.
> This is the same definition PBI uses ("Free Units = Paid" slicer).

### 14.1 FTBP free vs paid bags & revenue by version and market (CY25)
```sql
-- do not modify this query
SELECT
  f.ftbp_Flag                                             AS FTBP_Version,
  s.Country,
  CASE WHEN f.SkuAmount > 0 THEN 'Paid' ELSE 'Free' END  AS Order_Type,
  SUM(f.Quantity)                                         AS Bags,
  ROUND(SUM(f.SkuAmount), 2)                              AS Revenue_AUD
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.ftbp_Flag IN (1, 2)
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY f.ftbp_Flag, s.Country,
         CASE WHEN f.SkuAmount > 0 THEN 'Paid' ELSE 'Free' END
ORDER BY f.ftbp_Flag, s.Country, Order_Type
```
**Expected benchmarks (CY25, AUD-MonthEnd, verified Mar 2026):**

| FTBP_Version | Order_Type | Bags | Revenue_AUD | Top Market |
|---|---|---|---|---|
| 1 (v1) | Free | 188,736 | $0 | AU (85,690) |
| 1 (v1) | Paid | 224,437 | $5.55M | US ($2.21M, 76,803 bags) |
| 2 (v2) | Free | 108,124 | $0 | — |
| 2 (v2) | Paid | **24,481** | **$524K AUD** | Dec ramp: 15,715 bags alone |

**v1 Paid market breakdown:**
- US: 76,803 bags, $2.21M AUD
- UK: 85,654 bags, $1.87M AUD
- AU: 44,996 bags, $1.02M AUD
- DE: 16,984 bags, $0.45M AUD

**v2 Paid monthly ramp (CY25, verified Mar 2026):**
- Sep 2025: 76 bags, $1.8K AUD (v2 just launched)
- Oct 2025: 1,790 bags, $39.9K AUD
- Nov 2025: 6,900 bags, $143.9K AUD
- Dec 2025: **15,715 bags, $338.5K AUD** (holiday peak)
- **Total CY25: 24,481 bags, $524K AUD**

**Notes:**
- The earlier benchmark of 12,215 was wrong — that was `DiscoverySkuFlag=1` only. Correct CY25 total is 24,481 bags ($524K).
- v2 is growing fast: Dec 2025 = 2.3× November. Full-year 2026 projection will be much larger.
- `ftbp_Flag` is more reliable than `offer_code LIKE '%-FT-DISCOFF-%'` for v2 detection
- Genie may rewrite `offer_code LIKE` to `ftbp_Flag` automatically — prefer `ftbp_Flag` directly
- For registration-level FTBP data (conversion rates, signup type), use `factbeanzftbpprodregistration` (see Section 5)

### 14.2 FTBP bags by month (trend view)
```sql
-- do not modify this query
SELECT
  f.ftbp_Flag                                             AS FTBP_Version,
  DATE_FORMAT(f.OrderDate, 'yyyy-MM')                     AS Month,
  CASE WHEN f.SkuAmount > 0 THEN 'Paid' ELSE 'Free' END  AS Order_Type,
  SUM(f.Quantity)                                         AS Bags,
  ROUND(SUM(f.SkuAmount), 2)                              AS Revenue_AUD
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.ftbp_Flag IN (1, 2)
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY f.ftbp_Flag, DATE_FORMAT(f.OrderDate, 'yyyy-MM'),
         CASE WHEN f.SkuAmount > 0 THEN 'Paid' ELSE 'Free' END
ORDER BY Month, f.ftbp_Flag, Order_Type
```

### 14.3 FTBP v2 customer segments (Sub+FreeBags vs FBO)
Uses `factbeanzftbpprodregistration` for customer-level segmentation:
```sql
-- do not modify this query
SELECT
  SignUpOrderType,
  Has_PaidOrdere                                  AS Has_Paid_Order,
  COUNT(*)                                        AS Customers,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS Pct_of_Total
FROM ana_prd_gold.edw.factbeanzftbpprodregistration
WHERE FTBP_Release = 'FTBP v2'
  AND IsFTBPRegistration = true
GROUP BY SignUpOrderType, Has_PaidOrdere
ORDER BY Customers DESC
```
**Expected benchmarks (PBI FTBP_Overview page, v2 filter, Mar 2026):**
- Total v2 customers: ~80,335
- On Demand Only (FBO not converted): ~63,778 (80.2%)
- Subscription (Sub+FreeBags or FBO converted): ~15,711 (19.8%)
- Both: ~76 (0.1%)

### 14.4 FTBP v2 paid bags by roaster (full breakdown, CY25)
```sql
SELECT
  p.VendorName,
  SUM(f.Quantity)                                                        AS Paid_Bags,
  ROUND(SUM(f.Quantity_by_KG), 2)                                        AS Total_KG,
  ROUND(SUM(f.SkuAmount), 2)                                             AS Revenue_AUD,
  ROUND(SUM(f.Quantity_by_KG) / NULLIF(SUM(f.Quantity), 0), 3)          AS Avg_KG_per_Bag
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON f.ProductCodeKey = p.ProductCodeKey
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 1
  AND f.ftbp_Flag = 2
  AND f.SkuAmount > 0
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY p.VendorName
ORDER BY Paid_Bags DESC
```
**Verified benchmarks (CY25, AUD-MonthEnd, 106 roasters, verified Mar 2026):**

| Rank | VendorName | Paid_Bags | Revenue_AUD | Avg_KG_per_Bag |
|---|---|---|---|---|
| 1 | ONYX | 1,225 | $30,047 | 0.306 |
| 2 | Volcano Coffee Works | 827 | $15,579 | 0.295 |
| 3 | Methodical | 805 | $20,754 | 0.408 |
| 4 | Madcap | 740 | $17,238 | 0.291 |
| 5 | Workshop | 704 | $11,679 | 0.277 |
| 6 | Kickback | 666 | $12,703 | 0.348 |
| 7 | Proud Mary | 610 | $12,385 | 0.283 |
| 8 | Ozone | 582 | $11,538 | 0.280 |
| 9 | Origin | 567 | $9,507 | 0.250 |
| 10 | Equator | 488 | $12,216 | 0.388 |
| … | … (96 more roasters) | … | … | … |
| **TOTAL** | **106 roasters** | **24,481** | **$524,087** | **0.297** |

**Cross-check:** Sum of all 106 roasters = **24,481 bags** ✅ (matches CY25 monthly total exactly).

**Notes:**
- **Do NOT use LIMIT on this query** — there are 106 roasters; LIMIT 15 captures only ~38% of bags (9,573 of 24,481). The previous session used LIMIT 15, which caused the apparent benchmark inconsistency.
- ONYX leads by bags AND is also the top revenue roaster overall (CY25) — dominant in v2 also.
- **KG/bag outliers (large bag formats — not data errors):**
  - PT's: 0.677 kg/bag (likely 500g+ bags)
  - Wildkaffee: 0.558 (likely 500g bags — DE market)
  - Coffee Circle: 0.513 (likely 500g bags)
  - Luna: 1.000 (3 bags, 3 KG — 1kg bags)
- **Old Spike: 0.243 kg/bag** — just below the 0.25 sanity floor; this is a small-format bag (e.g. 200g), not a query error.
- JOIN to `dimbeanzproduct` on `ProductCodeKey` gives `VendorName` (ProductCodeKey is a surrogate SCD2 key — join is 1:1, no fan-out risk).

---

## 15. MOT per Roaster

> **MOT = Minimum Order Threshold** — the weekly KG commitment each roaster guarantees.
>
> **Two tables serve different purposes:**
> - `factbeanzroastermotsummary` → MOT threshold (KG per week per roaster, by Tier)
> - `factbeanzroastermotskudata` → actual bags ordered per SKU (BC_QTY + NonBC_QTY), used to calculate actual KG
>
> **Actual KG formula:** `(BC_QTY + NonBC_QTY) * BagSize_KG`
> - `BC_QTY` = Barista's Choice (algorithm-selected) bags
> - `NonBC_QTY` = Customer-selected bags
>
> **MOT tracking runs quarterly (13 weeks per season).** CY25 covers one such season.

### 15.1 MOT threshold by roaster (season summary)
```sql
-- do not modify this query
SELECT
  VENDOR_NAME,
  Tier,
  COUNT(*)                        AS Weeks_Tracked,
  SUM(MOT_QTY)                   AS Season_Total_MOT_KG,
  ROUND(AVG(MOT_QTY), 1)         AS Avg_Weekly_MOT_KG
FROM ana_prd_gold.edw.factbeanzroastermotsummary
WHERE Week_Start_Date >= '2025-01-01'
  AND Week_Start_Date < '2026-01-01'
GROUP BY VENDOR_NAME, Tier
ORDER BY Avg_Weekly_MOT_KG DESC
```
**Expected benchmarks (CY25 season, 13 weeks, verified Mar 2026):**

| VENDOR_NAME | Tier | Weeks | Season KG | Avg Weekly KG |
|---|---|---|---|---|
| Methodical | Platinum | 13 | 1,950 | 150.0 |
| Olympia | Platinum | 13 | 1,885 | 145.0 |
| Equator | Platinum | 13 | 1,820 | 140.0 |
| ONYX | Platinum | 13 | 1,430 | 110.0 |
| Madcap | Platinum | 13 | 1,430 | 110.0 |

### 15.2 MOT achievement by roaster (latest week)
> **⚠️ Schema note:** `factbeanzroastermotskudata` does NOT have a `VENDOR_NAME` column directly.
> Use `ProductCodeKey → dimbeanzproduct` (1:1 join on surrogate key) to get `VendorName`.
> Direct VENDOR_NAME join causes Genie errors. Always use the subquery approach below.
>
> **⚠️ Fan-out warning:** Do NOT join `factbeanzroastermotskudata` directly to
> `factbeanzroastermotsummary` without pre-aggregating first. The SKU table has multiple rows per
> roaster per week (one per SKU). If you `SUM(mot.MOT_QTY)` in a direct join, the threshold gets
> counted once per SKU row, inflating it 10x. Always pre-aggregate actual KG first, then join.

```sql
-- do not modify this query
-- Per-roaster achievement (latest week)
SELECT
  act.VendorName,
  act.Country,
  act.Week_Start_Date,
  act.Actual_KG,
  mot.MOT_QTY                                               AS Threshold_KG,
  ROUND(act.Actual_KG * 100.0 / NULLIF(mot.MOT_QTY, 0), 1) AS Achievement_Pct
FROM (
  SELECT
    k.Country,
    k.Week_Start_Date,
    p.VendorName,
    ROUND(SUM((k.BC_QTY + k.NonBC_QTY) * k.BagSize_KG), 2) AS Actual_KG
  FROM ana_prd_gold.edw.factbeanzroastermotskudata k
  INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
    ON k.ProductCodeKey = p.ProductCodeKey
  WHERE k.Week_Start_Date = (
    SELECT MAX(Week_Start_Date) FROM ana_prd_gold.edw.factbeanzroastermotskudata
  )
  GROUP BY k.Country, k.Week_Start_Date, p.VendorName
) act
INNER JOIN ana_prd_gold.edw.factbeanzroastermotsummary mot
  ON act.VendorName = mot.VENDOR_NAME
  AND act.Week_Start_Date = mot.Week_Start_Date
ORDER BY Achievement_Pct DESC
```

**Per-country roll-up version:**
```sql
-- do not modify this query
-- Country-level MOT achievement (latest week)
SELECT
  act.Country,
  act.Week_Start_Date,
  ROUND(SUM(act.Actual_KG), 2)                                          AS Actual_KG,
  SUM(mot.MOT_QTY)                                                       AS Total_Threshold_KG,
  ROUND(SUM(act.Actual_KG) * 100.0 / NULLIF(SUM(mot.MOT_QTY), 0), 1)  AS Achievement_Pct
FROM (
  SELECT
    k.Country,
    k.Week_Start_Date,
    p.VendorName,
    ROUND(SUM((k.BC_QTY + k.NonBC_QTY) * k.BagSize_KG), 2) AS Actual_KG
  FROM ana_prd_gold.edw.factbeanzroastermotskudata k
  INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
    ON k.ProductCodeKey = p.ProductCodeKey
  WHERE k.Week_Start_Date = (
    SELECT MAX(Week_Start_Date) FROM ana_prd_gold.edw.factbeanzroastermotskudata
  )
  GROUP BY k.Country, k.Week_Start_Date, p.VendorName
) act
INNER JOIN ana_prd_gold.edw.factbeanzroastermotsummary mot
  ON act.VendorName = mot.VENDOR_NAME
  AND act.Week_Start_Date = mot.Week_Start_Date
GROUP BY act.Country, act.Week_Start_Date
ORDER BY Actual_KG DESC
```

**Expected benchmarks (by country, verified Mar 2026):**

| Country | Actual_KG (wk Mar 15 — partial) | Total_Threshold_KG | Achievement_Pct |
|---|---|---|---|
| US | 617.3 | 1,723.5 | 35.8% (partial week) |
| UK | 205.1 | 920.0 | 22.3% (partial week) |
| AU | 77.2 | 605.4 | 12.8% (partial week) |
| DE | 36.1 | 241.0 | 15.0% (partial week) |

**AU threshold 605.4 ≈ PBI 583.9 KG (3.7% gap ✓)**

**⚠️ Partial week caveat:** The week of 2026-03-15 ran through 2026-03-21. Queried on 2026-03-18 (mid-week), so actual KG is ~3/7 complete. PBI (week ending Mar 7) showed AU at 180.7% (1,055 KG vs 583.9 threshold). For completed weeks, multiply mid-week actuals by 2.3x to estimate weekly total.

### 15.3 MOT achievement trend (last 13 weeks, per roaster)
```sql
-- do not modify this query
SELECT
  act.VendorName,
  act.Week_Start_Date,
  act.Actual_KG,
  mot.MOT_QTY                                               AS Threshold_KG,
  ROUND(act.Actual_KG * 100.0 / NULLIF(mot.MOT_QTY, 0), 1) AS Achievement_Pct
FROM (
  SELECT
    k.Week_Start_Date,
    p.VendorName,
    ROUND(SUM((k.BC_QTY + k.NonBC_QTY) * k.BagSize_KG), 2) AS Actual_KG
  FROM ana_prd_gold.edw.factbeanzroastermotskudata k
  INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
    ON k.ProductCodeKey = p.ProductCodeKey
  WHERE k.Week_Start_Date >= DATE_ADD(CURRENT_DATE(), -91)
  GROUP BY k.Week_Start_Date, p.VendorName
) act
INNER JOIN ana_prd_gold.edw.factbeanzroastermotsummary mot
  ON act.VendorName = mot.VENDOR_NAME
  AND act.Week_Start_Date = mot.Week_Start_Date
ORDER BY act.VendorName, act.Week_Start_Date
```

### 15.4 BC vs NonBC split by roaster (last 4 weeks)
```sql
-- do not modify this query
SELECT
  p.VendorName,
  SUM(k.BC_QTY)                                                          AS BC_Bags,
  SUM(k.NonBC_QTY)                                                       AS NonBC_Bags,
  ROUND(SUM(k.BC_QTY) * 100.0 / NULLIF(SUM(k.BC_QTY) + SUM(k.NonBC_QTY), 0), 1) AS BC_Pct
FROM ana_prd_gold.edw.factbeanzroastermotskudata k
INNER JOIN ana_prd_gold.edw.dimbeanzproduct p
  ON k.ProductCodeKey = p.ProductCodeKey
WHERE k.Week_Start_Date >= DATE_ADD(CURRENT_DATE(), -28)
GROUP BY p.VendorName
ORDER BY BC_Pct DESC
```

---

## 16. Machine Sales per Roaster

> Uses `factbeanzmborders` — the multi-brand equipment orders table.
> `RoasterFlg = 'Y'` filters to roaster-attributed machine sales (espresso machine bundles
> purchased alongside or attributed to a specific roaster partner).
>
> **AUD-MonthEnd rate applies** — `factbeanzmborders` JOINs to `dimexchangerate` and
> `dimbeanzstore` the same way as `factbeanzorder`.

### 16.1 Machine sales by roaster and market (CY25)
```sql
-- do not modify this query
SELECT
  mb.RoasterName,
  s.Country,
  COUNT(*)                        AS Orders,
  ROUND(SUM(mb.SkuAmount), 2)    AS Revenue_AUD
FROM ana_prd_gold.edw.factbeanzmborders mb
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON mb.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON mb.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(mb.OrderStatus) <> 'cancelled'
  AND mb.RoasterFlg = 'Y'
  AND mb.OrderDate >= '2025-01-01'
  AND mb.OrderDate < '2026-01-01'
GROUP BY mb.RoasterName, s.Country
ORDER BY Revenue_AUD DESC
```
**Expected benchmarks (CY25 Local currency, verified Mar 2026):**

| RoasterName | Country | Orders | Revenue (Local) |
|---|---|---|---|
| Origin | UK | 146 | £262,274 |
| Kiss the Hippo | UK | 42 | £127,296 |
| 200 Degrees | UK | 241 | £116,249 |
| Veneziano | AU | 42 | A$34,824 |
| ONYX | US | 45 | $16,321 |

**Notes:**
- Benchmarks above are in local currency (from the verified query run). Run with `AUD-MonthEnd` for AUD totals.
- `RoasterFlg = 'Y'` (string) is the correct filter — confirm with Genie if `'1'` or `1` is needed
- factbeanzmborders covers **multi-brand equipment** (machines, grinders) — not coffee bags
- Revenue figures are much smaller than the overall equipment market ($135M+ AUD for all machines via BeanzSkuFlag=0 in factbeanzorder)

### 16.2 Total machine revenue by market (all machines, not roaster-specific)
For context, total machine/equipment marketplace revenue via `factbeanzorder` with `BeanzSkuFlag = 0`:
```sql
-- do not modify this query
SELECT
  s.Country,
  SUM(f.Quantity)               AS Units,
  ROUND(SUM(f.SkuAmount), 2)   AS Revenue_AUD
FROM ana_prd_gold.edw.factbeanzorder f
INNER JOIN ana_prd_gold.edw.dimexchangerate e
  ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN ana_prd_gold.edw.dimbeanzstore s
  ON f.StoreCode = s.StoreCode
WHERE e.RateType = 'AUD-MonthEnd'
  AND lower(f.OrderStatus) <> 'cancelled'
  AND f.BeanzSkuFlag = 0
  AND f.OrderDate >= '2025-01-01'
  AND f.OrderDate < '2026-01-01'
GROUP BY s.Country
ORDER BY Revenue_AUD DESC
```
**Expected benchmarks (CY25, AUD-MonthEnd, non-coffee SKUs):**
- US: ~331,922 units, ~$59.3M AUD
- UK: ~$33.5M AUD
- DE: ~$29.6M AUD
- AU: ~$12.1M AUD
- **Global total: ~$135M+ AUD** — non-coffee SKUs dominate total marketplace revenue (~87% of gross)

