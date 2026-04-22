// ===============================================================
// DATABRICKS API CLIENT — live snapshot + ad-hoc queries
// ===============================================================
//
// Powers the Metrics tab. The dashboard is built on a single rich
// snapshot fetched from /api/databricks/snapshot which the Databricks
// engine assembles from 14 concurrent SQL queries. Explore view uses
// /api/databricks/query for slice-and-dice (validated SQL only).
//
// Caching: 5 min in-memory. Server-side SQLite cache gives us a
// second layer. `refresh()` forces both layers to invalidate.
//
// Backwards-compat: exposes the old `metricsAPI.fetchKPIs/...` shape
// so any existing callers keep working until the UI is fully
// migrated.

var databricksAPI = (function() {
  var _snapshot = null;
  var _snapshotTs = 0;
  var _snapshotInflight = null;
  var _status = null;
  var SNAPSHOT_TTL_MS = 5 * 60 * 1000;

  function fetchHealth() {
    return fetch('/api/databricks/health').then(function(r) { return r.json(); }).then(function(d) {
      _status = d;
      return d;
    }).catch(function(e) {
      _status = { ok: false, configured: false, error: e.message };
      return _status;
    });
  }

  function fetchSnapshot(force) {
    var now = Date.now();
    if (!force && _snapshot && (now - _snapshotTs) < SNAPSHOT_TTL_MS) {
      return Promise.resolve(_snapshot);
    }
    if (_snapshotInflight) return _snapshotInflight;
    _snapshotInflight = fetch('/api/databricks/snapshot?email=true&cohort=true')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        _snapshotInflight = null;
        if (d && d.ok && d.snapshot) {
          _snapshot = d.snapshot;
          _snapshotTs = Date.now();
        } else if (d && d.fallback && d.snapshot) {
          _snapshot = d.snapshot.live || d.snapshot;
          _snapshotTs = Date.now();
        }
        return _snapshot;
      })
      .catch(function(e) {
        _snapshotInflight = null;
        return { error: e.message };
      });
    return _snapshotInflight;
  }

  var _digestCache = {};
  function _digestKey(kind, anchor) { return (kind||'month') + ':' + (anchor||'today'); }

  function fetchDigest(opts) {
    opts = opts || {};
    var kind = opts.kind || 'month';
    var anchor = opts.anchor || '';
    var hero = opts.hero ? '&hero=llm' : '';
    var key = _digestKey(kind, anchor);
    var now = Date.now();
    if (!opts.force && _digestCache[key] && (now - _digestCache[key].ts) < 5 * 60 * 1000) {
      return Promise.resolve(_digestCache[key].data);
    }
    var url = '/api/databricks/digest?kind=' + encodeURIComponent(kind) +
              (anchor ? '&anchor=' + encodeURIComponent(anchor) : '') + hero;
    return fetch(url).then(function(r){return r.json();}).then(function(d) {
      if (d && d.ok && d.snapshot) {
        _digestCache[key] = { ts: Date.now(), data: d.snapshot };
        return d.snapshot;
      }
      return { error: (d && d.error) || 'Digest fetch failed' };
    }).catch(function(e) {
      return { error: e.message };
    });
  }

  function refresh() {
    _snapshot = null;
    _snapshotTs = 0;
    return fetch('/api/databricks/refresh', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        return fetchSnapshot(true);
      });
  }

  function runQuery(sql, opts) {
    opts = opts || {};
    return fetch('/api/databricks/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sql, skipCache: !!opts.skipCache, ttlMinutes: opts.ttlMinutes || 60 })
    }).then(function(r) { return r.json(); });
  }

  function explore(metric, dimension, period, filters) {
    var sql = buildExploreSQL(metric, dimension, period, filters);
    return runQuery(sql).then(function(d) {
      if (d.ok && d.rows) {
        var mapped = d.rows.map(function(row) { return { dim: row[0], value: parseFloat(row[1]) || 0 }; });
        return {
          ok: true,
          rows: mapped,
          columns: d.columns,
          source: d.source,
          sql: sql,
          total: mapped.reduce(function(s, r) { return s + r.value; }, 0)
        };
      }
      return { ok: false, error: d.error || 'query failed', sql: sql };
    });
  }

  function clearCache() {
    _snapshot = null;
    _snapshotTs = 0;
    return fetch('/api/databricks/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function(r) { return r.json(); });
  }

  // ─── Explore SQL builder ─────────────────────────────────────
  function buildExploreSQL(metric, dimension, period, filters) {
    period = period || 'FY26';
    filters = filters || {};

    // Period → [start, end]
    var range = periodRange(period);

    // Metric → SQL expr
    var metricSQL = {
      revenue: 'ROUND(SUM(f.SkuAmount), 0)',
      bags: 'SUM(f.Quantity)',
      kg: 'ROUND(SUM(f.Quantity_by_KG), 0)',
      orders: 'COUNT(DISTINCT f.OrderNumber)',
      subscriptions: 'COUNT(DISTINCT f.CustomerId)',
      cancellations: 'COUNT(DISTINCT f.OrderNumber)',
      lead_time: null // special-case → shipment table
    }[metric] || 'ROUND(SUM(f.SkuAmount), 0)';

    // Dimension → SQL expr
    var dim = {
      market: 's.Country',
      month: "DATE_FORMAT(f.OrderDate, 'yyyy-MM')",
      quarter: "CONCAT(YEAR(f.OrderDate), '-Q', CAST(QUARTER(f.OrderDate) AS STRING))",
      fy: "CASE WHEN MONTH(f.OrderDate) >= 7 THEN CONCAT('FY', CAST(YEAR(f.OrderDate)+1-2000 AS STRING)) ELSE CONCAT('FY', CAST(YEAR(f.OrderDate)-2000 AS STRING)) END",
      program: "CASE WHEN f.ftbp_Flag = 2 THEN 'FTBP v2' WHEN f.ftbp_Flag = 1 THEN 'FTBP v1' WHEN f.SubscriptionType IS NOT NULL AND f.SubscriptionType <> '' THEN 'Subscription' ELSE 'One-off' END",
      roaster: 'p.VendorName',
      status: 'f.OrderStatus',
      reason: "'see cancellation_reasons view'"
    }[dimension] || 's.Country';

    // Special-case for lead_time (shipment table, no exchange rate join)
    if (metric === 'lead_time') {
      var shipDim = {
        market: 'COUNTRY',
        carrier: 'CARRIER',
        month: "DATE_FORMAT(SHIPPINGDATE, 'yyyy-MM')"
      }[dimension] || 'COUNTRY';
      return "SELECT " + shipDim + " AS dim, ROUND(AVG(LeadTime), 2) AS value " +
        "FROM ana_prd_gold.edw.factbeanzshipment " +
        "WHERE SHIPPINGDATE >= DATE '" + range.start + "' AND SHIPPINGDATE < DATE '" + range.end + "' " +
        "AND LeadTime IS NOT NULL AND LeadTime >= 0 AND LeadTime < 60 " +
        (filters.market ? "AND COUNTRY = '" + filters.market + "' " : '') +
        "GROUP BY " + shipDim + " ORDER BY value ASC LIMIT 50";
    }

    var joins = [
      'INNER JOIN ana_prd_gold.edw.dimexchangerate e ON f.ExchangeRateKey = e.ExchangeRateKey'
    ];
    if (dimension === 'market' || dimension === 'fy' || filters.market) joins.push('INNER JOIN ana_prd_gold.edw.dimbeanzstore s ON f.StoreCode = s.StoreCode');
    if (dimension === 'roaster') joins.push('INNER JOIN ana_prd_gold.edw.dimbeanzproduct p ON f.ProductCodeKey = p.ProductCodeKey');

    var where = [
      "e.RateType = 'AUD-MonthEnd'",
      "lower(f.OrderStatus) <> 'cancelled'",
      "f.BeanzSkuFlag = 1",
      "f.OrderDate >= DATE '" + range.start + "'",
      "f.OrderDate < DATE '" + range.end + "'"
    ];
    if (filters.market) where.push("s.Country = '" + filters.market + "'");
    if (filters.program === 'FTBP') where.push('f.ftbp_Flag > 0');

    return "SELECT " + dim + " AS dim, " + metricSQL + " AS value " +
      "FROM ana_prd_gold.edw.factbeanzorder f " +
      joins.join(' ') + ' ' +
      "WHERE " + where.join(' AND ') + ' ' +
      "GROUP BY " + dim + " ORDER BY value DESC LIMIT 50";
  }

  function periodRange(period) {
    var m;
    if ((m = /^FY(\d{2})$/i.exec(period))) {
      var fy = 2000 + parseInt(m[1], 10);
      return { start: (fy - 1) + '-07-01', end: fy + '-07-01' };
    }
    if ((m = /^CY(\d{2})$/i.exec(period))) {
      var cy = 2000 + parseInt(m[1], 10);
      return { start: cy + '-01-01', end: (cy + 1) + '-01-01' };
    }
    return { start: '2025-07-01', end: '2026-07-01' };
  }

  return {
    fetchSnapshot: fetchSnapshot,
    fetchDigest: fetchDigest,
    fetchHealth: fetchHealth,
    refresh: refresh,
    runQuery: runQuery,
    explore: explore,
    clearCache: clearCache,
    getStatus: function() { return _status; }
  };
})();

// ─── Legacy wrapper (keeps any old mod-metrics.js callers happy) ─────
var metricsAPI = {
  fetchKPIs: function(period) {
    return databricksAPI.fetchSnapshot().then(function(snap) {
      if (!snap || snap.error) return { error: snap && snap.error };
      return { source: 'databricks', period: period || 'FY26', metrics: snapshotToKPIs(snap) };
    });
  },
  fetchTimeSeries: function(metric, granularity, period, filters) {
    return databricksAPI.fetchSnapshot().then(function(snap) {
      if (!snap || snap.error) return { error: snap && snap.error };
      return { series: snapshotTimeSeries(snap, metric) };
    });
  },
  fetchBreakdown: function(metric, dim, period, filters) {
    return databricksAPI.explore(metric, dim, period, filters);
  },
  getStatus: function() {
    return databricksAPI.fetchHealth();
  },
  clearCache: databricksAPI.clearCache
};

function snapshotToKPIs(snap) {
  var m = {};
  if (snap.mtd && snap.mtd.revenue != null) {
    m.revenue = { name: 'MTD Revenue', value: snap.mtd.revenue, format: 'currency', status: 'healthy', trend: 'up' };
  }
  if (snap.activeSubs) {
    m.active_subs = { name: 'Active Subscribers', value: snap.activeSubs.active_total, format: 'number', status: 'healthy', trend: 'up' };
  }
  if (snap.ftbpPrograms && snap.mtd) {
    var ftbpRev = snap.ftbpPrograms.filter(function(r) { return /FTBP/.test(r.program); })
      .reduce(function(s, r) { return s + (parseFloat(r.revenue) || 0); }, 0);
    var share = snap.mtd.revenue > 0 ? Math.round(1000 * ftbpRev / snap.mtd.revenue) / 10 : 0;
    m.ftbp_revenue_share = { name: 'FTBP Revenue Share', value: share, format: 'pct', status: share > 45 ? 'warning' : 'healthy', trend: 'flat' };
  }
  if (snap.sla30 && snap.sla30.length) {
    var au = snap.sla30.find(function(r) { return r.COUNTRY === 'AU'; });
    if (au) m.delivery_sla = { name: 'AU Delivery (avg)', value: parseFloat(au.avg_lead_time), format: 'days', status: parseFloat(au.avg_lead_time) > 5 ? 'warning' : 'healthy', trend: 'down' };
  }
  if (snap.activeSubs && snap.activeSubs.cancelled_30d != null) {
    var churn = Math.round(1000 * snap.activeSubs.cancelled_30d / (snap.activeSubs.active_total + snap.activeSubs.cancelled_30d)) / 10;
    m.churn_rate = { name: 'Churn (30d)', value: churn, format: 'pct', status: churn > 6 ? 'warning' : 'healthy', trend: 'down' };
  }
  if (snap.mtd && snap.mtd.bags) {
    m.bags_shipped = { name: 'MTD Bags', value: snap.mtd.bags, format: 'number', status: 'healthy', trend: 'up' };
  }
  return m;
}

function snapshotTimeSeries(snap, metric) {
  if (metric === 'revenue' && snap.daily30) {
    return snap.daily30.map(function(r) { return { label: r.day, value: parseFloat(r.revenue) || 0 }; });
  }
  if (metric === 'revenue' && snap.waterfall) {
    return snap.waterfall.map(function(r) { return { label: r.month, value: parseFloat(r.revenue) || 0 }; });
  }
  return [];
}
