import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { Venda, ClienteHistorico as ClienteHistoricoType } from '../types'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR')
}

const STATUS_LABEL: Record<string, string> = {
  open:        'Aberta',
  in_progress: 'Em andamento',
  closed:      'Encerrada',
}
const STATUS_CLASS: Record<string, string> = {
  open:        'bg-green-900/40 text-green-400',
  in_progress: 'bg-amber-900/40 text-amber-400',
  closed:      'bg-slate-700 text-slate-400',
}

// ── Geração do HTML de impressão ──────────────────────────────────────────────

function buildPrintHtml(
  data: ClienteHistoricoType,
  detalhesPorControle: Record<string, Venda>,
) {
  const { cliente, vendas, os } = data
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const totalCompras = vendas.reduce((s, v) => s + v.total, 0)
  const totalOs      = os.reduce((s, o) => s + o.total + o.laborAmount, 0)

  const vendasHtml = vendas.map(v => {
    const det = detalhesPorControle[v.controle]
    const itens = det?.itens ?? []
    const itensHtml = itens.length
      ? `<table class="sub-table">
          <thead><tr>
            <th style="text-align:left">Produto</th>
            <th style="text-align:right">Qtd</th>
            <th style="text-align:right">Unit.</th>
            <th style="text-align:right">Subtotal</th>
          </tr></thead>
          <tbody>
            ${itens.map(i => `
              <tr>
                <td>${i.nome_produto}</td>
                <td style="text-align:right">${Number(i.quant).toLocaleString('pt-BR')}</td>
                <td style="text-align:right">${currency(i.valor)}</td>
                <td style="text-align:right">${currency(i.vr_total)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="3" style="text-align:left;color:#555">${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</td>
            <td style="text-align:right;font-weight:700">${currency(itens.reduce((s, i) => s + i.vr_total, 0))}</td>
          </tr></tfoot>
        </table>`
      : ''

    return `<tr class="venda-row">
      <td class="mono">${v.controle}</td>
      <td>${formatDate(v.data)}</td>
      <td style="text-align:right;font-weight:600">${currency(v.total)}</td>
      <td style="text-align:right">${v.em_aberto > 0 ? `<span class="aberto">${currency(v.em_aberto)}</span>` : '<span class="quitado">Quitado</span>'}</td>
    </tr>
    ${itensHtml ? `<tr><td colspan="4" style="padding:0">${itensHtml}</td></tr>` : ''}`
  }).join('')

  const osHtml = os.length
    ? `<h2>Ordens de Serviço — App (${os.length})</h2>
       <table>
         <thead><tr>
           <th style="text-align:left">OS / Placa</th>
           <th style="text-align:left">Modelo</th>
           <th style="text-align:left">Data</th>
           <th style="text-align:left">Status</th>
           <th style="text-align:right">Peças</th>
           <th style="text-align:right">M.O.</th>
           <th style="text-align:right">Total</th>
         </tr></thead>
         <tbody>
           ${os.map(o => `<tr>
             <td><span class="mono">#${o.id.split('-')[0].toUpperCase()}</span><br><span class="placa">${o.plate}</span></td>
             <td>${o.model || '—'}</td>
             <td>${formatDate(o.createdAt)}</td>
             <td>${STATUS_LABEL[o.status] ?? o.status}</td>
             <td style="text-align:right">${currency(o.total)}</td>
             <td style="text-align:right">${currency(o.laborAmount)}</td>
             <td style="text-align:right;font-weight:600">${currency(o.total + o.laborAmount)}</td>
           </tr>`).join('')}
         </tbody>
       </table>`
    : `<h2>Ordens de Serviço — App</h2>
       <p style="color:#555">${cliente.placa
         ? `Nenhuma OS encontrada para a placa ${cliente.placa}.`
         : 'Placa não identificada — cruzamento de OS indisponível.'}</p>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Histórico — ${cliente.nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; padding: 24px; }

    .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p  { font-size: 11px; color: #555; margin-top: 2px; }

    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;
                 border: 1px solid #ccc; border-radius: 6px; padding: 14px; margin-bottom: 20px; background: #f9f9f9; }
    .info-block p.label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
    .info-block p.value { font-size: 13px; font-weight: 700; }
    .info-block p.sub   { font-size: 11px; color: #555; }
    .placa-badge { display: inline-block; font-family: monospace; font-size: 13px; font-weight: 700;
                   border: 1px solid #000; border-radius: 4px; padding: 1px 8px; letter-spacing: .1em; }

    h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
         padding: 6px 8px; border: 1px solid #ccc; }
    td { padding: 6px 8px; border: 1px solid #e0e0e0; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .venda-row td { background: #fff; font-weight: 500; border-top: 2px solid #ccc; }

    .sub-table { margin: 4px 0 4px 24px; width: calc(100% - 24px); border-collapse: collapse; }
    .sub-table th { font-size: 10px; background: #efefef; padding: 4px 6px; border: 1px solid #ddd; }
    .sub-table td { font-size: 11px; padding: 4px 6px; border: 1px solid #e8e8e8; }
    .sub-table tfoot td { font-size: 11px; background: #f5f5f5; border-top: 1px solid #ccc; }

    .mono  { font-family: monospace; font-size: 11px; }
    .placa { font-family: monospace; font-weight: 700; font-size: 11px; }
    .aberto  { color: #c00; font-weight: 700; }
    .quitado { color: #555; }

    .totais { margin-top: 20px; border: 1px solid #ccc; border-radius: 6px; padding: 12px;
              display: flex; gap: 32px; background: #f9f9f9; }
    .totais .bloco p.t  { font-size: 10px; color: #888; text-transform: uppercase; }
    .totais .bloco p.v  { font-size: 16px; font-weight: 700; }

    .rodape { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 8px;
              font-size: 10px; color: #888; text-align: center; }

    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Histórico do Cliente</h1>
    <p>Emitido em ${now} &nbsp;|&nbsp; 4Rodas ERP</p>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <p class="label">Cliente</p>
      <p class="value">${cliente.nome}</p>
      ${cliente.telefone ? `<p class="sub">${cliente.telefone}</p>` : ''}
      ${cliente.cpf_cnpj ? `<p class="sub">${cliente.cpf_cnpj}</p>` : ''}
    </div>
    ${cliente.placa || cliente.modelo ? `
    <div class="info-block">
      <p class="label">Veículo</p>
      ${cliente.placa ? `<p class="value"><span class="placa-badge">${cliente.placa}</span></p>` : ''}
      ${cliente.modelo ? `<p class="sub" style="margin-top:4px">${cliente.modelo}</p>` : ''}
    </div>` : ''}
    <div class="info-block">
      <p class="label">Total em Compras ERP</p>
      <p class="value">${currency(totalCompras)}</p>
      <p class="sub">${vendas.length} venda${vendas.length !== 1 ? 's' : ''}</p>
    </div>
    ${os.length > 0 ? `
    <div class="info-block">
      <p class="label">Total em OS App</p>
      <p class="value">${currency(totalOs)}</p>
      <p class="sub">${os.length} ordem${os.length !== 1 ? 's' : ''}</p>
    </div>` : ''}
  </div>

  <h2>Compras no ERP (${vendas.length})</h2>
  ${vendas.length === 0
    ? '<p style="color:#555">Nenhuma compra registrada.</p>'
    : `<table>
        <thead><tr>
          <th style="text-align:left">Controle</th>
          <th style="text-align:left">Data</th>
          <th style="text-align:right">Total</th>
          <th style="text-align:right">Situação</th>
        </tr></thead>
        <tbody>${vendasHtml}</tbody>
      </table>`}

  ${osHtml}

  <div class="totais">
    <div class="bloco">
      <p class="t">Total geral (ERP + OS)</p>
      <p class="v">${currency(totalCompras + totalOs)}</p>
    </div>
    <div class="bloco">
      <p class="t">Compras ERP</p>
      <p class="v">${currency(totalCompras)}</p>
    </div>
    ${os.length > 0 ? `
    <div class="bloco">
      <p class="t">OS App</p>
      <p class="v">${currency(totalOs)}</p>
    </div>` : ''}
  </div>

  <div class="rodape">4Rodas ERP &nbsp;·&nbsp; ${now}</div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`
}

// ── Linha expansível de venda ─────────────────────────────────────────────────

function VendaRow({
  v,
  forceOpen,
}: {
  v: { controle: string; data: string; total: number; em_aberto: number }
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open

  const { data: detail, isLoading } = useQuery({
    queryKey: ['venda-detail', v.controle],
    queryFn: () => erpApi.venda(v.controle),
    enabled: isOpen,
    staleTime: Infinity,
  })

  const itens = (detail as Venda | undefined)?.itens ?? []

  return (
    <>
      <tr
        onClick={() => !forceOpen && setOpen(o => !o)}
        className={`transition-colors ${forceOpen ? '' : 'hover:bg-slate-800 cursor-pointer select-none'}`}
      >
        <td className="px-4 py-3">
          {!forceOpen && (
            <span className="text-slate-500 mr-2 text-xs">{isOpen ? '▼' : '▶'}</span>
          )}
          <span className="font-mono text-xs text-slate-300">{v.controle}</span>
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(v.data)}</td>
        <td className="px-4 py-3 text-right font-semibold text-green-400">
          {currency(v.total)}
        </td>
        <td className="px-4 py-3 text-right">
          {v.em_aberto > 0 ? (
            <span className="text-red-400 font-semibold">{currency(v.em_aberto)}</span>
          ) : (
            <span className="text-slate-500 text-xs">Quitado</span>
          )}
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={4} className="bg-slate-950 px-0 py-0">
            {isLoading ? (
              <div className="flex items-center gap-2 px-10 py-3 text-slate-500 text-xs">
                <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                Carregando itens…
              </div>
            ) : itens.length === 0 ? (
              <p className="px-10 py-3 text-slate-500 text-xs">Sem itens registrados.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-t border-b border-slate-800 text-left bg-slate-900/60">
                    <th className="pl-10 pr-4 py-2 text-slate-500 font-medium">Produto</th>
                    <th className="px-4 py-2 text-slate-500 font-medium text-right">Qtd</th>
                    <th className="px-4 py-2 text-slate-500 font-medium text-right">Unit.</th>
                    <th className="px-4 py-2 text-slate-500 font-medium text-right pr-6">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {itens.map(i => (
                    <tr key={i.id} className="hover:bg-slate-800/40">
                      <td className="pl-10 pr-4 py-2 text-slate-300">{i.nome_produto}</td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        {Number(i.quant).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        {currency(i.valor)}
                      </td>
                      <td className="px-4 py-2 text-right text-green-400 font-medium pr-6">
                        {currency(i.vr_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-800 bg-slate-900/40">
                    <td colSpan={3} className="pl-10 py-2 text-slate-500 text-xs">
                      {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-green-400 pr-6">
                      {currency(itens.reduce((s, i) => s + i.vr_total, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ClienteHistorico() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [printing, setPrinting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cliente-historico', id],
    queryFn: () => erpApi.clienteHistorico(Number(id)),
    enabled: Boolean(id),
  })

  const handlePrint = useCallback(async () => {
    if (!data) return
    setPrinting(true)

    // Busca todos os detalhes de venda em paralelo
    const detalhes = await Promise.all(
      data.vendas.map(v =>
        qc.fetchQuery<Venda>({
          queryKey: ['venda-detail', v.controle],
          queryFn: () => erpApi.venda(v.controle),
          staleTime: Infinity,
        })
      )
    )

    const detalhesPorControle: Record<string, Venda> = {}
    data.vendas.forEach((v, i) => { detalhesPorControle[v.controle] = detalhes[i] })

    setPrinting(false)

    // Abre janela limpa com HTML de impressão
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(buildPrintHtml(data, detalhesPorControle))
    win.document.close()
  }, [data, qc])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-slate-400 text-sm">Carregando histórico…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-center py-40 space-y-3">
        <p className="text-red-400">Erro ao carregar histórico do cliente.</p>
        <button
          onClick={() => navigate('/erp/clientes')}
          className="text-sm text-slate-400 hover:text-white underline"
        >
          Voltar para Clientes
        </button>
      </div>
    )
  }

  const { cliente, vendas, os } = data

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Breadcrumb + ações */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <button
            onClick={() => navigate('/erp/clientes')}
            className="hover:text-slate-300 transition-colors"
          >
            Clientes
          </button>
          <span>/</span>
          <span className="text-slate-300">{cliente.nome}</span>
        </div>
        <button
          onClick={handlePrint}
          disabled={printing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm rounded-lg transition-colors"
        >
          {printing ? (
            <>
              <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
              Preparando…
            </>
          ) : (
            <>🖨️ Imprimir</>
          )}
        </button>
      </div>

      {/* Header card */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cliente</p>
            <p className="text-xl font-bold text-white">{cliente.nome}</p>
            {cliente.telefone && (
              <p className="text-sm text-slate-400 mt-0.5">{cliente.telefone}</p>
            )}
            {cliente.cpf_cnpj && (
              <p className="text-xs text-slate-500 mt-0.5">{cliente.cpf_cnpj}</p>
            )}
          </div>
          {(cliente.placa || cliente.modelo) && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Veículo</p>
              {cliente.placa && (
                <span className="font-mono text-base bg-slate-800 text-amber-400 px-3 py-1 rounded border border-slate-700 mr-2">
                  {cliente.placa}
                </span>
              )}
              {cliente.modelo && (
                <p className="text-sm text-slate-400 mt-2">{cliente.modelo}</p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total em Compras</p>
            <p className="text-2xl font-bold text-green-400">
              {currency(vendas.reduce((s, v) => s + v.total, 0))}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{vendas.length} venda{vendas.length !== 1 ? 's' : ''}</p>
          </div>
          {os.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total em OS</p>
              <p className="text-2xl font-bold text-blue-400">
                {currency(os.reduce((s, o) => s + o.total + o.laborAmount, 0))}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{os.length} ordem{os.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vendas ERP */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">
          Compras no ERP
          <span className="ml-2 text-sm font-normal text-slate-500">({vendas.length})</span>
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Clique em uma linha para ver os produtos da compra.
        </p>
        {vendas.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma compra registrada.</p>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Controle</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {vendas.map(v => (
                  <VendaRow key={v.controle} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* OS do App */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">
          Ordens de Serviço — App
          <span className="ml-2 text-sm font-normal text-slate-500">({os.length})</span>
        </h2>
        {os.length === 0 ? (
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center">
            <p className="text-slate-500 text-sm">
              {cliente.placa
                ? `Nenhuma OS encontrada para a placa ${cliente.placa}.`
                : 'Placa não identificada — cruzamento de OS indisponível.'}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">OS</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Modelo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Peças</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">M.O.</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {os.map(o => (
                  <tr key={o.id} className="hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-300">
                        #{o.id.split('-')[0].toUpperCase()}
                      </p>
                      <p className="text-xs text-amber-400 font-mono mt-0.5">{o.plate}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{o.model || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[o.status] ?? STATUS_CLASS.closed}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">{currency(o.total)}</td>
                    <td className="px-4 py-3 text-right text-blue-400 text-xs">{currency(o.laborAmount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400">
                      {currency(o.total + o.laborAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
