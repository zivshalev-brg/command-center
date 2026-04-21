'use strict';

// Exponential time-decay helpers for the self-learning engine.
// A 45-day half-life means a pin from today contributes 1.0 weight,
// a pin from 45 days ago contributes 0.5, 90 days ago 0.25, etc.
// Never reaches zero — so old signal decays gracefully rather than cliff-drops.

const HALF_LIFE_DAYS = 45;
const MS_PER_DAY = 86400000;

function decayFactor(ageDays, halfLifeDays) {
  if (ageDays <= 0) return 1;
  const hl = halfLifeDays || HALF_LIFE_DAYS;
  return Math.pow(0.5, ageDays / hl);
}

function decayFactorFromDate(createdAt, now, halfLifeDays) {
  if (!createdAt) return 1;
  const nowMs = now == null ? Date.now() : now;
  let createdMs;
  if (typeof createdAt === 'number') {
    createdMs = createdAt;
  } else {
    let s = String(createdAt);
    // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC with no 'Z' suffix.
    // Without the suffix, JS parses it as local time — off by the timezone offset.
    // Normalise SQLite format to ISO UTC before parsing.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    createdMs = new Date(s).getTime();
  }
  if (!isFinite(createdMs)) return 1;
  const ageDays = (nowMs - createdMs) / MS_PER_DAY;
  return decayFactor(ageDays, halfLifeDays);
}

function sumDecayed(events, createdAtField, now, halfLifeDays) {
  if (!events || events.length === 0) return 0;
  const nowMs = now == null ? Date.now() : now;
  let sum = 0;
  for (const ev of events) {
    sum += decayFactorFromDate(ev[createdAtField], nowMs, halfLifeDays);
  }
  return sum;
}

// Pin multiplier: boosts score up to 1.728x (down from previous 3.375x cap).
// Cap at 3 decayed pins — more than that adds only marginal lift.
function pinMultiplier(decayedPins) {
  const cap = Math.min(decayedPins, 3);
  return Math.pow(1.2, cap);
}

// Dismiss multiplier: penalises down to 0.064x (unchanged — dismiss is a strong signal).
function dismissMultiplier(decayedDismisses) {
  const cap = Math.min(decayedDismisses, 3);
  return Math.pow(0.4, cap);
}

module.exports = {
  HALF_LIFE_DAYS,
  MS_PER_DAY,
  decayFactor,
  decayFactorFromDate,
  sumDecayed,
  pinMultiplier,
  dismissMultiplier
};
