'use strict';

/**
 * Databricks-backed metrics API routes.
 *
 *   GET  /api/databricks/health      — engine config + cache stats
 *   GET  /api/databricks/snapshot    — comprehensive live snapshot (all KPIs)
 *   GET  /api/databricks/pulse       — yesterday + MTD only (fast)
 *   GET  /api/databricks/subs        — active/paused/new/cancelled
 *   GET  /api/databricks/email       — email performance by category + BIEDM by region
 *   GET  /api/databricks/cohort      — cohort retention table
 *   GET  /api/databricks/markets     — market breakdown MTD + SLA
 *   GET  /api/databricks/roasters    — top roasters MTD
 *   POST /api/databricks/query       — safe raw SQL (validates mandatory filters)
 *   POST /api/databricks/cache/clear — invalidate cache
 *
 * Every endpoint falls back gracefully to the static metrics-live.json
 * snapshot when Databricks isn't reachable so the UI never blanks.
 */

const fs = require('fs');
const path = require('path');
const { jsonReply, readBody, readJSON } = require('../lib/helpers');

let _eng = null;
function engine() {
  if (!_eng) _eng = require('../lib/databricks-engine');
  return _eng;
}

function dbConfig(ctx) {
  const db = (ctx && ctx.databricks) || {};
  const genie = (ctx && ctx.genie) || {};
  return {
    host: db.host || genie.host,
    token: db.token || genie.token,
    spaceId: db.spaceId || genie.spaceId,
    warehouseId: db.warehouseId || process.env.DATABRICKS_WAREHOUSE_ID || '',
    clientId: db.clientId || '',
    clientSecret: db.clientSecret || '',
    tenantId: db.tenantId || ''
  };
}

function loadFallbackSnapshot(ctx) {
  try {
    const p = path.join(ctx.intelDir, 'metrics-live.json');
    if (fs.existsSync(p)) return readJSON(p);
  } catch {}
  return null;
}

/** Pull the `live` section written by scripts/write-live-snapshot.js (MCP-sourced). */
function loadCachedLive(ctx) {
  try {
    const snap = loadFallbackSnapshot(ctx);
    if (snap && snap.live) return snap.live;
  } catch {}
  return null;
}

function unavailable(res, message) {
  return jsonReply(res, 200, {
    ok: false,
    configured: false,
    message: message || 'Databricks not configured — set DATABRICKS_HOST, DATABRICKS_TOKEN, and either DATABRICKS_WAREHOUSE_ID or DATABRICKS_GENIE_SPACE_ID in .env',
    fallback: true
  });
}

module.exports = async function handleDatabricks(req, res, parts, url, ctx) {
  const e = engine();
  const cfg = dbConfig(ctx);
  const subpath = (parts[0] || '').toLowerCase();

  // GET /api/databricks/health
  if (subpath === 'health' && req.method === 'GET') {
    const configured = e.isConfigured(cfg);
    const stats = e.cacheStats();
    const authMode = cfg.token ? 'pat' : (cfg.clientId && cfg.clientSecret) ? 'oauth-sp' : null;
    const tok = e.tokenStatus ? e.tokenStatus(cfg) : null;
    return jsonReply(res, 200, {
      ok: true,
      configured,
      host: cfg.host || null,
      hasToken: !!cfg.token,
      hasWarehouseId: !!cfg.warehouseId,
      hasSpaceId: !!cfg.spaceId,
      hasClientCreds: !!(cfg.clientId && cfg.clientSecret),
      authMode,
      tenantId: cfg.tenantId ? cfg.tenantId.slice(0, 8) + '...' : null,
      backend: cfg.warehouseId ? 'sql-warehouse' : cfg.spaceId ? 'genie' : null,
      tokenCache: tok,
      cache: stats,
      benchmarks: Object.keys(e.BENCHMARKS).length,
      schema: e.SCHEMA
    });
  }

  // GET /api/databricks/digest?kind=month&anchor=2026-04-22[&hero=llm]
  if (subpath === 'digest' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const kind = url.searchParams.get('kind') || 'month';
      const anchor = url.searchParams.get('anchor') || null;
      const lookback = parseInt(url.searchParams.get('lookback'), 10) || null;
      const useHero = url.searchParams.get('hero') === 'llm';
      const { assembleDigest } = require('../lib/digest-assembler');
      const snap = await assembleDigest(cfg, { kind, anchor, lookback });

      if (useHero) {
        try {
          const { heroNarrative } = require('../lib/anthropic-narrator');
          const enhancedHero = await heroNarrative(
            { anthropicApiKey: ctx.anthropicApiKey },
            snap,
            snap.narratives.stateOfPlay
          );
          snap.narratives.stateOfPlay = enhancedHero;
          snap.narratives.heroSource = enhancedHero === snap.narratives.stateOfPlay ? 'llm' : 'deterministic';
        } catch {}
      }
      return jsonReply(res, 200, { ok: true, snapshot: snap });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/timeseries?metric=revenue&kind=month&anchor=2026-04-22
  if (subpath === 'timeseries' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const { resolvePeriod } = require('../lib/period-spec');
      const { sqlTimeSeries } = require('../lib/databricks-digest-queries');
      const kind = url.searchParams.get('kind') || 'month';
      const anchor = url.searchParams.get('anchor') || null;
      const period = resolvePeriod({ kind, anchor });
      const result = await e.executeSQL(cfg, sqlTimeSeries(period), { ttlMinutes: 60, tag: 'ts-' + kind });
      return jsonReply(res, 200, {
        ok: true,
        period,
        rows: e.rowsToObjects(result),
        source: result.source,
        cached: !!result.cached
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/probe — lightweight connectivity test
  if (subpath === 'probe' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const t0 = Date.now();
      const result = await e.executeSQL(cfg, "SELECT current_catalog() AS catalog, current_user() AS user, current_date() AS today", {
        skipCache: true, ttlMinutes: 1, tag: 'probe'
      });
      return jsonReply(res, 200, {
        ok: true,
        executionMs: Date.now() - t0,
        source: result.source,
        row: result.rows && result.rows[0] ? {
          catalog: result.rows[0][0],
          user: result.rows[0][1],
          today: result.rows[0][2]
        } : null
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/pulse
  if (subpath === 'pulse' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) {
      // Use the cached MCP-sourced snapshot if it exists
      const live = loadCachedLive(ctx);
      if (live && (live.yesterday || live.mtd)) {
        return jsonReply(res, 200, {
          ok: true, source: live.source || 'databricks-mcp-cached',
          yesterday: live.yesterday || {},
          mtd: live.mtd || {},
          activeSubs: live.activeSubs || {},
          cached: { yesterday: true, mtd: true, subs: true },
          generatedAt: live.refreshedAt || null,
          note: 'Served from cached MCP snapshot. Run scripts/write-live-snapshot.js in a Claude session with Databricks MCP access to refresh.'
        });
      }
      const fb = loadFallbackSnapshot(ctx);
      return jsonReply(res, 200, {
        ok: false, configured: false, fallback: true,
        message: 'Live Databricks not configured and no cached MCP snapshot available',
        snapshot: fb
      });
    }
    try {
      const [y, mtd, subs] = await Promise.all([
        e.getYesterdayPulse(cfg),
        e.getMTD(cfg),
        e.getActiveSubs(cfg)
      ]);
      return jsonReply(res, 200, {
        ok: true,
        yesterday: y.data,
        mtd: mtd.data,
        activeSubs: subs.data,
        source: y.source,
        cached: { yesterday: y.cached, mtd: mtd.cached, subs: subs.cached },
        generatedAt: new Date().toISOString()
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message, fallback: true, snapshot: loadFallbackSnapshot(ctx) });
    }
  }

  // GET /api/databricks/snapshot
  if (subpath === 'snapshot' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) {
      return jsonReply(res, 200, {
        ok: false, configured: false, fallback: true,
        snapshot: loadFallbackSnapshot(ctx)
      });
    }
    try {
      const includeEmail = url.searchParams.get('email') !== 'false';
      const includeCohort = url.searchParams.get('cohort') !== 'false';
      const snap = await e.getFullSnapshot(cfg, { includeEmail, includeCohort });
      return jsonReply(res, 200, { ok: true, snapshot: snap });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message, fallback: true, snapshot: loadFallbackSnapshot(ctx) });
    }
  }

  // GET /api/databricks/subs
  if (subpath === 'subs' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const r = await e.getActiveSubs(cfg);
      return jsonReply(res, 200, { ok: true, ...r });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/email/sends?days=90&minSends=50
  if (subpath === 'email' && (parts[1] || '').toLowerCase() === 'sends' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const days = parseInt(url.searchParams.get('days'), 10) || 90;
      const minSends = parseInt(url.searchParams.get('minSends'), 10) || 50;
      const r = await e.getEmailSendPerf(cfg, days, minSends);
      return jsonReply(res, 200, { ok: true, days, minSends, count: r.data.length, sends: r.data, source: r.source, cached: r.cached });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/email/links?days=90
  if (subpath === 'email' && (parts[1] || '').toLowerCase() === 'links' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const days = parseInt(url.searchParams.get('days'), 10) || 90;
      const r = await e.getEmailLinkPerf(cfg, days);
      return jsonReply(res, 200, { ok: true, days, count: r.data.length, links: r.data, source: r.source, cached: r.cached });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/email/by-name?name=BIEDM%20-%20beanz...&days=180
  if (subpath === 'email' && (parts[1] || '').toLowerCase() === 'by-name' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const name = url.searchParams.get('name') || '';
      if (!name) return jsonReply(res, 400, { ok: false, error: 'Missing ?name= parameter' });
      const days = parseInt(url.searchParams.get('days'), 10) || 180;
      const r = await e.getEmailByName(cfg, name, days);
      return jsonReply(res, 200, { ok: true, name, days, data: r.data, source: r.source, cached: r.cached });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/email
  if (subpath === 'email' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) {
      const live = loadCachedLive(ctx);
      if (live && live.emailByCategory) {
        return jsonReply(res, 200, {
          ok: true,
          byCategory: live.emailByCategory,
          biedmByRegion: live.biedmRegion || [],
          source: live.source || 'databricks-mcp-cached',
          cached: { category: true, biedm: true },
          generatedAt: live.refreshedAt || null
        });
      }
      return unavailable(res);
    }
    try {
      const [perf, biedm] = await Promise.all([
        e.getEmailPerformance(cfg),
        e.getBIEDMByRegion(cfg)
      ]);
      return jsonReply(res, 200, {
        ok: true,
        byCategory: perf.data,
        biedmByRegion: biedm.data,
        source: perf.source,
        cached: { category: perf.cached, biedm: biedm.cached },
        generatedAt: new Date().toISOString()
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/cohort
  if (subpath === 'cohort' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) {
      const live = loadCachedLive(ctx);
      if (live && live.cohortRetention) {
        return jsonReply(res, 200, {
          ok: true,
          data: live.cohortRetention,
          source: live.source || 'databricks-mcp-cached',
          cached: true,
          generatedAt: live.refreshedAt || null
        });
      }
      return unavailable(res);
    }
    try {
      const r = await e.getCohortRetention(cfg);
      return jsonReply(res, 200, { ok: true, ...r });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/markets
  if (subpath === 'markets' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const [market, sla] = await Promise.all([
        e.getMarketMTD(cfg),
        e.getSLA30(cfg)
      ]);
      return jsonReply(res, 200, {
        ok: true,
        marketMTD: market.data,
        sla30d: sla.data,
        source: market.source,
        cached: { market: market.cached, sla: sla.cached }
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // GET /api/databricks/roasters
  if (subpath === 'roasters' && req.method === 'GET') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const limit = parseInt(url.searchParams.get('limit'), 10) || 15;
      const r = await e.getTopRoastersMTD(cfg, limit);
      return jsonReply(res, 200, { ok: true, ...r });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // POST /api/databricks/query — raw SQL (validated)
  if (subpath === 'query' && req.method === 'POST') {
    if (!e.isConfigured(cfg)) return unavailable(res);
    try {
      const body = await readBody(req);
      const sql = (body.sql || '').trim();
      if (!sql) return jsonReply(res, 400, { ok: false, error: 'Missing sql in request body' });

      const val = e.validateSQL(sql);
      if (!val.ok) return jsonReply(res, 400, { ok: false, error: 'SQL validation failed', issues: val.issues });

      const t0 = Date.now();
      const result = await e.executeSQL(cfg, sql, { skipCache: !!body.skipCache, ttlMinutes: body.ttlMinutes || 30, tag: 'ad-hoc' });
      return jsonReply(res, 200, {
        ok: true,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        source: result.source,
        cached: !!result.cached,
        executionMs: Date.now() - t0
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // POST /api/databricks/refresh — pull fresh snapshot and persist to metrics-live.json
  if (subpath === 'refresh' && req.method === 'POST') {
    if (!e.isConfigured(cfg)) {
      return jsonReply(res, 200, {
        ok: false,
        configured: false,
        message: 'Live refresh needs a Databricks token. Add DATABRICKS_TOKEN=dapi... to .env (Workspace Settings → Developer → Access tokens).',
        howToRefreshNow: 'Ask Claude to "refresh the Beanz live snapshot" in this session — Claude has the MCP connector and can re-run the queries and rewrite metrics-live.json.'
      });
    }
    try {
      const snap = await e.getFullSnapshot(cfg, { includeEmail: true, includeCohort: true });
      // Persist to metrics-live.json under the `live` section
      const target = path.join(ctx.intelDir, 'metrics-live.json');
      let existing = {};
      try { existing = JSON.parse(fs.readFileSync(target, 'utf8')); } catch {}
      existing.live = {
        refreshedAt: new Date().toISOString(),
        source: snap.source || 'databricks-live',
        yesterday: snap.yesterday || {},
        mtd: snap.mtd || {},
        activeSubs: snap.activeSubs || {},
        marketMTD: snap.marketMTD || [],
        topRoasters: snap.topRoasters || [],
        ftbpPrograms: snap.ftbpPrograms || [],
        pbb: snap.pbb || [],
        sla30: snap.sla30 || [],
        slaMonthly: snap.slaMonthly || [],
        cancellationReasons: snap.cancellationReasons || [],
        mom: snap.mom || [],
        yoy: snap.yoy || [],
        daily30: snap.daily30 || [],
        emailByCategory: snap.emailPerformance || [],
        biedmRegion: snap.biedmRegion || [],
        cohortRetention: snap.cohortRetention || [],
        waterfall: snap.waterfall || [],
        periodKPIs: snap.periodKPIs || [],
        audit: snap.audit || null,
        insights: snap.insights || []
      };
      existing.generated_at = new Date().toISOString();
      fs.writeFileSync(target, JSON.stringify(existing, null, 2), 'utf8');
      return jsonReply(res, 200, {
        ok: true,
        source: snap.source,
        refreshedAt: existing.live.refreshedAt,
        audit: snap.audit,
        insights: snap.insights,
        errors: snap.errors || {},
        persistedTo: 'kb-data/intelligence/metrics-live.json'
      });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  // POST /api/databricks/cache/clear
  if (subpath === 'cache' && (parts[1] || '').toLowerCase() === 'clear' && req.method === 'POST') {
    try {
      const body = await readBody(req).catch(() => ({}));
      e.cacheInvalidate(body.tag);
      return jsonReply(res, 200, { ok: true, cleared: body.tag || 'all' });
    } catch (err) {
      return jsonReply(res, 200, { ok: false, error: err.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown databricks endpoint: ' + subpath });
};
