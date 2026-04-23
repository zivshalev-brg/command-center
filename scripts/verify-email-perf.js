#!/usr/bin/env node
// Verify command for the Email Performance Layer autoresearch loop.
// Composite score = (9 - verify_tags_remaining) + p0_done * 2
// Prints a single line: "verify_tags=N p0_done=N score=N"

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prdPath = path.join(root, '.claude', 'plan', 'email-performance-layer.md');
const manifestPath = path.join(root, '.claude', 'plan', 'email-perf-progress.json');

try {
  const prd = fs.readFileSync(prdPath, 'utf8');
  const tags = (prd.match(/\[VERIFY\]/g) || []).length;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const p0Done = (manifest.features || []).filter((f) => f.priority === 'P0' && f.done).length;

  const score = Math.max(0, 9 - tags) + p0Done * 2;
  console.log(`verify_tags=${tags} p0_done=${p0Done} score=${score}`);
  process.exit(0);
} catch (err) {
  console.error('verify-email-perf error:', err.message);
  process.exit(1);
}
