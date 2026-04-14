const fs = require('fs');
const path = require('path');

/**
 * CIBE Internal Data Pipeline (FR-001, FR-003)
 * Collects KPI data from Power BI API and beanz-digest extractions.
 * Stores snapshots in cibe_kpi_history for trend/anomaly analysis.
 */

const DIGEST_OUTPUT_DIR = path.join(require('os').homedir(), 'beanz-digest', 'output');

/**
 * Collect internal data from Power BI and beanz-digest.
 * Returns structured summary for briefing generation.
 */
async function collectInternalData(ctx) {
  const summary = {
    pbi: { available: false, metrics: {} },
    digest: { available: false, extractions: [] },
    collectedAt: new Date().toISOString()
  };

  // 1. Power BI DAX queries via existing API
  if (ctx.pbi?.tokenPath) {
    try {
      const pbiApi = require('../powerbi-api');
      const dax = require('../powerbi-dax');
      const tokenStatus = pbiApi.getTokenStatus(ctx);

      if (tokenStatus.available) {
        const datasets = await pbiApi.getDatasets(ctx);
        if (datasets.length > 0) {
          const dsId = datasets[0].id;
          const templates = ['kpi_overview', 'subscription_health', 'cancellation_trend', 'regional_breakdown', 'ftbp_funnel'];

          for (const name of templates) {
            try {
              const query = dax.buildQuery(name);
              const result = await pbiApi.executeDAXQuery(ctx, dsId, query);
              summary.pbi.metrics[name] = { rows: result.rows, columns: result.columns };
            } catch (e) {
              summary.pbi.metrics[name] = { error: e.message };
            }
          }
          summary.pbi.available = true;
          summary.pbi.datasetName = datasets[0].name;
        }
      }
    } catch (e) {
      summary.pbi.error = e.message;
    }
  }

  // 2. beanz-digest extraction files
  try {
    if (fs.existsSync(DIGEST_OUTPUT_DIR)) {
      const files = fs.readdirSync(DIGEST_OUTPUT_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-20); // Last 20 extractions

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DIGEST_OUTPUT_DIR, file), 'utf8'));
          summary.digest.extractions.push({
            file,
            extractedAt: data.extractedAt || data.timestamp,
            metrics: data.metrics || data.kpis || {},
            source: data.source || file.replace('.json', '')
          });
        } catch { /* skip malformed files */ }
      }
      summary.digest.available = summary.digest.extractions.length > 0;
    }
  } catch (e) {
    summary.digest.error = e.message;
  }

  return summary;
}

/**
 * Snapshot current KPIs into cibe_kpi_history for trend analysis.
 */
function snapshotKPIs(db, summary) {
  const stmt = db.prepare(`
    INSERT INTO cibe_kpi_history (metric_key, value, period, source)
    VALUES (?, ?, ?, ?)
  `);
  let count = 0;
  const period = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // From PBI metrics
  if (summary.pbi?.available) {
    for (const [template, data] of Object.entries(summary.pbi.metrics)) {
      if (data.error || !data.rows) continue;
      for (const row of data.rows) {
        // Each row may have multiple numeric columns — store each as a metric
        for (const [col, val] of Object.entries(row)) {
          if (typeof val === 'number') {
            stmt.run(`pbi.${template}.${col}`, val, period, 'pbi');
            count++;
          }
        }
      }
    }
  }

  // From beanz-digest extractions
  if (summary.digest?.available) {
    for (const ext of summary.digest.extractions) {
      if (!ext.metrics) continue;
      for (const [key, val] of Object.entries(ext.metrics)) {
        if (typeof val === 'number') {
          stmt.run(`digest.${ext.source}.${key}`, val, period, 'digest');
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Get KPI history for a specific metric.
 */
function getKPIHistory(db, metricKey, limit) {
  limit = limit || 60;
  return db.prepare(
    'SELECT * FROM cibe_kpi_history WHERE metric_key = ? ORDER BY captured_at DESC LIMIT ?'
  ).all(metricKey, limit);
}

/**
 * Get all distinct metric keys with latest values.
 */
function getLatestKPIs(db) {
  return db.prepare(`
    SELECT metric_key, value, period, source, captured_at
    FROM cibe_kpi_history
    WHERE captured_at = (
      SELECT MAX(captured_at) FROM cibe_kpi_history kh2 WHERE kh2.metric_key = cibe_kpi_history.metric_key
    )
    ORDER BY metric_key
  `).all();
}

/**
 * Get internal summary for the API — combines live PBI + historical.
 */
async function getInternalSummary(ctx, db) {
  const liveData = await collectInternalData(ctx);
  const latestKPIs = getLatestKPIs(db);

  // Snapshot if we have fresh data
  if (liveData.pbi.available || liveData.digest.available) {
    const snapshotCount = snapshotKPIs(db, liveData);
    liveData.snapshotted = snapshotCount;
  }

  return {
    live: liveData,
    history: {
      metricCount: latestKPIs.length,
      metrics: latestKPIs.slice(0, 50) // Limit for API response size
    }
  };
}

module.exports = {
  collectInternalData,
  snapshotKPIs,
  getKPIHistory,
  getLatestKPIs,
  getInternalSummary
};
