const fs = require('fs');

function loadLearningStore(storePath) {
  const defaults = {
    version: 1,
    created: new Date().toISOString(),
    feedback: [],
    interactions: [],
    insightWeights: {},
    dismissedInsights: [],
    pinnedInsights: [],
    personNotes: {},
    projectNotes: {},
    metricAlerts: [],
    preferences: {
      defaultModule: 'summary',
      cadence: 'weekly',
      topMetrics: ['revenue','churn','ltv','ftbp_conversion','delivery_sla'],
      focusPeople: [],
      focusProjects: []
    },
    learnings: []
  };
  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const store = JSON.parse(raw);
    return { ...defaults, ...store, preferences: { ...defaults.preferences, ...(store.preferences || {}) } };
  } catch {
    return defaults;
  }
}

function saveLearningStore(storePath, store) {
  store.lastUpdated = new Date().toISOString();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

/** Compute adaptive insight weights based on feedback history */
function computeInsightWeights(store) {
  const weights = { ...store.insightWeights };
  store.pinnedInsights.forEach(id => { weights[id] = (weights[id] || 1) + 0.5; });
  store.dismissedInsights.forEach(id => { weights[id] = Math.max(0, (weights[id] || 1) - 0.3); });
  store.feedback.forEach(f => {
    if (f.type === 'insight') {
      weights[f.target] = (weights[f.target] || 1) + (f.value === 'up' ? 0.2 : -0.2);
    }
  });
  return weights;
}

/** Derive auto-learnings from interaction patterns */
function derivePatterns(store) {
  const patterns = [];
  const modCounts = {};
  store.interactions.forEach(i => { modCounts[i.module] = (modCounts[i.module] || 0) + 1; });
  const topMod = Object.entries(modCounts).sort((a,b) => b[1] - a[1])[0];
  if (topMod && topMod[1] > 5) {
    patterns.push({ pattern: `Most visited module: ${topMod[0]}`, confidence: Math.min(topMod[1] / 20, 1), source: 'interaction_frequency' });
  }
  const personViews = {};
  store.interactions.filter(i => i.type === 'person_view').forEach(i => { personViews[i.target] = (personViews[i.target] || 0) + 1; });
  Object.entries(personViews).filter(([,c]) => c > 3).forEach(([pid, count]) => {
    patterns.push({ pattern: `Frequently viewed person: ${pid}`, confidence: Math.min(count / 10, 1), source: 'person_attention' });
  });
  return patterns;
}

module.exports = { loadLearningStore, saveLearningStore, computeInsightWeights, derivePatterns };
