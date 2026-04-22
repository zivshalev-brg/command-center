/**
 * Catalogue Scraper — Extracts product data from roaster shop pages
 *
 * FR-011: Product catalogue tracking with price history
 * Uses Claude Vision as primary extraction method (robust against DOM changes),
 * falls back to CSS selectors from roaster scrape_config.
 */
const path = require('path');
const https = require('https');
const BaseScraper = require('./base-scraper');
const MODELS = require('../../ai-models');

class CatalogueScraper extends BaseScraper {
  constructor(opts = {}) {
    super(opts);
    this.anthropicKey = opts.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Scrape products from a roaster's shop page
   * @param {object} db - SQLite database
   * @param {object} roaster - Roaster record (needs shop_url in scrape_config)
   * @returns {{ newProducts: number, updatedProducts: number, totalScraped: number }}
   */
  async scrapeCatalogue(db, roaster) {
    const config = typeof roaster.scrape_config === 'string'
      ? JSON.parse(roaster.scrape_config || '{}')
      : (roaster.scrape_config || {});

    const shopUrl = config.shop_url || config.shopUrl;
    if (!shopUrl) {
      return { newProducts: 0, updatedProducts: 0, totalScraped: 0, error: 'No shop URL configured' };
    }

    await this.navigate(shopUrl);

    // Scroll to load lazy content (up to 3 scrolls)
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.page.waitForTimeout(1000);
    }
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.page.waitForTimeout(500);

    // Screenshot for records
    const today = new Date().toISOString().slice(0, 10);
    await this.screenshot(path.join('products', roaster.id), `${today}.png`);

    let products = [];

    // Primary: Vision extraction (if API key available)
    if (this.anthropicKey) {
      try {
        products = await this._extractWithVision(roaster);
      } catch (e) {
        console.error(`[CIBE] Vision extraction failed for ${roaster.name}:`, e.message);
      }
    }

    // Fallback: CSS selector extraction
    if (products.length === 0 && config.selectors) {
      try {
        products = await this._extractWithSelectors(config.selectors);
      } catch (e) {
        console.error(`[CIBE] Selector extraction failed for ${roaster.name}:`, e.message);
      }
    }

    // Fallback: Basic text extraction
    if (products.length === 0) {
      products = await this._extractFromText(roaster);
    }

    // Upsert products
    let newProducts = 0, updatedProducts = 0;
    const upsert = db.prepare(`
      INSERT INTO cibe_products (roaster_id, name, sku, price_cents, currency, weight_g, origin, process, roast_level, url, price_history, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(roaster_id, name) DO UPDATE SET
        price_cents = excluded.price_cents,
        weight_g = excluded.weight_g,
        origin = excluded.origin,
        process = excluded.process,
        roast_level = excluded.roast_level,
        url = excluded.url,
        last_seen = datetime('now'),
        price_history = CASE
          WHEN cibe_products.price_cents != excluded.price_cents
          THEN json_insert(COALESCE(cibe_products.price_history, '[]'), '$[#]',
            json_object('price', excluded.price_cents, 'date', date('now')))
          ELSE cibe_products.price_history
        END
    `);

    const checkExisting = db.prepare(
      'SELECT id FROM cibe_products WHERE roaster_id = ? AND name = ?'
    );

    for (const p of products) {
      const existing = checkExisting.get(roaster.id, p.name);
      upsert.run(
        roaster.id,
        p.name,
        p.sku || null,
        p.price_cents || 0,
        p.currency || config.currency || 'AUD',
        p.weight_g || null,
        p.origin || null,
        p.process || null,
        p.roast_level || null,
        p.url || null,
        '[]' // initial price_history for new records
      );
      if (existing) updatedProducts++;
      else newProducts++;
    }

    return { newProducts, updatedProducts, totalScraped: products.length };
  }

  /** Extract products via Claude Vision (screenshot → structured data) */
  async _extractWithVision(roaster) {
    const screenshotBuf = await this.page.screenshot({ fullPage: true });
    const imageData = screenshotBuf.toString('base64');

    const body = JSON.stringify({
      model: MODELS.SONNET,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData }
          },
          {
            type: 'text',
            text: `Extract all coffee products visible on this page from ${roaster.name}. Return a JSON array of products. Each product should have:
- "name": product name (string)
- "price_cents": price in cents (number, e.g. 2400 for $24.00)
- "weight_g": weight in grams if shown (number or null)
- "origin": coffee origin/country if shown (string or null)
- "roast_level": light/medium/dark if indicated (string or null)
- "process": washed/natural/honey if shown (string or null)

Return ONLY the JSON array, no other text. If no products found, return [].`
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
            const text = parsed.content?.[0]?.text || '[]';
            // Extract JSON array from response
            const match = text.match(/\[[\s\S]*\]/);
            const products = match ? JSON.parse(match[0]) : [];
            resolve(products.filter(p => p.name));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /** Extract products using CSS selectors from scrape config */
  async _extractWithSelectors(selectors) {
    return this.page.evaluate((sel) => {
      const products = [];
      const items = document.querySelectorAll(sel.item || '.product-card, .product-item, [data-product]');
      items.forEach(item => {
        const nameEl = item.querySelector(sel.name || 'h2, h3, .product-title, .product-name');
        const priceEl = item.querySelector(sel.price || '.price, .product-price, [data-price]');
        if (!nameEl) return;

        const priceText = priceEl?.textContent?.match(/[\d.]+/);
        products.push({
          name: nameEl.textContent.trim(),
          price_cents: priceText ? Math.round(parseFloat(priceText[0]) * 100) : 0,
          weight_g: null,
          origin: null,
          roast_level: null,
          process: null
        });
      });
      return products;
    }, selectors);
  }

  /** Basic fallback: extract product-like text patterns */
  async _extractFromText(roaster) {
    const text = await this.extractText();
    // Very basic pattern matching — catches "Product Name $XX.XX" patterns
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const products = [];

    for (const line of lines) {
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      if (priceMatch && line.length < 200) {
        const name = line.replace(/\$[\d.]+/g, '').replace(/\s+/g, ' ').trim();
        if (name.length > 3 && name.length < 100) {
          products.push({
            name,
            price_cents: Math.round(parseFloat(priceMatch[1]) * 100),
            weight_g: null,
            origin: null,
            roast_level: null,
            process: null
          });
        }
      }
    }

    return products;
  }
}

module.exports = CatalogueScraper;
