/**
 * notebook.js — REST + SSE routes for the Notes tab.
 *
 * GET    /api/notebooks                              — list
 * POST   /api/notebooks                              — create { title, description, icon, color }
 * GET    /api/notebooks/:id                          — full payload (sources + notes + messages)
 * PATCH  /api/notebooks/:id                          — update { title, description, icon, color }
 * DELETE /api/notebooks/:id                          — delete
 * POST   /api/notebooks/:id/sources                  — add { kind, title, contentText, url?, metadata? }
 *                                                      kind: paste_text | paste_url | vault_page | dashboard_snapshot |
 *                                                            upload_txt | upload_md | upload_pdf | upload_docx | upload_csv
 *        (for paste_url, just pass { kind:'paste_url', url:'…' } — text is fetched)
 *        (file uploads: multipart/form-data with field "file")
 * DELETE /api/notebooks/:id/sources/:sid             — remove source
 * POST   /api/notebooks/:id/artifact/:kind           — SSE stream an AI artifact
 * POST   /api/notebooks/:id/chat                     — SSE grounded chat { message }
 * DELETE /api/notebooks/:id/messages                 — clear chat history
 * POST   /api/notebooks/:id/notes                    — add { title, contentMd, kind? }
 * PATCH  /api/notebooks/:id/notes/:nid               — update
 * DELETE /api/notebooks/:id/notes/:nid               — delete
 * GET    /api/notebooks/:id/export                   — markdown bundle
 * GET    /api/notebooks/vault-search?q=…             — proxy to obsidian-rag search
 */

'use strict';

const https = require('https');
const { jsonReply, readBody } = require('../lib/helpers');
const store = require('../lib/notebook-store');
const ingest = require('../lib/notebook-ingest');
const rag = require('../lib/notebook-rag');
const artifacts = require('../lib/notebook-artifacts');
const capture = require('../lib/notebook-capture');
const MODELS = require('../lib/ai-models');

const MODEL = MODELS.OPUS;
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

module.exports = async function handleNotebook(req, res, parts, url, ctx) {
  // parts[0] === 'notebooks'
  const [_, notebookId, sub, sid] = parts;

  // ── Collection-level ────────────────────────────────────────
  if (!notebookId) {
    if (req.method === 'GET') return jsonReply(res, 200, { notebooks: store.listNotebooks() });
    if (req.method === 'POST') {
      const body = await readJson(req);
      const nb = store.createNotebook(body || {});
      return jsonReply(res, 200, { notebook: nb });
    }
    return jsonReply(res, 405, { error: 'Method not allowed' });
  }

  // ── Vault search proxy ──────────────────────────────────────
  if (notebookId === 'vault-search') {
    try {
      const rag2 = require('../lib/obsidian-rag');
      const q = url.searchParams.get('q') || '';
      if (!q) return jsonReply(res, 400, { error: 'Missing ?q=' });
      const hits = rag2.search(q, { maxResults: 20, maxChars: 40000, maxPerPage: 1500 });
      return jsonReply(res, 200, { results: hits.map(h => ({ title: h.title, relPath: h.relPath, tags: h.tags, score: h.score, snippet: (h.content || '').slice(0, 400), content: h.content })) });
    } catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  // ── Item-level ──────────────────────────────────────────────
  if (!sub) {
    if (req.method === 'GET') {
      const nb = store.getNotebook(notebookId);
      if (!nb) return jsonReply(res, 404, { error: 'Notebook not found' });
      return jsonReply(res, 200, { notebook: nb });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const nb = store.updateNotebook(notebookId, body || {});
      if (!nb) return jsonReply(res, 404, { error: 'Notebook not found' });
      return jsonReply(res, 200, { notebook: nb });
    }
    if (req.method === 'DELETE') { store.deleteNotebook(notebookId); return jsonReply(res, 200, { ok: true }); }
    return jsonReply(res, 405, { error: 'Method not allowed' });
  }

  // ── Sources ─────────────────────────────────────────────────
  if (sub === 'sources') {
    if (!sid && req.method === 'POST') {
      const contentType = (req.headers['content-type'] || '');
      let source;
      if (contentType.includes('multipart/form-data')) {
        try { source = await ingestMultipartUpload(req, notebookId, contentType); }
        catch (e) { return jsonReply(res, 400, { error: 'Upload failed: ' + e.message }); }
      } else {
        const body = await readJson(req);
        source = await ingestStructuredSource(notebookId, body || {}, ctx);
      }
      if (!source) return jsonReply(res, 400, { error: 'Could not create source' });
      return jsonReply(res, 200, { source });
    }
    if (sid && req.method === 'DELETE') { store.deleteSource(sid); return jsonReply(res, 200, { ok: true }); }
    // GET /api/notebooks/:id/sources/:sid — full source with content_text
    if (sid && req.method === 'GET' && !parts[4]) {
      const s = store.getSource(sid);
      if (!s || s.notebook_id !== notebookId) return jsonReply(res, 404, { error: 'Source not found' });
      return jsonReply(res, 200, { source: s });
    }
    // POST /api/notebooks/:id/sources/:sid/discover — find related web content
    if (sid && parts[4] === 'discover' && req.method === 'POST') {
      if (!ctx.anthropicApiKey) return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY not configured' });
      const s = store.getSource(sid);
      if (!s || s.notebook_id !== notebookId) return jsonReply(res, 404, { error: 'Source not found' });
      try {
        const { runResearch } = require('../lib/notebook-research');
        const seed = (s.title + '\n\n' + (s.content_text || '').slice(0, 3000)).trim();
        const query = 'Find additional sources, data, or context related to: ' + s.title + '\n\nSeed context:\n' + seed;
        const text = await runResearch({ query, mode: 'fast', apiKey: ctx.anthropicApiKey, ctx });
        const newSource = store.addSource(notebookId, {
          kind: 'web_research',
          title: 'Related · ' + (s.title || '').slice(0, 80),
          contentText: text,
          metadata: { discovered_from: sid, seed_title: s.title }
        });
        if (newSource && newSource.content_text) {
          const chunks = ingest.chunkText(newSource.content_text);
          store.upsertChunks(newSource.id, notebookId, chunks);
        }
        return jsonReply(res, 200, { source: newSource });
      } catch (e) { return jsonReply(res, 500, { error: e.message }); }
    }
    return jsonReply(res, 405, { error: 'Method not allowed' });
  }

  // ── Suggested questions ────────────────────────────────────
  if (sub === 'suggestions' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY not configured' });
    try {
      const suggestions = await generateSuggestions({ notebookId, apiKey: ctx.anthropicApiKey });
      return jsonReply(res, 200, { suggestions });
    } catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  // ── Persona (chat customize) ───────────────────────────────
  if (sub === 'persona') {
    if (req.method === 'GET') {
      return jsonReply(res, 200, { persona: store.getNotebookPersona(notebookId), presets: store.PERSONA_PRESETS });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const persona = store.setNotebookPersona(notebookId, body || {});
      return jsonReply(res, 200, { persona });
    }
    return jsonReply(res, 405, { error: 'Method not allowed' });
  }

  // ── Universal Capture — save any source to this notebook ───
  if (sub === 'capture' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const result = await capture.captureToNotebook(notebookId, body || {}, ctx);
      return jsonReply(res, 200, { ok: true, source: result.source, kind: result.kind, contentBytes: result.contentBytes });
    } catch (e) {
      return jsonReply(res, 400, { ok: false, error: e.message });
    }
  }

  // ── Artifact (SSE) ──────────────────────────────────────────
  if (sub === 'artifact' && sid && req.method === 'POST') {
    if (!ctx.anthropicApiKey) return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY not configured' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    await artifacts.generateArtifact({ notebookId, kind: sid, apiKey: ctx.anthropicApiKey, res });
    return;
  }

  // ── Chat (SSE, grounded) ───────────────────────────────────
  if (sub === 'chat' && req.method === 'POST') {
    if (!ctx.anthropicApiKey) return jsonReply(res, 400, { error: 'ANTHROPIC_API_KEY not configured' });
    const body = await readJson(req);
    const message = (body.message || '').trim();
    if (!message) return jsonReply(res, 400, { error: 'Empty message' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    await streamGroundedChat({ notebookId, userMessage: message, apiKey: ctx.anthropicApiKey, res });
    return;
  }

  if (sub === 'messages' && req.method === 'DELETE') { store.clearMessages(notebookId); return jsonReply(res, 200, { ok: true }); }

  // ── Notes ───────────────────────────────────────────────────
  if (sub === 'notes') {
    if (!sid && req.method === 'POST') {
      const body = await readJson(req);
      const n = store.addNote(notebookId, { title: body.title, contentMd: body.contentMd, kind: body.kind || 'user', pinned: !!body.pinned });
      return jsonReply(res, 200, { note: n });
    }
    if (sid && req.method === 'PATCH') {
      const body = await readJson(req);
      const n = store.updateNote(parseInt(sid, 10), body);
      if (!n) return jsonReply(res, 404, { error: 'Note not found' });
      return jsonReply(res, 200, { note: n });
    }
    if (sid && req.method === 'DELETE') { store.deleteNote(parseInt(sid, 10)); return jsonReply(res, 200, { ok: true }); }
    return jsonReply(res, 405, { error: 'Method not allowed' });
  }

  // ── Promote notebook page to brain ─────────────────────────
  if (sub === 'promote' && req.method === 'POST') {
    const nb = store.getNotebook(notebookId);
    if (!nb) return jsonReply(res, 404, { error: 'Notebook not found' });
    const body = await readJson(req);
    const noteId = body.noteId;
    if (!noteId) return jsonReply(res, 400, { error: 'noteId required' });
    const n = (nb.notes || []).find(x => x.id === noteId);
    if (!n) return jsonReply(res, 404, { error: 'note not found' });
    try {
      const { promoteNoteToBrain } = require('../lib/obsidian-notebook-bridge');
      const result = promoteNoteToBrain(nb, n);
      return jsonReply(res, 200, result);
    } catch (e) { return jsonReply(res, 500, { error: e.message }); }
  }

  // ── Export ──────────────────────────────────────────────────
  if (sub === 'export' && req.method === 'GET') {
    const nb = store.getNotebook(notebookId);
    if (!nb) return jsonReply(res, 404, { error: 'Notebook not found' });
    const sources = store.getSourcesForNotebook(notebookId, { withText: true });
    const md = buildMarkdownExport(nb, sources);
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + sanitiseFilename(nb.title) + '.md"' });
    res.end(md);
    return;
  }

  return jsonReply(res, 404, { error: 'Unknown notebook endpoint' });
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function readJson(req) {
  try { return await readBody(req); } catch { return {}; }
}

async function ingestStructuredSource(notebookId, body, ctx) {
  const kind = body.kind;
  if (!kind) return null;
  let source;

  if (kind === 'web_research') {
    // Run a Fast or Deep research synthesis using the main chat-tools loop.
    if (!ctx || !ctx.anthropicApiKey) return null;
    const query = (body.query || '').trim();
    if (!query) return null;
    const { runResearch } = require('../lib/notebook-research');
    const mode = body.mode === 'deep' ? 'deep' : 'fast';
    let text;
    try { text = await runResearch({ query, mode, apiKey: ctx.anthropicApiKey, ctx }); }
    catch (e) { text = '[Research failed: ' + e.message + ']'; }
    source = store.addSource(notebookId, {
      kind: 'web_research',
      title: (mode === 'deep' ? 'Deep Research · ' : 'Fast Research · ') + query.slice(0, 80),
      contentText: text,
      metadata: { mode, query }
    });
  } else if (kind === 'paste_text' || kind === 'paste_markdown') {
    const content = body.contentText || body.text || '';
    if (!content) return null;
    source = store.addSource(notebookId, { kind: 'paste_text', title: body.title || 'Pasted text', contentText: content, metadata: body.metadata || null });
  } else if (kind === 'paste_url') {
    const urlStr = body.url;
    if (!urlStr) return null;
    let fetched;
    try { fetched = await ingest.fetchUrl(urlStr); }
    catch (e) { return store.addSource(notebookId, { kind: 'paste_url', title: urlStr, url: urlStr, contentText: '[Fetch failed: ' + e.message + ']', metadata: { error: e.message } }); }
    source = store.addSource(notebookId, { kind: 'paste_url', title: fetched.title || urlStr, url: urlStr, contentText: fetched.text, metadata: { contentType: fetched.contentType } });
  } else if (kind === 'vault_page') {
    // body: { relPath, title, content }
    source = store.addSource(notebookId, { kind: 'vault_page', title: body.title || body.relPath || 'Vault page', contentText: body.content || body.contentText || '', metadata: { relPath: body.relPath, tags: body.tags || [] } });
  } else if (kind === 'dashboard_snapshot') {
    const content = typeof body.contentText === 'string' ? body.contentText : JSON.stringify(body.data || body.snapshot || {}, null, 2);
    source = store.addSource(notebookId, { kind: 'dashboard_snapshot', title: body.title || 'Dashboard snapshot', contentText: content, metadata: body.metadata || { source: body.sourceView || 'dashboard' } });
  } else {
    return null;
  }

  if (source && source.content_text) {
    const chunks = ingest.chunkText(source.content_text);
    store.upsertChunks(source.id, notebookId, chunks);
  }
  return source;
}

async function ingestMultipartUpload(req, notebookId, contentType) {
  const boundary = contentType.split('boundary=')[1];
  if (!boundary) throw new Error('No multipart boundary');
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', resolve);
    req.on('error', reject);
  });
  const raw = Buffer.concat(chunks);
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = splitBuffer(raw, boundaryBuf);
  let filename = null, mime = null, buffer = null;
  for (const part of parts) {
    if (!part.length) continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    let body = part.slice(headerEnd + 4);
    // Strip trailing \r\n
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) body = body.slice(0, body.length - 2);
    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]*)"/);
    const typeMatch = header.match(/Content-Type:\s*([^\r\n;]+)/i);
    if (nameMatch && nameMatch[1] === 'file' && filenameMatch) {
      filename = filenameMatch[1]; mime = typeMatch ? typeMatch[1] : '';
      buffer = body;
      break;
    }
  }
  if (!buffer || !filename) throw new Error('No file field found');

  const extracted = await ingest.extractText({ filename, mime, buffer });
  const lower = filename.toLowerCase();
  let kind = 'upload_txt';
  if (lower.endsWith('.pdf')) kind = 'upload_pdf';
  else if (lower.endsWith('.docx')) kind = 'upload_docx';
  else if (lower.endsWith('.md')) kind = 'upload_md';
  else if (lower.endsWith('.csv')) kind = 'upload_csv';
  else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) kind = 'upload_xlsx';
  else if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) kind = 'upload_pptx';

  const source = store.addSource(notebookId, {
    kind,
    title: filename,
    contentText: extracted.text || '',
    metadata: { mime, size: buffer.length, warnings: extracted.warnings || [] }
  });
  if (source && source.content_text) {
    const chunks2 = ingest.chunkText(source.content_text);
    store.upsertChunks(source.id, notebookId, chunks2);
  }
  return source;
}

function splitBuffer(buf, delim) {
  const out = []; let start = 0;
  while (true) {
    const idx = buf.indexOf(delim, start);
    if (idx < 0) { out.push(buf.slice(start)); break; }
    out.push(buf.slice(start, idx));
    start = idx + delim.length;
  }
  return out;
}

function sanitiseFilename(name) { return (name || 'notebook').replace(/[^a-z0-9_\-]+/gi, '-').slice(0, 60); }

function buildMarkdownExport(nb, sourcesWithText) {
  let out = '# ' + (nb.icon || '📒') + ' ' + nb.title + '\n\n';
  if (nb.description) out += '_' + nb.description + '_\n\n';
  out += '> Exported from Beanz OS Notes on ' + new Date().toISOString().slice(0, 10) + '\n\n';
  out += '## Sources (' + (nb.sources || []).length + ')\n\n';
  (sourcesWithText || []).forEach((s, i) => {
    out += '### ' + (i + 1) + '. ' + s.title + ' _(' + s.kind + ')_\n';
    if (s.url) out += '\n' + s.url + '\n';
    out += '\n```\n' + (s.content_text || '').slice(0, 4000) + (s.content_text && s.content_text.length > 4000 ? '\n...[truncated]' : '') + '\n```\n\n';
  });
  out += '## Notes\n\n';
  (nb.notes || []).forEach((n) => {
    const label = n.kind === 'user' ? '✍️ User note' : (n.kind === 'chat_saved' ? '💬 Saved from chat' : '🤖 ' + n.kind.replace(/^ai_/, '').replace(/_/g, ' '));
    out += '### ' + (n.title || label) + '\n_' + label + ' · ' + (n.created_at || '') + '_\n\n' + (n.content_md || '') + '\n\n';
  });
  if ((nb.messages || []).length) {
    out += '## Chat transcript\n\n';
    (nb.messages || []).forEach((m) => {
      out += '**' + (m.role === 'user' ? 'You' : 'Assistant') + '** — ' + (m.created_at || '') + '\n\n' + (m.content || '') + '\n\n---\n\n';
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Grounded chat streaming (single turn for now — no tool-use loop
// needed since the sources are ingested directly into the system prompt).
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Suggested questions — one-shot call using full notebook context
// ═══════════════════════════════════════════════════════════════
function generateSuggestions({ notebookId, apiKey }) {
  return new Promise((resolve, reject) => {
    const { chunks, text: contextText } = rag.buildFullContext(notebookId, 'summary', 40000);
    if (!chunks.length) return resolve(['Add a source to start asking questions']);

    const instructions = 'You generate 4 highly-specific, source-grounded questions a user would ask this notebook. Each question must be answerable ONLY from the provided sources. Return JSON only: {"suggestions":["q1","q2","q3","q4"]}. No prose, no markdown, no extra fields.';
    const sources = '# Sources\n\n' + contextText;
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: [
        { type: 'text', text: instructions },
        { type: 'text', text: sources, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: 'Generate 4 source-grounded questions.' }]
    });

    const apiReq = https.request({
      hostname: API_HOSTNAME, path: API_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION }
    }, (apiRes) => {
      let buf = '';
      apiRes.on('data', (c) => buf += c.toString());
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (json.error) return reject(new Error(json.error.message || 'API error'));
          const text = (json.content || []).map(b => b.type === 'text' ? b.text : '').join('').trim();
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) return resolve([]);
          const parsed = JSON.parse(match[0]);
          resolve(Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : []);
        } catch (e) { reject(e); }
      });
      apiRes.on('error', reject);
    });
    apiReq.on('error', reject);
    apiReq.setTimeout(60000, () => { apiReq.destroy(); reject(new Error('Timed out')); });
    apiReq.write(body);
    apiReq.end();
  });
}

function streamGroundedChat({ notebookId, userMessage, apiKey, res }) {
  return new Promise((resolve) => {
    store.addMessage(notebookId, 'user', userMessage, null);
    const { chunks, text: contextText } = rag.buildFullContext(notebookId, userMessage, 55000);
    if (!chunks.length) {
      res.write('event: error\ndata: ' + JSON.stringify({ error: 'This notebook has no sources yet. Add a source first.' }) + '\n\n');
      res.end();
      return resolve();
    }

    const persona = store.getNotebookPersona ? store.getNotebookPersona(notebookId) : null;
    const personaBlock = persona && persona.system ? ('\n\n# Persona\n' + persona.system) : '';

    const instructionsText =
      'You are a notebook assistant answering questions grounded strictly in the provided sources. Every factual claim MUST end with citation markers like [S1] or [S1][S3]. Never invent facts beyond the sources. If the sources are insufficient, say so explicitly.\n\n' +
      '# Rules\n- Cite using [S1]..[S' + chunks.length + '] only.\n- Be concise and structured — headings and bullets when helpful.\n- If asked for something not in the sources, say "The sources don\'t cover that" and suggest what would answer it.' +
      personaBlock;
    const sourcesText = '# Sources\n\n' + contextText;

    const citationInfo = chunks.map((c, i) => ({ n: i + 1, source_id: c.source_id, source_title: c.source_title, chunk_index: c.chunk_index, snippet: c.content.slice(0, 500) }));
    res.write('event: citations\ndata: ' + JSON.stringify({ citations: citationInfo }) + '\n\n');

    const priorHistory = store.getMessages(notebookId).filter(m => m.role === 'user' || m.role === 'assistant');
    // Keep last 10 turns to stay within budget
    const recent = priorHistory.slice(-11, -1);
    const messages = recent.map(m => ({ role: m.role, content: m.content })).concat([{ role: 'user', content: userMessage }]);

    // Prompt caching: cache the sources block (expensive, reused across turns)
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: [
        { type: 'text', text: instructionsText },
        { type: 'text', text: sourcesText, cache_control: { type: 'ephemeral' } }
      ],
      messages
    });

    let fullText = '';
    let errored = false;
    const apiReq = https.request({
      hostname: API_HOSTNAME, path: API_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION }
    }, (apiRes) => {
      let buf = '';
      apiRes.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || !line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let p; try { p = JSON.parse(data); } catch { continue; }
          if (p.type === 'content_block_delta' && p.delta && p.delta.text) {
            fullText += p.delta.text;
            res.write('event: delta\ndata: ' + JSON.stringify({ text: p.delta.text }) + '\n\n');
          }
          if (p.type === 'error') {
            errored = true;
            res.write('event: error\ndata: ' + JSON.stringify({ error: p.error ? p.error.message : 'API error' }) + '\n\n');
          }
        }
      });
      apiRes.on('end', () => {
        if (!errored) {
          try { store.addMessage(notebookId, 'assistant', fullText, citationInfo); } catch {}
          res.write('event: done\ndata: ' + JSON.stringify({ chars: fullText.length }) + '\n\n');
        }
        res.end();
        resolve();
      });
      apiRes.on('error', (e) => { if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n'); res.end(); } resolve(); });
    });
    apiReq.on('error', (e) => { if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n'); res.end(); } resolve(); });
    apiReq.setTimeout(180000, () => { apiReq.destroy(); if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: 'Timed out' }) + '\n\n'); res.end(); } resolve(); });
    apiReq.write(body);
    apiReq.end();
  });
}
