#!/usr/bin/env node
/**
 * Beanz OS — Standalone News Refresh Script
 * Runs independently via Windows Task Scheduler for daily news fetching.
 * Shares the same news-store.json and learning-store.json as server.js.
 *
 * Usage:
 *   node news-refresh.js              → Full refresh (all sources)
 *   node news-refresh.js --quiet      → Suppress console output (for scheduled runs)
 *   node news-refresh.js --sources rss,reddit  → Refresh specific sources only
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────
const DIR = __dirname;
const NEWS_STORE = path.join(DIR, 'news-store.json');
const LOG_FILE = path.join(DIR, 'news-refresh.log');

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const sourcesArg = args.find(a => a.startsWith('--sources'));
const SOURCES_FILTER = sourcesArg
  ? args[args.indexOf(sourcesArg) + 1]?.split(',') || ['rss', 'reddit', 'youtube']
  : ['rss', 'reddit', 'youtube'];

const NEWS_SOURCES = {
  rss: {
    dailycoffeenews: { url: 'https://dailycoffeenews.com/feed/', name: 'Daily Coffee News' },
    sprudge:         { url: 'https://www.sprudge.com/feed', name: 'Sprudge' },
    perfectdaily:    { url: 'https://perfectdailygrind.com/feed/', name: 'Perfect Daily Grind' },
    worldcoffeeportal: { url: 'https://www.worldcoffeeportal.com/rss/whats-new', name: 'World Coffee Portal' },
    baristamagazine: { url: 'https://www.baristamagazine.com/feed/', name: 'Barista Magazine' }
  },
  reddit: {
    coffee:   { subreddit: 'coffee', name: 'r/coffee' },
    espresso: { subreddit: 'espresso', name: 'r/espresso' },
    roasting: { subreddit: 'roasting', name: 'r/roasting' }
  },
  youtube: {
    jameshoffmann: { channelId: 'UCMb0O2CdPBNi-QqPk5T3gsQ', name: 'James Hoffmann' },
    lancehedrick:  { channelId: 'UCkJLqoZ2TqFo_qxKgboEIaQ', name: 'Lance Hedrick' },
    sprometheus:   { channelId: 'UCMUNsUoMiGEBUDIgjRFx8DA', name: 'Sprometheus' }
  },
  competitors: {
    tradedrink: { url: 'https://tradedrink.com', name: 'Trade Drink', type: 'competitor' },
    ninja:      { url: 'https://www.ninjakitchen.com', name: 'Ninja', type: 'competitor' },
    delonghi:   { url: 'https://www.delonghi.com', name: "De'Longhi", type: 'competitor' }
  }
};

// ─── Logging ─────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  if (!QUIET) console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

// ─── Store helpers ───────────────────────────────────────────
function loadNewsStore() {
  const defaults = {
    version: 1, lastRefreshed: null,
    articles: [], competitorAlerts: [], stats: {},
    sourceStatus: {}
  };
  try {
    const raw = fs.readFileSync(NEWS_STORE, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}

function saveNewsStore(store) {
  store.lastRefreshed = new Date().toISOString();
  fs.writeFileSync(NEWS_STORE, JSON.stringify(store, null, 2), 'utf-8');
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ─── HTTP helper ─────────────────────────────────────────────
function httpGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: 'GET',
      headers: { 'User-Agent': 'BeanzOS/1.0 NewsAggregator', ...headers },
      rejectUnauthorized: false // Corporate proxy SSL
    };
    const req = mod.request(options, res => {
      if ([301, 302, 307].includes(res.statusCode) && res.headers.location) {
        return httpGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode === 304) return resolve('');
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ─── RSS Parser ──────────────────────────────────────────────
function parseRSSXml(xml, sourceKey, sourceName) {
  const articles = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ||
                xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  items.slice(0, 20).forEach(item => {
    const getTag = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const title = getTag('title');
    let link = getTag('link');
    if (!link) {
      const hrefMatch = item.match(/<link[^>]+href\s*=\s*"([^"]+)"/i);
      if (hrefMatch) link = hrefMatch[1];
    }
    const desc = getTag('description') || getTag('summary') || getTag('content');
    const pubDate = getTag('pubDate') || getTag('published') || getTag('updated') || getTag('dc:date');
    const author = getTag('author') || getTag('dc:creator');
    const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 300);
    if (!title) return;

    const id = 'news-' + sourceKey + '-' + slugify(title).slice(0, 40);
    articles.push({
      id, title, url: link.trim(), source: sourceKey, sourceName: sourceName || sourceKey,
      category: 'industry', author: author.replace(/<[^>]+>/g, '').trim(),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      fetchedAt: new Date().toISOString(), summary: cleanDesc,
      tags: [], relevanceScore: 0.5, engagement: {}
    });
  });
  return articles;
}

// ─── Source Fetchers ─────────────────────────────────────────
async function fetchAllRSSFeeds() {
  const results = [];
  const entries = Object.entries(NEWS_SOURCES.rss);
  const settled = await Promise.allSettled(entries.map(async ([key, src]) => {
    try {
      const xml = await httpGet(src.url);
      if (!xml) return [];
      return parseRSSXml(xml, key, src.name);
    } catch (e) {
      log(`  RSS fetch failed [${key}]: ${e.message}`);
      return [];
    }
  }));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

async function fetchRedditPosts(subreddit, name) {
  try {
    const data = await httpGet(`https://www.reddit.com/r/${subreddit}/hot.json?limit=15`, {
      'User-Agent': 'BeanzOS:v1.0 (by /u/beanzbot)'
    });
    if (!data) return [];
    const json = JSON.parse(data);
    return (json.data?.children || []).filter(c => c.data && !c.data.stickied).map(c => {
      const p = c.data;
      return {
        id: 'reddit-' + p.id, title: p.title,
        url: 'https://reddit.com' + p.permalink,
        source: 'r/' + subreddit, sourceName: name || 'r/' + subreddit,
        category: 'reddit', author: p.author,
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        summary: (p.selftext || '').replace(/\n/g, ' ').slice(0, 300),
        tags: [subreddit], relevanceScore: 0.5,
        engagement: { redditScore: p.score, redditComments: p.num_comments }
      };
    });
  } catch (e) {
    log(`  Reddit fetch failed [${subreddit}]: ${e.message}`);
    return [];
  }
}

async function fetchAllRedditPosts() {
  const results = [];
  const entries = Object.entries(NEWS_SOURCES.reddit);
  const settled = await Promise.allSettled(entries.map(([key, src]) =>
    fetchRedditPosts(src.subreddit, src.name)
  ));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

async function fetchAllYouTubeFeeds() {
  const results = [];
  const entries = Object.entries(NEWS_SOURCES.youtube);
  const settled = await Promise.allSettled(entries.map(async ([key, src]) => {
    try {
      const xml = await httpGet(`https://www.youtube.com/feeds/videos.xml?channel_id=${src.channelId}`);
      if (!xml) return [];
      const articles = parseRSSXml(xml, key, src.name);
      return articles.map(a => {
        const vidMatch = a.url.match(/watch\?v=([^&]+)/) || a.url.match(/videos\/([^?]+)/);
        return { ...a, category: 'youtube', tags: ['youtube', key],
          url: vidMatch ? `https://www.youtube.com/watch?v=${vidMatch[1]}` : a.url };
      });
    } catch (e) {
      log(`  YouTube fetch failed [${key}]: ${e.message}`);
      return [];
    }
  }));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

// ─── Relevance Scoring ───────────────────────────────────────
function scoreRelevance(article) {
  let score = 0.3;
  const text = (article.title + ' ' + article.summary).toLowerCase();
  const keywords = {
    high: ['subscription', 'coffee subscription', 'breville', 'beanz', 'trade drink', 'tradedrink',
           'delonghi', "de'longhi", 'ninja', 'nespresso', 'coffee machine', 'espresso machine'],
    medium: ['specialty coffee', 'roasting', 'barista', 'home coffee', 'grinder', 'portafilter',
             'latte', 'espresso', 'coffee beans', 'single origin', 'coffee roaster'],
    low: ['cafe', 'coffee shop', 'brewing', 'pour over', 'aeropress', 'cold brew']
  };
  keywords.high.forEach(k => { if (text.includes(k)) score += 0.3; });
  keywords.medium.forEach(k => { if (text.includes(k)) score += 0.1; });
  keywords.low.forEach(k => { if (text.includes(k)) score += 0.05; });
  if (/trade\s?drink|ninja|delonghi|de.longhi|nespresso/i.test(text)) score += 0.2;
  return Math.min(score, 1.0);
}

function computeNewsStats(articles) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byCategory = { industry: 0, reddit: 0, youtube: 0, competitors: 0 };
  const sourceCounts = {};
  articles.forEach(a => {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
  });
  const lastWeekCount = articles.filter(a => new Date(a.publishedAt).getTime() > weekAgo).length;
  const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([source, count]) => ({ source, count }));
  return { totalArticles: articles.length, byCategory, lastWeekCount, topSources };
}

// ─── Main Refresh ────────────────────────────────────────────
async function refreshNewsData() {
  log('=== News Refresh Started ===');
  log(`Sources: ${SOURCES_FILTER.join(', ')}`);

  const store = loadNewsStore();
  const existingIds = new Set(store.articles.map(a => a.id));
  let newCount = 0;

  const fetchers = [];
  if (SOURCES_FILTER.includes('rss'))     fetchers.push(fetchAllRSSFeeds());
  if (SOURCES_FILTER.includes('reddit'))  fetchers.push(fetchAllRedditPosts());
  if (SOURCES_FILTER.includes('youtube')) fetchers.push(fetchAllYouTubeFeeds());

  const results = await Promise.allSettled(fetchers);
  const allNew = [];
  results.forEach(r => { if (r.status === 'fulfilled') allNew.push(...r.value); });

  // Track source statuses
  const sourceLabels = SOURCES_FILTER;
  store.sourceStatus = {
    rss:     sourceLabels.includes('rss')     ? (results[0]?.status === 'fulfilled' ? 'ok' : 'error') : store.sourceStatus?.rss || 'skipped',
    reddit:  sourceLabels.includes('reddit')  ? (results[sourceLabels.indexOf('reddit')]?.status === 'fulfilled' ? 'ok' : 'error') : store.sourceStatus?.reddit || 'skipped',
    youtube: sourceLabels.includes('youtube') ? (results[sourceLabels.indexOf('youtube')]?.status === 'fulfilled' ? 'ok' : 'error') : store.sourceStatus?.youtube || 'skipped',
    lastAttempt: new Date().toISOString()
  };

  allNew.forEach(article => {
    if (!existingIds.has(article.id)) {
      article.relevanceScore = scoreRelevance(article);
      store.articles.push(article);
      existingIds.add(article.id);
      newCount++;
    }
  });

  // Sort by date, keep last 500
  store.articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  if (store.articles.length > 500) store.articles = store.articles.slice(0, 500);

  // Prune articles older than 14 days
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const beforePrune = store.articles.length;
  store.articles = store.articles.filter(a => new Date(a.publishedAt).getTime() > cutoff);
  const pruned = beforePrune - store.articles.length;

  store.stats = computeNewsStats(store.articles);
  saveNewsStore(store);

  log(`Fetched ${allNew.length} articles from sources`);
  log(`New articles: ${newCount}`);
  if (pruned > 0) log(`Pruned ${pruned} articles older than 14 days`);
  log(`Total in store: ${store.articles.length}`);
  log(`Sources: RSS=${store.sourceStatus.rss} Reddit=${store.sourceStatus.reddit} YT=${store.sourceStatus.youtube}`);
  log('=== News Refresh Complete ===\n');

  return { newCount, total: store.articles.length, pruned };
}

// ─── Run ─────────────────────────────────────────────────────
refreshNewsData()
  .then(result => {
    if (!QUIET) console.log(`Done: ${result.newCount} new, ${result.total} total, ${result.pruned} pruned`);
    process.exit(0);
  })
  .catch(err => {
    log(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
