const fs = require('fs');

const content = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');
const lines = content.split('\n');

const sectionMap = {};
let curId = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(/<section[^>]+id="([^"]+)"/);
  if (match) {
    curId = match[1];
    sectionMap[curId] = { start: i, end: lines.length, lines: [] };
  }
}

const keys = Object.keys(sectionMap);
for (let k = 0; k < keys.length; k++) {
  const nextStart = k + 1 < keys.length ? sectionMap[keys[k + 1]].start : lines.length;
  sectionMap[keys[k]].end = nextStart;
  console.log(`Section: ${keys[k]} (lines ${sectionMap[keys[k]].start + 1} to ${nextStart})`);
}
