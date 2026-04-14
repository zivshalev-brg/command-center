// ===============================================================
// SELF-LEARNING ENGINE
// ===============================================================
/** Send feedback to the learning API */
async function sendFeedback(type, target, value, context) {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feedback', type, target, value, context: context || {} })
    });
    const feedbackMsg = { up: 'Boosted', down: 'Reduced weight', pin: 'Pinned', dismiss: 'Dismissed' }[value] || 'Recorded';
    toast(`${feedbackMsg} — system learning`, 'ok');
  } catch (e) {
    toast('Feedback saved locally', 'ok');
  }
}

/** Track interaction for adaptive learning */
function trackInteraction(type, module, target) {
  // Fire and forget — don't block UI
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'interaction', type, module, target })
  }).catch(() => {});
}

/** Load adaptive metrics from the metrics engine API (for learning/alerts) */
async function loadMetricsEngineLearning() {
  if (DATA._metricsEngine) return; // already loaded
  try {
    const resp = await fetch('/api/metrics');
    if (!resp.ok) return;
    DATA._metricsEngine = await resp.json();
    // Check alerts against live metrics
    if (typeof checkMetricAlerts === 'function') checkMetricAlerts();
  } catch {}
}

/** Load feedback/learning state */
async function loadLearningState() {
  try {
    const resp = await fetch('/api/feedback');
    if (!resp.ok) return;
    DATA._learningState = await resp.json();
  } catch {}
}
