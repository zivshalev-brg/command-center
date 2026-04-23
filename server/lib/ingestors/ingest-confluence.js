// Confluence page → project linker. Live fetch via confluence-api.

const { scoreCandidate } = require('./matcher');
const store = require('../project-store');

async function ingestConfluence(ctx, projects) {
  let getRecentPages;
  try { ({ getRecentPages } = require('../confluence-api')); }
  catch { return { source_type: 'confluence', upserted: 0, skipped: 0, reason: 'no_api' }; }

  let pages = [];
  try { pages = await getRecentPages(ctx); } catch (e) {
    return { source_type: 'confluence', upserted: 0, skipped: 0, error: e.message };
  }
  if (!Array.isArray(pages) || !pages.length) {
    return { source_type: 'confluence', upserted: 0, skipped: 0, reason: 'no_pages' };
  }

  let upserted = 0;
  let skipped = 0;

  for (const page of pages) {
    const subject = page.title || '';
    const body = page.excerpt || '';
    const participants = [page.lastModifier, page.author].filter(Boolean);

    for (const project of projects) {
      // Space pin
      if (project.confluence_space && page.spaceKey === project.confluence_space) {
        store.upsertSource(project.id, {
          source_type: 'confluence',
          source_id: String(page.id),
          title: subject,
          url: page.url || null,
          relevance: 0.85,
          link_method: 'space_pin'
        });
        upserted++;
        continue;
      }

      const { score, method } = scoreCandidate({ project, subject, body, participants });
      if (score < 0.45) { skipped++; continue; }

      store.upsertSource(project.id, {
        source_type: 'confluence',
        source_id: String(page.id),
        title: subject,
        url: page.url || null,
        relevance: score,
        link_method: method
      });
      upserted++;
    }
  }

  return { source_type: 'confluence', upserted, skipped, page_count: pages.length };
}

module.exports = { ingestConfluence };
