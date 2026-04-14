**Last Updated:** November 2, 2025

---

## About This Glossary

This comprehensive glossary contains terms and acronyms from the Beanz ecosystem and broader Breville Group (BRG). It serves as a reference for AI tools, team members, and documentation.

---

## Quick Navigation

Jump to section:

* [Core Business Terms](#core-business-terms)
* [Customer Segmentation & Cohorts](#customer-segmentation--cohorts)
* [Technical Systems & Platforms](#technical-systems--platforms)
* [Data & Analytics Platforms](#data--analytics-platforms)
* [Marketing & CDP](#marketing--cdp)
* [Load Balancing & Algorithm](#load-balancing--algorithm)
* [Pricing & Promotions](#pricing--promotions)
* [Product & UX Terms](#product--ux-terms)
* [Regional & Market Terms](#regional--market-terms)
* [EU Compliance & Legal](#eu-compliance--legal)
* [Breville-Wide Business](#breville-wide-business)
* [Engineering & Development](#engineering--development)
* [Agile & Software Development](#agile--software-development)
* [Team Names](#team-names)
* [Shipping & Fulfillment](#shipping--fulfillment)
* [Translation & Localization](#translation--localization)
* [PBB Partners & Vendors](#pbb-partners--vendors)
* [AWS Infrastructure](#aws-infrastructure)
* [Testing & Quality](#testing--quality)
* [Architecture Patterns](#architecture-patterns)
* [All Other Categories](#additional-categories)

---

## Core Business Terms

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **AOV** | Average Order Value | Average revenue per order |
| **BaaS** | Beanz as a Service — platform strategy to offer beanz capabilities as services to partners | Core business model |
| **BC** | Barista's Choice | Beanz's subscription service where customers receive curated coffee selections. **NOTE:** Can also mean "Business Case" in non-Beanz contexts |
| **BCC** | Beanz Control Center — self-service B2B portal for roasters, PBB partners, and Beanz managers (replacing RCC) | Rebuilt version of RCC; one-stop shop for roasters and Beanz managers |
| **Beanz Connect** | Roaster fulfillment integration layer (Shopify, WooCommerce, ShipStation) | Stream focused on enabling seamless connections with roasters. Part of Beanz Hub |
| **Beanz Hub** | Umbrella term for B2B stream of work | Includes BCC, Beanz Connect, and PBB |
| **BLP** | Beanz Label Printing | Streamlining and automating label production for partners |
| **BLP Pilot Test** | Beanz Label Printing pilot phase | Testing phase before full rollout |
| **BRG** | Breville Group — parent company owning beanz.com | Breville Group Limited is an Australia-based company engaged in designing, developing and marketing small electrical kitchen appliances across the globe. |
| **CM** | Contribution Margin | Financial metric. **NOTE:** Can also mean "Category Manager" in product contexts |
| **Collection** | Curated product listings | Price Tier, Flavor Profile, Brew Method, Bag Size, Geography, Single Origin, Seasonal/Festive, etc. Setup in Algolia and used for Product Category Pages and alos Barista's Choice. |
| **Cross-Border Shipping** | Ability to ship between countries | e.g., Netherlands ↔ Germany |
| **FTBP** | Fast Track Barista Pack | Breville/Sage promotion offering free and discounted coffee beans from beanz.com |
| **FTBP v1** | Fast Track Barista Pack Cashback Program | Launched September 2024. Breville/Sage promotion offering 2 free bags and then cashback for ongoing orders on Beanz (cashback provided through the Hyperwallet service) |
| **FTBP v2** | Fast Track Discount Program | Launched October 2025. Breville/Sage promotion offering 2 free bags and then an upfront discount on ongoing orders on Beanz. Achieves 16.5% paid conversion (vs v1's 11.4%) |
| **LTV** | Lifetime Value — total revenue expected from a customer over their lifetime | Total revenue expected from a customer over their lifetime |
| **MOT** | Minimum Order Target | Weekly guaranteed minimum order volume committed to each roaster partner, calculated in Kilograms. |
| **MRR** | Monthly Recurring Revenue | Key subscription metric |
| **MOT Progress** | Tracking metric for MOT achievement | Monitors performance against minimum order commitments |
| **NV** | Not Visible | Web status for products |
| **OOS** | Out of Stock | Inventory / Web status for products |
| **PBB** | Powered by Beanz — retail partner and manufacturer integration program | Integration layer with retail partners and manufacturers |
| **Pre-allocation** | Advance order assignment — batch process that assigns orders for the upcoming week | Batch process that assigns orders for upcoming week |
| **RCC** | Roaster Control Centre | Legacy Salesforce portal for roasters (being replaced by BCC) |
| **Roaster** | Coffee roasting partner | Supplies coffee to Beanz |
| **SKU** | Stock Keeping Unit | Unique identifier for each specific coffee product (roaster + coffee + size) |
| **Tier** | Partner classification level | Platinum vs Basic (two-tier model as of October 2025, replacing legacy Gold/Silver/Bronze contribution scoring) |
| **Platinum Roaster** | Top-tier roaster partner receiving guaranteed volume and preferential terms | 5–7 roasters per region selected as strategic partners. Receive guaranteed volume commitments, preferential wholesale pricing, early access to new machines, enhanced beanz.com visibility, and PBB priority. In return, commit to Reverse Fast Track sales, content creation, operational excellence (95%+ SLA, 50%+ margin), and event support. Launched October 2025, 18 signed as of FY26H1 |
| **Basic Roaster** | Standard-tier roaster partner | All roasters not in Platinum tier. Standard beanz.com partnership terms without volume guarantees |
| **Reverse Fast Track Sales** | Platinum roaster commitment to sell Breville machines bundled with coffee | Roasters sell Breville espresso machines and grinders as a bundle with beans and training, both online and in-store. Drives incremental machine sales for BRG. Generated $1M in FY26H1 |
| **Quarterly Business Plan** | Collaborative planning between beanz and Platinum roasters | Agreement on quarterly delivery targets, content commitments, event activations, and KPIs. Reviewed quarterly to assess performance. All requests go through regional beanz managers |
| **ARR** | Annual Recurring Revenue | Total annual value of active subscriptions. Key metric: CY25 ARR was $13.5M AUD (+61% YoY) |
| **Beanz 2.0** | Redesigned beanz.com platform optimized for retention and global rollout | Purpose-built to convert, retain, and scale globally. Features include enhanced Perfect Match quiz, revamped Barista's Choice, personalized welcome notes, and dynamic location-aware shopping. Launched FY26 |
| **Oracle Series** | Breville's premium espresso machine line | High-end machines. Oracle owners over-index in revenue: 21% of FTBP revenue despite only 5% of machine sell-out volume. High-value customer segment |
| **Barista Series** | Breville's mid-range espresso machine line | Core product line. Barista machines account for 70% of machine sell-out, 68% of FTBP customers, 64% of FTBP revenue |
| **Bambino Series** | Breville's entry-level espresso machine line | Entry machines. Bambino accounts for 20% of machine sell-out, 12% of FTBP customers, 11% of FTBP revenue |
| **Drip** | Drip coffee makers | Non-espresso machines. Small share: 4% sell-out, 2% customers, 2% revenue |
| **TOOS** | Temporarily Out of Stock | Inventory / Web status for products |
| **Two-Phase Allocation** | Load balancing algorithm phase structure | Phase 1: prioritizes roasters below MOT; Phase 2: optimizes surplus distribution |
| **VBNFS** | Visible but not for Sale | Web status for products |
| **VFS** | Visible for Sale | Web status for products |

---

## Customer Segmentation & Cohorts

_Stakeholder-approved customer segments and cohorts for personalized experiences and analytics_

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **SEG-X.Y.Z** | Customer Segment ID | 16 lifecycle segments with experience levels. Format: SEG-1.X.Y where 1=B2C, X=lifecycle stage (1-8), Y=experience (1=Novice, 2=Experienced) |
| **COH-X.Y** | Customer Cohort ID | Time-based or program-based customer groupings. X=cohort category (1-4), Y=specific cohort. Used for comparative analytics and cohort-specific messaging |
| **Segment** | Customer grouping by shared characteristics (SEG-X.Y.Z IDs) | Current behavioral state. Mutable classification that changes as customer behavior changes. Distinct from "Segment (CDP)" which refers to BlueConic groups |
| **Cohort** | Customer grouping by lifecycle stage or coffee experience (COH-X.Y IDs) | Fixed grouping that never changes (when/how customer joined). Used for performance tracking and comparative analysis |
| **Novice** | Experience level indicator (.1) | New to specialty coffee, needs education, guidance, brew help, product intro. Less coffee knowledge, more hand-holding required |
| **Experienced** | Experience level indicator (.2) | Coffee enthusiast, knows preferences, wants efficiency, personalization. Self-sufficient, explores variety, uses advanced features |
| **Lifecycle Segment** | Position in customer journey | From New Customer (SEG-1.1) through Loyalist (SEG-1.5) or churn states (At Risk, Inactive, Trial Not Converted) |
| **SEG-1.1.x** | New Customer | Not yet purchased/subscribed. Split: .1 (Novice - needs education), .2 (Experienced - wants efficiency) |
| **SEG-1.2.x** | Trialist (Active) | Received 2 free bags, within trial period, setting up subscription. Split: .1 (needs brew help), .2 (quick setup) |
| **SEG-1.3.x** | New Subscribers | First 2 deliveries post-trial, learning subscription management. Split: .1 (needs education), .2 (familiar with subs) |
| **SEG-1.4.x** | Active Subscribers | 3+ deliveries, 3+ months subscribed, regular ordering. Split: .1 (ongoing education), .2 (wants personalization) |
| **SEG-1.5.x** | Loyalist | 6+ deliveries, 6+ months subscribed, consistent engagement. Split: .1 (developed preferences), .2 (enthusiast explorer) |
| **SEG-1.6.x** | At Risk | Paused subscription, discount ending, disrupted ordering patterns. Split: .1 (needs support), .2 (needs value reminder) |
| **SEG-1.7.x** | Inactive | 3+ months no order, unsubscribed, was previously active subscriber. Split: .1 (needs win-back), .2 (needs incentive) |
| **SEG-1.8.x** | Trial Not Converted | Took 2 free bags but never made paid purchase. Split: .1 (needs barrier removal), .2 (needs value demo). Key metric: Beanz Conversion |
| **Beanz Conversion** | FTBP conversion metric — customer paid for at least one order (not just free trial bags) | Critical KPI for FTBP program ROI |
| **Segment Transition** | Movement between lifecycle segments | Triggered by behavioral events (e.g., first purchase, subscription created, 90 days inactive) |
| **Multi-Segment Membership** | Customer can be in multiple dimensions | Every customer has one lifecycle segment (SEG-1.X) AND one experience level (.Y) simultaneously |
| **Market Entry Cohort (COH-1.x)** | When customer joined by market launch | COH-1.1 AU Launch, COH-1.2 UK Launch, COH-1.3 US Launch, COH-1.4 DE Launch, COH-1.5 NL Launch (July 2026) |
| **Program Cohort (COH-2.x)** | Promotional program enrollment | COH-2.1 FTBP v1 (Cashback), COH-2.2 FTBP v2 (Discount), COH-2.3 Campaign X. Used to compare program effectiveness |
| **Appliance Cohort (COH-3.x)** | BRG appliance ownership | COH-3.1 Breville, COH-3.2 Sage, COH-3.3 Baratza, COH-3.4 Lelit, COH-3.5 Multi-Appliance. Enables appliance-specific personalization |
| **Channel Cohort (COH-4.x)** | Acquisition source | COH-4.1 Direct Website, COH-4.2 BRG Brand Referral, COH-4.3 PBB Partner, COH-4.4 Gift Recipient. Tracks channel performance |
| **Multi-Cohort Membership** | Customer can belong to multiple cohorts | e.g., COH-1.5 (NL Launch) + COH-2.2 (FTBP v2) + COH-3.1 (Breville Owner) simultaneously |
| **Segment-Based Content** | Personalized content for lifecycle segment | Homepage hero for SEG-1.1 (New) vs SEG-1.5 (Loyalist) shows different messaging |
| **Cohort-Based Messaging** | Communications tailored to cohort | FTBP v1 cohort (COH-2.1) gets cashback messaging; FTBP v2 (COH-2.2) gets discount messaging in emails |

**Key Distinction:**
- **Lifecycle Segments (SEG-X.Y.Z)** = Current behavioral state, changes over time, used for feature/email targeting
- **Customer Cohorts (COH-X.Y)** = Fixed acquisition context, never changes, used for analytics and cohort-specific messaging
- **Segment (CDP)** = BlueConic customer groups (different from lifecycle segments)

---

## Technical Systems & Platforms

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Adyen** | Payment gateway processing transactions across all markets | Processes transactions across all beanz.com markets |
| **AEM** | Adobe Experience Manager | Content & digital asset management; platform for Breville website |
| **Algolia** | Search and discovery engine | Used for product search, filtering, BC collections, and recommendation engine. Includes legacy product filtering and scoped rule contexts |
| **ASN** | Advanced Ship Notice | Notification of pending deliveries sent electronically; common EDI document |
| **AWS** | Amazon Web Services | On-demand cloud computing platforms and APIs |
| **Brandfolder** | Digital asset management system | DAM platform for organizing and distributing brand assets |
| **CDP** | Customer Data Platform | System consolidating customer data across all channels (see BlueConic) |
| **Cloudflare** | CDN and web infrastructure platform | Content delivery network and security platform providing caching, DDoS protection, and performance optimization for Breville/Sage/Beanz websites. Used for cache invalidation via tags. |
| **CMS** | Content Management System | System for managing creation/modification of digital content |
| **CommerceTools (CT)** | Headless commerce platform | Powers beanz.com storefront |
| **Core Centric** | File-based integration partner | Legacy integration system |
| **Cornerstone** | HRIS system | Human resources information system |
| **Coupa** | Invoice automation platform | Used for JLP PBB invoicing workflow |
| **CRM** | Customer Relationship Management | Technology for managing company relationships & customer interactions |
| **D365** | Microsoft Dynamics 365 | ERP system: enterprise resource planning and CRM intelligent business applications. Includes BYOD (Bring Your Own Database) for data entity publishing |
| **DAM** | Digital Asset Management | Tool for organizing, managing, distributing digital assets (images, videos, PDFs) |
| **Data Masons** | EDI platform | Legacy EDI integration platform |
| **Databricks** | Cloud-based data analytics platform | Used for BRG's data lake and warehouse (Bronze/Silver/Gold layers) |
| **DynamoDB** | AWS NoSQL database service | Database technology |
| **EDI** | Electronic Data Interchange | Electronic interchange of business information using standardized format |
| **Endicia** | USPS shipping service provider | Used by US roasters for USPS fulfillment |
| **ERP** | Enterprise Resource Planning | Software for managing day-to-day activities: accounting, procurement, risk, compliance, supply chain |
| **Impact Radius** | Affiliate/partner marketing platform | Platform for managing affiliate partnerships |
| **Jitterbit (JB)** | Middleware integration platform | Integration layer |
| **Logic Apps** | Azure integration service | Microsoft Azure's workflow automation and integration platform |
| **Microsoft Sentinel** | Security information and event management | SIEM platform for security operations |
| **Next.js** | Frontend framework | Used for Beanz and Breville websites. Supports App Router (React Server Components) and Pages Router |
| **OAuth** | Open Authorization | Industry standard protocol for secure authentication/authorization |
| **Omnivore** | Australian middleware integration platform | E-commerce to marketplace connector |
| **PIM** | Product Information Management | Processes/systems for managing product information through distribution channels |
| **PIM Core** | Open source tool | Used to build Breville PIM |
| **S3** | Amazon Simple Storage Service | AWS storage |
| **Commercetools** | Headless commerce platform powering beanz.com storefront | CommerceTools (CT) is the core commerce engine. **NOTE:** Previously appeared as "CommerceTools (CT)" — normalized to "Commercetools" per KB standard |
| **Lifecycle cohort** | Subscription journey stage (New Customer → Trialist → Active → Loyalist → At Risk → Inactive) | Used for lifecycle-based analytics and targeting |
| **Coffee experience cohort** | Coffee knowledge level (Novice, Experienced) — orthogonal to lifecycle | Splits each lifecycle segment into two experience levels (.1 Novice, .2 Experienced) |
| **Salesforce** | CRM — used for RCC (legacy) and customer support | Cloud-based CRM & enterprise applications for customer service, marketing, analytics. Includes CRMA (CRM Analytics). **NOTE:** Can also be abbreviated as SF |
| **ShipStation** | Shipping management platform used in Beanz Connect | Integration for shipping |
| **Shopify** | E-commerce platform | Used by roasters for fulfillment |
| **SignifyD** | Fraud detection/prevention service | Fraud protection for e-commerce transactions |
| **Silktide** | Accessibility testing and compliance platform | Web accessibility platform used to measure and improve WCAG compliance across Breville/Sage/Beanz websites. Provides automated scanning, reporting, and remediation guidance. |
| **Databricks** | Cloud data lakehouse for analytics and reporting | BRG's data lake and warehouse platform (Bronze/Silver/Gold medallion architecture) |
| **Syndigo** | Product syndication platform | Platform for syndicating product data to retailers |
| **Vercel** | Cloud platform for Next.js deployment | Hosting platform for Breville/Sage websites |
| **Voucherify** | Promotion and voucher management platform | Used for FTBP and other promotional campaigns |
| **Windhorn** | API-based integration partner system | Integration platform for partner connections |
| **WooCommerce** | WordPress e-commerce platform | Alternative to Shopify |
| **Zenkraft** | Shipping and tracking service | Integration |
| **Zenstores** | Fulfillment platform | Used by some UK roasters |
| **Zscaler** | Cloud security platform | Security and access control platform |

---

## Data & Analytics Platforms

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Bronze Layer** | Raw data ingestion layer in Databricks | First layer in medallion architecture (Bronze → Silver → Gold) |
| **BYOD** | Bring Your Own Database | D365 feature for publishing data entities to external database |
| **CRMA** | CRM Analytics | Salesforce analytics platform for reporting within Salesforce |
| **Cube** | Analytical tool combining facts and dimensions | Enables multidimensional analysis of data (e.g., Breville_Core cube) |
| **Data Alchemy** | Data transformation service | Service for transforming raw data into processed formats |
| **Databricks** | Cloud-based data analytics platform | BRG's data lake and warehouse platform. Uses medallion architecture |
| **Data Mart** | Focused subset of data warehouse | Specialized data repository for specific business function or department |
| **EDW** | Enterprise Data Warehouse | Centralized, trusted data foundation integrating all corporate data |
| **Fabric** | Microsoft Fabric | Data analytics platform evaluated as alternative to Databricks |
| **Gold Layer** | Final, business-ready data layer in Databricks | Curated data optimized for reporting and analytics |
| **Krunchbox** | Third-party sell-out data platform | Receives and processes retailer sales data for BRG |
| **Medallion Architecture** | Bronze/Silver/Gold data layering pattern | Three-tier data refinement architecture in data lakes |
| **Mixpanel** | Product analytics platform | Tracks user interactions and behaviors on Breville/Beanz websites |
| **Planful** | Financial planning and budgeting platform | Formerly Host Analytics. Used for financial planning |
| **Raw Data Zone** | Initial data ingestion layer | Precedes Bronze layer in data pipeline |
| **Silver Layer** | Cleaned and validated data layer in Databricks | Middle layer in medallion architecture (Bronze → Silver → Gold) |
| **Vanguard** | Supply & Operations Planning system | S&OP system for demand and supply planning |

---

## Marketing & CDP

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Adobe Launch** | Tag management system | Platform for managing marketing and analytics tags |
| **BlueConic** | Customer Data Platform (CDP) | Platform for creating unified customer profiles across all touchpoints |
| **Connection** | BlueConic integration type | Pushes/pulls data between BlueConic and other systems (e.g., Marketing Cloud) |
| **Cordial** | Email and messaging platform | Customer communications platform for beanz.com |
| **Data Extension** | Marketing Cloud data table | Stores subscriber/customer data in Salesforce Marketing Cloud |
| **FreshPaint** | Server-side tracking platform | Analytics and tag management with server-side tracking |
| **Hotjar** | Analytics/heatmap tool | User behavior analytics and feedback tool |
| **Inbound Integration** | Data flowing into BlueConic | Sources include Salesforce, Azure Data Lake, Marketing Cloud |
| **Marketing Cloud** | Salesforce Marketing Cloud | Email marketing and customer journey platform |
| **Segment (CDP)** | Customer group with shared attributes in BlueConic | Defined in BlueConic and pushed to Marketing Cloud as audiences. **NOTE:** Different from Lifecycle Segments (SEG-X.Y.Z) used for behavioral state tracking |
| **Unified Customer Profile** | Single view of customer | Combines data from multiple sources in BlueConic CDP |

---

## Load Balancing & Algorithm

_Specialized terms for the Beanz subscription allocation algorithm and MOT system_

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Allocation Score** | Weighted calculation to prioritize SKUs | Based on multiple factors (MOT progress, stock, partner scores) |
| **Audit Trail** | Complete record of all allocation decisions | Includes financial data for transparency |
| **Batch** | Group of orders processed together | Orders grouped for shipping fulfillment |
| **Catalog Exhaustion** | Customer has received all available SKUs in their collection | Triggers fallback logic |
| **Constraint** | Business rule limiting which SKUs can be allocated | e.g., Never Repeat, Roaster Variety |
| **Fallback Hierarchy** | Sequential constraint relaxation when no valid SKU found | Roaster Variety → Flavor → Availability → Never Repeat → Manual |
| **Merchandising Score** | Data-driven score (-100 to +100) | Boosts specific SKUs for seasonal promotions |
| **Never Repeat** | Core constraint | Prevents customers receiving same SKU until they've tried all others |
| **p99** | 99th percentile performance metric | 99% of requests meet this threshold |
| **Pre-allocation** | Advance order assignment — batch process that assigns orders for the upcoming week | Assigns orders for upcoming week in advance |
| **Roaster Variety** | Constraint | Prevents consecutive orders from same roaster |
| **Scoring Formula** | Weighted calculation | Prioritizes SKUs based on multiple factors |
| **Two-Phase Allocation** | Load balancing algorithm — Phase 1 prioritizes roasters below MOT; Phase 2 optimizes surplus distribution | Core algorithm structure |

---

## Pricing & Promotions

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Campaign** | Promotional offer with defined rules | Managed in Voucherify with start/end dates |
| **Campaign Tag** | Metadata for targeted cache invalidation | Cloudflare cache tag associated with pricing campaigns in Voucherify. When campaign starts/ends/changes, tag is used to selectively invalidate only affected cached pages rather than entire cache. Enables dynamic pricing without performance impact. |
| **Project Fusion Plan A** | Pilot AU retail only discount program | Pilot program which was run with The Good Guys in Australia as a test and learn for upfront machine discount. |
| **Project Fusion Plan B** | The initial Cashback pilot program | Breville/Sage promotion offering 2 free bags and then cashback for ongoing orders on Beanz (cashback provided by the Opia agency). |
| **FTBP** | Fast Track Barista Pack | Breville/Sage promotion offering 2 free bags of coffee to new customers with machine purchase |
| **FTBP v1** | Fast Track Barista Pack Cashback Program | Launched September 2024. Breville/Sage promotion offering 2 free bags and then cashback for ongoing orders on Beanz (cashback provided through the Hyperwallet service) |
| **FTBP v2** | Fast Track Discount Program | Launched October 2025. Breville/Sage promotion offering 2 free bags and then an upfront discount on ongoing orders on Beanz. Achieves 16.5% paid conversion (vs v1's 11.4%) |
| **OPIA** | Sales promotion agency | Opia provided the registration and cashback service for the initial Project Fusion. |
| **Multi-Price** | Country-specific pricing within single storefront | Capability enabling same SKU to display different prices based on customer's selected delivery country while remaining on single storefront (e.g., Sage DE shows different pricing for Germany vs. Austria delivery). Required for EU Geo-blocking Regulation compliance. Implementation uses delivery address to determine applicable price group (e.g., RRP_VAT_DE for Germany). |
| **Price Group** | D365 pricing construct | Manages different pricing by channel/region (e.g., RRP_VAT_DE) |
| **Price per kg** | Legal unit price display | EU requirement to show price per kilogram for products sold by weight |
| **RRP** | Recommended Retail Price | Standard price before any discounts or promotions |
| **RRP_VAT_DE** | Germany-specific RRP price group with VAT | D365 price group format for German market pricing including VAT. Format pattern: RRP_VAT\_{COUNTRY_CODE}. Used in multi-price implementation for EU markets. |
| **Voucherify** | Promotion management platform | Manages campaigns, vouchers, and eligibility rules |

---

## Product & UX Terms

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Buy Stack** | Quick purchase options | On Product Detail Page |
| **Country Selector** | UI component for country/market selection | Allows users to choose delivery country and see appropriate pricing |
| **CLP** | Category Listing Page — PLP-type experience for specific product categories (Large Bags, Festive Coffee) | Page type term used in pages domain |
| **Interstitial Page** | Transitional page between navigation points | Page displayed between user actions, often used for confirmation, information gathering, or user flow management (e.g. FTBP coffee selection options displayed between PDP and Cart when a customer select an Espresso machine on breville.com). |
| **Legacy Product** | Discontinued product | Still supported for spare parts purchases but hidden from main navigation |
| **LPE** | Landing Page Experience | Marketing/product page serving as entry point for a specific product category, campaign, or theme (e.g., Product Hub LPE, FTBP LPE). Distinguished from standard product pages by focus on discovery and education rather than immediate transaction. |
| **PDP** | Product Detail Page — Individual coffee product page with details, reviews, and add-to-cart | View detailed product information. |
| **PHLP** | Product Hub Landing Page | Specific LPE serving as centralized entry point for product support, spare parts, and product information. URL: (verify current Breville Product Hub URL) |
| **PLP** | Product Listing Page — Shop Coffee page showing all available products with filters | Browse all products in catalog |
| **RLP** | Roaster Listing Page | Browse all roasters on the Beanz website, a roaster directory |
| **RDP** | Roaster Detail Page | Detailed profile page for individual coffee roasters on Beanz, showing roaster story, location, coffee offerings, and partnership information. Accessible via roaster name clicks from RLP. |
| **Scoped Rule Context** | Algolia contextual search rules | Algolia feature enabling different search rules for specific page contexts. Allows showing/hiding products based on context (e.g., legacy products visible only on spare parts pages, not main shop). Configured per search implementation with context parameter. |
| **UX** | User Experience | Design process for meaningful, relevant experiences |
| **UI** | User Interface | Screen/fascia for user-appliance interaction |

---

## Regional & Market Terms

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **ANZ** | Australia New Zealand | Breville operations zone |
| **APAC** | Asia Pacific | Breville operations zone |
| **AU** | Australia | Country code |
| **BCA** | Breville Canada | Country code for internal communication & financial tracking |
| **BDE** | Breville Germany | Country code for internal communication & financial tracking. Deutschland. **NOTE:** Can also refer to Germany direct-to-consumer e-commerce channel code in system configuration (PIM, D365, CT) |
| **BDE Channel** | Breville Germany direct-to-consumer channel | E-commerce channel code for German webstore (distinct from BDE region code). Used in PIM, D365, and commerce systems for Germany-specific configurations. **NOTE:** BDE can refer to either region or channel depending on context. |
| **BEU** | Breville Europe | Regional designation for European operations |
| **BIE** | Breville Ireland | Country code for internal communication & financial tracking |
| **BMX** | Breville Mexico | Country code for internal communication & financial tracking |
| **BNZ** | Breville New Zealand | Country code for internal communication & financial tracking |
| **BUK** | Breville UK | Country code for internal communication & financial tracking |
| **BUS** | Breville US | Country code for internal communication & financial tracking. **NOTE:** Can also mean "Business Systems" (GITBL code) |
| **DE** | Germany | Deutschland. **NOTE:** Can also mean "Delivery Excellence" (Breville domain) in non-market contexts |
| **EMEA** | Europe, Middle East, and Africa | Breville operations zone; sales region for 240v 'Sage' branded SKU |
| **EU** | European Union | Regional grouping |
| **NA** | North America | Breville operations zone |
| **NL** | Netherlands — launching July 2026 | Country code |
| **ROW** | Rest Of World | Campaigns/purchasing not in core regions (ANZ, USCM, EMEA) |
| **UK** | United Kingdom | Country code |
| **US** | United States | Country code |
| **USCM** | United States, Canada, Mexico | Sales region for 120v 'Breville' branded SKU |
| **VAT** | Value Added Tax | European tax |
| **GST** | Goods and services tax | Australian tax |

---

## EU Compliance & Legal

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **CCPA** | California Consumer Privacy Act | California privacy law |
| **DSAR** | Data Subject Access Request | Request for personal data under privacy regulations |
| **EU Data Act** | EU regulation on data transparency | Requires transparency for IoT/connected products; mandates data sharing capabilities |
| **Geo-blocking** | Restricting content by geographic location | Must comply with EU Geo-Blocking Regulation 2018/302 |
| **Geo-Blocking Regulation** | EU Regulation 2018/302 | Prevents discrimination based on customer's nationality, residence, or place of establishment |
| **Price per kg** | Legal unit pricing requirement | EU law requiring unit price display for products sold by weight |
| **VAT Transparency** | Clear display of VAT in pricing | EU requirement to show prices inclusive of VAT with breakdown |

---

## Breville-Wide Business

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **BC** | Business Case | Justification for undertaking project; evaluates benefit, cost, risk. **NOTE:** Can also mean "Barista's Choice" in Beanz context |
| **BOM** | Bill of Material | List of raw materials, sub-assemblies, parts needed to manufacture product |
| **BOV** | Breville Oven | High-end countertop oven devices, some IoT enabled |
| **BRG** | Breville Group — parent company owning beanz.com | Parent company |
| **BV** | Breville | Company abbreviation |
| **BVL** | Breville | Used in Figma Designs |
| **CM** | Category Manager | Product Management role for new products. **NOTE:** Can also mean "Contribution Margin" |
| **CNY** | Chinese New Year | Occurs late January/Early February; date varies annually |
| **CTA** | Call To Action | Element designed to promote immediate response (text, button) |
| **DC** | Distribution Centre | Warehouses where products arrive; Breville/Sage or external distributors |
| **DDDDL** | Dave Davenport Design Direction Lead | Leadership role |
| **DFM** | Design for Manufacturability | Designing for cheaper/easier manufacturing |
| **DFMA** | Design for Manufacturability and Assembly | Designing packaging to be cheaper, easy to manufacture/assemble |
| **DL** | Domain Lead | Leadership role |
| **DLS** | Design Language System | Collection of design principles, assets, usage guidelines |
| **DRM** | Design Review Meeting | Meeting type |
| **DU** | Design United | In-house graphics team |
| **EB** | Engineering Build | Between WS and PP builds; extensive testing |
| **EDER** | Early Detection Early Resolution | Process |
| **EE** | Electrical Engineering / Electrical Engineer | Department or person |
| **FACM** | Fully Automatic Coffee Machine | Market segment |
| **FGM** | Functional General Manager | Heads of Product Management, Design, Engineering, Quality, Commercial, Process |
| **FMEA** | Failure Modes and Effects Analysis | Systematic proactive method for evaluating process failures |
| **FOB** | Free On Board / Freight on Board | Cost of appliance in finished box on shipping boat |
| **FPY** | First Pass Yield | Units coming out vs going into process over time |
| **FSR** | First Shipment Release | Milestone |
| **FW** | Firmware | Software |
| **GEW** | Factory in Dongguan | Manufactures sensibility toaster |
| **GM** | General Manager | Ensures minimum standards for Consumer Experience, Design, Engineering, Quality, Safety |
| **GP** | Global Product | Breville department: Product Leadership, Commercial, Design, Engineering, Quality, PM, L&D, Sustainability |
| **GPO** | Global Product Officer | Leadership role |
| **GRT** | Gate Review Team | Review body |
| **H1** | Half 1 | First half of year |
| **H2** | Half 2 | Second half of year |
| **HMW** | How might we... | Question format to promote broad responses |
| **LOP** | Labour, Overhead and Profit | Financial metric |
| **MMI** | Multi-media interface / Machine Man Interface | Touch screen on product; analog/digital consumer interface |
| **MP** | Mass Production | When factory makes appliances for actual sale |
| **NN** | Nespresso | Abbreviation |
| **OEM** | Original Equipment Manufacturer | Company making products for another to sell under their name |
| **OPD** | Overseas Product Development | Function |
| **OPV** | Over Pressure Valve | Valve in espresso machines limiting hot water pressure |
| **OTA** | Over The Air | Firmware delivery method for internet-connected appliances |
| **PCB** | Printed Circuit Board | Circuit without components |
| **PCBA** | Printed Circuit Board Assembly | PCB with all components assembled |
| **PE** | Production Engineering | Factory teams determining feasibility, logistics, equipment for production |
| **PG** | Product Graphics | Usually created by Design United |
| **PGM** | Portfolio General Manager | Leadership role |
| **PDM** | Product Development Manager / Product Data Management | Focus on project delivery / software for CAD data management |
| **PID** | Proportional Integral Derivative controller | Temperature controller in espresso machines using advanced algorithm |
| **PLM** | Product Lifecycle Management | Information management system integrating data, processes, systems, people throughout product lifecycle |
| **PMO** | Project Management Office | In Agile org: supports frameworks, grooming, capacity tracking, team empowerment |
| **PRD** | Product Requirements Document | Document with all product requirements |
| **PDP (Process)** | Product Development Process | Breville's bespoke process |
| **PDS** | Product Development Schedule | Timeline |
| **PSR** | Project Status Report | Issued fortnightly to SLT |
| **PP** | Pilot Production | Practice build before mass production; 99% same as finished product |
| **PR** | Production Release | Milestone |
| **QC** | Quality Control | Process to ensure quality maintained/improved |
| **QE** | Quality Engineering | Breville or supplier team |
| **QPR** | Quarterly Project Report | Reporting |
| **SDA** | Small Domestic Appliance | Product category |
| **SGF** | Stage Gate Forum | Review forum |
| **SME** | Subject Matter Expert | Person with deep knowledge who can be consulted |
| **SMT** | Simatelex | Factory in Shenzhen; manufactures espresso machines, Nespresso, pizza oven |
| **SLT** | Sur La Table OR Senior Leadership Team | Context dependent |
| **SPD** | Sourced Product | Products with Breville branding developed by others |
| **T1** | Off Tool Sample 1 | First prototype using mass production tooling |
| **T2, T3, T4...** | Off Tool Sample 2, 3, 4... | Subsequent prototypes with updates |
| **TC** | Telephone Conference | Meeting via phone/web service |
| **TK** | Test Kitchen | Now GPDK (Global Product Development Kitchen) |
| **VC** | Video Conference | Meeting via video/web service |
| **V+V** | Verification and Validation | Testing process |
| **WS** | Working Sample | Functioning prototype from subcontractor (WS1, WS2, etc.) **NOTE:** Can also mean William Sonoma (PBB partner) |
| **XF** | Xing Fung | Simatelex's factory in Bao'an District |

---

## Engineering & Development

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **A-DVP+R** | Design Verification Plan + Report | Documentation |
| **App Router** | Next.js routing system using /app directory | Modern Next.js routing (v13+) using React Server Components, file-based routing in /app directory. Enables server-side rendering by default, parallel routes, and layout nesting. **NOTE:** Contrast with Pages Router (/pages directory) which uses traditional client-side routing. |
| **ATDD** | Acceptance-Test-Driven Development | Teams specify executable tests from customer conversations |
| **BDD** | Behavior-Driven Development | Examples turned into executable tests (given-when-then format) |
| **Cache Tag** | Cloudflare cache identifier for selective invalidation | Metadata label applied to cached resources enabling targeted cache purging. Instead of clearing entire cache, specific tags can be purged (e.g., "pricing", "product-SKU123", "campaign-FTBP"). Used heavily in dynamic pricing, product updates, and campaign management. |
| **CI** | Continuous Integration | Integrating code from multiple developers several times daily |
| **CD** | Continuous Delivery | Software can be released to production at any time |
| **Cycle Time** | Time from work start to completion | Agile/Kanban metric for delivery speed |
| **DOE** | Design Of Experiments | Task describing/explaining variation under hypothesized conditions |
| **DSL** | Domain Specific Language | Describes system behavior in business-relevant language |
| **EMC** | Electromagnetic Compatibility | Interaction of equipment with electromagnetic environment |
| **EMI** | Electromagnetic Interference | Interference from electromagnetic fields |
| **ESD** | Electrostatic Discharge | Charge buildup between surfaces; undesirable in electronics |
| **ET** | Exploratory Testing | Combines test design with execution; learning-focused |
| **Headless** | Architecture without presentation layer | Frontend and backend decoupled via APIs |
| **ISR** | Incremental Static Regeneration | Next.js feature allowing static pages to be updated incrementally after build without full site rebuild. Pages are regenerated on-demand when requested after a specified revalidation period, balancing performance with content freshness. |
| **Lambda** | AWS serverless compute service | Function-as-a-service for running code without servers |
| **Lead Time** | Time from request to delivery start | Agile/Kanban metric for responsiveness |
| **LCM** | Life Cycle Management | Cradle-to-grave approach for managing value chain |
| **MCU** | Micro Controller Unit | Single computer chip for embedded applications |
| **Microservices** | Architectural pattern of small, independent services | Services communicate via APIs; part of MACH architecture |
| **Runbook** | Operational documentation for system procedures | Step-by-step instructions for common operational tasks, troubleshooting, deployments, and incident response. Examples: "Runbook - Fast Track - No Offers Cache Issue" |
| **SAM** | AWS Serverless Application Model | Framework for building serverless applications on AWS |
| **TDD** | Test-Driven Development | Code design practice; write test first, then code to pass |
| **VR** | Variable Resistor | Resistor with adjustable resistance value |
| **Webhook** | HTTP callback/API pattern | Automated message sent from apps when something happens |
| **WIP** | Work in Progress | Items currently being worked on |

---

## Agile & Software Development

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Continuous improvement** | Climate where teams take ownership of improvements | Feel supported and safe to improve |
| **Cross-functional team** | Members with different backgrounds combining skills | Must effectively combine to complete shared tasks |
| **CSM** | Certified Scrum Master | Scrum Alliance certified; passed exam |
| **CSPO** | Certified Scrum Product Owner | Completed Scrum Alliance training & certification |
| **Effective teams** | Capable of satisfying stakeholders with high morale | Research-based definition |
| **Kanban** | Framework for agile/DevOps | Pull system with real-time communication |
| **Management Support** | Degree teams feel supported by management | Team perception metric |
| **PO** | Product Owner | Scrum role managing product value & backlog |
| **POC** | Proof of Concept | Experiment/pilot demonstrating feasibility |
| **Q1, Q2, Q3, Q4** | Four Agile Testing Quadrants | Technology/business-facing tests that guide/critique |
| **QA** | Question Asker | Software professional engaging in testing |
| **Reliability (software)** | Probability of failure-free operation | In specified environment for specified time |
| **Responsiveness** | Capability to release every Sprint | Team capability |
| **SBE** | Specification by Example | Process patterns for defining scope with customer teams |
| **Scrum** | Framework for developing/delivering products | 1-2 week iterations with self-organizing teams |
| **SM** | Scrum Master | Ensures team lives agile values & follows Scrum |
| **Stakeholder concern** | Team understanding of stakeholders & needs | Team awareness metric |
| **Stakeholders** | Users, customers, people with substantial stake | Definition for survey purposes |
| **Team Autonomy** | Freedom from internal/external constraints | Relative freedom |
| **Team effectiveness** | Degree team meets quality expectations | Stakeholder satisfaction + team morale |
| **Teams** | Bounded social systems interdependent for shared purpose | Interact as unit with others |

---

## Team Names

_Development squads within Beanz and Breville_

| Team Name | Focus | Context |
| --- | --- | --- |
| **Americano** | Roaster-facing features | Beanz B2B development team |
| **Mocha** | Consumer-facing features | Beanz B2C development team |
| **Analytics** | PBI, Mixpanel, Beanz Load Balancing Algorithm | Analytics & development team |
| **Cortado** | Specialty Coffee Web - Baratza & Lelit | Development team |
| **Oracles** | Breville/SAGE platforms | Development team |
| **Phoenix** | Breville/SAGE platforms | Development team |
| **Jaguars** | Salesforce | Development team |
| **CCT** | Development team responsible for the cart & checkout across for all brands | Development team |
| **CVM** | Customer Value Management, Emails, SFMC | Development team  |
| **PIM Team** | PIMCore | Development team |

---

## Shipping & Fulfillment

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Batch** | Group of orders processed together for shipping | Orders grouped for fulfillment and carrier pickup |
| **Clean Sweep** | Royal Mail manifest process | End-of-day manifest reconciliation for Royal Mail shipments |
| **Endicia** | USPS shipping service provider | Used by US roasters for USPS label generation and tracking |
| **Manifest** | Shipping document for batch pickup | Document listing all parcels for carrier pickup; required by Royal Mail and USPS |
| **Royal Mail** | UK postal service | Primary carrier for UK Beanz shipments |
| **SCAN Form** | USPS manifest document | Single barcode representing all packages in a batch for USPS scanning |
| **USPS** | United States Postal Service | US mail carrier option |

---

## Translation & Localization

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Content Federation** | CMS capability to aggregate external content | Ability to pull and present content from external systems via APIs |
| **SmartCat** | Translation platform | Cloud-based translation management system |
| **TaaS** | Translation as a Service | Cloud-based translation services delivery model |
| **TMS** | Translation Management System | Platform for managing translation workflows and content |
| **TransPerfect** | Translation vendor | Third-party translation services provider |

---

## PBB Partners & Vendors

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Acaia** | Equipment partner/vendor | PBB (Powered by Beanz) retail partner |
| **C&B** | Crate & Barrel | PBB (Powered by Beanz) retail partner |
| **JLP** | John Lewis Partnership | PBB retail partner; UK department store group |
| **SLT** | Sur La Table | PBB retail partner. **NOTE:** Can also mean "Senior Leadership Team" |
| **WS** | William Sonoma | PBB retail partner. **NOTE:** Can also mean "Working Sample" in manufacturing context |

---

## AWS Infrastructure

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **API Gateway** | AWS API management service | Manages REST API endpoints and authentication |
| **Event Bus** | AWS event-driven architecture component | EventBridge service for routing events between systems |
| **KMS** | Key Management Service | AWS encryption key management |
| **Lambda** | AWS serverless compute service | Function-as-a-service for running code without managing servers |
| **S3** | Amazon Simple Storage Service | AWS object storage service |
| **SAM** | AWS Serverless Application Model | Framework for building and deploying serverless applications |
| **SQS** | Simple Queue Service | AWS message queuing service for decoupling components |

---

## Testing & Quality

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Monsido** | Web accessibility reporting tool | Predecessor to Silktide; accessibility monitoring platform |
| **Playwright** | Automated testing framework | Browser automation for end-to-end testing |
| **UAT** | User Acceptance Testing | Testing by end users before production release |

---

## Architecture Patterns

| Term | Definition | Context / Notes |
| --- | --- | --- |
| **Content Federation** | Aggregating content from multiple sources | CMS pattern for pulling content from external systems via APIs |
| **Headless** | Frontend and backend decoupled architecture | Presentation layer separated from business logic; content delivered via APIs |
| **MACH Architecture** | Microservices, API-first, Cloud-native, Headless | Modern composable architecture pattern emphasizing modularity and flexibility |
| **Medallion Architecture** | Bronze/Silver/Gold data layering pattern | Three-tier data refinement: Raw (Bronze) → Cleaned (Silver) → Business-ready (Gold) |
| **Microservices** | Architecture of small, independent services | Each service handles specific business function; communicate via APIs |

---

## Additional Categories

### Operational & Process Terms

| Term | Definition |
| --- | --- |
| **BCP** | Business Continuity Plan |
| **CS** | Customer Service |
| **GTM** | Go-to-Market — launch and growth strategy for markets and features | Launch support: ChefSteps, regional teams, Brand, Operations, Retail, PR, Pricing, Digital |
| **KB** | Knowledge Base |
| **KPI** | Key Performance Indicator |
| **KT** | Knowledge Transfer |
| **MVP** | Minimum Viable Product (core features for small customer subset) |
| **NPD** | New Product Development (concept to release) |
| **SLA** | Service Level Agreement |
| **UAT** | User Acceptance Testing |

### Technical Acronyms

| Term | Definition |
| --- | --- |
| **API** | Application Programming Interface |
| **CDN** | Content Delivery Network |
| **CRUD** | Create, Read, Update, Delete |
| **GraphQL** | Query language for APIs |
| **JWT** | JSON Web Token |
| **REST** | Representational State Transfer |
| **SDK** | Software Development Kit |
| **TTL** | Time To Live (cache duration) |

### Digital & UX/UI

| Term | Definition |
| --- | --- |
| **AI** | Artificial Intelligence |
| **CMYK** | Cyan, Magenta, Yellow, Key (subtractive color model for printing) |
| **CSS** | Cascading Style Sheet |
| **CX** | Customer Experience |
| **GUI** | Graphical User Interface |
| **HTML** | HyperText Markup Language |
| **IA** | Information Architecture |
| **ID** | Industrial Design (department or visual design/aesthetics) |
| **JS** | JavaScript |
| **JSON** | JavaScript Object Notation |
| **ML** | Machine Learning |
| **RGB** | Red, Blue, Green (additive color model) |
| **SQL** | Structured Query Language |
| **SVG** | Scalable Vector Graphics |
| **UCD** | User Centred Design |

### Commercial & Financial

| Term | Definition |
| --- | --- |
| **BC** | Business Case |
| **IRR** | Internal Rate of Return |
| **LOP** | Labour, Overhead and Profit |
| **NPV** | Net Present Value |
| **ROI** | Return On Investment |

### Intellectual Property

| Term | Definition |
| --- | --- |
| **FTO** | Freedom To Operate (commercial safety to make/sell product) |
| **IP** | Intellectual Property |
| **IPC** | Intellectual Property Capture (process ending with patent/design filing) |
| **IPM** | Intellectual Property Management |

### Project Management

| Term | Definition |
| --- | --- |
| **DORA** | Framework measuring capabilities as proxy for developer productivity |
| **RACI** | Responsible, Accountable, Consulted, Informed |
| **SPACE** | Framework for picking metrics to measure developer productivity |

### Compliance & Security

| Term | Definition |
| --- | --- |
| **CCPA** | California Consumer Privacy Act |
| **DLP** | Data Loss Prevention |
| **DSAR** | Data Subject Access Request |
| **DRM** | Digital Rights Management |
| **GDPR** | Global Data Protection Regulation |
| **IDP** | ID Provider (SFDC for login/account management) |
| **ITSM** | IT Service Management |
| **MFA** | Multi-factor Authentication |
| **NDA** | Non-disclosure Agreement |
| **PCI** | Payment Card Industry (credit card security standards) |
| **Penetration Testing** | Authorized cyberattack simulations for security evaluation |
| **SSO** | Single Sign-On |
| **VPAT** | Voluntary Product Accessibility Template |
| **WAF** | Web Application Firewall |
| **WCAG** | Web Content Accessibility Guidelines |

### Organization Codes (GITBL)

| Code | Department | Use |
| --- | --- | --- |
| **ARCH** | Enterprise Architecture | Financial tracking |
| **BUS** | Business Systems | Financial tracking |
| **DIG** | Digital | Financial tracking |
| **ES** | Enterprise Services | Financial tracking |
| **EUS** | End User Services | Financial tracking |
| **PROJ** | Project Services | Financial tracking |
| **SEC** | Security & Compliance | Financial tracking |
| **TS** | Technology Services | Financial tracking |

### EDI Message Types

| Message | Description |
| --- | --- |
| **810 Message** | Invoice Details (D365 to SF via AWS) |
| **850 Message** | Order Release XML (CT to D365 via AWS) |
| **856 Message** | Shipment notification (D365 to CT & SF via AWS) |
| **870 Message** | Cancellation notification (D365 to CT & SF via AWS) |
| **940 Message** | Order XML (D365 to ShipStation and Beanz-connect via AWS) |
| **945 Message** | ShipNotice (ShipStation & Beanz-Connect to D365 via AWS) |

### Currency Codes

| Code | Currency |
| --- | --- |
| **AUD** | Australian Dollars |
| **USD** | US Dollars |
| **EUR** | Euro |
| GBP | British Pound |

### Specialty Terms

| Term | Definition |
| --- | --- |
| **3PL** | 3rd Party Logistics (external warehouse) |
| **B2B** | Business to Business |
| **B2C** | Business to Consumer |
| **CC** | Cost Center |
| **EH** | Experience Hub (systems for direct-to-consumer operations) |
| **EP** | Elastic Path (Ecommerce engine) |
| **GHR** | Global Human Resources |
| **JD** | Job Description |
| **PD** | Position Description |
| **TP** | Trading Partners (business customers) |

---

## Important Notes

### Ambiguous Acronyms

Some acronyms have multiple meanings - use context to determine:

* **BC** = Barista's Choice (Beanz) OR Business Case (general)
* **BDE** = Breville Germany region code (for internal communication & financial tracking) OR Germany direct-to-consumer e-commerce channel code (for system configuration in PIM, D365, CT)
* **BUS** = Breville US (regional) OR Business Systems (GITBL)
* **CM** = Contribution Margin (finance) OR Category Manager (product)
* **SLT** = Sur La Table (partner) OR Senior Leadership Team (internal)
* **WS** = Working Sample (manufacturing) OR William Sonoma (PBB partner)

### Terms Requiring Further Research

Found in documents but lacking complete definitions:

* BELM
* HTK
* LCT
* LOM
* PPP
* RPN
* TL

_If you know these definitions, please update this page or contact the Beanz team._

---

---

_Maintained by the Beanz Team_
