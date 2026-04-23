// Shared matching primitives used by all project source ingestors.

// Domain synonym expansion. When a project has one of the LHS keywords in its
// classifier_tags/aliases, ALL the RHS words count as matches too. This lifts
// the matcher from surface-only substring to a light domain lexicon.
const SYNONYMS = {
  retention: ['retention', 'churn', 'cancellation', 'cancel', 'winback', 'save offer', 'ltv', 'lifetime value', 'reactivation', 'resurrection'],
  churn: ['churn', 'retention', 'cancellation', 'cancel', 'unsubscribe', 'attrition'],
  cancellation: ['cancellation', 'cancel', 'churn', 'winback', 'save offer', 'exit survey'],
  ftbp: ['ftbp', 'fast-track barista pack', 'fast track', 'barista pack', 'first bag', 'trial', 'starter kit'],
  'platinum roasters': ['platinum', 'roaster program', 'roaster partner', 'equator', 'madcap', 'methodical'],
  'machine integration': ['machine', 'marax3', 'mara x3', 'barista touch', 'grinder', 'breville machine', 'lelit'],
  'brand summit': ['brand summit', 'fy27 summit', 'brand strategy', 'brand moat', 'narrative'],
  mice: ['mice', 'melbourne international coffee expo', 'coffee expo', 'melbourne', 'afterhours'],
  woc: ['woc', 'world of coffee', 'san diego', 'specialty coffee'],
  feral: ['feral', 'project feral', 'ai retention', 'ai-first', '26-week'],
  email: ['email', 'edm', 'lifecycle email', 'nurture', 'campaign', 'welcome series', 'winback'],
  collections: ['collection', 'collections', 'product collection', 'merchandise'],
  onboarding: ['onboarding', 'welcome', 'activation', 'first-run', 'trial'],
  pricing: ['pricing', 'price', 'margin', 'discount', 'affordability', 'cost', 'economics'],
  pbb: ['pbb', 'powered by beanz', 'b2b', 'partner', 'white-label'],
  'de launch': ['germany', 'deutschland', 'de market', 'hamburg', 'netherlands', 'benelux', 'nl launch'],
  oracle: ['oracle', 'erp', 'netsuite', 'order management', 'd365'],
  'power bi': ['power bi', 'powerbi', 'pbi', 'dashboard', 'report', 'p&l'],
  subscription: ['subscription', 'subscriber', 'recurring', 'renewal', 'sub']
};

// Expand a tag/alias list with domain synonyms — returns a deduplicated
// lowercased list that should be used for matching rather than the raw tags.
function expandWithSynonyms(tagList) {
  const out = new Set();
  for (const raw of tagList || []) {
    const low = norm(raw);
    if (!low) continue;
    out.add(low);
    // Exact key match
    if (SYNONYMS[low]) for (const s of SYNONYMS[low]) out.add(norm(s));
    // Substring match on synonym keys (so "Project Feral" pulls "feral" → retention synonyms)
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (low.includes(key) || key.includes(low)) {
        for (const s of syns) out.add(norm(s));
      }
    }
  }
  return Array.from(out);
}

function norm(s) {
  return String(s || '').toLowerCase();
}

function _getExpandedTerms(project) {
  // Build once per project call and cache on the object. Includes vocab from brief.
  if (project._expanded_terms) return project._expanded_terms;
  const raw = []
    .concat(project.classifier_tags || [])
    .concat(project.aliases || []);
  // Pull in domain_vocab if a brief exists
  if (project.brief && typeof project.brief === 'object') {
    if (Array.isArray(project.brief.domain_vocab)) raw.push(...project.brief.domain_vocab);
    if (Array.isArray(project.brief.focus_areas)) raw.push(...project.brief.focus_areas);
  }
  const expanded = expandWithSynonyms(raw);
  project._expanded_terms = expanded;
  return expanded;
}

function scoreTitle(title, project) {
  const t = norm(title);
  if (!t) return { score: 0, method: 'none' };
  for (const tag of project.classifier_tags || []) {
    const ntag = norm(tag);
    if (!ntag) continue;
    if (t === ntag) return { score: 1.0, method: 'tag_exact' };
    if (t.includes(ntag)) return { score: 0.85, method: 'tag_substring' };
  }
  for (const alias of project.aliases || []) {
    const na = norm(alias);
    if (!na) continue;
    if (t.includes(na)) return { score: 0.75, method: 'alias' };
  }
  // Synonym-expanded domain vocab match
  const expanded = _getExpandedTerms(project);
  for (const term of expanded) {
    if (!term || term.length < 3) continue;
    if (t.includes(term)) return { score: 0.6, method: 'synonym' };
  }
  for (const kw of project.news_keywords || []) {
    const nk = norm(kw);
    if (!nk || nk.length < 3) continue;
    if (t.includes(nk)) return { score: 0.4, method: 'keyword' };
  }
  return { score: 0, method: 'none' };
}

function scoreBody(body, project) {
  const b = norm(body);
  if (!b) return 0;
  let best = 0;
  for (const tag of project.classifier_tags || []) {
    const ntag = norm(tag);
    if (!ntag) continue;
    if (b.includes(ntag)) best = Math.max(best, 0.5);
  }
  for (const alias of project.aliases || []) {
    const na = norm(alias);
    if (!na) continue;
    if (b.includes(na)) best = Math.max(best, 0.35);
  }
  // Synonym vocab — lower weight, but covers "churn" when project has "retention" etc.
  const expanded = _getExpandedTerms(project);
  let synonymHits = 0;
  for (const term of expanded) {
    if (!term || term.length < 3) continue;
    if (b.includes(term)) synonymHits++;
  }
  if (synonymHits >= 2) best = Math.max(best, 0.4);
  else if (synonymHits === 1) best = Math.max(best, 0.25);
  return best;
}

function scorePeople(participantsResolved, project) {
  const people = project.people_ids || [];
  if (!people.length || !participantsResolved) return 0;
  let overlap = 0;
  for (const pid of people) {
    if (participantsResolved.has(pid) || participantsResolved.has(norm(pid))) overlap++;
  }
  if (!overlap) return 0;
  const frac = overlap / people.length;
  return Math.min(0.25, 0.1 + 0.15 * frac);
}

function resolveParticipantIds(participants, peopleDirectory) {
  const set = new Set();
  if (!participants) return set;
  for (const raw of participants) {
    const name = norm(raw);
    if (!name) continue;
    for (const [pid, pdata] of Object.entries(peopleDirectory || {})) {
      const canonName = norm(pdata.n || pdata.name || pid);
      if (!canonName) continue;
      if (name === canonName || name.includes(canonName) || canonName.includes(name)) {
        set.add(pid);
      }
    }
  }
  return set;
}

// Given a project and a candidate source, compute final relevance.
// subject/body are plain text; participants is an array of raw name strings
// (optional); peopleDirectory is DATA.people-like map.
function scoreCandidate({ project, subject, body, participants, peopleDirectory, classifierProjectTags }) {
  // Exact match via existing AI classifier project_tags: trump-card
  if (classifierProjectTags && Array.isArray(classifierProjectTags)) {
    for (const tag of classifierProjectTags) {
      for (const pt of project.classifier_tags || []) {
        if (norm(pt) === norm(tag)) {
          return { score: 0.95, method: 'classifier_tag' };
        }
      }
      for (const al of project.aliases || []) {
        if (norm(al) === norm(tag)) return { score: 0.9, method: 'classifier_alias' };
      }
    }
  }

  const titleScore = scoreTitle(subject, project);
  const bodyScore = scoreBody(body, project);
  const peopleScore = scorePeople(resolveParticipantIds(participants, peopleDirectory), project);

  const base = Math.max(titleScore.score, bodyScore);
  const score = Math.min(1.0, base + peopleScore);
  const method = titleScore.score >= bodyScore ? titleScore.method : 'body';
  return { score, method };
}

module.exports = { scoreCandidate, scoreTitle, scoreBody, scorePeople, resolveParticipantIds, norm, expandWithSynonyms, SYNONYMS };
