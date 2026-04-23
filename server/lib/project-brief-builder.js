// Project Brief Builder — generates a structured "brief" per project that
// tells every downstream ingestor what kind of signals are most relevant.
//
// The brief is JSON, stored on projects.brief, regenerated on-demand (typically
// at creation time + weekly). It contains:
//
//   {
//     one_liner: "Retention-focused AI experiments on cancellation & winback",
//     focus_areas: ["churn", "cancellation flow", "winback emails"],
//     priority_sources: ["slack", "email", "metrics"],
//     signal_priorities: { slack: 0.9, email: 0.8, jira: 0.4, ... },
//     key_entities: ["Justin Le Good", "Sophie Thevenin", "cancellation"],
//     kb_categories: ["retention", "analytics", "users"],
//     domain_vocab: ["churn", "retention", "winback", "LTV"]
//   }

'use strict';

const https = require('https');
const MODELS = require('./ai-models');
const store = require('./project-store');
const kbIndex = require('./kb-index');

const PROFILE_TO_CATEGORIES = {
  retention:  ['retention', 'analytics', 'users', 'ops'],
  growth:     ['marketing', 'analytics', 'strategy'],
  marketing:  ['marketing', 'content', 'voice-of-customer'],
  platform:   ['platform', 'architecture', 'developer-platform', 'ops'],
  legal:      ['legal', 'kb-standards'],
  finance:    ['finance', 'analytics'],
  coffee:     ['coffee', 'partners', 'markets'],
  events:     ['marketing', 'ops', 'content'],
  analytics:  ['analytics', 'strategy'],
  strategy:   ['strategy', 'markets', 'analytics'],
  ops:        ['ops', 'support', 'fulfillment'],
  general:    ['projects', 'general', 'ops']
};

const DEFAULT_SIGNAL_PRIORITIES = {
  retention:  { slack: 1.0, email: 1.0, jira: 0.5, confluence: 0.5, calendar: 0.6, kb: 1.0 },
  growth:     { slack: 0.9, email: 1.0, jira: 0.4, confluence: 0.6, calendar: 0.6, kb: 0.9 },
  marketing:  { slack: 0.8, email: 1.0, jira: 0.3, confluence: 0.5, calendar: 0.6, kb: 0.9 },
  platform:   { slack: 0.9, email: 0.5, jira: 1.0, confluence: 1.0, calendar: 0.5, kb: 1.0 },
  legal:      { slack: 0.6, email: 1.0, jira: 0.3, confluence: 1.0, calendar: 0.6, kb: 1.0 },
  finance:    { slack: 0.7, email: 0.9, jira: 0.4, confluence: 0.9, calendar: 0.5, kb: 0.9 },
  coffee:     { slack: 0.8, email: 0.9, jira: 0.3, confluence: 0.5, calendar: 0.6, kb: 1.0 },
  events:     { slack: 1.0, email: 0.9, jira: 0.4, confluence: 0.5, calendar: 1.0, kb: 0.7 },
  analytics:  { slack: 0.7, email: 0.6, jira: 0.6, confluence: 0.8, calendar: 0.4, kb: 1.0 },
  strategy:   { slack: 0.7, email: 0.8, jira: 0.4, confluence: 0.9, calendar: 0.5, kb: 1.0 },
  ops:        { slack: 1.0, email: 0.8, jira: 0.7, confluence: 0.6, calendar: 0.7, kb: 0.7 },
  general:    { slack: 0.8, email: 0.8, jira: 0.6, confluence: 0.6, calendar: 0.6, kb: 0.7 }
};

const SYSTEM_PROMPT = [
  "You classify Beanz OS projects to create a structured 'brief' used by downstream ingestors.",
  "Beanz is a coffee subscription platform under Breville Group across AU, UK, US, DE, NL.",
  "Given a project title, description, tags, and a sample of KB documents that match it,",
  "you produce ONE JSON object describing the project's intent and what kinds of signals",
  "are most relevant to synthesizing its daily updates.",
  "",
  "Return ONLY valid JSON with this exact shape:",
  "{",
  '  "one_liner": "<12-20 word description of what this project is really about>",',
  '  "context_profile": "retention|growth|marketing|platform|legal|finance|coffee|events|analytics|strategy|ops|general",',
  '  "focus_areas": ["<3-6 topics the project cares about>"],',
  '  "key_entities": ["<people/teams/products/programs closely linked>"],',
  '  "domain_vocab": ["<synonyms + domain words the matcher should expand with>"]',
  "}"
].join('\n');

function _callClaude(apiKey, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODELS.HAIKU,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) resolve(parsed.content[0].text);
          else reject(new Error(parsed.error && parsed.error.message || 'No content'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _parseJsonRelaxed(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

function _heuristicProfile(project) {
  const hay = ((project.title || '') + ' ' + (project.description || '') + ' ' +
               (project.classifier_tags || []).join(' ') + ' ' +
               (project.aliases || []).join(' ')).toLowerCase();
  if (/retention|churn|cancellation|winback|ltv|lifecycle/.test(hay)) return 'retention';
  if (/brand|marketing|campaign|acquisition|ftbp|creative|edm/.test(hay)) return 'marketing';
  if (/mice|woc|expo|event|summit|booth/.test(hay)) return 'events';
  if (/platinum|roaster|coffee|mara|machine|barista/.test(hay)) return 'coffee';
  if (/legal|contract|compliance|privacy|policy/.test(hay)) return 'legal';
  if (/p&l|pnl|finance|revenue|cogs|ebitda|cost|margin/.test(hay)) return 'finance';
  if (/analytics|metric|report|dashboard|insight|data|kpi|power\s*bi/.test(hay)) return 'analytics';
  if (/strategy|summit|narrative|positioning|roadmap/.test(hay)) return 'strategy';
  if (/platform|infrastructure|api|service|integration|devops|microservice/.test(hay)) return 'platform';
  if (/operations|logistics|fulfillment|support|onboarding/.test(hay)) return 'ops';
  return 'general';
}

async function buildProjectBrief(ctx, projectId, opts = {}) {
  const project = store.getProject(projectId);
  if (!project) throw new Error('project not found: ' + projectId);

  // Always-safe heuristic profile first (works without AI)
  const heuristicProfile = _heuristicProfile(project);

  // Find top KB matches for the project
  const topKb = kbIndex.findForProject(ctx, project, {
    categories: PROFILE_TO_CATEGORIES[heuristicProfile],
    limit: 8
  });

  // Build brief
  let brief = {
    one_liner: project.description || project.title,
    context_profile: heuristicProfile,
    focus_areas: [],
    key_entities: project.people_ids || [],
    domain_vocab: project.classifier_tags || [],
    signal_priorities: DEFAULT_SIGNAL_PRIORITIES[heuristicProfile] || DEFAULT_SIGNAL_PRIORITIES.general,
    kb_categories: PROFILE_TO_CATEGORIES[heuristicProfile] || PROFILE_TO_CATEGORIES.general,
    kb_top_matches: topKb.map(k => ({ rel_path: k.rel_path, title: k.title, category: k.category })),
    generated_at: new Date().toISOString(),
    source: 'heuristic'
  };

  // Enhance with Claude if available
  if (ctx.anthropicApiKey && !opts.skipAI) {
    try {
      const kbSummary = topKb.slice(0, 5).map(k => `- [${k.category}] ${k.title}: ${k.snippet.slice(0, 120)}`).join('\n');
      const userPrompt = [
        `PROJECT TITLE: ${project.title}`,
        project.description ? `DESCRIPTION: ${project.description}` : '',
        (project.classifier_tags && project.classifier_tags.length) ? `TAGS: ${project.classifier_tags.join(', ')}` : '',
        (project.aliases && project.aliases.length) ? `ALIASES: ${project.aliases.join(', ')}` : '',
        (project.people_ids && project.people_ids.length) ? `PEOPLE: ${project.people_ids.join(', ')}` : '',
        '',
        'TOP KB MATCHES (context):',
        kbSummary || '(none)',
        '',
        'Return the JSON brief now.'
      ].filter(Boolean).join('\n');

      const text = await _callClaude(ctx.anthropicApiKey, userPrompt);
      const parsed = _parseJsonRelaxed(text);
      if (parsed && parsed.context_profile) {
        brief = {
          ...brief,
          one_liner: parsed.one_liner || brief.one_liner,
          context_profile: parsed.context_profile || brief.context_profile,
          focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas : brief.focus_areas,
          key_entities: Array.isArray(parsed.key_entities) ? parsed.key_entities : brief.key_entities,
          domain_vocab: Array.isArray(parsed.domain_vocab) ? parsed.domain_vocab : brief.domain_vocab,
          signal_priorities: DEFAULT_SIGNAL_PRIORITIES[parsed.context_profile] || brief.signal_priorities,
          kb_categories: PROFILE_TO_CATEGORIES[parsed.context_profile] || brief.kb_categories,
          source: 'claude'
        };
        // Refetch KB top-matches with the AI-derived profile
        brief.kb_top_matches = kbIndex.findForProject(ctx, project, {
          categories: brief.kb_categories, limit: 10
        }).map(k => ({ rel_path: k.rel_path, title: k.title, category: k.category }));
      }
    } catch (e) {
      console.warn('[Brief]', projectId, 'AI failed, using heuristic:', e.message);
    }
  }

  // Persist
  store.updateProject(projectId, {
    brief: JSON.stringify(brief),
    context_profile: brief.context_profile,
    brief_generated_at: brief.generated_at
  });
  return brief;
}

function getProjectBrief(projectId) {
  const p = store.getProject(projectId);
  if (!p || !p.brief) return null;
  try { return typeof p.brief === 'string' ? JSON.parse(p.brief) : p.brief; }
  catch { return null; }
}

module.exports = { buildProjectBrief, getProjectBrief, _heuristicProfile, DEFAULT_SIGNAL_PRIORITIES, PROFILE_TO_CATEGORIES };
