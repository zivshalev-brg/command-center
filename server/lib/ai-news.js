/**
 * ai-news.js — AI-powered news summarisation, impact scoring, digest generation,
 * topic extraction, and competitor alert detection.
 */

'use strict';

const db = require('./db');
const MODELS = require('./ai-models');

const COMPETITORS = ['Trade Drink', 'TradeD rink', 'Ninja', "De'Longhi", 'DeLonghi', 'Nespresso', 'Keurig', 'Lavazza', 'Illy', 'Starbucks At Home'];
const COMPETITOR_RE = new RegExp(COMPETITORS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

const BEANZ_CONTEXT = 'Beanz is a coffee subscription platform under Breville Group, operating in AU, UK, US, DE, NL. ' +
  'CY25 targets: $13.5M ARR, 1M bags, 36K subs. Key initiatives: FTBP (Fast-Track Barista Pack), Platinum Roasters, ' +
  'Project Feral (AI-first), PBB, DE/NL expansion. Competitors: Trade Drink, Ninja, Nespresso, Keurig.';

// ─── AI Article Summarisation ────────────────────────────────

/**
 * Generate AI summary + Beanz impact for a single article.
 * Results cached in news_ai_cache SQLite table.
 */
async function summariseArticle(apiKey, article) {
  if (!apiKey || !article) return null;

  // Check cache
  const cached = db.getNewsAiCache(article.id);
  if (cached) return cached;

  const { callAnthropic } = require('./ai-classifier');

  const systemPrompt = 'You are an executive news analyst for Ziv Shalev, GM of Beanz. ' + BEANZ_CONTEXT +
    ' Respond with valid JSON: {"exec_summary":"2 sentences max","beanz_impact":"1-2 sentences on what this means for Beanz specifically","ai_relevance":0.0-1.0,"topics":["topic1","topic2"]}';

  const userMsg = `Analyse this article:\nTitle: ${article.title}\nSource: ${article.sourceName || article.source}\nSummary: ${(article.summary || '').slice(0, 400)}`;

  try {
    const raw = await callAnthropic(apiKey, systemPrompt, userMsg, 400);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed) return null;

    const result = {
      execSummary: parsed.exec_summary || '',
      beanzImpact: parsed.beanz_impact || '',
      aiRelevance: typeof parsed.ai_relevance === 'number' ? parsed.ai_relevance : 0.5,
      topics: JSON.stringify(parsed.topics || []),
      modelUsed: MODELS.OPUS
    };

    db.upsertNewsAiCache(article.id, result);
    return result;
  } catch (e) {
    console.error('[AI-News] Summarise failed:', e.message);
    return null;
  }
}

/**
 * Batch summarise top articles by keyword relevance.
 * Max 20 per call to control API cost.
 */
async function batchSummariseTopArticles(apiKey, articles, maxCount) {
  if (!apiKey) return 0;
  maxCount = maxCount || 20;

  // Sort by keyword relevance, skip already cached
  const cachedIds = db.getAllNewsAiCache();
  const needsSummary = articles
    .filter(a => !cachedIds[a.id])
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, maxCount);

  if (needsSummary.length === 0) return 0;

  console.log(`[AI-News] Summarising ${needsSummary.length} articles`);
  let count = 0;

  // Process 3 at a time
  for (let i = 0; i < needsSummary.length; i += 3) {
    const batch = needsSummary.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(a => summariseArticle(apiKey, a))
    );
    count += results.filter(r => r.status === 'fulfilled' && r.value).length;
  }

  console.log(`[AI-News] Summarised ${count} articles`);
  return count;
}

// ─── AI Article Enrichment ─────────────────────────────────

/**
 * Enrich a single article with summary, brand tags, category, and sentiment.
 * Uses Haiku model for cost efficiency. Results cached in news_ai_cache.
 */
async function enrichArticle(apiKey, article, transcript) {
  if (!apiKey || !article) return null;

  // Check if already enriched
  var cached = db.getNewsAiCache(article.id);
  if (cached && cached.enriched_summary) return {
    summary: cached.enriched_summary,
    brand_tags: cached.brand_tags ? JSON.parse(cached.brand_tags) : [],
    category_classification: cached.category_classification || 'other',
    sentiment: cached.sentiment || 'neutral',
    sentiment_score: cached.sentiment_score || 0
  };

  var contentText = '';
  var sourceType = article.category || 'rss';

  // Build content context based on source type
  if (sourceType === 'youtube' && transcript && transcript.text) {
    contentText = 'YouTube Video Title: ' + (article.title || '') +
      '\nChannel: ' + (article.sourceName || article.source || '') +
      '\nTranscript:\n' + transcript.text.slice(0, 6000);
  } else if (sourceType === 'reddit') {
    contentText = 'Reddit Post Title: ' + (article.title || '') +
      '\nSubreddit: ' + (article.source || '') +
      '\nPost Content: ' + (article.summary || '').slice(0, 2000);
    if (article.comments && article.comments.length > 0) {
      contentText += '\nTop Comments:\n' + article.comments.slice(0, 5).map(function(c) {
        return '- ' + (c.author || 'anon') + ' (score ' + (c.score || 0) + '): ' + (c.text || '').slice(0, 300);
      }).join('\n');
    }
  } else {
    contentText = 'Article Title: ' + (article.title || '') +
      '\nSource: ' + (article.sourceName || article.source || '') +
      '\nContent: ' + (article.summary || '').slice(0, 3000);
  }

  var categoryOptions = sourceType === 'youtube'
    ? '"product_review", "complaint", "education", "tutorial", "entertainment", "news", "other"'
    : sourceType === 'reddit'
    ? '"discussion", "question", "complaint", "recommendation", "news", "other"'
    : '"industry_news", "product_launch", "opinion", "research", "other"';

  var systemPrompt = 'You are a sharp coffee industry analyst writing for Beanz (Breville Group). Analyse this ' + sourceType + ' content and return valid JSON:\n' +
    '{"summary":"2-3 punchy sentences capturing the ESSENCE and INTENT — what is the key insight, opinion, or discovery? Why should a coffee business executive care? Be specific, not generic. Name products, techniques, or trends mentioned.",' +
    '"brand_tags":["only brands ACTUALLY mentioned in the text: breville, sage, lelit, baratza, beanz — omit if none"],' +
    '"category_classification":"one of: ' + categoryOptions + '",' +
    '"sentiment":"positive|negative|neutral|mixed",' +
    '"sentiment_score":"number from -1.0 (very negative) to 1.0 (very positive)"}';

  var https = require('https');

  try {
    var body = JSON.stringify({
      model: MODELS.HAIKU,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentText }]
    });

    var raw = await new Promise(function(resolve, reject) {
      var req = https.request({
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }, function(res) {
        var data = '';
        res.on('data', function(c) { data += c; });
        res.on('end', function() {
          try {
            var j = JSON.parse(data);
            if (j.content && j.content[0]) resolve(j.content[0].text);
            else if (j.error) reject(new Error(j.error.message));
            else reject(new Error('Unexpected API response'));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, function() { req.destroy(); reject(new Error('AI enrichment timeout')); });
      req.write(body);
      req.end();
    });

    var jsonMatch = raw.match(/\{[\s\S]*\}/);
    var parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed) return null;

    // Normalise brand tags to lowercase
    var brandTags = Array.isArray(parsed.brand_tags)
      ? parsed.brand_tags.map(function(b) { return (b || '').toLowerCase().trim(); }).filter(Boolean)
      : [];

    var result = {
      summary: parsed.summary || '',
      brand_tags: brandTags,
      category_classification: parsed.category_classification || 'other',
      sentiment: parsed.sentiment || 'neutral',
      sentiment_score: typeof parsed.sentiment_score === 'number' ? parsed.sentiment_score : 0
    };

    // Persist to DB
    db.upsertNewsEnrichment(article.id, {
      enrichedSummary: result.summary,
      brandTags: JSON.stringify(result.brand_tags),
      categoryClassification: result.category_classification,
      sentiment: result.sentiment,
      sentimentScore: result.sentiment_score,
      modelUsed: MODELS.HAIKU
    });

    return result;
  } catch (e) {
    console.error('[AI-News] Enrich failed for', article.id, ':', e.message);
    return null;
  }
}

/**
 * Batch enrich articles with AI analysis.
 * Skips articles that already have enrichment in the DB cache.
 * Processes sequentially with 500ms delay between calls for rate limiting.
 */
async function batchEnrichArticles(apiKey, articles, transcripts, limit) {
  if (!apiKey) return 0;
  limit = limit || 20;

  // Filter to articles without enrichment
  var cachedAll = db.getAllNewsAiCache();
  var needsEnrichment = articles
    .filter(function(a) {
      var cached = cachedAll[a.id];
      return !cached || !cached.enriched_summary;
    })
    .sort(function(a, b) { return (b.relevanceScore || 0) - (a.relevanceScore || 0); })
    .slice(0, limit);

  if (needsEnrichment.length === 0) return 0;

  console.log('[AI-News] Enriching ' + needsEnrichment.length + ' articles');
  var count = 0;

  for (var i = 0; i < needsEnrichment.length; i++) {
    var a = needsEnrichment[i];
    // Find transcript if available
    var transcript = null;
    if (a.videoId && transcripts && transcripts[a.videoId]) {
      transcript = transcripts[a.videoId];
    }

    var result = await enrichArticle(apiKey, a, transcript);
    if (result) count++;

    // Rate limit: 500ms delay between calls
    if (i < needsEnrichment.length - 1) {
      await new Promise(function(r) { setTimeout(r, 500); });
    }
  }

  console.log('[AI-News] Enriched ' + count + ' articles');
  return count;
}

// ─── Digest Generation ──────────────────────────────────────

/**
 * Load cached YouTube transcript texts for digest context.
 */
function _loadTranscriptTexts() {
  const fs = require('fs');
  const path = require('path');
  const { isTranscriptUsable } = require('./news-engine');
  const cacheDir = path.join(__dirname, '..', '..', 'news-transcripts');
  const results = [];
  try {
    if (!fs.existsSync(cacheDir)) return results;
    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf-8'));
        if (!isTranscriptUsable(data)) continue;
        results.push({
          videoId: data.videoId,
          text: data.text.slice(0, 3000),
          summary: data.aiSummary ? data.aiSummary.headline : (data.summary || '').slice(0, 300),
          duration: data.duration || 0
        });
        if (results.length >= 15) break;
      } catch { /* skip corrupt files */ }
    }
  } catch { /* ignore */ }
  return results;
}

/**
 * Generate a daily or weekly news digest (AI briefing).
 * Includes executive summary, top stories with analysis, competitor intelligence,
 * YouTube transcript insights, Reddit pulse, and recommended actions.
 */
async function generateDigest(apiKey, articles, period, forceNew, opts) {
  if (!apiKey) return null;
  period = period || 'daily';
  opts = opts || {};

  const storedPeriod = (opts.digestPrefix || '') + period;
  const digestId = storedPeriod + '-' + new Date().toISOString().slice(0, 10);

  // Check cache (re-use if generated today, unless forced)
  if (!forceNew) {
    const cached = db.getNewsDigest(digestId);
    if (cached) return JSON.parse(cached.content);
  }

  const daysBack = period === 'weekly' ? 7 : 1;
  const cutoff = Date.now() - daysBack * 86400000;
  const recent = articles
    .filter(a => new Date(a.publishedAt).getTime() > cutoff)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  if (recent.length === 0) return null;

  // Enrich with AI summaries if available
  const aiCache = db.getAllNewsAiCache();

  // Separate by category for structured context
  const industryArticles = recent.filter(a => a.category === 'industry').slice(0, 15);
  const redditPosts = recent.filter(a => a.category === 'reddit').slice(0, 15);
  const youtubeVideos = recent.filter(a => a.category === 'youtube').slice(0, 10);

  const topArticles = recent.slice(0, 25).map(a => {
    const ai = aiCache[a.id];
    return {
      title: a.title,
      source: a.sourceName || a.source,
      category: a.category,
      relevance: a.relevanceScore,
      summary: ai ? ai.exec_summary : (a.summary || '').slice(0, 300),
      impact: ai ? ai.beanz_impact : null,
      brandMentions: a.brandMentions || [],
      sentiment: a.sentiment || null
    };
  });

  // Reddit posts with comments for deeper analysis
  const redditContext = redditPosts.map(a => ({
    title: a.title,
    subreddit: a.source,
    score: a.engagement ? a.engagement.redditScore : 0,
    commentCount: a.engagement ? a.engagement.redditComments : 0,
    upvoteRatio: a.engagement ? a.engagement.upvoteRatio : 0,
    selftext: (a.summary || '').slice(0, 300),
    comments: (a.comments || []).slice(0, 5).map(c => ({ author: c.author, text: (c.text || '').slice(0, 200), score: c.score })),
    brandMentions: a.brandMentions || [],
    sentiment: a.sentiment || null
  }));

  // YouTube videos with transcript excerpts
  const transcripts = _loadTranscriptTexts();
  const ytContext = youtubeVideos.map(a => {
    const transcript = transcripts.find(t => a.videoId && t.videoId === a.videoId);
    return {
      title: a.title,
      channel: a.sourceName || a.source,
      videoId: a.videoId,
      transcriptExcerpt: transcript ? transcript.text.slice(0, 2000) : null,
      transcriptSummary: transcript ? transcript.summary : null
    };
  });

  // Detect brand mentions across all content
  const BRAND_NAMES = ['breville', 'sage', 'lelit', 'baratza', 'beanz', 'beanz.com'];
  const brandMentionArticles = recent.filter(a => {
    const text = ((a.title || '') + ' ' + (a.summary || '')).toLowerCase();
    return BRAND_NAMES.some(b => text.includes(b));
  }).map(a => ({
    title: a.title,
    source: a.sourceName || a.source,
    category: a.category,
    mentions: BRAND_NAMES.filter(b => ((a.title || '') + ' ' + (a.summary || '')).toLowerCase().includes(b))
  }));

  const { callAnthropic } = require('./ai-classifier');

  // Include article URLs, images, and enrichment data for rich digest
  const enrichedArticles = recent.slice(0, 40).map(a => {
    const ai = aiCache[a.id];
    return {
      title: a.title,
      url: a.url || '',
      image: a.image || '',
      source: a.sourceName || a.source,
      category: a.category,
      summary: ai && ai.enriched_summary ? ai.enriched_summary : (ai ? ai.exec_summary : (a.summary || '').slice(0, 300)),
      sentiment: ai ? ai.sentiment : (a.sentiment || null),
      brand_tags: ai && ai.brand_tags ? (function() { try { return JSON.parse(ai.brand_tags); } catch { return []; } })() : [],
      classification: ai ? ai.category_classification : null,
      videoId: a.videoId || null,
      engagement: a.engagement || {}
    };
  });

  const _digestContext = opts.context || BEANZ_CONTEXT;
  const _digestRole = opts.role || 'You are a brilliant coffee industry journalist writing an engaging, shareable daily briefing for Ziv Shalev, GM of Beanz (Breville Group). ';
  const systemPrompt = _digestRole + _digestContext +
    '\n\nWrite a FUN, engaging, magazine-style briefing. Think Morning Brew meets coffee geek newsletter. Use a conversational but smart tone. Be specific — name products, brands, price points, techniques.' +
    '\n\nRespond with valid JSON matching this schema:\n' +
    '{\n' +
    '  "headline": "Catchy, punchy headline for the entire briefing (think newsletter subject line)",\n' +
    '  "executive_summary": "4-5 sentences in a conversational, engaging tone. Set the scene. What happened today/this week that matters? Lead with the most interesting thing.",\n' +
    '  "top_stories": [{\n' +
    '    "title": "Story headline",\n' +
    '    "url": "article URL from the data",\n' +
    '    "image": "article image URL if available",\n' +
    '    "source": "source name",\n' +
    '    "analysis": "3-5 sentences of engaging analysis. What happened? Why does it matter? What is the angle?",\n' +
    '    "quote": "A notable quote or stat pulled from the article/video/thread — put in quotation marks",\n' +
    '    "beanz_relevance": "1-2 sentences on what this means for Beanz specifically"\n' +
    '  }],\n' +
    '  "product_spotlight": [{"product": "Product name", "brand": "Brand", "sentiment": "positive|negative|mixed", "what_people_say": "2-3 sentences summarising what users/reviewers are saying", "url": "link if available"}],\n' +
    '  "complaints_radar": [{"brand": "Brand name", "issue": "The complaint in one sentence", "severity": "low|medium|high", "source_quote": "Exact quote from user/reviewer", "thread_url": "link"}],\n' +
    '  "competitor_watch": [{"brand": "Breville|Sage|Lelit|Baratza|etc", "sentiment": "positive|negative|neutral", "summary": "2-3 sentences — what are they doing? What is the community saying?", "mentions": ["specific article/thread titles"]}],\n' +
    '  "youtube_insights": [{"title": "video title", "channel": "channel name", "videoId": "for embed link", "sentiment": "positive|negative|neutral|mixed", "summary": "3-4 engaging sentences about what the video reveals — be specific about opinions, products tested, recommendations", "standout_quote": "A memorable quote from the video transcript", "beanz_relevance": "1 sentence"}],\n' +
    '  "reddit_pulse": {\n' +
    '    "summary": "3-4 sentences painting a picture of what the coffee community is buzzing about",\n' +
    '    "trending_topics": ["topic1", "topic2"],\n' +
    '    "hot_threads": [{"title": "thread title", "subreddit": "subreddit", "url": "thread url", "upvotes": 0, "insight": "Why this matters — be specific", "top_comment_quote": "Best/most insightful comment from the thread"}],\n' +
    '    "brand_mentions": [{"brand": "Breville", "context": "What was said and where", "sentiment": "positive|negative|mixed"}]\n' +
    '  },\n' +
    '  "trends": [{"trend": "Trend name", "description": "2 sentences explaining the trend and why it matters", "evidence": "Where you spotted it"}],\n' +
    '  "innovation_corner": "1-2 sentences about the most innovative thing you spotted in the data — a new product, technique, business model, or idea",\n' +
    '  "recommended_actions": ["Specific, actionable recommendation with context on WHY"]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Be SPECIFIC — name products (e.g. "Gaggia Classic UP"), prices, conversion rates, not vague generalities\n' +
    '- Include REAL URLs from the article data for every story, video, and thread\n' +
    '- Include image URLs where available for stories\n' +
    '- Pull ACTUAL QUOTES from transcripts and Reddit comments — put them in quotation marks\n' +
    '- competitor_watch MUST cover Breville/Sage, Lelit, Baratza, and any other brand with significant mentions\n' +
    '- complaints_radar: find genuine product complaints from Reddit or video reviews — these are gold for product teams\n' +
    '- product_spotlight: highlight products getting attention (positive or negative)\n' +
    '- trends: identify 2-3 emerging trends from the data\n' +
    '- Make it fun, engaging, and shareable — this goes to the exec team and gets posted on Slack\n' +
    '- Return 5-8 top_stories, 2-4 product_spotlight, 2-4 complaints_radar, 3-5 youtube_insights, 3-5 reddit hot_threads, 2-3 trends, 3-5 recommended_actions';

  const userMsg = `Generate a ${period} briefing. Today is ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.\n\n` +
    `=== ALL ARTICLES WITH ENRICHMENT (${enrichedArticles.length}) ===\n${JSON.stringify(enrichedArticles, null, 1)}\n\n` +
    `=== REDDIT POSTS WITH COMMENTS (${redditContext.length}) ===\n${JSON.stringify(redditContext, null, 1)}\n\n` +
    `=== YOUTUBE VIDEOS WITH TRANSCRIPTS (${ytContext.length}) ===\n${JSON.stringify(ytContext, null, 1)}\n\n` +
    (brandMentionArticles.length > 0 ? `=== BRAND MENTIONS (${brandMentionArticles.length}) ===\n${JSON.stringify(brandMentionArticles, null, 1)}\n` : '');

  try {
    const raw = await callAnthropic(apiKey, systemPrompt, userMsg, 8000);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const digest = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!digest) return null;

    db.upsertNewsDigest(digestId, storedPeriod, JSON.stringify(digest), recent.length, MODELS.OPUS);
    console.log(`[AI-News] Digest generated: ${digestId}`);
    return digest;
  } catch (e) {
    console.error('[AI-News] Digest generation failed:', e.message);
    return null;
  }
}

// ─── Topic Extraction ───────────────────────────────────────

const TOPIC_STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'from', 'with', 'they', 'been', 'this', 'that', 'will', 'each', 'make', 'like', 'just', 'new', 'more', 'also', 'than', 'how', 'its', 'what', 'about', 'which', 'when', 'your']);

/**
 * Extract topics from articles and store daily counts.
 */
function extractAndTrackTopics(articles, prefix) {
  prefix = prefix ? prefix + ':' : '';
  const today = new Date().toISOString().slice(0, 10);
  const topicCounts = {};

  // Extract from AI-cached topics first
  const aiCache = db.getAllNewsAiCache();

  for (const a of articles) {
    const ai = aiCache[a.id];
    let topics = [];

    if (ai && ai.topics) {
      try { topics = JSON.parse(ai.topics); } catch { /* ignore */ }
    }

    if (topics.length === 0) {
      // Fallback: extract from title
      topics = (a.title || '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !TOPIC_STOP.has(w));
      // Bigrams
      const words = topics;
      const bigrams = [];
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(words[i] + ' ' + words[i + 1]);
      }
      topics = [...bigrams.slice(0, 2), ...words.slice(0, 3)];
    }

    topics.forEach(t => {
      const key = typeof t === 'string' ? t.toLowerCase().trim() : '';
      if (key.length > 2) topicCounts[key] = (topicCounts[key] || 0) + 1;
    });
  }

  // Store in DB — only topics with 2+ mentions
  let stored = 0;
  for (const [topic, count] of Object.entries(topicCounts)) {
    if (count >= 2) {
      db.upsertNewsTopic(prefix + topic, count, today);
      stored++;
    }
  }

  return { date: today, topicsStored: stored, totalTopics: Object.keys(topicCounts).length };
}

/**
 * Get trending topics with week-over-week deltas.
 */
function getTrendingTopics(days, prefix) {
  days = days || 14;
  prefix = prefix || '';
  const raw = db.getNewsTopicTrends(days);

  // Group by topic, filter by prefix
  const byTopic = {};
  for (const r of raw) {
    // Filter: if prefix given, only include topics with that prefix; strip prefix for display
    if (prefix) {
      if (!r.topic.startsWith(prefix + ':')) continue;
      var displayTopic = r.topic.slice(prefix.length + 1);
      if (!byTopic[displayTopic]) byTopic[displayTopic] = { topic: displayTopic, total: 0, daily: {} };
      byTopic[displayTopic].total += r.count;
      byTopic[displayTopic].daily[r.snapshot_date] = r.count;
    } else {
      // No prefix — only include topics WITHOUT a prefix (coffee/default)
      if (r.topic.includes(':')) continue;
      if (!byTopic[r.topic]) byTopic[r.topic] = { topic: r.topic, total: 0, daily: {} };
      byTopic[r.topic].total += r.count;
      byTopic[r.topic].daily[r.snapshot_date] = r.count;
    }
  }

  // Compute trends
  const today = new Date();
  const thisWeek = [];
  const lastWeek = [];
  for (let i = 0; i < 7; i++) {
    thisWeek.push(new Date(today - i * 86400000).toISOString().slice(0, 10));
    lastWeek.push(new Date(today - (i + 7) * 86400000).toISOString().slice(0, 10));
  }

  const results = Object.values(byTopic).map(t => {
    const thisWeekCount = thisWeek.reduce((s, d) => s + (t.daily[d] || 0), 0);
    const lastWeekCount = lastWeek.reduce((s, d) => s + (t.daily[d] || 0), 0);
    const delta = lastWeekCount > 0 ? Math.round((thisWeekCount - lastWeekCount) / lastWeekCount * 100) : (thisWeekCount > 0 ? 100 : 0);
    const status = lastWeekCount === 0 && thisWeekCount > 0 ? 'emerging' :
                   delta > 50 ? 'trending' :
                   delta < -30 ? 'declining' : 'stable';
    return { topic: t.topic, total: t.total, thisWeek: thisWeekCount, lastWeek: lastWeekCount, delta, status };
  }).sort((a, b) => b.thisWeek - a.thisWeek);

  return {
    topics: results.slice(0, 30),
    emerging: results.filter(t => t.status === 'emerging').slice(0, 10),
    trending: results.filter(t => t.status === 'trending').slice(0, 10),
    declining: results.filter(t => t.status === 'declining').slice(0, 10)
  };
}

// ─── Competitor Alert Detection ─────────────────────────────

/**
 * Scan articles for competitor mentions and generate alerts.
 */
function detectCompetitorAlerts(articles) {
  const alerts = [];
  const pricingRe = /price|pricing|cost|discount|offer|deal|sale|subscription.*\$/i;
  const launchRe = /launch|release|announce|unveil|introduce|new product|new machine/i;
  const partnerRe = /partner|collaborat|acquisition|acquire|merger/i;

  for (const a of articles) {
    const text = (a.title + ' ' + (a.summary || '')).toLowerCase();
    const matchedCompetitors = COMPETITORS.filter(c => text.includes(c.toLowerCase()));

    for (const comp of matchedCompetitors) {
      let severity = 'info';
      let alertType = 'mention';

      if (pricingRe.test(text)) { severity = 'critical'; alertType = 'pricing'; }
      else if (launchRe.test(text)) { severity = 'critical'; alertType = 'product_launch'; }
      else if (partnerRe.test(text)) { severity = 'warning'; alertType = 'partnership'; }
      else { severity = 'info'; alertType = 'general_mention'; }

      alerts.push({
        competitor: comp,
        severity,
        title: a.title,
        articleId: a.id,
        alertType
      });
    }
  }

  // Persist new alerts (deduplicate by article_id)
  const existing = new Set(db.getCompetitorAlerts(14).map(a => a.article_id));
  let newCount = 0;
  for (const alert of alerts) {
    if (!existing.has(alert.articleId)) {
      db.insertCompetitorAlert(alert);
      existing.add(alert.articleId);
      newCount++;
    }
  }

  if (newCount > 0) console.log(`[AI-News] ${newCount} new competitor alerts detected`);
  return { newAlerts: newCount, totalAlerts: alerts.length };
}

module.exports = {
  summariseArticle,
  batchSummariseTopArticles,
  enrichArticle,
  batchEnrichArticles,
  generateDigest,
  extractAndTrackTopics,
  getTrendingTopics,
  detectCompetitorAlerts,
  COMPETITOR_RE
};
