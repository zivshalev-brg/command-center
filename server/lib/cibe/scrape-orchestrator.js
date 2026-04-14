/**
 * Scrape Orchestrator — Scheduling + browser lifecycle for CIBE scrapers
 *
 * FR-033: Coordinates all scraping jobs with rate limiting and logging.
 * Follows refresh-engine.js pattern: state tracking, scheduler, status API.
 */
const { logAction } = require('../db');

let _cibeState = {
  running: false,
  lastRun: null,
  lastResult: null,
  schedule: { homepages: 'daily', catalogues: 'weekly', social: 'weekly', trends: 'weekly', edms: 'daily' },
  nextHomepage: null,
  nextCatalogue: null,
  nextSocial: null,
  nextTrends: null,
  nextEdm: null
};

let _homepageTimer = null;
let _catalogueTimer = null;
let _socialTimer = null;
let _trendsTimer = null;
let _edmTimer = null;

/**
 * Start the CIBE scrape scheduler
 * @param {object} ctx - Server context
 * @param {object} opts - Schedule options
 */
function startCIBEScheduler(ctx, opts = {}) {
  const homepageInterval = opts.homepageInterval || 24 * 60 * 60 * 1000; // daily
  const catalogueInterval = opts.catalogueInterval || 7 * 24 * 60 * 60 * 1000; // weekly
  const socialInterval = opts.socialInterval || 7 * 24 * 60 * 60 * 1000; // weekly
  const trendsInterval = opts.trendsInterval || 7 * 24 * 60 * 60 * 1000; // weekly
  const edmInterval = opts.edmInterval || 24 * 60 * 60 * 1000; // daily

  console.log(`[CIBE] Scheduler started — homepages: ${homepageInterval / 3600000}h, catalogues: ${catalogueInterval / 3600000}h, social: ${socialInterval / 3600000}h, trends: ${trendsInterval / 3600000}h, edms: ${edmInterval / 3600000}h`);

  // Schedule homepage scrapes
  _cibeState.nextHomepage = new Date(Date.now() + homepageInterval).toISOString();
  _homepageTimer = setInterval(() => {
    runHomepageScrape(ctx).catch(e => console.error('[CIBE] Homepage scrape error:', e.message));
    _cibeState.nextHomepage = new Date(Date.now() + homepageInterval).toISOString();
  }, homepageInterval);

  // Schedule catalogue scrapes
  _cibeState.nextCatalogue = new Date(Date.now() + catalogueInterval).toISOString();
  _catalogueTimer = setInterval(() => {
    runCatalogueScrape(ctx).catch(e => console.error('[CIBE] Catalogue scrape error:', e.message));
    _cibeState.nextCatalogue = new Date(Date.now() + catalogueInterval).toISOString();
  }, catalogueInterval);

  // Schedule social scrapes (Instagram)
  _cibeState.nextSocial = new Date(Date.now() + socialInterval).toISOString();
  _socialTimer = setInterval(() => {
    runSocialScrape(ctx).catch(e => console.error('[CIBE] Social scrape error:', e.message));
    _cibeState.nextSocial = new Date(Date.now() + socialInterval).toISOString();
  }, socialInterval);

  // Schedule trends scrapes
  _cibeState.nextTrends = new Date(Date.now() + trendsInterval).toISOString();
  _trendsTimer = setInterval(() => {
    runTrendsScrape(ctx).catch(e => console.error('[CIBE] Trends scrape error:', e.message));
    _cibeState.nextTrends = new Date(Date.now() + trendsInterval).toISOString();
  }, trendsInterval);

  // Schedule EDM scrapes
  _cibeState.nextEdm = new Date(Date.now() + edmInterval).toISOString();
  _edmTimer = setInterval(() => {
    runEdmScrape(ctx).catch(e => console.error('[CIBE] EDM scrape error:', e.message));
    _cibeState.nextEdm = new Date(Date.now() + edmInterval).toISOString();
  }, edmInterval);
}

/**
 * Run homepage scrape for all active roasters
 */
async function runHomepageScrape(ctx) {
  if (_cibeState.running) {
    console.log('[CIBE] Scrape already running, skipping');
    return { skipped: true };
  }

  // Check if digest extraction is running (avoid browser conflicts)
  if (global._extractionRunning) {
    console.log('[CIBE] Digest extraction running, deferring scrape');
    return { deferred: true };
  }

  _cibeState.running = true;
  const startedAt = new Date().toISOString();

  const { getDb } = require('../db');
  const db = getDb();

  // Log job start
  const jobId = db.prepare(
    'INSERT INTO cibe_scrape_log (job_type, status, started_at) VALUES (?, ?, ?)'
  ).run('homepage', 'running', startedAt).lastInsertRowid;

  try {
    const HomepageScraper = require('./scrapers/homepage-scraper');
    const { getActiveRoasters } = require('./roaster-registry');

    const roasters = getActiveRoasters(db);
    const scraper = new HomepageScraper({
      headless: true,
      anthropicKey: process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || ''
    });

    await scraper.init();

    let changesDetected = 0;
    const errors = [];

    for (const roaster of roasters) {
      if (!roaster.website) continue;
      try {
        const result = await scraper.scrapeHomepage(db, roaster);
        if (result.changed) changesDetected++;
      } catch (e) {
        errors.push({ roaster: roaster.id, error: e.message });
        console.error(`[CIBE] Homepage scrape failed for ${roaster.name}:`, e.message);
      }
    }

    await scraper.destroy();

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();

    db.prepare(
      'UPDATE cibe_scrape_log SET status = ?, completed_at = ?, duration_ms = ?, error = ? WHERE id = ?'
    ).run('completed', completedAt, durationMs, errors.length ? JSON.stringify(errors) : null, jobId);

    const result = {
      roastersScraped: roasters.filter(r => r.website).length,
      changesDetected,
      errors: errors.length,
      durationMs
    };

    _cibeState.lastRun = completedAt;
    _cibeState.lastResult = result;

    logAction('cibe_homepage_scrape', null, 'system', result);
    console.log(`[CIBE] Homepage scrape: ${result.roastersScraped} roasters, ${changesDetected} changes detected`);

    return result;
  } catch (e) {
    db.prepare(
      'UPDATE cibe_scrape_log SET status = ?, completed_at = ?, error = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), e.message, jobId);

    console.error('[CIBE] Homepage scrape failed:', e.message);
    throw e;
  } finally {
    _cibeState.running = false;
  }
}

/**
 * Run catalogue scrape for all active roasters
 */
async function runCatalogueScrape(ctx) {
  if (_cibeState.running) {
    console.log('[CIBE] Scrape already running, skipping');
    return { skipped: true };
  }

  if (global._extractionRunning) {
    console.log('[CIBE] Digest extraction running, deferring scrape');
    return { deferred: true };
  }

  _cibeState.running = true;
  const startedAt = new Date().toISOString();

  const { getDb } = require('../db');
  const db = getDb();

  const jobId = db.prepare(
    'INSERT INTO cibe_scrape_log (job_type, status, started_at) VALUES (?, ?, ?)'
  ).run('catalogue', 'running', startedAt).lastInsertRowid;

  try {
    const CatalogueScraper = require('./scrapers/catalogue-scraper');
    const { getActiveRoasters } = require('./roaster-registry');

    const roasters = getActiveRoasters(db);
    const scraper = new CatalogueScraper({
      headless: true,
      anthropicKey: process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || ''
    });

    await scraper.init();

    let totalNew = 0, totalUpdated = 0, totalScraped = 0;
    const errors = [];

    for (const roaster of roasters) {
      const config = typeof roaster.scrape_config === 'string'
        ? JSON.parse(roaster.scrape_config || '{}')
        : (roaster.scrape_config || {});

      if (!config.shop_url && !config.shopUrl) continue;

      try {
        const result = await scraper.scrapeCatalogue(db, roaster);
        totalNew += result.newProducts;
        totalUpdated += result.updatedProducts;
        totalScraped += result.totalScraped;
      } catch (e) {
        errors.push({ roaster: roaster.id, error: e.message });
        console.error(`[CIBE] Catalogue scrape failed for ${roaster.name}:`, e.message);
      }
    }

    await scraper.destroy();

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();

    db.prepare(
      'UPDATE cibe_scrape_log SET status = ?, completed_at = ?, duration_ms = ?, error = ? WHERE id = ?'
    ).run('completed', completedAt, durationMs, errors.length ? JSON.stringify(errors) : null, jobId);

    const result = { totalNew, totalUpdated, totalScraped, errors: errors.length, durationMs };

    _cibeState.lastRun = completedAt;
    _cibeState.lastResult = result;

    logAction('cibe_catalogue_scrape', null, 'system', result);
    console.log(`[CIBE] Catalogue scrape: ${totalScraped} products (${totalNew} new, ${totalUpdated} updated)`);

    return result;
  } catch (e) {
    db.prepare(
      'UPDATE cibe_scrape_log SET status = ?, completed_at = ?, error = ? WHERE id = ?'
    ).run('error', new Date().toISOString(), e.message, jobId);

    console.error('[CIBE] Catalogue scrape failed:', e.message);
    throw e;
  } finally {
    _cibeState.running = false;
  }
}

/**
 * Trigger a specific scrape type on-demand
 */
async function triggerScrape(ctx, jobType, roasterId) {
  if (jobType === 'homepage') {
    if (roasterId) {
      return runSingleHomepageScrape(ctx, roasterId);
    }
    return runHomepageScrape(ctx);
  }
  if (jobType === 'catalogue') {
    return runCatalogueScrape(ctx);
  }
  if (jobType === 'social') {
    return runSocialScrape(ctx, roasterId);
  }
  if (jobType === 'trends') {
    return runTrendsScrape(ctx);
  }
  if (jobType === 'edm') {
    return runEdmScrape(ctx);
  }
  throw new Error(`Unknown job type: ${jobType}`);
}

/**
 * Run social (Instagram) scrape for all active roasters
 */
async function runSocialScrape(ctx, singleRoasterId) {
  if (_cibeState.running) return { skipped: true };
  if (global._extractionRunning) return { deferred: true };

  _cibeState.running = true;
  const { getDb } = require('../db');
  const db = getDb();

  try {
    const SocialScraper = require('./scrapers/social-scraper');
    const { getActiveRoasters, getRoaster } = require('./roaster-registry');

    const roasters = singleRoasterId
      ? [getRoaster(db, singleRoasterId)].filter(Boolean)
      : getActiveRoasters(db).filter(r => r.instagram);

    const scraper = new SocialScraper({
      headless: true,
      anthropicKey: process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || ''
    });

    await scraper.init();

    let scraped = 0;
    const errors = [];

    for (const roaster of roasters) {
      if (!roaster.instagram) continue;
      try {
        await scraper.scrapeInstagram(db, roaster);
        scraped++;
      } catch (e) {
        errors.push({ roaster: roaster.id, error: e.message });
        console.error(`[CIBE] Social scrape failed for ${roaster.name}:`, e.message);
      }
    }

    await scraper.destroy();

    const result = { scraped, errors: errors.length };
    logAction('cibe_social_scrape', null, 'system', result);
    console.log(`[CIBE] Social scrape: ${scraped} profiles`);
    return result;
  } catch (e) {
    console.error('[CIBE] Social scrape failed:', e.message);
    throw e;
  } finally {
    _cibeState.running = false;
  }
}

/**
 * Run trends scrape (no browser needed)
 */
async function runTrendsScrape(ctx) {
  try {
    const { getDb } = require('../db');
    const { scrapeTrends } = require('./scrapers/trends-scraper');
    const db = getDb();
    const result = await scrapeTrends(db);
    logAction('cibe_trends_scrape', null, 'system', result);
    return result;
  } catch (e) {
    console.error('[CIBE] Trends scrape failed:', e.message);
    throw e;
  }
}

/**
 * Run EDM scrape (Outlook folder check, no browser needed)
 */
async function runEdmScrape(ctx) {
  try {
    const { getDb } = require('../db');
    const { scrapeEDMs } = require('./scrapers/edm-scraper');
    const db = getDb();
    const result = await scrapeEDMs(db, ctx);
    logAction('cibe_edm_scrape', null, 'system', result);
    return result;
  } catch (e) {
    console.error('[CIBE] EDM scrape failed:', e.message);
    throw e;
  }
}

/**
 * Scrape a single roaster's homepage on-demand
 */
async function runSingleHomepageScrape(ctx, roasterId) {
  const { getDb } = require('../db');
  const { getRoaster } = require('./roaster-registry');
  const HomepageScraper = require('./scrapers/homepage-scraper');

  const db = getDb();
  const roaster = getRoaster(db, roasterId);
  if (!roaster) throw new Error(`Roaster not found: ${roasterId}`);

  const scraper = new HomepageScraper({
    headless: true,
    anthropicKey: process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || ''
  });

  try {
    await scraper.init();
    const result = await scraper.scrapeHomepage(db, roaster);
    return result;
  } finally {
    await scraper.destroy();
  }
}

/** Get current CIBE scraper status */
function getCIBEStatus() {
  return { ..._cibeState };
}

/** Stop scheduler */
function stopCIBEScheduler() {
  if (_homepageTimer) { clearInterval(_homepageTimer); _homepageTimer = null; }
  if (_catalogueTimer) { clearInterval(_catalogueTimer); _catalogueTimer = null; }
  if (_socialTimer) { clearInterval(_socialTimer); _socialTimer = null; }
  if (_trendsTimer) { clearInterval(_trendsTimer); _trendsTimer = null; }
  if (_edmTimer) { clearInterval(_edmTimer); _edmTimer = null; }
  console.log('[CIBE] Scheduler stopped');
}

module.exports = {
  startCIBEScheduler,
  stopCIBEScheduler,
  getCIBEStatus,
  runHomepageScrape,
  runCatalogueScrape,
  runSocialScrape,
  runTrendsScrape,
  runEdmScrape,
  triggerScrape
};
