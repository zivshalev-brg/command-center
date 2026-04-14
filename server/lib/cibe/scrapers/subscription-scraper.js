/**
 * Subscription Scraper (FR-017)
 * Monitors competitor subscription/recurring coffee offerings.
 *
 * Monthly cadence. Uses Playwright screenshot + Claude Vision
 * to extract pricing tiers, trial offers, and plan structures.
 */
const path = require('path');
const https = require('https');
const BaseScraper = require('./base-scraper');

class SubscriptionScraper extends BaseScraper {
  constructor(opts = {}) {
    super(opts);
    this.anthropicKey = opts.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Scrape subscription page for a roaster.
   * @param {object} db - SQLite database
   * @param {object} roaster - Roaster record (needs scrape_config.subscription_url)
   */
  async scrapeSubscription(db, roaster) {
    const config = typeof roaster.scrape_config === 'string'
      ? JSON.parse(roaster.scrape_config || '{}')
      : (roaster.scrape_config || {});

    const subUrl = config.subscription_url || config.subscriptionUrl;
    if (!subUrl) {
      return { scraped: false, error: 'No subscription URL configured' };
    }

    const today = new Date().toISOString().slice(0, 10);

    await this.navigate(subUrl);

    // Scroll through the page to load all content
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.page.waitForTimeout(800);
    }
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(500);

    const screenshotPath = await this.screenshot(
      path.join('subscriptions', roaster.id),
      `${today}.png`
    );

    let analysis = null;
    if (this.anthropicKey) {
      try {
        analysis = await this._analyzeSubscriptionPage(screenshotPath, roaster);
      } catch (e) {
        console.error(`[CIBE] Subscription analysis failed for ${roaster.name}:`, e.message);
      }
    }

    // Store as a product with type 'subscription' or update EDM table
    if (analysis?.plans?.length) {
      const upsert = db.prepare(`
        INSERT INTO cibe_products (roaster_id, name, sku, price_cents, currency, weight_g, origin, process, roast_level, url, price_history, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', datetime('now'), datetime('now'))
        ON CONFLICT(roaster_id, name) DO UPDATE SET
          price_cents = excluded.price_cents,
          last_seen = datetime('now'),
          price_history = CASE
            WHEN cibe_products.price_cents != excluded.price_cents
            THEN json_insert(COALESCE(cibe_products.price_history, '[]'), '$[#]',
              json_object('price', excluded.price_cents, 'date', date('now')))
            ELSE cibe_products.price_history
          END
      `);

      for (const plan of analysis.plans) {
        upsert.run(
          roaster.id,
          `[SUB] ${plan.name || 'Subscription'}`,
          `sub-${roaster.id}-${(plan.name || 'default').toLowerCase().replace(/\s+/g, '-')}`,
          plan.price_cents || 0,
          config.currency || 'AUD',
          plan.weight_g || null,
          null, // origin
          null, // process
          null, // roast_level
          subUrl
        );
      }
    }

    return {
      scraped: true,
      screenshotPath,
      plans: analysis?.plans || [],
      trialOffer: analysis?.trial_offer || null,
      summary: analysis?.summary || 'No analysis available'
    };
  }

  /** Analyze subscription page with Claude Vision */
  async _analyzeSubscriptionPage(screenshotPath, roaster) {
    const fs = require('fs');
    const imageData = fs.readFileSync(screenshotPath).toString('base64');

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData }
          },
          {
            type: 'text',
            text: `Analyze this coffee subscription page for ${roaster.name}. Extract all subscription/recurring plans.

Return JSON:
{
  "summary": "1-2 sentence overview of their subscription offering",
  "plans": [
    {
      "name": "plan name",
      "price_cents": price in cents per delivery (e.g. 3500 for $35.00),
      "frequency": "weekly/fortnightly/monthly",
      "weight_g": grams per delivery,
      "flexibility": "can pause/skip/cancel?"
    }
  ],
  "trial_offer": "description of any trial/intro offer, or null",
  "discount_vs_retail": "percentage discount vs one-off purchase, or null",
  "unique_features": ["feature1", "feature2"]
}

Return ONLY the JSON.`
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

module.exports = SubscriptionScraper;
