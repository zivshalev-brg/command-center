'use strict';

/**
 * Deterministic commentary generator for the Metrics Digest.
 *
 * Takes a resolved snapshot from the digest assembler and returns
 * a `narratives` object keyed by section. Each narrative is a short
 * sentence (or two) explaining the number and what drove it.
 *
 * Rules-based so it's:
 *   - deterministic (same input → same output, useful in tests)
 *   - fast (sub-millisecond)
 *   - auditable (each rule is a named function)
 *
 * Optional LLM enhancement is a separate module (anthropic-narrator.js).
 */

const SIGNIFICANCE = {
  revenuePctAbs: 5,           // flag deltas > 5 %
  revenueAbsoluteAUD: 50000,  // or absolute > $50K
  subsPctAbs: 2,
  subsAbsolute: 500,
  openRatePp: 3,              // percentage points
  leadTimeDays: 0.5
};

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
function fmtCur(v) {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v/1e3).toFixed(0) + 'K';
  return '$' + Math.round(v).toLocaleString();
}
function fmtN(v) {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v/1e3).toFixed(1) + 'K';
  return Math.round(v).toLocaleString();
}
function sign(n, digits) {
  if (n == null || isNaN(n)) return '';
  const d = digits == null ? 1 : digits;
  return (n > 0 ? '+' : '') + n.toFixed(d) + '%';
}

function findWin(rows, win) {
  if (!Array.isArray(rows)) return null;
  return rows.find(r => r && r.win === win) || null;
}

// ─── Narrators (one per section) ─────────────────────────────

function narrateStateOfPlay(snap) {
  const h = snap.headline || [];
  const curr = findWin(h, 'current');
  const prev = findWin(h, 'previous');
  const yoy = findWin(h, 'yoy');
  if (!curr) return 'No data for the selected period.';

  const pieces = [];
  pieces.push(`${fmtCur(curr.revenue)} revenue, ${fmtN(curr.bags)} bags, ${fmtN(curr.customers)} customers.`);

  if (prev) {
    const momRev = pctChange(+curr.revenue, +prev.revenue);
    const momCust = pctChange(+curr.customers, +prev.customers);
    if (momRev != null && Math.abs(momRev) >= SIGNIFICANCE.revenuePctAbs) {
      pieces.push(`${sign(momRev)} vs prior period (${fmtCur(prev.revenue)}).`);
    } else if (momRev != null) {
      pieces.push(`Roughly flat vs prior period (${sign(momRev)}).`);
    }
    if (momCust != null && Math.abs(momCust) >= 5) {
      pieces.push(`Customer base ${momCust > 0 ? 'expanded' : 'contracted'} ${sign(momCust, 0)}.`);
    }
  }

  if (yoy) {
    const yoyRev = pctChange(+curr.revenue, +yoy.revenue);
    if (yoyRev != null && Math.abs(yoyRev) >= SIGNIFICANCE.revenuePctAbs) {
      pieces.push(`YoY ${sign(yoyRev)} (${fmtCur(yoy.revenue)} a year ago).`);
    }
  }

  return pieces.join(' ');
}

function narrateHeadline(snap) {
  const h = snap.headline || [];
  const curr = findWin(h, 'current');
  const prev = findWin(h, 'previous');
  if (!curr || !prev) return '';

  const flags = [];
  const aovDelta = pctChange(+curr.aov, +prev.aov);
  if (aovDelta != null && Math.abs(aovDelta) > 3) {
    flags.push(`AOV ${aovDelta > 0 ? 'climbed' : 'fell'} ${sign(aovDelta)} to ${fmtCur(curr.aov)}`);
  }
  const bagsDelta = pctChange(+curr.bags, +prev.bags);
  if (bagsDelta != null && Math.abs(bagsDelta) > 5) {
    flags.push(`bag volume ${bagsDelta > 0 ? 'up' : 'down'} ${sign(bagsDelta)}`);
  }
  const ftbpShare = curr.revenue > 0 ? (curr.ftbp_revenue / curr.revenue) * 100 : 0;
  const prevFtbpShare = prev.revenue > 0 ? (prev.ftbp_revenue / prev.revenue) * 100 : 0;
  const ftbpDelta = ftbpShare - prevFtbpShare;
  if (Math.abs(ftbpDelta) > 2) {
    flags.push(`FTBP share ${ftbpDelta > 0 ? 'grew' : 'shrank'} ${Math.abs(ftbpDelta).toFixed(1)}pp to ${ftbpShare.toFixed(0)}%`);
  }
  const firstOrderShare = curr.orders > 0 ? (curr.first_orders / curr.orders) * 100 : 0;
  flags.push(`${firstOrderShare.toFixed(0)}% of orders are first-time`);

  return flags.length ? flags.join(' · ') + '.' : '';
}

function narrateProgramMix(snap) {
  const rows = snap.programMix || [];
  const curr = rows.filter(r => r.win === 'current');
  const prev = rows.filter(r => r.win === 'previous');
  if (!curr.length) return '';

  const byProgramCurr = Object.fromEntries(curr.map(r => [r.program, r]));
  const byProgramPrev = Object.fromEntries(prev.map(r => [r.program, r]));

  const totalCurr = curr.reduce((s, r) => s + (+r.revenue || 0), 0);
  const drivers = [];
  for (const p of Object.keys(byProgramCurr)) {
    const c = byProgramCurr[p];
    const pv = byProgramPrev[p];
    if (!pv) continue;
    const delta = (+c.revenue) - (+pv.revenue);
    if (Math.abs(delta) > 50000) drivers.push({ program: p, delta });
  }
  drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (!drivers.length) return `Split across ${curr.length} programs.`;
  const top = drivers[0];
  const share = totalCurr ? (+byProgramCurr[top.program].revenue / totalCurr * 100) : 0;
  return `${top.program} ${top.delta > 0 ? 'added' : 'shed'} ${fmtCur(Math.abs(top.delta))} vs prior period (now ${share.toFixed(0)}% of revenue).`;
}

function narrateMarketMix(snap) {
  const rows = snap.marketMix || [];
  const curr = rows.filter(r => r.win === 'current').sort((a,b) => (+b.revenue)-(+a.revenue));
  const prev = rows.filter(r => r.win === 'previous');
  if (!curr.length) return '';

  const top = curr[0];
  const total = curr.reduce((s, r) => s + (+r.revenue || 0), 0);
  const share = total ? (+top.revenue / total * 100) : 0;

  // find biggest market mover
  const byMktPrev = Object.fromEntries(prev.map(r => [r.Country, r]));
  const movers = curr.map(c => {
    const p = byMktPrev[c.Country];
    if (!p) return null;
    return { country: c.Country, delta: (+c.revenue) - (+p.revenue), deltaPct: pctChange(+c.revenue, +p.revenue) };
  }).filter(Boolean).sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));

  let s = `${top.Country} leads with ${fmtCur(top.revenue)} (${share.toFixed(0)}%).`;
  if (movers[0] && Math.abs(movers[0].delta) > 30000) {
    const m = movers[0];
    s += ` ${m.country} ${m.delta > 0 ? 'gained' : 'lost'} ${fmtCur(Math.abs(m.delta))} vs prior.`;
  }
  return s;
}

function narrateSubscribers(snap) {
  const life = (snap.subscriberLifecycle || []).find(r => r.win === 'current');
  const lifePrev = (snap.subscriberLifecycle || []).find(r => r.win === 'previous');
  if (!life) return '';

  const net = (+life.new_subs || 0) - (+life.cancelled || 0);
  let s = `Net ${net > 0 ? '+' : ''}${fmtN(net)} subscribers (new ${fmtN(life.new_subs)} / cancelled ${fmtN(life.cancelled)}).`;
  if (lifePrev) {
    const netPrev = (+lifePrev.new_subs || 0) - (+lifePrev.cancelled || 0);
    const delta = net - netPrev;
    if (Math.abs(delta) >= 50) {
      s += ` ${delta > 0 ? 'Better' : 'Worse'} than prior period (${netPrev > 0 ? '+' : ''}${fmtN(netPrev)}).`;
    }
  }
  if (life.paused > 0) s += ` ${fmtN(life.paused)} pauses.`;
  return s;
}

function narrateNRR(snap) {
  const nrr = snap.nrr && snap.nrr[0];
  if (!nrr) return '';
  const pct = +nrr.nrr_pct;
  const retention = +nrr.customer_retention_pct;
  if (isNaN(pct)) return '';

  let s = `NRR ${pct.toFixed(0)}% from the prior-period cohort (${fmtN(nrr.prior_cohort_size)} customers).`;
  if (pct >= 100) s += ' Existing customers are net-expanding.';
  else if (pct >= 85) s += ' Mild contraction — retained customers spending less.';
  else s += ' Strong contraction — revisit retention + expansion programs.';
  if (!isNaN(retention)) s += ` ${retention.toFixed(0)}% customer retention.`;
  return s;
}

function narrateChannels(snap) {
  const rows = (snap.channelMix || []).filter(r => r.win === 'current').sort((a,b) => (+b.revenue)-(+a.revenue));
  if (!rows.length) return '';
  const total = rows.reduce((s, r) => s + (+r.revenue || 0), 0);
  if (!total) return '';
  const top = rows[0];
  const share = (+top.revenue / total * 100);
  return `${top.channel} drives ${share.toFixed(0)}% of revenue (${fmtCur(top.revenue)}). ${rows.length} channels active.`;
}

function narrateRoasters(snap) {
  const rows = (snap.roasterTiers || []).filter(r => r.win === 'current');
  if (!rows.length) return '';
  const top3 = rows.slice(0, 3).map(r => r.roaster);
  const total = rows.reduce((s, r) => s + (+r.revenue || 0), 0);
  const top3Rev = rows.slice(0, 3).reduce((s, r) => s + (+r.revenue || 0), 0);
  const share = total ? (top3Rev / total * 100) : 0;
  return `Top 3 roasters (${top3.join(', ')}) are ${share.toFixed(0)}% of measured revenue across ${rows.length} vendors.`;
}

function narrateOperations(snap) {
  const sla = snap.slaDeepDive || [];
  if (!sla.length) return '';
  const byMarket = {};
  sla.forEach(r => {
    const m = r.market;
    if (!byMarket[m]) byMarket[m] = { shipments: 0, sumLead: 0, n: 0 };
    byMarket[m].shipments += +r.shipments || 0;
    byMarket[m].sumLead += (+r.avg_lead_time || 0) * (+r.shipments || 0);
    byMarket[m].n += +r.shipments || 0;
  });
  const stressed = [];
  for (const m of Object.keys(byMarket)) {
    const avg = byMarket[m].n ? byMarket[m].sumLead / byMarket[m].n : 0;
    if (avg > 5) stressed.push({ market: m, avg });
  }
  const total = sla.reduce((s, r) => s + (+r.shipments || 0), 0);
  let s = `${fmtN(total)} shipments across ${Object.keys(byMarket).length} markets.`;
  if (stressed.length) {
    stressed.sort((a,b) => b.avg - a.avg);
    s += ` Lead time stress: ${stressed.map(x => `${x.market} ${x.avg.toFixed(1)}d`).join(', ')}.`;
  } else {
    s += ' All markets within 5-day lead time.';
  }
  return s;
}

function narrateSignal(snap) {
  const curr = (snap.cancellationReasons || []).filter(r => r.win === 'current');
  if (!curr.length) return '';
  const top = curr[0];
  const total = curr.reduce((s, r) => s + (+r.cases || 0), 0);
  const share = total ? (+top.cases / total * 100) : 0;
  return `Top cancellation reason: "${String(top.reason).slice(0, 50)}" — ${fmtN(top.cases)} cases (${share.toFixed(0)}%).`;
}

function narrateFTBP(snap) {
  const rows = snap.ftbpFunnel || [];
  const v2 = rows.find(r => r.release === 'FTBP v2');
  const v1 = rows.find(r => r.release === 'FTBP v1');
  const parts = [];
  if (v2) parts.push(`v2: ${fmtN(v2.registrations)} regs → ${v2.paid_conversion_pct}% paid conversion (avg ${v2.avg_days_to_paid}d to first paid)`);
  if (v1) parts.push(`v1: ${fmtN(v1.registrations)} regs → ${v1.paid_conversion_pct}% paid`);
  return parts.length ? parts.join(' · ') + '.' : '';
}

function narrateAudit(snap) {
  const a = snap.audit || {};
  const issues = (a.issues || []).length;
  if (!issues) return 'All data-quality checks passed.';
  const critical = (a.issues || []).filter(i => i.severity === 'critical').length;
  if (critical) return `${critical} critical data-quality issue${critical>1?'s':''} — verify before acting on these numbers.`;
  return `${issues} data-quality warning${issues>1?'s':''} worth noting.`;
}

// ─── Main entry ──────────────────────────────────────────────

function narrate(snapshot) {
  return {
    stateOfPlay: narrateStateOfPlay(snapshot),
    headline:    narrateHeadline(snapshot),
    programMix:  narrateProgramMix(snapshot),
    marketMix:   narrateMarketMix(snapshot),
    subscribers: narrateSubscribers(snapshot),
    nrr:         narrateNRR(snapshot),
    channels:    narrateChannels(snapshot),
    roasters:    narrateRoasters(snapshot),
    operations:  narrateOperations(snapshot),
    signal:      narrateSignal(snapshot),
    ftbp:        narrateFTBP(snapshot),
    audit:       narrateAudit(snapshot)
  };
}

module.exports = {
  narrate,
  // individual narrators for tests + cherry-picking
  narrateStateOfPlay,
  narrateHeadline,
  narrateProgramMix,
  narrateMarketMix,
  narrateSubscribers,
  narrateNRR,
  narrateChannels,
  narrateRoasters,
  narrateOperations,
  narrateSignal,
  narrateFTBP,
  narrateAudit
};
