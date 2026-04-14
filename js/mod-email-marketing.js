// ===============================================================
// EMAIL MARKETING TAB — SFMC Email Browser & Preview
// ===============================================================

if (!state.emFilter) state.emFilter = 'all';
if (!state.emSearch) state.emSearch = '';
if (!state.emSort) state.emSort = 'modified';
if (!state.emPreview) state.emPreview = null;

function _emEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _emTimeAgo(d) { if(!d)return''; var diff=Date.now()-new Date(d).getTime(); var m=Math.floor(diff/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.floor(m/60); if(h<24)return h+'h ago'; var dy=Math.floor(h/24); if(dy<7)return dy+'d ago'; if(dy<30)return Math.floor(dy/7)+'w ago'; return new Date(d).toLocaleDateString(); }

function loadEmailMarketingData() {
  DATA.emLoading = true;
  renderAll();
  fetch('/api/email-marketing').then(function(r){return r.json();}).then(function(d) {
    DATA.emailMarketing = d;
    DATA.emLoading = false;
    renderAll();
  }).catch(function(e) { DATA.emLoading = false; DATA.emError = e.message; renderAll(); });
}

function loadEmailPreview(id) {
  state.emPreview = { loading: true, id: id };
  renderAll();
  fetch('/api/email-marketing/preview/' + id).then(function(r){return r.json();}).then(function(d) {
    if (d.error) { state.emPreview = { error: d.error }; }
    else { state.emPreview = d; }
    renderAll();
  }).catch(function(e) { state.emPreview = { error: e.message }; renderAll(); });
}

function _emGetEmails() {
  if (!DATA.emailMarketing || !DATA.emailMarketing.emails) return [];
  var emails = DATA.emailMarketing.emails.slice();
  if (state.emFilter && state.emFilter !== 'all') {
    emails = emails.filter(function(e) { return (e.category || 'Uncategorised') === state.emFilter; });
  }
  if (state.emSearch) {
    var q = state.emSearch.toLowerCase();
    emails = emails.filter(function(e) {
      return (e.name||'').toLowerCase().includes(q) || (e.category||'').toLowerCase().includes(q) || (e.description||'').toLowerCase().includes(q);
    });
  }
  if (state.emSort === 'modified') emails.sort(function(a,b){return new Date(b.modifiedDate)-new Date(a.modifiedDate);});
  else if (state.emSort === 'created') emails.sort(function(a,b){return new Date(b.createdDate)-new Date(a.createdDate);});
  else if (state.emSort === 'name') emails.sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});
  return emails;
}

// ── Sidebar ────────────────────────────────────────────────
function renderEmailMarketingSidebar() {
  var sb = $('sidebar');
  var emails = DATA.emailMarketing ? DATA.emailMarketing.emails || [] : [];

  // Category counts
  var catMap = {};
  emails.forEach(function(e) { var c = e.category || 'Uncategorised'; catMap[c] = (catMap[c]||0)+1; });
  var cats = Object.entries(catMap).sort(function(a,b){return b[1]-a[1];});

  var html = '<div class="ca-sb">';

  // Stats
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">Email Templates</div><div class="ca-sb-date-val" style="font-size:var(--f-2xl);font-weight:var(--fw-b)">' + emails.length + '</div></div>';

  // Refresh
  html += '<button class="ca-sb-refresh" onclick="DATA.emailMarketing=null;loadEmailMarketingData()">' +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Refresh</button>';

  // Search
  html += '<div style="padding:var(--sp2) var(--sp3)"><input class="filter-input" placeholder="Search emails..." value="' + _emEnc(state.emSearch) + '" oninput="state.emSearch=this.value;renderAll()" style="width:100%"/></div>';

  // Sort
  html += '<div class="ca-sb-date"><div class="ca-sb-date-label">Sort by</div>' +
    '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
    '<button class="btn btn-sm' + (state.emSort==='modified'?' btn-s" style="background:var(--ac);color:#fff"':'" style=""') + ' onclick="state.emSort=\'modified\';renderAll()">Modified</button>' +
    '<button class="btn btn-sm' + (state.emSort==='created'?' btn-s" style="background:var(--ac);color:#fff"':'" style=""') + ' onclick="state.emSort=\'created\';renderAll()">Created</button>' +
    '<button class="btn btn-sm' + (state.emSort==='name'?' btn-s" style="background:var(--ac);color:#fff"':'" style=""') + ' onclick="state.emSort=\'name\';renderAll()">Name</button>' +
    '</div></div>';

  // Categories
  html += '<div class="ca-sb-nav">';
  html += '<div class="ca-sb-nav-item' + (state.emFilter==='all'?' active':'') + '" onclick="state.emFilter=\'all\';renderAll()">' +
    '<span>All Emails</span><span class="nb">' + emails.length + '</span></div>';
  cats.forEach(function(c) {
    var catId = c[0];
    var safe = catId.replace(/'/g, "\\'");
    html += '<div class="ca-sb-nav-item' + (state.emFilter===catId?' active':'') + '" onclick="state.emFilter=\'' + safe + '\';renderAll()">' +
      '<span>' + _emEnc(catId) + '</span><span class="nb">' + c[1] + '</span></div>';
  });
  html += '</div>';

  html += '</div>';
  sb.innerHTML = html;
}

// ── Main ───────────────────────────────────────────────────
function renderEmailMarketingMain() {
  var el = $('main');

  if (DATA.emLoading || (!DATA.emailMarketing && !DATA.emError)) {
    el.innerHTML = '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading email templates from SFMC...</p></div>';
    return;
  }
  if (DATA.emError) {
    el.innerHTML = '<div class="ca-loading"><p style="color:var(--rd)">Failed: ' + _emEnc(DATA.emError) + '</p><button class="btn btn-sm" onclick="DATA.emError=null;loadEmailMarketingData()" style="margin-top:12px">Retry</button></div>';
    return;
  }
  if (!DATA.emailMarketing || !DATA.emailMarketing.emails || !DATA.emailMarketing.emails.length) {
    el.innerHTML = '<div class="ca-loading"><p>No email templates found in SFMC.</p></div>';
    return;
  }

  // Preview mode
  if (state.emPreview) {
    el.innerHTML = _emRenderPreview();
    return;
  }

  var emails = _emGetEmails();
  var html = '<div class="ca-main">';
  html += '<div class="ca-header"><h2>Email Templates</h2><span style="font-size:var(--f-xs);color:var(--tx3)">' + emails.length + ' emails</span></div>';

  if (!emails.length) {
    html += '<div style="text-align:center;padding:var(--sp8);color:var(--tx3)">No emails match your search.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--sp3)">';
    emails.forEach(function(em) {
      // Parse market from name (e.g., "BIEDM - beanz - AU - ..." → AU)
      var marketMatch = (em.name || '').match(/- (AU|UK|US|DE|NL|Global) -/i);
      var market = marketMatch ? marketMatch[1].toUpperCase() : '';
      var marketColor = market === 'AU' ? '#22c55e' : market === 'UK' ? '#3b82f6' : market === 'US' ? '#f59e0b' : market === 'DE' ? '#ef4444' : market === 'NL' ? '#f97316' : 'var(--tx3)';

      // Parse email type from prefix
      var prefix = (em.name || '').split(' - ')[0] || '';

      html += '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;overflow:hidden;cursor:pointer;transition:all var(--dur-f)" ' +
        'onclick="loadEmailPreview(' + em.id + ')" ' +
        'onmouseenter="this.style.borderColor=\'var(--ac)\';this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'var(--elev2)\'" ' +
        'onmouseleave="this.style.borderColor=\'var(--bd)\';this.style.transform=\'none\';this.style.boxShadow=\'none\'">';

      // Color bar at top based on market
      if (market) html += '<div style="height:3px;background:' + marketColor + '"></div>';

      html += '<div style="padding:var(--sp3)">';

      // Header row: name + market badge
      html += '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:var(--f-md);font-weight:var(--fw-sb);color:var(--tx);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical" title="' + _emEnc(em.name) + '">' + _emEnc(em.name) + '</div>' +
        '</div>';
      if (market) html += '<span style="flex-shrink:0;font-size:9px;padding:2px 8px;border-radius:6px;background:' + marketColor + '18;color:' + marketColor + ';font-weight:700;letter-spacing:.5px">' + market + '</span>';
      html += '</div>';

      // Badges row
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">';
      if (prefix && prefix !== em.name) html += '<span style="font-size:9px;padding:2px 8px;border-radius:6px;background:var(--s3);color:var(--tx2)">' + _emEnc(prefix) + '</span>';
      if (em.type) html += '<span style="font-size:9px;padding:2px 8px;border-radius:6px;background:var(--acbg);color:var(--ac)">' + _emEnc(em.type) + '</span>';
      if (em.status) {
        var sc = em.status.toLowerCase() === 'active' ? 'var(--gn)' : em.status.toLowerCase() === 'draft' ? 'var(--or)' : 'var(--tx3)';
        html += '<span style="font-size:9px;padding:2px 8px;border-radius:6px;background:' + sc + '18;color:' + sc + '">' + _emEnc(em.status) + '</span>';
      }
      html += '</div>';

      // Category
      if (em.category) html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:4px">' + _emEnc(em.category) + '</div>';

      // Details card
      html += '<div style="background:var(--s2);border-radius:6px;padding:8px 10px;font-size:var(--f-xs);margin-top:6px">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">';
      html += '<div><span style="color:var(--tx3)">Created</span><div style="color:var(--tx2)">' + (em.createdDate ? new Date(em.createdDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A') + '</div></div>';
      html += '<div><span style="color:var(--tx3)">Modified</span><div style="color:var(--tx2)">' + (em.modifiedDate ? new Date(em.modifiedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A') + '</div></div>';
      html += '</div>';
      html += '<div style="margin-top:4px;font-size:9px;color:var(--tx3)">Last updated ' + _emTimeAgo(em.modifiedDate) + '</div>';
      html += '</div>';

      // Click hint
      html += '<div style="margin-top:8px;font-size:9px;color:var(--ac);text-align:center">Click to preview</div>';

      html += '</div></div>';
    });
    html += '</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── Preview ────────────────────────────────────────────────
function _emRenderPreview() {
  var p = state.emPreview;
  if (p.loading) return '<div class="ca-loading"><div class="ca-spinner"></div><p>Loading email preview...</p></div>';
  if (p.error) return '<div class="ca-loading"><p style="color:var(--rd)">' + _emEnc(p.error) + '</p><button class="btn btn-sm" onclick="state.emPreview=null;renderAll()" style="margin-top:12px">Back</button></div>';

  var html = '<div style="display:flex;flex-direction:column;height:100%;padding:var(--sp3)">';

  // Top bar
  html += '<div style="display:flex;align-items:center;gap:var(--sp3);margin-bottom:var(--sp3);flex-shrink:0">' +
    '<button class="btn btn-g" onclick="state.emPreview=null;renderAll()" style="display:flex;align-items:center;gap:4px">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:var(--f-lg);font-weight:var(--fw-sb);color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _emEnc(p.name || '') + '</div>' +
      (p.subject ? '<div style="font-size:var(--f-xs);color:var(--tx2)">Subject: ' + _emEnc(p.subject) + '</div>' : '') +
    '</div>' +
    '<div style="font-size:var(--f-xs);color:var(--tx3);text-align:right">' +
      (p.modifiedDate ? 'Modified: ' + _emTimeAgo(p.modifiedDate) : '') +
    '</div>' +
  '</div>';

  // Preheader
  if (p.preheader) {
    html += '<div style="font-size:var(--f-xs);color:var(--tx3);margin-bottom:var(--sp2);padding:var(--sp2) var(--sp3);background:var(--s2);border-radius:6px">Preheader: ' + _emEnc(p.preheader) + '</div>';
  }

  // HTML preview
  if (p.html) {
    // Use a blob URL to avoid srcdoc encoding issues
    html += '<div id="em-preview-container" style="flex:1;border:1px solid var(--bd);border-radius:8px;overflow:hidden;background:#fff;min-height:400px"></div>';
  } else {
    html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;border:1px solid var(--bd);border-radius:8px;color:var(--tx3)">No HTML preview available</div>';
  }

  html += '</div>';

  // After render, inject iframe with blob URL
  if (p.html) {
    setTimeout(function() {
      var container = document.getElementById('em-preview-container');
      if (!container) return;
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none';
      iframe.sandbox = 'allow-same-origin';
      container.appendChild(iframe);
      // Write HTML directly to iframe document
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(p.html);
      doc.close();
    }, 50);
  }

  return html;
}
