const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'https://4rodas.tritecnologias.com.br';
const OUTPUT_DIR = path.join(__dirname, '..', 'manual_screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function capture(page, name, waitMs = 1200) {
  await sleep(waitMs);
  const outPath = path.join(OUTPUT_DIR, name);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`[OK] Capturado: ${name}`);
}

async function run() {
  console.log('--- INICIANDO CAPTURA DE TELAS REAIS PARA O MANUAL ---');
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.25 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // 1. Tela de Login
  console.log('1. Acessando Login...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await capture(page, '01_login.png', 1000);

  // Preencher credenciais
  await page.type('input[type="email"]', 'admin@4rodas.com');
  await page.type('input[type="password"]', 'Admin@2026');
  await page.click('button[type="submit"]');
  await sleep(2000);

  // 2. Tela de Seleção de Loja (se houver)
  const isSelectTenant = await page.evaluate(() => document.body.innerText.includes('Selecione a Loja'));
  if (isSelectTenant) {
    console.log('2. Capturando Seleção de Loja...');
    await capture(page, '02_selecao_loja.png', 800);
    // Clica na primeira loja (Veneza ou Matriz)
    const storeBtn = await page.$('button.group, button.flex');
    if (storeBtn) {
      await storeBtn.click();
      await sleep(2500);
    }
  }

  // 3. Dashboard ERP
  console.log('3. Dashboard ERP...');
  await page.goto(`${BASE_URL}/erp`, { waitUntil: 'networkidle2' });
  await capture(page, '03_dashboard_erp.png', 1500);

  // 4. Ordens de Serviço (Quadro Geral)
  console.log('4. Ordens de Serviço...');
  await page.goto(`${BASE_URL}/orders`, { waitUntil: 'networkidle2' });
  await capture(page, '04_ordens_servico.png', 1500);

  // 5. Modal de Nova Ordem de Serviço
  console.log('5. Modal Nova OS...');
  const newOrderBtn = await page.$('button.bg-blue-600');
  if (newOrderBtn) {
    await newOrderBtn.click().catch(() => {});
    await sleep(800);
    await capture(page, '05_nova_ordem_modal.png', 800);
    // Fechar modal
    const closeBtn = await page.$('button.text-slate-400');
    if (closeBtn) await closeBtn.click().catch(() => {});
    await sleep(500);
  }

  // 6. Detalhe de uma Ordem de Serviço real
  console.log('6. Detalhe da Ordem de Serviço...');
  const orderRowLink = await page.$('table tbody tr a, table tbody tr');
  if (orderRowLink) {
    const orderHref = await page.evaluate(() => {
      const a = document.querySelector('table tbody tr a');
      return a ? a.getAttribute('href') : null;
    });
    if (orderHref) {
      await page.goto(`${BASE_URL}${orderHref}`, { waitUntil: 'networkidle2' });
      await capture(page, '06_detalhe_ordem_servico.png', 1800);
    }
  }

  // 7. Orçamentos Comerciais
  console.log('7. Orçamentos...');
  await page.goto(`${BASE_URL}/quotes`, { waitUntil: 'networkidle2' });
  await capture(page, '07_orcamentos.png', 1500);

  // 8. Oficina & Produtividade
  console.log('8. Oficina & Produtividade...');
  await page.goto(`${BASE_URL}/erp/oficina`, { waitUntil: 'networkidle2' });
  await capture(page, '08_oficina_produtividade.png', 1500);

  // 9. Quadro de Mecânicos (Aba 3 da Oficina)
  console.log('9. Quadro de Mecânicos...');
  const tabMecanicos = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.innerText.includes('Gestão de Mecânicos') || b.innerText.includes('Mecânicos'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (tabMecanicos) {
    await sleep(1000);
    await capture(page, '09_quadro_mecanicos.png', 1000);
  }

  // 10. Ponto de Venda (PDV)
  console.log('10. Ponto de Venda (PDV)...');
  await page.goto(`${BASE_URL}/erp/pdv`, { waitUntil: 'networkidle2' });
  await capture(page, '10_pdv.png', 1500);

  // 11. Frente de Caixa & Fechamento
  console.log('11. Frente de Caixa...');
  await page.goto(`${BASE_URL}/erp/caixa`, { waitUntil: 'networkidle2' });
  await capture(page, '11_caixa.png', 1500);

  // 12. Histórico de Vendas
  console.log('12. Vendas...');
  await page.goto(`${BASE_URL}/erp/vendas`, { waitUntil: 'networkidle2' });
  await capture(page, '12_vendas.png', 1500);

  // 13. Catálogo de Produtos
  console.log('13. Catálogo de Produtos...');
  await page.goto(`${BASE_URL}/erp/produtos`, { waitUntil: 'networkidle2' });
  await capture(page, '13_produtos.png', 1500);

  // 14. Estoque Físico & Ajustes
  console.log('14. Estoque Físico...');
  await page.goto(`${BASE_URL}/erp/estoque`, { waitUntil: 'networkidle2' });
  await capture(page, '14_estoque_fisico.png', 1500);

  // 15. Kardex de Estoque
  console.log('15. Kardex de Estoque...');
  await page.goto(`${BASE_URL}/erp/estoque/kardex`, { waitUntil: 'networkidle2' });
  await capture(page, '15_kardex_estoque.png', 1500);

  // 16. Curva ABC
  console.log('16. Curva ABC...');
  await page.goto(`${BASE_URL}/erp/estoque/curva-abc`, { waitUntil: 'networkidle2' });
  await capture(page, '16_curva_abc.png', 1500);

  // 17. Sugestão Inteligente de Compras
  console.log('17. Sugestão de Compras...');
  await page.goto(`${BASE_URL}/erp/estoque/sugestao-compras`, { waitUntil: 'networkidle2' });
  await capture(page, '17_sugestao_compras.png', 1500);

  // 18. Valorização de Estoque
  console.log('18. Valorização de Estoque...');
  await page.goto(`${BASE_URL}/erp/estoque/valorizacao`, { waitUntil: 'networkidle2' });
  await capture(page, '18_valorizacao_estoque.png', 1500);

  // 19. Importação de Estoque
  console.log('19. Importação em Massa...');
  await page.goto(`${BASE_URL}/erp/importar`, { waitUntil: 'networkidle2' });
  await capture(page, '19_importar_estoque.png', 1200);

  // 20. Contas a Receber
  console.log('20. Contas a Receber...');
  await page.goto(`${BASE_URL}/erp/contas`, { waitUntil: 'networkidle2' });
  await capture(page, '20_contas_receber.png', 1500);

  // 21. Contas a Pagar
  console.log('21. Contas a Pagar...');
  await page.goto(`${BASE_URL}/erp/contas-pagar`, { waitUntil: 'networkidle2' });
  await capture(page, '21_contas_pagar.png', 1500);

  // 22. DRE Gerencial
  console.log('22. DRE Gerencial...');
  await page.goto(`${BASE_URL}/erp/dre`, { waitUntil: 'networkidle2' });
  await capture(page, '22_dre_gerencial.png', 1500);

  // 23. Clientes
  console.log('23. Clientes...');
  await page.goto(`${BASE_URL}/erp/clientes`, { waitUntil: 'networkidle2' });
  await capture(page, '23_clientes.png', 1500);

  // 24. Histórico do Cliente (se houver cliente na lista)
  console.log('24. Prontuário do Cliente...');
  const clientHref = await page.evaluate(() => {
    const a = document.querySelector('table tbody tr a, table tbody tr');
    // procura link para /erp/clientes/
    const allLinks = Array.from(document.querySelectorAll('a'));
    const link = allLinks.find(el => el.getAttribute('href') && el.getAttribute('href').includes('/erp/clientes/'));
    return link ? link.getAttribute('href') : null;
  });
  if (clientHref) {
    await page.goto(`${BASE_URL}${clientHref}`, { waitUntil: 'networkidle2' });
    await capture(page, '24_cliente_historico.png', 1800);
  }

  // 25. CRM de Manutenções Preventivas
  console.log('25. CRM Preventivo...');
  await page.goto(`${BASE_URL}/erp/crm`, { waitUntil: 'networkidle2' });
  await capture(page, '25_crm_preventivo.png', 1500);

  // 26. Relatório Multi-Lojas
  console.log('26. Relatório Multi-Lojas...');
  await page.goto(`${BASE_URL}/erp/relatorios/multi-lojas`, { waitUntil: 'networkidle2' });
  await capture(page, '26_relatorio_multi_lojas.png', 1500);

  // 27. Lojas / Filiais
  console.log('27. Lojas & Filiais...');
  await page.goto(`${BASE_URL}/erp/lojas`, { waitUntil: 'networkidle2' });
  await capture(page, '27_lojas.png', 1200);

  // 28. Usuários do Sistema
  console.log('28. Usuários...');
  await page.goto(`${BASE_URL}/erp/usuarios`, { waitUntil: 'networkidle2' });
  await capture(page, '28_usuarios.png', 1500);

  // 29. Gerenciador de Papéis & Permissões
  console.log('29. Permissões RBAC...');
  await page.goto(`${BASE_URL}/erp/permissoes`, { waitUntil: 'networkidle2' });
  await capture(page, '29_permissoes_rbac.png', 1500);

  // 30. Configurações do Sistema & Identidade Visual
  console.log('30. Configurações & Logo...');
  await page.goto(`${BASE_URL}/erp/configuracoes`, { waitUntil: 'networkidle2' });
  await capture(page, '30_configuracoes.png', 1500);

  // 31. Parâmetros do Sistema
  console.log('31. Parâmetros Operacionais...');
  await page.goto(`${BASE_URL}/erp/config/parametros`, { waitUntil: 'networkidle2' });
  await capture(page, '31_config_parametros.png', 1200);

  // 32. Tipos de Produtos
  console.log('32. Tipos de Produtos...');
  await page.goto(`${BASE_URL}/erp/config/tipos`, { waitUntil: 'networkidle2' });
  await capture(page, '32_config_tipos.png', 1200);

  // 33. Instalações de Veículos
  console.log('33. Posições de Instalações...');
  await page.goto(`${BASE_URL}/erp/config/instalacoes`, { waitUntil: 'networkidle2' });
  await capture(page, '33_config_instalacoes.png', 1200);

  await browser.close();
  console.log('=== TODAS AS TELAS REAIS FORAM CAPTURADAS COM SUCESSO! ===');
}

run().catch(err => {
  console.error('Erro na captura:', err);
  process.exit(1);
});
