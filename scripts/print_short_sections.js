const fs = require('fs');
const content = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');

function showSection(id) {
  const start = content.indexOf(`id="${id}"`);
  if (start === -1) return;
  const nextSec = content.indexOf('<section class="manual-section"', start + 10);
  const end = nextSec !== -1 ? nextSec : content.indexOf('</main>', start);
  console.log(`\n\n------------------- SECTION: ${id} -------------------`);
  console.log(content.substring(start - 20, end));
}

['sec-valorizacao', 'sec-importar', 'sec-clientes', 'sec-multi-lojas', 'sec-parametros'].forEach(showSection);
