#!/usr/bin/env node
/**
 * verify-inbox-parity.js — Mechanical metric for autoresearch loop
 * Checks 8 feature gates and outputs a score 0-8.
 * Higher is better. Target: 8/8.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CHECKS = [];
let score = 0;

function check(name, pass, detail) {
  CHECKS.push({ name, pass, detail });
  if (pass) score++;
}

// Read source files
const slackApi = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'slack-api.js'), 'utf8');
const outlookApi = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'outlook-api.js'), 'utf8');
const refreshEngine = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'refresh-engine.js'), 'utf8');
const aiClassifier = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'ai-classifier.js'), 'utf8');
const commsRoute = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'comms.js'), 'utf8');

// 1. Slack: messages per channel >= 100
const slackMsgLimit = slackApi.match(/fetchSlackMessages\(token,\s*ch\.id,\s*(\d+)/);
const slackLimit = slackMsgLimit ? parseInt(slackMsgLimit[1]) : 0;
check('Slack msgs/channel ≥100', slackLimit >= 100, `Current: ${slackLimit}`);

// 2. Slack: time window >= 30 days
const slackWindow = slackApi.match(/Date\.now\(\)\s*-\s*(\d+)\s*\*\s*86400000/);
const slackDays = slackWindow ? parseInt(slackWindow[1]) : 0;
check('Slack window ≥30 days', slackDays >= 30, `Current: ${slackDays} days`);

// 3. Slack: thread reply fetches per channel >= 5
const threadFetch = slackApi.match(/MAX_THREAD_FETCHES\s*=\s*(\d+)/);
const threadFetchCount = threadFetch ? parseInt(threadFetch[1]) : 0;
check('Thread fetches/channel ≥5', threadFetchCount >= 5, `Current: ${threadFetchCount}`);

// 4. Slack: reply messages per thread >= 50
const replyLimit = slackApi.match(/fetchThreadReplies\(token,\s*ch\.id,\s*[^,]+,\s*(\d+)/);
const replyLimitVal = replyLimit ? parseInt(replyLimit[1]) : 0;
check('Replies/thread ≥50', replyLimitVal >= 50, `Current: ${replyLimitVal}`);

// 5. Email: window >= 14 days (in refresh-engine)
const emailSince = refreshEngine.match(/sinceDays:\s*(\d+)/);
const emailDays = emailSince ? parseInt(emailSince[1]) : 0;
check('Email window ≥14 days', emailDays >= 14, `Current: ${emailDays} days`);

// 6. Email: maxMessages >= 100 (in refresh-engine)
const emailMax = refreshEngine.match(/maxMessages:\s*(\d+)/);
const emailMaxVal = emailMax ? parseInt(emailMax[1]) : 0;
check('Email maxMessages ≥100', emailMaxVal >= 100, `Current: ${emailMaxVal}`);

// 7. Auto-classify on email arrival (classifyNewThreads called in refreshOutlook or immediately after)
const autoClassifyOnRefresh = refreshEngine.includes('classifyNewThreads') &&
  (refreshEngine.includes('refreshOutlook') || refreshEngine.includes('classify'));
const immediateClassify = refreshEngine.match(/setTimeout\(\(\)\s*=>\s*classifyNewThreads/);
check('Auto-classify on refresh', autoClassifyOnRefresh && immediateClassify,
  autoClassifyOnRefresh ? 'Classification runs on refresh cycle' : 'Missing');

// 8. Pre-analysis: email summary/classification stored proactively (not just on-demand)
// Check if classifyNewThreads processes ALL new threads (not just on user click)
const proactiveSummary = refreshEngine.includes('classifyNewThreads') &&
  (commsRoute.includes('aiCategory') || commsRoute.includes('classification'));
const batchSize = refreshEngine.match(/toClassify\.slice\(0,\s*(\d+)\)/);
const batchSizeVal = batchSize ? parseInt(batchSize[1]) : 0;
check('Proactive classification (batch≥30)', proactiveSummary && batchSizeVal >= 30,
  `Batch size: ${batchSizeVal}, proactive: ${proactiveSummary}`);

// Output
console.log('\n=== Inbox Parity Score ===');
CHECKS.forEach(c => {
  console.log(`${c.pass ? '✓' : '✗'} ${c.name} — ${c.detail}`);
});
console.log(`\nSCORE: ${score}/8`);
process.exit(0);
