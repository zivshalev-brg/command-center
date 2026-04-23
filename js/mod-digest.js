// ===============================================================
// DAILY DIGEST TAB — AI-powered intelligence briefing
// ===============================================================

// ── State defaults ───────────────────────────────────────────
if (!state.digestType) state.digestType = 'auto';
if (!state.digestData) state.digestData = null;
if (!state.digestLoading) state.digestLoading = false;
if (!state.digestHistory) state.digestHistory = [];
if (!state.digestError) state.digestError = null;
if (!state.digestSelectedId) state.digestSelectedId = null;

function _dgEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _dgTimeAgo(d) { var diff=Date.now()-new Date(d).getTime(); var m=Math.floor(diff/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; var dy=Math.floor(h/24); if(dy<7)return dy+'d ago'; return new Date(d).toLocaleDateString(); }
function _dgFmt(n) { if (n === null || n === undefined) return '—'; if (typeof n === 'string') return n; return n >= 1000000 ? '$' + (n/1000000).toFixed(2) + 'M' : n >= 1000 ? '$' + (n/1000).toFixed(1) + 'K' : '' + n; }

// ── Data loading ─────────────────────────────────────────────
function loadDigestHistory() {
  fetch('/api/daily-digest/history').then(function(r) { return r.json(); }).then(function(d) {
    state.digestHistory = d.digests || [];
    renderAll();
  }).catch(function() {});
}

function loadLatestDigest() {
  var typeParam = state.digestType !== 'auto' ? '?type=' + state.digestType : '';
  fetch('/api/daily-digest' + typeParam).then(function(r) {
    if (!r.ok) return null;
    return r.json();
  }).then(function(d) {
    if (d && d.content) {
      state.digestData = d;
      state.digestError = null;
    }
    renderAll();
  }).catch(function() {});
}

function loadDigestById(id) {
  fetch('/api/daily-digest/' + encodeURIComponent(id)).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.content) {
      state.digestData = d;
      state.digestSelectedId = id;
      state.digestError = null;
    }
    renderAll();
  }).catch(function() {});
}

function generateDigest(type) {
  state.digestLoading = true;
  state.digestError = null;
  renderAll();

  fetch('/api/daily-digest/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type || state.digestType })
  }).then(function(r) { return r.json(); }).then(function(d) {
    state.digestLoading = false;
    if (d.ok && d.content) {
      state.digestData = d;
      state.digestError = null;
      loadDigestHistory();
      if (typeof showToast === 'function') showToast('Digest generated successfully');
    } else {
      state.digestError = d.error || 'Generation failed';
    }
    renderAll();
  }).catch(function(e) {
    state.digestLoading = false;
    state.digestError = e.message || 'Network error';
    renderAll();
  });
}

function deleteDigest(id) {
  fetch('/api/daily-digest/' + encodeURIComponent(id), { method: 'DELETE' }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      if (state.digestData && state.digestData.id === id) {
        state.digestData = null;
      }
      loadDigestHistory();
      if (typeof showToast === 'function') showToast('Digest deleted');
    }
  }).catch(function() {});
}

// ── Sidebar ──────────────────────────────────────────────────
function renderDigestSidebar() {
  var sb = $('sidebar');
  var types = [
    { id: 'auto', label: 'Auto-detect' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' }
  ];

  var typeHtml = types.map(function(t) {
    var isActive = state.digestType === t.id;
    return '<div class="ca-sb-nav-item' + (isActive ? ' active' : '') + '"' +
      ' onclick="state.digestType=\'' + t.id + '\';renderAll()">' +
      '<span>' + t.label + '</span>' +
    '</div>';
  }).join('');

  // Generate button
  var generateBtn = '<button class="ca-sb-refresh" style="background:var(--acbg);border-color:var(--ac);color:var(--ac);font-weight:600" onclick="generateDigest()"' +
    (state.digestLoading ? ' disabled style="opacity:0.5;cursor:wait;background:var(--acbg);border-color:var(--ac);color:var(--ac);font-weight:600"' : '') + '>' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    (state.digestLoading ? ' Generating...' : ' Generate Now') +
  '</button>';

  // Source status indicators
  var sourceHtml = '';
  if (state.digestData && state.digestData.source_status) {
    var ss = state.digestData.source_status;
    var sourceNames = ['comms', 'email', 'calendar', 'news', 'jira', 'extraction'];
    var sourceLabels = { comms: 'Slack', email: 'Outlook', calendar: 'Calendar', news: 'News', jira: 'Jira', extraction: 'BeanzGenie' };
    sourceHtml = '<div class="ca-sb-segment"><div class="ca-sb-segment-title">Source Status</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">' +
      sourceNames.map(function(s) {
        var status = ss[s] || 'unknown';
        var color = status === 'ok' ? 'var(--gn)' : status === 'empty' ? 'var(--or)' : status === 'unavailable' ? 'var(--tx3)' : 'var(--rd)';
        return '<div style="display:flex;align-items:center;gap:6px;font-size:var(--f-sm)">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
          '<span style="color:var(--tx2)">' + (sourceLabels[s] || s) + '</span>' +
          '<span style="color:var(--tx3);font-size:var(--f-xs);margin-left:auto">' + status + '</span>' +
        '</div>';
      }).join('') +
      '</div></div>';
  }

  // Last generated
  var lastGenHtml = '';
  if (state.digestData && state.digestData.generated_at) {
    lastGenHtml = '<div class="ca-sb-date">' +
      '<div class="ca-sb-date-label">Last Generated</div>' +
      '<div class="ca-sb-date-ago">' + _dgTimeAgo(state.digestData.generated_at) + '</div>' +
      '<div style="font-size:var(--f-xs);color:var(--tx3);margin-top:2px">' + (state.digestData.type || 'daily') + ' digest</div>' +
    '</div>';
  }

  // History list
  var historyHtml = '';
  if (state.digestHistory.length > 0) {
    historyHtml = '<div class="ca-sb-segment"><div class="ca-sb-segment-title">History</div>' +
      state.digestHistory.slice(0, 15).map(function(h) {
        var isSelected = state.digestData && state.digestData.id === h.id;
        var typeBadge = h.type === 'weekly' ? '<span class="nb" style="background:var(--pubg);color:var(--pu);font-size:9px;padding:1px 5px;border-radius:3px">W</span>' :
          h.type === 'monthly' ? '<span class="nb" style="background:var(--orbg);color:var(--or);font-size:9px;padding:1px 5px;border-radius:3px">M</span>' :
          '<span class="nb" style="background:var(--acbg);color:var(--ac);font-size:9px;padding:1px 5px;border-radius:3px">D</span>';
        return '<div class="ca-sb-nav-item' + (isSelected ? ' active' : '') + '" onclick="loadDigestById(\'' + _dgEnc(h.id) + '\')" style="padding:6px 8px">' +
          typeBadge +
          '<span style="font-size:var(--f-sm)">' + (h.date || '') + '</span>' +
          '<span style="font-size:var(--f-xs);color:var(--tx3);margin-left:auto">' + (h.sections_count || 0) + 's</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  sb.innerHTML = '<div class="ca-sb">' +
    lastGenHtml +
    generateBtn +
    '<div class="ca-sb-segment"><div class="ca-sb-segment-title">Digest Type</div>' +
      '<div class="ca-sb-nav">' + typeHtml + '</div>' +
    '</div>' +
    sourceHtml +
    historyHtml +
  '</div>';
}

// ── Main Content ─────────────────────────────────────────────
function renderDigestMain() {
  var el = $('main');

  // Loading state
  if (state.digestLoading) {
    el.innerHTML = '<div style="padding:var(--sp4)">'
      + '<div class="c-flex-between" style="margin-bottom:var(--sp3)"><span style="font-size:var(--f-sm);color:var(--tx3);font-weight:var(--fw-sb)">Generating digest\u2026</span><span style="font-size:var(--f-xs);color:var(--tx3)">Scanning Outlook, Slack, Jira, News, BeanzGenie</span></div>'
      + '<div class="c-progress c-progress-indeterminate"><div class="c-progress-fill"></div></div>'
      + '<div class="c-stack" style="margin-top:var(--sp4)">'
      +   '<div class="c-skel c-skel-title" style="width:40%"></div>'
      +   '<div class="c-skel c-skel-line" style="width:95%"></div>'
      +   '<div class="c-skel c-skel-line" style="width:88%"></div>'
      +   '<div class="c-skel c-skel-line" style="width:72%"></div>'
      +   '<div class="c-skel c-skel-line" style="width:85%"></div>'
      + '</div></div>';
    return;
  }

  // Error state
  if (state.digestError) {
    el.innerHTML = '<div class="ca-main" style="padding:var(--sp4)"><div class="c-empty c-card-danger" style="align-items:flex-start;text-align:left">'
      + '<div class="c-empty-icon">\u26A0</div>'
      + '<div class="c-empty-title" style="color:var(--rd)">Digest generation failed</div>'
      + '<div class="c-empty-body">' + _dgEnc(state.digestError) + '</div>'
      + '<button class="c-btn c-btn-primary c-empty-action" onclick="generateDigest()">Retry</button>'
      + '</div></div>';
    return;
  }

  // No digest — welcome state
  if (!state.digestData || !state.digestData.content) {
    el.innerHTML = '<div class="ca-main">' +
      '<div style="text-align:center;padding:var(--sp10) var(--sp6);max-width:600px;margin:0 auto">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="1.5" style="margin-bottom:var(--sp4)">' +
          '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
          '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>' +
        '</svg>' +
        '<h2 style="font-size:var(--f-2xl);margin-bottom:var(--sp3)">Daily Digest</h2>' +
        '<p style="color:var(--tx2);margin-bottom:var(--sp6);line-height:1.6">' +
          'Your AI-powered intelligence briefing. Scans Outlook, Slack, Jira, and internal data to produce ' +
          'a structured digest with 8 sections: Executive Summary, Platform Performance, Project Progress, ' +
          'Inbox Highlights, Slack Activity, Risks & Blockers, Decisions Needed, and Forward Look.' +
        '</p>' +
        '<p style="color:var(--tx3);margin-bottom:var(--sp5);font-size:var(--f-sm)">' +
          'Time horizon auto-detects: Daily (most days), Weekly (Mondays), Monthly (1st of month).' +
        '</p>' +
        '<button class="btn btn-sm" style="background:var(--ac);color:#fff;padding:10px 28px;font-size:var(--f-lg);border-radius:8px;border:none;cursor:pointer" onclick="generateDigest()">' +
          'Generate Your First Digest' +
        '</button>' +
      '</div>' +
    '</div>';
    return;
  }

  // Render digest
  var d = state.digestData;
  var c = d.content;
  var html = '<div class="ca-main">';

  // Header
  var typeLabel = (d.type || 'daily').charAt(0).toUpperCase() + (d.type || 'daily').slice(1);
  html += '<div class="ca-header">' +
    '<h2>Beanz ' + typeLabel + ' Digest</h2>' +
    '<div style="display:flex;gap:var(--sp2);align-items:center">' +
      '<span style="font-size:var(--f-sm);color:var(--tx3)">' + (d.dateRange || d.date || '') + '</span>' +
      '<button class="btn btn-sm" onclick="generateDigest()" title="Regenerate">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
      '</button>' +
    '</div>' +
  '</div>';

  // 1. Executive Summary
  html += _dgSection('Executive Summary', _dgRenderExecSummary(c.executiveSummary), 'dg-exec');

  // 2. Platform Performance
  html += _dgSection('Platform Performance', _dgRenderPerformance(c.platformPerformance), 'dg-perf');

  // 3. Project Progress
  html += _dgSection('Project Progress', _dgRenderProjects(c.projectProgress), 'dg-proj');

  // 4. Inbox Highlights
  html += _dgSection('Inbox Highlights', _dgRenderInbox(c.inboxHighlights), 'dg-inbox');

  // 5. Slack Activity
  html += _dgSection('Slack Activity', _dgRenderSlack(c.slackActivity), 'dg-slack');

  // 6. Risks & Blockers
  html += _dgSection('Risks & Blockers', _dgRenderRisks(c.risksBlockers), 'dg-risks');

  // 7. Decisions Needed
  html += _dgSection('Decisions Needed', _dgRenderDecisions(c.decisionsNeeded), 'dg-dec');

  // 8. Forward Look
  html += _dgSection('Forward Look', _dgRenderForward(c.forwardLook), 'dg-fwd');

  html += '</div>';
  el.innerHTML = html;
}

// ── Section wrapper ──────────────────────────────────────────
function _dgSection(title, content, cls) {
  return '<div class="dg-section ' + (cls || '') + '">' +
    '<h3 class="dg-section-title">' + _dgEnc(title) + '</h3>' +
    content +
  '</div>';
}

// ── Section renderers ────────────────────────────────────────

function _dgRenderExecSummary(summary) {
  if (!summary) return '<p style="color:var(--tx3)">No executive summary available.</p>';
  return '<div class="dg-exec-block">' + _dgEnc(summary) + '</div>';
}

function _dgRenderPerformance(perf) {
  if (!perf) return '<p style="color:var(--tx3)">No performance data available.</p>';
  var html = '';

  // Revenue & Bags table
  if (perf.revenue || perf.bags) {
    html += '<div style="overflow-x:auto;margin-bottom:var(--sp3)"><table class="mt-data-table" style="width:100%"><thead><tr>' +
      '<th>Metric</th><th>Yesterday</th><th>YoY</th><th>MTD</th><th>Last Month</th><th>YoY</th></tr></thead><tbody>';
    if (perf.revenue) {
      var r = perf.revenue;
      html += '<tr><td style="font-weight:var(--fw-sb)">Revenue (AUD)</td>' +
        '<td>' + _dgFmt(r.yesterday?.value, '$') + '</td>' +
        '<td class="' + _dgDeltaClass(r.yesterday?.yoyPct) + '">' + _dgEnc(r.yesterday?.yoy || '') + '</td>' +
        '<td>' + _dgFmt(r.mtd?.value, '$') + '</td>' +
        '<td>' + _dgFmt(r.lastMonth?.value, '$') + '</td>' +
        '<td class="' + _dgDeltaClass(r.lastMonth?.yoyPct) + '">' + _dgEnc(r.lastMonth?.yoy || '') + '</td></tr>';
    }
    if (perf.bags) {
      var b = perf.bags;
      html += '<tr><td style="font-weight:var(--fw-sb)">Bags Shipped</td>' +
        '<td>' + _dgFmt(b.yesterday?.value, '#') + '</td>' +
        '<td class="' + _dgDeltaClass(b.yesterday?.yoyPct) + '">' + _dgEnc(b.yesterday?.yoy || '') + '</td>' +
        '<td>' + _dgFmt(b.mtd?.value, '#') + '</td>' +
        '<td>' + _dgFmt(b.lastMonth?.value, '#') + '</td>' +
        '<td class="' + _dgDeltaClass(b.lastMonth?.yoyPct) + '">' + _dgEnc(b.lastMonth?.yoy || '') + '</td></tr>';
    }
    html += '</tbody></table></div>';
  }

  // Subscriptions table
  if (perf.subscriptions) {
    var s = perf.subscriptions;
    html += '<div style="display:flex;gap:var(--sp3);flex-wrap:wrap;margin-bottom:var(--sp3)">';
    html += _dgStatCard('New Subs', s.new, 'var(--gn)');
    html += _dgStatCard('Cancellations', s.cancelled, 'var(--rd)');
    html += _dgStatCard('Net Change', s.net, s.net >= 0 ? 'var(--gn)' : 'var(--rd)');
    html += _dgStatCard('Active', s.active, 'var(--ac)');
    html += _dgStatCard('Paused', s.paused, 'var(--or)');
    html += _dgStatCard('Total (Active+Paused)', s.activeTotal, 'var(--tx)');
    html += '</div>';
  }

  // Fallback: old metrics array format
  var metrics = perf.metrics || [];
  if (metrics.length > 0 && !perf.revenue) {
    html += '<div class="dg-kpi-grid">';
    metrics.forEach(function(m) {
      var deltaClass = '';
      var deltaStr = m.delta || '';
      if (typeof deltaStr === 'string') {
        if (deltaStr.indexOf('+') === 0) deltaClass = 'dg-delta-up';
        else if (deltaStr.indexOf('-') === 0) deltaClass = 'dg-delta-down';
      }
      html += '<div class="dg-kpi-card">' +
        '<div class="dg-kpi-label">' + _dgEnc(m.name || '') + '</div>' +
        '<div class="dg-kpi-value">' + _dgEnc(String(m.value || '—')) + '</div>' +
        (deltaStr ? '<div class="dg-kpi-delta ' + deltaClass + '">' + _dgEnc(deltaStr) + '</div>' : '') +
      '</div>';
    });
    html += '</div>';
  }

  // Narrative
  if (perf.narrative) {
    html += '<div style="padding:var(--sp3);background:var(--s2);border-radius:var(--r2);border-left:3px solid var(--ac);margin-top:var(--sp2)">' +
      '<p style="color:var(--tx2);font-size:var(--f-sm);line-height:1.6;margin:0">' + _dgEnc(perf.narrative) + '</p></div>';
  }

  // Data quality notes
  if (perf.dataQualityNotes && perf.dataQualityNotes.length) {
    html += '<div style="margin-top:var(--sp2)">';
    perf.dataQualityNotes.forEach(function(n) {
      html += '<div style="font-size:11px;color:var(--or);padding:2px 0">&#9888; ' + _dgEnc(n) + '</div>';
    });
    html += '</div>';
  }

  return html || '<p style="color:var(--tx3)">No metrics data.</p>';
}

function _dgFmt(val, type) {
  if (val == null || val === undefined) return '—';
  if (type === '$') return '$' + (Math.abs(val) >= 1000000 ? (val/1000000).toFixed(2) + 'M' : Math.abs(val) >= 1000 ? (val/1000).toFixed(0) + 'K' : val.toLocaleString());
  return val >= 1000 ? (val/1000).toFixed(1) + 'K' : String(val);
}

function _dgStatCard(label, value, color) {
  return '<div style="flex:1;min-width:100px;padding:var(--sp2) var(--sp3);background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2);text-align:center">' +
    '<div style="font-size:var(--f-xl);font-weight:var(--fw-b);color:' + (color || 'var(--tx)') + '">' + (value != null ? String(value).toLocaleString() : '—') + '</div>' +
    '<div style="font-size:10px;color:var(--tx3);text-transform:uppercase">' + _dgEnc(label) + '</div></div>';
}

function _dgDeltaClass(pct) {
  if (pct == null) return '';
  return pct > 0 ? 'dg-delta-up' : pct < 0 ? 'dg-delta-down' : '';
}

function _dgRenderProjects(projects) {
  if (!projects || projects.length === 0) return '<p style="color:var(--tx3)">No project data available.</p>';
  return projects.map(function(p) {
    var st = (p.status || '').toLowerCase();
    var statusColor = st.indexOf('on track') >= 0 || st === 'complete' ? 'var(--gn)' : st.indexOf('critical') >= 0 || st === 'blocked' ? 'var(--rd)' : st.indexOf('some issues') >= 0 || st.indexOf('at risk') >= 0 || st.indexOf('at-risk') >= 0 ? 'var(--or)' : st === 'on hold' || st === 'on-hold' ? 'var(--tx3)' : 'var(--or)';
    var statusLabel = p.status || 'Unknown';
    var completion = typeof p.completion === 'number' ? p.completion : 0;

    var html = '<div class="dg-project-card">' +
      '<div class="dg-proj-header">' +
        '<strong>' + _dgEnc(p.name || 'Unknown') + '</strong>' +
        '<span class="dg-status-badge" style="background:' + statusColor + '20;color:' + statusColor + '">' + statusLabel + '</span>' +
      '</div>';

    // Progress bar
    html += '<div class="dg-progress-bar"><div class="dg-progress-fill" style="width:' + completion + '%;background:' + statusColor + '"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:var(--f-xs);color:var(--tx3);margin-top:2px">' +
        '<span>' + completion + '% complete' + (p.owner ? ' &middot; ' + _dgEnc(p.owner) : '') + '</span>' +
        (p.targetDate ? '<span>Target: ' + _dgEnc(p.targetDate) + '</span>' : (p.sprint ? '<span>' + _dgEnc(p.sprint) + '</span>' : '')) +
      '</div>';

    // Highlights
    if (p.highlights && p.highlights.length > 0) {
      html += '<div style="margin-top:var(--sp2)">';
      p.highlights.forEach(function(h) {
        html += '<div style="font-size:var(--f-sm);color:var(--tx2);padding:2px 0">&bull; ' + _dgEnc(h) + '</div>';
      });
      html += '</div>';
    }

    // Blockers
    if (p.blockers && p.blockers.length > 0) {
      html += '<div style="margin-top:var(--sp2)">';
      p.blockers.forEach(function(b) {
        html += '<div style="font-size:var(--f-sm);color:var(--rd);padding:2px 0">&times; ' + _dgEnc(b) + '</div>';
      });
      html += '</div>';
    }

    // Next steps
    if (p.nextSteps && p.nextSteps.length > 0) {
      html += '<div style="margin-top:var(--sp2)">';
      p.nextSteps.forEach(function(n) {
        html += '<div style="font-size:var(--f-sm);color:var(--ac);padding:2px 0">&#8594; ' + _dgEnc(n) + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }).join('');
}

function _dgRenderInbox(inbox) {
  if (!inbox) return '<p style="color:var(--tx3)">No inbox data available.</p>';
  var html = '';

  var groups = [
    { key: 'actionRequired', label: 'Action Required', color: 'var(--rd)', bgColor: 'var(--rdbg)' },
    { key: 'fyi', label: 'FYI', color: 'var(--or)', bgColor: 'var(--orbg)' },
    { key: 'informational', label: 'Informational', color: 'var(--tx3)', bgColor: 'var(--s3)' }
  ];

  groups.forEach(function(g) {
    var items = inbox[g.key] || [];
    if (items.length === 0) return;
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:' + g.color + ';margin-bottom:var(--sp2)">' + g.label + ' (' + items.length + ')</div>';
    items.forEach(function(item) {
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:' + g.bgColor + ';color:' + g.color + '">' + g.label.charAt(0) + '</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(item.subject || '') + '</div>' +
          '<div class="dg-inbox-meta">' + _dgEnc(item.from || '') + '</div>' +
          '<div class="dg-inbox-summary">' + _dgEnc(item.summary || '') + '</div>' +
          (item.action ? '<div style="font-size:var(--f-xs);color:var(--ac);margin-top:2px">Action: ' + _dgEnc(item.action) + '</div>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  });

  return html || '<p style="color:var(--tx3)">No emails in this period.</p>';
}

function _dgRenderSlack(slack) {
  if (!slack) return '<p style="color:var(--tx3)">No Slack data available.</p>';
  var html = '';

  // Key actions (new format)
  var keyActions = slack.keyActions || [];
  if (keyActions.length > 0) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--gn);margin-bottom:var(--sp2)">Key Actions (' + keyActions.length + ')</div>';
    keyActions.forEach(function(a) {
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:var(--gnbg);color:var(--gn)">A</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(a.action || '') + '</div>' +
          '<div class="dg-inbox-meta">' + _dgEnc(a.who || '') + (a.channel ? ' in ' + _dgEnc(a.channel) : '') + '</div>' +
        '</div></div>';
    });
    html += '</div>';
  }

  // Active threads (new format)
  var threads = slack.activeThreads || [];
  if (threads.length > 0) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--pu);margin-bottom:var(--sp2)">Active Threads (' + threads.length + ')</div>';
    threads.forEach(function(t) {
      var urgColor = t.urgency === 'high' ? 'var(--rd)' : t.urgency === 'medium' ? 'var(--or)' : 'var(--tx3)';
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:' + urgColor + '20;color:' + urgColor + '">' + (t.replies || '?') + '</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(t.topic || '') + '</div>' +
          '<div class="dg-inbox-meta">' + _dgEnc(t.channel || '') + '</div>' +
        '</div></div>';
    });
    html += '</div>';
  }

  // Team updates (new format)
  var teamUpdates = slack.teamUpdates || [];
  if (teamUpdates.length > 0) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--cy);margin-bottom:var(--sp2)">Team Updates</div>';
    teamUpdates.forEach(function(u) {
      html += '<div style="font-size:var(--f-sm);color:var(--tx2);padding:2px 0">&bull; ' + _dgEnc(u) + '</div>';
    });
    html += '</div>';
  }

  // Fallback: old decisions format
  var decisions = slack.decisions || [];
  if (decisions.length > 0 && !keyActions.length) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--gn);margin-bottom:var(--sp2)">Decisions Made (' + decisions.length + ')</div>';
    decisions.forEach(function(d) {
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:var(--gnbg);color:var(--gn)">D</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(d.decision || '') + '</div>' +
          '<div class="dg-inbox-meta">' + _dgEnc(d.channel || '') + ' &mdash; ' + _dgEnc(d.by || '') + '</div>' +
        '</div></div>';
    });
    html += '</div>';
  }

  // Discussions
  var discussions = slack.discussions || [];
  if (discussions.length > 0) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--pu);margin-bottom:var(--sp2)">Active Discussions (' + discussions.length + ')</div>';
    discussions.forEach(function(d) {
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:var(--pubg);color:var(--pu)">T</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(d.topic || '') + '</div>' +
          '<div class="dg-inbox-meta">' + _dgEnc(d.channel || '') + (d.replies ? ' &mdash; ' + d.replies + ' replies' : '') + '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  // Updates
  var updates = slack.updates || [];
  if (updates.length > 0) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--ac);margin-bottom:var(--sp2)">Project Updates (' + updates.length + ')</div>';
    updates.forEach(function(u) {
      html += '<div class="dg-inbox-item">' +
        '<span class="dg-inbox-badge" style="background:var(--acbg);color:var(--ac)">U</span>' +
        '<div class="dg-inbox-content">' +
          '<div class="dg-inbox-subject">' + _dgEnc(u.project || '') + '</div>' +
          '<div class="dg-inbox-summary">' + _dgEnc(u.summary || '') + '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  return html || '<p style="color:var(--tx3)">No Slack activity data.</p>';
}

function _dgRenderRisks(risks) {
  if (!risks || risks.length === 0) return '<p style="color:var(--tx3)">No risks or blockers identified.</p>';
  return risks.map(function(r) {
    var sevColor = r.severity === 'critical' ? 'var(--rd)' : r.severity === 'warning' ? 'var(--or)' : 'var(--cy)';
    var sevBg = r.severity === 'critical' ? 'var(--rdbg)' : r.severity === 'warning' ? 'var(--orbg)' : 'var(--cybg)';
    return '<div class="dg-risk-card" style="border-left-color:' + sevColor + '">' +
      '<div style="display:flex;align-items:center;gap:var(--sp2);margin-bottom:var(--sp1)">' +
        '<span style="font-size:var(--f-xs);font-weight:var(--fw-sb);padding:2px 6px;border-radius:3px;background:' + sevBg + ';color:' + sevColor + '">' + _dgEnc((r.severity || 'info').toUpperCase()) + '</span>' +
        (r.owner ? '<span style="font-size:var(--f-xs);color:var(--tx3)">' + _dgEnc(r.owner) + '</span>' : '') +
        (r.source ? '<span style="font-size:var(--f-xs);color:var(--tx3);margin-left:auto">' + _dgEnc(r.source) + '</span>' : '') +
      '</div>' +
      '<div style="font-size:var(--f-md);color:var(--tx);font-weight:var(--fw-m)">' + _dgEnc(r.risk || '') + '</div>' +
      (r.impact ? '<div style="font-size:var(--f-sm);color:var(--tx2);margin-top:var(--sp1)">Impact: ' + _dgEnc(r.impact) + '</div>' : '') +
    '</div>';
  }).join('');
}

function _dgRenderDecisions(decisions) {
  if (!decisions || decisions.length === 0) return '<p style="color:var(--tx3)">No decisions pending.</p>';
  return '<div class="dg-decision-list">' +
    decisions.map(function(d, i) {
      return '<div class="dg-decision-item">' +
        '<span class="dg-decision-num">' + (i + 1) + '</span>' +
        '<div class="dg-decision-content">' +
          '<div style="font-weight:var(--fw-m);color:var(--tx)">' + _dgEnc(d.decision || '') + '</div>' +
          (d.context ? '<div style="font-size:var(--f-sm);color:var(--tx2);margin-top:2px">' + _dgEnc(d.context) + '</div>' : '') +
          '<div style="display:flex;gap:var(--sp3);margin-top:var(--sp1);font-size:var(--f-xs);color:var(--tx3)">' +
            (d.deadline ? '<span>Deadline: ' + _dgEnc(d.deadline) + '</span>' : '') +
            (d.raisedBy ? '<span>From: ' + _dgEnc(d.raisedBy) + '</span>' : '') +
            (d.source ? '<span>Source: ' + _dgEnc(d.source) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _dgRenderForward(forward) {
  if (!forward) return '<p style="color:var(--tx3)">No forward look data.</p>';
  var html = '';

  // Today's calendar
  if (forward.todayCalendar && forward.todayCalendar.length) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--ac);margin-bottom:var(--sp2)">Today\'s Calendar</div>';
    forward.todayCalendar.forEach(function(ev) {
      html += '<div style="display:flex;gap:var(--sp2);padding:4px 0;font-size:var(--f-sm)">' +
        '<span style="color:var(--tx3);min-width:70px;font-variant-numeric:tabular-nums">' + _dgEnc(ev.time || '') + '</span>' +
        '<span style="color:var(--tx)">' + _dgEnc(ev.event || '') + '</span>' +
        (ev.with ? '<span style="color:var(--tx3)">(' + _dgEnc(ev.with) + ')</span>' : '') +
      '</div>';
    });
    html += '</div>';
  }

  // Priorities
  if (forward.priorities && forward.priorities.length) {
    html += '<div style="margin-bottom:var(--sp3)">' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--rd);margin-bottom:var(--sp2)">Priorities</div>';
    forward.priorities.forEach(function(p, i) {
      html += '<div style="display:flex;gap:var(--sp2);align-items:flex-start;padding:4px 0;font-size:var(--f-sm)">' +
        '<span style="background:var(--rd);color:#fff;min-width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600">' + (i+1) + '</span>' +
        '<span style="color:var(--tx)">' + _dgEnc(p) + '</span></div>';
    });
    html += '</div>';
  }

  // Upcoming
  if (forward.upcoming && forward.upcoming.length) {
    html += '<div>' +
      '<div style="font-size:var(--f-sm);font-weight:var(--fw-sb);color:var(--pu);margin-bottom:var(--sp2)">Upcoming</div>';
    forward.upcoming.forEach(function(u) {
      var item = typeof u === 'string' ? u : (u.what || '');
      var when = typeof u === 'object' ? (u.when || '') : '';
      var note = typeof u === 'object' ? (u.note || '') : '';
      html += '<div style="display:flex;gap:var(--sp2);padding:4px 0;font-size:var(--f-sm)">' +
        '<span class="dg-timeline-dot" style="background:var(--pu)"></span>' +
        '<span style="color:var(--tx)">' + _dgEnc(item) + '</span>' +
        (when ? '<span style="color:var(--tx3);font-size:11px">' + _dgEnc(when) + '</span>' : '') +
      '</div>';
      if (note) html += '<div style="margin-left:20px;font-size:11px;color:var(--tx3)">' + _dgEnc(note) + '</div>';
    });
    html += '</div>';
  }

  // Fallback: old format (today/thisWeek/thisMonth arrays)
  var fallbackSections = [
    { key: 'today', label: 'Today', color: 'var(--ac)' },
    { key: 'thisWeek', label: 'This Week', color: 'var(--pu)' },
    { key: 'thisMonth', label: 'This Month', color: 'var(--cy)' }
  ];
  fallbackSections.forEach(function(s) {
    var items = forward[s.key] || [];
    if (items.length === 0 || forward.todayCalendar) return; // skip if new format
    html += '<div class="dg-timeline-section">' +
      '<div class="dg-timeline-label" style="color:' + s.color + '">' + s.label + '</div>' +
      '<div class="dg-timeline-items">';
    items.forEach(function(item) {
      html += '<div class="dg-timeline-item"><span class="dg-timeline-dot" style="background:' + s.color + '"></span><span>' + _dgEnc(item) + '</span></div>';
    });
    html += '</div></div>';
  });

  return html || '<p style="color:var(--tx3)">No priorities listed.</p>';
}

// ── Init: load data on first visit ──────────────────────────
(function() {
  // Defer loading until tab is first visited
  var _digestInitDone = false;
  var _origRenderDigestMain = renderDigestMain;
  renderDigestMain = function() {
    if (!_digestInitDone) {
      _digestInitDone = true;
      loadLatestDigest();
      loadDigestHistory();
    }
    _origRenderDigestMain();
  };
})();
