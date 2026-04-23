#!/usr/bin/env node
'use strict';

/**
 * Write a fresh `live` section into kb-data/intelligence/metrics-live.json
 * from results pulled via the Databricks MCP connector in the Claude session.
 *
 * This script is a no-network utility — it takes JSON results passed through
 * stdin and merges them into the snapshot. The caller runs the live queries
 * via the MCP connector (which needs Claude's auth context) and then pipes
 * results here, so the Command Center sees live numbers without the server
 * needing to hold a Databricks PAT.
 *
 * Usage:
 *   cat results.json | node scripts/write-live-snapshot.js
 *
 * Expected input shape: { yesterday, mtd, activeSubs, marketMTD, topRoasters,
 *   mom, ftbpPrograms, pbb, sla30, cancellationReasons, daily30, cohort, email }
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'kb-data', 'intelligence', 'metrics-live.json');

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
  });
}

(async () => {
  const raw = await readStdin();
  if (!raw.trim()) { console.error('No input on stdin'); process.exit(1); }
  let incoming;
  try { incoming = JSON.parse(raw); } catch (e) {
    console.error('Invalid JSON on stdin:', e.message);
    process.exit(1);
  }

  let snapshot = {};
  try { snapshot = JSON.parse(fs.readFileSync(TARGET, 'utf8')); } catch {}

  snapshot.live = Object.assign({}, snapshot.live || {}, incoming, {
    refreshedAt: new Date().toISOString(),
    source: 'databricks-mcp'
  });
  snapshot.generated_at = new Date().toISOString();

  fs.writeFileSync(TARGET, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('Wrote', TARGET);
})();
