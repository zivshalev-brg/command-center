'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HALF_LIFE_DAYS,
  MS_PER_DAY,
  decayFactor,
  decayFactorFromDate,
  sumDecayed,
  pinMultiplier,
  dismissMultiplier
} = require('../server/lib/decay');

test('decayFactor: today returns 1', () => {
  assert.equal(decayFactor(0), 1);
});

test('decayFactor: exactly one half-life returns 0.5', () => {
  assert.equal(decayFactor(HALF_LIFE_DAYS), 0.5);
});

test('decayFactor: two half-lives returns 0.25', () => {
  assert.equal(decayFactor(HALF_LIFE_DAYS * 2), 0.25);
});

test('decayFactor: three half-lives returns 0.125', () => {
  assert.equal(decayFactor(HALF_LIFE_DAYS * 3), 0.125);
});

test('decayFactor: never reaches zero (200 days still positive)', () => {
  const f = decayFactor(200);
  assert.ok(f > 0);
  assert.ok(f < 0.1);
});

test('decayFactor: custom half-life honoured', () => {
  assert.equal(decayFactor(30, 30), 0.5);
});

test('decayFactor: negative age (future date) returns 1', () => {
  assert.equal(decayFactor(-5), 1);
});

test('decayFactorFromDate: ISO string input works', () => {
  const now = Date.UTC(2026, 3, 20);
  const created = new Date(now - 45 * MS_PER_DAY).toISOString();
  const f = decayFactorFromDate(created, now);
  assert.ok(Math.abs(f - 0.5) < 1e-9);
});

test('decayFactorFromDate: null input returns 1', () => {
  assert.equal(decayFactorFromDate(null, Date.now()), 1);
});

test('decayFactorFromDate: invalid date returns 1', () => {
  assert.equal(decayFactorFromDate('not-a-date', Date.now()), 1);
});

test('decayFactorFromDate: SQLite format (no Z) parsed as UTC, not local', () => {
  // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' with no timezone.
  // If we parse as local time, a freshly-inserted row would read as hours old.
  const now = Date.UTC(2026, 3, 20, 12, 0, 0);
  const sqliteStamp = '2026-04-20 12:00:00';
  const f = decayFactorFromDate(sqliteStamp, now);
  assert.equal(f, 1);
});

test('decayFactorFromDate: ISO with Z still works', () => {
  const now = Date.UTC(2026, 3, 20, 12, 0, 0);
  const f = decayFactorFromDate('2026-04-20T12:00:00Z', now);
  assert.equal(f, 1);
});

test('sumDecayed: empty array returns 0', () => {
  assert.equal(sumDecayed([], 'created_at'), 0);
});

test('sumDecayed: 3 events today sum to 3', () => {
  const now = Date.now();
  const events = [
    { created_at: now },
    { created_at: now },
    { created_at: now }
  ];
  assert.equal(sumDecayed(events, 'created_at', now), 3);
});

test('sumDecayed: 2 events at 1 half-life sum to 1', () => {
  const now = Date.UTC(2026, 3, 20);
  const oneHalfLifeAgo = now - HALF_LIFE_DAYS * MS_PER_DAY;
  const events = [
    { created_at: oneHalfLifeAgo },
    { created_at: oneHalfLifeAgo }
  ];
  const sum = sumDecayed(events, 'created_at', now);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('sumDecayed: mixed ages compute correctly', () => {
  const now = Date.UTC(2026, 3, 20);
  const events = [
    { created_at: now },
    { created_at: now - HALF_LIFE_DAYS * MS_PER_DAY },
    { created_at: now - HALF_LIFE_DAYS * MS_PER_DAY * 2 }
  ];
  const sum = sumDecayed(events, 'created_at', now);
  assert.ok(Math.abs(sum - 1.75) < 1e-9);
});

test('pinMultiplier: 0 decayed pins returns 1', () => {
  assert.equal(pinMultiplier(0), 1);
});

test('pinMultiplier: 1 decayed pin returns 1.2', () => {
  assert.equal(pinMultiplier(1), 1.2);
});

test('pinMultiplier: 3 decayed pins returns 1.728 (cap)', () => {
  assert.ok(Math.abs(pinMultiplier(3) - 1.728) < 1e-9);
});

test('pinMultiplier: 10 decayed pins still caps at 1.728', () => {
  assert.ok(Math.abs(pinMultiplier(10) - 1.728) < 1e-9);
});

test('dismissMultiplier: 0 returns 1', () => {
  assert.equal(dismissMultiplier(0), 1);
});

test('dismissMultiplier: 1 returns 0.4', () => {
  assert.equal(dismissMultiplier(1), 0.4);
});

test('dismissMultiplier: 3 returns 0.064 (cap)', () => {
  assert.ok(Math.abs(dismissMultiplier(3) - 0.064) < 1e-9);
});

test('integration: pin from 90 days ago barely boosts (0.25x weight)', () => {
  const now = Date.UTC(2026, 3, 20);
  const ninetyDaysAgo = now - 90 * MS_PER_DAY;
  const events = [{ created_at: ninetyDaysAgo }];
  const decayed = sumDecayed(events, 'created_at', now);
  assert.ok(decayed <= 0.25 + 1e-9);
  const mult = pinMultiplier(decayed);
  assert.ok(mult > 1);
  assert.ok(mult < 1.05);
});

test('integration: fresh pin today gives full 1.2x boost', () => {
  const now = Date.UTC(2026, 3, 20);
  const events = [{ created_at: now }];
  const decayed = sumDecayed(events, 'created_at', now);
  assert.equal(decayed, 1);
  assert.equal(pinMultiplier(decayed), 1.2);
});

test('integration: 10 six-month-old pins cant outrank one fresh pin', () => {
  const now = Date.UTC(2026, 3, 20);
  const sixMonthsAgo = now - 180 * MS_PER_DAY;
  const events = Array.from({ length: 10 }, () => ({ created_at: sixMonthsAgo }));
  const decayed = sumDecayed(events, 'created_at', now);
  const mult = pinMultiplier(decayed);
  assert.ok(mult < 1.2, `10 six-month-old pins shouldnt outrank one fresh pin — got ${mult}`);
});
