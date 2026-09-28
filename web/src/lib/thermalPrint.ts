export interface ThermalReceiptItem {
  nome: string
  quant: number
  valorUnit: number
  total: number
}

export interface ThermalReceiptPayment {
  nome: string
  valor: number
}

export interface ThermalReceiptData {
  empresa: string
  controle: string
  dataHora: string
  cliente?: {
    nome: string
    documento?: string
    telefone?: string
  } | null
  os?: {
    plate: string
    model?: string
  } | null
  itens: ThermalReceiptItem[]
  subtotal: number
  desconto: number
  total: number
  pagamentos: ThermalReceiptPayment[]
  troco?: number
}

function formatMoeda(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generateThermalReceiptHtml(dados: ThermalReceiptData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Cupom Não Fiscal - ${dados.controle}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      padding: 4mm 2mm 15mm 2mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.25;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: bold; }
    .uppercase { text-transform: uppercase; }
    
    .divider {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    .header-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .header-sub {
      font-size: 10px;
      margin-bottom: 2px;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    th {
      border-bottom: 1px dashed #000;
      padding: 2px 0;
      font-weight: bold;
    }
    td {
      padding: 1px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 1.5px 0;
    }
    .total-highlight {
      font-size: 13px;
      font-weight: bold;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 4px 0;
      margin: 4px 0;
    }
    .footer {
      text-align: center;
      font-size: 9.5px;
      margin-top: 6px;
      line-height: 1.3;
    }
    @media print {
      body {
        width: 72mm;
        margin: 0;
        padding: 2mm 2mm 15mm 2mm;
      }
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="header-title uppercase">${dados.empresa}</div>
    <div class="header-sub">COMPROVANTE NÃO FISCAL</div>
    <div class="header-sub">Emissão: ${dados.dataHora}</div>
    <div class="header-sub bold">Controle: ${dados.controle}</div>
  </div>

  ${dados.cliente ? `
    <div class="divider"></div>
    <div><strong>CLIENTE:</strong> ${dados.cliente.nome}</div>
    ${dados.cliente.documento ? `<div><strong>CPF/CNPJ:</strong> ${dados.cliente.documento}</div>` : ''}
    ${dados.cliente.telefone ? `<div><strong>TEL:</strong> ${dados.cliente.telefone}</div>` : ''}
  ` : ''}

  ${dados.os ? `
    <div class="divider"></div>
    <div><strong>VINCULADO À OS:</strong> ${dados.os.plate} ${dados.os.model ? `(${dados.os.model})` : ''}</div>
  ` : ''}

  <div class="divider"></div>
  <div class="section-title">ITENS DA VENDA</div>
  <table>
    <thead>
      <tr>
        <th class="text-left" style="width: 48%;">DESCRIÇÃO</th>
        <th class="text-center" style="width: 14%;">QTD</th>
        <th class="text-right" style="width: 18%;">UNIT</th>
        <th class="text-right" style="width: 20%;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${dados.itens.map((it, idx) => `
        <tr>
          <td colspan="4" style="padding-top: 3px; font-weight: bold;">
            ${String(idx + 1).padStart(2, '0')} ${it.nome}
          </td>
        </tr>
        <tr>
          <td></td>
          <td class="text-center">${it.quant}</td>
          <td class="text-right">${formatMoeda(it.valorUnit)}</td>
          <td class="text-right bold">${formatMoeda(it.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="divider"></div>
  <div class="row">
    <span>Subtotal:</span>
    <span>R$ ${formatMoeda(dados.subtotal)}</span>
  </div>
  ${dados.desconto > 0 ? `
    <div class="row">
      <span>Desconto:</span>
      <span>- R$ ${formatMoeda(dados.desconto)}</span>
    </div>
  ` : ''}
  <div class="row total-highlight">
    <span>TOTAL A PAGAR:</span>
    <span>R$ ${formatMoeda(dados.total)}</span>
  </div>

  <div class="divider"></div>
  <div class="section-title">PAGAMENTO</div>
  ${dados.pagamentos.map(p => `
    <div class="row">
      <span>${p.nome}:</span>
      <span>R$ ${formatMoeda(p.valor)}</span>
    </div>
  `).join('')}
  ${dados.troco !== undefined && dados.troco > 0 ? `
    <div class="row bold">
      <span>Troco:</span>
      <span>R$ ${formatMoeda(dados.troco)}</span>
    </div>
  ` : ''}

  <div class="divider"></div>
  <div class="footer">
    <div>OBRIGADO PELA PREFERÊNCIA!</div>
    <div>Sistema Checklist Automotivo</div>
  </div>
</body>
</html>`
}

export function printThermalReceipt(dados: ThermalReceiptData): void {
  const html = generateThermalReceiptHtml(dados)

  let iframe = document.getElementById('thermal-receipt-iframe') as HTMLIFrameElement
  if (!iframe) {
    iframe = document.createElement('iframe')
    iframe.id = 'thermal-receipt-iframe'
    iframe.style.position = 'fixed'
    iframe.style.top = '-10000px'
    iframe.style.left = '-10000px'
    iframe.style.width = '80mm'
    iframe.style.height = '100mm'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (iframeDoc) {
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (err) {
        console.error('Erro ao acionar impressao pelo iframe:', err)
        fallbackPrintWindow(html)
      }
    }, 250)
  } else {
    fallbackPrintWindow(html)
  }
}

function fallbackPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=380,height=600')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
    }, 250)
  } else {
    alert('Por favor, autorize a abertura de popups para imprimir o cupom.')
  }
}
