/**
 * comms.js — AI-powered communications route handler
 *
 * Endpoints for thread listing (with AI enrichment), classification,
 * draft generation, email operations, and unified thread management.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { jsonReply, readBody } = require('../lib/helpers');
const { fetchSlackChannels, buildSlackThreads } = require('../lib/slack-api');
const db = require('../lib/db');

// ─── Shared Helpers ──────────────────────────────────────────────

/** Read email threads from email-live.json */
function readEmailThreads(ctx) {
  const emailPath = path.join(ctx.dir, 'kb-data', 'intelligence', 'email-live.json');
  if (!fs.existsSync(emailPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(emailPath, 'utf8'));
    return data.threads || {};
  } catch (e) {
    console.error('[Comms] Failed to parse email-live.json:', e.message);
    return {};
  }
}

/** Merge Slack and email threads into one combined set */
function mergeAllThreads(slackThreads, emailThreads) {
  const merged = {};
  for (const [id, th] of Object.entries(slackThreads || {})) {
    merged[id] = th;
  }
  for (const [id, th] of Object.entries(emailThreads || {})) {
    merged[id] = th;
  }
  return merged;
}

/** Load all threads from both Slack and email caches */
function loadAllThreads(ctx) {
  let slackThreads = {};
  let refreshedAt = null;

  if (fs.existsSync(ctx.commsLivePath)) {
    try {
      const slackData = JSON.parse(fs.readFileSync(ctx.commsLivePath, 'utf8'));
      slackThreads = slackData.threads || {};
      refreshedAt = slackData.refreshedAt;
    } catch (e) {
      console.error('[Comms] Failed to parse comms-live.json:', e.message);
    }
  }

  const emailThreads = readEmailThreads(ctx);
  const allThreads = mergeAllThreads(slackThreads, emailThreads);
  return { allThreads, refreshedAt };
}

/** Look up a single thread by ID across all sources */
function findThread(ctx, threadId) {
  const { allThreads } = loadAllThreads(ctx);
  return allThreads[threadId] || null;
}

/** Build the old regex-based summary as a fallback */
function buildRegexSummary(th) {
  const msgs = th.messages || [];
  const participants = [...new Set(msgs.map(m => m.sender).filter(s => s && s !== 'You'))];
  const dateRange = msgs.length
    ? (msgs[0].time || '').split(',')[0] +
      (msgs.length > 1 ? ' - ' + (msgs[msgs.length - 1].time || '').split(',')[0] : '')
    : '';

  const allText = msgs.map(m => m.text || '').join(' ');
  const sentences = allText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);

  const actionPatterns = /\b(please|need to|can you|could you|will do|ill do|let me|action|approve|review|prepare|schedule|send|share|update|follow up|get back)\b/i;
  const actionItems = sentences.filter(s => actionPatterns.test(s)).slice(0, 5);

  const decisionPatterns = /\b(agreed|confirmed|lets go with|decided|approved|signed off|go ahead|works for me|sounds good|perfect|great)\b/i;
  const decisions = sentences.filter(s => decisionPatterns.test(s)).slice(0, 3);

  const questions = msgs
    .filter(m => (m.text || '').includes('?'))
    .map(m => m.text.split('?')[0].trim() + '?')
    .slice(0, 3);

  const keyPoints = [];
  if (decisions.length) decisions.forEach(d => keyPoints.push(d.slice(0, 80)));
  if (actionItems.length) actionItems.slice(0, 3).forEach(a => keyPoints.push(a.slice(0, 80)));
  if (questions.length && keyPoints.length < 4) questions.slice(0, 2).forEach(q => keyPoints.push(q.slice(0, 80)));
  if (keyPoints.length < 2 && msgs.length >= 2) {
    keyPoints.unshift((msgs[0].sender || '') + ': ' + (msgs[0].text || '').slice(0, 60));
    keyPoints.push((msgs[msgs.length - 1].sender || '') + ': ' + (msgs[msgs.length - 1].text || '').slice(0, 60));
  }

  let summaryText = '';
  if (participants.length === 1) {
    summaryText = participants[0] + ' discussing ' + (th.subject || 'this topic') + '.';
  } else if (participants.length > 1) {
    summaryText = participants.slice(0, 3).join(', ') +
      (participants.length > 3 ? ' and others' : '') +
      ' discussing ' + (th.subject || 'this topic') + '.';
  } else {
    summaryText = 'Thread about ' + (th.subject || 'this topic') + '.';
  }
  if (decisions.length) summaryText += ' Key decision: ' + decisions[0].slice(0, 60) + '.';
  else if (actionItems.length) summaryText += ' Action needed: ' + actionItems[0].slice(0, 60) + '.';
  if (msgs.length > 3) summaryText += ' ' + msgs.length + ' messages exchanged.';

  let suggestedAction = '';
  if (th.priority === 'critical') {
    suggestedAction = actionItems.length ? actionItems[0].slice(0, 60) : 'Review and respond urgently';
  } else if (th.priority === 'action') {
    if (questions.length) suggestedAction = 'Respond to: ' + questions[0].slice(0, 50);
    else if (actionItems.length) suggestedAction = actionItems[0].slice(0, 60);
    else suggestedAction = 'Review and follow up';
  } else {
    suggestedAction = 'No action required — informational thread';
  }

  return {
    summary: summaryText,
    keyPoints: keyPoints.slice(0, 5),
    suggestedAction,
    participants: participants.length + 1,
    messageCount: msgs.length,
    dateRange,
    decisions: decisions.slice(0, 3),
    openQuestions: questions.slice(0, 3),
    quickReplies: [],
    source: 'regex'
  };
}

// ─── Attachment Content Fetcher ─────────────────────────────────

/**
 * Fetch text content from attachments across a thread's messages.
 * Used to feed attachment context into the AI summariser.
 *
 * @param {object} ctx — server context with msGraph config
 * @param {object} th — thread object with messages array
 * @returns {Promise<Array<{name, contentType, textContent}>>}
 */
async function fetchThreadAttachmentContents(ctx, th) {
  if (!ctx.msGraph) return [];

  const { fetchMessageAttachments } = require('../lib/outlook-api');
  const { extractAttachmentText, PARSEABLE_CONTENT_TYPES } = require('../lib/ai-summariser');

  const msgs = (th.messages || []).filter(
    (m) => m.hasAttachments && (m.graphId || m.emailMessageId)
  );
  // Limit to 5 messages to avoid rate limits
  const toFetch = msgs.slice(0, 5);
  const results = [];

  for (const msg of toFetch) {
    const msgId = msg.graphId || msg.emailMessageId;
    try {
      const attachments = await fetchMessageAttachments(ctx.msGraph, msgId, {
        includeContent: true,
        maxContentSize: 5242880
      });
      for (const att of attachments) {
        if (att.isInline) continue;
        if (!PARSEABLE_CONTENT_TYPES.has(att.contentType)) continue;
        if (!att.contentBytes) continue;
        const textContent = extractAttachmentText(att.contentBytes, att.contentType);
        if (textContent && textContent.length > 10) {
          results.push({
            name: att.name,
            contentType: att.contentType,
            textContent
          });
        }
      }
    } catch (e) {
      console.error('[Comms] Failed to fetch attachments for message', msgId, e.message);
    }
  }

  return results;
}

// ─── Slack Attachment Content Fetcher ────────────────────────────

/**
 * Fetch text content from Slack file attachments across a thread.
 * Parallel to fetchThreadAttachmentContents() for email.
 *
 * Downloads files via url_private, extracts text, and returns
 * content suitable for the AI summariser.
 *
 * @param {object} ctx — server context with slackToken
 * @param {object} th — thread object with messages array
 * @returns {Promise<Array<{name, contentType, textContent}>>}
 */
async function fetchSlackThreadAttachmentContents(ctx, th) {
  const readTk = ctx.slackReadToken || ctx.slackToken;
  if (!readTk) return [];

  const { fetchSlackFileContent } = require('../lib/slack-api');
  const { extractAttachmentText, PARSEABLE_CONTENT_TYPES } = require('../lib/ai-summariser');

  const results = [];
  let fileCount = 0;
  const MAX_FILES = 5;

  const msgs = (th.messages || []).filter(
    (m) => m.attachments && m.attachments.length > 0
  );

  for (const msg of msgs) {
    if (fileCount >= MAX_FILES) break;
    for (const att of msg.attachments) {
      if (fileCount >= MAX_FILES) break;
      if (!att.urlPrivate) continue;

      // Check if content type is parseable
      const ct = att.contentType || '';
      if (!ct || (!PARSEABLE_CONTENT_TYPES.has(ct) && !ct.startsWith('text/'))) continue;

      try {
        const contentBuffer = await fetchSlackFileContent(readTk, att.urlPrivate);
        if (!contentBuffer || contentBuffer.length === 0) continue;

        const contentBase64 = contentBuffer.toString('base64');
        const textContent = extractAttachmentText(contentBase64, ct);
        if (textContent && textContent.length > 10) {
          results.push({
            name: att.name || 'file',
            contentType: ct,
            textContent
          });
          fileCount++;
        }
      } catch (e) {
        console.error('[Comms] Failed to fetch Slack file:', att.name, e.message);
      }
    }
  }

  return results;
}

// ─── Route Handler ───────────────────────────────────────────────

module.exports = async function handleComms(req, res, parts, url, ctx) {

  // ── GET /api/comms/refresh ────────────────────────────────────
  if (parts[1] === 'refresh') {
    try {
      const { refreshAll, getRefreshStatus } = require('../lib/refresh-engine');
      refreshAll(ctx);
      const status = getRefreshStatus();
      return jsonReply(res, 200, { ok: true, ...status, refreshedAt: new Date().toISOString() });
    } catch (e) {
      return jsonReply(res, 200, { ok: true, refreshedAt: new Date().toISOString(), note: 'Refresh engine not available' });
    }
  }

  // ── GET /api/comms/channels ───────────────────────────────────
  if (parts[1] === 'channels') {
    const readTk = ctx.slackReadToken || ctx.slackToken;
    if (!readTk) return jsonReply(res, 400, { error: 'No Slack token configured' });
    try {
      const channels = await fetchSlackChannels(readTk);
      return jsonReply(res, 200, { ok: true, channels });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // ── GET /api/comms/categories ─────────────────────────────────
  if (parts[1] === 'categories') {
    try {
      const counts = db.getCategoryCounts();
      return jsonReply(res, 200, { ok: true, categories: counts });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to load categories: ' + e.message });
    }
  }

  // ── GET /api/comms/drafts ─────────────────────────────────────
  if (parts[1] === 'drafts' && !parts[2]) {
    try {
      const drafts = db.getPendingDrafts();
      return jsonReply(res, 200, { ok: true, drafts });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to load drafts: ' + e.message });
    }
  }

  // ── GET /api/comms/unified/:id ────────────────────────────────
  if (parts[1] === 'unified' && parts[2]) {
    try {
      const threadId = decodeURIComponent(parts[2]);
      const group = db.getUnifiedGroup(threadId);
      return jsonReply(res, 200, { ok: true, group });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to load unified group: ' + e.message });
    }
  }

  // ── GET /api/comms/attachments/:messageId ──────────────────────
  if (parts[1] === 'attachments' && parts[2]) {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    const messageId = decodeURIComponent(parts[2]);
    const includeContent = url.searchParams && url.searchParams.get('content') === 'true';

    try {
      const { fetchMessageAttachments } = require('../lib/outlook-api');
      const attachments = await fetchMessageAttachments(ctx.msGraph, messageId, {
        includeContent,
        maxContentSize: includeContent ? 5242880 : 1048576
      });
      return jsonReply(res, 200, { ok: true, attachments });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to fetch attachments: ' + e.message });
    }
  }

  // ── GET /api/comms/slack-file-info/:fileId ────────────────────
  // Returns detailed info about a Slack file (for preview/download)
  if (parts[1] === 'slack-file-info' && parts[2]) {
    const fileTk = ctx.slackReadToken || ctx.slackToken;
    if (!fileTk) return jsonReply(res, 400, { error: 'Slack token not configured' });

    const fileId = decodeURIComponent(parts[2]);
    try {
      const { slackAPI } = require('../lib/slack-api');
      const resp = await slackAPI(fileTk, 'files.info', { file: fileId });
      if (resp.ok && resp.file) {
        return jsonReply(res, 200, {
          ok: true,
          file: {
            id: resp.file.id,
            name: resp.file.name,
            title: resp.file.title,
            mimetype: resp.file.mimetype,
            filetype: resp.file.filetype,
            size: resp.file.size,
            urlPrivate: resp.file.url_private,
            urlPrivateDownload: resp.file.url_private_download,
            permalink: resp.file.permalink,
            created: resp.file.created,
            user: resp.file.user
          }
        });
      }
      return jsonReply(res, 404, { error: resp.error || 'File not found' });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to fetch file info: ' + e.message });
    }
  }

  // ── GET /api/comms/summary/:id ────────────────────────────────
  if (parts[1] === 'summary' && parts[2]) {
    const threadId = decodeURIComponent(parts[2]);
    const th = findThread(ctx, threadId);
    if (!th) return jsonReply(res, 404, { error: 'Thread not found' });

    // If no API key, fall back to regex-based summary
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 200, buildRegexSummary(th));
    }

    try {
      const { classifyThread } = require('../lib/ai-classifier');
      const { generateQuickReplies, loadVoiceProfile } = require('../lib/ai-drafter');
      const { summariseThread, extractAttachmentText, PARSEABLE_CONTENT_TYPES } = require('../lib/ai-summariser');

      const msgs = th.messages || [];
      const msgCount = msgs.length;
      const isSlackThread = th.sources && th.sources.includes('slack');

      // Build attachment hash — works for both email and Slack
      const attachHashes = msgs.flatMap(m => {
        if (m.hasAttachments && (m.graphId || m.emailMessageId)) return [m.graphId || m.emailMessageId];
        if (m.attachments && m.attachments.length) return m.attachments.map(a => a.fileId || a.name || '');
        return [];
      }).sort().join(',');
      const attHash = attachHashes || null;
      const cachedSummary = db.getSummaryIfFresh(threadId, msgCount, attHash);

      // Phase 1: Classify + Quick Replies in parallel (+ attachment fetch if no cache)
      const promises = [
        classifyThread(ctx.anthropicApiKey, th),
        generateQuickReplies(ctx.anthropicApiKey, th, loadVoiceProfile(ctx.kbDir))
      ];
      if (!cachedSummary) {
        // Use appropriate attachment fetcher based on thread source
        if (isSlackThread) {
          promises.push(fetchSlackThreadAttachmentContents(ctx, th));
        } else {
          promises.push(fetchThreadAttachmentContents(ctx, th));
        }
      }

      const results = await Promise.allSettled(promises);
      const cls = results[0].status === 'fulfilled' ? results[0].value : null;
      const replies = results[1].status === 'fulfilled' ? results[1].value : [];
      const attachmentContents = (!cachedSummary && results[2])
        ? (results[2].status === 'fulfilled' ? results[2].value : [])
        : [];

      // Phase 2: Summarise (use cache if fresh, otherwise call AI)
      let summary;
      if (cachedSummary) {
        summary = cachedSummary;
      } else {
        summary = await summariseThread(ctx.anthropicApiKey, th, attachmentContents);
        // Cache the result
        db.upsertSummary(threadId, {
          summaryJson: summary,
          messageCount: msgCount,
          attachmentHash: attHash,
          modelUsed: 'claude-opus-4-20250514'
        });
      }

      // Persist classification
      if (cls) {
        db.upsertClassification(threadId, {
          ...cls,
          messageCount: msgCount,
          modelUsed: 'claude-opus-4-20250514'
        });
      }

      const participants = [...new Set(msgs.map(m => m.sender).filter(s => s && s !== 'You'))];
      const dateRange = msgs.length
        ? (msgs[0].time || '').split(',')[0] +
          (msgs.length > 1 ? ' - ' + (msgs[msgs.length - 1].time || '').split(',')[0] : '')
        : '';

      return jsonReply(res, 200, {
        // Rich summary fields
        summary: summary.summary || '',
        keyPoints: summary.keyPoints || [],
        decisions: summary.decisions || [],
        actionItems: summary.actionItems || [],
        openQuestions: summary.openQuestions || [],
        participantDetails: summary.participants || [],
        attachmentInsights: summary.attachmentInsights || [],
        suggestedAction: summary.suggestedAction || '',
        // Existing fields (backwards compat)
        participants: participants.length + 1,
        messageCount: msgs.length,
        dateRange,
        classification: cls || null,
        quickReplies: replies,
        source: cachedSummary ? 'ai-cached' : 'ai'
      });
    } catch (e) {
      console.error('[Comms] AI summary failed, falling back to regex:', e.message);
      return jsonReply(res, 200, buildRegexSummary(th));
    }
  }

  // ── POST /api/comms/classify/:id ──────────────────────────────
  if (parts[1] === 'classify' && parts[2] && req.method === 'POST') {
    const threadId = decodeURIComponent(parts[2]);

    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 400, { error: 'Anthropic API key not configured' });
    }

    const th = findThread(ctx, threadId);
    if (!th) return jsonReply(res, 404, { error: 'Thread not found' });

    try {
      const { classifyThread } = require('../lib/ai-classifier');
      const result = await classifyThread(ctx.anthropicApiKey, th);
      const dataWithMeta = {
        ...result,
        messageCount: (th.messages || []).length,
        modelUsed: 'claude-opus-4-20250514'
      };
      db.upsertClassification(threadId, dataWithMeta);
      db.logAction('classify', threadId, 'thread', { category: result.category, priority: result.priority });
      return jsonReply(res, 200, { ok: true, classification: result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Classification failed: ' + e.message });
    }
  }

  // ── POST /api/comms/draft ─────────────────────────────────────
  if (parts[1] === 'draft' && !parts[2] && req.method === 'POST') {
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 400, { error: 'Anthropic API key not configured' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { threadId, replyType, customInstructions } = body || {};
    if (!threadId) {
      return jsonReply(res, 400, { error: 'threadId is required' });
    }

    const th = findThread(ctx, threadId);
    if (!th) return jsonReply(res, 404, { error: 'Thread not found' });

    try {
      const { generateDraft, loadVoiceProfile } = require('../lib/ai-drafter');
      const voiceProfile = loadVoiceProfile(ctx.kbDir);
      const result = await generateDraft(ctx.anthropicApiKey, th, voiceProfile, {
        replyType: replyType || 'reply',
        customInstructions: customInstructions || ''
      });

      const draftId = db.insertDraft(threadId, {
        draftText: result.draftText,
        draftHtml: result.draftHtml,
        tone: replyType || 'standard',
        customInstructions: customInstructions || null,
        modelUsed: 'claude-opus-4-20250514'
      });

      db.logAction('draft_generated', threadId, 'thread', { draftId, replyType });

      return jsonReply(res, 200, {
        ok: true,
        draftId,
        draftText: result.draftText,
        draftHtml: result.draftHtml,
        suggestedSubject: result.suggestedSubject,
        confidence: result.confidence
      });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Draft generation failed: ' + e.message });
    }
  }

  // ── POST /api/comms/draft/:id/send ────────────────────────────
  if (parts[1] === 'draft' && parts[2] && parts[3] === 'send' && req.method === 'POST') {
    const draftId = parseInt(parts[2], 10);
    if (isNaN(draftId)) {
      return jsonReply(res, 400, { error: 'Invalid draft ID' });
    }

    const draft = db.getDraft(draftId);
    if (!draft) return jsonReply(res, 404, { error: 'Draft not found' });
    if (draft.status !== 'pending') {
      return jsonReply(res, 400, { error: 'Draft is not pending (status: ' + draft.status + ')' });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { platform, to, subject, channel, threadTs } = body || {};
    if (!platform) {
      return jsonReply(res, 400, { error: 'platform is required (email or slack)' });
    }

    try {
      if (platform === 'email') {
        if (!to) return jsonReply(res, 400, { error: '"to" is required for email' });
        if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

        const { sendEmail } = require('../lib/outlook-api');
        await sendEmail(ctx.msGraph, {
          to: Array.isArray(to) ? to : [to],
          subject: subject || '',
          bodyHtml: draft.draft_html || draft.draft_text
        });
      } else if (platform === 'slack') {
        if (!channel) return jsonReply(res, 400, { error: '"channel" is required for Slack' });
        if (!ctx.slackToken) return jsonReply(res, 400, { error: 'Slack token not configured' });

        const { slackAPI } = require('../lib/slack-api');
        await slackAPI(ctx.slackToken, 'chat.postMessage', {
          channel,
          text: draft.draft_text,
          ...(threadTs ? { thread_ts: threadTs } : {})
        });
      } else {
        return jsonReply(res, 400, { error: 'Invalid platform: must be "email" or "slack"' });
      }

      db.updateDraftStatus(draftId, 'sent');
      db.logAction('draft_sent', draft.thread_id, 'thread', { draftId, platform });
      return jsonReply(res, 200, { ok: true, status: 'sent' });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to send draft: ' + e.message });
    }
  }

  // ── POST /api/comms/draft/:id/discard ─────────────────────────
  if (parts[1] === 'draft' && parts[2] && parts[3] === 'discard' && req.method === 'POST') {
    const draftId = parseInt(parts[2], 10);
    if (isNaN(draftId)) {
      return jsonReply(res, 400, { error: 'Invalid draft ID' });
    }

    const draft = db.getDraft(draftId);
    if (!draft) return jsonReply(res, 404, { error: 'Draft not found' });

    try {
      db.updateDraftStatus(draftId, 'discarded');
      db.logAction('draft_discarded', draft.thread_id, 'thread', { draftId });
      return jsonReply(res, 200, { ok: true });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to discard draft: ' + e.message });
    }
  }

  // ── POST /api/comms/send/email ────────────────────────────────
  if (parts[1] === 'send' && parts[2] === 'email' && req.method === 'POST') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { to, cc, bcc, subject, bodyHtml, importance } = body || {};
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return jsonReply(res, 400, { error: '"to" recipients are required' });
    }
    if (!subject) {
      return jsonReply(res, 400, { error: '"subject" is required' });
    }

    try {
      const { sendEmail } = require('../lib/outlook-api');
      const result = await sendEmail(ctx.msGraph, {
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
        subject,
        bodyHtml: bodyHtml || '',
        importance: importance || 'normal'
      });
      db.logAction('email_sent', null, 'email', { to, subject });
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to send email: ' + e.message });
    }
  }

  // ── POST /api/comms/reply/email ───────────────────────────────
  if (parts[1] === 'reply' && parts[2] === 'email' && req.method === 'POST') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { messageId, bodyHtml, replyAll } = body || {};
    if (!messageId) {
      return jsonReply(res, 400, { error: '"messageId" is required' });
    }

    try {
      const { replyToEmail } = require('../lib/outlook-api');
      const result = await replyToEmail(ctx.msGraph, messageId, {
        bodyHtml: bodyHtml || '',
        replyAll: replyAll === true
      });
      db.logAction('email_reply', messageId, 'email', { replyAll });
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to reply to email: ' + e.message });
    }
  }

  // ── POST /api/comms/forward/email ─────────────────────────────
  if (parts[1] === 'forward' && parts[2] === 'email' && req.method === 'POST') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { messageId, to, bodyHtml } = body || {};
    if (!messageId) {
      return jsonReply(res, 400, { error: '"messageId" is required' });
    }
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return jsonReply(res, 400, { error: '"to" recipients are required' });
    }

    try {
      const { forwardEmail } = require('../lib/outlook-api');
      const result = await forwardEmail(ctx.msGraph, messageId, {
        to: Array.isArray(to) ? to : [to],
        bodyHtml: bodyHtml || ''
      });
      db.logAction('email_forward', messageId, 'email', { to });
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to forward email: ' + e.message });
    }
  }

  // ── POST /api/comms/calendar/rsvp ────────────────────────────
  // Respond to a calendar invite (accept, tentative, decline)
  if (parts[1] === 'calendar' && parts[2] === 'rsvp' && req.method === 'POST') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    let body;
    try { body = await readBody(req); } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { eventId, response, comment } = body || {};
    if (!eventId) return jsonReply(res, 400, { error: '"eventId" is required' });
    if (!response) return jsonReply(res, 400, { error: '"response" is required (accept|tentative|decline)' });

    try {
      const { respondToCalendarEvent } = require('../lib/outlook-api');
      const result = await respondToCalendarEvent(ctx.msGraph, eventId, response, comment || '');
      db.logAction('calendar_rsvp', eventId, 'event', { response });
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'RSVP failed: ' + e.message });
    }
  }

  // ── GET /api/comms/calendar/event/:id ───────────────────────
  // Get calendar event details
  if (parts[1] === 'calendar' && parts[2] === 'event' && parts[3]) {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    const eventId = decodeURIComponent(parts[3]);
    try {
      const { getCalendarEvent } = require('../lib/outlook-api');
      const event = await getCalendarEvent(ctx.msGraph, eventId);
      return jsonReply(res, 200, { ok: true, event });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to get event: ' + e.message });
    }
  }

  // ── GET /api/comms/email/:id/body ─────────────────────────────
  if (parts[1] === 'email' && parts[2] && parts[3] === 'body') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    const messageId = decodeURIComponent(parts[2]);

    try {
      const { fetchEmailFullBody } = require('../lib/outlook-api');
      const result = await fetchEmailFullBody(ctx.msGraph, messageId);
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to fetch email body: ' + e.message });
    }
  }

  // ── POST /api/comms/email/:id/read ────────────────────────────
  if (parts[1] === 'email' && parts[2] && parts[3] === 'read' && req.method === 'POST') {
    if (!ctx.msGraph) return jsonReply(res, 400, { error: 'MS Graph not configured' });

    const messageId = decodeURIComponent(parts[2]);

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return jsonReply(res, 400, { error: 'Invalid JSON body: ' + e.message });
    }

    const { isRead } = body || {};
    if (typeof isRead !== 'boolean') {
      return jsonReply(res, 400, { error: '"isRead" must be a boolean' });
    }

    try {
      const { markEmailRead } = require('../lib/outlook-api');
      const result = await markEmailRead(ctx.msGraph, messageId, isRead);
      db.logAction(isRead ? 'email_mark_read' : 'email_mark_unread', messageId, 'email');
      return jsonReply(res, 200, { ok: true, ...result });
    } catch (e) {
      return jsonReply(res, 500, { error: 'Failed to update read status: ' + e.message });
    }
  }

  // ── GET /api/comms — main thread listing with AI enrichment ───
  if (!parts[1]) {
    const { allThreads, refreshedAt } = loadAllThreads(ctx);

    // Filter out permanently completed threads
    const completedIds = new Set(db.getCompletedThreadIds());
    const filtered = {};
    for (const [id, th] of Object.entries(allThreads)) {
      if (completedIds.has(id)) continue;

      // Enrich with AI classification if fresh
      const classification = db.getClassificationIfFresh(id, (th.messages || []).length);
      if (classification) {
        th.aiCategory = classification.category;
        th.aiSubcategory = classification.subcategory;
        th.aiPriority = classification.priority;
        th.aiSentiment = classification.sentiment;
        th.aiActionRequired = classification.action_required;
        th.aiActionType = classification.action_type;
        th.aiSummary = classification.summary;
        th.aiConfidence = classification.confidence;
        // Phase 2: Extended classification fields
        if (classification.project_tags) {
          try { th.aiProjectTags = JSON.parse(classification.project_tags); } catch (e) { th.aiProjectTags = []; }
        }
        th.aiIsMarketing = classification.is_marketing === 1;
        th.aiIsNotification = classification.is_notification === 1;
        th.aiUrgencyReason = classification.urgency_reason || '';
      }

      // Enrich with cached AI summary if available (Phase 3: proactive pre-analysis)
      const cachedSummary = db.getSummaryIfFresh(id, (th.messages || []).length, null);
      if (cachedSummary) {
        th.aiFullSummary = cachedSummary.summary || '';
        th.aiKeyPoints = cachedSummary.keyPoints || [];
        th.aiSuggestedAction = cachedSummary.suggestedAction || '';
      }

      // Enrich with unified thread links
      const unified = db.getUnifiedGroup(id);
      if (unified.length > 0) {
        th.unifiedWith = unified;
      }

      filtered[id] = th;
    }

    return jsonReply(res, 200, {
      threads: filtered,
      refreshedAt: refreshedAt || new Date().toISOString(),
      filteredCount: Object.keys(allThreads).length - Object.keys(filtered).length
    });
  }
};
