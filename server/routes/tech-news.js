const fs = require('fs');
const path = require('path');
const { jsonReply, readBody } = require('../lib/helpers');
const newsEngine = require('../lib/news-engine');
const db = require('../lib/db');
const {
  summariseArticle, batchSummariseTopArticles, enrichArticle, batchEnrichArticles,
  generateDigest, extractAndTrackTopics, getTrendingTopics, detectCompetitorAlerts
} = require('../lib/ai-news');

// ─── Tech News Sources Config ────────────────────────────────
const TECH_SOURCES_PATH = path.join(__dirname, '..', '..', 'tech-news-sources.json');

function loadTechSourcesConfig() {
  try {
    if (fs.existsSync(TECH_SOURCES_PATH)) {
      return JSON.parse(fs.readFileSync(TECH_SOURCES_PATH, 'utf8'));
    }
  } catch { /* ignore corrupt file */ }
  return { rss: {}, reddit: {}, youtube: {}, podcasts: {}, competitors: {}, settings: {} };
}

function saveTechSourcesConfig(config) {
  fs.writeFileSync(TECH_SOURCES_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// ─── Tech-specific relevance scoring ─────────────────────────
function scoreTechRelevance(article) {
  let score = 0.3;
  const text = (article.title + ' ' + article.summary).toLowerCase();
  const keywords = {
    high: ['artificial intelligence', 'machine learning', 'llm', 'large language model',
           'claude', 'gpt', 'openai', 'anthropic', 'gemini', 'foundation model',
           'autonomous agent', 'ai agent', 'deep learning', 'neural network',
           'transformer', 'diffusion model', 'multimodal'],
    medium: ['startup', 'saas', 'subscription', 'api', 'cloud', 'automation',
             'data pipeline', 'mlops', 'fine-tuning', 'rag', 'vector database',
             'embedding', 'inference', 'gpu', 'chip', 'semiconductor',
             'robotics', 'computer vision', 'nlp', 'natural language'],
    low: ['programming', 'developer', 'open source', 'hardware', 'cybersecurity',
          'blockchain', 'web3', 'quantum', 'devops', 'kubernetes']
  };
  keywords.high.forEach(k => { if (text.includes(k)) score += 0.3; });
  keywords.medium.forEach(k => { if (text.includes(k)) score += 0.1; });
  keywords.low.forEach(k => { if (text.includes(k)) score += 0.05; });
  // Bonus for AI company mentions
  if (/openai|anthropic|google\s?deepmind|meta\s?ai|mistral|hugging\s?face/i.test(text)) score += 0.2;
  return Math.min(score, 1.0);
}

// ─── Tech News Context for AI enrichment ─────────────────────
const TECH_CONTEXT = 'Beanz is a coffee subscription platform leveraging AI. ' +
  'Key AI initiatives: Project Feral (AI-first: cancellation flow, collections, onboarding, email). ' +
  'Interested in: AI/ML tools for subscription businesses, personalisation, automation, LLM applications, ' +
  'e-commerce AI, and emerging tech that could impact DTC subscription models.';

module.exports = async function handleTechNews(req, res, parts, url, ctx) {
  // GET /api/tech-news/refresh
  if (parts[1] === 'refresh') {
    try {
      const force = url.searchParams.get('force') === '1';
      const sources = loadTechSourcesConfig();
      const result = await newsEngine.refreshNewsData(ctx.techNewsStore, force, {
        sources,
        scoreFn: scoreTechRelevance
      });
      // Post-refresh: extract topics + auto-transcribe
      if (!result.skipped) {
        const store = newsEngine.loadNewsStore(ctx.techNewsStore);
        try { extractAndTrackTopics(store.articles, 'tech'); } catch (e) { console.error('[TechNews] Topic extraction error:', e.message); }
        // AI enrich top articles (fire-and-forget)
        if (ctx.anthropicApiKey) {
          batchSummariseTopArticles(ctx.anthropicApiKey, store.articles, 15, TECH_CONTEXT)
            .catch(e => console.error('[TechNews] AI batch summarise error:', e.message));
          var _enrichTranscripts = _loadTranscriptsMap();
          batchEnrichArticles(ctx.anthropicApiKey, store.articles, _enrichTranscripts, 20, TECH_CONTEXT)
            .catch(e => console.error('[TechNews] AI batch enrich error:', e.message));
        }
        // Auto-transcribe ALL YouTube videos (skip already cached)
        _autoTranscribeAll(store.articles);
      }
      return jsonReply(res, 200, { ok: true, newArticles: result.newCount, refreshedAt: result.refreshedAt });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Tech news refresh failed: ' + e.message });
    }
  }

  // GET /api/tech-news/sources
  if (parts[1] === 'sources' && req.method === 'GET') {
    const config = loadTechSourcesConfig();
    const store = newsEngine.loadNewsStore(ctx.techNewsStore);
    return jsonReply(res, 200, { sources: config, status: store.sourceStatus });
  }

  // PUT /api/tech-news/sources
  if (parts[1] === 'sources' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const current = loadTechSourcesConfig();
      if (body.rss) current.rss = body.rss;
      if (body.reddit) current.reddit = body.reddit;
      if (body.youtube) current.youtube = body.youtube;
      if (body.competitors) current.competitors = body.competitors;
      if (body.settings) current.settings = { ...current.settings, ...body.settings };
      saveTechSourcesConfig(current);
      // Auto-refresh
      const sources = loadTechSourcesConfig();
      newsEngine.refreshNewsData(ctx.techNewsStore, true, { sources, scoreFn: scoreTechRelevance })
        .catch(e => console.error('[TechNews] Auto-refresh after source update failed:', e.message));
      return jsonReply(res, 200, { ok: true, sources: current });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to save tech sources: ' + e.message });
    }
  }

  // POST /api/tech-news/sources/add
  if (parts[1] === 'sources' && parts[2] === 'add' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const config = loadTechSourcesConfig();
      const type = body.type;
      const key = body.key || body.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (type === 'rss') {
        config.rss[key] = { url: body.url, name: body.name };
      } else if (type === 'reddit') {
        config.reddit[key] = { subreddit: body.subreddit, name: 'r/' + body.subreddit };
      } else if (type === 'youtube' || type === 'podcast') {
        let channelId = body.channelId;
        // Auto-resolve channel ID from handle/URL if not a valid UC... ID
        if (!channelId || !channelId.startsWith('UC')) {
          const handle = (channelId || body.name || '').trim();
          if (handle) {
            try {
              channelId = await _resolveYouTubeChannelId(handle);
            } catch (e) {
              return jsonReply(res, 400, { error: 'Could not find YouTube channel: ' + handle + '. ' + e.message });
            }
          }
        }
        if (!channelId || !channelId.startsWith('UC')) {
          return jsonReply(res, 400, { error: 'Invalid channel ID. Enter a @handle, channel URL, or UC... ID.' });
        }
        // Verify the feed works
        try {
          const testXml = await newsEngine.httpGet('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
          if (!testXml || !testXml.includes('<entry>')) {
            return jsonReply(res, 400, { error: 'Channel feed is empty or invalid for ID: ' + channelId });
          }
        } catch (e) {
          return jsonReply(res, 400, { error: 'Channel feed unreachable: ' + e.message });
        }
        if (type === 'podcast') {
          if (!config.podcasts) config.podcasts = {};
          config.podcasts[key] = { channelId, name: body.name };
        } else {
          config.youtube[key] = { channelId, name: body.name };
        }
      } else {
        return jsonReply(res, 400, { error: 'Invalid type: ' + type });
      }
      saveTechSourcesConfig(config);
      const sources = loadTechSourcesConfig();
      newsEngine.refreshNewsData(ctx.techNewsStore, true, { sources, scoreFn: scoreTechRelevance })
        .catch(e => console.error('[TechNews] Auto-refresh after adding source failed:', e.message));
      return jsonReply(res, 200, { ok: true, sources: config });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to add tech source: ' + e.message });
    }
  }

  // POST /api/tech-news/sources/remove
  if (parts[1] === 'sources' && parts[2] === 'remove' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const config = loadTechSourcesConfig();
      const type = body.type;
      const key = body.key;
      if (config[type] && config[type][key]) {
        delete config[type][key];
        saveTechSourcesConfig(config);
      }
      return jsonReply(res, 200, { ok: true, sources: config });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to remove tech source: ' + e.message });
    }
  }

  // Transcript endpoints — shared with coffee news (same cache)
  if (parts[1] === 'transcript' && parts[2] && !parts[3] && req.method === 'GET') {
    const videoId = parts[2];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return jsonReply(res, 400, { error: 'Invalid videoId' });
    try {
      const transcript = await newsEngine.fetchYouTubeTranscript(videoId);
      return jsonReply(res, 200, transcript);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Transcript fetch failed: ' + e.message });
    }
  }

  if (parts[1] === 'transcript' && parts[2] && parts[3] === 'summarize' && req.method === 'POST') {
    const videoId = parts[2];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return jsonReply(res, 400, { error: 'Invalid videoId' });
    try {
      const cachePath = path.join(__dirname, '..', '..', 'news-transcripts', videoId + '.json');
      if (!fs.existsSync(cachePath)) return jsonReply(res, 404, { error: 'No transcript cached' });
      const transcript = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (!transcript.text) return jsonReply(res, 400, { error: 'Transcript has no text' });
      if (!ctx.anthropicApiKey) return jsonReply(res, 200, { summary: null, error: 'No API key' });

      const textForAI = transcript.text.slice(0, 8000);
      const https = require('https');
      const aiResult = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Summarize this YouTube video transcript concisely. Return a JSON object with:
- "headline": one-sentence summary (max 20 words)
- "bullets": array of 3-5 key takeaways
- "topics": array of 2-4 topic tags
- "tech_relevance": one sentence on relevance to AI/tech industry

Transcript:
${textForAI}`
          }]
        });
        const req = https.request({
          hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ctx.anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body)
          }
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              const text = j.content?.[0]?.text || '';
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : { headline: text.slice(0, 200) });
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('AI timeout')); });
        req.write(body);
        req.end();
      });

      transcript.aiSummary = aiResult;
      fs.writeFileSync(cachePath, JSON.stringify(transcript, null, 2));
      return jsonReply(res, 200, aiResult);
    } catch (e) {
      return jsonReply(res, 500, { error: 'AI summarization failed: ' + e.message });
    }
  }

  // POST /api/tech-news/read/:articleId
  if (parts[1] === 'read' && parts[2] && req.method === 'POST') {
    db.markNewsRead(decodeURIComponent(parts[2]));
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/tech-news/read
  if (parts[1] === 'read' && !parts[2] && req.method === 'GET') {
    const readIds = Array.from(db.getNewsReadIds());
    return jsonReply(res, 200, { readIds });
  }

  // POST /api/tech-news/note/:articleId
  if (parts[1] === 'note' && parts[2] && req.method === 'POST') {
    const body = await readBody(req);
    db.upsertNewsNote(decodeURIComponent(parts[2]), body.note || '');
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/tech-news/notes
  if (parts[1] === 'notes' && req.method === 'GET') {
    const notes = db.getAllNewsNotes();
    const map = {};
    notes.forEach(n => { map[n.article_id] = n.note; });
    return jsonReply(res, 200, { notes: map });
  }

  // GET /api/tech-news/ai-summary/:articleId
  if (parts[1] === 'ai-summary' && parts[2]) {
    const articleId = decodeURIComponent(parts[2]);
    let cached = db.getNewsAiCache(articleId);
    if (cached) return jsonReply(res, 200, cached);
    if (ctx.anthropicApiKey) {
      const store = newsEngine.loadNewsStore(ctx.techNewsStore);
      const article = store.articles.find(a => a.id === articleId);
      if (article) {
        const result = await summariseArticle(ctx.anthropicApiKey, article);
        if (result) return jsonReply(res, 200, result);
      }
    }
    return jsonReply(res, 200, { exec_summary: null, beanz_impact: null, ai_relevance: null });
  }

  // GET /api/tech-news/digest?period=daily|weekly
  if (parts[1] === 'digest' && !parts[2]) {
    const period = url.searchParams.get('period') || 'daily';
    const forceNew = url.searchParams.get('force') === '1';

    if (!forceNew) {
      const cached = db.getLatestNewsDigest('tech_' + period);
      if (cached) {
        const today = new Date().toISOString().slice(0, 10);
        if (cached.generated_at && cached.generated_at.startsWith(today)) {
          return jsonReply(res, 200, { digest: JSON.parse(cached.content), period, generated_at: cached.generated_at, cached: true });
        }
      }
    }

    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { digest: null, error: 'No API key configured' });
    }

    const store = newsEngine.loadNewsStore(ctx.techNewsStore);
    const digest = await generateDigest(ctx.anthropicApiKey, store.articles, period, forceNew, {
      digestPrefix: 'tech_',
      role: 'You are a brilliant AI & technology journalist writing an engaging, shareable daily briefing for a tech-savvy executive. ',
      context: TECH_CONTEXT
    });
    return jsonReply(res, 200, { digest, period, generated_at: new Date().toISOString() });
  }

  // GET /api/tech-news/trends?days=14
  if (parts[1] === 'trends') {
    const days = parseInt(url.searchParams.get('days')) || 14;
    const trends = getTrendingTopics(days, 'tech');
    return jsonReply(res, 200, trends);
  }

  // POST /api/tech-news/chat
  if (parts[1] === 'chat' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { response: 'Chat unavailable — no API key.', sources: [] });
    }
    try {
      const body = await readBody(req);
      const message = (body.message || '').trim();
      if (!message) return jsonReply(res, 400, { error: 'No message provided' });

      const history = Array.isArray(body.history) ? body.history : [];
      const store = newsEngine.loadNewsStore(ctx.techNewsStore);
      const articles = store.articles || [];
      const aiCache = db.getAllNewsAiCache();

      // Load transcripts
      var transcriptsDir = path.join(__dirname, '..', '..', 'news-transcripts');
      var transcripts = {};
      try {
        fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.json')).forEach(f => {
          try {
            var t = JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf-8'));
            if (t.videoId && t.text) transcripts[t.videoId] = t;
          } catch (_) {}
        });
      } catch (_) {}

      // Build context
      var sorted = articles.slice().sort(function(a, b) {
        var scoreA = new Date(a.publishedAt || 0).getTime() / 1e12;
        var scoreB = new Date(b.publishedAt || 0).getTime() / 1e12;
        if (aiCache[a.id]) scoreA += 2;
        if (aiCache[b.id]) scoreB += 2;
        if (a.videoId && transcripts[a.videoId]) scoreA += 3;
        if (b.videoId && transcripts[b.videoId]) scoreB += 3;
        return scoreB - scoreA;
      });

      var MAX_CONTEXT_CHARS = 120000;
      var contextParts = [];
      var usedChars = 0;

      for (var i = 0; i < sorted.length && usedChars < MAX_CONTEXT_CHARS; i++) {
        var a = sorted[i];
        var entry = '\n---\nTitle: ' + (a.title || 'Untitled');
        entry += '\nSource: ' + (a.sourceName || a.source || 'Unknown');
        entry += '\nDate: ' + (a.publishedAt || 'Unknown');
        entry += '\nURL: ' + (a.url || '');
        var ai = aiCache[a.id];
        if (ai && ai.exec_summary) {
          entry += '\nAI Summary: ' + ai.exec_summary;
        } else if (a.summary) {
          entry += '\nSummary: ' + (a.summary || '').slice(0, 500);
        }
        if (a.videoId && transcripts[a.videoId]) {
          var tSummary = transcripts[a.videoId].aiSummary;
          if (tSummary && tSummary.headline) {
            entry += '\nTranscript Summary: ' + tSummary.headline;
            if (tSummary.bullets) entry += '\nKey Points: ' + tSummary.bullets.join('; ');
          }
        }
        if (usedChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        usedChars += entry.length;
      }

      var contextStr = 'TECH & AI NEWS DATABASE (' + sorted.length + ' articles, ' + contextParts.length + ' included):\n' + contextParts.join('');
      var systemPrompt = 'You are a tech & AI news analyst for Beanz OS Command Center. ' +
        TECH_CONTEXT + ' Answer questions about recent AI, tech news, YouTube videos, Reddit discussions. ' +
        'Be concise and business-focused. Reference sources and dates.\n\n' + contextStr;

      var messages = [];
      (history || []).slice(-10).forEach(function(h) {
        if (h.role === 'user' || h.role === 'assistant') messages.push({ role: h.role, content: h.content || '' });
      });
      messages.push({ role: 'user', content: message });

      const https = require('https');
      var aiResponse = await new Promise(function(resolve, reject) {
        var apiBody = JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 2048, system: systemPrompt, messages
        });
        var req = https.request({
          hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.anthropicApiKey, 'anthropic-version': '2023-06-01' }
        }, function(res) {
          var data = ''; res.on('data', function(c) { data += c; });
          res.on('end', function() {
            try {
              var j = JSON.parse(data);
              if (j.content && j.content[0]) resolve(j.content[0].text);
              else if (j.error) reject(new Error(j.error.message));
              else reject(new Error('Unexpected response'));
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(60000, function() { req.destroy(); reject(new Error('AI timeout')); });
        req.write(apiBody);
        req.end();
      });

      var responseLower = aiResponse.toLowerCase();
      var relevantSources = sorted.filter(function(a) {
        return responseLower.includes((a.title || '').toLowerCase().slice(0, 40));
      }).slice(0, 5).map(function(a) {
        return { title: a.title, url: a.url, date: a.publishedAt };
      });

      return jsonReply(res, 200, { response: aiResponse, sources: relevantSources });
    } catch (e) {
      console.error('[TechNews Chat] Error:', e.message);
      return jsonReply(res, 200, { response: 'Error: ' + e.message, sources: [] });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RESEARCH ENGINE — bulk transcription + deep AI analysis
  // ═══════════════════════════════════════════════════════════

  // POST /api/tech-news/research/transcribe-all — batch transcribe all YouTube videos
  if (parts[1] === 'research' && parts[2] === 'transcribe-all' && req.method === 'POST') {
    if (_researchState.transcribing) {
      return jsonReply(res, 409, { error: 'Transcription already running', progress: _researchState });
    }
    _researchState.transcribing = true;
    _researchState.transcribeStarted = Date.now();
    _researchState.podcastFailures = [];

    const store = newsEngine.loadNewsStore(ctx.techNewsStore);
    const ytArticles = store.articles.filter(a => a.videoId);
    _researchState.transcribeTotal = ytArticles.length;
    _researchState.transcribeDone = 0;
    _researchState.transcribeFailed = 0;
    _researchState.transcribeSkipped = 0;
    _researchState.transcribeCurrent = '';

    // Fire-and-forget — client polls /research/status
    jsonReply(res, 200, { ok: true, total: ytArticles.length, message: 'Transcription started' });

    (async () => {
      const cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

      for (const a of ytArticles) {
        const cachePath = path.join(cacheDir, a.videoId + '.json');
        if (fs.existsSync(cachePath)) {
          _researchState.transcribeSkipped++;
          _researchState.transcribeDone++;
          continue;
        }
        _researchState.transcribeCurrent = a.title || a.videoId;
        try {
          const t = await newsEngine.fetchYouTubeTranscript(a.videoId);
          if (t && t.segments && t.segments.length > 0) {
            _researchState.transcribeDone++;
            console.log(`[Research] Transcribed: ${a.title || a.videoId} (${t.segmentCount} segments)`);
          } else {
            _researchState.transcribeFailed++;
            _researchState.transcribeDone++;
            if (a.category === 'podcast') {
              _researchState.podcastFailures.push({ title: a.title, videoId: a.videoId, podcastName: a.podcastName || a.sourceName, reason: 'No captions available' });
              console.warn('[Podcast] Transcript unavailable: ' + (a.title || a.videoId) + ' — no YouTube captions found');
            }
          }
        } catch (e) {
          _researchState.transcribeFailed++;
          _researchState.transcribeDone++;
          if (a.category === 'podcast') {
            _researchState.podcastFailures.push({ title: a.title, videoId: a.videoId, podcastName: a.podcastName || a.sourceName, reason: e.message || 'Transcription failed' });
            console.warn('[Podcast] Transcript failed: ' + (a.title || a.videoId) + ' — ' + (e.message || 'unknown error'));
          } else {
            console.error(`[Research] Transcript failed for ${a.videoId}: ${e.message}`);
          }
        }
        // Rate limit: 2s between fetches
        await new Promise(r => setTimeout(r, 2000));
      }
      _researchState.transcribing = false;
      _researchState.transcribeCurrent = '';
      if (_researchState.podcastFailures.length > 0) {
        console.warn('[Podcast] ' + _researchState.podcastFailures.length + ' podcast episode(s) could not be transcribed — YouTube captions not available');
      }
      console.log(`[Research] Transcription complete: ${_researchState.transcribeDone - _researchState.transcribeSkipped - _researchState.transcribeFailed} new, ${_researchState.transcribeSkipped} cached, ${_researchState.transcribeFailed} failed`);
    })().catch(e => {
      _researchState.transcribing = false;
      console.error('[Research] Bulk transcription error:', e.message);
    });
    return;
  }

  // GET /api/tech-news/research/status — poll transcription + report progress
  if (parts[1] === 'research' && parts[2] === 'status') {
    return jsonReply(res, 200, _researchState);
  }

  // POST /api/tech-news/research/generate — fire-and-forget report generation
  // POST /api/tech-news/research/generate?period=daily|weekly
  if (parts[1] === 'research' && parts[2] === 'generate' && req.method === 'POST') {
    var period = url.searchParams.get('period') || 'daily';
    if (_researchState.generating) {
      return jsonReply(res, 409, { error: 'Report generation already running', elapsed: Math.round((Date.now() - _researchState.generateStarted) / 1000) + 's' });
    }
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { ok: false, error: 'No Anthropic API key configured' });
    }

    _researchState.generating = true;
    _researchState.generateStarted = Date.now();
    _researchState.generateError = null;
    _researchState.generatePeriod = period;

    // Fire-and-forget — client polls /research/status
    jsonReply(res, 200, { ok: true, message: period + ' report generation started', period: period });

    _generateResearchReport(ctx, period).then(function(report) {
      _researchState.generating = false;
      _researchState.report = report;
      _researchState.reportPeriod = period;
      _researchState.reportGeneratedAt = new Date().toISOString();
      console.log('[Research] ' + period + ' report complete!');
    }).catch(function(e) {
      _researchState.generating = false;
      _researchState.generateError = e.message;
      console.error('[Research] Report generation failed:', e.message);
    });
    return;
  }

  // GET /api/tech-news/research?period=daily|weekly — return cached/completed report
  if (parts[1] === 'research' && !parts[2]) {
    var period = url.searchParams.get('period') || 'daily';
    // Check in-memory result first (from latest generation)
    if (_researchState.report && _researchState.reportPeriod === period) {
      return jsonReply(res, 200, { report: _researchState.report, period: period, generated_at: _researchState.reportGeneratedAt, cached: false });
    }
    // Check DB cache
    try {
      const cached = db.getLatestNewsDigest('tech_research_' + period);
      if (cached) {
        return jsonReply(res, 200, { report: JSON.parse(cached.content), period: period, generated_at: cached.generated_at, cached: true });
      }
    } catch (_) {}
    // Check if currently generating
    if (_researchState.generating) {
      return jsonReply(res, 200, { report: null, generating: true, period: _researchState.generatePeriod, elapsed: Math.round((Date.now() - _researchState.generateStarted) / 1000) });
    }
    if (_researchState.generateError) {
      return jsonReply(res, 200, { report: null, error: _researchState.generateError });
    }
    return jsonReply(res, 200, { report: null });
  }

  // ── Research Email ──

  // POST /api/tech-news/research/email — send report via email
  if (parts[1] === 'research' && parts[2] === 'email' && req.method === 'POST') {
    try {
      const { sendResearchEmail, getRecipientList } = require('../lib/research-email');
      const body = await readBody(req);
      const recipients = body.recipients || getRecipientList();
      if (!recipients.length) return jsonReply(res, 400, { error: 'No recipients. Set RESEARCH_EMAIL_RECIPIENTS in .env or pass recipients in body.' });

      // Get latest report
      var report = _researchState.report;
      if (!report) {
        try {
          var cached = db.getLatestNewsDigest('tech_research_daily');
          if (cached) report = JSON.parse(cached.content);
        } catch (_) {}
      }
      if (!report) return jsonReply(res, 400, { error: 'No report available. Generate one first.' });

      const result = await sendResearchEmail(ctx, report, 'tech', recipients);
      return jsonReply(res, 200, result);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Email send failed: ' + e.message });
    }
  }

  // GET /api/tech-news/research/email/recipients — get configured recipients
  if (parts[1] === 'research' && parts[2] === 'email' && parts[3] === 'recipients' && req.method === 'GET') {
    const { getRecipientList } = require('../lib/research-email');
    return jsonReply(res, 200, { recipients: getRecipientList() });
  }

  // PUT /api/tech-news/research/email/recipients — update recipients in .env
  if (parts[1] === 'research' && parts[2] === 'email' && parts[3] === 'recipients' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const recipients = body.recipients || [];
      // Save to .env file
      const envPath = path.join(__dirname, '..', '..', '.env');
      var envContent = '';
      try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch (_) {}
      if (envContent.includes('RESEARCH_EMAIL_RECIPIENTS=')) {
        envContent = envContent.replace(/RESEARCH_EMAIL_RECIPIENTS=.*/g, 'RESEARCH_EMAIL_RECIPIENTS=' + recipients.join(','));
      } else {
        envContent += '\nRESEARCH_EMAIL_RECIPIENTS=' + recipients.join(',');
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');
      process.env.RESEARCH_EMAIL_RECIPIENTS = recipients.join(',');
      return jsonReply(res, 200, { ok: true, recipients: recipients });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to save recipients: ' + e.message });
    }
  }

  // GET /api/tech-news/resolve-channel?q=handle
  if (parts[1] === 'resolve-channel') {
    const q = url.searchParams.get('q') || '';
    if (!q) return jsonReply(res, 400, { error: 'Missing ?q= parameter' });
    try {
      const channelId = await _resolveYouTubeChannelId(q);
      return jsonReply(res, 200, { channelId, query: q });
    } catch (e) {
      return jsonReply(res, 404, { error: e.message });
    }
  }

  // GET /api/tech-news — main feed
  if (!parts[1]) {
    const store = newsEngine.loadNewsStore(ctx.techNewsStore);
    const readIds = db.getNewsReadIds();
    const aiCache = db.getAllNewsAiCache();
    const notesRaw = db.getAllNewsNotes();
    const notesMap = {};
    notesRaw.forEach(n => { notesMap[n.article_id] = n.note; });

    const enriched = store.articles.map(a => {
      const ai = aiCache[a.id];
      return {
        ...a,
        relevanceScore: ai ? ai.ai_relevance : a.relevanceScore || 0.5,
        isRead: readIds.has(a.id),
        hasNote: !!notesMap[a.id],
        aiSummary: ai ? ai.exec_summary : null,
        beanzImpact: ai ? ai.beanz_impact : null,
        aiTopics: ai && ai.topics ? (function() { try { return JSON.parse(ai.topics); } catch { return []; } })() : [],
        aiEnrichedSummary: ai ? ai.enriched_summary : null,
        brand_tags: ai && ai.brand_tags ? (function() { try { return JSON.parse(ai.brand_tags); } catch { return []; } })() : [],
        category_classification: ai ? ai.category_classification : null,
        sentiment: ai ? ai.sentiment : null,
        sentiment_score: ai ? ai.sentiment_score : null
      };
    });

    return jsonReply(res, 200, {
      articles: enriched,
      stats: store.stats || {},
      lastRefreshed: store.lastRefreshed,
      sourceStatus: store.sourceStatus || {}
    });
  }
};

/** Load transcripts map */
function _loadTranscriptsMap() {
  var cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
  var map = {};
  try {
    if (!fs.existsSync(cacheDir)) return map;
    fs.readdirSync(cacheDir).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        var data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf-8'));
        if (data.videoId && data.text) map[data.videoId] = data;
      } catch (_) {}
    });
  } catch (_) {}
  return map;
}

/** Resolve a YouTube @handle, channel name, or URL to a UC... channel ID */
async function _resolveYouTubeChannelId(input) {
  const clean = input.trim().replace(/^@/, '');

  // Already a valid channel ID
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(clean)) return clean;

  // Extract from URL: youtube.com/channel/UC..., youtube.com/@handle, youtube.com/c/name
  const urlMatch = clean.match(/youtube\.com\/(?:channel\/(UC[a-zA-Z0-9_-]+)|(?:@|c\/)([^/?&]+))/);
  if (urlMatch?.[1]) return urlMatch[1];
  const handle = urlMatch?.[2] || clean;

  // Fetch the channel page and extract the channel ID
  const html = await newsEngine.httpGet('https://www.youtube.com/@' + encodeURIComponent(handle), {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+987'
  });

  const idMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ||
                  html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/) ||
                  html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/);

  if (!idMatch) throw new Error('Could not resolve channel ID for: @' + handle);
  return idMatch[1];
}

// ─── Research Engine State ───────────────────────────────────
var _researchState = {
  transcribing: false,
  transcribeTotal: 0,
  transcribeDone: 0,
  transcribeFailed: 0,
  transcribeSkipped: 0,
  transcribeCurrent: '',
  transcribeStarted: null,
  podcastFailures: [],
  generating: false,
  generateStarted: null
};

/** Generate deep AI research report using Opus */
async function _generateResearchReport(ctx, period) {
  period = period || 'daily';
  const https = require('https');
  const store = newsEngine.loadNewsStore(ctx.techNewsStore);
  var articles = store.articles || [];

  // Filter by period — daily: last 24h, weekly: last 7 days
  var cutoff = period === 'weekly' ? Date.now() - 7 * 24 * 60 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000;
  var periodArticles = articles.filter(function(a) { return new Date(a.publishedAt || a.fetchedAt).getTime() > cutoff; });
  // If daily has too few, expand to 3 days
  if (period === 'daily' && periodArticles.length < 20) {
    cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    periodArticles = articles.filter(function(a) { return new Date(a.publishedAt || a.fetchedAt).getTime() > cutoff; });
  }
  // Fall back to all articles if still too few
  if (periodArticles.length < 10) periodArticles = articles;
  const transcripts = _loadTranscriptsMap();
  const aiCache = db.getAllNewsAiCache();

  // ── Build context: all transcripts + articles + reddit + podcasts ──
  const ytArticles = periodArticles.filter(a => a.videoId && a.category !== 'podcast' && transcripts[a.videoId]);
  const podcastArticles = periodArticles.filter(a => a.category === 'podcast' && a.videoId && transcripts[a.videoId]);
  const podcastNoTranscript = periodArticles.filter(a => a.category === 'podcast' && a.videoId && !transcripts[a.videoId]);
  const rssArticles = periodArticles.filter(a => a.category === 'industry').slice(0, 50);
  const redditPosts = periodArticles.filter(a => a.category === 'reddit').slice(0, 50);

  // Sort videos by relevance + recency
  ytArticles.sort(function(a, b) { return (b.relevanceScore || 0) - (a.relevanceScore || 0); });

  var contextParts = [];
  var usedChars = 0;
  var MAX_CHARS = 200000; // ~50K tokens — sweet spot for Opus speed (2-3 min)
  var FULL_TRANSCRIPT_LIMIT = 15; // top 15 get full transcripts
  var TRANSCRIPT_MAX_CHARS = 6000; // per transcript

  // ── Podcast transcripts first (high value, long-form content) ──
  var P_LIMIT = 10;
  var P_MAX = 8000;
  if (podcastArticles.length > 0) {
    contextParts.push('\n\n=== PODCAST TRANSCRIPTS (' + Math.min(podcastArticles.length, P_LIMIT) + ' of ' + podcastArticles.length + ' episodes with full text) ===\n');
    for (var pi = 0; pi < Math.min(podcastArticles.length, P_LIMIT) && usedChars < MAX_CHARS * 0.35; pi++) {
      var pa = podcastArticles[pi];
      var pt = transcripts[pa.videoId];
      var pai = aiCache[pa.id];
      var pEntry = '\n--- PODCAST: ' + (pa.title || 'Untitled') + ' ---\nShow: ' + (pa.podcastName || pa.sourceName || pa.source) + '\nDate: ' + (pa.publishedAt || '') + '\nVideoId: ' + pa.videoId;
      if (pai && pai.exec_summary) pEntry += '\nAI Summary: ' + pai.exec_summary;
      if (pt.segments && pt.segments.length > 0) {
        pEntry += '\nTRANSCRIPT:\n';
        var pLen = 0;
        for (var psi = 0; psi < pt.segments.length && pLen < P_MAX; psi++) {
          var pseg = pt.segments[psi]; var pmm = Math.floor(pseg.start/60); var pss = Math.floor(pseg.start%60);
          var pLine = '[' + pmm + ':' + (pss<10?'0':'') + pss + '] ' + pseg.text + '\n';
          pEntry += pLine; pLen += pLine.length;
        }
      }
      if (usedChars + pEntry.length > MAX_CHARS * 0.35) break;
      contextParts.push(pEntry); usedChars += pEntry.length;
    }
  }
  if (podcastNoTranscript.length > 0) {
    contextParts.push('\n\n=== PODCAST EPISODES (no transcript available) ===\n');
    podcastNoTranscript.forEach(function(pa) {
      var nEntry = '\n- ' + (pa.title || 'Untitled') + ' [' + (pa.podcastName || pa.sourceName) + '] — YouTube captions unavailable';
      contextParts.push(nEntry); usedChars += nEntry.length;
    });
  }

  // ── Top videos: full transcripts with timestamps ──
  contextParts.push('\n\n=== YOUTUBE VIDEOS WITH FULL TRANSCRIPTS (' + Math.min(ytArticles.length, FULL_TRANSCRIPT_LIMIT) + ' of ' + ytArticles.length + ') ===\n');
  for (var i = 0; i < Math.min(ytArticles.length, FULL_TRANSCRIPT_LIMIT) && usedChars < MAX_CHARS * 0.7; i++) {
    var a = ytArticles[i];
    var t = transcripts[a.videoId];
    var ai = aiCache[a.id];
    var entry = '\n--- VIDEO: ' + (a.title || 'Untitled') + ' ---';
    entry += '\nChannel: ' + (a.sourceName || a.source || 'Unknown');
    entry += '\nDate: ' + (a.publishedAt || 'Unknown');
    entry += '\nVideoId: ' + a.videoId;
    entry += '\nDuration: ' + Math.floor((t.duration || 0) / 60) + ' min';
    if (ai && ai.exec_summary) entry += '\nAI Summary: ' + ai.exec_summary;
    if (t.segments && t.segments.length > 0) {
      entry += '\nFULL TRANSCRIPT:\n';
      var tLen = 0;
      for (var si = 0; si < t.segments.length && tLen < TRANSCRIPT_MAX_CHARS; si++) {
        var seg = t.segments[si];
        var mm = Math.floor(seg.start / 60);
        var ss = Math.floor(seg.start % 60);
        var line = '[' + mm + ':' + (ss < 10 ? '0' : '') + ss + '] ' + seg.text + '\n';
        entry += line;
        tLen += line.length;
      }
      if (si < t.segments.length) entry += '[...transcript continues, ' + (t.segments.length - si) + ' more segments]\n';
    }
    contextParts.push(entry);
    usedChars += entry.length;
  }

  // ── Remaining videos: title + summary only ──
  if (ytArticles.length > FULL_TRANSCRIPT_LIMIT) {
    contextParts.push('\n\n=== ADDITIONAL VIDEOS (summaries only, ' + (ytArticles.length - FULL_TRANSCRIPT_LIMIT) + ') ===\n');
    for (var i2 = FULL_TRANSCRIPT_LIMIT; i2 < ytArticles.length && usedChars < MAX_CHARS * 0.85; i2++) {
      var a2 = ytArticles[i2];
      var ai2 = aiCache[a2.id];
      var t2 = transcripts[a2.videoId];
      var entry2 = '\n- ' + (a2.title || '') + ' [' + (a2.sourceName || a2.source) + ', VideoId: ' + a2.videoId + ']';
      if (ai2 && ai2.exec_summary) entry2 += '\n  Summary: ' + ai2.exec_summary;
      else if (t2 && t2.summary) entry2 += '\n  Excerpt: ' + t2.summary.slice(0, 300);
      contextParts.push(entry2);
      usedChars += entry2.length;
    }
  }

  // ── RSS articles ──
  if (usedChars < MAX_CHARS * 0.9) {
    contextParts.push('\n\n=== TECH NEWS ARTICLES (' + rssArticles.length + ') ===\n');
    for (var j = 0; j < rssArticles.length && usedChars < MAX_CHARS * 0.9; j++) {
      var ra = rssArticles[j];
      var rai = aiCache[ra.id];
      var rEntry = '\n- ' + (ra.title || '') + ' [' + (ra.sourceName || ra.source) + ']';
      if (rai && rai.exec_summary) rEntry += ' — ' + rai.exec_summary;
      else if (ra.summary) rEntry += ' — ' + (ra.summary || '').slice(0, 200);
      rEntry += '\n  URL: ' + (ra.url || '');
      contextParts.push(rEntry);
      usedChars += rEntry.length;
    }
  }

  // ── Reddit posts with comments ──
  if (usedChars < MAX_CHARS) {
    contextParts.push('\n\n=== REDDIT DISCUSSIONS (' + redditPosts.length + ') ===\n');
    for (var k = 0; k < redditPosts.length && usedChars < MAX_CHARS; k++) {
      var rp = redditPosts[k];
      var rpEntry = '\n- ' + (rp.title || '') + ' [' + (rp.sourceName || rp.source) + ', score: ' + ((rp.engagement || {}).redditScore || 0) + ']';
      rpEntry += '\n  URL: ' + (rp.url || '');
      if (rp.summary) rpEntry += '\n  Body: ' + (rp.summary || '').slice(0, 300);
      if (rp.comments && rp.comments.length) {
        rp.comments.slice(0, 3).forEach(function(c) {
          rpEntry += '\n    > ' + (c.author || 'anon') + ': ' + (c.text || '').slice(0, 200);
        });
      }
      contextParts.push(rpEntry);
      usedChars += rpEntry.length;
    }
  }

  var fullContext = contextParts.join('');
  console.log('[Research] Context: ' + Math.round(usedChars / 1000) + 'K chars, ' + ytArticles.length + ' videos (' + Math.min(ytArticles.length, FULL_TRANSCRIPT_LIMIT) + ' full), ' + podcastArticles.length + ' podcasts, ' + rssArticles.length + ' articles, ' + redditPosts.length + ' reddit');

  // ── Single Opus call ──
  var systemPrompt = `You are a world-class AI researcher and educator writing the definitive newsletter on AI and productivity technology. Think of this as "The best newsletter to learn everything about technical AI this week." Your audience is smart but wants to LEARN — explain concepts, connect dots, and make complex AI developments accessible.

Your newsletter must be:
- EDUCATIONAL — teach the reader what matters and WHY it matters. Explain technical concepts clearly.
- RICH WITH QUOTES — every insight backed by direct quotes from the video transcripts. Use [MM:SS] timestamps so readers can jump to the source.
- WELL-WRITTEN — engaging, authoritative prose. Not bullet-point summaries. Write like the best tech journalists.
- ORGANIZED BY THEMES — group insights across multiple sources into coherent narratives
- TECHNICALLY DEEP — name specific models, benchmarks, architectures, pricing, comparisons
- OPINIONATED — tell the reader what's signal vs noise. What actually matters this week.
- CROSS-REFERENCED — connect what one creator said with what another said, or with Reddit community reactions

You have access to full video transcripts with timestamps. When quoting, ALWAYS include:
- The exact quote in quotation marks
- The channel/source name
- The videoId so links can be constructed
- The timestamp in seconds (for URL parameter t=)

Return valid JSON matching this exact schema:
{
  "title": "string — catchy research brief title",
  "subtitle": "string — one-line hook",
  "generated_at": "ISO date",
  "meta": { "videos_analyzed": number, "articles_analyzed": number, "reddit_threads": number, "total_transcript_minutes": number },

  "executive_summary": "string — 3-4 paragraphs, dense with insight, names specific tools/models/companies",

  "trends": [
    {
      "trend": "string — clear trend name",
      "confidence": "high|medium|emerging",
      "category": "string — e.g. ai_models, ai_coding, ai_agents, automation, open_source, hardware, regulation, productivity",
      "analysis": "string — 6-10 sentences of deep analysis synthesizing multiple sources",
      "evidence": [
        {
          "quote": "string — exact quote from transcript or reddit",
          "source": "string — channel name or subreddit",
          "videoId": "string or null",
          "timestamp": number_or_null,
          "url": "string — full URL with timestamp if video"
        }
      ],
      "implications": "string — 2-3 sentences on what this means for builders, businesses, developers",
      "tools_mentioned": ["array of tool/product names relevant to this trend"]
    }
  ],

  "deep_dives": [
    {
      "title": "string — topic title for this deep analysis",
      "synthesis": "string — 10-15 sentences pulling from multiple videos and sources, highly technical",
      "key_quotes": [
        { "quote": "string", "speaker": "string — channel name", "videoId": "string", "timestamp": number, "url": "string" }
      ],
      "takeaway": "string — 2-3 sentence bottom line"
    }
  ],

  "tools_and_products": [
    {
      "name": "string — tool/product name",
      "category": "string — coding, automation, agents, infrastructure, models, productivity",
      "mentions": number,
      "sentiment": "positive|negative|mixed|neutral",
      "what_people_say": "string — aggregated view from multiple sources",
      "best_quote": { "quote": "string", "source": "string", "url": "string" }
    }
  ],

  "predictions_and_debates": [
    {
      "topic": "string — the debate question",
      "positions": [
        { "position": "string — one side", "advocate": "string — who says this", "quote": "string", "videoId": "string or null", "timestamp": number_or_null }
      ]
    }
  ],

  "reddit_intelligence": {
    "hot_debates": [
      { "title": "string", "subreddit": "string", "url": "string", "upvotes": number, "key_insight": "string", "top_quote": "string" }
    ],
    "community_sentiment": "string — 3-4 sentences on overall mood/themes in AI subreddits",
    "emerging_tools": [
      { "name": "string", "context": "string — why people are talking about it", "url": "string" }
    ]
  },

  "reading_list": [
    { "title": "string — video or article title", "type": "video|article|reddit", "url": "string", "why": "string — 1-2 sentence reason to watch/read", "duration": "string or null — e.g. '15 min'" }
  ],

  "bottom_line": "string — 3-4 sentence closing, the one big takeaway from this week in AI"
}

IMPORTANT: Include at least 8-12 trends, 3-5 deep dives, 10+ tools, 3-5 debates, and 10+ reading list items. Be EXHAUSTIVE. This should take 10+ minutes to read.`;

  var periodLabel = period === 'weekly' ? 'WEEKLY' : 'DAILY';
  var userMsg = 'Generate the comprehensive ' + periodLabel + ' AI & Productivity Research Brief based on the following data. Today is ' + new Date().toISOString().slice(0, 10) + '. Period: ' + period + '.\n\n' + fullContext;

  var apiBody = JSON.stringify({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMsg }]
  });

  console.log('[Research] Calling Opus... (context: ' + Math.round(usedChars / 1000) + 'K chars)');

  var aiResponse = await new Promise(function(resolve, reject) {
    var chunks = [];
    var req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ctx.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      }
    }, function(res) {
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try {
          var data = Buffer.concat(chunks).toString();
          var j = JSON.parse(data);
          if (j.content && j.content[0]) resolve(j.content[0].text);
          else if (j.error) reject(new Error(j.error.message));
          else reject(new Error('Unexpected API response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(600000, function() { req.destroy(); reject(new Error('AI request timed out (10 min)')); }); // 10 min timeout
    req.write(apiBody);
    req.end();
  });

  // Parse the JSON from the response
  var jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse JSON from Opus response');
  var report = JSON.parse(jsonMatch[0]);

  // Cache in DB
  try {
    db.upsertNewsDigest('tech_research_' + period + '-' + new Date().toISOString().slice(0,10), 'tech_research_' + period, JSON.stringify(report), ytArticles.length + rssArticles.length + redditPosts.length, 'claude-opus-4-20250514');
  } catch (e) {
    console.error('[Research] Failed to cache report:', e.message);
  }

  console.log('[Research] Report generated: ' + (report.trends || []).length + ' trends, ' + (report.deep_dives || []).length + ' deep dives, ' + (report.tools_and_products || []).length + ' tools');
  return report;
}

/** Auto-transcribe all YouTube videos that aren't already cached (fire-and-forget) */
function _autoTranscribeAll(articles) {
  var cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  var ytArticles = (articles || []).filter(function(a) { return a.videoId; });
  var uncached = ytArticles.filter(function(a) {
    return !fs.existsSync(path.join(cacheDir, a.videoId + '.json'));
  });

  if (uncached.length === 0) return;
  console.log('[TechNews] Auto-transcribing ' + uncached.length + ' new videos (of ' + ytArticles.length + ' total)');

  (async function() {
    var done = 0;
    var failed = 0;
    for (var i = 0; i < uncached.length; i++) {
      var a = uncached[i];
      try {
        var t = await newsEngine.fetchYouTubeTranscript(a.videoId);
        if (t && t.segments && t.segments.length > 0) done++;
        else failed++;
      } catch (e) {
        failed++;
      }
      // Rate limit: 2s between fetches
      if (i < uncached.length - 1) await new Promise(function(r) { setTimeout(r, 2000); });
    }
    console.log('[TechNews] Auto-transcription complete: ' + done + ' new, ' + failed + ' failed');
  })().catch(function(e) {
    console.error('[TechNews] Auto-transcription error:', e.message);
  });
}

module.exports.loadTechSourcesConfig = loadTechSourcesConfig;
module.exports.scoreTechRelevance = scoreTechRelevance;
module.exports.autoTranscribeAll = _autoTranscribeAll;
module.exports.generateResearchReport = _generateResearchReport;
