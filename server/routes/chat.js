/**
 * chat.js — Route handler for AI Chat tab.
 * POST /api/chat — streaming SSE chat with Claude
 * GET /api/chat/sessions — list sessions
 * GET /api/chat/history — get session messages
 * DELETE /api/chat/session/:id — delete session
 */

'use strict';

const https = require('https');
const crypto = require('crypto');
const { jsonReply, readBody } = require('../lib/helpers');
const { buildChatSystemPrompt } = require('../lib/chat-context-builder');
const db = require('../lib/db');

const MODEL = 'claude-opus-4-20250514';
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

module.exports = async function handleChat(req, res, parts, url, ctx) {

  // POST /api/chat — streaming SSE response
  if (!parts[1] && req.method === 'POST') {
    if (!ctx.anthropicApiKey) {
      return jsonReply(res, 400, { error: 'No Anthropic API key configured. Add ANTHROPIC_API_KEY to .env' });
    }

    let body;
    try { body = await readBody(req); } catch { return jsonReply(res, 400, { error: 'Invalid request body' }); }

    const userMessage = (body.message || '').trim();
    if (!userMessage) return jsonReply(res, 400, { error: 'Empty message' });

    // Session management
    let sessionId = body.sessionId;
    if (!sessionId) {
      sessionId = 'chat-' + crypto.randomBytes(8).toString('hex');
      const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? '...' : '');
      db.createChatSession(sessionId, title);
    }

    // Persist user message
    db.addChatMessage(sessionId, 'user', userMessage);

    // Build conversation history
    const history = body.history || [];
    const messages = history.map(function(m) { return { role: m.role, content: m.content }; });
    messages.push({ role: 'user', content: userMessage });

    // Build system prompt — pass user query for vault RAG retrieval
    let systemPrompt;
    try {
      systemPrompt = buildChatSystemPrompt(ctx, userMessage);
    } catch (e) {
      console.error('[Chat] Context build failed:', e.message);
      systemPrompt = 'You are the AI assistant for Ziv Shalev, GM of Beanz (coffee subscription, Breville Group). Answer helpfully.';
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Stream from Anthropic
    const requestBody = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: systemPrompt,
      messages: messages
    });

    let fullText = '';
    let errored = false;

    const apiReq = https.request({
      hostname: API_HOSTNAME,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ctx.anthropicApiKey,
        'anthropic-version': API_VERSION
      }
    }, function(apiRes) {
      let buffer = '';

      apiRes.on('data', function(chunk) {
        buffer += chunk.toString();

        // Parse SSE events from buffer
        var lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line.startsWith('event:')) continue;
          if (!line.startsWith('data:')) continue;

          var data = line.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            var parsed = JSON.parse(data);

            // content_block_delta — text chunk
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              var text = parsed.delta.text;
              fullText += text;
              res.write('event: delta\ndata: ' + JSON.stringify({ text: text }) + '\n\n');
            }

            // message_stop — done
            if (parsed.type === 'message_stop') {
              db.addChatMessage(sessionId, 'assistant', fullText);
              res.write('event: done\ndata: ' + JSON.stringify({ sessionId: sessionId }) + '\n\n');
              res.end();
            }

            // error from API
            if (parsed.type === 'error') {
              errored = true;
              res.write('event: error\ndata: ' + JSON.stringify({ error: parsed.error ? parsed.error.message : 'API error' }) + '\n\n');
              res.end();
            }
          } catch { /* skip unparseable lines */ }
        }
      });

      apiRes.on('end', function() {
        if (!errored && !res.writableEnded) {
          // If we got text but no message_stop, still persist and close
          if (fullText) {
            db.addChatMessage(sessionId, 'assistant', fullText);
          }
          res.write('event: done\ndata: ' + JSON.stringify({ sessionId: sessionId }) + '\n\n');
          res.end();
        }
      });

      apiRes.on('error', function(e) {
        if (!res.writableEnded) {
          res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n');
          res.end();
        }
      });
    });

    apiReq.on('error', function(e) {
      if (!res.writableEnded) {
        res.write('event: error\ndata: ' + JSON.stringify({ error: 'Connection failed: ' + e.message }) + '\n\n');
        res.end();
      }
    });

    apiReq.setTimeout(120000, function() {
      apiReq.destroy();
      if (!res.writableEnded) {
        res.write('event: error\ndata: ' + JSON.stringify({ error: 'Request timed out' }) + '\n\n');
        res.end();
      }
    });

    apiReq.write(requestBody);
    apiReq.end();
    return; // SSE — don't call jsonReply
  }

  // GET /api/chat/sessions
  if (parts[1] === 'sessions' && req.method === 'GET') {
    return jsonReply(res, 200, { sessions: db.listChatSessions() });
  }

  // GET /api/chat/history?sessionId=X
  if (parts[1] === 'history' && req.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) return jsonReply(res, 400, { error: 'Missing sessionId' });
    return jsonReply(res, 200, { messages: db.getChatMessages(sessionId) });
  }

  // DELETE /api/chat/session/:id
  if (parts[1] === 'session' && parts[2] && req.method === 'DELETE') {
    db.deleteChatSession(decodeURIComponent(parts[2]));
    return jsonReply(res, 200, { ok: true });
  }

  // GET /api/chat/context — debug endpoint to see system prompt size
  if (parts[1] === 'context' && req.method === 'GET') {
    try {
      const q = url.searchParams.get('q') || 'daily briefing';
      const prompt = buildChatSystemPrompt(ctx, q);
      return jsonReply(res, 200, { query: q, chars: prompt.length, tokens_approx: Math.round(prompt.length / 4), preview: prompt.slice(0, 3000) });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  // GET /api/chat/rag?q=... — debug: see which vault pages match a query
  if (parts[1] === 'rag' && req.method === 'GET') {
    try {
      const rag = require('../lib/obsidian-rag');
      const q = url.searchParams.get('q') || '';
      if (!q) return jsonReply(res, 400, { error: 'Missing ?q= parameter' });
      const hits = rag.search(q, { maxResults: 15, maxChars: 60000 });
      const stats = rag.getStats();
      return jsonReply(res, 200, {
        query: q,
        hits: hits.map(function(h) { return { title: h.title, relPath: h.relPath, score: h.score, tags: h.tags, chars: h.content.length }; }),
        stats: stats
      });
    } catch (e) {
      return jsonReply(res, 500, { error: e.message });
    }
  }

  return jsonReply(res, 404, { error: 'Unknown chat endpoint' });
};
