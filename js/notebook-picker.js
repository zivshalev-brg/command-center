// ===============================================================
// UNIVERSAL NOTEBOOK PICKER
// ===============================================================
//
// Anywhere in the app, call:
//    notebookPickerOpen({ sourceType, ref, title, summary })
//
// It shows a modal with all notebooks + a "New notebook" option.
// On selection it POSTs /api/notebooks/:id/capture and toasts the result.
//
// sourceType: news_article | news_video | email_thread | slack_thread
//           | chat_message | metrics_snapshot | custom
// ref: type-specific descriptor (the server re-fetches full content)
// title, summary: optional hints shown in the modal header
// ===============================================================

(function() {
  var state = {
    open: false,
    descriptor: null,      // { sourceType, ref, title, summary }
    notebooks: null,
    loading: false,
    creating: false,
    saving: false
  };

  function _escape(s) {
    return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _ensureContainer() {
    var el = document.getElementById('notebook-picker-root');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'notebook-picker-root';
    document.body.appendChild(el);
    return el;
  }

  function _toast(msg, kind) {
    if (typeof showToast === 'function') { showToast(msg, kind || 'info'); return; }
    try { console.log('[notebook-picker]', msg); } catch (e) {}
  }

  function _loadNotebooks() {
    state.loading = true;
    _render();
    fetch('/api/notebooks').then(function(r) { return r.json(); }).then(function(d) {
      state.notebooks = (d && d.notebooks) || [];
      state.loading = false;
      _render();
    }).catch(function(e) {
      state.loading = false;
      state.notebooks = [];
      _render();
    });
  }

  function _createNotebook() {
    if (state.creating) return;
    var title = prompt('New notebook title:', 'Untitled notebook');
    if (!title) return;
    state.creating = true; _render();
    fetch('/api/notebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title })
    }).then(function(r) { return r.json(); }).then(function(d) {
      state.creating = false;
      if (d && d.notebook) {
        state.notebooks = (state.notebooks || []);
        state.notebooks.unshift(d.notebook);
        _capture(d.notebook.id, d.notebook.title);
      }
    }).catch(function(e) {
      state.creating = false; _render();
      _toast('Failed to create notebook: ' + e.message, 'error');
    });
  }

  function _capture(notebookId, notebookTitle) {
    if (!state.descriptor) return;
    if (state.saving) return;
    state.saving = true; _render();

    var body = {
      sourceType: state.descriptor.sourceType,
      ref: state.descriptor.ref || {},
      overrideTitle: state.descriptor.title || undefined
    };

    fetch('/api/notebooks/' + encodeURIComponent(notebookId) + '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); }).then(function(d) {
      state.saving = false;
      if (d && d.ok) {
        var kb = Math.round(((d.contentBytes || 0) / 1024) * 10) / 10;
        _toast('Saved to "' + notebookTitle + '" — ' + kb + ' KB captured');
        close();
        // Refresh notebook list state if user is currently viewing notes
        if (typeof window.notesLoadList === 'function') window.notesLoadList();
        if (window.state && window.state.selectedNotebookId === notebookId && typeof window.notesLoadNotebook === 'function') {
          window.notesLoadNotebook(notebookId);
        }
      } else {
        _toast('Save failed: ' + ((d && d.error) || 'unknown error'), 'error');
        state.saving = false; _render();
      }
    }).catch(function(e) {
      state.saving = false; _render();
      _toast('Save failed: ' + e.message, 'error');
    });
  }

  function open(descriptor) {
    if (!descriptor || !descriptor.sourceType) {
      _toast('Missing sourceType for save', 'error');
      return;
    }
    state.descriptor = descriptor;
    state.open = true;
    state.saving = false;
    if (!state.notebooks) _loadNotebooks();
    else _render();
  }

  function close() {
    state.open = false;
    state.saving = false;
    _render();
  }

  function _render() {
    var root = _ensureContainer();
    if (!state.open) { root.innerHTML = ''; return; }

    var d = state.descriptor || {};
    var typeLabel = ({
      news_article: '📰 News article',
      news_video: '🎬 Video + transcript',
      email_thread: '📧 Email thread',
      slack_thread: '💬 Slack thread',
      comms_thread: '💬 Thread',
      chat_message: '🤖 Chat excerpt',
      metrics_snapshot: '📊 Metrics snapshot',
      dashboard_snapshot: '📊 Dashboard snapshot',
      custom: '📎 Captured item'
    })[d.sourceType] || '📎 Item';

    var itemsHtml = '';
    if (state.loading) {
      itemsHtml = '<div style="padding:var(--sp4);text-align:center;color:var(--tx3)">Loading notebooks…</div>';
    } else if (!state.notebooks || !state.notebooks.length) {
      itemsHtml = '<div style="padding:var(--sp4);text-align:center;color:var(--tx3)">No notebooks yet. Create one below.</div>';
    } else {
      itemsHtml = state.notebooks.map(function(nb) {
        var subtitle = (nb.source_count || 0) + ' source' + (nb.source_count === 1 ? '' : 's') +
          ' · ' + (nb.note_count || 0) + ' note' + (nb.note_count === 1 ? '' : 's');
        var updated = nb.updated_at ? new Date(nb.updated_at).toLocaleDateString() : '';
        return '<div class="np-item" onclick="window.notebookPickerSelect(\'' + _escape(nb.id) + '\', \'' + _escape(nb.title).replace(/'/g, "\\'") + '\')">' +
          '<div class="np-item-icon" style="color:' + _escape(nb.color || 'var(--ac)') + '">' + _escape(nb.icon || '📒') + '</div>' +
          '<div class="np-item-body">' +
            '<div class="np-item-title">' + _escape(nb.title || 'Untitled') + '</div>' +
            '<div class="np-item-meta">' + _escape(subtitle) + (updated ? ' · updated ' + _escape(updated) : '') + '</div>' +
          '</div>' +
          '<div class="np-item-arrow">→</div>' +
        '</div>';
      }).join('');
    }

    var summary = d.summary ? '<div class="np-summary">' + _escape(String(d.summary).slice(0, 220)) + (String(d.summary).length > 220 ? '…' : '') + '</div>' : '';

    var savingOverlay = state.saving ? '<div class="np-saving"><div class="np-spinner"></div><span>Fetching full content and saving…</span></div>' : '';

    root.innerHTML =
      '<div class="np-overlay" onclick="window.notebookPickerClose()">' +
        '<div class="np-modal" onclick="event.stopPropagation()">' +
          '<div class="np-header">' +
            '<div>' +
              '<div class="np-title">Save to notebook</div>' +
              '<div class="np-subtitle">' + _escape(typeLabel) + (d.title ? ' · ' + _escape(d.title.slice(0, 80)) : '') + '</div>' +
            '</div>' +
            '<button class="np-close" onclick="window.notebookPickerClose()">×</button>' +
          '</div>' +
          summary +
          '<div class="np-list">' + itemsHtml + '</div>' +
          '<div class="np-footer">' +
            '<button class="np-create" onclick="window.notebookPickerCreate()"' + (state.creating ? ' disabled' : '') + '>' +
              '＋ Create new notebook' +
            '</button>' +
          '</div>' +
          savingOverlay +
        '</div>' +
      '</div>';
  }

  // ── Public globals ────────────────────────────────────────
  window.notebookPickerOpen = open;
  window.notebookPickerClose = close;
  window.notebookPickerSelect = _capture;
  window.notebookPickerCreate = _createNotebook;

  // Keyboard escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && state.open) close();
  });
})();
