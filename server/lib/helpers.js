const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function jsonReply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

/** Return the most-recent folder name inside a cadence dir */
function latestFolder(cadenceDir) {
  try {
    const entries = fs.readdirSync(cadenceDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    return entries[0] || null;
  } catch { return null; }
}

/** Read and parse a JSON file, return null on error */
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

/** Slugify a name for use as ID */
function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** List available extraction dates for a cadence */
function listExtractions(cadence, digestOutput) {
  const dir = path.join(digestOutput, cadence);
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
  } catch { return []; }
}

/** Read a markdown file from KB, return its contents or empty string */
function readMD(kbDir, relPath) {
  try { return fs.readFileSync(path.join(kbDir, relPath), 'utf-8'); } catch { return ''; }
}

/** Read POST body as a promise */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { MIME, jsonReply, latestFolder, readJSON, slugify, listExtractions, readMD, readBody };
