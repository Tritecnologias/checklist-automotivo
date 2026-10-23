const fs = require('fs');
const path = require('path');

const manualPath = path.join(__dirname, '..', 'MANUAL_DO_SISTEMA.html');
let html = fs.readFileSync(manualPath, 'utf8');

console.log('Original length:', html.length);

// 1. Inserir estilos CSS para telas reais e lightbox
const realScreenCss = `
    /* ========================================================
       ESTILOS DE TELAS REAIS DO SISTEMA & LIGHTBOX INTERATIVO
       ======================================================== */
    .real-screen-wrapper {
      margin: 26px 0 32px 0;
      position: relative;
    }

    .real-screen-frame {
      background: #0b0f19;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 14px 34px -8px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .real-screen-frame:hover {
      border-color: #3b82f6;
      box-shadow: 0 20px 42px -10px rgba(59, 130, 246, 0.3), 0 0 0 1px rgba(59, 130, 246, 0.4);
      transform: translateY(-2px);
    }

    .real-screen-topbar {
      background: #141c2e;
      border-bottom: 1px solid #222e48;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    [data-theme="light"] .real-screen-frame {
      background: #ffffff;
      border-color: #cbd5e1;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
    }

    [data-theme="light"] .real-screen-topbar {
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
    }

    .topbar-traffic-lights {
      display: flex;
      gap: 7px;
      align-items: center;
      flex-shrink: 0;
    }

    .light-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      display: inline-block;
    }
    .light-dot.red    { background: #ef4444; }
    .light-dot.yellow { background: #f59e0b; }
    .light-dot.green  { background: #10b981; }

    .topbar-url-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      color: #94a3b8;
      background: #090d16;
      border: 1px solid #243048;
      padding: 4px 14px;
      border-radius: 8px;
      flex: 1;
      max-width: 540px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    [data-theme="light"] .topbar-url-bar {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #475569;
    }

    .url-lock-icon {
      width: 12px;
      height: 12px;
      fill: #10b981;
      flex-shrink: 0;
    }

    .topbar-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .topbar-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .badge-live {
      background: rgba(16, 185, 129, 0.16);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }

    .badge-zoom-hint {
      background: rgba(59, 130, 246, 0.16);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.35);
      cursor: pointer;
    }

    .real-screen-img-box {
      position: relative;
      cursor: zoom-in;
      background: #090d16;
      overflow: hidden;
    }

    .real-screen-img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform 0.3s ease;
    }

    .real-screen-img-box:hover .real-screen-img {
      transform: scale(1.008);
    }

    .real-screen-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
      opacity: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }

    .real-screen-img-box:hover .real-screen-overlay {
      opacity: 1;
    }

    .overlay-pill {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #3b82f6;
      color: #ffffff;
      padding: 10px 22px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      transform: translateY(6px);
      transition: transform 0.2s ease;
    }

    .real-screen-img-box:hover .overlay-pill {
      transform: translateY(0);
    }

    .real-screen-caption {
      margin-top: 10px;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
      padding: 0 4px;
    }

    .real-screen-caption strong {
      color: var(--primary);
    }

    /* LIGHTBOX INTERATIVO PARA AS TELAS */
    .lightbox-modal {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(5, 8, 15, 0.93);
      backdrop-filter: blur(14px);
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      opacity: 0;
      transition: opacity 0.25s ease;
    }

    .lightbox-modal.active {
      display: flex;
      opacity: 1;
    }

    .lightbox-header {
      width: 100%;
      max-width: 1400px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #ffffff;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .lightbox-title-box {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .lightbox-title {
      font-size: 17px;
      font-weight: 700;
      color: #ffffff;
    }

    .lightbox-subtitle {
      font-size: 12px;
      color: #94a3b8;
    }

    .lightbox-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .lightbox-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .lightbox-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: #3b82f6;
    }

    .lightbox-btn-close {
      background: #ef4444 !important;
      border-color: #dc2626 !important;
    }

    .lightbox-btn-close:hover {
      background: #dc2626 !important;
    }

    .lightbox-body {
      flex: 1;
      width: 100%;
      max-width: 1400px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      margin: 14px 0;
    }

    .lightbox-img {
      max-width: 95%;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 10px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.15);
      transition: transform 0.2s ease;
    }

    .lightbox-nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 20px;
      font-weight: 700;
      transition: all 0.2s ease;
      z-index: 10;
    }

    .lightbox-nav-btn:hover {
      background: #2563eb;
      border-color: #3b82f6;
      transform: translateY(-50%) scale(1.1);
    }

    .lightbox-nav-prev { left: 16px; }
    .lightbox-nav-next { right: 16px; }

    .lightbox-footer {
      width: 100%;
      max-width: 1400px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 12px 20px;
      color: #cbd5e1;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    @media print {
      .real-screen-wrapper {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin: 16px 0 !important;
      }
      .real-screen-frame {
        background: #ffffff !important;
        border: 1px solid #94a3b8 !important;
        box-shadow: none !important;
      }
      .real-screen-topbar {
        background: #f1f5f9 !important;
        border-bottom: 1px solid #cbd5e1 !important;
      }
      .topbar-url-bar {
        background: #ffffff !important;
        border-color: #cbd5e1 !important;
        color: #0f172a !important;
      }
      .topbar-badges, .real-screen-overlay, .lightbox-modal {
        display: none !important;
      }
      .real-screen-img {
        max-height: 480px !important;
        object-fit: contain !important;
      }
      .real-screen-caption {
        color: #334155 !important;
        font-size: 10pt !important;
      }
    }
`;

if (!html.includes('/* ESTILOS DE TELAS REAIS DO SISTEMA & LIGHTBOX INTERATIVO */')) {
  html = html.replace('/* MOCKUP VISUAL DE TELAS */', realScreenCss + '\n    /* MOCKUP VISUAL DE TELAS */');
}

function buildScreenHtml(imgFile, url, title, caption, figNum) {
  const safeCaption = caption.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return `
        <!-- TELA REAL FIGURA ${figNum} -->
        <figure class="real-screen-wrapper" data-screen-src="manual_screenshots/${imgFile}">
          <div class="real-screen-frame">
            <div class="real-screen-topbar">
              <div class="topbar-traffic-lights">
                <span class="light-dot red"></span>
                <span class="light-dot yellow"></span>
                <span class="light-dot green"></span>
              </div>
              <div class="topbar-url-bar" title="${url}">
                <svg class="url-lock-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                <span>${url}</span>
              </div>
              <div class="topbar-badges">
                <span class="topbar-badge badge-live">● Tela Real do Sistema</span>
                <span class="topbar-badge badge-zoom-hint" onclick="openScreenLightbox('manual_screenshots/${imgFile}', '${title}', '${safeCaption}')">🔍 Ampliar</span>
              </div>
            </div>
            <div class="real-screen-img-box" onclick="openScreenLightbox('manual_screenshots/${imgFile}', '${title}', '${safeCaption}')">
              <img src="manual_screenshots/${imgFile}" alt="${title}" loading="lazy" class="real-screen-img" />
              <div class="real-screen-overlay">
                <div class="overlay-pill">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
                  Clique para Ver em Alta Resolução (Tela Cheia)
                </div>
              </div>
            </div>
          </div>
          <figcaption class="real-screen-caption">
            <strong>Figura ${figNum}:</strong> ${caption}
          </figcaption>
        </figure>
`;
}

// 2. REPOSITÓRIO DE METADADOS DAS 32 TELAS REAIS
const screens = [
  // Arquitetura & Acesso (Fig 1 & 2)
  {
    target: 'sec-arquitetura',
    action: 'insert-before-end-card',
    screens: [
      {
        fig: 1,
        file: '01_login.png',
        url: 'https://4rodas.tritecnologias.com.br/login',
        title: 'Tela de Autenticação e Login',
        caption: 'Acesso oficial e seguro à plataforma ERP através de e-mail corporativo e senha criptografada, com suporte a recuperação de credenciais e identificação de perfil operacional.'
      },
      {
        fig: 2,
        file: '02_selecao_loja.png',
        url: 'https://4rodas.tritecnologias.com.br/select-store',
        title: 'Seleção de Loja Operacional',
        caption: 'Seletor de unidades ativas para colaboradores e gestores com acesso multi-lojas, garantindo isolamento de caixas e dados operacionais por filial.'
      }
    ]
  },
  // 01. Dashboard Operacional (Fig 3)
  {
    target: 'sec-dashboard-os',
    action: 'replace-mockup',
    screens: [
      {
        fig: 3,
        file: '03_dashboard_erp.png',
        url: 'https://4rodas.tritecnologias.com.br/dashboard',
        title: 'Dashboard ERP em Tempo Real',
        caption: 'Visão executiva e operacional do pátio: indicadores de orçamentos pendentes, ordens de serviço em aberto, serviços em execução no box, faturamento do dia e comparativos de evolução.'
      }
    ]
  },
  // 02. Ordens de Serviço & Checklist (Fig 4, 5, 6)
  {
    target: 'sec-ordens-servico',
    action: 'replace-mockup',
    screens: [
      {
        fig: 4,
        file: '04_ordens_servico.png',
        url: 'https://4rodas.tritecnologias.com.br/orders',
        title: 'Gestão de Ordens de Serviço',
        caption: 'Grade principal de Ordens de Serviço com pesquisa rápida por placa Mercosul, cliente, status operacional (Aberta, Em Execução, Aguardando Peças, Concluída) e filtros por período.'
      },
      {
        fig: 5,
        file: '05_nova_ordem_modal.png',
        url: 'https://4rodas.tritecnologias.com.br/orders/new',
        title: 'Modal de Abertura de Nova OS & Checklist',
        caption: 'Formulário de entrada com seleção de cliente, identificação do veículo, marcação de nível de combustível, hodômetro (KM) e checklist inicial de inspeção visual.'
      },
      {
        fig: 6,
        file: '06_detalhe_ordem_servico.png',
        url: 'https://4rodas.tritecnologias.com.br/orders/:id',
        title: 'Prontuário Completo da OS',
        caption: 'Painel completo da OS com apontamento de serviços, baixa automática de peças requisitadas do estoque, atribuição de mecânicos e faturamento final.'
      }
    ]
  },
  // 03. Central de Orçamentos (Fig 7)
  {
    target: 'sec-orcamentos',
    action: 'insert-in-card',
    screens: [
      {
        fig: 7,
        file: '07_orcamentos.png',
        url: 'https://4rodas.tritecnologias.com.br/quotes',
        title: 'Central de Orçamentos & Propostas Comerciais',
        caption: 'Controle de cotações comerciais pendentes, aprovadas e recusadas com envio de proposta formalizada por WhatsApp em formato PDF direto ao cliente.'
      }
    ]
  },
  // 04. Oficina & Mecânicos (Fig 8, 9)
  {
    target: 'sec-oficina-produtividade',
    action: 'replace-mockup',
    screens: [
      {
        fig: 8,
        file: '08_oficina_produtividade.png',
        url: 'https://4rodas.tritecnologias.com.br/workshop',
        title: 'Painel de Oficina & Produtividade',
        caption: 'Monitoramento em tempo real dos boxes ocupados na oficina mecânica, tempo decorrido por veículo e eficiência de horas apontadas pela equipe técnica.'
      },
      {
        fig: 9,
        file: '09_quadro_mecanicos.png',
        url: 'https://4rodas.tritecnologias.com.br/workshop/mechanics',
        title: 'Quadro de Mecânicos & Comissões',
        caption: 'Gestão cadastral da equipe técnica, controle de ativação/desativação de mecânicos, percentuais de rateio e relatório de comissões por serviço executado.'
      }
    ]
  },
  // 05. Frente de Caixa (Fig 10)
  {
    target: 'sec-caixa',
    action: 'replace-mockup',
    screens: [
      {
        fig: 10,
        file: '11_caixa.png',
        url: 'https://4rodas.tritecnologias.com.br/cashier',
        title: 'Frente de Caixa Operacional & Fechamento Cego',
        caption: 'Painel financeiro da frente de caixa: registro de abertura com fundo de troco (suprimento), sangrias parciais para cofre e conferência de fechamento cego por turno.'
      }
    ]
  },
  // 06. Ponto de Venda PDV (Fig 11)
  {
    target: 'sec-pdv',
    action: 'insert-in-card',
    screens: [
      {
        fig: 11,
        file: '10_pdv.png',
        url: 'https://4rodas.tritecnologias.com.br/pos',
        title: 'Terminal Ponto de Venda (PDV Balcão)',
        caption: 'Interface otimizada para vendas ágeis com leitor de código de barras, busca rápida de peças e baterias, concessão de descontos e recebimento em dinheiro, cartão ou PIX.'
      }
    ]
  },
  // 07. Histórico de Vendas (Fig 12)
  {
    target: 'sec-vendas',
    action: 'insert-in-card',
    screens: [
      {
        fig: 12,
        file: '12_vendas.png',
        url: 'https://4rodas.tritecnologias.com.br/sales',
        title: 'Histórico Geral de Vendas & Comprovantes',
        caption: 'Relatório cronológico de todas as vendas realizadas no PDV com detalhamento de itens, cliente, vendedor, canal de pagamento e reemissão de cupom térmico.'
      }
    ]
  },
  // 08. Catálogo de Produtos (Fig 13)
  {
    target: 'sec-catalogo',
    action: 'insert-in-card',
    screens: [
      {
        fig: 13,
        file: '13_produtos.png',
        url: 'https://4rodas.tritecnologias.com.br/products',
        title: 'Catálogo de Peças, Produtos e Serviços',
        caption: 'Ficha técnica de produtos com código SKU interno, código EAN de barras, preços de custo e venda, cálculo de margem markup e controle de estoque mínimo.'
      }
    ]
  },
  // 09. Estoque Físico & Ajustes (Fig 14)
  {
    target: 'sec-estoque-fisico',
    action: 'insert-in-card',
    screens: [
      {
        fig: 14,
        file: '14_estoque_fisico.png',
        url: 'https://4rodas.tritecnologias.com.br/stock',
        title: 'Gestão de Estoque Físico & Ajustes Rápidos',
        caption: 'Painel de balanço de inventário físico: conferência de saldo nas prateleiras, registro de perdas/avarias e lançamento de correções manuais com justificativa.'
      }
    ]
  },
  // 10. Ficha Kardex (Fig 15)
  {
    target: 'sec-kardex',
    action: 'replace-mockup',
    screens: [
      {
        fig: 15,
        file: '15_kardex_estoque.png',
        url: 'https://4rodas.tritecnologias.com.br/stock/kardex',
        title: 'Ficha Kardex — Rastreabilidade Total',
        caption: 'Extrato analítico de auditoria cronológica: registro detalhado de cada entrada (compras e ajustes) e saída (vendas e OS), calculando o saldo e Custo Médio Ponderado (CMP).'
      }
    ]
  },
  // 11. Curva ABC (Fig 16)
  {
    target: 'sec-curva-abc',
    action: 'replace-mockup',
    screens: [
      {
        fig: 16,
        file: '16_curva_abc.png',
        url: 'https://4rodas.tritecnologias.com.br/stock/abc',
        title: 'Curva ABC de Estoque (Pareto 80/20)',
        caption: 'Classificação estratégica de itens por faturamento e margem: Classe A (produtos essenciais de alto giro), Classe B (intermediários) e Classe C (baixo giro).'
      }
    ]
  },
  // 12. Sugestão Inteligente de Compras (Fig 17)
  {
    target: 'sec-sugestao-compras',
    action: 'insert-in-card',
    screens: [
      {
        fig: 17,
        file: '17_sugestao_compras.png',
        url: 'https://4rodas.tritecnologias.com.br/stock/purchase-suggestions',
        title: 'Sugestão Inteligente de Compras & Reposição',
        caption: 'Algoritmo preditivo de Ponto de Pedido (ROP): sugere quantidades ideais de compra cruzando consumo médio diário, lead time do fornecedor e estoque de segurança.'
      }
    ]
  },
  // 13. Valorização de Estoque (Fig 18)
  {
    target: 'sec-valorizacao',
    action: 'insert-in-card',
    screens: [
      {
        fig: 18,
        file: '18_valorizacao_estoque.png',
        url: 'https://4rodas.tritecnologias.com.br/stock/valuation',
        title: 'Valorização Financeira do Estoque',
        caption: 'Totalização patrimonial do inventário: valor total imobilizado a preço de custo, potencial de receita a preço de venda e margem bruta teórica da empresa.'
      }
    ]
  },
  // 14. Importação em Massa (Fig 19)
  {
    target: 'sec-importar',
    action: 'insert-in-card',
    screens: [
      {
        fig: 19,
        file: '19_importar_estoque.png',
        url: 'https://4rodas.tritecnologias.com.br/stock/import',
        title: 'Importação de Catálogo em Massa & NFe',
        caption: 'Carga em lote de catálogo por planilhas CSV/Excel ou leitura de arquivos XML de Notas Fiscais Eletrônicas de compra com atualização de saldo em segundos.'
      }
    ]
  },
  // 15. Contas a Receber (Fig 20)
  {
    target: 'sec-contas-receber',
    action: 'insert-in-card',
    screens: [
      {
        fig: 20,
        file: '20_contas_receber.png',
        url: 'https://4rodas.tritecnologias.com.br/finance/receivables',
        title: 'Contas a Receber — Gestão de Recebíveis',
        caption: 'Controle de títulos a receber, parcelas de cartão de crédito, faturamentos a prazo, identificação de inadimplência e baixa líquida no caixa.'
      }
    ]
  },
  // 16. Contas a Pagar (Fig 21)
  {
    target: 'sec-contas-pagar',
    action: 'insert-in-card',
    screens: [
      {
        fig: 21,
        file: '21_contas_pagar.png',
        url: 'https://4rodas.tritecnologias.com.br/finance/payables',
        title: 'Contas a Pagar — Gestão de Fornecedores',
        caption: 'Programação de pagamentos a distribuidores de autopeças, controle de boletos a vencer, despesas recorrentes e quitação financeira.'
      }
    ]
  },
  // 17. DRE Gerencial (Fig 22)
  {
    target: 'sec-dre',
    action: 'replace-mockup',
    screens: [
      {
        fig: 22,
        file: '22_dre_gerencial.png',
        url: 'https://4rodas.tritecnologias.com.br/finance/dre',
        title: 'DRE Gerencial — Demonstrativo de Resultados',
        caption: 'Demonstrativo de Resultados do Exercício: apuração contábil e gerencial de Receita Bruta, Custo das Mercadorias (CMV), Mão de Obra, Despesas Operacionais e Lucro Líquido Real.'
      }
    ]
  },
  // 18. Clientes & Histórico 360° (Fig 23)
  {
    target: 'sec-clientes',
    action: 'insert-in-card',
    screens: [
      {
        fig: 23,
        file: '23_clientes.png',
        url: 'https://4rodas.tritecnologias.com.br/customers',
        title: 'Cadastro de Clientes & Frota de Veículos',
        caption: 'Prontuário completo do cliente: veículos cadastrados, histórico de Ordens de Serviço executadas, compras realizadas no PDV e contatos de WhatsApp.'
      }
    ]
  },
  // 19. CRM Preventivo (Fig 24)
  {
    target: 'sec-crm-preventivo',
    action: 'replace-mockup',
    screens: [
      {
        fig: 24,
        file: '25_crm_preventivo.png',
        url: 'https://4rodas.tritecnologias.com.br/crm',
        title: 'CRM de Retorno & Manutenções Preventivas',
        caption: 'Disparo de lembretes preventivos de revisão periódica: filtro automático de clientes com troca de óleo, pastilhas, suspensão e pneus vencendo por prazo ou quilometragem.'
      }
    ]
  },
  // 20. Multi-Lojas (Fig 25, 26)
  {
    target: 'sec-multi-lojas',
    action: 'insert-in-card',
    screens: [
      {
        fig: 25,
        file: '26_relatorio_multi_lojas.png',
        url: 'https://4rodas.tritecnologias.com.br/multi-store',
        title: 'Relatório Consolidado Multi-Lojas',
        caption: 'Visão executiva comparativa de todas as lojas da rede: faturamento total, tíquete médio, quantidade de OS finalizadas e margem de lucratividade por filial.'
      },
      {
        fig: 26,
        file: '27_lojas.png',
        url: 'https://4rodas.tritecnologias.com.br/settings/stores',
        title: 'Cadastro e Configuração de Lojas',
        caption: 'Gerenciamento de unidades físicas da rede com definição de CNPJ, endereço, telefone de contato e vinculação de operadores autorizados.'
      }
    ]
  },
  // 21. Usuários & Permissões RBAC (Fig 27, 28)
  {
    target: 'sec-usuarios-rbac',
    action: 'insert-in-card',
    screens: [
      {
        fig: 27,
        file: '28_usuarios.png',
        url: 'https://4rodas.tritecnologias.com.br/users',
        title: 'Gestão de Usuários e Colaboradores',
        caption: 'Listagem e administração de colaboradores ativos com indicação de e-mail de acesso, lojas permitidas e papel atribuído no sistema.'
      },
      {
        fig: 28,
        file: '29_permissoes_rbac.png',
        url: 'https://4rodas.tritecnologias.com.br/users/rbac',
        title: 'Matriz de Permissões RBAC (Role-Based Access Control)',
        caption: 'Configuração minuciosa de direitos de acesso por perfil: Administrador, Gerente, Operador de Caixa, Consultor de Pátio e Mecânico da Oficina.'
      }
    ]
  },
  // 22. Parâmetros & Configurações (Fig 29, 30, 31, 32)
  {
    target: 'sec-parametros',
    action: 'insert-in-card',
    screens: [
      {
        fig: 29,
        file: '30_configuracoes.png',
        url: 'https://4rodas.tritecnologias.com.br/settings',
        title: 'Configurações Gerais & Logotipo',
        caption: 'Configurações institucionais da empresa: logotipo em alta resolução para impressos, dados fiscais, cabeçalho de comprovantes e termos de garantia.'
      },
      {
        fig: 30,
        file: '31_config_parametros.png',
        url: 'https://4rodas.tritecnologias.com.br/settings/parameters',
        title: 'Parâmetros Operacionais da Oficina',
        caption: 'Regras de negócio da unidade: limites de desconto concedido no PDV, prazos de validade de orçamentos e intervalos padrão para alertas de manutenção.'
      },
      {
        fig: 31,
        file: '32_config_tipos.png',
        url: 'https://4rodas.tritecnologias.com.br/settings/product-types',
        title: 'Tipos e Categorias de Produtos',
        caption: 'Estrutura de grupos de estoque para classificação de baterias, filtros, óleos lubrificantes, amortecedores, peças de motor e serviços de mão de obra.'
      },
      {
        fig: 32,
        file: '33_config_instalacoes.png',
        url: 'https://4rodas.tritecnologias.com.br/settings/installations',
        title: 'Posições de Instalação e Eixos',
        caption: 'Mapeamento das posições físicas no veículo (Dianteiro Direito, Dianteiro Esquerdo, Traseiro Direito, Traseiro Esquerdo, Estepe) para rastreabilidade de peças montadas no checklist.'
      }
    ]
  }
];

// 3. EXECUTAR SUBSTIUIÇÃO E INSERÇÃO DE TELAS
screens.forEach(item => {
  const secStartStr = `id="${item.target}"`;
  const secStartIdx = html.indexOf(secStartStr);
  if (secStartIdx === -1) {
    console.warn(`Seção ${item.target} não encontrada!`);
    return;
  }

  // Achar o fim da seção
  const nextSecIdx = html.indexOf('<section class="manual-section"', secStartIdx + 10);
  const secEndIdx = nextSecIdx !== -1 ? nextSecIdx : html.indexOf('</main>', secStartIdx);
  let sectionContent = html.substring(secStartIdx, secEndIdx);

  const screensHtml = item.screens.map(s => buildScreenHtml(s.file, s.url, s.title, s.caption, s.fig)).join('\n');

  if (item.action === 'replace-mockup') {
    // Substituir o bloco .screen-mockup pelo bloco com as telas reais
    const mockupStart = sectionContent.indexOf('<div class="screen-mockup">');
    if (mockupStart !== -1) {
      let depth = 0;
      let mockupEnd = -1;
      const sub = sectionContent.substring(mockupStart);
      const lines = sub.split('\n');
      let charCount = 0;
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l];
        const openMatches = (line.match(/<div[\s>]/g) || []).length;
        const closeMatches = (line.match(/<\/div>/g) || []).length;
        depth += openMatches - closeMatches;
        charCount += line.length + 1;
        if (depth <= 0) {
          mockupEnd = mockupStart + charCount;
          break;
        }
      }
      if (mockupEnd !== -1) {
        sectionContent = sectionContent.substring(0, mockupStart) + screensHtml + sectionContent.substring(mockupEnd);
      } else {
        sectionContent += screensHtml;
      }
    } else {
      sectionContent += screensHtml;
    }
  } else if (item.action === 'insert-in-card') {
    // Inserir antes de fechar o .card-topic
    const cardEnd = sectionContent.lastIndexOf('</div>\n    </section>');
    if (cardEnd !== -1) {
      sectionContent = sectionContent.substring(0, cardEnd) + '\n' + screensHtml + '\n      ' + sectionContent.substring(cardEnd);
    } else {
      const altCardEnd = sectionContent.lastIndexOf('</div>');
      if (altCardEnd !== -1) {
        sectionContent = sectionContent.substring(0, altCardEnd) + '\n' + screensHtml + '\n' + sectionContent.substring(altCardEnd);
      } else {
        sectionContent += screensHtml;
      }
    }
  } else if (item.action === 'insert-before-end-card') {
    const cardEnd = sectionContent.lastIndexOf('</div>\n    </section>');
    if (cardEnd !== -1) {
      sectionContent = sectionContent.substring(0, cardEnd) + '\n' + screensHtml + '\n      ' + sectionContent.substring(cardEnd);
    } else {
      sectionContent += screensHtml;
    }
  }

  // Re-aplicar no HTML
  html = html.substring(0, secStartIdx) + sectionContent + html.substring(secEndIdx);
});

// 4. INJETAR O LIGHTBOX MODAL E O JAVASCRIPT CORRESPONDENTE
const allScreensData = [];
screens.forEach(item => {
  item.screens.forEach(s => {
    allScreensData.push({
      fig: s.fig,
      file: `manual_screenshots/${s.file}`,
      url: s.url,
      title: s.title,
      caption: s.caption
    });
  });
});

const lightboxHtml = `
  <!-- MODAL LIGHTBOX FULLSCREEN PARA TELAS REAIS -->
  <div id="screenLightbox" class="lightbox-modal" role="dialog" aria-modal="true" aria-label="Visualizador de Telas Reais" onclick="handleLightboxBackdropClick(event)">
    <div class="lightbox-header">
      <div class="lightbox-title-box">
        <div class="lightbox-title" id="lightboxTitle">Tela Real do Sistema</div>
        <div class="lightbox-subtitle" id="lightboxSubtitle">Figura 1 • URL: https://4rodas.tritecnologias.com.br</div>
      </div>
      <div class="lightbox-actions">
        <span id="lightboxCounter" style="font-size: 13px; color: #94a3b8; margin-right: 8px;">1 de 32</span>
        <button class="lightbox-btn" onclick="zoomInLightbox()">➕ Zoom</button>
        <button class="lightbox-btn" onclick="zoomOutLightbox()">➖ Reduzir</button>
        <button class="lightbox-btn" onclick="resetZoomLightbox()">↺ 100%</button>
        <button class="lightbox-btn lightbox-btn-close" onclick="closeScreenLightbox()">✕ Fechar (Esc)</button>
      </div>
    </div>

    <div class="lightbox-body">
      <button class="lightbox-nav-btn lightbox-nav-prev" onclick="prevLightboxScreen()" title="Tela Anterior (Seta Esquerda)">‹</button>
      <img id="lightboxImg" class="lightbox-img" src="" alt="Tela Real do Sistema" />
      <button class="lightbox-nav-btn lightbox-nav-next" onclick="nextLightboxScreen()" title="Próxima Tela (Seta Direita)">›</button>
    </div>

    <div class="lightbox-footer">
      <div id="lightboxCaption" style="flex: 1; padding-right: 20px;">Legenda da tela capturada.</div>
      <div style="font-size: 11px; color: #64748b; white-space: nowrap;">
        Dica: use as setas <strong>←</strong> e <strong>→</strong> do teclado para navegar | <strong>Esc</strong> para sair
      </div>
    </div>
  </div>
`;

const lightboxJs = `
    // DADOS DAS 32 TELAS REAIS PARA O LIGHTBOX
    const systemScreens = ${JSON.stringify(allScreensData, null, 2)};
    let currentLightboxIdx = 0;
    let currentZoomLevel = 1;

    function openScreenLightbox(src, title, caption) {
      const idx = systemScreens.findIndex(s => s.file === src);
      currentLightboxIdx = idx !== -1 ? idx : 0;
      updateLightboxContent();
      const modal = document.getElementById('screenLightbox');
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function updateLightboxContent() {
      const item = systemScreens[currentLightboxIdx];
      if (!item) return;

      currentZoomLevel = 1;
      const img = document.getElementById('lightboxImg');
      img.style.transform = 'scale(1)';
      img.src = item.file;
      img.alt = item.title;

      document.getElementById('lightboxTitle').textContent = item.title;
      document.getElementById('lightboxSubtitle').textContent = 'Figura ' + item.fig + ' • Rota Oficial: ' + item.url;
      document.getElementById('lightboxCounter').textContent = (currentLightboxIdx + 1) + ' de ' + systemScreens.length;
      document.getElementById('lightboxCaption').innerHTML = '<strong>Figura ' + item.fig + ':</strong> ' + item.caption;
    }

    function closeScreenLightbox() {
      const modal = document.getElementById('screenLightbox');
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    function handleLightboxBackdropClick(event) {
      if (event.target.id === 'screenLightbox' || event.target.classList.contains('lightbox-body')) {
        closeScreenLightbox();
      }
    }

    function nextLightboxScreen() {
      currentLightboxIdx = (currentLightboxIdx + 1) % systemScreens.length;
      updateLightboxContent();
    }

    function prevLightboxScreen() {
      currentLightboxIdx = (currentLightboxIdx - 1 + systemScreens.length) % systemScreens.length;
      updateLightboxContent();
    }

    function zoomInLightbox() {
      if (currentZoomLevel < 2.5) {
        currentZoomLevel += 0.25;
        document.getElementById('lightboxImg').style.transform = 'scale(' + currentZoomLevel + ')';
      }
    }

    function zoomOutLightbox() {
      if (currentZoomLevel > 0.6) {
        currentZoomLevel -= 0.25;
        document.getElementById('lightboxImg').style.transform = 'scale(' + currentZoomLevel + ')';
      }
    }

    function resetZoomLightbox() {
      currentZoomLevel = 1;
      document.getElementById('lightboxImg').style.transform = 'scale(1)';
    }

    // Teclas de atalho para o Lightbox
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('screenLightbox');
      if (!modal || !modal.classList.contains('active')) return;

      if (e.key === 'Escape') closeScreenLightbox();
      if (e.key === 'ArrowRight') nextLightboxScreen();
      if (e.key === 'ArrowLeft') prevLightboxScreen();
      if (e.key === '+' || e.key === '=') zoomInLightbox();
      if (e.key === '-') zoomOutLightbox();
      if (e.key === '0') resetZoomLightbox();
    });
`;

// Injetar Lightbox HTML antes de </main>
if (!html.includes('id="screenLightbox"')) {
  html = html.replace('</main>', lightboxHtml + '\n  </main>');
}

// Injetar Lightbox JS antes de </script>
if (!html.includes('systemScreens =')) {
  html = html.replace('</script>', lightboxJs + '\n  </script>');
}

// Atualizar título do banner para destacar telas reais
html = html.replace(
  '<div class="banner-tag">Guia Oficial de Operação e Procedimentos Padrão (SOP)</div>',
  '<div class="banner-tag">Guia Oficial Ilustrado com Telas Reais de Produção & Procedimentos Padrão (SOP)</div>'
);

// Salvar arquivo
fs.writeFileSync(manualPath, html, 'utf8');
console.log('MANUAL_DO_SISTEMA.html atualizado com sucesso! Novo tamanho:', html.length, 'bytes');
