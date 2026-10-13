// scripts/export_pdf.js
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

async function exportToPdf() {
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  console.log('Iniciando navegador em:', chromePath);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, '..', 'MANUAL_DO_SISTEMA.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

  console.log('Carregando HTML:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // Emula mídia print para aplicar regras de CSS @media print
  await page.emulateMediaType('print');

  const pdfPath = path.resolve(__dirname, '..', 'MANUAL_DO_SISTEMA.pdf');
  console.log('Exportando PDF para:', pdfPath);

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      bottom: '15mm',
      left: '10mm',
      right: '10mm'
    },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size: 9px; font-family: sans-serif; color: #64748b; width: 100%; padding: 0 10mm; display: flex; justify-content: space-between;">
        <span>4Rodas ERP & Checklist Automotivo — Manual Operacional Oficial</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    `
  });

  await browser.close();
  console.log('PDF gerado com sucesso em:', pdfPath);
}

exportToPdf().catch((err) => {
  console.error('Erro ao gerar PDF:', err);
  process.exit(1);
});
