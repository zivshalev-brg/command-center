const { jsonReply, readBody } = require('../lib/helpers');
const newsEngine = require('../lib/news-engine');
const { loadLearningStore } = require('../lib/learning');
const db = require('../lib/db');
const MODELS = require('../lib/ai-models');
const { buildPipelineHealth } = require('../lib/pipeline-health');
const {
  summariseArticle, batchSummariseTopArticles, enrichArticle, batchEnrichArticles,
  generateDigest, extractAndTrackTopics, getTrendingTopics, detectCompetitorAlerts
} = require('../lib/ai-news');

module.exports = async function handleNews(req, res, parts, url, ctx) {
  // GET /api/news/pipeline/health — newsletter pipeline status (store, transcripts, digest freshness)
  if (parts[1] === 'pipeline' && parts[2] === 'health' && req.method === 'GET') {
    try {
      const health = buildPipelineHealth({ storePath: ctx.newsStore, digestPrefix: 'coffee_research_' });
      return jsonReply(res, 200, health);
    } catch (e) {
      return jsonReply(res, 500, { ok: false, error: e.message });
    }
  }

  // GET /api/news/refresh
  if (parts[1] === 'refresh') {
    try {
      const force = url.searchParams.get('force') === '1';
      const result = await newsEngine.refreshNewsData(ctx.newsStore, force);
      // Post-refresh: extract topics + detect competitor alerts + auto-transcribe
      if (!result.skipped) {
        const store = newsEngine.loadNewsStore(ctx.newsStore);
        try { extractAndTrackTopics(store.articles); } catch (e) { console.error('[News] Topic extraction error:', e.message); }
        try { detectCompetitorAlerts(store.articles); } catch (e) { console.error('[News] Competitor detection error:', e.message); }
        // AI summarise top articles (fire-and-forget)
        if (ctx.anthropicApiKey) {
          batchSummariseTopArticles(ctx.anthropicApiKey, store.articles, 15)
            .catch(e => console.error('[News] AI batch summarise error:', e.message));
          // AI enrich all articles (fire-and-forget, runs after summarise)
          var _enrichTranscripts = _loadTranscriptsMap();
          batchEnrichArticles(ctx.anthropicApiKey, store.articles, _enrichTranscripts, 20)
            .catch(e => console.error('[News] AI batch enrich error:', e.message));
        }
        // Auto-transcribe YouTube videos (fire-and-forget)
        const ytArticles = store.articles.filter(a => a.videoId);
        if (ytArticles.length > 0) {
          (async () => {
            let transcribed = 0;
            for (const a of ytArticles.slice(0, 10)) {
              try {
                const t = await newsEngine.fetchYouTubeTranscript(a.videoId);
                if (t && t.segments && t.segments.length > 0) transcribed++;
              } catch { /* skip failures */ }
            }
            if (transcribed > 0) console.log(`[News] Auto-transcribed ${transcribed} YouTube videos`);
          })().catch(e => console.error('[News] Auto-transcribe error:', e.message));
        }
      }
      return jsonReply(res, 200, { ok: true, newArticles: result.newCount, refreshedAt: result.refreshedAt });
    } catch (e) {
      return jsonReply(res, 500, { error: 'News refresh failed: ' + e.message });
    }
  }

  // GET /api/news/sources — get current source config
  if (parts[1] === 'sources' && req.method === 'GET') {
    const config = newsEngine.loadSourcesConfig();
    const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
    return jsonReply(res, 200, { sources: config, status: newsStore.sourceStatus });
  }

  // PUT /api/news/sources — update source config
  if (parts[1] === 'sources' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const current = newsEngine.loadSourcesConfig();
      // Merge updates — body can contain rss, reddit, youtube, competitors, settings
      if (body.rss) current.rss = body.rss;
      if (body.reddit) current.reddit = body.reddit;
      if (body.youtube) current.youtube = body.youtube;
      if (body.competitors) current.competitors = body.competitors;
      if (body.settings) current.settings = { ...current.settings, ...body.settings };
      newsEngine.saveSourcesConfig(current);
      newsEngine.reloadSources();
      // Auto-refresh feeds with updated sources
      newsEngine.refreshNewsData(ctx.newsStore, true)
        .catch(e => console.error('[News] Auto-refresh after source update failed:', e.message));
      return jsonReply(res, 200, { ok: true, sources: current });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to save sources: ' + e.message });
    }
  }

  // POST /api/news/sources/add — add a single source
  if (parts[1] === 'sources' && parts[2] === 'add' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const config = newsEngine.loadSourcesConfig();
      const type = body.type; // 'rss', 'reddit', 'youtube', 'podcast'
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

      newsEngine.saveSourcesConfig(config);
      newsEngine.reloadSources();
      // Auto-refresh feeds to pull in articles from the new source
      newsEngine.refreshNewsData(ctx.newsStore, true)
        .catch(e => console.error('[News] Auto-refresh after adding source failed:', e.message));
      return jsonReply(res, 200, { ok: true, sources: config });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to add source: ' + e.message });
    }
  }

  // POST /api/news/sources/remove — remove a single source
  if (parts[1] === 'sources' && parts[2] === 'remove' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const config = newsEngine.loadSourcesConfig();
      const type = body.type;
      const key = body.key;
      if (config[type] && config[type][key]) {
        delete config[type][key];
        newsEngine.saveSourcesConfig(config);
        newsEngine.reloadSources();
      }
      return jsonReply(res, 200, { ok: true, sources: config });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to remove source: ' + e.message });
    }
  }

  // GET /api/news/transcript/:videoId — auto-fetch transcript
  if (parts[1] === 'transcript' && parts[2] && !parts[3] && req.method === 'GET') {
    const videoId = parts[2];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return jsonReply(res, 400, { error: 'Invalid or missing videoId' });
    }
    try {
      const transcript = await newsEngine.fetchYouTubeTranscript(videoId);
      return jsonReply(res, 200, transcript);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Transcript fetch failed: ' + e.message });
    }
  }

  // POST /api/news/transcript/:videoId/manual — save manually pasted transcript
  if (parts[1] === 'transcript' && parts[2] && parts[3] === 'manual' && req.method === 'POST') {
    const videoId = parts[2];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return jsonReply(res, 400, { error: 'Invalid videoId' });
    }
    try {
      const body = await readBody(req);
      const rawText = (body.text || '').trim();
      if (!rawText) return jsonReply(res, 400, { error: 'No transcript text provided' });

      // Parse pasted text into segments — detect timestamps like "0:00", "1:23", "12:34"
      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      const segments = [];
      const tsRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*/;
      let pendingTime = null;

      for (const line of lines) {
        const tsMatch = line.match(tsRegex);
        if (tsMatch) {
          const hours = tsMatch[3] !== undefined ? parseInt(tsMatch[1]) : 0;
          const mins = tsMatch[3] !== undefined ? parseInt(tsMatch[2]) : parseInt(tsMatch[1]);
          const secs = tsMatch[3] !== undefined ? parseInt(tsMatch[3]) : parseInt(tsMatch[2]);
          const startSec = hours * 3600 + mins * 60 + secs;
          const text = line.replace(tsRegex, '').trim();
          if (text) {
            segments.push({ start: startSec, duration: 0, text });
          } else {
            pendingTime = startSec;
          }
        } else if (pendingTime !== null) {
          segments.push({ start: pendingTime, duration: 0, text: line });
          pendingTime = null;
        } else if (segments.length > 0) {
          // Append to previous segment
          segments[segments.length - 1].text += ' ' + line;
        } else {
          segments.push({ start: 0, duration: 0, text: line });
        }
      }

      // Compute durations from gaps
      for (let i = 0; i < segments.length - 1; i++) {
        segments[i].duration = segments[i + 1].start - segments[i].start;
      }
      if (segments.length > 0) {
        segments[segments.length - 1].duration = 5; // default last segment
      }

      const fullText = segments.map(s => s.text).join(' ');
      const result = {
        videoId,
        segmentCount: segments.length,
        duration: segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0,
        segments,
        text: fullText,
        summary: fullText.slice(0, 1000) + (fullText.length > 1000 ? '...' : ''),
        fetchedAt: new Date().toISOString(),
        source: 'manual'
      };

      // Save to cache
      const fs = require('fs');
      const path = require('path');
      const cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, videoId + '.json'), JSON.stringify(result, null, 2));

      return jsonReply(res, 200, result);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to save transcript: ' + e.message });
    }
  }

  // POST /api/news/transcript/:videoId/summarize — AI summarize a cached transcript
  if (parts[1] === 'transcript' && parts[2] && parts[3] === 'summarize' && req.method === 'POST') {
    const videoId = parts[2];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return jsonReply(res, 400, { error: 'Invalid videoId' });
    }
    try {
      const fs = require('fs');
      const path = require('path');
      const cachePath = path.join(__dirname, '..', '..', 'news-transcripts', videoId + '.json');
      if (!fs.existsSync(cachePath)) {
        return jsonReply(res, 404, { error: 'No transcript cached for this video' });
      }
      const transcript = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (!transcript.text) {
        return jsonReply(res, 400, { error: 'Transcript has no text content' });
      }
      if (!ctx.anthropicApiKey) {
        return jsonReply(res, 200, { summary: null, error: 'No Anthropic API key configured' });
      }

      // Truncate to ~8000 chars to fit context
      const textForAI = transcript.text.slice(0, 8000);
      const https = require('https');
      const aiResult = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: MODELS.HAIKU,
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Summarize this YouTube video transcript concisely. Return a JSON object with:
- "headline": one-sentence summary (max 20 words)
- "bullets": array of 3-5 key takeaways
- "topics": array of 2-4 topic tags
- "beanz_relevance": one sentence on relevance to coffee subscription business (or "Not directly relevant" if none)

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
              // Extract JSON from response (may be wrapped in markdown)
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

      // Cache the summary alongside the transcript
      transcript.aiSummary = aiResult;
      fs.writeFileSync(cachePath, JSON.stringify(transcript, null, 2));

      return jsonReply(res, 200, aiResult);
    } catch (e) {
      return jsonReply(res, 500, { error: 'AI summarization failed: ' + e.message });
    }
  }

  // POST /api/news/read/:articleId — mark article as read
  if (parts[1] === 'read' && parts[2] && req.method === 'POST') {
    db.markNewsRead(decodeURIComponent(parts[2]));
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/news/read — get all read IDs
  if (parts[1] === 'read' && !parts[2] && req.method === 'GET') {
    const readIds = Array.from(db.getNewsReadIds());
    return jsonReply(res, 200, { readIds });
  }

  // POST /api/news/note/:articleId — save note
  if (parts[1] === 'note' && parts[2] && req.method === 'POST') {
    const body = await readBody(req);
    db.upsertNewsNote(decodeURIComponent(parts[2]), body.note || '');
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/news/notes — get all notes
  if (parts[1] === 'notes' && req.method === 'GET') {
    const notes = db.getAllNewsNotes();
    const map = {};
    notes.forEach(n => { map[n.article_id] = n.note; });
    return jsonReply(res, 200, { notes: map });
  }

  // GET /api/news/ai-summary/:articleId — get or generate AI summary
  if (parts[1] === 'ai-summary' && parts[2]) {
    const articleId = decodeURIComponent(parts[2]);
    let cached = db.getNewsAiCache(articleId);
    if (cached) return jsonReply(res, 200, cached);

    // Generate on-demand
    if (ctx.anthropicApiKey) {
      const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
      const article = newsStore.articles.find(a => a.id === articleId);
      if (article) {
        const result = await summariseArticle(ctx.anthropicApiKey, article);
        if (result) return jsonReply(res, 200, result);
      }
    }
    return jsonReply(res, 200, { exec_summary: null, beanz_impact: null, ai_relevance: null });
  }

  // POST /api/news/digest/slack — post briefing to Slack
  if (parts[1] === 'digest' && parts[2] === 'slack' && req.method === 'POST') {
    if (!ctx.slackToken) return jsonReply(res, 400, { error: 'No SLACK_BOT_TOKEN configured' });

    try {
      const body = await readBody(req);
      const period = body.period || 'daily';
      const channel = body.channel || process.env.SLACK_DIGEST_CHANNEL || process.env.SLACK_NEWS_CHANNEL;

      if (!channel) return jsonReply(res, 400, { error: 'No Slack channel configured. Set SLACK_DIGEST_CHANNEL in .env or pass channel in request body.' });

      // Get latest cached digest or generate a new one
      let digest = null;
      const cached = db.getLatestNewsDigest(period);
      if (cached) {
        const today = new Date().toISOString().slice(0, 10);
        if (cached.generated_at && cached.generated_at.startsWith(today)) {
          digest = JSON.parse(cached.content);
        }
      }
      if (!digest && ctx.anthropicApiKey) {
        const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
        digest = await generateDigest(ctx.anthropicApiKey, newsStore.articles, period);
      }
      if (!digest) return jsonReply(res, 400, { error: 'No digest available to post' });

      // Format as Slack mrkdwn
      const lines = [];
      lines.push(':newspaper: *Beanz OS \u2014 ' + (period === 'weekly' ? 'Weekly' : 'Daily') + ' News Briefing*');
      lines.push('_' + new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '_');

      if (digest.executive_summary) {
        lines.push('');
        lines.push('*Executive Summary*');
        lines.push(digest.executive_summary);
      }

      if (digest.top_stories && digest.top_stories.length) {
        lines.push('');
        lines.push('*Top Stories*');
        digest.top_stories.forEach(function(s, i) {
          lines.push((i + 1) + '. *' + s.title + '* \u2014 ' + (s.analysis || s.why_it_matters || ''));
          if (s.beanz_relevance) lines.push('   _Beanz: ' + s.beanz_relevance + '_');
        });
      }

      if (digest.competitor_watch && digest.competitor_watch.length) {
        lines.push('');
        lines.push('*Competitor Watch*');
        digest.competitor_watch.forEach(function(cw) {
          lines.push(':eye: *' + (cw.brand || '') + '* [' + (cw.sentiment || 'neutral') + '] \u2014 ' + (cw.summary || ''));
        });
      }

      if (digest.reddit_pulse && digest.reddit_pulse.summary) {
        lines.push('');
        lines.push('*Reddit Pulse*');
        lines.push(digest.reddit_pulse.summary);
        if (digest.reddit_pulse.trending_topics && digest.reddit_pulse.trending_topics.length) {
          lines.push('Topics: ' + digest.reddit_pulse.trending_topics.join(', '));
        }
      }

      if (digest.recommended_actions && digest.recommended_actions.length) {
        lines.push('');
        lines.push('*Recommended Actions*');
        digest.recommended_actions.forEach(function(a) { lines.push(':point_right: ' + a); });
      }

      lines.push('');
      lines.push('_Generated by Beanz OS Command Center_');

      const { slackAPI } = require('../lib/slack-api');
      const resp = await slackAPI(ctx.slackToken, 'chat.postMessage', {
        channel: channel,
        text: lines.join('\n'),
        unfurl_links: false
      });

      if (resp.ok) {
        return jsonReply(res, 200, { ok: true, ts: resp.ts, channel: resp.channel });
      } else {
        return jsonReply(res, 400, { error: resp.error || 'Slack post failed' });
      }
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to post digest to Slack: ' + e.message });
    }
  }

  // GET /api/news/digest?period=daily|weekly
  if (parts[1] === 'digest' && !parts[2]) {
    const period = url.searchParams.get('period') || 'daily';
    const forceNew = url.searchParams.get('force') === '1';

    if (!forceNew) {
      const cached = db.getLatestNewsDigest(period);
      if (cached) {
        // Check if generated today
        const today = new Date().toISOString().slice(0, 10);
        if (cached.generated_at && cached.generated_at.startsWith(today)) {
          return jsonReply(res, 200, { digest: JSON.parse(cached.content), period, generated_at: cached.generated_at, cached: true });
        }
      }
    }

    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { digest: null, error: 'No API key configured' });
    }

    const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
    const digest = await generateDigest(ctx.anthropicApiKey, newsStore.articles, period, forceNew);
    return jsonReply(res, 200, { digest, period, generated_at: new Date().toISOString() });
  }

  // GET /api/news/trends?days=14
  if (parts[1] === 'trends') {
    const days = parseInt(url.searchParams.get('days')) || 14;
    const trends = getTrendingTopics(days);
    return jsonReply(res, 200, trends);
  }

  // GET /api/news/competitors?days=14
  if (parts[1] === 'competitors') {
    const days = parseInt(url.searchParams.get('days')) || 14;
    const alerts = db.getCompetitorAlerts(days);
    // Group by competitor
    const byComp = {};
    alerts.forEach(a => {
      if (!byComp[a.competitor]) byComp[a.competitor] = [];
      byComp[a.competitor].push(a);
    });
    return jsonReply(res, 200, { alerts, byCompetitor: byComp, total: alerts.length });
  }

  // GET /api/news/resolve-channel?q=handle — resolve a YouTube handle/URL to channel ID
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

  // POST /api/news/chat — conversational Q&A over all news data
  if (parts[1] === 'chat' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, { response: 'Chat is unavailable — no Anthropic API key configured.', sources: [] });
    }
    try {
      const body = await readBody(req);
      const message = (body.message || '').trim();
      if (!message) return jsonReply(res, 400, { error: 'No message provided' });

      const history = Array.isArray(body.history) ? body.history : [];

      // Build context from all news data
      const fs = require('fs');
      const path = require('path');
      const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
      const articles = newsStore.articles || [];
      const aiCache = db.getAllNewsAiCache();

      // Load YouTube transcripts (only those with enough signal to help the chat context)
      var transcriptsDir = path.join(__dirname, '..', '..', 'news-transcripts');
      var transcripts = {};
      try {
        var tFiles = fs.readdirSync(transcriptsDir).filter(function(f) { return f.endsWith('.json'); });
        tFiles.forEach(function(f) {
          try {
            var t = JSON.parse(fs.readFileSync(path.join(transcriptsDir, f), 'utf-8'));
            if (t.videoId && newsEngine.isTranscriptUsable(t)) transcripts[t.videoId] = t;
          } catch (_) { /* skip bad files */ }
        });
      } catch (_) { /* transcripts dir may not exist */ }

      // Sort articles for context priority: recent first, those with AI summaries or transcripts first
      var sorted = articles.slice().sort(function(a, b) {
        var scoreA = 0, scoreB = 0;
        // Recency bonus
        scoreA += (new Date(a.publishedAt || 0).getTime()) / 1e12;
        scoreB += (new Date(b.publishedAt || 0).getTime()) / 1e12;
        // AI summary bonus
        if (aiCache[a.id]) scoreA += 2;
        if (aiCache[b.id]) scoreB += 2;
        // Transcript bonus
        if (a.videoId && transcripts[a.videoId]) scoreA += 3;
        if (b.videoId && transcripts[b.videoId]) scoreB += 3;
        // Reddit brand mention bonus
        if (a.category === 'reddit' && (a.title || '').toLowerCase().includes('breville')) scoreA += 1;
        if (b.category === 'reddit' && (b.title || '').toLowerCase().includes('breville')) scoreB += 1;
        return scoreB - scoreA;
      });

      // Build context string, capped at ~120K chars (~30K tokens)
      var MAX_CONTEXT_CHARS = 120000;
      var contextParts = [];
      var usedChars = 0;

      for (var i = 0; i < sorted.length && usedChars < MAX_CONTEXT_CHARS; i++) {
        var a = sorted[i];
        var entry = '\n---\nTitle: ' + (a.title || 'Untitled');
        entry += '\nSource: ' + (a.sourceName || a.source || 'Unknown');
        entry += '\nDate: ' + (a.publishedAt || 'Unknown');
        entry += '\nURL: ' + (a.url || '');
        entry += '\nCategory: ' + (a.category || 'general');

        // AI summary if available
        var ai = aiCache[a.id];
        if (ai && ai.exec_summary) {
          entry += '\nAI Summary: ' + ai.exec_summary;
          if (ai.beanz_impact) entry += '\nBeanz Impact: ' + ai.beanz_impact;
        } else if (a.summary) {
          entry += '\nSummary: ' + (a.summary || '').slice(0, 500);
        }

        // Reddit engagement
        if (a.engagement && a.engagement.redditScore) {
          entry += '\nReddit Score: ' + a.engagement.redditScore + ', Comments: ' + (a.engagement.redditComments || 0);
        }
        if (a.engagement && a.engagement.youtubeViews) {
          entry += '\nYouTube Views: ' + a.engagement.youtubeViews;
        }

        // YouTube transcript (truncated)
        if (a.videoId && transcripts[a.videoId]) {
          var tText = transcripts[a.videoId].text || '';
          var tSummary = transcripts[a.videoId].aiSummary;
          if (tSummary && tSummary.headline) {
            entry += '\nTranscript AI Summary: ' + tSummary.headline;
            if (tSummary.bullets) entry += '\nKey Points: ' + tSummary.bullets.join('; ');
          } else if (tText) {
            entry += '\nTranscript: ' + tText.slice(0, 2000);
          }
        }

        if (usedChars + entry.length > MAX_CONTEXT_CHARS) {
          // Add a truncated version
          var remaining = MAX_CONTEXT_CHARS - usedChars;
          if (remaining > 200) contextParts.push(entry.slice(0, remaining));
          break;
        }
        contextParts.push(entry);
        usedChars += entry.length;
      }

      var contextStr = 'NEWS DATABASE (' + sorted.length + ' articles total, ' + contextParts.length + ' included):\n' + contextParts.join('');

      var systemPrompt = 'You are a coffee industry news analyst for Beanz (a coffee subscription platform by Breville Group). ' +
        'Answer questions about recent news, YouTube videos, Reddit discussions, and market trends. ' +
        'Be concise and business-focused. When referencing specific articles or videos, mention the source and date.\n\n' +
        contextStr;

      // Build messages array with history
      var messages = [];
      var historySlice = history.slice(-10); // keep last 10 turns
      historySlice.forEach(function(h) {
        if (h.role === 'user' || h.role === 'assistant') {
          messages.push({ role: h.role, content: h.content || '' });
        }
      });
      messages.push({ role: 'user', content: message });

      // Call Anthropic API
      var https = require('https');
      var apiBody = JSON.stringify({
        model: MODELS.SONNET,
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages
      });

      var aiResponse = await new Promise(function(resolve, reject) {
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
          var data = '';
          res.on('data', function(c) { data += c; });
          res.on('end', function() {
            try {
              var j = JSON.parse(data);
              if (j.content && j.content[0]) {
                resolve(j.content[0].text);
              } else if (j.error) {
                reject(new Error(j.error.message));
              } else {
                reject(new Error('Unexpected API response'));
              }
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(60000, function() { req.destroy(); reject(new Error('AI request timed out')); });
        req.write(apiBody);
        req.end();
      });

      // Extract sources: find articles mentioned in the response
      var responseLower = aiResponse.toLowerCase();
      var relevantSources = sorted.filter(function(a) {
        return responseLower.includes((a.title || '').toLowerCase().slice(0, 40)) ||
          responseLower.includes((a.sourceName || a.source || '').toLowerCase());
      }).slice(0, 5).map(function(a) {
        return { title: a.title, url: a.url, date: a.publishedAt };
      });

      return jsonReply(res, 200, { response: aiResponse, sources: relevantSources });
    } catch (e) {
      console.error('[News Chat] Error:', e.message);
      return jsonReply(res, 200, { response: 'Sorry, I encountered an error: ' + e.message, sources: [] });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COFFEE RESEARCH ENGINE
  // ═══════════════════════════════════════════════════════════

  // POST /api/news/research/transcribe-all
  if (parts[1] === 'research' && parts[2] === 'transcribe-all' && req.method === 'POST') {
    if (_coffeeResearch.transcribing) {
      return jsonReply(res, 409, { error: 'Transcription already running', progress: _coffeeResearch });
    }
    _coffeeResearch.transcribing = true;
    _coffeeResearch.transcribeStarted = Date.now();
    _coffeeResearch.podcastFailures = [];
    const store = newsEngine.loadNewsStore(ctx.newsStore);
    const ytArticles = store.articles.filter(a => a.videoId);
    _coffeeResearch.transcribeTotal = ytArticles.length;
    _coffeeResearch.transcribeDone = 0;
    _coffeeResearch.transcribeFailed = 0;
    _coffeeResearch.transcribeSkipped = 0;
    _coffeeResearch.transcribeCurrent = '';
    jsonReply(res, 200, { ok: true, total: ytArticles.length });
    (async () => {
      const fs = require('fs');
      const path = require('path');
      const cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      for (const a of ytArticles) {
        const cachePath = path.join(cacheDir, a.videoId + '.json');
        if (fs.existsSync(cachePath)) { _coffeeResearch.transcribeSkipped++; _coffeeResearch.transcribeDone++; continue; }
        _coffeeResearch.transcribeCurrent = a.title || a.videoId;
        try {
          const t = await newsEngine.fetchYouTubeTranscript(a.videoId);
          if (t && t.segments && t.segments.length > 0) {
            _coffeeResearch.transcribeDone++;
          } else {
            _coffeeResearch.transcribeFailed++; _coffeeResearch.transcribeDone++;
            if (a.category === 'podcast') {
              _coffeeResearch.podcastFailures.push({ title: a.title, videoId: a.videoId, podcastName: a.podcastName || a.sourceName, reason: 'No captions available' });
              console.warn('[Podcast] Transcript unavailable: ' + (a.title || a.videoId) + ' — no YouTube captions found for this episode');
            }
          }
        } catch (err) {
          _coffeeResearch.transcribeFailed++; _coffeeResearch.transcribeDone++;
          if (a.category === 'podcast') {
            _coffeeResearch.podcastFailures.push({ title: a.title, videoId: a.videoId, podcastName: a.podcastName || a.sourceName, reason: err.message || 'Transcription failed' });
            console.warn('[Podcast] Transcript failed: ' + (a.title || a.videoId) + ' — ' + (err.message || 'unknown error'));
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      _coffeeResearch.transcribing = false;
      _coffeeResearch.transcribeCurrent = '';
      if (_coffeeResearch.podcastFailures.length > 0) {
        console.warn('[Podcast] ' + _coffeeResearch.podcastFailures.length + ' podcast episode(s) could not be transcribed — YouTube captions not available');
      }
    })().catch(() => { _coffeeResearch.transcribing = false; });
    return;
  }

  // GET /api/news/research/status
  if (parts[1] === 'research' && parts[2] === 'status') {
    return jsonReply(res, 200, _coffeeResearch);
  }

  // POST /api/news/research/generate?period=daily|weekly
  if (parts[1] === 'research' && parts[2] === 'generate' && req.method === 'POST') {
    var period = url.searchParams.get('period') || 'daily';
    if (_coffeeResearch.generating) {
      return jsonReply(res, 409, { error: 'Already running', elapsed: Math.round((Date.now() - _coffeeResearch.generateStarted) / 1000) + 's' });
    }
    if (!ctx.anthropicApiKey) return jsonReply(res, 200, { ok: false, error: 'No API key' });
    _coffeeResearch.generating = true;
    _coffeeResearch.generateStarted = Date.now();
    _coffeeResearch.generateError = null;
    _coffeeResearch.generatePeriod = period;
    jsonReply(res, 200, { ok: true, period: period });
    _generateCoffeeResearch(ctx, period).then(function(report) {
      _coffeeResearch.generating = false;
      _coffeeResearch.report = report;
      _coffeeResearch.reportPeriod = period;
      _coffeeResearch.reportGeneratedAt = new Date().toISOString();
    }).catch(function(e) {
      _coffeeResearch.generating = false;
      _coffeeResearch.generateError = e.message;
      console.error('[CoffeeResearch] Failed:', e.message);
    });
    return;
  }

  // GET /api/news/research?period=daily|weekly
  if (parts[1] === 'research' && !parts[2]) {
    var period = url.searchParams.get('period') || 'daily';
    if (_coffeeResearch.report && _coffeeResearch.reportPeriod === period) {
      return jsonReply(res, 200, { report: _coffeeResearch.report, period: period, generated_at: _coffeeResearch.reportGeneratedAt });
    }
    try {
      const cached = db.getLatestNewsDigest('coffee_research_' + period);
      if (cached) return jsonReply(res, 200, { report: JSON.parse(cached.content), period: period, generated_at: cached.generated_at, cached: true });
    } catch (_) {}
    if (_coffeeResearch.generating) {
      return jsonReply(res, 200, { report: null, generating: true, period: _coffeeResearch.generatePeriod, elapsed: Math.round((Date.now() - _coffeeResearch.generateStarted) / 1000) });
    }
    if (_coffeeResearch.generateError) return jsonReply(res, 200, { report: null, error: _coffeeResearch.generateError });
    return jsonReply(res, 200, { report: null });
  }

  // ── Coffee Research Email ──

  // POST /api/news/research/email — send coffee report via email
  if (parts[1] === 'research' && parts[2] === 'email' && req.method === 'POST') {
    try {
      const { sendResearchEmail } = require('../lib/research-email');
      const body = await readBody(req);
      const envRecipients = (process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);
      const recipients = body.recipients || envRecipients;
      if (!recipients.length) return jsonReply(res, 400, { error: 'No recipients. Set COFFEE_RESEARCH_EMAIL_RECIPIENTS in .env or pass recipients in body.' });

      var report = _coffeeResearch.report;
      if (!report) {
        try { var cached = db.getLatestNewsDigest('coffee_research_daily'); if (cached) report = JSON.parse(cached.content); } catch (_) {}
      }
      if (!report) return jsonReply(res, 400, { error: 'No coffee report available. Generate one first.' });

      const result = await sendResearchEmail(ctx, report, 'coffee', recipients);
      return jsonReply(res, 200, result);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Email failed: ' + e.message });
    }
  }

  // GET /api/news/research/email/recipients
  if (parts[1] === 'research' && parts[2] === 'email' && parts[3] === 'recipients' && req.method === 'GET') {
    const recipients = (process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);
    return jsonReply(res, 200, { recipients: recipients });
  }

  // PUT /api/news/research/email/recipients
  if (parts[1] === 'research' && parts[2] === 'email' && parts[3] === 'recipients' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const recipients = body.recipients || [];
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      var envContent = '';
      try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch (_) {}
      if (envContent.includes('COFFEE_RESEARCH_EMAIL_RECIPIENTS=')) {
        envContent = envContent.replace(/COFFEE_RESEARCH_EMAIL_RECIPIENTS=.*/g, 'COFFEE_RESEARCH_EMAIL_RECIPIENTS=' + recipients.join(','));
      } else {
        envContent += '\nCOFFEE_RESEARCH_EMAIL_RECIPIENTS=' + recipients.join(',');
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');
      process.env.COFFEE_RESEARCH_EMAIL_RECIPIENTS = recipients.join(',');
      return jsonReply(res, 200, { ok: true, recipients: recipients });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to save: ' + e.message });
    }
  }

  // GET /api/news — main feed with enrichment
  if (!parts[1]) {
    const newsStore = newsEngine.loadNewsStore(ctx.newsStore);
    const store = loadLearningStore(ctx.learningStore);
    const readIds = db.getNewsReadIds();
    const aiCache = db.getAllNewsAiCache();
    const notesRaw = db.getAllNewsNotes();
    const notesMap = {};
    notesRaw.forEach(n => { notesMap[n.article_id] = n.note; });

    const enriched = newsStore.articles.map(a => {
      const pinned = store.pinnedInsights.includes(a.id);
      const dismissed = store.dismissedInsights.includes(a.id);
      const weight = store.insightWeights[a.id] || 0;
      const ai = aiCache[a.id];
      return {
        ...a,
        pinned, dismissed,
        learnedWeight: weight,
        relevanceScore: Math.max(0, Math.min(1, (ai ? ai.ai_relevance : a.relevanceScore || 0.5) + weight * 0.1)),
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
    const filtered = enriched.filter(a => !a.dismissed);

    return jsonReply(res, 200, {
      articles: filtered,
      competitorAlerts: db.getCompetitorAlerts(14),
      stats: newsStore.stats || {},
      lastRefreshed: newsStore.lastRefreshed,
      sourceStatus: newsStore.sourceStatus || {}
    });
  }
};

/** Load usable transcripts (keyed by videoId) — negative/thin entries are excluded. */
function _loadTranscriptsMap() {
  var fs = require('fs');
  var path = require('path');
  var cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
  var map = {};
  try {
    if (!fs.existsSync(cacheDir)) return map;
    var files = fs.readdirSync(cacheDir).filter(function(f) { return f.endsWith('.json'); });
    files.forEach(function(f) {
      try {
        var data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf-8'));
        if (data.videoId && newsEngine.isTranscriptUsable(data)) map[data.videoId] = data;
      } catch (_) { /* skip corrupt files */ }
    });
  } catch (_) { /* dir may not exist */ }
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

// ─── Coffee Research State & Generator ──────────────────────
var _coffeeResearch = {
  transcribing: false, transcribeTotal: 0, transcribeDone: 0, transcribeFailed: 0, transcribeSkipped: 0, transcribeCurrent: '', transcribeStarted: null,
  podcastFailures: [],
  generating: false, generateStarted: null, generateError: null, generatePeriod: null,
  report: null, reportPeriod: null, reportGeneratedAt: null
};

const COFFEE_CONTEXT = 'Beanz is a coffee subscription platform under Breville Group (AU, UK, US, DE, NL). ' +
  'CY25: $13.5M ARR, 1M bags, 36K subs. Key: FTBP (Fast-Track Barista Pack), Platinum Roasters, Project Feral (AI-first). ' +
  'Competitors: Trade Drink, Ninja, Nespresso, Keurig, Lavazza, Illy.';

async function _generateCoffeeResearch(ctx, period) {
  const https = require('https');
  const fs = require('fs');
  const path = require('path');
  period = period || 'daily';

  const store = newsEngine.loadNewsStore(ctx.newsStore);
  var articles = store.articles || [];
  var cutoff = period === 'weekly' ? Date.now() - 7 * 86400000 : Date.now() - 86400000;
  var periodArticles = articles.filter(function(a) { return new Date(a.publishedAt || a.fetchedAt).getTime() > cutoff; });
  if (periodArticles.length < 20) { cutoff = Date.now() - 3 * 86400000; periodArticles = articles.filter(function(a) { return new Date(a.publishedAt || a.fetchedAt).getTime() > cutoff; }); }
  if (periodArticles.length < 10) periodArticles = articles;

  const transcripts = _loadTranscriptsMap();
  const aiCache = db.getAllNewsAiCache();

  const ytArticles = periodArticles.filter(a => a.videoId && a.category !== 'podcast' && transcripts[a.videoId]);
  const podcastArticles = periodArticles.filter(a => a.category === 'podcast' && a.videoId && transcripts[a.videoId]);
  const podcastNoTranscript = periodArticles.filter(a => a.category === 'podcast' && a.videoId && !transcripts[a.videoId]);
  const rssArticles = periodArticles.filter(a => a.category === 'industry').slice(0, 50);
  const redditPosts = periodArticles.filter(a => a.category === 'reddit').slice(0, 50);

  var contextParts = [];
  var usedChars = 0;
  var MAX_CHARS = 200000;

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

  var FULL_LIMIT = 15;
  var T_MAX = 6000;
  contextParts.push('\n\n=== COFFEE YOUTUBE TRANSCRIPTS (' + Math.min(ytArticles.length, FULL_LIMIT) + ' of ' + ytArticles.length + ' with full text) ===\n');
  for (var i = 0; i < Math.min(ytArticles.length, FULL_LIMIT) && usedChars < MAX_CHARS * 0.7; i++) {
    var a = ytArticles[i];
    var t = transcripts[a.videoId];
    var ai = aiCache[a.id];
    var entry = '\n--- VIDEO: ' + (a.title || 'Untitled') + ' ---\nChannel: ' + (a.sourceName || a.source) + '\nDate: ' + (a.publishedAt || '') + '\nVideoId: ' + a.videoId;
    if (ai && ai.exec_summary) entry += '\nAI Summary: ' + ai.exec_summary;
    if (t.segments && t.segments.length > 0) {
      entry += '\nTRANSCRIPT:\n';
      var tLen = 0;
      for (var si = 0; si < t.segments.length && tLen < T_MAX; si++) {
        var seg = t.segments[si]; var mm = Math.floor(seg.start/60); var ss = Math.floor(seg.start%60);
        var line = '[' + mm + ':' + (ss<10?'0':'') + ss + '] ' + seg.text + '\n';
        entry += line; tLen += line.length;
      }
    }
    if (usedChars + entry.length > MAX_CHARS * 0.7) break;
    contextParts.push(entry); usedChars += entry.length;
  }

  if (usedChars < MAX_CHARS - 10000) {
    contextParts.push('\n\n=== COFFEE NEWS ARTICLES (' + rssArticles.length + ') ===\n');
    for (var j = 0; j < rssArticles.length && usedChars < MAX_CHARS - 5000; j++) {
      var ra = rssArticles[j]; var rai = aiCache[ra.id];
      var rEntry = '\n- ' + (ra.title || '') + ' [' + (ra.sourceName || ra.source) + ', ' + (ra.publishedAt || '').slice(0,10) + ']';
      if (rai && rai.exec_summary) rEntry += '\n  Summary: ' + rai.exec_summary;
      else if (ra.summary) rEntry += '\n  Summary: ' + (ra.summary || '').slice(0, 300);
      rEntry += '\n  URL: ' + (ra.url || '');
      contextParts.push(rEntry); usedChars += rEntry.length;
    }
  }

  if (usedChars < MAX_CHARS - 10000) {
    contextParts.push('\n\n=== REDDIT COFFEE DISCUSSIONS (' + redditPosts.length + ') ===\n');
    for (var k = 0; k < redditPosts.length && usedChars < MAX_CHARS - 5000; k++) {
      var rp = redditPosts[k];
      var rpEntry = '\n- ' + (rp.title || '') + ' [' + (rp.sourceName || rp.source) + ', score: ' + ((rp.engagement||{}).redditScore||0) + ']\n  URL: ' + (rp.url || '');
      if (rp.summary) rpEntry += '\n  Body: ' + (rp.summary || '').slice(0, 500);
      if (rp.comments && rp.comments.length) {
        rpEntry += '\n  Top comments:';
        rp.comments.slice(0, 5).forEach(function(c) { rpEntry += '\n    - ' + (c.author||'anon') + ': ' + (c.text||'').slice(0, 300); });
      }
      contextParts.push(rpEntry); usedChars += rpEntry.length;
    }
  }

  var fullContext = contextParts.join('');
  console.log('[CoffeeResearch] Context: ' + Math.round(usedChars/1000) + 'K chars, ' + ytArticles.length + ' videos, ' + podcastArticles.length + ' podcasts');

  var systemPrompt = 'You are a world-class coffee industry research analyst producing a comprehensive intelligence briefing for Ziv Shalev, GM of Beanz (Breville Group). ' + COFFEE_CONTEXT +
    '\n\nIMPORTANT: This report is for the BREVILLE GROUP leadership team. The #1 priority section is the BRAND SENTIMENT DASHBOARD — a real-time pulse on how customers talk about our brands (Breville, Sage, Lelit, Baratza, Beanz) across Reddit, YouTube, and articles. Extract EVERY mention of these brands, classify sentiment, and include direct customer quotes.' +
    '\n\nYour report must be EXTENSIVE, full of direct quotes with links, organized by TRENDS and THEMES. ' +
    'Cross-reference insights from videos, articles, podcasts, and Reddit. Focus on: customer sentiment about BRG brands, equipment complaints/praise, subscription models, competitor moves.\n\n' +
    'Return valid JSON with this schema:\n' +
    '{"title":"string","subtitle":"string","generated_at":"ISO","meta":{"videos_analyzed":0,"podcasts_analyzed":0,"articles_analyzed":0,"reddit_threads":0},' +
    '"brand_sentiment":{"summary":"2-3 sentence overview of brand health across all sources",' +
      '"brands":[' +
        '{"name":"Breville","mentions":0,"sentiment_score":0,"sentiment":"positive|negative|mixed|neutral",' +
          '"complaints":[{"issue":"short description","quote":"exact customer quote","source":"subreddit or channel","url":"link","severity":"high|medium|low"}],' +
          '"compliments":[{"praise":"short description","quote":"exact customer quote","source":"subreddit or channel","url":"link"}],' +
          '"notable_comments":[{"comment":"interesting observation","source":"","url":""}]},' +
        '{"name":"Sage","mentions":0,"sentiment_score":0,"sentiment":"...","complaints":[],"compliments":[],"notable_comments":[]},' +
        '{"name":"Lelit","mentions":0,"sentiment_score":0,"sentiment":"...","complaints":[],"compliments":[],"notable_comments":[]},' +
        '{"name":"Baratza","mentions":0,"sentiment_score":0,"sentiment":"...","complaints":[],"compliments":[],"notable_comments":[]},' +
        '{"name":"Beanz","mentions":0,"sentiment_score":0,"sentiment":"...","complaints":[],"compliments":[],"notable_comments":[]}' +
      '],"total_mentions":0,"period":"daily"},' +
    '"executive_summary":"3-4 paragraphs",' +
    '"trends":[{"trend":"name","confidence":"high|medium|emerging","category":"equipment|roasting|subscription|retail|consumer|competitor","analysis":"6-10 sentences","evidence":[{"quote":"exact","source":"channel","videoId":"or null","timestamp":0,"url":"link"}],"implications":"2-3 sentences","tools_mentioned":["brands"]}],' +
    '"deep_dives":[{"title":"topic","synthesis":"10-15 sentences","key_quotes":[{"quote":"","speaker":"","videoId":"","timestamp":0,"url":""}],"takeaway":"2-3 sentences"}],' +
    '"tools_and_products":[{"name":"product","category":"machine|grinder|roaster|subscription|accessory","mentions":0,"sentiment":"positive|negative|mixed","what_people_say":"","best_quote":{"quote":"","source":"","url":""}}],' +
    '"predictions_and_debates":[{"topic":"question","positions":[{"position":"","advocate":"","quote":"","videoId":"","timestamp":0}]}],' +
    '"reddit_intelligence":{"hot_debates":[{"title":"","subreddit":"","url":"","upvotes":0,"key_insight":""}],"community_sentiment":"3-4 sentences","emerging_tools":[{"name":"","context":"","url":""}]},' +
    '"reading_list":[{"title":"","type":"video|article|reddit","url":"","why":"","duration":""}],' +
    '"bottom_line":"3-4 sentences"}\n\nThe brand_sentiment section is CRITICAL. Search through ALL Reddit posts, comments, YouTube transcripts, and articles for ANY mention of Breville, Sage, Lelit, Baratza, or Beanz. Include the actual number of mentions found. Even if sentiment_score is 0 for a brand with no mentions, include it. Include 6-8 trends, 2-3 deep dives, 8-10 products, 8-10 reading list items. Depth over breadth. CRITICAL: response MUST be complete valid JSON — if approaching token limit, trim scope and close the object cleanly rather than truncate mid-field.';

  var periodLabel = period === 'weekly' ? 'WEEKLY' : 'DAILY';
  var userMsg = 'Generate the ' + periodLabel + ' Coffee Industry Research Brief. Today: ' + new Date().toISOString().slice(0, 10) + '.\n\n' + fullContext;

  var apiBody = JSON.stringify({ model: MODELS.OPUS, max_tokens: 40000, system: systemPrompt, messages: [{ role: 'user', content: userMsg }] });

  var aiResponse = await new Promise(function(resolve, reject) {
    var chunks = [];
    var req = https.request({ hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.anthropicApiKey, 'anthropic-version': '2023-06-01' }
    }, function(res) {
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try { var d = Buffer.concat(chunks).toString(); var j = JSON.parse(d);
          if (j.content && j.content[0]) resolve(j.content[0].text);
          else if (j.error) reject(new Error(j.error.message));
          else reject(new Error('Unexpected response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(900000, function() { req.destroy(); reject(new Error('Timeout 15min')); });
    req.write(apiBody); req.end();
  });

  var extract = _extractJsonObject(aiResponse);
  if (!extract.ok) {
    try {
      var fsNode = require('fs'); var pathNode = require('path');
      var dumpPath = pathNode.join(__dirname, '..', '..', 'kb-data', 'intelligence', 'last-opus-failure-coffee.txt');
      fsNode.writeFileSync(dumpPath, '# ' + new Date().toISOString() + '\n# ' + extract.error + '\n\n' + aiResponse, 'utf-8');
      console.error('[CoffeeResearch] Opus JSON parse failed:', extract.error, '— raw dump at', dumpPath);
    } catch (_) {}
    throw new Error('Failed to parse JSON from Opus response: ' + extract.error);
  }
  var report = extract.value;
  try { db.upsertNewsDigest('coffee_research_' + period + '-' + new Date().toISOString().slice(0,10), 'coffee_research_' + period, JSON.stringify(report), ytArticles.length + rssArticles.length + redditPosts.length, MODELS.OPUS); } catch (e) { console.error('[CoffeeResearch] Cache failed:', e.message); }
  console.log('[CoffeeResearch] Report complete: ' + (report.trends||[]).length + ' trends');
  return report;
}

/**
 * Balanced-brace JSON extractor. Handles prose appended after the object
 * by walking depth with string-literal awareness.
 */
function _extractJsonObject(text) {
  if (!text) return { ok: false, error: 'empty response' };
  var start = text.indexOf('{');
  if (start < 0) return { ok: false, error: 'no { in response' };
  var depth = 0, inStr = false, esc = false;
  for (var i = start; i < text.length; i++) {
    var c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return { ok: true, value: JSON.parse(text.slice(start, i + 1)) }; }
        catch (e) { return { ok: false, error: e.message }; }
      }
    }
  }
  return { ok: false, error: 'unterminated object (depth=' + depth + ', likely truncated at max_tokens)' };
}

module.exports.generateCoffeeResearch = _generateCoffeeResearch;
