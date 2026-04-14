const path = require('path');
const { jsonReply, readJSON, slugify } = require('../lib/helpers');
const { loadLearningStore } = require('../lib/learning');

module.exports = function handleIntelligence(req, res, parts, url, ctx) {
  // GET /api/intelligence
  if (parts.length === 1) {
    const teamDir = readJSON(path.join(ctx.intelDir, 'team-directory.json'));
    const projects = readJSON(path.join(ctx.intelDir, 'project-updates.json'));
    const powerbi = readJSON(path.join(ctx.intelDir, 'powerbi-context.json'));
    return jsonReply(res, 200, {
      generated: new Date().toISOString(),
      team: teamDir,
      projects: projects,
      powerbi: powerbi,
      sources: ['outlook_email', 'teams_chat', 'kb_data']
    });
  }
};

module.exports.handlePeople = function(req, res, parts, url, ctx) {
  const teamDir = readJSON(path.join(ctx.intelDir, 'team-directory.json'));
  const store = loadLearningStore(ctx.learningStore);
  const enriched = {
    team: (teamDir?.team || []).map(person => ({
      ...person,
      notes: store.personNotes[slugify(person.name)] || [],
      viewCount: store.interactions.filter(i => i.type === 'person_view' && i.target === slugify(person.name)).length
    })),
    external: teamDir?.key_external || [],
    orgInsights: teamDir?.org_insights || {}
  };
  return jsonReply(res, 200, enriched);
};

module.exports.handlePowerBI = function(req, res, parts, url, ctx) {
  const powerbi = readJSON(path.join(ctx.intelDir, 'powerbi-context.json'));
  return jsonReply(res, 200, powerbi || { error: 'No Power BI context available' });
};

module.exports.handleProjectIntelligence = function(req, res, parts, url, ctx) {
  const projects = readJSON(path.join(ctx.intelDir, 'project-updates.json'));
  return jsonReply(res, 200, projects || { error: 'No project intelligence available' });
};
