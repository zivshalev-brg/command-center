const https = require('https');

const SLACK_TEAM_ID = 'T061FA5PB';

let _slackUsers = {};
let _slackUsersLoaded = false;
let _noMemberWarningShown = false;
let _isUserTokenMode = false;  // Track if we're using a user token for reads

function slackAPI(token, method, params, retries) {
  retries = retries || 0;
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No Slack token configured'));
    const qs = new URLSearchParams(params).toString();
    const isPost = ['chat.postMessage', 'reactions.add', 'reactions.remove', 'files.uploadV2', 'conversations.join'].includes(method);
    const options = {
      hostname: 'slack.com',
      path: `/api/${method}${!isPost && qs ? '?' + qs : ''}`,
      method: isPost ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': isPost ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Auto-retry on rate limit (up to 2 retries)
          if (parsed.error === 'ratelimited' && retries < 2) {
            const retryAfter = parseInt(res.headers['retry-after'] || '3', 10) * 1000;
            setTimeout(() => {
              slackAPI(token, method, params, retries + 1).then(resolve).catch(reject);
            }, retryAfter);
            return;
          }
          resolve(parsed);
        }
        catch { reject(new Error('Invalid JSON from Slack')); }
      });
    });
    req.on('error', reject);
    if (isPost) req.write(JSON.stringify(params));
    req.end();
  });
}

/** Fetch full thread replies for a specific Slack thread */
/**
 * Fetch ALL replies in a Slack thread WITH PAGINATION.
 * Follows has_more / cursor to get complete thread history.
 * Default: 3 pages * 200 = up to 600 replies per thread.
 */
async function fetchThreadReplies(token, channelId, threadTs, limit) {
  const perPage = Math.min(limit || 200, 200);
  const maxPages = 3;
  const allReplies = [];
  let cursor = '';
  let page = 0;

  try {
    do {
      const params = {
        channel: channelId,
        ts: threadTs,
        limit: String(perPage)
      };
      if (cursor) params.cursor = cursor;

      const resp = await slackAPI(token, 'conversations.replies', params);
      if (!resp.ok) break;

      const msgs = (resp.messages || []).map(m => ({
        sender: slackUserName(m.user),
        userId: m.user,
        avatarUrl: _slackUsers[m.user]?.avatar || '',
        text: (m.text || '').replace(/<@(\w+)>/g, (_, uid) => '@' + slackUserName(uid)),
        time: new Date(parseFloat(m.ts) * 1000).toISOString(),
        via: 'slack',
        slackTs: m.ts,
        threadTs: m.thread_ts,
        reactions: (m.reactions || []).map(r => ({
          name: r.name,
          count: r.count || 1,
          users: r.users || []
        })),
        attachments: (m.files || []).map(f => ({
          name: f.name || 'file',
          size: f.size || 0,
          contentType: f.mimetype || '',
          filetype: f.filetype || '',
          fileId: f.id || '',
          urlPrivate: f.url_private || ''
        }))
      }));
      allReplies.push(...msgs);

      cursor = (resp.has_more && resp.response_metadata?.next_cursor) || '';
      page++;

      if (cursor && page < maxPages) {
        await new Promise(r => setTimeout(r, 200));
      }
    } while (cursor && page < maxPages);

    return allReplies;
  } catch (e) {
    console.error(`[Slack] Failed to fetch thread replies ${channelId}/${threadTs}:`, e.message);
    return allReplies.length ? allReplies : [];
  }
}

/** Get the cached Slack users map (for cross-platform matching) */
function getSlackUsers() {
  return { ..._slackUsers };
}

async function loadSlackUsers(token) {
  if (_slackUsersLoaded) return _slackUsers;
  try {
    let cursor = '';
    do {
      const params = { limit: '200' };
      if (cursor) params.cursor = cursor;
      const resp = await slackAPI(token, 'users.list', params);
      if (resp.ok && resp.members) {
        resp.members.forEach(u => {
          if (!u.deleted) {
            _slackUsers[u.id] = {
              name: u.real_name || u.name,
              displayName: u.profile?.display_name || u.real_name || u.name,
              avatar: u.profile?.image_48 || '',
              email: u.profile?.email || '',
              isBot: u.is_bot || false
            };
          }
        });
      }
      cursor = resp.response_metadata?.next_cursor || '';
    } while (cursor);
    _slackUsersLoaded = true;
  } catch (e) { console.error('Failed to load Slack users:', e.message); }
  return _slackUsers;
}

function slackUserName(userId) {
  return _slackUsers[userId]?.displayName || _slackUsers[userId]?.name || userId;
}

/**
 * Fetch messages from a Slack conversation WITH PAGINATION.
 * Follows has_more / cursor to get ALL messages up to maxPages * perPage.
 * Default: 5 pages * 200 = up to 1000 messages per conversation.
 */
async function fetchSlackMessages(token, channelId, limit, oldest) {
  const perPage = Math.min(limit || 200, 200); // Slack max per call is 200
  const maxPages = 5; // Safety cap: 5 pages max = up to 1000 messages
  const allMessages = [];
  let cursor = '';
  let page = 0;

  try {
    do {
      const params = {
        channel: channelId,
        limit: String(perPage)
      };
      if (oldest) params.oldest = String(oldest);
      if (cursor) params.cursor = cursor;

      const resp = await slackAPI(token, 'conversations.history', params);
      if (!resp.ok) {
        if (resp.error !== 'channel_not_found' && resp.error !== 'not_in_channel') {
          console.error(`Slack history error for ${channelId}:`, resp.error);
        }
        break;
      }

      const msgs = (resp.messages || []).map(m => ({
        sender: slackUserName(m.user),
        userId: m.user,
        avatarUrl: _slackUsers[m.user]?.avatar || '',
        text: (m.text || '').replace(/<@(\w+)>/g, (_, uid) => '@' + slackUserName(uid)),
        time: new Date(parseFloat(m.ts) * 1000).toISOString(),
        via: 'slack',
        slackTs: m.ts,
        threadTs: m.thread_ts,
        replyCount: m.reply_count || 0,
        latestReply: m.latest_reply || null,
        isParent: (m.reply_count || 0) > 0,
        reactions: (m.reactions || []).map(r => ({
          name: r.name,
          count: r.count || 1,
          users: r.users || []
        })),
        attachments: (m.files || []).map(f => ({
          name: f.name || 'file',
          size: f.size || 0,
          contentType: f.mimetype || '',
          filetype: f.filetype || '',
          fileId: f.id || '',
          urlPrivate: f.url_private || ''
        }))
      }));
      allMessages.push(...msgs);

      // Check for more pages
      cursor = (resp.has_more && resp.response_metadata?.next_cursor) || '';
      page++;

      // Rate limit protection: small delay between pages
      if (cursor && page < maxPages) {
        await new Promise(r => setTimeout(r, 200));
      }
    } while (cursor && page < maxPages);

    return allMessages;
  } catch (e) {
    console.error(`Failed to fetch Slack channel ${channelId}:`, e.message);
    return allMessages.length ? allMessages : []; // Return partial results on error
  }
}

// Known Beanz channels — fallback when conversations.list scope is missing
const FALLBACK_CHANNELS = [
  { id: 'C090HAX2V4H', name: 'beanz-load-balancing' },
  { id: 'C046MM8NHHB', name: 'beanz-bof' },
  { id: 'C05L5AA1ABW', name: 'beanz-on-breville' }
];

/**
 * Auto-join a public channel using the bot token.
 * Returns true if join succeeded or already a member.
 */
async function autoJoinChannel(botToken, channelId) {
  try {
    const resp = await slackAPI(botToken, 'conversations.join', { channel: channelId });
    if (resp.ok) return true;
    // already_in_channel is fine
    if (resp.error === 'already_in_channel') return true;
    // method_not_allowed happens for private channels / DMs — skip silently
    if (resp.error === 'method_not_allowed' || resp.error === 'channel_not_found' || resp.error === 'is_archived') return false;
    console.log(`[Slack] Auto-join ${channelId}: ${resp.error}`);
    return false;
  } catch (e) {
    console.error(`[Slack] Auto-join error for ${channelId}:`, e.message);
    return false;
  }
}

/**
 * Fetch all conversations: channels, private channels, group DMs, and DMs.
 * Paginate to get the full list. Falls back to known channels if scope missing.
 *
 * When using a user token (xoxp-...): returns the user's actual conversations.
 * When using a bot token (xoxb-...): returns channels bot has access to.
 */
async function fetchAllConversations(token) {
  const isUserToken = token && token.startsWith('xoxp-');

  // Fetch each type separately in parallel to avoid public channels
  // dominating the pagination and pushing DMs/groups off the results
  async function fetchType(type, maxPages) {
    const results = [];
    let cursor = '';
    let page = 0;
    try {
      do {
        const params = { types: type, exclude_archived: 'true', limit: '200' };
        if (cursor) params.cursor = cursor;
        const resp = await slackAPI(token, 'conversations.list', params);
        if (!resp.ok) {
          if (resp.error !== 'ratelimited') console.error(`Slack conversations.list [${type}] error:`, resp.error);
          if (resp.error === 'missing_scope') return { results: [], scopeFailed: true };
          break;
        }
        (resp.channels || []).forEach(c => {
          results.push({
            id: c.id,
            name: c.name_normalized || c.name || c.id,
            isPrivate: c.is_private || false,
            isMpim: c.is_mpim || false,
            isIm: c.is_im || false,
            isMember: c.is_member || c.is_im || c.is_mpim || false,
            userId: c.user || null,
            memberCount: c.num_members || 0,
            updated: c.updated || 0
          });
        });
        cursor = resp.response_metadata?.next_cursor || '';
        page++;
        if (page >= maxPages) break;
      } while (cursor);
    } catch (e) {
      console.error(`Failed to list Slack [${type}]:`, e.message);
      return { results: [], scopeFailed: true };
    }
    return { results, scopeFailed: false };
  }

  // Fetch all types in parallel — give DMs/groups full pagination,
  // limit public channels (most are non-member and just waste pages)
  const [pubCh, privCh, mpims, ims] = await Promise.all([
    fetchType('public_channel', 5),
    fetchType('private_channel', 5),
    fetchType('mpim', 5),
    fetchType('im', 5)
  ]);

  const all = [
    ...pubCh.results,
    ...privCh.results,
    ...mpims.results,
    ...ims.results
  ];

  const scopeFailed = pubCh.scopeFailed && privCh.scopeFailed && mpims.scopeFailed && ims.scopeFailed;

  // Deduplicate by ID (shouldn't happen, but be safe)
  const seen = new Set();
  const deduped = all.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

  // Fallback: if all requests failed (missing scope), use known channels
  if (deduped.length === 0 && scopeFailed) {
    console.log('[Slack] Falling back to known Beanz channels (conversations.list scope missing)');
    FALLBACK_CHANNELS.forEach(c => {
      deduped.push({
        id: c.id, name: c.name,
        isPrivate: false, isMpim: false, isIm: false,
        isMember: true,
        userId: null, memberCount: 0, updated: 0
      });
    });
  }

  if (isUserToken) {
    const memberCount = deduped.filter(c => c.isMember).length;
    console.log(`[Slack] User token: ${deduped.length} conversations (${pubCh.results.length} pub, ${privCh.results.length} priv, ${mpims.results.length} mpim, ${ims.results.length} im), ${memberCount} accessible`);
  }

  return deduped;
}

// Backward compat: simple channel list for /api/comms/channels
async function fetchSlackChannels(token) {
  const all = await fetchAllConversations(token);
  return all.filter(c => !c.isIm);
}

/** Classify a conversation for the UI */
function getConversationType(ch) {
  if (ch.isIm) return 'dm';
  if (ch.isMpim) return 'group';
  if (ch.isPrivate) return 'private';
  return 'channel';
}

/** Derive a human-readable name for DMs and group chats */
function getConversationName(ch) {
  if (ch.isIm && ch.userId) {
    const u = _slackUsers[ch.userId];
    return u ? u.displayName || u.name : ch.userId;
  }
  if (ch.isMpim) {
    // mpim names are like "mpdm-user1--user2--user3-1"
    const parts = (ch.name || '').replace(/^mpdm-/, '').replace(/-\d+$/, '').split('--');
    const names = parts.map(p => {
      for (const [uid, u] of Object.entries(_slackUsers)) {
        if ((u.name || '').toLowerCase().replace(/[.\s]/g, '') === p.replace(/[.\s]/g, '').toLowerCase()) return u.displayName || u.name;
      }
      return p;
    });
    return names.join(', ');
  }
  return '#' + ch.name;
}

function inferSlackPriority(channel, msgs) {
  const importantChannels = ['beanz-bof', 'beanz-load-balancing', 'beanz-incidents', 'beanz-exec', 'beanz-critical'];
  if (importantChannels.some(c => channel.name && channel.name.toLowerCase().includes(c.replace('#', '')))) return 'action';
  const urgentWords = /\b(urgent|critical|blocker|asap|p0|p1|incident|outage|down|escalat|breaking|emergency|sev[- ]?[01])\b/i;
  const allText = msgs.map(m => m.text || '').join(' ');
  if (urgentWords.test(allText)) return 'action';
  // DMs are generally higher priority
  if (channel.isIm) return 'action';
  if (msgs.length > 8) return 'action';
  if (msgs.length > 4) return 'fyi';
  return 'fyi';
}

/**
 * Build all Slack threads for the Comms module.
 *
 * @param {string} readToken — Token used for reading (user token preferred, bot token fallback)
 * @param {string} [writeToken] — Bot token used for auto-joining channels (optional)
 */
async function buildSlackThreads(readToken, writeToken) {
  const botToken = writeToken || readToken;
  const isUserToken = readToken && readToken.startsWith('xoxp-');

  // Load users with whichever token works (bot token usually has users:read)
  await loadSlackUsers(botToken);

  const threads = {};
  const allConversations = await fetchAllConversations(readToken);

  let memberConvos;
  if (isUserToken) {
    // With user token: is_member is reliable — the user's actual inbox
    memberConvos = allConversations.filter(ch => ch.isMember);
    console.log(`[Slack] User token: ${memberConvos.length} member conversations out of ${allConversations.length}`);
  } else {
    // Bot token mode: is_member only true for channels bot was invited to
    memberConvos = allConversations.filter(ch => ch.isMember);

    // If no member conversations, try auto-joining beanz-* public channels
    if (memberConvos.length === 0) {
      console.log(`[Slack] Bot not a member of any channel. Auto-joining beanz-* channels...`);
      const beanzChannels = allConversations.filter(ch =>
        !ch.isIm && !ch.isMpim && !ch.isPrivate &&
        ch.name && ch.name.toLowerCase().includes('beanz')
      );
      // Also include fallback channels by ID
      const fallbackIds = new Set(FALLBACK_CHANNELS.map(c => c.id));
      const toJoin = [...beanzChannels];
      allConversations.forEach(ch => {
        if (fallbackIds.has(ch.id) && !beanzChannels.some(b => b.id === ch.id)) {
          toJoin.push(ch);
        }
      });

      let joinedCount = 0;
      // Join in small batches to avoid rate limits
      for (let i = 0; i < toJoin.length && i < 20; i++) {
        const ch = toJoin[i];
        const joined = await autoJoinChannel(botToken, ch.id);
        if (joined) {
          joinedCount++;
          memberConvos.push({ ...ch, isMember: true });
        }
        // Small delay between joins
        if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 500));
      }
      console.log(`[Slack] Auto-joined ${joinedCount} of ${toJoin.length} beanz channels`);
    }

    // If still nothing, use fallback channels directly
    if (memberConvos.length === 0 && FALLBACK_CHANNELS.length > 0) {
      console.log(`[Slack] Trying ${FALLBACK_CHANNELS.length} known channels as fallback...`);
      // Try to join each fallback channel
      for (const c of FALLBACK_CHANNELS) {
        await autoJoinChannel(botToken, c.id);
      }
      memberConvos = FALLBACK_CHANNELS.map(c => ({
        id: c.id, name: c.name,
        isPrivate: false, isMpim: false, isIm: false,
        isMember: true, userId: null, memberCount: 0, updated: 0
      }));
    }
  }

  if (memberConvos.length === 0 && allConversations.length > 0 && !_noMemberWarningShown) {
    console.log(`[Slack] No accessible conversations found out of ${allConversations.length} total.`);
    console.log(`[Slack] For full inbox access, add SLACK_USER_TOKEN (xoxp-...) to .env`);
    _noMemberWarningShown = true;
  } else if (memberConvos.length > 0) {
    _noMemberWarningShown = false;
  }

  // Sort by most recently updated first — ensures active channels, DMs, and groups
  // all compete fairly instead of old inactive DMs crowding out active channels
  const sorted = [...memberConvos].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  // Cap at 200 conversations to keep refresh under 60s
  const MAX_PROCESS = 200;
  const toProcess = sorted.slice(0, MAX_PROCESS);
  const typeCounts = { im: 0, mpim: 0, private: 0, channel: 0 };
  toProcess.forEach(c => { if (c.isIm) typeCounts.im++; else if (c.isMpim) typeCounts.mpim++; else if (c.isPrivate) typeCounts.private++; else typeCounts.channel++; });
  console.log(`[Slack] Processing ${toProcess.length} of ${memberConvos.length} member conversations (${typeCounts.im} dm, ${typeCounts.mpim} group, ${typeCounts.private} priv, ${typeCounts.channel} ch)`);

  // Process in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    // Add 1s delay between batches (skip first batch)
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    await Promise.allSettled(batch.map(ch => processConversation(readToken, ch, threads)));
  }

  _isUserTokenMode = isUserToken;
  console.log(`[Slack] Built ${Object.keys(threads).length} threads from ${toProcess.length} conversations`);
  return threads;
}

/**
 * Process a single conversation into ONE thread entry.
 *
 * Every Slack conversation (channel, DM, group, private) becomes exactly ONE
 * inbox entry — like a real Slack sidebar. All recent messages go inside that
 * single entry. For channels, threaded messages show reply counts and can be
 * expanded. For DMs/groups, messages form a flat conversation.
 */
async function processConversation(token, ch, threads) {
  try {
    const msgs = await fetchSlackMessages(token, ch.id, 150);
    if (!msgs.length) return;

    // Only include conversations with activity in last 30 days
    const cutoff = Date.now() - 30 * 86400000;
    const recentMsgs = msgs.filter(m => new Date(m.time).getTime() > cutoff);
    if (!recentMsgs.length) return;

    const convType = getConversationType(ch);
    const convName = getConversationName(ch);
    const threadId = `slack-${ch.id}-conv`;

    // Filter out system messages (join/leave/archive) — they're noise
    const SYSTEM_MSG_PATTERN = /has (joined|left) the channel|set the channel (topic|purpose|description)|was added to|was removed from|archived the channel/i;
    const contentMsgs = recentMsgs.filter(m => !SYSTEM_MSG_PATTERN.test(m.text || ''));

    // If all messages are system messages, skip this channel entirely
    if (contentMsgs.length === 0) return;

    // Sort all messages chronologically (oldest first)
    const sorted = [...contentMsgs].sort(
      (a, b) => new Date(a.time) - new Date(b.time)
    );

    const firstMsg = sorted[0];
    const lastMsg = sorted[sorted.length - 1];
    const people = [...new Set(sorted.map(m => m.sender).filter(s => s && s !== 'You'))];

    // For channels: fetch replies for threaded parent messages (up to 3 per channel)
    const isChannel = convType === 'channel' || convType === 'private';
    const MAX_THREAD_FETCHES = 20;
    let fetchCount = 0;

    // Build a map of thread_ts → replies fetched from conversations.replies
    const threadRepliesMap = {};

    if (isChannel) {
      const parentMsgs = sorted.filter(m => m.replyCount > 0 && (!m.threadTs || m.threadTs === m.slackTs));
      for (const pm of parentMsgs) {
        if (fetchCount >= MAX_THREAD_FETCHES) break;
        try {
          const replies = await fetchThreadReplies(token, ch.id, pm.slackTs, 200);
          // Skip the first reply (it's the parent itself)
          threadRepliesMap[pm.slackTs] = replies.filter(r => r.slackTs !== pm.slackTs);
          fetchCount++;
        } catch (e) { /* skip */ }
      }
    }

    // Format messages with thread structure
    const formattedMsgs = [];
    const fmtTime = (t) => new Date(t).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) +
      ', ' + new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });

    for (const m of sorted) {
      // Skip messages that are in-thread replies returned by conversations.history
      // (they'll be inserted under their parent via threadRepliesMap)
      if (m.threadTs && m.threadTs !== m.slackTs && threadRepliesMap[m.threadTs]) continue;

      const hasReplies = m.replyCount > 0 && threadRepliesMap[m.slackTs];
      formattedMsgs.push({
        sender: m.sender, userId: m.userId, avatarUrl: m.avatarUrl || '',
        text: (m.text || '').slice(0, 500),
        time: fmtTime(m.time), via: 'slack', slackTs: m.slackTs, threadTs: m.threadTs,
        isParent: hasReplies ? true : false,
        isReply: false,
        replyCount: m.replyCount || 0,
        reactions: m.reactions && m.reactions.length ? m.reactions : undefined,
        attachments: m.attachments && m.attachments.length ? m.attachments : undefined
      });

      // Insert fetched thread replies right after the parent
      if (hasReplies) {
        for (const r of threadRepliesMap[m.slackTs]) {
          formattedMsgs.push({
            sender: r.sender, userId: r.userId, avatarUrl: r.avatarUrl || '',
            text: (r.text || '').slice(0, 500),
            time: fmtTime(r.time), via: 'slack', slackTs: r.slackTs, threadTs: r.threadTs,
            isParent: false, isReply: true,
            replyToSender: m.sender,
            replyToPreview: m.text.slice(0, 60),
            reactions: r.reactions && r.reactions.length ? r.reactions : undefined,
            attachments: r.attachments && r.attachments.length ? r.attachments : undefined
          });
        }
      }
    }

    const lastActivity = new Date(lastMsg.time).toISOString();
    const preview = lastMsg.text.slice(0, 120) + (lastMsg.text.length > 120 ? '...' : '');

    // Build subject based on type
    let subject;
    if (convType === 'dm') {
      subject = convName;
    } else if (convType === 'group') {
      subject = convName;
    } else {
      // Channel: use channel name
      subject = convName;
    }

    const totalReplies = Object.values(threadRepliesMap).reduce((sum, r) => sum + r.length, 0);

    threads[threadId] = {
      subject, priority: inferSlackPriority(ch, sorted),
      sources: ['slack'], sourceType: convType, people,
      lastSender: lastMsg.sender, lastActivity, preview,
      threadCount: formattedMsgs.length, unread: false,
      messages: formattedMsgs, slackChannel: ch.id,
      slackChannelName: convName, slackThreadTs: null,
      hasThreads: totalReplies > 0, totalThreadReplies: totalReplies
    };
  } catch (e) {
    // Rate limit handling: log and continue, don't break the whole batch
    if (e.message && e.message.includes('ratelimited')) {
      console.log(`[Slack] Rate limited on ${ch.id}, will retry next cycle`);
    } else {
      console.error(`[Slack] Error processing ${ch.name || ch.id}:`, e.message);
    }
  }
}

/**
 * Download a Slack file via its url_private URL.
 * Requires a token for authentication (user or bot).
 *
 * @param {string} token — Slack token (user or bot)
 * @param {string} fileUrl — url_private from Slack file object
 * @returns {Promise<Buffer|null>} — file content buffer, or null on error
 */
async function fetchSlackFileContent(token, fileUrl) {
  if (!token || !fileUrl) return null;
  return new Promise((resolve) => {
    try {
      const url = new URL(fileUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      };
      const req = https.request(options, (res) => {
        // Follow redirects (Slack sometimes redirects file downloads)
        if (res.statusCode === 302 || res.statusCode === 301) {
          const location = res.headers.location;
          if (location) {
            fetchSlackFileContent(token, location).then(resolve);
            return;
          }
          resolve(null);
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.setTimeout(15000, () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/** Check if currently operating in user-token mode */
function isUserTokenMode() {
  return _isUserTokenMode;
}

module.exports = {
  SLACK_TEAM_ID,
  slackAPI, loadSlackUsers, slackUserName, getSlackUsers,
  fetchSlackMessages, fetchSlackChannels, fetchAllConversations,
  fetchThreadReplies, fetchSlackFileContent, autoJoinChannel,
  inferSlackPriority, buildSlackThreads, isUserTokenMode
};
