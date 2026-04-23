/**
 * brain-snapshots.js — Atomic snapshots of the Obsidian vault.
 *
 * API:
 *   takeSnapshot(vaultDir)  → snapshotId
 *   listSnapshots(vaultDir) → [{ id, createdAt, pages, size }]
 *   revertTo(vaultDir, id)  → { restored }
 *   prune(vaultDir)         → removes old snapshots (keeps 7 daily + 4 weekly + 3 monthly)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function snapshotsRoot(vaultDir) { return path.join(vaultDir, '.snapshots'); }

function takeSnapshot(vaultDir) {
  if (!fs.existsSync(vaultDir)) throw new Error('Vault not found: ' + vaultDir);
  const root = snapshotsRoot(vaultDir);
  fs.mkdirSync(root, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(root, id);
  fs.mkdirSync(dest);

  let pages = 0, size = 0;
  copyTree(vaultDir, dest, '', (n, s) => { pages += n; size += s; });

  fs.writeFileSync(path.join(dest, '_snapshot.json'), JSON.stringify({
    id, createdAt: new Date().toISOString(), pages, size, vault: vaultDir
  }, null, 2));
  return { id, pages, size };
}

function copyTree(src, dst, rel, cb) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.snapshots') || e.name === '_Index.md' && rel === '') continue;
    if (e.name.startsWith('.')) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d, path.join(rel, e.name), cb);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      fs.copyFileSync(s, d);
      const st = fs.statSync(d);
      cb(1, st.size);
    }
  }
}

function listSnapshots(vaultDir) {
  const root = snapshotsRoot(vaultDir);
  if (!fs.existsSync(root)) return [];
  const ids = fs.readdirSync(root).filter(n => !n.startsWith('.'));
  const out = [];
  for (const id of ids) {
    const meta = path.join(root, id, '_snapshot.json');
    if (fs.existsSync(meta)) {
      try { out.push(JSON.parse(fs.readFileSync(meta, 'utf8'))); } catch {}
    } else {
      const st = fs.statSync(path.join(root, id));
      out.push({ id, createdAt: st.ctime.toISOString(), pages: 0, size: 0 });
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function revertTo(vaultDir, id) {
  const src = path.join(snapshotsRoot(vaultDir), id);
  if (!fs.existsSync(src)) throw new Error('Snapshot not found: ' + id);

  // Safety: take one more snapshot before reverting
  const safety = takeSnapshot(vaultDir);

  // Wipe top-level .md + section directories (preserve .snapshots + .obsidian)
  for (const name of fs.readdirSync(vaultDir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(vaultDir, name);
    if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    else if (name.endsWith('.md')) fs.rmSync(full, { force: true });
  }
  // Copy snapshot back
  copyTree(src, vaultDir, '', () => {});
  // Strip snapshot metadata out of the restored tree
  const metaClone = path.join(vaultDir, '_snapshot.json');
  if (fs.existsSync(metaClone)) fs.rmSync(metaClone, { force: true });
  return { restored: id, safetySnapshot: safety.id };
}

function prune(vaultDir) {
  const snaps = listSnapshots(vaultDir);
  const byDate = {};
  snaps.forEach(s => { byDate[s.id.slice(0, 10)] = byDate[s.id.slice(0, 10)] || s; });
  const dailyKeep = new Set(snaps.slice(0, 7).map(s => s.id));
  const weeklyKeep = new Set();
  const monthlyKeep = new Set();
  let lastWeek = null, lastMonth = null;
  for (const s of snaps) {
    const d = new Date(s.createdAt);
    const wk = d.getFullYear() + '-W' + Math.floor(d.getDate() / 7);
    const mo = d.getFullYear() + '-' + d.getMonth();
    if (wk !== lastWeek && weeklyKeep.size < 4) { weeklyKeep.add(s.id); lastWeek = wk; }
    if (mo !== lastMonth && monthlyKeep.size < 3) { monthlyKeep.add(s.id); lastMonth = mo; }
  }
  const keep = new Set([...dailyKeep, ...weeklyKeep, ...monthlyKeep]);
  let removed = 0;
  for (const s of snaps) {
    if (!keep.has(s.id)) {
      fs.rmSync(path.join(snapshotsRoot(vaultDir), s.id), { recursive: true, force: true });
      removed++;
    }
  }
  return { kept: keep.size, removed };
}

module.exports = { takeSnapshot, listSnapshots, revertTo, prune };
