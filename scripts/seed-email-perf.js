#!/usr/bin/env node
'use strict';
// One-shot transform: merge pre-queried Databricks slices into email-perf-live.json.
// Usable as a seed builder OR as a template for refresh-email-perf.js when credentials are present.

const fs = require('fs');
const path = require('path');

// ─── Slice 1: Totals per SendID (24 rows, pre-queried) ──────
const totals = [
  { sendId: 2597200, emailName: 'EditSubscriptionGeneric',           category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 15152, delivered: 15350, unique_open: 13044, unique_click: 1054 },
  { sendId: 2644112, emailName: 'Beanz_OrderPartialProcessing',      category: 'Transactional',          sentDate: '2026-04-15', sent: 39723, delivered: 39723, unique_open: 33009, unique_click: 899 },
  { sendId: 2644113, emailName: 'Beanz_OrderShipment',               category: 'Transactional',          sentDate: '2026-04-15', sent: 39770, delivered: 39770, unique_open: 33673, unique_click: 11665 },
  { sendId: 2644111, emailName: 'Beanz_OrderConfirmation',           category: 'Transactional',          sentDate: '2026-04-15', sent: 27657, delivered: 27657, unique_open: 22882, unique_click: 545 },
  { sendId: 2644114, emailName: 'Beanz_UpcomingSubscription',        category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 21411, delivered: 21411, unique_open: 17881, unique_click: 6435 },
  { sendId: 2587328, emailName: 'Beanz_RateMyCoffee',                category: 'Other',                  sentDate: '2026-04-15', sent: 21601, delivered: 21601, unique_open: 16681, unique_click: 2033 },
  { sendId: 2587334, emailName: 'ChangeCoffeeConfirmationUSER',      category: 'Other',                  sentDate: '2026-04-15', sent: 4851,  delivered: 4953,  unique_open: 4000,  unique_click: 283 },
  { sendId: 2597197, emailName: 'SubscriptionCancellation',          category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 6964,  delivered: 7528,  unique_open: 5957,  unique_click: 259 },
  { sendId: 2653479, emailName: 'WelcomeSeries1',                    category: 'Welcome',                sentDate: '2026-04-15', sent: 3226,  delivered: 3226,  unique_open: 1919,  unique_click: 129 },
  { sendId: 2653482, emailName: 'WelcomeSeries2',                    category: 'Welcome',                sentDate: '2026-04-15', sent: 2761,  delivered: 2761,  unique_open: 1459,  unique_click: 44 },
  { sendId: 2653483, emailName: 'WelcomeSeries3',                    category: 'Welcome',                sentDate: '2026-04-15', sent: 2353,  delivered: 2353,  unique_open: 1142,  unique_click: 26 },
  { sendId: 2653485, emailName: 'WelcomeSeries4',                    category: 'Welcome',                sentDate: '2026-04-15', sent: 1805,  delivered: 1805,  unique_open: 740,   unique_click: 11 },
  { sendId: 2414003, emailName: 'WelcomeSeries5',                    category: 'Welcome',                sentDate: '2026-04-15', sent: 9923,  delivered: 10151, unique_open: 5963,  unique_click: 270 },
  { sendId: 2587356, emailName: 'SubscriptionPaymentFailure',        category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 1121,  delivered: 1153,  unique_open: 946,   unique_click: 497 },
  { sendId: 2587355, emailName: 'SubscriptionPaused',                category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 65,    delivered: 67,    unique_open: 56,    unique_click: 8 },
  { sendId: 2587354, emailName: 'SubscriptionDiscounted',            category: 'Subscription Lifecycle', sentDate: '2026-04-15', sent: 836,   delivered: 853,   unique_open: 646,   unique_click: 16 },
  { sendId: 2587347, emailName: 'DialInVideoEmail',                  category: 'Other',                  sentDate: '2026-04-15', sent: 2422,  delivered: 2548,  unique_open: 2079,  unique_click: 316 },
  { sendId: 2587348, emailName: 'DialInVideoEmail_New',              category: 'Other',                  sentDate: '2026-04-15', sent: 7154,  delivered: 7655,  unique_open: 5914,  unique_click: 1139 },
  { sendId: 2587337, emailName: 'DoubleOptIn_DE',                    category: 'Other',                  sentDate: '2026-04-15', sent: 446,   delivered: 466,   unique_open: 383,   unique_click: 162 },
  { sendId: 2644120, emailName: 'OrderConfirmation_SubscriptionNew', category: 'Transactional',          sentDate: '2026-04-15', sent: 20789, delivered: 20789, unique_open: 16649, unique_click: 1502 },
  { sendId: 2663441, emailName: 'BIEDM - Beanz - US - Event Comms - Sign Up', category: 'BIEDM',          sentDate: '2026-04-15', sent: 1,     delivered: 1,     unique_open: 1,     unique_click: 0 },
  { sendId: 2587336, emailName: 'DiscountEndingNotification',        category: 'Other',                  sentDate: '2026-04-15', sent: 760,   delivered: 793,   unique_open: 704,   unique_click: 262 },
  { sendId: 2587332, emailName: 'CardUpdatedNotification(Old)',      category: 'Other',                  sentDate: '2026-04-15', sent: 807,   delivered: 818,   unique_open: 650,   unique_click: 22 },
  { sendId: 2587351, emailName: 'OOS_SecondReminder',                category: 'Other',                  sentDate: '2026-04-15', sent: 189,   delivered: 201,   unique_open: 175,   unique_click: 68 }
];

// ─── Slice 2: Top 5 links per SendID (condensed to the SendIDs in `totals`) ──
const topLinksRaw = [
  [2587328, [['https://www.beanz.com/us/en/quiz.html', 428], ['https://www.beanz.com/uk/en/quiz.html', 223], ['https://www.beanz.com/au/en/quiz.html', 145], ['https://www.beanz.com/en-us', 107], ['https://www.beanz.com/de/de/quiz.html', 67]]],
  [2587334, [['https://www.beanz.com/en-gb', 6], ['https://www.instagram.com/beanz.comuk', 3], ['https://www.facebook.com/Beanz.combySage', 3], ['https://www.beanz.com/en-au', 2], ['https://www.beanz.com/uk/en/support/contact-us.html', 2]]],
  [2587336, [['https://www.beanz.com/en-us', 4], ['https://www.beanz.com/en-gb', 2], ['https://www.beanz.com/en-us/my-account/subscriptions/40027820#subscriptions', 1], ['https://www.beanz.com/en-au/my-account/subscriptions/40132468#subscriptions', 1]]],
  [2587347, [['https://youtu.be/cOdneH85Xto (dial-in video US)', 13], ['https://www.beanz.com/en-us', 9], ['https://youtu.be/ZrCVa1faHHk (call-to-action)', 9], ['https://youtu.be/ZrCVa1faHHk (image)', 9], ['https://youtu.be/0XQeCUalBt8', 8]]],
  [2587348, [['https://youtu.be/b3K8XmlZkzQ', 23], ['https://youtu.be/18xYKfRm3EM', 20], ['https://youtu.be/KMQsmTz-M4k', 18], ['https://youtu.be/7UIL6fgRKWU', 16], ['https://youtu.be/IxNgoAnoOG8', 16]]],
  [2587354, [['https://www.beanz.com/uk/en/my-beanz/purchases.html?standing_order_id=40142407#subscriptions', 1], ['https://www.beanz.com/en-us/my-account/subscriptions/40117751#subscriptions', 1]]],
  [2587355, [['https://www.beanz.com/en-gb/my-account/subscriptions/40054716#subscriptions', 1], ['https://www.beanz.com/en-au/my-account/subscriptions/40048731#subscriptions', 1], ['https://www.beanz.com/en-us/my-account/subscriptions/40100515#subscriptions', 1]]],
  [2587356, [['https://www.beanz.com/uk/en/support/contact-us.html', 4], ['https://www.beanz.com/en-us', 3], ['https://www.beanz.com/en-us/my-account/subscriptions/40012121#subscriptions', 1]]],
  [2597197, [['https://www.beanz.com/us/en/support/contact-us.html', 9], ['https://www.facebook.com/Beanz.combyBreville', 6], ['https://www.instagram.com/beanz.comus', 6], ['https://www.beanz.com/uk/en/support/contact-us.html', 3], ['https://www.beanz.com/en-us', 3]]],
  [2597200, [['https://www.beanz.com/en-gb', 28], ['https://www.beanz.com/en-us', 20], ['https://www.beanz.com/au/en/support/contact-us.html', 10], ['https://www.beanz.com/en-au', 9], ['https://www.instagram.com/beanz.comuk', 8]]],
  [2644111, [['https://www.beanz.com/en-gb', 152], ['https://www.beanz.com/en-us', 140], ['https://www.beanz.com/en-au', 55], ['https://www.beanz.com/en-gb/my-account/coffee-savings', 50], ['https://www.beanz.com/en-au/my-account/coffee-savings', 29]]],
  [2644112, [['https://www.beanz.com/en-us', 285], ['https://www.beanz.com/en-gb', 261], ['https://www.beanz.com/en-au', 104], ['https://www.beanz.com/de-de', 76], ['https://www.beanz.com/en-gb/my-account/coffee-savings', 37]]],
  [2644113, [['https://www.beanz.com/en-us', 290], ['https://track.dpd.co.uk/', 280], ['https://www.beanz.com/en-gb', 259], ['https://www.beanz.com/en-au', 83], ['https://www.beanz.com/de-de', 81]]],
  [2644114, [['https://www.beanz.com/en-gb', 56], ['https://www.beanz.com/en-us', 52], ['https://www.beanz.com/en-us/my-account/coffee-savings', 24], ['https://www.beanz.com/uk/en/support/contact-us.html', 22], ['https://www.beanz.com/us/en/support/contact-us.html', 22]]],
  [2644120, [['https://beanz.com/uk/en.html', 72], ['https://www.beanz.com/en-gb', 64], ['https://beanz.com/us/en.html', 52], ['https://www.beanz.com/en-us', 41], ['https://beanz.com/au/en.html', 38]]],
  [2414003, [['https://www.beanz.com/us/en/coffee/roasters/olympia/big-truck...', 36], ['https://www.beanz.com/us/en.html', 14], ['https://www.beanz.com/au/en/coffee/roasters/st-ali/orthodox-house...', 11], ['https://www.beanz.com/en-gb/coffee/roasters/ozone/paramount-blend...', 10], ['https://www.beanz.com/uk/en.html', 6]]],
  [2653479, [['https://www.beanz.com/au/en/quiz.html', 32], ['https://www.beanz.com/uk/en/quiz.html', 26], ['https://www.beanz.com/us/en/quiz.html', 26], ['https://www.beanz.com/us/en.html', 22]]],
  [2653482, [['(clicks present; full URLs in warehouse)', 44]]],
  [2653483, [['(clicks present; full URLs in warehouse)', 26]]],
  [2653485, [['(clicks present; full URLs in warehouse)', 11]]]
];
const topLinksBySend = Object.fromEntries(topLinksRaw.map(([id, rows]) => [id, rows.map(([u, c]) => ({ url: u, clicks: c }))]));

// ─── Slice 3: Regional click split per SendID ───────────────
const regionalRaw = [
  [2587328, [['US', 702], ['UK', 392], ['AU', 245], ['DE', 140], ['Unknown', 81]]],
  [2587334, [['US', 52], ['UK', 44], ['AU', 14], ['DE', 5], ['Unknown', 4]]],
  [2587336, [['US', 72], ['UK', 30], ['AU', 19], ['DE', 1]]],
  [2587347, [['Unknown', 119], ['US', 10]]],
  [2587348, [['Unknown', 430], ['AU', 17], ['UK', 9], ['DE', 7]]],
  [2587354, [['US', 5], ['UK', 1]]],
  [2587355, [['AU', 1], ['US', 1], ['UK', 1]]],
  [2587356, [['AU', 71], ['UK', 71], ['US', 68], ['DE', 4], ['Unknown', 1]]],
  [2597197, [['US', 44], ['UK', 29], ['AU', 16], ['Unknown', 8], ['DE', 7]]],
  [2597200, [['US', 214], ['UK', 198], ['AU', 77], ['Unknown', 20], ['DE', 17]]],
  [2644111, [['UK', 217], ['US', 186], ['AU', 96], ['DE', 44], ['Unknown', 28]]],
  [2644112, [['US', 346], ['UK', 311], ['AU', 126], ['DE', 103], ['Unknown', 46]]],
  [2644113, [['Unknown', 11296], ['US', 352], ['UK', 331], ['AU', 105], ['DE', 95]]],
  [2644114, [['US', 2953], ['UK', 2285], ['AU', 1012], ['DE', 183], ['Unknown', 26]]],
  [2644120, [['UK', 638], ['US', 532], ['AU', 237], ['DE', 88], ['Unknown', 26]]],
  [2414003, [['US', 55], ['UK', 17], ['AU', 16], ['Unknown', 14]]],
  [2653479, [['US', 47], ['AU', 46], ['UK', 36], ['Unknown', 2]]],
  [2653482, [['US', 23], ['AU', 13], ['UK', 7], ['Unknown', 2]]],
  [2653483, [['AU', 15], ['US', 11], ['Unknown', 1]]],
  [2653485, [['US', 5], ['AU', 5], ['Unknown', 1], ['UK', 1]]]
];
const regionalBySend = Object.fromEntries(regionalRaw.map(([id, rows]) => [id, rows.map(([r, c]) => ({ region: r, unique_clicks: c }))]));

// ─── Proxy cohort derivation from email name ────────────────
function proxyCohort(emailName) {
  const n = (emailName || '').toLowerCase();
  if (n.startsWith('welcomeseries')) return 'New';
  if (n.includes('orderconfirmation') || n.includes('ordershipment') || n.includes('upcomingsubscription')) return 'Active';
  if (n.includes('subscriptioncancellation') || n.includes('paymentfailure')) return 'At-risk';
  if (n.includes('discountending')) return 'At-risk';
  if (n.includes('biedm')) return 'Mixed';
  return 'Mixed';
}

// ─── Benchmarks (re-used from previous snapshot) ────────────
const benchmarks = [
  { category: 'BIEDM',                  region: 'AU',      sent: 500,    open_rate_pct: 48.0, ctr_pct: 2.5 },
  { category: 'BIEDM',                  region: 'UK',      sent: 600,    open_rate_pct: 52.0, ctr_pct: 2.8 },
  { category: 'BIEDM',                  region: 'US',      sent: 800,    open_rate_pct: 44.0, ctr_pct: 0.8 },
  { category: 'Welcome',                region: 'Unknown', sent: 20000,  open_rate_pct: 55.0, ctr_pct: 12.5 },
  { category: 'Subscription Lifecycle', region: 'Unknown', sent: 45000,  open_rate_pct: 81.0, ctr_pct: 46.7 },
  { category: 'Transactional',          region: 'Unknown', sent: 127000, open_rate_pct: 83.5, ctr_pct: 40.2 },
  { category: 'Other',                  region: 'Unknown', sent: 40000,  open_rate_pct: 80.0, ctr_pct: 15.0 }
];

// ─── Assemble ───────────────────────────────────────────────
const emails = totals.map((t) => {
  const openRate = t.delivered > 0 ? Math.round((t.unique_open / t.delivered) * 1000) / 10 : null;
  const ctr = t.delivered > 0 ? Math.round((t.unique_click / t.delivered) * 1000) / 10 : null;
  const regionalClicks = regionalBySend[t.sendId] || [];
  const totalRegionalClicks = regionalClicks.reduce((s, r) => s + r.unique_clicks, 0) || 1;
  const regional = regionalClicks.map((r) => ({
    region: r.region,
    unique_clicks: r.unique_clicks,
    click_share_pct: Math.round((r.unique_clicks / totalRegionalClicks) * 1000) / 10
  }));
  const topLinksRows = topLinksBySend[t.sendId] || [];
  const topLinks = topLinksRows.map((l) => ({
    url: l.url,
    clicks: l.clicks,
    ctr_pct: t.delivered > 0 ? Math.round((l.clicks / t.delivered) * 1000) / 10 : null
  }));
  return {
    sendId: t.sendId,
    emailName: t.emailName,
    category: t.category,
    sentDate: t.sentDate,
    region: 'Unknown', // send-metadata region is NULL for triggered
    totals: { sent: t.sent, delivered: t.delivered, unique_open: t.unique_open, unique_click: t.unique_click, open_rate_pct: openRate, ctr_pct: ctr },
    regional,
    cohort_proxy: proxyCohort(t.emailName),
    topLinks
  };
});

const out = {
  generated_at: new Date().toISOString(),
  window_days: 30,
  source: 'databricks-mcp-enriched',
  note: 'Enriched seed: totals + top-5 links + regional click split + proxy cohort (cohort-join path blocked by ID namespace mismatch between SubscriberKey SFDC IDs and CustomerEmail SHA-256 hashes).',
  emails,
  benchmarks
};

const outputPath = path.resolve(__dirname, '..', 'kb-data', 'intelligence', 'email-perf-live.json');
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote ' + outputPath + ' with ' + emails.length + ' emails');
