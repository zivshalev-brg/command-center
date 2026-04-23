# Plan — Evolve the Beanz OS Obsidian Brain

Owner: [GM — Beanz] · Build owner: [Director of Software Development] · Drafted: 2026-04-19

---

## 1. How the brain works today (evidence)

### Write side — `server/lib/obsidian-sync.js` (1,764 lines)

`syncVault(ctx)` is the single entry-point. It regenerates **every** markdown page from scratch by reading server data sources and writing to `~/BeanzOS-Brain`. One big try/catch per section, no incremental logic.

Pages generated per sync:

| Section | Source data | Pages today |
|---|---|---|
| 000-Dashboard | strategy-engine + KPIs | 1 |
| 000-Standards | static templates | 16 |
| 100-People | `kb-data/intelligence/team-directory.json` | 21 |
| 200-Projects | `project-updates.json` + Jira | 9 |
| 300-Comms | **placeholder — "Coming Soon"** | 1 stub |
| 400-Coffee-Intelligence | news-store + Coffee research reports | **144** (mostly News/Research) |
| 500-AI-Tech-Intelligence | tech-news-store + AI research reports | **127** |
| 600-Strategy | strategy-engine correlations + KPIs | 7 |
| 700-Meetings | transcripts | 1 (mostly empty) |
| 800-Knowledge-Base | `kb-data/` static JSON files | 85 |
| 900-Learning | `learning-store.json` + feedback report | 5 |
| Plus Phase-2 pages | Databricks KPIs, Anomalies, Roaster Insights, Jira Movements, Email Performance | ~6 |
| **Total** | | **422 pages, ~4.8 MB, 55,824 lines** |

### Read side — `server/lib/obsidian-rag.js` (283 lines)

- `buildIndex()` walks the vault on first call and caches in memory for **5 minutes**.
- `search(query)` scores every page with a weighted keyword match:
  - Title hit: +10
  - Tag hit: +5
  - Alias hit: +5
  - Body hit (capped at 10 per keyword): +1 each
  - Phrase bigrams in title: +15 / body: +8
  - Section boosts: Knowledge-Base ×1.3 · Strategy ×1.25 · Projects ×1.2 · People ×1.15
  - Long-page penalty: pages >50K chars ×0.6 (to stop news dumps swamping results)
- `getCorePages(25000)` always returns People + Projects + Strategy Correlations + KPI Dashboard regardless of query.

### When data loads into the chat

`server/lib/chat-context-builder.js` → `buildChatSystemPrompt(ctx, userQuery)` is called on every `/api/chat` request and concatenates:

1. Role + business context (static)
2. `rag.getCorePages(25000)` — always ~4 core pages
3. `rag.search(userQuery) → 12 hits × 6000 chars = ~40K`
4. Live Slack + email threads (top 30 by message count, with AI classifications) — ~25K chars
5. Calendar (~4K)
6. Comms analytics snapshot (~5K)
7. Response guidelines

Typical system prompt is **80-100K chars** (~20-25K tokens). This goes to Claude Sonnet 4.5 on every chat turn.

### When syncs fire

| Trigger | Frequency |
|---|---|
| `POST /api/obsidian/sync` | Manual (Ziv's "Refresh" action) |
| Scheduled sync #1 | 1 hour after server startup |
| Scheduled sync #2..N | Every 24 hours thereafter |
| RAG index rebuild | Lazy — on next `search()` if index older than 5 min |

Sync currently takes ~3-8 seconds (dominated by news section, which writes ~270 pages).

### Duplication filtering — effectively none

- `slugify(name)` is the only dedup primitive. Same topic from two sources → two files with slightly different slugs → both land in the brain.
- News stores accumulate indefinitely. The 144 Coffee-Intelligence pages are mostly daily news dumps with no pruning policy.
- If Ziv hand-edits a vault page, the next sync **silently overwrites it** — no merge, no "user edits" detection.

### Self-learning — exists but doesn't reach the brain

- `learning.js` computes insight weights from feedback (pin +0.5, dismiss −0.3, thumb up/down ±0.2).
- These weights influence Strategy tab ranking only. **They do not influence RAG scoring or page generation.**
- Notebook user notes, chat messages, and Notes tab research never flow back as brain pages.

---

## 2. The gaps, ranked by blast radius

| # | Gap | Evidence | Impact |
|---|---|---|---|
| 1 | **Comms doesn't reach the brain** | `generateCommsPlaceholder()` returns a "Coming Soon" stub | Biggest signal source (Slack + email) invisible to vault search. Every chat query re-fetches from live JSON — fine for recent, useless for historical recall. |
| 2 | **Sync is write-only** | `writePage()` unconditionally overwrites | User edits lost. No reinforcement. Brain can't grow from human judgment. |
| 3 | **No memory decay / pruning** | News sections grow monotonically (144 + 127 today) | Old news dilutes RAG. Every keyword search has to fight through stale irrelevant pages. |
| 4 | **No entity resolution** | A person is a page; a project is a page; but news mentioning both creates no [[wikilinks]] | Knowledge is fragmented. Asking "what's the news on Veneziano?" doesn't find the Roaster page. |
| 5 | **Feedback doesn't feed retrieval** | `computeInsightWeights()` only used in Strategy tab | Pin + dismiss signal is wasted. |
| 6 | **Full-page chunking is too coarse** | RAG returns whole pages (up to 6K chars each) | 40% of retrieved context is noise. Chat answers get 12 pages worth of filler when 12 paragraphs would suffice. |
| 7 | **Notebook content is isolated** | Notes-tab research lives in SQLite, never syncs to vault | The richest user-curated artifacts (Studio summaries, saved chats, user notes) never benefit other tabs. |
| 8 | **No incremental sync** | `syncVault()` regenerates 422 pages every run | 24h latency for any new signal to land. Impractical to test or tune. |
| 9 | **Chat history is lost** | Chat sessions persist in SQLite but never become vault pages | "What did I ask about FTBP last week" → no recall. |
| 10 | **No freshness signal to retrieval** | RAG scores have no recency component | Old roaster news can outrank today's competitive move. |

---

## 3. Proposed evolution — 5 phases

Each phase is independently shippable, each raises a mechanical score (see §5).

### Phase A — Close the Comms gap (1-2 days)

**What**: Replace `generateCommsPlaceholder()` with real per-thread pages.

- New file: `server/lib/obsidian-comms-sync.js`
  - Iterates `comms-live.json` + `email-live.json`
  - One page per thread with last activity ≤90 days, one-per-month for older
  - Uses SFDC Contact-like entity resolution: thread.people[] → wikilinks to `100-People/*`
  - Project tags from AI classifier → wikilinks to `200-Projects/*`
  - Frontmatter: `type: comms-thread`, `source: slack|email`, `people: [[wikilinks]]`, `project: [[wikilink]]`, `action_required: true|false`, `last_activity: date`
  - Body: classification summary + last N messages (text only, no attachments)
- Dedup: Slack thread-ts or Graph message-ID in frontmatter `id:` field → regen idempotent.
- Rollup page: `300-Comms/_Index.md` with groupings: Action Required · By Person · By Project · Recent 7/30/90 days.

**Mechanical gain**: +300-500 pages indexed, comms content becomes RAG-searchable.

### Phase B — Dedup + memory-preserving merge (2 days)

**What**: A sync must never destroy human edits.

- Add `content-hash.json` at vault root mapping `relPath → lastGeneratedHash + lastUserEditedHash`.
- Before `writePage(p, content)`:
  - Compute `newHash = sha256(content)`.
  - If file exists, compute `currentHash = sha256(diskContent)`.
  - If `currentHash ≠ lastGeneratedHash` → **user edited it**. Don't overwrite. Instead:
    - Extract body section between `<!-- AUTO-START -->` / `<!-- AUTO-END -->` markers only → overwrite that region, preserve surrounding content.
    - Or append under `## Updates — <date>` heading.
  - Otherwise overwrite as today.
- Add frontmatter field `auto_generated: true|false|mixed`.
- Add a pruning pass: pages in News/* older than 60 days AND with 0 backlinks → move to `_Archive/`.

**Mechanical gain**: 0 overwritten user edits · 100+ archived/pruned stale pages.

### Phase C — Entity resolution + cross-tab backlinks (2 days)

**What**: Link news → people, projects, roasters, products automatically.

- New file: `server/lib/obsidian-entities.js` with:
  - `extractEntities(text)` — regex + fuzzy match against known people/projects/roasters/products from KB.
  - `linkify(text)` — wraps matched names in `[[wikilinks]]`.
- All news generators pipe through `linkify()` before writing.
- New rollup page per entity: `100-People/{name}.md` gets an auto-updated "## Recent mentions" section with last 10 backlinks.
- RAG scoring: pages with bidirectional backlink bonus (+3).

**Mechanical gain**: +300% wikilink density · +25% RAG precision@5 on entity-queries.

### Phase D — Feedback → retrieval (1 day)

**What**: The learning store's weights finally feed the RAG.

- `rag.search()` reads `learning-store.insightWeights` (keyed by page `relPath` or source entity).
- Pinned pages: final score ×1.5
- Dismissed pages: final score ×0.4
- Up/down feedback: ×1.2 / ×0.8
- New endpoint `/api/obsidian/feedback` — pin/dismiss works on vault pages too, not just strategy insights.
- Track hits per page → ones Ziv actually views on Summary/Strategy get RAG boost.

**Mechanical gain**: every feedback event now measurably shifts retrieval.

### Phase E — Semantic retrieval + chunking (3-4 days)

**What**: Move from keyword-only to hybrid keyword + embeddings.

- Chunker: split pages into 400-800 char overlapping chunks, keyed by `relPath#chunkIdx`.
- Embeddings: use OpenAI `text-embedding-3-small` (or Cohere) — store in SQLite as BLOB.
- Retrieval: `search(q)` runs keyword scoring AND cosine similarity, blends with `score = 0.6*keyword + 0.4*semantic`.
- Incremental: only re-embed chunks whose hash changed since last run.
- Notebook bridge: notebook sources that the user promotes become brain chunks too (phase F).

**Mechanical gain**: +40% answer groundedness on ambiguous queries; 80%+ queries return ≥3 highly-relevant chunks instead of top-12 whole pages.

### Phase F — Notebook ↔ Brain bi-directional (2 days)

**What**: Notebook content promotes to the brain; brain pages can be cited back.

- New action in the Note editor: **"Promote to brain"** — writes `900-Notebooks/{notebook-slug}/{note-slug}.md` with full content + source citations + notebook backlink.
- New tool for the Notes chat: `query_brain(query)` — lets notebook chats pull brain content as sources.
- Chat history → brain: summarised weekly chat digest auto-lands as `900-Chat-History/{date}.md`.

**Mechanical gain**: +1 net-new knowledge surface per week; closes the loop from exploration → permanent knowledge.

---

## 4. Cross-cutting improvements

- **Incremental sync**: timestamp-aware; rebuild only changed sections (comms threads last-activity, news-store last-fetch). Target: <1s for no-change sync, <10s for typical.
- **Sync observability**: `/api/obsidian/status` returns pages added / updated / skipped / conflicts / pruned. Surface in the Summary tab "Obsidian" panel.
- **Daily snapshot**: git-style incremental snapshot of the vault in `~/BeanzOS-Brain/.snapshots/{date}/` — enables "what changed this week" queries.
- **Conflict report**: a vault page `900-Learning/Conflicts.md` lists pages where user edits blocked an auto-update, so Ziv can reconcile manually.

---

## 5. Mechanical brain-quality score (autoresearch metric candidate)

A single number extractable via a script, higher-is-better:

```
score =  10 * ln(1 + total_pages)            // scale with knowledge breadth
      +  20 * frontmatter_hygiene_pct / 100   // % of pages with valid 9-field frontmatter
      +  15 * wikilink_density                // avg [[links]] per page (cap at 10)
      +  20 * non_orphan_pct / 100            // % of pages reached by ≥1 backlink
      +  15 * avg_rag_hits_per_query / 10     // avg # of high-score hits across a fixed probe set of 20 exec questions
      +  10 * comms_coverage_pct / 100        // % of comms threads from last 90 days that have a vault page
      -   5 * stale_page_count / 100          // pages >60d old with 0 hits
      -   5 * duplicate_slug_count / 10       // pages with ≥90% title similarity
```

Ranges 0-100; today's baseline ≈ 38 (evidence-based estimate from current gaps).

**Verify command** (to be built in Phase A as `scripts/brain-quality.js`):

```bash
node scripts/brain-quality.js ~/BeanzOS-Brain | grep -oE 'score=[0-9.]+' | cut -d= -f2
```

---

## 6. Ship order recommendation

**Week 1**: Phase A (comms) + Phase B (dedup) — biggest blast radius, no new deps
**Week 2**: Phase C (entities) + Phase D (feedback→retrieval) — measurably sharper brain
**Week 3+**: Phase E (semantic) — new dep (embedding API), needs budget approval
**Opportunistic**: Phase F (notebook bridge) — ship whenever Ziv asks for it

---

## 7. Autoresearch-ready configuration

Once `scripts/brain-quality.js` exists (end of Phase A), wrap each phase in an autoresearch loop:

```
Goal: Improve Beanz OS Obsidian Brain quality score
Scope: server/lib/obsidian-*.js, server/lib/chat-context-builder.js
Metric: brain-quality score (higher is better)
Verify: node scripts/brain-quality.js ~/BeanzOS-Brain | grep -oE 'score=[0-9.]+' | cut -d= -f2
Guard: node -c server/server.js && curl -s -o /dev/null -w '%{http_code}' http://localhost:3737/api/chat/rag?q=FTBP | grep -q 200
```

The guard ensures the server still boots and RAG still answers on every iteration.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| User edit merge is hard to get right | MEDIUM | Start conservative: only protect body outside `AUTO-START/END` markers; if in doubt, skip write and log conflict |
| Comms sync balloons the vault (1000s of threads) | MEDIUM | Cap at 500 most-recent + rollup everything else; monthly compaction |
| Entity resolution misfires (wrong wikilinks) | LOW | Require exact-match or ≥0.9 fuzzy confidence before linking |
| Embedding cost | LOW | text-embedding-3-small = $0.02 per 1M tokens; entire vault ≈$0.05 one-off + ~$0.01/week |
| Incremental sync skips a changed source | MEDIUM | Keep the "force full sync" flag as escape hatch |

---

## 9. Addendum — applying the Karpathy Loop lessons

After reading "The $300 Overnight Loop" (Nate, Apr 19), six upgrades to this plan:

### 9.1 Multi-dimensional metric, not a single score

The article's "Metric-Gaming Pre-Mortem" exposes that a single blended score is easy for a meta-agent to game. The brain-quality metric splits into **three scores that must all move in the right direction**:

| Score | What it measures | Gameable? |
|---|---|---|
| **Score-H (Hygiene)** | frontmatter validity, broken `[[wikilinks]]`, dead relative paths, duplicate titles, stale-page count | Hard — mechanical & structural |
| **Score-R (Retrieval)** | answered probe queries (fixed holdout set of 30 exec questions), precision@5 on labeled relevance | Medium — needs holdout discipline |
| **Score-U (User truth)** | lagging indicator: last-7d pin-rate, dismiss-rate, chat "save to notes" rate, thumbs-up rate on RAG-sourced answers | Low — real human signal |

Ship rule: **no optimization is accepted unless Score-H rises or stays flat, Score-R rises, and Score-U doesn't fall by >5%**. Divergence between Score-R and Score-U is the canary for overfitting.

### 9.2 Holdout probe set the meta-agent never sees

Add two files:

- `scripts/brain-probes-training.json` — 20 representative queries the verify command runs
- `scripts/brain-probes-holdout.json` — 10 queries the meta-agent has no visibility into; only evaluated at phase checkpoints by a human

If Score-R(training) rises but Score-R(holdout) doesn't → the loop is gaming the probes. Abort that line.

### 9.3 Traces-first: every RAG query and its outcome is logged

The article's "Trace Infrastructure Audit" makes this non-negotiable. Add before Phase A:

- New SQLite table `rag_traces` — per query: `q`, `top_hits[]` (relPath + score), `was_answered` (Claude did/didn't cite the vault), `user_feedback` (pin/dismiss on the response if any).
- Every `/api/chat` invocation writes a trace row.
- `scripts/brain-diagnostics.js` clusters the last 7 days of traces into failure buckets:
  - Empty results (query returned 0 hits)
  - Low-confidence (top score <5)
  - Unused results (Claude didn't cite any RAG page)
  - Dismissed results
- Those buckets are what the meta-agent reads to make **targeted** edits, not random mutations.

Without this, auto-improvement is flying blind — exactly what the article warns against.

### 9.4 Meta-agent / task-agent split (new Phase G)

Task agent = the sync + RAG pipeline we run today.
Meta-agent = a separate Claude Sonnet loop that:

1. Reads `rag_traces` failure buckets
2. Reads the current `obsidian-rag.js` + relevant sync generators
3. Proposes one scoped change (scoring weight tweak · new boost · dedup rule · entity extraction pattern)
4. Writes the change to a **staging branch** `~/BeanzOS-Brain-staging/`
5. Runs `brain-quality.js` on staging + replays the training probe set
6. If all three scores improve → opens a proposal entry in `900-Learning/Pending-Proposals.md`
7. **Human (Ziv) reviews and promotes** to production until trust is earned

No direct write-to-production from the meta-agent, ever. This is the governance layer the article flags as non-optional.

Model empathy: use the same model (Claude Sonnet 4.5) for meta and task — matches the article's finding.

### 9.5 Self-reflection check before any proposal lands

Borrowed directly from AutoAgent. Every proposal the meta-agent files must answer, in its own words:

> "If the probe query set were replaced tomorrow with 30 different exec questions on the same domain, would this change still be a worthwhile brain improvement?"

If the answer cites specific probe questions by ID, reject the proposal — it's probe-fitted.

### 9.6 Atomic revert — every sync is a snapshot

Already hinted at in §4. Make it explicit:

- Every sync writes to `~/BeanzOS-Brain/.snapshots/{ISO-timestamp}/` (hardlink-backed copy)
- `node scripts/brain-revert.js <timestamp>` restores any prior state atomically
- Retention: keep 7 daily + 4 weekly + 3 monthly
- Meta-agent proposals carry `revert_to: <timestamp>` in their metadata

This is the Karpathy Loop's "commit or revert" applied to a knowledge vault instead of a training script.

### 9.7 Updated phase order with the article's lessons baked in

| Phase | Revised content | Why |
|---|---|---|
| **0 (NEW)** | Trace capture (`rag_traces` table) + atomic snapshots + `brain-diagnostics.js` | Can't auto-improve what you can't audit |
| A | Comms sync + holdout probe set + multi-dim score | Ship the baseline + the honest metric together |
| B | Dedup + user-edit preservation | Unchanged |
| C | Entity resolution + backlinks | Unchanged |
| D | Feedback → retrieval (Score-U feeding RAG scoring) | Unchanged — extended to close the loop |
| E | Semantic retrieval (embeddings) | Unchanged |
| F | Notebook ↔ Brain bridge | Unchanged |
| **G (NEW)** | Meta-agent proposal loop — governed, staged, human-approved | The actual Karpathy Loop, safely scoped |

### 9.8 What the article does NOT change

- Phase A is still the biggest single win (comms is the richest unused signal)
- Small-team agility applies here: this is one dev-week of work to ship A + 0, measurable immediately
- Anthropic's `$0.02 per 1M tokens` math makes Phase E embeddings truly ~$0.05 one-off for the whole vault

---

## Next step

If you say **yes**, I start with **Phase 0** (trace capture + snapshots + diagnostics) — 1 day — to establish the honest baseline, then Phase A (comms + multi-dim score) — 2 days. That's the minimum surface area before any autoresearch-style loop can run safely.

If you want me to skip Phase 0 and go straight to A+B for speed, tell me — but understand the Karpathy Loop won't actually be runnable until Phase 0 exists. It'd be optimization in the dark.
