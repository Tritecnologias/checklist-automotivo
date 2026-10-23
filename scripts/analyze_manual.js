const fs = require('fs');

const content = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');
const lines = content.split('\n');

let currentSection = 'header';
const mockups = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('manual-section') && line.includes('id=')) {
    const match = line.match(/id="([^"]+)"/);
    if (match) currentSection = match[1];
  }
  if (line.includes('<div class="screen-mockup">')) {
    mockups.push({ section: currentSection, line: i + 1 });
  }
}

console.log('Mockups found:', mockups);
