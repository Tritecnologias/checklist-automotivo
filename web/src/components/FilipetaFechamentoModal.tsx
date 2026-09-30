import { Printer, X, CheckCircle2, TrendingUp, AlertTriangle, Building2, User, Calendar, Clock } from 'lucide-react'
import type { CaixaSession } from '../types'

interface FilipetaFechamentoModalProps {
  isOpen: boolean
  onClose: () => void
  session: CaixaSession
  lojaNome?: string
  valorContadoDinheiro?: number
}

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FilipetaFechamentoModal({
  isOpen,
  onClose,
  session,
  lojaNome = 'Loja',
  valorContadoDinheiro,
}: FilipetaFechamentoModalProps) {
  if (!isOpen) return null

  const fundoAbertura = Number(session.vr_abertura || 0)
  const cartao = Number(session.totais_por_forma?.cartao || 0)
  const pix = Number(session.totais_por_forma?.pix || 0)
  const prazo = Number(session.totais_por_forma?.prazo || 0)
  const vendasDinheiro = Number(session.totais_por_forma?.dinheiro || 0)
  const despesasDinheiro = Number(session.despesas_dinheiro ?? session.totais_por_forma?.despesas_dinheiro ?? 0)
  const totalDespesas = Number(session.total_despesas ?? session.totais_por_forma?.total_despesas ?? 0)

  // Dinheiro contado na gaveta (se passou por prop ou o que foi gravado no fechamento)
  const dinheiroContado = valorContadoDinheiro !== undefined
    ? valorContadoDinheiro
    : Number(session.vr_fechamento || 0)

  // Total geral de movimentação apurada (física + digital + despesas pagas)
  const totalGeralMovimentado = cartao + dinheiroContado + pix + despesasDinheiro

  // Total das vendas faturadas no sistema
  const totalVendasSistema = Number(session.vr_fechado_turno ?? session.totais_por_forma?.total_vendas ?? 0)

  // Saldo esperado em dinheiro = Fundo + Vendas Dinheiro - Despesas Dinheiro
  const saldoEsperadoDinheiro = Math.max(0, fundoAbertura + vendasDinheiro - despesasDinheiro)

  // Diferença do caixa (sobra ou quebra)
  const diferencaCaixa = dinheiroContado - saldoEsperadoDinheiro

  const listaPix = session.lista_pix || []

  function handlePrint() {
    const win = window.open('', '_blank', 'width=800,height=800')
    if (!win) return

    const now = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const printHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Fechamento de Caixa — ${lojaNome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #000; background: #fff; padding: 20px; max-width: 480px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 14px; }
    .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .header p { font-size: 12px; margin: 2px 0; }
    .box-anterior { border: 2px solid #000; padding: 8px; text-align: center; font-weight: bold; font-size: 15px; margin: 12px 0; background: #f4f4f4; }
    .table-linhas { width: 100%; border-collapse: collapse; margin: 12px 0; }
    .table-linhas td { padding: 5px 0; border-bottom: 1px dotted #ccc; }
    .table-linhas td.val { text-align: right; font-weight: bold; }
    .subtotal-row { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .pix-block { margin: 10px 0; padding: 8px; background: #fafafa; border: 1px solid #ddd; font-size: 11px; }
    .pix-item { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .total-destaque { border: 2px solid #000; padding: 10px; margin: 14px 0; background: #eee; text-align: center; }
    .total-destaque .big { font-size: 20px; font-weight: bold; margin-top: 4px; }
    .resultado-caixa { border: 2px solid #000; padding: 12px; margin: 14px 0; text-align: center; font-size: 16px; font-weight: bold; }
    .signatures { margin-top: 36px; padding-top: 10px; }
    .sig-line { border-top: 1px solid #000; width: 80%; margin: 24px auto 4px auto; text-align: center; font-size: 11px; }
    @media print {
      body { padding: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>4RODAS SISTEMA ERP</h1>
    <p><strong>FECHAMENTO DE CAIXA</strong></p>
    <p>${lojaNome} — Sessão #${session.id}</p>
    <p>Data: ${session.data_abertura} | Impresso: ${now}</p>
    <p>Operador: ${session.nome_operador || session.nome_login || 'Caixa'}</p>
  </div>

  <div class="box-anterior">
    CX ANTERIOR (FUNDO): ${R(fundoAbertura)}
  </div>

  <table class="table-linhas">
    <tr>
      <td>DESPESAS PAGAS NO CAIXA:</td>
      <td class="val">${R(despesasDinheiro)}</td>
    </tr>
    <tr>
      <td>CARTÃO (CRÉDITO / DÉBITO):</td>
      <td class="val">${R(cartao)}</td>
    </tr>
    <tr>
      <td>DINHEIRO FÍSICO CONTADO:</td>
      <td class="val">${R(dinheiroContado)}</td>
    </tr>
    <tr>
      <td>RECEBIMENTOS PIX:</td>
      <td class="val">${R(pix)}</td>
    </tr>
    ${prazo > 0 ? `<tr><td>A PRAZO (NOTA/CARNÊ):</td><td class="val">${R(prazo)}</td></tr>` : ''}
  </table>

  ${listaPix.length > 0 ? `
  <div class="pix-block">
    <div style="font-weight:bold;margin-bottom:5px;">DISCRIMINAÇÃO PIX (${listaPix.length}):</div>
    ${listaPix.map(p => `
      <div class="pix-item">
        <span>• ${p.nome_cliente} ${p.modelo ? `(${p.modelo})` : ''}</span>
        <strong>${R(p.vr_pix)}</strong>
      </div>
    `).join('')}
  </div>` : ''}

  <div class="total-destaque">
    <div>TOTAL GERAL MOVIMENTADO:</div>
    <div class="big">${R(totalGeralMovimentado)}</div>
    <div style="font-size:11px;margin-top:4px;">TOTAL FATURADO SISTEMA: ${R(totalVendasSistema)}</div>
  </div>

  <div class="resultado-caixa">
    ${Math.abs(diferencaCaixa) < 0.01
      ? 'CAIXA EXATO (R$ 0,00)'
      : diferencaCaixa > 0
      ? `SOBRA DE CAIXA: +${R(diferencaCaixa)}`
      : `FALTA DE CAIXA: -${R(Math.abs(diferencaCaixa))}`}
  </div>

  <div class="signatures">
    <div class="sig-line">Operador de Caixa</div>
    <div class="sig-line">Gerência / Conferência</div>
  </div>

  <script>window.print();</script>
</body>
</html>`

    win.document.write(printHtml)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Filipeta de Fechamento de Caixa</h2>
              <p className="text-xs text-slate-400">{lojaNome} — Conferência física</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo estilo Filipeta / Canhoto */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto font-mono text-sm">
          {/* Caixa Anterior */}
          <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 text-center">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-0.5">
              CX ANTERIOR ({lojaNome})
            </span>
            <span className="text-2xl font-bold text-amber-400 tracking-wider">
              {R(fundoAbertura)}
            </span>
          </div>

          {/* Linhas da Filipeta */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">DESP: (Despesas pagas em dinheiro)</span>
              <strong className="text-red-400 font-bold">{R(despesasDinheiro)}</strong>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">CART: (Cartão Crédito/Débito)</span>
              <strong className="text-slate-100 font-bold">{R(cartao)}</strong>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">DIN: (Dinheiro contado na gaveta)</span>
              <strong className="text-emerald-400 font-bold">{R(dinheiroContado)}</strong>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">PIX: (Recebimentos PIX)</span>
              <strong className="text-blue-400 font-bold">{R(pix)}</strong>
            </div>

            {prazo > 0 && (
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">PRAZO: (Notas a receber)</span>
                <strong className="text-purple-400 font-bold">{R(prazo)}</strong>
              </div>
            )}
          </div>

          {/* Discriminação de PIX se houver */}
          {listaPix.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-2">
              <span className="font-bold text-slate-300 block uppercase">
                Discriminação de PIX ({listaPix.length} recebimentos):
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {listaPix.map(p => (
                  <div key={p.controle} className="flex justify-between text-slate-400">
                    <span className="truncate pr-2">• {p.nome_cliente} {p.modelo ? `(${p.modelo})` : ''}</span>
                    <strong className="text-blue-300 font-mono">{R(p.vr_pix)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total Geral Movimentado vs Sistema */}
          <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">
                TOTAL GERAL MOVIMENTADO:
              </span>
              <strong className="text-xl font-bold text-white tracking-tight">
                {R(totalGeralMovimentado)}
              </strong>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 uppercase tracking-wider block">
                TOTAL SISTEMA:
              </span>
              <strong className="text-base font-semibold text-slate-300">
                {R(totalVendasSistema)}
              </strong>
            </div>
          </div>

          {/* Resultado Final (Sobra / Falta) */}
          <div className={`p-4 rounded-xl text-center border font-sans ${
            Math.abs(diferencaCaixa) < 0.01
              ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-300'
              : diferencaCaixa > 0
              ? 'bg-blue-950/40 border-blue-600/60 text-blue-300'
              : 'bg-red-950/40 border-red-600/60 text-red-300'
          }`}>
            <span className="text-xs uppercase font-semibold tracking-wider block mb-1">
              Resultado Final do Caixa:
            </span>
            <strong className="text-2xl font-bold font-mono block">
              {Math.abs(diferencaCaixa) < 0.01
                ? '✅ Caixa Bateu Exato (R$ 0,00)'
                : diferencaCaixa > 0
                ? `CAIXA: +${R(diferencaCaixa)} (Sobra)`
                : `CAIXA: -${R(Math.abs(diferencaCaixa))} (Quebra/Falta)`}
            </strong>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Filipeta</span>
          </button>
        </div>
      </div>
    </div>
  )
}
