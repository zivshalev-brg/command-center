const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const DEFAULT_NEWS_SOURCES = {
  rss: {
    dailycoffeenews: { url: 'https://dailycoffeenews.com/feed/', name: 'Daily Coffee News' },
    sprudge: { url: 'https://sprudge.com/feed', name: 'Sprudge' },
    perfectdailygrind: { url: 'https://perfectdailygrind.com/feed/', name: 'Perfect Daily Grind' },
    worldcoffeeportal: { url: 'https://www.worldcoffeeportal.com/Latest/News?format=feed&type=rss', name: 'World Coffee Portal' },
    baristamagazine: { url: 'https://www.baristamagazine.com/feed/', name: 'Barista Magazine' }
  },
  reddit: {
    coffee: { subreddit: 'coffee', name: 'r/coffee' },
    espresso: { subreddit: 'espresso', name: 'r/espresso' },
    roasting: { subreddit: 'roasting', name: 'r/roasting' }
  },
  youtube: {
    jameshoffmann: { channelId: 'UCMb0O2CdPBNi-QqPk5T3gsQ', name: 'James Hoffmann' },
    lancehedrick: { channelId: 'UCvNpZQzurSNZQ8e2QNGNXsA', name: 'Lance Hedrick' },
    sprometheus: { channelId: 'UCiolFxnJSOPMmV1mh9EYyIQ', name: 'Sprometheus' }
  },
  competitors: {
    tradedrink: { url: 'https://tradedrink.com', name: 'Trade Drink', type: 'competitor' },
    ninja: { url: 'https://www.ninjakitchen.com', name: 'Ninja', type: 'competitor' },
    delonghi: { url: 'https://www.delonghi.com', name: "De'Longhi", type: 'competitor' }
  }
};

// ─── Configurable Sources (persisted to news-sources.json) ───
const SOURCES_CONFIG_PATH = path.join(__dirname, '..', '..', 'news-sources.json');

function loadSourcesConfig() {
  try {
    if (fs.existsSync(SOURCES_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SOURCES_CONFIG_PATH, 'utf8'));
      // Merge with defaults so new default sources aren't lost on upgrade
      return {
        rss: { ...DEFAULT_NEWS_SOURCES.rss, ...raw.rss },
        reddit: { ...DEFAULT_NEWS_SOURCES.reddit, ...raw.reddit },
        youtube: { ...DEFAULT_NEWS_SOURCES.youtube, ...raw.youtube },
        podcasts: { ...(DEFAULT_NEWS_SOURCES.podcasts || {}), ...(raw.podcasts || {}) },
        competitors: { ...DEFAULT_NEWS_SOURCES.competitors, ...raw.competitors },
        settings: raw.settings || {}
      };
    }
  } catch { /* ignore corrupt file */ }
  return { ...DEFAULT_NEWS_SOURCES, podcasts: DEFAULT_NEWS_SOURCES.podcasts || {}, settings: {} };
}

function saveSourcesConfig(config) {
  fs.writeFileSync(SOURCES_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// Active sources — always read from config file
let NEWS_SOURCES = loadSourcesConfig();

// Transcript cache directory
const TRANSCRIPT_CACHE = path.join(__dirname, '..', '..', 'news-transcripts');

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function loadNewsStore(storePath) {
  const defaults = {
    version: 1, lastRefreshed: null,
    articles: [], competitorAlerts: [], stats: {},
    sourceStatus: {}
  };
  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}

function saveNewsStore(storePath, store) {
  store.lastRefreshed = new Date().toISOString();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

/** Fetch a single URL over HTTPS */
function httpGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method: 'GET',
      headers: { 'User-Agent': 'BeanzOS/1.0 NewsAggregator', ...headers },
      rejectUnauthorized: false
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

// ─── Image extraction helpers ────────────────────────────────

/** Extract first image URL from RSS item XML */
function extractImageFromRSS(itemXml, descHtml) {
  // 1. <media:content url="..."/>
  let m = itemXml.match(/<media:content[^>]+url\s*=\s*"([^"]+)"/i);
  if (m) return m[1];

  // 2. <media:thumbnail url="..."/>
  m = itemXml.match(/<media:thumbnail[^>]+url\s*=\s*"([^"]+)"/i);
  if (m) return m[1];

  // 3. <enclosure url="..." type="image/..."/>
  m = itemXml.match(/<enclosure[^>]+url\s*=\s*"([^"]+)"[^>]+type\s*=\s*"image\/[^"]*"/i);
  if (m) return m[1];
  // Also check reversed order: type before url
  m = itemXml.match(/<enclosure[^>]+type\s*=\s*"image\/[^"]*"[^>]+url\s*=\s*"([^"]+)"/i);
  if (m) return m[1];

  // 4. <image><url>...</url></image> inside item
  m = itemXml.match(/<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i);
  if (m) return m[1];

  // 5. First <img src="..."> in description/content HTML
  if (descHtml) {
    m = descHtml.match(/<img[^>]+src\s*=\s*"([^"]+)"/i);
    if (m && !m[1].includes('feedburner') && !m[1].includes('tracking')) return m[1];
  }

  return null;
}

/** Get YouTube thumbnail from video ID */
function youtubeThumb(videoId) {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/** Extract video ID from YouTube URL */
function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:watch\?v=|youtu\.be\/|videos\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── RSS Parser (with images + better summaries) ─────────────

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
    const contentEncoded = getTag('content:encoded') || '';
    const pubDate = getTag('pubDate') || getTag('published') || getTag('updated') || getTag('dc:date');
    const author = getTag('author') || getTag('dc:creator');

    // Extract image from RSS metadata, then from description HTML
    const image = extractImageFromRSS(item, desc || contentEncoded);

    // Better summary: use content:encoded if available (longer), else description
    const rawSummary = contentEncoded || desc;
    const cleanDesc = rawSummary.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 500);

    if (!title) return;

    const id = 'news-' + sourceKey + '-' + slugify(title).slice(0, 40);
    articles.push({
      id, title, url: link.trim(), source: sourceKey, sourceName: sourceName || sourceKey,
      category: 'industry', author: author.replace(/<[^>]+>/g, '').trim(),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      fetchedAt: new Date().toISOString(), summary: cleanDesc,
      image: image || null,
      tags: [], relevanceScore: 0.5, engagement: {}
    });
  });
  return articles;
}

// ─── Reddit fetcher (with images, comments, brand detection) ─

const BRAND_KEYWORDS = ['breville', 'sage', 'lelit', 'baratza', 'beanz', 'beanz.com'];
const BRAND_RE = new RegExp(BRAND_KEYWORDS.join('|'), 'i');

// Positive/negative keyword lists for simple sentiment scoring
const SENT_POS = ['love', 'great', 'amazing', 'excellent', 'perfect', 'awesome', 'best', 'fantastic', 'recommend', 'impressed', 'happy', 'solid', 'worth'];
const SENT_NEG = ['hate', 'terrible', 'awful', 'worst', 'broken', 'disappointed', 'regret', 'issue', 'problem', 'defect', 'fail', 'garbage', 'avoid', 'waste'];

function _detectBrandMentions(text) {
  const lower = (text || '').toLowerCase();
  return BRAND_KEYWORDS.filter(function(b) { return lower.includes(b); });
}

function _scoreSentiment(text, upvoteRatio) {
  const lower = (text || '').toLowerCase();
  let score = 0;
  SENT_POS.forEach(function(w) { if (lower.includes(w)) score += 1; });
  SENT_NEG.forEach(function(w) { if (lower.includes(w)) score -= 1; });
  // Factor in upvote ratio (0.0 - 1.0), centered at 0.5
  if (typeof upvoteRatio === 'number') score += (upvoteRatio - 0.5) * 2;
  return score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral';
}

function _delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function _fetchRedditComments(subreddit, postId) {
  try {
    const data = await httpGet(
      `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=10&depth=1&sort=top`,
      { 'User-Agent': 'BeanzOS:v1.0 (by /u/beanzbot)' }
    );
    if (!data) return [];
    const json = JSON.parse(data);
    // json is an array: [post listing, comments listing]
    const commentListing = json[1];
    if (!commentListing || !commentListing.data || !commentListing.data.children) return [];
    return commentListing.data.children
      .filter(function(c) { return c.kind === 't1' && c.data && c.data.body; })
      .slice(0, 10)
      .map(function(c) {
        return {
          author: c.data.author || '[deleted]',
          text: (c.data.body || '').slice(0, 500),
          score: c.data.score || 0
        };
      });
  } catch (e) {
    console.error(`Reddit comments fetch failed [${subreddit}/${postId}]:`, e.message);
    return [];
  }
}

async function fetchRedditPosts(subreddit, name) {
  try {
    const data = await httpGet(`https://www.reddit.com/r/${subreddit}/hot.json?limit=15`, {
      'User-Agent': 'BeanzOS:v1.0 (by /u/beanzbot)'
    });
    if (!data) return [];
    const json = JSON.parse(data);
    const children = (json.data?.children || []).filter(c => c.data && !c.data.stickied);
    const articles = [];

    for (let idx = 0; idx < children.length; idx++) {
      const c = children[idx];
      const p = c.data;

      // Extract best image: preview > thumbnail > url_overridden_by_dest
      let image = null;
      if (p.preview?.images?.[0]?.source?.url) {
        image = p.preview.images[0].source.url.replace(/&amp;/g, '&');
      } else if (p.thumbnail && p.thumbnail.startsWith('http') && !p.thumbnail.includes('self') && !p.thumbnail.includes('default')) {
        image = p.thumbnail;
      } else if (p.url_overridden_by_dest && /\.(jpg|jpeg|png|gif|webp)/i.test(p.url_overridden_by_dest)) {
        image = p.url_overridden_by_dest;
      }

      // Richer summary: include flair text context
      let summary = (p.selftext || '').replace(/\n/g, ' ').slice(0, 500);
      if (!summary && p.url_overridden_by_dest) {
        summary = 'Link: ' + p.url_overridden_by_dest;
      }

      // Fetch top comments for posts with engagement (rate-limit friendly)
      let comments = [];
      if (p.num_comments > 0 && idx < 10) {
        if (idx > 0) await _delay(600); // small delay between comment fetches
        comments = await _fetchRedditComments(subreddit, p.id);
      }

      // Detect brand mentions in title + selftext + comments
      const allText = p.title + ' ' + (p.selftext || '') + ' ' + comments.map(function(cm) { return cm.text; }).join(' ');
      const brandMentions = _detectBrandMentions(allText);

      // Simple sentiment from upvote ratio + text keywords
      const sentiment = _scoreSentiment(allText, p.upvote_ratio);

      articles.push({
        id: 'reddit-' + p.id,
        title: p.title, url: 'https://reddit.com' + p.permalink,
        source: 'r/' + subreddit, sourceName: name || 'r/' + subreddit,
        category: 'reddit', author: p.author,
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        summary,
        image,
        comments,
        brandMentions: brandMentions.length > 0 ? brandMentions : undefined,
        sentiment,
        tags: [subreddit, ...(p.link_flair_text ? [p.link_flair_text] : [])],
        relevanceScore: 0.5,
        engagement: { redditScore: p.score, redditComments: p.num_comments, upvoteRatio: p.upvote_ratio }
      });
    }

    return articles;
  } catch (e) {
    console.error(`Reddit fetch failed [${subreddit}]:`, e.message);
    return [];
  }
}

async function fetchAllRSSFeeds(sources) {
  const results = [];
  const entries = Object.entries((sources || NEWS_SOURCES).rss);
  const settled = await Promise.allSettled(entries.map(async ([key, src]) => {
    try {
      const xml = await httpGet(src.url);
      if (!xml) return [];
      return parseRSSXml(xml, key, src.name);
    } catch (e) {
      console.error(`RSS fetch failed [${key}]:`, e.message);
      return [];
    }
  }));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

async function fetchAllRedditPosts(sources) {
  const results = [];
  const entries = Object.entries((sources || NEWS_SOURCES).reddit);
  const settled = await Promise.allSettled(entries.map(([key, src]) =>
    fetchRedditPosts(src.subreddit, src.name)
  ));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

// ─── YouTube fetcher (with thumbnails + videoId) ─────────────

async function fetchAllYouTubeFeeds(sources) {
  const results = [];
  const entries = Object.entries((sources || NEWS_SOURCES).youtube);
  const settled = await Promise.allSettled(entries.map(async ([key, src]) => {
    try {
      const xml = await httpGet(`https://www.youtube.com/feeds/videos.xml?channel_id=${src.channelId}`);
      if (!xml) return [];
      // Extract yt:videoId tags from XML entries for reliable ID mapping
      const ytVideoIds = {};
      const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
      entries.forEach(entry => {
        const vidIdMatch = entry.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
        const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
        if (vidIdMatch && titleMatch) ytVideoIds[titleMatch[1].trim()] = vidIdMatch[1];
      });

      const articles = parseRSSXml(xml, key, src.name);
      return articles.map(a => {
        const vidId = extractVideoId(a.url) || ytVideoIds[a.title] || null;
        return {
          ...a,
          category: 'youtube',
          tags: ['youtube', key],
          url: vidId ? `https://www.youtube.com/watch?v=${vidId}` : a.url,
          image: youtubeThumb(vidId),
          videoId: vidId
        };
      });
    } catch (e) {
      console.error(`YouTube fetch failed [${key}]:`, e.message);
      return [];
    }
  }));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

// ─── Podcast fetcher (YouTube-based, tagged as podcast) ─────

async function fetchAllPodcastFeeds(sources) {
  const podcasts = (sources || NEWS_SOURCES).podcasts;
  if (!podcasts || !Object.keys(podcasts).length) return [];
  const results = [];
  const entries = Object.entries(podcasts);
  const settled = await Promise.allSettled(entries.map(async ([key, src]) => {
    try {
      const xml = await httpGet(`https://www.youtube.com/feeds/videos.xml?channel_id=${src.channelId}`);
      if (!xml) return [];
      const ytVideoIds = {};
      const xmlEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
      xmlEntries.forEach(entry => {
        const vidIdMatch = entry.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
        const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
        if (vidIdMatch && titleMatch) ytVideoIds[titleMatch[1].trim()] = vidIdMatch[1];
      });
      const articles = parseRSSXml(xml, key, src.name);
      return articles.map(a => {
        const vidId = extractVideoId(a.url) || ytVideoIds[a.title] || null;
        return {
          ...a,
          category: 'podcast',
          tags: ['podcast', key],
          url: vidId ? `https://www.youtube.com/watch?v=${vidId}` : a.url,
          image: youtubeThumb(vidId),
          videoId: vidId,
          podcastName: src.name
        };
      });
    } catch (e) {
      console.error(`Podcast fetch failed [${key}]:`, e.message);
      return [];
    }
  }));
  settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });
  return results;
}

// ─── YouTube Transcript Fetching ─────────────────────────────

/**
 * Fetch YouTube transcript/captions for a video.
 * Multi-strategy approach:
 *   1. Scrape the watch page HTML for caption track URLs + fetch XML captions
 *   2. Use Playwright browser context to fetch captions (handles session cookies)
 *   3. Use innertube player API as final fallback
 * Corporate proxies may block the timedtext API — Playwright is most reliable
 * as it uses a real browser session.
 */
async function fetchYouTubeTranscript(videoId) {
  // Check cache first
  if (!fs.existsSync(TRANSCRIPT_CACHE)) fs.mkdirSync(TRANSCRIPT_CACHE, { recursive: true });
  const cachePath = path.join(TRANSCRIPT_CACHE, videoId + '.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (cached && cached.segments?.length) return cached;
  } catch { /* not cached */ }

  // Strategy 1 (PRIMARY): Python youtube-transcript-api — most reliable, handles corporate proxies
  try {
    const result = await _fetchTranscriptViaPython(videoId);
    if (result && result.segments.length > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`[Transcript] OK via Python [${videoId}]: ${result.segmentCount} segments`);
      return result;
    }
  } catch (e) {
    console.error(`[Transcript] Python strategy failed [${videoId}]:`, e.message);
  }

  // Strategy 2: Scrape watch page + fetch XML captions (works on non-proxied networks)
  try {
    const result = await _fetchTranscriptFromWatchPage(videoId);
    if (result && result.segments.length > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`[Transcript] OK via watch page [${videoId}]: ${result.segmentCount} segments`);
      return result;
    }
  } catch (e) {
    console.error(`[Transcript] Watch page strategy failed [${videoId}]:`, e.message);
  }

  // Strategy 3: Playwright browser context (last resort)
  try {
    const result = await _fetchTranscriptViaPlaywright(videoId);
    if (result && result.segments.length > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`[Transcript] OK via Playwright [${videoId}]: ${result.segmentCount} segments`);
      return result;
    }
  } catch (e) {
    console.error(`[Transcript] Playwright strategy failed [${videoId}]:`, e.message);
  }

  return { videoId, error: 'No captions available — video may lack captions or the network may block YouTube caption APIs', segments: [], text: '' };
}

/** Use Python youtube-transcript-api to fetch transcript (bypasses corporate proxy SSL issues) */
async function _fetchTranscriptViaPython(videoId) {
  const { execFile } = require('child_process');
  const pyScript = `
import sys, json, os
os.environ['PYTHONHTTPSVERIFY'] = '0'
import urllib3; urllib3.disable_warnings()
import requests
s = requests.Session()
s.verify = False
from youtube_transcript_api import YouTubeTranscriptApi
ytt = YouTubeTranscriptApi(http_client=s)
t = ytt.fetch(sys.argv[1])
segs = [{"start": sn.start, "duration": sn.duration, "text": sn.text} for sn in t.snippets]
json.dump(segs, sys.stdout)
`;
  return new Promise((resolve, reject) => {
    const proc = execFile('python', ['-c', pyScript, videoId], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim()?.split('\n').pop() || err.message));
      try {
        const segments = JSON.parse(stdout);
        if (!segments.length) return reject(new Error('No segments returned'));
        return resolve(_buildTranscriptResult(videoId, segments));
      } catch (e) { reject(new Error('Failed to parse Python output: ' + e.message)); }
    });
  });
}

/** Extract caption tracks from the YouTube watch page HTML */
function _extractCaptionTracks(html) {
  const startMatch = html.match(/ytInitialPlayerResponse\s*=\s*/);
  if (!startMatch) return null;

  const startIdx = startMatch.index + startMatch[0].length;
  let depth = 0, i = startIdx;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) return null;

  const playerResp = JSON.parse(html.slice(startIdx, i + 1));
  return playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
}

/** Pick the best caption track (prefer English manual, then English auto, then any) */
function _pickBestTrack(tracks) {
  return tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
         tracks.find(t => t.languageCode === 'en') ||
         tracks[0];
}

/** Strategy 1: Fetch watch page, extract caption URL, fetch XML directly */
async function _fetchTranscriptFromWatchPage(videoId) {
  const html = await httpGet(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+987; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODE1LjA3X3AxGgJlbiACGgYIgJnSmgY'
  });

  const tracks = _extractCaptionTracks(html);
  if (!tracks || !tracks.length) return null;

  const track = _pickBestTrack(tracks);
  if (!track?.baseUrl) return null;

  // Try fetching the XML captions directly
  const timedText = await httpGet(track.baseUrl, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+987'
  });

  if (timedText.length > 10) {
    return _parseXmlTranscript(videoId, timedText);
  }

  // Try json3 format
  const json3Text = await httpGet(track.baseUrl + '&fmt=json3', {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+987'
  });

  if (json3Text.length > 10) {
    return _parseJson3Transcript(videoId, json3Text);
  }

  return null;
}

/** Strategy 2: Use Playwright to fetch captions within a browser session */
async function _fetchTranscriptViaPlaywright(videoId) {
  let chromium;
  try { chromium = require('playwright').chromium; } catch {
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    const page = await ctx.newPage();

    // Intercept timedtext responses (auto-loaded by the player)
    let captionData = null;
    page.on('response', async (resp) => {
      if (resp.url().includes('/api/timedtext') && !captionData) {
        try {
          const body = await resp.text();
          if (body.length > 10) captionData = { body, isJson: body.trimStart().startsWith('{') };
        } catch { /* ignore */ }
      }
    });

    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'networkidle', timeout: 25000
    });

    // Accept cookie consent if needed
    try { await page.click('button:has-text("Accept all")', { timeout: 2000 }); } catch { /* no banner */ }

    // If player didn't auto-fetch captions, try fetching from within the page context
    if (!captionData) {
      await page.waitForTimeout(2000);
      const browserResult = await page.evaluate(async (vid) => {
        try {
          const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (!tracks?.length) return null;

          const track = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
                        tracks.find(t => t.languageCode === 'en') || tracks[0];
          if (!track?.baseUrl) return null;

          // Try json3 format from browser context
          const r = await fetch(track.baseUrl + '&fmt=json3');
          const t = await r.text();
          if (t.length > 10) return { body: t, isJson: true };

          // Try default XML format
          const r2 = await fetch(track.baseUrl);
          const t2 = await r2.text();
          if (t2.length > 10) return { body: t2, isJson: false };
        } catch { /* failed */ }
        return null;
      }, videoId);

      if (browserResult) captionData = browserResult;
    }

    await browser.close();
    browser = null;

    if (!captionData) return null;

    return captionData.isJson
      ? _parseJson3Transcript(videoId, captionData.body)
      : _parseXmlTranscript(videoId, captionData.body);

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/** Parse XML (srv1/srv3) transcript into segments */
function _parseXmlTranscript(videoId, timedText) {
  const isSrv3 = timedText.includes('<p t="');
  const segments = [];
  const textParts = timedText.match(/<(?:text|p)\s[^>]*>[\s\S]*?<\/(?:text|p)>/gi) || [];
  textParts.forEach(seg => {
    const startMatch = seg.match(/(?:start|t)="([^"]+)"/);
    const durMatch = seg.match(/(?:dur|d)="([^"]+)"/);
    const textContent = seg.replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .trim();
    if (textContent) {
      let startSec = parseFloat(startMatch?.[1] || '0');
      let durSec = parseFloat(durMatch?.[1] || '0');
      if (isSrv3) { startSec /= 1000; durSec /= 1000; }
      segments.push({ start: startSec, duration: durSec, text: textContent });
    }
  });

  return _buildTranscriptResult(videoId, segments);
}

/** Parse json3 format transcript data into segments */
function _parseJson3Transcript(videoId, jsonStr) {
  const data = JSON.parse(jsonStr);
  const events = data.events || [];
  const segments = [];

  for (const ev of events) {
    if (!ev.segs || ev.tStartMs === undefined) continue;
    const text = ev.segs.map(s => s.utf8 || '').join('').trim();
    if (!text || text === '\n') continue;
    segments.push({
      start: ev.tStartMs / 1000,
      duration: (ev.dDurationMs || 0) / 1000,
      text
    });
  }

  return _buildTranscriptResult(videoId, segments);
}

/** Build the final transcript result object from segments */
function _buildTranscriptResult(videoId, segments) {
  const fullText = segments.map(s => s.text).join(' ');
  const transcriptSummary = fullText.slice(0, 1000) + (fullText.length > 1000 ? '...' : '');

  return {
    videoId,
    segmentCount: segments.length,
    duration: segments.length ? segments[segments.length - 1].start + segments[segments.length - 1].duration : 0,
    segments,
    text: fullText,
    summary: transcriptSummary,
    fetchedAt: new Date().toISOString()
  };
}

/** Format transcript seconds as mm:ss */
function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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

/** Reload sources from config file (called before each refresh) */
function reloadSources() {
  NEWS_SOURCES = loadSourcesConfig();
}

/** Master refresh: fetch all sources, merge, score, prune, save.
 *  opts: { sources, scoreFn } — optional overrides for custom feeds (e.g., tech news) */
async function refreshNewsData(storePath, forceRefresh, opts) {
  const feedSources = (opts && opts.sources) || (reloadSources(), NEWS_SOURCES);
  const scoreFn = (opts && opts.scoreFn) || scoreRelevance;
  const store = loadNewsStore(storePath);

  // Skip refresh if last successful refresh was less than 2 hours ago (reduced from 12h)
  if (!forceRefresh && store.sourceStatus?.lastAttempt) {
    const lastAttempt = new Date(store.sourceStatus.lastAttempt).getTime();
    const hoursSince = (Date.now() - lastAttempt) / 3600000;
    if (hoursSince < 2 && store.articles.length > 0) {
      return { newCount: 0, total: store.articles.length, skipped: true };
    }
  }

  const existingIds = new Set(store.articles.map(a => a.id));
  let newCount = 0;

  const [rssArticles, redditPosts, ytVideos, podcastEpisodes] = await Promise.allSettled([
    fetchAllRSSFeeds(feedSources),
    fetchAllRedditPosts(feedSources),
    fetchAllYouTubeFeeds(feedSources),
    fetchAllPodcastFeeds(feedSources)
  ]);

  const allNew = [
    ...(rssArticles.status === 'fulfilled' ? rssArticles.value : []),
    ...(redditPosts.status === 'fulfilled' ? redditPosts.value : []),
    ...(ytVideos.status === 'fulfilled' ? ytVideos.value : []),
    ...(podcastEpisodes.status === 'fulfilled' ? podcastEpisodes.value : [])
  ];

  store.sourceStatus = {
    rss: rssArticles.status === 'fulfilled' ? 'ok' : 'error',
    reddit: redditPosts.status === 'fulfilled' ? 'ok' : 'error',
    youtube: ytVideos.status === 'fulfilled' ? 'ok' : 'error',
    podcasts: podcastEpisodes.status === 'fulfilled' ? 'ok' : 'error',
    lastAttempt: new Date().toISOString()
  };

  allNew.forEach(article => {
    if (!existingIds.has(article.id)) {
      article.relevanceScore = scoreFn(article);
      store.articles.push(article);
      existingIds.add(article.id);
      newCount++;
    }
  });

  store.articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  if (store.articles.length > 500) store.articles = store.articles.slice(0, 500);

  store.stats = computeNewsStats(store.articles);
  saveNewsStore(storePath, store);
  console.log(`News refresh complete: ${newCount} new articles, ${store.articles.length} total`);
  return { newCount, refreshedAt: store.lastRefreshed };
}

module.exports = {
  get NEWS_SOURCES() { return NEWS_SOURCES; },
  DEFAULT_NEWS_SOURCES,
  loadSourcesConfig, saveSourcesConfig, reloadSources,
  loadNewsStore, saveNewsStore,
  refreshNewsData, scoreRelevance, computeNewsStats,
  fetchYouTubeTranscript, httpGet, extractVideoId,
  fetchAllRSSFeeds, fetchAllRedditPosts, fetchAllYouTubeFeeds, fetchAllPodcastFeeds,
  parseRSSXml, slugify
};
