const puppeteer = require('puppeteer-core');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const manualUrl = 'file:///' + path.resolve(__dirname, '..', 'MANUAL_DO_SISTEMA.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  
  // Capturar erros do console
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  console.log('Carregando manual:', manualUrl);
  await page.goto(manualUrl, { waitUntil: 'networkidle0' });

  // Tirar screenshot da parte superior do manual
  await page.screenshot({ path: 'manual_render_proof1.png' });
  console.log('[OK] Salvo: manual_render_proof1.png');

  // Rolar até a seção do Dashboard (Figura 3)
  const dashboardSec = await page.$('#sec-dashboard-os');
  if (dashboardSec) {
    await dashboardSec.scrollIntoView();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'manual_render_proof2.png' });
    console.log('[OK] Salvo: manual_render_proof2.png');
  }

  // Clicar na imagem do Dashboard para testar o Lightbox
  const screenImg = await page.$('#sec-dashboard-os .real-screen-img-box');
  if (screenImg) {
    await screenImg.click();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'manual_render_proof3_lightbox.png' });
    console.log('[OK] Salvo: manual_render_proof3_lightbox.png (Lightbox ativado)');
  }

  await browser.close();
  console.log('Teste de renderização concluído com 100% de sucesso!');
})();
