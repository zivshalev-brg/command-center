#!/usr/bin/env node
/**
 * brain-meta-agent.js — Phase G meta-agent proposal loop.
 *
 * Reads rag_traces failure buckets + the current brain-quality score, synthesizes
 * 1-3 targeted improvement proposals, and files them in brain_proposals for human
 * review. Never writes directly to production — all changes go through staging.
 *
 * Usage:
 *   node scripts/brain-meta-agent.js           # dry-run: print proposals
 *   node scripts/brain-meta-agent.js --commit  # file proposals into DB
 *
 * Self-reflection gate: every proposal must answer "would this still help if the
 * probe set were swapped tomorrow?" If the answer references specific probe IDs,
 * the proposal is auto-rejected as overfit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const COMMIT = process.argv.includes('--commit');
const VAULT = process.env.OBSIDIAN_VAULT_PATH || path.join(process.env.USERPROFILE || process.env.HOME || '', 'BeanzOS-Brain');

// Load environment from .env (minimal parser — matches what server/server.js does)
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  });
})();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set.'); process.exit(1); }

function callAnthropic(system, user) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (json.error) return reject(new Error(json.error.message));
          const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function readJson(cmdArgs) {
  const out = spawnSync(process.execPath, cmdArgs, { encoding: 'utf8' });
  try { return JSON.parse(out.stdout); } catch { return null; }
}

async function main() {
  console.log('[meta-agent] gathering signal…');
  const score = readJson([path.join(__dirname, 'brain-quality.js'), VAULT, '--json']);
  const diag = readJson([path.join(__dirname, 'brain-diagnostics.js'), '--hours=336', '--json']);
  if (!score || !diag) { console.error('could not read brain-quality or diagnostics output'); process.exit(1); }

  console.log('[meta-agent] score=' + score.score + ' H=' + score.H + ' R=' + score.R + ' U=' + score.U);
  console.log('[meta-agent] diagnostics: ' + JSON.stringify(diag.buckets));

  const systemPrompt = `You are the Beanz OS brain meta-agent. Your job is to propose 1-3 targeted, mechanical improvements to the Obsidian Brain's sync + RAG pipeline.

You MUST answer in strict JSON matching this schema:
{
  "proposals": [
    {
      "summary": "one-line change",
      "rationale": "why this should improve one of H, R, or U",
      "target_file": "server/lib/obsidian-rag.js | server/lib/obsidian-sync.js | server/lib/obsidian-comms-sync.js | server/lib/obsidian-entities.js | server/lib/obsidian-chunks.js | scripts/brain-*.js",
      "diff_patch": "unified diff showing the minimal change (use real file paths; keep diffs small)",
      "expected_score_gain": { "H": 0, "R": 0, "U": 0 },
      "self_reflection": "If the probe set were swapped tomorrow with 30 different exec questions on the same domain, would this change still help? Answer in 1 sentence. Do NOT reference specific probe queries."
    }
  ]
}

Rules:
- Each proposal MUST be a tiny, auditable change (usually <30 lines of diff).
- Never propose changes that would game the probe set (e.g. stuffing keywords into pages, forcing fake wikilinks).
- Prefer scoring/weight tweaks, new boosts, dedup rules, small generator improvements.
- If you can't find a worthwhile proposal, return { "proposals": [] }.
- No commentary outside the JSON.`;

  const userPrompt = `Current brain state:

## Scores
${JSON.stringify(score, null, 2)}

## Diagnostics (last 14 days)
${JSON.stringify(diag, null, 2)}

Propose 1-3 mechanical improvements to raise the blended score without overfitting. Return strict JSON.`;

  console.log('[meta-agent] asking Claude Sonnet 4.5…');
  let text;
  try { text = await callAnthropic(systemPrompt, userPrompt); }
  catch (e) { console.error('API error:', e.message); process.exit(1); }

  // Parse JSON (Claude sometimes wraps in ```json blocks)
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) { console.error('[meta-agent] could not parse response:'); console.error(text); process.exit(1); }

  const proposals = parsed.proposals || [];
  console.log('[meta-agent] ' + proposals.length + ' proposal(s) returned');

  // Self-reflection gate
  const accepted = [];
  proposals.forEach((p, i) => {
    const ref = (p.self_reflection || '').toLowerCase();
    const bad = /probe[s]?\s+\d+|question\s+\d+|q\d+|probe[- ]?id|first probe|second probe|third probe/i.test(p.self_reflection || '');
    if (bad) { console.log('  ✗ proposal ' + (i + 1) + ' rejected (referenced specific probes): ' + p.summary); return; }
    if (ref.length < 20) { console.log('  ✗ proposal ' + (i + 1) + ' rejected (no real self-reflection): ' + p.summary); return; }
    accepted.push(p);
    console.log('  ✓ ' + p.summary);
  });

  if (!COMMIT) {
    console.log('\n── DRY RUN ── (pass --commit to file proposals)\n');
    console.log(JSON.stringify({ accepted }, null, 2));
    return;
  }

  // File proposals into DB
  const db = require('../server/lib/db');
  accepted.forEach(p => {
    const id = db.addBrainProposal({
      origin: 'meta-agent',
      summary: p.summary,
      rationale: p.rationale + '\n\n### Self-reflection\n' + p.self_reflection + '\n\n### Target\n' + p.target_file + '\n\n### Expected gain\n' + JSON.stringify(p.expected_score_gain),
      diffPatch: p.diff_patch,
      scoreBefore: { H: score.H, R: score.R, U: score.U, score: score.score },
      status: 'pending'
    });
    console.log('  filed proposal #' + id + ': ' + p.summary);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
