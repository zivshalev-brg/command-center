// ─── Voice Profile Loader/Cache ─────────────────────────────────
// Loads Ziv's voice profile JSON with file-based cache invalidation.

const fs = require('fs');
const path = require('path');

let _cachedProfile = null;
let _cachedMtime = null;

/**
 * Returns a hardcoded fallback voice profile.
 * Used when the voice-profile.json file is missing or unparseable.
 * @returns {Object}
 */
function getDefaultProfile() {
  return {
    name: 'Ziv Shalev',
    role: 'General Manager, Beanz',
    company: 'Beanz (part of Breville Group)',
    toneAttributes: [
      'Direct and decisive',
      'Warm but concise',
      'Action-oriented',
      'Uses Australian English spelling'
    ],
    signaturePatterns: ['Thanks {firstName}'],
    avoidPatterns: ['Per my last email', 'Just following up'],
    signOff: 'Cheers,\nZiv',
    contextInstructions: 'Ziv manages beanz.com, a coffee subscription business under Breville Group.'
  };
}

/**
 * Load voice profile from disk with mtime-based cache invalidation.
 * Returns the default profile if the file is missing or corrupt.
 * @param {string} kbDir - Path to the kb-data directory
 * @returns {Object} Parsed voice profile
 */
function loadVoiceProfile(kbDir) {
  const filePath = path.join(kbDir, 'intelligence', 'voice-profile.json');

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;

    // Return cached profile if file hasn't changed
    if (_cachedProfile !== null && _cachedMtime === mtime) {
      return _cachedProfile;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const profile = JSON.parse(raw);

    // Cache the result with its mtime
    _cachedProfile = profile;
    _cachedMtime = mtime;

    return profile;
  } catch (e) {
    console.error('[VoiceProfile] Failed to load voice-profile.json:', e.message);
    return getDefaultProfile();
  }
}

module.exports = { loadVoiceProfile, getDefaultProfile };
