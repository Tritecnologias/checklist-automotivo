import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Pencil,
  MapPin,
  Mail,
  Search,
  Filter,
  RotateCcw,
  Calendar,
  Building2,
  ExternalLink,
  Receipt,
  Wrench,
  X,
} from 'lucide-react'
import { erpApi, tenantsApi } from '../lib/api'
import type { Venda, ClienteHistorico as ClienteHistoricoType } from '../types'
import { useAuth } from '../contexts/AuthContext'
import ClienteModal from '../components/ClienteModal'

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
  filtrosInfo?: string
) {
  const { cliente, vendas, os } = data
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const totalCompras = vendas.reduce((s, v) => s + v.total, 0)
  const totalOs      = os.reduce((s, o) => s + o.total, 0)

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
      <td class="mono">${v.controle} ${v.nome_loja ? `<span style="font-size:10px;color:#888;">(${v.nome_loja})</span>` : ''}</td>
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
            <th style="text-align:left">Loja</th>
            <th style="text-align:left">Modelo</th>
            <th style="text-align:left">Data</th>
            <th style="text-align:left">Status</th>
            <th style="text-align:right">Peças</th>
            <th style="text-align:right">M.O.</th>
            <th style="text-align:right">Total</th>
          </tr></thead>
          <tbody>
            ${os.map(o => `<tr>
              <td><span class="mono">#${o.id.split('-')[0].toUpperCase()}</span><br><span class="placa">${o.plate}</span>${o.clientName && o.clientName.toLowerCase() !== cliente.nome.toLowerCase() ? `<br><small style="color:#666">OS: ${o.clientName}</small>` : ''}</td>
              <td>${o.nomeLoja || '—'}</td>
              <td>${o.model || '—'}</td>
              <td>${formatDate(o.createdAt)}</td>
              <td>${STATUS_LABEL[o.status] ?? o.status}</td>
              <td style="text-align:right">${currency(o.partsAmount ?? Math.max(0, o.total - o.laborAmount))}</td>
              <td style="text-align:right">${currency(o.laborAmount)}</td>
              <td style="text-align:right;font-weight:600">${currency(o.total)}</td>
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
    <p>Emitido em ${now} &nbsp;|&nbsp; 4Rodas ERP ${filtrosInfo ? `&nbsp;|&nbsp; ${filtrosInfo}` : ''}</p>
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
  v: {
    controle: string
    data: string
    total: number
    em_aberto: number
    vr_dinheiro?: number
    vr_cartao?: number
    vr_pix?: number
    vr_nota?: number
    nome_loja?: string | null
  }
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open

  const { data: detail, isLoading } = useQuery({
    queryKey: ['venda-detail', v.controle],
    queryFn: () => erpApi.venda(v.controle),
    enabled: isOpen,
  })

  const itens = (detail as Venda | undefined)?.itens ?? []

  return (
    <>
      <tr
        onClick={() => !forceOpen && setOpen(o => !o)}
        className={`transition-colors ${forceOpen ? '' : 'hover:bg-slate-800 cursor-pointer select-none'}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {!forceOpen && (
              <span className="text-slate-500 text-xs">{isOpen ? '▼' : '▶'}</span>
            )}
            <span className="font-mono text-xs text-slate-300 font-medium">{v.controle}</span>
            {v.nome_loja && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-800/40 whitespace-nowrap">
                {v.nome_loja}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(v.data)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-green-400 text-xs">{currency(v.total)}</span>
            <div className="flex items-center gap-1 mt-0.5">
              {Number(v.vr_pix) > 0 && <span className="text-[9px] px-1 py-0.2 rounded bg-teal-900/40 text-teal-300">PIX</span>}
              {Number(v.vr_cartao) > 0 && <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-900/40 text-indigo-300">Cartão</span>}
              {Number(v.vr_dinheiro) > 0 && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-900/40 text-amber-300">Dinheiro</span>}
              {Number(v.vr_nota) > 0 && <span className="text-[9px] px-1 py-0.2 rounded bg-purple-900/40 text-purple-300">Nota</span>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {v.em_aberto > 0 ? (
            <span className="text-red-400 font-semibold text-xs">{currency(v.em_aberto)}</span>
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
  const { currentTenant, tenants: authTenants } = useAuth()

  // Lista de Lojas disponíveis
  const { data: lojasApi = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list })
  const listaLojas = lojasApi.length > 0 ? lojasApi : (authTenants || [])

  // Estados de Filtro
  const [selectedLoja, setSelectedLoja] = useState<string>('todos')
  const [dataPreset, setDataPreset] = useState<'todos' | 'hoje' | '7dias' | '30dias' | 'mes' | 'ano'>('todos')
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'vendas' | 'os'>('todos')
  const [busca, setBusca] = useState<string>('')
  const [debouncedBusca, setDebouncedBusca] = useState<string>('')

  const [printing, setPrinting] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Debounce do campo de busca rápida
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBusca(busca)
    }, 300)
    return () => clearTimeout(timer)
  }, [busca])

  // Aplicação rápida de presets de data
  function aplicarPreset(preset: 'todos' | 'hoje' | '7dias' | '30dias' | 'mes' | 'ano') {
    setDataPreset(preset)
    const now = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    if (preset === 'todos') {
      setDataInicio('')
      setDataFim('')
    } else if (preset === 'hoje') {
      const todayStr = fmt(now)
      setDataInicio(todayStr)
      setDataFim(todayStr)
    } else if (preset === '7dias') {
      const past = new Date(now)
      past.setDate(past.getDate() - 6)
      setDataInicio(fmt(past))
      setDataFim(fmt(now))
    } else if (preset === '30dias') {
      const past = new Date(now)
      past.setDate(past.getDate() - 29)
      setDataInicio(fmt(past))
      setDataFim(fmt(now))
    } else if (preset === 'mes') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setDataInicio(fmt(start))
      setDataFim(fmt(end))
    } else if (preset === 'ano') {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      setDataInicio(fmt(start))
      setDataFim(fmt(end))
    }
  }

  function handleResetFilters() {
    setSelectedLoja('todos')
    setDataPreset('todos')
    setDataInicio('')
    setDataFim('')
    setTipoFiltro('todos')
    setBusca('')
    setDebouncedBusca('')
  }

  const hasActiveFilters = Boolean(
    selectedLoja !== 'todos' ||
    dataPreset !== 'todos' ||
    dataInicio ||
    dataFim ||
    tipoFiltro !== 'todos' ||
    busca
  )

  // Consulta do Histórico com Filtros
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'cliente-historico',
      id,
      selectedLoja,
      dataInicio,
      dataFim,
      debouncedBusca,
      tipoFiltro,
    ],
    queryFn: () => erpApi.clienteHistorico(Number(id), {
      tenant_id: selectedLoja !== 'todos' ? selectedLoja : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      search: debouncedBusca || undefined,
      tipo: tipoFiltro !== 'todos' ? tipoFiltro : undefined,
    }),
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
        })
      )
    )

    const detalhesPorControle: Record<string, Venda> = {}
    data.vendas.forEach((v, i) => { detalhesPorControle[v.controle] = detalhes[i] })

    setPrinting(false)

    // Abre janela limpa com HTML de impressão
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    const nomeLojaFiltro = selectedLoja !== 'todos'
      ? listaLojas.find(l => String(l.id) === selectedLoja)?.nome || `Loja #${selectedLoja}`
      : 'Todas as Lojas'
    const filtrosDesc = [
      `Loja: ${nomeLojaFiltro}`,
      dataInicio ? `De: ${formatDate(dataInicio)}` : null,
      dataFim ? `Até: ${formatDate(dataFim)}` : null,
      debouncedBusca ? `Busca: "${debouncedBusca}"` : null,
    ].filter(Boolean).join(' | ')

    win.document.write(buildPrintHtml(data, detalhesPorControle, filtrosDesc))
    win.document.close()
  }, [data, qc, selectedLoja, listaLojas, dataInicio, dataFim, debouncedBusca])

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
  const totalCompras = vendas.reduce((s, v) => s + v.total, 0)
  const totalOs = os.reduce((s, o) => s + o.total, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
          <span className="text-slate-300 font-semibold">{cliente.nome}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700"
          >
            <Pencil className="w-4 h-4 text-amber-400" />
            <span>Editar Cliente</span>
          </button>
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
      </div>

      {/* Header card com resumo */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-sm">
        <div className="flex flex-wrap gap-8 items-start">
          <div className="min-w-[200px]">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Cliente</p>
            <p className="text-xl font-bold text-white tracking-tight">{cliente.nome}</p>
            {cliente.telefone && (
              <p className="text-sm text-slate-400 mt-0.5">{cliente.telefone}</p>
            )}
            {cliente.cpf_cnpj && (
              <p className="text-xs text-slate-500 mt-0.5 font-mono">CPF/CNPJ: {cliente.cpf_cnpj}</p>
            )}
            {cliente.email && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                {cliente.email}
              </p>
            )}
            {cliente.endereco && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                {[cliente.endereco, cliente.bairro, cliente.cidade, cliente.uf].filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          {(cliente.placa || cliente.modelo) && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Veículo Cadastrado</p>
              {cliente.placa && (
                <span className="font-mono text-base bg-slate-800 text-amber-400 px-3 py-1 rounded-lg border border-slate-700 font-bold tracking-wider mr-2 inline-block">
                  {cliente.placa}
                </span>
              )}
              {cliente.modelo && (
                <p className="text-sm text-slate-400 mt-2 font-medium">{cliente.modelo}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Total em Compras ERP</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              {currency(totalCompras)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} {hasActiveFilters ? 'no filtro' : ''}
            </p>
          </div>

          {os.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Total em OS App</p>
              <p className="text-2xl font-bold text-blue-400 font-mono">
                {currency(totalOs)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {os.length} {os.length === 1 ? 'ordem' : 'ordens'} {hasActiveFilters ? 'no filtro' : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Painel de Filtros do Histórico ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">Filtros do Histórico</h3>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                Filtros ativos
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1.5 transition-colors py-1 px-2 rounded-lg hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>

        {/* Linha 1: Seletor de Loja e Presets de Período */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Seletor de Loja */}
          <div className="lg:col-span-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedLoja}
              onChange={e => setSelectedLoja(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="todos">🏬 Todas as Lojas</option>
              {listaLojas.map(l => (
                <option key={l.id} value={String(l.id)}>
                  📍 {l.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Botões Rápidos de Data */}
          <div className="lg:col-span-8 flex flex-wrap gap-1.5 justify-start lg:justify-end">
            {(
              [
                { id: 'todos', label: 'Tudo' },
                { id: 'hoje', label: 'Hoje' },
                { id: '7dias', label: '7 dias' },
                { id: '30dias', label: '30 dias' },
                { id: 'mes', label: 'Este Mês' },
                { id: 'ano', label: 'Este Ano' },
              ] as const
            ).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPreset(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  dataPreset === p.id && !dataInicio && !dataFim && p.id === 'todos'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : dataPreset === p.id && (dataInicio || dataFim || p.id === 'todos')
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: Datas Personalizadas, Busca Rápida e Abas de Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1">
          {/* Datas De / Até */}
          <div className="md:col-span-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="grid grid-cols-2 gap-2 w-full">
              <input
                type="date"
                value={dataInicio}
                onChange={e => {
                  setDataInicio(e.target.value)
                  setDataPreset('custom' as any)
                }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                title="Data inicial"
              />
              <input
                type="date"
                value={dataFim}
                onChange={e => {
                  setDataFim(e.target.value)
                  setDataPreset('custom' as any)
                }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                title="Data final"
              />
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="md:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por produto, placa, modelo ou nº..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro por Tipo */}
          <div className="md:col-span-3 flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setTipoFiltro('todos')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                tipoFiltro === 'todos' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setTipoFiltro('vendas')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                tipoFiltro === 'vendas' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vendas
            </button>
            <button
              type="button"
              onClick={() => setTipoFiltro('os')}
              className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                tipoFiltro === 'os' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              OS
            </button>
          </div>
        </div>
      </div>

      {/* ── Seção de Vendas no ERP ── */}
      {tipoFiltro !== 'os' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Compras no ERP
                <span className="ml-2 text-sm font-normal text-slate-500 font-mono">({vendas.length})</span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Clique em uma compra para expandir os itens e produtos
            </p>
          </div>

          {vendas.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center text-slate-500 text-sm space-y-1">
              <p>Nenhuma compra encontrada para os filtros selecionados.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-blue-400 hover:underline mt-1"
                >
                  Limpar filtros para ver todo o histórico
                </button>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left bg-slate-950/30">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Controle / Loja</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Forma / Total</th>
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
      )}

      {/* ── Seção de Ordens de Serviço — App ── */}
      {tipoFiltro !== 'vendas' && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Ordens de Serviço — App
                <span className="ml-2 text-sm font-normal text-slate-500 font-mono">({os.length})</span>
              </h2>
            </div>
            {cliente.placa && (
              <span className="text-xs text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Placa: {cliente.placa}
              </span>
            )}
          </div>

          {os.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center text-slate-500 text-sm space-y-1">
              <p>Nenhuma Ordem de Serviço encontrada para os filtros selecionados.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-blue-400 hover:underline mt-1"
                >
                  Limpar filtros para ver todo o histórico
                </button>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left bg-slate-950/30">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">OS / Placa</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Loja</th>
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
                    <tr key={o.id} className="hover:bg-slate-800/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono text-xs text-blue-400 font-bold">
                            #{o.id.split('-')[0].toUpperCase()}
                          </p>
                          <a
                            href={`/os/${o.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir Ordem de Serviço em nova aba"
                            className="text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <p className="text-xs text-amber-400 font-mono mt-0.5 font-semibold">{o.plate}</p>
                        {o.clientName && o.clientName.trim() && o.clientName.toLowerCase() !== cliente.nome.toLowerCase() && (
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-medium bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 w-fit" title="Nome do cliente na OS">
                            👤 {o.clientName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {o.nomeLoja ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-800/40 whitespace-nowrap">
                            {o.nomeLoja}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs font-medium">{o.model || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[o.status] ?? STATUS_CLASS.closed}`}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 text-xs font-mono">
                        {currency(o.partsAmount ?? Math.max(0, o.total - o.laborAmount))}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-400 text-xs font-mono">
                        {currency(o.laborAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-400 font-mono text-xs">
                        {currency(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal Editar Cliente */}
      <ClienteModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        clienteId={Number(id)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['cliente-historico', id] })
          qc.invalidateQueries({ queryKey: ['erp-clientes'] })
        }}
      />
    </div>
  )
}
