/**
 * Price Aggregator — Cross-roaster price analysis
 *
 * FR-014: Competitive pricing comparisons by origin, roast level, process, region
 */

/**
 * Get price aggregation across all tracked products
 * @param {object} db - SQLite database
 * @returns {{ byOrigin: Array, byRoastLevel: Array, byRoaster: Array, outliers: Array }}
 */
function getPriceAggregation(db) {
  // Average $/kg by origin
  const byOrigin = db.prepare(`
    SELECT origin, COUNT(*) as product_count,
           ROUND(AVG(price_cents * 1000.0 / NULLIF(weight_g, 0)), 0) as avg_price_per_kg_cents,
           ROUND(MIN(price_cents * 1000.0 / NULLIF(weight_g, 0)), 0) as min_price_per_kg_cents,
           ROUND(MAX(price_cents * 1000.0 / NULLIF(weight_g, 0)), 0) as max_price_per_kg_cents,
           currency
    FROM cibe_products
    WHERE price_cents > 0 AND weight_g > 0 AND origin IS NOT NULL
    GROUP BY origin, currency
    HAVING product_count >= 2
    ORDER BY avg_price_per_kg_cents DESC
  `).all();

  // Average $/kg by roast level
  const byRoastLevel = db.prepare(`
    SELECT roast_level, COUNT(*) as product_count,
           ROUND(AVG(price_cents * 1000.0 / NULLIF(weight_g, 0)), 0) as avg_price_per_kg_cents,
           currency
    FROM cibe_products
    WHERE price_cents > 0 AND weight_g > 0 AND roast_level IS NOT NULL
    GROUP BY roast_level, currency
    HAVING product_count >= 2
    ORDER BY avg_price_per_kg_cents DESC
  `).all();

  // Average price per roaster (for competitive positioning)
  const byRoaster = db.prepare(`
    SELECT p.roaster_id, r.name as roaster_name, r.type as roaster_type,
           COUNT(*) as product_count,
           ROUND(AVG(p.price_cents * 1000.0 / NULLIF(p.weight_g, 0)), 0) as avg_price_per_kg_cents,
           ROUND(AVG(p.price_cents), 0) as avg_unit_price_cents,
           p.currency
    FROM cibe_products p
    JOIN cibe_roasters r ON p.roaster_id = r.id
    WHERE p.price_cents > 0 AND p.weight_g > 0
    GROUP BY p.roaster_id, p.currency
    ORDER BY avg_price_per_kg_cents DESC
  `).all();

  return { byOrigin, byRoastLevel, byRoaster, outliers: findOutliers(db) };
}

/**
 * Find products priced significantly above/below market average
 * @param {object} db - SQLite database
 * @returns {Array} Products flagged as outliers
 */
function findOutliers(db) {
  // Get market average $/kg
  const marketAvg = db.prepare(`
    SELECT ROUND(AVG(price_cents * 1000.0 / NULLIF(weight_g, 0)), 0) as avg,
           ROUND(AVG(price_cents * 1000.0 / NULLIF(weight_g, 0)) * 1.15, 0) as high_threshold,
           ROUND(AVG(price_cents * 1000.0 / NULLIF(weight_g, 0)) * 0.80, 0) as low_threshold
    FROM cibe_products
    WHERE price_cents > 0 AND weight_g > 0
  `).get();

  if (!marketAvg || !marketAvg.avg) return [];

  // Find products outside thresholds
  const outliers = db.prepare(`
    SELECT p.*, r.name as roaster_name,
           ROUND(p.price_cents * 1000.0 / NULLIF(p.weight_g, 0), 0) as price_per_kg_cents,
           ? as market_avg_per_kg_cents,
           CASE
             WHEN (p.price_cents * 1000.0 / NULLIF(p.weight_g, 0)) > ? THEN 'above'
             WHEN (p.price_cents * 1000.0 / NULLIF(p.weight_g, 0)) < ? THEN 'below'
           END as direction,
           ROUND(ABS((p.price_cents * 1000.0 / NULLIF(p.weight_g, 0)) - ?) / ? * 100, 1) as deviation_pct
    FROM cibe_products p
    JOIN cibe_roasters r ON p.roaster_id = r.id
    WHERE p.price_cents > 0 AND p.weight_g > 0
      AND ((p.price_cents * 1000.0 / p.weight_g) > ? OR (p.price_cents * 1000.0 / p.weight_g) < ?)
    ORDER BY deviation_pct DESC
    LIMIT 20
  `).all(
    marketAvg.avg,
    marketAvg.high_threshold,
    marketAvg.low_threshold,
    marketAvg.avg, marketAvg.avg,
    marketAvg.high_threshold,
    marketAvg.low_threshold
  );

  return outliers;
}

/**
 * Get recent price changes across all roasters
 * @param {object} db - SQLite database
 * @param {number} days - Look back period
 * @returns {Array} Products with price changes
 */
function getRecentPriceChanges(db, days = 30) {
  const products = db.prepare(`
    SELECT p.*, r.name as roaster_name
    FROM cibe_products p
    JOIN cibe_roasters r ON p.roaster_id = r.id
    WHERE p.price_history IS NOT NULL
      AND json_array_length(p.price_history) > 0
      AND p.last_seen > datetime('now', '-' || ? || ' days')
    ORDER BY p.last_seen DESC
  `).all(days);

  return products.filter(p => {
    try {
      const history = JSON.parse(p.price_history || '[]');
      return history.length > 0;
    } catch { return false; }
  }).map(p => {
    const history = JSON.parse(p.price_history || '[]');
    const latest = history[history.length - 1];
    return {
      ...p,
      priceChanges: history,
      lastChange: latest
    };
  });
}

module.exports = { getPriceAggregation, findOutliers, getRecentPriceChanges };
