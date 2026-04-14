# Beanz Genie Schema Reference

> Complete column-level reference for all 17 tables in the BeanzGenie data warehouse.
> All tables in schema: `ana_prd_gold.edw`

---

## Table of Contents

1. [factbeanzorder](#1-factbeanzorder) — Order line items (PRIMARY revenue table)
2. [dimexchangerate](#2-dimexchangerate) — Currency conversion rates
3. [dimbeanzstore](#3-dimbeanzstore) — Store/market dimension
4. [dimbeanzpromotion](#4-dimbeanzpromotion) — Promotion/coupon details
5. [dimbeanzcustomeremail](#5-dimbeanzcustomeremail) — Customer engagement metrics
6. [factbeanzcancellationsurvey](#6-factbeanzcancellationsurvey) — Cancellation reasons
7. [factbeanzftbpprodregistration](#7-factbeanzftbpprodregistration) — FTBP registrations
8. [factbeanzroastermotskudata](#8-factbeanzroastermotskudata) — Weekly roaster SKU data
9. [factbeanzorderdailysummary](#9-factbeanzorderdailysummary) — Daily order aggregates
10. [dimbeanzsubscription](#10-dimbeanzsubscription) — Subscription dimension
11. [factbeanzsubscription](#11-factbeanzsubscription) — Subscription events
12. [factbeanzmborders](#12-factbeanzmborders) — Multi-brand equipment orders
13. [dimbeanzproduct](#13-dimbeanzproduct) — Product attributes & pricing
14. [dimbeanzorder](#14-dimbeanzorder) — Order detail dimension
15. [factbeanzshipment](#15-factbeanzshipment) — Shipment & delivery tracking
16. [factbeanzroastermotsummary](#16-factbeanzroastermotsummary) — Weekly MOT summary
17. [dimdate](#17-dimdate) — Calendar & fiscal date dimension

---

## 1. factbeanzorder

**Purpose:** Detailed order line items for all Beanz marketplace orders (coffee AND non-coffee). This is the PRIMARY table for revenue, volume, and margin analysis.

**⚠️ CRITICAL: This table has a 6x row multiplier.** Every order line exists once per exchange rate type (6 types: Local, AUD-MonthEnd, EUR-Constant, USD-Constant, AUD-Budget, Constant). You MUST filter by `RateType` via the dimexchangerate JOIN to avoid inflating all aggregates by 6x.

**⚠️ CRITICAL: This table contains non-coffee SKUs.** Machines, spare parts, accessories, and digital training are included alongside coffee bags. Use `BeanzSkuFlag = 1` for coffee-only analysis.

**Row count:** ~25.4M rows (as of Mar 2026). Grain: 1 order line × 6 rate types.

**Critical columns:**

| Column | Type | Description | Usage Notes |
|---|---|---|---|
| `OrderDate` | DATE | Date the order was placed | Primary date field for time series |
| `SKUCODE` | STRING | Product SKU identifier | JOIN to dimbeanzproduct |
| `StoreCode` | STRING | Store/channel identifier | JOIN to dimbeanzstore; `PBB%` = Powered by Beanz |
| `OrderStatus` | STRING | Order status | **ALWAYS filter: `lower(OrderStatus) <> 'cancelled'`** |
| `SkuAmount` | DOUBLE | **Revenue per line item** | **PRIMARY revenue metric** — use with RateType filter |
| `Quantity` | NUMERIC | Number of bags ordered | Use for bag count. **Identical across all 6 RateTypes — filter to one RateType to avoid 6x count** |
| `Quantity_by_KG` | DECIMAL | Weight in KG | **Populated 99.98%+ for coffee SKUs (BeanzSkuFlag=1). NULL for non-coffee items (machines, parts).** |
| `UnitPrice` | DOUBLE | Price per unit | Before discounts |
| `Discount` | DOUBLE | Discount amount | |
| `SkuTaxAmount` | DOUBLE | Tax on SKU | |
| `OrderLineTotalAmount` | DOUBLE | Total including tax | |
| `ShippingCharge` | DOUBLE | Shipping fee charged | |
| `ShippingCost` | DOUBLE | Actual shipping cost | For margin calc |
| `ItemPurchasePrice` | DOUBLE | COGS / purchase price | For margin calc |
| `ExchangeRateKey` | INT | FK to dimexchangerate | **MUST JOIN + filter RateType for ALL queries (deduplication + currency)** |
| `FiscalYearNumber` | INT | BRG fiscal year | FY26 = Jul 2025 – Jun 2026 |
| `ProductCodeKey` | STRING | FK to dimbeanzproduct | |
| `SubscriptionUniqueKey` | STRING | Subscription identifier | |
| `SubscriptionId` | STRING | Subscription ID | |
| `BeanzSkuFlag` | BOOLEAN | Is a Beanz coffee SKU | **FILTER: = 1 for coffee-only queries. 0 = machines, parts, digital training** |
| `DiscoverySkuFlag` | BOOLEAN | Is a discovery/sample SKU | |
| `PromotionFlag` | BOOLEAN | Has promotion applied | |

**Standard JOIN pattern for revenue/volume queries:**
```sql
FROM factbeanzorder f
INNER JOIN dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey
INNER JOIN dimbeanzstore s ON f.StoreCode = s.StoreCode
INNER JOIN dimdate d ON f.OrderDate = d.PK_Date
WHERE e.RateType = 'AUD-MonthEnd'        -- REQUIRED: deduplicates 6x rate multiplier
  AND lower(f.OrderStatus) <> 'cancelled' -- REQUIRED: exclude cancelled orders
  AND f.BeanzSkuFlag = 1                  -- REQUIRED for coffee-only (omit for total marketplace)
```

---

## 2. dimexchangerate

**Purpose:** Currency conversion rates by business unit, date, and type.

| Column | Type | Description |
|---|---|---|
| `ExchangeRateKey` | INT | PK — join to factbeanzorder |
| `ExchangeRateCode` | STRING | Currency code |
| `BusinessUnit` | STRING | BRG business unit |
| `ExchangeRateDate` | DATE | Rate effective date |
| `RateType` | STRING | **Critical filter** |
| `Rate` | DOUBLE | Conversion rate |

**RateType values:**
- `Local` — Local currency (Genie default)
- `AUD-MonthEnd` — **Preferred for reporting** (constant AUD)
- `EUR-Constant` — Constant EUR
- `USD-Constant` — Constant USD
- `AUD-Budget` — Budget rate AUD
- `Constant` — Generic constant rate

---

## 3. dimbeanzstore

**Purpose:** Store location and hierarchy.

| Column | Type | Description |
|---|---|---|
| `StoreCode` | STRING | PK — `PBB%` prefix = Powered by Beanz |
| `BusinessUnit` | STRING | BRG business unit |
| `Country` | STRING | Market country |
| `Region` | STRING | Geographic region |

**StoreCode patterns:**
- `PBB%` → Powered by Beanz retail partners
- Other codes identify direct Beanz stores by market

---

## 4. dimbeanzpromotion

**Purpose:** Promotional campaigns and discounts applied to orders.

| Column | Type | Description |
|---|---|---|
| `OrderNoSKUCodeKey` | STRING | FK to factbeanzorder |
| `PromotionName` | STRING | Name of promotion |
| `CouponCode` | STRING | Applied coupon code |
| `DiscoveryFlag` | STRING | Discovery program flag |
| `Category` | STRING | Promotion category |
| `CartDiscount` | DOUBLE | Cart-level discount |
| `LineItemDiscount` | DOUBLE | Line-item discount |
| `ItemSubTotal` | DOUBLE | Subtotal before discount |

---

## 5. dimbeanzcustomeremail

**Purpose:** Customer-level engagement metrics.

| Column | Type | Description |
|---|---|---|
| `TotalAmountSpent` | DOUBLE | Lifetime spend |
| `FirstOrderDate` | DATE | First order (free or paid) |
| `FirstPaidOrderDate` | DATE | First PAID order |
| `LastOrderDate` | DATE | Most recent order |
| `NumberOfSubscription` | INT | Total subscriptions |
| `CustomerSubscriptionStatus` | STRING | Current sub status |
| `FirstFTBPOrderDate` | DATE | First FTBP order |
| `DaysActive` | INT | Days since first order |
| `Days_Since_Last_Order` | INT | Recency metric |
| `Entered_through_FTBP` | BOOLEAN | Acquired via FTBP |
| `Last_Order_Bracket` | STRING | Recency bracket |

---

## 6. factbeanzcancellationsurvey

**Purpose:** Why customers cancel. Use for churn analysis.

| Column | Type | Description |
|---|---|---|
| `Question` | STRING | Survey question |
| `Question_ls` | STRING | Localised question |
| `CustomerComments` | STRING | Free-text feedback |
| `SkuCode` | STRING | Last SKU on subscription |
| `SubscriptionId` | STRING | Cancelled subscription |
| `SurveyDate` | DATE | When survey taken |
| `SurveyTakenByCallCenter` | BOOLEAN | Agent-assisted flag |

---

## 7. factbeanzftbpprodregistration

**Purpose:** FTBP product registrations with full conversion funnel data.

**Key columns for conversion analysis:**

| Column | Type | Description |
|---|---|---|
| `ProductRegistrationID` | STRING | Unique registration |
| `PurchaseDate` | DATE | Machine purchase date |
| `ProductRegistrationDate` | DATE | Registration date |
| `RetailerName` | STRING | Where machine was bought |
| `CampaignName` | STRING | FTBP campaign identifier |
| `IsFTBPRegistration` | BOOLEAN | Is FTBP registration |
| `FTBP_Release` | STRING | v1 or v2 |
| `Status` | STRING | Registration status |
| `SubscriptionStatus` | STRING | Current subscription status |
| `FirstPaidOrderDate` | DATE | First paid order (conversion point) |
| `Has_PaidOrdere` | BOOLEAN | Has converted to paid |
| `PaidOrders` | INT | Total paid order count |
| `FreeOrders` | INT | Free order count |
| `TotalCashbackAmount` | DOUBLE | Cashback earned (v1) |
| `FTBPV2_RewardEarned` | DOUBLE | v2 rewards |
| `SignUpOrderType` | STRING | Sub+FreeBags or FBO |
| `CurrentMilestoneLevel` | STRING | Current FTBP milestone |
| `DaysToRegistration` | INT | Days from purchase to reg |

---

## 8. factbeanzroastermotskudata

**Purpose:** Weekly SKU-level sales data by roaster.

| Column | Type | Description |
|---|---|---|
| `WeekNum` | INT | Week number |
| `Week_Start_Date` | DATE | Week start |
| `SKUCODE` | STRING | Product SKU |
| `Flavor` | STRING | Flavour profile |
| `BagSize_KG` | DECIMAL | Bag size in KG |
| `MOT_QTY_SKU` | INT | MOT quantity for this SKU |
| `is_bc` | BOOLEAN | Is Barista's Choice |
| `is_free_trial` | BOOLEAN | Is free trial bag |
| `BC_QTY` | INT | Barista's Choice quantity |
| `NonBC_QTY` | INT | Non-BC quantity |
| `Free_QTY` | INT | Free trial quantity |
| `Tier` | STRING | Roaster tier |

---

## 9. factbeanzorderdailysummary

**Purpose:** Daily order aggregates by product and store.

**⚠️ KNOWN ISSUE (Oct 2025+):** Contains phantom rows with NULL ProductCodeKey, StoreCode, and
BAGSIZE_in_Grams. These ghost rows inflate `OrderedQty` by 40–68% but do NOT affect `OrderedWeight`
(which is also NULL for these rows). For reliable bag counts, use `factbeanzorder` with RateType +
BeanzSkuFlag filters instead. For KG, `SUM(OrderedWeight)` from this table is safe.

**Row count:** ~437K rows. Grain: 1 row per FactDate × ProductCodeKey × StoreCode.

| Column | Type | Description |
|---|---|---|
| `FactDate` | DATE | Order date |
| `ProductCodeKey` | STRING | Product key (NULL for ghost rows from Oct 2025+) |
| `StoreCode` | STRING | Store code (NULL for ghost rows from Oct 2025+) |
| `BAGSIZE_in_Grams` | DECIMAL | Bag size (NULL for ghost rows — **filter this for clean bag counts**) |
| `OrderedQty` | INT | Total bags — **⚠️ UNRELIABLE from Oct 2025+ without BAGSIZE filter** |
| `OrderedWeight` | DECIMAL | Total KG — **safe to use (ghost rows contribute NULL)** |
| `BC_OrderedWeight` | DECIMAL | Barista's Choice KG |
| `NonBC_OrderedWeight` | DECIMAL | Non-BC KG |
| `FreeOrder_OrderedWeight` | DECIMAL | Free order KG |
| `PaidOrder_OrderedWeight` | DECIMAL | Paid order KG |

---

## 10. dimbeanzsubscription

**Purpose:** Subscription records with status and duration.

| Column | Type | Description |
|---|---|---|
| `SubscriptionId` | STRING | PK |
| `SubscriptionStatus` | STRING | Active, Cancelled, Paused |
| `SubscriptionCreationDate` | DATE | Start date |
| `SubscriptionCancelDate` | DATE | Cancel date (if cancelled) |
| `CohortMonth` | STRING | Cohort assignment |
| `SubscriptionDurationDays` | INT | Tenure in days |
| `SubscriptionDurationWeeks` | INT | Tenure in weeks |
| `SubscriptionDurationMonth` | INT | Tenure in months |
| `SubscriptionType` | STRING | Type classification |

---

## 11. factbeanzsubscription

**Purpose:** Subscription event stream (creates, cancels, pauses, resumes).

| Column | Type | Description |
|---|---|---|
| `SubscriptionID` | STRING | Subscription identifier |
| `EventName` | STRING | Event type |
| `EventStatus` | STRING | Event status |
| `EventDate` | DATE | When event occurred |
| `status` | STRING | Current status after event |
| `DropIteration` | INT | Which delivery cycle |
| `CumulativeQuantitySum` | INT | Running total bags |

---

## 12. factbeanzmborders

**Purpose:** Multi-brand equipment and product orders (non-coffee).

| Column | Type | Description |
|---|---|---|
| `OrderNumber` | STRING | Order reference |
| `SKUAmount` | DOUBLE | Revenue amount |
| `RoasterName` | STRING | If roaster-sourced |
| `RoasterFlg` | BOOLEAN | Is roaster order |
| `Is_Drop_Ship_Order` | BOOLEAN | Drop-ship flag |

---

## 13. dimbeanzproduct

**Purpose:** Full product catalog with attributes, pricing, flavour profiles, inventory.

**Row count:** 155,011 rows. **This is a Slowly Changing Dimension (Type 2)** — each `ProductCodeKey`
is unique, but the same physical product (`ItemNumber`) may have multiple versions as attributes change.
155K ProductCodeKeys map to ~41K unique ItemNumbers (~3.75 versions per product on average).

**JOIN safety:** `ProductCodeKey` is 1:1 with `factbeanzorder.ProductCodeKey` — no fan-out risk on the
product side. However, ensure the fact table has RateType filter applied to avoid 6x inflation on that side.

**Key columns:**

| Column | Type | Description |
|---|---|---|
| `ProductCodeKey` | STRING | PK — join to order tables |
| `ProductName` | STRING | Display name |
| `VendorName` | STRING | Roaster name |
| `WEB_BAGSIZE` | STRING | Bag size display |
| `BAGSIZE_in_Grams` | INT | Bag size grams |
| `BAGSIZE_in_KG` | DECIMAL | Bag size KG — **use for KG calculation fallback** |
| `RRP` | DOUBLE | Recommended retail price |
| `RRP_Per_KG` | DOUBLE | Price per KG |
| `ItemPurchasePrice` | DOUBLE | COGS |
| `Product_Margin` | DOUBLE | Margin % |
| `Is_a_BC_SKU` | BOOLEAN | Is Barista's Choice |
| `ftbp_flg` | BOOLEAN | FTBP eligible |
| `AVAILABLE_INVENTORY` | INT | Current stock |
| `INVENTORY_LEVEL` | STRING | Stock level category |
| `WEB_ROASTLEVEL` | STRING | Roast level |
| `WEB_FLAVOURCATEGORY` | STRING | Primary flavour |
| `WEB_REGION_OPTION` | STRING | Origin region |
| `WEB_COUNTRY` | STRING | Origin country |
| `WEB_TASTING_NOTES` | STRING | Tasting notes |

---

## 14. dimbeanzorder

**Purpose:** Order detail attributes (grind, brew method, flavour).

| Column | Type | Description |
|---|---|---|
| `OrderNumber` | STRING | Order reference |
| `SkuCode` | STRING | Product SKU |
| `OrderType` | STRING | Order type |
| `GrindType` | STRING | Grind setting |
| `BrewingMethod` | STRING | Brew method |
| `FlavourNotes` | STRING | Flavour profile |
| `subscriptionVariant` | STRING | Subscription variant |
| `CampaignName` | STRING | Acquisition campaign |
| `Retailer` | STRING | Retailer name |
| `ftbp_Flag` | BOOLEAN | FTBP order |
| `FreeUnits` | INT | Free units count |

---

## 15. factbeanzshipment

**Purpose:** Shipment tracking with SLA and delivery metrics.

| Column | Type | Description |
|---|---|---|
| `ORDERDATE` | INT ⚠️ | **Day-of-week integer (1–7), NOT a calendar date.** `WHERE ORDERDATE >= '2025-01-01'` always returns 0 rows. Use `SHIPPINGDATE` or `DeliveryDate` for date-range filtering. Verified Mar 2026: MIN=1, MAX=7 across 1.28M rows. |
| `SHIPPINGDATE` | TIMESTAMP | Ship date timestamp (e.g. `'2025-06-06 22:25:00'`). **Use for "shipped in period" filtering.** |
| `CARRIERSCANDATE` | TIMESTAMP | First carrier scan timestamp |
| `DeliveryDate` | TIMESTAMP | Delivery date timestamp — use for delivery-based SLA analysis |
| `LeadTime` | INT | Days order → delivery — **primary SLA metric** (CY25: AU≈5.83d, UK≈3.97d, US≈5.72d, DE≈5.17d) |
| `ORDERSLA` | STRING | SLA target |
| `OrderSLAFlg` | BOOLEAN | Met ship-on-time SLA? — **always 100% in CY25; not a useful delivery KPI. Use LeadTime instead.** |
| `CARRIER` | STRING | Carrier name |
| `DELIVERYSTATUS` | STRING | Delivery status |
| `VENDORORGANIZATIONNAME` | STRING | Roaster/vendor name |
| `ShippingFee` | DOUBLE | Shipping fee |
| `COUNTRY` | STRING | Destination country |

---

## 16. factbeanzroastermotsummary

**Purpose:** Weekly MOT (Minimum Order Threshold) by roaster.

| Column | Type | Description |
|---|---|---|
| `Week_Start_Date` | DATE | Week start |
| `WEB_STORE` | STRING | Store identifier |
| `VENDOR_NAME` | STRING | Roaster name |
| `Tier` | STRING | Roaster tier (Platinum, Basic) |
| `MOT_QTY` | INT | MOT quantity for the week |

---

## 17. dimdate

**Purpose:** Calendar and fiscal date dimension. Join via `PK_Date`.

**Key columns:**

| Column | Type | Description |
|---|---|---|
| `PK_Date` | DATE | **Primary key — join OrderDate here** |
| `Month_Name` | STRING | "January 2025" — **use for readable month labels** |
| `FiscalYearNumber` | INT | BRG fiscal year |
| `FY` | STRING | "FY26" label |
| `FiscalHalf` | STRING | H1 or H2 |
| `FiscalQuarter` | STRING | Q1-Q4 |
| `Month_Of_FiscalYear` | INT | 1-12 within fiscal year |
| `IsCurrentFY` | BOOLEAN | Current fiscal year flag |
| `IsLastFY` | BOOLEAN | Last fiscal year flag |
| `RollingYearFlag` | BOOLEAN | Rolling 12-month flag |
| `Week_Ending` | DATE | Week ending date |
