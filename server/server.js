const http = require('http');
const fs = require('fs');
const path = require('path');

const { MIME, jsonReply, readBody } = require('./lib/helpers');
const { refreshNewsData, loadNewsStore, isTranscriptUsable } = require('./lib/news-engine');
const { batchEnrichArticles, batchSummariseTopArticles: _batchSumm, extractAndTrackTopics: _extractTopics, detectCompetitorAlerts: _detectAlerts } = require('./lib/ai-news');
const { startRefreshScheduler, getRefreshStatus, refreshAll } = require('./lib/refresh-engine');
const { buildFreshnessReport, listExtractions: listDigestExtractions } = require('./lib/digest-bridge');
const { logAction } = require('./lib/db');

// Route handlers
const handleDigest = require('./routes/digest');
const handleStrategy = require('./routes/strategy');
const handleIntelligence = require('./routes/intelligence');
const { handlePeople, handlePowerBI } = require('./routes/intelligence');
const handleProjectIntelligence = require('./routes/project-intelligence');
const handleFeedback = require('./routes/feedback');
const handleMetrics = require('./routes/metrics');
const { handleCorrelations } = require('./routes/metrics');
const handleNews = require('./routes/news');
const handleTechNews = require('./routes/tech-news');
const handleComms = require('./routes/comms');
const handleCalendar = require('./routes/calendar');
const handleStatus = require('./routes/status');
const { handleJira, handleConfluence } = require('./routes/jira');
const handleProjectsEnriched = require('./routes/projects');
const { handleSend, handleReact, handleUpload } = require('./routes/slack');
const { buildAuthUrl, exchangeCodeForTokens } = require('./lib/outlook-api');
const tokenStore = require('./lib/ms-token-store');
const handlePowerBILive = require('./routes/powerbi-live');
const handleCIBE = require('./routes/cibe');
const { startCIBEScheduler } = require('./lib/cibe/scrape-orchestrator');
const { startPBIRefreshScheduler, getPBIRefreshStatus } = require('./lib/pbi-refresh-scheduler');
const handleCommsAnalytics = require('./routes/comms-analytics');
const handleChat = require('./routes/chat');
const handleNotebook = require('./routes/notebook');
const handleEmailPerf = require('./routes/email-perf');
const handleEmailMarketing = require('./routes/email-marketing');
const handleGenie = require('./routes/genie');
const handleDatabricks = require('./routes/databricks');
const handleDailyDigest = require('./routes/daily-digest');
const { generateDailySnapshot, generateAISummaries } = require('./lib/comms-analytics-engine');

// ─── Digest Extraction Trigger ───────────────────────────────
const { execFile } = require('child_process');

let _extractionRunning = false;
let _obsidianSyncing = false;
let _lastExtractionResult = null;

async function triggerExtraction(req, res, ctx) {
  if (_extractionRunning) {
    return jsonReply(res, 409, { ok: false, error: 'Extraction already running' });
  }

  let body = {};
  try { body = await readBody(req); } catch {}
  const cadence = body.cadence || 'daily';
  const headless = body.headless !== false; // default true

  _extractionRunning = true;
  _lastExtractionResult = { status: 'running', cadence, startedAt: new Date().toISOString() };

  const digestDir = path.join(process.env.USERPROFILE || process.env.HOME, 'beanz-digest');
  const extractScript = path.join(digestDir, 'src', 'extract.js');

  const args = [extractScript, '--cadence', cadence];
  if (headless) args.push('--headless');

  logAction('digest_trigger', null, 'system', { cadence, headless });

  // Fire and forget — extraction runs in background
  const child = execFile(process.execPath, args, {
    cwd: digestDir,
    timeout: 300000, // 5 minute timeout
    env: { ...process.env }
  }, (error, stdout, stderr) => {
    _extractionRunning = false;
    if (error) {
      _lastExtractionResult = {
        status: 'error',
        cadence,
        error: error.message,
        completedAt: new Date().toISOString()
      };
      logAction('digest_error', null, 'system', { cadence, error: error.message });
      console.error(`[Digest] Extraction failed: ${error.message}`);
    } else {
      _lastExtractionResult = {
        status: 'completed',
        cadence,
        completedAt: new Date().toISOString()
      };
      logAction('digest_complete', null, 'system', { cadence });
      console.log(`[Digest] Extraction completed (${cadence})`);
    }
  });

  return jsonReply(res, 200, {
    ok: true,
    message: `Extraction started (${cadence})`,
    cadence,
    headless
  });
}

// ─── Configuration ────────────────────────────────────────────
const PORT = 3737;
const DIR = path.resolve(__dirname, '..');

// Parse .env file
const _env = {};
try {
  const envPath = path.join(DIR, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.+)/);
      if (m) _env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    });
  }
} catch {}
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || _env.SLACK_BOT_TOKEN || '';
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || _env.SLACK_USER_TOKEN || '';
// Propagate email recipients from .env to process.env
if (_env.RESEARCH_EMAIL_RECIPIENTS) process.env.RESEARCH_EMAIL_RECIPIENTS = _env.RESEARCH_EMAIL_RECIPIENTS;
if (_env.COFFEE_RESEARCH_EMAIL_RECIPIENTS) process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS = _env.COFFEE_RESEARCH_EMAIL_RECIPIENTS;

// Shared context passed to all route handlers
const ctx = {
  dir: DIR,
  digestOutput: path.join(process.env.USERPROFILE || process.env.HOME, 'beanz-digest', 'output'),
  kbDir: path.join(DIR, 'kb-data'),
  intelDir: path.join(DIR, 'kb-data', 'intelligence'),
  learningStore: path.join(DIR, 'learning-store.json'),
  newsStore: path.join(DIR, 'news-store.json'),
  techNewsStore: path.join(DIR, 'tech-news-store.json'),
  commsLivePath: path.join(DIR, 'kb-data', 'intelligence', 'comms-live.json'),
  slackToken: SLACK_BOT_TOKEN,
  slackUserToken: SLACK_USER_TOKEN,
  slackReadToken: SLACK_USER_TOKEN || SLACK_BOT_TOKEN,  // user token preferred for reads
  atlassian: {
    email: _env.ATLASSIAN_EMAIL || '',
    token: _env.ATLASSIAN_API_TOKEN || '',
    baseUrl: _env.ATLASSIAN_BASE_URL || '',
    jiraProject: _env.JIRA_PROJECT_KEY || 'BEANZ',
    confluenceSpace: _env.CONFLUENCE_SPACE_KEY || 'BEANZ'
  },
  // Microsoft Graph (Outlook) configuration
  msGraph: {
    tenantId: process.env.MS_TENANT_ID || _env.MS_TENANT_ID || '',
    clientId: process.env.MS_CLIENT_ID || _env.MS_CLIENT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || _env.MS_CLIENT_SECRET || '',
    accessToken: process.env.MS_ACCESS_TOKEN || _env.MS_ACCESS_TOKEN || '',
    userEmail: process.env.MS_USER_EMAIL || _env.MS_USER_EMAIL || _env.ATLASSIAN_EMAIL || '',
    userDisplayName: 'Ziv Shalev'
  },
  // Databricks Genie API
  genie: {
    host: process.env.DATABRICKS_HOST || _env.DATABRICKS_HOST || '',
    token: process.env.DATABRICKS_TOKEN || _env.DATABRICKS_TOKEN || '',
    spaceId: process.env.DATABRICKS_GENIE_SPACE_ID || _env.DATABRICKS_GENIE_SPACE_ID || ''
  },
  // Databricks SQL Warehouse — OAuth2 service principal (or PAT fallback)
  databricks: {
    host: process.env.DATABRICKS_HOST || _env.DATABRICKS_HOST || '',
    warehouseId: process.env.DATABRICKS_WAREHOUSE_ID || _env.DATABRICKS_WAREHOUSE_ID || '',
    httpPath: process.env.DATABRICKS_HTTP_PATH || _env.DATABRICKS_HTTP_PATH || '',
    spaceId: process.env.DATABRICKS_GENIE_SPACE_ID || _env.DATABRICKS_GENIE_SPACE_ID || '',
    token: process.env.DATABRICKS_TOKEN || _env.DATABRICKS_TOKEN || '',
    clientId: process.env.DATABRICKS_CLIENT_ID || _env.DATABRICKS_CLIENT_ID || '',
    clientSecret: process.env.DATABRICKS_CLIENT_SECRET || _env.DATABRICKS_CLIENT_SECRET || '',
    tenantId: process.env.DATABRICKS_TENANT_ID || _env.DATABRICKS_TENANT_ID || ''
  },
  // Anthropic API (for CIBE briefing/dossier generation)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || _env.ANTHROPIC_API_KEY || '',
  // Power BI Live API (uses SSO token captured by beanz-digest)
  pbi: {
    groupId: _env.PBI_GROUP_ID || '95356eb0-cf65-4b79-8da7-e32ece5afd0c',
    reportId: _env.PBI_REPORT_ID || '553267e9-70e9-4397-b29b-0764e9d7ef6a',
    tokenPath: path.join(process.env.USERPROFILE || process.env.HOME, 'beanz-digest', 'output', 'pbi-token.json'),
    digestDir: path.join(process.env.USERPROFILE || process.env.HOME, 'beanz-digest'),
  },
  // Salesforce Marketing Cloud
  sfmc: {
    clientId: _env.SFMC_CLIENT_ID || '',
    clientSecret: _env.SFMC_CLIENT_SECRET || '',
    authBaseUri: (_env.SFMC_AUTH_BASE_URI || '').replace(/\/$/, ''),
    restBaseUri: (_env.SFMC_REST_BASE_URI || '').replace(/\/$/, ''),
    beanzMid: _env.SFMC_BEANZ_MID ? parseInt(_env.SFMC_BEANZ_MID) : null
  }
};

// ─── API Router ───────────────────────────────────────────────
async function handleAPI(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.replace('/api/', '').split('/').filter(Boolean);

  // Digest freshness & extraction control (must be before generic digest handler)
  if (parts[0] === 'digest' && parts[1] === 'freshness') {
    const report = buildFreshnessReport(ctx.digestOutput);
    return jsonReply(res, 200, report);
  }
  if (parts[0] === 'digest' && parts[1] === 'extractions') {
    const list = listDigestExtractions(ctx.digestOutput);
    return jsonReply(res, 200, list);
  }
  if (parts[0] === 'digest' && parts[1] === 'trigger' && req.method === 'POST') {
    return triggerExtraction(req, res, ctx);
  }

  if (parts[0] === 'daily-digest') return handleDailyDigest(req, res, parts.slice(1), url, ctx);
  if (parts[0] === 'digest') return handleDigest(req, res, parts, url, ctx);
  if (parts[0] === 'strategy' && parts[1]) return require('./routes/strategy').handleStrategyChat(req, res, parts, url, ctx);
  if (parts[0] === 'strategy') return handleStrategy(req, res, parts, url, ctx);
  if (parts[0] === 'intelligence') return handleIntelligence(req, res, parts, url, ctx);
  if (parts[0] === 'people') return handlePeople(req, res, parts, url, ctx);
  if (parts[0] === 'powerbi') return handlePowerBI(req, res, parts, url, ctx);
  if (parts[0] === 'pbi') return handlePowerBILive(req, res, parts, url, ctx);
  if (parts[0] === 'projects' && parts[1] === 'intelligence') return handleProjectIntelligence(req, res, parts, url, ctx);
  if (parts[0] === 'projects' && parts[1] === 'enriched') return handleProjectsEnriched(req, res, parts, url, ctx);
  if (parts[0] === 'feedback') return handleFeedback(req, res, parts, url, ctx);
  if (parts[0] === 'genie') return handleGenie(req, res, parts.slice(1), url, ctx);
  if (parts[0] === 'databricks') return handleDatabricks(req, res, parts.slice(1), url, ctx);
  if (parts[0] === 'metrics') return handleMetrics(req, res, parts, url, ctx);
  if (parts[0] === 'correlations') return handleCorrelations(req, res, parts, url, ctx);
  if (parts[0] === 'tech-news') return handleTechNews(req, res, parts, url, ctx);
  if (parts[0] === 'news') return handleNews(req, res, parts, url, ctx);
  if (parts[0] === 'calendar') return handleCalendar(req, res, parts, url, ctx);
  if (parts[0] === 'chat') return handleChat(req, res, parts, url, ctx);
  if (parts[0] === 'notebooks') return handleNotebook(req, res, parts, url, ctx);
  if (parts[0] === 'email-perf') return handleEmailPerf(req, res, parts.slice(1), url, ctx);
  if (parts[0] === 'comms-analytics') return handleCommsAnalytics(req, res, parts, url, ctx);
  if (parts[0] === 'email-marketing') return handleEmailMarketing(req, res, parts, url, ctx);
  if (parts[0] === 'comms') return handleComms(req, res, parts, url, ctx);
  if (parts[0] === 'status') return handleStatus(req, res, parts, url, ctx);
  if (parts[0] === 'jira') return handleJira(req, res, parts, url, ctx);
  if (parts[0] === 'confluence') return handleConfluence(req, res, parts, url, ctx);
  if (parts[0] === 'slack' && parts[1] === 'send') return handleSend(req, res, parts, url, ctx);
  if (parts[0] === 'slack' && parts[1] === 'react') return handleReact(req, res, parts, url, ctx);
  if (parts[0] === 'slack' && parts[1] === 'upload') return handleUpload(req, res, parts, url, ctx);
  if (parts[0] === 'cibe') return handleCIBE(req, res, parts, url, ctx);

  // Roasters Insights health probe — scans known ports for the Next.js app
  // and verifies it's actually Roasters Insights (not deck-builder or similar).
  if (parts[0] === 'roasters-insights' && parts[1] === 'ping') {
    const http = require('http');
    const ports = [3005, 3000, 3002, 3003, 3004];
    let done = false;
    const finish = (payload, status) => {
      if (done) return;
      done = true;
      jsonReply(res, status || (payload.ok ? 200 : 503), payload);
    };
    const tryPort = (i) => {
      if (done) return;
      if (i >= ports.length) return finish({ ok: false });
      const port = ports[i];
      const req2 = http.get({ hostname: 'localhost', port, path: '/', timeout: 500 }, (r) => {
        let body = '';
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          const isNext = r.statusCode < 400 && /<!DOCTYPE html|__NEXT_DATA__|_next/i.test(body);
          if (isNext) return finish({ ok: true, port, url: 'http://localhost:' + port });
          tryPort(i + 1);
        };
        r.on('data', (c) => {
          body += c;
          if (body.length >= 2000 && !settled) { settle(); r.resume(); }
        });
        r.on('end', settle);
        r.on('error', () => { if (!settled) { settled = true; tryPort(i + 1); } });
      });
      req2.on('error', () => tryPort(i + 1));
      req2.on('timeout', () => { req2.destroy(); tryPort(i + 1); });
    };
    tryPort(0);
    return;
  }

  // Roasters Insights data proxy — delegates to routes/roasters-insights.js
  if (parts[0] === 'roasters-insights') {
    return require('./routes/roasters-insights')(req, res, parts.slice(1), url, ctx);
  }

  // Obsidian vault sync
  if (parts[0] === 'obsidian') {
    const { syncVault, getSyncStatus } = require('./lib/obsidian-sync');
    if (parts[1] === 'sync' && req.method === 'POST') {
      if (_obsidianSyncing) return jsonReply(res, 409, { error: 'Sync already running' });
      _obsidianSyncing = true;
      jsonReply(res, 200, { ok: true, message: 'Vault sync started' });
      syncVault(ctx).then(function(result) {
        _obsidianSyncing = false;
        console.log('[Obsidian] Sync complete:', result.pagesGenerated, 'pages');
      }).catch(function(e) {
        _obsidianSyncing = false;
        console.error('[Obsidian] Sync failed:', e.message);
      });
      return;
    }
    if (parts[1] === 'status') {
      const status = getSyncStatus();
      status.syncing = _obsidianSyncing;
      return jsonReply(res, 200, status);
    }
    if (parts[1] === 'lint') {
      const { lintVault } = require('./lib/wiki-lint');
      try {
        const report = lintVault();
        return jsonReply(res, 200, report);
      } catch (e) {
        return jsonReply(res, 500, { error: 'Lint failed: ' + e.message });
      }
    }
    return jsonReply(res, 404, { error: 'Unknown obsidian endpoint' });
  }

  // Auth status
  if (parts[0] === 'auth' && parts[1] === 'status') {
    return jsonReply(res, 200, {
      outlook: {
        connected: tokenStore.isAuthenticated(),
        email: ctx.msGraph.userEmail || null
      }
    });
  }

  // Refresh engine status & control
  if (parts[0] === 'refresh' && parts[1] === 'status') {
    const status = getRefreshStatus();
    status.pbi = getPBIRefreshStatus();
    return jsonReply(res, 200, status);
  }
  if (parts[0] === 'refresh' && parts[1] === 'now' && req.method === 'POST') {
    refreshAll(ctx); // Fire and forget
    return jsonReply(res, 200, { ok: true, message: 'Refresh triggered' });
  }

  jsonReply(res, 404, { error: 'Unknown API endpoint' });
}

// ─── HTTP Server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // ─── OAuth2 Auth Routes (Outlook Delegated Flow) ──────────
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

  if (parsedUrl.pathname === '/auth/outlook') {
    // Redirect user to Microsoft login
    if (!ctx.msGraph.clientId || !ctx.msGraph.tenantId) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      return res.end('<h2>Error</h2><p>MS Graph credentials not configured in .env</p>');
    }
    const authUrl = buildAuthUrl(ctx.msGraph, REDIRECT_URI, 'beanz-outlook');
    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  if (parsedUrl.pathname === '/auth/callback') {
    // Handle Microsoft callback with authorization code
    const code = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');
    const errorDesc = parsedUrl.searchParams.get('error_description');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(
        '<html><body style="font-family:system-ui;padding:40px;background:#0c0e14;color:#e8eaf2">' +
        '<h2 style="color:#ff6b6b">Authentication Failed</h2>' +
        '<p><strong>Error:</strong> ' + (error || '') + '</p>' +
        '<p>' + (errorDesc || '') + '</p>' +
        '<p><a href="/" style="color:#6c8cff">Back to Beanz OS</a></p></body></html>'
      );
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      return res.end('<h2>No authorization code received</h2>');
    }

    exchangeCodeForTokens(ctx.msGraph, code, REDIRECT_URI)
      .then(function() {
        console.log('[Auth] Outlook connected successfully via OAuth2');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body style="font-family:system-ui;padding:40px;background:#0c0e14;color:#e8eaf2;text-align:center">' +
          '<h2 style="color:#69db7c">\u2705 Outlook Connected!</h2>' +
          '<p>Your email is now connected to Beanz OS.</p>' +
          '<p>Redirecting...</p>' +
          '<script>setTimeout(function(){window.location="/"},1500)</script>' +
          '</body></html>'
        );
      })
      .catch(function(e) {
        console.error('[Auth] Token exchange failed:', e.message);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body style="font-family:system-ui;padding:40px;background:#0c0e14;color:#e8eaf2">' +
          '<h2 style="color:#ff6b6b">Token Exchange Failed</h2>' +
          '<p>' + e.message + '</p>' +
          '<p><a href="/auth/outlook" style="color:#6c8cff">Try Again</a></p></body></html>'
        );
      });
    return;
  }

  if (parsedUrl.pathname === '/auth/disconnect' && req.method === 'POST') {
    tokenStore.clearTokens();
    return jsonReply(res, 200, { ok: true, message: 'Outlook disconnected' });
  }

  // API routes
  if (req.url.startsWith('/api/')) {
    return handleAPI(req, res).catch(err => {
      console.error('API error:', err);
      if (!res.headersSent) jsonReply(res, 500, { error: 'Internal server error' });
    });
  }

  // Static file serving — strip query strings (e.g. ?v=123 cache busters)
  const cleanUrl = req.url.split('?')[0];
  let filePath = path.join(DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

/** Run AI enrichment after a scheduled news refresh (fire-and-forget) */
function _postRefreshEnrich(ctx, storePath) {
  if (!ctx.anthropicApiKey) return;
  try {
    var store = loadNewsStore(storePath || ctx.newsStore);
    var articles = store.articles || [];
    if (articles.length === 0) return;
    // Load transcripts for YouTube enrichment
    var transcripts = {};
    var tDir = path.join(__dirname, '..', 'news-transcripts');
    try {
      if (fs.existsSync(tDir)) {
        fs.readdirSync(tDir).filter(f => f.endsWith('.json')).forEach(f => {
          try { var d = JSON.parse(fs.readFileSync(path.join(tDir, f), 'utf-8')); if (d.videoId && isTranscriptUsable(d)) transcripts[d.videoId] = d; } catch (_) {}
        });
      }
    } catch (_) {}
    // Fire-and-forget: summarise, enrich, extract topics, detect competitors
    _batchSumm(ctx.anthropicApiKey, articles, 15).catch(e => console.error('[News] Scheduled summarise error:', e.message));
    batchEnrichArticles(ctx.anthropicApiKey, articles, transcripts, 20).catch(e => console.error('[News] Scheduled enrich error:', e.message));
    try { _extractTopics(articles); } catch (e) { console.error('[News] Topic extraction error:', e.message); }
    try { _detectAlerts(articles); } catch (e) { console.error('[News] Competitor detection error:', e.message); }
  } catch (e) { console.error('[News] Post-refresh enrich error:', e.message); }
}

server.listen(PORT, () => {
  console.log(`Command Center running at http://localhost:${PORT}`);
  console.log(`Digest data from: ${ctx.digestOutput}`);

  // ─── Seed CIBE roaster registry ─────────────────────────
  try {
    const { seedRoasters } = require('./lib/cibe/roaster-registry');
    const { getDb } = require('./lib/db');
    seedRoasters(getDb());
  } catch (e) { console.error('[CIBE] Roaster seed failed:', e.message); }

  // ─── Start CIBE Scrape Scheduler ───────────────────────
  try {
    startCIBEScheduler(ctx, {
      homepageInterval: 24 * 60 * 60 * 1000,  // daily
      catalogueInterval: 7 * 24 * 60 * 60 * 1000  // weekly
    });
  } catch (e) { console.error('[CIBE] Scheduler start failed:', e.message); }

  // ─── Start Background Refresh Engine ──────────────────────
  startRefreshScheduler(ctx, {
    slackInterval: 60000,    // Slack: every 60 seconds
    outlookInterval: 120000  // Outlook: every 2 minutes
  });

  // ─── Comms Analytics Snapshot Scheduler ──────────────────
  // First snapshot 30s after startup (let refresh engine populate data), then every 4h
  setTimeout(() => {
    try {
      generateDailySnapshot(ctx);
      generateAISummaries(ctx).catch(e => console.error('[Analytics] AI summary error:', e.message));
    } catch (e) { console.error('[Analytics] Startup snapshot failed:', e.message); }
  }, 30000);
  setInterval(() => {
    try {
      generateDailySnapshot(ctx);
      generateAISummaries(ctx).catch(e => console.error('[Analytics] AI summary error:', e.message));
    } catch (e) { console.error('[Analytics] Scheduled snapshot failed:', e.message); }
  }, 4 * 60 * 60 * 1000);

  // ─── Start Power BI Refresh Scheduler ──────────────────────
  try {
    startPBIRefreshScheduler(ctx, {
      interval: 4 * 60 * 60 * 1000  // Refresh PBI metrics every 4 hours
    });
  } catch (e) { console.error('[PBI] Scheduler start failed:', e.message); }

  // Background news refresh — once at startup, then daily
  refreshNewsData(ctx.newsStore).then(r => {
    if (r.newCount > 0) console.log(`[News] Startup refresh: ${r.newCount} new articles`);
    _postRefreshEnrich(ctx);
  }).catch(e => console.error('[News] Startup refresh failed:', e.message));
  setInterval(() => {
    refreshNewsData(ctx.newsStore).then(r => {
      if (r.newCount > 0) console.log(`[News] Daily refresh: ${r.newCount} new articles`);
      _postRefreshEnrich(ctx);
    }).catch(e => console.error('[News] Daily refresh failed:', e.message));
  }, 24 * 60 * 60 * 1000);

  // Background tech news refresh — once at startup, then daily
  const { loadTechSourcesConfig, scoreTechRelevance, autoTranscribeAll, generateResearchReport } = require('./routes/tech-news');
  const _techSources = loadTechSourcesConfig();
  refreshNewsData(ctx.techNewsStore, false, { sources: _techSources, scoreFn: scoreTechRelevance }).then(r => {
    if (r.newCount > 0) console.log(`[TechNews] Startup refresh: ${r.newCount} new articles`);
    _postRefreshEnrich(ctx, ctx.techNewsStore);
    // Auto-transcribe all YouTube videos after startup refresh
    const _store = loadNewsStore(ctx.techNewsStore);
    autoTranscribeAll(_store.articles);
  }).catch(e => console.error('[TechNews] Startup refresh failed:', e.message));
  setInterval(() => {
    const sources = loadTechSourcesConfig();
    refreshNewsData(ctx.techNewsStore, false, { sources, scoreFn: scoreTechRelevance }).then(r => {
      if (r.newCount > 0) console.log(`[TechNews] Daily refresh: ${r.newCount} new articles`);
      _postRefreshEnrich(ctx, ctx.techNewsStore);
      // Auto-transcribe new videos after daily refresh
      const _store = loadNewsStore(ctx.techNewsStore);
      autoTranscribeAll(_store.articles);
    }).catch(e => console.error('[TechNews] Daily refresh failed:', e.message));
  }, 24 * 60 * 60 * 1000);

  // ─── Scheduled Research Reports ────────────────────────────
  // Daily report: generate 30 min after startup (let transcripts finish), then every 24h
  // After generation, auto-email to configured recipients
  const { sendResearchEmail, getRecipientList } = require('./lib/research-email');

  function _generateAndEmail(period) {
    if (!ctx.anthropicApiKey) return;
    console.log('[Research] Generating scheduled ' + period + ' report...');
    generateResearchReport(ctx, period).then(function(report) {
      console.log('[Research] ' + period + ' report complete, checking email recipients...');
      // Smart ingest: update wiki entity pages
      try { require('./lib/wiki-ingest').ingestResearchReport(report, 'tech'); } catch (e) { console.error('[WikiIngest] Tech ingest failed:', e.message); }
      var recipients = getRecipientList();
      if (recipients.length > 0 && report) {
        sendResearchEmail(ctx, report, 'tech', recipients)
          .then(function() { console.log('[Research] Daily email sent to ' + recipients.length + ' recipients'); })
          .catch(function(e) { console.error('[Research] Email send failed:', e.message); });
      } else if (recipients.length === 0) {
        console.log('[Research] No email recipients configured (set RESEARCH_EMAIL_RECIPIENTS in .env)');
      }
    }).catch(function(e) { console.error('[Research] Scheduled ' + period + ' failed:', e.message); });
  }

  // ── Clock-based scheduling: check every minute for scheduled times ──
  const { generateCoffeeResearch } = require('./routes/news');
  var _lastScheduleRun = {};

  function _checkSchedule() {
    var now = new Date();
    var hh = now.getHours();
    var mm = now.getMinutes();
    var day = now.getDay(); // 0=Sun, 1=Mon
    var dateKey = now.toISOString().slice(0, 10);

    // 7:30 AM — Generate & email AI & Tech daily research
    if (hh === 7 && mm === 30 && _lastScheduleRun['tech_daily'] !== dateKey) {
      _lastScheduleRun['tech_daily'] = dateKey;
      console.log('[Schedule] 7:30 AM — Generating AI & Tech daily research...');
      _generateAndEmail('daily');
    }

    // 7:30 AM — Generate & email Coffee daily research (runs alongside tech)
    if (hh === 7 && mm === 30 && _lastScheduleRun['coffee_daily'] !== dateKey) {
      _lastScheduleRun['coffee_daily'] = dateKey;
      console.log('[Schedule] 7:30 AM — Generating Coffee daily research...');
      _generateCoffeeAndEmail('daily');
    }

    // Monday 7:00 AM — Generate weekly reports
    if (day === 1 && hh === 7 && mm === 0 && _lastScheduleRun['weekly'] !== dateKey) {
      _lastScheduleRun['weekly'] = dateKey;
      console.log('[Schedule] Monday 7:00 AM — Generating weekly reports...');
      _generateAndEmail('weekly');
      setTimeout(function() { _generateCoffeeAndEmail('weekly'); }, 10 * 60 * 1000); // coffee 10 min later
    }
  }

  // Check schedule every 60 seconds
  setInterval(_checkSchedule, 60 * 1000);
  console.log('[Schedule] Research reports scheduled: AI & Tech + Coffee at 7:30 AM daily');

  function _generateCoffeeAndEmail(period) {
    if (!ctx.anthropicApiKey) return;
    console.log('[CoffeeResearch] Generating ' + period + ' report...');
    generateCoffeeResearch(ctx, period).then(function(report) {
      console.log('[CoffeeResearch] ' + period + ' report complete');
      try { require('./lib/wiki-ingest').ingestResearchReport(report, 'coffee'); } catch (e) { console.error('[WikiIngest] Coffee ingest failed:', e.message); }
      var coffeeRecipients = (process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);
      if (coffeeRecipients.length > 0 && report) {
        sendResearchEmail(ctx, report, 'coffee', coffeeRecipients)
          .then(function() { console.log('[CoffeeResearch] Email sent to ' + coffeeRecipients.length + ' recipients'); })
          .catch(function(e) { console.error('[CoffeeResearch] Email failed:', e.message); });
      }
    }).catch(function(e) { console.error('[CoffeeResearch] ' + period + ' failed:', e.message); });
  }

  // ─── Scheduled Obsidian Vault Sync ─────────────────────────
  // Sync 1 hour after startup (let data settle), then daily
  const { syncVault: _schedSyncVault } = require('./lib/obsidian-sync');
  setTimeout(() => {
    console.log('[Obsidian] Running scheduled vault sync...');
    _obsidianSyncing = true;
    _schedSyncVault(ctx).then(r => {
      _obsidianSyncing = false;
      console.log('[Obsidian] Scheduled sync complete:', r.pagesGenerated, 'pages');
    }).catch(e => {
      _obsidianSyncing = false;
      console.error('[Obsidian] Scheduled sync failed:', e.message);
    });
  }, 60 * 60 * 1000); // 1 hour after startup

  setInterval(() => {
    console.log('[Obsidian] Running daily vault sync...');
    _obsidianSyncing = true;
    _schedSyncVault(ctx).then(r => {
      _obsidianSyncing = false;
      console.log('[Obsidian] Daily sync complete:', r.pagesGenerated, 'pages');
    }).catch(e => {
      _obsidianSyncing = false;
      console.error('[Obsidian] Daily sync failed:', e.message);
    });
  }, 24 * 60 * 60 * 1000); // every 24h
});
