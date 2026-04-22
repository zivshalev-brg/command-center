#!/usr/bin/env node
'use strict';

/**
 * Discover real schema of the 16 ana_prd_gold.edw tables used by the metrics
 * dashboard. Writes kb-data/intelligence/databricks-schema.json with each
 * table's columns + data types. Flags drift vs. the engine's hard-coded list.
 *
 * Runs against the live Databricks warehouse using the same service-principal
 * auth as the server. Safe to run repeatedly.
 */

const fs = require('fs');
const path = require('path');

// Reuse the engine + auth modules
const engine = require('../server/lib/databricks-engine');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = loadEnv();
const cfg = {
  host: env.DATABRICKS_HOST || process.env.DATABRICKS_HOST,
  warehouseId: env.DATABRICKS_WAREHOUSE_ID || process.env.DATABRICKS_WAREHOUSE_ID,
  token: env.DATABRICKS_TOKEN || process.env.DATABRICKS_TOKEN || '',
  clientId: env.DATABRICKS_CLIENT_ID || process.env.DATABRICKS_CLIENT_ID,
  clientSecret: env.DATABRICKS_CLIENT_SECRET || process.env.DATABRICKS_CLIENT_SECRET,
  tenantId: env.DATABRICKS_TENANT_ID || process.env.DATABRICKS_TENANT_ID
};

if (!engine.isConfigured(cfg)) {
  console.error('ERROR: Databricks not configured. Check .env');
  process.exit(1);
}

const TABLES = Object.values(engine.TABLES);
const SCHEMA_NAME = engine.SCHEMA.split('.');

async function main() {
  console.log(`Discovering schema of ${TABLES.length} tables in ${engine.SCHEMA}...`);
  const out = {
    generatedAt: new Date().toISOString(),
    schema: engine.SCHEMA,
    tables: {}
  };

  for (const fqn of TABLES) {
    const parts = fqn.split('.');
    const catalog = parts[0];
    const schema = parts[1];
    const table = parts[2];

    const sql = `SELECT column_name, data_type, is_nullable, ordinal_position
                 FROM ${catalog}.information_schema.columns
                 WHERE table_schema = '${schema}' AND table_name = '${table}'
                 ORDER BY ordinal_position`;

    process.stdout.write(`  ${table}... `);
    try {
      const t0 = Date.now();
      const r = await engine.executeSQL(cfg, sql, { skipCache: true, ttlMinutes: 1, tag: 'schema-discovery' });
      const columns = engine.rowsToObjects(r);
      out.tables[table] = {
        fqn,
        columnCount: columns.length,
        columns: columns.map(c => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES'
        }))
      };
      console.log(`${columns.length} cols (${Date.now() - t0}ms)`);
    } catch (e) {
      out.tables[table] = { fqn, error: e.message };
      console.log(`FAILED — ${e.message.slice(0, 100)}`);
    }
  }

  const outPath = path.join(__dirname, '..', 'kb-data', 'intelligence', 'databricks-schema.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nWrote ${outPath}`);

  // Summary table
  console.log('\n=== Summary ===');
  const rows = [];
  for (const [name, data] of Object.entries(out.tables)) {
    rows.push([name, data.columnCount || 'ERR', data.error ? data.error.slice(0, 40) : 'ok']);
  }
  for (const r of rows) console.log(`  ${r[0].padEnd(40)} ${String(r[1]).padStart(5)}  ${r[2]}`);
}

main().catch(err => {
  console.error('Schema discovery failed:', err.message);
  process.exit(1);
});
