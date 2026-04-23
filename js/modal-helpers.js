// Reusable modal helpers — Promise-based API for prompts/confirms/forms.
// Uses canonical CSS classes defined in styles.css: .modal-bg, .modal, .modal-h,
// .modal-b, .modal-x, .modal-f. Safe to call from any context.
//
// API:
//   openConfirm({ title, message, confirmLabel, cancelLabel, danger })
//     → Promise<boolean>
//   openPrompt({ title, label, value, placeholder, multiline, required, hint })
//     → Promise<string | null>
//   openModal({ title, fields, submitLabel, cancelLabel, maxWidth })
//     → Promise<Object | null>  // keyed by field.name
//   openChoicePicker({ title, items, renderItem, filterPlaceholder })
//     → Promise<item | null>
//   closeActiveModal()

(function() {
  var _active = null;      // { el, resolve, keyHandler }

  function _close(result) {
    if (!_active) return;
    var a = _active;
    _active = null;
    try {
      if (a.keyHandler) document.removeEventListener('keydown', a.keyHandler);
      if (a.el && a.el.parentNode) a.el.parentNode.removeChild(a.el);
    } catch (e) {}
    if (a.resolve) a.resolve(result);
  }

  function closeActiveModal() { _close(null); }

  function _build(title, innerHtml, opts) {
    opts = opts || {};
    var maxWidth = opts.maxWidth || '520px';
    var bg = document.createElement('div');
    bg.className = 'modal-bg show';
    bg.innerHTML =
      '<div class="modal" style="max-width:' + maxWidth + ';width:100%">' +
        '<div class="modal-h">' +
          '<h2>' + _esc(title) + '</h2>' +
          '<button class="modal-x" data-act="cancel" title="Close (Esc)">\u00D7</button>' +
        '</div>' +
        '<div class="modal-b">' + innerHtml + '</div>' +
      '</div>';
    // Click outside
    bg.addEventListener('click', function(e) {
      if (e.target === bg) _close(null);
    });
    // Cancel button
    bg.querySelector('[data-act="cancel"]').addEventListener('click', function(){ _close(null); });
    document.body.appendChild(bg);
    return bg;
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _keyHandler(onEnter) {
    return function(e) {
      if (e.key === 'Escape') { e.preventDefault(); _close(null); }
      else if (e.key === 'Enter' && !e.shiftKey && onEnter) {
        // Don't trigger if focus is in a textarea
        if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
        e.preventDefault();
        onEnter();
      }
    };
  }

  function _focusFirst(el) {
    setTimeout(function() {
      var first = el.querySelector('input, textarea, select, button[data-autofocus]');
      if (first) first.focus();
      if (first && first.select) try { first.select(); } catch (e) {}
    }, 30);
  }

  // ─── openConfirm ──────────────────────────────────────────────────

  function openConfirm(opts) {
    opts = opts || {};
    var title = opts.title || 'Confirm';
    var message = opts.message || '';
    var confirmLabel = opts.confirmLabel || 'Confirm';
    var cancelLabel = opts.cancelLabel || 'Cancel';
    var danger = !!opts.danger;

    closeActiveModal();
    return new Promise(function(resolve) {
      var html =
        '<p style="font-size:14px;line-height:1.55;color:var(--tx);margin:0 0 18px">' + _esc(message) + '</p>' +
        '<div class="modal-f" style="padding:0;border-top:none;margin:0">' +
          '<button data-act="cancel-foot" style="padding:8px 14px;background:transparent;border:1px solid var(--bd);border-radius:6px;color:var(--tx);cursor:pointer">' + _esc(cancelLabel) + '</button>' +
          '<button data-act="confirm" data-autofocus style="padding:8px 16px;background:' + (danger ? 'var(--rd)' : 'var(--ac)') + ';color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">' + _esc(confirmLabel) + '</button>' +
        '</div>';
      var el = _build(title, html);
      el.querySelector('[data-act="confirm"]').addEventListener('click', function(){ _close(true); });
      el.querySelector('[data-act="cancel-foot"]').addEventListener('click', function(){ _close(false); });
      var kh = _keyHandler(function(){ _close(true); });
      document.addEventListener('keydown', kh);
      _active = { el: el, resolve: resolve, keyHandler: kh };
      _focusFirst(el);
    });
  }

  // ─── openPrompt ──────────────────────────────────────────────────

  function openPrompt(opts) {
    opts = opts || {};
    var title = opts.title || 'Input';
    var label = opts.label || '';
    var placeholder = opts.placeholder || '';
    var value = opts.value || '';
    var multiline = !!opts.multiline;
    var required = opts.required !== false;
    var hint = opts.hint || '';
    var submitLabel = opts.submitLabel || 'Save';

    closeActiveModal();
    return new Promise(function(resolve) {
      var input = multiline
        ? '<textarea data-input rows="4" placeholder="' + _esc(placeholder) + '">' + _esc(value) + '</textarea>'
        : '<input type="text" data-input placeholder="' + _esc(placeholder) + '" value="' + _esc(value) + '" />';
      var html =
        (label ? '<label>' + _esc(label) + '</label>' : '') +
        input +
        (hint ? '<div style="font-size:11px;color:var(--tx3);margin-top:6px">' + _esc(hint) + '</div>' : '') +
        '<div class="modal-f" style="margin-top:16px;padding:12px 0 0;border-top:1px solid var(--bd)">' +
          '<button data-act="cancel-foot" style="padding:8px 14px;background:transparent;border:1px solid var(--bd);border-radius:6px;color:var(--tx);cursor:pointer">Cancel</button>' +
          '<button data-act="submit" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">' + _esc(submitLabel) + '</button>' +
        '</div>';
      var el = _build(title, html);
      var inp = el.querySelector('[data-input]');

      function submit() {
        var v = (inp.value || '').trim();
        if (required && !v) { inp.focus(); inp.style.borderColor = 'var(--rd)'; return; }
        _close(v);
      }
      el.querySelector('[data-act="submit"]').addEventListener('click', submit);
      el.querySelector('[data-act="cancel-foot"]').addEventListener('click', function(){ _close(null); });
      var kh = _keyHandler(submit);
      document.addEventListener('keydown', kh);
      _active = { el: el, resolve: resolve, keyHandler: kh };
      _focusFirst(el);
    });
  }

  // ─── openModal (multi-field form) ────────────────────────────────

  function _renderField(f, idx) {
    var id = 'mhf_' + idx;
    var val = f.value != null ? f.value : '';
    var required = f.required ? ' required' : '';
    var placeholder = f.placeholder ? ' placeholder="' + _esc(f.placeholder) + '"' : '';
    var label = f.label ? '<label for="' + id + '">' + _esc(f.label) + (f.required ? ' *' : '') + '</label>' : '';
    var body = '';

    if (f.type === 'textarea') {
      body = '<textarea id="' + id + '" data-name="' + _esc(f.name) + '" data-type="textarea" rows="' + (f.rows || 3) + '"' + placeholder + required + '>' + _esc(val) + '</textarea>';
    } else if (f.type === 'select') {
      var options = (f.options || []).map(function(o) {
        var optVal = typeof o === 'object' ? o.value : o;
        var optLabel = typeof o === 'object' ? o.label : o;
        var sel = String(optVal) === String(val) ? ' selected' : '';
        return '<option value="' + _esc(optVal) + '"' + sel + '>' + _esc(optLabel) + '</option>';
      }).join('');
      body = '<select id="' + id + '" data-name="' + _esc(f.name) + '" data-type="select"' + required + '>' + options + '</select>';
    } else if (f.type === 'multiselect') {
      var mopts = (f.options || []).map(function(o) {
        var optVal = typeof o === 'object' ? o.value : o;
        var optLabel = typeof o === 'object' ? o.label : o;
        var selArr = Array.isArray(val) ? val : [];
        var sel = selArr.indexOf(optVal) >= 0 ? ' selected' : '';
        return '<option value="' + _esc(optVal) + '"' + sel + '>' + _esc(optLabel) + '</option>';
      }).join('');
      body = '<select id="' + id + '" data-name="' + _esc(f.name) + '" data-type="multiselect" multiple size="' + (f.size || 5) + '">' + mopts + '</select>';
    } else if (f.type === 'date') {
      body = '<input id="' + id + '" data-name="' + _esc(f.name) + '" data-type="date" type="date" value="' + _esc(val) + '"' + required + ' />';
    } else if (f.type === 'number') {
      body = '<input id="' + id + '" data-name="' + _esc(f.name) + '" data-type="number" type="number" value="' + _esc(val) + '"' + placeholder + required +
        (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + ' />';
    } else if (f.type === 'tags') {
      var tags = Array.isArray(val) ? val : [];
      body = '<div class="tag-chip-input" data-name="' + _esc(f.name) + '" data-type="tags">' +
        tags.map(function(t, ti) {
          return '<span class="tag-chip">' + _esc(t) + '<span class="tag-chip-remove" data-tag-idx="' + ti + '">\u00D7</span></span>';
        }).join('') +
        '<input type="text" placeholder="Type + Enter to add" />' +
      '</div>';
    } else {
      body = '<input id="' + id + '" data-name="' + _esc(f.name) + '" data-type="text" type="text" value="' + _esc(val) + '"' + placeholder + required + ' />';
    }

    var hint = f.hint ? '<div style="font-size:11px;color:var(--tx3);margin-top:4px">' + _esc(f.hint) + '</div>' : '';
    var wrapperStyle = f.width ? 'style="grid-column:' + f.width + '"' : '';
    return '<div class="modal-field" ' + wrapperStyle + '>' + label + body + hint + '</div>';
  }

  function _wireTagChipInput(el) {
    var containers = el.querySelectorAll('.tag-chip-input');
    containers.forEach(function(c) {
      var input = c.querySelector('input');
      if (!input) return;
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          var val = (input.value || '').trim().replace(/,$/, '').trim();
          if (!val) return;
          var span = document.createElement('span');
          span.className = 'tag-chip';
          span.innerHTML = _esc(val) + '<span class="tag-chip-remove">\u00D7</span>';
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

  function _collectValues(el) {
    var values = {};
    el.querySelectorAll('[data-name]').forEach(function(input) {
      var name = input.getAttribute('data-name');
      var type = input.getAttribute('data-type');
      if (type === 'multiselect') {
        values[name] = Array.from(input.querySelectorAll('option:checked')).map(function(o){ return o.value; });
      } else if (type === 'tags') {
        values[name] = Array.from(input.querySelectorAll('.tag-chip')).map(function(chip) {
          return chip.firstChild && chip.firstChild.textContent ? chip.firstChild.textContent.trim() : '';
        }).filter(Boolean);
      } else if (type === 'number') {
        values[name] = input.value === '' ? null : Number(input.value);
      } else {
        values[name] = input.value;
      }
    });
    return values;
  }

  function _validate(fields, values) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.required) {
        var v = values[f.name];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return f.label || f.name;
      }
    }
    return null;
  }

  function openModal(opts) {
    opts = opts || {};
    var title = opts.title || 'Edit';
    var fields = opts.fields || [];
    var submitLabel = opts.submitLabel || 'Save';
    var cancelLabel = opts.cancelLabel || 'Cancel';
    var maxWidth = opts.maxWidth || '560px';
    var secondaryAction = opts.secondaryAction; // { label, danger, onClick }

    closeActiveModal();
    return new Promise(function(resolve) {
      var rows = '<div style="display:grid;grid-template-columns:' + (opts.columns || '1fr') + ';gap:12px">' +
        fields.map(_renderField).join('') +
      '</div>';

      var footer = '<div class="modal-f" style="margin-top:18px;padding:12px 0 0;border-top:1px solid var(--bd);justify-content:' + (secondaryAction ? 'space-between' : 'flex-end') + '">';
      if (secondaryAction) {
        footer += '<button data-act="secondary" style="padding:8px 14px;background:transparent;border:1px solid ' + (secondaryAction.danger ? 'var(--rd)' : 'var(--bd)') + ';border-radius:6px;color:' + (secondaryAction.danger ? 'var(--rd)' : 'var(--tx)') + ';cursor:pointer;font-weight:600">' + _esc(secondaryAction.label) + '</button>';
      }
      footer += '<div style="display:flex;gap:8px">' +
        '<button data-act="cancel-foot" style="padding:8px 14px;background:transparent;border:1px solid var(--bd);border-radius:6px;color:var(--tx);cursor:pointer">' + _esc(cancelLabel) + '</button>' +
        '<button data-act="submit" style="padding:8px 16px;background:var(--ac);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">' + _esc(submitLabel) + '</button>' +
      '</div></div>';

      var el = _build(title, rows + footer, { maxWidth: maxWidth });
      _wireTagChipInput(el);

      function submit() {
        var values = _collectValues(el);
        var missing = _validate(fields, values);
        if (missing) {
          if (typeof toast === 'function') toast('Missing: ' + missing, 'err');
          return;
        }
        _close(values);
      }

      el.querySelector('[data-act="submit"]').addEventListener('click', submit);
      el.querySelector('[data-act="cancel-foot"]').addEventListener('click', function(){ _close(null); });
      if (secondaryAction) {
        el.querySelector('[data-act="secondary"]').addEventListener('click', function() {
          var r = secondaryAction.onClick ? secondaryAction.onClick() : null;
          if (r && r.then) r.then(function(){ _close(null); });
          else _close(null);
        });
      }
      var kh = _keyHandler(submit);
      document.addEventListener('keydown', kh);
      _active = { el: el, resolve: resolve, keyHandler: kh };
      _focusFirst(el);
    });
  }

  // ─── openChoicePicker ────────────────────────────────────────────

  function openChoicePicker(opts) {
    opts = opts || {};
    var title = opts.title || 'Choose';
    var items = opts.items || [];
    var renderItem = opts.renderItem || function(i) { return _esc(String(i)); };
    var filterPlaceholder = opts.filterPlaceholder || 'Filter…';

    closeActiveModal();
    return new Promise(function(resolve) {
      var html =
        '<input type="text" data-filter placeholder="' + _esc(filterPlaceholder) + '" style="width:100%;margin-bottom:10px" />' +
        '<div data-list style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">' +
        items.map(function(item, idx) {
          return '<div data-item-idx="' + idx + '" style="padding:10px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:6px;cursor:pointer;transition:background 0.1s" onmouseover="this.style.background=\'var(--s3)\'" onmouseout="this.style.background=\'var(--s2)\'">' + renderItem(item) + '</div>';
        }).join('') +
        '</div>' +
        '<div class="modal-f" style="margin-top:14px;padding:10px 0 0;border-top:1px solid var(--bd)">' +
          '<button data-act="cancel-foot" style="padding:8px 14px;background:transparent;border:1px solid var(--bd);border-radius:6px;color:var(--tx);cursor:pointer">Cancel</button>' +
        '</div>';
      var el = _build(title, html, { maxWidth: '560px' });
      el.querySelectorAll('[data-item-idx]').forEach(function(row) {
        row.addEventListener('click', function() {
          var idx = Number(row.getAttribute('data-item-idx'));
          _close(items[idx]);
        });
      });
      var filter = el.querySelector('[data-filter]');
      filter.addEventListener('input', function() {
        var q = filter.value.toLowerCase();
        el.querySelectorAll('[data-item-idx]').forEach(function(row) {
          row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      el.querySelector('[data-act="cancel-foot"]').addEventListener('click', function(){ _close(null); });
      var kh = _keyHandler(null);
      document.addEventListener('keydown', kh);
      _active = { el: el, resolve: resolve, keyHandler: kh };
      setTimeout(function(){ filter.focus(); }, 30);
    });
  }

  // Expose
  window.openConfirm = openConfirm;
  window.openPrompt = openPrompt;
  window.openModal = openModal;
  window.openChoicePicker = openChoicePicker;
  window.closeActiveModal = closeActiveModal;
})();
