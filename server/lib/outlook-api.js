const https = require('https');
const tokenStore = require('./ms-token-store');

// ─── Microsoft Graph API for Outlook ─────────────────────────
// Full read + write capabilities via delegated auth flow.
//
// Auth flow: Authorization Code + Refresh Token (delegated).
// User signs in once via browser, refresh token persists.
//
// Required .env variables:
//   MS_TENANT_ID      - Azure AD tenant ID
//   MS_CLIENT_ID      - App registration client ID
//   MS_CLIENT_SECRET   - App registration client secret
//   MS_USER_EMAIL      - User email (for display/context only)
//
// Required Graph API permissions (delegated):
//   Mail.ReadWrite, Mail.Send, User.Read, offline_access

// Scopes requested for delegated auth
const GRAPH_SCOPES = 'Mail.ReadWrite Mail.Send User.Read offline_access';

// ─── Token Cache (in-memory) ─────────────────────────────────

let _accessToken = null;
let _tokenExpiry = 0;

// ─── Auth ────────────────────────────────────────────────────

/**
 * Build the Microsoft OAuth2 authorization URL.
 * User visits this URL to sign in and grant consent.
 */
function buildAuthUrl(config, redirectUri, stateParam) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: GRAPH_SCOPES,
    response_mode: 'query',
    state: stateParam || 'beanz-auth'
  });
  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called once after the user signs in via browser.
 */
async function exchangeCodeForTokens(config, authCode, redirectUri) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: authCode,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: GRAPH_SCOPES
  }).toString();

  const data = await graphPost(
    'login.microsoftonline.com',
    `/${config.tenantId}/oauth2/v2.0/token`,
    body,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  );

  if (!data.access_token) {
    throw new Error(
      'Token exchange failed: ' +
        (data.error_description || data.error || 'unknown')
    );
  }

  // Store tokens persistently
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || GRAPH_SCOPES
  };
  tokenStore.saveTokens(tokens);

  // Update in-memory cache
  _accessToken = data.access_token;
  _tokenExpiry = tokens.expiresAt;

  return tokens;
}

/**
 * Refresh the access token using a stored refresh token.
 */
async function refreshAccessToken(config, refreshToken) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: GRAPH_SCOPES
  }).toString();

  const data = await graphPost(
    'login.microsoftonline.com',
    `/${config.tenantId}/oauth2/v2.0/token`,
    body,
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  );

  if (!data.access_token) {
    throw new Error(
      'Token refresh failed: ' +
        (data.error_description || data.error || 'unknown')
    );
  }

  // Update stored tokens (refresh token may be rotated)
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope || GRAPH_SCOPES
  };
  tokenStore.saveTokens(tokens);

  // Update in-memory cache
  _accessToken = data.access_token;
  _tokenExpiry = tokens.expiresAt;

  return data.access_token;
}

/**
 * Get a valid access token. Priority:
 *   1. Manual token from config (MS_ACCESS_TOKEN env var)
 *   2. In-memory cached token (if not expired)
 *   3. Refresh from stored refresh token
 *   4. Throw error — user needs to sign in via /auth/outlook
 */
async function getAccessToken(config) {
  // Manual override for quick testing
  if (config.accessToken) {
    return config.accessToken;
  }

  // In-memory cache still valid?
  if (_accessToken && Date.now() < _tokenExpiry - 300000) {
    return _accessToken;
  }

  // Try to load stored tokens and refresh
  const stored = tokenStore.loadTokens();
  if (stored && stored.refreshToken) {
    // If stored access token is still valid, use it
    if (stored.accessToken && Date.now() < (stored.expiresAt || 0) - 300000) {
      _accessToken = stored.accessToken;
      _tokenExpiry = stored.expiresAt;
      return _accessToken;
    }

    // Otherwise refresh using the refresh token
    try {
      console.log('[Outlook] Refreshing access token via refresh_token...');
      return await refreshAccessToken(config, stored.refreshToken);
    } catch (e) {
      console.error('[Outlook] Token refresh failed:', e.message);
      // Clear invalid tokens so UI shows "Connect" button
      tokenStore.clearTokens();
      _accessToken = null;
      _tokenExpiry = 0;
      throw new Error(
        'Outlook session expired. Please re-authenticate at /auth/outlook'
      );
    }
  }

  // No tokens available — user needs to authenticate
  throw new Error(
    'Outlook not connected. Visit http://localhost:3737/auth/outlook to sign in.'
  );
}

// ─── HTTP Helpers ────────────────────────────────────────────

/** Generic HTTPS request helper. Returns { statusCode, body }. */
function graphRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: method || 'GET',
      headers: { ...headers }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        // 202/204 may have empty body
        if (!data || !data.trim()) {
          return resolve({ _statusCode: res.statusCode });
        }
        try {
          const parsed = JSON.parse(data);
          resolve({ ...parsed, _statusCode: res.statusCode });
        } catch {
          reject(
            new Error(
              `Invalid JSON from Graph API (status ${res.statusCode}): ${data.slice(0, 200)}`
            )
          );
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function graphPost(hostname, path, body, headers) {
  return graphRequest(hostname, path, 'POST', {
    'Content-Length': Buffer.byteLength(body),
    ...headers
  }, body);
}

/** Authenticated GET against Microsoft Graph. */
async function graphAPI(token, path) {
  return graphRequest('graph.microsoft.com', path, 'GET', {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  });
}

/** Authenticated mutating request (POST/PATCH/DELETE) against Graph. */
async function graphAPIMutate(token, path, method, body) {
  const jsonBody = body != null ? JSON.stringify(body) : '';
  return graphRequest('graph.microsoft.com', path, method, {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(jsonBody ? { 'Content-Length': Buffer.byteLength(jsonBody) } : {})
  }, jsonBody || undefined);
}

// ─── Utilities ───────────────────────────────────────────────

/** Create a stable, short ID from a Graph conversationId. */
function stableEmailId(conversationId) {
  let hash = 0;
  for (let i = 0; i < conversationId.length; i++) {
    const chr = conversationId.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'g-' + (hash >>> 0).toString(16);
}

function formatEmailTime(isoDate) {
  const d = new Date(isoDate);
  return (
    d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

function formatEmailDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Build the Graph API base path for the current user.
 * Delegated auth uses /me, manual token also uses /me,
 * only fallback to /users/{email} if explicitly needed.
 */
function userPath(config) {
  // Delegated tokens (signed-in user) use /me
  return '/v1.0/me';
}

/** Throw a descriptive error if a Graph response contains an error payload. */
function assertNoGraphError(resp, context) {
  if (resp.error) {
    throw new Error(
      `Graph API error (${context}): ${resp.error.code} — ${resp.error.message}`
    );
  }
}

/** Format a recipient address into Graph's recipient object. */
function toRecipient(entry) {
  if (typeof entry === 'string') {
    return { emailAddress: { address: entry } };
  }
  return {
    emailAddress: {
      address: entry.address,
      ...(entry.name ? { name: entry.name } : {})
    }
  };
}

/** Map an array of email strings/objects to Graph recipient format. */
function toRecipients(list) {
  if (!list || list.length === 0) return [];
  return list.map(toRecipient);
}

// ─── Read Operations ─────────────────────────────────────────

/**
 * Fetch recent emails from ALL mail folders via Microsoft Graph.
 * Supports pagination through @odata.nextLink.
 *
 * @param {Object} config - MS Graph config
 * @param {Object} options - { maxMessages, sinceDays }
 * @returns {{ threads, refreshedAt, emailCount, messageCount }}
 */
async function fetchOutlookEmails(config, options = {}) {
  const maxMessages = options.maxMessages || 200;
  const sinceDays = options.sinceDays || 14;

  const token = await getAccessToken(config);
  const sinceDate = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const selectFields = [
    'id', 'subject', 'from', 'toRecipients', 'ccRecipients',
    'receivedDateTime', 'body', 'conversationId', 'isRead',
    'importance', 'hasAttachments', 'internetMessageId'
  ].join(',');

  const queryParams = new URLSearchParams({
    '$top': String(Math.min(maxMessages, 200)),
    '$filter': `receivedDateTime ge ${sinceDate}`,
    '$orderby': 'receivedDateTime desc',
    '$select': selectFields
  }).toString();

  // Fetch from ALL mail folders (includes Inbox + Sent Items for full conversation context)
  // buildThreads will filter out pure sent-only conversations
  const allPath = `${userPath(config)}/messages?${queryParams}`;

  const allMessages = await fetchAllPages(token, allPath, maxMessages);
  const threads = buildThreads(allMessages, config);

  return {
    threads,
    refreshedAt: new Date().toISOString(),
    emailCount: Object.keys(threads).length,
    messageCount: allMessages.length
  };
}

/** Follow @odata.nextLink pages up to maxItems total. */
async function fetchAllPages(token, firstPath, maxItems) {
  const allItems = [];
  let currentPath = firstPath;

  while (currentPath && allItems.length < maxItems) {
    const resp = await graphAPI(token, currentPath);
    assertNoGraphError(resp, 'fetchAllPages');

    const items = resp.value || [];
    allItems.push(...items);

    const nextLink = resp['@odata.nextLink'];
    if (!nextLink || items.length === 0) break;

    // nextLink is a full URL; extract the path portion
    currentPath = nextLink.replace('https://graph.microsoft.com', '');
  }

  return allItems.slice(0, maxItems);
}

/**
 * Group raw Graph messages into the app's thread format.
 * Filters out conversations where ALL messages are from self (pure sent items).
 * Keeps conversations with at least one received (non-self) message, including
 * the user's own replies for full conversation context.
 */
function buildThreads(messages, config) {
  const selfAddresses = new Set([
    (config.userEmail || '').toLowerCase(),
    'ziv.shalev@breville.com.au', 'ziv.shalev@breville.com'
  ].filter(Boolean));

  const conversations = {};

  for (const msg of messages) {
    const convId = msg.conversationId || msg.id;
    const existing = conversations[convId] || {
      messages: [],
      subject: msg.subject,
      importance: msg.importance
    };
    conversations[convId] = {
      ...existing,
      messages: [...existing.messages, msg]
    };
  }

  const threads = {};

  for (const [convId, conv] of Object.entries(conversations)) {
    // Filter: skip conversations where ALL messages are from self (pure sent items)
    const hasReceivedMsg = conv.messages.some(m => {
      const senderAddr = (m.from?.emailAddress?.address || '').toLowerCase();
      return !selfAddresses.has(senderAddr);
    });
    if (!hasReceivedMsg) continue;

    // Filter: skip calendar acceptance/decline/tentative responses (RSVP noise)
    const isCalendarResponse = /^(accepted|declined|tentative|canceled|cancelled):/i.test(conv.subject || '');
    if (isCalendarResponse) continue;

    const sorted = [...conv.messages].sort(
      (a, b) => new Date(a.receivedDateTime) - new Date(b.receivedDateTime)
    );
    threads[`email-${stableEmailId(convId)}`] = formatThread(
      convId,
      conv,
      sorted,
      config
    );
  }

  return threads;
}

/** Format a single conversation into the app's thread shape. */
function formatThread(convId, conv, sortedMsgs, config) {
  const firstMsg = sortedMsgs[0];
  const lastMsg = sortedMsgs[sortedMsgs.length - 1];
  const people = extractPeople(sortedMsgs, config);
  const priority = derivePriority(conv, sortedMsgs);

  // Detect self-sent messages (replies in conversation threads)
  const selfAddresses = new Set([
    (config.userEmail || '').toLowerCase(),
    (config.userDisplayName || '').toLowerCase(),
    'ziv.shalev@breville.com.au', 'ziv.shalev@breville.com'
  ].filter(Boolean));

  const formattedMsgs = sortedMsgs.map((m) => {
    const senderAddr = (m.from?.emailAddress?.address || '').toLowerCase();
    const senderName = m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown';
    const isSelf = selfAddresses.has(senderAddr);
    return {
      sender: isSelf ? 'You' : senderName,
      senderRaw: senderName,
      text: extractPreviewText(m),
      time: formatEmailTime(m.receivedDateTime),
      via: 'outlook',
      graphId: m.id,
      emailMessageId: m.id,
      messageId: m.id,
      hasAttachments: m.hasAttachments || false,
      isRead: m.isRead || false,
      inReplyTo: m.internetMessageId ? true : false,
      to: (m.toRecipients || []).map((r) => ({
        name: r.emailAddress?.name || '',
        address: r.emailAddress?.address || ''
      })),
      cc: (m.ccRecipients || []).map((r) => ({
        name: r.emailAddress?.name || '',
        address: r.emailAddress?.address || ''
      }))
    };
  });

  const lastSenderAddr = (lastMsg.from?.emailAddress?.address || '').toLowerCase();
  const lastSenderName = lastMsg.from?.emailAddress?.name || 'Unknown';
  const lastSender = selfAddresses.has(lastSenderAddr) ? 'You' : lastSenderName;
  // Sent lane: thread belongs to "Sent" when I wrote the last message AND no unread incoming reply.
  // Keeps threads in Inbox when someone has replied after me.
  const hasUnreadIncoming = sortedMsgs.some((m) => {
    const addr = (m.from?.emailAddress?.address || '').toLowerCase();
    return !selfAddresses.has(addr) && !m.isRead;
  });
  const isOutgoing = selfAddresses.has(lastSenderAddr) && !hasUnreadIncoming;
  const preview = extractPreviewText(lastMsg).slice(0, 120);

  const attachmentCount = sortedMsgs.filter((m) => m.hasAttachments).length;

  // Find the most recent non-self sender for reply-to
  const lastExternal = [...sortedMsgs].reverse().find(
    m => !selfAddresses.has((m.from?.emailAddress?.address || '').toLowerCase())
  );
  const replyEmail = lastExternal?.from?.emailAddress?.address
    || lastMsg.from?.emailAddress?.address || '';

  return {
    subject: conv.subject || '(no subject)',
    priority,
    sources: ['email'],
    source: 'outlook',
    people: [...people],
    lastSender,
    isOutgoing,
    lastActivity: lastMsg.receivedDateTime,
    preview: preview + (preview.length >= 120 ? '...' : ''),
    threadCount: sortedMsgs.length,
    attachmentCount,
    unread: sortedMsgs.some((m) => !m.isRead),
    messages: formattedMsgs,
    replyTo: replyEmail,
    replyEmail: replyEmail,
    replySubject: conv.subject || '',
    conversationId: convId,
    outlookLink: `https://outlook.office365.com/mail/inbox/id/${encodeURIComponent(lastMsg.id)}`
  };
}

/** Extract unique participant names, excluding the current user. */
function extractPeople(messages, config) {
  const people = new Set();
  for (const m of messages) {
    if (m.from?.emailAddress?.name) people.add(m.from.emailAddress.name);
    for (const r of m.toRecipients || []) {
      if (r.emailAddress?.name) people.add(r.emailAddress.name);
    }
    for (const r of m.ccRecipients || []) {
      if (r.emailAddress?.name) people.add(r.emailAddress.name);
    }
  }
  people.delete(config.userDisplayName || 'Ziv Shalev');
  return people;
}

/** Get a preview string from a message body. */
function extractPreviewText(msg) {
  let text;
  if (msg.body?.content) {
    // Strip HTML tags and decode HTML entities for a clean text preview
    text = msg.body.content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&[a-zA-Z]+;/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    text = (msg.bodyPreview || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&[a-zA-Z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text.slice(0, 500);
}

/** Derive priority from importance, read status, and subject keywords. */
function derivePriority(conv, messages) {
  let priority = 'fyi';
  if (conv.importance === 'high') priority = 'action';
  if (messages.some((m) => !m.isRead)) {
    priority = priority === 'fyi' ? 'action' : priority;
  }

  const subjectLower = (conv.subject || '').toLowerCase();
  const criticalPattern =
    /\b(urgent|critical|asap|p0|p1|escalat|blocker|confidential|settlement|termination|legal)\b/;
  if (criticalPattern.test(subjectLower)) priority = 'critical';

  return priority;
}

/**
 * Fetch the full message body and metadata for a single email.
 * @returns {{ subject, body, from, toRecipients, ccRecipients }}
 */
async function fetchEmailFullBody(config, messageId) {
  const token = await getAccessToken(config);
  const path =
    `${userPath(config)}/messages/${encodeURIComponent(messageId)}` +
    '?$select=body,subject,from,toRecipients,ccRecipients';

  const resp = await graphAPI(token, path);
  assertNoGraphError(resp, 'fetchEmailFullBody');
  return {
    subject: resp.subject,
    body: resp.body,
    from: resp.from,
    toRecipients: resp.toRecipients,
    ccRecipients: resp.ccRecipients
  };
}

/**
 * Fetch attachments for a single email message from Graph API.
 * Returns metadata (name, size, type) and optionally base64 content.
 *
 * @param {Object} config — MS Graph config
 * @param {string} messageId — Graph message ID
 * @param {Object} [options]
 * @param {boolean} [options.includeContent=false] — include base64 contentBytes
 * @param {number}  [options.maxContentSize=1048576] — skip attachments larger than this
 * @returns {Promise<Array<{id, name, contentType, size, isInline, contentBytes?}>>}
 */
async function fetchMessageAttachments(config, messageId, options = {}) {
  const token = await getAccessToken(config);
  const includeContent = options.includeContent || false;
  const maxContentSize = options.maxContentSize || 1048576; // 1MB default

  const selectFields = includeContent
    ? 'id,name,contentType,size,isInline,contentBytes'
    : 'id,name,contentType,size,isInline';

  const apiPath =
    `${userPath(config)}/messages/${encodeURIComponent(messageId)}` +
    `/attachments?$select=${selectFields}`;

  const resp = await graphAPI(token, apiPath);
  assertNoGraphError(resp, 'fetchMessageAttachments');

  return (resp.value || [])
    .filter((att) => att.size <= maxContentSize)
    .map((att) => ({
      id: att.id,
      name: att.name || 'unnamed',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      isInline: att.isInline || false,
      ...(includeContent && att.contentBytes
        ? { contentBytes: att.contentBytes }
        : {})
    }));
}

// ─── Write Operations ────────────────────────────────────────

/**
 * Send a new email via Microsoft Graph.
 * @param {Object} config
 * @param {{ to, cc, bcc, subject, bodyHtml, importance }} params
 * @returns {{ ok: true }}
 */
async function sendEmail(config, { to, cc, bcc, subject, bodyHtml, importance }) {
  if (!to || to.length === 0) {
    throw new Error('sendEmail: at least one "to" recipient is required');
  }
  if (!subject) {
    throw new Error('sendEmail: subject is required');
  }

  const token = await getAccessToken(config);
  const payload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: bodyHtml || '' },
      toRecipients: toRecipients(to),
      ccRecipients: toRecipients(cc),
      bccRecipients: toRecipients(bcc),
      importance: importance || 'normal'
    },
    saveToSentItems: true
  };

  const resp = await graphAPIMutate(
    token,
    `${userPath(config)}/sendMail`,
    'POST',
    payload
  );

  if (resp._statusCode !== 202 && resp.error) {
    assertNoGraphError(resp, 'sendEmail');
  }
  return { ok: true };
}

/**
 * Reply to an existing email.
 * @param {Object} config
 * @param {string} messageId - Graph message ID
 * @param {{ bodyHtml, replyAll }} params
 * @returns {{ ok: true }}
 */
async function replyToEmail(config, messageId, { bodyHtml, replyAll }) {
  if (!messageId) {
    throw new Error('replyToEmail: messageId is required');
  }

  const token = await getAccessToken(config);
  const action = replyAll ? 'replyAll' : 'reply';
  const path = `${userPath(config)}/messages/${encodeURIComponent(messageId)}/${action}`;

  const resp = await graphAPIMutate(token, path, 'POST', {
    comment: bodyHtml || ''
  });

  if (resp._statusCode !== 202 && resp.error) {
    assertNoGraphError(resp, 'replyToEmail');
  }
  return { ok: true };
}

/**
 * Forward an existing email to new recipients.
 * @param {Object} config
 * @param {string} messageId
 * @param {{ to, bodyHtml }} params
 * @returns {{ ok: true }}
 */
async function forwardEmail(config, messageId, { to, bodyHtml }) {
  if (!messageId) {
    throw new Error('forwardEmail: messageId is required');
  }
  if (!to || to.length === 0) {
    throw new Error('forwardEmail: at least one "to" recipient is required');
  }

  const token = await getAccessToken(config);
  const path = `${userPath(config)}/messages/${encodeURIComponent(messageId)}/forward`;

  const resp = await graphAPIMutate(token, path, 'POST', {
    comment: bodyHtml || '',
    toRecipients: toRecipients(to)
  });

  if (resp._statusCode !== 202 && resp.error) {
    assertNoGraphError(resp, 'forwardEmail');
  }
  return { ok: true };
}

/**
 * Set categories on a message (e.g., ["Work", "Urgent"]).
 * @returns {{ ok: true }}
 */
async function setEmailCategories(config, messageId, categories) {
  if (!messageId) {
    throw new Error('setEmailCategories: messageId is required');
  }
  if (!Array.isArray(categories)) {
    throw new Error('setEmailCategories: categories must be an array');
  }

  const token = await getAccessToken(config);
  const path = `${userPath(config)}/messages/${encodeURIComponent(messageId)}`;

  const resp = await graphAPIMutate(token, path, 'PATCH', { categories });
  assertNoGraphError(resp, 'setEmailCategories');
  return { ok: true };
}

/**
 * Mark a message as read or unread.
 * @param {boolean} isRead - true to mark read, false for unread
 * @returns {{ ok: true }}
 */
async function markEmailRead(config, messageId, isRead) {
  if (!messageId) {
    throw new Error('markEmailRead: messageId is required');
  }

  const token = await getAccessToken(config);
  const path = `${userPath(config)}/messages/${encodeURIComponent(messageId)}`;

  const resp = await graphAPIMutate(token, path, 'PATCH', {
    isRead: Boolean(isRead)
  });
  assertNoGraphError(resp, 'markEmailRead');
  return { ok: true };
}

// ─── Calendar Event RSVP ─────────────────────────────────────

/**
 * Respond to a calendar event (accept, tentatively accept, or decline).
 * Graph API: POST /me/events/{eventId}/accept|tentativelyAccept|decline
 *
 * @param {object} config - MS Graph config
 * @param {string} eventId - Graph event ID
 * @param {string} response - 'accept' | 'tentative' | 'decline'
 * @param {string} [comment] - Optional comment with the response
 * @returns {{ ok: true }}
 */
async function respondToCalendarEvent(config, eventId, response, comment) {
  if (!eventId) throw new Error('respondToCalendarEvent: eventId is required');
  const validResponses = { accept: 'accept', tentative: 'tentativelyAccept', decline: 'decline' };
  const action = validResponses[response];
  if (!action) throw new Error('respondToCalendarEvent: response must be accept, tentative, or decline');

  const token = await getAccessToken(config);
  const path = `${userPath(config)}/events/${encodeURIComponent(eventId)}/${action}`;

  const body = { sendResponse: true };
  if (comment) body.comment = comment;

  const resp = await graphAPIMutate(token, path, 'POST', body);
  assertNoGraphError(resp, 'respondToCalendarEvent');
  return { ok: true };
}

/**
 * Get calendar event details by event ID.
 * @returns {object} Event object with subject, start, end, location, attendees, etc.
 */
async function getCalendarEvent(config, eventId) {
  if (!eventId) throw new Error('getCalendarEvent: eventId is required');
  const token = await getAccessToken(config);
  const path = `${userPath(config)}/events/${encodeURIComponent(eventId)}`;
  const resp = await graphAPI(token, path);
  return resp;
}

// ─── Calendar Events (Range) ─────────────────────────────────

/**
 * Fetch calendar events for a date range using calendarView.
 * Returns events sorted chronologically with normalized fields.
 *
 * @param {object} config - MS Graph config
 * @param {string} startDate - ISO date string (e.g. '2026-03-23')
 * @param {string} endDate   - ISO date string (e.g. '2026-03-28')
 * @returns {Array} Array of { id, subject, start, end, location, isAllDay, isCancelled, organizer, attendees, importance, showAs, webLink, categories }
 */
async function getCalendarEvents(config, startDate, endDate) {
  const token = await getAccessToken(config);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: '100',
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,location,isAllDay,isCancelled,organizer,attendees,importance,showAs,webLink,categories,recurrence,body,onlineMeeting,hasAttachments,bodyPreview'
  });

  const path = `${userPath(config)}/calendarView?${params.toString()}`;
  const resp = await graphAPI(token, path);
  const events = resp.value || [];

  return events
    .filter(e => !e.isCancelled)
    .map(e => ({
      id: e.id,
      subject: (e.subject || '').trim(),
      start: e.start?.dateTime ? new Date(e.start.dateTime + 'Z').toISOString() : null,
      end: e.end?.dateTime ? new Date(e.end.dateTime + 'Z').toISOString() : null,
      timeZone: e.start?.timeZone || 'UTC',
      location: e.location?.displayName || '',
      isAllDay: e.isAllDay || false,
      isCancelled: e.isCancelled || false,
      organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || '',
      organizerEmail: e.organizer?.emailAddress?.address || '',
      attendees: (e.attendees || []).map(a => ({
        name: a.emailAddress?.name || '',
        email: a.emailAddress?.address || '',
        status: a.status?.response || 'none'
      })),
      importance: e.importance || 'normal',
      showAs: e.showAs || 'busy',
      webLink: e.webLink || '',
      categories: e.categories || [],
      isRecurring: !!e.recurrence,
      body: e.body?.content || '',
      bodyPreview: e.bodyPreview || '',
      bodyContentType: e.body?.contentType || 'text',
      onlineMeetingUrl: e.onlineMeeting?.joinUrl || '',
      hasAttachments: e.hasAttachments || false,
      importance: e.importance || 'normal',
      zoomUrl: ((e.body?.content || '') + ' ' + (e.location?.displayName || '')).match(/https:\/\/[\w.-]*zoom\.us\/[jw]\/[\d?=&]+/i)?.[0] || ''
    }));
}

// ─── Tenant Discovery ────────────────────────────────────────

/**
 * Discover the Azure AD tenant ID for a given domain.
 * Fetches the OpenID Connect configuration and extracts the tenant GUID.
 *
 * @param {string} domain - e.g. "breville.com"
 * @returns {{ tenantId: string, issuer: string }}
 */
async function discoverTenantId(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('discoverTenantId: domain is required');
  }

  const resp = await graphRequest(
    'login.microsoftonline.com',
    `/${encodeURIComponent(domain)}/.well-known/openid-configuration`,
    'GET',
    {}
  );

  if (!resp.issuer) {
    throw new Error(
      `Could not discover tenant for domain "${domain}": no issuer in response`
    );
  }

  // Issuer format: https://sts.windows.net/{tenant-id}/
  const match = resp.issuer.match(
    /https:\/\/sts\.windows\.net\/([0-9a-f-]+)\//i
  );
  if (!match) {
    throw new Error(
      `Could not extract tenant ID from issuer: ${resp.issuer}`
    );
  }

  return { tenantId: match[1], issuer: resp.issuer };
}

// ─── Calendar CRUD & Online Meetings ─────────────────────────

/**
 * List all calendars for the current user.
 * @returns {Array} Array of { id, name, color, canEdit, isDefaultCalendar, owner }
 */
async function listCalendars(config) {
  const token = await getAccessToken(config);
  const path = `${userPath(config)}/calendars?$select=id,name,color,canEdit,isDefaultCalendar,owner`;
  const resp = await graphAPI(token, path);
  assertNoGraphError(resp, 'listCalendars');
  return resp.value || [];
}

/**
 * Fetch calendar events for another user (shared calendar).
 * Handles 403 gracefully when permissions are insufficient.
 *
 * @param {object} config - MS Graph config
 * @param {string} userId - Target user ID or email
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Array} Array of normalized events, or empty array on 403
 */
async function getOtherCalendarEvents(config, userId, startDate, endDate) {
  const token = await getAccessToken(config);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: '100',
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,location,isAllDay,isCancelled,organizer,attendees,importance,showAs,webLink,categories,recurrence,body,onlineMeeting,hasAttachments,bodyPreview'
  });

  const apiPath = `/v1.0/users/${encodeURIComponent(userId)}/calendarView?${params.toString()}`;
  const resp = await graphAPI(token, apiPath);

  // Handle 403 gracefully — insufficient permissions for shared calendar
  if (resp._statusCode === 403 || (resp.error && resp.error.code === 'ErrorAccessDenied')) {
    return [];
  }
  assertNoGraphError(resp, 'getOtherCalendarEvents');

  const events = resp.value || [];
  return events
    .filter(e => !e.isCancelled)
    .map(e => ({
      id: e.id,
      subject: (e.subject || '').trim(),
      start: e.start?.dateTime ? new Date(e.start.dateTime + 'Z').toISOString() : null,
      end: e.end?.dateTime ? new Date(e.end.dateTime + 'Z').toISOString() : null,
      timeZone: e.start?.timeZone || 'UTC',
      location: e.location?.displayName || '',
      isAllDay: e.isAllDay || false,
      isCancelled: e.isCancelled || false,
      organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || '',
      organizerEmail: e.organizer?.emailAddress?.address || '',
      attendees: (e.attendees || []).map(a => ({
        name: a.emailAddress?.name || '',
        email: a.emailAddress?.address || '',
        status: a.status?.response || 'none'
      })),
      importance: e.importance || 'normal',
      showAs: e.showAs || 'busy',
      webLink: e.webLink || '',
      categories: e.categories || [],
      isRecurring: !!e.recurrence,
      body: e.body?.content || '',
      bodyPreview: e.bodyPreview || '',
      bodyContentType: e.body?.contentType || 'text',
      onlineMeetingUrl: e.onlineMeeting?.joinUrl || '',
      hasAttachments: e.hasAttachments || false,
      zoomUrl: ((e.body?.content || '') + ' ' + (e.location?.displayName || '')).match(/https:\/\/[\w.-]*zoom\.us\/[jw]\/[\d?=&]+/i)?.[0] || ''
    }));
}

/**
 * Create a new calendar event.
 * @param {object} config - MS Graph config
 * @param {object} eventData - { subject, body, start, end, timeZone, location, attendees, isOnlineMeeting, onlineMeetingProvider, categories, isAllDay }
 * @returns {object} Created event from Graph API
 */
async function createCalendarEvent(config, eventData) {
  if (!eventData.subject) throw new Error('createCalendarEvent: subject is required');
  if (!eventData.start || !eventData.end) throw new Error('createCalendarEvent: start and end are required');

  const token = await getAccessToken(config);
  const tz = eventData.timeZone || 'AUS Eastern Standard Time';

  const payload = {
    subject: eventData.subject,
    body: { contentType: 'HTML', content: eventData.body || '' },
    start: { dateTime: eventData.start, timeZone: tz },
    end: { dateTime: eventData.end, timeZone: tz },
    location: { displayName: eventData.location || '' },
    attendees: (eventData.attendees || []).map(a => ({
      emailAddress: { address: a.email, name: a.name || a.email },
      type: 'required'
    })),
    isOnlineMeeting: eventData.isOnlineMeeting || false,
    onlineMeetingProvider: eventData.onlineMeetingProvider || 'teamsForBusiness',
    categories: eventData.categories || [],
    isAllDay: eventData.isAllDay || false
  };

  const apiPath = `${userPath(config)}/calendar/events`;
  const resp = await graphAPIMutate(token, apiPath, 'POST', payload);
  assertNoGraphError(resp, 'createCalendarEvent');
  return resp;
}

/**
 * Update an existing calendar event.
 * @param {object} config - MS Graph config
 * @param {string} eventId - Graph event ID
 * @param {object} updates - Partial event fields to update
 * @returns {object} Updated event from Graph API
 */
async function updateCalendarEvent(config, eventId, updates) {
  if (!eventId) throw new Error('updateCalendarEvent: eventId is required');

  const token = await getAccessToken(config);
  const apiPath = `${userPath(config)}/events/${encodeURIComponent(eventId)}`;
  const resp = await graphAPIMutate(token, apiPath, 'PATCH', updates);
  assertNoGraphError(resp, 'updateCalendarEvent');
  return resp;
}

/**
 * Delete a calendar event.
 * @param {object} config - MS Graph config
 * @param {string} eventId - Graph event ID
 * @returns {{ ok: true }}
 */
async function deleteCalendarEvent(config, eventId) {
  if (!eventId) throw new Error('deleteCalendarEvent: eventId is required');

  const token = await getAccessToken(config);
  const apiPath = `${userPath(config)}/events/${encodeURIComponent(eventId)}`;
  const resp = await graphAPIMutate(token, apiPath, 'DELETE');
  if (resp._statusCode !== 204 && resp.error) {
    assertNoGraphError(resp, 'deleteCalendarEvent');
  }
  return { ok: true };
}

/**
 * Get attachments for a calendar event.
 * @param {object} config - MS Graph config
 * @param {string} eventId - Graph event ID
 * @returns {Array} Array of { id, name, contentType, size, isInline }
 */
async function getCalendarEventAttachments(config, eventId) {
  if (!eventId) throw new Error('getCalendarEventAttachments: eventId is required');

  const token = await getAccessToken(config);
  const apiPath = `${userPath(config)}/events/${encodeURIComponent(eventId)}/attachments?$select=id,name,contentType,size,isInline`;
  const resp = await graphAPI(token, apiPath);
  assertNoGraphError(resp, 'getCalendarEventAttachments');
  return (resp.value || []).map(att => ({
    id: att.id,
    name: att.name || 'unnamed',
    contentType: att.contentType || 'application/octet-stream',
    size: att.size || 0,
    isInline: att.isInline || false
  }));
}

/**
 * Create an online meeting (Teams).
 * @param {object} config - MS Graph config
 * @param {object} meetingData - { subject, start, end }
 * @returns {object} Created meeting with joinUrl, etc.
 */
async function createOnlineMeeting(config, meetingData) {
  if (!meetingData.subject) throw new Error('createOnlineMeeting: subject is required');
  if (!meetingData.start || !meetingData.end) throw new Error('createOnlineMeeting: start and end are required');

  const token = await getAccessToken(config);
  const payload = {
    subject: meetingData.subject,
    startDateTime: meetingData.start,
    endDateTime: meetingData.end
  };

  const resp = await graphAPIMutate(token, '/v1.0/me/onlineMeetings', 'POST', payload);
  assertNoGraphError(resp, 'createOnlineMeeting');
  return resp;
}

// ─── Exports ─────────────────────────────────────────────────

module.exports = {
  // Auth (delegated flow)
  getAccessToken,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  GRAPH_SCOPES,

  // HTTP helpers
  graphAPI,
  graphAPIMutate,

  // Read operations
  fetchOutlookEmails,
  fetchEmailFullBody,
  fetchMessageAttachments,

  // Write operations
  sendEmail,
  replyToEmail,
  forwardEmail,
  setEmailCategories,
  markEmailRead,
  respondToCalendarEvent,
  getCalendarEvent,
  getCalendarEvents,
  listCalendars,
  getOtherCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventAttachments,
  createOnlineMeeting,

  // Tenant discovery
  discoverTenantId,

  // Utilities
  stableEmailId,
  formatEmailTime,
  formatEmailDate
};
