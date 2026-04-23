/**
 * chat-tools.js — Tool dispatcher for the Chat tab.
 *
 * Each tool gives Claude direct, structured access to one tab's data.
 * Tools return compact JSON so context budget isn't blown on every call.
 *
 * Exported API:
 *   buildToolSchemas()        → array of tool schemas for Anthropic messages.tools
 *   runTool(name, input, ctx) → executes the tool, returns { ok, data?, error? }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON } = require('./helpers');

function safeRead(filePath) {
  try { return fs.existsSync(filePath) ? readJSON(filePath) : null; } catch { return null; }
}

function truncateArray(arr, max) {
  if (!Array.isArray(arr)) return arr;
  if (arr.length <= max) return arr;
  return arr.slice(0, max).concat([{ _truncated: true, remaining: arr.length - max }]);
}

// ═══════════════════════════════════════════════════════════════
// Tool schemas (Anthropic tool-use format)
// ═══════════════════════════════════════════════════════════════

function buildToolSchemas() {
  return [
    {
      name: 'get_metrics_snapshot',
      description: 'Read the current Databricks metrics snapshot (Revenue, Subscribers, FTBP, SLA, Roasters, Cancellation Reasons). Use this for any question about KPIs, revenue, bags, churn, FTBP conversion, delivery SLA, or market performance. Supports optional fiscal-year, calendar-year, and market filters.',
      input_schema: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Period key like FY26, FY25, CY25, CY24 (default FY26).' },
          market: { type: 'string', description: 'Optional market filter: AU, UK, US, DE, NL.' },
          sections: { type: 'array', items: { type: 'string' }, description: 'Which sections to return. Default: all. Options: revenue, subscribers, ftbp, sla, roasters, cancellation_reasons, sparklines, deltas.' }
        }
      }
    },
    {
      name: 'query_comms_threads',
      description: 'Search unified comms threads (Slack + email). Returns matching thread summaries with sender, subject, last message time, and classification. Use for questions about recent emails, Slack conversations, specific people\'s communications, action-required items, or unread threads.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to match against subject/sender/body.' },
          source: { type: 'string', enum: ['all', 'email', 'slack'], description: 'Filter by source (default all).' },
          status: { type: 'string', enum: ['all', 'unread', 'action_required', 'info_only', 'pinned', 'completed'], description: 'Filter by status.' },
          since_hours: { type: 'number', description: 'Only threads active in the last N hours.' },
          limit: { type: 'number', description: 'Max threads to return (default 20, max 50).' }
        }
      }
    },
    {
      name: 'get_email_performance',
      description: 'Email campaign performance data — sent/delivered/open%/CTR by category, top and bottom performers, regional split, cohort cuts, and top-clicked links. Use for questions about BIEDM, Welcome Series, lifecycle emails, email campaigns, or CTR.',
      input_schema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['summary', 'top', 'bottom', 'by_category', 'by_region', 'benchmarks'], description: 'Which slice to return (default summary).' },
          category: { type: 'string', description: 'Optional email category: BIEDM, Welcome Series, Subscription Lifecycle, Transactional.' },
          limit: { type: 'number', description: 'Max rows (default 10).' }
        }
      }
    },
    {
      name: 'get_roasters_insights',
      description: 'Coffee Intelligence data from the Roasters Insights backend — competitive moves, roaster briefings, anomalies, and coffee industry signals. Use for questions about specialty coffee, roasters, CIBE, competitive activity, or coffee industry news.',
      input_schema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['summary', 'competitive_moves', 'anomalies', 'briefings'], description: 'Which slice (default summary).' },
          limit: { type: 'number', description: 'Max items (default 10).' }
        }
      }
    },
    {
      name: 'get_news_highlights',
      description: 'AI + Coffee news feed highlights. Use for questions about industry news, AI/tech news, competitor moves, or what\'s happening externally.',
      input_schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['all', 'ai', 'coffee', 'tech'], description: 'Topic filter (default all).' },
          limit: { type: 'number', description: 'Max stories (default 10).' }
        }
      }
    },
    {
      name: 'get_jira_tickets',
      description: 'Project tickets from Jira — search by project, assignee, status, or recent activity. Use for questions about sprint status, project progress, what team members are working on, or specific tickets.',
      input_schema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional project key filter.' },
          assignee: { type: 'string', description: 'Optional assignee name/email.' },
          status: { type: 'string', description: 'Optional status filter (e.g. "In Progress", "Done").' },
          query: { type: 'string', description: 'Optional text match on summary/description.' },
          limit: { type: 'number', description: 'Max tickets (default 15).' }
        }
      }
    },
    {
      name: 'get_strategy_correlations',
      description: 'Strategic correlations and data cross-signals (e.g. Cancellation vs Growth, Oracle over-index, FTBP v2 conversion leap). Use for strategic questions, correlations, or when the user asks "what should I worry about" / "what\'s the biggest risk".',
      input_schema: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['all', 'critical', 'warning', 'opportunity', 'positive'], description: 'Filter by severity (default all).' }
        }
      }
    },
    {
      name: 'get_people_directory',
      description: 'Team directory — find a person by name, role, or team. Returns contact details, responsibilities, and current focus. Use for questions about who owns what, who to contact, or team structure.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name, role, or team to search for.' },
          limit: { type: 'number', description: 'Max results (default 10).' }
        }
      }
    },
    {
      name: 'get_project_updates',
      description: 'Latest project status updates — FTBP, Project Feral, Platinum Roasters, PBB, DE/NL expansion, etc. Use for project health questions.',
      input_schema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional project name filter (partial match).' },
          limit: { type: 'number', description: 'Max projects (default 10).' }
        }
      }
    },
    {
      name: 'get_calendar_events',
      description: 'Upcoming calendar events from Outlook. Use for questions about today\'s schedule, upcoming meetings, or free/busy windows.',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-ahead window in days (default 7).' },
          limit: { type: 'number', description: 'Max events (default 15).' }
        }
      }
    },
    {
      name: 'search_obsidian_vault',
      description: 'RAG search over the Obsidian Brain knowledge vault — curated knowledge about strategy, people, projects, coffee, AI, meeting notes. Use when the question is about historical context, strategic documents, detailed project background, or anything the other tools won\'t find.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text.' },
          max_results: { type: 'number', description: 'Max pages to return (default 6, max 15).' }
        },
        required: ['query']
      }
    },
    {
      name: 'search_brain_chunks',
      description: 'Fine-grained chunk-level semantic search over the Obsidian Brain — returns 700-char passages instead of whole pages. Use for precise factual lookups where page-level context is too coarse. Phase E infrastructure.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text.' },
          max_results: { type: 'number', description: 'Max chunks (default 10, max 30).' }
        },
        required: ['query']
      }
    },
    {
      name: 'get_daily_summary',
      description: 'Consolidated daily briefing — top actions, exceptions, comms pulse, strategy headlines, project movement. Use when the user asks for a daily digest, summary, or "what should I know today".',
      input_schema: {
        type: 'object',
        properties: {}
      }
    }
  ];
}

// ═══════════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════════

async function runTool(name, input, ctx) {
  try {
    switch (name) {
      case 'get_metrics_snapshot': return toolMetrics(input, ctx);
      case 'query_comms_threads': return toolComms(input, ctx);
      case 'get_email_performance': return toolEmailPerf(input, ctx);
      case 'get_roasters_insights': return toolRoasters(input, ctx);
      case 'get_news_highlights': return toolNews(input, ctx);
      case 'get_jira_tickets': return toolJira(input, ctx);
      case 'get_strategy_correlations': return toolStrategy(input, ctx);
      case 'get_people_directory': return toolPeople(input, ctx);
      case 'get_project_updates': return toolProjects(input, ctx);
      case 'get_calendar_events': return toolCalendar(input, ctx);
      case 'search_obsidian_vault': return toolVault(input, ctx);
      case 'search_brain_chunks': return toolBrainChunks(input, ctx);
      case 'get_daily_summary': return toolDailySummary(input, ctx);
      default: return { ok: false, error: 'Unknown tool: ' + name };
    }
  } catch (e) {
    return { ok: false, error: 'Tool ' + name + ' failed: ' + e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// Individual tool implementations
// ═══════════════════════════════════════════════════════════════

function toolMetrics(input, ctx) {
  const snap = safeRead(path.join(ctx.intelDir, 'metrics-live.json'));
  if (!snap) return { ok: false, error: 'Metrics snapshot not available. Run scripts/refresh-metrics.js.' };
  const period = (input && input.period) || 'FY26';
  const market = input && input.market;
  const sections = (input && input.sections) || null;
  const pd = (snap.per_period || {})[period] || {};
  const cur = (snap.periods || {})[period] || {};

  const out = { period, market: market || 'all', generated_at: snap.generated_at };
  const want = s => !sections || sections.indexOf(s) !== -1;

  if (want('revenue')) {
    out.revenue = {
      total_aud: cur.revenue_aud,
      bags: cur.bags,
      by_country: (pd.revenue_by_country || []).filter(r => !market || r.country === market),
      by_program: pd.revenue_by_program || []
    };
  }
  if (want('subscribers')) {
    out.subscribers = {
      active_by_country: (snap.active_subs_by_country || []).filter(r => !market || r.country === market),
      subs_monthly_last6: (snap.subs_monthly || []).slice(-6)
    };
  }
  if (want('ftbp')) {
    out.ftbp = pd.ftbp || null;
  }
  if (want('sla')) {
    out.sla = {
      by_country: (pd.sla_by_country || []).filter(r => !market || r.country === market),
      by_carrier: (pd.sla_by_carrier || []).filter(r => !market || r.country === market),
      last6: (snap.sla_monthly || []).slice(-6)
    };
  }
  if (want('roasters')) {
    out.roasters_top = truncateArray(pd.roasters_top || [], 10);
  }
  if (want('cancellation_reasons')) {
    out.cancellation_reasons = truncateArray(snap.cancellation_reasons_fy26 || [], 8);
  }
  return { ok: true, data: out };
}

function toolComms(input, ctx) {
  const comms = safeRead(ctx.commsLivePath) || safeRead(path.join(ctx.intelDir, 'comms-live.json'));
  const emails = safeRead(path.join(ctx.intelDir, 'email-live.json'));
  const threads = [];
  const now = Date.now();
  const cutoff = input && input.since_hours ? now - input.since_hours * 3600 * 1000 : null;

  const collect = (arr, source) => {
    if (!Array.isArray(arr)) return;
    for (const t of arr) {
      const ts = t.last_message_at || t.date || t.timestamp;
      const tsMs = ts ? new Date(ts).getTime() : 0;
      if (cutoff && tsMs && tsMs < cutoff) continue;
      threads.push({
        id: t.id || t.threadId || t.channel_thread_ts,
        source,
        subject: t.subject || t.topic || '',
        sender: t.sender || t.from || (t.people && t.people[0]) || '',
        last_message_at: ts,
        summary: (t.summary || t.preview || t.body || '').slice(0, 300),
        status: t.status || 'unknown',
        unread: !!(t.unread || (t.status && t.status.indexOf('unread') >= 0))
      });
    }
  };
  if (comms && Array.isArray(comms.threads)) collect(comms.threads, 'slack');
  if (emails && Array.isArray(emails.threads)) collect(emails.threads, 'email');
  else if (comms && Array.isArray(comms.emails)) collect(comms.emails, 'email');

  let filtered = threads;
  const source = input && input.source;
  if (source && source !== 'all') filtered = filtered.filter(t => t.source === source);
  const status = input && input.status;
  if (status && status !== 'all') {
    if (status === 'unread') filtered = filtered.filter(t => t.unread);
    else filtered = filtered.filter(t => t.status === status);
  }
  const q = input && input.query;
  if (q) {
    const qLow = q.toLowerCase();
    filtered = filtered.filter(t =>
      (t.subject || '').toLowerCase().includes(qLow) ||
      (t.sender || '').toLowerCase().includes(qLow) ||
      (t.summary || '').toLowerCase().includes(qLow)
    );
  }

  filtered.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  const limit = Math.min(input && input.limit ? input.limit : 20, 50);
  return { ok: true, data: { total_matched: filtered.length, threads: filtered.slice(0, limit) } };
}

function toolEmailPerf(input, ctx) {
  const perf = safeRead(path.join(ctx.intelDir, 'email-perf-live.json'));
  if (!perf) return { ok: false, error: 'Email performance snapshot not available.' };
  const view = (input && input.view) || 'summary';
  const limit = (input && input.limit) || 10;

  const all = perf.emails || perf.items || [];
  if (view === 'summary') {
    const totalSends = all.reduce((s, e) => s + (e.sent || 0), 0);
    const avgOpen = all.length ? all.reduce((s, e) => s + (e.open_rate || 0), 0) / all.length : 0;
    const avgCtr = all.length ? all.reduce((s, e) => s + (e.ctr || 0), 0) / all.length : 0;
    return { ok: true, data: { total_emails: all.length, total_sends: totalSends, avg_open_rate: avgOpen, avg_ctr: avgCtr, benchmarks: perf.benchmarks || null } };
  }
  let list = all.slice();
  if (input && input.category) list = list.filter(e => (e.category || '').toLowerCase() === input.category.toLowerCase());
  if (view === 'top') list.sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
  if (view === 'bottom') list.sort((a, b) => (a.ctr || 0) - (b.ctr || 0));
  if (view === 'by_category') {
    const groups = {};
    list.forEach(e => { const k = e.category || 'other'; groups[k] = groups[k] || { category: k, count: 0, total_sent: 0, avg_open: 0, avg_ctr: 0 }; groups[k].count++; groups[k].total_sent += e.sent || 0; groups[k].avg_open += e.open_rate || 0; groups[k].avg_ctr += e.ctr || 0; });
    const rows = Object.values(groups).map(g => ({ ...g, avg_open: g.avg_open / g.count, avg_ctr: g.avg_ctr / g.count }));
    return { ok: true, data: { by_category: rows } };
  }
  if (view === 'by_region') {
    return { ok: true, data: { by_region: perf.by_region || perf.regional_split || null } };
  }
  if (view === 'benchmarks') {
    return { ok: true, data: { benchmarks: perf.benchmarks || null } };
  }
  return { ok: true, data: { emails: list.slice(0, limit).map(e => ({ name: e.name, category: e.category, sent: e.sent, delivered: e.delivered, open_rate: e.open_rate, ctr: e.ctr, top_link: e.top_link })) } };
}

function toolRoasters(input, ctx) {
  const ri = safeRead(path.join(ctx.intelDir, 'roasters-insights-live.json'));
  if (!ri) return { ok: false, error: 'Roasters Insights snapshot unavailable.' };
  const view = (input && input.view) || 'summary';
  const limit = (input && input.limit) || 10;
  if (view === 'summary') return { ok: true, data: { total_signals: (ri.signals || []).length, latest_at: ri.generated_at, headline: ri.headline || null, top_briefings: truncateArray(ri.briefings || [], 3), top_moves: truncateArray(ri.competitive_moves || [], 3) } };
  if (view === 'competitive_moves') return { ok: true, data: { competitive_moves: truncateArray(ri.competitive_moves || [], limit) } };
  if (view === 'anomalies') return { ok: true, data: { anomalies: truncateArray(ri.anomalies || [], limit) } };
  if (view === 'briefings') return { ok: true, data: { briefings: truncateArray(ri.briefings || [], limit) } };
  return { ok: true, data: ri };
}

function toolNews(input, ctx) {
  const topic = (input && input.topic) || 'all';
  const limit = (input && input.limit) || 10;
  const sources = [];
  if (topic === 'all' || topic === 'ai' || topic === 'tech') {
    const tech = safeRead(path.join(ctx.intelDir, 'tech-news-live.json'));
    if (tech && Array.isArray(tech.stories)) sources.push(...tech.stories.map(s => ({ ...s, topic: 'ai/tech' })));
  }
  if (topic === 'all' || topic === 'coffee') {
    const coffee = safeRead(path.join(ctx.intelDir, 'coffee-news-live.json')) || safeRead(path.join(ctx.intelDir, 'news-live.json'));
    if (coffee && Array.isArray(coffee.stories)) sources.push(...coffee.stories.map(s => ({ ...s, topic: 'coffee' })));
  }
  sources.sort((a, b) => new Date(b.published_at || b.date || 0) - new Date(a.published_at || a.date || 0));
  return { ok: true, data: { stories: sources.slice(0, limit).map(s => ({ topic: s.topic, title: s.title, source: s.source, summary: (s.summary || s.description || '').slice(0, 300), published_at: s.published_at || s.date, url: s.url })) } };
}

function toolJira(input, ctx) {
  const jira = safeRead(path.join(ctx.intelDir, 'jira-live.json'));
  if (!jira) return { ok: false, error: 'Jira snapshot unavailable.' };
  let issues = jira.issues || jira.tickets || [];
  const project = input && input.project;
  const assignee = input && input.assignee;
  const status = input && input.status;
  const query = input && input.query;
  if (project) issues = issues.filter(i => (i.project || i.project_key || '').toLowerCase().includes(project.toLowerCase()));
  if (assignee) issues = issues.filter(i => (i.assignee || '').toLowerCase().includes(assignee.toLowerCase()));
  if (status) issues = issues.filter(i => (i.status || '').toLowerCase() === status.toLowerCase());
  if (query) { const q = query.toLowerCase(); issues = issues.filter(i => (i.summary || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)); }
  issues.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
  const limit = (input && input.limit) || 15;
  return { ok: true, data: { total_matched: issues.length, tickets: issues.slice(0, limit).map(i => ({ key: i.key, summary: i.summary, status: i.status, assignee: i.assignee, project: i.project || i.project_key, priority: i.priority, updated: i.updated })) } };
}

function toolStrategy(input, ctx) {
  try {
    const { buildStrategyPayload } = require('./strategy-engine');
    const payload = buildStrategyPayload();
    let correlations = payload.correlations || payload.insights || [];
    const severity = input && input.severity;
    if (severity && severity !== 'all') correlations = correlations.filter(c => (c.severity || '').toLowerCase() === severity.toLowerCase());
    return { ok: true, data: { correlations: correlations.map(c => ({ title: c.title, severity: c.severity, summary: c.summary || c.detail, recommendation: c.recommendation, tags: c.tags })) } };
  } catch (e) { return { ok: false, error: 'Strategy engine failed: ' + e.message }; }
}

function toolPeople(input, ctx) {
  const dir = safeRead(path.join(ctx.intelDir, 'team-directory.json')) || safeRead(path.join(ctx.dir, 'kb-data/intelligence/team-directory.json'));
  if (!dir) return { ok: false, error: 'Team directory unavailable.' };
  const people = dir.people || dir.members || [];
  let list = people;
  const q = input && input.query;
  if (q) {
    const qLow = q.toLowerCase();
    list = list.filter(p =>
      ((p.name || '') + ' ' + (p.role || '') + ' ' + (p.team || '') + ' ' + (p.email || '')).toLowerCase().includes(qLow)
    );
  }
  const limit = (input && input.limit) || 10;
  return { ok: true, data: { total: list.length, people: list.slice(0, limit).map(p => ({ name: p.name, role: p.role, team: p.team, email: p.email, focus: p.focus || p.responsibilities })) } };
}

function toolProjects(input, ctx) {
  const updates = safeRead(path.join(ctx.intelDir, 'project-updates.json')) || safeRead(path.join(ctx.dir, 'kb-data/intelligence/project-updates.json'));
  if (!updates) return { ok: false, error: 'Project updates unavailable.' };
  let list = updates.projects || updates.items || [];
  const q = input && input.project;
  if (q) { const qLow = q.toLowerCase(); list = list.filter(p => (p.name || '').toLowerCase().includes(qLow)); }
  const limit = (input && input.limit) || 10;
  return { ok: true, data: { projects: list.slice(0, limit).map(p => ({ name: p.name, status: p.status, owner: p.owner, health: p.health, last_update: p.last_update || p.updated_at, summary: (p.summary || p.description || '').slice(0, 400) })) } };
}

function toolCalendar(input, ctx) {
  const cal = safeRead(path.join(ctx.intelDir, 'calendar-live.json')) || safeRead(path.join(ctx.dir, 'kb-data/intelligence/calendar-live.json'));
  if (!cal) return { ok: false, error: 'Calendar snapshot unavailable.' };
  const events = cal.events || [];
  const days = (input && input.days) || 7;
  const cutoff = Date.now() + days * 86400000;
  const upcoming = events
    .filter(e => new Date(e.start || e.startDateTime || 0).getTime() <= cutoff)
    .sort((a, b) => new Date(a.start || a.startDateTime || 0) - new Date(b.start || b.startDateTime || 0));
  const limit = (input && input.limit) || 15;
  return { ok: true, data: { events: upcoming.slice(0, limit).map(e => ({ subject: e.subject || e.title, start: e.start || e.startDateTime, end: e.end || e.endDateTime, location: e.location, attendees: e.attendees })) } };
}

function toolVault(input, ctx) {
  const query = input && input.query;
  if (!query) return { ok: false, error: 'query is required' };
  try {
    const rag = require('./obsidian-rag');
    const max = Math.min((input && input.max_results) || 6, 15);
    const hits = rag.search(query, { maxResults: max, maxChars: 30000, maxPerPage: 3000, traceSource: 'chat' });
    return { ok: true, data: { total: hits.length, pages: hits.map(h => ({ title: h.title, relPath: h.relPath, score: h.score, tags: h.tags, snippet: (h.content || '').slice(0, 2000) })) } };
  } catch (e) { return { ok: false, error: 'Vault search failed: ' + e.message }; }
}

function toolBrainChunks(input, ctx) {
  const query = input && input.query;
  if (!query) return { ok: false, error: 'query is required' };
  try {
    const chunks = require('./obsidian-chunks');
    const max = Math.min((input && input.max_results) || 10, 30);
    const hits = chunks.searchChunks(query, { maxResults: max });
    return { ok: true, data: { total: hits.length, chunks: hits.map(h => ({ relPath: h.rel_path, chunkIndex: h.chunk_index, score: h.score, content: h.content })) } };
  } catch (e) { return { ok: false, error: 'Chunk search failed: ' + e.message }; }
}

function toolDailySummary(input, ctx) {
  try {
    const digest = safeRead(path.join(ctx.intelDir, 'daily-digest-latest.json')) || safeRead(path.join(ctx.digestOutput || '', 'latest.json'));
    const summaryBits = { date: new Date().toISOString().slice(0, 10) };
    if (digest) summaryBits.digest = digest;
    // Pull the most critical strategy correlations + exception bar anomalies
    try {
      const { buildStrategyPayload } = require('./strategy-engine');
      const strat = buildStrategyPayload();
      summaryBits.top_correlations = (strat.correlations || []).slice(0, 4).map(c => ({ title: c.title, severity: c.severity, summary: c.summary }));
    } catch {}
    try {
      const snap = safeRead(path.join(ctx.intelDir, 'metrics-live.json'));
      if (snap && snap.periods && snap.periods.FY26) summaryBits.fy26 = { revenue_aud: snap.periods.FY26.revenue_aud, bags: snap.periods.FY26.bags };
    } catch {}
    return { ok: true, data: summaryBits };
  } catch (e) { return { ok: false, error: 'Daily summary failed: ' + e.message }; }
}

module.exports = { buildToolSchemas, runTool };
