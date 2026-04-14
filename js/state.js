// ===============================================================
// APP STATE
// ===============================================================
const state = {
  module: 'summary',
  summarySection: null,
  sidebarCollapsed: false,
  selectedDay: (function(){ const d = (typeof DATA !== 'undefined' && DATA.comms && DATA.comms.days) ? DATA.comms.days : []; for (let i=0;i<d.length;i++) if (d[i].isToday) return i; return 0; })(),
  selectedTopic: null,
  selectedThread: null, // unified inbox thread id
  selectedProject: null,
  selectedPerson: null,
  panelOpen: false,
  panelContent: null,
  commsSearch: '',
  peopleSearch: '',
  peopleGroup: 'team',
  topicStatus: {}, // track done/snoozed per topic
  threadStatus: {}, // track done/snoozed per thread
  selectedCalEvent: -1,
  // Comms state
  commsSource: 'all',         // 'all' | 'email' | 'slack'
  commsSlackFilter: 'all',    // 'all' | 'dm' | 'group' | 'channel' | 'private'
  commsCategoryFilter: 'all', // 'all' | category name | 'action' | 'urgent'
  commsPinned: {},
  commsSnoozed: {},
  commsSnoozePickerOpen: null,
  threadSummaries: {},        // { threadId: { summary, keyPoints, suggestedAction } }
  commsDrafts: {},            // { threadId: { draftId, draftText, draftHtml, loading, error } }
  commsReplyMode: 'reply',    // 'reply' | 'replyAll' | 'compose'
  slackReplyMode: 'thread',  // 'thread' | 'channel' | 'dm'
  _slackDmTarget: null,      // name of person to DM (when slackReplyMode === 'dm')
  _attachmentCache: {},       // { graphId: [attachments] }
  commsComposerOpen: false,   // email composer overlay open
  commsComposerData: null,    // { mode, to, cc, bcc, subject, body, messageId, threadId, platform }
  // News tab state
  newsCategory: 'all',
  selectedNewsItem: null,
  newsSearch: '',
  newsSort: 'date',
  newsViewMode: 'cards',
  newsDateRange: 'all',
  newsPage: 1,
  newsReadIds: new Set(),
  newsDigest: null,
  newsTrends: null,
  // Comms Analytics tab state
  commsAnalyticsSection: 'overview',
  commsAnalyticsData: null,
  commsAnalyticsLoading: false,
  commsAnalyticsDays: 14,
  commsAnalyticsDrilldown: null,
  // Chat tab state
  chatSessionId: null,
  chatMessages: [],
  chatStreaming: false,
  chatStreamBuffer: '',
  chatSessions: [],
  chatSessionsLoaded: false
};

function setState(key, val) {
  state[key] = val;
  renderAll();
}

// ===============================================================
// UTILITIES
// ===============================================================
const $ = id => document.getElementById(id);
const h = (tag, cls, html) => `<${tag} class="${cls||''}">${html||''}</${tag}>`;

function getActionCount() {
  let c = 0;
  const threads = DATA.comms.threads || {};
  for (const [id,th] of Object.entries(threads)) {
    if ((th.priority==='critical'||th.priority==='action') && state.threadStatus[id]!=='done') c++;
  }
  return c;
}
function getDecisionCount() {
  let c = 0;
  const threads = DATA.comms.threads || {};
  for (const [id,th] of Object.entries(threads)) {
    if (th.priority==='critical' && state.threadStatus[id]!=='done') c++;
  }
  return c;
}

// ===============================================================
// RENDER ENGINE
// ===============================================================
// Load persisted statuses from server on init
async function loadPersistedStatuses() {
  try {
    const resp = await fetch('/api/status/threads');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.statuses) {
      for (const [id, entry] of Object.entries(data.statuses)) {
        state.threadStatus[id] = entry.status;
        if (entry.status === 'snoozed' && entry.snoozedUntil) {
          state.commsSnoozed[id] = { until: entry.snoozedUntil };
        }
      }
    }
    if (data.pinned) {
      for (const [id, val] of Object.entries(data.pinned)) {
        if (val) state.commsPinned[id] = true;
      }
    }
    // Also load dismissed items
    const dResp = await fetch('/api/status/dismissed');
    if (dResp.ok) {
      const dData = await dResp.json();
      if (dData.items) {
        state._dismissed = {};
        dData.items.forEach(item => { state._dismissed[item.item_id] = item.item_type; });
      }
    }
  } catch {}
}

function renderAll() {
  // Update badges
  const ac = getActionCount();
  const dc = getDecisionCount();
  $('actionBadge').textContent = ac + ' action' + (ac!==1?'s':'');
  $('decisionBadge').textContent = dc + ' decision' + (dc!==1?'s':'');

  // Nav rail
  if (typeof renderNavRail === 'function') renderNavRail();

  // Sidebar collapse + comms mode
  $('app').classList.toggle('collapsed', state.sidebarCollapsed);
  $('app').classList.toggle('comms-mode', state.module === 'comms');

  // Render sidebar + main based on module
  switch(state.module) {
    case 'summary': renderSummarySidebar(); renderSummaryMain(); break;
    case 'comms': renderCommsSidebar(); renderCommsMain(); break;
    case 'calendar': renderCalendarSidebar(); renderCalendarMain(); break;
    case 'projects': renderProjectsSidebar(); renderProjectsMain(); break;
    case 'people': renderPeopleSidebar(); renderPeopleMain(); break;
    case 'metrics': renderMetricsSidebar(); renderMetricsMain(); break;
    case 'strategy': renderStrategySidebar(); renderStrategyMain(); break;
    case 'news': renderNewsSidebar(); renderNewsMain(); break;
    case 'technews': renderTechNewsSidebar(); renderTechNewsMain(); break;
    case 'digest': renderDigestSidebar(); renderDigestMain(); break;
    case 'commsanalytics': renderCommsAnalyticsSidebar(); renderCommsAnalyticsMain(); break;
    case 'chat': renderChatSidebar(); renderChatMain(); break;
    case 'emailmarketing': renderEmailMarketingSidebar(); renderEmailMarketingMain(); break;
  }
}
