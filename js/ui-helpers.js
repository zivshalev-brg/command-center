// Beanz OS — UI Helpers
// Shared runtime layer: empty states, skeletons, enriched toasts, keyboard-help
// trigger, progress indicators, copy-to-clipboard, relative-time formatting.
// Attached to window so every mod-*.js can consume. Pure DOM — no module deps.

(function(global) {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _el(selector) {
    if (!selector) return null;
    if (typeof selector === 'string') return document.querySelector(selector);
    return selector; // already a DOM node
  }

  // ─── Empty state ─────────────────────────────────────────────
  //
  //   showEmptyState('#projects-main', {
  //     icon: '📋',
  //     title: 'No projects yet',
  //     body: 'Create one to start tracking work.',
  //     actionLabel: '+ New Project',
  //     onAction: () => openCreateProjectModal()
  //   });
  function showEmptyState(container, opts) {
    var el = _el(container);
    if (!el) return;
    opts = opts || {};
    var actionBtn = '';
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      var actionId = 'c-empty-act-' + Math.random().toString(36).slice(2, 8);
      actionBtn = '<button id="' + actionId + '" class="c-btn c-btn-primary c-empty-action">' + _esc(opts.actionLabel) + '</button>';
      setTimeout(function() {
        var btn = document.getElementById(actionId);
        if (btn) btn.addEventListener('click', opts.onAction);
      }, 0);
    }
    el.innerHTML =
      '<div class="c-empty">' +
        (opts.icon ? '<div class="c-empty-icon">' + _esc(opts.icon) + '</div>' : '') +
        (opts.title ? '<div class="c-empty-title">' + _esc(opts.title) + '</div>' : '') +
        (opts.body ? '<div class="c-empty-body">' + _esc(opts.body) + '</div>' : '') +
        actionBtn +
      '</div>';
  }

  // ─── Skeletons ───────────────────────────────────────────────
  //
  //   showLoadingSkeleton('#inbox', 'list', { count: 6 });
  //   showLoadingSkeleton('#metrics-grid', 'kpi-grid');
  //   showLoadingSkeleton('#chart-area', 'chart');
  var SKELETON_VARIANTS = {
    list: function(count) {
      var rows = '';
      for (var i = 0; i < count; i++) {
        rows += '<div class="c-skel-card">' +
          '<div class="c-row" style="gap:12px;align-items:flex-start">' +
            '<div class="c-skel c-skel-circle"></div>' +
            '<div class="c-flex-1">' +
              '<div class="c-skel c-skel-title" style="width:55%"></div>' +
              '<div class="c-skel c-skel-line" style="width:85%"></div>' +
              '<div class="c-skel c-skel-line" style="width:70%"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }
      return rows;
    },
    cards: function(count) {
      var cards = '';
      for (var i = 0; i < count; i++) {
        cards += '<div class="c-skel-card">' +
          '<div class="c-skel c-skel-title"></div>' +
          '<div class="c-skel c-skel-line" style="width:90%"></div>' +
          '<div class="c-skel c-skel-line" style="width:75%"></div>' +
          '<div class="c-skel c-skel-line-sm" style="width:40%"></div>' +
        '</div>';
      }
      return '<div class="c-grid-auto">' + cards + '</div>';
    },
    'kpi-grid': function(count) {
      var tiles = '';
      for (var i = 0; i < count; i++) {
        tiles += '<div class="c-skel-kpi">' +
          '<div class="c-skel c-skel-line-sm" style="width:50%;margin-bottom:12px"></div>' +
          '<div class="c-skel" style="height:28px;width:70%;margin-bottom:8px"></div>' +
          '<div class="c-skel c-skel-line-sm" style="width:40%"></div>' +
        '</div>';
      }
      return '<div class="c-grid-kpi">' + tiles + '</div>';
    },
    chart: function() {
      return '<div class="c-skel c-skel-chart"></div>';
    },
    table: function(count) {
      var rows = '';
      for (var i = 0; i < count; i++) {
        rows += '<div class="c-row" style="padding:10px 0;border-bottom:1px solid var(--bd)">' +
          '<div class="c-skel c-skel-line" style="flex:1"></div>' +
          '<div class="c-skel c-skel-line" style="width:80px"></div>' +
          '<div class="c-skel c-skel-line" style="width:80px"></div>' +
        '</div>';
      }
      return rows;
    },
    feed: function(count) {
      var items = '';
      for (var i = 0; i < count; i++) {
        items += '<div class="c-skel-card">' +
          '<div class="c-skel c-skel-line-sm" style="width:30%;margin-bottom:12px"></div>' +
          '<div class="c-skel c-skel-title" style="width:80%"></div>' +
          '<div class="c-skel c-skel-line" style="width:100%"></div>' +
          '<div class="c-skel c-skel-line" style="width:60%"></div>' +
        '</div>';
      }
      return items;
    },
    text: function(count) {
      var lines = '';
      for (var i = 0; i < count; i++) {
        lines += '<div class="c-skel c-skel-line" style="width:' + (60 + Math.floor(Math.random() * 35)) + '%"></div>';
      }
      return '<div class="c-stack">' + lines + '</div>';
    }
  };

  function showLoadingSkeleton(container, variant, opts) {
    var el = _el(container);
    if (!el) return;
    opts = opts || {};
    var count = opts.count || (variant === 'chart' ? 1 : 4);
    var renderer = SKELETON_VARIANTS[variant] || SKELETON_VARIANTS.list;
    el.innerHTML = renderer(count);
  }

  // ─── Enriched toast ──────────────────────────────────────────
  //
  //   showToast('Saved', { type: 'ok', icon: '✓' });
  //   showToast('Archived', { type: 'ok', action: { label: 'Undo', onClick: handleUndo } });
  //   showToast('Error', { type: 'err', persist: true });
  var _toastTimer = null;
  function showToast(msg, opts) {
    var t = document.getElementById('toast');
    if (!t) return;
    // Support legacy signature: showToast(msg, 'ok' | 'err')
    if (typeof opts === 'string') opts = { type: opts };
    opts = opts || {};
    var type = opts.type || 'ok';
    var durationMs = opts.persist ? 0 : (opts.durationMs || 3500);
    var iconHtml = opts.icon ? '<span class="c-toast-icon">' + _esc(opts.icon) + '</span>' : '';
    var msgHtml = '<span class="c-toast-msg">' + _esc(msg) + '</span>';
    var actionHtml = '';
    if (opts.action && typeof opts.action.onClick === 'function') {
      var actId = 'c-toast-act-' + Math.random().toString(36).slice(2, 8);
      actionHtml = '<button id="' + actId + '" class="c-toast-action">' + _esc(opts.action.label || 'Undo') + '</button>';
    }
    var closeHtml = opts.persist ? '<button class="c-toast-close" onclick="document.getElementById(\'toast\').classList.remove(\'show\')">×</button>' : '';
    t.innerHTML = iconHtml + msgHtml + actionHtml + closeHtml;
    t.className = 'toast ' + type + ' show';
    if (opts.action) {
      setTimeout(function() {
        var btn = document.getElementById(actId);
        if (btn) btn.addEventListener('click', function(e) {
          opts.action.onClick(e);
          t.classList.remove('show');
        });
      }, 0);
    }
    if (_toastTimer) clearTimeout(_toastTimer);
    if (durationMs > 0) {
      _toastTimer = setTimeout(function() { t.classList.remove('show'); }, durationMs);
    }
  }

  // ─── Progress bar (determinate or indeterminate) ─────────────
  //
  //   showProgress('#loader', { label: 'Querying Databricks…', indeterminate: true });
  //   showProgress('#loader', { label: 'Syncing', percent: 45 });
  function showProgress(container, opts) {
    var el = _el(container);
    if (!el) return;
    opts = opts || {};
    var classes = 'c-progress' + (opts.indeterminate ? ' c-progress-indeterminate' : '');
    var fillStyle = opts.indeterminate ? '' : 'width:' + Math.min(100, Math.max(0, opts.percent || 0)) + '%';
    el.innerHTML =
      (opts.label ? '<div class="c-flex-between" style="margin-bottom:6px"><span style="font-size:var(--f-sm);color:var(--tx3);font-weight:600">' + _esc(opts.label) + '</span>' +
        (opts.percent != null && !opts.indeterminate ? '<span style="font-size:var(--f-xs);color:var(--tx3)">' + Math.round(opts.percent) + '%</span>' : '') +
       '</div>' : '') +
      '<div class="' + classes + '"><div class="c-progress-fill" style="' + fillStyle + '"></div></div>';
  }

  // ─── Copy to clipboard (with toast confirmation) ─────────────
  function copyToClipboard(text, msg) {
    if (!navigator.clipboard) {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      showToast(msg || 'Copied', { type: 'ok', icon: '✓' });
      return;
    }
    navigator.clipboard.writeText(text).then(function() {
      showToast(msg || 'Copied', { type: 'ok', icon: '✓' });
    }).catch(function() {
      showToast('Copy failed', { type: 'err' });
    });
  }

  // ─── Relative time ───────────────────────────────────────────
  function formatRelativeTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 0) diff = -diff;
    if (diff < 60 * 1000) return 'just now';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + 'd ago';
    return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  }

  // ─── Keyboard help ───────────────────────────────────────────
  // Opens the existing #kbModal (keyboard shortcuts help) from any tab.
  function openKeyboardHelp() {
    var m = document.getElementById('kbModal');
    if (!m) return;
    // The existing .modal-bg system uses .show to toggle
    m.classList.add('show');
  }

  // ─── Topbar integrations status (aggregate green-dot summary) ─
  var _integrationsPoll = null;
  function startTopIntegrationsIndicator() {
    var el = document.getElementById('topIntegrations');
    if (!el) return;
    function render(health) {
      if (!health) {
        el.innerHTML = '<span class="ti-dot" style="background:var(--tx3)"></span><span class="ti-count">—</span>';
        return;
      }
      var parts = [
        { k: 'jira',       ok: health.jira && health.jira.state === 'healthy',      lbl: 'Jira' },
        { k: 'confluence', ok: health.confluence && health.confluence.configured,    lbl: 'Confluence' },
        { k: 'slack',      ok: health.slack && health.slack.configured,              lbl: 'Slack' },
        { k: 'outlook',    ok: health.outlook && health.outlook.configured,          lbl: 'Outlook' },
        { k: 'calendar',   ok: health.calendar && health.calendar.configured,        lbl: 'Calendar' }
      ];
      var okCount = parts.filter(function(p){ return p.ok; }).length;
      var total = parts.length;
      var colour = okCount === total ? 'var(--gn)' : okCount >= total - 1 ? 'var(--or)' : 'var(--rd)';
      var tip = parts.map(function(p){ return (p.ok ? '✓' : '×') + ' ' + p.lbl; }).join(' · ');
      el.innerHTML = '<span class="ti-dot" style="background:' + colour + '"></span><span class="ti-count">' + okCount + '/' + total + '</span>';
      el.title = tip;
      el.onclick = function() {
        if (typeof switchModule === 'function') switchModule('projects');
      };
    }
    function poll() {
      fetch('/api/integrations/health').then(function(r){ return r.ok ? r.json() : null; })
        .then(render).catch(function(){ render(null); });
    }
    poll();
    if (_integrationsPoll) clearInterval(_integrationsPoll);
    _integrationsPoll = setInterval(poll, 60000);
  }

  // ─── Auto-collapse sidebar on narrow viewports ───────────────
  // Call once on boot; listens to resize.
  var _narrowMq = null;
  function autoCollapseSidebarBelow(width) {
    if (_narrowMq) return; // already wired
    width = width || 1024;
    var app = document.getElementById('app');
    if (!app) return;
    var mq = window.matchMedia('(max-width: ' + width + 'px)');
    var apply = function() {
      if (mq.matches) app.classList.add('mobile-collapsed');
      else app.classList.remove('mobile-collapsed');
    };
    mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
    apply();
    _narrowMq = mq;
  }

  // Expose
  global.showEmptyState = showEmptyState;
  global.showLoadingSkeleton = showLoadingSkeleton;
  global.hideSkeleton = function(c) { var el = _el(c); if (el) el.innerHTML = ''; };
  global.showToast = showToast;
  global.showProgress = showProgress;
  global.copyToClipboard = copyToClipboard;
  global.formatRelativeTime = formatRelativeTime;
  global.openKeyboardHelp = openKeyboardHelp;
  global.autoCollapseSidebarBelow = autoCollapseSidebarBelow;
  global.startTopIntegrationsIndicator = startTopIntegrationsIndicator;

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      startTopIntegrationsIndicator();
      autoCollapseSidebarBelow(1024);
    });
  } else {
    setTimeout(function() {
      startTopIntegrationsIndicator();
      autoCollapseSidebarBelow(1024);
    }, 0);
  }
})(window);
