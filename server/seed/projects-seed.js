// Projects seed — snapshot of the static DATA.projects (formerly in js/data.js lines 43-89)
// Used as one-shot seed when the `projects` table is empty.

module.exports = {
  projects: {
    'feral': {
      title: 'Project Feral',
      status: 'active',
      rag: 'amber',
      priority: 90,
      colour: 'var(--gn)',
      owner_id: 'justin-le-good',
      team: 'Beanz AI',
      progress: 35,
      description: 'AI-first retention experiments on Beanz.com. Chief metric: improving retention.',
      classifier_tags: ['feral', 'project-feral', 'retention', 'cancellation-flow', 'ai-retention'],
      aliases: ['Project Feral', 'feral'],
      people_ids: ['justin-le-good', 'sophie-thevenin', 'daniel-granahan'],
      strategy_correlation_ids: [],
      metric_keys: ['retention', 'cancellation_rate', 'ltv'],
      news_keywords: ['retention', 'churn', 'ai', 'personalisation'],
      milestones: [
        { title: 'Foundation Prerequisites', state: 'done', sort_order: 0 },
        { title: 'Technical Enablement', state: 'done', sort_order: 1 },
        { title: 'Cancellation Flows', state: 'active', sort_order: 2 },
        { title: 'Collections Experiments', state: 'upcoming', sort_order: 3 },
        { title: 'Email Strategy', state: 'upcoming', sort_order: 4 },
        { title: 'Questionnaire Personalisation', state: 'upcoming', sort_order: 5 }
      ],
      blockers: [],
      actions: [
        { text: 'Run first A/B test on cancellation flow', priority: 'high' },
        { text: 'TODAY: Churn/Retention 13:00 → Segments 16:00 → AI Fortnightly 20:00', priority: 'urgent' },
        { text: 'Connect sprint results with Jen segmentation criteria', priority: 'normal' }
      ]
    },
    'mice': {
      title: 'MICE 2026 / Beanz.com',
      status: 'active',
      rag: 'amber',
      priority: 85,
      colour: 'var(--ac)',
      owner_id: 'raymon-so',
      team: 'Events',
      progress: 60,
      description: 'Melbourne International Coffee Expo booth + Beanz.com hero banner + quiz integration.',
      classifier_tags: ['mice', 'mice-2026', 'mice-artwork', 'events'],
      aliases: ['MICE 2026', 'MICE', 'Melbourne International Coffee Expo'],
      people_ids: ['raymon-so', 'hugh-mcdonnell', 'daniel-granahan', 'lauren-szybiak', 'monika-fekete', 'chiara-greensill'],
      metric_keys: [],
      news_keywords: ['mice', 'coffee expo', 'melbourne coffee'],
      milestones: [
        { title: 'Quiz Prototype', state: 'done', sort_order: 0 },
        { title: 'Hero Banner Concepts', state: 'active', sort_order: 1 },
        { title: 'AfterHours First Round', state: 'active', sort_order: 2 },
        { title: 'Sign Specs', state: 'upcoming', sort_order: 3 },
        { title: 'Hi-Res Logo', state: 'upcoming', sort_order: 4 },
        { title: 'Merch Production', state: 'upcoming', sort_order: 5 },
        { title: 'Final Artwork', state: 'upcoming', sort_order: 6 }
      ],
      blockers: [
        { text: 'Sign specs pending from MICE', severity: 'high' },
        { text: '300px logo — need high-res', severity: 'medium' },
        { text: 'Hero visual needs refinement for 30-40K event', severity: 'medium' }
      ],
      actions: [
        { text: 'TODAY: Review AfterHours first round at MICE WIP 13:30', priority: 'urgent' },
        { text: 'Close merch decisions by end of week (cups, hats, shirts, aprons, stickers)', priority: 'high' },
        { text: 'Collate feedback for Chiara/AfterHours (Ray + Hugh)', priority: 'normal' },
        { text: 'Source hi-res Powered by Beanz logo', priority: 'normal' },
        { text: '8 team passes submitted — confirm with Lauren', priority: 'normal' }
      ]
    },
    'woc': {
      title: 'WOC San Diego',
      status: 'active',
      rag: 'red',
      priority: 95,
      colour: 'var(--gn)',
      owner_id: 'sarah-dooley',
      team: 'Beanz US',
      progress: 40,
      description: 'World of Coffee — BRG as long-term infrastructure partner to US specialty coffee.',
      classifier_tags: ['woc', 'woc-san-diego', 'scg-expansion'],
      aliases: ['WOC', 'WOC San Diego', 'World of Coffee'],
      people_ids: ['sarah-dooley', 'travis-beckett', 'phil-mcknight', 'brian-hofmann', 'amanda-hernandez'],
      metric_keys: [],
      news_keywords: ['world of coffee', 'wca', 'san diego', 'specialty coffee'],
      milestones: [
        { title: 'Positioning Doc', state: 'done', sort_order: 0 },
        { title: 'Logistics Tracker', state: 'active', sort_order: 1 },
        { title: 'Early Bird Registration', state: 'active', sort_order: 2 },
        { title: 'MaraX3 Best New Product', state: 'upcoming', sort_order: 3 },
        { title: 'Team Travel', state: 'upcoming', sort_order: 4 },
        { title: 'Booth Setup', state: 'upcoming', sort_order: 5 }
      ],
      blockers: [
        { text: 'Early bird deadline March 1 (4 days away)', severity: 'critical' }
      ],
      actions: [
        { text: 'URGENT: Confirm booth + attendee registrations by March 1', priority: 'urgent' },
        { text: 'Submit MaraX3 for Best New Product', priority: 'high' }
      ]
    },
    'marax3': {
      title: 'MaraX3 Platinum Roasters',
      status: 'active',
      rag: 'amber',
      priority: 80,
      colour: 'var(--or)',
      owner_id: 'michael-bell',
      team: 'Beanz EU',
      progress: 30,
      description: 'Dial in pressure profiles for MaraX3 launch. Platinum roasters create content bridge.',
      classifier_tags: ['marax3', 'platinum-roasters', 'platinum-us-plan'],
      aliases: ['MaraX3', 'Mara X3', 'Platinum Roasters'],
      people_ids: ['michael-bell', 'sarah-dooley', 'phil-mcknight', 'hugh-mcdonnell', 'ally-barajas'],
      metric_keys: [],
      news_keywords: ['marax3', 'lelit', 'platinum roaster'],
      milestones: [
        { title: 'Template Profiles', state: 'active', sort_order: 0 },
        { title: 'LELIT Activation Timeline', state: 'upcoming', sort_order: 1 },
        { title: 'AU Machine Arrival', state: 'active', sort_order: 2 },
        { title: 'US Machine Arrival', state: 'upcoming', sort_order: 3 },
        { title: 'Roaster Rollout', state: 'upcoming', sort_order: 4 }
      ],
      blockers: [
        { text: 'Awaiting US machine arrival', severity: 'medium' },
        { text: 'Need firmer timeline from LELIT', severity: 'medium' }
      ],
      actions: [
        { text: 'TODAY: Beanz Platinum US working meeting 12:00 with Ally', priority: 'urgent' },
        { text: 'Get timeline update from Sarah/Clarissa', priority: 'high' },
        { text: 'Compile cross-market roaster list with Usman — Hugh back from leave', priority: 'normal' }
      ]
    },
    'brand-summit': {
      title: 'FY27 Brand Summit',
      status: 'active',
      rag: 'green',
      priority: 70,
      colour: 'var(--pu)',
      owner_id: 'raymon-so',
      team: 'Brand',
      progress: 85,
      description: 'Brand budget presentation. Sizzle reel: +99% subscribers, +63% bags, +75% tonnes.',
      classifier_tags: ['brand-summit', 'brand-budget', 'fy27'],
      aliases: ['Brand Summit', 'FY27 Brand Summit'],
      people_ids: ['raymon-so', 'michael-bell'],
      metric_keys: ['subscribers', 'bags', 'tonnes'],
      news_keywords: [],
      milestones: [
        { title: 'Deck Draft', state: 'done', sort_order: 0 },
        { title: 'Sizzle Video', state: 'done', sort_order: 1 },
        { title: 'Ray Cleanup', state: 'done', sort_order: 2 },
        { title: 'Pre-Record', state: 'active', sort_order: 3 },
        { title: 'Presentation', state: 'upcoming', sort_order: 4 }
      ],
      blockers: [],
      actions: [
        { text: 'Michael completes pre-record', priority: 'high' },
        { text: 'Review Confluence feedback survey', priority: 'normal' },
        { text: 'Talia Fedele promoted to Marketing Coordinator AU', priority: 'low' }
      ]
    },
    'machine-integration': {
      title: 'Machine Integration Strategy',
      status: 'active',
      rag: 'amber',
      priority: 60,
      colour: 'var(--tx3)',
      owner_id: 'ziv',
      team: 'Strategy',
      progress: 20,
      description: '24-month narrative tying Beanz into every machine launch. MaraX3 is first proof point.',
      classifier_tags: ['machine-integration', 'strategy'],
      aliases: ['Machine Integration', 'Machine Integration Strategy'],
      people_ids: ['raymon-so'],
      metric_keys: [],
      news_keywords: [],
      milestones: [
        { title: 'Strategic Narrative', state: 'done', sort_order: 0 },
        { title: 'Stakeholder Buy-in', state: 'active', sort_order: 1 },
        { title: 'Pilot (MaraX3)', state: 'upcoming', sort_order: 2 },
        { title: 'Scale Plan', state: 'upcoming', sort_order: 3 }
      ],
      blockers: [
        { text: 'No responses from stakeholders yet', severity: 'medium' }
      ],
      actions: [
        { text: 'Follow up midweek if still silent', priority: 'normal' }
      ]
    },
    'power-bi-pl': {
      title: 'Power BI P&L Report',
      status: 'active',
      rag: 'amber',
      priority: 75,
      colour: 'var(--pu)',
      owner_id: 'usman-zia',
      team: 'Finance',
      progress: 25,
      description: 'Beanz P&L Finance report in Power BI. Reconciling CommerceTools with D365.',
      classifier_tags: ['power-bi-pl', 'pnl', 'finance', 'platinum-roasters'],
      aliases: ['Power BI P&L', 'P&L Report', 'Beanz P&L'],
      people_ids: ['usman-zia', 'craig-robinson'],
      metric_keys: ['revenue', 'cogs', 'gross_margin'],
      news_keywords: [],
      milestones: [
        { title: 'Data Source Mapping', state: 'active', sort_order: 0 },
        { title: 'Revenue Reconciliation', state: 'active', sort_order: 1 },
        { title: 'COGS & Freight', state: 'upcoming', sort_order: 2 },
        { title: 'Program Profitability', state: 'upcoming', sort_order: 3 },
        { title: 'Executive Dashboard', state: 'upcoming', sort_order: 4 }
      ],
      blockers: [
        { text: 'Timing difference in revenue recognition between CommerceTools and D365', severity: 'high' },
        { text: 'Static COGS values in CommerceTools need updating', severity: 'medium' }
      ],
      actions: [
        { text: 'Complete Platinum Roasters list for customer mapping', priority: 'high' },
        { text: 'Reconcile CommerceTools data with D365', priority: 'high' }
      ]
    }
  }
};
