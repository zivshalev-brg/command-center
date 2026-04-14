/**
 * Power BI REST API Client — uses SSO token captured by beanz-digest
 *
 * Token lifecycle:
 *   1. beanz-digest/extract.js or refresh-token.js captures the bearer token
 *      from Playwright network interception and saves it to pbi-token.json.
 *   2. This module reads the token and uses it for REST API calls.
 *   3. If the token is expired (>50 min), triggers refresh-token.js.
 *
 * No Azure AD app registration required — uses the user's SSO session.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ─── Token Management ───────────────────────────────────────────────────────

const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 minutes (tokens last ~60 min)
let _cachedToken = null;
let _cachedTokenTime = 0;
let _refreshing = false;

/**
 * Read the captured Power BI token from pbi-token.json.
 * Returns null if file doesn't exist or token is expired.
 */
function readTokenFile(tokenPath) {
  try {
    if (!fs.existsSync(tokenPath)) return null;
    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    if (!data.token) return null;

    const capturedAt = new Date(data.capturedAt).getTime();
    const age = Date.now() - capturedAt;
    if (age > TOKEN_MAX_AGE_MS) return null; // Expired

    return { token: data.token, capturedAt, age };
  } catch {
    return null;
  }
}

/**
 * Get a valid Power BI access token.
 * Uses cached token if fresh, else reads from file, else triggers refresh.
 */
async function getToken(ctx) {
  // Check memory cache first
  if (_cachedToken && (Date.now() - _cachedTokenTime) < TOKEN_MAX_AGE_MS) {
    return _cachedToken;
  }

  // Read from file
  const tokenPath = ctx.pbi?.tokenPath;
  if (!tokenPath) throw new Error('PBI token path not configured');

  const fileToken = readTokenFile(tokenPath);
  if (fileToken) {
    _cachedToken = fileToken.token;
    _cachedTokenTime = fileToken.capturedAt;
    return _cachedToken;
  }

  // Token expired or missing — trigger refresh
  const refreshed = await triggerTokenRefresh(ctx);
  if (refreshed) return refreshed;

  throw new Error('No valid Power BI token available. Run beanz-digest extraction to capture a fresh token.');
}

/**
 * Trigger the refresh-token.js script to get a fresh token.
 */
function triggerTokenRefresh(ctx) {
  if (_refreshing) return Promise.resolve(null);
  _refreshing = true;

  const digestDir = ctx.pbi?.digestDir;
  if (!digestDir) {
    _refreshing = false;
    return Promise.resolve(null);
  }

  const refreshScript = path.join(digestDir, 'src', 'refresh-token.js');
  if (!fs.existsSync(refreshScript)) {
    _refreshing = false;
    console.log('[PBI] refresh-token.js not found at', refreshScript);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    console.log('[PBI] Triggering token refresh...');
    execFile(process.execPath, [
      '--experimental-modules', refreshScript, '--headless'
    ], {
      cwd: digestDir,
      timeout: 60000,
      env: { ...process.env }
    }, (error) => {
      _refreshing = false;
      if (error) {
        console.error('[PBI] Token refresh failed:', error.message);
        resolve(null);
        return;
      }

      // Re-read the token file
      const tokenPath = ctx.pbi?.tokenPath;
      const fileToken = readTokenFile(tokenPath);
      if (fileToken) {
        _cachedToken = fileToken.token;
        _cachedTokenTime = fileToken.capturedAt;
        console.log('[PBI] Token refreshed successfully');
        resolve(_cachedToken);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Check token status without making API calls.
 */
function getTokenStatus(ctx) {
  const tokenPath = ctx.pbi?.tokenPath;
  if (!tokenPath) return { available: false, reason: 'Token path not configured' };

  try {
    if (!fs.existsSync(tokenPath)) {
      return { available: false, reason: 'Token file not found. Run beanz-digest extraction first.' };
    }

    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    if (!data.token) return { available: false, reason: 'Token file is empty' };

    const capturedAt = new Date(data.capturedAt);
    const ageMs = Date.now() - capturedAt.getTime();
    const ageMinutes = Math.round(ageMs / 60000);

    if (ageMs > TOKEN_MAX_AGE_MS) {
      return {
        available: false,
        reason: `Token expired (${ageMinutes} min old)`,
        capturedAt: data.capturedAt,
        ageMinutes,
        source: data.source
      };
    }

    return {
      available: true,
      capturedAt: data.capturedAt,
      ageMinutes,
      remainingMinutes: Math.round((TOKEN_MAX_AGE_MS - ageMs) / 60000),
      source: data.source
    };
  } catch (e) {
    return { available: false, reason: `Error reading token: ${e.message}` };
  }
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

function pbiRequest(hostname, apiPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: apiPath,
      method: method || 'GET',
      headers: headers || {}
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text) });
        } catch {
          resolve({ status: res.statusCode, data: text });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Make an authenticated GET request to the Power BI REST API.
 */
async function pbiGet(apiPath, ctx) {
  const token = await getToken(ctx);
  const { status, data } = await pbiRequest(
    'api.powerbi.com',
    `/v1.0/myorg/groups/${ctx.pbi.groupId}${apiPath}`,
    'GET',
    { 'Authorization': `Bearer ${token}` }
  );
  if (status === 401 || status === 403) {
    // Token may have expired — clear cache
    _cachedToken = null;
    _cachedTokenTime = 0;
    throw new Error(`Power BI API returned ${status}. Token may be expired.`);
  }
  if (status >= 400) {
    throw new Error(`Power BI API error ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Make an authenticated POST request to the Power BI REST API.
 */
async function pbiPost(apiPath, body, ctx) {
  const token = await getToken(ctx);
  const bodyStr = JSON.stringify(body);
  const { status, data } = await pbiRequest(
    'api.powerbi.com',
    `/v1.0/myorg/groups/${ctx.pbi.groupId}${apiPath}`,
    'POST',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    },
    bodyStr
  );
  if (status === 401 || status === 403) {
    _cachedToken = null;
    _cachedTokenTime = 0;
    throw new Error(`Power BI API returned ${status}. Token may be expired.`);
  }
  if (status >= 400) {
    throw new Error(`Power BI API error ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Power BI API Methods ────────────────────────────────────────────────────

/** List datasets in the workspace */
async function getDatasets(ctx) {
  const result = await pbiGet('/datasets', ctx);
  return result.value || [];
}

/** List report pages */
async function getReportPages(ctx) {
  const result = await pbiGet(`/reports/${ctx.pbi.reportId}/pages`, ctx);
  return result.value || [];
}

/** Get dataset tables and columns (schema) */
async function getDatasetSchema(ctx, datasetId) {
  // The tables endpoint returns table + column metadata
  // Note: requires dataset.Read permission on the dataset
  try {
    const tables = await pbiGet(`/datasets/${datasetId}/tables`, ctx);
    return tables.value || [];
  } catch (e) {
    // Some datasets don't expose tables endpoint — try the discover endpoint
    console.log('[PBI] Tables endpoint failed, trying discover:', e.message);
    return [];
  }
}

/**
 * Execute a DAX query against a dataset.
 * Returns the results as an array of row objects.
 */
async function executeDAXQuery(ctx, datasetId, daxQuery) {
  const body = {
    queries: [{ query: daxQuery }],
    serializerSettings: { includeNulls: true }
  };

  const result = await pbiPost(`/datasets/${datasetId}/executeQueries`, body, ctx);

  // Parse results into flat row objects
  if (result.results && result.results[0] && result.results[0].tables) {
    const table = result.results[0].tables[0];
    if (table && table.rows) {
      return {
        columns: table.columns?.map(c => c.name) || Object.keys(table.rows[0] || {}),
        rows: table.rows
      };
    }
  }

  return { columns: [], rows: [] };
}

/** Get dataset refresh history */
async function getRefreshHistory(ctx, datasetId) {
  const result = await pbiGet(`/datasets/${datasetId}/refreshes?$top=10`, ctx);
  return result.value || [];
}

/** Generate an embed token for the report (for iframe embedding) */
async function generateEmbedToken(ctx) {
  const body = { accessLevel: 'View' };
  return await pbiPost(`/reports/${ctx.pbi.reportId}/GenerateToken`, body, ctx);
}

module.exports = {
  getToken,
  getTokenStatus,
  triggerTokenRefresh,
  getDatasets,
  getReportPages,
  getDatasetSchema,
  executeDAXQuery,
  getRefreshHistory,
  generateEmbedToken,
  pbiGet,
  pbiPost
};
