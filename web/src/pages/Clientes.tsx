import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  Pencil,
  Trash2,
  FileText,
  Search,
  X,
  Phone,
  Power,
  AlertTriangle,
  Building2,
  ExternalLink,
  Filter,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShoppingBag,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Users,
  Printer,
} from 'lucide-react'
import { erpApi, tenantsApi } from '../lib/api'
import type { ClienteErp } from '../types'
import { useAuth } from '../contexts/AuthContext'
import ClienteModal from '../components/ClienteModal'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

function PlaceBadge({ plate }: { plate: string | null }) {
  if (!plate) return <span className="text-slate-500 text-xs">—</span>
  return (
    <span className="font-mono text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700 font-semibold tracking-wide">
      {plate}
    </span>
  )
}

function LojasBadge({
  lojas,
  activeLojaName,
}: {
  lojas: string | null
  activeLojaName?: string | null
}) {
  if (!lojas) return <span className="text-slate-600 text-xs">—</span>
  const nomes = lojas.split(', ').map(s => s.trim()).filter(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-1">
      {nomes.map(n => {
        const isCurrentFiltered = Boolean(activeLojaName && n.toLowerCase() === activeLojaName.toLowerCase())
        return (
          <span
            key={n}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all whitespace-nowrap ${
              isCurrentFiltered
                ? 'bg-blue-600 text-white border border-blue-400 font-bold shadow-sm ring-1 ring-blue-400/40'
                : 'bg-slate-800/80 text-slate-300 border border-slate-700/80 hover:bg-slate-700'
            }`}
            title={isCurrentFiltered ? `Loja selecionada no filtro: ${n}` : `Cliente também vinculado à: ${n}`}
          >
            {n}
          </span>
        )
      })}
    </div>
  )
}

// ── Relatório de Clientes para Impressão ──────────────────────────────────────

function buildClientesReportHtml(
  clientes: ClienteErp[],
  totalFiltrado: number,
  filtrosInfo?: string
) {
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const totalGasto = clientes.reduce((s, c) => s + (Number(c.total_gasto) || 0), 0)
  const totalCompras = clientes.reduce((s, c) => s + (Number(c.qtd_compras) || 0), 0)
  const comComprasCount = clientes.filter(c => (Number(c.qtd_compras) || 0) > 0).length

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório de Clientes — 4Rodas ERP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
           font-size: 11px; color: #111; padding: 18px; line-height: 1.35; background: #fff; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .sub { font-size: 10px; color: #64748b; }

    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .summary-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .summary-card .lbl { font-size: 9px; text-transform: uppercase; font-weight: 600; color: #64748b; }
    .summary-card .val { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px; }

    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #f1f5f9; padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; }
    td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; font-size: 10px; }
    tr:nth-child(even) td { background: #fafafa; }

    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .placa { font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 700; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 3px; font-size: 10px; }
    .badge { font-size: 9px; font-weight: 600; padding: 1px 4px; border-radius: 3px; display: inline-block; }
    .badge-ativo { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge-inativo { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

    tfoot td { font-weight: 700; background: #f8fafc; border-top: 2px solid #94a3b8; }
    .rodape { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }

    @media print {
      body { padding: 10px; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório Geral de Clientes</h1>
      <p class="sub">4Rodas ERP &nbsp;|&nbsp; Emitido em ${now} ${filtrosInfo ? `&nbsp;|&nbsp; Filtros: ${filtrosInfo}` : ''}</p>
    </div>
    <div style="text-align:right">
      <p class="sub">Histórico de Compras (ERP) e Ordens de Serviço (App)</p>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="lbl">Total Listado</div>
      <div class="val">${clientes.length} de ${totalFiltrado} clientes</div>
    </div>
    <div class="summary-card">
      <div class="lbl">Com Compras / OS</div>
      <div class="val">${comComprasCount} clientes</div>
    </div>
    <div class="summary-card">
      <div class="lbl">Total de Compras / OS</div>
      <div class="val">${totalCompras} transações</div>
    </div>
    <div class="summary-card">
      <div class="lbl">Total Gasto Acumulado</div>
      <div class="val" style="color:#059669">${currency(totalGasto)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">#</th>
        <th style="text-align:left">Cliente</th>
        <th style="text-align:left">Telefone / Doc</th>
        <th style="text-align:left">Veículo</th>
        <th style="text-align:left">Loja(s)</th>
        <th style="text-align:right">Compras</th>
        <th style="text-align:center">Última Compra</th>
        <th style="text-align:right">Total Gasto (ERP + OS)</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${clientes.length === 0 ? `
        <tr><td colspan="9" style="text-align:center;padding:16px;color:#64748b">Nenhum cliente encontrado para os filtros selecionados.</td></tr>
      ` : clientes.map((c, idx) => `
        <tr>
          <td style="color:#94a3b8;font-size:9px">${idx + 1}</td>
          <td><strong>${c.nome}</strong></td>
          <td>
            ${c.telefone || c.celular || '—'}
            ${c.cpf_cnpj ? `<br><span class="mono" style="color:#64748b;font-size:9px">${c.cpf_cnpj}</span>` : ''}
          </td>
          <td>
            ${c.placa ? `<span class="placa">${c.placa}</span>` : ''}
            ${c.modelo ? `<div style="color:#475569;font-size:9px;margin-top:2px">${c.modelo}</div>` : (!c.placa ? '—' : '')}
          </td>
          <td>${c.lojas || '—'}</td>
          <td style="text-align:right">${c.qtd_compras || 0}</td>
          <td style="text-align:center">${formatDate(c.ultima_compra)}</td>
          <td style="text-align:right;font-weight:600;color:${(c.total_gasto || 0) > 0 ? '#059669' : '#64748b'}">
            ${currency(c.total_gasto || 0)}
          </td>
          <td style="text-align:center">
            <span class="badge ${c.inativo ? 'badge-inativo' : 'badge-ativo'}">${c.inativo ? 'Inativo' : 'Ativo'}</span>
          </td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:left">Totais da Lista (${clientes.length} clientes)</td>
        <td style="text-align:right">${totalCompras}</td>
        <td></td>
        <td style="text-align:right;color:#059669">${currency(totalGasto)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="rodape">
    <span>4Rodas ERP &nbsp;·&nbsp; Sistema de Gestão Automotiva</span>
    <span>Documento gerado para controle interno</span>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`
}

export default function Clientes() {
  const { currentTenant, isOwner, tenants: authTenants } = useAuth()
  const tid = currentTenant?.id ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Lista de Lojas disponíveis para o usuário
  const { data: lojasApi = [] } = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list })
  const listaLojas = lojasApi.length > 0 ? lojasApi : (authTenants || [])

  // Filtros Globais do Cabeçalho
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedLoja, setSelectedLoja] = useState<string>('')
  const [status, setStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos')
  const [comCompras, setComCompras] = useState<'todas' | 'com_compras' | 'sem_compras'>('todas')
  const [sort, setSort] = useState<string>('recentes')
  const [page, setPage] = useState(1)

  // Filtros específicos por Coluna da Tabela
  const [showColFilters, setShowColFilters] = useState(true)
  const [colCliente, setColCliente] = useState('')
  const [debouncedColCliente, setDebouncedColCliente] = useState('')
  const [colPlaca, setColPlaca] = useState('')
  const [debouncedColPlaca, setDebouncedColPlaca] = useState('')
  const [colVeiculo, setColVeiculo] = useState('')
  const [debouncedColVeiculo, setDebouncedColVeiculo] = useState('')
  const [colLoja, setColLoja] = useState('')

  // Modais de CRUD
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<ClienteErp | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Debounce da busca geral
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  // Debounce dos filtros de coluna
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedColCliente(colCliente)
      setDebouncedColPlaca(colPlaca)
      setDebouncedColVeiculo(colVeiculo)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [colCliente, colPlaca, colVeiculo])

  function handleLojaChange(val: string) {
    setSelectedLoja(val)
    setColLoja(val === 'todos' ? '' : val)
    setPage(1)
  }

  const activeLojaNome =
    selectedLoja && selectedLoja !== 'todos'
      ? listaLojas.find(l => String(l.id) === selectedLoja)?.nome || null
      : (colLoja ? listaLojas.find(l => String(l.id) === colLoja)?.nome || null : null)

  const hasActiveFilters = Boolean(
    search ||
    (isOwner ? (selectedLoja && selectedLoja !== 'todos') : selectedLoja) ||
    colLoja ||
    status !== 'ativos' ||
    comCompras !== 'todas' ||
    sort !== 'recentes' ||
    colCliente ||
    colPlaca ||
    colVeiculo
  )

  function handleResetAllFilters() {
    setSearch('')
    setDebouncedSearch('')
    setSelectedLoja(isOwner ? 'todos' : '')
    setColLoja('')
    setStatus('ativos')
    setComCompras('todas')
    setSort('recentes')
    setColCliente('')
    setDebouncedColCliente('')
    setColPlaca('')
    setDebouncedColPlaca('')
    setColVeiculo('')
    setDebouncedColVeiculo('')
    setPage(1)
  }

  function handleSortClick(field: string) {
    if (field === 'cliente') {
      setSort(s => (s === 'nome_asc' ? 'nome_desc' : 'nome_asc'))
    } else if (field === 'compras') {
      setSort(s => (s === 'qtd_compras_desc' ? 'recentes' : 'qtd_compras_desc'))
    } else if (field === 'total_gasto') {
      setSort(s => (s === 'total_gasto_desc' ? 'recentes' : 'total_gasto_desc'))
    } else if (field === 'ultima_compra') {
      setSort(s => (s === 'ultima_compra_desc' ? 'recentes' : 'ultima_compra_desc'))
    }
    setPage(1)
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      'erp-clientes',
      tid,
      selectedLoja,
      debouncedSearch,
      status,
      comCompras,
      sort,
      debouncedColCliente,
      debouncedColPlaca,
      debouncedColVeiculo,
      colLoja,
      page,
    ],
    queryFn: () =>
      erpApi.clientes({
        search: debouncedSearch || undefined,
        status,
        page,
        tenant_id: selectedLoja || undefined,
        col_cliente: debouncedColCliente || undefined,
        col_placa: debouncedColPlaca || undefined,
        col_veiculo: debouncedColVeiculo || undefined,
        col_loja: colLoja || undefined,
        com_compras: comCompras !== 'todas' ? comCompras : undefined,
        sort: sort || undefined,
      }),
  })

  function handleOpenCreate() {
    setEditingId(null)
    setModalOpen(true)
  }

  function handleOpenEdit(client: ClienteErp) {
    setEditingId(client.id)
    setModalOpen(true)
  }

  async function handleToggleStatus(client: ClienteErp, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await erpApi.toggleClienteStatus(client.id)
      queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
      setFeedbackMsg({
        type: 'success',
        text: `Status do cliente "${client.nome}" atualizado!`,
      })
      setTimeout(() => setFeedbackMsg(null), 3000)
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Erro ao alterar status do cliente.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await erpApi.excluirCliente(deleteTarget.id)
      queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
      setDeleteTarget(null)
      setFeedbackMsg({
        type: 'success',
        text: res.message || 'Cliente excluído/inativado com sucesso.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Erro ao excluir cliente.',
      })
      setTimeout(() => setFeedbackMsg(null), 4000)
    } finally {
      setDeleting(false)
    }
  }

  const [printingRelatorio, setPrintingRelatorio] = useState(false)

  async function handlePrintRelatorio() {
    setPrintingRelatorio(true)
    try {
      const res = await erpApi.clientes({
        search: debouncedSearch || undefined,
        status,
        page: 1,
        limit: Math.min(1000, Math.max(total, 50)),
        tenant_id: selectedLoja || undefined,
        col_cliente: debouncedColCliente || undefined,
        col_placa: debouncedColPlaca || undefined,
        col_veiculo: debouncedColVeiculo || undefined,
        col_loja: colLoja || undefined,
        com_compras: comCompras !== 'todas' ? comCompras : undefined,
        sort: sort || undefined,
      })

      const listaParaImprimir = res.data && res.data.length > 0 ? res.data : clientes
      const filtrosDesc = [
        selectedLoja ? `Loja: ${listaLojas.find(l => String(l.id) === selectedLoja)?.nome || selectedLoja}` : 'Todas as Lojas',
        status !== 'todos' ? `Status: ${status === 'ativos' ? 'Ativos' : 'Inativos'}` : null,
        comCompras !== 'todas' ? `Compras: ${comCompras === 'com_compras' ? 'Com Compras' : 'Sem Compras'}` : null,
        debouncedSearch ? `Busca: "${debouncedSearch}"` : null,
      ].filter(Boolean).join(' | ')

      const win = window.open('', '_blank', 'width=1000,height=800')
      if (!win) return
      win.document.write(buildClientesReportHtml(listaParaImprimir, res.total ?? total, filtrosDesc))
      win.document.close()
    } catch (err: any) {
      alert(err?.message || 'Erro ao gerar relatório de clientes')
    } finally {
      setPrintingRelatorio(false)
    }
  }

  const clientes: ClienteErp[] = data?.data ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const counts = data?.counts

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header com Título e Estatísticas Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Clientes</h1>

            {/* Badges Rápidos com Contadores */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => { setStatus('todos'); setPage(1); }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  status === 'todos'
                    ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 ring-1 ring-blue-500/30 font-semibold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Mostrar todos os clientes cadastrados"
              >
                <Users className="w-3 h-3" />
                <span>{counts?.total ?? total} cadastrados</span>
              </button>

              <button
                type="button"
                onClick={() => { setStatus('ativos'); setPage(1); }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  status === 'ativos'
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30 font-semibold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-emerald-400'
                }`}
                title="Filtrar apenas clientes ativos"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{counts ? counts.total_ativos : '—'} ativos</span>
              </button>

              <button
                type="button"
                onClick={() => { setStatus('inativos'); setPage(1); }}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                  status === 'inativos'
                    ? 'bg-red-600/30 text-red-300 border-red-500/50 ring-1 ring-red-500/30 font-semibold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-red-400'
                }`}
                title="Filtrar apenas clientes inativos"
              >
                <XCircle className="w-3 h-3 text-red-400" />
                <span>{counts ? counts.total_inativos : '—'} inativos</span>
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Clientes cadastrados no ERP com veículos, histórico de compras e ordens de serviço
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={handlePrintRelatorio}
            disabled={printingRelatorio}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 shadow-sm transition-all"
            title="Imprimir relatório da lista filtrada de clientes"
          >
            {printingRelatorio ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                <span>Gerando…</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 text-blue-400" />
                <span>Relatório</span>
              </>
            )}
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/25 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-red-950/70 border-red-800 text-red-300'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PAINEL DE FILTROS DO CABEÇALHO ────────────────────────────────────────── */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3.5 backdrop-blur-sm">
        {/* Linha 1: Campo de Busca Geral Instantânea + Ações */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, placa, telefone, CPF/CNPJ ou e-mail…"
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-md transition-colors"
                title="Limpar busca geral"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Alternar Filtros nas Colunas da Tabela */}
            <button
              type="button"
              onClick={() => setShowColFilters(v => !v)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-xl border transition-all ${
                showColFilters
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-700/80'
              }`}
              title="Mostrar ou ocultar campos de pesquisa diretamente nas colunas da tabela"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Filtro nas Colunas</span>
              {(colCliente || colPlaca || colVeiculo || colLoja) && (
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </button>

            {/* Botão Limpar Filtros */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-800/50 transition-all"
                title="Redefinir todos os filtros para o padrão"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}
          </div>
        </div>

        {/* Linha 2: Dropdowns de Loja, Status, Histórico de Compras e Ordenação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/70">
          {/* Loja / Unidade */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Loja / Unidade</span>
            </label>
            <select
              value={selectedLoja || (isOwner ? 'todos' : '')}
              onChange={e => handleLojaChange(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            >
              {isOwner && (
                <option value="todos">Todas as Lojas (Consolidado)</option>
              )}
              {!isOwner && <option value="">Minha Loja Atual ({currentTenant?.nome || 'Padrão'})</option>}
              {listaLojas.map(l => (
                <option key={l.id} value={String(l.id)}>
                  {l.nome} {l.id === currentTenant?.id ? '(Atual)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Status do Cliente */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Status</span>
            </label>
            <div className="grid grid-cols-3 bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/80 h-[38px] items-center">
              <button
                type="button"
                onClick={() => { setStatus('ativos'); setPage(1); }}
                className={`h-full text-xs font-semibold rounded-md transition-all flex items-center justify-center ${
                  status === 'ativos'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ativos
              </button>
              <button
                type="button"
                onClick={() => { setStatus('inativos'); setPage(1); }}
                className={`h-full text-xs font-semibold rounded-md transition-all flex items-center justify-center ${
                  status === 'inativos'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Inativos
              </button>
              <button
                type="button"
                onClick={() => { setStatus('todos'); setPage(1); }}
                className={`h-full text-xs font-semibold rounded-md transition-all flex items-center justify-center ${
                  status === 'todos'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos
              </button>
            </div>
          </div>

          {/* Histórico de Compras */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
              <span>Histórico de Compras</span>
            </label>
            <select
              value={comCompras}
              onChange={e => { setComCompras(e.target.value as any); setPage(1); }}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="todas">Todos os clientes (Com/Sem compras)</option>
              <option value="com_compras">Com compras/OS realizadas (&gt; 0)</option>
              <option value="sem_compras">Sem compras/OS realizadas (0)</option>
            </select>
          </div>

          {/* Ordenação */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
              <span>Classificar Por</span>
            </label>
            <select
              value={sort}
              onChange={e => { setSort(e.target.value); setPage(1); }}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="recentes">Mais recentes (Cadastro)</option>
              <option value="nome_asc">Nome do Cliente (A → Z)</option>
              <option value="nome_desc">Nome do Cliente (Z → A)</option>
              <option value="total_gasto_desc">Maior Total Gasto (R$)</option>
              <option value="qtd_compras_desc">Mais Compras / OS Realizadas</option>
              <option value="ultima_compra_desc">Última Compra Mais Recente</option>
              <option value="antigos">Mais antigos (Cadastro)</option>
            </select>
          </div>
        </div>

        {/* Tags de Resumo dos Filtros Ativos */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap pt-2.5 border-t border-slate-800/50 text-xs">
            <span className="text-slate-400 font-medium">Filtros aplicados:</span>
            {debouncedSearch && (
              <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-md border border-slate-700">
                Busca: &ldquo;{debouncedSearch}&rdquo;
                <button
                  type="button"
                  onClick={() => { setSearch(''); setDebouncedSearch(''); }}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedLoja && selectedLoja !== 'todos' && (
              <span className="inline-flex items-center gap-1 bg-blue-900/30 text-blue-300 px-2.5 py-0.5 rounded-md border border-blue-800/50">
                Loja: {listaLojas.find(l => String(l.id) === selectedLoja)?.nome || selectedLoja}
                <button
                  type="button"
                  onClick={() => handleLojaChange(isOwner ? 'todos' : '')}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro de loja"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {status !== 'ativos' && (
              <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-md border border-slate-700">
                Status: {status === 'inativos' ? 'Inativos' : 'Todos'}
                <button
                  type="button"
                  onClick={() => setStatus('ativos')}
                  className="hover:text-red-400 ml-0.5"
                  title="Voltar para Ativos"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {comCompras !== 'todas' && (
              <span className="inline-flex items-center gap-1 bg-emerald-950/40 text-emerald-300 px-2.5 py-0.5 rounded-md border border-emerald-800/50">
                Compras: {comCompras === 'com_compras' ? 'Com compras (>0)' : 'Sem compras (0)'}
                <button
                  type="button"
                  onClick={() => setComCompras('todas')}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {sort !== 'recentes' && (
              <span className="inline-flex items-center gap-1 bg-amber-950/30 text-amber-300 px-2.5 py-0.5 rounded-md border border-amber-800/50">
                Ordem: {sort}
                <button
                  type="button"
                  onClick={() => setSort('recentes')}
                  className="hover:text-red-400 ml-0.5"
                  title="Resetar ordem"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {debouncedColCliente && (
              <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-md border border-slate-700">
                Col. Cliente: &ldquo;{debouncedColCliente}&rdquo;
                <button
                  type="button"
                  onClick={() => { setColCliente(''); setDebouncedColCliente(''); }}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {debouncedColPlaca && (
              <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-md border border-slate-700">
                Col. Placa: &ldquo;{debouncedColPlaca}&rdquo;
                <button
                  type="button"
                  onClick={() => { setColPlaca(''); setDebouncedColPlaca(''); }}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {debouncedColVeiculo && (
              <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded-md border border-slate-700">
                Col. Veículo: &ldquo;{debouncedColVeiculo}&rdquo;
                <button
                  type="button"
                  onClick={() => { setColVeiculo(''); setDebouncedColVeiculo(''); }}
                  className="hover:text-red-400 ml-0.5"
                  title="Remover filtro"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {isFetching && (
              <span className="text-blue-400 text-[11px] animate-pulse font-medium ml-auto">
                Atualizando resultados…
              </span>
            )}
          </div>
        )}
      </div>

      {/* Clientes Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-slate-400 text-sm font-medium">Carregando clientes…</span>
          </div>
        ) : isError ? (
          <div className="text-center py-20 text-red-400 space-y-3">
            <p>Erro ao carregar lista de clientes. Verifique a conexão com o servidor.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors border border-slate-700 inline-flex items-center gap-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : clientes.length === 0 ? (
          <div className="text-center py-20 text-slate-500 space-y-3">
            <p>Nenhum cliente encontrado com os filtros atuais.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-400 rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar todos os filtros</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left bg-slate-950/60 select-none">
                  {/* Coluna Cliente (com ordenação interativa) */}
                  <th
                    onClick={() => handleSortClick('cliente')}
                    className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    title="Clique para ordenar por nome"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Cliente</span>
                      {sort === 'nome_asc' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                      ) : sort === 'nome_desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>

                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Placa
                  </th>

                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Veículo
                  </th>

                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Lojas
                  </th>

                  {/* Coluna Compras (com ordenação interativa) */}
                  <th
                    onClick={() => handleSortClick('compras')}
                    className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                    title="Clique para ordenar por quantidade de compras/OS"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Compras</span>
                      {sort === 'qtd_compras_desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Total Gasto (com ordenação interativa) */}
                  <th
                    onClick={() => handleSortClick('total_gasto')}
                    className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-white transition-colors"
                    title="Clique para ordenar por maior total gasto"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Gasto</span>
                      {sort === 'total_gasto_desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Última Compra (com ordenação interativa) */}
                  <th
                    onClick={() => handleSortClick('ultima_compra')}
                    className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    title="Clique para ordenar por data da última compra"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Última Compra</span>
                      {sort === 'ultima_compra_desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>

                  <th className="px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">
                    Ações
                  </th>
                </tr>

                {/* ── LINHA DE PESQUISA POR COLUNA NA TABELA ── */}
                {showColFilters && (
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-xs">
                    {/* Pesquisa por Cliente */}
                    <th className="px-3 py-2 font-normal">
                      <div className="relative">
                        <input
                          value={colCliente}
                          onChange={e => setColCliente(e.target.value)}
                          placeholder="Filtrar por nome/doc/tel..."
                          className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        {colCliente && (
                          <button
                            type="button"
                            onClick={() => { setColCliente(''); setDebouncedColCliente(''); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            title="Limpar campo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>

                    {/* Pesquisa por Placa */}
                    <th className="px-3 py-2 font-normal">
                      <div className="relative">
                        <input
                          value={colPlaca}
                          onChange={e => setColPlaca(e.target.value)}
                          placeholder="Placa..."
                          className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 placeholder-slate-500 uppercase focus:outline-none focus:border-blue-500"
                        />
                        {colPlaca && (
                          <button
                            type="button"
                            onClick={() => { setColPlaca(''); setDebouncedColPlaca(''); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            title="Limpar campo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>

                    {/* Pesquisa por Veículo */}
                    <th className="px-3 py-2 font-normal">
                      <div className="relative">
                        <input
                          value={colVeiculo}
                          onChange={e => setColVeiculo(e.target.value)}
                          placeholder="Modelo..."
                          className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        {colVeiculo && (
                          <button
                            type="button"
                            onClick={() => { setColVeiculo(''); setDebouncedColVeiculo(''); }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            title="Limpar campo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>

                    {/* Pesquisa por Loja */}
                    <th className="px-3 py-2 font-normal">
                      <select
                        value={selectedLoja === 'todos' ? '' : selectedLoja}
                        onChange={e => handleLojaChange(e.target.value || (isOwner ? 'todos' : ''))}
                        className="w-full bg-slate-800/90 border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">{isOwner ? 'Todas as Lojas' : 'Todas'}</option>
                        {listaLojas.map(l => (
                          <option key={l.id} value={String(l.id)}>
                            {l.nome}
                          </option>
                        ))}
                      </select>
                    </th>

                    {/* Compras (Vazio na linha de filtro) */}
                    <th className="px-3 py-2 text-right text-slate-600 font-normal">—</th>

                    {/* Total Gasto (Vazio na linha de filtro) */}
                    <th className="px-3 py-2 text-right text-slate-600 font-normal">—</th>

                    {/* Última Compra (Vazio na linha de filtro) */}
                    <th className="px-3 py-2 text-slate-600 font-normal">—</th>

                    {/* Ações: Limpar filtros de coluna */}
                    <th className="px-3 py-2 text-center font-normal">
                      {(colCliente || colPlaca || colVeiculo || (selectedLoja && selectedLoja !== 'todos')) && (
                        <button
                          type="button"
                          onClick={() => {
                            setColCliente('')
                            setDebouncedColCliente('')
                            setColPlaca('')
                            setDebouncedColPlaca('')
                            setColVeiculo('')
                            setDebouncedColVeiculo('')
                            handleLojaChange(isOwner ? 'todos' : '')
                          }}
                          title="Limpar filtros específicos de colunas"
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800 transition-colors inline-flex items-center gap-1 text-[11px]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Limpar</span>
                        </button>
                      )}
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {clientes.map(c => {
                  const phoneDigits = (c.telefone || c.celular || '').replace(/\D/g, '')
                  const hasWa = phoneDigits.length >= 10
                  const isInactive = c.inativo === 1

                  return (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/erp/clientes/${c.id}`)}
                      className={`hover:bg-slate-800/70 cursor-pointer transition-colors group ${
                        isInactive ? 'opacity-60 bg-red-950/10' : ''
                      }`}
                    >
                      {/* Cliente info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                            {c.nome}
                          </p>
                          {isInactive && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50">
                              Inativo
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-400">
                          {c.telefone && (
                            <span className="flex items-center gap-1 text-slate-300">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {c.telefone}
                              {hasWa && (
                                <a
                                  href={`https://wa.me/55${phoneDigits}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title="Abrir no WhatsApp"
                                  className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded hover:bg-emerald-950/50 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </span>
                          )}
                          {c.cpf_cnpj && (
                            <span className="font-mono text-[11px] text-slate-500">
                              CPF/CNPJ: {c.cpf_cnpj}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Placa */}
                      <td className="px-4 py-3">
                        <PlaceBadge plate={c.placa} />
                      </td>

                      {/* Veículo */}
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {c.modelo || <span className="text-slate-600">—</span>}
                      </td>

                      {/* Lojas */}
                      <td className="px-4 py-3">
                        <LojasBadge lojas={c.lojas} activeLojaName={activeLojaNome} />
                      </td>

                      {/* Compras */}
                      <td className="px-4 py-3 text-right text-slate-300 font-medium">
                        {c.qtd_compras}
                      </td>

                      {/* Total gasto */}
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                        {currency(c.total_gasto)}
                      </td>

                      {/* Última compra */}
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {formatDate(c.ultima_compra)}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/erp/clientes/${c.id}`)}
                            title="Ver histórico e Ordens de Serviço"
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-600/15 rounded-lg transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(c)}
                            title="Editar Dados do Cliente"
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-600/15 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={e => handleToggleStatus(c, e)}
                            title={isInactive ? 'Reativar Cliente' : 'Inativar Cliente'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isInactive
                                ? 'text-red-400 hover:text-emerald-400 hover:bg-emerald-600/15'
                                : 'text-slate-400 hover:text-amber-400 hover:bg-amber-600/15'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            title="Excluir Cliente"
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-600/15 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Página {page} de {pages} ({total} clientes)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Cliente */}
      <ClienteModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        clienteId={editingId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['erp-clientes'] })
          refetch()
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Excluir Cliente</h3>
                <p className="text-xs text-slate-400">Confirmação de segurança</p>
              </div>
            </div>

            <p className="text-sm text-slate-300">
              Deseja realmente remover o cliente{' '}
              <strong className="text-white font-semibold">{deleteTarget.nome}</strong>?
            </p>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Nota de Integridade:</p>
              <p>
                Se o cliente possuir histórico de compras ou ordens de serviço vinculadas, o sistema o{' '}
                <strong className="text-amber-400">inativará</strong> automaticamente para proteger os relatórios de fechamento de caixa e faturamento.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-red-600/30 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Excluindo…
                  </>
                ) : (
                  <>Confirmar Exclusão</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
