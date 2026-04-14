const https = require('https');

let _cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cachedFetch(key, ttl, fn) {
  const entry = _cache[key];
  if (entry && Date.now() - entry.ts < (ttl || CACHE_TTL)) return Promise.resolve(entry.data);
  return fn().then(data => { _cache[key] = { data, ts: Date.now() }; return data; });
}

function confluenceRequest(ctx, apiPath) {
  const { email, token, baseUrl } = ctx.atlassian || {};
  if (!email || !token || !baseUrl) return Promise.reject(new Error('Atlassian credentials not configured'));
  const url = new URL(apiPath, baseUrl);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(email + ':' + token).toString('base64'),
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Confluence')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function formatPage(page, baseUrl) {
  return {
    id: page.id,
    title: page.title || '',
    status: page.status || 'current',
    url: baseUrl + '/wiki' + (page._links?.webui || ''),
    lastModified: page.version?.when || page.history?.lastUpdated?.when || '',
    lastAuthor: page.version?.by?.displayName || page.history?.lastUpdated?.by?.displayName || '',
    spaceKey: page.space?.key || ''
  };
}

/** Get recently modified pages in a space */
function getRecentPages(ctx, limit) {
  const space = ctx.atlassian?.confluenceSpace || 'BEANZ';
  const baseUrl = ctx.atlassian?.baseUrl || '';
  limit = limit || 15;
  const cql = encodeURIComponent(`space = "${space}" ORDER BY lastmodified DESC`);
  const path = `/wiki/rest/api/content/search?cql=${cql}&limit=${limit}&expand=version,space`;
  return cachedFetch('confluence-recent-' + space, CACHE_TTL, () =>
    confluenceRequest(ctx, path)
      .then(resp => (resp.results || []).map(p => formatPage(p, baseUrl)))
  );
}

/** Search content within the space */
function searchContent(ctx, query, limit) {
  const space = ctx.atlassian?.confluenceSpace || 'BEANZ';
  const baseUrl = ctx.atlassian?.baseUrl || '';
  limit = limit || 10;
  const cql = encodeURIComponent(`space = "${space}" AND text ~ "${query}" ORDER BY lastmodified DESC`);
  const path = `/wiki/rest/api/content/search?cql=${cql}&limit=${limit}&expand=version,space`;
  return cachedFetch('confluence-search-' + query, CACHE_TTL, () =>
    confluenceRequest(ctx, path)
      .then(resp => (resp.results || []).map(p => formatPage(p, baseUrl)))
  );
}

module.exports = { getRecentPages, searchContent, confluenceRequest };
