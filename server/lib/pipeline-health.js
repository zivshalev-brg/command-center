/**
 * pipeline-health.js — Read-only aggregator for news/transcript/digest pipeline state.
 *
 * Used by /api/news/pipeline/health and /api/tech-news/pipeline/health to let the UI
 * show at a glance whether the ingest → transcribe → digest chain is working.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const newsEngine = require('./news-engine');
const db = require('./db');

const TRANSCRIPT_DIR = path.join(__dirname, '..', '..', 'news-transcripts');

/**
 * Build a health report for one news pipeline (coffee or tech).
 * @param {object} opts
 * @param {string} opts.storePath — path to news store JSON (ctx.newsStore or ctx.techNewsStore)
 * @param {string} opts.digestPrefix — 'coffee_research_' or 'tech_research_'
 */
function buildPipelineHealth(opts) {
  const storePath = opts && opts.storePath;
  const digestPrefix = (opts && opts.digestPrefix) || 'coffee_research_';

  const health = {
    generatedAt: new Date().toISOString(),
    store: { ok: false, lastRefreshed: null, articleCount: 0, ytCount: 0 },
    transcripts: { total: 0, usable: 0, negative: 0, thin: 0, corrupt: 0 },
    digest: { daily: null, weekly: null },
    warnings: []
  };

  // ── Store state ──
  try {
    const store = newsEngine.loadNewsStore(storePath);
    const articles = Array.isArray(store.articles) ? store.articles : [];
    health.store.ok = true;
    health.store.lastRefreshed = store.lastRefreshed || null;
    health.store.articleCount = articles.length;
    health.store.ytCount = articles.filter(a => a.videoId).length;
    if (!articles.length) health.warnings.push('no articles in store');
  } catch (e) {
    health.warnings.push('store load failed: ' + e.message);
  }

  // ── Transcript cache state ──
  try {
    if (fs.existsSync(TRANSCRIPT_DIR)) {
      const files = fs.readdirSync(TRANSCRIPT_DIR).filter(f => f.endsWith('.json'));
      health.transcripts.total = files.length;
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(TRANSCRIPT_DIR, f), 'utf-8'));
          if (data.failedAt || data.error) {
            health.transcripts.negative++;
          } else if (newsEngine.isTranscriptUsable(data)) {
            health.transcripts.usable++;
          } else {
            health.transcripts.thin++;
          }
        } catch (_) {
          health.transcripts.corrupt++;
        }
      }
      if (health.transcripts.total && !health.transcripts.usable) {
        health.warnings.push('no usable transcripts cached');
      }
    }
  } catch (e) {
    health.warnings.push('transcript scan failed: ' + e.message);
  }

  // ── Digest freshness ──
  try {
    const daily = db.getLatestNewsDigest(digestPrefix + 'daily');
    const weekly = db.getLatestNewsDigest(digestPrefix + 'weekly');
    if (daily) {
      health.digest.daily = {
        generatedAt: daily.generated_at || null,
        articleCount: daily.article_count || 0,
        modelUsed: daily.model_used || null,
        ageHours: daily.generated_at ? _hoursSince(daily.generated_at) : null
      };
    }
    if (weekly) {
      health.digest.weekly = {
        generatedAt: weekly.generated_at || null,
        articleCount: weekly.article_count || 0,
        modelUsed: weekly.model_used || null,
        ageHours: weekly.generated_at ? _hoursSince(weekly.generated_at) : null
      };
    }
    if (health.digest.daily && health.digest.daily.ageHours > 36) {
      health.warnings.push('daily digest is stale (' + Math.round(health.digest.daily.ageHours) + 'h old)');
    }
    if (!health.digest.daily) {
      health.warnings.push('no daily digest cached');
    }
  } catch (e) {
    health.warnings.push('digest lookup failed: ' + e.message);
  }

  health.ok = health.warnings.length === 0;
  return health;
}

function _hoursSince(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3600000;
}

module.exports = { buildPipelineHealth };
