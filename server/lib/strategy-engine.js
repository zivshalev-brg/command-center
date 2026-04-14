/** Build the full strategy payload from KB data */
function buildStrategyPayload() {
  return {
    generated: new Date().toISOString(),
    performance: {
      revenue: { cy23: 4429180, cy24: 8383318, cy25: 13504185, currency: 'AUD', yoy: 0.61 },
      bags: { cy25: 1007775, yoy: 0.63 },
      subscribers: { total: 36036, new: 19544, cancelled: 15297, activeYE: 21685, yoyTotal: 0.52, yoyNew: 0.42, yoyCancelled: 0.75, yoyActive: 0.39 },
      avgLTV: { value: 353, currency: 'AUD', yoy: -0.01 },
      avgKG: { value: 5.8, yoy: 0.05 },
      sla: { value: 95.5, yoy: -0.5 }
    },
    revenueMix: {
      cy24: { ftbp: 3, beanz: 36, fusion: 45, other: 16 },
      cy25: { ftbp: 41, beanz: 33, fusion: 19, other: 7 }
    },
    subscriptionMix: { beanz: 38, ftbpV1: 32, ftbpV2: 17, fusion: 14 },
    machineRevenue: {
      oracle: { sellout: 1, customers: 5, revenue: 21 },
      barista: { sellout: 70, customers: 68, revenue: 64 },
      bambino: { sellout: 20, customers: 12, revenue: 11 },
      drip: { sellout: 4, customers: 2, revenue: 2 }
    },
    delivery: {
      au: { days: 5.83, yoy: 10 }, uk: { days: 3.97, yoy: 8 },
      us: { days: 5.72, yoy: -2 }, de: { days: 5.17, yoy: 16 }
    },
    ftbp: {
      v1: { signups: 50000, convRate: 11.4, paidCustomers: 3947, revenue: 320500 },
      v2: { signups: 46000, convRate: 16.5, paidCustomers: 7621, revenue: 537300 },
      totalSignups: 193000, revenueShare: 41, avgLTV: 353
    },
    priorities: [
      { id: 'P1', name: 'Beanz Retention & LTV', kpis: ['Churn rate','LTV','Subscription duration'], segments: ['SEG-1.4.x','SEG-1.6.x'], status: 'active', project: 'Project Feral' },
      { id: 'P2', name: 'FTBP Conversion', kpis: ['Trial→Paid rate','FTBP revenue share'], segments: ['SEG-1.2.x','SEG-1.8.x'], status: 'active', baseline: 'v2: 16.5%, v1: 11.4%' },
      { id: 'P3', name: 'Scale Platinum Roasters', kpis: ['Partner revenue','Machine sales'], segments: ['SEG-2.x'], status: 'active', baseline: '18 partners, $2M paid' },
      { id: 'P4', name: 'Expand PBB', kpis: ['Partner integrations','PBB volume'], segments: [], status: 'planned', baseline: '96% volume growth CY25' },
      { id: 'P5', name: 'Invest in AI Horizontally', kpis: ['Personalization coverage','Forecast accuracy'], segments: [], status: 'active', project: 'Project Feral' }
    ],
    correlations: [
      { id: 'COR-1', title: 'Cancellation Acceleration vs Growth', severity: 'critical',
        finding: 'Cancellations grew +75% YoY while new subscriptions grew +42% — net growth is decelerating. If this trend continues, churn will outpace acquisition by FY28.',
        dataPoints: ['15,297 cancellations (+75%)', '19,544 new subs (+42%)', 'Net add: 4,247 (shrinking)'],
        recommendation: 'Priority 1 (Retention) must deliver measurable churn reduction in H1 FY27. Project Feral cancellation flow experiments are critical path.',
        priority: 'P1', segments: ['SEG-1.6.x','SEG-1.7.x'] },
      { id: 'COR-2', title: 'Oracle Series Revenue Over-Index', severity: 'opportunity',
        finding: 'Oracle Series owners represent just 1% of machine sell-outs but generate 21% of FTBP revenue. These are 21x more valuable per customer than average.',
        dataPoints: ['1% sell-out → 5% customers → 21% revenue', '$353 avg LTV (flat)', 'Premium segment under-targeted'],
        recommendation: 'Create a premium tier experience targeting Oracle/COH-3.1 owners: exclusive roasters, priority allocation, premium onboarding questionnaire (Project Feral W3).',
        priority: 'P1', segments: ['SEG-1.5.2','SEG-1.4.2'] },
      { id: 'COR-3', title: 'FTBP v2 Conversion Leap', severity: 'positive',
        finding: 'FTBP v2 achieved +93% more paid customers with 7% fewer sign-ups. Conversion quality improved dramatically (11.4% → 16.5%).',
        dataPoints: ['16.5% paid conversion (+5.1 pts)', '7,621 paid customers (+93%)', '$537K revenue (+68%)'],
        recommendation: 'Double down on v2 learnings. Target 20% conversion rate in FY27 through 1kg affordability lever and optimised redemption journey.',
        priority: 'P2', segments: ['SEG-1.2.x'] },
      { id: 'COR-4', title: 'Large Bag Adoption Accelerating', severity: 'positive',
        finding: 'FTBP cohort over-indexes on 1kg bags (23% vs 20% avg). December hit 30% — a clear trend toward value-conscious purchasing.',
        dataPoints: ['20% of volume = 1kg bags', 'FTBP: 23% large bag mix', 'Dec 2025: 30% peak'],
        recommendation: 'Make 1kg the default for FTBP v2 conversion offers. 15-20% savings positioning drives both conversion and retention.',
        priority: 'P2', segments: ['SEG-1.2.x','SEG-1.3.x'] },
      { id: 'COR-5', title: 'DE Delivery Deterioration', severity: 'warning',
        finding: 'Germany delivery times worsened +16% YoY (5.17 days), worst of all markets. NL will cross-border from DE initially, inheriting this problem.',
        dataPoints: ['DE: 5.17 days (+16%)', 'NL launch July 2026 (cross-border from DE)', 'UK best at 3.97 days'],
        recommendation: 'Resolve DE delivery before NL launch. NL COH-1.5 first impression depends on DE logistics performance.',
        priority: 'P1', segments: ['COH-1.4','COH-1.5'] },
      { id: 'COR-6', title: 'Platinum Roaster Flywheel Working', severity: 'positive',
        finding: '18 Platinum partners generated $2M in coffee revenue AND $1M in incremental machine sales in FY26H1. The flywheel (volume → investment → machine sales) is proven.',
        dataPoints: ['$2M paid to roasters', '$1M machine sales', '18 roasters signed', 'DOMA brew classes sold out'],
        recommendation: 'Scale to 25+ roasters in FY27. Prioritize UK/DE roasters (data gap: only US/AU presented). Tie to NL launch for fresh market presence.',
        priority: 'P3', segments: ['SEG-2.x'] },
      { id: 'COR-7', title: 'FTBP Dominance Creates Single-Channel Risk', severity: 'warning',
        finding: 'FTBP went from 3% to 41% of revenue in one year. Combined with 48% of active subs, a Breville channel disruption would be catastrophic.',
        dataPoints: ['41% revenue from FTBP', '48% of active subs are FTBP', '3% → 41% in one year'],
        recommendation: 'Accelerate PBB (P4) as diversification. Target 10%+ revenue from non-Breville channels by end of FY27.',
        priority: 'P4', segments: ['COH-4.3'] },
      { id: 'COR-8', title: 'LTV Flat While Revenue Grows', severity: 'warning',
        finding: 'Average LTV per subscriber is flat at $353 (-1% YoY) despite 61% revenue growth. Growth is coming from volume, not deeper monetisation per customer.',
        dataPoints: ['$353 LTV (-1%)', 'Revenue +61%', 'Subs +52%', 'KG/sub +5%'],
        recommendation: 'Cross-sell and upsell features (F-08.x, F-03.x) needed to lift per-customer value. Coffee collections (Feral W3.2) and premium tier targeting (COR-2) are the levers.',
        priority: 'P1', segments: ['SEG-1.4.x','SEG-1.5.x'] }
    ],
    lifecycle: {
      stages: [
        { id: 'SEG-1.1', name: 'New Customer', colour: '#6e7389' },
        { id: 'SEG-1.2', name: 'Trialist', colour: '#6c8cff' },
        { id: 'SEG-1.3', name: 'New Subscriber', colour: '#66d9e8' },
        { id: 'SEG-1.4', name: 'Active Subscriber', colour: '#69db7c' },
        { id: 'SEG-1.5', name: 'Loyalist', colour: '#69db7c' },
        { id: 'SEG-1.6', name: 'At Risk', colour: '#ffb347' },
        { id: 'SEG-1.7', name: 'Inactive', colour: '#ff6b6b' },
        { id: 'SEG-1.8', name: 'Trial Not Converted', colour: '#ff6b6b' }
      ],
      transitions: [
        { from: 'SEG-1.1', to: 'SEG-1.2', label: 'FTBP activation', type: 'positive' },
        { from: 'SEG-1.2', to: 'SEG-1.3', label: 'Beanz Conversion (16.5% v2)', type: 'positive', metric: '16.5%' },
        { from: 'SEG-1.2', to: 'SEG-1.8', label: 'Trial expired', type: 'negative' },
        { from: 'SEG-1.3', to: 'SEG-1.4', label: '90d + 3 orders', type: 'positive' },
        { from: 'SEG-1.4', to: 'SEG-1.5', label: '6+ months consistent', type: 'positive' },
        { from: 'SEG-1.4', to: 'SEG-1.6', label: 'Pause/payment fail', type: 'warning', metric: '15,297 cancellations' },
        { from: 'SEG-1.5', to: 'SEG-1.6', label: 'Disruption', type: 'warning' },
        { from: 'SEG-1.6', to: 'SEG-1.7', label: '90d no activity', type: 'negative' },
        { from: 'SEG-1.6', to: 'SEG-1.4', label: 'Reactivates', type: 'positive' }
      ]
    },
    projectFeral: {
      status: 'active', weeks: 26, currentPhase: 'Foundation',
      workstreams: [
        { name: 'Knowledge Base', status: 'active', lead: 'Product' },
        { name: 'Intelligence Platform', status: 'in-progress', lead: 'Platform' },
        { name: 'AI-First Dev', status: 'active', lead: 'AI Dev Lead' },
        { name: 'Cancellation Flow (3 variants)', status: 'planned', lead: 'Product' },
        { name: 'Coffee Collections (5 concepts)', status: 'planned', lead: 'Product' },
        { name: 'Onboarding Questionnaires (3 versions)', status: 'planned', lead: 'Product' },
        { name: 'Email Strategy by Cohort', status: 'planned', lead: 'CRM' }
      ],
      phases: [
        { name: 'Foundation', weeks: '1-3', status: 'active' },
        { name: 'Technical Enablement', weeks: '3-5', status: 'upcoming' },
        { name: 'Experiment Development', weeks: '5-12', status: 'upcoming' },
        { name: 'Scale', weeks: '13-18', status: 'upcoming' },
        { name: 'Optimise', weeks: '19-26', status: 'upcoming' }
      ]
    },
    markets: [
      { code: 'AU', name: 'Australia', status: 'active', launch: '~2021', maturity: 'highest', deliveryDays: 5.83, yoy: 10 },
      { code: 'UK', name: 'United Kingdom', status: 'active', deliveryDays: 3.97, yoy: 8 },
      { code: 'US', name: 'United States', status: 'active', deliveryDays: 5.72, yoy: -2 },
      { code: 'DE', name: 'Germany', status: 'active', deliveryDays: 5.17, yoy: 16 },
      { code: 'NL', name: 'Netherlands', status: 'launching', launch: 'July 2026', note: 'Cross-border from DE' }
    ],
    dataGaps: [
      'CY25 contribution margin / EBITDA not available',
      'Root cause of +75% cancellation increase not confirmed',
      'UK and DE platinum roasters not identified',
      'FY27 specific revenue and profitability targets not set',
      'FTBP v2 specific changes driving conversion improvement unknown',
      'FTBP churn rate vs organic subscriptions not measured',
      'NL 1kg bag pricing not confirmed for launch',
      'Margin impact of 1kg vs small bags not quantified'
    ]
  };
}

module.exports = { buildStrategyPayload };
