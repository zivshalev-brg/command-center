const { jsonReply } = require('../lib/helpers');
const { slackAPI } = require('../lib/slack-api');

// POST /api/slack/send
module.exports.handleSend = async function(req, res, parts, url, ctx) {
  if (req.method !== 'POST') return jsonReply(res, 405, { error: 'POST required' });
  if (!ctx.slackToken) return jsonReply(res, 400, { error: 'No SLACK_BOT_TOKEN' });

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { channel, text, thread_ts } = JSON.parse(body);
      if (!channel || !text) return jsonReply(res, 400, { error: 'channel and text required' });
      const params = { channel, text };
      if (thread_ts) params.thread_ts = thread_ts;
      const resp = await slackAPI(ctx.slackToken, 'chat.postMessage', params);
      if (resp.ok) {
        return jsonReply(res, 200, { ok: true, ts: resp.ts, channel: resp.channel });
      } else {
        return jsonReply(res, 400, { error: resp.error || 'Slack send failed' });
      }
    } catch (e) {
      return jsonReply(res, 500, { error: 'Send failed: ' + e.message });
    }
  });
};

// POST /api/slack/react
module.exports.handleReact = async function(req, res, parts, url, ctx) {
  if (req.method !== 'POST') return jsonReply(res, 405, { error: 'POST required' });
  if (!ctx.slackToken) return jsonReply(res, 400, { error: 'No SLACK_BOT_TOKEN' });

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { channel, timestamp, name, remove } = JSON.parse(body);
      if (!channel || !timestamp || !name) return jsonReply(res, 400, { error: 'channel, timestamp, and name required' });
      const method = remove ? 'reactions.remove' : 'reactions.add';
      const resp = await slackAPI(ctx.slackToken, method, { channel, timestamp, name });
      if (resp.ok) {
        return jsonReply(res, 200, { ok: true });
      } else {
        return jsonReply(res, 400, { error: resp.error || 'Reaction failed' });
      }
    } catch (e) {
      return jsonReply(res, 500, { error: 'Reaction failed: ' + e.message });
    }
  });
};

// POST /api/slack/upload
module.exports.handleUpload = async function(req, res, parts, url, ctx) {
  if (req.method !== 'POST') return jsonReply(res, 405, { error: 'POST required' });
  if (!ctx.slackToken) return jsonReply(res, 400, { error: 'No SLACK_BOT_TOKEN' });

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { channel, content, filename, title, thread_ts } = JSON.parse(body);
      if (!channel || !content) return jsonReply(res, 400, { error: 'channel and content required' });
      const params = {
        channel_id: channel,
        content: content,
        filename: filename || 'file.txt',
        title: title || filename || 'Shared file'
      };
      if (thread_ts) params.thread_ts = thread_ts;
      const resp = await slackAPI(ctx.slackToken, 'files.uploadV2', params);
      if (resp.ok) {
        return jsonReply(res, 200, { ok: true, file: resp.file });
      } else {
        return jsonReply(res, 400, { error: resp.error || 'Upload failed' });
      }
    } catch (e) {
      return jsonReply(res, 500, { error: 'Upload failed: ' + e.message });
    }
  });
};
