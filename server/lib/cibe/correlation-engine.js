/**
 * CIBE Correlation Engine (FR-021)
 * Cross-references internal Beanz metrics with external market signals
 * to surface actionable correlations for strategy and briefings.
 *
 * Correlation types:
 * - Price position: Beanz vs market average
 * - Catalogue gaps: competitor launches vs Beanz offerings
 * - Messaging trends: homepage themes vs Beanz churn
 * - Regional pressure: pricing trends by market
 */

/**
 * Compute all correlations from available data.
 * @param {object} db - SQLite database
 * @param {object} ctx - Server context
 * @returns {Array<{ id, type, severity, title, summary, data }>}
 */
function computeCorrelations(db, ctx) {
  const correlations = [];

  correlations.push(...computePricePositionCorrelations(db));
  correlations.push(...computeCatalogueGapCorrelations(db));
  correlations.push(...computeRegionalPressureCorrelations(db));
  correlations.push(...computeCompetitorActivityCorrelations(db));
  correlations.push(...computeAnomalyCorrelations(db));

  // Sort by severity: critical > warning > info
  const severityOrder = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  correlations.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

  return correlations;
}

/**
 * Price position: Compare Beanz pricing vs market averages.
 */
function computePricePositionCorrelations(db) {
  const correlations = [];

  try {
    // Get average price by origin across all roasters
    const marketAvg = db.prepare(`
      SELECT origin, AVG(price_cents) as avg_price, COUNT(*) as cnt
      FROM cibe_products
      WHERE origin IS NOT NULL AND price_cents > 0
      GROUP BY origin
      HAVING cnt >= 3
    `).all();

    if (!marketAvg.length) return correlations;

    // Check for extreme outliers that might indicate pricing pressure
    for (const mkt of marketAvg) {
      // Check roasters significantly below market (potential race to bottom)
      const cheapest = db.prepare(`
        SELECT r.name, p.name as product, p.price_cents
        FROM cibe_products p JOIN cibe_roasters r ON r.id = p.roaster_id
        WHERE p.origin = ? AND p.price_cents < ? AND p.price_cents > 0
        ORDER BY p.price_cents ASC LIMIT 3
      `).all(mkt.origin, mkt.avg_price * 0.7);

      if (cheapest.length >= 2) {
        correlations.push({
          id: `price-pressure-${mkt.origin}`,
          type: 'price_position',
          severity: 'warning',
          title: `Pricing pressure on ${mkt.origin} coffees`,
          summary: `${cheapest.length} roasters pricing ${mkt.origin} origin 30%+ below market avg ($${(mkt.avg_price / 100).toFixed(2)})`,
          data: { origin: mkt.origin, marketAvg: mkt.avg_price, cheapProducts: cheapest }
        });
      }
    }

    // Premium opportunity: origins with high avg price and low product count
    const premiumGaps = marketAvg.filter(m => m.avg_price > 3000 && m.cnt < 5);
    for (const gap of premiumGaps) {
      correlations.push({
        id: `premium-gap-${gap.origin}`,
        type: 'price_position',
        severity: 'opportunity',
        title: `Premium opportunity: ${gap.origin}`,
        summary: `${gap.origin} origin has high avg price ($${(gap.avg_price / 100).toFixed(2)}) with only ${gap.cnt} products tracked — potential premium positioning`,
        data: gap
      });
    }
  } catch { /* no data yet */ }

  return correlations;
}

/**
 * Catalogue gaps: New competitor products not matched by Beanz.
 */
function computeCatalogueGapCorrelations(db) {
  const correlations = [];

  try {
    // Products added in the last 14 days
    const newProducts = db.prepare(`
      SELECT p.roaster_id, r.name as roaster_name, COUNT(*) as new_count,
             GROUP_CONCAT(p.name, ', ') as products
      FROM cibe_products p
      JOIN cibe_roasters r ON r.id = p.roaster_id
      WHERE p.first_seen >= datetime('now', '-14 days')
      GROUP BY p.roaster_id
      HAVING new_count >= 3
    `).all();

    for (const np of newProducts) {
      correlations.push({
        id: `new-launch-${np.roaster_id}`,
        type: 'catalogue_gap',
        severity: 'info',
        title: `${np.roaster_name}: ${np.new_count} new products`,
        summary: `${np.roaster_name} launched ${np.new_count} new products in the last 14 days: ${np.products.slice(0, 100)}`,
        data: np
      });
    }

    // Origins popular among competitors but potentially missing from Beanz
    const popularOrigins = db.prepare(`
      SELECT origin, COUNT(DISTINCT roaster_id) as roaster_count, COUNT(*) as product_count
      FROM cibe_products
      WHERE origin IS NOT NULL
      GROUP BY origin
      HAVING roaster_count >= 3
      ORDER BY roaster_count DESC
    `).all();

    if (popularOrigins.length) {
      correlations.push({
        id: 'popular-origins',
        type: 'catalogue_gap',
        severity: 'info',
        title: 'Most common origins across competitors',
        summary: popularOrigins.slice(0, 5).map(o => `${o.origin} (${o.roaster_count} roasters, ${o.product_count} products)`).join('; '),
        data: { origins: popularOrigins.slice(0, 10) }
      });
    }
  } catch { /* no data yet */ }

  return correlations;
}

/**
 * Regional pricing pressure across AU/UK/US/DE.
 */
function computeRegionalPressureCorrelations(db) {
  const correlations = [];

  try {
    const byRegion = db.prepare(`
      SELECT r.country, AVG(p.price_cents) as avg_price, COUNT(*) as product_count,
             MIN(p.price_cents) as min_price, MAX(p.price_cents) as max_price
      FROM cibe_products p
      JOIN cibe_roasters r ON r.id = p.roaster_id
      WHERE p.price_cents > 0
      GROUP BY r.country
      HAVING product_count >= 3
    `).all();

    if (byRegion.length >= 2) {
      // Find regions with widest price spread (potential instability)
      for (const region of byRegion) {
        const spread = region.max_price - region.min_price;
        const spreadPct = spread / region.avg_price;

        if (spreadPct > 2.0) {
          correlations.push({
            id: `price-spread-${region.country}`,
            type: 'regional_pressure',
            severity: 'warning',
            title: `Wide price spread in ${region.country}`,
            summary: `${region.country} market shows ${Math.round(spreadPct * 100)}% price spread ($${(region.min_price / 100).toFixed(2)}-$${(region.max_price / 100).toFixed(2)}), indicating fragmented positioning`,
            data: region
          });
        }
      }

      // Cross-region price comparison
      correlations.push({
        id: 'regional-price-comparison',
        type: 'regional_pressure',
        severity: 'info',
        title: 'Regional pricing overview',
        summary: byRegion.map(r => `${r.country}: avg $${(r.avg_price / 100).toFixed(2)} (${r.product_count} products)`).join('; '),
        data: { regions: byRegion }
      });
    }
  } catch { /* no data yet */ }

  return correlations;
}

/**
 * Competitor activity from homepage changes + EDMs.
 */
function computeCompetitorActivityCorrelations(db) {
  const correlations = [];

  try {
    // Roasters with frequent homepage changes (high activity)
    const activeRoasters = db.prepare(`
      SELECT h.roaster_id, r.name, COUNT(*) as change_count
      FROM cibe_homepage_snapshots h
      JOIN cibe_roasters r ON r.id = h.roaster_id
      WHERE h.detected_changes IS NOT NULL
        AND h.captured_at >= datetime('now', '-30 days')
      GROUP BY h.roaster_id
      HAVING change_count >= 3
      ORDER BY change_count DESC
    `).all();

    if (activeRoasters.length) {
      correlations.push({
        id: 'high-activity-roasters',
        type: 'competitor_activity',
        severity: 'info',
        title: 'Most active competitors (homepage changes)',
        summary: activeRoasters.map(r => `${r.name}: ${r.change_count} changes`).join('; '),
        data: { roasters: activeRoasters }
      });
    }

    // Recent EDM activity spikes
    const edmActivity = db.prepare(`
      SELECT roaster_id, COUNT(*) as edm_count
      FROM cibe_edms
      WHERE received_at >= datetime('now', '-14 days')
      GROUP BY roaster_id
      HAVING edm_count >= 3
    `).all();

    for (const ea of edmActivity) {
      correlations.push({
        id: `edm-spike-${ea.roaster_id}`,
        type: 'competitor_activity',
        severity: 'warning',
        title: `EDM spike: ${ea.roaster_id}`,
        summary: `${ea.roaster_id} sent ${ea.edm_count} marketing emails in 14 days — potential campaign in progress`,
        data: ea
      });
    }
  } catch { /* no data yet */ }

  return correlations;
}

/**
 * Cross-reference anomalies with external signals.
 */
function computeAnomalyCorrelations(db) {
  const correlations = [];

  try {
    const { detectAnomalies } = require('./anomaly-detector');
    const anomalies = detectAnomalies(db);

    // Flag critical anomalies that coincide with competitor activity
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length) {
      const recentChanges = db.prepare(`
        SELECT COUNT(*) as cnt FROM cibe_homepage_snapshots
        WHERE detected_changes IS NOT NULL AND captured_at >= datetime('now', '-7 days')
      `).get();

      if (recentChanges.cnt >= 3) {
        correlations.push({
          id: 'anomaly-competitor-coincidence',
          type: 'anomaly_correlation',
          severity: 'critical',
          title: 'KPI anomalies coincide with competitor activity',
          summary: `${criticalAnomalies.length} critical KPI anomalies detected alongside ${recentChanges.cnt} competitor homepage changes this week — investigate potential market-driven impact`,
          data: {
            anomalies: criticalAnomalies.map(a => a.metric),
            competitorChanges: recentChanges.cnt
          }
        });
      }
    }
  } catch { /* no data yet */ }

  return correlations;
}

/**
 * Get correlation summary for dashboard.
 */
function getCorrelationSummary(db, ctx) {
  const correlations = computeCorrelations(db, ctx);
  return {
    total: correlations.length,
    critical: correlations.filter(c => c.severity === 'critical').length,
    warning: correlations.filter(c => c.severity === 'warning').length,
    opportunity: correlations.filter(c => c.severity === 'opportunity').length,
    info: correlations.filter(c => c.severity === 'info').length,
    correlations
  };
}

module.exports = {
  computeCorrelations,
  getCorrelationSummary
};
