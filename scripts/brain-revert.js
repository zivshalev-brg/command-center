#!/usr/bin/env node
/**
 * brain-revert.js — Revert the vault to a snapshot.
 *
 * Usage: node scripts/brain-revert.js <snapshot-id>
 *    or: node scripts/brain-revert.js --list
 */

'use strict';
const path = require('path');
const { listSnapshots, revertTo } = require('../server/lib/brain-snapshots');

const VAULT = process.env.OBSIDIAN_VAULT_PATH || path.join(process.env.USERPROFILE || process.env.HOME || '', 'BeanzOS-Brain');
const arg = process.argv[2];

if (!arg || arg === '--list') {
  const list = listSnapshots(VAULT);
  if (!list.length) console.log('No snapshots.');
  else list.forEach(s => console.log(s.id + '  pages=' + s.pages + '  size=' + s.size));
  process.exit(0);
}

try {
  const res = revertTo(VAULT, arg);
  console.log('Reverted to ' + res.restored + ' (safety snapshot: ' + res.safetySnapshot + ')');
} catch (e) { console.error(e.message); process.exit(1); }
