import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { ValorizacaoProduto, ValorizacaoCategoria } from '../types'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import {
  DollarSign,
  TrendingUp,
  Package,
  Boxes,
  AlertTriangle,
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
  ShieldCheck,
  AlertOctagon,
  Percent,
  Layers,
  ArrowUpDown,
  Tag,
  Info,
  ShoppingBag,
} from 'lucide-react'

const R = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const N = (v: number) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

type TipoAjuste = 'entrada' | 'saida' | 'ajuste'
const TIPOS_AJUSTE: { value: TipoAjuste; label: string; desc: string; cor: string }[] = [
  { value: 'entrada', label: 'Entrada',            desc: 'Adiciona ao estoque físico', cor: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'saida',   label: 'Saída',              desc: 'Subtrai do estoque físico',  cor: 'bg-rose-600 hover:bg-rose-500' },
  { value: 'ajuste',  label: 'Ajuste (Inventário)',desc: 'Sobrescreve o saldo exato',  cor: 'bg-blue-600 hover:bg-blue-500' },
]

export default function ValorizacaoEstoque() {
  const qc = useQueryClient()
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Filtros
  const [apenasProdutos, setApenasProdutos] = useState<boolean>(true)
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState<string>('')
  const [sort, setSort] = useState<string>('custo_total_desc')

  // Paginação
  const [pagina, setPagina] = useState<number>(1)
  const [itensPorPagina, setItensPorPagina] = useState<number>(50)

  // Modal de Ajuste Rápido
  const [modalProduto, setModalProduto] = useState<ValorizacaoProduto | null>(null)
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjuste>('entrada')
  const [quantidadeAjuste, setQuantidadeAjuste] = useState<string>('')

  // Query de Valorização do Estoque
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['valorizacao-estoque', tid, apenasProdutos],
    queryFn: () => erpApi.valorizacaoEstoque({ apenas_produtos: apenasProdutos ? '1' : '0' }),
    staleTime: 60_000,
  })

  const resumo = data?.resumo
  const categorias = data?.categorias || []

  // Mutação para Ajuste Rápido
  const mutAjuste = useMutation({
    mutationFn: () => {
      if (!modalProduto) throw new Error('Produto inválido')
      return erpApi.ajustarEstoque(modalProduto.id, tipoAjuste, Number(quantidadeAjuste))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['valorizacao-estoque'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['curva-abc'] })
      setModalProduto(null)
      setQuantidadeAjuste('')
    },
  })

  // Filtros e Ordenação locais ultra-rápidos
  const produtosFiltrados = useMemo(() => {
    let list = data?.produtos || []

    // Filtro por status
    if (statusFiltro === 'normal') {
      list = list.filter(p => p.status_estoque === 'normal')
    } else if (statusFiltro === 'baixo') {
      list = list.filter(p => p.status_estoque === 'baixo')
    } else if (statusFiltro === 'zerado') {
      list = list.filter(p => p.status_estoque === 'zerado')
    } else if (statusFiltro === 'negativo') {
      list = list.filter(p => p.status_estoque === 'negativo')
    } else if (statusFiltro === 'com_saldo') {
      list = list.filter(p => p.estoque > 0)
    } else if (statusFiltro === 'sem_custo') {
      list = list.filter(p => p.alerta_sem_custo)
    }

    // Filtro por categoria
    if (categoriaFiltro !== 'todos') {
      const catId = Number(categoriaFiltro)
      list = list.filter(p => (p.id_tipo || 0) === catId)
    }

    // Filtro por busca textual
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      list = list.filter(
        p =>
          p.nome_produto.toLowerCase().includes(q) ||
          (p.cod_barra && p.cod_barra.toLowerCase().includes(q)) ||
          p.tipo_nome.toLowerCase().includes(q)
      )
    }

    // Ordenação
    const sorted = [...list]
    if (sort === 'custo_total_desc') {
      sorted.sort((a, b) => b.valor_custo_total - a.valor_custo_total)
    } else if (sort === 'venda_total_desc') {
      sorted.sort((a, b) => b.valor_venda_total - a.valor_venda_total)
    } else if (sort === 'lucro_desc') {
      sorted.sort((a, b) => b.lucro_projetado - a.lucro_projetado)
    } else if (sort === 'margem_desc') {
      sorted.sort((a, b) => b.margem_pct - a.margem_pct)
    } else if (sort === 'estoque_desc') {
      sorted.sort((a, b) => b.estoque - a.estoque)
    } else if (sort === 'estoque_asc') {
      sorted.sort((a, b) => a.estoque - b.estoque)
    } else if (sort === 'nome_asc') {
      sorted.sort((a, b) => a.nome_produto.localeCompare(b.nome_produto))
    }

    return sorted
  }, [data?.produtos, statusFiltro, categoriaFiltro, busca, sort])

  // Paginação
  const totalItens = produtosFiltrados.length
  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas)
  const itensExibidos = useMemo(() => {
    const inicio = (paginaValida - 1) * itensPorPagina
    return produtosFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [produtosFiltrados, paginaValida, itensPorPagina])

  // Subtotais da listagem filtrada
  const subtotais = useMemo(() => {
    let unidades = 0
    let custo = 0
    let venda = 0
    for (const p of produtosFiltrados) {
      if (p.estoque > 0) {
        unidades += p.estoque
        custo += p.valor_custo_total
        venda += p.valor_venda_total
      }
    }
    const lucro = venda - custo
    const margem = venda > 0 ? (lucro / venda) * 100 : 0
    return { unidades, custo, venda, lucro, margem }
  }, [produtosFiltrados])

  // Exportar CSV
  function exportarCsv() {
    if (produtosFiltrados.length === 0) return

    const cabecalho = [
      'ID',
      'Código de Barras',
      'Produto',
      'Categoria',
      'Unidade',
      'Estoque Físico',
      'Mínimo',
      'Custo Unitário (R$)',
      'Venda Unitária (R$)',
      'Custo Total (R$)',
      'Venda Total (R$)',
      'Lucro Projetado (R$)',
      'Margem (%)',
      'Markup (%)',
      'Status',
    ]

    const linhas = produtosFiltrados.map(p => [
      p.id,
      `"${p.cod_barra || ''}"`,
      `"${p.nome_produto.replace(/"/g, '""')}"`,
      `"${p.tipo_nome}"`,
      p.unidade,
      p.estoque,
      p.min_estoque,
      p.vr_custo.toFixed(2),
      p.vr_venda.toFixed(2),
      p.valor_custo_total.toFixed(2),
      p.valor_venda_total.toFixed(2),
      p.lucro_projetado.toFixed(2),
      p.margem_pct.toFixed(1),
      p.markup_pct.toFixed(1),
      p.status_estoque,
    ])

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const lojaNome = (currentTenant?.nome || 'loja').replace(/\s+/g, '_').toLowerCase()
    const dataIso = new Date().toISOString().split('T')[0]
    link.setAttribute('href', url)
    link.setAttribute('download', `valorizacao_estoque_${lojaNome}_${dataIso}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:m-0 print:max-w-none">
      {/* ── TOPO / CABEÇALHO ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:border-b-2 print:border-black print:pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                <span>Valorização de Estoque</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {currentTenant?.nome || 'Loja Principal'}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Inventário físico e financeiro: capital imobilizado a custo, projeção de venda e lucratividade.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={exportarCsv}
            disabled={isLoading || totalItens === 0}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Imprimir / PDF</span>
          </button>

          <Link
            to="/erp/estoque/sugestao-compras"
            className="px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <ShoppingBag className="w-4 h-4 text-blue-400" />
            <span>Sugestão de Compras</span>
          </Link>

          <Link
            to="/erp/estoque/curva-abc"
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Curva ABC & Giro</span>
          </Link>

          <Link
            to="/erp/estoque"
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Boxes className="w-4 h-4" />
            <span>Controle de Estoque</span>
          </Link>
        </div>
      </div>

      {/* ── HERO KPI CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Capital Imobilizado a Custo */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Capital Imobilizado</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : R(resumo?.valor_total_custo || 0)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Preço de compra</span>
            <span className="text-slate-300 font-medium">
              {N(resumo?.total_unidades_fisicas || 0)} peças físicas
            </span>
          </div>
        </div>

        {/* Card 2: Potencial de Venda */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Potencial de Venda</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : R(resumo?.valor_total_venda || 0)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Faturamento projetado</span>
            <span className="text-slate-300 font-medium">
              {resumo?.total_itens_com_saldo || 0} itens c/ saldo
            </span>
          </div>
        </div>

        {/* Card 3: Lucro Bruto Projetado */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Lucro Bruto Projetado</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : R(resumo?.lucro_bruto_projetado || 0)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs border-t border-slate-800/80 pt-2">
            <span className="text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              Margem: {resumo?.margem_lucro_pct || 0}%
            </span>
            <span className="text-purple-300 font-semibold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
              Markup: {resumo?.markup_medio_pct || 0}%
            </span>
          </div>
        </div>

        {/* Card 4: Saúde & Diagnóstico do Estoque */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Saúde do Estoque</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          {/* Barra de Progresso Visual de Status */}
          <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex my-2">
            <div
              style={{
                width: `${
                  resumo?.total_produtos_catalogo
                    ? ((resumo.qtd_normal || 0) / resumo.total_produtos_catalogo) * 100
                    : 0
                }%`,
              }}
              className="bg-emerald-500 transition-all"
              title={`Saudáveis: ${resumo?.qtd_normal || 0}`}
            />
            <div
              style={{
                width: `${
                  resumo?.total_produtos_catalogo
                    ? ((resumo.qtd_baixo || 0) / resumo.total_produtos_catalogo) * 100
                    : 0
                }%`,
              }}
              className="bg-amber-500 transition-all"
              title={`Abaixo do mínimo: ${resumo?.qtd_baixo || 0}`}
            />
            <div
              style={{
                width: `${
                  resumo?.total_produtos_catalogo
                    ? ((resumo.qtd_zerados || 0) / resumo.total_produtos_catalogo) * 100
                    : 0
                }%`,
              }}
              className="bg-rose-500 transition-all"
              title={`Zerados: ${resumo?.qtd_zerados || 0}`}
            />
            <div
              style={{
                width: `${
                  resumo?.total_produtos_catalogo
                    ? ((resumo.qtd_negativo || 0) / resumo.total_produtos_catalogo) * 100
                    : 0
                }%`,
              }}
              className="bg-purple-500 transition-all"
              title={`Negativos: ${resumo?.qtd_negativo || 0}`}
            />
          </div>

          {/* Indicadores clicáveis de status rápido */}
          <div className="flex items-center justify-between text-[11px] pt-1 gap-1 flex-wrap">
            <button
              onClick={() => {
                setStatusFiltro('normal')
                setPagina(1)
              }}
              className="text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {resumo?.qtd_normal || 0} ok
            </button>
            <button
              onClick={() => {
                setStatusFiltro('baixo')
                setPagina(1)
              }}
              className="text-amber-400 hover:underline flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              {resumo?.qtd_baixo || 0} baixo
            </button>
            <button
              onClick={() => {
                setStatusFiltro('zerado')
                setPagina(1)
              }}
              className="text-rose-400 hover:underline flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
              {resumo?.qtd_zerados || 0} zerado
            </button>
            {Boolean(resumo?.qtd_negativo) && (
              <button
                onClick={() => {
                  setStatusFiltro('negativo')
                  setPagina(1)
                }}
                className="text-purple-400 hover:underline font-bold flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                {resumo?.qtd_negativo} negativo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Alerta de Auditoria: Produtos em estoque sem custo cadastrado */}
      {Boolean(resumo?.qtd_sem_custo && resumo.qtd_sem_custo > 0) && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>
              <strong>Atenção contábil:</strong> Existem{' '}
              <strong className="text-amber-300 font-bold">{resumo?.qtd_sem_custo} produtos</strong> com
              saldo físico em estoque porém com <strong>custo R$ 0,00</strong>. Cadastre o preço de
              compra para não subestimar o capital imobilizado.
            </span>
          </div>
          <button
            onClick={() => {
              setStatusFiltro('sem_custo')
              setPagina(1)
            }}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shrink-0 transition-colors"
          >
            Filtrar estes produtos
          </button>
        </div>
      )}

      {/* ── DISTRIBUIÇÃO POR CATEGORIAS / FAMÍLIAS DE PEÇAS ────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Distribuição do Capital por Família de Peças
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {categorias.length} categorias cadastradas (clique para filtrar)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categorias.slice(0, 8).map(c => {
            const isSelected = categoriaFiltro === String(c.id_tipo)
            return (
              <button
                key={c.id_tipo}
                onClick={() => {
                  setCategoriaFiltro(isSelected ? 'todos' : String(c.id_tipo))
                  setPagina(1)
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-900/20'
                    : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-200 truncate pr-2">{c.nome_tipo}</span>
                  <span className="text-emerald-400 font-bold shrink-0">{c.share_custo_pct}%</span>
                </div>

                {/* Mini progress bar de share */}
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div
                    style={{ width: `${Math.min(100, c.share_custo_pct)}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Custo: <strong className="text-slate-200">{R(c.valor_custo)}</strong></span>
                  <span>{N(c.total_unidades)} un.</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 border-t border-slate-800 pt-1">
                  <span>Venda: {R(c.valor_venda)}</span>
                  <span className="text-purple-400 font-medium">Margem: {c.margem_pct}%</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── BARRA DE FERRAMENTAS / FILTROS ─────────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 print:hidden shadow-sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Busca por texto */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder="Buscar por descrição da peça ou código de barras…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Filtro de Categoria */}
          <div className="w-full md:w-56 shrink-0">
            <select
              value={categoriaFiltro}
              onChange={e => {
                setCategoriaFiltro(e.target.value)
                setPagina(1)
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="todos">Todas as Categorias</option>
              {categorias.map(c => (
                <option key={c.id_tipo} value={c.id_tipo}>
                  {c.nome_tipo} ({c.total_produtos})
                </option>
              ))}
            </select>
          </div>

          {/* Ordenação */}
          <div className="w-full md:w-56 shrink-0">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="custo_total_desc">Maior Capital (Custo R$)</option>
              <option value="venda_total_desc">Maior Potencial (Venda R$)</option>
              <option value="lucro_desc">Maior Lucro Projetado (R$)</option>
              <option value="margem_desc">Maior Margem de Lucro (%)</option>
              <option value="estoque_desc">Maior Estoque Físico</option>
              <option value="estoque_asc">Menor Estoque (Reposição)</option>
              <option value="nome_asc">Nome do Produto (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Abas de Status e Toggle de Peças Físicas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap gap-1.5 text-xs font-medium">
            {[
              { id: 'todos', label: 'Todos os Itens' },
              { id: 'com_saldo', label: 'Com Estoque Físico' },
              { id: 'normal', label: 'Saudáveis (> Mínimo)' },
              { id: 'baixo', label: 'Estoque Baixo' },
              { id: 'zerado', label: 'Zerados' },
              { id: 'negativo', label: 'Negativos' },
              { id: 'sem_custo', label: 'Sem Custo (R$ 0)' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFiltro(tab.id)
                  setPagina(1)
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  statusFiltro === tab.id
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={apenasProdutos}
              onChange={e => {
                setApenasProdutos(e.target.checked)
                setPagina(1)
              }}
              className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
            />
            <span>Apenas Peças Físicas (exclui serviços de mão de obra)</span>
          </label>
        </div>
      </div>

      {/* ── BARRA DE SUBTOTAIS DOS ITENS FILTRADOS ────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-5 py-3 flex items-center justify-between gap-4 text-xs text-slate-400 flex-wrap">
        <div>
          Exibindo <strong className="text-white">{totalItens}</strong> produtos filtrados
          {categoriaFiltro !== 'todos' && ' nesta categoria'}
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <span>
            Peças físicas: <strong className="text-slate-200">{N(subtotais.unidades)}</strong>
          </span>
          <span>
            Custo total: <strong className="text-emerald-400 font-bold">{R(subtotais.custo)}</strong>
          </span>
          <span>
            Venda total: <strong className="text-blue-400 font-bold">{R(subtotais.venda)}</strong>
          </span>
          <span>
            Lucro projetado:{' '}
            <strong className="text-purple-400 font-bold">{R(subtotais.lucro)}</strong>{' '}
            <span className="text-slate-500">({subtotais.margem.toFixed(1)}%)</span>
          </span>
        </div>
      </div>

      {/* ── TABELA DE VALORIZAÇÃO ─────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 text-center text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-3" />
            Calculando inventário e valorização financeira do estoque…
          </div>
        ) : totalItens === 0 ? (
          <div className="py-20 text-center text-slate-500 text-sm">
            Nenhum produto encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="px-4 py-3.5">Produto / Descrição</th>
                  <th className="px-3 py-3.5 text-center">Un.</th>
                  <th className="px-3 py-3.5 text-right">Estoque</th>
                  <th className="px-3 py-3.5 text-right">Mín.</th>
                  <th className="px-3 py-3.5 text-right">Custo Un.</th>
                  <th className="px-3 py-3.5 text-right">Venda Un.</th>
                  <th className="px-4 py-3.5 text-right">Custo Total</th>
                  <th className="px-4 py-3.5 text-right">Venda Total</th>
                  <th className="px-4 py-3.5 text-right">Lucro Projetado</th>
                  <th className="px-3 py-3.5 text-center">Margem</th>
                  <th className="px-3 py-3.5 text-center print:hidden">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {itensExibidos.map(p => {
                  const custoTotal = p.valor_custo_total
                  const vendaTotal = p.valor_venda_total
                  const lucroTotal = p.lucro_projetado
                  const isNegativo = p.status_estoque === 'negativo'
                  const isZerado = p.status_estoque === 'zerado'
                  const isBaixo = p.status_estoque === 'baixo'

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Descrição e Categoria */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                          {p.nome_produto}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                          {p.cod_barra && <span>{p.cod_barra}</span>}
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400 font-sans">{p.tipo_nome}</span>
                        </div>
                      </td>

                      {/* Unidade */}
                      <td className="px-3 py-3 text-center text-slate-400 font-mono">
                        {p.unidade}
                      </td>

                      {/* Estoque Físico com Badge de Status */}
                      <td className="px-3 py-3 text-right">
                        {!p.controla_estoque ? (
                          <span className="text-purple-400 font-semibold text-[11px]">∞ Infinito</span>
                        ) : (
                          <span
                            className={`inline-block font-bold text-sm ${
                              isNegativo
                                ? 'text-purple-400'
                                : isZerado
                                ? 'text-rose-400'
                                : isBaixo
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {p.estoque}
                          </span>
                        )}
                      </td>

                      {/* Mínimo */}
                      <td className="px-3 py-3 text-right text-slate-500 font-mono">
                        {p.min_estoque}
                      </td>

                      {/* Custo Unitário */}
                      <td className="px-3 py-3 text-right font-mono">
                        {p.vr_custo > 0 ? (
                          <span className="text-slate-300">{R(p.vr_custo)}</span>
                        ) : (
                          <span className="text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            R$ 0,00!
                          </span>
                        )}
                      </td>

                      {/* Venda Unitária */}
                      <td className="px-3 py-3 text-right font-mono text-slate-200">
                        {R(p.vr_venda)}
                      </td>

                      {/* Custo Total Imobilizado */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 bg-emerald-950/10">
                        {R(custoTotal)}
                      </td>

                      {/* Venda Total Projetada */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-300 bg-blue-950/10">
                        {R(vendaTotal)}
                      </td>

                      {/* Lucro Projetado */}
                      <td className="px-4 py-3 text-right font-mono font-bold text-purple-300">
                        {R(lucroTotal)}
                      </td>

                      {/* Margem */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.margem_pct >= 40
                              ? 'bg-emerald-900/40 text-emerald-400'
                              : p.margem_pct >= 20
                              ? 'bg-blue-900/40 text-blue-300'
                              : p.margem_pct > 0
                              ? 'bg-amber-900/40 text-amber-400'
                              : 'bg-rose-900/40 text-rose-400'
                          }`}
                        >
                          {p.margem_pct > 0 ? `${p.margem_pct.toFixed(0)}%` : '—'}
                        </span>
                      </td>

                      {/* Ação rápida de ajuste */}
                      <td className="px-3 py-3 text-center print:hidden">
                        <button
                          onClick={() => {
                            setModalProduto(p)
                            setTipoAjuste('entrada')
                            setQuantidadeAjuste('')
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 text-[11px] transition-colors"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── PAGINAÇÃO ──────────────────────────────────────────────────────── */}
        {!isLoading && totalPaginas > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-800 bg-slate-950/40 print:hidden text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>
                Página <strong className="text-white">{paginaValida}</strong> de{' '}
                <strong className="text-white">{totalPaginas}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span>Total: {totalItens} produtos</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina(1)}
                disabled={paginaValida === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Primeira página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaValida === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-semibold text-slate-200">{paginaValida}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaValida === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(totalPaginas)}
                disabled={paginaValida === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                title="Última página"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>

              <select
                value={itensPorPagina}
                onChange={e => {
                  setItensPorPagina(Number(e.target.value))
                  setPagina(1)
                }}
                className="ml-3 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none"
              >
                <option value={25}>25 por pág.</option>
                <option value={50}>50 por pág.</option>
                <option value={100}>100 por pág.</option>
                <option value={200}>200 por pág.</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL DE AJUSTE RÁPIDO ────────────────────────────────────────── */}
      {modalProduto && (
        <Modal
          title={`Ajustar Estoque — ${modalProduto.nome_produto}`}
          onClose={() => setModalProduto(null)}
        >
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="text-slate-400">Estoque atual na loja</span>
              <span className="text-base font-bold text-white">
                {modalProduto.estoque} {modalProduto.unidade}
              </span>
            </div>

            {/* Tipo de Ajuste */}
            <div>
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">
                Tipo de movimentação
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS_AJUSTE.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipoAjuste(t.value)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      tipoAjuste === t.value
                        ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">
                {tipoAjuste === 'ajuste' ? 'Novo saldo exato em estoque' : 'Quantidade'}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={quantidadeAjuste}
                onChange={e => setQuantidadeAjuste(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setModalProduto(null)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => mutAjuste.mutate()}
                disabled={!quantidadeAjuste || mutAjuste.isPending}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40"
              >
                {mutAjuste.isPending ? 'Salvando…' : 'Confirmar Ajuste'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
