// ===============================================================
// METRICS QUERY CLIENT — API caller for Genie-powered Metrics tab
// ===============================================================

var metricsAPI = (function() {
  var _cache = {};
  var _loading = {};
  var _errors = {};

  function _cacheKey(endpoint, params) {
    return endpoint + ':' + JSON.stringify(params || {});
  }

  function _isFresh(entry) {
    if (!entry) return false;
    var age = Date.now() - entry.ts;
    return age < (entry.ttl || 60000);
  }

  function _post(path, body) {
    return fetch('/api/genie/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  function _get(path) {
    return fetch('/api/genie/' + path).then(function(r) { return r.json(); });
  }

  function fetchKPIs(period) {
    var key = _cacheKey('kpis', { period: period });
    if (_isFresh(_cache[key])) return Promise.resolve(_cache[key].data);
    _loading.kpis = true;
    return _get('kpis?period=' + encodeURIComponent(period || 'FY26')).then(function(d) {
      _loading.kpis = false;
      _errors.kpis = d.error || null;
      if (!d.error) _cache[key] = { data: d, ts: Date.now(), ttl: 900000 }; // 15min
      return d;
    }).catch(function(e) {
      _loading.kpis = false;
      _errors.kpis = e.message;
      return { error: e.message };
    });
  }

  function fetchTimeSeries(metric, granularity, period, filters) {
    var params = { metric: metric, granularity: granularity || 'month', period: period || 'FY26', filters: filters || {} };
    var key = _cacheKey('timeseries', params);
    if (_isFresh(_cache[key])) return Promise.resolve(_cache[key].data);
    _loading.timeseries = true;
    return _post('timeseries', params).then(function(d) {
      _loading.timeseries = false;
      _errors.timeseries = d.error || null;
      if (!d.error) _cache[key] = { data: d, ts: Date.now(), ttl: 3600000 }; // 60min
      return d;
    }).catch(function(e) {
      _loading.timeseries = false;
      _errors.timeseries = e.message;
      return { error: e.message };
    });
  }

  function fetchBreakdown(metric, dimension, period, filters) {
    var params = { metric: metric, dimension: dimension, period: period || 'FY26', filters: filters || {} };
    var key = _cacheKey('breakdown', params);
    if (_isFresh(_cache[key])) return Promise.resolve(_cache[key].data);
    _loading.breakdown = true;
    return _post('breakdown', params).then(function(d) {
      _loading.breakdown = false;
      _errors.breakdown = d.error || null;
      if (!d.error) _cache[key] = { data: d, ts: Date.now(), ttl: 3600000 };
      return d;
    }).catch(function(e) {
      _loading.breakdown = false;
      _errors.breakdown = e.message;
      return { error: e.message };
    });
  }

  function fetchComparison(metric, period1, period2, dimension, filters) {
    var params = { metric: metric, period1: period1, period2: period2, dimension: dimension || 'month', filters: filters || {} };
    var key = _cacheKey('compare', params);
    if (_isFresh(_cache[key])) return Promise.resolve(_cache[key].data);
    _loading.compare = true;
    return _post('compare', params).then(function(d) {
      _loading.compare = false;
      _errors.compare = d.error || null;
      if (!d.error) _cache[key] = { data: d, ts: Date.now(), ttl: 7200000 }; // 2hr
      return d;
    }).catch(function(e) {
      _loading.compare = false;
      _errors.compare = e.message;
      return { error: e.message };
    });
  }

  function fetchExplore(sql) {
    _loading.explore = true;
    return _post('query', { sql: sql }).then(function(d) {
      _loading.explore = false;
      _errors.explore = d.error || null;
      return d;
    }).catch(function(e) {
      _loading.explore = false;
      _errors.explore = e.message;
      return { error: e.message };
    });
  }

  function getStatus() {
    return _get('status');
  }

  function clearCache() {
    _cache = {};
    return _post('cache/clear', {});
  }

  function isLoading(key) { return !!_loading[key]; }
  function getError(key) { return _errors[key] || null; }

  return {
    fetchKPIs: fetchKPIs,
    fetchTimeSeries: fetchTimeSeries,
    fetchBreakdown: fetchBreakdown,
    fetchComparison: fetchComparison,
    fetchExplore: fetchExplore,
    getStatus: getStatus,
    clearCache: clearCache,
    isLoading: isLoading,
    getError: getError
  };
})();
