const { jsonReply, readBody } = require('../lib/helpers');
const db = require('../lib/db');

module.exports = async function handleFeedback(req, res, parts, url, ctx) {
  // GET /api/feedback — return learning dashboard state
  if (req.method === 'GET') {
    // Migrate from JSON on first access (one-time)
    db.migrateLearningFromJson(ctx.learningStore);

    const dashboard = db.getLearningDashboard();
    return jsonReply(res, 200, dashboard);
  }

  // POST /api/feedback — record feedback / interaction / etc.
  if (req.method === 'POST') {
    const data = await readBody(req);

    if (data.action === 'feedback') {
      db.recordFeedback(data.type, data.target, data.value, data.context);
      const weights = db.getInsightWeights();
      return jsonReply(res, 200, {
        ok: true,
        weights,
        totalFeedback: db.getInteractionStats().totalFeedback
      });
    }

    if (data.action === 'interaction') {
      db.recordInteraction(data.type, data.module, data.target, data.duration);
      return jsonReply(res, 200, { ok: true });
    }

    if (data.action === 'note') {
      db.addNote(data.type || 'person', data.target, data.note);
      return jsonReply(res, 200, { ok: true });
    }

    if (data.action === 'preference') {
      for (const [k, v] of Object.entries(data.preferences || {})) {
        db.setPreference(k, v);
      }
      return jsonReply(res, 200, { ok: true, preferences: db.getPreferences() });
    }

    if (data.action === 'alert') {
      db.setAlert(data.metricId, data.threshold, data.direction);
      return jsonReply(res, 200, { ok: true, alerts: db.getAlerts() });
    }

    if (data.action === 'delete_alert') {
      db.deleteAlert(data.alertId);
      return jsonReply(res, 200, { ok: true });
    }

    if (data.action === 'check_alerts') {
      const triggered = db.checkAlerts(data.metrics || {});
      return jsonReply(res, 200, { ok: true, triggered });
    }

    return jsonReply(res, 400, { error: 'Unknown action: ' + data.action });
  }
};
