'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var { jsonReply, readBody, readJSON } = require('../lib/helpers');
var { getDb, logAction } = require('../lib/db');

// ─── Constants ───────────────────────────────────────────────
var MODEL = 'claude-sonnet-4-20250514';
var API_HOSTNAME = 'api.anthropic.com';
var API_PATH = '/v1/messages';
var API_VERSION = '2023-06-01';
var GENERATE_MAX_TOKENS = 16000;

// ─── DB Schema ───────────────────────────────────────────────
function ensureDigestsTable() {
  var db = getDb();
  db.exec(
    'CREATE TABLE IF NOT EXISTS digests (' +
    '  id TEXT PRIMARY KEY,' +
    '  type TEXT NOT NULL,' +
    '  date TEXT NOT NULL,' +
    '  content TEXT NOT NULL,' +
    '  generated_at TEXT NOT NULL,' +
    '  source_status TEXT,' +
    '  sections_count INTEGER DEFAULT 0' +
    ')'
  );
}

// ─── Helpers ─────────────────────────────────────────────────
function generateId() {
  return 'dg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function detectDigestType() {
  var now = new Date();
  var day = now.getDate();
  var dow = now.getDay(); // 0=Sun, 1=Mon
  if (day === 1) return 'monthly';
  if (dow === 1) return 'weekly';
  return 'daily';
}

function formatDateRange(type) {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var today = y + '-' + m + '-' + d;

  if (type === 'daily') {
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().slice(0, 10) + ' to ' + today;
  }
  if (type === 'weekly') {
    var weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return weekAgo.toISOString().slice(0, 10) + ' to ' + today;
  }
  if (type === 'monthly') {
    var prevMonth = new Date(y, now.getMonth() - 1, 1);
    var prevEnd = new Date(y, now.getMonth(), 0);
    return prevMonth.toISOString().slice(0, 10) + ' to ' + prevEnd.toISOString().slice(0, 10);
  }
  return today;
}

function callAnthropic(apiKey, systemPrompt, userMessage, maxTokens) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || GENERATE_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    var req = https.request({
      hostname: API_HOSTNAME,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION
      }
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            reject(new Error('Unexpected API response'));
          }
        } catch (e) {
          reject(new Error('Failed to parse API response: ' + e.message));
        }
      });
    });

    req.on('error', function(err) {
      reject(new Error('API request failed: ' + err.message));
    });

    req.write(body);
    req.end();
  });
}

// ─── Data Gathering ──────────────────────────────────────────
function gatherContextData(ctx, type) {
  var sources = {};
  var context = {};

  // Comms threads (email + slack)
  try {
    var commsPath = ctx.commsLivePath;
    if (fs.existsSync(commsPath)) {
      var commsData = readJSON(commsPath);
      if (commsData && commsData.threads) {
        context.comms = { threadCount: Object.keys(commsData.threads).length, threads: [] };
        var threads = commsData.threads;
        var keys = Object.keys(threads);
        // Take most recent 60 threads for comprehensive digest
        var sorted = keys.map(function(k) { return threads[k]; })
          .filter(function(t) { return t && t.subject; })
          .sort(function(a, b) { return new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0); })
          .slice(0, 60);
        context.comms.threads = sorted.map(function(t) {
          return {
            subject: (t.subject || '').slice(0, 100),
            source: t.source || 'unknown',
            priority: t.priority || 'medium',
            category: t.category || 'FYI',
            people: (t.people || []).slice(0, 3),
            lastActivity: t.lastActivity || '',
            actionRequired: t.actionRequired || false,
            snippet: (t.snippet || '').slice(0, 150)
          };
        });
        sources.comms = 'ok';
      } else {
        sources.comms = 'empty';
      }
    } else {
      sources.comms = 'unavailable';
    }
  } catch (e) {
    sources.comms = 'error';
  }

  // Email live data
  try {
    var emailPath = path.join(ctx.intelDir, 'email-live.json');
    if (fs.existsSync(emailPath)) {
      var emailData = readJSON(emailPath);
      if (emailData && emailData.messages) {
        context.email = {
          count: emailData.messages.length,
          messages: emailData.messages.slice(0, 20).map(function(m) {
            return {
              subject: (m.subject || '').slice(0, 100),
              from: m.from || '',
              date: m.receivedDateTime || '',
              importance: m.importance || 'normal',
              hasAttachments: m.hasAttachments || false
            };
          })
        };
        sources.email = 'ok';
      } else {
        sources.email = 'empty';
      }
    } else {
      sources.email = 'unavailable';
    }
  } catch (e) {
    sources.email = 'error';
  }

  // Calendar
  try {
    var calPath = path.join(ctx.intelDir, 'calendar-live.json');
    if (fs.existsSync(calPath)) {
      var calData = readJSON(calPath);
      if (calData && calData.events) {
        context.calendar = calData.events.slice(0, 15).map(function(ev) {
          return {
            subject: (ev.subject || '').slice(0, 100),
            start: ev.start || '',
            end: ev.end || '',
            organizer: ev.organizer || '',
            isAllDay: ev.isAllDay || false
          };
        });
        sources.calendar = 'ok';
      } else {
        sources.calendar = 'empty';
      }
    } else {
      sources.calendar = 'unavailable';
    }
  } catch (e) {
    sources.calendar = 'error';
  }

  // News
  try {
    var newsPath = ctx.newsStore;
    if (fs.existsSync(newsPath)) {
      var newsData = readJSON(newsPath);
      if (newsData && newsData.articles) {
        var recent = newsData.articles
          .filter(function(a) { return a && a.title; })
          .slice(0, 10);
        context.news = recent.map(function(a) {
          return {
            title: (a.title || '').slice(0, 100),
            source: a.source || '',
            category: a.category || '',
            publishedAt: a.publishedAt || '',
            summary: (a.aiSummary || a.description || '').slice(0, 200)
          };
        });
        sources.news = 'ok';
      } else {
        sources.news = 'empty';
      }
    } else {
      sources.news = 'unavailable';
    }
  } catch (e) {
    sources.news = 'error';
  }

  // Jira/project data from kb-data
  try {
    var projPath = path.join(ctx.kbDir, 'intelligence', 'project-updates.json');
    if (fs.existsSync(projPath)) {
      context.projects = readJSON(projPath);
      sources.jira = 'ok';
    } else {
      sources.jira = 'unavailable';
    }
  } catch (e) {
    sources.jira = 'error';
  }

  // Existing digest extraction data (from beanz-digest tool)
  try {
    var digestOutput = ctx.digestOutput;
    if (digestOutput && fs.existsSync(digestOutput)) {
      var latestDir = null;
      var cadDir = path.join(digestOutput, type);
      if (fs.existsSync(cadDir)) {
        var folders = fs.readdirSync(cadDir, { withFileTypes: true })
          .filter(function(d) { return d.isDirectory(); })
          .map(function(d) { return d.name; })
          .sort()
          .reverse();
        if (folders[0]) latestDir = path.join(cadDir, folders[0]);
      }
      if (latestDir) {
        var files = fs.readdirSync(latestDir).filter(function(f) { return f.endsWith('.json'); });
        var extraction = {};
        files.forEach(function(f) {
          var key = f.replace('.json', '');
          extraction[key] = readJSON(path.join(latestDir, f));
        });
        context.extraction = extraction;
        sources.extraction = 'ok';
      } else {
        sources.extraction = 'unavailable';
      }
    } else {
      sources.extraction = 'unavailable';
    }
  } catch (e) {
    sources.extraction = 'error';
  }

  return { sources: sources, context: context };
}

// ─── Digest Prompt ───────────────────────────────────────────
function buildDigestPrompt(type, dateRange, contextData) {
  var today = new Date();
  var todayStr = today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' });

  return 'You are generating a comprehensive executive intelligence digest for Ziv Shalev, General Manager of Beanz — Breville Group\'s specialty coffee subscription platform (beanz.com).\n\n' +
    'Digest type: ' + type.toUpperCase() + '\nDate range: ' + dateRange + '\nGenerated: ' + todayStr + ' AEST\n\n' +
    'CONTEXT: Beanz is a coffee subscription marketplace attached to Breville machines. 5 markets (AU, UK, US, DE, NL launching Jul 2026). Key programs: FTBP (Fast-Track Barista Pack — 41% of revenue), PBB (Powered by Beanz — white-label partners), Platinum Roasters. Key projects: Project Feral (AI retention/cancellation flow), Operation Freedom (UK Klarna), NL Rollout, CMS Migration ($160K penalty May 29 deadline). Team: Travis (ops), Sophie (program mgr), Daniel Granahan (Shopify), Jennifer (retention UX), Katherin (churn analysis), Raymon (marketing), Hugh (platinum roasters), Sarah (US roasters), Easwar (dev lead).\n\n' +
    'Generate a digest with 8 sections. Return ONLY valid JSON:\n' +
    '{\n' +
    '  "title": "BEANZ ' + type.toUpperCase() + ' DIGEST",\n' +
    '  "subtitle": "' + dateRange + '",\n' +
    '  "sourceStatus": {"outlook":"ok|unavailable","slack":"ok|unavailable","jira":"ok|unavailable","mixpanel":"unavailable","beanzGenie":"unavailable"},\n' +
    '  "executiveSummary": "4-6 sentences. Lead with the most critical operational issue. Include specific numbers. Mention key people. End with subscription health status.",\n' +
    '  "platformPerformance": {\n' +
    '    "revenue": {"yesterday":{"value":0,"yoy":"","yoyPct":0},"mtd":{"value":0},"lastMonth":{"value":0,"yoy":"","yoyPct":0}},\n' +
    '    "bags": {"yesterday":{"value":0,"yoy":"","yoyPct":0},"mtd":{"value":0},"lastMonth":{"value":0,"yoy":"","yoyPct":0}},\n' +
    '    "subscriptions": {"new":0,"cancelled":0,"net":0,"activeTotal":0,"active":0,"paused":0},\n' +
    '    "narrative": "3-4 sentences interpreting the numbers. What story do they tell? Revenue vs bags growth differential = price/mix? Sub growth decelerating?",\n' +
    '    "dataQualityNotes": ["any RateType issues","any missing sources"]\n' +
    '  },\n' +
    '  "projectProgress": [{\n' +
    '    "name": "Project Name",\n' +
    '    "statusEmoji": "red_circle|yellow_circle|green_circle|pause_button",\n' +
    '    "status": "Critical Incident|On Track|Some Issues|On Hold|Complete",\n' +
    '    "completion": 75,\n' +
    '    "owner": "Person Name",\n' +
    '    "targetDate": "Jul 2026",\n' +
    '    "highlights": ["Specific thing that happened with names, numbers, ticket IDs"],\n' +
    '    "blockers": ["Specific blocker with owner and impact"],\n' +
    '    "nextSteps": ["What needs to happen next"]\n' +
    '  }],\n' +
    '  "inboxHighlights": {\n' +
    '    "actionRequired": [{"subject":"...","from":"Full Name","summary":"2-3 sentences of what happened and what YOU need to do","deadline":"today|this week|ASAP"}],\n' +
    '    "fyi": [{"subject":"...","from":"Full Name","summary":"Why this matters"}]\n' +
    '  },\n' +
    '  "slackActivity": {\n' +
    '    "keyActions": [{"action":"What happened","who":"Person","channel":"#channel"}],\n' +
    '    "activeThreads": [{"topic":"Thread summary","channel":"#channel","replies":0,"urgency":"high|medium|low"}],\n' +
    '    "teamUpdates": ["Person is on leave from X to Y","Person posted update to #channel"]\n' +
    '  },\n' +
    '  "risksBlockers": [{\n' +
    '    "risk": "Specific risk description",\n' +
    '    "source": "Slack #channel / Jira TICKET-123 / Email",\n' +
    '    "severity": "critical|high|medium|low",\n' +
    '    "owner": "Person Name",\n' +
    '    "impact": "What happens if not addressed"\n' +
    '  }],\n' +
    '  "decisionsNeeded": [{\n' +
    '    "decision": "What needs to be decided",\n' +
    '    "context": "Background and why it matters",\n' +
    '    "deadline": "Today|This week|Before X",\n' +
    '    "raisedBy": "Person Name"\n' +
    '  }],\n' +
    '  "forwardLook": {\n' +
    '    "todayCalendar": [{"time":"10:00 AM","event":"Meeting name","with":"Person"}],\n' +
    '    "priorities": ["Priority 1 with context","Priority 2"],\n' +
    '    "upcoming": [{"what":"Event/deadline","when":"Date","note":"Why it matters"}]\n' +
    '  }\n' +
    '}\n\n' +
    'CRITICAL RULES:\n' +
    '- Be EXTREMELY specific. Use real names, real numbers, real ticket IDs, real channel names from the data.\n' +
    '- Never say "good" or "stable" without actual numbers. Show the number.\n' +
    '- Project progress should read like a war room update — what happened, what\'s blocked, who owns it.\n' +
    '- Risks should be actionable — who needs to do what by when.\n' +
    '- Forward look should include actual calendar events from the data.\n' +
    '- If data is missing or a source is unavailable, say so explicitly — never fabricate.\n' +
    '- Include ALL projects you can find evidence of in the data, not just the obvious ones.\n' +
    '- For platform performance: use actual numbers from the data. If Genie data unavailable, use whatever numbers exist in the context and flag the source.';
}

// ─── Parse AI Response ───────────────────────────────────────
function parseDigestResponse(text) {
  // Try to extract JSON from the response
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      executiveSummary: text.slice(0, 500),
      platformPerformance: { metrics: [], narrative: 'Could not parse structured response.' },
      projectProgress: [],
      inboxHighlights: { actionRequired: [], fyi: [], informational: [] },
      slackActivity: { decisions: [], discussions: [], updates: [] },
      risksBlockers: [],
      decisionsNeeded: [],
      forwardLook: { today: [], thisWeek: [], thisMonth: [] }
    };
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return {
      executiveSummary: text.slice(0, 500),
      platformPerformance: { metrics: [], narrative: 'JSON parse failed: ' + e.message },
      projectProgress: [],
      inboxHighlights: { actionRequired: [], fyi: [], informational: [] },
      slackActivity: { decisions: [], discussions: [], updates: [] },
      risksBlockers: [],
      decisionsNeeded: [],
      forwardLook: { today: [], thisWeek: [], thisMonth: [] }
    };
  }
}

function countSections(digest) {
  var count = 0;
  if (digest.executiveSummary) count++;
  if (digest.platformPerformance && (digest.platformPerformance.metrics || []).length > 0) count++;
  if ((digest.projectProgress || []).length > 0) count++;
  if (digest.inboxHighlights) count++;
  if (digest.slackActivity) count++;
  if ((digest.risksBlockers || []).length > 0) count++;
  if ((digest.decisionsNeeded || []).length > 0) count++;
  if (digest.forwardLook) count++;
  return count;
}

// ─── Route Handler ───────────────────────────────────────────
module.exports = function handleDailyDigest(req, res, parts, url, ctx) {
  ensureDigestsTable();
  var db = getDb();

  // GET /api/daily-digest — latest digest
  if (req.method === 'GET' && (!parts[0] || parts[0] === '')) {
    var type = url.searchParams.get('type') || '';
    var stmt;
    if (type && type !== 'auto') {
      stmt = db.prepare('SELECT * FROM digests WHERE type = ? ORDER BY generated_at DESC LIMIT 1');
      var row = stmt.get(type);
      if (!row) return jsonReply(res, 404, { error: 'No ' + type + ' digest found' });
      var parsed = Object.assign({}, row);
      try { parsed.content = JSON.parse(row.content); } catch (e) {}
      try { parsed.source_status = JSON.parse(row.source_status); } catch (e) {}
      return jsonReply(res, 200, parsed);
    }
    stmt = db.prepare('SELECT * FROM digests ORDER BY generated_at DESC LIMIT 1');
    var latest = stmt.get();
    if (!latest) return jsonReply(res, 404, { error: 'No digests found. Generate your first one.' });
    var result = Object.assign({}, latest);
    try { result.content = JSON.parse(latest.content); } catch (e) {}
    try { result.source_status = JSON.parse(latest.source_status); } catch (e) {}
    return jsonReply(res, 200, result);
  }

  // GET /api/daily-digest/history
  if (req.method === 'GET' && parts[0] === 'history') {
    var limit = parseInt(url.searchParams.get('limit') || '20', 10);
    var rows = db.prepare('SELECT id, type, date, generated_at, source_status, sections_count FROM digests ORDER BY generated_at DESC LIMIT ?').all(limit);
    rows.forEach(function(r) {
      try { r.source_status = JSON.parse(r.source_status); } catch (e) {}
    });
    return jsonReply(res, 200, { digests: rows });
  }

  // POST /api/daily-digest/save
  if (req.method === 'POST' && parts[0] === 'save') {
    return readBody(req).then(function(body) {
      if (!body || !body.content) {
        return jsonReply(res, 400, { error: 'Missing content' });
      }
      var id = body.id || generateId();
      var type = body.type || 'daily';
      var date = body.date || new Date().toISOString().slice(0, 10);
      var content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
      var sourceStatus = body.source_status ? JSON.stringify(body.source_status) : '{}';
      var sectionsCount = body.sections_count || 0;
      var generatedAt = body.generated_at || new Date().toISOString();

      db.prepare(
        'INSERT OR REPLACE INTO digests (id, type, date, content, generated_at, source_status, sections_count) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, type, date, content, generatedAt, sourceStatus, sectionsCount);

      logAction('digest_save', id, 'digest', { type: type });
      return jsonReply(res, 200, { ok: true, id: id });
    }).catch(function(e) {
      return jsonReply(res, 400, { error: 'Invalid request body: ' + e.message });
    });
  }

  // POST /api/daily-digest/generate
  if (req.method === 'POST' && parts[0] === 'generate') {
    return readBody(req).then(function(body) {
      var requestedType = (body && body.type) || '';
      var digestType = requestedType && requestedType !== 'auto' ? requestedType : detectDigestType();
      var dateRange = formatDateRange(digestType);

      if (!ctx.anthropicApiKey) {
        return jsonReply(res, 500, { error: 'Anthropic API key not configured' });
      }

      // Gather all available data
      var gathered = gatherContextData(ctx, digestType);
      var systemPrompt = buildDigestPrompt(digestType, dateRange, gathered.context);
      var userMessage = 'Here is the available data for the ' + digestType + ' digest (' + dateRange + '):\n\n' +
        JSON.stringify(gathered.context, null, 2);

      logAction('digest_generate_start', null, 'system', { type: digestType, sources: gathered.sources });

      return callAnthropic(ctx.anthropicApiKey, systemPrompt, userMessage, GENERATE_MAX_TOKENS)
        .then(function(responseText) {
          var digestContent = parseDigestResponse(responseText);
          var id = generateId();
          var now = new Date();
          var date = now.toISOString().slice(0, 10);
          var generatedAt = now.toISOString();
          var sourceStatus = JSON.stringify(gathered.sources);
          var sectionsCount = countSections(digestContent);
          var contentStr = JSON.stringify(digestContent);

          db.prepare(
            'INSERT OR REPLACE INTO digests (id, type, date, content, generated_at, source_status, sections_count) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(id, digestType, date, contentStr, generatedAt, sourceStatus, sectionsCount);

          logAction('digest_generate_complete', id, 'digest', { type: digestType, sections: sectionsCount });

          return jsonReply(res, 200, {
            ok: true,
            id: id,
            type: digestType,
            date: date,
            dateRange: dateRange,
            content: digestContent,
            generated_at: generatedAt,
            source_status: gathered.sources,
            sections_count: sectionsCount
          });
        })
        .catch(function(err) {
          logAction('digest_generate_error', null, 'system', { type: digestType, error: err.message });
          return jsonReply(res, 500, { error: 'Digest generation failed: ' + err.message });
        });
    }).catch(function(e) {
      return jsonReply(res, 400, { error: 'Invalid request: ' + e.message });
    });
  }

  // DELETE /api/daily-digest/:id
  if (req.method === 'DELETE' && parts[0]) {
    var delId = decodeURIComponent(parts[0]);
    var deleted = db.prepare('DELETE FROM digests WHERE id = ?').run(delId);
    if (deleted.changes === 0) {
      return jsonReply(res, 404, { error: 'Digest not found' });
    }
    logAction('digest_delete', delId, 'digest', {});
    return jsonReply(res, 200, { ok: true, deleted: delId });
  }

  // GET /api/daily-digest/:id — specific digest
  if (req.method === 'GET' && parts[0]) {
    var getId = decodeURIComponent(parts[0]);
    var found = db.prepare('SELECT * FROM digests WHERE id = ?').get(getId);
    if (!found) return jsonReply(res, 404, { error: 'Digest not found' });
    var out = Object.assign({}, found);
    try { out.content = JSON.parse(found.content); } catch (e) {}
    try { out.source_status = JSON.parse(found.source_status); } catch (e) {}
    return jsonReply(res, 200, out);
  }

  return jsonReply(res, 404, { error: 'Unknown daily-digest endpoint' });
};
