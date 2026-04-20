/**
 * notebook-research.js — Synthesizes a "research" source from a user query.
 *
 * Two modes:
 *   fast — quick 400-word briefing grounded in existing Beanz OS tools
 *   deep — 1500-word in-depth report with multiple tool calls + structured sections
 *
 * Uses the same tool-use loop as the main chat (chat-tools.js) to ground the
 * research in live dashboard data. The resulting text is stored as a notebook
 * source of kind `research_note`.
 */

'use strict';

const https = require('https');
const { buildToolSchemas, runTool } = require('./chat-tools');

const MODEL = 'claude-sonnet-4-5-20250929';
const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 6;

async function runResearch({ query, mode, apiKey, ctx }) {
  const isDeep = mode === 'deep';
  const systemPrompt = isDeep
    ? 'You are a research analyst. Use the available tools to gather evidence from the Beanz OS dashboards, comms, emails, roasters insights, news, Jira, and the Obsidian vault. Produce a thorough research briefing with sections, grounded in the tool outputs. Cite sources inline with bracketed labels like [metrics], [news], [vault:<title>], [comms], [roasters], [jira], [email].'
    : 'You are a research assistant. Quickly gather the most relevant evidence using the available tools and synthesize a concise briefing. Cite sources inline with bracketed labels like [metrics], [news], [vault:<title>], [comms], [roasters], [jira], [email].';

  const userPrompt = isDeep
    ? 'Research this question thoroughly and produce a 1200-1500 word briefing:\n\n"' + query + '"\n\nStructure it as:\n\n# ' + query + '\n\n## Executive Summary (3-4 sentences)\n## Background & Context\n## Key Findings (5-8 bullets, each cited)\n## Supporting Data\n## Counterpoints / Risks\n## Implications for Beanz\n## Open Questions\n## Sources\n\nUse 3-6 tool calls to gather evidence before writing. Prefer live tools (metrics, comms, roasters, news, jira) over the vault when answering about recent state.'
    : 'Research this briefly and produce a 400-600 word briefing:\n\n"' + query + '"\n\nStructure:\n\n# ' + query + '\n\n## TL;DR (2-3 sentences)\n## Key Points (5 bullets, each cited)\n## What it means for Beanz\n## Sources\n\nUse 1-3 tool calls. Be concise.';

  const tools = buildToolSchemas();
  const messages = [{ role: 'user', content: userPrompt }];
  let finalText = '';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const turn = await callAnthropic({ apiKey, systemPrompt, tools, messages, stream: false });
    finalText += (turn.text || '');
    if (!turn.toolCalls || !turn.toolCalls.length) break;
    messages.push({ role: 'assistant', content: turn.assistantContent });
    const toolResults = [];
    for (const call of turn.toolCalls) {
      const result = await runTool(call.name, call.input || {}, ctx);
      const content = result.ok ? JSON.stringify(result.data).slice(0, 25000) : JSON.stringify({ error: result.error });
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content, is_error: !result.ok });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return finalText;
}

function callAnthropic({ apiKey, systemPrompt, tools, messages, stream }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: !!stream,
      system: systemPrompt,
      tools,
      messages
    });
    const req = https.request({
      hostname: API_HOSTNAME, path: API_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION }
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (json.error) return reject(new Error(json.error.message || 'API error'));
          const blocks = json.content || [];
          let text = '';
          const toolCalls = [];
          blocks.forEach(b => {
            if (b.type === 'text') text += b.text || '';
            if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input || {} });
          });
          resolve({ text, toolCalls, assistantContent: blocks });
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('Timed out')); });
    req.write(body);
    req.end();
  });
}

module.exports = { runResearch };
