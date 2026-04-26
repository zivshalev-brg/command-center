/**
 * notebook-ingest.js — Text extraction, URL fetch, chunking.
 *
 * Extractors:
 *   - txt/md/csv/json: pass-through
 *   - pdf: via pdf-parse (optional; returns error if not installed)
 *   - docx: via mammoth (optional; returns error if not installed)
 *   - url: https fetch + readability-style extraction (zero dep)
 */

'use strict';

const https = require('https');
const http = require('http');
const url = require('url');

const CHUNK_SIZE = 1400;   // chars
const CHUNK_OVERLAP = 200;

/** Best-effort text extraction from a Buffer + mime/filename hint. */
async function extractText({ filename, mime, buffer }) {
  const lower = (filename || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || (mime || '').includes('pdf');
  const isDocx = lower.endsWith('.docx') || (mime || '').includes('wordprocessingml');
  const isCsv = lower.endsWith('.csv') || (mime || '').includes('csv');
  const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || (mime || '').includes('spreadsheet') || (mime || '').includes('excel');
  const isPptx = lower.endsWith('.pptx') || lower.endsWith('.ppt') || (mime || '').includes('presentation');

  if (isXlsx) {
    try {
      const xlsx = require('xlsx');
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const parts = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv && csv.trim()) parts.push('## Sheet: ' + name + '\n\n' + csv);
      }
      return { text: parts.join('\n\n'), warnings: [] };
    } catch (e) { return { text: '', warnings: ['xlsx unavailable: ' + e.message] }; }
  }
  if (isPptx) {
    try {
      const text = await extractPptxText(buffer);
      return { text, warnings: text ? [] : ['No text extracted — slides may only contain images.'] };
    } catch (e) { return { text: '', warnings: ['pptx extraction failed: ' + e.message] }; }
  }
  if (isPdf) {
    try {
      const pdfModule = require('pdf-parse');
      // Support both v1 (function) and v2 (class) APIs
      if (typeof pdfModule === 'function') {
        const data = await pdfModule(buffer);
        return { text: (data.text || '').trim(), warnings: [] };
      }
      if (pdfModule && pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        try {
          const out = await parser.getText();
          const text = (out && typeof out.text === 'string' ? out.text : (Array.isArray(out && out.pages) ? out.pages.map(p => p.text || '').join('\n\n') : '')).trim();
          return { text, warnings: [] };
        } finally {
          try { parser.destroy && parser.destroy(); } catch {}
        }
      }
      return { text: '', warnings: ['pdf-parse installed but API unrecognised.'] };
    } catch (e) {
      return { text: '', warnings: ['pdf-parse unavailable: ' + e.message + '. Run `npm install pdf-parse` for PDF support.'] };
    }
  }
  if (isDocx) {
    try {
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({ buffer });
      return { text: (out.value || '').trim(), warnings: out.messages && out.messages.length ? out.messages.map(m => m.message) : [] };
    } catch (e) {
      return { text: '', warnings: ['mammoth unavailable: ' + e.message + '. Run `npm install mammoth` for DOCX support.'] };
    }
  }
  // TXT / MD / CSV / JSON / plain fallback
  let text = buffer.toString('utf8');
  if (isCsv) text = text.replace(/,/g, ' · '); // readable pipe
  return { text: text.trim(), warnings: [] };
}

/** Fetch a URL and return best-effort plain text. */
function fetchUrl(urlStr, { timeoutMs = 10000, maxBytes = 2 * 1024 * 1024, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const mod = u.protocol === 'http:' ? http : https;
      const req = mod.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search || ''),
        method: 'GET',
        // Use a real-browser UA so paywalled / Cloudflare-fronted articles return content.
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        // Corporate networks intercept TLS — don't fail on unverified cert chain.
        rejectUnauthorized: false
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          res.resume();
          return fetchUrl(nextUrl, { timeoutMs, maxBytes, redirects: redirects - 1 }).then(resolve, reject);
        }
        if (res.statusCode >= 400) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        let chunks = []; let total = 0;
        res.on('data', (c) => { total += c.length; if (total > maxBytes) { req.destroy(); return reject(new Error('Response too large')); } chunks.push(c); });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const contentType = (res.headers['content-type'] || '').toLowerCase();
          const pageTitle = extractTitle(body);
          const extracted = contentType.includes('text/html') ? htmlToText(body) : body.trim();
          resolve({ title: pageTitle || urlStr, text: extracted, contentType, finalUrl: urlStr });
        });
        res.on('error', reject);
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timed out')); });
      req.on('error', reject);
      req.end();
    } catch (e) { reject(e); }
  });
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, ' ').slice(0, 200);
}

/** Readability-style HTML → plain text. Strip head/script/style/nav/footer, then extract body text. */
function htmlToText(html) {
  let s = html || '';
  // Remove head + scripts + styles + svg + nav + footer + header + aside + noscript + iframe + form
  s = s.replace(/<head[\s\S]*?<\/head>/gi, '')
       .replace(/<script[\s\S]*?<\/script>/gi, '')
       .replace(/<style[\s\S]*?<\/style>/gi, '')
       .replace(/<svg[\s\S]*?<\/svg>/gi, '')
       .replace(/<nav[\s\S]*?<\/nav>/gi, '')
       .replace(/<footer[\s\S]*?<\/footer>/gi, '')
       .replace(/<header[\s\S]*?<\/header>/gi, '')
       .replace(/<aside[\s\S]*?<\/aside>/gi, '')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
       .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
       .replace(/<form[\s\S]*?<\/form>/gi, '');
  // Block-level → newlines
  s = s.replace(/<(p|div|section|article|h[1-6]|li|br|tr|pre|blockquote)[^>]*>/gi, '\n');
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&(?:rsquo|lsquo);/g, "'").replace(/&(?:rdquo|ldquo);/g, '"').replace(/&(?:mdash|ndash);/g, '—');
  // Collapse whitespace
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();
  return s;
}

/** Chunk text into overlapping windows, splitting on paragraph boundaries when possible. */
function chunkText(text) {
  if (!text) return [];
  const chunks = [];
  let pos = 0;
  const len = text.length;
  while (pos < len) {
    const end = Math.min(len, pos + CHUNK_SIZE);
    let cut = end;
    if (end < len) {
      // Prefer paragraph or sentence boundary near the cut
      const lookback = Math.max(pos + CHUNK_SIZE - 300, pos + 1);
      const window = text.slice(lookback, end);
      const paraIdx = window.lastIndexOf('\n\n');
      const sentIdx = window.lastIndexOf('. ');
      if (paraIdx >= 0) cut = lookback + paraIdx + 2;
      else if (sentIdx >= 0) cut = lookback + sentIdx + 2;
    }
    chunks.push({ content: text.slice(pos, cut).trim(), start: pos, end: cut });
    if (cut >= len) break;
    pos = Math.max(cut - CHUNK_OVERLAP, pos + 1);
  }
  return chunks.filter(c => c.content.length > 0);
}

/** Extract plain text from a .pptx Buffer (zip with XML slides). */
async function extractPptxText(buffer) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const ai = parseInt((a.match(/slide(\d+)\.xml/i) || [])[1] || '0', 10);
      const bi = parseInt((b.match(/slide(\d+)\.xml/i) || [])[1] || '0', 10);
      return ai - bi;
    });
  if (!slidePaths.length) return '';
  const blocks = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i]).async('string');
    // Pull all <a:t>…</a:t> text nodes (run text) in document order
    const texts = [];
    const rgx = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = rgx.exec(xml)) !== null) {
      const chunk = m[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      if (chunk.trim()) texts.push(chunk);
    }
    if (texts.length) blocks.push('## Slide ' + (i + 1) + '\n\n' + texts.join('\n'));
  }
  // Also pull speaker notes if present
  const notePaths = Object.keys(zip.files).filter(p => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p))
    .sort();
  for (const np of notePaths) {
    const xml = await zip.file(np).async('string');
    const texts = [];
    const rgx = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = rgx.exec(xml)) !== null) {
      const t = m[1].trim();
      if (t) texts.push(t);
    }
    if (texts.length) {
      const num = (np.match(/(\d+)/) || ['',''])[1];
      blocks.push('### Notes for slide ' + num + '\n\n' + texts.join('\n'));
    }
  }
  return blocks.join('\n\n');
}

module.exports = { extractText, fetchUrl, chunkText };
