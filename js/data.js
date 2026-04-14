// Build current week Mon–Fri dynamically from today's date
// Calendar events are stored per day-index (0=Mon .. 4=Fri)
// Calendar events — populated by loadCalendarLive() from Outlook API
// Static defaults shown while live data loads
const _calEvents = {
  0: [{t:'',title:'Loading calendar...',meta:'Syncing with Outlook',hl:false}],
  1: [{t:'',title:'Loading calendar...',meta:'Syncing with Outlook',hl:false}],
  2: [{t:'',title:'Loading calendar...',meta:'Syncing with Outlook',hl:false}],
  3: [{t:'',title:'Loading calendar...',meta:'Syncing with Outlook',hl:false}],
  4: [{t:'',title:'Loading calendar...',meta:'Syncing with Outlook',hl:false}]
};
function buildWeekDays() {
  const keys = ['mon','tue','wed','thu','fri'];
  const labels = ['Mon','Tue','Wed','Thu','Fri'];
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((dow + 6) % 7));
  mon.setHours(0,0,0,0);
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const isToday = d.toDateString() === today.toDateString();
    days.push({
      key: keys[i], label: labels[i], num: String(d.getDate()), date: iso, isToday,
      events: _calEvents[i] || [{t:'',title:'No events',meta:'',hl:false}]
    });
  }
  return days;
}

// __DATA_START__
const DATA = {
  comms: {
    days: buildWeekDays(),
    // Threads populated by live Slack/Outlook API — no hardcoded data
    threads: {},
        // Legacy topics compat — mapped from threads for Daily Summary & other modules
    topics: {}
  },
  projects: {
    'feral': { title:'Project Feral', status:'active', colour:'var(--gn)', owner:'justin-le-good', progress:35,
      desc:'AI-first retention experiments on Beanz.com. Chief metric: improving retention.',
      milestones:[{t:'Foundation Prerequisites',s:'done'},{t:'Technical Enablement',s:'done'},{t:'Cancellation Flows',s:'active'},{t:'Collections Experiments',s:'upcoming'},{t:'Email Strategy',s:'upcoming'},{t:'Questionnaire Personalisation',s:'upcoming'}],
      blockers:[], nextActions:['Run first A/B test on cancellation flow','TODAY: Churn/Retention 13:00 \u2192 Segments 16:00 \u2192 AI Fortnightly 20:00','Connect sprint results with Jen segmentation criteria'],
      people:['justin-le-good','sophie-thevenin','daniel-granahan'], commLinks:['feral-updates']
    },
    'mice': { title:'MICE 2026 / Beanz.com', status:'in-progress', colour:'var(--ac)', owner:'raymon-so', progress:60,
      desc:'Melbourne International Coffee Expo booth + Beanz.com hero banner + quiz integration.',
      milestones:[{t:'Quiz Prototype',s:'done'},{t:'Hero Banner Concepts',s:'active'},{t:'AfterHours First Round',s:'active'},{t:'Sign Specs',s:'upcoming'},{t:'Hi-Res Logo',s:'upcoming'},{t:'Merch Production',s:'upcoming'},{t:'Final Artwork',s:'upcoming'}],
      blockers:['Sign specs pending from MICE','300px logo \u2014 need high-res','Hero visual needs refinement for 30-40K event'],
      nextActions:['TODAY: Review AfterHours first round at MICE WIP 13:30','Close merch decisions by end of week (cups, hats, shirts, aprons, stickers)','Collate feedback for Chiara/AfterHours (Ray + Hugh)','Source hi-res Powered by Beanz logo','8 team passes submitted \u2014 confirm with Lauren'],
      people:['raymon-so','hugh-mcdonnell','daniel-granahan','lauren-szybiak','monika-fekete','chiara-greensill'], commLinks:['mice-artwork','camille-de-recap','artwork-feedback']
    },
    'woc': { title:'WOC San Diego', status:'confirmed', colour:'var(--gn)', owner:'sarah-dooley', progress:40,
      desc:'World of Coffee — BRG as long-term infrastructure partner to US specialty coffee.',
      milestones:[{t:'Positioning Doc',s:'done'},{t:'Logistics Tracker',s:'active'},{t:'Early Bird Registration',s:'active'},{t:'MaraX3 Best New Product',s:'upcoming'},{t:'Team Travel',s:'upcoming'},{t:'Booth Setup',s:'upcoming'}],
      blockers:['Early bird deadline March 1 (4 days away)'], nextActions:['URGENT: Confirm booth + attendee registrations by March 1','Submit MaraX3 for Best New Product'],
      people:['sarah-dooley','travis-beckett','phil-mcknight','brian-hofmann','amanda-hernandez'], commLinks:['woc-early-bird','marax3-launch','scg-expansion']
    },
    'marax3': { title:'MaraX3 Platinum Roasters', status:'active', colour:'var(--or)', owner:'michael-bell', progress:30,
      desc:'Dial in pressure profiles for MaraX3 launch. Platinum roasters create content bridge.',
      milestones:[{t:'Template Profiles',s:'active'},{t:'LELIT Activation Timeline',s:'upcoming'},{t:'AU Machine Arrival',s:'active'},{t:'US Machine Arrival',s:'upcoming'},{t:'Roaster Rollout',s:'upcoming'}],
      blockers:['Awaiting US machine arrival','Need firmer timeline from LELIT'],
      nextActions:['TODAY: Beanz Platinum US working meeting 12:00 with Ally','Get timeline update from Sarah/Clarissa','Compile cross-market roaster list with Usman \u2014 Hugh back from leave'],
      people:['michael-bell','sarah-dooley','phil-mcknight','hugh-mcdonnell','ally-barajas'], commLinks:['marax3-launch','platinum-roasters','platinum-us-plan']
    },
    'brand-summit': { title:'FY27 Brand Summit', status:'finalising', colour:'var(--pu)', owner:'raymon-so', progress:85,
      desc:'Brand budget presentation. Sizzle reel: +99% subscribers, +63% bags, +75% tonnes.',
      milestones:[{t:'Deck Draft',s:'done'},{t:'Sizzle Video',s:'done'},{t:'Ray Cleanup',s:'done'},{t:'Pre-Record',s:'active'},{t:'Presentation',s:'upcoming'}],
      blockers:[], nextActions:['Michael completes pre-record','Review Confluence feedback survey','Talia Fedele promoted to Marketing Coordinator AU'],
      people:['raymon-so','michael-bell'], commLinks:['brand-budget']
    },
    'machine-integration': { title:'Machine Integration Strategy', status:'awaiting', colour:'var(--tx3)', owner:'ziv', progress:20,
      desc:'24-month narrative tying Beanz into every machine launch. MaraX3 is first proof point.',
      milestones:[{t:'Strategic Narrative',s:'done'},{t:'Stakeholder Buy-in',s:'active'},{t:'Pilot (MaraX3)',s:'upcoming'},{t:'Scale Plan',s:'upcoming'}],
      blockers:['No responses from stakeholders yet'],
      nextActions:['Follow up midweek if still silent'],
      people:['raymon-so'], commLinks:['marax3-launch']
    },
    'power-bi-pl': { title:'Power BI P&L Report', status:'in-progress', colour:'var(--pu)', owner:'usman-zia', progress:25,
      desc:'Beanz P&L Finance report in Power BI. Reconciling CommerceTools with D365.',
      milestones:[{t:'Data Source Mapping',s:'active'},{t:'Revenue Reconciliation',s:'active'},{t:'COGS & Freight',s:'upcoming'},{t:'Program Profitability',s:'upcoming'},{t:'Executive Dashboard',s:'upcoming'}],
      blockers:['Timing difference in revenue recognition between CommerceTools and D365','Static COGS values in CommerceTools need updating'],
      nextActions:['Complete Platinum Roasters list for customer mapping','Reconcile CommerceTools data with D365'],
      people:['usman-zia','craig-robinson'], commLinks:['platinum-roasters']
    }
  },
  people: {
    'travis-beckett': {n:'Travis Beckett',role:'Beanz Operations Lead',team:'Beanz Ops',region:'US',email:'Travis.Beckett@breville.com',slackId:'U06C2LK17LP',initials:'TB',colour:'var(--ac)',tier:'core',scope:'Weekly meeting notes, ops coordination, MICE event planning'},
    'sarah-dooley': {n:'Sarah Dooley',role:'Beanz US Brand & Marketing',team:'Beanz US',region:'US',email:'Sarah.Dooley@breville.com',slackId:'U01HQ1QACUX',initials:'SD',colour:'var(--gn)',tier:'core',scope:'US brand narrative, WOC activation, Platinum Roaster content'},
    'michael-bell': {n:'Michael Bell',role:'Beanz EU Lead',team:'Beanz EU',region:'EU',email:'Michael.Bell@sageappliances.com',slackId:'U05K45MN295',initials:'MB',colour:'var(--or)',tier:'core',scope:'Netherlands launch, Blommers pilot, Amsterdam Coffee Festival, DHL logistics'},
    'phil-mcknight': {n:'Phil McKnight',role:'President, Global Specialty Coffee',team:'Executive',region:'US',email:'Phil.McKnight@breville.com.au',slackId:'UF1EL3QQ0',initials:'PM',colour:'var(--pu)',tier:'executive',scope:'Specialty Coffee BU, WOC, trade events'},
    'raymon-so': {n:'Raymon So',role:'Beanz AU Operations',team:'Beanz AU',region:'AU',email:'Raymon.So@breville.com.au',slackId:'UK03JGEFN',initials:'RS',colour:'var(--cy)',tier:'core',scope:'AU market operations, summit presentations'},
    'hugh-mcdonnell': {n:'Hugh McDonnell',role:'Beanz Manager APAC',team:'Beanz AU',region:'AU',email:'Hugh.McDonnell@breville.com',slackId:'U08KB3J2L4E',initials:'HM',colour:'var(--ac)',tier:'core',scope:'APAC market, Platinum Roasters APAC, MaraX3 launch'},
    'justin-le-good': {n:'Justin Le Good',role:'AI/Tech Lead — Project Feral',team:'Beanz AI',region:'AU',email:'Justin.Legood@breville.com',slackId:'U01LU3ZHZ5E',initials:'JL',colour:'var(--gn)',tier:'core',scope:'Project Feral architecture, data pipeline, AI experimentation, agentic tools'},
    'sophie-thevenin': {n:'Sophie Thevenin',role:'Beanz Product & Ops Lead',team:'Product',region:'AU',email:'Sophie.Thevenin@breville.com',slackId:'U07UV3GEC10',initials:'ST',colour:'var(--pu)',tier:'core',scope:'Portal, finished goods Shopify integration, multi-brand scaling, summit planning'},
    'daniel-granahan': {n:'Daniel Granahan',role:'Beanz AI / Tech',team:'Beanz AI',region:'AU',email:'Daniel.Granahan@breville.com',slackId:'ULJDXB7AA',initials:'DG',colour:'var(--or)',tier:'core',scope:'Weekly meeting participant, AI sprint work'},
    'claire-barker': {n:'Claire Barker',role:'HR EMEA',team:'HR',region:'UK',email:'claire.barker@sageappliances.co.uk',slackId:'UJRS6EBMF',initials:'CB',colour:'var(--rd)'},
    'brian-hofmann': {n:'Brian Hofmann',role:'US Coffee Community',team:'Coffee',region:'US',email:'',slackId:'',initials:'BH',colour:'var(--cy)'},
    'amanda-hernandez': {n:'Amanda Hernandez',role:'US Events / Logistics',team:'Events',region:'US',email:'',slackId:'',initials:'AH',colour:'var(--gn)'},
    'jae-han': {n:'Jae Han',role:'Beanz Team Sync',team:'Beanz',region:'AU',email:'',slackId:'',initials:'JH',colour:'var(--ac)'},
    'lauren-szybiak': {n:'Lauren Szybiak',role:'MICE Coordinator',team:'Events',region:'AU',email:'',slackId:'',initials:'LS',colour:'var(--pu)'},
    'kerstin-beneke': {n:'Kerstin Beneke',role:'Legal DE',team:'Legal',region:'DE',email:'Kerstin.Beneke@sageappliances.com',slackId:'',initials:'KB',colour:'var(--or)'},
    'andrew-sirotnik': {n:'Andrew Sirotnik',role:'BRG Strategy',team:'Strategy',region:'AU',email:'',slackId:'',initials:'AS',colour:'var(--ac)'},
    'emma-coatley': {n:'Emma Coatley',role:'Brand Budget Coordinator',team:'Brand',region:'AU',email:'Emma.Coatley@breville.com',slackId:'',initials:'EC',colour:'var(--gn)'},
    'jim-clayton': {n:'Jim Clayton',role:'BRG Executive',team:'Executive',region:'AU',email:'',slackId:'',initials:'JC',colour:'var(--yl)'},
    'natalie-moore': {n:'Natalie Moore',role:'HR Lead',team:'HR',region:'AU',email:'',slackId:'',initials:'NM',colour:'var(--rd)'},
    'cliff-torng': {n:'Cliff Torng',role:'Executive Sponsor',team:'Executive',region:'AU',email:'Cliff.Torng@breville.com.au',slackId:'',initials:'CT',colour:'var(--or)',tier:'executive',scope:'Strategic guidance, category story, brand moat'},
    'usman-zia': {n:'Usman Zia',role:'GTM Finance Manager',team:'Finance',region:'AU',email:'Usman.Zia@breville.com',slackId:'',initials:'UZ',colour:'var(--pu)',tier:'finance',scope:'Beanz P&L in Power BI, D365 reconciliation, profitability analysis'},
    'vicki-kourkoutas': {n:'Vicki Kourkoutas',role:'EA to Cliff Torng',team:'Executive',region:'AU',email:'Vicki.Kourkoutas@breville.com.au',slackId:'',initials:'VK',colour:'var(--cy)'},
    'savannah-dirsa': {n:'Savannah Dirsa',role:'Legal US',team:'Legal',region:'US',email:'Savannah.Dirsa@breville.com',slackId:'',initials:'SD',colour:'var(--or)'},
    'lucy-martyn': {n:'Lucy Martyn',role:'Beanz Brand / Comms',team:'Brand',region:'AU',email:'Lucy.Martyn@breville.com.au',slackId:'',initials:'LM',colour:'var(--ac)'},
    'ally-barajas': {n:'Ally Barajas',role:'VP Marketing, Breville USA',team:'Marketing US',region:'US',email:'Ally.Barajas@brevilleusa.com',slackId:'',initials:'AB',colour:'var(--gn)',tier:'leadership',scope:'US marketing calendar, WOC activation, Platinum content strategy'},
    'jennifer-quach': {n:'Jennifer Quach',role:'Product / Analytics',team:'Beanz Analytics',region:'AU',email:'Jennifer.Quach@breville.com',slackId:'',initials:'JQ',colour:'var(--cy)',tier:'core',scope:'Retention criteria definition, segmentation, NL retention metrics'},
    'camille-degors': {n:'Camille Degors',role:'Beanz Co-Ordinator Germany',team:'Beanz EU',region:'DE',email:'Camille.Degors@sageappliances.com',slackId:'',initials:'CD',colour:'var(--or)',tier:'regional',scope:'Germany operations, DPD logistics, NL cross-border, MaraX3 content'},
    'craig-robinson': {n:'Craig Robinson',role:'Finance',team:'Finance',region:'AU',email:'Craig.Robinson@breville.com.au',slackId:'',initials:'CR',colour:'var(--ac)',tier:'finance',scope:'Beanz P&L co-owner with Usman'},
    'sarah-robinson': {n:'Sarah Robinson',role:'Software Projects Lead',team:'Technology',region:'AU',email:'Sarah.Robinson@breville.com.au',slackId:'',initials:'SR',colour:'var(--pu)',tier:'tech',scope:'Monthly software project updates, tech coordination'},
    'nadia-schwartz': {n:'Nadia Schwartz',role:'Project Management',team:'PMO',region:'AU',email:'Nadia.Schwartz@breville.com',slackId:'',initials:'NS',colour:'var(--cy)',tier:'support',scope:'Execution planning, Confluence integration'},
    'noel-burchill': {n:'Noel Burchill',role:'Management',team:'Executive',region:'AU',email:'Noel.Burchill@breville.com.au',slackId:'',initials:'NB',colour:'var(--or)',tier:'leadership',scope:'Oversight, CC\'d on key communications'},
    'eleanor-welch': {n:'Eleanor Welch',role:'Fast Track Program Lead',team:'Growth',region:'AU',email:'Eleanor.Welch@breville.com',slackId:'',initials:'EW',colour:'var(--ac)'},
    'monika-fekete': {n:'Monika Fekete',role:'MICE Coordinator',team:'Events',region:'AU',email:'',slackId:'',initials:'MF',colour:'var(--cy)'},
    'chiara-greensill': {n:'Chiara Greensill',role:'Creative / AfterHours Agency',team:'External',region:'AU',email:'Chiara.Greensill@breville.com',slackId:'',initials:'CG',colour:'var(--gn)'},
    'tal-ball': {n:'Tal Ball',role:'Beanz DE Team',team:'Beanz EU',region:'DE',email:'Tal.Ball@sageappliances.com',slackId:'',initials:'TB',colour:'var(--or)'},
    'rodrigo-beanz': {n:'Rodrigo',role:'Beanz Team',team:'Beanz',region:'AU',email:'',slackId:'',initials:'RO',colour:'var(--ac)'},
    'nadia-beanz': {n:'Nadia',role:'Beanz Team',team:'Beanz',region:'AU',email:'',slackId:'',initials:'NA',colour:'var(--cy)'}
  },
  metrics: {
    // Legacy static data (fallback)
    subscribers: { total:14520, markets:5, avgDeliveries:6.2, yoyGrowth:99 },
    marketBreakdown: [
      {name:'United States',pct:43.5,count:6319,colour:'var(--ac)'},
      {name:'United Kingdom',pct:35.4,count:5140,colour:'var(--pu)'},
      {name:'Australia',pct:18.2,count:2643,colour:'var(--gn)'},
      {name:'Germany',pct:2.9,count:428,colour:'var(--or)'}
    ],
    retention: [
      {name:'Fruit',avg:8.1,colour:'var(--gn)'},
      {name:'Roaster Spotlight',avg:7.2,colour:'var(--pu)'},
      {name:'Discovery Classic',avg:6.5,colour:'var(--ac)'},
      {name:'Explorer',avg:5.8,colour:'var(--cy)'},
      {name:'Chocolate',avg:4.6,colour:'var(--or)'}
    ],
    revenueHighlights: [
      {label:'Bags shipped globally',val:'+1.5M',delta:'+63%'},
      {label:'Active subscribers',val:'23K',delta:'+99%'},
      {label:'Tonnes shipped',val:'303',delta:'+75%'},
      {label:'Total customers',val:'160K',delta:'+89%'}
    ]
  },
  // Daily Summary — populated live from /api/intelligence + /api/strategy
  dailySummary: {
    insights: [],
    recommendations: []
  },
    // Power BI live extraction data (loaded async from /api/digest)
  digest: null,
  digestCadence: 'weekly',
  digestView: 'engine',
  digestLoading: false,
  digestError: null
};
// __DATA_END__
