/**
 * CIBE Briefing Generator (FR-020)
 * Synthesizes internal + external data into actionable weekly briefings via Claude API.
 *
 * Models: claude-sonnet-4 for routine daily, claude-opus-4 for weekly synthesis.
 * Uses raw HTTPS (no SDK dependency), following news-engine.js pattern.
 */
const https = require('https');
const { logAction } = require('../db');

const DEFAULT_MODEL_ROUTINE = 'claude-sonnet-4-20250514';
const DEFAULT_MODEL_SYNTHESIS = 'claude-opus-4-20250514';

/**
 * Generate a briefing from all available CIBE data.
 * @param {object} db - SQLite database
 * @param {object} ctx - Server context
 * @param {object} opts - { type: 'daily'|'weekly', force: boolean }
 * @returns {{ briefingId, content_md, content_html, model_used }}
 */
async function generateBriefing(db, ctx, opts = {}) {
  const type = opts.type || 'weekly';
  const apiKey = process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — add it to .env');

  const model = type === 'weekly'
    ? (process.env.CIBE_MODEL_SYNTHESIS || DEFAULT_MODEL_SYNTHESIS)
    : (process.env.CIBE_MODEL_ROUTINE || DEFAULT_MODEL_ROUTINE);

  // ── Collect all data sources ──────────────────────────────
  const snapshot = await collectDataSnapshot(db, ctx);

  // ── Build prompt ──────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(type);
  const userPrompt = buildUserPrompt(snapshot, type);

  // ── Call Claude API ───────────────────────────────────────
  const contentMd = await callClaude(apiKey, model, systemPrompt, userPrompt);

  // ── Convert to HTML (basic Markdown → HTML) ───────────────
  const contentHtml = markdownToHtml(contentMd);

  // ── Compute week string ───────────────────────────────────
  const now = new Date();
  const weekNum = getISOWeek(now);
  const week = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  // ── Store in database ─────────────────────────────────────
  const title = type === 'weekly'
    ? `Weekly Intelligence Briefing — ${week}`
    : `Daily Intel Update — ${now.toISOString().slice(0, 10)}`;

  const result = db.prepare(`
    INSERT INTO cibe_briefings (week, type, title, content_md, content_html, model_used, data_snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    week, type, title, contentMd, contentHtml, model,
    JSON.stringify(snapshot)
  );

  logAction('cibe_briefing_generated', null, 'system', { type, model, week, id: result.lastInsertRowid });
  console.log(`[CIBE] Briefing generated: ${title} (model: ${model})`);

  return {
    briefingId: result.lastInsertRowid,
    title,
    content_md: contentMd,
    content_html: contentHtml,
    model_used: model,
    week
  };
}

/**
 * Collect all data needed for briefing generation.
 */
async function collectDataSnapshot(db, ctx) {
  const snapshot = {
    collectedAt: new Date().toISOString(),
    internal: {},
    anomalies: [],
    roasters: [],
    products: {},
    homepageChanges: [],
    edms: [],
    trends: [],
    correlations: []
  };

  // Internal KPIs
  try {
    const { getLatestKPIs } = require('./internal-data');
    snapshot.internal.kpis = getLatestKPIs(db);
  } catch (e) { snapshot.internal.error = e.message; }

  // Anomalies
  try {
    const { detectAnomalies } = require('./anomaly-detector');
    snapshot.anomalies = detectAnomalies(db);
  } catch (e) { snapshot.anomalies = []; }

  // Active roasters
  try {
    snapshot.roasters = db.prepare(
      'SELECT id, name, country, type FROM cibe_roasters WHERE active = 1'
    ).all();
  } catch { /* empty */ }

  // Recent homepage changes (last 7 days)
  try {
    snapshot.homepageChanges = db.prepare(`
      SELECT h.roaster_id, r.name as roaster_name, h.vision_summary, h.detected_changes, h.captured_at
      FROM cibe_homepage_snapshots h
      JOIN cibe_roasters r ON r.id = h.roaster_id
      WHERE h.detected_changes IS NOT NULL
        AND h.captured_at >= datetime('now', '-7 days')
      ORDER BY h.captured_at DESC LIMIT 20
    `).all();
  } catch { /* empty */ }

  // Price summary
  try {
    const { getPriceAggregation } = require('./price-aggregator');
    snapshot.products = getPriceAggregation(db);
  } catch (e) { snapshot.products = { error: e.message }; }

  // Recent EDMs
  try {
    snapshot.edms = db.prepare(
      'SELECT roaster_id, subject, vision_summary, received_at FROM cibe_edms ORDER BY received_at DESC LIMIT 10'
    ).all();
  } catch { /* empty */ }

  // Trends
  try {
    snapshot.trends = db.prepare(
      'SELECT keyword, region, value, period FROM cibe_trends ORDER BY period DESC LIMIT 20'
    ).all();
  } catch { /* empty */ }

  // Correlations
  try {
    const { computeCorrelations } = require('./correlation-engine');
    snapshot.correlations = computeCorrelations(db, ctx);
  } catch { /* empty */ }

  return snapshot;
}

function buildSystemPrompt(type) {
  const base = `You are the Beanz OS Coffee Intelligence analyst. Beanz is a coffee subscription platform (part of Breville Group) operating in AU, UK, US, DE, NL.

Your role: synthesize internal performance data and external market signals into actionable intelligence briefings for the General Manager.

Output format: Markdown with clear sections. Be concise, data-driven, and action-oriented. Flag risks with severity. Quantify everything possible.`;

  if (type === 'weekly') {
    return base + `

This is a WEEKLY SYNTHESIS briefing. Include:
## Top Signals (3-5 bullet points — most important takeaways)
## Internal Performance (KPI trends, anomalies, year-over-year)
## Roaster Activity (homepage changes, new products, pricing moves)
## Market Trends (search trends, EDM themes, competitive shifts)
## Gap Alerts (pricing gaps, catalogue gaps vs competitors)
## Recommended Actions (2-3 specific actions for the week ahead)`;
  }

  return base + `

This is a DAILY UPDATE. Keep it brief (under 300 words). Include only:
## Today's Signals (1-3 bullet points)
## Anomaly Alerts (if any)
## Notable Changes (new products, price changes, homepage updates)`;
}

function buildUserPrompt(snapshot, type) {
  const sections = [];

  // Internal KPIs
  if (snapshot.internal?.kpis?.length) {
    const kpiSummary = snapshot.internal.kpis.slice(0, 20).map(k =>
      `- ${k.metric_key}: ${k.value} (period: ${k.period})`
    ).join('\n');
    sections.push(`### Internal KPIs\n${kpiSummary}`);
  }

  // Anomalies
  if (snapshot.anomalies?.length) {
    const anomSummary = snapshot.anomalies.map(a =>
      `- [${a.severity.toUpperCase()}] ${a.metric}: ${a.currentValue} (baseline ${a.baseline}, ${a.deviation > 0 ? '+' : ''}${a.deviation}σ)`
    ).join('\n');
    sections.push(`### Anomalies Detected\n${anomSummary}`);
  }

  // Homepage changes
  if (snapshot.homepageChanges?.length) {
    const hpSummary = snapshot.homepageChanges.map(h =>
      `- ${h.roaster_name}: ${h.vision_summary || 'Changes detected'} (${h.captured_at})`
    ).join('\n');
    sections.push(`### Roaster Homepage Changes (Last 7 Days)\n${hpSummary}`);
  }

  // Price data
  if (snapshot.products?.byOrigin?.length) {
    const priceSummary = snapshot.products.byOrigin.slice(0, 10).map(p =>
      `- ${p.origin}: avg $${(p.avg_price_cents / 100).toFixed(2)}/unit (${p.product_count} products)`
    ).join('\n');
    sections.push(`### Market Pricing by Origin\n${priceSummary}`);
  }
  if (snapshot.products?.outliers?.length) {
    const outlierSummary = snapshot.products.outliers.slice(0, 5).map(o =>
      `- ${o.name} (${o.roaster_id}): $${(o.price_cents / 100).toFixed(2)} — ${o.outlier_type}`
    ).join('\n');
    sections.push(`### Pricing Outliers\n${outlierSummary}`);
  }

  // EDMs
  if (snapshot.edms?.length) {
    const edmSummary = snapshot.edms.map(e =>
      `- ${e.roaster_id}: "${e.subject}" — ${e.vision_summary || 'No analysis'}`
    ).join('\n');
    sections.push(`### Recent EDMs\n${edmSummary}`);
  }

  // Trends
  if (snapshot.trends?.length) {
    const trendSummary = snapshot.trends.map(t =>
      `- "${t.keyword}" (${t.region}): ${t.value} (${t.period})`
    ).join('\n');
    sections.push(`### Search Trends\n${trendSummary}`);
  }

  // Correlations
  if (snapshot.correlations?.length) {
    const corrSummary = snapshot.correlations.map(c =>
      `- [${c.severity}] ${c.title}: ${c.summary}`
    ).join('\n');
    sections.push(`### Cross-Signal Correlations\n${corrSummary}`);
  }

  // Context
  const roasterCount = snapshot.roasters?.length || 0;
  sections.push(`### Context\nMonitoring ${roasterCount} roasters across ${[...new Set(snapshot.roasters?.map(r => r.country) || [])].join(', ') || 'AU'}.`);

  if (sections.length === 1) {
    sections.unshift('Note: Limited data available. Generate briefing from whatever data is present, noting data gaps.');
  }

  return `Generate a ${type} intelligence briefing based on the following data:\n\n${sections.join('\n\n')}`;
}

/**
 * Call Claude API via raw HTTPS.
 */
function callClaude(apiKey, model, systemPrompt, userPrompt) {
  const body = JSON.stringify({
    model,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content?.[0]?.text) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error(parsed.error?.message || 'No content in Claude response'));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Basic Markdown → HTML conversion */
function markdownToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/** Get ISO week number */
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/**
 * Send briefing via email (MS Graph).
 */
async function emailBriefing(ctx, briefing) {
  const recipients = (process.env.CIBE_BRIEFING_RECIPIENTS || ctx.msGraph?.userEmail || '').split(',').filter(Boolean);
  if (!recipients.length) {
    console.log('[CIBE] No briefing recipients configured');
    return { sent: false, reason: 'no recipients' };
  }

  try {
    const outlookApi = require('../outlook-api');
    await outlookApi.sendEmail(ctx, {
      subject: briefing.title,
      body: briefing.content_html,
      bodyType: 'HTML',
      to: recipients
    });
    console.log(`[CIBE] Briefing emailed to ${recipients.length} recipients`);
    return { sent: true, recipients };
  } catch (e) {
    console.error('[CIBE] Email delivery failed:', e.message);
    return { sent: false, error: e.message };
  }
}

module.exports = {
  generateBriefing,
  collectDataSnapshot,
  emailBriefing
};
