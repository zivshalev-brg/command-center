/**
 * obsidian-notebook-bridge.js — Phase F notebook ↔ brain bridge.
 *
 * Writes a notebook note into the vault under 900-Notebooks/{nb-slug}/{note-slug}.md
 * with full content + source citations + notebook backlink. Preserves user edits
 * via AUTO-START/END markers.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath } = require('./obsidian-sync');
const { writeFreshPage } = require('./obsidian-comms-sync');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

function promoteNoteToBrain(notebook, note) {
  const vault = getVaultPath();
  const nbSlug = slugify(notebook.title);
  const noteSlug = slugify(note.title || note.kind);
  const rel = path.join('900-Notebooks', nbSlug, noteSlug + '.md');
  const full = path.join(vault, rel);

  const kindLabel = note.kind === 'user' ? 'User note' :
                    note.kind === 'chat_saved' ? 'Saved chat answer' :
                    note.kind.startsWith('ai_') ? ('AI-generated: ' + note.kind.replace(/^ai_/, '').replace(/_/g, ' ')) :
                    note.kind;

  const fm = {
    title: note.title || (nbSlug + ' · ' + noteSlug),
    description: 'Promoted from notebook: ' + notebook.title,
    type: 'notebook-note',
    status: 'complete',
    owner: 'Notebook',
    market: ['global'],
    tags: ['notebook', notebook.title.toLowerCase().split(/\s+/)[0], note.kind],
    aliases: [],
    related: ['[[' + notebook.title + ']]'],
    notebook_id: notebook.id,
    note_id: note.id,
    note_kind: note.kind,
    promoted_at: new Date().toISOString()
  };

  const sourceList = (notebook.sources || []).map(s => '- ' + s.title + ' · ' + s.kind);
  const lines = [
    '# ' + (note.title || kindLabel),
    '',
    '> ' + kindLabel + ' · from [[' + notebook.title + ']] · promoted ' + new Date().toISOString(),
    '',
    '## Content',
    '',
    (note.content_md || '').trim(),
    ''
  ];
  if (sourceList.length) {
    lines.push('## Notebook sources');
    lines.push('');
    sourceList.forEach(s => lines.push(s));
  }

  writeFreshPage(full, fm, lines.join('\n'));
  return { relPath: rel.replace(/\\/g, '/'), vaultPath: vault };
}

module.exports = { promoteNoteToBrain };
