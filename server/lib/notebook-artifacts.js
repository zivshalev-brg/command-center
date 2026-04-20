/**
 * notebook-artifacts.js — AI-generated artifacts for a notebook.
 *
 * Streams directly to an SSE response. Uses the notebook's full source context
 * (or RAG-selected chunks if too large). Enforces citation markers [S1]..[Sn].
 */

'use strict';

const https = require('https');
const rag = require('./notebook-rag');
const store = require('./notebook-store');

const API_HOSTNAME = 'api.anthropic.com';
const API_PATH = '/v1/messages';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

const PROMPTS = {
  // ── Studio overview artifacts (NotebookLM parity) ──
  audio_overview: {
    title: 'Audio Overview',
    system: 'You produce a two-host podcast-style dialogue script that explains the sources conversationally. Cite every factual claim with [S#] markers.',
    user: 'Write a ~800-word, two-host podcast script discussing these sources.\n\nHosts: **Alex** (curious host, asks questions) and **Jordan** (expert host, explains).\nFormat: **Alex:** line / **Jordan:** line.\nStart with a 2-line intro ("Welcome back…") and end with a 2-line wrap.\nKeep it conversational, 2-3 sentences per turn. Every factual claim cited.'
  },
  slide_deck: {
    title: 'Slide Deck',
    system: 'You produce a slide deck outline in markdown. Each slide is a markdown H2 heading followed by 3-5 bullet points. Every bullet cited.',
    user: 'Create a 10-slide deck outline that walks through the sources. Format:\n\n## Slide 1: <title>\n- bullet 1 [S#]\n- bullet 2 [S#]\n\n## Slide 2: <title>\n...\n\nCover: cover, agenda, 6-7 content slides on key themes, 1 implications slide, 1 next-steps slide. Keep bullets to ~10-15 words.'
  },
  video_script: {
    title: 'Video Script',
    system: 'You produce a narrated video script with scene cues. Every factual claim cited.',
    user: 'Write a ~4-minute video script based on the sources. Format each beat as:\n\n**[00:00 - 00:20]** SCENE: <brief visual description>\nNARRATION: <what the narrator says> [S#]\n\nOpen with a hook, cover 4-6 key ideas, close with a call-to-action or takeaway. Be visual — suggest on-screen text or imagery.'
  },
  mind_map: {
    title: 'Mind Map',
    system: 'You produce a hierarchical mind map using indented bullets. Every leaf cited.',
    user: 'Create an indented mind-map outline from the sources.\n\nRoot node = central topic. Level-1 children = major themes. Level-2 = sub-concepts. Level-3 = specific facts (cited).\n\nFormat:\n- **Root topic**\n  - Theme 1\n    - Sub-concept [S#]\n    - Sub-concept [S#]\n  - Theme 2\n    - ...\n\nAim for 3-5 themes, each with 2-4 sub-nodes.'
  },
  reports: {
    title: 'Report',
    system: 'You produce an executive briefing report. Tight, decision-ready language. Every claim cited.',
    user: 'Write an executive report with these sections:\n\n**Context** (2-3 sentences — why this matters)\n**Key Findings** (5-7 bullets, each cited)\n**Implications** (what this means for the business)\n**Open Questions** (what\'s unresolved in the sources)\n**Recommended Actions** (3-5 concrete next steps)\n\nKeep under 700 words.'
  },
  flashcards: {
    title: 'Flashcards',
    system: 'You generate study flashcards grounded strictly in the sources. Each answer must be citable.',
    user: 'Create 12 flashcards covering the most important facts, terms, and relationships from the sources. Format each as:\n\n**Card N**\n**Front:** <question or term>\n**Back:** <concise answer> [S#]\n\nMix card types: definitions, cause-effect, key numbers, person → role, date → event.'
  },
  quiz: {
    title: 'Quiz',
    system: 'You generate a multiple-choice quiz grounded in the sources. Each answer must be citable. Include the correct option and a brief rationale.',
    user: 'Create an 8-question multiple-choice quiz. Format each as:\n\n**Q1. <question>**\n- A) option\n- B) option\n- C) option\n- D) option\n\n**Answer:** B — rationale [S#]\n\nMix difficulty. Distractors should be plausible. Every answer cited.'
  },
  infographic: {
    title: 'Infographic Spec',
    system: 'You produce a textual infographic specification: the visual elements, data points, and layout a designer should render. Every data point cited.',
    user: 'Design an infographic that visualises the key findings. Output:\n\n## Panel 1 (hero)\n- Visual: <what to draw>\n- Data: <key numbers> [S#]\n- Caption: <short copy>\n\n## Panel 2 ... Panel 6\n\nInclude 6 panels. Use icons, numbers, before/after comparisons, simple bar/donut descriptions. Keep copy short, impactful.'
  },
  data_table: {
    title: 'Data Table',
    system: 'You extract structured tabular data from the sources into a clean markdown table. Do not invent rows. Cite the source for each row.',
    user: 'Extract a structured data table from the sources. Decide columns based on what data is present (e.g. entity, metric, value, period, source).\n\nOutput as a single markdown table. Each data row ends with a citation column [S#]. After the table, add a short note explaining what was included vs. excluded.'
  },
  // ── Legacy kinds kept for compatibility ──
  summary: {
    title: 'Summary',
    system: 'You produce a clear, structured summary of the sources provided. Use headings and bullet points. Every factual claim MUST end with citation markers like [S1] or [S1][S3].',
    user: 'Write a comprehensive summary of everything in these sources. Structure it as: ## Overview (3-sentence executive summary), ## Key points (bulleted), ## Details by theme (h3 sub-sections). Cite every factual claim.'
  },
  faq: {
    title: 'FAQ',
    system: 'You generate a FAQ grounded strictly in the provided sources. Include only questions the sources actually answer. Every answer ends with citation markers.',
    user: 'Generate 8-12 FAQs. Format: **Q:** question / **A:** answer [S#]. Do NOT invent questions the sources can\'t answer.'
  },
  briefing: {
    title: 'Briefing Doc',
    system: 'You produce an executive briefing doc. Tight, decision-ready language. Every claim cited.',
    user: 'Write an executive briefing with Context, Key Findings, Implications, Open Questions, Recommended Actions. Under 600 words.'
  },
  study_guide: {
    title: 'Study Guide',
    system: 'You produce a study guide. Citations on every point.',
    user: 'Core Concepts, Key People / Entities, Timeline, Quiz Questions (5-8), Further Reading.'
  },
  timeline: {
    title: 'Timeline',
    system: 'You extract a chronological timeline from the sources. Dates must come from the sources.',
    user: 'Extract chronological events: **YYYY-MM-DD** — event [S#]. Only include dated items.'
  },
  concepts: {
    title: 'Key Concepts',
    system: 'You extract and define the key concepts, terms, and entities. Each definition cited.',
    user: 'Extract 10-15 concepts. **Term** — 1-2 sentence definition [S#].'
  },
  actions: {
    title: 'Action Items',
    system: 'You extract actionable items with owner, deadline, source citation.',
    user: 'Extract actionable items: **Action:**, **Owner:**, **Deadline:**, **Source:** [S#].'
  }
};

async function generateArtifact({ notebookId, kind, apiKey, res }) {
  const spec = PROMPTS[kind];
  if (!spec) { res.write('event: error\ndata: ' + JSON.stringify({ error: 'Unknown artifact kind: ' + kind }) + '\n\n'); res.end(); return; }

  // Build grounded context
  const { chunks, text: contextText } = rag.buildFullContext(notebookId, spec.user, 55000);
  if (!chunks.length) {
    res.write('event: error\ndata: ' + JSON.stringify({ error: 'No sources found. Add at least one source to this notebook first.' }) + '\n\n');
    res.end();
    return;
  }

  const systemPrompt = spec.system +
    '\n\n# Rules\n- You have ' + chunks.length + ' numbered source snippets below labelled [S1]..[S' + chunks.length + '].\n- Cite every factual claim with the matching [S#] marker(s). Multiple markers like [S2][S5] are allowed.\n- Never invent a citation number beyond [S' + chunks.length + '].\n- If sources are insufficient to answer part of the prompt, say so — do not hallucinate.\n\n# Sources\n\n' + contextText;

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: spec.user }]
  });

  let fullText = '';
  let errored = false;

  const citationInfo = chunks.map((c, i) => ({ n: i + 1, source_id: c.source_id, source_title: c.source_title, chunk_index: c.chunk_index, snippet: c.content.slice(0, 500) }));
  res.write('event: citations\ndata: ' + JSON.stringify({ citations: citationInfo }) + '\n\n');

  const apiReq = https.request({
    hostname: API_HOSTNAME,
    path: API_PATH,
    method: 'POST',
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
      if (errored) return res.writableEnded ? null : res.end();
      // Persist as a note
      try {
        store.replaceAiNote(notebookId, 'ai_' + kind, { title: spec.title, contentMd: fullText });
      } catch (e) { /* swallow */ }
      res.write('event: done\ndata: ' + JSON.stringify({ kind, title: spec.title, chars: fullText.length }) + '\n\n');
      res.end();
    });
    apiRes.on('error', (e) => {
      if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n'); res.end(); }
    });
  });
  apiReq.on('error', (e) => { if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: e.message }) + '\n\n'); res.end(); } });
  apiReq.setTimeout(180000, () => { apiReq.destroy(); if (!res.writableEnded) { res.write('event: error\ndata: ' + JSON.stringify({ error: 'Timed out' }) + '\n\n'); res.end(); } });
  apiReq.write(body);
  apiReq.end();
}

module.exports = { generateArtifact, PROMPTS };
