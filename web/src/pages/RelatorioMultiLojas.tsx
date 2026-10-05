import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import {
  Building2,
  Calendar,
  Printer,
  TrendingUp,
  Receipt,
  CircleDollarSign,
  Wallet,
  Wrench,
  Percent,
  RefreshCw,
  Trophy,
  Target,
  Sparkles,
  Store,
  Layers,
} from 'lucide-react'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const Pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

function getDatePresets() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  const pad = (n: number) => String(n).padStart(2, '0')
  const toStr = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  const hoje = toStr(now)

  const ontemDate = new Date(y, m, d - 1)
  const ontem = toStr(ontemDate)

  const seteDiasDate = new Date(y, m, d - 6)
  const seteDias = toStr(seteDiasDate)

  const mesAtualInicio = `${y}-${pad(m + 1)}-01`

  const mesAntInicio = toStr(new Date(y, m - 1, 1))
  const mesAntFim = toStr(new Date(y, m, 0))

  const anoAtualInicio = `${y}-01-01`

  return {
    hoje: { inicio: hoje, fim: hoje, label: 'Hoje' },
    ontem: { inicio: ontem, fim: ontem, label: 'Ontem' },
    seteDias: { inicio: seteDias, fim: hoje, label: 'Últimos 7 dias' },
    mesAtual: { inicio: mesAtualInicio, fim: hoje, label: 'Mês Atual' },
    mesAnterior: { inicio: mesAntInicio, fim: mesAntFim, label: 'Mês Anterior' },
    anoAtual: { inicio: anoAtualInicio, fim: hoje, label: 'Ano Atual' },
  }
}

export default function RelatorioMultiLojas() {
  const presets = getDatePresets()
  const [selectedPreset, setSelectedPreset] = useState<string>('mesAtual')
  const [dataInicio, setDataInicio] = useState(presets.mesAtual.inicio)
  const [dataFim, setDataFim] = useState(presets.mesAtual.fim)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['relatorio-multi-lojas', dataInicio, dataFim],
    queryFn: () => erpApi.relatorioMultiLojas({ data_inicio: dataInicio, data_fim: dataFim }),
  })

  const handlePresetClick = (key: keyof typeof presets) => {
    setSelectedPreset(key)
    setDataInicio(presets[key].inicio)
    setDataFim(presets[key].fim)
  }

  const handleCustomDateChange = (inicio: string, fim: string) => {
    setSelectedPreset('custom')
    setDataInicio(inicio)
    setDataFim(fim)
  }

  const handlePrint = () => {
    window.print()
  }

  const consolidados = data?.consolidados
  const lojas = data?.lojas || []

  // Cores de share para barra comparativa
  const STORE_COLORS = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-fuchsia-500',
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:max-w-none">
      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 print:border-none print:pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl text-white shadow-lg shadow-blue-600/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Comparativo Consolidado Multi-Lojas
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Matriz vs. Filiais
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Visão executiva unificada de faturamento, rentabilidade operacional e produtividade de todas as filiais
              </p>
            </div>
          </div>
        </div>

        {/* Ações de Topo */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700/80 transition-all shadow-sm"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-blue-400' : ''}`} />
            <span>Atualizar</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-600/20"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS TEMPORAIS ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg shadow-black/20 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Presets Rápidos */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(presets) as (keyof typeof presets)[]).map((key) => {
              const active = selectedPreset === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePresetClick(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/40'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
                  }`}
                >
                  {presets[key].label}
                </button>
              )
            })}
          </div>

          {/* Seletores Customizados de Data */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>De:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => handleCustomDateChange(e.target.value, dataFim)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
            <span>Até:</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => handleCustomDateChange(dataInicio, e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Indicador de carregamento */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">Consolidando métricas e relatórios de todas as filiais…</p>
        </div>
      )}

      {!isLoading && consolidados && (
        <>
          {/* ── CARDS DE KPI: CONSOLIDADO GERAL DA REDE ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Faturamento Total */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-blue-500/30 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Faturamento Rede</span>
                <CircleDollarSign className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-extrabold text-blue-400 font-mono tracking-tight">
                {R(consolidados.faturamento_total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <span>Total de</span>
                <strong className="text-slate-300 font-mono">{consolidados.qtd_vendas_total}</strong>
                <span>vendas</span>
              </p>
            </div>

            {/* Ticket Médio */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Ticket Médio</span>
                <Target className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-xl font-extrabold text-indigo-300 font-mono tracking-tight">
                {R(consolidados.ticket_medio_geral)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Média por transação
              </p>
            </div>

            {/* Despesas Operacionais */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Despesas Totais</span>
                <Wallet className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-xl font-extrabold text-rose-400 font-mono tracking-tight">
                {R(consolidados.despesas_total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Saídas e contas pagas
              </p>
            </div>

            {/* Lucro Operacional Líquido */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Resultado Líquido</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <p className={`text-xl font-extrabold font-mono tracking-tight ${consolidados.lucro_operacional_total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {R(consolidados.lucro_operacional_total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <span>Margem:</span>
                <strong className={`font-mono font-semibold ${consolidados.margem_lucro_geral_pct >= 15 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {Pct(consolidados.margem_lucro_geral_pct)}
                </strong>
              </p>
            </div>

            {/* Ordens de Serviço (Oficina) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Oficina (OS)</span>
                <Wrench className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xl font-extrabold text-amber-300 font-mono tracking-tight">
                {R(consolidados.os_faturamento_total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {consolidados.os_encerradas_total} OSs encerradas
              </p>
            </div>

            {/* Descontos Concedidos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-black/20">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Descontos Totais</span>
                <Percent className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-extrabold text-purple-300 font-mono tracking-tight">
                {R(consolidados.descontos_total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Concessões na rede
              </p>
            </div>
          </div>

          {/* ── DESTAQUES / RANKINGS DO GRUPO ── */}
          {consolidados.destaques && (consolidados.destaques.maior_faturamento || consolidados.destaques.maior_ticket_medio || consolidados.destaques.maior_margem) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {consolidados.destaques.maior_faturamento && (
                <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-800/40 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 shrink-0 border border-blue-500/20">
                    <Trophy className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Maior Faturamento</span>
                    <p className="text-sm font-bold text-white truncate">{consolidados.destaques.maior_faturamento.nome}</p>
                    <p className="text-xs text-blue-400 font-mono font-semibold">{R(consolidados.destaques.maior_faturamento.valor)}</p>
                  </div>
                </div>
              )}

              {consolidados.destaques.maior_ticket_medio && (
                <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-800/40 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 shrink-0 border border-indigo-500/20">
                    <Target className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Maior Ticket Médio</span>
                    <p className="text-sm font-bold text-white truncate">{consolidados.destaques.maior_ticket_medio.nome}</p>
                    <p className="text-xs text-indigo-400 font-mono font-semibold">{R(consolidados.destaques.maior_ticket_medio.valor)} / venda</p>
                  </div>
                </div>
              )}

              {consolidados.destaques.maior_margem && (
                <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0 border border-emerald-500/20">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Melhor Rentabilidade</span>
                    <p className="text-sm font-bold text-white truncate">{consolidados.destaques.maior_margem.nome}</p>
                    <p className="text-xs text-emerald-400 font-mono font-semibold">{Pct(consolidados.destaques.maior_margem.valor)} de margem</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PARTICIPAÇÃO NO FATURAMENTO (SHARE INTERNO) ── */}
          {consolidados.faturamento_total > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg shadow-black/20 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Participação por Loja no Faturamento da Rede (Share Interno)
                </span>
                <span className="text-slate-500 font-mono">{R(consolidados.faturamento_total)} = 100%</span>
              </div>

              {/* Barra segmentada */}
              <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                {lojas.map((l, i) => {
                  const share = l.faturamento.share_pct
                  if (share <= 0) return null
                  const color = STORE_COLORS[i % STORE_COLORS.length]
                  return (
                    <div
                      key={l.tenant.id}
                      style={{ width: `${share}%` }}
                      className={`${color} h-full transition-all duration-500 relative group`}
                      title={`${l.tenant.nome}: ${R(l.faturamento.total)} (${share}%)`}
                    />
                  )
                })}
              </div>

              {/* Legendas das lojas com cores correspondentes */}
              <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                {lojas.map((l, i) => {
                  const color = STORE_COLORS[i % STORE_COLORS.length]
                  return (
                    <div key={l.tenant.id} className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded-full ${color}`} />
                      <span className="text-slate-300 font-medium">{l.tenant.nome}:</span>
                      <span className="text-slate-400 font-mono">{Pct(l.faturamento.share_pct)}</span>
                      <span className="text-slate-500 font-mono text-[11px]">({R(l.faturamento.total)})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── TABELA COMPARATIVA DETALHADA: MATRIZ VS. FILIAIS ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-400" />
                  Tabela Comparativa Direta entre Unidades
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confronte os resultados de cada loja no período selecionado
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {lojas.length} {lojas.length === 1 ? 'unidade' : 'unidades'} cadastradas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Unidade / Tipo</th>
                    <th className="py-3 px-4 text-right">Faturamento</th>
                    <th className="py-3 px-4 text-right">Share (%)</th>
                    <th className="py-3 px-4 text-center">Vendas</th>
                    <th className="py-3 px-4 text-right">Ticket Médio</th>
                    <th className="py-3 px-4 text-right">Despesas</th>
                    <th className="py-3 px-4 text-right">Resultado Líquido</th>
                    <th className="py-3 px-4 text-center">Margem</th>
                    <th className="py-3 px-4 text-right">Oficina (OS)</th>
                    <th className="py-3 px-4 text-center">Caixa Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {lojas.map((l) => {
                    const isMatriz = l.tenant.is_matriz
                    const faturamento = l.faturamento.total
                    const lucro = l.resultado.lucro_operacional
                    const margem = l.resultado.margem_lucro_pct

                    return (
                      <tr key={l.tenant.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* Nome da Loja */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{l.tenant.nome}</span>
                            {isMatriz ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                Matriz
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                Filial
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{l.tenant.slug}</span>
                        </td>

                        {/* Faturamento */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-400">
                          {R(faturamento)}
                        </td>

                        {/* Share % */}
                        <td className="py-3.5 px-4 text-right font-mono">
                          <div className="inline-flex items-center gap-1.5">
                            <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, l.faturamento.share_pct)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-slate-300">{Pct(l.faturamento.share_pct)}</span>
                          </div>
                        </td>

                        {/* Qtd Vendas */}
                        <td className="py-3.5 px-4 text-center font-mono font-medium text-slate-300">
                          {l.faturamento.qtd_vendas}
                        </td>

                        {/* Ticket Médio */}
                        <td className="py-3.5 px-4 text-right font-mono text-indigo-300">
                          {R(l.faturamento.ticket_medio)}
                        </td>

                        {/* Despesas */}
                        <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                          {R(l.despesas.total)}
                        </td>

                        {/* Lucro Líquido */}
                        <td className={`py-3.5 px-4 text-right font-mono font-bold ${lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {R(lucro)}
                        </td>

                        {/* Margem */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                            margem >= 20
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                              : margem >= 10
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          }`}>
                            {Pct(margem)}
                          </span>
                        </td>

                        {/* OS */}
                        <td className="py-3.5 px-4 text-right font-mono">
                          <div className="text-amber-300 font-semibold">{R(l.oficina_os.faturamento)}</div>
                          <div className="text-[10px] text-slate-500">{l.oficina_os.qtd_encerradas} concluídas</div>
                        </td>

                        {/* Caixa Atual */}
                        <td className="py-3.5 px-4 text-center">
                          {l.caixa_atual ? (
                            l.caixa_atual.status === 'A' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                                <span>🟢</span> Aberto
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                <span>🔴</span> Fechado
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* Rodapé Totalizador */}
                <tfoot className="bg-slate-950 border-t-2 border-slate-700 text-white font-bold">
                  <tr>
                    <td className="py-3.5 px-4 uppercase tracking-wider text-slate-300">
                      Total Consolidado da Rede
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-blue-400 text-sm">
                      {R(consolidados.faturamento_total)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                      100,0%
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-200">
                      {consolidados.qtd_vendas_total}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-indigo-300">
                      {R(consolidados.ticket_medio_geral)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                      {R(consolidados.despesas_total)}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono text-sm ${consolidados.lucro_operacional_total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {R(consolidados.lucro_operacional_total)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-300">
                      {Pct(consolidados.margem_lucro_geral_pct)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                      {R(consolidados.os_faturamento_total)}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-500">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── CARDS INDIVIDUAIS POR LOJA COM BREAKDOWN DE PAGAMENTOS ── */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-400" />
              Radiografia Operacional e Formas de Pagamento por Unidade
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lojas.map((l) => {
                const isMatriz = l.tenant.is_matriz
                const totalPagto = l.faturamento.total
                const pag = l.pagamentos

                return (
                  <div
                    key={l.tenant.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-base">{l.tenant.nome}</h3>
                            {isMatriz ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                Matriz
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                Filial
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{l.tenant.slug}</p>
                        </div>

                        {l.caixa_atual ? (
                          <div className="text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              l.caixa_atual.status === 'A'
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              Caixa {l.caixa_atual.status === 'A' ? 'Aberto' : 'Fechado'}
                            </span>
                            {l.caixa_atual.status === 'A' && l.caixa_atual.hora_abertura && (
                              <p className="text-[10px] text-slate-500 mt-0.5">desde {l.caixa_atual.hora_abertura.slice(0, 5)}</p>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Métricas Principais da Unidade */}
                      <div className="grid grid-cols-2 gap-2.5 my-3">
                        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Faturamento</span>
                          <p className="text-sm font-bold text-blue-400 font-mono">{R(l.faturamento.total)}</p>
                          <span className="text-[10px] text-slate-500">{l.faturamento.qtd_vendas} vendas</span>
                        </div>
                        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Resultado Líquido</span>
                          <p className={`text-sm font-bold font-mono ${l.resultado.lucro_operacional >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {R(l.resultado.lucro_operacional)}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono">{Pct(l.resultado.margem_lucro_pct)} margem</span>
                        </div>
                      </div>

                      {/* Breakdown de Formas de Pagamento */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Formas de Pagamento Recebidas
                        </span>

                        <PaymentProgressRow label="💵 Dinheiro" value={pag.dinheiro} total={totalPagto} color="bg-emerald-500" />
                        <PaymentProgressRow label="💳 Cartão" value={pag.cartao} total={totalPagto} color="bg-blue-500" />
                        <PaymentProgressRow label="⚡ PIX" value={pag.pix} total={totalPagto} color="bg-amber-500" />
                        <PaymentProgressRow label="📝 A Prazo (Notinha)" value={pag.prazo} total={totalPagto} color="bg-purple-500" />
                        {pag.outros > 0 && (
                          <PaymentProgressRow label="🔄 Outros" value={pag.outros} total={totalPagto} color="bg-slate-500" />
                        )}
                      </div>
                    </div>

                    {/* Resumo de Oficina & Descontos no rodapé do Card */}
                    <div className="border-t border-slate-800 pt-3 text-[11px] space-y-1.5 text-slate-400">
                      <div className="flex justify-between">
                        <span>Faturamento em OS (Oficina):</span>
                        <span className="text-amber-300 font-mono font-semibold">{R(l.oficina_os.faturamento)} ({l.oficina_os.qtd_encerradas} OS)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Descontos Concedidos:</span>
                        <span className="text-purple-300 font-mono font-semibold">{R(l.descontos.total)} ({Pct(l.descontos.pct_medio)})</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Despesas Operacionais:</span>
                        <span className="text-rose-400 font-mono font-semibold">{R(l.despesas.total)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PaymentProgressRow({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-mono">
          {R(value)} <span className="text-slate-500 text-[10px]">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}
