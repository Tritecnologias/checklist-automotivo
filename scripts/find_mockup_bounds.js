const fs = require('fs');

const content = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');
const lines = content.split('\n');

const mockups = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<div class="screen-mockup">')) {
    const start = i;
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      const openMatches = (lines[j].match(/<div[\s>]/g) || []).length;
      const closeMatches = (lines[j].match(/<\/div>/g) || []).length;
      depth += openMatches - closeMatches;
      if (depth <= 0) {
        end = j;
        break;
      }
    }
    mockups.push({ start: start + 1, end: end + 1 });
  }
}

console.log(mockups);
