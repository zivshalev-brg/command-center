/**
 * ai-classifier.js — Anthropic Opus 4.5 thread classification engine
 *
 * Classifies communication threads (email + Slack) by category, priority,
 * sentiment, and action type. Uses native https (no npm dependencies).
 */

'use strict';

const https = require('https');
const MODELS = require('./ai-models');

// ─── Constants ──────────────────────────────────────────────────

const MODEL = MODELS.OPUS;
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_CONCURRENT = 5;
const CLASSIFY_MAX_TOKENS = 500;
const MAX_MESSAGES_IN_PROMPT = 10;
const MAX_MESSAGE_CHARS = 200;
const MAX_PROMPT_CHARS = 2000;

const VALID_CATEGORIES = [
  'Operations', 'Finance', 'People', 'Product',
  'Marketing', 'Sales', 'Legal', 'External', 'Social', 'FYI'
];

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];

const VALID_SENTIMENTS = ['positive', 'neutral', 'negative', 'urgent'];

const VALID_ACTION_TYPES = [
  'reply-needed', 'decision-needed', 'review', 'delegate', 'info-only'
];

const DEFAULT_CLASSIFICATION = Object.freeze({
  category: 'FYI',
  subcategory: 'unclassified',
  priority: 'low',
  sentiment: 'neutral',
  actionRequired: false,
  actionType: 'info-only',
  summary: 'Could not classify this thread.',
  confidence: 0.1
});

const KNOWN_PROJECTS = [
  'FTBP', 'Platinum Roasters', 'Project Feral', 'PBB', 'DE Launch', 'NL Launch',
  'Affordability', 'Oracle', 'Cancellation Flow', 'Collections', 'Onboarding',
  'Email Lifecycle', 'MICE', 'WOC', 'Brand Summit', 'Machine Integration',
  'MaraX3', 'Barista Touch Impress', 'Beanz on Breville'
];

const SYSTEM_PROMPT = [
  'You are an AI assistant that classifies communication threads for Ziv Shalev,',
  'General Manager of Beanz — a coffee subscription platform under the Breville Group.',
  'Beanz operates across AU, UK, US, DE, and NL markets.',
  'CY25 targets: $13.5M ARR, 1M bags, 36K subscribers, 95.5% SLA.',
  '',
  'PROJECT MATCHING RULES (apply aggressively — tag any thread that relates to a project):',
  '- FTBP: fast-track barista pack, FTBP, barista pack, acquisition, first bag, trial, starter',
  '- Platinum Roasters: platinum, roaster partner, Equator, Madcap, Methodical, roaster program, MOT',
  '- Project Feral: feral, AI-first, cancellation flow, collections, onboarding email, 26-week',
  '- PBB: powered by beanz, B2B, partner, white-label',
  '- DE Launch: Germany, Deutschland, DE market, Hamburg, Netherlands, NL, Benelux',
  '- Affordability: pricing, discount, affordability, cost, margin, economics',
  '- Oracle: Oracle, ERP, NetSuite, order management',
  '- MICE: MICE, expo, trade show, conference, booth, Melbourne',
  '- WOC: WOC, World of Coffee, San Diego',
  '- Brand Summit: brand summit, FY27 summit, brand strategy',
  '- Machine Integration: machine, MaraX3, Barista Touch, grinder, appliance, Breville machine',
  '- Email Lifecycle: email campaign, lifecycle, retention email, welcome series, winback',
  '- Cancellation Flow: cancel, churn, retention, save offer, winback flow',
  '- Collections: collection page, product collection, merchandise, SKU',
  '',
  'Classify the thread and return ONLY valid JSON (no markdown, no explanation):',
  '{',
  '  "category": "Operations|Finance|People|Product|Marketing|Sales|Legal|External|Social|FYI",',
  '  "subcategory": "more specific label",',
  '  "priority": "critical|high|medium|low",',
  '  "sentiment": "positive|neutral|negative|urgent",',
  '  "actionRequired": true|false,',
  '  "actionType": "reply-needed|decision-needed|review|delegate|info-only",',
  '  "summary": "one-sentence executive summary for Ziv",',
  '  "confidence": 0.0-1.0,',
  '  "projectTags": ["ALWAYS include matching projects from the list above. Use broad matching. Most business threads relate to at least one project."],',
  '  "isMarketing": true|false,',
  '  "isNotification": true|false,  (system-generated: delivery receipts, calendar invites, Jira/GitHub/CI alerts, newsletter-unsubscribe confirmations, out-of-office, mailer-daemon — NOT marketing promos)',
  '  "urgencyReason": "brief reason for the priority level"',
  '}'
].join('\n');

// ─── Anthropic API Call ─────────────────────────────────────────

/**
 * Calls the Anthropic Messages API using native https.
 * Returns the text content from the first content block.
 */
function callAnthropic(apiKey, systemPrompt, userMessage, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || CLASSIFY_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const req = https.request({
      hostname: API_HOSTNAME,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            reject(new Error('Unexpected API response structure'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`API request failed: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}

// ─── Prompt Builder ─────────────────────────────────────────────

/**
 * Constructs the user message for classification.
 * Includes subject, last N messages (truncated), participants, and sources.
 * Total prompt capped at ~2000 chars.
 */
function buildClassificationPrompt(thread) {
  const parts = [];

  // Subject line
  const subject = (thread.subject || 'No subject').slice(0, 150);
  parts.push(`Subject: ${subject}`);

  // Source info
  const sources = (thread.sources || []).join(', ') || 'unknown';
  parts.push(`Source: ${sources}`);

  // Participant list
  const people = (thread.people || []).slice(0, 10);
  if (people.length > 0) {
    parts.push(`Participants: ${people.join(', ')}`);
  }

  // Messages — last N, each truncated
  const messages = (thread.messages || []).slice(-MAX_MESSAGES_IN_PROMPT);
  if (messages.length > 0) {
    parts.push('');
    parts.push('Messages:');
    for (const msg of messages) {
      const sender = (msg.sender || 'Unknown').slice(0, 40);
      const text = (msg.text || '').slice(0, MAX_MESSAGE_CHARS);
      parts.push(`[${sender}]: ${text}`);
    }
  }

  // Join and enforce total cap
  const prompt = parts.join('\n');
  return prompt.slice(0, MAX_PROMPT_CHARS);
}

// ─── Response Parser ────────────────────────────────────────────

/**
 * Parses the raw API response text into a validated classification object.
 * Returns DEFAULT_CLASSIFICATION on any parse failure.
 */
function parseClassificationResponse(rawText) {
  try {
    // Strip markdown fences if present
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return validateClassification(parsed);
  } catch {
    console.error('[AI-Classifier] Failed to parse response:', rawText?.slice(0, 200));
    return { ...DEFAULT_CLASSIFICATION };
  }
}

/**
 * Validates and normalises classification fields.
 * Falls back to defaults for any invalid values.
 */
function validateClassification(raw) {
  const category = VALID_CATEGORIES.includes(raw.category)
    ? raw.category
    : DEFAULT_CLASSIFICATION.category;

  const priority = VALID_PRIORITIES.includes(raw.priority)
    ? raw.priority
    : DEFAULT_CLASSIFICATION.priority;

  const sentiment = VALID_SENTIMENTS.includes(raw.sentiment)
    ? raw.sentiment
    : DEFAULT_CLASSIFICATION.sentiment;

  const actionType = VALID_ACTION_TYPES.includes(raw.actionType)
    ? raw.actionType
    : DEFAULT_CLASSIFICATION.actionType;

  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : DEFAULT_CLASSIFICATION.confidence;

  // Validate projectTags — must be an array of strings matching known projects
  const projectTags = Array.isArray(raw.projectTags)
    ? raw.projectTags.filter(t => typeof t === 'string').map(t => t.slice(0, 50)).slice(0, 5)
    : [];

  const isMarketing = raw.isMarketing === true;
  const isNotification = raw.isNotification === true;

  const urgencyReason = typeof raw.urgencyReason === 'string'
    ? raw.urgencyReason.slice(0, 200)
    : '';

  return Object.freeze({
    category,
    subcategory: typeof raw.subcategory === 'string'
      ? raw.subcategory.slice(0, 100)
      : DEFAULT_CLASSIFICATION.subcategory,
    priority,
    sentiment,
    actionRequired: raw.actionRequired === true,
    actionType,
    summary: typeof raw.summary === 'string'
      ? raw.summary.slice(0, 300)
      : DEFAULT_CLASSIFICATION.summary,
    confidence,
    projectTags,
    isMarketing,
    isNotification,
    urgencyReason
  });
}

// ─── Main Classification ────────────────────────────────────────

/**
 * Classifies a single thread using the Anthropic API.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {object} thread — { subject, messages, people, sources }
 * @returns {Promise<object>} — classification result
 */
async function classifyThread(apiKey, thread) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }
  if (!thread || typeof thread !== 'object') {
    throw new Error('Thread object is required');
  }

  const userMessage = buildClassificationPrompt(thread);
  const rawResponse = await callAnthropic(
    apiKey,
    SYSTEM_PROMPT,
    userMessage,
    CLASSIFY_MAX_TOKENS
  );

  return parseClassificationResponse(rawResponse);
}

// ─── Queue Processor ────────────────────────────────────────────

/**
 * Processes a batch of threads with bounded concurrency.
 * Uses Promise.allSettled so one failure doesn't block others.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {Array<{threadId: string, thread: object}>} threads
 * @param {object} db — database module with upsertClassification
 * @returns {Promise<{classified: number, errors: number}>}
 */
async function processClassificationQueue(apiKey, threads, db) {
  if (!Array.isArray(threads) || threads.length === 0) {
    return { classified: 0, errors: 0 };
  }

  let classified = 0;
  let errors = 0;

  // Process in chunks of MAX_CONCURRENT
  for (let i = 0; i < threads.length; i += MAX_CONCURRENT) {
    const chunk = threads.slice(i, i + MAX_CONCURRENT);

    const promises = chunk.map(({ threadId, thread }) =>
      classifyThread(apiKey, thread)
        .then((result) => ({ threadId, thread, result, ok: true }))
        .catch((err) => ({ threadId, err, ok: false }))
    );

    const results = await Promise.allSettled(promises);

    for (const settled of results) {
      if (settled.status !== 'fulfilled') {
        errors += 1;
        continue;
      }

      const { threadId, thread, result, ok } = settled.value;
      if (ok) {
        try {
          const dataWithMeta = {
            ...result,
            messageCount: (thread.messages || []).length,
            modelUsed: MODEL
          };
          db.upsertClassification(threadId, dataWithMeta);
          classified += 1;
        } catch (dbErr) {
          console.error(`[AI-Classifier] DB error for ${threadId}:`, dbErr.message);
          errors += 1;
        }
      } else {
        errors += 1;
      }
    }
  }

  return { classified, errors };
}

// ─── Cache Lookup ───────────────────────────────────────────────

/**
 * Returns cached classification if still fresh (message count unchanged).
 *
 * @param {object} db — database module
 * @param {string} threadId
 * @param {number} currentMessageCount
 * @returns {object|null}
 */
function getCachedClassification(db, threadId, currentMessageCount) {
  return db.getClassificationIfFresh(threadId, currentMessageCount);
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
  classifyThread,
  processClassificationQueue,
  getCachedClassification,
  buildClassificationPrompt,
  // Exported for testing
  callAnthropic,
  parseClassificationResponse,
  validateClassification,
  DEFAULT_CLASSIFICATION,
  SYSTEM_PROMPT
};
