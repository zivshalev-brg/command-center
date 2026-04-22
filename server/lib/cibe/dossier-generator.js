/**
 * CIBE Dossier Generator (FR-023)
 * Generates comprehensive roaster dossiers on demand via Claude API.
 *
 * Pulls all cibe_* table data for a roaster + news mentions,
 * synthesizes via Claude Opus into a strategic intelligence dossier.
 */
const https = require('https');
const { logAction } = require('../db');
const MODELS = require('../ai-models');

/**
 * Generate a comprehensive dossier for a specific roaster.
 * @param {object} db - SQLite database
 * @param {object} ctx - Server context
 * @param {string} roasterId - Roaster ID
 * @returns {{ dossierId, content_md, content_html }}
 */
async function generateDossier(db, ctx, roasterId) {
  const apiKey = process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — add it to .env');

  const { getRoaster } = require('./roaster-registry');
  const roaster = getRoaster(db, roasterId);
  if (!roaster) throw new Error(`Roaster not found: ${roasterId}`);

  // ── Collect all roaster data ──────────────────────────────
  const data = collectRoasterData(db, roasterId);

  // ── Build prompt ──────────────────────────────────────────
  const prompt = buildDossierPrompt(roaster, data);

  // ── Call Claude Opus for deep analysis ────────────────────
  const model = process.env.CIBE_MODEL_SYNTHESIS || MODELS.OPUS;
  const contentMd = await callClaude(apiKey, model, prompt);
  const contentHtml = basicMdToHtml(contentMd);

  // ── Store as briefing with type 'roaster_dossier' ─────────
  const week = getWeekString();
  const title = `Roaster Dossier: ${roaster.name}`;

  const result = db.prepare(`
    INSERT INTO cibe_briefings (week, type, title, content_md, content_html, model_used, data_snapshot, created_at)
    VALUES (?, 'roaster_dossier', ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    week, title, contentMd, contentHtml, model,
    JSON.stringify({ roasterId, ...data })
  );

  logAction('cibe_dossier_generated', null, 'system', { roasterId, model, id: result.lastInsertRowid });
  console.log(`[CIBE] Dossier generated: ${title}`);

  return {
    dossierId: result.lastInsertRowid,
    title,
    content_md: contentMd,
    content_html: contentHtml,
    model_used: model
  };
}

/**
 * Collect all data for a roaster across CIBE tables.
 */
function collectRoasterData(db, roasterId) {
  const data = {
    products: [],
    homepageSnapshots: [],
    edms: [],
    social: [],
    priceHistory: []
  };

  try {
    data.products = db.prepare(
      'SELECT name, price_cents, currency, weight_g, origin, process, roast_level, price_history, first_seen, last_seen FROM cibe_products WHERE roaster_id = ? ORDER BY name'
    ).all(roasterId);
  } catch { /* empty */ }

  try {
    data.homepageSnapshots = db.prepare(
      'SELECT vision_summary, detected_changes, captured_at FROM cibe_homepage_snapshots WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 10'
    ).all(roasterId);
  } catch { /* empty */ }

  try {
    data.edms = db.prepare(
      'SELECT subject, vision_summary, received_at FROM cibe_edms WHERE roaster_id = ? ORDER BY received_at DESC LIMIT 10'
    ).all(roasterId);
  } catch { /* empty */ }

  try {
    data.social = db.prepare(
      'SELECT platform, followers, engagement_rate, top_posts, captured_at FROM cibe_social WHERE roaster_id = ? ORDER BY captured_at DESC LIMIT 5'
    ).all(roasterId);
  } catch { /* empty */ }

  // Products with price changes
  try {
    data.priceHistory = data.products
      .filter(p => p.price_history && p.price_history !== '[]')
      .map(p => ({
        name: p.name,
        currentPrice: p.price_cents,
        history: JSON.parse(p.price_history || '[]')
      }));
  } catch { /* empty */ }

  return data;
}

function buildDossierPrompt(roaster, data) {
  const sections = [];

  sections.push(`# Roaster Profile
- Name: ${roaster.name}
- Country: ${roaster.country}
- City: ${roaster.city || 'Unknown'}
- Type: ${roaster.type || 'roaster'}
- Website: ${roaster.website || 'N/A'}
- Instagram: ${roaster.instagram ? '@' + roaster.instagram : 'N/A'}`);

  if (data.products.length) {
    const productList = data.products.map(p =>
      `  - ${p.name}: $${(p.price_cents / 100).toFixed(2)} ${p.currency || ''} ${p.weight_g ? `(${p.weight_g}g)` : ''} ${p.origin ? `— ${p.origin}` : ''} ${p.roast_level || ''}`
    ).join('\n');
    sections.push(`# Product Catalogue (${data.products.length} products)\n${productList}`);

    // Price stats
    const prices = data.products.filter(p => p.price_cents > 0).map(p => p.price_cents);
    if (prices.length) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      sections.push(`Price range: $${(min / 100).toFixed(2)} - $${(max / 100).toFixed(2)}, avg $${(avg / 100).toFixed(2)}`);
    }
  }

  if (data.priceHistory.length) {
    const changes = data.priceHistory.map(p =>
      `  - ${p.name}: ${p.history.length} price changes`
    ).join('\n');
    sections.push(`# Price Changes\n${changes}`);
  }

  if (data.homepageSnapshots.length) {
    const snapshots = data.homepageSnapshots
      .filter(s => s.vision_summary)
      .map(s => `  - ${s.captured_at}: ${s.vision_summary}`)
      .join('\n');
    if (snapshots) sections.push(`# Homepage Activity (Last 10 Snapshots)\n${snapshots}`);
  }

  if (data.edms.length) {
    const edms = data.edms.map(e =>
      `  - "${e.subject}" (${e.received_at}): ${e.vision_summary || 'No analysis'}`
    ).join('\n');
    sections.push(`# Email Marketing (Last 10 EDMs)\n${edms}`);
  }

  if (data.social.length) {
    const latest = data.social[0];
    sections.push(`# Social Media
- Platform: ${latest.platform}
- Followers: ${latest.followers?.toLocaleString() || 'Unknown'}
- Engagement rate: ${latest.engagement_rate || 'Unknown'}`);
  }

  const dataSection = sections.join('\n\n');

  return `You are a competitive intelligence analyst for Beanz (a coffee subscription platform by Breville Group).

Generate a comprehensive competitive dossier for the following roaster. Structure it as:

## Executive Summary (2-3 sentences)
## Market Position (pricing strategy, target segment, unique selling points)
## Product Strategy (catalogue breadth, origin focus, roast preferences, pricing tiers)
## Marketing & Messaging (website themes, email campaigns, seasonal patterns)
## Social Presence (follower growth, content strategy, engagement)
## Competitive Implications for Beanz (threats, opportunities, lessons)
## Recommended Actions (2-3 specific recommendations for Beanz)

Be concise, data-driven, and action-oriented. Quantify where possible.

${dataSection}`;
}

function callClaude(apiKey, model, prompt) {
  const body = JSON.stringify({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
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
          if (parsed.content?.[0]?.text) resolve(parsed.content[0].text);
          else reject(new Error(parsed.error?.message || 'No content'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function basicMdToHtml(md) {
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

function getWeekString() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

module.exports = { generateDossier };
