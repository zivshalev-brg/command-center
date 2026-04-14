'use strict';

const https = require('https');

// ─── Genie API Client ────────────────────────────────────────
// Calls the Databricks Genie REST API to execute SQL queries
// via a Genie Space conversation, then polls for results.

const BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000]; // ~40s total
const SQL_PREFIX = 'Run the following SQL exactly as written, do not modify it:\n';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);
const PENDING_STATUSES = new Set([
  'FILTERING_CONTEXT', 'PENDING_WAREHOUSE', 'EXECUTING_QUERY'
]);

// ─── HTTP helpers ────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const msg = `Genie API ${res.statusCode}: ${data.slice(0, 500)}`;
          return reject(new Error(msg));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Genie API returned non-JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Genie API request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function buildOptions(config, method, pathSegment) {
  return {
    hostname: config.host,
    port: 443,
    path: `/api/2.0/genie/spaces/${config.spaceId}/${pathSegment}`,
    method,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    rejectUnauthorized: false
  };
}

function validateConfig(config) {
  if (!config || !config.host || !config.token || !config.spaceId) {
    throw new Error(
      'Genie config incomplete — requires host, token, and spaceId. ' +
      'Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_GENIE_SPACE_ID in .env'
    );
  }
}

// ─── Sleep helper ────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Core API functions ──────────────────────────────────────

/**
 * Send SQL to a Genie Space and poll until results are ready.
 * @param {Object} config - { host, token, spaceId }
 * @param {string} sql - SQL query to execute
 * @returns {Promise<{ columns: string[], rows: any[][], rowCount: number }>}
 */
async function queryGenie(config, sql) {
  validateConfig(config);

  if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
    throw new Error('SQL query must be a non-empty string');
  }

  const options = buildOptions(config, 'POST', 'start-conversation');
  const body = JSON.stringify({ content: `${SQL_PREFIX}${sql}` });

  const response = await httpsRequest(options, body);

  const conversationId = response.conversation_id;
  const messageId = response.message_id;

  if (!conversationId || !messageId) {
    throw new Error(
      'Genie start-conversation response missing conversation_id or message_id'
    );
  }

  // If already completed (unlikely but possible)
  if (response.status === 'COMPLETED') {
    return parseGenieResult(response);
  }

  if (response.status === 'FAILED') {
    const errMsg = response.error || response.message || 'Unknown Genie error';
    throw new Error(`Genie query failed immediately: ${errMsg}`);
  }

  // Poll for completion
  return pollResult(config, conversationId, messageId);
}

/**
 * Poll a Genie conversation message until terminal status.
 * Uses exponential backoff: 1s, 2s, 4s, 8s, 8s, 8s, 8s, 8s
 * @param {Object} config - { host, token, spaceId }
 * @param {string} conversationId
 * @param {string} messageId
 * @returns {Promise<{ columns: string[], rows: any[][], rowCount: number }>}
 */
async function pollResult(config, conversationId, messageId) {
  validateConfig(config);

  const pathSegment = `conversations/${conversationId}/messages/${messageId}`;

  for (let attempt = 0; attempt < BACKOFF_SCHEDULE.length; attempt++) {
    await sleep(BACKOFF_SCHEDULE[attempt]);

    const options = buildOptions(config, 'GET', pathSegment);
    const response = await httpsRequest(options, null);
    const status = response.status || '';

    if (status === 'COMPLETED') {
      return parseGenieResult(response);
    }

    if (status === 'FAILED') {
      const errMsg = response.error || response.message || 'Unknown Genie error';
      throw new Error(`Genie query failed: ${errMsg}`);
    }

    if (!PENDING_STATUSES.has(status) && !TERMINAL_STATUSES.has(status)) {
      // Unknown status — keep polling but log once
      if (attempt === 0) {
        console.error(`[genie-client] Unexpected status "${status}", continuing to poll`);
      }
    }
  }

  throw new Error(
    `Genie query timed out after ${BACKOFF_SCHEDULE.length} poll attempts (~40s). ` +
    `conversationId=${conversationId}, messageId=${messageId}`
  );
}

/**
 * Parse the Genie API response into a normalised result object.
 * @param {Object} response - Full Genie message response
 * @returns {{ columns: string[], rows: any[][], rowCount: number }}
 */
function parseGenieResult(response) {
  const empty = { columns: [], rows: [], rowCount: 0 };

  if (!response) return empty;

  // Navigate to query result — structure may vary
  const attachments = response.attachments || [];
  if (attachments.length === 0) return empty;

  const queryAttachment = attachments.find(a => a.query && a.query.result);
  if (!queryAttachment) return empty;

  const result = queryAttachment.query.result;

  // Extract columns — may be array of objects with .name or array of strings
  const rawColumns = result.columns || result.column_names || [];
  const columns = rawColumns.map(c => (typeof c === 'string' ? c : c.name || String(c)));

  // Extract rows — typically data_array (array of arrays)
  const rows = result.data_array || result.rows || result.data || [];

  return {
    columns,
    rows,
    rowCount: rows.length
  };
}

/**
 * Test connectivity to the Databricks Genie API.
 * Sends a minimal request and checks for a valid response or known error.
 * @param {Object} config - { host, token, spaceId }
 * @returns {Promise<{ ok: boolean, message: string, latencyMs: number }>}
 */
async function testConnection(config) {
  const start = Date.now();

  try {
    validateConfig(config);

    const options = buildOptions(config, 'POST', 'start-conversation');
    const body = JSON.stringify({ content: 'SELECT 1 AS health_check' });

    await httpsRequest(options, body);

    return {
      ok: true,
      message: 'Databricks Genie connection successful',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      ok: false,
      message: err.message || 'Connection failed',
      latencyMs: Date.now() - start
    };
  }
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = { queryGenie, pollResult, parseGenieResult, testConnection };
