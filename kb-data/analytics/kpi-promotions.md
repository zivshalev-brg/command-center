---
title: Promotion KPIs
description: Promotional activity from PBI Promotions Measures — coupon redemptions.
type: analytics
status: in-progress
owner: Product
market:
  - global
tags:
  - kpi
  - promotions
aliases:
  - Promotion Metrics
  - Coupon KPIs
related:
  - "[[kpi-global|Global KPIs]]"
  - "[[kpi-revenue|Revenue KPIs]]"
temporal-type: dynamic
review-cycle: weekly
data-period: "2026-03-05"
kpi_all_redeemed_coupons: 387299
kpi_all_redeemed_coupons_fy2020: 0
kpi_all_redeemed_coupons_fy2021: 22
kpi_all_redeemed_coupons_fy2022: 42097
kpi_all_redeemed_coupons_fy2023: 80341
kpi_all_redeemed_coupons_fy2024: 113056
kpi_all_redeemed_coupons_fy2025: 113490
kpi_all_redeemed_coupons_cumulative: 387299
kpi_unique_redeemed_coupons: 61532
kpi_unique_redeemed_coupons_fy2020: 0
kpi_unique_redeemed_coupons_fy2021: 19
kpi_unique_redeemed_coupons_fy2022: 11084
kpi_unique_redeemed_coupons_fy2023: 18940
kpi_unique_redeemed_coupons_fy2024: 14409
kpi_unique_redeemed_coupons_fy2025: 25783
kpi_unique_redeemed_coupons_cumulative: 61532
kpi_source: "pbi"
kpi_pbi_model: "BeanzCoreDatabricks"
kpi_pbi_refresh: "2026-03-15 22:37:14.447000"
kpi_data_as_of: "2026-03-05 00:00:00"
kpi_refresh_timestamp: "2026-03-15T12:03:28Z"
kpi_all_redeemed_coupons_desc: "Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2020_desc: "FY2020 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2021_desc: "FY2021 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2022_desc: "FY2022 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2023_desc: "FY2023 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2024_desc: "FY2024 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_fy2025_desc: "FY2025 full year: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_all_redeemed_coupons_cumulative_desc: "All-time cumulative value of: Count of non-blank CouponCode rows in DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_desc: "Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2020_desc: "FY2020 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2021_desc: "FY2021 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2022_desc: "FY2022 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2023_desc: "FY2023 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2024_desc: "FY2024 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_fy2025_desc: "FY2025 full year: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_unique_redeemed_coupons_cumulative_desc: "All-time cumulative value of: Distinct CouponCode from DimPromotionDetails, mapped to visible orders via TREATAS."
kpi_prior_period: null
---
# Promotion KPIs

Tracks promotional activity using PBI Promotions Measures. Covers total coupon redemption count and unique coupon redemption count across all beanz.com markets.

## Data Notes

- **All Redeemed Coupons** counts every redemption event, including multiple uses of the same coupon code by different customers.
- **Unique Redeemed Coupons** counts distinct coupon codes that have been redeemed at least once. The ratio of all-to-unique indicates average redemptions per coupon.
- Coupon data comes from the FactCoupon table. Discount dollar impact on revenue is captured in [[kpi-revenue]] via `kpi_order_discount`.

## PBI Measures

This doc draws from the **Promotions Measures** folder in BeanzCoreDatabricks:

- Count of All Redeemed Coupons
- Count of Unique Redeemed Coupons

## Related Files

- [[kpi-global|Global KPIs]] - Aggregate view across all domains
- [[kpi-revenue|Revenue KPIs]] - Discount impact on order value and net sales
