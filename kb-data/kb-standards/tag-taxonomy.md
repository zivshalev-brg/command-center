# Tag Taxonomy

Controlled vocabulary for tags used in the Beanz Knowledge Base. All tags are flat (no namespace prefixes).

## Table of Contents

- [Rules](#rules)
- [Domain Tags](#domain-tags)
- [Entity Tags](#entity-tags)
- [Topic Tags](#topic-tags)
- [Structural Tags](#structural-tags)

---

## Rules

1. Tags are flat — no namespace prefixes (e.g., `payments` not `domain:payments`)
2. Use lowercase with hyphens (e.g., `ai-automation` not `AI_Automation`)
3. All `_index.md` files include the `index` tag
4. Each file gets one domain tag matching its folder name
5. Keep tags to ≤6 per document
6. New tags require adding to this taxonomy first

---

## Domain Tags

One per file, matches the folder name where the file lives.

`architecture` · `analytics` · `ai-automation` · `communications` · `content` · `developer-platform` · `features` · `finance` · `fulfillment` · `legal` · `marketing` · `markets` · `meetings` · `mobile-iot` · `pages` · `partners` · `pricing` · `projects` · `reference` · `security` · `strategy` · `support` · `users` · `ux-design` · `voice-of-customer`

---

## Entity Tags

Specific systems, products, or programs referenced in docs.

`adyen` · `baas` · `bcc` · `beanz-connect` · `blp` · `chargebee` · `coffee-essentials` · `commercetools` · `cordial` · `databricks` · `ftbp` · `fusion` · `mixpanel` · `pbb` · `platinum` · `programs` · `salesforce`

---

## Topic Tags

Cross-domain concepts that appear in multiple folders.

`acquisition` · `action-items` · `ai` · `api` · `automation` · `b2b` · `b2c` · `billing` · `catalog` · `churn` · `cohorts` · `compliance` · `context-engineering` · `conversion` · `cross-border` · `customer` · `data` · `decisions` · `design` · `developer` · `documentation-system` · `email` · `fulfillment` · `growth` · `gtm` · `integration` · `iot` · `kpi` · `lifecycle` · `logistics` · `meeting-notes` · `ml` · `mobile` · `nl-launch` · `onboarding` · `payments` · `performance` · `personalization` · `platform` · `privacy` · `profitability` · `quality-assurance` · `research` · `retention` · `revenue` · `roasters` · `segmentation` · `segments` · `sentiment` · `service` · `sioo` · `sprint-planning` · `subscriptions` · `ux` · `validation` · `voc`

---

## Structural Tags

Tags for navigation and organizational files.

`index` · `navigation` · `snapshot`

| Tag | Description |
|-----|-------------|
| index | Marks _index.md navigation files |
| navigation | General navigation and organizational files |
| snapshot | Marks period-specific data files (FY results, quarterly reviews) |
