'use strict';

/**
 * Databricks OAuth2 — Azure AD service principal (M2M / client credentials).
 *
 * Two token paths supported:
 *   (1) Databricks PAT (legacy) — cfg.token starts with 'dapi'. Used as-is.
 *   (2) Azure AD SP           — cfg.clientId + cfg.clientSecret + cfg.tenantId.
 *                               We exchange for a token with the Databricks first-party
 *                               resource (AzureDatabricks = 2ff814a6-3304-4ab8-85cb-cd0e6f879c1d)
 *                               which the workspace's REST APIs accept as a Bearer.
 *
 * Tokens cached in-memory with a 5-min pre-expiry refresh window.
 *
 * Reference:
 *   https://learn.microsoft.com/azure/databricks/dev-tools/auth/oauth-m2m
 *   https://learn.microsoft.com/azure/databricks/dev-tools/auth/azure-aad
 */

const https = require('https');
const querystring = require('querystring');

const AZURE_DATABRICKS_RESOURCE = '2ff814a6-3304-4ab8-85cb-cd0e6f879c1d';

// Workspace-scoped cache: key = `${tenantId}:${clientId}`
const _tokenCache = new Map();

function httpsForm(options, formBody) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('OAuth HTTP ' + res.statusCode + ': ' + data.slice(0, 500)));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('OAuth non-JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OAuth request timeout')); });
    if (formBody) req.write(formBody);
    req.end();
  });
}

/**
 * Azure AD client-credentials flow against the Databricks resource.
 * Returns { accessToken, expiresAt (ms epoch) }.
 */
async function fetchAzureADToken(tenantId, clientId, clientSecret) {
  const body = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: AZURE_DATABRICKS_RESOURCE + '/.default'
  });

  const opts = {
    hostname: 'login.microsoftonline.com',
    port: 443,
    path: `/${tenantId}/oauth2/v2.0/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'application/json'
    }
  };

  const resp = await httpsForm(opts, body);
  if (!resp.access_token) throw new Error('Azure AD: no access_token in response');
  const expiresIn = parseInt(resp.expires_in, 10) || 3600;
  return {
    accessToken: resp.access_token,
    expiresAt: Date.now() + (expiresIn * 1000)
  };
}

/**
 * Workspace-level OAuth M2M (Databricks-issued tokens, alternative to Azure AD).
 * Not used by default; included for environments with Databricks-native SPs.
 */
async function fetchWorkspaceToken(host, clientId, clientSecret) {
  const body = querystring.stringify({
    grant_type: 'client_credentials',
    scope: 'all-apis'
  });
  const auth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const opts = {
    hostname: host,
    port: 443,
    path: '/oidc/v1/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + auth,
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const resp = await httpsForm(opts, body);
  if (!resp.access_token) throw new Error('Workspace OIDC: no access_token');
  const expiresIn = parseInt(resp.expires_in, 10) || 3600;
  return { accessToken: resp.access_token, expiresAt: Date.now() + (expiresIn * 1000) };
}

/**
 * Return a valid Bearer token for `cfg`. Cached; auto-refreshes 5 min before expiry.
 *
 * cfg: { host, token?, clientId?, clientSecret?, tenantId? }
 */
async function getBearerToken(cfg) {
  // PAT path — pass-through
  if (cfg.token && cfg.token.trim()) return cfg.token.trim();

  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Databricks auth: need DATABRICKS_TOKEN or (CLIENT_ID + CLIENT_SECRET)');
  }

  const cacheKey = (cfg.tenantId || 'workspace') + ':' + cfg.clientId;
  const cached = _tokenCache.get(cacheKey);
  const earlyRefreshMs = 5 * 60 * 1000;
  if (cached && cached.expiresAt > Date.now() + earlyRefreshMs) {
    return cached.accessToken;
  }

  let tok;
  if (cfg.tenantId) {
    tok = await fetchAzureADToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  } else {
    if (!cfg.host) throw new Error('Databricks workspace-level OIDC needs host');
    tok = await fetchWorkspaceToken(cfg.host, cfg.clientId, cfg.clientSecret);
  }
  _tokenCache.set(cacheKey, tok);
  return tok.accessToken;
}

function invalidateToken(cfg) {
  if (!cfg) { _tokenCache.clear(); return; }
  const cacheKey = (cfg.tenantId || 'workspace') + ':' + cfg.clientId;
  _tokenCache.delete(cacheKey);
}

function tokenStatus(cfg) {
  if (!cfg || !cfg.clientId) return { cached: false };
  const cacheKey = (cfg.tenantId || 'workspace') + ':' + cfg.clientId;
  const entry = _tokenCache.get(cacheKey);
  if (!entry) return { cached: false };
  return {
    cached: true,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    expiresInSeconds: Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000))
  };
}

module.exports = {
  getBearerToken,
  invalidateToken,
  tokenStatus,
  fetchAzureADToken,
  fetchWorkspaceToken
};
