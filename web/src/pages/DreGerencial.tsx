import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Calendar,
  Printer,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Building2,
  Receipt,
  Scale,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  CheckCircle2,
  X,
  Target,
} from 'lucide-react'
import { erpApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { DreLinha, DreItemLinhaFilho, DreLancamentoItem, DreHistoricoMes } from '../types'

const R = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const P = (v: number) => `${(v || 0).toFixed(2)}%`
const fmtData = (d?: string | null) => {
  if (!d) return '—'
  const [ano, mes, dia] = d.split('T')[0].split('-')
  return `${dia}/${mes}/${ano}`
}

type PeriodoPreset =
  | 'este_mes'
  | 'mes_anterior'
  | 'trimestre_atual'
  | 'ano_atual'
  | 'ultimos_12_meses'
  | 'personalizado'

function getPresetDates(preset: PeriodoPreset): { inicio: string; fim: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const toIso = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  if (preset === 'este_mes') {
    const pDia = new Date(y, m, 1)
    const uDia = new Date(y, m + 1, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'mes_anterior') {
    const pDia = new Date(y, m - 1, 1)
    const uDia = new Date(y, m, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'trimestre_atual') {
    const trimInicioMes = Math.floor(m / 3) * 3
    const pDia = new Date(y, trimInicioMes, 1)
    const uDia = new Date(y, trimInicioMes + 3, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'ano_atual') {
    const pDia = new Date(y, 0, 1)
    const uDia = new Date(y, 11, 31)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  if (preset === 'ultimos_12_meses') {
    const pDia = new Date(y, m - 11, 1)
    const uDia = new Date(y, m + 1, 0)
    return { inicio: toIso(pDia), fim: toIso(uDia) }
  }
  return { inicio: '', fim: '' }
}

export default function DreGerencial() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Filtros de período
  const [preset, setPreset] = useState<PeriodoPreset>('este_mes')
  const defaultDates = useMemo(() => getPresetDates('este_mes'), [])
  const [dataInicio, setDataInicio] = useState<string>(defaultDates.inicio)
  const [dataFim, setDataFim] = useState<string>(defaultDates.fim)
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [aliquotaImposto, setAliquotaImposto] = useState<number>(6.0)

  // Expand / collapse das linhas pai do DRE
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    '1': true,
    '2': true,
    '4': true,
    '6': true,
    '8': false,
  })

  // Modal de drilldown de lançamentos de despesas
  const [drillModalCategory, setDrillModalCategory] = useState<string | null>(null)

  // Query DRE
  const {
    data: dre,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['erp-dre', tid, dataInicio, dataFim, regime, aliquotaImposto],
    queryFn: () =>
      erpApi.getDre({
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        regime,
        aliquota_imposto: aliquotaImposto,
      }),
  })

  // Manipulação de presets de data
  const handlePresetChange = (newPreset: PeriodoPreset) => {
    setPreset(newPreset)
    if (newPreset !== 'personalizado') {
      const dates = getPresetDates(newPreset)
      setDataInicio(dates.inicio)
      setDataFim(dates.fim)
    }
  }

  const toggleRow = (codigo: string) => {
    setExpandedRows((prev) => ({ ...prev, [codigo]: !prev[codigo] }))
  }

  const expandAll = () => {
    setExpandedRows({ '1': true, '2': true, '4': true, '6': true, '8': true })
  }

  const collapseAll = () => {
    setExpandedRows({})
  }

  // Impressão Executiva A4 do DRE
  const handlePrint = () => {
    if (!dre) return
    const win = window.open('', '_blank', 'width=950,height=950')
    if (!win) return

    const ind = dre.indicadores
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>DRE Gerencial - ${currentTenant?.nome || 'Oficina'}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 15px; font-size: 11px; }
          .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 18px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .sub { color: #64748b; font-size: 11px; margin-top: 3px; }
          .badge { background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
          .card-title { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
          .card-value { font-size: 14px; font-weight: bold; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
          th { background: #f1f5f9; color: #475569; text-align: left; padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; }
          td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
          .row-titulo { background: #f8fafc; font-weight: bold; color: #1e293b; }
          .row-subtotal { background: #eff6ff; font-weight: bold; color: #1e40af; border-top: 1px solid #bfdbfe; border-bottom: 1px solid #bfdbfe; }
          .row-destaque { background: #ecfdf5; font-weight: bold; color: #065f46; border-top: 2px solid #a7f3d0; border-bottom: 2px solid #a7f3d0; font-size: 11px; }
          .row-final { background: #f0fdf4; font-weight: bold; color: #15803d; border-top: 2px solid #22c55e; border-bottom: 2px solid #22c55e; font-size: 12px; }
          .row-final-neg { background: #fef2f2; font-weight: bold; color: #b91c1c; border-top: 2px solid #ef4444; border-bottom: 2px solid #ef4444; font-size: 12px; }
          .row-filho { color: #475569; padding-left: 20px; font-size: 9.5px; }
          .text-right { text-align: right; }
          .negativo { color: #dc2626; }
          .positivo { color: #16a34a; }
          .assinaturas { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
          .linha { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${currentTenant?.nome || 'Demonstrativo de Resultado do Exercício'}</h1>
            <div class="sub">
              DRE Gerencial Simplificado &bull; Período: <strong>${fmtData(dre.periodo.data_inicio)}</strong> até <strong>${fmtData(dre.periodo.data_fim)}</strong> &bull; Regime: <strong>${dre.periodo.regime.toUpperCase()}</strong>
            </div>
          </div>
          <span class="badge">Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</span>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Receita Operacional Líquida</div>
            <div class="card-value">${R(ind.receita_liquida)}</div>
          </div>
          <div class="card">
            <div class="card-title">Margem de Contribuição</div>
            <div class="card-value" style="color: #059669;">${R(ind.margem_contribuicao)} (${P(ind.margem_contribuicao_pct)})</div>
          </div>
          <div class="card">
            <div class="card-title">Despesas Operacionais Fixas</div>
            <div class="card-value" style="color: #dc2626;">${R(ind.total_despesas_fixas)}</div>
          </div>
          <div class="card">
            <div class="card-title">Resultado Líquido do Período</div>
            <div class="card-value" style="color: ${ind.resultado_liquido >= 0 ? '#16a34a' : '#dc2626'};">
              ${R(ind.resultado_liquido)} (${P(ind.margem_liquida_pct)})
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 55%;">Estrutura das Contas Gerenciais</th>
              <th style="width: 15%; text-align: center;">Natureza</th>
              <th style="width: 15%; text-align: right;">Valor (R$)</th>
              <th style="width: 15%; text-align: right;">% AV (s/ ROL)</th>
            </tr>
          </thead>
          <tbody>
            ${dre.linhas_dre
              .map((l: DreLinha) => {
                let rowClass = 'row-titulo'
                if (l.tipo === 'subtotal') rowClass = 'row-subtotal'
                else if (l.tipo === 'destaque') rowClass = 'row-destaque'
                else if (l.tipo === 'total_final') {
                  rowClass = l.valor >= 0 ? 'row-final' : 'row-final-neg'
                }

                let rowsHtml = `
                  <tr class="${rowClass}">
                    <td><strong>${l.codigo}. ${l.descricao}</strong></td>
                    <td style="text-align: center; font-size: 9px; text-transform: uppercase;">${l.tipo}</td>
                    <td class="text-right ${l.valor < 0 ? 'negativo' : l.valor > 0 && l.tipo === 'total_final' ? 'positivo' : ''}">
                      ${R(l.valor)}
                    </td>
                    <td class="text-right">${P(l.percentual)}</td>
                  </tr>
                `

                if (l.filhos && l.filhos.length > 0) {
                  l.filhos.forEach((f: DreItemLinhaFilho) => {
                    rowsHtml += `
                      <tr>
                        <td class="row-filho" style="padding-left: 20px;">${f.codigo} ${f.descricao}</td>
                        <td style="text-align: center; color: #94a3b8; font-size: 8px;">DETALHE</td>
                        <td class="text-right ${f.valor < 0 ? 'negativo' : ''}">${R(f.valor)}</td>
                        <td class="text-right" style="color: #64748b;">${P(f.percentual)}</td>
                      </tr>
                    `
                  })
                }

                return rowsHtml
              })
              .join('')}
          </tbody>
        </table>

        <div style="margin-top: 15px; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: flex; justify-content: space-between; font-size: 10px;">
          <div><strong>Ponto de Equilíbrio Operacional:</strong> ${R(ind.ponto_equilibrio)}</div>
          <div><strong>Markup Médio Aplicado:</strong> ${ind.markup_medio}x</div>
          <div><strong>Ticket Médio Vendas:</strong> ${R(ind.ticket_medio)} (${ind.total_vendas_qtd} vendas)</div>
        </div>

        <div class="assinaturas">
          <div>
            <div class="linha">Diretoria / Administrador</div>
            <div style="color: #64748b; font-size: 9px; margin-top: 2px;">Assinatura do Responsável</div>
          </div>
          <div>
            <div class="linha">Controladoria / Contabilidade</div>
            <div style="color: #64748b; font-size: 9px; margin-top: 2px;">Assinatura Contábil</div>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `
    win.document.write(html)
    win.document.close()
  }

  // Detalhes da categoria para drilldown
  const drillCategoryData = useMemo(() => {
    if (!drillModalCategory || !dre?.detalhes_categorias) return null
    return dre.detalhes_categorias[drillModalCategory] || null
  }, [drillModalCategory, dre])

  // Indicadores
  const ind = dre?.indicadores

  // Cálculo da barra de composição da Receita Líquida
  const composicaoBarras = useMemo(() => {
    if (!ind || ind.receita_liquida <= 0) return null
    const rol = ind.receita_liquida
    const cmvPct = Math.min(100, Math.max(0, (ind.total_custos_variaveis / rol) * 100))
    const fixasPct = Math.min(100, Math.max(0, (ind.total_despesas_fixas / rol) * 100))
    const lucroPct = Math.max(0, (ind.resultado_liquido / rol) * 100)
    return {
      cmvPct: Number(cmvPct.toFixed(1)),
      fixasPct: Number(fixasPct.toFixed(1)),
      lucroPct: Number(lucroPct.toFixed(1)),
    }
  }, [ind])

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center">
              <PieChart className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                DRE Gerencial Simplificado
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  Saúde Real do Negócio
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Demonstrativo de Resultado do Exercício com margens reais, ponto de equilíbrio e
                apuração de lucro líquido
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Topo */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Atualizar dados do DRE"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!dre}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
            title="Imprimir relatório executivo A4 formatado"
          >
            <Printer className="w-3.5 h-3.5 text-blue-200" />
            <span>Imprimir DRE Executivo</span>
          </button>
        </div>
      </div>

      {/* ── Barra de Filtros & Parâmetros ─────────────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-4">
        {/* Linha 1: Períodos Rápidos */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Período de Apuração:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'este_mes', label: 'Este Mês' },
                { id: 'mes_anterior', label: 'Mês Anterior' },
                { id: 'trimestre_atual', label: 'Trimestre Atual' },
                { id: 'ano_atual', label: 'Ano Atual' },
                { id: 'ultimos_12_meses', label: 'Últimos 12 Meses' },
                { id: 'personalizado', label: 'Personalizado' },
              ] as { id: PeriodoPreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  preset === p.id
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/60'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: Datas customizadas + Regime + Alíquota Imposto */}
        <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Data Início */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Data Início
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value)
                setPreset('personalizado')
              }}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Data Fim */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Data Fim
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value)
                setPreset('personalizado')
              }}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Regime: Competência vs Caixa */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
              <span>Regime Contábil</span>
              <span className="text-[10px] text-slate-500">
                {regime === 'competencia' ? 'Venda / Vencimento' : 'Financeiro / Pagamento'}
              </span>
            </label>
            <div className="grid grid-cols-2 p-0.5 bg-slate-800/80 border border-slate-700 rounded-xl">
              <button
                type="button"
                onClick={() => setRegime('competencia')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  regime === 'competencia'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Competência: Reconhece receita e custos pela data da venda/vencimento da despesa"
              >
                Competência
              </button>
              <button
                type="button"
                onClick={() => setRegime('caixa')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  regime === 'caixa'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Caixa: Reconhece receitas e despesas exclusivamente no momento da quitação/recebimento"
              >
                Caixa Real
              </button>
            </div>
          </div>

          {/* Alíquota Estimada de Impostos */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
              <span>Alíquota Imposto (% Simples)</span>
              <span className="text-[10px] text-emerald-400 font-semibold">{aliquotaImposto}%</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                max="30"
                value={aliquotaImposto}
                onChange={(e) => setAliquotaImposto(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors pr-7"
                placeholder="6.0"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                %
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Strategic KPI Cards ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 animate-pulse h-28"
            />
          ))}
        </div>
      ) : ind ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* Card 1: Receita Operacional Líquida */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Receita Líquida
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Receipt className="w-3.5 h-3.5 text-blue-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-white tracking-tight">{R(ind.receita_liquida)}</p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Bruta: {R(ind.receita_bruta)}</span>
              <span className="text-blue-400 font-semibold">100% ROL</span>
            </div>
          </div>

          {/* Card 2: Margem de Contribuição */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Margem Contribuição
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-emerald-400 tracking-tight">
              {R(ind.margem_contribuicao)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Após CMV & Variáveis</span>
              <span
                className={`font-bold px-1.5 py-0.5 rounded ${
                  ind.margem_contribuicao_pct >= 45
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : ind.margem_contribuicao_pct >= 30
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {P(ind.margem_contribuicao_pct)}
              </span>
            </div>
          </div>

          {/* Card 3: Despesas Operacionais Fixas */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Despesas Fixas
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-rose-400 tracking-tight">
              {R(ind.total_despesas_fixas)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Custo da Estrutura</span>
              <span className="text-rose-400 font-medium">
                {ind.receita_liquida > 0
                  ? P((ind.total_despesas_fixas / ind.receita_liquida) * 100)
                  : '0%'}
              </span>
            </div>
          </div>

          {/* Card 4: Resultado Operacional / EBITDA */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                EBITDA Operacional
              </span>
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              </div>
            </div>
            <p
              className={`text-xl font-bold tracking-tight ${
                ind.resultado_operacional >= 0 ? 'text-indigo-300' : 'text-rose-400'
              }`}
            >
              {R(ind.resultado_operacional)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Geração Operacional</span>
              <span className="text-indigo-400 font-semibold">{P(ind.margem_operacional_pct)}</span>
            </div>
          </div>

          {/* Card 5: Resultado Líquido do Exercício (Destaque Principal) */}
          <div
            className={`border rounded-2xl p-4 relative overflow-hidden transition-all shadow-lg ${
              ind.resultado_liquido >= 0
                ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/40 shadow-emerald-500/10'
                : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border-rose-500/40 shadow-rose-500/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                Lucro Líquido
              </span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                  ind.resultado_liquido >= 0
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                }`}
              >
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p
              className={`text-2xl font-black tracking-tight ${
                ind.resultado_liquido >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {R(ind.resultado_liquido)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Margem Líquida</span>
              <span
                className={`font-black px-1.5 py-0.5 rounded ${
                  ind.resultado_liquido >= 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {P(ind.margem_liquida_pct)}
              </span>
            </div>
          </div>

          {/* Card 6: Ponto de Equilíbrio */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Ponto de Equilíbrio
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-amber-400" />
              </div>
            </div>
            <p className="text-xl font-bold text-amber-400 tracking-tight">
              {R(ind.ponto_equilibrio)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Break-even Meta</span>
              <span
                className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                  ind.ponto_equilibrio > 0 && ind.receita_liquida >= ind.ponto_equilibrio
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {ind.ponto_equilibrio > 0
                  ? `${Math.round((ind.receita_liquida / ind.ponto_equilibrio) * 100)}% Coberto`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Seção Visual: Decomposição da Receita & Histórico 6 Meses ────────── */}
      {ind && ind.receita_liquida > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Barra de Distribuição da Receita (Decomposição Visual) */}
          <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-400" />
                  Decomposição da Receita Líquida (100%)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Para onde foi cada Real faturado pela oficina no período
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-300">
                Total: {R(ind.receita_liquida)}
              </span>
            </div>

            {/* Barra Stacked */}
            {composicaoBarras && (
              <div className="space-y-3 mt-4">
                <div className="h-6 w-full bg-slate-800 rounded-xl overflow-hidden flex shadow-inner p-0.5 gap-0.5">
                  <div
                    style={{ width: `${composicaoBarras.cmvPct}%` }}
                    className="bg-rose-500 hover:bg-rose-400 transition-all rounded-l-lg flex items-center justify-center text-[10px] font-bold text-white relative group"
                    title={`Custos Variáveis / CMV: ${composicaoBarras.cmvPct}%`}
                  >
                    {composicaoBarras.cmvPct > 12 && `${composicaoBarras.cmvPct}%`}
                  </div>
                  <div
                    style={{ width: `${composicaoBarras.fixasPct}%` }}
                    className="bg-amber-500 hover:bg-amber-400 transition-all flex items-center justify-center text-[10px] font-bold text-slate-950 relative group"
                    title={`Despesas Fixas: ${composicaoBarras.fixasPct}%`}
                  >
                    {composicaoBarras.fixasPct > 12 && `${composicaoBarras.fixasPct}%`}
                  </div>
                  <div
                    style={{ width: `${composicaoBarras.lucroPct}%` }}
                    className="bg-emerald-500 hover:bg-emerald-400 transition-all rounded-r-lg flex items-center justify-center text-[10px] font-bold text-slate-950 relative group"
                    title={`Lucro Líquido: ${composicaoBarras.lucroPct}%`}
                  >
                    {composicaoBarras.lucroPct > 12 && `${composicaoBarras.lucroPct}%`}
                  </div>
                </div>

                {/* Legendas com valores */}
                <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span className="text-[11px] font-medium text-slate-400">Custos / CMV</span>
                    </div>
                    <div className="font-bold text-white">{R(ind.total_custos_variaveis)}</div>
                    <div className="text-[10px] text-rose-400">{composicaoBarras.cmvPct}% ROL</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-[11px] font-medium text-slate-400">Despesas Fixas</span>
                    </div>
                    <div className="font-bold text-white">{R(ind.total_despesas_fixas)}</div>
                    <div className="text-[10px] text-amber-400">{composicaoBarras.fixasPct}% ROL</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-slate-400">Lucro Líquido</span>
                    </div>
                    <div className="font-bold text-emerald-400">{R(ind.resultado_liquido)}</div>
                    <div className="text-[10px] text-emerald-400 font-semibold">
                      {composicaoBarras.lucroPct}% ROL
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Evolução Histórica (Últimos Meses) */}
          <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Evolução Histórica (Últimos 6 Meses)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Comparativo mensal de faturamento líquido versus lucro líquido
                </p>
              </div>
              <span className="text-xs text-slate-500">Tendência gerencial</span>
            </div>

            <div className="space-y-2 mt-3">
              {dre.historico_mensal && dre.historico_mensal.length > 0 ? (
                dre.historico_mensal.map((h: DreHistoricoMes, idx: number) => {
                  const maxReceita = Math.max(
                    ...dre.historico_mensal.map((m: DreHistoricoMes) => m.receita_liquida || 1),
                    1,
                  )
                  const barraPct = Math.min(100, Math.max(5, (h.receita_liquida / maxReceita) * 100))

                  return (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/30 transition-all flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="w-20 font-semibold text-slate-300 shrink-0">{h.mes}</div>
                      <div className="flex-1">
                        <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${barraPct}%` }}
                            className={`h-full rounded-full ${
                              h.lucro_liquido >= 0
                                ? 'bg-gradient-to-r from-blue-500 to-emerald-500'
                                : 'bg-gradient-to-r from-blue-500 to-rose-500'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-white">{R(h.receita_liquida)}</div>
                        <div
                          className={`text-[10px] font-semibold ${
                            h.lucro_liquido >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          Lucro: {R(h.lucro_liquido)} ({h.margem_liquida_pct}%)
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  Sem histórico suficiente para exibir comparativo
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Seção Meios de Pagamento & Liquidez ────────────────────────────────── */}
      {dre?.meios_pagamento && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Dinheiro</div>
              <div className="text-sm font-bold text-white">{R(dre.meios_pagamento.dinheiro)}</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">PIX Instantâneo</div>
              <div className="text-sm font-bold text-white">{R(dre.meios_pagamento.pix)}</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Cartões Créd./Déb.</div>
              <div className="text-sm font-bold text-white">{R(dre.meios_pagamento.cartao)}</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">A Prazo / Convênio</div>
              <div className="text-sm font-bold text-white">{R(dre.meios_pagamento.prazo)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabela DRE em Cascata (Waterfall Estruturado) ────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
        {/* Topo da Tabela com Controles */}
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-850/50">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Demonstração de Resultado do Exercício (Cascata Contábil)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cálculo verticalizado: Faturamento Bruto &rarr; Deduções &rarr; Margem de Contribuição
              &rarr; Despesas Fixas &rarr; Lucro Líquido
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              Expandir Tudo
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              Recolher Tudo
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Descrição da Conta Gerencial</th>
                <th className="py-3 px-4 text-center w-28">Natureza</th>
                <th className="py-3 px-4 text-right w-44">Valor (R$)</th>
                <th className="py-3 px-4 text-right w-32">% AV (s/ ROL)</th>
                <th className="py-3 px-4 text-center w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                    Calculando linhas do DRE Gerencial...
                  </td>
                </tr>
              ) : !dre || dre.linhas_dre.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum dado encontrado para o período e filtros selecionados.
                  </td>
                </tr>
              ) : (
                dre.linhas_dre.map((linha: DreLinha) => {
                  const hasChildren = Boolean(linha.filhos && linha.filhos.length > 0)
                  const isExpanded = Boolean(expandedRows[linha.codigo])

                  // Estilos por tipo de linha
                  let rowBg = 'hover:bg-slate-850/60'
                  let textStyle = 'font-semibold text-slate-200'
                  let valorStyle = 'text-white font-bold'
                  let badge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                      Título
                    </span>
                  )

                  if (linha.tipo === 'subtotal') {
                    rowBg = 'bg-blue-950/20 hover:bg-blue-950/30 border-y border-blue-900/40'
                    textStyle = 'font-bold text-blue-300'
                    valorStyle = 'text-blue-300 font-extrabold text-sm'
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        Subtotal
                      </span>
                    )
                  } else if (linha.tipo === 'destaque') {
                    rowBg =
                      'bg-emerald-950/25 hover:bg-emerald-950/35 border-y-2 border-emerald-500/40'
                    textStyle = 'font-extrabold text-emerald-300 text-sm'
                    valorStyle = 'text-emerald-400 font-black text-base'
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Margem Contribuição
                      </span>
                    )
                  } else if (linha.tipo === 'deducao') {
                    rowBg = 'bg-slate-900/60 hover:bg-slate-850'
                    textStyle = 'font-semibold text-rose-300'
                    valorStyle = 'text-rose-400 font-bold'
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        Dedução
                      </span>
                    )
                  } else if (linha.tipo === 'resultado_financeiro') {
                    rowBg = 'bg-slate-900/60 hover:bg-slate-850'
                    textStyle = 'font-semibold text-slate-300'
                    valorStyle =
                      linha.valor >= 0
                        ? 'text-emerald-400 font-bold'
                        : 'text-rose-400 font-bold'
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        Financeiro
                      </span>
                    )
                  } else if (linha.tipo === 'total_final') {
                    rowBg =
                      linha.valor >= 0
                        ? 'bg-emerald-950/40 hover:bg-emerald-950/50 border-y-2 border-emerald-500/50'
                        : 'bg-rose-950/40 hover:bg-rose-950/50 border-y-2 border-rose-500/50'
                    textStyle =
                      linha.valor >= 0
                        ? 'font-black text-emerald-300 text-base'
                        : 'font-black text-rose-300 text-base'
                    valorStyle =
                      linha.valor >= 0
                        ? 'text-emerald-400 font-black text-lg'
                        : 'text-rose-400 font-black text-lg'
                    badge = (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                          linha.valor >= 0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                        }`}
                      >
                        {linha.valor >= 0 ? 'Lucro Líquido' : 'Prejuízo Líquido'}
                      </span>
                    )
                  }

                  return (
                    <div key={linha.codigo} style={{ display: 'contents' }}>
                      {/* Linha Pai */}
                      <tr className={`transition-colors ${rowBg}`}>
                        <td className="py-3 px-4 text-center">
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleRow(linha.codigo)}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-600">&bull;</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className={`flex items-center gap-2 cursor-pointer ${textStyle}`}
                            onClick={() => hasChildren && toggleRow(linha.codigo)}
                          >
                            <span className="font-mono text-xs opacity-75">{linha.codigo}.</span>
                            <span>{linha.descricao}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">{badge}</td>
                        <td className={`py-3 px-4 text-right font-mono ${valorStyle}`}>
                          {R(linha.valor)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300 font-semibold">
                          {P(linha.percentual)}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 text-[11px]">
                          {hasChildren && (
                            <button
                              onClick={() => toggleRow(linha.codigo)}
                              className="text-xs text-blue-400 hover:underline font-medium"
                            >
                              {isExpanded ? 'Recolher' : 'Ver Detalhes'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Linhas Filhas (Expandidas) */}
                      {hasChildren &&
                        isExpanded &&
                        linha.filhos?.map((filho: DreItemLinhaFilho) => {
                          // Se for uma categoria que possui lançamentos detalhados em cad_lancamentos
                          const hasDetailedLaunches = Boolean(
                            dre.detalhes_categorias && dre.detalhes_categorias[filho.descricao],
                          )

                          return (
                            <tr
                              key={filho.codigo}
                              className="bg-slate-900/40 hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-2 px-4 text-center text-slate-600 font-mono text-[10px]">
                                {filho.codigo}
                              </td>
                              <td className="py-2 px-4 pl-10 text-slate-300">
                                <div className="flex items-center gap-2">
                                  <span>{filho.descricao}</span>
                                  {filho.detalhes?.qtd_itens && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                      {filho.detalhes.qtd_itens} itens
                                    </span>
                                  )}
                                  {filho.detalhes?.aliquota_estimada_pct !== undefined && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                                      Alíquota {filho.detalhes.aliquota_estimada_pct}%
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-4 text-center text-[10px] text-slate-500 uppercase font-mono">
                                Item
                              </td>
                              <td
                                className={`py-2 px-4 text-right font-mono text-xs ${
                                  filho.valor < 0 ? 'text-rose-400/90' : 'text-slate-300'
                                }`}
                              >
                                {R(filho.valor)}
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-xs text-slate-400">
                                {P(filho.percentual)}
                              </td>
                              <td className="py-2 px-4 text-center">
                                {hasDetailedLaunches ? (
                                  <button
                                    onClick={() => setDrillModalCategory(filho.descricao)}
                                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700/80 inline-flex items-center gap-1 transition-colors"
                                    title="Visualizar lançamentos detalhados desta conta"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Lançamentos</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-600 text-[10px]">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                    </div>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé Informativo */}
        <div className="p-4 bg-slate-800/40 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              <strong>Análise Vertical (% AV):</strong> Percentual de cada linha calculado sobre a
              Receita Operacional Líquida (ROL = 100%).
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-300 font-medium">
            <span>Markup Médio: <strong className="text-white">{ind?.markup_medio}x</strong></span>
            <span>Ticket Médio: <strong className="text-white">{R(ind?.ticket_medio || 0)}</strong></span>
            <span>Compras p/ Estoque: <strong className="text-white">{R(dre?.compras_fornecedores_periodo || 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Modal de Detalhamento de Lançamentos da Categoria (Drill-Down) ───── */}
      {drillModalCategory && drillCategoryData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Detalhamento de Lançamentos: {drillCategoryData.nome}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Total nesta conta: <strong className="text-white">{R(drillCategoryData.total)}</strong> ({drillCategoryData.lancamentos.length} lançamentos no período)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrillModalCategory(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto px-6 py-4 flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Data Venc.</th>
                    <th className="py-2.5 px-3">Favorecido / Fornecedor</th>
                    <th className="py-2.5 px-3">Documento / Histórico</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {drillCategoryData.lancamentos.map((item: DreLancamentoItem) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {fmtData(item.data)}
                      </td>
                      <td className="py-2.5 px-3 text-white font-semibold">
                        {item.favorecido || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        <div className="font-mono text-[11px] text-slate-400">
                          {item.documento || 'Sem doc'}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {item.historico || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            item.status === 'pago'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          }`}
                        >
                          {item.status === 'pago' ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-bold whitespace-nowrap">
                        {R(item.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-850 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Lançamentos registrados no módulo financeiro / contas a pagar
              </span>
              <button
                onClick={() => setDrillModalCategory(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
