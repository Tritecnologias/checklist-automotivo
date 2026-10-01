import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { CaixaSession, Venda } from '../types'
import { useAuth } from '../contexts/AuthContext'
import ContadorCedulasModal from '../components/ContadorCedulasModal'
import FilipetaFechamentoModal from '../components/FilipetaFechamentoModal'
import {
  Calendar, Filter, X, CreditCard, Banknote, Zap,
  FileText, Ticket, Layers, Search, DollarSign, CheckCircle2, TrendingDown,
  Calculator, Printer, ExternalLink
} from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d?: string | null) => {
  if (!d) return '—'
  const dateStr = String(d).split('T')[0]
  if (dateStr.includes('-')) {
    const [ano, mes, dia] = dateStr.split('-')
    if (ano && mes && dia) {
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`
    }
  }
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR')
}

const FORMAS_OPTS = [
  { value: '',         label: 'Todas as formas' },
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'cartao',   label: '💳 Cartão' },
  { value: 'pix',      label: '⚡ PIX' },
  { value: 'prazo',    label: '📝 A Prazo (Nota)' },
  { value: 'outros',   label: '🎟️ Outros / Ticket' },
]

const getDatesPreset = (preset: string) => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${y}-${pad(m + 1)}-${pad(now.getDate())}`

  if (preset === 'hoje') {
    return { inicio: today, fim: today }
  }
  if (preset === '7dias') {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return {
      inicio: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      fim: today,
    }
  }
  if (preset === 'mes') {
    const inicio = `${y}-${pad(m + 1)}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const fim = `${y}-${pad(m + 1)}-${pad(lastDay)}`
    return { inicio, fim }
  }
  if (preset === 'mes_anterior') {
    const prevMonth = new Date(y, m - 1, 1)
    const py = prevMonth.getFullYear()
    const pm = prevMonth.getMonth()
    const inicio = `${py}-${pad(pm + 1)}-01`
    const lastDay = new Date(py, pm + 1, 0).getDate()
    const fim = `${py}-${pad(pm + 1)}-${pad(lastDay)}`
    return { inicio, fim }
  }
  return { inicio: '', fim: '' }
}

export default function Caixa() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()

  // Operações de abertura / fechamento
  const [vrAbertura, setVrAbertura] = useState('')
  const [vrFechamento, setVrFechamento] = useState('')
  const [detalhesId, setDetalhesId] = useState<number | null>(null)

  // Modais de contagem de dinheiro e filipeta física
  const [contadorModalOpen, setContadorModalOpen] = useState(false)
  const [filipetaModalOpen, setFilipetaModalOpen] = useState(false)
  const [filipetaSession, setFilipetaSession] = useState<CaixaSession | null>(null)
  const [showPixModal, setShowPixModal] = useState(false)

  // Abas de visualização
  const [activeTab, setActiveTab] = useState<'sessoes' | 'vendas'>('sessoes')

  // Filtros de Período e Forma de Pagamento
  const [dataPreset, setDataPreset] = useState<string>('mes')
  const initialPreset = getDatesPreset('mes')
  const [dataInicio, setDataInicio] = useState(initialPreset.inicio)
  const [dataFim, setDataFim]       = useState(initialPreset.fim)
  const [formaPagto, setFormaPagto] = useState<string>('')
  const [page, setPage] = useState(1)

  // Busca e paginação da aba de movimentações
  const [searchVendas, setSearchVendas] = useState('')
  const [debouncedSearchVendas, setDebouncedSearchVendas] = useState('')
  const [pageVendas, setPageVendas] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchVendas(searchVendas)
      setPageVendas(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchVendas])

  const aplicarPreset = (preset: string) => {
    setDataPreset(preset)
    const { inicio, fim } = getDatesPreset(preset)
    setDataInicio(inicio)
    setDataFim(fim)
    setPage(1)
    setPageVendas(1)
  }

  const limparFiltros = () => {
    setDataPreset('')
    setDataInicio('')
    setDataFim('')
    setFormaPagto('')
    setSearchVendas('')
    setPage(1)
    setPageVendas(1)
  }

  const toggleFormaPagto = (forma: string) => {
    setFormaPagto(prev => (prev === forma ? '' : forma))
    setPage(1)
    setPageVendas(1)
  }

  // Status da sessão de caixa atual
  const { data: status } = useQuery({
    queryKey: ['caixa-status', tid],
    queryFn: erpApi.caixaStatus,
    refetchInterval: 10_000,
  })

  // Histórico de sessões de caixa (filtrado por tenant, período e forma de pagamento)
  const { data: hist, isLoading: loadingHist } = useQuery({
    queryKey: ['caixa-hist', tid, page, dataInicio, dataFim, formaPagto],
    queryFn: () => erpApi.caixaList({
      page,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      forma_pagto: formaPagto || undefined,
    }),
  })

  // Lista de vendas/movimentações no período e forma de pagamento
  const { data: vendasRes, isLoading: loadingVendas } = useQuery({
    queryKey: ['caixa-vendas', tid, pageVendas, dataInicio, dataFim, formaPagto, debouncedSearchVendas],
    queryFn: () => erpApi.caixaVendas({
      page: pageVendas,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      forma_pagto: formaPagto || undefined,
      search: debouncedSearchVendas || undefined,
    }),
    enabled: activeTab === 'vendas',
  })

  // Detalhes da sessão para o modal de extrato
  const { data: detalhesModal, isLoading: carregandoDetalhes } = useQuery({
    queryKey: ['caixa-detalhes', tid, detalhesId],
    queryFn: () => detalhesId ? erpApi.caixaDetalhes(detalhesId) : null,
    enabled: !!detalhesId,
  })

  const { mutate: abrir, isPending: abrindo } = useMutation({
    mutationFn: () => erpApi.caixaAbrir({ vr_abertura: parseFloat(vrAbertura.replace(',', '.')) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-hist'] })
      qc.invalidateQueries({ queryKey: ['caixa-vendas'] })
      setVrAbertura('')
    },
  })

  const { mutate: fechar, isPending: fechando } = useMutation({
    mutationFn: (id: number) => erpApi.caixaFechar(id, { vr_fechamento: parseFloat(vrFechamento.replace(',', '.')) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-hist'] })
      qc.invalidateQueries({ queryKey: ['caixa-vendas'] })
      setVrFechamento('')
    },
  })

  // Determina se o caixa está efetivamente aberto nesta loja
  const isCaixaAberto = Boolean(status && status.aberto !== false && status.id)
  const ultimoFechado = status?.ultimo_caixa_fechado || (hist?.data as CaixaSession[] | undefined)?.find(s => s.status_caixa === 'F') || null

  // Cálculos em tempo real para o caixa aberto
  const esperadoDinheiro = useMemo(() => {
    if (!status || !isCaixaAberto) return 0
    if (status.saldo_esperado_dinheiro !== undefined) {
      return Number(status.saldo_esperado_dinheiro)
    }
    const fundo = Number(status.vr_abertura || 0)
    const vendasDinheiro = Number(status.totais_por_forma?.dinheiro || 0)
    const despesasDinheiro = Number(status.despesas_dinheiro ?? status.totais_por_forma?.despesas_dinheiro ?? status.total_despesas ?? 0)
    return Math.max(0, fundo + vendasDinheiro - despesasDinheiro)
  }, [status, isCaixaAberto])

  const totalVendasSessao = useMemo(() => {
    if (!status || !isCaixaAberto) return 0
    if (status.totais_por_forma) {
      return (
        (Number(status.totais_por_forma.dinheiro) || 0) +
        (Number(status.totais_por_forma.cartao) || 0) +
        (Number(status.totais_por_forma.pix) || 0) +
        (Number(status.totais_por_forma.prazo) || 0)
      )
    }
    return Number(status.vr_fechado_turno || 0)
  }, [status, isCaixaAberto])

  const totalDespesasSessao = useMemo(() => {
    if (!status || !isCaixaAberto) return 0
    return Number(status.total_despesas ?? status.totais_por_forma?.total_despesas ?? 0)
  }, [status, isCaixaAberto])

  const saldoLiquidoSessao = useMemo(() => {
    if (!status || !isCaixaAberto) return 0
    if (status.saldo_liquido !== undefined) return Number(status.saldo_liquido)
    return totalVendasSessao - totalDespesasSessao
  }, [status, isCaixaAberto, totalVendasSessao, totalDespesasSessao])

  const fechamentoNum = parseFloat(vrFechamento.replace(',', '.')) || 0
  const temValorDigitado = vrFechamento.trim() !== ''
  const diferencaFechamento = temValorDigitado ? (fechamentoNum - esperadoDinheiro) : 0

  const dinheiroGavetaAtual = temValorDigitado ? fechamentoNum : esperadoDinheiro

  const somaMovimentada = useMemo(() => {
    if (!status) return 0
    const cartao = Number(status.totais_por_forma?.cartao || 0)
    const pix = Number(status.totais_por_forma?.pix || 0)
    const prazo = Number(status.totais_por_forma?.prazo || 0)
    const despesas = Number(status.despesas_dinheiro || status.total_despesas || 0)
    return dinheiroGavetaAtual + cartao + pix + prazo + despesas
  }, [status, dinheiroGavetaAtual])

  const resultadoConferencia = useMemo(() => {
    if (!status) return 0
    const cxAnt = Number(status.vr_abertura || 0)
    return somaMovimentada - totalVendasSessao - cxAnt
  }, [somaMovimentada, totalVendasSessao, status])

  const totaisPeriodo = hist?.totais

  // Outros não deve entrar nos cálculos de vendas
  const totalVendasPeriodo = useMemo(() => {
    if (!totaisPeriodo) return 0
    return (
      (Number(totaisPeriodo.dinheiro) || 0) +
      (Number(totaisPeriodo.cartao) || 0) +
      (Number(totaisPeriodo.pix) || 0) +
      (Number(totaisPeriodo.prazo) || 0)
    )
  }, [totaisPeriodo])

  const temFiltroAtivo = !!(dataInicio || dataFim || formaPagto || (activeTab === 'vendas' && searchVendas))

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── CABEÇALHO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <DollarSign className="w-7 h-7 text-emerald-400" />
            <span>Controle de Caixa</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Loja: <strong className="text-slate-200">{currentTenant?.nome ?? 'Todas as Lojas'}</strong>
          </p>
        </div>
      </div>

      {/* ── STATUS DA LOJA ATUAL (CAIXA ABERTO / FECHADO) ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-sm">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Status da Loja Atual</h2>

        {isCaixaAberto && status?.id ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-400 text-xs font-semibold border border-emerald-800/60 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Caixa Aberto
                </span>
                <span className="text-slate-400 text-xs">
                  Terminal {status.terminal} · Turno {status.turno}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Sessão #{status.id}
              </span>
            </div>

            {/* KPI Cards do Caixa Aberto */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <p className="text-xs text-slate-400 font-medium">Abertura</p>
                <p className="text-lg font-bold text-white mt-0.5">{status.hora_abertura}</p>
                <p className="text-[11px] text-slate-500">{fmtDate(status.data_abertura)}</p>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                <p className="text-xs text-slate-400 font-medium">Fundo de Caixa</p>
                <p className="text-lg font-bold text-white mt-0.5">{R(Number(status.vr_abertura))}</p>
                <p className="text-[11px] text-slate-500">Inicial na gaveta</p>
              </div>

              <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3">
                <p className="text-xs text-emerald-300 font-medium">Total em Vendas</p>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">
                  {R(totalVendasSessao)}
                </p>
                <p className="text-[11px] text-emerald-400/70">
                  {status.totais_por_forma?.qtd_vendas ?? 0} {status.totais_por_forma?.qtd_vendas === 1 ? 'venda' : 'vendas'} (sem outros)
                </p>
              </div>

              <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-3">
                <p className="text-xs text-rose-300 font-medium">Despesas (Saídas)</p>
                <p className="text-lg font-bold text-rose-400 mt-0.5">
                  {R(totalDespesasSessao)}
                </p>
                <p className="text-[11px] text-rose-400/70">
                  {status.totais_por_forma?.qtd_despesas ?? 0} contas ({R(Number(status.despesas_dinheiro ?? status.totais_por_forma?.despesas_dinheiro ?? 0))} em esp.)
                </p>
              </div>

              <div className="bg-teal-950/30 border border-teal-800/40 rounded-xl p-3">
                <p className="text-xs text-teal-300 font-medium">Saldo Líquido</p>
                <p className="text-lg font-bold text-teal-400 mt-0.5">
                  {R(saldoLiquidoSessao)}
                </p>
                <p className="text-[11px] text-teal-400/70">Vendas − Despesas</p>
              </div>

              <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3">
                <p className="text-xs text-blue-300 font-medium">Esperado em Dinheiro</p>
                <p className="text-lg font-bold text-blue-400 mt-0.5">{R(esperadoDinheiro)}</p>
                <p className="text-[11px] text-blue-400/70">Gaveta (Fundo + Dinheiro − Saídas)</p>
              </div>
            </div>

            {/* Resumo por Forma de Pagamento */}
            {status.totais_por_forma && (
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/80 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400">Resumo das Vendas por Meio de Pagamento</p>
                  {status.lista_pix && status.lista_pix.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPixModal(true)}
                      className="text-xs text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1 hover:underline"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Ver {status.lista_pix.length} PIX discriminados</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">💵 Dinheiro</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.dinheiro)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">💳 Cartão</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.cartao)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 block text-[11px]">⚡ PIX</span>
                      {status.lista_pix && status.lista_pix.length > 0 && (
                        <span className="text-[10px] text-teal-400 font-mono">({status.lista_pix.length})</span>
                      )}
                    </div>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.pix)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">📝 A Prazo (Nota)</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.prazo)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">🎟️ Outros / Ticket</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.outros)}</strong>
                    <span className="text-[10px] text-slate-500 block">Não soma no total</span>
                  </div>
                </div>
              </div>
            )}

            {/* Espelho da Filipeta de Fechamento Físico */}
            <div className="border-t border-slate-800 pt-4">
              <div className="bg-slate-950/70 rounded-xl border border-slate-800 p-4 space-y-3 font-mono">
                <div className="flex items-center justify-between font-sans border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <span>📋 Espelho da Filipeta de Fechamento</span>
                    <span className="text-slate-500 font-normal">({currentTenant?.nome || 'Loja'})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (status?.id) {
                        setFilipetaSession(status as unknown as CaixaSession)
                        setFilipetaModalOpen(true)
                      }
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-sans hover:underline"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Visualizar / Imprimir Filipeta</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">CX ANTERIOR</span>
                    <strong className="text-amber-400 text-sm">{R(Number(status.vr_abertura || 0))}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">DESPESAS</span>
                    <strong className="text-red-400 text-sm">{R(Number(status.despesas_dinheiro || status.total_despesas || 0))}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">CARTÃO</span>
                    <strong className="text-slate-200 text-sm">{R(Number(status.totais_por_forma?.cartao || 0))}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">DINHEIRO (GAVETA)</span>
                      <span className="text-[9px] text-slate-500 font-sans">{temValorDigitado ? 'Digitado' : 'Esperado'}</span>
                    </div>
                    <strong className="text-emerald-400 text-sm">
                      {R(dinheiroGavetaAtual)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">PIX</span>
                    <strong className="text-teal-400 text-sm">{R(Number(status.totais_por_forma?.pix || 0))}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">A PRAZO (NOTA)</span>
                    <strong className="text-purple-400 text-sm">{R(Number(status.totais_por_forma?.prazo || 0))}</strong>
                  </div>
                </div>

                {/* Linha de Fórmula e Conferência do Espelho */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-400">
                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase font-semibold">Soma Movimentada:</span>
                      <strong className="text-white font-mono text-sm">{R(somaMovimentada)}</strong>
                      <span className="text-[9px] text-slate-500 block">Dinheiro + Cartão + Pix + Prazo + Desp.</span>
                    </div>
                    <span className="text-slate-600 font-bold text-base hidden sm:inline">−</span>
                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase font-semibold">Total Vendas:</span>
                      <strong className="text-slate-200 font-mono text-sm">{R(totalVendasSessao)}</strong>
                    </div>
                    <span className="text-slate-600 font-bold text-base hidden sm:inline">−</span>
                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase font-semibold">Cx Anterior:</span>
                      <strong className="text-amber-400 font-mono text-sm">{R(Number(status.vr_abertura || 0))}</strong>
                    </div>
                    <span className="text-slate-600 font-bold text-base hidden sm:inline">=</span>
                  </div>

                  <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                    Math.abs(resultadoConferencia) < 0.01
                      ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                      : resultadoConferencia > 0
                      ? 'bg-blue-950/40 border-blue-600/50 text-blue-300'
                      : 'bg-red-950/40 border-red-600/50 text-red-300'
                  }`}>
                    <span className="text-xs">
                      {Math.abs(resultadoConferencia) < 0.01 ? '✅' : resultadoConferencia > 0 ? 'ℹ️' : '⚠️'}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {Math.abs(resultadoConferencia) < 0.01
                        ? 'Caixa Exato:'
                        : resultadoConferencia > 0
                        ? 'Sobra:'
                        : 'Falta:'}
                    </span>
                    <strong className="font-mono text-sm font-bold">
                      {resultadoConferencia >= 0 ? `+${R(resultadoConferencia)}` : `-${R(Math.abs(resultadoConferencia))}`}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Fechamento */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-white mb-1">Fechamento de Caixa</p>
                <p className="text-xs text-slate-400">
                  Informe o valor físico em dinheiro contado na gaveta. O valor esperado é de <strong>{R(esperadoDinheiro)}</strong> (Fundo de Caixa + Vendas em espécie − Despesas pagas em dinheiro).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">R$</span>
                  <input
                    value={vrFechamento}
                    onChange={e => setVrFechamento(e.target.value)}
                    placeholder="0,00"
                    className="w-48 bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-medium text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setContadorModalOpen(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  <span>Contar Dinheiro (Gaveta)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (status?.id) {
                      setFilipetaSession(status as unknown as CaixaSession)
                      setFilipetaModalOpen(true)
                    }
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Printer className="w-4 h-4 text-blue-400" />
                  <span>Filipeta</span>
                </button>

                <button
                  onClick={() => {
                    if (status?.id && confirm(`Confirma o fechamento do caixa com ${R(fechamentoNum)} conferidos?`)) {
                      fechar(status.id)
                    }
                  }}
                  disabled={fechando}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all shadow-md shadow-red-950/40"
                >
                  {fechando ? 'Fechando…' : 'Encerrar e Fechar Caixa'}
                </button>
              </div>

              {/* Indicador de Diferença em Tempo Real */}
              {temValorDigitado ? (
                <div className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between ${
                  Math.abs(diferencaFechamento) < 0.01
                    ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                    : diferencaFechamento > 0
                    ? 'bg-blue-950/40 border-blue-600/50 text-blue-300'
                    : 'bg-red-950/40 border-red-600/50 text-red-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span>
                      {Math.abs(diferencaFechamento) < 0.01 ? '✅' : diferencaFechamento > 0 ? 'ℹ️' : '⚠️'}
                    </span>
                    <div>
                      <span>
                        {Math.abs(diferencaFechamento) < 0.01
                          ? 'Caixa bateu perfeitamente com a conferência!'
                          : diferencaFechamento > 0
                          ? `Sobra de caixa: ${R(diferencaFechamento)} a mais na contagem da gaveta.`
                          : `Quebra/Falta de caixa: ${R(Math.abs(diferencaFechamento))} a menos na contagem da gaveta.`}
                      </span>
                      <span className="block text-[11px] font-mono text-slate-400 font-normal mt-0.5">
                        Fórmula: Soma ({R(somaMovimentada)}) − Vendas ({R(totalVendasSessao)}) − Cx Anterior ({R(Number(status.vr_abertura || 0))}) = {diferencaFechamento >= 0 ? `+${R(diferencaFechamento)}` : `-${R(Math.abs(diferencaFechamento))}`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold">
                    {diferencaFechamento >= 0 ? `+${R(diferencaFechamento)}` : `-${R(Math.abs(diferencaFechamento))}`}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 font-mono bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span>
                    💡 Conferência da loja: Soma ({R(somaMovimentada)}) − Vendas ({R(totalVendasSessao)}) − Cx Anterior ({R(Number(status.vr_abertura || 0))})
                  </span>
                  <span className="font-semibold text-emerald-400">
                    Esperado na gaveta: {R(esperadoDinheiro)} (Bate R$ 0,00)
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-semibold border border-slate-700">
                🔴 Caixa Fechado
              </span>
              <span className="text-xs text-slate-400">Nenhum caixa em operação nesta loja no momento</span>
            </div>
            <div>
              <p className="text-sm text-slate-300 font-medium mb-1">Valor de abertura (fundo de caixa, R$)</p>
              <p className="text-xs text-slate-500 mb-3">Valor inicial em cédulas/moedas deixado na gaveta para troco.</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">R$</span>
                  <input
                    value={vrAbertura}
                    onChange={e => setVrAbertura(e.target.value)}
                    placeholder="0,00"
                    className="w-44 bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-medium text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                {ultimoFechado && (
                  <button
                    type="button"
                    onClick={() => setVrAbertura(String(ultimoFechado.vr_fechamento || 0).replace('.', ','))}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5"
                    title="Usar o valor de fechamento da sessão anterior como fundo de abertura"
                  >
                    <span>💡 Sugerir Saldo Anterior ({R(Number(ultimoFechado.vr_fechamento || 0))})</span>
                  </button>
                )}
                <button
                  onClick={() => abrir()}
                  disabled={abrindo}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all shadow-md shadow-emerald-950/40"
                >
                  {abrindo ? 'Abrindo…' : 'Abrir Caixa'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FILTROS POR PERÍODO E FORMA DE PAGAMENTO ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Filtros de Caixa</h2>
            <span className="text-xs text-slate-400">· Filtre sessões e movimentações financeiras</span>
          </div>

          {/* Abas de Navegação */}
          <div className="inline-flex items-center p-1 bg-slate-950/80 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('sessoes')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sessoes'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Sessões de Caixa ({hist?.total ?? 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('vendas')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'vendas'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Movimentações / Vendas ({totaisPeriodo?.qtd_vendas ?? 0})</span>
            </button>
          </div>
        </div>

        {/* Linha de Controles de Filtros */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Botões de Atalho de Período (Presets) */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => aplicarPreset('hoje')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                dataPreset === 'hoje' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => aplicarPreset('7dias')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                dataPreset === '7dias' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 dias
            </button>
            <button
              onClick={() => aplicarPreset('mes')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                dataPreset === 'mes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => aplicarPreset('mes_anterior')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                dataPreset === 'mes_anterior' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mês Anterior
            </button>
            <button
              onClick={() => { setDataPreset('todos'); setDataInicio(''); setDataFim(''); setPage(1); setPageVendas(1) }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                dataPreset === 'todos' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
          </div>

          {/* Inputs de Data Personalizada */}
          <div className="flex items-center gap-2 bg-slate-950/60 p-1 px-2 rounded-xl border border-slate-800 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={dataInicio}
              onChange={e => { setDataInicio(e.target.value); setDataPreset(''); setPage(1); setPageVendas(1) }}
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              title="Data Início"
            />
            <span className="text-slate-500">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => { setDataFim(e.target.value); setDataPreset(''); setPage(1); setPageVendas(1) }}
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              title="Data Fim"
            />
          </div>

          {/* Select de Forma de Pagamento */}
          <div className="flex items-center gap-2 bg-slate-950/60 p-1 px-2.5 rounded-xl border border-slate-800 text-xs">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={formaPagto}
              onChange={e => { setFormaPagto(e.target.value); setPage(1); setPageVendas(1) }}
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {FORMAS_OPTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Botão Limpar Filtros */}
          {temFiltroAtivo && (
            <button
              onClick={limparFiltros}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors border border-slate-700"
            >
              <X className="w-3.5 h-3.5 text-rose-400" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* ── CARDS DE TOTAIS DO PERÍODO (INTERATIVOS) ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        {/* Resumo Consolidado do Período */}
        {totaisPeriodo && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-2 border-b border-slate-800/70">
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total em Vendas</span>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">{R(totalVendasPeriodo)}</p>
                <span className="text-[10px] text-slate-500">{totaisPeriodo.qtd_vendas ?? 0} vendas no período (sem outros)</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-rose-400 font-semibold uppercase tracking-wider">Contas a Pagar (Despesas)</span>
                <p className="text-lg font-bold text-rose-400 mt-0.5">{R(Number(totaisPeriodo.total_despesas ?? 0))}</p>
                <span className="text-[10px] text-rose-400/80">
                  {totaisPeriodo.qtd_despesas ?? 0} contas pagas ({R(Number(totaisPeriodo.despesas_dinheiro ?? 0))} em espécie)
                </span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-teal-400 font-semibold uppercase tracking-wider">Saldo Líquido do Caixa</span>
                <p className="text-lg font-bold text-teal-400 mt-0.5">
                  {R(Number(totaisPeriodo.saldo_liquido ?? (totalVendasPeriodo - Number(totaisPeriodo.total_despesas ?? 0))))}
                </p>
                <span className="text-[10px] text-teal-400/80">Vendas − Contas a Pagar</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-teal-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>Vendas por Meio de Pagamento no Período Selecionado</span>
            </h2>
            {formaPagto && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                Filtro ativo: {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Clique em um card para filtrar ou desmarcar
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Geral em Vendas */}
          <div
            onClick={() => setFormaPagto('')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === ''
                ? 'bg-slate-800/90 border-blue-500/80 shadow-md ring-1 ring-blue-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Vendas</span>
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <strong className="text-white text-base block font-bold">
              {R(totaisPeriodo ? totalVendasPeriodo : 0)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {totaisPeriodo?.qtd_vendas ?? 0} {totaisPeriodo?.qtd_vendas === 1 ? 'venda' : 'vendas'}
            </span>
          </div>

          {/* Dinheiro */}
          <div
            onClick={() => toggleFormaPagto('dinheiro')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === 'dinheiro'
                ? 'bg-emerald-950/60 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-emerald-800/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">💵 Dinheiro</span>
              <Banknote className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <strong className="text-emerald-300 text-base block font-bold">
              {R(totaisPeriodo?.dinheiro ?? 0)}
            </strong>
            <span className="text-[10px] text-emerald-500/80 block mt-0.5">
              Em espécie
            </span>
          </div>

          {/* Cartão */}
          <div
            onClick={() => toggleFormaPagto('cartao')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === 'cartao'
                ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-blue-800/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">💳 Cartão</span>
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <strong className="text-blue-300 text-base block font-bold">
              {R(totaisPeriodo?.cartao ?? 0)}
            </strong>
            <span className="text-[10px] text-blue-500/80 block mt-0.5">
              Crédito / Débito
            </span>
          </div>

          {/* PIX */}
          <div
            onClick={() => toggleFormaPagto('pix')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === 'pix'
                ? 'bg-teal-950/60 border-teal-500 shadow-md ring-1 ring-teal-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-teal-800/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider">⚡ PIX</span>
              <Zap className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <strong className="text-teal-300 text-base block font-bold">
              {R(totaisPeriodo?.pix ?? 0)}
            </strong>
            <span className="text-[10px] text-teal-500/80 block mt-0.5">
              Transferência instantânea
            </span>
          </div>

          {/* A Prazo */}
          <div
            onClick={() => toggleFormaPagto('prazo')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === 'prazo'
                ? 'bg-amber-950/60 border-amber-500 shadow-md ring-1 ring-amber-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-amber-800/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">📝 A Prazo</span>
              <FileText className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <strong className="text-amber-300 text-base block font-bold">
              {R(totaisPeriodo?.prazo ?? 0)}
            </strong>
            <span className="text-[10px] text-amber-500/80 block mt-0.5">
              Nota / Carnê
            </span>
          </div>

          {/* Outros / Ticket */}
          <div
            onClick={() => toggleFormaPagto('outros')}
            className={`cursor-pointer rounded-xl p-3 border transition-all ${
              formaPagto === 'outros'
                ? 'bg-purple-950/60 border-purple-500 shadow-md ring-1 ring-purple-500/40'
                : 'bg-slate-950/60 border-slate-800 hover:border-purple-800/60'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">🎟️ Outros</span>
              <Ticket className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <strong className="text-purple-300 text-base block font-bold">
              {R(totaisPeriodo?.outros ?? 0)}
            </strong>
            <span className="text-[10px] text-purple-400/80 block mt-0.5">
              Não entra no total
            </span>
          </div>
        </div>
      </div>

      {/* ── ABA 1: SESSÕES DE CAIXA ── */}
      {activeTab === 'sessoes' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Histórico de Sessões de Caixa</span>
                {formaPagto && (
                  <span className="text-xs font-normal text-blue-400">
                    (com vendas em {FORMAS_OPTS.find(f => f.value === formaPagto)?.label})
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {hist?.total ?? 0} sessões registradas no período selecionado
              </p>
            </div>

            {hist && hist.pages > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                >
                  Anterior
                </button>
                <span className="text-slate-400">Pág {page} de {hist.pages}</span>
                <button
                  disabled={page >= hist.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>

          {loadingHist ? (
            <div className="py-12 text-center text-slate-500 text-sm">Carregando sessões…</div>
          ) : (hist?.data ?? []).length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm space-y-1">
              <p>Nenhuma sessão de caixa encontrada para os filtros selecionados.</p>
              <p className="text-xs text-slate-600">Tente ajustar o período ou o filtro de forma de pagamento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950/40">
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3">Abertura / Fechamento</th>
                    <th className="px-5 py-3">Operador</th>
                    <th className="px-5 py-3 text-right">Fundo</th>
                    <th className="px-5 py-3 text-right">Total Vendas</th>
                    <th className="px-5 py-3 text-right text-rose-400">Despesas</th>
                    <th className="px-5 py-3 text-right text-teal-400">Saldo Líquido</th>
                    {formaPagto && (
                      <th className="px-5 py-3 text-right text-blue-400 bg-blue-950/20">
                        {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
                      </th>
                    )}
                    <th className="px-5 py-3 text-right">Conf. Caixa</th>
                    <th className="px-5 py-3 text-center">Diferença</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(hist?.data ?? []).map((c: CaixaSession) => {
                    const dif = c.diferenca_caixa ?? 0
                    const valorForma = formaPagto === 'dinheiro'
                      ? c.totais_por_forma?.dinheiro
                      : formaPagto === 'cartao'
                      ? c.totais_por_forma?.cartao
                      : formaPagto === 'pix'
                      ? c.totais_por_forma?.pix
                      : formaPagto === 'prazo'
                      ? c.totais_por_forma?.prazo
                      : formaPagto === 'outros'
                      ? c.totais_por_forma?.outros
                      : 0

                    return (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3 text-slate-300 whitespace-nowrap font-medium">
                          {fmtDate(c.data_abertura)}
                        </td>
                        <td className="px-5 py-3 text-slate-400 whitespace-nowrap text-xs">
                          <span>{c.hora_abertura}</span>
                          <span className="text-slate-600 mx-1">→</span>
                          <span>{c.hora_fechamento ?? 'em aberto'}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-300 whitespace-nowrap text-xs">
                          {c.nome_operador ?? 'Padrão'}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-300 whitespace-nowrap">
                          {R(Number(c.vr_abertura))}
                        </td>
                        <td className="px-5 py-3 text-right text-emerald-400 font-semibold whitespace-nowrap">
                          {R(
                            c.totais_por_forma
                              ? ((Number(c.totais_por_forma.dinheiro) || 0) +
                                 (Number(c.totais_por_forma.cartao) || 0) +
                                 (Number(c.totais_por_forma.pix) || 0) +
                                 (Number(c.totais_por_forma.prazo) || 0))
                              : Number(c.vr_fechado_turno || 0)
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-rose-400 font-medium whitespace-nowrap text-xs">
                          {Number(c.total_despesas || 0) > 0 ? `-${R(Number(c.total_despesas))}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-teal-400 font-semibold whitespace-nowrap text-xs">
                          {R(Number(c.saldo_liquido ?? (Number(c.vr_fechado_turno || 0) - Number(c.total_despesas || 0))))}
                        </td>

                        {formaPagto && (
                          <td className="px-5 py-3 text-right text-blue-300 font-bold whitespace-nowrap bg-blue-950/20">
                            {R(Number(valorForma || 0))}
                          </td>
                        )}

                        <td className="px-5 py-3 text-right text-slate-200 whitespace-nowrap font-medium">
                          {c.vr_fechamento ? R(Number(c.vr_fechamento)) : '—'}
                        </td>

                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          {c.status_caixa === 'F' && c.vr_fechamento !== null ? (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                              Math.abs(dif) < 0.01
                                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                                : dif > 0
                                ? 'bg-blue-950/60 text-blue-400 border-blue-800/50'
                                : 'bg-red-950/60 text-red-400 border-red-800/50'
                            }`}>
                              {Math.abs(dif) < 0.01 ? '✅ Bateu' : dif > 0 ? `+${R(dif)}` : `-${R(Math.abs(dif))}`}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            c.status_caixa === 'A'
                              ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {c.status_caixa === 'A' ? 'Aberto' : 'Fechado'}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setFilipetaSession(c)
                                setFilipetaModalOpen(true)
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700/60"
                              title="Imprimir Filipeta de Fechamento desta sessão"
                            >
                              <Printer className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                            <button
                              onClick={() => setDetalhesId(c.id)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-blue-400 hover:text-blue-300 font-medium rounded-lg transition-colors border border-slate-700/60"
                              title="Ver extrato e formas de pagamento desta sessão"
                            >
                              Extrato
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
      )}

      {/* ── ABA 2: MOVIMENTAÇÕES / VENDAS DETALHADAS ── */}
      {activeTab === 'vendas' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Movimentações de Vendas no Caixa</span>
                {formaPagto && (
                  <span className="text-xs font-normal text-blue-400">
                    · Filtrando por {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {vendasRes?.total ?? 0} vendas localizadas
              </p>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  value={searchVendas}
                  onChange={e => setSearchVendas(e.target.value)}
                  placeholder="Buscar controle ou cliente…"
                  className="bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
                />
              </div>

              {vendasRes && vendasRes.pages > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    disabled={pageVendas <= 1}
                    onClick={() => setPageVendas(p => p - 1)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                  >
                    ←
                  </button>
                  <span className="text-slate-400 px-1">{pageVendas} / {vendasRes.pages}</span>
                  <button
                    disabled={pageVendas >= vendasRes.pages}
                    onClick={() => setPageVendas(p => p + 1)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </div>

          {loadingVendas ? (
            <div className="py-12 text-center text-slate-500 text-sm">Carregando vendas…</div>
          ) : (vendasRes?.data ?? []).length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm space-y-1">
              <p>Nenhuma venda encontrada para os filtros selecionados.</p>
              <p className="text-xs text-slate-600">Verifique o período ou a forma de pagamento selecionada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950/40">
                    <th className="px-5 py-3">Controle</th>
                    <th className="px-5 py-3">Data / Hora</th>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-5 py-3">Formas de Pagamento</th>
                    <th className="px-5 py-3 text-right">Total da Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(vendasRes?.data ?? []).map((v: any) => {
                    return (
                      <tr key={v.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-slate-300 font-semibold">
                          {v.controle}
                        </td>
                        <td className="px-5 py-3 text-slate-400 whitespace-nowrap text-xs">
                          {fmtDate(v.data_venda)} às {v.hora_venda}
                        </td>
                        <td className="px-5 py-3 text-slate-200 truncate max-w-[200px]">
                          {v.nome_cliente || 'Consumidor Final'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Number(v.vr_dinheiro) > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-medium">
                                Dinheiro: {R(Number(v.vr_dinheiro))}
                              </span>
                            )}
                            {Number(v.vr_cartao) > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-medium">
                                Cartão: {R(Number(v.vr_cartao))}
                              </span>
                            )}
                            {Number(v.vr_pix) > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-800/60 font-medium">
                                PIX: {R(Number(v.vr_pix))}
                              </span>
                            )}
                            {Number(v.vr_prazo) > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-medium">
                                Prazo: {R(Number(v.vr_prazo))}
                              </span>
                            )}
                            {Number(v.vr_outros) > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60 font-medium">
                                Outros: {R(Number(v.vr_outros))}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                          {R(Number(v.vr_total))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DE DETALHES / EXTRATO DO CAIXA ── */}
      {detalhesId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📄 Extrato do Caixa #{detalhesId}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {detalhesModal?.caixa ? (
                    <>Abertura: {fmtDate(detalhesModal.caixa.data_abertura)} às {detalhesModal.caixa.hora_abertura} · Operador: {detalhesModal.caixa.nome_operador ?? 'Padrão'}</>
                  ) : 'Carregando detalhes…'}
                </p>
              </div>
              <button
                onClick={() => setDetalhesId(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {carregandoDetalhes || !detalhesModal ? (
                <div className="py-8 text-center text-slate-500 text-sm">Carregando dados da sessão…</div>
              ) : (
                <>
                  {/* Resumo de Valores */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5">
                      <span className="text-slate-400 block text-[11px]">Fundo de Caixa</span>
                      <strong className="text-white text-sm">{R(Number(detalhesModal.caixa.vr_abertura))}</strong>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-2.5">
                      <span className="text-emerald-300 block text-[11px]">Total Vendas</span>
                      <strong className="text-emerald-400 text-sm">
                        {R(
                          detalhesModal.totais
                            ? ((Number(detalhesModal.totais.dinheiro) || 0) +
                               (Number(detalhesModal.totais.cartao) || 0) +
                               (Number(detalhesModal.totais.pix) || 0) +
                               (Number(detalhesModal.totais.prazo) || 0))
                            : Number(detalhesModal.caixa.vr_fechado_turno || 0)
                        )}
                      </strong>
                    </div>
                    <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-2.5">
                      <span className="text-rose-300 block text-[11px]">Despesas Pagas</span>
                      <strong className="text-rose-400 text-sm">{R(Number(detalhesModal.totais.total_despesas ?? 0))}</strong>
                    </div>
                    <div className="bg-teal-950/30 border border-teal-800/40 rounded-xl p-2.5">
                      <span className="text-teal-300 block text-[11px]">Saldo Líquido</span>
                      <strong className="text-teal-400 text-sm">{R(Number(detalhesModal.totais.saldo_liquido ?? 0))}</strong>
                    </div>
                    <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-2.5">
                      <span className="text-blue-300 block text-[11px]">Esperado Dinheiro</span>
                      <strong className="text-blue-400 text-sm">{R(detalhesModal.totais.saldo_esperado_dinheiro)}</strong>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5">
                      <span className="text-slate-400 block text-[11px]">Conferido</span>
                      <strong className="text-white text-sm">
                        {detalhesModal.caixa.vr_fechamento ? R(Number(detalhesModal.caixa.vr_fechamento)) : '—'}
                      </strong>
                    </div>
                  </div>

                  {/* Formas de Pagamento */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Vendas por Meio de Pagamento
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-slate-400 block text-[11px]">💵 Dinheiro</span>
                        <strong className="text-slate-200 text-sm">{R(detalhesModal.totais.dinheiro)}</strong>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-slate-400 block text-[11px]">💳 Cartão</span>
                        <strong className="text-slate-200 text-sm">{R(detalhesModal.totais.cartao)}</strong>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-slate-400 block text-[11px]">⚡ PIX</span>
                        <strong className="text-slate-200 text-sm">{R(detalhesModal.totais.pix)}</strong>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-slate-400 block text-[11px]">📝 A Prazo</span>
                        <strong className="text-slate-200 text-sm">{R(detalhesModal.totais.prazo)}</strong>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-slate-400 block text-[11px]">🎟️ Outros</span>
                        <strong className="text-slate-200 text-sm">{R(detalhesModal.totais.outros)}</strong>
                        <span className="text-[10px] text-slate-500 block">Não soma no total</span>
                      </div>
                    </div>
                  </div>

                  {/* Despesas / Contas Pagas da Sessão */}
                  {detalhesModal.despesas && detalhesModal.despesas.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                        <span>Contas a Pagar Pagas nesta Sessão ({detalhesModal.despesas.length})</span>
                        <span className="text-xs font-semibold text-rose-400">Total: {R(Number(detalhesModal.totais.total_despesas ?? 0))}</span>
                      </h4>
                      <div className="bg-slate-950/40 rounded-xl border border-slate-800 overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-800 bg-slate-900/60">
                              <th className="px-3 py-2">Documento / Histórico</th>
                              <th className="px-3 py-2">Favorecido</th>
                              <th className="px-3 py-2">Forma</th>
                              <th className="px-3 py-2 text-right">Valor Pago</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {detalhesModal.despesas.map((d: any) => (
                              <tr key={d.id} className="hover:bg-slate-800/30">
                                <td className="px-3 py-2 text-slate-300 font-medium">
                                  {d.documento ? <span className="font-mono text-slate-400 mr-1.5">[{d.documento}]</span> : null}
                                  {d.historico || 'Despesa/Conta paga'}
                                </td>
                                <td className="px-3 py-2 text-slate-400 truncate max-w-[120px]">{d.favorecido || '—'}</td>
                                <td className="px-3 py-2 text-slate-400">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                                    {d.modo_lancamento || (d.id_modo_lancamento === 1 ? 'Dinheiro' : 'Outros')}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right text-rose-400 font-semibold whitespace-nowrap">
                                  -{R(Number(d.valor))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Diferença / Quebra */}
                  {detalhesModal.caixa.status_caixa === 'F' && Number(detalhesModal.caixa.vr_fechamento) > 0 && (
                    <div className={`p-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${
                      Math.abs(detalhesModal.totais.diferenca_caixa) < 0.01
                        ? 'bg-emerald-950/30 border-emerald-700/50 text-emerald-300'
                        : detalhesModal.totais.diferenca_caixa > 0
                        ? 'bg-blue-950/30 border-blue-700/50 text-blue-300'
                        : 'bg-red-950/30 border-red-700/50 text-red-300'
                    }`}>
                      <span>
                        {Math.abs(detalhesModal.totais.diferenca_caixa) < 0.01
                          ? '✅ O caixa bateu exatamente com o saldo esperado em dinheiro.'
                          : detalhesModal.totais.diferenca_caixa > 0
                          ? 'ℹ️ Houve sobra de dinheiro nesta conferência.'
                          : '⚠️ Houve quebra/falta de dinheiro nesta conferência.'}
                      </span>
                      <span className="font-mono text-sm font-bold">
                        {detalhesModal.totais.diferenca_caixa >= 0
                          ? `+${R(detalhesModal.totais.diferenca_caixa)}`
                          : `-${R(Math.abs(detalhesModal.totais.diferenca_caixa))}`}
                      </span>
                    </div>
                  )}

                  {/* Lista de Vendas da Sessão */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Vendas desta Sessão ({detalhesModal.vendas?.length ?? 0})
                    </h4>
                    {(!detalhesModal.vendas || detalhesModal.vendas.length === 0) ? (
                      <p className="text-xs text-slate-500 py-4 text-center bg-slate-950/30 rounded-xl border border-slate-800">
                        Nenhuma venda vinculada a esta sessão de caixa.
                      </p>
                    ) : (
                      <div className="bg-slate-950/40 rounded-xl border border-slate-800 overflow-hidden max-h-56 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-800 bg-slate-900/60">
                              <th className="px-3 py-2">Controle</th>
                              <th className="px-3 py-2">Cliente</th>
                              <th className="px-3 py-2 text-right">Dinheiro</th>
                              <th className="px-3 py-2 text-right">Cartão</th>
                              <th className="px-3 py-2 text-right">PIX</th>
                              <th className="px-3 py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {detalhesModal.vendas.map((v: any) => (
                              <tr key={v.id} className="hover:bg-slate-800/30">
                                <td className="px-3 py-2 text-slate-400 font-mono">{v.controle}</td>
                                <td className="px-3 py-2 text-slate-300 truncate max-w-[140px]">{v.nome_cliente}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{v.vr_dinheiro ? R(Number(v.vr_dinheiro)) : '—'}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{v.vr_cartao ? R(Number(v.vr_cartao)) : '—'}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{v.vr_pix ? R(Number(v.vr_pix)) : '—'}</td>
                                <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{R(Number(v.vr_total))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setDetalhesId(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg transition-colors"
              >
                Fechar Extrato
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes do PIX */}
      {showPixModal && status && status.lista_pix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Recebimentos via PIX</h3>
                  <p className="text-xs text-slate-400">{status.lista_pix.length} transações nesta sessão de caixa</p>
                </div>
              </div>
              <button
                onClick={() => setShowPixModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="flex justify-between items-center p-3 rounded-xl bg-teal-950/40 border border-teal-800/50 mb-3">
                <span className="text-xs font-semibold text-teal-300">Total Acumulado em PIX:</span>
                <strong className="text-lg font-bold text-teal-400 font-mono">
                  {R(Number(status.totais_por_forma?.pix || 0))}
                </strong>
              </div>

              <div className="space-y-2">
                {status.lista_pix.map(p => (
                  <div
                    key={p.controle}
                    className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{p.nome_cliente}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        {p.modelo && <span className="text-amber-400 font-medium">{p.modelo}</span>}
                        <span>Controle: #{p.controle}</span>
                      </div>
                    </div>
                    <strong className="text-base font-bold text-teal-400 font-mono">
                      {R(p.vr_pix)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPixModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Contagem de Cédulas e Moedas da Gaveta */}
      <ContadorCedulasModal
        isOpen={contadorModalOpen}
        onClose={() => setContadorModalOpen(false)}
        onApply={(total) => {
          setVrFechamento(total.toFixed(2).replace('.', ','))
        }}
      />

      {/* Modal Filipeta de Fechamento de Caixa */}
      {filipetaSession && (
        <FilipetaFechamentoModal
          isOpen={filipetaModalOpen}
          onClose={() => {
            setFilipetaModalOpen(false)
            setFilipetaSession(null)
          }}
          session={filipetaSession}
          lojaNome={currentTenant?.nome || 'Loja'}
          valorContadoDinheiro={temValorDigitado ? fechamentoNum : undefined}
        />
      )}
    </div>
  )
}
