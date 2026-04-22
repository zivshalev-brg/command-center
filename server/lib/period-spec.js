'use strict';

/**
 * Period spec — resolves a (kind, anchor) pair to concrete date windows
 * for the current period, the prior period, and YoY same-period.
 *
 *   kind     : 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
 *   anchor   : ISO date (YYYY-MM-DD). Defaults to today.
 *   lookback : for 'custom'; number of days ending on anchor.
 *
 * Output:
 *   {
 *     kind, label,
 *     current:  { start, end, inclusive: true }
 *     previous: { start, end }
 *     yoy:      { start, end }
 *     granularity: 'hour'|'day'|'week'|'month'   // for time series binning
 *     points: expected number of time-series buckets
 *   }
 *
 * Date semantics throughout:
 *   - start is inclusive, end is EXCLUSIVE  (matches SQL `>= start AND < end`)
 *   - anchor's "today" concept = the date, not the timestamp
 *   - week = Monday-start (ISO week convention)
 *   - month = calendar month
 *   - quarter = calendar quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec)
 *   - year = calendar year
 */

function ymd(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const [y, m, d] = String(s).split('-').map(n => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d, n)    { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d, n)  { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
function addYears(d, n)   { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; }

function startOfWeekMonday(d) {
  const dow = d.getDay();                 // 0=Sun, 1=Mon, ..., 6=Sat
  const delta = (dow + 6) % 7;            // 0 if Monday, 6 if Sunday
  return addDays(d, -delta);
}

function startOfMonth(d)    { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfQuarter(d)  { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); }
function startOfYear(d)     { return new Date(d.getFullYear(), 0, 1); }

/**
 * Resolve a period spec.
 * @param {Object} spec { kind, anchor?, lookback? }
 * @returns {Object} resolved period descriptor
 */
function resolvePeriod(spec) {
  spec = spec || {};
  const kind = (spec.kind || 'month').toLowerCase();
  const anchor = spec.anchor ? parseYMD(spec.anchor) : new Date();
  anchor.setHours(0, 0, 0, 0);

  let currStart, currEnd, prevStart, prevEnd, yoyStart, yoyEnd, granularity, label;

  switch (kind) {
    case 'day': {
      currStart = new Date(anchor);
      currEnd   = addDays(anchor, 1);
      prevStart = addDays(currStart, -1);
      prevEnd   = new Date(currStart);
      yoyStart  = addYears(currStart, -1);
      yoyEnd    = addDays(yoyStart, 1);
      granularity = 'hour';
      label = ymd(anchor);
      break;
    }
    case 'week': {
      currStart = startOfWeekMonday(anchor);
      currEnd   = addDays(currStart, 7);
      prevStart = addDays(currStart, -7);
      prevEnd   = new Date(currStart);
      yoyStart  = addDays(addYears(currStart, -1), 0);
      yoyEnd    = addDays(yoyStart, 7);
      granularity = 'day';
      label = `Week of ${ymd(currStart)}`;
      break;
    }
    case 'month': {
      currStart = startOfMonth(anchor);
      currEnd   = startOfMonth(addMonths(anchor, 1));
      prevStart = startOfMonth(addMonths(anchor, -1));
      prevEnd   = new Date(currStart);
      yoyStart  = startOfMonth(addYears(anchor, -1));
      yoyEnd    = startOfMonth(addMonths(addYears(anchor, -1), 1));
      granularity = 'day';
      label = `${currStart.toLocaleString('en-AU', { month: 'long' })} ${currStart.getFullYear()}`;
      break;
    }
    case 'quarter': {
      currStart = startOfQuarter(anchor);
      currEnd   = startOfQuarter(addMonths(currStart, 3));
      prevStart = startOfQuarter(addMonths(currStart, -3));
      prevEnd   = new Date(currStart);
      yoyStart  = startOfQuarter(addYears(currStart, -1));
      yoyEnd    = startOfQuarter(addMonths(yoyStart, 3));
      granularity = 'week';
      const q = Math.floor(currStart.getMonth() / 3) + 1;
      label = `Q${q} ${currStart.getFullYear()}`;
      break;
    }
    case 'year': {
      currStart = startOfYear(anchor);
      currEnd   = startOfYear(addYears(anchor, 1));
      prevStart = startOfYear(addYears(anchor, -1));
      prevEnd   = new Date(currStart);
      yoyStart  = startOfYear(addYears(anchor, -2));
      yoyEnd    = new Date(prevStart);
      granularity = 'month';
      label = `CY${currStart.getFullYear()}`;
      break;
    }
    case 'fiscal-year': {
      // BRG FY = Jul 1 → Jun 30.  fy26 = Jul 2025 → Jun 2026.
      const m = anchor.getMonth();
      const fyStartYear = m >= 6 ? anchor.getFullYear() : anchor.getFullYear() - 1;
      currStart = new Date(fyStartYear, 6, 1);
      currEnd   = new Date(fyStartYear + 1, 6, 1);
      prevStart = new Date(fyStartYear - 1, 6, 1);
      prevEnd   = new Date(fyStartYear, 6, 1);
      yoyStart  = new Date(fyStartYear - 2, 6, 1);
      yoyEnd    = new Date(prevStart);
      granularity = 'month';
      label = `FY${(fyStartYear + 1) % 100}`;
      break;
    }
    case 'custom': {
      const lb = Math.max(1, Math.min(parseInt(spec.lookback, 10) || 30, 730));
      currEnd   = addDays(anchor, 1);
      currStart = addDays(currEnd, -lb);
      prevEnd   = new Date(currStart);
      prevStart = addDays(currStart, -lb);
      yoyStart  = addYears(currStart, -1);
      yoyEnd    = addYears(currEnd, -1);
      granularity = lb <= 2 ? 'hour' : lb <= 60 ? 'day' : lb <= 180 ? 'week' : 'month';
      label = `Last ${lb}d`;
      break;
    }
    default:
      return resolvePeriod({ kind: 'month', anchor: ymd(anchor) });
  }

  return {
    kind,
    label,
    anchor: ymd(anchor),
    current:  { start: ymd(currStart),  end: ymd(currEnd)  },
    previous: { start: ymd(prevStart),  end: ymd(prevEnd)  },
    yoy:      { start: ymd(yoyStart),   end: ymd(yoyEnd)   },
    granularity
  };
}

/**
 * Spark a SQL date_format pattern from granularity.
 */
function dateFormatForGranularity(g) {
  switch (g) {
    case 'hour':  return "yyyy-MM-dd HH:00";
    case 'day':   return 'yyyy-MM-dd';
    case 'week':  return 'yyyy-ww';
    case 'month': return 'yyyy-MM';
    case 'year':  return 'yyyy';
    default:      return 'yyyy-MM-dd';
  }
}

/**
 * Spark date_trunc unit from granularity.
 */
function truncUnitForGranularity(g) {
  switch (g) {
    case 'hour':  return 'HOUR';
    case 'day':   return 'DAY';
    case 'week':  return 'WEEK';
    case 'month': return 'MONTH';
    case 'year':  return 'YEAR';
    default:      return 'DAY';
  }
}

/**
 * Safely stringify a period for cache keys.
 */
function periodCacheKey(period) {
  if (!period) return 'null';
  return [period.kind, period.current.start, period.current.end].join(':');
}

module.exports = {
  resolvePeriod,
  dateFormatForGranularity,
  truncUnitForGranularity,
  periodCacheKey,
  ymd,
  parseYMD,
  addDays,
  addMonths,
  addYears
};
