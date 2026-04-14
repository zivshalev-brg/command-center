/**
 * email-marketing.js — Email Marketing Performance routes
 * Fetches Beanz email assets from SFMC and serves them to the frontend
 */
'use strict';

const { jsonReply, readBody } = require('../lib/helpers');
const sfmc = require('../lib/sfmc-api');

// In-memory cache
var _emailCache = { emails: null, lastFetched: null };

module.exports = async function handleEmailMarketing(req, res, parts, url, ctx) {
  if (!ctx.sfmc || !ctx.sfmc.clientId) {
    return jsonReply(res, 200, { error: 'SFMC not configured. Add SFMC_CLIENT_ID to .env' });
  }

  // GET /api/email-marketing — list all Beanz emails
  if (!parts[1]) {
    try {
      // Cache for 30 min
      if (_emailCache.emails && _emailCache.lastFetched && Date.now() - _emailCache.lastFetched < 30 * 60 * 1000) {
        return jsonReply(res, 200, { emails: _emailCache.emails, cached: true, total: _emailCache.emails.length });
      }

      console.log('[SFMC] Fetching all Beanz email assets...');
      var emails = await sfmc.fetchAllEmails(ctx.sfmc, ctx.sfmc.beanzMid);
      _emailCache.emails = emails;
      _emailCache.lastFetched = Date.now();
      console.log('[SFMC] Fetched ' + emails.length + ' email assets');
      return jsonReply(res, 200, { emails: emails, total: emails.length });
    } catch (e) {
      console.error('[SFMC] Fetch error:', e.message);
      return jsonReply(res, 500, { error: 'SFMC fetch failed: ' + e.message });
    }
  }

  // GET /api/email-marketing/search?q=keyword
  if (parts[1] === 'search') {
    var q = url.searchParams.get('q') || '';
    if (!q) return jsonReply(res, 400, { error: 'Missing ?q= parameter' });
    try {
      var results = await sfmc.searchEmails(ctx.sfmc, q, ctx.sfmc.beanzMid);
      return jsonReply(res, 200, { emails: results, query: q, total: results.length });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Search failed: ' + e.message });
    }
  }

  // GET /api/email-marketing/preview/:id — get full HTML of an email
  if (parts[1] === 'preview' && parts[2]) {
    try {
      var assetId = parts[2];
      var email = await sfmc.fetchEmailHtml(ctx.sfmc, assetId, ctx.sfmc.beanzMid);
      return jsonReply(res, 200, email);
    } catch (e) {
      return jsonReply(res, 500, { error: 'Preview fetch failed: ' + e.message });
    }
  }

  // GET /api/email-marketing/sends — send history and tracking data
  if (parts[1] === 'sends') {
    try {
      var days = parseInt(url.searchParams.get('days')) || 90;
      var sends = await sfmc.fetchSendHistory(ctx.sfmc, ctx.sfmc.beanzMid, days);
      return jsonReply(res, 200, { sends: sends, total: sends.length });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Send history failed: ' + e.message });
    }
  }

  // GET /api/email-marketing/refresh — force refresh
  if (parts[1] === 'refresh') {
    try {
      var emails = await sfmc.fetchAllEmails(ctx.sfmc, ctx.sfmc.beanzMid);
      _emailCache.emails = emails;
      _emailCache.lastFetched = Date.now();
      return jsonReply(res, 200, { ok: true, total: emails.length });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Refresh failed: ' + e.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown email-marketing endpoint' });
};
