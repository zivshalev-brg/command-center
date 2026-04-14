const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'kb-data', 'cibe', 'roaster-registry.json');

/**
 * Seed roasters from JSON into SQLite (idempotent — skips existing).
 */
function seedRoasters(db) {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.warn('[CIBE] roaster-registry.json not found — skipping seed');
    return 0;
  }
  const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cibe_roasters
      (id, name, country, type, website, shop_url, instagram, edm_from, scrape_config, beanz_partner, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  let inserted = 0;
  for (const r of data.roasters) {
    const res = stmt.run(
      r.id, r.name, r.country, r.type || 'roaster',
      r.website, r.shop_url, r.instagram, r.edm_from,
      r.scrape_config ? JSON.stringify(r.scrape_config) : null,
      r.beanz_partner ? 1 : 0
    );
    if (res.changes > 0) inserted++;
  }
  if (inserted > 0) console.log(`[CIBE] Seeded ${inserted} roasters`);
  return inserted;
}

/**
 * Get all active roasters.
 */
function getActiveRoasters(db) {
  return db.prepare('SELECT * FROM cibe_roasters WHERE active = 1 ORDER BY country, name').all()
    .map(normalizeRoaster);
}

/**
 * Get roasters filtered by country.
 */
function getRoastersByCountry(db, country) {
  return db.prepare('SELECT * FROM cibe_roasters WHERE active = 1 AND country = ? ORDER BY name').all(country)
    .map(normalizeRoaster);
}

/**
 * Get a single roaster by ID.
 */
function getRoaster(db, id) {
  const row = db.prepare('SELECT * FROM cibe_roasters WHERE id = ?').get(id);
  return row ? normalizeRoaster(row) : null;
}

/**
 * Add or update a roaster.
 */
function upsertRoaster(db, roaster) {
  const stmt = db.prepare(`
    INSERT INTO cibe_roasters (id, name, country, type, website, shop_url, instagram, edm_from, scrape_config, beanz_partner, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, country = excluded.country, type = excluded.type,
      website = excluded.website, shop_url = excluded.shop_url,
      instagram = excluded.instagram, edm_from = excluded.edm_from,
      scrape_config = excluded.scrape_config, beanz_partner = excluded.beanz_partner,
      active = excluded.active, updated_at = datetime('now')
  `);
  return stmt.run(
    roaster.id, roaster.name, roaster.country, roaster.type || 'roaster',
    roaster.website, roaster.shop_url, roaster.instagram, roaster.edm_from,
    roaster.scrape_config ? JSON.stringify(roaster.scrape_config) : null,
    roaster.beanz_partner ? 1 : 0,
    roaster.active !== undefined ? (roaster.active ? 1 : 0) : 1
  );
}

function normalizeRoaster(row) {
  return {
    ...row,
    scrape_config: row.scrape_config ? JSON.parse(row.scrape_config) : null,
    beanz_partner: !!row.beanz_partner,
    active: !!row.active
  };
}

module.exports = { seedRoasters, getActiveRoasters, getRoastersByCountry, getRoaster, upsertRoaster };
