const { jsonReply } = require('../lib/helpers');
const { buildStrategyPayload } = require('../lib/strategy-engine');
const db = require('../lib/db');
const { buildLiveMetrics, readPBILiveData, buildLiveMetricsFromAPI } = require('../lib/digest-bridge');
const MODELS = require('../lib/ai-models');
const path = require('path');
const fs = require('fs');

module.exports = function handleStrategy(req, res, _parts, _url, ctx) {
  const strategy = buildStrategyPayload();

  // ── Load KB Analytics docs for enriched strategy data ──
  try {
    var analyticsDir = path.join(ctx.kbDir, 'analytics');
    if (fs.existsSync(analyticsDir)) {
      var kpiDocs = {};
      fs.readdirSync(analyticsDir).filter(f => f.endsWith('.md') && !f.startsWith('_')).forEach(f => {
        var content = fs.readFileSync(path.join(analyticsDir, f), 'utf8');
        var key = f.replace('.md', '');
        // Extract frontmatter
        var fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        var body = fmMatch ? content.slice(fmMatch[0].length).trim() : content;
        kpiDocs[key] = { filename: f, body: body.slice(0, 2000) };
      });
      strategy.kpiDocs = kpiDocs;
      strategy.kpiDocCount = Object.keys(kpiDocs).length;
    }
  } catch (e) { /* non-critical */ }

  // ── Load additional project docs from KB ──
  try {
    var projectsDir = path.join(ctx.kbDir, 'projects');
    if (fs.existsSync(projectsDir)) {
      var projectDocs = [];
      var _walkProjects = function(dir) {
        fs.readdirSync(dir).forEach(function(f) {
          var fp = path.join(dir, f);
          if (fs.statSync(fp).isDirectory()) _walkProjects(fp);
          else if (f.endsWith('.md') && !f.startsWith('_')) {
            var content = fs.readFileSync(fp, 'utf8');
            var body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
            projectDocs.push({ filename: f, path: path.relative(ctx.kbDir, fp), body: body.slice(0, 1500) });
          }
        });
      };
      _walkProjects(projectsDir);
      strategy.projectDocs = projectDocs;
    }
  } catch (e) { /* non-critical */ }

  // ── Load marketing docs from KB ──
  try {
    var marketingDir = path.join(ctx.kbDir, 'marketing');
    if (fs.existsSync(marketingDir)) {
      var marketingDocs = [];
      fs.readdirSync(marketingDir).filter(f => f.endsWith('.md') && !f.startsWith('_')).forEach(f => {
        var content = fs.readFileSync(path.join(marketingDir, f), 'utf8');
        var body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
        marketingDocs.push({ filename: f, body: body.slice(0, 1500) });
      });
      strategy.marketingDocs = marketingDocs;
    }
  } catch (e) { /* non-critical */ }

  // ── Adaptive Correlation Ranking ──
  // Apply user feedback weights to reorder correlations
  const weights = db.getInsightWeights();
  const dashboard = db.getLearningDashboard();
  const pinnedSet = new Set(dashboard.pinnedInsights || []);
  const dismissedSet = new Set(dashboard.dismissedInsights || []);

  if (strategy.correlations) {
    // Annotate each correlation with its weight and status
    strategy.correlations = strategy.correlations.map(c => ({
      ...c,
      _weight: (weights[c.id]?.weight) || 1.0,
      _feedbackCount: (weights[c.id]?.feedbackCount) || 0,
      _pinned: pinnedSet.has(c.id),
      _dismissed: dismissedSet.has(c.id)
    }));

    // Sort: pinned first, then by weight descending, then by severity
    const sevOrder = { critical: 0, warning: 1, opportunity: 2, positive: 3 };
    strategy.correlations.sort((a, b) => {
      // Pinned always first
      if (a._pinned && !b._pinned) return -1;
      if (!a._pinned && b._pinned) return 1;
      // Dismissed always last (but still included — filtered in UI)
      if (a._dismissed && !b._dismissed) return 1;
      if (!a._dismissed && b._dismissed) return -1;
      // By weight (higher = more valued by user)
      if (Math.abs(a._weight - b._weight) > 0.1) return b._weight - a._weight;
      // Fall back to severity
      return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
    });
  }

  // Include learning metadata for the frontend
  strategy._learning = {
    weights: Object.fromEntries(
      Object.entries(weights).map(([k, v]) => [k, v.weight])
    ),
    pinnedInsights: dashboard.pinnedInsights,
    dismissedInsights: dashboard.dismissedInsights,
    totalFeedback: dashboard.stats.totalFeedback,
    patterns: dashboard.patterns.slice(0, 5)
  };

  // ── Live PBI Data Enrichment for Correlations ──
  // Overlay real-time metrics onto correlation data points
  if (ctx && strategy.correlations) {
    try {
      const liveMetrics = buildLiveMetrics(ctx.digestOutput);
      const pbiLiveData = readPBILiveData(ctx.intelDir);
      const apiMetrics = pbiLiveData ? buildLiveMetricsFromAPI(pbiLiveData) : null;

      // Merge: API > extraction
      const lm = {};
      if (liveMetrics && liveMetrics.metrics) Object.assign(lm, liveMetrics.metrics);
      if (apiMetrics && apiMetrics.metrics) Object.assign(lm, apiMetrics.metrics);

      if (Object.keys(lm).length > 0) {
        const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(Math.round(v));
        const fmtPct = v => v !== null && v !== undefined ? (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%' : null;

        // Map correlation IDs to relevant live metrics
        const corMetricMap = {
          'COR-1': ['cancelled_subs', 'new_subs', 'net_subscriber_growth'],
          'COR-2': ['revenue', 'ltv'],
          'COR-3': ['ftbp_conversion'],
          'COR-4': ['bags_shipped', 'kg_shipped'],
          'COR-5': ['delivery_sla', 'cancellation_by_market'],
          'COR-6': ['revenue'],
          'COR-7': ['ftbp_revenue_share', 'revenue'],
          'COR-8': ['ltv', 'revenue', 'active_subs']
        };

        strategy.correlations = strategy.correlations.map(c => {
          const metricKeys = corMetricMap[c.id] || [];
          const livePoints = [];
          metricKeys.forEach(key => {
            const m = lm[key];
            if (!m) return;
            // Format value for display
            let displayVal;
            if (typeof m.value === 'object' && m.format === 'breakdown') {
              // For breakdown metrics, create separate entries per item
              Object.entries(m.value).forEach(([subKey, subVal]) => {
                livePoints.push({
                  key: key + '_' + subKey,
                  name: m.name.replace('by Market', '') + subKey,
                  value: fmtK(subVal),
                  yoy: null,
                  status: m.status
                });
              });
              return;
            } else if (typeof m.value === 'number') {
              displayVal = m.format === 'currency' ? '$' + fmtK(m.value) : m.format === 'pct' ? m.value + '%' : fmtK(m.value);
            } else {
              displayVal = String(m.value);
            }
            livePoints.push({
              key,
              name: m.name,
              value: displayVal,
              yoy: m.yoy !== undefined ? fmtPct(m.yoy) : null,
              status: m.status
            });
          });
          if (livePoints.length > 0) {
            c._liveMetrics = livePoints;
            c._liveSource = apiMetrics ? 'api' : 'extraction';
          }
          return c;
        });

        strategy._liveDataSource = apiMetrics ? 'api' : 'extraction';
        strategy._liveMetricCount = Object.keys(lm).length;
      }
    } catch (e) {
      // Non-critical — strategy still works without live enrichment
      strategy._liveError = e.message;
    }
  }

  return jsonReply(res, 200, strategy);
};

// ─── KB Chat + Library endpoints (handled separately) ────
module.exports.handleStrategyChat = async function(req, res, parts, url, ctx) {
  const { readBody } = require('../lib/helpers');

  // POST /api/strategy/chat
  if (parts[1] === 'chat' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { response: 'No API key configured.', sources: [] });
    }
    try {
      const body = await readBody(req);
      const message = (body.message || '').trim();
      if (!message) return jsonReply(res, 400, { error: 'No message' });
      const history = Array.isArray(body.history) ? body.history : [];

      // Load ALL kb-data docs into context
      var kbContext = _loadAllKBDocs(ctx.kbDir);

      var systemPrompt = 'You are Beanz OS — an AI business intelligence assistant for Ziv Shalev, GM of Beanz (coffee subscription platform under Breville Group). ' +
        'You have access to the complete Beanz knowledge base: KPI analytics, project updates, meeting notes, strategy documents, marketing analysis, architecture docs, and more.\n\n' +
        'IMPORTANT RULES:\n' +
        '- Be specific with numbers, dates, and names — the data is right in front of you\n' +
        '- When citing data, mention which document it comes from (e.g. "According to kpi-churn-au...")\n' +
        '- Answer as a knowledgeable colleague who has read every document\n' +
        '- For KPI questions, give the actual numbers with trends\n' +
        '- For project questions, reference specific meeting notes and status updates\n' +
        '- Be concise but thorough\n\n' +
        'KNOWLEDGE BASE (' + kbContext.docCount + ' documents):\n\n' + kbContext.text;

      var messages = [];
      (history || []).slice(-10).forEach(function(h) {
        if (h.role === 'user' || h.role === 'assistant') messages.push({ role: h.role, content: h.content || '' });
      });
      messages.push({ role: 'user', content: message });

      var https = require('https');
      var apiBody = JSON.stringify({
        model: MODELS.OPUS,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages
      });

      var aiResponse = await new Promise(function(resolve, reject) {
        var chunks = [];
        var req = https.request({
          hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.anthropicApiKey, 'anthropic-version': '2023-06-01' }
        }, function(res) {
          res.on('data', function(c) { chunks.push(c); });
          res.on('end', function() {
            try {
              var data = Buffer.concat(chunks).toString();
              var j = JSON.parse(data);
              if (j.content && j.content[0]) resolve(j.content[0].text);
              else if (j.error) reject(new Error(j.error.message));
              else reject(new Error('Unexpected response'));
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(120000, function() { req.destroy(); reject(new Error('Timeout')); });
        req.write(apiBody);
        req.end();
      });

      // Extract source references from response
      var sourcesFound = [];
      kbContext.docNames.forEach(function(name) {
        if (aiResponse.toLowerCase().includes(name.toLowerCase())) {
          sourcesFound.push(name);
        }
      });

      return jsonReply(res, 200, { response: aiResponse, sources: sourcesFound.slice(0, 10) });
    } catch (e) {
      return jsonReply(res, 200, { response: 'Error: ' + e.message, sources: [] });
    }
  }

  // GET /api/strategy/library — list all KB docs by domain
  if (parts[1] === 'library' && !parts[2]) {
    var library = _buildKBLibrary(ctx.kbDir);
    return jsonReply(res, 200, library);
  }

  // GET /api/strategy/library/:domain/:doc — get a specific doc
  if (parts[1] === 'library' && parts[2]) {
    var domain = parts[2];
    var docName = parts[3] || '';
    var docPath = path.join(ctx.kbDir, domain, docName ? (docName + '.md') : '');
    if (docName && fs.existsSync(docPath)) {
      var content = fs.readFileSync(docPath, 'utf-8');
      return jsonReply(res, 200, { domain: domain, doc: docName, content: content });
    }
    // Try to list docs in domain
    var domainDir = path.join(ctx.kbDir, domain);
    if (fs.existsSync(domainDir) && fs.statSync(domainDir).isDirectory()) {
      var docs = [];
      _walkDir(domainDir, function(fp, relPath) {
        if (fp.endsWith('.md') && !path.basename(fp).startsWith('_')) {
          var content = fs.readFileSync(fp, 'utf-8').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
          docs.push({ name: path.basename(fp, '.md'), path: relPath, preview: content.slice(0, 300) });
        }
      });
      return jsonReply(res, 200, { domain: domain, docs: docs });
    }
    return jsonReply(res, 404, { error: 'Document not found' });
  }

  return jsonReply(res, 404, { error: 'Unknown strategy endpoint' });
};

/** Load all KB docs into a single context string */
function _loadAllKBDocs(kbDir) {
  var parts = [];
  var docNames = [];
  var totalChars = 0;
  var MAX_CHARS = 300000; // ~75K tokens
  var docCount = 0;

  // Priority order: analytics first, then strategy, projects, marketing, then rest
  var priorityDirs = ['analytics', 'strategy', 'projects', 'marketing', 'markets', 'partners', 'pricing', 'users'];
  var allDirs = [];
  try { allDirs = fs.readdirSync(kbDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('_') && e.name !== 'intelligence').map(e => e.name); } catch (_) {}

  var orderedDirs = priorityDirs.filter(d => allDirs.includes(d));
  allDirs.forEach(function(d) { if (!orderedDirs.includes(d)) orderedDirs.push(d); });

  orderedDirs.forEach(function(dirName) {
    if (totalChars >= MAX_CHARS) return;
    var dirPath = path.join(kbDir, dirName);
    parts.push('\n\n=== ' + dirName.toUpperCase() + ' ===\n');

    _walkDir(dirPath, function(fp, relPath) {
      if (totalChars >= MAX_CHARS) return;
      if (!fp.endsWith('.md') || path.basename(fp).startsWith('_')) return;
      var baseName = path.basename(fp, '.md');
      var content = fs.readFileSync(fp, 'utf-8');
      // Strip frontmatter
      content = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      // Truncate individual docs to 3K
      if (content.length > 3000) content = content.slice(0, 3000) + '\n[...truncated]';
      var entry = '\n--- ' + baseName + ' (' + dirName + '/' + relPath + ') ---\n' + content + '\n';
      parts.push(entry);
      totalChars += entry.length;
      docNames.push(baseName);
      docCount++;
    });
  });

  return { text: parts.join(''), docCount: docCount, docNames: docNames, totalChars: totalChars };
}

/** Build KB library structure */
function _buildKBLibrary(kbDir) {
  var domains = [];
  var allDirs = [];
  try { allDirs = fs.readdirSync(kbDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('_') && e.name !== 'intelligence').map(e => e.name).sort(); } catch (_) {}

  allDirs.forEach(function(dirName) {
    var dirPath = path.join(kbDir, dirName);
    var docs = [];
    _walkDir(dirPath, function(fp, relPath) {
      if (!fp.endsWith('.md') || path.basename(fp).startsWith('_')) return;
      var content = fs.readFileSync(fp, 'utf-8').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
      // Extract first heading
      var titleMatch = content.match(/^#\s+(.+)/m);
      var title = titleMatch ? titleMatch[1] : path.basename(fp, '.md');
      docs.push({
        name: path.basename(fp, '.md'),
        title: title,
        path: relPath,
        size: content.length,
        preview: content.replace(/^#.+\n?/, '').trim().slice(0, 200)
      });
    });
    if (docs.length > 0) {
      domains.push({ name: dirName, docCount: docs.length, docs: docs });
    }
  });

  return { domains: domains, totalDocs: domains.reduce(function(s, d) { return s + d.docCount; }, 0) };
}

/** Recursively walk a directory */
function _walkDir(dir, callback, basePath) {
  basePath = basePath || '';
  try {
    fs.readdirSync(dir).forEach(function(f) {
      var fp = path.join(dir, f);
      var relPath = basePath ? basePath + '/' + f : f;
      if (fs.statSync(fp).isDirectory()) _walkDir(fp, callback, relPath);
      else callback(fp, relPath);
    });
  } catch (_) {}
}
