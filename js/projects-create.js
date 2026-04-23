// Projects — create/edit modal.
// Uses the shared .modal-bg / .modal / .modal-h / .modal-b / .modal-f CSS classes
// (defined in css/styles.css) and the .modal-field / .tag-chip-input patterns.

function openCreateProjectModal() {
  _openProjectFormModal(null);
}

function openEditProjectModal(projectId) {
  var p = DATA && DATA.projects && DATA.projects[projectId];
  if (!p) return;
  _openProjectFormModal(p);
}

function _pcEnc(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _openProjectFormModal(existing) {
  var isEdit = !!existing;
  closeProjectFormModal();

  var bg = document.createElement('div');
  bg.className = 'modal-bg show';
  bg.id = 'projectFormOverlay';
  bg.addEventListener('click', function(e) { if (e.target === bg) closeProjectFormModal(); });

  var f = existing || {};
  var title = isEdit ? 'Edit Project' : 'New Project';

  var people = (typeof DATA !== 'undefined' && DATA.people) ? DATA.people : {};
  var peopleEntries = Object.keys(people).map(function(pid) {
    return { id: pid, data: people[pid] };
  });

  // Owner options
  var ownerOptions = '<option value="">\u2014 unassigned \u2014</option>' + peopleEntries.map(function(pe) {
    var sel = f.owner === pe.id ? ' selected' : '';
    return '<option value="' + pe.id + '"' + sel + '>' + _pcEnc(pe.data.n) + '</option>';
  }).join('');

  // People multiselect
  var selectedPeople = (f.people_ids || f.people || []);
  var peopleOptions = peopleEntries.map(function(pe) {
    var sel = selectedPeople.indexOf(pe.id) >= 0 ? ' selected' : '';
    return '<option value="' + pe.id + '"' + sel + '>' + _pcEnc(pe.data.n) + ' (' + _pcEnc(pe.data.role || '') + ')</option>';
  }).join('');

  // Status options
  var statusOptions = ['active', 'paused', 'finalising', 'archived', 'draft'].map(function(o) {
    var sel = (f.status || 'active') === o ? ' selected' : '';
    return '<option value="' + o + '"' + sel + '>' + o + '</option>';
  }).join('');

  // RAG options
  var ragOptions = [
    { v: 'green', l: '🟢 Green' }, { v: 'amber', l: '🟡 Amber' }, { v: 'red', l: '🔴 Red' }
  ].map(function(o) {
    var sel = (f.rag || 'green') === o.v ? ' selected' : '';
    return '<option value="' + o.v + '"' + sel + '>' + o.l + '</option>';
  }).join('');

  // Tag chips
  function tagChipHtml(arr) {
    return (arr || []).map(function(t) {
      return '<span class="tag-chip">' + _pcEnc(t) + '<span class="tag-chip-remove">\u00D7</span></span>';
    }).join('');
  }

  bg.innerHTML =
    '<div class="modal" style="max-width:720px;width:100%;max-height:85vh;overflow-y:auto">' +
      '<div class="modal-h">' +
        '<h2>' + title + '</h2>' +
        '<button class="modal-x" onclick="closeProjectFormModal()">\u00D7</button>' +
      '</div>' +
      '<div class="modal-b">' +
        '<form id="projectForm" onsubmit="return submitProjectForm(event, ' + (isEdit ? "'" + f.id + "'" : 'null') + ')">' +
          // Row: title + status
          '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">' +
            '<div class="modal-field"><label>Title *</label>' +
              '<input name="title" required value="' + _pcEnc(f.title || '') + '" placeholder="e.g. Q3 Pricing Review" />' +
            '</div>' +
            '<div class="modal-field"><label>Status</label>' +
              '<select name="status">' + statusOptions + '</select>' +
            '</div>' +
          '</div>' +
          // Description
          '<div class="modal-field"><label>Description</label>' +
            '<textarea name="description" rows="2" placeholder="What is this project about?">' + _pcEnc(f.desc || f.description || '') + '</textarea>' +
          '</div>' +
          // Row: owner + team + RAG
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
            '<div class="modal-field"><label>Owner</label><select name="owner_id">' + ownerOptions + '</select></div>' +
            '<div class="modal-field"><label>Team</label><input name="team" value="' + _pcEnc(f.team || '') + '" placeholder="e.g. Beanz AU" /></div>' +
            '<div class="modal-field"><label>RAG</label><select name="rag">' + ragOptions + '</select></div>' +
          '</div>' +
          // Row: priority + progress + start + target
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">' +
            '<div class="modal-field"><label>Priority 0-100</label><input name="priority" type="number" min="0" max="100" value="' + (f.priority != null ? f.priority : 50) + '" /></div>' +
            '<div class="modal-field"><label>Progress %</label><input name="progress" type="number" min="0" max="100" value="' + (f.progress != null ? f.progress : 0) + '" /></div>' +
            '<div class="modal-field"><label>Start</label><input name="start_date" type="date" value="' + _pcEnc(f.start_date || '') + '" /></div>' +
            '<div class="modal-field"><label>Target</label><input name="target_date" type="date" value="' + _pcEnc(f.target_date || '') + '" /></div>' +
          '</div>' +
          // People multi-select
          '<div class="modal-field">' +
            '<label>People on project</label>' +
            '<select name="people_ids" multiple size="5">' + peopleOptions + '</select>' +
            '<div style="font-size:11px;color:var(--tx3);margin-top:4px">Hold Ctrl/Cmd to select multiple</div>' +
          '</div>' +
          // Classifier tags
          '<div class="modal-field">' +
            '<label>Classifier tags (sources are linked when these keywords appear in a thread)</label>' +
            '<div class="tag-chip-input" data-field="classifier_tags">' +
              tagChipHtml(f.classifier_tags || []) +
              '<input type="text" placeholder="Type + Enter (e.g. Project Feral)" />' +
            '</div>' +
          '</div>' +
          // Aliases
          '<div class="modal-field">' +
            '<label>Aliases (alternate names used in comms)</label>' +
            '<div class="tag-chip-input" data-field="aliases">' +
              tagChipHtml(f.aliases || []) +
              '<input type="text" placeholder="Type + Enter" />' +
            '</div>' +
          '</div>' +
          // Jira + Confluence
          '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">' +
            '<div class="modal-field"><label>Jira JQL (optional)</label><input name="jira_jql" value="' + _pcEnc(f.jira_jql || '') + '" placeholder=\'project = BEANZ AND labels = "feral"\' /></div>' +
            '<div class="modal-field"><label>Confluence space</label><input name="confluence_space" value="' + _pcEnc(f.confluence_space || '') + '" placeholder="BEANZ" /></div>' +
          '</div>' +
          // News keywords
          '<div class="modal-field">' +
            '<label>News keywords</label>' +
            '<div class="tag-chip-input" data-field="news_keywords">' +
              tagChipHtml(f.news_keywords || []) +
              '<input type="text" placeholder="Type + Enter" />' +
            '</div>' +
          '</div>' +
          // Footer
          '<div class="modal-f" style="margin-top:18px;padding:12px 0 0;border-top:1px solid var(--bd);justify-content:' + (isEdit ? 'space-between' : 'flex-end') + '">' +
            (isEdit ? '<button type="button" onclick="archiveProjectFromModal(\'' + f.id + '\')" style="padding:8px 14px;background:transparent;border:1px solid var(--rd);border-radius:6px;color:var(--rd);cursor:pointer;font-weight:600">Archive</button>' : '') +
            '<div style="display:flex;gap:8px">' +
              '<button type="button" onclick="closeProjectFormModal()" style="padding:8px 14px;background:transparent;border:1px solid var(--bd);border-radius:6px;color:var(--tx);cursor:pointer">Cancel</button>' +
              '<button type="submit" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">' + (isEdit ? 'Save Changes' : 'Create Project') + '</button>' +
            '</div>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';

  document.body.appendChild(bg);
  _wireTagChipsForm(bg);
  var firstInput = bg.querySelector('input[name="title"]');
  if (firstInput) { firstInput.focus(); try { firstInput.select(); } catch (e) {} }

  // Escape to close
  var esc = function(e) {
    if (e.key === 'Escape') {
      closeProjectFormModal();
      document.removeEventListener('keydown', esc);
    }
  };
  document.addEventListener('keydown', esc);
}

function _wireTagChipsForm(root) {
  root.querySelectorAll('.tag-chip-input').forEach(function(c) {
    var input = c.querySelector('input');
    if (!input) return;
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        var val = (input.value || '').trim().replace(/,$/, '').trim();
        if (!val) return;
        var span = document.createElement('span');
        span.className = 'tag-chip';
        span.innerHTML = _pcEnc(val) + '<span class="tag-chip-remove">\u00D7</span>';
        c.insertBefore(span, input);
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value) {
        var chips = c.querySelectorAll('.tag-chip');
        if (chips.length) chips[chips.length - 1].remove();
      }
    });
    c.addEventListener('click', function(e) {
      if (e.target.classList.contains('tag-chip-remove')) {
        e.target.parentElement.remove();
      } else if (e.target === c) {
        input.focus();
      }
    });
  });
}

function closeProjectFormModal() {
  var o = document.getElementById('projectFormOverlay');
  if (o) o.remove();
}

function _collectTagChips(root, field) {
  var container = root.querySelector('.tag-chip-input[data-field="' + field + '"]');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-chip')).map(function(chip) {
    return chip.firstChild && chip.firstChild.textContent ? chip.firstChild.textContent.trim() : '';
  }).filter(Boolean);
}

async function submitProjectForm(ev, id) {
  ev.preventDefault();
  var form = document.getElementById('projectForm');
  var fd = new FormData(form);
  var body = {
    title: fd.get('title'),
    status: fd.get('status'),
    rag: fd.get('rag'),
    priority: Number(fd.get('priority')) || 50,
    owner_id: fd.get('owner_id') || null,
    team: fd.get('team') || null,
    description: fd.get('description') || null,
    start_date: fd.get('start_date') || null,
    target_date: fd.get('target_date') || null,
    progress: Number(fd.get('progress')) || 0,
    classifier_tags: _collectTagChips(form, 'classifier_tags'),
    aliases: _collectTagChips(form, 'aliases'),
    news_keywords: _collectTagChips(form, 'news_keywords'),
    jira_jql: fd.get('jira_jql') || null,
    confluence_space: fd.get('confluence_space') || null,
    people_ids: Array.from(form.querySelectorAll('select[name="people_ids"] option:checked')).map(function(o){ return o.value; })
  };
  try {
    if (id) {
      await apiUpdateProject(id, body);
      if (typeof toast === 'function') toast('Project updated', 'ok');
    } else {
      var created = await apiCreateProject(body);
      if (typeof toast === 'function') toast('Project created', 'ok');
      if (typeof state !== 'undefined' && created) state.selectedProject = created.id;
    }
    closeProjectFormModal();
    if (typeof renderAll === 'function') renderAll();
  } catch (e) {
    if (typeof toast === 'function') toast('Save failed: ' + e.message, 'err');
    else console.error('Save failed:', e.message);
  }
  return false;
}

async function archiveProjectFromModal(id) {
  var p = DATA && DATA.projects && DATA.projects[id];
  var name = p ? p.title : 'this project';
  var yes = await openConfirm({
    title: 'Archive project?',
    message: 'Archiving "' + name + '" will hide it from the active list. Sources and past updates are preserved. You can unarchive later.',
    confirmLabel: 'Archive',
    cancelLabel: 'Keep',
    danger: true
  });
  if (!yes) return;
  try {
    await apiArchiveProject(id);
    if (typeof toast === 'function') toast('Archived', 'ok');
    closeProjectFormModal();
    if (typeof state !== 'undefined') state.selectedProject = null;
    if (typeof renderAll === 'function') renderAll();
  } catch (e) {
    if (typeof toast === 'function') toast('Archive failed: ' + e.message, 'err');
  }
}
