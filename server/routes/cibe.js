const { jsonReply, readBody } = require('../lib/helpers');
const { getDb } = require('../lib/db');

// Lazy-loaded modules to avoid startup errors
let _registry, _internalData, _anomalyDetector, _priceAggregator, _scrapeOrchestrator,
    _briefingGenerator, _correlationEngine, _dossierGenerator, _edmScraper, _trendsScraper;

function registry() {
  if (!_registry) _registry = require('../lib/cibe/roaster-registry');
  return _registry;
}
function internalData() {
  if (!_internalData) _internalData = require('../lib/cibe/internal-data');
  return _internalData;
}
function anomalyDetector() {
  if (!_anomalyDetector) _anomalyDetector = require('../lib/cibe/anomaly-detector');
  return _anomalyDetector;
}
function priceAggregator() {
  if (!_priceAggregator) _priceAggregator = require('../lib/cibe/price-aggregator');
  return _priceAggregator;
}
function scrapeOrchestrator() {
  if (!_scrapeOrchestrator) _scrapeOrchestrator = require('../lib/cibe/scrape-orchestrator');
  return _scrapeOrchestrator;
}
function briefingGenerator() {
  if (!_briefingGenerator) _briefingGenerator = require('../lib/cibe/briefing-generator');
  return _briefingGenerator;
}
function correlationEngine() {
  if (!_correlationEngine) _correlationEngine = require('../lib/cibe/correlation-engine');
  return _correlationEngine;
}
function dossierGenerator() {
  if (!_dossierGenerator) _dossierGenerator = require('../lib/cibe/dossier-generator');
  return _dossierGenerator;
}
function edmScraper() {
  if (!_edmScraper) _edmScraper = require('../lib/cibe/scrapers/edm-scraper');
  return _edmScraper;
}
function trendsScraper() {
  if (!_trendsScraper) _trendsScraper = require('../lib/cibe/scrapers/trends-scraper');
  return _trendsScraper;
}

/**
 * CIBE API Route Handler — /api/cibe/*
 */
async function handleCIBE(req, res, parts, url, ctx) {
  const db = getDb();
  const sub = parts[1]; // e.g. 'roasters', 'internal', 'briefings', etc.

  // ── Roasters ─────────────────────────────────────────────
  if (sub === 'roasters') {
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        registry().upsertRoaster(db, body);
        return jsonReply(res, 200, { ok: true });
      } catch (e) {
        return jsonReply(res, 400, { error: e.message });
      }
    }
    // GET /api/cibe/roasters?country=AU
    const country = url.searchParams.get('country');
    const roasters = country
      ? registry().getRoastersByCountry(db, country)
      : registry().getActiveRoasters(db);
    return jsonReply(res, 200, { roasters, count: roasters.length });
  }

  // ── Single roaster ───────────────────────────────────────
  if (sub === 'roaster' && parts[2]) {
    const roaster = registry().getRoaster(db, parts[2]);
    if (!roaster) return jsonReply(res, 404, { error: 'Roaster not found' });
    return jsonReply(res, 200, roaster);
  }

  // ── Internal Data ────────────────────────────────────────
  if (sub === 'internal') {
    if (parts[2] === 'summary') {
      try {
        const summary = await internalData().getInternalSummary(ctx, db);
        return jsonReply(res, 200, summary);
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }
    if (parts[2] === 'anomalies') {
      try {
        const result = anomalyDetector().getAnomalySummary(db);
        return jsonReply(res, 200, result);
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }
    if (parts[2] === 'kpi' && parts[3]) {
      const metricKey = decodeURIComponent(parts[3]);
      const limit = parseInt(url.searchParams.get('limit')) || 60;
      const history = internalData().getKPIHistory(db, metricKey, limit);
      return jsonReply(res, 200, { metric: metricKey, history });
    }
    return jsonReply(res, 404, { error: 'Unknown internal endpoint' });
  }

  // ── Briefings ────────────────────────────────────────────
  if (sub === 'briefings') {
    if (req.method === 'POST' && parts[2] === 'generate') {
      try {
        let body = {};
        try { body = await readBody(req); } catch {}
        const result = await briefingGenerator().generateBriefing(db, ctx, {
          type: body.type || 'weekly'
        });
        return jsonReply(res, 200, { ok: true, ...result });
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }
    if (parts[2]) {
      // GET /api/cibe/briefings/:id
      const briefing = db.prepare('SELECT * FROM cibe_briefings WHERE id = ?').get(parts[2]);
      if (!briefing) return jsonReply(res, 404, { error: 'Briefing not found' });
      return jsonReply(res, 200, briefing);
    }
    // GET /api/cibe/briefings?limit=10
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    const briefings = db.prepare(
      'SELECT id, week, type, title, model_used, sent_at, created_at FROM cibe_briefings ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    return jsonReply(res, 200, { briefings, count: briefings.length });
  }

  // ── Products ─────────────────────────────────────────────
  if (sub === 'products') {
    const roasterId = url.searchParams.get('roaster');
    const aggregate = url.searchParams.get('aggregate') === 'true';

    if (aggregate) {
      // Full price aggregation from price-aggregator module
      try {
        const aggregation = priceAggregator().getPriceAggregation(db);
        return jsonReply(res, 200, aggregation);
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }

    // Price changes
    if (url.searchParams.get('changes') === 'true') {
      const days = parseInt(url.searchParams.get('days')) || 30;
      const changes = priceAggregator().getRecentPriceChanges(db, days);
      return jsonReply(res, 200, { changes, count: changes.length });
    }

    let products;
    if (roasterId) {
      products = db.prepare('SELECT * FROM cibe_products WHERE roaster_id = ? ORDER BY name').all(roasterId);
    } else {
      const limit = parseInt(url.searchParams.get('limit')) || 100;
      products = db.prepare('SELECT * FROM cibe_products ORDER BY last_seen DESC LIMIT ?').all(limit);
    }
    return jsonReply(res, 200, { products, count: products.length });
  }

  // ── Homepage snapshots ───────────────────────────────────
  if (sub === 'homepage' && parts[2]) {
    const roasterId = parts[2];
    const limit = parseInt(url.searchParams.get('limit')) || 5;
    const snapshots = db.prepare(
      'SELECT * FROM cibe_homepage_snapshots WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT ?'
    ).all(roasterId, limit);
    return jsonReply(res, 200, { roasterId, snapshots });
  }

  // ── Trends ───────────────────────────────────────────────
  if (sub === 'trends') {
    const keyword = url.searchParams.get('keyword');
    const region = url.searchParams.get('region') || 'AU';
    let trends;
    if (keyword) {
      trends = db.prepare(
        'SELECT * FROM cibe_trends WHERE keyword = ? AND region = ? ORDER BY period DESC LIMIT 52'
      ).all(keyword, region);
    } else {
      trends = db.prepare(
        'SELECT keyword, region, MAX(value) as latest_value, MAX(period) as latest_period FROM cibe_trends GROUP BY keyword, region ORDER BY keyword'
      ).all();
    }
    return jsonReply(res, 200, { trends });
  }

  // ── EDMs ─────────────────────────────────────────────────
  if (sub === 'edms') {
    const roasterId = url.searchParams.get('roaster');
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    let edms;
    if (roasterId) {
      edms = db.prepare('SELECT * FROM cibe_edms WHERE roaster_id = ? ORDER BY received_at DESC LIMIT ?').all(roasterId, limit);
    } else {
      edms = db.prepare('SELECT * FROM cibe_edms ORDER BY received_at DESC LIMIT ?').all(limit);
    }
    return jsonReply(res, 200, { edms, count: edms.length });
  }

  // ── Social ───────────────────────────────────────────────
  if (sub === 'social') {
    const roasterId = url.searchParams.get('roaster');
    let social;
    if (roasterId) {
      social = db.prepare('SELECT * FROM cibe_social WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 5').all(roasterId);
    } else {
      // Latest snapshot per roaster
      social = db.prepare(`
        SELECT * FROM cibe_social WHERE id IN (
          SELECT MAX(id) FROM cibe_social GROUP BY roaster_id
        ) ORDER BY followers DESC
      `).all();
    }
    return jsonReply(res, 200, { social, count: social.length });
  }

  // ── Correlations ────────────────────────────────────────
  if (sub === 'correlations') {
    try {
      const result = correlationEngine().getCorrelationSummary(db, ctx);
      return jsonReply(res, 200, result);
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── Dossier ──────────────────────────────────────────────
  if (sub === 'dossier' && parts[2]) {
    const roasterId = parts[2];

    // POST /api/cibe/dossier/:roasterId/generate — AI dossier
    if (parts[3] === 'generate' && req.method === 'POST') {
      try {
        const result = await dossierGenerator().generateDossier(db, ctx, roasterId);
        return jsonReply(res, 200, { ok: true, ...result });
      } catch (e) {
        return jsonReply(res, 500, { error: e.message });
      }
    }

    const roaster = registry().getRoaster(db, roasterId);
    if (!roaster) return jsonReply(res, 404, { error: 'Roaster not found' });

    // Aggregate all data for this roaster
    const products = db.prepare('SELECT * FROM cibe_products WHERE roaster_id = ? ORDER BY name').all(roasterId);
    const snapshots = db.prepare('SELECT * FROM cibe_homepage_snapshots WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 5').all(roasterId);
    const edms = db.prepare('SELECT * FROM cibe_edms WHERE roaster_id = ? ORDER BY received_at DESC LIMIT 10').all(roasterId);
    const social = db.prepare('SELECT * FROM cibe_social WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 3').all(roasterId);

    return jsonReply(res, 200, {
      roaster,
      products: { items: products, count: products.length },
      snapshots,
      edms: { items: edms, count: edms.length },
      social
    });
  }

  // ── Scrape status / trigger ──────────────────────────────
  if (sub === 'scrape') {
    if (parts[2] === 'status') {
      const recentJobs = db.prepare(
        'SELECT * FROM cibe_scrape_log ORDER BY started_at DESC LIMIT 20'
      ).all();
      return jsonReply(res, 200, { jobs: recentJobs });
    }
    if (parts[2] === 'trigger' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const jobType = body.job || 'homepage';
        const roasterId = body.roasterId || null;
        // Fire and forget — runs in background
        scrapeOrchestrator().triggerScrape(ctx, jobType, roasterId)
          .then(r => console.log(`[CIBE] On-demand ${jobType} scrape completed:`, r))
          .catch(e => console.error(`[CIBE] On-demand ${jobType} scrape failed:`, e.message));
        return jsonReply(res, 200, { ok: true, message: `${jobType} scrape triggered`, roasterId });
      } catch (e) {
        return jsonReply(res, 400, { error: e.message });
      }
    }
    if (parts[2] === 'cibe-status') {
      return jsonReply(res, 200, scrapeOrchestrator().getCIBEStatus());
    }
    // EDM scrape trigger
    if (parts[2] === 'edms' && req.method === 'POST') {
      edmScraper().scrapeEDMs(db, ctx)
        .then(r => console.log('[CIBE] EDM scrape result:', r))
        .catch(e => console.error('[CIBE] EDM scrape failed:', e.message));
      return jsonReply(res, 200, { ok: true, message: 'EDM scrape triggered' });
    }
    // Trends scrape trigger
    if (parts[2] === 'trends' && req.method === 'POST') {
      trendsScraper().scrapeTrends(db)
        .then(r => console.log('[CIBE] Trends scrape result:', r))
        .catch(e => console.error('[CIBE] Trends scrape failed:', e.message));
      return jsonReply(res, 200, { ok: true, message: 'Trends scrape triggered' });
    }
    return jsonReply(res, 404, { error: 'Unknown scrape endpoint' });
  }

  // ── Overview (dashboard summary) ─────────────────────────
  if (sub === 'overview' || !sub) {
    const roasterCount = db.prepare('SELECT COUNT(*) as n FROM cibe_roasters WHERE active = 1').get().n;
    const productCount = db.prepare('SELECT COUNT(*) as n FROM cibe_products').get().n;
    const briefingCount = db.prepare('SELECT COUNT(*) as n FROM cibe_briefings').get().n;
    const anomalies = anomalyDetector().getAnomalySummary(db);
    const lastBriefing = db.prepare('SELECT id, week, title, created_at FROM cibe_briefings ORDER BY created_at DESC LIMIT 1').get();
    const lastScrape = db.prepare('SELECT * FROM cibe_scrape_log ORDER BY completed_at DESC LIMIT 1').get();

    return jsonReply(res, 200, {
      roasters: roasterCount,
      products: productCount,
      briefings: briefingCount,
      anomalies: { total: anomalies.total, critical: anomalies.critical, warning: anomalies.warning },
      lastBriefing,
      lastScrape
    });
  }

  jsonReply(res, 404, { error: 'Unknown CIBE endpoint' });
}

module.exports = handleCIBE;
