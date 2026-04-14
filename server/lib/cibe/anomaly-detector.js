/**
 * CIBE Anomaly Detector (FR-004)
 * Flags KPI values that deviate significantly from trailing averages.
 * Uses 8-week trailing mean + stddev, flags >2 std deviations.
 */

/**
 * Detect anomalies across all metrics in cibe_kpi_history.
 * Returns array of { metric, currentValue, baseline, stddev, deviation, severity, direction }
 */
function detectAnomalies(db, options = {}) {
  const threshold = options.threshold || 2.0;  // std deviations
  const trailingWeeks = options.trailingWeeks || 8;
  const cutoffDate = new Date(Date.now() - trailingWeeks * 7 * 86400000).toISOString().slice(0, 10);

  // Get distinct metrics that have enough history
  const metrics = db.prepare(`
    SELECT metric_key, COUNT(*) as data_points
    FROM cibe_kpi_history
    WHERE captured_at >= ?
    GROUP BY metric_key
    HAVING data_points >= 3
  `).all(cutoffDate);

  const anomalies = [];

  for (const { metric_key } of metrics) {
    // Get trailing values (oldest first)
    const rows = db.prepare(`
      SELECT value, period, captured_at
      FROM cibe_kpi_history
      WHERE metric_key = ? AND captured_at >= ?
      ORDER BY captured_at ASC
    `).all(metric_key, cutoffDate);

    if (rows.length < 3) continue;

    // Latest value is the one we're checking
    const current = rows[rows.length - 1];
    // Trailing baseline excludes the latest value
    const trailing = rows.slice(0, -1);

    const mean = trailing.reduce((s, r) => s + r.value, 0) / trailing.length;
    const variance = trailing.reduce((s, r) => s + Math.pow(r.value - mean, 2), 0) / trailing.length;
    const stddev = Math.sqrt(variance);

    // Avoid division by zero — skip metrics with no variance
    if (stddev === 0) continue;

    const deviation = (current.value - mean) / stddev;
    const absDeviation = Math.abs(deviation);

    if (absDeviation >= threshold) {
      anomalies.push({
        metric: metric_key,
        currentValue: current.value,
        baseline: Math.round(mean * 100) / 100,
        stddev: Math.round(stddev * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        absDeviation: Math.round(absDeviation * 100) / 100,
        severity: absDeviation >= 3 ? 'critical' : 'warning',
        direction: deviation > 0 ? 'above' : 'below',
        period: current.period,
        dataPoints: trailing.length
      });
    }
  }

  // Sort by absolute deviation descending (most anomalous first)
  anomalies.sort((a, b) => b.absDeviation - a.absDeviation);
  return anomalies;
}

/**
 * Get anomaly summary (count by severity).
 */
function getAnomalySummary(db) {
  const anomalies = detectAnomalies(db);
  return {
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    warning: anomalies.filter(a => a.severity === 'warning').length,
    anomalies
  };
}

module.exports = { detectAnomalies, getAnomalySummary };
