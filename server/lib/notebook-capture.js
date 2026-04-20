'use strict';

/**
 * notebook-capture.js
 *
 * Universal content fetchers for the "Save to notebook" feature.
 * Every source tab (news, comms, chat, metrics…) funnels through this
 * module to produce a rich `source` record with FULL content — video
 * transcripts, full email bodies, complete slack threads, etc.
 *
 *   captureToNotebook(notebookId, { sourceType, ref, overrideTitle?, includeTranscript? }, ctx)
 *     → { source, contentBytes, kind }
 *
 * Each sourceType has a dedicated fetcher that returns:
 *   { kind, title, url, contentText, metadata }
 * — then the caller persists it via notebook-store.addSource + chunks it.
 */

const fs = require('fs');
const path = require('path');
const { readJSON } = require('./helpers');

const store = require('./notebook-store');
const ingest = require('./notebook-ingest');

// ─── Helpers ─────────────────────────────────────────────────
function clean(str) {
  if (!str) return '';
  // Strip HTML tags for plain text storage (keep inline anchors)
  return String(str)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readJSONSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ─── News Article ────────────────────────────────────────────
function fetchNewsArticle(ctx, ref) {
  const articleId = ref.articleId || ref.id;
  if (!articleId) throw new Error('articleId required');

  const stores = [ctx.newsStore, ctx.techNewsStore].filter(Boolean);
  let article = null;
  for (const p of stores) {
    const store = readJSONSafe(p);
    if (!store || !Array.isArray(store.articles)) continue;
    article = store.articles.find(a => a && a.id === articleId);
    if (article) break;
  }
  if (!article) throw new Error('Article not found in news or tech-news stores: ' + articleId);

  const summary = article.aiEnrichedSummary || article.aiSummary || article.summary || '';
  const parts = [];
  parts.push('# ' + (article.title || 'Untitled article'));
  parts.push('');
  parts.push('**Source:** ' + (article.sourceName || article.source || 'unknown'));
  if (article.author) parts.push('**Author:** ' + article.author);
  if (article.publishedAt) parts.push('**Published:** ' + article.publishedAt);
  if (article.category) parts.push('**Category:** ' + article.category);
  if (article.sentiment) parts.push('**Sentiment:** ' + article.sentiment);
  if (article.relevanceScore != null) parts.push('**Relevance:** ' + Math.round(article.relevanceScore * 100) + '%');
  if (article.brand_tags && article.brand_tags.length) parts.push('**Brands:** ' + article.brand_tags.join(', '));
  if (article.tags && article.tags.length) parts.push('**Tags:** ' + article.tags.slice(0, 10).join(', '));
  if (article.url) parts.push('**URL:** ' + article.url);
  parts.push('');
  if (summary) {
    parts.push('## Summary');
    parts.push(clean(summary));
    parts.push('');
  }
  if (article.fullText || article.content) {
    parts.push('## Full text');
    parts.push(clean(article.fullText || article.content));
    parts.push('');
  }
  if (article.comments && Array.isArray(article.comments) && article.comments.length) {
    parts.push('## Top comments');
    article.comments.slice(0, 20).forEach((c, i) => {
      parts.push('### Comment ' + (i + 1) + (c.author ? ' — @' + c.author : ''));
      parts.push(clean(c.text || c.body || ''));
      parts.push('');
    });
  }

  return {
    kind: 'news_article',
    title: article.title || 'Untitled article',
    url: article.url,
    contentText: parts.join('\n'),
    metadata: {
      articleId: article.id,
      sourceName: article.sourceName || article.source,
      category: article.category,
      publishedAt: article.publishedAt,
      capturedAt: new Date().toISOString(),
      sentiment: article.sentiment,
      relevance: article.relevanceScore,
      brand_tags: article.brand_tags || [],
      videoId: article.videoId || null
    }
  };
}

// ─── News Video (YouTube transcript) ─────────────────────────
function fetchNewsVideo(ctx, ref) {
  const videoId = ref.videoId;
  if (!videoId) throw new Error('videoId required');

  // First, find the source article (if any) for metadata
  const stores = [ctx.newsStore, ctx.techNewsStore].filter(Boolean);
  let article = null;
  for (const p of stores) {
    const snap = readJSONSafe(p);
    if (!snap || !Array.isArray(snap.articles)) continue;
    article = snap.articles.find(a => a && a.videoId === videoId);
    if (article) break;
  }

  // Load transcript from news-transcripts/<videoId>.json
  const transcriptPath = path.join(__dirname, '..', '..', 'news-transcripts', videoId + '.json');
  const transcript = readJSONSafe(transcriptPath);

  const title = (article && article.title) || (transcript && transcript.title) || ('YouTube video ' + videoId);
  const url = (article && article.url) || ('https://youtube.com/watch?v=' + videoId);

  const parts = [];
  parts.push('# 🎬 ' + title);
  parts.push('');
  parts.push('**Source:** ' + ((article && (article.sourceName || article.source)) || 'YouTube'));
  if (article && article.author) parts.push('**Channel:** ' + article.author);
  if (article && article.publishedAt) parts.push('**Published:** ' + article.publishedAt);
  if (article && article.engagement && article.engagement.youtubeViews) {
    parts.push('**Views:** ' + article.engagement.youtubeViews.toLocaleString());
  }
  parts.push('**URL:** ' + url);
  if (transcript && transcript.durationSeconds) {
    const mins = Math.round(transcript.durationSeconds / 60);
    parts.push('**Duration:** ~' + mins + ' min');
  }
  if (transcript && transcript.language) parts.push('**Language:** ' + transcript.language);
  parts.push('');

  const summary = (article && (article.aiEnrichedSummary || article.aiSummary || article.summary)) ||
                  (transcript && transcript.aiSummary && transcript.aiSummary.summary) || '';
  if (summary) {
    parts.push('## Summary');
    parts.push(clean(summary));
    parts.push('');
  }

  if (transcript && transcript.aiSummary && typeof transcript.aiSummary === 'object') {
    const ai = transcript.aiSummary;
    if (ai.keyPoints && ai.keyPoints.length) {
      parts.push('## Key points');
      ai.keyPoints.forEach(k => parts.push('- ' + k));
      parts.push('');
    }
    if (ai.takeaways && ai.takeaways.length) {
      parts.push('## Takeaways');
      ai.takeaways.forEach(k => parts.push('- ' + k));
      parts.push('');
    }
  }

  if (transcript && transcript.text) {
    parts.push('## Full transcript');
    parts.push('');
    parts.push(transcript.text.trim());
  } else {
    parts.push('## Transcript');
    parts.push('_No transcript cached for this video. Open the video detail view and wait for transcription, or retry._');
  }

  return {
    kind: 'news_video',
    title: title,
    url: url,
    contentText: parts.join('\n'),
    metadata: {
      videoId,
      articleId: article ? article.id : null,
      sourceName: (article && (article.sourceName || article.source)) || 'YouTube',
      publishedAt: article ? article.publishedAt : (transcript && transcript.fetchedAt) || null,
      hasTranscript: !!(transcript && transcript.text),
      transcriptChars: transcript && transcript.text ? transcript.text.length : 0,
      capturedAt: new Date().toISOString()
    }
  };
}

// ─── Email / Slack Thread (from comms-live.json) ─────────────
function fetchCommsThread(ctx, ref) {
  const threadId = ref.threadId;
  if (!threadId) throw new Error('threadId required');

  const commsPath = ctx.commsLivePath || path.join(ctx.intelDir, 'comms-live.json');
  const store = readJSONSafe(commsPath);
  if (!store || !store.threads) throw new Error('comms-live.json missing or empty');
  const th = store.threads[threadId];
  if (!th) throw new Error('Thread not found: ' + threadId);

  const isSlack = (th.sources || []).includes('slack');
  const parts = [];

  parts.push('# ' + (isSlack ? '💬 ' : '📧 ') + (th.subject || '(no subject)'));
  parts.push('');
  parts.push('**Source:** ' + (isSlack ? 'Slack ' + (th.slackChannelName ? '(#' + th.slackChannelName + ')' : '') : 'Outlook email'));
  if (th.people && th.people.length) parts.push('**Participants:** ' + th.people.filter(Boolean).slice(0, 10).join(', '));
  if (th.aiCategory) parts.push('**Category:** ' + th.aiCategory);
  if (th.aiPriority) parts.push('**Priority:** ' + th.aiPriority);
  if (th.aiProjectTags && th.aiProjectTags.length) parts.push('**Projects:** ' + th.aiProjectTags.join(', '));
  if (th.lastActivity) parts.push('**Last activity:** ' + th.lastActivity);
  if (th.threadCount) parts.push('**Message count:** ' + th.threadCount);
  parts.push('');

  const messages = th.messages || [];
  if (messages.length) {
    parts.push('## ' + messages.length + ' message' + (messages.length > 1 ? 's' : ''));
    parts.push('');
    messages.forEach((m, i) => {
      const sender = m.sender || m.from || 'Unknown';
      const time = m.time || m.receivedDateTime || m.sentDateTime || '';
      const body = m.fullBody || m.body || m.text || m.snippet || '';
      parts.push('### ' + (i + 1) + '. ' + sender + (time ? ' · ' + time : ''));
      if (isSlack) {
        if (m.isParent && m.replyCount) parts.push('_(parent with ' + m.replyCount + ' replies)_');
        if (m.isReply) parts.push('_(reply)_');
      }
      parts.push('');
      parts.push(clean(body));
      parts.push('');
    });
  }

  // AI summary / quick replies if available
  if (th.aiSummary) {
    parts.push('## AI summary');
    parts.push(clean(th.aiSummary));
    parts.push('');
  }
  if (th.aiQuickReplies && th.aiQuickReplies.length) {
    parts.push('## Suggested replies (from AI)');
    th.aiQuickReplies.forEach(r => parts.push('- ' + (typeof r === 'string' ? r : r.text || JSON.stringify(r))));
    parts.push('');
  }

  return {
    kind: isSlack ? 'slack_thread' : 'email_thread',
    title: th.subject || (isSlack ? 'Slack thread' : 'Email thread'),
    url: null,
    contentText: parts.join('\n'),
    metadata: {
      threadId,
      source: isSlack ? 'slack' : 'email',
      slackChannel: th.slackChannelName || null,
      participants: th.people || [],
      category: th.aiCategory || null,
      priority: th.aiPriority || null,
      messageCount: messages.length,
      capturedAt: new Date().toISOString()
    }
  };
}

// ─── Chat message ────────────────────────────────────────────
function fetchChatMessage(ctx, ref) {
  // ref: { role, content, context?, timestamp, title? }
  const content = ref.content;
  if (!content) throw new Error('content required for chat_message');

  const parts = [];
  parts.push('# ' + (ref.title || '💬 Chat excerpt'));
  parts.push('');
  parts.push('**Role:** ' + (ref.role || 'assistant'));
  if (ref.timestamp) parts.push('**Time:** ' + ref.timestamp);
  if (ref.model) parts.push('**Model:** ' + ref.model);
  parts.push('');
  if (ref.userQuestion) {
    parts.push('## Question');
    parts.push(clean(ref.userQuestion));
    parts.push('');
  }
  parts.push('## Response');
  parts.push(clean(content));
  if (ref.sources && ref.sources.length) {
    parts.push('');
    parts.push('## Cited sources');
    ref.sources.forEach((s, i) => {
      parts.push('- [' + (i + 1) + '] ' + (s.title || s) + (s.url ? ' — ' + s.url : ''));
    });
  }

  return {
    kind: 'chat_message',
    title: ref.title || ('Chat · ' + (ref.userQuestion ? ref.userQuestion.slice(0, 60) : 'response')),
    url: null,
    contentText: parts.join('\n'),
    metadata: {
      role: ref.role,
      model: ref.model,
      timestamp: ref.timestamp || new Date().toISOString(),
      userQuestion: ref.userQuestion || null,
      capturedAt: new Date().toISOString()
    }
  };
}

// ─── Metrics snapshot (full live data JSON or named view) ────
function fetchMetricsSnapshot(ctx, ref) {
  const view = (ref.view || 'full').toLowerCase();
  const metricsPath = path.join(ctx.intelDir, 'metrics-live.json');
  const snap = readJSONSafe(metricsPath);
  if (!snap) throw new Error('metrics-live.json not found');

  const live = snap.live || {};
  const parts = [];
  parts.push('# 📊 Beanz Metrics Snapshot');
  parts.push('');
  parts.push('**View:** ' + view);
  parts.push('**Generated:** ' + (snap.generated_at || new Date().toISOString()));
  parts.push('**Source:** ' + (snap.source || 'databricks'));
  if (live.refreshedAt) parts.push('**Live data refreshed:** ' + live.refreshedAt);
  parts.push('');

  if (view === 'dashboard' || view === 'full') {
    if (live.yesterday) {
      parts.push('## Yesterday pulse');
      parts.push('- Revenue: $' + ((live.yesterday.revenue || 0).toLocaleString()) + ' AUD');
      parts.push('- Bags: ' + (live.yesterday.bags || 0).toLocaleString());
      parts.push('- KG: ' + (live.yesterday.kg || 0));
      parts.push('- Orders: ' + (live.yesterday.orders || 0).toLocaleString());
      if (live.yesterday.aov) parts.push('- AOV: $' + live.yesterday.aov);
      parts.push('');
    }
    if (live.mtd) {
      parts.push('## Month-to-date');
      parts.push('- Revenue: $' + ((live.mtd.revenue || 0).toLocaleString()) + ' AUD');
      parts.push('- Bags: ' + (live.mtd.bags || 0).toLocaleString());
      parts.push('- KG: ' + (live.mtd.kg || 0).toLocaleString());
      parts.push('');
    }
    if (live.activeSubs) {
      parts.push('## Subscriptions');
      parts.push('- Active + paused: ' + (live.activeSubs.active_total || 0).toLocaleString());
      parts.push('- Active: ' + (live.activeSubs.active || 0).toLocaleString());
      parts.push('- Paused: ' + (live.activeSubs.paused || 0).toLocaleString());
      parts.push('- New (30d): +' + (live.activeSubs.new_30d || 0).toLocaleString());
      parts.push('- Cancelled (30d): -' + (live.activeSubs.cancelled_30d || 0).toLocaleString());
      parts.push('- Net 30d: ' + ((live.activeSubs.new_30d || 0) - (live.activeSubs.cancelled_30d || 0)));
      parts.push('');
    }
    if (live.marketMTD && live.marketMTD.length) {
      parts.push('## Revenue by market (MTD)');
      live.marketMTD.forEach(m => {
        parts.push('- **' + m.Country + ':** $' + (m.revenue || 0).toLocaleString() + ' · ' + (m.bags || 0).toLocaleString() + ' bags');
      });
      parts.push('');
    }
    if (live.topRoasters && live.topRoasters.length) {
      parts.push('## Top roasters (MTD)');
      live.topRoasters.slice(0, 10).forEach(r => {
        parts.push('- **' + r.VendorName + ':** $' + (r.revenue || 0).toLocaleString() + ' · ' + (r.bags || 0) + ' bags');
      });
      parts.push('');
    }
    if (live.ftbpPrograms && live.ftbpPrograms.length) {
      parts.push('## FTBP program breakdown');
      live.ftbpPrograms.forEach(p => {
        parts.push('- **' + p.program + ':** $' + (p.revenue || 0).toLocaleString() + ' · ' + (p.bags || 0).toLocaleString() + ' bags · ' + (p.orders || 0).toLocaleString() + ' orders');
      });
      parts.push('');
    }
    if (live.pbb && live.pbb.length) {
      parts.push('## PBB (Powered by Beanz)');
      live.pbb.forEach(p => parts.push('- **' + p.StoreCode + '** (' + p.Country + '): $' + (p.revenue || 0).toLocaleString() + ' · ' + (p.bags || 0) + ' bags'));
      parts.push('');
    }
    if (live.sla30 && live.sla30.length) {
      parts.push('## Shipment SLA (30d)');
      live.sla30.forEach(s => parts.push('- **' + s.COUNTRY + ':** ' + (s.shipments || 0).toLocaleString() + ' shipments · avg ' + (s.avg_lead_time || 0) + 'd · p95 ' + (s.p95_lead_time || 0) + 'd'));
      parts.push('');
    }
    if (live.cancellationReasons && live.cancellationReasons.length) {
      parts.push('## Top cancellation reasons (30d)');
      live.cancellationReasons.forEach(r => parts.push('- ' + r.reason + ' — ' + r.cases + ' cases'));
      parts.push('');
    }
    if (live.mom && live.mom.length) {
      parts.push('## Month-over-month');
      live.mom.forEach(m => parts.push('- **' + (m.label || m.period) + ':** $' + (m.revenue || 0).toLocaleString() + ' · ' + (m.bags || 0).toLocaleString() + ' bags'));
      parts.push('');
    }
    if (live.daily30 && live.daily30.length) {
      parts.push('## Daily revenue (last 30 days)');
      parts.push('| Day | Revenue | Bags |');
      parts.push('| --- | --- | --- |');
      live.daily30.forEach(d => parts.push('| ' + d.day + ' | $' + (d.revenue || 0).toLocaleString() + ' | ' + (d.bags || 0) + ' |'));
      parts.push('');
    }
  }

  if (view === 'email' || view === 'full') {
    if (live.emailByCategory && live.emailByCategory.length) {
      parts.push('## Email performance by category (30d)');
      parts.push('| Category | Sends | Opens | Open% | Clicks | CTR | Unsubs |');
      parts.push('| --- | --- | --- | --- | --- | --- | --- |');
      live.emailByCategory.forEach(c => {
        parts.push('| ' + c.category + ' | ' + (c.unique_sends || 0).toLocaleString() + ' | ' + (c.unique_opens || 0).toLocaleString() + ' | ' + (c.open_rate || 0) + '% | ' + (c.unique_clicks || 0).toLocaleString() + ' | ' + (c.ctr || 0) + '% | ' + (c.unique_unsubs || 0) + ' |');
      });
      parts.push('');
    }
  }

  if (view === 'cohort' || view === 'full') {
    if (live.cohortRetention && live.cohortRetention.length) {
      parts.push('## Cohort retention');
      parts.push('| Cohort | Size | M1% | M2% | M3% | M4% | M5% | M6% |');
      parts.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      live.cohortRetention.forEach(c => {
        parts.push('| ' + c.CohortMonth + ' | ' + c.cohort_size + ' | ' + c.m1_pct + ' | ' + c.m2_pct + ' | ' + c.m3_pct + ' | ' + c.m4_pct + ' | ' + c.m5_pct + ' | ' + c.m6_pct + ' |');
      });
      parts.push('');
    }
  }

  // Raw JSON for reproducibility
  parts.push('## Raw snapshot (JSON)');
  parts.push('```json');
  parts.push(JSON.stringify({
    generated_at: snap.generated_at,
    live: live
  }, null, 2).slice(0, 30000));
  parts.push('```');

  return {
    kind: 'dashboard_snapshot',
    title: 'Metrics snapshot · ' + view + ' · ' + (new Date().toISOString().slice(0, 10)),
    url: null,
    contentText: parts.join('\n'),
    metadata: {
      view,
      generatedAt: snap.generated_at,
      source: snap.source,
      capturedAt: new Date().toISOString()
    }
  };
}

// ─── Generic custom (rich client-side data) ──────────────────
function fetchCustom(ctx, ref) {
  // Client supplies already-formatted content — used as a fallback
  // so any tab can save something without a dedicated fetcher.
  const contentText = ref.contentText || ref.text || '';
  if (!contentText) throw new Error('contentText required for custom source');
  return {
    kind: ref.kind || 'custom',
    title: ref.title || 'Captured from Beanz OS',
    url: ref.url || null,
    contentText,
    metadata: Object.assign({ capturedAt: new Date().toISOString() }, ref.metadata || {})
  };
}

// ─── Dispatch ────────────────────────────────────────────────
const FETCHERS = {
  news_article: fetchNewsArticle,
  news_video: fetchNewsVideo,
  email_thread: fetchCommsThread,
  slack_thread: fetchCommsThread,
  comms_thread: fetchCommsThread,
  chat_message: fetchChatMessage,
  metrics_snapshot: fetchMetricsSnapshot,
  dashboard_snapshot: fetchMetricsSnapshot,
  custom: fetchCustom
};

function captureToNotebook(notebookId, body, ctx) {
  if (!notebookId) throw new Error('notebookId required');
  const sourceType = body.sourceType;
  if (!sourceType) throw new Error('sourceType required');
  const fetcher = FETCHERS[sourceType];
  if (!fetcher) throw new Error('Unknown sourceType: ' + sourceType + '. Known: ' + Object.keys(FETCHERS).join(', '));

  const fetched = fetcher(ctx, body.ref || {});
  const title = body.overrideTitle || fetched.title;

  const source = store.addSource(notebookId, {
    kind: fetched.kind,
    title,
    url: fetched.url,
    contentText: fetched.contentText,
    metadata: fetched.metadata
  });

  // Chunk for RAG — so saved items are query-able via notebook chat
  if (source && source.content_text) {
    try {
      const chunks = ingest.chunkText(source.content_text);
      store.upsertChunks(source.id, notebookId, chunks);
    } catch (e) {
      // non-fatal — source is saved even if chunking fails
    }
  }

  return { source, contentBytes: (fetched.contentText || '').length, kind: fetched.kind };
}

module.exports = { captureToNotebook, FETCHERS };
