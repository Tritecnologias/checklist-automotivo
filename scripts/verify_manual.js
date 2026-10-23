const fs = require('fs');
const html = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');

const realMatches = html.match(/class="real-screen-wrapper"/g) || [];
const mockMatches = html.match(/class="screen-mockup"/g) || [];
const imgMatches = html.match(/src="manual_screenshots\/[^"]+"/g) || [];

console.log('Real screens wrappers found:', realMatches.length);
console.log('Old mockups found:', mockMatches.length);
console.log('Unique screenshot images linked:', new Set(imgMatches).size);
console.log('Total screenshot images linked:', imgMatches.length);

// Check if all files actually exist on disk
let missing = 0;
imgMatches.forEach(m => {
  const filePath = m.replace('src="', '').replace('"', '');
  if (!fs.existsSync(filePath)) {
    console.error('MISSING FILE:', filePath);
    missing++;
  }
});
if (missing === 0) {
  console.log('All linked screenshot files exist on disk!');
}
