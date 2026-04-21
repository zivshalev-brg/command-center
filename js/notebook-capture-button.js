// ===============================================================
// NOTEBOOK CAPTURE BUTTON — shared "Save to notebook" UI helper
// ===============================================================
// Ubiquitous save-to-notebook entry point for Comms, News, Chat,
// Metrics, Strategy, Calendar, etc. Centralises the button HTML +
// escape logic so each surface only needs to know its source type
// and reference payload.
//
// Usage:
//   html += saveToNotebookButton({
//     sourceType: 'news_article',
//     ref: { url, title, summary },
//     title: 'Article title for picker preview',
//     summary: 'Short summary shown in picker'
//   });

function _nbCapSafe(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _nbCapJsonAttr(obj) {
  try { return _nbCapSafe(JSON.stringify(obj || {})); }
  catch (_) { return '{}'; }
}

/** Returns the HTML for a small bookmark-style button. */
function saveToNotebookButton(opts) {
  opts = opts || {};
  var sourceType = opts.sourceType || 'custom';
  var title = opts.title || '';
  var summary = opts.summary || '';
  var refJson = _nbCapJsonAttr(opts.ref);
  var size = opts.size || 'sm';  // 'sm' | 'md'
  var label = opts.label || '';  // show text label next to icon
  var cls = 'nb-cap-btn nb-cap-' + size + (label ? ' nb-cap-with-label' : '');

  var svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>';

  return '<button class="' + cls + '" title="Save to notebook"'
    + ' data-nb-source-type="' + _nbCapSafe(sourceType) + '"'
    + ' data-nb-ref="' + refJson + '"'
    + ' data-nb-title="' + _nbCapSafe(title) + '"'
    + ' data-nb-summary="' + _nbCapSafe(summary) + '"'
    + ' onclick="event.stopPropagation();handleSaveToNotebookClick(this);return false;">'
    + svg
    + (label ? '<span class="nb-cap-label">' + _nbCapSafe(label) + '</span>' : '')
    + '</button>';
}

/** onclick handler — parses data-attrs and opens the notebook picker modal. */
function handleSaveToNotebookClick(el) {
  if (!el || typeof notebookPickerOpen !== 'function') {
    if (typeof toast === 'function') toast('Notebook picker not loaded', 'er');
    return;
  }
  var sourceType = el.getAttribute('data-nb-source-type') || 'custom';
  var refRaw = el.getAttribute('data-nb-ref') || '{}';
  var ref;
  try { ref = JSON.parse(refRaw); } catch (_) { ref = {}; }
  var title = el.getAttribute('data-nb-title') || '';
  var summary = el.getAttribute('data-nb-summary') || '';

  notebookPickerOpen({
    sourceType: sourceType,
    ref: ref,
    title: title,
    summary: summary
  });
}

// Expose globally for inline onclick handlers
window.saveToNotebookButton = saveToNotebookButton;
window.handleSaveToNotebookClick = handleSaveToNotebookClick;
