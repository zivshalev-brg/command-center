/**
 * EDM Scraper (FR-012, FR-032)
 * Captures email newsletters from competitor roasters via Outlook folder.
 *
 * MVP: Reads from "Beanz Intel" Outlook folder via existing MS Graph integration.
 * Saves raw HTML, sends to Claude Vision for extraction of offers/themes/pricing.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { logAction } = require('../../db');
const MODELS = require('../../ai-models');

const EDM_FOLDER_NAME = 'Beanz Intel';
const EDM_SCREENSHOT_DIR = path.join(process.cwd(), 'cibe-screenshots', 'edms');

/**
 * Scrape EDMs from the dedicated Outlook folder.
 * @param {object} db - SQLite database
 * @param {object} ctx - Server context (needs ctx.msGraph)
 * @returns {{ processed: number, newEdms: number, errors: number }}
 */
async function scrapeEDMs(db, ctx) {
  const msGraph = ctx.msGraph;
  if (!msGraph?.accessToken && !msGraph?.clientSecret) {
    return { processed: 0, newEdms: 0, errors: 0, error: 'MS Graph not configured' };
  }

  // Load roasters for EDM sender matching
  const roasters = db.prepare('SELECT id, name, edm_from FROM cibe_roasters WHERE active = 1').all();
  const senderMap = buildSenderMap(roasters);

  let processed = 0, newEdms = 0, errors = 0;

  try {
    // Get messages from the Beanz Intel folder
    const messages = await fetchEdmMessages(ctx);

    for (const msg of messages) {
      try {
        // Check if already captured
        const existing = db.prepare(
          'SELECT id FROM cibe_edms WHERE message_id = ?'
        ).get(msg.id);
        if (existing) { processed++; continue; }

        // Match sender to roaster
        const roasterId = matchSender(msg.from, senderMap);

        // Save raw HTML
        const htmlPath = saveRawHtml(msg, roasterId);

        // Vision analysis (if API key available)
        let visionSummary = null;
        let parsedJson = null;
        const apiKey = process.env.ANTHROPIC_API_KEY || ctx.anthropicApiKey || '';
        if (apiKey && msg.body?.content) {
          try {
            const analysis = await analyzeEdmContent(apiKey, msg.subject, msg.body.content, roasterId);
            visionSummary = analysis.summary;
            parsedJson = JSON.stringify(analysis);
          } catch (e) {
            console.error(`[CIBE] EDM analysis failed for "${msg.subject}":`, e.message);
          }
        }

        // Store in database
        db.prepare(`
          INSERT INTO cibe_edms (roaster_id, message_id, subject, sender, raw_html_path, parsed_json, vision_summary, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          roasterId,
          msg.id,
          msg.subject || '',
          msg.from?.emailAddress?.address || '',
          htmlPath,
          parsedJson,
          visionSummary,
          msg.receivedDateTime || new Date().toISOString()
        );

        newEdms++;
        processed++;
      } catch (e) {
        errors++;
        console.error(`[CIBE] EDM processing error:`, e.message);
      }
    }
  } catch (e) {
    return { processed, newEdms, errors: errors + 1, error: e.message };
  }

  logAction('cibe_edm_scrape', null, 'system', { processed, newEdms, errors });
  return { processed, newEdms, errors };
}

/**
 * Fetch messages from the Beanz Intel Outlook folder via MS Graph.
 */
async function fetchEdmMessages(ctx) {
  try {
    const outlookApi = require('../../outlook-api');
    // Try to find the Beanz Intel folder
    const folders = await outlookApi.getMailFolders(ctx);
    const edmFolder = folders.find(f =>
      f.displayName === EDM_FOLDER_NAME || f.displayName.toLowerCase().includes('beanz intel')
    );

    if (!edmFolder) {
      console.log(`[CIBE] Outlook folder "${EDM_FOLDER_NAME}" not found — skipping EDM scrape`);
      return [];
    }

    // Get recent messages from this folder (last 30 days)
    const messages = await outlookApi.getMessages(ctx, {
      folderId: edmFolder.id,
      top: 50,
      filter: `receivedDateTime ge ${new Date(Date.now() - 30 * 86400000).toISOString()}`
    });

    return messages || [];
  } catch (e) {
    console.error('[CIBE] Failed to fetch EDM messages:', e.message);
    return [];
  }
}

/**
 * Build a map of email sender patterns → roaster IDs.
 */
function buildSenderMap(roasters) {
  const map = {};
  for (const r of roasters) {
    // Use explicit edm_from if set
    if (r.edm_from) {
      const senders = r.edm_from.split(',').map(s => s.trim().toLowerCase());
      for (const s of senders) map[s] = r.id;
    }
    // Also match by roaster name in sender address
    const nameLower = r.name.toLowerCase().replace(/\s+/g, '');
    map[nameLower] = r.id;
  }
  return map;
}

/**
 * Match an email sender to a roaster ID.
 */
function matchSender(from, senderMap) {
  if (!from?.emailAddress?.address) return null;
  const addr = from.emailAddress.address.toLowerCase();
  const name = (from.emailAddress.name || '').toLowerCase().replace(/\s+/g, '');

  // Exact sender match
  if (senderMap[addr]) return senderMap[addr];

  // Name match
  if (senderMap[name]) return senderMap[name];

  // Partial domain/name match
  for (const [key, roasterId] of Object.entries(senderMap)) {
    if (addr.includes(key) || key.includes(addr.split('@')[0])) return roasterId;
  }

  return null; // Unknown sender
}

/**
 * Save raw HTML body to disk.
 */
function saveRawHtml(msg, roasterId) {
  const dir = path.join(EDM_SCREENSHOT_DIR, roasterId || 'unknown');
  fs.mkdirSync(dir, { recursive: true });

  const date = (msg.receivedDateTime || new Date().toISOString()).slice(0, 10);
  const safe = (msg.subject || 'untitled').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50);
  const filename = `${date}_${safe}.html`;
  const filePath = path.join(dir, filename);

  fs.writeFileSync(filePath, msg.body?.content || '', 'utf8');
  return filePath;
}

/**
 * Analyze EDM content with Claude API.
 */
function analyzeEdmContent(apiKey, subject, htmlContent, roasterId) {
  // Strip HTML tags for text analysis (keep under 4000 chars)
  const textContent = htmlContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  const body = JSON.stringify({
    model: MODELS.SONNET,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Analyze this coffee roaster marketing email (EDM). Subject: "${subject}". Sender: ${roasterId || 'unknown roaster'}.

Email text content:
${textContent}

Extract and return JSON with:
{
  "summary": "1-2 sentence summary of the email",
  "offers": ["list of specific offers/discounts"],
  "featured_products": ["product names mentioned"],
  "pricing_mentions": ["any specific prices mentioned"],
  "seasonal_theme": "seasonal theme if any (e.g. winter blend, holiday sale)",
  "urgency_signals": ["limited time", "last chance", etc.],
  "key_message": "primary marketing message in one sentence"
}

Return ONLY the JSON.`
    }]
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
          const text = parsed.content?.[0]?.text || '{}';
          const match = text.match(/\{[\s\S]*\}/);
          resolve(match ? JSON.parse(match[0]) : { summary: text });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { scrapeEDMs };
