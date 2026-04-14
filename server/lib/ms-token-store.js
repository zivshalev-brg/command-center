/**
 * ms-token-store.js — Persistent storage for Microsoft Graph OAuth tokens.
 *
 * Stores access_token and refresh_token in a local JSON file
 * (.ms-tokens.json) next to the project root. This enables the
 * delegated auth flow to persist across server restarts.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Token file sits at project root alongside .env
const TOKEN_FILE = path.join(__dirname, '..', '..', '.ms-tokens.json');

/**
 * Load stored tokens from disk.
 * @returns {{ accessToken, refreshToken, expiresAt, scope } | null}
 */
function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data.refreshToken) return null;
    return {
      accessToken: data.accessToken || null,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt || 0,
      scope: data.scope || ''
    };
  } catch (e) {
    console.error('[MS Tokens] Failed to load tokens:', e.message);
    return null;
  }
}

/**
 * Save tokens to disk.
 * @param {{ accessToken, refreshToken, expiresAt, scope }} tokens
 */
function saveTokens(tokens) {
  try {
    const data = {
      accessToken: tokens.accessToken || null,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt || 0,
      scope: tokens.scope || '',
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[MS Tokens] Tokens saved to', TOKEN_FILE);
  } catch (e) {
    console.error('[MS Tokens] Failed to save tokens:', e.message);
  }
}

/**
 * Clear all stored tokens (disconnect).
 */
function clearTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
      console.log('[MS Tokens] Tokens cleared');
    }
  } catch (e) {
    console.error('[MS Tokens] Failed to clear tokens:', e.message);
  }
}

/**
 * Check if we have a valid refresh token stored.
 * @returns {boolean}
 */
function isAuthenticated() {
  const tokens = loadTokens();
  return tokens !== null && Boolean(tokens.refreshToken);
}

/**
 * Check if the stored access token is still valid (with 5-minute buffer).
 * @returns {boolean}
 */
function hasValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens || !tokens.accessToken) return false;
  return Date.now() < (tokens.expiresAt - 300000);
}

module.exports = {
  loadTokens,
  saveTokens,
  clearTokens,
  isAuthenticated,
  hasValidAccessToken,
  TOKEN_FILE
};
