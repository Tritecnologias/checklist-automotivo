const fs = require('fs');

const content = fs.readFileSync('MANUAL_DO_SISTEMA.html', 'utf8');
const lines = content.split('\n');

const sections = [
  'sec-arquitetura',
  'sec-dashboard-os',
  'sec-ordens-servico',
  'sec-orcamentos',
  'sec-oficina-produtividade',
  'sec-caixa',
  'sec-pdv',
  'sec-vendas',
  'sec-catalogo',
  'sec-estoque-fisico',
  'sec-kardex',
  'sec-curva-abc',
  'sec-sugestao-compras',
  'sec-valorizacao',
  'sec-importar',
  'sec-contas-receber',
  'sec-contas-pagar',
  'sec-dre',
  'sec-clientes',
  'sec-crm-preventivo',
  'sec-multi-lojas',
  'sec-usuarios-rbac',
  'sec-parametros',
  'sec-app-mobile'
];

sections.forEach(secId => {
  let inSec = false;
  let secLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`id="${secId}"`)) {
      inSec = true;
    } else if (inSec && lines[i].includes('<section class="manual-section"')) {
      break;
    }
    if (inSec) {
      secLines.push(lines[i]);
    }
  }
  console.log(`=== ${secId} (${secLines.length} lines) ===`);
  const headings = secLines.filter(l => l.includes('<h2') || l.includes('<h3') || l.includes('<h4') || l.includes('callout callout-'));
  headings.forEach(h => console.log('  ' + h.trim()));
});
