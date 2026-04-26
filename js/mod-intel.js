// ===============================================================
// INTEL TAB — Coffee Intelligence Briefing Engine (CIBE)
// ===============================================================

// Intel tab state
if (!state.intelSection) state.intelSection = 'briefings';
if (!state.intelData) state.intelData = null;
if (!state.intelLoading) state.intelLoading = false;

async function loadIntelData() {
  if (state.intelLoading) return;
  state.intelLoading = true;
  try {
    const [overview, roasters, anomalies, briefings, priceAgg, scrapeStatus, correlations, trends] = await Promise.all([
      fetch('/api/cibe/overview').then(r => r.json()).catch(() => null),
      fetch('/api/cibe/roasters').then(r => r.json()).catch(() => ({ roasters: [] })),
      fetch('/api/cibe/internal/anomalies').then(r => r.json()).catch(() => ({ total: 0, anomalies: [] })),
      fetch('/api/cibe/briefings?limit=10').then(r => r.json()).catch(() => ({ briefings: [] })),
      fetch('/api/cibe/products?aggregate=true').then(r => r.json()).catch(() => null),
      fetch('/api/cibe/scrape/cibe-status').then(r => r.json()).catch(() => null),
      fetch('/api/cibe/correlations').then(r => r.json()).catch(() => ({ total: 0, correlations: [] })),
      fetch('/api/cibe/trends').then(r => r.json()).catch(() => ({ trends: [] }))
    ]);
    state.intelData = {
      overview, roasters: roasters.roasters || [], anomalies,
      briefings: briefings.briefings || [], priceAgg, scrapeStatus,
      correlations, trends: trends.trends || trends || []
    };
  } catch (e) {
    console.error('[Intel] Failed to load:', e);
    state.intelData = { overview: null, roasters: [], anomalies: { total: 0, anomalies: [] }, briefings: [], priceAgg: null, scrapeStatus: null, correlations: { total: 0, correlations: [] }, trends: [] };
  }
  state.intelLoading = false;
}

// ── Sidebar ────────────────────────────────────────────────
function renderIntelSidebar() {
  const sb = $('sidebar');
  const sections = [
    { id: 'briefings', icon: '&#9993;', label: 'Briefings' },
    { id: 'correlations', icon: '&#128279;', label: 'Correlations' },
    { id: 'market', icon: '&#9733;', label: 'Market' },
    { id: 'roasters', icon: '&#9749;', label: 'Roasters' },
    { id: 'anomalies', icon: '&#9888;', label: 'Anomalies' }
  ];

  const anomalyCount = state.intelData?.anomalies?.total || 0;
  const corrCritical = state.intelData?.correlations?.critical || 0;

  sb.innerHTML = `
    <div class="sb-section">
      <div class="sb-title">Intel Sections</div>
      ${sections.map(s => `
        <div class="sb-item${state.intelSection === s.id ? ' active' : ''}"
             onclick="state.intelSection='${s.id}';renderAll()">
          <span style="margin-right:6px">${s.icon}</span> ${s.label}
          ${s.id === 'anomalies' && anomalyCount > 0 ? `<span class="nb" style="margin-left:auto;background:var(--c-red)">${anomalyCount}</span>` : ''}
          ${s.id === 'correlations' && corrCritical > 0 ? `<span class="nb" style="margin-left:auto;background:var(--c-orange)">${corrCritical}</span>` : ''}
        </div>
      `).join('')}
    </div>
    <div class="sb-section" style="margin-top:16px">
      <div class="sb-title">Quick Stats</div>
      <div class="sb-meta" style="font-size:11px;opacity:.6">
        ${state.intelData?.overview ? `
          <div>${state.intelData.overview.roasters || 0} roasters monitored</div>
          <div>${state.intelData.overview.products || 0} products tracked</div>
          <div>${state.intelData.overview.briefings || 0} briefings generated</div>
        ` : '<div>Loading...</div>'}
      </div>
    </div>
  `;

  // Lazy load data on first render
  if (!state.intelData && !state.intelLoading) {
    loadIntelData().then(() => renderAll());
  }
}

// ── Main Content ───────────────────────────────────────────
function renderIntelMain() {
  const main = $('main');

  if (!state.intelData) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128640;</div><div class="empty-title">Loading Intelligence...</div></div>';
    return;
  }

  switch (state.intelSection) {
    case 'briefings': renderIntelBriefings(main); break;
    case 'correlations': renderIntelCorrelations(main); break;
    case 'market': renderIntelMarket(main); break;
    case 'roasters': renderIntelRoasters(main); break;
    case 'anomalies': renderIntelAnomalies(main); break;
    default: renderIntelBriefings(main);
  }
}

// ── Briefings View ─────────────────────────────────────────
function renderIntelBriefings(main) {
  const briefings = state.intelData.briefings || [];

  main.innerHTML = `
    <div class="main-header">
      <h2>Intelligence Briefings</h2>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="btn-sm" onclick="generateBriefing('daily')" id="btn-gen-daily">Generate Daily</button>
        <button class="btn-sm" onclick="generateBriefing('weekly')" id="btn-gen-weekly" style="background:var(--c-blue);color:#fff">Generate Weekly</button>
      </div>
    </div>
    ${briefings.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">&#128203;</div>
      <div class="empty-title">No briefings yet</div>
      <div class="empty-sub">Click "Generate Weekly" above to create your first intelligence briefing.<br>The engine synthesizes internal KPIs, competitor data, and market signals.</div>
    </div>
    ` : `
    <div class="card-grid">
      ${briefings.map(b => `
        <div class="card" onclick="openIntelBriefing(${b.id})" style="cursor:pointer">
          <div class="card-title">${esc(b.title || (b.type === 'roaster_dossier' ? 'Dossier' : 'Week ' + b.week))}</div>
          <div class="card-meta">
            <span class="tag ${b.type === 'weekly' ? 'tag-ok' : b.type === 'roaster_dossier' ? 'tag-warn' : ''}">${b.type}</span>
            &middot; ${b.model_used || 'n/a'} &middot; ${formatDate(b.created_at)}
          </div>
          ${b.content_md ? `<div style="font-size:11px;opacity:.6;margin-top:6px;max-height:40px;overflow:hidden">${esc(b.content_md.substring(0, 120))}...</div>` : ''}
        </div>
      `).join('')}
    </div>
    `}
  `;
}

async function generateBriefing(type) {
  const btn = document.getElementById(type === 'weekly' ? 'btn-gen-weekly' : 'btn-gen-daily');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  showToast(`Generating ${type} briefing — this may take 30-60s...`, 'info');
  try {
    const res = await fetch('/api/cibe/briefings/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    }).then(r => r.json());
    if (res.briefing) {
      showToast(`${type} briefing generated`, 'ok');
      await loadIntelData();
      renderAll();
      openIntelBriefing(res.briefing.id);
    } else {
      showToast(res.error || 'Briefing generation failed', 'error');
    }
  } catch (e) {
    showToast('Briefing generation failed: ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = type === 'weekly' ? 'Generate Weekly' : 'Generate Daily'; }
}

async function openIntelBriefing(id) {
  try {
    const data = await fetch(`/api/cibe/briefings/${id}`).then(r => r.json());
    const content = data.content_md || data.content_html || 'No content';
    // Render markdown-like content with basic formatting
    const rendered = renderBriefingContent(content);
    const saveBtn = (typeof saveToNotebookButton === 'function') ? saveToNotebookButton({
      sourceType: 'intel_briefing',
      ref: { title: data.title || ('Briefing · ' + (data.week || id)), content, date: data.created_at, category: data.type },
      title: data.title || ('Briefing · ' + (data.week || id)),
      summary: String(content).slice(0, 200),
      size: 'sm',
      label: 'Save to notebook'
    }) : '';
    openPanel('Briefing: ' + (data.title || data.week), `
      <div class="panel-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="tag ${data.type === 'weekly' ? 'tag-ok' : data.type === 'roaster_dossier' ? 'tag-warn' : ''}">${data.type}</span>
        &middot; ${data.model_used || ''} &middot; ${formatDate(data.created_at)}
        <span style="margin-left:auto">${saveBtn}</span>
      </div>
      <div class="panel-body" style="font-size:13px;line-height:1.6;margin-top:12px">${rendered}</div>
    `);
  } catch (e) {
    showToast('Failed to load briefing', 'error');
  }
}

/** Basic markdown→HTML for briefing content */
function renderBriefingContent(md) {
  if (!md) return '';
  return md
    .replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 6px;font-size:13px;color:var(--c-blue)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:20px 0 8px;font-size:14px;border-bottom:1px solid var(--border);padding-bottom:4px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:20px 0 10px;font-size:16px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:12px;margin:2px 0">&bull; $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:12px;margin:2px 0">$1. $2</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ── Correlations View ──────────────────────────────────────
function renderIntelCorrelations(main) {
  const data = state.intelData.correlations || { total: 0, correlations: [] };
  const corrs = data.correlations || [];

  const sevColors = { critical: 'tag-crit', warning: 'tag-warn', opportunity: 'tag-ok', info: '' };
  const sevIcons = { critical: '&#9888;', warning: '&#9888;', opportunity: '&#9889;', info: '&#8505;' };

  main.innerHTML = `
    <div class="main-header">
      <h2>Cross-Signal Correlations</h2>
      <span style="font-size:12px;margin-left:8px">
        ${data.critical ? `<span class="badge r">${data.critical} critical</span>` : ''}
        ${data.warning ? `<span class="badge o">${data.warning} warning</span>` : ''}
        ${data.opportunity ? `<span class="badge" style="background:var(--c-green);color:#fff">${data.opportunity} opportunity</span>` : ''}
      </span>
      <button class="btn-sm" onclick="refreshCorrelations()" style="margin-left:auto">Refresh</button>
    </div>

    ${corrs.length === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">&#128279;</div>
      <div class="empty-title">No correlations yet</div>
      <div class="empty-sub">Correlations appear as data accumulates across scrapers and KPI history.<br>Run homepage + catalogue scrapes to seed the correlation engine.</div>
    </div>
    ` : `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${corrs.map(c => `
        <div class="card" style="cursor:pointer" onclick="openCorrelationDetail('${esc(c.id)}')">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="tag ${sevColors[c.severity] || ''}">${sevIcons[c.severity] || ''} ${c.severity}</span>
            <span style="font-size:11px;opacity:.5">${c.type.replace(/_/g, ' ')}</span>
          </div>
          <div class="card-title" style="margin-top:4px">${esc(c.title)}</div>
          <div style="font-size:12px;opacity:.7;margin-top:2px">${esc(c.summary)}</div>
        </div>
      `).join('')}
    </div>
    `}
  `;
}

function openCorrelationDetail(id) {
  const corrs = state.intelData?.correlations?.correlations || [];
  const c = corrs.find(x => x.id === id);
  if (!c) return;
  openPanel(c.title, `
    <div class="panel-meta">
      <span class="tag ${c.severity === 'critical' ? 'tag-crit' : c.severity === 'warning' ? 'tag-warn' : 'tag-ok'}">${c.severity}</span>
      &middot; ${c.type.replace(/_/g, ' ')}
    </div>
    <div style="margin-top:12px;font-size:13px;line-height:1.6">${esc(c.summary)}</div>
    ${c.data ? `
    <div style="margin-top:16px">
      <h4 style="font-size:12px;margin-bottom:6px;opacity:.6">Raw Data</h4>
      <pre style="font-size:11px;background:var(--bg2);padding:10px;border-radius:6px;overflow-x:auto;max-height:300px">${esc(JSON.stringify(c.data, null, 2))}</pre>
    </div>
    ` : ''}
  `);
}

async function refreshCorrelations() {
  showToast('Refreshing correlations...', 'info');
  try {
    const data = await fetch('/api/cibe/correlations').then(r => r.json());
    state.intelData.correlations = data;
    renderAll();
    showToast(`${data.total} correlations found`, 'ok');
  } catch (e) {
    showToast('Failed to refresh correlations', 'error');
  }
}

// ── Market View ────────────────────────────────────────────
function renderIntelMarket(main) {
  const agg = state.intelData.priceAgg;
  const overview = state.intelData.overview;
  const hasData = agg && (agg.byOrigin?.length || agg.byRoaster?.length);

  main.innerHTML = `
    <div class="main-header"><h2>Market Intelligence</h2>
      <button class="btn-sm" onclick="loadMarketProducts()" style="margin-left:auto">View Products</button>
    </div>

    <!-- Summary cards -->
    <div class="card-grid">
      <div class="card">
        <div class="card-title">Product Catalogue</div>
        <div class="card-meta">${overview?.products || 0} products across ${overview?.roasters || 0} roasters</div>
      </div>
      <div class="card">
        <div class="card-title">Outlier Alerts</div>
        <div class="card-meta">${agg?.outliers?.length || 0} pricing outliers detected</div>
      </div>
      <div class="card" onclick="openTrendsPanel()" style="cursor:pointer">
        <div class="card-title">Google Trends</div>
        <div class="card-meta">${(state.intelData.trends?.length || 0)} data points tracked</div>
      </div>
    </div>

    ${hasData ? `
    <!-- Price by Origin -->
    <div style="margin-top:20px">
      <h3 style="font-size:14px;margin-bottom:8px">Average $/kg by Origin</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Origin</th><th>Avg $/kg</th><th>Min</th><th>Max</th><th>Products</th></tr></thead>
          <tbody>
            ${(agg.byOrigin || []).map(o => `
              <tr>
                <td><strong>${esc(o.origin)}</strong></td>
                <td>$${(o.avgPricePerKg || 0).toFixed(2)}</td>
                <td>$${(o.minPricePerKg || 0).toFixed(2)}</td>
                <td>$${(o.maxPricePerKg || 0).toFixed(2)}</td>
                <td>${o.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Price by Roast Level -->
    ${agg.byRoastLevel?.length ? `
    <div style="margin-top:20px">
      <h3 style="font-size:14px;margin-bottom:8px">Average $/kg by Roast Level</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Roast</th><th>Avg $/kg</th><th>Products</th></tr></thead>
          <tbody>
            ${agg.byRoastLevel.map(r => `
              <tr>
                <td><strong>${esc(r.roastLevel)}</strong></td>
                <td>$${(r.avgPricePerKg || 0).toFixed(2)}</td>
                <td>${r.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Price by Roaster -->
    ${agg.byRoaster?.length ? `
    <div style="margin-top:20px">
      <h3 style="font-size:14px;margin-bottom:8px">Average $/kg by Roaster</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Roaster</th><th>Avg $/kg</th><th>Products</th></tr></thead>
          <tbody>
            ${agg.byRoaster.map(r => `
              <tr>
                <td><strong>${esc(r.roasterId)}</strong></td>
                <td>$${(r.avgPricePerKg || 0).toFixed(2)}</td>
                <td>${r.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Outliers -->
    ${agg.outliers?.length ? `
    <div style="margin-top:20px">
      <h3 style="font-size:14px;margin-bottom:8px;color:var(--c-orange)">Pricing Outliers</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Product</th><th>Roaster</th><th>$/kg</th><th>Market Avg</th><th>Deviation</th><th>Flag</th></tr></thead>
          <tbody>
            ${agg.outliers.map(o => `
              <tr>
                <td>${esc(o.name)}</td>
                <td>${esc(o.roasterId)}</td>
                <td>$${(o.pricePerKg || 0).toFixed(2)}</td>
                <td>$${(o.marketAvg || 0).toFixed(2)}</td>
                <td>${o.pctDeviation > 0 ? '+' : ''}${(o.pctDeviation || 0).toFixed(0)}%</td>
                <td><span class="tag ${o.flag === 'overpriced' ? 'tag-crit' : 'tag-ok'}">${o.flag}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}
    ` : `
    <div class="empty-state" style="margin-top:20px">
      <div class="empty-icon">&#128202;</div>
      <div class="empty-title">No price data yet</div>
      <div class="empty-sub">Run a catalogue scrape to populate product pricing data.</div>
    </div>
    `}
  `;
}

// ── Market Products Loader ────────────────────────────────
async function loadMarketProducts() {
  try {
    const data = await fetch('/api/cibe/products?limit=50').then(r => r.json());
    const products = data.products || [];
    if (products.length === 0) { showToast('No products found — run a catalogue scrape first', 'info'); return; }
    openPanel('Product Catalogue (' + products.length + ')', `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Roaster</th><th>Price</th><th>Weight</th><th>Origin</th><th>Roast</th><th>Last Seen</th></tr></thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.roaster_id)}</td>
                <td>${p.price_cents ? '$' + (p.price_cents / 100).toFixed(2) : '-'}</td>
                <td>${p.weight_g ? p.weight_g + 'g' : '-'}</td>
                <td>${esc(p.origin || '-')}</td>
                <td>${esc(p.roast_level || '-')}</td>
                <td>${formatDate(p.last_seen)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  } catch (e) {
    showToast('Failed to load products', 'error');
  }
}

// ── Roasters View ──────────────────────────────────────────
function renderIntelRoasters(main) {
  const roasters = state.intelData.roasters || [];
  const ss = state.intelData.scrapeStatus;

  main.innerHTML = `
    <div class="main-header">
      <h2>Monitored Roasters</h2>
      <span style="font-size:12px;opacity:.5;margin-left:8px">${roasters.length} active</span>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-sm" onclick="triggerCIBEScrape('homepage')">Homepages</button>
        <button class="btn-sm" onclick="triggerCIBEScrape('catalogue')">Catalogues</button>
        <button class="btn-sm" onclick="triggerCIBEScrape('social')">Social</button>
        <button class="btn-sm" onclick="triggerCIBEScrape('trends')">Trends</button>
        <button class="btn-sm" onclick="triggerCIBEScrape('edm')">EDMs</button>
        <button class="btn-sm" onclick="openScrapeLog()" style="opacity:.7">Log</button>
      </div>
    </div>

    <!-- Scrape status bar -->
    ${ss ? `
    <div style="display:flex;gap:12px;margin-bottom:12px;font-size:11px;opacity:.6;padding:6px 10px;background:var(--bg2);border-radius:6px;flex-wrap:wrap">
      <span>Scraper: ${ss.running ? '<span style="color:var(--c-orange)">running</span>' : '<span style="color:var(--c-green)">idle</span>'}</span>
      <span>Last: ${ss.lastRun ? formatDate(ss.lastRun) : 'never'}</span>
      <span>HP: ${fmtNext(ss.nextHomepage)}</span>
      <span>Cat: ${fmtNext(ss.nextCatalogue)}</span>
      <span>Social: ${fmtNext(ss.nextSocial)}</span>
      <span>Trends: ${fmtNext(ss.nextTrends)}</span>
      <span>EDM: ${fmtNext(ss.nextEdm)}</span>
    </div>
    ` : ''}

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th>Type</th>
            <th>Website</th>
            <th>Instagram</th>
            <th>Partner</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${roasters.map(r => `
            <tr style="cursor:pointer">
              <td onclick="openIntelRoaster('${r.id}')"><strong>${esc(r.name)}</strong></td>
              <td onclick="openIntelRoaster('${r.id}')">${esc(r.country)}</td>
              <td onclick="openIntelRoaster('${r.id}')"><span class="tag ${r.type === 'competitor' ? 'tag-warn' : 'tag-ok'}">${r.type}</span></td>
              <td>${r.website ? '<a href="' + esc(r.website) + '" target="_blank" style="opacity:.6;font-size:11px" onclick="event.stopPropagation()">visit</a>' : '-'}</td>
              <td>${r.instagram ? '@' + esc(r.instagram) : '-'}</td>
              <td>${r.beanz_partner ? '<span style="color:var(--c-green)">Yes</span>' : '-'}</td>
              <td style="text-align:center;white-space:nowrap">
                <button class="btn-sm" onclick="event.stopPropagation();triggerCIBEScrape('homepage','${r.id}')" title="Scrape homepage" style="font-size:10px;padding:2px 6px">HP</button>
                <button class="btn-sm" onclick="event.stopPropagation();generateRoasterDossier('${r.id}')" title="Generate AI dossier" style="font-size:10px;padding:2px 6px;background:var(--c-blue);color:#fff">AI</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Scrape Trigger ────────────────────────────────────────
async function triggerCIBEScrape(job, roasterId) {
  showToast(`Starting ${job} scrape${roasterId ? ' for ' + roasterId : ''}...`, 'info');
  try {
    const body = { job };
    if (roasterId) body.roasterId = roasterId;
    const res = await fetch('/api/cibe/scrape/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());
    if (res.ok) showToast(`${job} scrape triggered`, 'ok');
    else showToast(res.error || 'Scrape failed', 'error');
  } catch (e) {
    showToast('Scrape trigger failed: ' + e.message, 'error');
  }
}

// ── Scrape Log Panel ──────────────────────────────────────
async function openScrapeLog() {
  try {
    const data = await fetch('/api/cibe/scrape/status').then(r => r.json());
    const jobs = data.jobs || [];
    openPanel('Scrape Log', `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Type</th><th>Status</th><th>Started</th><th>Duration</th><th>Error</th></tr></thead>
          <tbody>
            ${jobs.length === 0 ? '<tr><td colspan="5" style="opacity:.5">No scrape jobs yet</td></tr>' : ''}
            ${jobs.map(j => `
              <tr>
                <td>${esc(j.job_type)}</td>
                <td><span class="tag ${j.status === 'completed' ? 'tag-ok' : j.status === 'error' ? 'tag-crit' : 'tag-warn'}">${j.status}</span></td>
                <td>${formatDate(j.started_at)}</td>
                <td>${j.duration_ms ? (j.duration_ms / 1000).toFixed(1) + 's' : '-'}</td>
                <td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${j.error ? esc(j.error.substring(0, 100)) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  } catch (e) {
    showToast('Failed to load scrape log', 'error');
  }
}

async function openIntelRoaster(id) {
  try {
    const data = await fetch(`/api/cibe/dossier/${id}`).then(r => r.json());
    const r = data.roaster;
    const social = data.social || {};
    const saveBtn = (typeof saveToNotebookButton === 'function') ? saveToNotebookButton({
      sourceType: 'cibe_roaster',
      ref: { id: r.id },
      title: r.name,
      summary: r.country + ' · ' + r.type,
      size: 'sm',
      label: 'Save'
    }) : '';
    openPanel(r.name, `
      <div class="panel-meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${r.country} &middot; ${r.type} &middot; ${r.website ? '<a href="' + esc(r.website) + '" target="_blank">website</a>' : 'no website'}
        ${r.instagram ? ' &middot; <a href="https://www.instagram.com/' + esc(r.instagram) + '/" target="_blank">@' + esc(r.instagram) + '</a>' : ''}
        <span style="margin-left:auto">${saveBtn}</span>
      </div>
      <div style="margin-top:8px">
        <button class="btn-sm" onclick="generateRoasterDossier('${r.id}')" style="background:var(--c-blue);color:#fff">Generate AI Dossier</button>
      </div>

      ${social.followers ? `
      <div style="margin-top:12px">
        <h4>Social</h4>
        <div style="display:flex;gap:16px;font-size:12px">
          <span><strong>${fmtCount(social.followers)}</strong> followers</span>
          ${social.engagement_rate ? `<span><strong>${social.engagement_rate}%</strong> engagement</span>` : ''}
        </div>
      </div>
      ` : ''}

      <div style="margin-top:12px">
        <h4>Products (${data.products.count})</h4>
        ${data.products.count > 0
          ? data.products.items.slice(0, 10).map(p => `<div style="font-size:12px;padding:2px 0">${esc(p.name)} — ${p.price_cents ? '$' + (p.price_cents / 100).toFixed(2) : 'n/a'} ${p.weight_g ? p.weight_g + 'g' : ''}</div>`).join('')
          : '<div style="font-size:12px;opacity:.5">No products scraped yet</div>'
        }
      </div>
      <div style="margin-top:12px">
        <h4>Homepage Snapshots (${data.snapshots.length})</h4>
        ${data.snapshots.length > 0
          ? data.snapshots.map(s => `<div style="font-size:12px;padding:2px 0">${formatDate(s.captured_at)} — ${esc(s.vision_summary || 'pending')}</div>`).join('')
          : '<div style="font-size:12px;opacity:.5">No snapshots yet</div>'
        }
      </div>
      <div style="margin-top:12px">
        <h4>EDMs (${data.edms.count})</h4>
        ${data.edms.count > 0
          ? data.edms.items.slice(0, 5).map(e => `<div style="font-size:12px;padding:2px 0">${esc(e.subject)} — ${formatDate(e.received_at)}</div>`).join('')
          : '<div style="font-size:12px;opacity:.5">No EDMs captured yet</div>'
        }
      </div>
    `);
  } catch (e) {
    showToast('Failed to load roaster dossier', 'error');
  }
}

// ── Dossier Generation ──────────────────────────────────────
async function generateRoasterDossier(roasterId) {
  showToast(`Generating AI dossier for ${roasterId} — this may take 30-60s...`, 'info');
  try {
    const res = await fetch(`/api/cibe/dossier/${roasterId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());
    if (res.briefing) {
      showToast('Dossier generated', 'ok');
      openIntelBriefing(res.briefing.id);
    } else {
      showToast(res.error || 'Dossier generation failed', 'error');
    }
  } catch (e) {
    showToast('Dossier generation failed: ' + e.message, 'error');
  }
}

// ── Trends Panel ────────────────────────────────────────────
async function openTrendsPanel() {
  try {
    const data = await fetch('/api/cibe/trends').then(r => r.json());
    const trends = data.trends || data || [];
    if (!trends.length) { showToast('No trends data — run a trends scrape first', 'info'); return; }

    // Group by keyword
    const grouped = {};
    for (const t of trends) {
      const key = `${t.keyword} (${t.region})`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    }

    openPanel('Google Trends Data', `
      ${Object.entries(grouped).map(([key, points]) => `
        <div style="margin-bottom:16px">
          <h4 style="font-size:12px;margin-bottom:4px">${esc(key)}</h4>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${points.slice(0, 12).map(p => `
              <span style="font-size:10px;padding:2px 6px;background:var(--bg2);border-radius:3px">${p.period}: <strong>${p.value}</strong></span>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `);
  } catch (e) {
    showToast('Failed to load trends', 'error');
  }
}

// ── Anomalies View ─────────────────────────────────────────
function renderIntelAnomalies(main) {
  const data = state.intelData.anomalies || { total: 0, anomalies: [] };

  if (data.total === 0) {
    main.innerHTML = `
      <div class="main-header"><h2>KPI Anomalies</h2></div>
      <div class="empty-state">
        <div class="empty-icon">&#9989;</div>
        <div class="empty-title">No anomalies detected</div>
        <div class="empty-sub">All monitored KPIs are within normal range.<br>Anomaly detection requires 3+ weeks of data in cibe_kpi_history.</div>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="main-header">
      <h2>KPI Anomalies</h2>
      <span style="font-size:12px;margin-left:8px">
        <span class="badge r">${data.critical || 0} critical</span>
        <span class="badge o">${data.warning || 0} warning</span>
      </span>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Metric</th>
            <th>Current</th>
            <th>Baseline</th>
            <th>Deviation</th>
            <th>Direction</th>
          </tr>
        </thead>
        <tbody>
          ${data.anomalies.map(a => `
            <tr>
              <td><span class="tag ${a.severity === 'critical' ? 'tag-crit' : 'tag-warn'}">${a.severity}</span></td>
              <td style="font-family:monospace;font-size:11px">${esc(a.metric)}</td>
              <td>${fmt(a.currentValue)}</td>
              <td>${fmt(a.baseline)}</td>
              <td>${a.absDeviation}x std</td>
              <td>${a.direction === 'above' ? '<span style="color:var(--c-green)">&#9650; above</span>' : '<span style="color:var(--c-red)">&#9660; below</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(v) { return typeof v === 'number' ? (v > 1000 ? (v/1000).toFixed(1) + 'k' : v.toFixed(2)) : String(v); }
function fmtCount(n) { return n >= 1000000 ? (n/1000000).toFixed(1) + 'M' : n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n); }
function fmtNext(ts) { return ts ? new Date(ts).toLocaleString('en-AU', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '-'; }
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
