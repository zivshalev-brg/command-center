// Prompt templates for daily project synthesis.

const SYSTEM_PROMPT = [
  "You are the Project Intelligence Engine for Beanz OS, Ziv Shalev's executive command centre.",
  "Beanz is a coffee subscription platform under the Breville Group operating across AU, UK, US, DE, NL.",
  "Your job: given one project and 24 hours of source artifacts (Slack threads, emails, Jira issues,",
  "Confluence pages, calendar events), synthesize a crisp executive daily update.",
  "",
  "RULES:",
  "1. Be concrete — cite what specifically moved, decided, or blocked.",
  "2. Never invent facts that are not in the provided sources. If sources are sparse, say so in 'summary' and keep arrays small.",
  "3. Favour verbs over adjectives in bullets. Include names, numbers, dates where they appear.",
  "4. Each bullet stands alone — full sentence, no pronouns referring to unseen context.",
  "5. Separate DECISIONS (explicit choices made) from what MOVED (progress, events) and from new BLOCKERS.",
  "6. 'recommended_actions' should be a prioritised list of what Ziv should do next, based on the sources.",
  "7. 'health_score' is 0-100. 90+ = ahead of plan, 70-89 = on track, 50-69 = watch, below 50 = at risk.",
  "8. Return ONLY valid JSON. No markdown, no preamble."
].join('\n');

const OUTPUT_SCHEMA = [
  '{',
  '  "summary": "1-2 sentence hero describing today\'s state of the project",',
  '  "what_moved": ["bullets describing concrete progress in last 24h"],',
  '  "decisions": ["explicit decisions made (with decision-maker if known)"],',
  '  "new_blockers": ["new problems/risks surfaced in last 24h; empty if none"],',
  '  "milestones_touched": ["milestone names referenced or advanced in sources"],',
  '  "recommended_actions": [',
  '    {"text": "imperative action", "priority": "urgent|high|normal|low", "owner_id": "person-id-or-null"}',
  '  ],',
  '  "health_score": 0-100,',
  '  "rag_suggested": "green|amber|red",',
  '  "momentum_delta": -1.0 to 1.0,   // signed change vs prior day (-1 sharp slowdown, +1 sharp acceleration)',
  '  "source_artifacts": [',
  '    {"source": "slack|email|jira|confluence|calendar", "id": "<source_id>", "excerpt": "<≤200 chars>"}',
  '  ]',
  '}'
].join('\n');

function buildUserPrompt({ project, sources, date, priorUpdate }) {
  const parts = [];
  parts.push(`DATE: ${date}`);
  parts.push(`PROJECT: ${project.title} (id: ${project.id})`);
  parts.push(`STATUS: ${project.status} · RAG: ${project.rag || 'green'} · priority: ${project.priority ?? 50} · progress: ${project.progress ?? 0}%`);
  if (project.description) parts.push(`DESCRIPTION: ${project.description}`);
  if (project.owner_id) parts.push(`OWNER: ${project.owner_id}`);
  if (project.team) parts.push(`TEAM: ${project.team}`);

  // Brief-driven context hints (telling Claude what to look for)
  const brief = project.brief && typeof project.brief === 'object' ? project.brief : null;
  if (brief) {
    parts.push('');
    parts.push('── PROJECT BRIEF (what this project cares about) ──');
    if (brief.one_liner) parts.push(`FRAMING: ${brief.one_liner}`);
    if (brief.context_profile) parts.push(`PROFILE: ${brief.context_profile}`);
    if (Array.isArray(brief.focus_areas) && brief.focus_areas.length) {
      parts.push(`FOCUS AREAS: ${brief.focus_areas.slice(0, 8).join(', ')}`);
    }
    if (Array.isArray(brief.key_entities) && brief.key_entities.length) {
      parts.push(`KEY ENTITIES: ${brief.key_entities.slice(0, 10).join(', ')}`);
    }
    if (Array.isArray(brief.domain_vocab) && brief.domain_vocab.length) {
      parts.push(`DOMAIN VOCAB: ${brief.domain_vocab.slice(0, 12).join(', ')}`);
    }
  }

  if (Array.isArray(project.people_ids) && project.people_ids.length) {
    parts.push(`KEY PEOPLE: ${project.people_ids.join(', ')}`);
  }
  if (Array.isArray(project.milestones) && project.milestones.length) {
    const ms = project.milestones.slice(0, 12).map(m => `- [${m.state || m.s}] ${m.title || m.t}${m.due_date ? ' (due ' + m.due_date + ')' : ''}`).join('\n');
    parts.push(`CURRENT MILESTONES:\n${ms}`);
  }
  if (Array.isArray(project.blockers) && project.blockers.length) {
    const bs = project.blockers.slice(0, 8).map(b => `- ${typeof b === 'string' ? b : (b.text || '')}`).join('\n');
    parts.push(`KNOWN BLOCKERS:\n${bs}`);
  }

  if (priorUpdate) {
    parts.push(`PRIOR DAY SUMMARY (for context; do not repeat):\n"${priorUpdate.summary || ''}"`);
  }

  parts.push('');
  parts.push('─── LAST 24h SOURCE ARTIFACTS ───');

  const bySrc = { slack: [], email: [], jira: [], confluence: [], calendar: [] };
  for (const s of sources) {
    if (!bySrc[s.source_type]) bySrc[s.source_type] = [];
    bySrc[s.source_type].push(s);
  }

  for (const [src, items] of Object.entries(bySrc)) {
    if (!items.length) continue;
    parts.push(`\n# ${src.toUpperCase()} (${items.length}):`);
    for (const item of items.slice(0, 25)) {
      const t = (item.title || '').slice(0, 120);
      const excerpt = item.excerpt ? ` — ${item.excerpt.slice(0, 180)}` : '';
      parts.push(`- [${item.source_id}] ${t}${excerpt}`);
    }
  }

  parts.push('');
  parts.push('Return JSON matching this schema exactly:');
  parts.push(OUTPUT_SCHEMA);
  return parts.join('\n');
}

module.exports = { SYSTEM_PROMPT, OUTPUT_SCHEMA, buildUserPrompt };
