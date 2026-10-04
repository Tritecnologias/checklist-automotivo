import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { SugestaoComprasProduto, SugestaoComprasFornecedor } from '../types'
import Modal from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import {
  ShoppingBag,
  TrendingDown,
  AlertTriangle,
  Flame,
  CheckCircle2,
  DollarSign,
  Boxes,
  Truck,
  Phone,
  Mail,
  Copy,
  Check,
  Search,
  Printer,
  Download,
  RefreshCw,
  BarChart3,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
} from 'lucide-react'

const R = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const N = (v: number) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

type TipoAjuste = 'entrada' | 'saida' | 'ajuste'
const TIPOS_AJUSTE: { value: TipoAjuste; label: string; cor: string }[] = [
  { value: 'entrada', label: 'Entrada', cor: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'saida',   label: 'Saída',   cor: 'bg-rose-600 hover:bg-rose-500' },
  { value: 'ajuste',  label: 'Ajuste',  cor: 'bg-blue-600 hover:bg-blue-500' },
]

export default function SugestaoCompras() {
  const qc = useQueryClient()
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Parâmetros de cálculo
  const [periodoDias, setPeriodoDias] = useState<number>(30)
  const [diasCobertura, setDiasCobertura] = useState<number>(30)
  const [apenasProdutos, setApenasProdutos] = useState<boolean>(true)

  // Filtros de exibição
  const [modoVisao, setModoVisao] = useState<'fornecedores' | 'itens'>('fornecedores')
  const [apenasNecessidade, setApenasNecessidade] = useState<boolean>(true)
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [busca, setBusca] = useState<string>('')
  const [sort, setSort] = useState<string>('custo_desc')

  // Paginação da visão geral
  const [pagina, setPagina] = useState<number>(1)
  const [itensPorPagina, setItensPorPagina] = useState<number>(50)

  // Estado de cópia para WhatsApp
  const [copiadoId, setCopiadoId] = useState<number | null>(null)

  // Fornecedores expandidos no modo sanfona
  const [fornecedoresAbertos, setFornecedoresAbertos] = useState<Record<number, boolean>>({})

  // Modal de Ajuste Rápido
  const [modalProduto, setModalProduto] = useState<SugestaoComprasProduto | null>(null)
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjuste>('entrada')
  const [quantidadeAjuste, setQuantidadeAjuste] = useState<string>('')

  // Query de Sugestão de Compras
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['sugestao-compras', tid, periodoDias, diasCobertura, apenasProdutos],
    queryFn: () =>
      erpApi.sugestaoCompras({
        periodo_dias: periodoDias,
        dias_cobertura: diasCobertura,
        apenas_produtos: apenasProdutos ? '1' : '0',
      }),
    staleTime: 60_000,
  })

  const resumo = data?.resumo
  const fornecedores = data?.fornecedores || []

  // Mutação para Ajuste Rápido
  const mutAjuste = useMutation({
    mutationFn: () => {
      if (!modalProduto) throw new Error('Produto inválido')
      return erpApi.ajustarEstoque(modalProduto.id, tipoAjuste, Number(quantidadeAjuste))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sugestao-compras'] })
      qc.invalidateQueries({ queryKey: ['valorizacao-estoque'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setModalProduto(null)
      setQuantidadeAjuste('')
    },
  })

  // Alterna accordion de fornecedor
  function toggleFornecedor(id: number) {
    setFornecedoresAbertos(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }))
  }

  // Copia lista de cotação formatada para o WhatsApp do fornecedor
  function copiarCotacaoWhatsapp(forn: SugestaoComprasFornecedor, produtosForn: SugestaoComprasProduto[]) {
    const lojaNome = currentTenant?.nome || 'Oficina / Autocenter'
    const dataHoje = new Date().toLocaleDateString('pt-BR')

    let texto = `*PEDIDO / COTAÇÃO DE PEÇAS*\n`
    texto += `*Empresa:* ${lojaNome}\n`
    texto += `*Fornecedor:* ${forn.nome_fornecedor}\n`
    if (forn.contato) texto += `*A/C:* ${forn.contato}\n`
    texto += `*Data:* ${dataHoje}\n`
    texto += `------------------------------------\n\n`

    produtosForn.forEach((p, idx) => {
      const cod = p.cod_barra ? ` [Cód: ${p.cod_barra}]` : ''
      texto += `${idx + 1}. *${p.sugestao_qtd} ${p.unidade}* — ${p.nome_produto}${cod}\n`
    })

    texto += `\n------------------------------------\n`
    texto += `*Total de itens:* ${produtosForn.length}\n`
    texto += `*Total de peças:* ${forn.total_unidades}\n`
    texto += `*Valor estimado:* ${R(forn.valor_total)}\n\n`
    texto += `Por favor, confirmar disponibilidade para entrega e condições de pagamento.`

    navigator.clipboard.writeText(texto)
    setCopiadoId(forn.id_fornecedor)
    setTimeout(() => setCopiadoId(null), 3000)
  }

  // Filtros locais instantâneos
  const produtosFiltrados = useMemo(() => {
    let list = data?.produtos || []

    if (apenasNecessidade) {
      list = list.filter(p => p.precisa_comprar)
    }

    if (fornecedorFiltro !== 'todos') {
      const fid = Number(fornecedorFiltro)
      list = list.filter(p => (p.id_fornecedor || 0) === fid)
    }

    if (statusFiltro === 'urgente') {
      list = list.filter(p => p.status_reposicao === 'urgente')
    } else if (statusFiltro === 'critico') {
      list = list.filter(p => p.status_reposicao === 'critico')
    } else if (statusFiltro === 'atencao') {
      list = list.filter(p => p.status_reposicao === 'atencao')
    } else if (statusFiltro === 'planejado') {
      list = list.filter(p => p.status_reposicao === 'planejado')
    } else if (statusFiltro === 'sem_fornecedor') {
      list = list.filter(p => !p.id_fornecedor)
    }

    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      list = list.filter(
        p =>
          p.nome_produto.toLowerCase().includes(q) ||
          (p.cod_barra && p.cod_barra.toLowerCase().includes(q)) ||
          p.nome_fornecedor.toLowerCase().includes(q) ||
          p.tipo_nome.toLowerCase().includes(q)
      )
    }

    // Ordenação
    const sorted = [...list]
    if (sort === 'custo_desc') {
      sorted.sort((a, b) => b.custo_estimado_total - a.custo_estimado_total)
    } else if (sort === 'qtd_desc') {
      sorted.sort((a, b) => b.sugestao_qtd - a.sugestao_qtd)
    } else if (sort === 'giro_desc') {
      sorted.sort((a, b) => b.consumo_diario - a.consumo_diario)
    } else if (sort === 'dias_asc') {
      sorted.sort((a, b) => a.dias_duracao_estoque - b.dias_duracao_estoque)
    } else if (sort === 'nome_asc') {
      sorted.sort((a, b) => a.nome_produto.localeCompare(b.nome_produto))
    }

    return sorted
  }, [data?.produtos, apenasNecessidade, fornecedorFiltro, statusFiltro, busca, sort])

  // Produtos agrupados por fornecedor para a Visão por Fornecedor
  const produtosPorFornecedor = useMemo(() => {
    const map = new Map<number, SugestaoComprasProduto[]>()
    for (const p of produtosFiltrados) {
      if (apenasNecessidade && !p.precisa_comprar) continue
      const fid = p.id_fornecedor || 0
      const arr = map.get(fid) || []
      arr.push(p)
      map.set(fid, arr)
    }
    return map
  }, [produtosFiltrados, apenasNecessidade])

  // Paginação visão de itens
  const totalItens = produtosFiltrados.length
  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas)
  const itensExibidos = useMemo(() => {
    const inicio = (paginaValida - 1) * itensPorPagina
    return produtosFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [produtosFiltrados, paginaValida, itensPorPagina])

  // Subtotais da seleção
  const subtotais = useMemo(() => {
    let unidades = 0
    let investimento = 0
    for (const p of produtosFiltrados) {
      if (p.precisa_comprar) {
        unidades += p.sugestao_qtd
        investimento += p.custo_estimado_total
      }
    }
    return { unidades, investimento }
  }, [produtosFiltrados])

  // Exportar CSV
  function exportarCsv() {
    if (produtosFiltrados.length === 0) return

    const cabecalho = [
      'ID',
      'Código',
      'Produto',
      'Fornecedor Preferencial',
      'Telefone Fornecedor',
      'Unidade',
      'Estoque Atual',
      'Mínimo',
      'Consumo Período',
      'Giro Diário',
      'Dias Dur. Estoque',
      'Ponto Reposição',
      'Sugestão Compra (Qtd)',
      'Custo Unitário (R$)',
      'Total Estimado (R$)',
      'Status Reposição',
    ]

    const linhas = produtosFiltrados.map(p => [
      p.id,
      `"${p.cod_barra || ''}"`,
      `"${p.nome_produto.replace(/"/g, '""')}"`,
      `"${p.nome_fornecedor.replace(/"/g, '""')}"`,
      `"${p.fornecedor_telefone || ''}"`,
      p.unidade,
      p.estoque,
      p.min_estoque,
      p.qtd_consumo_periodo,
      p.consumo_diario,
      p.dias_duracao_estoque === 999 ? 'Infinito' : p.dias_duracao_estoque,
      p.ponto_reposicao,
      p.sugestao_qtd,
      p.vr_custo.toFixed(2),
      p.custo_estimado_total.toFixed(2),
      p.status_reposicao,
    ])

    const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const lojaNome = (currentTenant?.nome || 'loja').replace(/\s+/g, '_').toLowerCase()
    const dataIso = new Date().toISOString().split('T')[0]
    link.setAttribute('href', url)
    link.setAttribute('download', `sugestao_compras_${lojaNome}_${dataIso}.csv`)
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
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                <span>Sugestão de Compras & Reposição</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {currentTenant?.nome || 'Loja Principal'}
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Cálculo preditivo de reposição por consumo real (Vendas + OS) e cotação por distribuidor.
              </p>
            </div>
          </div>
        </div>

        {/* Ações do Topo */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
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
            to="/erp/estoque/valorizacao"
            className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Valorização</span>
          </Link>

          <Link
            to="/erp/estoque/curva-abc"
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Curva ABC</span>
          </Link>
        </div>
      </div>

      {/* ── PARÂMETROS INTELIGENTES DE CÁLCULO ─────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-6">
          {/* Histórico analisado */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Base Histórica de Saídas</span>
            </span>
            <div className="inline-flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60 text-xs font-medium">
              {[
                { dias: 15, label: '15 dias' },
                { dias: 30, label: '30 dias' },
                { dias: 60, label: '60 dias' },
                { dias: 90, label: '90 dias' },
              ].map(opt => (
                <button
                  key={opt.dias}
                  onClick={() => setPeriodoDias(opt.dias)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    periodoDias === opt.dias
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dias de cobertura desejada */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dias de Cobertura Desejada</span>
            </span>
            <div className="inline-flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60 text-xs font-medium">
              {[
                { dias: 7, label: '7 dias' },
                { dias: 15, label: '15 dias' },
                { dias: 30, label: '30 dias' },
                { dias: 45, label: '45 dias' },
                { dias: 60, label: '60 dias' },
              ].map(opt => (
                <button
                  key={opt.dias}
                  onClick={() => setDiasCobertura(opt.dias)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    diasCobertura === opt.dias
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Informação metodológica */}
        <div className="text-right text-xs text-slate-400 lg:max-w-xs border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-4">
          <p className="font-semibold text-slate-200 flex items-center lg:justify-end gap-1 mb-0.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Fórmula de Reposição</span>
          </p>
          <p className="text-[11px] text-slate-400 leading-tight">
            (Consumo Médio Diário × {diasCobertura} dias) + Estoque Mínimo − Saldo Atual
          </p>
        </div>
      </div>

      {/* ── HERO KPI CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Investimento Total Estimado */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Investimento Necessário</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : R(resumo?.investimento_total_estimado || 0)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Para {diasCobertura} dias de giro</span>
            <span className="text-emerald-400 font-semibold">Custo de compra</span>
          </div>
        </div>

        {/* Card 2: Peças a Comprar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Demanda de Compra</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : `${N(resumo?.total_unidades_comprar || 0)} un.`}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Variedade de produtos</span>
            <span className="text-slate-200 font-semibold">
              {resumo?.total_itens_comprar || 0} itens
            </span>
          </div>
        </div>

        {/* Card 3: Itens Críticos / Urgentes */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Itens em Ruptura / Críticos</span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Flame className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-400 tracking-tight">
            {isLoading ? 'Carregando…' : `${resumo?.itens_criticos_urgentes || 0} produtos`}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Zerados com giro recente</span>
            <span className="text-rose-400 font-semibold">Prioridade Máxima</span>
          </div>
        </div>

        {/* Card 4: Fornecedores a Acionar */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Distribuidores Envolvidos</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {isLoading ? 'Carregando…' : `${resumo?.total_fornecedores_acionar || 0} fornecedores`}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
            <span>Sem fornecedor vinculado</span>
            <span className="text-amber-400 font-semibold">
              {resumo?.itens_sem_fornecedor || 0} itens
            </span>
          </div>
        </div>
      </div>

      {/* ── BARRA DE SELEÇÃO DE VISÃO E FERRAMENTAS ───────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 print:hidden shadow-sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Alternância de Modo de Visão */}
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60 text-xs font-medium self-start md:self-auto">
            <button
              onClick={() => setModoVisao('fornecedores')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                modoVisao === 'fornecedores'
                  ? 'bg-blue-600 text-white font-semibold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Visão por Fornecedor (Pedidos & Cotação)</span>
            </button>
            <button
              onClick={() => setModoVisao('itens')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                modoVisao === 'itens'
                  ? 'bg-blue-600 text-white font-semibold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Visão Geral (Tabela de Itens)</span>
            </button>
          </div>

          {/* Busca textual */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              placeholder="Buscar peça, código de barras ou fornecedor…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
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
        </div>

        {/* Filtros secundários */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro Fornecedor */}
            <select
              value={fornecedorFiltro}
              onChange={e => {
                setFornecedorFiltro(e.target.value)
                setPagina(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="todos">Todos os Fornecedores ({fornecedores.length})</option>
              {fornecedores.map(f => (
                <option key={f.id_fornecedor} value={f.id_fornecedor}>
                  {f.nome_fornecedor} ({f.total_itens} itens • {R(f.valor_total)})
                </option>
              ))}
            </select>

            {/* Filtro Urgência */}
            <select
              value={statusFiltro}
              onChange={e => {
                setStatusFiltro(e.target.value)
                setPagina(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="todos">Todos os Níveis de Urgência</option>
              <option value="urgente">🚨 Urgente (Zerado c/ giro recente)</option>
              <option value="critico">⚠️ Crítico (Estoque zerado)</option>
              <option value="atencao">⚡ Atenção (Abaixo do mínimo)</option>
              <option value="planejado">📦 Planejado (Esgotará na cobertura)</option>
              <option value="sem_fornecedor">❓ Sem Fornecedor Vinculado</option>
            </select>

            {/* Ordenação (no modo itens) */}
            {modoVisao === 'itens' && (
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="custo_desc">Maior Valor Estimado (R$)</option>
                <option value="qtd_desc">Maior Qtd Sugerida</option>
                <option value="giro_desc">Maior Giro Diário (Saídas)</option>
                <option value="dias_asc">Menor Duração (Acaba Primeiro)</option>
                <option value="nome_asc">Nome do Produto (A-Z)</option>
              </select>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
              <input
                type="checkbox"
                checked={apenasNecessidade}
                onChange={e => {
                  setApenasNecessidade(e.target.checked)
                  setPagina(1)
                }}
                className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
              />
              <span>Apenas produtos que precisam de compra</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400">
              <input
                type="checkbox"
                checked={apenasProdutos}
                onChange={e => {
                  setApenasProdutos(e.target.checked)
                  setPagina(1)
                }}
                className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
              />
              <span>Apenas Peças Físicas</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── BARRA DE SUBTOTAIS DA SELEÇÃO ─────────────────────────────────── */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-5 py-3 flex items-center justify-between gap-4 text-xs text-slate-400 flex-wrap">
        <div>
          Exibindo <strong className="text-white">{totalItens}</strong> itens calculados
          {fornecedorFiltro !== 'todos' && ' para este fornecedor'}
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <span>
            Peças sugeridas: <strong className="text-blue-400 font-bold">{N(subtotais.unidades)}</strong>
          </span>
          <span>
            Investimento total previsto:{' '}
            <strong className="text-emerald-400 font-bold text-sm">
              {R(subtotais.investimento)}
            </strong>
          </span>
        </div>
      </div>

      {/* ── CORPO PRINCIPAL: VISÃO POR FORNECEDOR OU TABELA GERAL ──────────── */}
      {isLoading ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-20 text-center text-slate-500 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-3" />
          Calculando demanda de consumo em Vendas e OSs, cruzando fornecedores…
        </div>
      ) : totalItens === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-20 text-center text-slate-500 text-sm">
          Nenhuma necessidade de compra detectada com os filtros atuais. Estoque saudável!
        </div>
      ) : modoVisao === 'fornecedores' ? (
        /* ══════════════════════════════════════════════════════════════════════
           VISÃO 1: AGRUPAMENTO POR FORNECEDOR (PEDIDOS / COTAÇÕES)
           ══════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {Array.from(produtosPorFornecedor.entries()).map(([fid, prods]) => {
            const fornInfo = fornecedores.find(f => f.id_fornecedor === fid) || {
              id_fornecedor: fid,
              nome_fornecedor: fid === 0 ? 'SEM FORNECEDOR VINCULADO' : `Fornecedor #${fid}`,
              telefone: null,
              email: null,
              contato: null,
              total_itens: prods.length,
              total_unidades: prods.reduce((acc, p) => acc + p.sugestao_qtd, 0),
              valor_total: prods.reduce((acc, p) => acc + p.custo_estimado_total, 0),
            }

            const totalPedidoForn = prods.reduce((acc, p) => acc + p.custo_estimado_total, 0)
            const totalPecasForn = prods.reduce((acc, p) => acc + p.sugestao_qtd, 0)
            const isAberto = fornecedoresAbertos[fid] ?? true
            const foiCopiado = copiadoId === fid

            return (
              <div
                key={fid}
                className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm hover:border-slate-700 transition-colors"
              >
                {/* Cabeçalho do Fornecedor */}
                <div className="p-4 bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleFornecedor(fid)}
                      className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      {isAberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Truck className="w-4 h-4 text-blue-400" />
                          <span>{fornInfo.nome_fornecedor}</span>
                        </h2>
                        {fid === 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Vincule fornecedor nas peças
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                        {fornInfo.contato && <span>Contato: {fornInfo.contato}</span>}
                        {fornInfo.telefone && (
                          <span className="flex items-center gap-1 text-slate-300 font-mono">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            {fornInfo.telefone}
                          </span>
                        )}
                        {fornInfo.email && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Mail className="w-3 h-3" />
                            {fornInfo.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Resumo do Pedido do Fornecedor & Botões de Ação */}
                  <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                    <div className="text-right pr-2">
                      <div className="text-xs text-slate-400">
                        {prods.length} itens • {N(totalPecasForn)} peças
                      </div>
                      <div className="text-base font-bold text-emerald-400 font-mono">
                        {R(totalPedidoForn)}
                      </div>
                    </div>

                    <button
                      onClick={() => copiarCotacaoWhatsapp(fornInfo, prods)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                        foiCopiado
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                      title="Copiar lista de cotação formatada para enviar no WhatsApp"
                    >
                      {foiCopiado ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Tabela de Produtos deste Fornecedor */}
                {isAberto && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-950/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                          <th className="px-4 py-2.5">Produto</th>
                          <th className="px-3 py-2.5 text-center">Un.</th>
                          <th className="px-3 py-2.5 text-right">Estoque</th>
                          <th className="px-3 py-2.5 text-right">Mínimo</th>
                          <th className="px-3 py-2.5 text-right">Consumo ({periodoDias}d)</th>
                          <th className="px-3 py-2.5 text-right">Giro/Dia</th>
                          <th className="px-3 py-2.5 text-right">Dur. Atual</th>
                          <th className="px-4 py-2.5 text-right font-bold text-blue-400">
                            Sugestão Compra
                          </th>
                          <th className="px-3 py-2.5 text-right">Custo Un.</th>
                          <th className="px-4 py-2.5 text-right font-bold text-emerald-400">
                            Total Estimado
                          </th>
                          <th className="px-3 py-2.5 text-center">Urgência</th>
                          <th className="px-3 py-2.5 text-center print:hidden">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {prods.map(p => {
                          const isUrgente = p.status_reposicao === 'urgente'
                          const isCritico = p.status_reposicao === 'critico'
                          const isAtencao = p.status_reposicao === 'atencao'

                          return (
                            <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-slate-100">{p.nome_produto}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {p.cod_barra || 'Sem código'} • {p.tipo_nome}
                                </div>
                              </td>

                              <td className="px-3 py-2.5 text-center text-slate-400 font-mono">
                                {p.unidade}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono font-bold">
                                <span
                                  className={
                                    p.estoque <= 0
                                      ? 'text-rose-400'
                                      : p.estoque <= p.min_estoque
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                  }
                                >
                                  {p.estoque}
                                </span>
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {p.min_estoque}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono text-slate-300" title={`Vendas PDV: ${p.qtd_vendas_periodo} | O.S.: ${p.qtd_os_periodo}`}>
                                {p.qtd_consumo_periodo}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                                {p.consumo_diario}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono">
                                {p.dias_duracao_estoque === 999 ? (
                                  <span className="text-slate-500">∞</span>
                                ) : (
                                  <span
                                    className={`font-semibold ${
                                      p.dias_duracao_estoque <= 0
                                        ? 'text-rose-400'
                                        : p.dias_duracao_estoque <= 7
                                        ? 'text-amber-400'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {p.dias_duracao_estoque}d
                                  </span>
                                )}
                              </td>

                              {/* Sugestão de Compra Destaque */}
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-sm text-blue-400 bg-blue-950/20">
                                {p.sugestao_qtd} {p.unidade}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                                {R(p.vr_custo)}
                              </td>

                              <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400 bg-emerald-950/10">
                                {R(p.custo_estimado_total)}
                              </td>

                              {/* Badge de Urgência */}
                              <td className="px-3 py-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isUrgente
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                      : isCritico
                                      ? 'bg-rose-900/40 text-rose-400'
                                      : isAtencao
                                      ? 'bg-amber-900/40 text-amber-400'
                                      : 'bg-blue-900/30 text-blue-300'
                                  }`}
                                >
                                  {isUrgente
                                    ? '🚨 Urgente'
                                    : isCritico
                                    ? 'Zerado'
                                    : isAtencao
                                    ? 'Baixo'
                                    : 'Planejado'}
                                </span>
                              </td>

                              {/* Ajuste rápido */}
                              <td className="px-3 py-2.5 text-center print:hidden">
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
              </div>
            )
          })}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           VISÃO 2: TABELA GERAL (TODOS OS PRODUTOS)
           ══════════════════════════════════════════════════════════════════════ */
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <th className="px-4 py-3.5">Produto</th>
                  <th className="px-3 py-3.5">Fornecedor Preferencial</th>
                  <th className="px-2 py-3.5 text-center">Un.</th>
                  <th className="px-3 py-3.5 text-right">Estoque</th>
                  <th className="px-3 py-3.5 text-right">Mínimo</th>
                  <th className="px-3 py-3.5 text-right">Consumo ({periodoDias}d)</th>
                  <th className="px-3 py-3.5 text-right">Giro/Dia</th>
                  <th className="px-3 py-3.5 text-right">Dur. Atual</th>
                  <th className="px-4 py-3.5 text-right font-bold text-blue-400">
                    Sugestão Compra
                  </th>
                  <th className="px-3 py-3.5 text-right">Custo Un.</th>
                  <th className="px-4 py-3.5 text-right font-bold text-emerald-400">
                    Total Estimado
                  </th>
                  <th className="px-3 py-3.5 text-center">Urgência</th>
                  <th className="px-3 py-3.5 text-center print:hidden">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {itensExibidos.map(p => {
                  const isUrgente = p.status_reposicao === 'urgente'
                  const isCritico = p.status_reposicao === 'critico'
                  const isAtencao = p.status_reposicao === 'atencao'

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100">{p.nome_produto}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {p.cod_barra || 'Sem cód.'} • {p.tipo_nome}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-200">{p.nome_fornecedor}</div>
                        {p.fornecedor_telefone && (
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-emerald-400" />
                            {p.fornecedor_telefone}
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-3 text-center text-slate-400 font-mono">
                        {p.unidade}
                      </td>

                      <td className="px-3 py-3 text-right font-mono font-bold">
                        <span
                          className={
                            p.estoque <= 0
                              ? 'text-rose-400'
                              : p.estoque <= p.min_estoque
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {p.estoque}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-slate-500">
                        {p.min_estoque}
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-slate-300" title={`Vendas PDV: ${p.qtd_vendas_periodo} | O.S.: ${p.qtd_os_periodo}`}>
                        {p.qtd_consumo_periodo}
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-slate-400">
                        {p.consumo_diario}
                      </td>

                      <td className="px-3 py-3 text-right font-mono">
                        {p.dias_duracao_estoque === 999 ? (
                          <span className="text-slate-500">∞</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              p.dias_duracao_estoque <= 0
                                ? 'text-rose-400'
                                : p.dias_duracao_estoque <= 7
                                ? 'text-amber-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {p.dias_duracao_estoque}d
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-sm text-blue-400 bg-blue-950/20">
                        {p.sugestao_qtd > 0 ? (
                          `${p.sugestao_qtd} ${p.unidade}`
                        ) : (
                          <span className="text-slate-600 font-normal">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right font-mono text-slate-300">
                        {R(p.vr_custo)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 bg-emerald-950/10">
                        {R(p.custo_estimado_total)}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isUrgente
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                              : isCritico
                              ? 'bg-rose-900/40 text-rose-400'
                              : isAtencao
                              ? 'bg-amber-900/40 text-amber-400'
                              : p.precisa_comprar
                              ? 'bg-blue-900/30 text-blue-300'
                              : 'bg-emerald-900/20 text-emerald-400'
                          }`}
                        >
                          {isUrgente
                            ? '🚨 Urgente'
                            : isCritico
                            ? 'Zerado'
                            : isAtencao
                            ? 'Baixo'
                            : p.precisa_comprar
                            ? 'Planejado'
                            : 'Seguro'}
                        </span>
                      </td>

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

          {/* Paginação da Tabela Geral */}
          {totalPaginas > 1 && (
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
      )}

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
                        ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-lg font-bold focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

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
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40"
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
