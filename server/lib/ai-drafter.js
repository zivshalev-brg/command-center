/**
 * ai-drafter.js — Anthropic Opus 4.5 response drafting engine
 *
 * Generates email/Slack drafts in Ziv's voice, using a configurable
 * voice profile loaded from KB data. Uses native https (no npm deps).
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const MODELS = require('./ai-models');

// ─── Constants ──────────────────────────────────────────────────

const MODEL = MODELS.OPUS;
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const DRAFT_MAX_TOKENS = 1000;
const QUICK_REPLY_MAX_TOKENS = 300;
const MAX_THREAD_MESSAGES = 20;
const MAX_MESSAGE_TEXT = 500;

const DEFAULT_VOICE_PROFILE = Object.freeze({
  name: 'Ziv Shalev',
  role: 'General Manager, Beanz',
  company: 'Beanz (part of Breville Group)',
  toneAttributes: [
    'direct and decisive',
    'warm but concise',
    'action-oriented'
  ],
  signaturePatterns: [],
  avoidPatterns: [],
  signOff: 'Cheers,\nZiv',
  contextInstructions: ''
});

// ─── Voice Profile Cache ────────────────────────────────────────

let _cachedProfile = null;
let _cachedMtime = 0;

// ─── Anthropic API Call ─────────────────────────────────────────

/**
 * Calls the Anthropic Messages API using native https.
 * Returns the text content from the first content block.
 */
function callAnthropic(apiKey, systemPrompt, userMessage, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || DRAFT_MAX_TOKENS,
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

// ─── Voice Profile Loader ───────────────────────────────────────

/**
 * Loads the voice profile from KB data with file mtime caching.
 * Falls back to DEFAULT_VOICE_PROFILE if file is missing or invalid.
 *
 * @param {string} kbDir — path to kb-data directory
 * @returns {object} — voice profile
 */
function loadVoiceProfile(kbDir) {
  const filePath = path.join(kbDir, 'intelligence', 'voice-profile.json');

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;

    // Return cached if file hasn't changed
    if (_cachedProfile && mtime === _cachedMtime) {
      return _cachedProfile;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const profile = validateVoiceProfile(parsed);

    _cachedProfile = profile;
    _cachedMtime = mtime;
    return profile;
  } catch (err) {
    console.warn('[AI-Drafter] Could not load voice profile, using defaults:', err.message);
    return { ...DEFAULT_VOICE_PROFILE };
  }
}

/**
 * Validates and normalises a voice profile object.
 * Fills in missing fields from defaults.
 */
function validateVoiceProfile(raw) {
  return Object.freeze({
    name: typeof raw.name === 'string' ? raw.name : DEFAULT_VOICE_PROFILE.name,
    role: typeof raw.role === 'string' ? raw.role : DEFAULT_VOICE_PROFILE.role,
    company: typeof raw.company === 'string' ? raw.company : DEFAULT_VOICE_PROFILE.company,
    toneAttributes: Array.isArray(raw.toneAttributes)
      ? [...raw.toneAttributes]
      : [...DEFAULT_VOICE_PROFILE.toneAttributes],
    signaturePatterns: Array.isArray(raw.signaturePatterns)
      ? [...raw.signaturePatterns]
      : [],
    avoidPatterns: Array.isArray(raw.avoidPatterns)
      ? [...raw.avoidPatterns]
      : [],
    signOff: typeof raw.signOff === 'string' ? raw.signOff : DEFAULT_VOICE_PROFILE.signOff,
    contextInstructions: typeof raw.contextInstructions === 'string'
      ? raw.contextInstructions
      : DEFAULT_VOICE_PROFILE.contextInstructions
  });
}

// ─── System Prompt Builder ──────────────────────────────────────

/**
 * Constructs the system prompt from a voice profile.
 *
 * @param {object} voiceProfile
 * @returns {string}
 */
function buildDraftSystemPrompt(voiceProfile) {
  const vp = voiceProfile || DEFAULT_VOICE_PROFILE;
  const parts = [];

  parts.push(
    `You are drafting a response on behalf of ${vp.name}, ${vp.role} at ${vp.company}.`
  );

  // Voice attributes
  parts.push('');
  parts.push('Voice:');
  for (const attr of (vp.toneAttributes || [])) {
    parts.push(`- ${attr}`);
  }

  // Signature patterns (for reference)
  if (vp.signaturePatterns && vp.signaturePatterns.length > 0) {
    parts.push('');
    parts.push('Typical phrases (use sparingly):');
    for (const pat of vp.signaturePatterns) {
      parts.push(`- "${pat}"`);
    }
  }

  // Sign-off
  parts.push('');
  parts.push(`Sign-off: ${vp.signOff}`);

  // Avoid patterns
  if (vp.avoidPatterns && vp.avoidPatterns.length > 0) {
    parts.push('');
    parts.push(`NEVER use these phrases: ${vp.avoidPatterns.join(', ')}`);
  }

  // Context
  if (vp.contextInstructions) {
    parts.push('');
    parts.push(`Context: ${vp.contextInstructions}`);
  }

  // Output instructions
  parts.push('');
  parts.push('Write a draft response that is ready to send with minimal editing.');
  parts.push('Return ONLY the draft text, no explanations or meta-commentary.');

  return parts.join('\n');
}

// ─── User Prompt Builder ────────────────────────────────────────

/**
 * Constructs the user message with full thread context.
 *
 * @param {object} thread — { subject, messages, people, sources }
 * @param {object} options — { replyType, customInstructions }
 * @returns {string}
 */
function buildDraftUserPrompt(thread, options) {
  const parts = [];
  const opts = options || {};

  // Reply type instruction
  const replyType = opts.replyType || 'reply';
  const replyLabels = {
    reply: 'a reply to the sender',
    replyAll: 'a reply-all to all participants',
    forward: 'a forwarding message introducing the thread to a new recipient',
    new: 'a new outbound message'
  };
  parts.push(`Draft ${replyLabels[replyType] || replyLabels.reply}.`);

  // Subject
  const subject = (thread.subject || 'No subject').slice(0, 200);
  parts.push('');
  parts.push(`Subject: ${subject}`);

  // Messages in thread
  const messages = (thread.messages || []).slice(-MAX_THREAD_MESSAGES);
  if (messages.length > 0) {
    parts.push('');
    parts.push('Thread:');
    for (const msg of messages) {
      const sender = (msg.sender || 'Unknown').slice(0, 50);
      const time = msg.time ? ` (${msg.time})` : '';
      const via = msg.via ? ` [via ${msg.via}]` : '';
      const text = (msg.text || '').slice(0, MAX_MESSAGE_TEXT);
      parts.push(`---`);
      parts.push(`From: ${sender}${time}${via}`);
      parts.push(text);
    }
  }

  // Participants
  const people = (thread.people || []).slice(0, 15);
  if (people.length > 0) {
    parts.push('');
    parts.push(`Participants: ${people.join(', ')}`);
  }

  // Custom instructions
  if (opts.customInstructions) {
    parts.push('');
    parts.push(`Additional instructions: ${opts.customInstructions}`);
  }

  return parts.join('\n');
}

// ─── Quick Replies Prompt ───────────────────────────────────────

/**
 * Builds the system prompt for generating quick reply options.
 *
 * @param {object} voiceProfile
 * @returns {string}
 */
function buildQuickReplySystemPrompt(voiceProfile) {
  const vp = voiceProfile || DEFAULT_VOICE_PROFILE;
  return [
    `Generate 3-5 very short (max 15 words each) reply options for ${vp.name}, ${vp.role}.`,
    '',
    'Voice: ' + (vp.toneAttributes || []).slice(0, 3).join(', '),
    '',
    'Return ONLY a JSON array of strings. No markdown, no explanation.',
    'Example: ["Thanks, will review today.", "Let me check with the team and get back to you.", "Approved - go ahead."]'
  ].join('\n');
}

/**
 * Builds the user prompt for quick reply generation.
 *
 * @param {object} thread
 * @returns {string}
 */
function buildQuickReplyUserPrompt(thread) {
  const parts = [];
  const subject = (thread.subject || 'No subject').slice(0, 150);
  parts.push(`Subject: ${subject}`);

  // Only the last 3 messages for quick replies
  const messages = (thread.messages || []).slice(-3);
  if (messages.length > 0) {
    parts.push('');
    for (const msg of messages) {
      const sender = (msg.sender || 'Unknown').slice(0, 40);
      const text = (msg.text || '').slice(0, 200);
      parts.push(`[${sender}]: ${text}`);
    }
  }

  return parts.join('\n');
}

// ─── Main Draft Generation ──────────────────────────────────────

/**
 * Generates a full draft response using Opus 4.5.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {object} thread — { subject, messages, people, sources }
 * @param {object} voiceProfile — loaded via loadVoiceProfile()
 * @param {object} options — { replyType, customInstructions }
 * @returns {Promise<{draftText, draftHtml, suggestedSubject, confidence}>}
 */
async function generateDraft(apiKey, thread, voiceProfile, options) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }
  if (!thread || typeof thread !== 'object') {
    throw new Error('Thread object is required');
  }

  const vp = voiceProfile || DEFAULT_VOICE_PROFILE;
  const systemPrompt = buildDraftSystemPrompt(vp);
  const userMessage = buildDraftUserPrompt(thread, options);

  const rawResponse = await callAnthropic(
    apiKey,
    systemPrompt,
    userMessage,
    DRAFT_MAX_TOKENS
  );

  return parseDraftResponse(rawResponse, thread, options);
}

/**
 * Parses the raw draft response into a structured result.
 */
function parseDraftResponse(rawText, thread, options) {
  const draftText = (rawText || '').trim();

  // Build a simple HTML version (paragraphs from double newlines)
  const draftHtml = draftText
    .split(/\n\n+/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  // Suggest subject based on reply type
  const opts = options || {};
  const originalSubject = thread.subject || '';
  const suggestedSubject = buildSuggestedSubject(originalSubject, opts.replyType);

  return Object.freeze({
    draftText,
    draftHtml,
    suggestedSubject,
    confidence: draftText.length > 20 ? 0.85 : 0.4
  });
}

/**
 * Builds a suggested subject line based on reply type.
 */
function buildSuggestedSubject(originalSubject, replyType) {
  if (!originalSubject) return '';

  const prefixMap = {
    reply: 'Re: ',
    replyAll: 'Re: ',
    forward: 'Fwd: ',
    new: ''
  };

  const prefix = prefixMap[replyType] || 'Re: ';
  const stripped = originalSubject.replace(/^(Re:|Fwd:|FW:)\s*/gi, '').trim();

  if (replyType === 'new') return '';
  return `${prefix}${stripped}`;
}

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Quick Reply Generation ─────────────────────────────────────

/**
 * Generates 3-5 short one-liner reply options.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {object} thread — { subject, messages, people, sources }
 * @param {object} voiceProfile — loaded via loadVoiceProfile()
 * @returns {Promise<string[]>} — array of short reply strings
 */
async function generateQuickReplies(apiKey, thread, voiceProfile) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }
  if (!thread || typeof thread !== 'object') {
    throw new Error('Thread object is required');
  }

  const vp = voiceProfile || DEFAULT_VOICE_PROFILE;
  const systemPrompt = buildQuickReplySystemPrompt(vp);
  const userMessage = buildQuickReplyUserPrompt(thread);

  const rawResponse = await callAnthropic(
    apiKey,
    systemPrompt,
    userMessage,
    QUICK_REPLY_MAX_TOKENS
  );

  return parseQuickReplies(rawResponse);
}

/**
 * Parses the quick reply response into an array of strings.
 * Falls back to a generic set on failure.
 */
function parseQuickReplies(rawText) {
  try {
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      return getDefaultQuickReplies();
    }

    // Filter to valid strings, cap at 5
    const replies = parsed
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 100))
      .slice(0, 5);

    return replies.length >= 2 ? replies : getDefaultQuickReplies();
  } catch {
    console.error('[AI-Drafter] Failed to parse quick replies:', rawText?.slice(0, 200));
    return getDefaultQuickReplies();
  }
}

/**
 * Returns a set of generic fallback quick replies.
 */
function getDefaultQuickReplies() {
  return [
    'Thanks, noted.',
    'Will review and get back to you.',
    'Let me loop in the right person.'
  ];
}

// ─── Cache Reset (for testing) ──────────────────────────────────

/**
 * Resets the voice profile cache. Primarily for testing.
 */
function resetProfileCache() {
  _cachedProfile = null;
  _cachedMtime = 0;
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
  generateDraft,
  generateQuickReplies,
  loadVoiceProfile,
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  // Exported for testing / advanced usage
  callAnthropic,
  buildQuickReplySystemPrompt,
  buildQuickReplyUserPrompt,
  parseDraftResponse,
  parseQuickReplies,
  validateVoiceProfile,
  resetProfileCache,
  DEFAULT_VOICE_PROFILE
};
