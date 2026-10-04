import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi, adminApi } from '../lib/api'
import type { KardexMovimentacao, KardexTipo, KardexOrigem, ProdutoEstoque } from '../types'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import {
  History,
  TrendingUp,
  TrendingDown,
  Boxes,
  DollarSign,
  Search,
  Printer,
  Download,
  RefreshCw,
  BarChart3,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Calendar,
  Layers,
  FileText,
  Plus,
  Wrench,
  ShoppingCart,
  User,
  X,
  AlertCircle,
  Tag,
  Info,
} from 'lucide-react'

const R = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const N = (v: number) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const PERIODOS_RAPIDOS = [
  { dias: 7,   label: '7 dias' },
  { dias: 15,  label: '15 dias' },
  { dias: 30,  label: '30 dias (Padrão)' },
  { dias: 60,  label: '60 dias' },
  { dias: 90,  label: '90 dias' },
  { dias: 180, label: '6 meses' },
  { dias: 365, label: '1 ano' },
]

export default function KardexEstoque() {
  const qc = useQueryClient()
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Filtros
  const [periodoDias, setPeriodoDias] = useState<number>(30)
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false)

  const [tipoFiltro, setTipoFiltro] = useState<string>('todos')
  const [origemFiltro, setOrigemFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState<string>('')
  const [produtoIdFiltro, setProdutoIdFiltro] = useState<number | null>(null)

  // Paginação
  const [pagina, setPagina] = useState<number>(1)
  const [itensPorPagina, setItensPorPagina] = useState<number>(50)

  // Modal de Nova Movimentação Manual
  const [modalNovaMovimentacao, setModalNovaMovimentacao] = useState<boolean>(false)
  const [modalProdId, setModalProdId] = useState<string>('')
  const [modalTipo, setModalTipo] = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
  const [modalQtd, setModalQtd] = useState<string>('')
  const [modalMotivo, setModalMotivo] = useState<string>('')
  const [modalDoc, setModalDoc] = useState<string>('')
  const [modalErro, setModalErro] = useState<string>('')

  // Busca lista de produtos do estoque para autocomplete e modal
  const { data: produtosEstoqueRes } = useQuery({
    queryKey: ['estoque-produtos-select', tid],
    queryFn: () => erpApi.estoque({ search: '', filtro: '', page: 1 }),
    staleTime: 5 * 60_000,
  })
  const produtosLista: ProdutoEstoque[] = produtosEstoqueRes?.data || []

  // Query Principal do Kardex
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'kardex-estoque',
      tid,
      isCustomDate ? `${dataInicio}_${dataFim}` : periodoDias,
      tipoFiltro,
      origemFiltro,
      produtoIdFiltro,
      busca,
      pagina,
      itensPorPagina,
    ],
    queryFn: () =>
      erpApi.kardexEstoque({
        dias: isCustomDate ? undefined : periodoDias,
        data_inicio: isCustomDate ? dataInicio : undefined,
        data_fim: isCustomDate ? dataFim : undefined,
        tipo: tipoFiltro !== 'todos' ? tipoFiltro : undefined,
        origem: origemFiltro !== 'todos' ? origemFiltro : undefined,
        produto_id: produtoIdFiltro || undefined,
        search: busca || undefined,
        page: pagina,
        limit: itensPorPagina,
      }),
    staleTime: 30_000,
  })

  const resumo = data?.resumo
  const produtoDetalhe = data?.produto
  const movimentacoes = data?.movimentacoes || []
  const totalRegistros = data?.total_registros || 0
  const totalPaginas = data?.total_paginas || 1

  // Mutação para registrar movimentação manual
  const mutMovimentacao = useMutation({
    mutationFn: () => {
      const pid = Number(modalProdId)
      const qtd = Number(modalQtd)
      if (!pid || isNaN(pid)) throw new Error('Selecione uma peça válida.')
      if (isNaN(qtd) || qtd <= 0) throw new Error('Informe uma quantidade maior que zero.')

      return erpApi.registrarMovimentacaoEstoque({
        produto_id: pid,
        tipo: modalTipo,
        quantidade: qtd,
        motivo: modalMotivo.trim() || undefined,
        documento_ref: modalDoc.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kardex-estoque'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['valorizacao-estoque'] })
      qc.invalidateQueries({ queryKey: ['curva-abc'] })
      setModalNovaMovimentacao(false)
      setModalProdId('')
      setModalQtd('')
      setModalMotivo('')
      setModalDoc('')
      setModalErro('')
    },
    onError: (err: any) => {
      setModalErro(err?.message || 'Falha ao registrar movimentação no estoque.')
    },
  })

  const handlePrint = () => {
    window.print()
  }

  // Exportação CSV
  const handleExportCsv = () => {
    if (!movimentacoes.length) return

    const headers = [
      'Data/Hora',
      'Código',
      'Produto',
      'Unidade',
      'Tipo',
      'Origem',
      'Quantidade',
      'Saldo Anterior',
      'Saldo Posterior',
      'Documento / Ref',
      'Motivo / Justificativa',
      'Responsável',
      'Valor Unitário (R$)',
      'Valor Total (R$)',
    ]

    const rows = movimentacoes.map((m) => [
      `"${new Date(m.data_hora).toLocaleString('pt-BR')}"`,
      `"${m.cod_barra || ''}"`,
      `"${m.nome_produto.replace(/"/g, '""')}"`,
      `"${m.unidade}"`,
      `"${m.tipo.toUpperCase()}"`,
      `"${m.origem}"`,
      m.quantidade,
      m.saldo_anterior,
      m.saldo_posterior,
      `"${(m.documento_ref || '').replace(/"/g, '""')}"`,
      `"${(m.motivo || '').replace(/"/g, '""')}"`,
      `"${(m.responsavel || '').replace(/"/g, '""')}"`,
      m.vr_unitario.toFixed(2),
      m.vr_total.toFixed(2),
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `kardex_estoque_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:max-w-none">
      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:border-none print:pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-600 rounded-xl text-white shadow-lg shadow-blue-600/20">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Kardex de Estoque & Rastreabilidade
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Extrato Completo
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Histórico detalhado de entradas, saídas por Ordem de Serviço, vendas e auditoria de inventário com saldo passo a passo
              </p>
            </div>
          </div>
        </div>

        {/* Links de navegação entre os relatórios do Estoque */}
        <div className="flex items-center flex-wrap gap-2 self-start md:self-auto print:hidden">
          <Link
            to="/erp/estoque/valorizacao"
            className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Valorização</span>
          </Link>
          <Link
            to="/erp/estoque/curva-abc"
            className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Curva ABC</span>
          </Link>
          <Link
            to="/erp/estoque/sugestao-compras"
            className="px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <ShoppingBag className="w-4 h-4 text-blue-400" />
            <span>Sugestão Compras</span>
          </Link>
          <Link
            to="/erp/estoque"
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Boxes className="w-4 h-4 text-slate-400" />
            <span>Estoque</span>
          </Link>

          <button
            onClick={() => {
              setModalProdId(produtoIdFiltro ? String(produtoIdFiltro) : '')
              setModalTipo('entrada')
              setModalQtd('')
              setModalMotivo('')
              setModalDoc('')
              setModalErro('')
              setModalNovaMovimentacao(true)
            }}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Movimentação</span>
          </button>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!movimentacoes.length}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
            title="Exportar CSV"
          >
            <Download className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={handlePrint}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            title="Imprimir Extrato"
          >
            <Printer className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* ── CARDS EXECUTIVOS DE KPI ── */}
      {resumo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 print:grid-cols-5 print:gap-2">
          {/* 1. Total Movimentações */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Total de Eventos
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <History className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-white mt-1.5 tracking-tight">
              {resumo.total_movimentacoes}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {resumo.produtos_distintos_movimentados} peças distintas
            </p>
          </div>

          {/* 2. Total Entradas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                Entradas / Reposições
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-emerald-400 mt-1.5 tracking-tight">
              +{N(resumo.total_entradas_qtd)} un
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Compras e ajustes positivos
            </p>
          </div>

          {/* 3. Total Saídas (OS + Vendas) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-400" />
                Saídas (OS & Balcão)
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-rose-400 mt-1.5 tracking-tight">
              -{N(resumo.total_saidas_qtd)} un
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Valor Total: <strong className="text-white">{R(resumo.valor_total_saidas)}</strong>
            </p>
          </div>

          {/* 4. Ajustes de Inventário */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <Scale className="w-3 h-3 text-amber-400" />
                Ajustes / Inventário
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-amber-300 mt-1.5 tracking-tight">
              {resumo.total_ajustes_qtd} ocorrências
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Acertos físicos de saldo
            </p>
          </div>

          {/* 5. Saldo Líquido no Período */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-slate-800 rounded-2xl p-3.5 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Fluxo Líquido
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center">
                <Boxes className="w-3.5 h-3.5" />
              </div>
            </div>
            <p
              className={`text-xl font-bold mt-1.5 tracking-tight ${
                resumo.saldo_liquido_periodo >= 0 ? 'text-emerald-300' : 'text-rose-400'
              }`}
            >
              {resumo.saldo_liquido_periodo >= 0 ? '+' : ''}
              {N(resumo.saldo_liquido_periodo)} un
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {resumo.saldo_liquido_periodo >= 0 ? 'Estoque em crescimento' : 'Estoque em redução'}
            </p>
          </div>
        </div>
      )}

      {/* ── CARD DE PRODUTO SELECIONADO (QUANDO FILTRADO POR UMA PEÇA ESPECÍFICA) ── */}
      {produtoDetalhe && (
        <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-800/40 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {produtoDetalhe.nome_produto}
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {produtoDetalhe.tipo_nome}
                </span>
                {produtoDetalhe.cod_barra && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Cód: {produtoDetalhe.cod_barra}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Exibindo extrato cronológico exclusivo desta peça
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-4 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Saldo Atual</span>
              <strong className="text-base font-bold text-white font-mono">
                {N(produtoDetalhe.saldo_atual)} {produtoDetalhe.unidade}
              </strong>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Estoque Mínimo</span>
              <span className="text-slate-200 font-semibold font-mono">
                {N(produtoDetalhe.min_estoque)} {produtoDetalhe.unidade}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Preço Custo / Venda</span>
              <span className="text-slate-200 font-semibold">
                {R(produtoDetalhe.vr_compra)} / <strong className="text-emerald-400">{R(produtoDetalhe.vr_venda)}</strong>
              </span>
            </div>

            <button
              onClick={() => setProdutoIdFiltro(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Limpar filtro de produto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── BARRA DE FILTROS AVANÇADOS ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Período Rápido */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              Período:
            </span>
            {PERIODOS_RAPIDOS.map((p) => (
              <button
                key={p.dias}
                onClick={() => {
                  setIsCustomDate(false)
                  setPeriodoDias(p.dias)
                  setPagina(1)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  !isCustomDate && periodoDias === p.dias
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setIsCustomDate(!isCustomDate)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                isCustomDate
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              Customizado
            </button>
          </div>

          {/* Seletor de Período Customizado */}
          {isCustomDate && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  setPagina(1)
                }}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-500">até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value)
                  setPagina(1)
                }}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Linha secundária de filtros: Tipo, Origem, Filtro de Produto e Busca */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por peça, código, OS, placa ou motivo…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
            />
          </div>

          {/* Filtro por Produto Específico */}
          <div>
            <select
              value={produtoIdFiltro ?? ''}
              onChange={(e) => {
                setProdutoIdFiltro(e.target.value ? Number(e.target.value) : null)
                setPagina(1)
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">🔧 Todas as Peças do Estoque</option>
              {produtosLista.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome_produto} {p.cod_barra ? `[${p.cod_barra}]` : ''} • Saldo: {p.estoque} {p.unidade}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Tipo */}
          <div>
            <select
              value={tipoFiltro}
              onChange={(e) => {
                setTipoFiltro(e.target.value)
                setPagina(1)
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">⚡ Todos os Tipos de Movimento</option>
              <option value="entrada">📥 Apenas Entradas (+)</option>
              <option value="saida">📤 Apenas Saídas (-)</option>
              <option value="ajuste">⚖️ Apenas Ajustes de Inventário</option>
            </select>
          </div>

          {/* Filtro por Origem */}
          <div>
            <select
              value={origemFiltro}
              onChange={(e) => {
                setOrigemFiltro(e.target.value)
                setPagina(1)
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">🏢 Todas as Origens</option>
              <option value="ordem_servico">🚗 Aplicação em Ordem de Serviço</option>
              <option value="pdv_venda">🛒 Venda Balcão / PDV</option>
              <option value="ajuste_manual">✍️ Ajuste Manual / Inventário</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── TABELA PRINCIPAL DO KARDEX ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Data / Hora</th>
                <th className="px-4 py-3.5">Tipo / Origem</th>
                <th className="px-4 py-3.5">Peça / Produto</th>
                <th className="px-4 py-3.5">Documento / Vínculo</th>
                <th className="px-4 py-3.5 text-right">Qtd Movimentada</th>
                <th className="px-4 py-3.5 text-right">Saldo Anterior ➔ Atual</th>
                <th className="px-4 py-3.5">Motivo / Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-2" />
                    Carregando extrato de movimentações…
                  </td>
                </tr>
              ) : !movimentacoes.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Nenhuma movimentação de estoque localizada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                movimentacoes.map((m) => {
                  const isEntrada = m.tipo === 'entrada'
                  const isSaida = m.tipo === 'saida'
                  const isAjuste = m.tipo === 'ajuste'

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-800/50 transition-colors group font-normal"
                    >
                      {/* Data / Hora */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-300">
                        {new Date(m.data_hora).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Tipo / Origem */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {isEntrada && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                              Entrada
                            </span>
                          )}
                          {isSaida && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80">
                              <ArrowUpRight className="w-3 h-3 text-rose-400" />
                              Saída
                            </span>
                          )}
                          {isAjuste && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                              <Scale className="w-3 h-3 text-amber-400" />
                              Ajuste
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400 capitalize">
                            {m.origem === 'ordem_servico'
                              ? 'Ordem de Serviço'
                              : m.origem === 'pdv_venda'
                              ? 'Venda Balcão'
                              : 'Ajuste Manual'}
                          </span>
                        </div>
                      </td>

                      {/* Peça / Produto */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white group-hover:text-blue-300 transition-colors">
                          {m.nome_produto}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          {m.cod_barra && <span>Cód: {m.cod_barra}</span>}
                          <span>Un: {m.unidade}</span>
                        </div>
                      </td>

                      {/* Documento / Vínculo */}
                      <td className="px-4 py-3.5">
                        {m.documento_ref ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 border border-slate-700/80 text-xs font-semibold">
                            {m.origem === 'ordem_servico' && <Wrench className="w-3 h-3 text-blue-400 shrink-0" />}
                            {m.origem === 'pdv_venda' && <ShoppingCart className="w-3 h-3 text-purple-400 shrink-0" />}
                            {m.origem === 'ajuste_manual' && <FileText className="w-3 h-3 text-slate-400 shrink-0" />}
                            <span>{m.documento_ref}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Sem documento</span>
                        )}
                      </td>

                      {/* Quantidade Movimentada */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-bold ${
                            m.quantidade > 0
                              ? 'text-emerald-400'
                              : m.quantidade < 0
                              ? 'text-rose-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {m.quantidade > 0 ? '+' : ''}
                          {N(m.quantidade)} {m.unidade}
                        </span>
                        {m.vr_total > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {R(m.vr_total)}
                          </div>
                        )}
                      </td>

                      {/* Saldo Anterior ➔ Atual */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {m.saldo_anterior !== 0 || m.saldo_posterior !== 0 ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                            <span className="text-slate-400">{N(m.saldo_anterior)}</span>
                            <span className="text-slate-500">➔</span>
                            <span className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                              {N(m.saldo_posterior)} {m.unidade}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Motivo / Responsável */}
                      <td className="px-4 py-3.5">
                        <div className="text-slate-300 max-w-xs truncate" title={m.motivo || ''}>
                          {m.motivo || 'Movimentação padrão de estoque'}
                        </div>
                        {m.responsavel && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                            <User className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                            <span>
                              <strong className="text-slate-300 font-medium">
                                {m.origem === 'ordem_servico' && 'Técnico: '}
                                {m.origem === 'pdv_venda' && 'Vendedor: '}
                                {m.origem === 'ajuste_manual' && 'Usuário: '}
                              </strong>
                              {m.responsavel}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINAÇÃO ── */}
        {totalPaginas > 1 && (
          <div className="bg-slate-950/60 border-t border-slate-800 px-4 py-3 flex items-center justify-between gap-4 text-xs text-slate-400 print:hidden">
            <div>
              Mostrando <strong className="text-white">{movimentacoes.length}</strong> de{' '}
              <strong className="text-white">{totalRegistros}</strong> registros encontrados
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina(1)}
                disabled={pagina === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                title="Primeira página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 text-slate-300 font-semibold">
                Página {pagina} de {totalPaginas}
              </span>

              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={pagina === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                title="Última página"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL DE NOVA MOVIMENTAÇÃO MANUAL ── */}
      {modalNovaMovimentacao && (
        <Modal
          title="Registrar Movimentação Manual no Estoque"
          onClose={() => setModalNovaMovimentacao(false)}
        >
          <div className="space-y-4">
            {modalErro && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{modalErro}</span>
              </div>
            )}

            {/* Seleção do Produto */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Peça / Produto *
              </label>
              <select
                value={modalProdId}
                onChange={(e) => setModalProdId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione o produto a movimentar…</option>
                {produtosLista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome_produto} {p.cod_barra ? `[${p.cod_barra}]` : ''} • Saldo Atual: {p.estoque} {p.unidade}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Operação */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tipo de Operação *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setModalTipo('entrada')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    modalTipo === 'entrada'
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Entrada (+)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTipo('saida')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    modalTipo === 'saida'
                      ? 'bg-rose-600 border-rose-500 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Saída (-)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalTipo('ajuste')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    modalTipo === 'ajuste'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Inventário (=)</span>
                </button>
              </div>
            </div>

            {/* Quantidade */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {modalTipo === 'ajuste' ? 'Novo Saldo Real Contado *' : 'Quantidade a Movimentar *'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ex: 10"
                value={modalQtd}
                onChange={(e) => setModalQtd(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Documento / Referência */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Documento / Referência (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: NF 1284, Pedido Fornecedor, OS Avulsa..."
                value={modalDoc}
                onChange={(e) => setModalDoc(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Motivo / Justificativa */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Motivo / Justificativa (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Compra de reposição, avaria, quebra, conferência de inventário semanal..."
                value={modalMotivo}
                onChange={(e) => setModalMotivo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalNovaMovimentacao(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => mutMovimentacao.mutate()}
                disabled={mutMovimentacao.isPending || !modalProdId || !modalQtd}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-600/25"
              >
                {mutMovimentacao.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gravando…</span>
                  </>
                ) : (
                  <span>Confirmar Movimentação</span>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
