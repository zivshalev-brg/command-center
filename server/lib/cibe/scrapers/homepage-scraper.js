/**
 * Homepage Scraper — Captures roaster homepage screenshots + text
 *
 * FR-010: Homepage change detection via screenshot + Claude Vision
 */
const path = require('path');
const https = require('https');
const BaseScraper = require('./base-scraper');
const MODELS = require('../../ai-models');

class HomepageScraper extends BaseScraper {
  constructor(opts = {}) {
    super(opts);
    this.anthropicKey = opts.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Scrape a single roaster's homepage
   * @param {object} db - SQLite database
   * @param {object} roaster - Roaster record from cibe_roasters
   * @returns {{ changed: boolean, summary: string, screenshotPath: string }}
   */
  async scrapeHomepage(db, roaster) {
    if (!roaster.website) {
      return { changed: false, summary: 'No website configured', screenshotPath: null };
    }

    const today = new Date().toISOString().slice(0, 10);
    const screenshotFile = `${today}.png`;
    const subDir = path.join('homepages', roaster.id);

    await this.navigate(roaster.website);

    // Take screenshot
    const screenshotPath = await this.screenshot(subDir, screenshotFile);

    // Extract text
    const pageText = await this.extractText();
    const title = await this.extractTitle();

    // Get previous snapshot for change detection
    const prev = db.prepare(
      'SELECT vision_summary, page_text_hash FROM cibe_homepage_snapshots WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 1'
    ).get(roaster.id);

    // Simple text hash for change detection
    const textHash = simpleHash(pageText);
    const changed = !prev || prev.page_text_hash !== textHash;

    // Vision analysis (if API key available and content changed)
    let visionSummary = null;
    if (this.anthropicKey && changed) {
      try {
        visionSummary = await this._analyzeWithVision(screenshotPath, roaster.name);
      } catch (e) {
        console.error(`[CIBE] Vision analysis failed for ${roaster.name}:`, e.message);
      }
    }

    // Detect specific changes
    let detectedChanges = null;
    if (prev && changed) {
      detectedChanges = JSON.stringify({
        textHashChanged: true,
        prevSummary: prev.vision_summary || null,
        newTitle: title
      });
    }

    // Store snapshot
    db.prepare(`
      INSERT INTO cibe_homepage_snapshots
        (roaster_id, screenshot_path, page_text_hash, vision_summary, detected_changes, captured_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      roaster.id,
      screenshotPath,
      textHash,
      visionSummary,
      detectedChanges
    );

    return { changed, summary: visionSummary || `Page captured (${pageText.length} chars)`, screenshotPath };
  }

  /** Send screenshot to Claude Vision for analysis */
  async _analyzeWithVision(screenshotPath, roasterName) {
    const fs = require('fs');
    const imageData = fs.readFileSync(screenshotPath).toString('base64');

    const body = JSON.stringify({
      model: MODELS.SONNET,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData }
          },
          {
            type: 'text',
            text: `Analyze this coffee roaster homepage screenshot for ${roasterName}. In 2-3 sentences, describe: (1) Key promotions or featured products, (2) Any seasonal themes or campaigns, (3) Notable messaging or value propositions. Be concise and factual.`
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
            if (parsed.content && parsed.content[0]) {
              resolve(parsed.content[0].text);
            } else {
              reject(new Error(parsed.error?.message || 'No content in response'));
            }
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

/** Simple string hash for change detection */
function simpleHash(str) {
  let hash = 0;
  const s = (str || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return String(hash);
}

module.exports = HomepageScraper;
