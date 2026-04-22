'use strict';

/**
 * Digest assembler — orchestrates all period-aware slice queries
 * in parallel and returns a fully-composed snapshot.
 *
 *   const { assembleDigest } = require('./digest-assembler');
 *   const snap = await assembleDigest(cfg, { kind: 'month', anchor: '2026-04-22' });
 *
 * Returns:
 *   {
 *     period: {...},              // resolved period spec
 *     generatedAt, source,
 *     headline, timeSeries, segmentMix, aovDecomp, programMix,
 *     marketMix, roasterTiers, motAchievement, subscriberLifecycle,
 *     cohortRetention, nrr, repeatPurchase, reactivation,
 *     ftbpFunnel, cancellationReasons, slaDeepDive, promotionLift,
 *     channelMix,
 *     audit,                      // basic data-quality audit
 *     narratives,                 // deterministic commentary
 *     errors                      // per-slice failures
 *   }
 */

const { resolvePeriod } = require('./period-spec');
const Q = require('./databricks-digest-queries');
const engine = require('./databricks-engine');
const narrator = require('./metrics-narrator');

async function runSlice(cfg, name, sql, ttlMinutes) {
  try {
    const res = await engine.executeSQL(cfg, sql, { ttlMinutes: ttlMinutes || 60, tag: 'digest-' + name });
    return { ok: true, rows: engine.rowsToObjects(res), source: res.source, cached: res.cached };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function ttlForPeriod(kind) {
  switch (kind) {
    case 'day':     return 15;
    case 'week':    return 30;
    case 'month':   return 120;
    case 'quarter': return 360;
    case 'year':
    case 'fiscal-year': return 720;
    default: return 60;
  }
}

async function assembleDigest(cfg, spec) {
  const period = resolvePeriod(spec || {});
  const ttl = ttlForPeriod(period.kind);

  const slices = {
    headline:              Q.sqlHeadline(period),
    timeSeries:            Q.sqlTimeSeries(period),
    segmentMix:            Q.sqlSegmentMix(period),
    aovDecomp:             Q.sqlAOVDecomp(period),
    programMix:            Q.sqlProgramMix(period),
    marketMix:             Q.sqlMarketMix(period),
    roasterTiers:          Q.sqlRoasterTiers(period, 25),
    motAchievement:        Q.sqlMOTAchievement(period),
    subscriberLifecycle:   Q.sqlSubscriberLifecycle(period),
    cohortRetention:       Q.sqlCohortRetention(period, 12),
    nrr:                   Q.sqlNRR(period),
    repeatPurchase:        Q.sqlRepeatPurchase(period),
    reactivation:          Q.sqlReactivation(period),
    ftbpFunnel:            Q.sqlFTBPFunnel(period),
    cancellationReasons:   Q.sqlCancellationReasons(period, 15),
    slaDeepDive:           Q.sqlSLADeepDive(period),
    promotionLift:         Q.sqlPromotionLift(period),
    channelMix:            Q.sqlChannelMix(period)
  };

  const entries = Object.entries(slices);
  const results = await Promise.all(entries.map(([name, sql]) => runSlice(cfg, name, sql, ttl)));

  const out = {
    period,
    generatedAt: new Date().toISOString(),
    source: null,
    cached: {},
    errors: {}
  };

  entries.forEach(([name], i) => {
    const r = results[i];
    if (r.ok) {
      out[name] = r.rows;
      out.cached[name] = !!r.cached;
      out.source = out.source || r.source;
    } else {
      out[name] = [];
      out.errors[name] = r.error;
    }
  });

  out.audit = quickAudit(out);
  out.narratives = narrator.narrate(out);
  return out;
}

function quickAudit(snap) {
  const issues = [];
  const ok = [];
  const head = (snap.headline || []).find(r => r.win === 'current');
  if (head) {
    const bags = +head.bags || 0;
    const kg = +head.kg || 0;
    if (bags > 0) {
      const ratio = kg / bags;
      if (ratio < 0.20 || ratio > 0.45) {
        issues.push({ severity: 'critical', metric: 'kg_per_bag', detail: `kg/bag ratio ${ratio.toFixed(3)} outside sane range [0.20, 0.45]` });
      } else {
        ok.push('kg_per_bag_ratio');
      }
    }
    const aov = +head.aov || 0;
    if (aov > 0 && (aov < 15 || aov > 120)) {
      issues.push({ severity: 'warning', metric: 'aov', detail: `AOV $${aov.toFixed(2)} outside expected [$15–$120]` });
    } else if (aov > 0) {
      ok.push('aov');
    }
    if (head.orders > 0 && head.customers === 0) {
      issues.push({ severity: 'warning', metric: 'customer_count', detail: 'Non-zero orders but zero distinct customers — CustomerEmail null?' });
    }
  }
  const errKeys = Object.keys(snap.errors || {});
  if (errKeys.length) {
    issues.push({ severity: 'warning', metric: 'slice_failures', detail: `Failed slices: ${errKeys.join(', ')}` });
  }
  return { ok, issues, score: ok.length - issues.length * 2, generatedAt: new Date().toISOString() };
}

module.exports = { assembleDigest, quickAudit };
