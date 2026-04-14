/**
 * sfmc-api.js — Salesforce Marketing Cloud API client for email assets
 * Fetches email templates from Content Builder for the Beanz BU
 */
'use strict';

const https = require('https');

// ── Token Cache ──
var _tokenCache = {};

function _httpsRequest(url, method, headers, body) {
  return new Promise(function(resolve, reject) {
    var parsed = new URL(url);
    var opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: method || 'GET',
      headers: headers || {},
      rejectUnauthorized: false,
      timeout: 20000
    };
    var req = https.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var data = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken(config, accountId) {
  var cacheKey = accountId ? String(accountId) : 'enterprise';
  var cached = _tokenCache[cacheKey];
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  var payload = {
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret
  };
  if (accountId) payload.account_id = accountId;

  var resp = await _httpsRequest(
    config.authBaseUri + '/v2/token',
    'POST',
    { 'Content-Type': 'application/json' },
    JSON.stringify(payload)
  );

  if (resp.status !== 200 || !resp.data.access_token) {
    throw new Error('SFMC auth failed: ' + JSON.stringify(resp.data).slice(0, 200));
  }

  _tokenCache[cacheKey] = {
    token: resp.data.access_token,
    expiresAt: Date.now() + (resp.data.expires_in - 60) * 1000
  };
  return resp.data.access_token;
}

/** Fetch all email assets from a BU */
async function fetchAllEmails(config, accountId, maxPages) {
  var token = await getAccessToken(config, accountId);
  var allItems = [];
  var page = 1;
  maxPages = maxPages || 20;

  while (page <= maxPages) {
    var payload = {
      query: {
        property: 'assetType.name',
        simpleOperator: 'contains',
        value: 'email'
      },
      fields: ['id', 'name', 'assetType', 'modifiedDate', 'createdDate', 'category', 'status', 'description'],
      page: { page: page, pageSize: 50 },
      sort: [{ property: 'modifiedDate', direction: 'DESC' }]
    };

    var resp = await _httpsRequest(
      config.restBaseUri + '/asset/v1/content/assets/query',
      'POST',
      { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      JSON.stringify(payload)
    );

    if (resp.status !== 200) throw new Error('SFMC query failed: ' + resp.status);

    var items = resp.data.items || [];
    allItems.push.apply(allItems, items);

    var total = resp.data.totalCount || allItems.length;
    if (allItems.length >= total || items.length < 50) break;
    page++;
  }

  return allItems.map(function(a) {
    return {
      id: a.id,
      name: a.name,
      type: a.assetType ? a.assetType.name : 'unknown',
      modifiedDate: a.modifiedDate,
      createdDate: a.createdDate,
      category: a.category ? a.category.name : '',
      categoryPath: a.category ? (a.category.parentId ? a.category.name : 'Root') : '',
      status: a.status ? a.status.name : '',
      description: a.description || ''
    };
  });
}

/** Fetch a single email asset with full HTML */
async function fetchEmailHtml(config, assetId, accountId) {
  var token = await getAccessToken(config, accountId);

  var resp = await _httpsRequest(
    config.restBaseUri + '/asset/v1/content/assets/' + assetId,
    'GET',
    { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  );

  if (resp.status !== 200) throw new Error('SFMC fetch failed: ' + resp.status);
  var asset = resp.data;

  // Extract HTML (same logic as CodeViewExtraction)
  var html = null;
  if (asset.views && asset.views.html && asset.views.html.content && asset.views.html.slots) {
    var slots = asset.views.html.slots;
    var assembled = asset.views.html.content;
    for (var slotName in slots) {
      var slot = slots[slotName];
      var blocks = slot.blocks || {};
      var slotHtml = (slot.content || '')
        .replace(/<div data-type="block" data-key="([^"]+)"><\/div>/g, function(_, key) { return blocks[key] ? blocks[key].content || '' : ''; })
        .replace(/<div data-key="([^"]+)" data-type="block"><\/div>/g, function(_, key) { return blocks[key] ? blocks[key].content || '' : ''; });
      var openTag = '<div data-type="slot" data-key="' + slotName + '">';
      var slotStart = assembled.indexOf(openTag);
      if (slotStart !== -1) {
        var contentStart = slotStart + openTag.length;
        var closeIdx = assembled.indexOf('</div>', contentStart);
        if (closeIdx !== -1) assembled = assembled.substring(0, contentStart) + slotHtml + assembled.substring(closeIdx);
      }
    }
    html = assembled;
  } else if (asset.views && asset.views.html && asset.views.html.content) {
    html = asset.views.html.content;
  } else if (asset.content) {
    html = asset.content;
  }

  return {
    id: asset.id,
    name: asset.name,
    html: html,
    subject: asset.views && asset.views.subjectline ? asset.views.subjectline.content : '',
    preheader: asset.views && asset.views.preheader ? asset.views.preheader.content : '',
    modifiedDate: asset.modifiedDate,
    createdDate: asset.createdDate
  };
}

/** Search emails by keyword */
async function searchEmails(config, keyword, accountId) {
  var token = await getAccessToken(config, accountId);

  var payload = {
    query: {
      leftOperand: { property: 'assetType.name', simpleOperator: 'contains', value: 'email' },
      logicalOperator: 'AND',
      rightOperand: { property: 'name', simpleOperator: 'contains', value: keyword }
    },
    fields: ['id', 'name', 'assetType', 'modifiedDate', 'createdDate', 'category', 'status'],
    page: { page: 1, pageSize: 50 },
    sort: [{ property: 'modifiedDate', direction: 'DESC' }]
  };

  var resp = await _httpsRequest(
    config.restBaseUri + '/asset/v1/content/assets/query',
    'POST',
    { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    JSON.stringify(payload)
  );

  if (resp.status !== 200) throw new Error('SFMC search failed: ' + resp.status);

  return (resp.data.items || []).map(function(a) {
    return {
      id: a.id,
      name: a.name,
      type: a.assetType ? a.assetType.name : 'unknown',
      modifiedDate: a.modifiedDate,
      createdDate: a.createdDate,
      category: a.category ? a.category.name : '',
      status: a.status ? a.status.name : ''
    };
  });
}

/** Fetch send history for emails — uses the SOAP-based REST proxy for send tracking */
async function fetchSendHistory(config, accountId, daysBack) {
  var token = await getAccessToken(config, accountId);
  daysBack = daysBack || 90;
  var sinceDate = new Date(Date.now() - daysBack * 86400000).toISOString();

  // Use the REST API to query Send definitions / triggered sends
  // First try: /messaging/v1/email/messages/ — recent sends
  var sends = [];

  // Approach 1: Query recent email send definitions
  try {
    var resp = await _httpsRequest(
      config.restBaseUri + '/messaging/v1/email/definitions',
      'GET',
      { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    );
    if (resp.status === 200 && resp.data && resp.data.definitions) {
      resp.data.definitions.forEach(function(d) {
        sends.push({
          definitionKey: d.definitionKey,
          name: d.name,
          status: d.status,
          createdDate: d.createdDate,
          modifiedDate: d.modifiedDate,
          email: d.content ? { customerKey: d.content.customerKey } : null,
          description: d.description || ''
        });
      });
    }
  } catch (e) {
    console.error('[SFMC] Send definitions fetch failed:', e.message);
  }

  // Approach 2: Query tracking data via data extensions or aggregates
  // Use the /data/v1/customobjectdata endpoint for send tracking
  try {
    var trackResp = await _httpsRequest(
      config.restBaseUri + '/messaging/v1/email/tracking/sends',
      'GET',
      { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    );
    if (trackResp.status === 200 && trackResp.data) {
      var trackItems = trackResp.data.items || trackResp.data.sends || [];
      trackItems.forEach(function(s) {
        sends.push({
          sendId: s.id || s.sendID,
          name: s.name || s.emailName || '',
          sentDate: s.sendDate || s.sentDate || s.createdDate,
          status: s.status || 'sent',
          totalSent: s.numberSent || s.totalSent || 0,
          opens: s.uniqueOpens || s.opens || 0,
          clicks: s.uniqueClicks || s.clicks || 0,
          bounces: s.bounces || 0,
          unsubscribes: s.unsubscribes || 0,
          subject: s.subject || s.emailSubject || ''
        });
      });
    }
  } catch (e) {
    console.error('[SFMC] Send tracking fetch failed:', e.message);
  }

  // Approach 3: Query individual asset send data via the asset's data
  // The Content Builder API includes send counts in the asset data when fetched with extra fields
  try {
    var assetResp = await _httpsRequest(
      config.restBaseUri + '/asset/v1/content/assets/query',
      'POST',
      { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      JSON.stringify({
        query: { property: 'assetType.name', simpleOperator: 'contains', value: 'email' },
        fields: ['id', 'name', 'assetType', 'modifiedDate', 'createdDate', 'status', 'meta', 'data'],
        page: { page: 1, pageSize: 100 },
        sort: [{ property: 'modifiedDate', direction: 'DESC' }]
      })
    );
    if (assetResp.status === 200 && assetResp.data && assetResp.data.items) {
      assetResp.data.items.forEach(function(a) {
        // Some assets have meta.options or data with send info
        if (a.data || a.meta) {
          sends.push({
            assetId: a.id,
            name: a.name,
            type: a.assetType ? a.assetType.name : '',
            modifiedDate: a.modifiedDate,
            createdDate: a.createdDate,
            status: a.status ? a.status.name : '',
            meta: a.meta || null,
            data: a.data || null
          });
        }
      });
    }
  } catch (e) {
    console.error('[SFMC] Asset data fetch failed:', e.message);
  }

  return sends;
}

module.exports = { fetchAllEmails, fetchEmailHtml, searchEmails, getAccessToken, fetchSendHistory };
