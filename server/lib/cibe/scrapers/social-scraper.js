/**
 * Social Scraper (FR-013)
 * Captures Instagram profile data via Playwright + Claude Vision.
 *
 * No login required — scrapes public profiles only.
 * Weekly cadence. Extracts: follower count, bio, content themes, recent posts.
 */
const path = require('path');
const https = require('https');
const BaseScraper = require('./base-scraper');
const MODELS = require('../../ai-models');

class SocialScraper extends BaseScraper {
  constructor(opts = {}) {
    super(opts);
    this.anthropicKey = opts.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Scrape an Instagram profile for a roaster.
   * @param {object} db - SQLite database
   * @param {object} roaster - Roaster record (needs .instagram)
   * @returns {{ followers, engagement_rate, top_posts, bio }}
   */
  async scrapeInstagram(db, roaster) {
    if (!roaster.instagram) {
      return { scraped: false, error: 'No Instagram handle configured' };
    }

    const igUrl = `https://www.instagram.com/${roaster.instagram}/`;
    const today = new Date().toISOString().slice(0, 10);

    await this.navigate(igUrl);

    // Wait for profile content to load
    await this.page.waitForTimeout(3000);

    // Screenshot the profile
    const screenshotPath = await this.screenshot(
      path.join('social', roaster.id),
      `instagram_${today}.png`
    );

    // Extract text from page
    const pageText = await this.extractText();

    // Parse basic metrics from page text (followers pattern)
    const basicMetrics = parseInstagramText(pageText);

    // Vision analysis for deeper insights
    let visionData = null;
    if (this.anthropicKey) {
      try {
        visionData = await this._analyzeProfile(screenshotPath, roaster);
      } catch (e) {
        console.error(`[CIBE] Instagram Vision failed for ${roaster.name}:`, e.message);
      }
    }

    // Merge basic text parsing with Vision analysis
    const followers = visionData?.followers || basicMetrics.followers || 0;
    const result = {
      followers,
      following: visionData?.following || basicMetrics.following || 0,
      posts_count: visionData?.posts_count || basicMetrics.posts || 0,
      engagement_rate: visionData?.engagement_rate || null,
      bio: visionData?.bio || basicMetrics.bio || null,
      top_posts: JSON.stringify(visionData?.top_posts || []),
      content_themes: JSON.stringify(visionData?.content_themes || []),
      screenshot_path: screenshotPath
    };

    // Store in database
    db.prepare(`
      INSERT INTO cibe_social (roaster_id, platform, followers, engagement_rate, top_posts, captured_at)
      VALUES (?, 'instagram', ?, ?, ?, datetime('now'))
    `).run(
      roaster.id,
      result.followers,
      result.engagement_rate,
      JSON.stringify({
        following: result.following,
        posts_count: result.posts_count,
        bio: result.bio,
        top_posts: visionData?.top_posts || [],
        content_themes: visionData?.content_themes || [],
        screenshot: screenshotPath
      })
    );

    return { scraped: true, ...result };
  }

  /** Analyze Instagram profile screenshot with Claude Vision */
  async _analyzeProfile(screenshotPath, roaster) {
    const fs = require('fs');
    const imageData = fs.readFileSync(screenshotPath).toString('base64');

    const body = JSON.stringify({
      model: MODELS.SONNET,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData }
          },
          {
            type: 'text',
            text: `Analyze this Instagram profile screenshot for ${roaster.name} (@${roaster.instagram}).

Extract and return JSON:
{
  "followers": number (e.g. 15400),
  "following": number,
  "posts_count": number,
  "bio": "profile bio text",
  "engagement_rate": number or null (estimated from visible likes/comments if possible),
  "content_themes": ["theme1", "theme2"] (e.g. "specialty coffee", "seasonal blends", "cafe culture"),
  "top_posts": [{"description": "brief description", "likes": number}] (up to 3 visible posts)
}

Return ONLY the JSON. If a field is not visible, use null.`
          }
        ]
      }]
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicKey,
          'anthropic-version': '2023-06-01'
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed.content?.[0]?.text || '{}';
            const match = text.match(/\{[\s\S]*\}/);
            resolve(match ? JSON.parse(match[0]) : {});
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

/**
 * Parse Instagram profile text for basic metrics.
 * Handles patterns like "15.4K followers" or "1,234 posts".
 */
function parseInstagramText(text) {
  const metrics = { followers: 0, following: 0, posts: 0, bio: null };

  // Follower count patterns
  const followerMatch = text.match(/([\d,.]+[KMkm]?)\s*followers/i);
  if (followerMatch) metrics.followers = parseCount(followerMatch[1]);

  const followingMatch = text.match(/([\d,.]+[KMkm]?)\s*following/i);
  if (followingMatch) metrics.following = parseCount(followingMatch[1]);

  const postsMatch = text.match(/([\d,.]+[KMkm]?)\s*posts/i);
  if (postsMatch) metrics.posts = parseCount(postsMatch[1]);

  return metrics;
}

function parseCount(str) {
  const cleaned = str.replace(/,/g, '');
  if (/[Kk]$/.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
  if (/[Mm]$/.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000000);
  return parseInt(cleaned) || 0;
}

module.exports = SocialScraper;
