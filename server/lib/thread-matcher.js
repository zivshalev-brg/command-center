// ─── Cross-Platform Thread Matcher ──────────────────────────────
// Detects when Slack conversations and Outlook emails are about
// the same topic/person and should be linked in a unified view.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'but', 'and',
  'or', 'nor', 'not', 'so', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'it', 'its', 're', 'fw', 'fwd'
]);

const MIN_WORD_LENGTH = 3;
const PERSON_MATCH_SCORE = 0.6;
const MIN_SUBJECT_SIMILARITY = 0.4;
const MIN_MATCH_SCORE = 0.4;
const MAX_MATCH_SCORE = 1.0;

// ─── Keyword Extraction ────────────────────────────────────────

/**
 * Extract meaningful keywords from text.
 * Lowercases, splits on whitespace/punctuation, removes stopwords and short words.
 * @param {string} text
 * @returns {Set<string>}
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return new Set();

  const tokens = text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter(word => word.length >= MIN_WORD_LENGTH && !STOPWORDS.has(word));

  return new Set(tokens);
}

// ─── Similarity ────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two texts.
 * @param {string} textA
 * @param {string} textB
 * @returns {number} Value between 0 and 1
 */
function keywordSimilarity(textA, textB) {
  const setA = extractKeywords(textA);
  const setB = extractKeywords(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

// ─── Person Lookup Helpers ─────────────────────────────────────

/**
 * Convert slackUsers object into a map of email -> slackUserId.
 * @param {Object} slackUsers - { userId: { email, name, displayName } }
 * @returns {Object} { email: slackUserId }
 */
function buildPersonEmailMap(slackUsers) {
  const emailMap = {};
  if (!slackUsers || typeof slackUsers !== 'object') return emailMap;

  for (const [userId, profile] of Object.entries(slackUsers)) {
    const email = (profile.email || '').toLowerCase().trim();
    if (email) {
      emailMap[email] = userId;
    }
  }
  return emailMap;
}

/**
 * Check whether any person in a Slack thread also appears in an email thread.
 * @param {Object} slackThread - { people[], ... }
 * @param {Object} emailThread - { people[], replyTo }
 * @param {Object} slackUsers  - { userId: { email, name, displayName } }
 * @returns {boolean}
 */
function findPersonOverlap(slackThread, emailThread, slackUsers) {
  if (!slackThread.people || !slackUsers) return false;

  // Collect all email addresses from the email thread (people + replyTo)
  const emailAddresses = new Set();
  for (const person of (emailThread.people || [])) {
    const addr = (person || '').toLowerCase().trim();
    if (addr) emailAddresses.add(addr);
  }
  if (emailThread.replyTo) {
    const addr = (emailThread.replyTo || '').toLowerCase().trim();
    if (addr) emailAddresses.add(addr);
  }

  if (emailAddresses.size === 0) return false;

  // For each Slack thread participant, resolve their email and check
  for (const personName of slackThread.people) {
    // Find the Slack user by display name or name
    for (const [, profile] of Object.entries(slackUsers)) {
      const matchesName = profile.displayName === personName || profile.name === personName;
      if (matchesName && profile.email) {
        const slackEmail = profile.email.toLowerCase().trim();
        if (emailAddresses.has(slackEmail)) return true;
      }
    }
  }

  return false;
}

// ─── Core Matching ─────────────────────────────────────────────

/**
 * Find cross-platform matches between Slack threads and email threads.
 * @param {Object} slackThreads - { threadId: { subject, people[], messages[], sources, slackChannel, slackChannelName } }
 * @param {Object} emailThreads - { threadId: { subject, people[], messages[], sources, replyTo } }
 * @param {Object} slackUsers   - { userId: { email, name, displayName } }
 * @returns {Array<{ threadIdA: string, threadIdB: string, score: number, matchType: string }>}
 */
function findCrossPlatformMatches(slackThreads, emailThreads, slackUsers) {
  if (!slackThreads || !emailThreads) return [];

  const matches = [];
  const slackEntries = Object.entries(slackThreads);
  const emailEntries = Object.entries(emailThreads);

  if (slackEntries.length === 0 || emailEntries.length === 0) return [];

  for (const [slackId, slackThread] of slackEntries) {
    for (const [emailId, emailThread] of emailEntries) {
      const personMatch = findPersonOverlap(slackThread, emailThread, slackUsers);
      const subjectScore = keywordSimilarity(
        slackThread.subject || '',
        emailThread.subject || ''
      );
      const subjectMatch = subjectScore >= MIN_SUBJECT_SIMILARITY;

      let score = 0;
      let matchType = null;

      if (personMatch && subjectMatch) {
        score = Math.min(PERSON_MATCH_SCORE + subjectScore, MAX_MATCH_SCORE);
        matchType = 'person+subject';
      } else if (personMatch) {
        score = PERSON_MATCH_SCORE;
        matchType = 'person';
      } else if (subjectMatch) {
        score = subjectScore;
        matchType = 'subject';
      }

      if (score >= MIN_MATCH_SCORE) {
        matches.push({
          threadIdA: slackId,
          threadIdB: emailId,
          score: Math.round(score * 1000) / 1000,
          matchType
        });
      }
    }
  }

  return matches;
}

// ─── Persistence ───────────────────────────────────────────────

/**
 * Persist matches to the database. Clears existing matches first.
 * @param {Object} db - Database module with clearUnifiedMatches/upsertUnifiedMatch
 * @param {Array<{ threadIdA, threadIdB, score, matchType }>} matches
 */
function persistMatches(db, matches) {
  if (!db || typeof db.clearUnifiedMatches !== 'function') {
    console.error('[ThreadMatcher] Invalid db module — missing clearUnifiedMatches');
    return;
  }
  if (!db || typeof db.upsertUnifiedMatch !== 'function') {
    console.error('[ThreadMatcher] Invalid db module — missing upsertUnifiedMatch');
    return;
  }

  try {
    db.clearUnifiedMatches();
    for (const match of (matches || [])) {
      db.upsertUnifiedMatch(match.threadIdA, match.threadIdB, match.score, match.matchType);
    }
    console.log(`[ThreadMatcher] Persisted ${(matches || []).length} cross-platform matches`);
  } catch (e) {
    console.error('[ThreadMatcher] Failed to persist matches:', e.message);
  }
}

module.exports = {
  findCrossPlatformMatches,
  keywordSimilarity,
  extractKeywords,
  persistMatches
};
