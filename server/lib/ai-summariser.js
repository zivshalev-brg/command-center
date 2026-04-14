/**
 * ai-summariser.js — Dedicated thread summarisation engine
 *
 * Produces rich, structured summaries with key points, decisions,
 * action items, open questions, participant roles, and attachment insights.
 * Separate from the classifier (which handles category/priority/sentiment).
 *
 * Uses the same Anthropic API call pattern as ai-classifier.js.
 */

'use strict';

const { callAnthropic } = require('./ai-classifier');

// ─── Constants ──────────────────────────────────────────────────

const SUMMARY_MAX_TOKENS = 1500;
const MAX_MESSAGES_IN_PROMPT = 30;
const MAX_MESSAGE_CHARS = 800;
const MAX_PROMPT_CHARS = 12000;
const MAX_ATTACHMENT_CHARS = 3000;

const PARSEABLE_CONTENT_TYPES = new Set([
  'text/plain', 'text/csv', 'text/html',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const DEFAULT_SUMMARY = Object.freeze({
  summary: '',
  keyPoints: [],
  decisions: [],
  actionItems: [],
  openQuestions: [],
  participants: [],
  attachmentInsights: [],
  sentiment: 'neutral',
  suggestedAction: ''
});

const SUMMARY_SYSTEM_PROMPT = [
  'You are summarising a communication thread for Ziv Shalev, General Manager of Beanz',
  '(a coffee subscription platform under the Breville Group).',
  'Beanz operates across AU, UK, US, DE, and NL markets.',
  'CY25 targets: $13.5M ARR, 1M bags, 36K subscribers, 95.5% SLA.',
  'Key initiatives: FTBP (Fast-Track Barista Pack), Platinum Roasters, Project Feral (AI-first), PBB.',
  '',
  'Analyse the FULL thread carefully — every message, every participant, every attachment.',
  '',
  'Return ONLY valid JSON (no markdown fences, no explanation):',
  '{',
  '  "summary": "2-4 sentence executive summary of the full thread",',
  '  "keyPoints": ["key point 1", "key point 2", ...],',
  '  "decisions": ["confirmed decision 1", ...],',
  '  "actionItems": [{"owner": "name", "action": "description", "deadline": "if mentioned"}],',
  '  "openQuestions": ["unresolved question 1", ...],',
  '  "participants": [{"name": "full name", "role": "inferred role/contribution in this thread"}],',
  '  "attachmentInsights": ["key takeaway from attachment content", ...],',
  '  "sentiment": "positive|neutral|negative|urgent",',
  '  "suggestedAction": "specific actionable recommendation for Ziv"',
  '}',
  '',
  'Rules:',
  '- summary: 2-4 substantive sentences covering the thread\'s purpose, status, and what Ziv needs to know',
  '- keyPoints: 3-7 items, each a substantive point from the discussion (not metadata)',
  '- decisions: only confirmed/agreed decisions, empty array if none',
  '- actionItems: explicit action items with an owner if identifiable, empty if none',
  '- openQuestions: unresolved questions that still need answers, empty if none',
  '- participants: list each person with their contribution in this specific thread',
  '- attachmentInsights: key takeaways from attachment content provided below, empty if no attachments',
  '- suggestedAction: one specific, actionable next step for Ziv'
].join('\n');

// ─── Prompt Builder ─────────────────────────────────────────────

/**
 * Builds the user message for the summariser, including full message history
 * and attachment text content.
 *
 * @param {object} thread — { subject, messages, people, sources }
 * @param {Array<{name, contentType, textContent}>} attachmentContents
 * @returns {string}
 */
function buildSummaryPrompt(thread, attachmentContents) {
  const parts = [];

  // Subject
  parts.push(`Subject: ${(thread.subject || 'No subject').slice(0, 300)}`);

  // Source info
  const sources = (thread.sources || []).join(', ') || 'unknown';
  parts.push(`Source: ${sources}`);

  // Participant overview
  const people = (thread.people || []).slice(0, 20);
  if (people.length > 0) {
    parts.push(`Participants: ${people.join(', ')}`);
  }

  // Full message history
  const allMsgs = thread.messages || [];
  const messages = allMsgs.slice(-MAX_MESSAGES_IN_PROMPT);
  if (messages.length > 0) {
    parts.push('');
    parts.push(`Messages (${messages.length} of ${allMsgs.length} total):`);
    for (const msg of messages) {
      const sender = (msg.sender || 'Unknown').slice(0, 60);
      const time = msg.time ? ` (${msg.time})` : '';
      const text = (msg.text || '').slice(0, MAX_MESSAGE_CHARS);
      // Include To/CC if available
      const toLine = (msg.to && msg.to.length)
        ? `\n  To: ${msg.to.map((r) => r.name || r.address).join(', ')}`
        : '';
      const ccLine = (msg.cc && msg.cc.length)
        ? `\n  CC: ${msg.cc.map((r) => r.name || r.address).join(', ')}`
        : '';
      parts.push(`\n--- [${sender}]${time}${toLine}${ccLine}\n${text}`);
    }
  }

  // Attachment contents
  if (attachmentContents && attachmentContents.length > 0) {
    parts.push('');
    parts.push('Attachment Contents:');
    for (const att of attachmentContents) {
      parts.push(`\n=== Attachment: ${att.name} (${att.contentType}) ===`);
      parts.push((att.textContent || '').slice(0, MAX_ATTACHMENT_CHARS));
    }
  }

  const prompt = parts.join('\n');
  return prompt.slice(0, MAX_PROMPT_CHARS);
}

// ─── Attachment Text Extraction ─────────────────────────────────

/**
 * Extract readable text from a base64-encoded attachment.
 * Limited to text-based formats (no npm dependencies).
 *
 * @param {string} contentBytes — base64-encoded content
 * @param {string} contentType — MIME type
 * @returns {string}
 */
function extractAttachmentText(contentBytes, contentType) {
  if (!contentBytes) return '';

  try {
    const buffer = Buffer.from(contentBytes, 'base64');

    // Text-based formats: decode directly
    if (contentType.startsWith('text/') || contentType === 'application/json') {
      let text = buffer.toString('utf-8');
      if (contentType === 'text/html') {
        // Strip HTML tags for cleaner text
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return text.slice(0, MAX_ATTACHMENT_CHARS);
    }

    // Binary formats (PDF, DOCX): best-effort printable text extraction
    const str = buffer.toString('utf-8', 0, Math.min(buffer.length, 500000));
    const printable = str
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s{3,}/g, ' ')
      .trim();
    if (printable.length > 50) {
      return printable.slice(0, MAX_ATTACHMENT_CHARS);
    }
    return '[Binary content — could not extract readable text]';
  } catch {
    return '[Failed to extract attachment content]';
  }
}

// ─── Response Parser ────────────────────────────────────────────

/**
 * Parse and validate the AI summariser response.
 * Falls back to DEFAULT_SUMMARY on any parse failure.
 */
function parseSummaryResponse(rawText) {
  try {
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    return validateSummaryResponse(parsed);
  } catch {
    console.error('[AI-Summariser] Failed to parse response:', rawText?.slice(0, 300));
    return { ...DEFAULT_SUMMARY };
  }
}

/** Validate and normalise each field of the summary response. */
function validateSummaryResponse(raw) {
  return Object.freeze({
    summary: typeof raw.summary === 'string'
      ? raw.summary.slice(0, 1000)
      : DEFAULT_SUMMARY.summary,
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.filter((s) => typeof s === 'string').slice(0, 7)
      : [],
    decisions: Array.isArray(raw.decisions)
      ? raw.decisions.filter((s) => typeof s === 'string').slice(0, 5)
      : [],
    actionItems: Array.isArray(raw.actionItems)
      ? raw.actionItems.slice(0, 5).map(validateActionItem)
      : [],
    openQuestions: Array.isArray(raw.openQuestions)
      ? raw.openQuestions.filter((s) => typeof s === 'string').slice(0, 5)
      : [],
    participants: Array.isArray(raw.participants)
      ? raw.participants.slice(0, 15).map(validateParticipant)
      : [],
    attachmentInsights: Array.isArray(raw.attachmentInsights)
      ? raw.attachmentInsights.filter((s) => typeof s === 'string').slice(0, 5)
      : [],
    sentiment: ['positive', 'neutral', 'negative', 'urgent'].includes(raw.sentiment)
      ? raw.sentiment
      : 'neutral',
    suggestedAction: typeof raw.suggestedAction === 'string'
      ? raw.suggestedAction.slice(0, 300)
      : ''
  });
}

function validateActionItem(item) {
  if (!item || typeof item !== 'object') return { owner: '', action: String(item || ''), deadline: '' };
  return {
    owner: typeof item.owner === 'string' ? item.owner.slice(0, 60) : '',
    action: typeof item.action === 'string' ? item.action.slice(0, 200) : '',
    deadline: typeof item.deadline === 'string' ? item.deadline.slice(0, 50) : ''
  };
}

function validateParticipant(item) {
  if (!item || typeof item !== 'object') return { name: String(item || ''), role: '' };
  return {
    name: typeof item.name === 'string' ? item.name.slice(0, 80) : '',
    role: typeof item.role === 'string' ? item.role.slice(0, 120) : ''
  };
}

// ─── Main Summarisation ─────────────────────────────────────────

/**
 * Generate a rich, structured summary of a communication thread.
 *
 * @param {string} apiKey — Anthropic API key
 * @param {object} thread — { subject, messages, people, sources }
 * @param {Array}  attachmentContents — [{ name, contentType, textContent }]
 * @returns {Promise<object>} — validated summary object
 */
async function summariseThread(apiKey, thread, attachmentContents) {
  if (!apiKey) throw new Error('Anthropic API key is required');
  if (!thread || typeof thread !== 'object') throw new Error('Thread object is required');

  const userMessage = buildSummaryPrompt(thread, attachmentContents || []);
  const rawResponse = await callAnthropic(
    apiKey,
    SUMMARY_SYSTEM_PROMPT,
    userMessage,
    SUMMARY_MAX_TOKENS
  );

  return parseSummaryResponse(rawResponse);
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
  summariseThread,
  buildSummaryPrompt,
  extractAttachmentText,
  parseSummaryResponse,
  validateSummaryResponse,
  PARSEABLE_CONTENT_TYPES,
  DEFAULT_SUMMARY
};
