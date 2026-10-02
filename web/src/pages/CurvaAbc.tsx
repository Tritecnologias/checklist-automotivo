import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi, adminApi } from '../lib/api'
import type { ProdutoCurvaAbc, ProdutoTipo } from '../types'
import Modal from '../components/Modal'
import {
  Boxes,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Search,
  Printer,
  RefreshCw,
  Flame,
  Snowflake,
  BarChart3,
  SlidersHorizontal,
  ArrowUpDown,
  Package,
  Sparkles,
  Info,
} from 'lucide-react'

const R = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const N = (v: number) => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

type TipoAjuste = 'entrada' | 'saida' | 'ajuste'
const TIPOS_AJUSTE: { value: TipoAjuste; label: string; desc: string; cor: string }[] = [
  { value: 'entrada', label: 'Entrada',            desc: 'Adiciona ao estoque físico', cor: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'saida',   label: 'Saída',              desc: 'Subtrai do estoque físico',  cor: 'bg-rose-600 hover:bg-rose-500' },
  { value: 'ajuste',  label: 'Ajuste (Inventário)',desc: 'Sobrescreve o saldo exato',  cor: 'bg-blue-600 hover:bg-blue-500' },
]

export default function CurvaAbc() {
  const qc = useQueryClient()

  // Filtros
  const [dias, setDias] = useState<number>(90)
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false)
  const [classeFiltro, setClasseFiltro] = useState<string>('todos')
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos')
  const [apenasProdutos, setApenasProdutos] = useState<boolean>(true)
  const [busca, setBusca] = useState<string>('')
  const [sort, setSort] = useState<string>('faturamento_desc')

  // Modal de Ajuste Rápido
  const [modalProduto, setModalProduto] = useState<ProdutoCurvaAbc | null>(null)
  const [tipoAjuste, setTipoAjuste] = useState<TipoAjuste>('entrada')
  const [quantidadeAjuste, setQuantidadeAjuste] = useState<string>('')

  // Query Tipos de Produtos
  const { data: tiposProdutos } = useQuery<ProdutoTipo[]>({
    queryKey: ['admin-product-types'],
    queryFn: () => adminApi.getProductTypes(),
    staleTime: 5 * 60_000,
  })

  // Query Curva ABC
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'curva-abc',
      isCustomDate ? `${dataInicio}_${dataFim}` : dias,
      apenasProdutos,
      classeFiltro,
      tipoFiltro,
      busca,
      sort,
    ],
    queryFn: () =>
      erpApi.curvaAbc({
        dias: isCustomDate ? undefined : dias,
        data_inicio: isCustomDate ? dataInicio : undefined,
        data_fim: isCustomDate ? dataFim : undefined,
        apenas_produtos: apenasProdutos ? '1' : '0',
        classe: classeFiltro,
        tipo: tipoFiltro !== 'todos' ? Number(tipoFiltro) : undefined,
        search: busca,
        sort,
      }),
    staleTime: 60_000,
  })

  const resumo = data?.resumo
  const periodo = data?.periodo
  const produtos = data?.produtos || []

  // Mutação para Ajuste de Estoque
  const mutAjuste = useMutation({
    mutationFn: () => {
      if (!modalProduto) throw new Error('Nenhum produto selecionado')
      return erpApi.ajustarEstoque(modalProduto.id, tipoAjuste, Number(quantidadeAjuste))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['curva-abc'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setModalProduto(null)
      setQuantidadeAjuste('')
    },
  })

  const handlePrint = () => {
    window.print()
  }

  const totalProdutosFiltrados = produtos.length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:max-w-none">
      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:border-none print:pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 rounded-xl text-white shadow-lg shadow-orange-600/20">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Curva ABC de Peças & Giro de Estoque
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Pareto 80/15/5
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Identifique os produtos de maior giro, previna rupturas em peças críticas e localize dinheiro parado no estoque
              </p>
            </div>
          </div>
        </div>

        {/* Ações do cabeçalho */}
        <div className="flex items-center gap-2 self-start md:self-auto print:hidden">
          <Link
            to="/erp/estoque"
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Boxes className="w-4 h-4 text-slate-400" />
            <span>Gerenciar Estoque</span>
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/25 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* ── CARDS EXECUTIVOS DE KPI ── */}
      {resumo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
          {/* 1. Capital Total em Estoque */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Valor Total em Estoque
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-2 tracking-tight">
              {R(resumo.valor_total_estoque_custo)}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>Potencial de Venda:</span>
              <span className="font-semibold text-emerald-400">{R(resumo.valor_total_estoque_venda)}</span>
            </div>
          </div>

          {/* 2. Dinheiro Parado (Zero Giro) */}
          <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-900/40 rounded-2xl p-4 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                <Snowflake className="w-3.5 h-3.5 text-indigo-400" />
                Dinheiro Parado (Classe C)
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-indigo-200 mt-2 tracking-tight">
              {R(resumo.dinheiro_parado_classe_c)}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-900/30 text-[11px] text-indigo-300/80">
              <span>Total Catálogo:</span>
              <span className="font-bold text-indigo-200">{resumo.total_itens_catalogo} itens</span>
            </div>
          </div>

          {/* 3. Ruptura Crítica Classe A */}
          <div className={`rounded-2xl p-4 relative overflow-hidden shadow-sm border ${
            resumo.itens_em_ruptura_classe_a > 0
              ? 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border-rose-900/50'
              : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${
                resumo.itens_em_ruptura_classe_a > 0 ? 'text-rose-300' : 'text-slate-400'
              }`}>
                <AlertTriangle className={`w-3.5 h-3.5 ${resumo.itens_em_ruptura_classe_a > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
                Ruptura de Estoque (Classe A)
              </span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                resumo.itens_em_ruptura_classe_a > 0 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-slate-800 text-slate-500'
              }`}>
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className={`text-2xl font-bold tracking-tight ${
                resumo.itens_em_ruptura_classe_a > 0 ? 'text-rose-300' : 'text-emerald-400'
              }`}>
                {resumo.itens_em_ruptura_classe_a} {resumo.itens_em_ruptura_classe_a === 1 ? 'item' : 'itens'}
              </p>
              {resumo.itens_em_ruptura_classe_a > 0 && (
                <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                  Abaixo do mínimo
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>Risco operacional:</span>
              <span className={resumo.itens_em_ruptura_classe_a > 0 ? 'font-semibold text-rose-400' : 'font-medium text-emerald-400'}>
                {resumo.itens_em_ruptura_classe_a > 0 ? 'Perda de vendas em peças vitais' : 'Estoque abastecido'}
              </span>
            </div>
          </div>

          {/* 4. Giro de Faturamento do Período */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Vendas no Período ({periodo?.dias || dias} dias)
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-2 tracking-tight">
              {R(resumo.faturamento_total_periodo)}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>Margem Média: <strong className="text-emerald-400">{N(resumo.margem_media_estoque_pct)}%</strong></span>
              <span>Volume: <strong className="text-slate-200">{resumo.qtd_total_vendida_periodo} un</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* ── VISÃO COMPARATIVA DAS CLASSES PARETO (CARDS A / B / C) ── */}
      {resumo && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card Classe A */}
          <div className="bg-gradient-to-b from-emerald-950/20 to-slate-900 border border-emerald-600/30 rounded-2xl p-4 relative shadow-sm hover:border-emerald-500/50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center border border-emerald-500/30">
                  A
                </span>
                <div>
                  <h3 className="text-sm font-bold text-emerald-300">Classe A (Alto Giro)</h3>
                  <p className="text-[11px] text-slate-400">Representa ~80% do faturamento</p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {N(resumo.classe_a.share_faturamento_pct)}% Fat.
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Faturamento Realizado:</span>
                <span className="font-bold text-white">{R(resumo.classe_a.faturamento)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Total de Produtos:</span>
                <span className="font-semibold text-slate-200">{resumo.classe_a.qtd_itens} itens</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Estoque Físico Atual:</span>
                <span className="font-semibold text-slate-200">{R(resumo.classe_a.valor_estoque_custo)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Rupturas Críticas:</span>
                <span className={`font-bold ${
                  resumo.itens_em_ruptura_classe_a > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {resumo.itens_em_ruptura_classe_a > 0 ? `🚨 ${resumo.itens_em_ruptura_classe_a} itens abaixo do mínimo` : '✅ Todos abastecidos'}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-emerald-900/30 text-[11px] text-emerald-400/80 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Prioridade máxima em compras. Nunca deixe faltar.</span>
            </div>
          </div>

          {/* Card Classe B */}
          <div className="bg-gradient-to-b from-blue-950/20 to-slate-900 border border-blue-600/30 rounded-2xl p-4 relative shadow-sm hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-black text-sm flex items-center justify-center border border-blue-500/30">
                  B
                </span>
                <div>
                  <h3 className="text-sm font-bold text-blue-300">Classe B (Médio Giro)</h3>
                  <p className="text-[11px] text-slate-400">Representa ~15% do faturamento</p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                {N(resumo.classe_b.share_faturamento_pct)}% Fat.
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Faturamento Realizado:</span>
                <span className="font-bold text-white">{R(resumo.classe_b.faturamento)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Total de Produtos:</span>
                <span className="font-semibold text-slate-200">{resumo.classe_b.qtd_itens} itens</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Estoque Físico Atual:</span>
                <span className="font-semibold text-slate-200">{R(resumo.classe_b.valor_estoque_custo)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status Operacional:</span>
                <span className="font-semibold text-blue-300">Giro intermediário</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-blue-900/30 text-[11px] text-blue-400/80 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Giro equilibrado. Reposição programada preventiva.</span>
            </div>
          </div>

          {/* Card Classe C */}
          <div className="bg-gradient-to-b from-amber-950/20 to-slate-900 border border-amber-600/30 rounded-2xl p-4 relative shadow-sm hover:border-amber-500/50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-black text-sm flex items-center justify-center border border-amber-500/30">
                  C
                </span>
                <div>
                  <h3 className="text-sm font-bold text-amber-300">Classe C (Baixo Giro)</h3>
                  <p className="text-[11px] text-slate-400">Representa ~5% do faturamento</p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {N(resumo.classe_c.share_faturamento_pct)}% Fat.
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Faturamento Realizado:</span>
                <span className="font-bold text-white">{R(resumo.classe_c.faturamento)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Total de Produtos:</span>
                <span className="font-semibold text-slate-200">{resumo.classe_c.qtd_itens} itens</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Estoque Físico Atual:</span>
                <span className="font-semibold text-slate-200">{R(resumo.classe_c.valor_estoque_custo)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Comportamento:</span>
                <span className="font-semibold text-amber-300">Cauda longa / Baixa saída</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-amber-900/30 text-[11px] text-amber-400/80 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Evitar compras em excesso para não travar caixa.</span>
            </div>
          </div>
        </div>
      )}

      {/* ── BARRA DE PROGRESSO VISUAL PARETO ── */}
      {resumo && resumo.faturamento_total_periodo > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Composição Pareto do Faturamento
            </span>
            <span>Meta Teórica: 80% (A) | 15% (B) | 5% (C)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
            <div
              style={{ width: `${Math.min(100, resumo.classe_a.share_faturamento_pct)}%` }}
              className="bg-emerald-500 h-full transition-all"
              title={`Classe A: ${N(resumo.classe_a.share_faturamento_pct)}%`}
            />
            <div
              style={{ width: `${Math.min(100, resumo.classe_b.share_faturamento_pct)}%` }}
              className="bg-blue-500 h-full transition-all"
              title={`Classe B: ${N(resumo.classe_b.share_faturamento_pct)}%`}
            />
            <div
              style={{ width: `${Math.min(100, resumo.classe_c.share_faturamento_pct)}%` }}
              className="bg-amber-500 h-full transition-all"
              title={`Classe C: ${N(resumo.classe_c.share_faturamento_pct)}%`}
            />
          </div>
          <div className="flex items-center gap-6 mt-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Classe A ({N(resumo.classe_a.share_faturamento_pct)}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Classe B ({N(resumo.classe_b.share_faturamento_pct)}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Classe C ({N(resumo.classe_c.share_faturamento_pct)}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── FILTROS E BUSCA ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 print:hidden">
        {/* Linha 1: Período e Tipo de Produto */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Seletor de Período Rápido */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Período de Vendas:
            </span>
            {[30, 60, 90, 180, 365].map(d => (
              <button
                key={d}
                onClick={() => {
                  setDias(d)
                  setIsCustomDate(false)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  !isCustomDate && dias === d
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {d === 365 ? '1 Ano' : `${d} dias`}
              </button>
            ))}
            <button
              onClick={() => setIsCustomDate(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isCustomDate
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Toggle Apenas Produtos / Mão de Obra */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600">
              <input
                type="checkbox"
                checked={apenasProdutos}
                onChange={e => setApenasProdutos(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span>Apenas Peças & Produtos (exclui Serviços)</span>
            </label>
          </div>
        </div>

        {/* Linha de Datas Customizadas (se ativo) */}
        {isCustomDate && (
          <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <span className="text-xs font-medium text-slate-400">Data Início:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
            />
            <span className="text-xs font-medium text-slate-400">Data Fim:</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
            />
          </div>
        )}

        {/* Linha 2: Filtros de Classe (Pills) e Categoria */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1">Filtrar por:</span>
            {[
              { id: 'todos', label: 'Todos os Itens' },
              { id: 'A', label: '🔥 Classe A (Alto Giro)' },
              { id: 'B', label: '⚡ Classe B' },
              { id: 'C', label: '📦 Classe C' },
              { id: 'dinheiro_parado', label: '🧊 Dinheiro Parado' },
              { id: 'ruptura', label: '🚨 Ruptura Classe A' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setClasseFiltro(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  classeFiltro === f.id
                    ? f.id === 'ruptura'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : f.id === 'dinheiro_parado'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : f.id === 'A'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Categoria/Tipo */}
          {tiposProdutos && tiposProdutos.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Categoria:</span>
              <select
                value={tipoFiltro}
                onChange={e => setTipoFiltro(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="todos">Todas as Categorias</option>
                {tiposProdutos.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.nome_tipo} {t.is_service ? '(Serviço)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Linha 3: Barra de Pesquisa e Ordenação */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-800">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código de barras ou nome da peça..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-full sm:w-auto"
            >
              <option value="faturamento_desc">Maior Faturamento (R$)</option>
              <option value="qtd_desc">Mais Vendidos (Unidades)</option>
              <option value="imobilizado_desc">Maior Capital em Estoque (R$)</option>
              <option value="estoque_asc">Menor Estoque Físico</option>
              <option value="nome_asc">Nome do Produto (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── TABELA DETALHADA DE PRODUTOS ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">
              Itens Analisados ({totalProdutosFiltrados})
            </h2>
            {isFetching && (
              <span className="text-[11px] text-blue-400 flex items-center gap-1 animate-pulse font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando...
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400">
            {classeFiltro === 'ruptura' ? (
              <span className="text-rose-400 font-semibold">Exibindo apenas peças Classe A em ruptura</span>
            ) : classeFiltro === 'dinheiro_parado' ? (
              <span className="text-indigo-400 font-semibold">Exibindo apenas peças com estoque sem giro</span>
            ) : (
              <span>Ordenado por {sort.replace('_desc', ' decrescente').replace('_asc', ' crescente')}</span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">Processando curva ABC e saldos de estoque...</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Boxes className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-base font-semibold text-white">Nenhum produto encontrado com os filtros atuais</p>
            <p className="text-xs text-slate-500">Tente ajustar o período ou selecionar outra classe de produtos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-left font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5">Classe</th>
                  <th className="py-3 px-3.5">Código / Produto</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Vendas (Período)</th>
                  <th className="py-3 px-3.5 text-right">Faturamento</th>
                  <th className="py-3 px-3.5 text-right">% Fat. (Curva)</th>
                  <th className="py-3 px-3.5 text-center">Estoque Físico</th>
                  <th className="py-3 px-3.5 text-right">Custo / Venda</th>
                  <th className="py-3 px-3.5 text-right">Capital em Estoque</th>
                  <th className="py-3 px-3.5 text-center">Sug. Compra</th>
                  <th className="py-3 px-3.5 text-center print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {produtos.map(p => {
                  const isRuptura = p.status_estoque === 'ruptura'
                  const isSemGiro = p.status_estoque === 'dinheiro_parado'
                  const isBaixo = p.status_estoque === 'baixo'

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isRuptura ? 'bg-rose-950/15' : isSemGiro ? 'bg-indigo-950/10' : ''
                      }`}
                    >
                      {/* Classe ABC Badge */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs border ${
                            p.classe === 'A'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10'
                              : p.classe === 'B'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {p.classe}
                        </span>
                      </td>

                      {/* Código e Nome */}
                      <td className="py-3 px-3.5">
                        <div className="max-w-xs md:max-w-sm">
                          <p className="font-bold text-slate-100 text-sm truncate" title={p.nome_produto}>
                            {p.nome_produto}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            {p.cod_barra && (
                              <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                                {p.cod_barra}
                              </span>
                            )}
                            {p.tipo_nome && (
                              <span className="text-slate-400 truncate">{p.tipo_nome}</span>
                            )}
                            <span className="text-slate-500 uppercase">{p.unidade}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status Operacional */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {isRuptura ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                            Ruptura Crítica
                          </span>
                        ) : isSemGiro ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            <Snowflake className="w-3 h-3 text-indigo-400 shrink-0" />
                            Dinheiro Parado
                          </span>
                        ) : isBaixo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Estoque Baixo
                          </span>
                        ) : p.status_estoque === 'zerado' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Zerado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Normal
                          </span>
                        )}
                      </td>

                      {/* Vendas no Período */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span className="font-bold text-slate-100 text-sm">
                          {N(p.qtd_vendida)}
                        </span>
                        <span className="text-slate-400 text-[10px] ml-1">{p.unidade}</span>
                      </td>

                      {/* Faturamento */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span className="font-bold text-white text-sm">
                          {R(p.faturamento_total)}
                        </span>
                      </td>

                      {/* % Participação e Pareto Acumulado */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="font-semibold text-slate-200">
                          {N(p.share_pct)}%
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Acum. {N(p.acumulado_pct)}%
                        </div>
                      </td>

                      {/* Estoque Físico vs Mínimo */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`font-black text-sm px-2 py-0.5 rounded ${
                            p.estoque <= 0
                              ? 'text-rose-400 bg-rose-500/10'
                              : p.estoque <= p.min_estoque
                              ? 'text-amber-400 bg-amber-500/10'
                              : 'text-emerald-400'
                          }`}
                        >
                          {N(p.estoque)}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Mínimo: {N(p.min_estoque)}
                        </div>
                      </td>

                      {/* Custo / Preço Venda */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="text-slate-300 font-medium">
                          {R(p.vr_venda)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Custo {R(p.vr_compra)} ({N(p.margem_unitaria_pct)}%)
                        </div>
                      </td>

                      {/* Capital em Estoque (Estoque * Custo) */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span
                          className={`font-bold text-sm ${
                            isSemGiro ? 'text-indigo-300' : 'text-slate-300'
                          }`}
                        >
                          {R(p.valor_estoque_custo)}
                        </span>
                        {isSemGiro && (
                          <div className="text-[10px] text-indigo-400 font-medium">
                            Sem vendas
                          </div>
                        )}
                      </td>

                      {/* Sugestão de Compra */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {p.sugestao_compra > 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-xs ${
                              p.classe === 'A'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                            title={`Sugerido comprar ${p.sugestao_compra} ${p.unidade} para repor estoque mínimo e demanda`}
                          >
                            +{p.sugestao_compra} {p.unidade}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">OK</span>
                        )}
                      </td>

                      {/* Ações (Ajuste Rápido) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap print:hidden">
                        <button
                          onClick={() => {
                            setModalProduto(p)
                            setTipoAjuste(p.sugestao_compra > 0 ? 'entrada' : 'ajuste')
                            setQuantidadeAjuste(p.sugestao_compra > 0 ? String(p.sugestao_compra) : '')
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors"
                          title="Ajustar estoque ou lançar entrada de compra"
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

      {/* ── MODAL DE AJUSTE RÁPIDO DE ESTOQUE ── */}
      {modalProduto && (
        <Modal
          title={`Ajuste de Estoque — ${modalProduto.nome_produto}`}
          onClose={() => setModalProduto(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3 border border-slate-700">
              <div>
                <span className="text-xs text-slate-400 block">Estoque Atual</span>
                <span className="text-xl font-bold text-white">
                  {modalProduto.estoque} {modalProduto.unidade}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Estoque Mínimo</span>
                <span className="text-sm font-semibold text-slate-300">
                  {modalProduto.min_estoque} {modalProduto.unidade}
                </span>
              </div>
            </div>

            {/* Tipo de Ajuste */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Tipo de Movimento
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS_AJUSTE.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipoAjuste(t.value)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-center ${
                      tipoAjuste === t.value
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade */}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                {tipoAjuste === 'ajuste' ? 'Novo Saldo Real (Inventário)' : 'Quantidade'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={quantidadeAjuste}
                onChange={e => setQuantidadeAjuste(e.target.value)}
                placeholder="Ex: 5"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Resultado Previsto */}
            {quantidadeAjuste && !isNaN(Number(quantidadeAjuste)) && (
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs flex justify-between items-center">
                <span className="text-slate-400">Saldo Final Previsto:</span>
                <span className="text-sm font-bold text-emerald-400">
                  {tipoAjuste === 'ajuste'
                    ? Number(quantidadeAjuste)
                    : tipoAjuste === 'entrada'
                    ? modalProduto.estoque + Number(quantidadeAjuste)
                    : Math.max(0, modalProduto.estoque - Number(quantidadeAjuste))}{' '}
                  {modalProduto.unidade}
                </span>
              </div>
            )}

            {/* Botões do modal */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalProduto(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !quantidadeAjuste ||
                  isNaN(Number(quantidadeAjuste)) ||
                  Number(quantidadeAjuste) < 0 ||
                  mutAjuste.isPending
                }
                onClick={() => mutAjuste.mutate()}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 disabled:opacity-50"
              >
                {mutAjuste.isPending ? 'Gravando...' : 'Confirmar Ajuste'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
