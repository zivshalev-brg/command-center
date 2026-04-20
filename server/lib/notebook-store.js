/**
 * notebook-store.js — SQLite CRUD for Notebooks.
 */

'use strict';

const crypto = require('crypto');
const db = require('./db');

function newId(prefix) { return prefix + '-' + crypto.randomBytes(6).toString('hex'); }

function listNotebooks() {
  const d = db.getDb();
  const rows = d.prepare(`
    SELECT n.*,
      (SELECT COUNT(*) FROM notebook_sources s WHERE s.notebook_id = n.id) AS source_count,
      (SELECT COUNT(*) FROM notebook_notes m WHERE m.notebook_id = n.id) AS note_count,
      (SELECT COUNT(*) FROM notebook_messages msg WHERE msg.notebook_id = n.id) AS message_count
    FROM notebooks n
    ORDER BY n.updated_at DESC
  `).all();
  return rows;
}

function getNotebook(id) {
  const d = db.getDb();
  const nb = d.prepare('SELECT * FROM notebooks WHERE id = ?').get(id);
  if (!nb) return null;
  nb.sources = d.prepare(`
    SELECT id, kind, title, url, length(content_text) AS size, metadata_json, added_at
    FROM notebook_sources WHERE notebook_id = ? ORDER BY added_at DESC
  `).all(id);
  nb.notes = d.prepare(`
    SELECT id, title, content_md, kind, pinned, created_at, updated_at
    FROM notebook_notes WHERE notebook_id = ? ORDER BY pinned DESC, updated_at DESC
  `).all(id);
  nb.messages = d.prepare(`
    SELECT id, role, content, citations_json, created_at
    FROM notebook_messages WHERE notebook_id = ? ORDER BY id ASC
  `).all(id);
  return nb;
}

function createNotebook({ title, description, icon, color }) {
  const d = db.getDb();
  const id = newId('nb');
  d.prepare(`INSERT INTO notebooks (id, title, description, icon, color) VALUES (?,?,?,?,?)`)
    .run(id, title || 'Untitled notebook', description || '', icon || '📒', color || 'var(--ac)');
  return getNotebook(id);
}

function updateNotebook(id, { title, description, icon, color }) {
  const d = db.getDb();
  const existing = d.prepare('SELECT * FROM notebooks WHERE id = ?').get(id);
  if (!existing) return null;
  d.prepare(`UPDATE notebooks SET
      title = ?, description = ?, icon = ?, color = ?, updated_at = datetime('now')
    WHERE id = ?`).run(
    title != null ? title : existing.title,
    description != null ? description : existing.description,
    icon != null ? icon : existing.icon,
    color != null ? color : existing.color,
    id
  );
  return getNotebook(id);
}

function deleteNotebook(id) {
  const d = db.getDb();
  d.prepare('DELETE FROM notebooks WHERE id = ?').run(id);
  return true;
}

function touchNotebook(id) {
  const d = db.getDb();
  d.prepare(`UPDATE notebooks SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

// ── Sources ─────────────────────────────────────────────────
function addSource(notebookId, { kind, title, url, contentText, metadata }) {
  const d = db.getDb();
  const id = newId('src');
  d.prepare(`INSERT INTO notebook_sources (id, notebook_id, kind, title, url, content_text, metadata_json, size)
             VALUES (?,?,?,?,?,?,?,?)`).run(
    id, notebookId, kind, title || 'Untitled source', url || null,
    contentText || '', metadata ? JSON.stringify(metadata) : null,
    (contentText || '').length
  );
  touchNotebook(notebookId);
  return getSource(id);
}

function getSource(id) {
  const d = db.getDb();
  return d.prepare('SELECT * FROM notebook_sources WHERE id = ?').get(id);
}

function getSourcesForNotebook(notebookId, { withText } = {}) {
  const d = db.getDb();
  if (withText) return d.prepare('SELECT * FROM notebook_sources WHERE notebook_id = ? ORDER BY added_at DESC').all(notebookId);
  return d.prepare(`SELECT id, kind, title, url, length(content_text) AS size, metadata_json, added_at
                    FROM notebook_sources WHERE notebook_id = ? ORDER BY added_at DESC`).all(notebookId);
}

function deleteSource(id) {
  const d = db.getDb();
  const row = d.prepare('SELECT notebook_id FROM notebook_sources WHERE id = ?').get(id);
  d.prepare('DELETE FROM notebook_sources WHERE id = ?').run(id);
  if (row) touchNotebook(row.notebook_id);
}

// ── Chunks (for RAG) ────────────────────────────────────────
function upsertChunks(sourceId, notebookId, chunks) {
  const d = db.getDb();
  d.prepare('DELETE FROM notebook_source_chunks WHERE source_id = ?').run(sourceId);
  const stmt = d.prepare(`INSERT INTO notebook_source_chunks (source_id, notebook_id, chunk_index, content, char_start, char_end)
                          VALUES (?,?,?,?,?,?)`);
  const tx = d.transaction((rows) => { rows.forEach(r => stmt.run(r.sourceId, r.notebookId, r.index, r.content, r.charStart, r.charEnd)); });
  tx(chunks.map((c, i) => ({ sourceId, notebookId, index: i, content: c.content, charStart: c.start, charEnd: c.end })));
}

function getAllChunksForNotebook(notebookId) {
  const d = db.getDb();
  return d.prepare(`
    SELECT c.*, s.title AS source_title, s.kind AS source_kind, s.url AS source_url
    FROM notebook_source_chunks c
    JOIN notebook_sources s ON s.id = c.source_id
    WHERE c.notebook_id = ?
    ORDER BY s.added_at DESC, c.chunk_index ASC
  `).all(notebookId);
}

// ── Notes ───────────────────────────────────────────────────
function addNote(notebookId, { title, contentMd, kind, pinned }) {
  const d = db.getDb();
  const result = d.prepare(`INSERT INTO notebook_notes (notebook_id, title, content_md, kind, pinned)
                            VALUES (?,?,?,?,?)`).run(notebookId, title || null, contentMd || '', kind || 'user', pinned ? 1 : 0);
  touchNotebook(notebookId);
  return getNote(result.lastInsertRowid);
}

function getNote(id) {
  const d = db.getDb();
  return d.prepare('SELECT * FROM notebook_notes WHERE id = ?').get(id);
}

function updateNote(id, { title, contentMd, pinned }) {
  const d = db.getDb();
  const existing = getNote(id);
  if (!existing) return null;
  d.prepare(`UPDATE notebook_notes SET
      title = ?, content_md = ?, pinned = ?, updated_at = datetime('now')
    WHERE id = ?`).run(
    title != null ? title : existing.title,
    contentMd != null ? contentMd : existing.content_md,
    pinned != null ? (pinned ? 1 : 0) : existing.pinned,
    id
  );
  touchNotebook(existing.notebook_id);
  return getNote(id);
}

function deleteNote(id) {
  const d = db.getDb();
  const row = d.prepare('SELECT notebook_id FROM notebook_notes WHERE id = ?').get(id);
  d.prepare('DELETE FROM notebook_notes WHERE id = ?').run(id);
  if (row) touchNotebook(row.notebook_id);
}

function replaceAiNote(notebookId, kind, { title, contentMd }) {
  const d = db.getDb();
  d.prepare('DELETE FROM notebook_notes WHERE notebook_id = ? AND kind = ?').run(notebookId, kind);
  return addNote(notebookId, { title, contentMd, kind, pinned: true });
}

// ── Messages ────────────────────────────────────────────────
function addMessage(notebookId, role, content, citations) {
  const d = db.getDb();
  d.prepare(`INSERT INTO notebook_messages (notebook_id, role, content, citations_json)
             VALUES (?,?,?,?)`).run(notebookId, role, content, citations ? JSON.stringify(citations) : null);
  touchNotebook(notebookId);
}

function getMessages(notebookId) {
  const d = db.getDb();
  return d.prepare(`SELECT id, role, content, citations_json, created_at
                    FROM notebook_messages WHERE notebook_id = ? ORDER BY id ASC`).all(notebookId);
}

function clearMessages(notebookId) {
  const d = db.getDb();
  d.prepare('DELETE FROM notebook_messages WHERE notebook_id = ?').run(notebookId);
}

module.exports = {
  listNotebooks, getNotebook, createNotebook, updateNotebook, deleteNotebook,
  addSource, getSource, getSourcesForNotebook, deleteSource,
  upsertChunks, getAllChunksForNotebook,
  addNote, getNote, updateNote, deleteNote, replaceAiNote,
  addMessage, getMessages, clearMessages
};
