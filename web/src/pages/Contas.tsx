import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { Lancamento } from '../types'
import { useAuth } from '../contexts/AuthContext'
import {
  DollarSign, CheckCircle2, Clock, AlertTriangle,
  CreditCard, Banknote, Zap, FileText, Calendar, Filter, X
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

const STATUS_OPTS = [
  { value: '',  label: 'Todos' },
  { value: '0', label: 'Em aberto' },
  { value: '1', label: 'Recebido' },
]

const FORMAS_OPTS = [
  { value: '',         label: 'Todas as formas' },
  { value: 'dinheiro', label: '💵 Dinheiro' },
  { value: 'cartao',   label: '💳 Cartão' },
  { value: 'pix',      label: '⚡ PIX' },
  { value: 'nota',     label: '📝 Nota / A Prazo' },
  { value: 'outros',   label: '🔄 Outros' },
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

export default function Contas() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()

  const [status, setStatus] = useState('0')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  // Filtros de Data e Forma de Pagamento
  const [dataPreset, setDataPreset] = useState<string>('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]       = useState('')
  const [formaPagto, setFormaPagto] = useState<string>('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const aplicarPreset = (p: string) => {
    setDataPreset(p)
    const { inicio, fim } = getDatesPreset(p)
    setDataInicio(inicio)
    setDataFim(fim)
    setPage(1)
  }

  const limparDatas = () => {
    setDataPreset('')
    setDataInicio('')
    setDataFim('')
    setPage(1)
  }

  const toggleForma = (forma: string) => {
    setFormaPagto(prev => (prev === forma ? '' : forma))
    setPage(1)
  }

  const { data: res, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['contas', tid, status, debouncedSearch, dataInicio, dataFim, formaPagto, page],
    queryFn: () => erpApi.contas({
      status,
      search: debouncedSearch,
      data_inicio: dataInicio,
      data_fim: dataFim,
      forma_pagto: formaPagto,
      page,
    }),
    placeholderData: keepPreviousData,
  })

  const { mutate: receber, isPending: recebendo } = useMutation({
    mutationFn: (id: number) => erpApi.receberConta(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contas'] }),
  })

  const lancamentos = res?.data ?? []
  const totais = res?.totais
  const somaPagina = lancamentos.reduce((acc, l) => acc + Number(l.valor || 0), 0)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── CABEÇALHO ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <DollarSign className="w-7 h-7 text-emerald-400" />
            <span>Financeiro — Contas a Receber</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestão de recebimentos, fluxo de caixa e formas de pagamento
          </p>
        </div>
      </div>

      {/* ── CARDS DE TOTAIS GERAIS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Filtrado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Geral {formaPagto ? `(${FORMAS_OPTS.find(f => f.value === formaPagto)?.label || ''})` : ''}</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold text-white">
            {R(totais?.total ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 font-mono">
            {res?.total ?? 0} lançamento(s)
          </p>
        </div>

        {/* Total Recebido */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <span>Recebido</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {R(totais?.total_recebido ?? 0)}
          </p>
          <p className="text-[11px] text-emerald-500/80 font-medium">
            Confirmados em caixa
          </p>
        </div>

        {/* Total Em Aberto / Pendente */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <span>A Receber</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400">
            {R(totais?.total_pendente ?? 0)}
          </p>
          <p className="text-[11px] text-amber-500/80 font-medium">
            Pendentes de recebimento
          </p>
        </div>

        {/* Total Vencido */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-red-400 text-xs font-semibold uppercase tracking-wider">
            <span>Vencidos</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-400">
            {R(totais?.total_vencido ?? 0)}
          </p>
          <p className="text-[11px] text-red-500/80 font-medium">
            Com prazo expirado
          </p>
        </div>
      </div>

      {/* ── CARDS DE FORMAS DE PAGAMENTO SOMADAS (INTERATIVOS) ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <span>Formas de Pagamento Somadas no Período</span>
            </h2>
            {formaPagto && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                Filtro ativo: {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Clique em uma forma para filtrar ou desmarcar
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Dinheiro */}
          <button
            type="button"
            onClick={() => toggleForma('dinheiro')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'dinheiro'
                ? 'bg-emerald-950/80 border-2 border-emerald-400 shadow-lg shadow-emerald-950/40 ring-2 ring-emerald-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Dinheiro</p>
                {formaPagto === 'dinheiro' && (
                  <span className="text-[9px] bg-emerald-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.dinheiro ?? 0)}
              </p>
            </div>
          </button>

          {/* Cartão */}
          <button
            type="button"
            onClick={() => toggleForma('cartao')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'cartao'
                ? 'bg-blue-950/80 border-2 border-blue-400 shadow-lg shadow-blue-950/40 ring-2 ring-blue-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Cartão</p>
                {formaPagto === 'cartao' && (
                  <span className="text-[9px] bg-blue-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.cartao ?? 0)}
              </p>
            </div>
          </button>

          {/* PIX */}
          <button
            type="button"
            onClick={() => toggleForma('pix')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'pix'
                ? 'bg-teal-950/80 border-2 border-teal-400 shadow-lg shadow-teal-950/40 ring-2 ring-teal-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-teal-950/60 border border-teal-800/60 flex items-center justify-center text-teal-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">PIX</p>
                {formaPagto === 'pix' && (
                  <span className="text-[9px] bg-teal-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.pix ?? 0)}
              </p>
            </div>
          </button>

          {/* Nota / A Prazo */}
          <button
            type="button"
            onClick={() => toggleForma('nota')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'nota'
                ? 'bg-amber-950/80 border-2 border-amber-400 shadow-lg shadow-amber-950/40 ring-2 ring-amber-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Nota / A Prazo</p>
                {formaPagto === 'nota' && (
                  <span className="text-[9px] bg-amber-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.nota ?? 0)}
              </p>
            </div>
          </button>

          {/* Outros / Cheque */}
          <button
            type="button"
            onClick={() => toggleForma('outros')}
            className={`text-left rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
              formaPagto === 'outros'
                ? 'bg-purple-950/80 border-2 border-purple-400 shadow-lg shadow-purple-950/40 ring-2 ring-purple-500/30 scale-[1.02]'
                : 'bg-slate-800/60 border border-slate-700/60 hover:border-slate-500 hover:bg-slate-800/90'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] text-slate-400 font-medium truncate">Outros</p>
                {formaPagto === 'outros' && (
                  <span className="text-[9px] bg-purple-400 text-slate-950 px-1 rounded font-bold uppercase">Ativo</span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {R(totais?.por_forma_pagamento?.outros ?? 0)}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS (STATUS, DATAS E BUSCA) ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        {/* Linha 1: Status + Atalhos de Data */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Status Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
            {STATUS_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => { setStatus(o.value); setPage(1) }}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  status === o.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Atalhos Rápidos de Data */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Período:</span>
            </span>
            {[
              { id: '',             label: 'Todas as datas' },
              { id: 'hoje',         label: 'Hoje' },
              { id: '7dias',        label: '7 dias' },
              { id: 'mes',          label: 'Este mês' },
              { id: 'mes_anterior', label: 'Mês anterior' },
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => aplicarPreset(preset.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  dataPreset === preset.id && (dataInicio || preset.id === '')
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: Inputs de Data Customizada + Filtro Forma Pagto + Campo de Busca */}
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-800/80">
          {/* De: */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">De:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={e => {
                setDataInicio(e.target.value)
                setDataPreset('custom')
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Até: */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Até:</span>
            <input
              type="date"
              value={dataFim}
              onChange={e => {
                setDataFim(e.target.value)
                setDataPreset('custom')
                setPage(1)
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {(dataInicio || dataFim) && (
            <button
              onClick={limparDatas}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors"
              title="Limpar filtro de datas"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar data</span>
            </button>
          )}

          {/* Filtro por Forma de Pagamento Select */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <span>Forma:</span>
            </span>
            <div className="relative">
              <select
                value={formaPagto}
                onChange={e => {
                  setFormaPagto(e.target.value)
                  setPage(1)
                }}
                className={`bg-slate-800 border rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-semibold focus:outline-none focus:border-blue-500 appearance-none cursor-pointer transition-colors ${
                  formaPagto
                    ? 'text-blue-300 border-blue-500 bg-blue-950/50 ring-1 ring-blue-500/30'
                    : 'text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                {FORMAS_OPTS.map(f => (
                  <option key={f.value} value={f.value} className="bg-slate-900 text-white">
                    {f.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {formaPagto && (
              <button
                onClick={() => { setFormaPagto(''); setPage(1) }}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-xs flex items-center gap-1 transition-colors"
                title="Limpar filtro de forma de pagamento"
              >
                <X className="w-3.5 h-3.5" />
                <span>Todas</span>
              </button>
            )}
          </div>

          {/* Busca por cliente, histórico ou controle */}
          <div className="relative flex-1 min-w-56">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setDebouncedSearch(search)
                  setPage(1)
                }
              }}
              placeholder="Buscar por cliente, histórico ou controle…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {search !== debouncedSearch && (
              <span className="absolute right-3 top-2 text-[10px] text-blue-400 animate-pulse font-medium">
                Buscando…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── TABELA DE LANÇAMENTOS ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {isError ? (
          <div className="py-12 text-center text-red-400 text-sm space-y-2">
            <p className="font-semibold">Erro ao carregar dados financeiros.</p>
            <p className="text-xs text-slate-500">{(error as any)?.message || 'Falha de comunicação com o servidor'}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors border border-slate-700"
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando lançamentos…</div>
        ) : lancamentos.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm space-y-1">
            <p>Nenhum lançamento encontrado para os filtros selecionados.</p>
            <p className="text-xs text-slate-600">Tente ajustar o período ou o status da busca.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Histórico / Controle</th>
                <th className="px-5 py-3 text-center">Forma Pagto</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center w-28">Status</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lancamentos.map((l: Lancamento) => {
                const vencido = l.status === 0 && new Date(l.data_lancamento) < new Date()
                const modo = String(l.modo_lancamento || '').toUpperCase()

                return (
                  <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <span className={vencido ? 'text-red-400 font-medium' : 'text-slate-300'}>
                        {fmtDate(l.data_lancamento)}
                      </span>
                      {vencido && <span className="ml-1 text-[10px] text-red-500 uppercase font-semibold">(vencido)</span>}
                    </td>

                    <td className="px-5 py-3 text-slate-200 max-w-[200px] truncate font-medium">
                      {l.nome_cliente || 'Consumidor Final'}
                    </td>

                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[240px] truncate">
                      <span>{l.historico || '—'}</span>
                    </td>

                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        modo.includes('PIX')
                          ? 'bg-teal-950/70 text-teal-300 border-teal-800/60'
                          : modo.includes('CART')
                          ? 'bg-blue-950/70 text-blue-300 border-blue-800/60'
                          : modo.includes('DINHEIRO')
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                          : modo.includes('NOTA') || modo.includes('DUPLICATA')
                          ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {l.modo_lancamento || '—'}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-right font-bold text-emerald-400">
                      {R(Number(l.valor))}
                    </td>

                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        l.status === 1
                          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                          : vencido
                          ? 'bg-red-900/30 text-red-400 border border-red-800/40'
                          : 'bg-amber-900/20 text-amber-400 border border-amber-800/40'
                      }`}>
                        {l.status === 1 ? 'Recebido' : vencido ? 'Vencido' : 'Pendente'}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-center">
                      {l.status === 0 && (
                        <button
                          onClick={() => receber(l.id)}
                          disabled={recebendo}
                          className="px-3 py-1 rounded-lg bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-300 text-xs font-semibold border border-emerald-700/60 transition-colors disabled:opacity-50"
                        >
                          Receber
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-800/80 text-white font-semibold">
                <td colSpan={4} className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-slate-300 font-bold">
                  {(res?.pages ?? 0) > 1 ? (
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-white">Soma Total Geral:</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        Nesta página ({lancamentos.length}): {R(somaPagina)}
                      </span>
                    </div>
                  ) : (
                    <span>Soma Total:</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right font-black text-emerald-400 text-base tabular-nums">
                  {R(totais?.total ?? 0)}
                </td>
                <td colSpan={2} className="px-5 py-3.5 text-center text-xs text-slate-400">
                  {formaPagto ? (
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                      {FORMAS_OPTS.find(f => f.value === formaPagto)?.label}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-mono">
                      {res?.total ?? 0} item(ns)
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {(res?.pages ?? 0) > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>{res?.total} lançamentos</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
              >
                ←
              </button>
              <span className="px-2 py-1 text-slate-400">{page} / {res?.pages}</span>
              <button
                disabled={page >= (res?.pages ?? 1)}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
