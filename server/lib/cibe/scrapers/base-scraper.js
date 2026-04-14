/**
 * Base Scraper — Playwright lifecycle management for CIBE scrapers
 *
 * Manages browser context, navigation, screenshots, text extraction,
 * and rate limiting. All CIBE scrapers extend this base.
 */
const path = require('path');
const fs = require('fs');

// Rate limiter: 1 request per second per domain
const _lastRequest = {};
async function rateLimit(domain) {
  const now = Date.now();
  const last = _lastRequest[domain] || 0;
  const wait = Math.max(0, 1000 - (now - last));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastRequest[domain] = Date.now();
}

class BaseScraper {
  constructor(opts = {}) {
    this.screenshotDir = opts.screenshotDir || path.join(process.cwd(), 'cibe-screenshots');
    this.headless = opts.headless !== false;
    this.timeout = opts.timeout || 30000;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /** Launch browser (reuse existing context if provided) */
  async init(existingContext) {
    if (existingContext) {
      this.context = existingContext;
      this.page = await this.context.newPage();
      return;
    }

    let chromium;
    try {
      chromium = require('playwright').chromium;
    } catch {
      throw new Error('Playwright not installed. Run: npm install playwright && npx playwright install chromium');
    }

    const userDataDir = path.join(
      process.env.USERPROFILE || process.env.HOME,
      'beanz-chrome-profile'
    );

    // Use persistent context to share cookies/sessions with beanz-digest
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: this.headless,
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.page = this.context.pages()[0] || await this.context.newPage();
  }

  /** Navigate with rate limiting and cookie banner dismissal */
  async navigate(url) {
    if (!this.page) throw new Error('Scraper not initialized');

    const domain = new URL(url).hostname;
    await rateLimit(domain);

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeout
    });

    // Brief wait for dynamic content
    await this.page.waitForTimeout(2000);

    // Attempt cookie banner dismissal (best-effort)
    await this._dismissCookieBanner();
  }

  /** Dismiss common cookie consent banners */
  async _dismissCookieBanner() {
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("Accept all")',
      'button:has-text("Got it")',
      'button:has-text("I agree")',
      '[id*="cookie"] button',
      '[class*="cookie"] button:first-of-type',
      '[data-testid*="cookie"] button'
    ];

    for (const sel of selectors) {
      try {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click({ timeout: 2000 });
          await this.page.waitForTimeout(500);
          return;
        }
      } catch { /* ignore */ }
    }
  }

  /** Take screenshot, save to subdirectory, return path */
  async screenshot(subDir, filename) {
    if (!this.page) throw new Error('Scraper not initialized');

    const dir = path.join(this.screenshotDir, subDir);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, filename);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /** Extract visible text from page */
  async extractText() {
    if (!this.page) throw new Error('Scraper not initialized');
    return this.page.evaluate(() => document.body.innerText);
  }

  /** Extract page title */
  async extractTitle() {
    if (!this.page) throw new Error('Scraper not initialized');
    return this.page.title();
  }

  /** Close page (not browser — browser managed by orchestrator) */
  async close() {
    if (this.page) {
      try { await this.page.close(); } catch { /* ignore */ }
      this.page = null;
    }
  }

  /** Full cleanup — close browser context */
  async destroy() {
    await this.close();
    if (this.context && this.browser) {
      try { await this.context.close(); } catch { /* ignore */ }
      this.context = null;
      this.browser = null;
    }
  }
}

module.exports = BaseScraper;
