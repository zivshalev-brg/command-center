/**
 * research-email.js — Convert research reports to HTML newsletter emails
 * Uses TABLE-based layout for Outlook compatibility (no flexbox, no grid)
 */
'use strict';

const { sendEmail } = require('./outlook-api');
const DEFAULT_RECIPIENTS = [];

function reportToHtml(report, feedType) {
  var ac = feedType === 'tech' ? '#4f6df5' : '#16a34a';
  var acBg = feedType === 'tech' ? '#eef1ff' : '#ecfdf5';
  var label = feedType === 'tech' ? 'AI & Technology' : 'Coffee Industry';
  var icon = feedType === 'tech' ? '&#129302;' : '&#9749;';
  var date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var meta = report.meta || {};

  var h = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;padding:0}table{border-collapse:collapse}img{display:block;border:0}a{color:' + ac + '}</style></head>' +
    '<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Georgia,Times New Roman,serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5"><tr><td align="center">' +
    '<table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;max-width:640px;width:100%">';

  // ═══ HEADER ═══
  h += '<tr><td style="background-color:' + ac + ';padding:32px 32px 24px;text-align:center">' +
    '<p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);font-family:Arial,sans-serif">' + icon + ' BEANZ OS &middot; ' + esc(label) + ' RESEARCH</p>' +
    '<h1 style="margin:12px 0 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;font-family:Arial,sans-serif">' + esc(report.title || 'Research Brief') + '</h1>' +
    (report.subtitle ? '<p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);font-style:italic">' + esc(report.subtitle) + '</p>' : '') +
    '<p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.5);font-family:Arial,sans-serif">' + esc(date) +
    ' &middot; ' + (meta.videos_analyzed || 0) + ' videos &middot; ' + (meta.articles_analyzed || 0) + ' articles &middot; ' + (meta.reddit_threads || 0) + ' threads</p>' +
    '</td></tr>';

  // ═══ BRAND SENTIMENT DASHBOARD ═══
  if (report.brand_sentiment && report.brand_sentiment.brands) {
    var bs = report.brand_sentiment;
    h += '<tr><td style="padding:24px 32px;background-color:#1a1a2e">' +
      '<p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">&#128202; BRAND SENTIMENT DASHBOARD</p>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#9ca3af;font-family:Arial,sans-serif">' + esc(bs.summary || '') + '</p>';

    // Brand cards table
    h += '<table width="100%" cellpadding="0" cellspacing="0">';

    bs.brands.forEach(function(brand) {
      if (!brand.name) return;
      var sentColor = brand.sentiment === 'positive' ? '#22c55e' : brand.sentiment === 'negative' ? '#ef4444' : brand.sentiment === 'mixed' ? '#f59e0b' : '#9ca3af';
      var sentBg = brand.sentiment === 'positive' ? '#052e16' : brand.sentiment === 'negative' ? '#450a0a' : brand.sentiment === 'mixed' ? '#451a03' : '#1f2937';
      var sentIcon = brand.sentiment === 'positive' ? '&#9650;' : brand.sentiment === 'negative' ? '&#9660;' : brand.sentiment === 'mixed' ? '&#9670;' : '&#9679;';

      h += '<tr><td style="padding:6px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:' + sentBg + ';border-radius:8px"><tr>' +
        '<td style="padding:12px 16px">' +
          '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
            '<td style="font-size:16px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif">' + esc(brand.name) + '</td>' +
            '<td width="100" align="center" style="font-size:20px;font-weight:700;color:' + sentColor + ';font-family:Arial,sans-serif">' + (brand.mentions || 0) + '<br/><span style="font-size:9px;font-weight:400;color:#9ca3af">mentions</span></td>' +
            '<td width="80" align="right"><span style="display:inline-block;font-size:11px;padding:4px 12px;border-radius:10px;background-color:' + sentColor + ';color:#ffffff;font-weight:600;font-family:Arial,sans-serif">' + sentIcon + ' ' + esc(brand.sentiment || 'N/A') + '</span></td>' +
          '</tr></table>';

      // Complaints
      if (brand.complaints && brand.complaints.length) {
        h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">';
        brand.complaints.forEach(function(c) {
          var sevColor = c.severity === 'high' ? '#ef4444' : c.severity === 'medium' ? '#f59e0b' : '#9ca3af';
          h += '<tr><td style="padding:4px 0">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(239,68,68,0.1);border-radius:6px"><tr>' +
            '<td width="3" style="background-color:' + sevColor + ';border-radius:6px 0 0 6px"></td>' +
            '<td style="padding:8px 12px">' +
              '<p style="margin:0;font-size:11px;font-weight:600;color:#ef4444;font-family:Arial,sans-serif;text-transform:uppercase">&#9888; ' + esc(c.issue || '') + '</p>' +
              (c.quote ? '<p style="margin:4px 0 0;font-size:12px;font-style:italic;color:#d1d5db">&ldquo;' + esc(c.quote) + '&rdquo;</p>' : '') +
              '<p style="margin:4px 0 0;font-size:10px;color:#6b7280;font-family:Arial,sans-serif">' + esc(c.source || '') +
                (c.url ? ' &middot; <a href="' + esc(c.url) + '" style="color:' + ac + ';text-decoration:none">view &#8599;</a>' : '') + '</p>' +
            '</td></tr></table></td></tr>';
        });
        h += '</table>';
      }

      // Compliments
      if (brand.compliments && brand.compliments.length) {
        h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">';
        brand.compliments.forEach(function(c) {
          h += '<tr><td style="padding:4px 0">' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(34,197,94,0.1);border-radius:6px"><tr>' +
            '<td width="3" style="background-color:#22c55e;border-radius:6px 0 0 6px"></td>' +
            '<td style="padding:8px 12px">' +
              '<p style="margin:0;font-size:11px;font-weight:600;color:#22c55e;font-family:Arial,sans-serif">&#10004; ' + esc(c.praise || '') + '</p>' +
              (c.quote ? '<p style="margin:4px 0 0;font-size:12px;font-style:italic;color:#d1d5db">&ldquo;' + esc(c.quote) + '&rdquo;</p>' : '') +
              '<p style="margin:4px 0 0;font-size:10px;color:#6b7280;font-family:Arial,sans-serif">' + esc(c.source || '') +
                (c.url ? ' &middot; <a href="' + esc(c.url) + '" style="color:' + ac + ';text-decoration:none">view &#8599;</a>' : '') + '</p>' +
            '</td></tr></table></td></tr>';
        });
        h += '</table>';
      }

      h += '</td></tr></table></td></tr>';
    });

    h += '</table>';

    // Total mentions
    h += '<p style="margin:12px 0 0;font-size:11px;color:#6b7280;font-family:Arial,sans-serif;text-align:center">' + (bs.total_mentions || 0) + ' total brand mentions across all sources</p>';
    h += '</td></tr>';
  }

  // ═══ EXECUTIVE SUMMARY ═══
  if (report.executive_summary) {
    h += '<tr><td style="padding:28px 32px;border-bottom:1px solid #e5e7eb">' +
      '<p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">EXECUTIVE SUMMARY</p>' +
      '<p style="margin:0;font-size:16px;line-height:1.8;color:#374151">' + esc(report.executive_summary).replace(/\n\n/g, '</p><p style="margin:14px 0 0;font-size:16px;line-height:1.8;color:#374151">') + '</p>' +
      '</td></tr>';
  }

  // ═══ TRENDS ═══
  if (report.trends && report.trends.length) {
    h += '<tr><td style="padding:28px 32px 0">' +
      '<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">TRENDS &amp; SIGNALS</p>' +
      '</td></tr>';

    report.trends.forEach(function(t, idx) {
      var confColor = t.confidence === 'high' ? '#166534' : t.confidence === 'emerging' ? '#92400e' : '#1e40af';
      var confBg = t.confidence === 'high' ? '#dcfce7' : t.confidence === 'emerging' ? '#fef3c7' : '#dbeafe';

      h += '<tr><td style="padding:16px 32px 24px;border-bottom:1px solid #f3f4f6">';

      // Number + title
      h += '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td width="40" valign="top" style="font-size:28px;font-weight:700;color:' + ac + ';font-family:Arial,sans-serif;opacity:0.3;padding-right:8px">' + (idx < 9 ? '0' : '') + (idx + 1) + '</td>' +
        '<td valign="top">' +
          '<p style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;line-height:1.3">' + esc(t.trend) + '</p>' +
          '<p style="margin:6px 0 0">' +
            '<span style="display:inline-block;font-size:10px;padding:3px 10px;border-radius:10px;background-color:' + confBg + ';color:' + confColor + ';font-weight:600;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.5px">' + esc(t.confidence || '') + '</span>' +
            (t.category ? ' <span style="display:inline-block;font-size:10px;padding:3px 10px;border-radius:10px;background-color:#f3f4f6;color:#6b7280;font-family:Arial,sans-serif">' + esc(t.category) + '</span>' : '') +
          '</p>' +
        '</td></tr></table>';

      // Analysis
      h += '<p style="margin:12px 0;font-size:15px;line-height:1.8;color:#4b5563">' + esc(t.analysis || '') + '</p>';

      // Evidence quotes
      if (t.evidence && t.evidence.length) {
        t.evidence.forEach(function(e) {
          var link = e.url || (e.videoId ? 'https://www.youtube.com/watch?v=' + e.videoId + (e.timestamp ? '&t=' + e.timestamp : '') : '');
          var isVideo = e.videoId || (link && link.indexOf('youtube') >= 0);
          var tsLabel = e.timestamp ? ' &middot; ' + Math.floor(e.timestamp / 60) + ':' + ('0' + Math.floor(e.timestamp % 60)).slice(-2) : '';
          var thumb = e.videoId ? 'https://img.youtube.com/vi/' + e.videoId + '/mqdefault.jpg' : '';

          h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;background-color:#f9fafb;border-radius:8px"><tr>';
          h += '<td width="4" style="background-color:' + ac + ';border-radius:8px 0 0 8px"></td>';
          h += '<td style="padding:14px 16px">';
          if (thumb) {
            h += '<a href="' + esc(link) + '"><img src="' + esc(thumb) + '" width="100%" style="max-width:576px;border-radius:6px;margin-bottom:10px" alt=""/></a>';
          }
          h += '<p style="margin:0;font-size:15px;font-style:italic;color:#374151;line-height:1.7">&ldquo;' + esc(e.quote || '') + '&rdquo;</p>';
          h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>' +
            '<td style="font-size:12px;color:#9ca3af;font-family:Arial,sans-serif">&mdash; ' + esc(e.source || '') + tsLabel + '</td>' +
            (link ? '<td align="right"><a href="' + esc(link) + '" style="display:inline-block;font-size:12px;font-weight:600;color:' + ac + ';text-decoration:none;padding:4px 12px;border:2px solid ' + ac + ';border-radius:6px;font-family:Arial,sans-serif">' + (isVideo ? '&#9654; Watch' : '&#8599; Read') + '</a></td>' : '') +
            '</tr></table>';
          h += '</td></tr></table>';
        });
      }

      // Implications
      if (t.implications) {
        h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;background-color:' + acBg + ';border-radius:8px"><tr><td style="padding:12px 16px;font-size:13px;color:' + (feedType === 'tech' ? '#1e40af' : '#166534') + ';font-family:Arial,sans-serif"><strong>&#8594; Implications:</strong> ' + esc(t.implications) + '</td></tr></table>';
      }

      // Tools mentioned
      if (t.tools_mentioned && t.tools_mentioned.length) {
        h += '<p style="margin:8px 0 0">' + t.tools_mentioned.map(function(tm) { return '<span style="display:inline-block;font-size:11px;padding:3px 10px;border-radius:6px;background-color:' + acBg + ';color:' + ac + ';font-family:Arial,sans-serif;margin:2px">' + esc(tm) + '</span>'; }).join(' ') + '</p>';
      }

      h += '</td></tr>';
    });
  }

  // ═══ DEEP DIVES ═══
  if (report.deep_dives && report.deep_dives.length) {
    h += '<tr><td style="padding:28px 32px 0;border-top:1px solid #e5e7eb">' +
      '<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">DEEP DIVES</p></td></tr>';

    report.deep_dives.forEach(function(dd) {
      h += '<tr><td style="padding:16px 32px 24px">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:10px"><tr><td style="padding:20px">' +
        '<p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif">' + esc(dd.title) + '</p>' +
        '<p style="margin:0;font-size:15px;line-height:1.8;color:#4b5563">' + esc(dd.synthesis || '') + '</p>';

      if (dd.key_quotes && dd.key_quotes.length) {
        dd.key_quotes.forEach(function(q) {
          var link = q.url || (q.videoId ? 'https://www.youtube.com/watch?v=' + q.videoId + (q.timestamp ? '&t=' + q.timestamp : '') : '');
          h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0;background-color:#faf5ff;border-radius:8px"><tr>' +
            '<td width="3" style="background-color:#a78bfa;border-radius:8px 0 0 8px"></td>' +
            '<td style="padding:12px 16px">' +
              '<p style="margin:0;font-style:italic;font-size:14px;color:#4b5563">&ldquo;' + esc(q.quote || '') + '&rdquo;</p>' +
              '<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif">&mdash; ' + esc(q.speaker || '') +
                (link ? ' &middot; <a href="' + esc(link) + '" style="color:#7c3aed;font-weight:600;text-decoration:none">&#8599; Source</a>' : '') +
              '</p></td></tr></table>';
        });
      }

      if (dd.takeaway) {
        h += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;background-color:#fffbeb;border-radius:8px"><tr><td style="padding:12px 16px;font-size:13px;color:#92400e;font-family:Arial,sans-serif"><strong>&#128161; Takeaway:</strong> ' + esc(dd.takeaway) + '</td></tr></table>';
      }

      h += '</td></tr></table></td></tr>';
    });
  }

  // ═══ TOOLS ═══
  if (report.tools_and_products && report.tools_and_products.length) {
    h += '<tr><td style="padding:28px 32px 8px;border-top:1px solid #e5e7eb">' +
      '<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">TOOLS &amp; PRODUCTS RADAR</p></td></tr>';

    report.tools_and_products.forEach(function(tool) {
      var sentColor = tool.sentiment === 'positive' ? '#166534' : tool.sentiment === 'negative' ? '#991b1b' : '#92400e';
      var sentBg = tool.sentiment === 'positive' ? '#dcfce7' : tool.sentiment === 'negative' ? '#fef2f2' : '#fef3c7';

      h += '<tr><td style="padding:4px 32px"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px"><tr><td style="padding:12px 16px">' +
        '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
          '<td style="font-weight:700;font-size:15px;color:#1a1a2e;font-family:Arial,sans-serif">' + esc(tool.name) + '</td>' +
          '<td align="right"><span style="display:inline-block;font-size:10px;padding:3px 10px;border-radius:10px;background-color:' + sentBg + ';color:' + sentColor + ';font-weight:600;font-family:Arial,sans-serif;text-transform:uppercase">' + esc(tool.sentiment || '') + '</span></td>' +
        '</tr></table>' +
        '<p style="margin:6px 0 0;font-size:14px;color:#6b7280;line-height:1.6">' + esc((tool.what_people_say || '').slice(0, 200)) + '</p>' +
      '</td></tr></table></td></tr>';
    });
  }

  // ═══ READING LIST ═══
  if (report.reading_list && report.reading_list.length) {
    h += '<tr><td style="padding:28px 32px 8px;border-top:1px solid #e5e7eb">' +
      '<p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:' + ac + ';font-family:Arial,sans-serif">&#128218; MUST-READ / MUST-WATCH</p></td></tr>';

    report.reading_list.forEach(function(item) {
      var typeColor = item.type === 'video' ? '#dc2626' : item.type === 'reddit' ? '#ea580c' : ac;
      var linkLabel = item.type === 'video' ? '&#9654; Watch' : item.type === 'reddit' ? '&#8599; Thread' : '&#8599; Read';
      var vidMatch = (item.url || '').match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      var thumb = vidMatch ? 'https://img.youtube.com/vi/' + vidMatch[1] + '/mqdefault.jpg' : '';

      h += '<tr><td style="padding:4px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr>';
      if (thumb) {
        h += '<td width="110" valign="top" style="padding-right:12px"><a href="' + esc(item.url || '') + '"><img src="' + esc(thumb) + '" width="100" height="56" style="border-radius:6px;object-fit:cover" alt=""/></a></td>';
      }
      h += '<td valign="top" style="padding:2px 0">' +
        '<p style="margin:0;font-weight:600;font-size:14px;color:#1a1a2e;font-family:Arial,sans-serif;line-height:1.4">' + esc(item.title || '') + '</p>' +
        (item.duration ? '<span style="font-size:11px;color:#9ca3af;font-family:Arial,sans-serif">' + esc(item.duration) + '</span>' : '') +
        '<p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5">' + esc(item.why || '') + '</p>' +
      '</td>' +
      '<td width="80" align="right" valign="middle"><a href="' + esc(item.url || '') + '" style="display:inline-block;font-size:12px;font-weight:600;color:' + typeColor + ';text-decoration:none;padding:6px 12px;border:2px solid ' + typeColor + ';border-radius:6px;font-family:Arial,sans-serif;white-space:nowrap">' + linkLabel + '</a></td>';
      h += '</tr></table></td></tr>';
    });
  }

  // ═══ BOTTOM LINE ═══
  if (report.bottom_line) {
    h += '<tr><td style="padding:28px 32px;background-color:' + acBg + '">' +
      '<p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:' + ac + ';font-weight:700;font-family:Arial,sans-serif">&#127919; THE BOTTOM LINE</p>' +
      '<p style="margin:0;font-size:17px;line-height:1.7;color:#1a1a2e;font-weight:500">' + esc(report.bottom_line) + '</p>' +
      '</td></tr>';
  }

  // ═══ FOOTER ═══
  h += '<tr><td style="padding:24px 32px;text-align:center;background-color:#f9fafb">' +
    '<p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,sans-serif">Generated by <strong>Beanz OS Command Center</strong> &middot; ' + esc(date) + '</p>' +
    '<p style="margin:4px 0 0;font-size:10px;color:#d1d5db;font-family:Arial,sans-serif">Powered by Claude Opus &middot; YouTube transcripts &middot; RSS &middot; Reddit</p>' +
    '</td></tr>';

  h += '</table></td></tr></table></body></html>';
  return h;
}

async function sendResearchEmail(ctx, report, feedType, recipients) {
  if (!report) throw new Error('No report to send');
  var recipientList = recipients || getRecipientList();
  if (recipientList.length === 0) throw new Error('No recipients configured');
  var label = feedType === 'tech' ? 'AI & Tech' : 'Coffee';
  var subject = (report.title || label + ' Research Brief') + ' — ' + new Date().toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' });
  var bodyHtml = reportToHtml(report, feedType);
  await sendEmail(ctx.msGraph, { to: recipientList, subject: subject, bodyHtml: bodyHtml, importance: 'normal' });
  console.log('[Research Email] Sent ' + feedType + ' report to ' + recipientList.length + ' recipients');
  return { ok: true, recipients: recipientList, subject: subject };
}

function getRecipientList() {
  var envRecipients = process.env.RESEARCH_EMAIL_RECIPIENTS || '';
  if (envRecipients) return envRecipients.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  return DEFAULT_RECIPIENTS;
}

function esc(s) {
  return typeof s !== 'string' ? '' : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { sendResearchEmail, reportToHtml, getRecipientList };
