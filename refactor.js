const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML_PATH = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'js');

const lines = fs.readFileSync(HTML_PATH, 'utf8').split('\n');
const total = lines.length;
console.log('Read index.html: ' + total + ' lines');

function extract(filename, startLine, endLine) {
  const content = lines.slice(startLine - 1, endLine).join('\n');
  const outPath = path.join(JS_DIR, filename);
  fs.writeFileSync(outPath, content, 'utf8');
  const lineCount = endLine - startLine + 1;
  console.log('  ' + filename + ': lines ' + startLine + '-' + endLine + ' (' + lineCount + ' lines)');
  return outPath;
}

function findLine(pattern, after) {
  const start = after || 0;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i + 1;
  }
  throw new Error('Pattern not found: "' + pattern + '" (after line ' + (after || 0) + ')');
}

const SEC_APP_STATE = findLine('// APP STATE');
const SEC_DAILY_SUMMARY = findLine('// DAILY SUMMARY');
const SEC_COMMS = findLine('// COMMS MODULE');
const SEC_CALENDAR = findLine('// CALENDAR');
const SEC_PROJECTS = findLine('// PROJECTS');
const SEC_PEOPLE = findLine('// PEOPLE');
const SEC_METRICS = findLine('// METRICS');
const SEC_ACTIONS = findLine('// ACTIONS');
const SEC_PANEL = findLine('// PANEL');
const SEC_SEND_MODAL = findLine('// SEND MODAL');
const SEC_PALETTE = findLine('// COMMAND PALETTE');
const SEC_KEYBOARD = findLine('// KEYBOARD SHORTCUTS');
const SEC_TOAST = findLine('// TOAST');
const SEC_LEARNING = findLine('// SELF-LEARNING');
const SEC_NEWS = findLine('// NEWS');
const SEC_STRATEGY = findLine('// STRATEGY MODULE');
const SEC_INIT = findLine('// INIT', SEC_STRATEGY - 1);

console.log('\nDetected section headers:');
console.log('  APP STATE:       line ' + SEC_APP_STATE);
console.log('  DAILY SUMMARY:   line ' + SEC_DAILY_SUMMARY);
console.log('  COMMS:           line ' + SEC_COMMS);
console.log('  CALENDAR:        line ' + SEC_CALENDAR);
console.log('  PROJECTS:        line ' + SEC_PROJECTS);
console.log('  PEOPLE:          line ' + SEC_PEOPLE);
console.log('  METRICS:         line ' + SEC_METRICS);
console.log('  ACTIONS:         line ' + SEC_ACTIONS);
console.log('  PANEL:           line ' + SEC_PANEL);
console.log('  SEND MODAL:      line ' + SEC_SEND_MODAL);
console.log('  PALETTE:         line ' + SEC_PALETTE);
console.log('  KEYBOARD:        line ' + SEC_KEYBOARD);
console.log('  TOAST:           line ' + SEC_TOAST);
console.log('  LEARNING:        line ' + SEC_LEARNING);
console.log('  NEWS:            line ' + SEC_NEWS);
console.log('  STRATEGY:        line ' + SEC_STRATEGY);
console.log('  INIT:            line ' + SEC_INIT);

console.log('\nExtracting files...');

extract('state.js', SEC_APP_STATE - 1, SEC_DAILY_SUMMARY - 2);
extract('mod-summary.js', SEC_DAILY_SUMMARY - 1, SEC_COMMS - 2);
extract('mod-comms.js', SEC_COMMS - 1, SEC_CALENDAR - 2);
extract('mod-calendar.js', SEC_CALENDAR - 1, SEC_PROJECTS - 2);
extract('mod-projects.js', SEC_PROJECTS - 1, SEC_PEOPLE - 2);
extract('mod-people.js', SEC_PEOPLE - 1, SEC_METRICS - 2);
extract('mod-metrics.js', SEC_METRICS - 1, SEC_ACTIONS - 2);
extract('actions.js', SEC_ACTIONS - 1, SEC_PANEL - 2);
extract('modal.js', SEC_PANEL - 1, SEC_PALETTE - 2);
extract('palette.js', SEC_PALETTE - 1, SEC_KEYBOARD - 2);
extract('shortcuts.js', SEC_KEYBOARD - 1, SEC_TOAST - 2);
extract('toast.js', SEC_TOAST - 1, SEC_LEARNING - 2);
extract('learning.js', SEC_LEARNING - 1, SEC_NEWS - 2);
extract('mod-news.js', SEC_NEWS - 1, SEC_STRATEGY - 2);
extract('mod-strategy.js', SEC_STRATEGY - 1, SEC_INIT - 2);

console.log('\nRewriting index.html...');

var dataScriptLine = findLine('js/data.js');
console.log('  data.js script tag at line ' + dataScriptLine);

var closeScriptLine = findLine('</script>', SEC_INIT - 1);
console.log('  </script> at line ' + closeScriptLine);

var htmlBefore = lines.slice(0, dataScriptLine - 1);
var htmlTail = lines.slice(closeScriptLine);

var scriptTags = [
  '<script src="js/data.js"></script>',
  '<script src="js/state.js"></script>',
  '<script src="js/mod-summary.js"></script>',
  '<script src="js/mod-comms.js"></script>',
  '<script src="js/mod-calendar.js"></script>',
  '<script src="js/mod-projects.js"></script>',
  '<script src="js/mod-people.js"></script>',
  '<script src="js/mod-metrics.js"></script>',
  '<script src="js/toast.js"></script>',
  '<script src="js/learning.js"></script>',
  '<script src="js/modal.js"></script>',
  '<script src="js/actions.js"></script>',
  '<script src="js/palette.js"></script>',
  '<script src="js/shortcuts.js"></script>',
  '<script src="js/mod-news.js"></script>',
  '<script src="js/mod-strategy.js"></script>',
  '<script>renderAll();</script>',
];

var newLines = [].concat(htmlBefore, scriptTags, htmlTail);
var newHtml = newLines.join('\n');

var backupPath = path.join(ROOT, 'index.html.bak');
fs.copyFileSync(HTML_PATH, backupPath);
console.log('  Backed up original to index.html.bak');

fs.writeFileSync(HTML_PATH, newHtml, 'utf8');
var newLineCount = newHtml.split('\n').length;
console.log('  New index.html: ' + newLineCount + ' lines (was ' + total + ')');

console.log('\nDone! Refactoring complete.');
