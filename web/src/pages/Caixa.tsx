import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { CaixaSession } from '../types'
import { useAuth } from '../contexts/AuthContext'

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

export default function Caixa() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()
  const [vrAbertura, setVrAbertura] = useState('')
  const [vrFechamento, setVrFechamento] = useState('')
  const [page, setPage] = useState(1)
  const [detalhesId, setDetalhesId] = useState<number | null>(null)

  const { data: status } = useQuery({
    queryKey: ['caixa-status', tid],
    queryFn: erpApi.caixaStatus,
    refetchInterval: 10_000,
  })

  const { data: hist, isLoading } = useQuery({
    queryKey: ['caixa-hist', tid, page],
    queryFn: () => erpApi.caixaList(page),
  })

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
      setVrAbertura('')
    },
  })

  const { mutate: fechar, isPending: fechando } = useMutation({
    mutationFn: (id: number) => erpApi.caixaFechar(id, { vr_fechamento: parseFloat(vrFechamento.replace(',', '.')) || 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caixa-status'] })
      qc.invalidateQueries({ queryKey: ['caixa-hist'] })
      setVrFechamento('')
    },
  })

  // Cálculos em tempo real para o caixa aberto
  const esperadoDinheiro = useMemo(() => {
    if (!status) return 0
    const fundo = Number(status.vr_abertura || 0)
    const vendasDinheiro = Number(status.totais_por_forma?.dinheiro || 0)
    return fundo + vendasDinheiro
  }, [status])

  const fechamentoNum = parseFloat(vrFechamento.replace(',', '.')) || 0
  const temValorDigitado = vrFechamento.trim() !== ''
  const diferencaFechamento = temValorDigitado ? (fechamentoNum - esperadoDinheiro) : 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Controle de Caixa</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Loja: <strong className="text-slate-200">{currentTenant?.nome ?? 'Todas as Lojas'}</strong>
          </p>
        </div>
      </div>

      {/* ── STATUS ATUAL ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-sm">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Status da Loja Atual</h2>

        {status ? (
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

            {/* KPI Cards do Caixa */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
                <p className="text-xs text-slate-400 font-medium">Abertura</p>
                <p className="text-lg font-bold text-white mt-0.5">{status.hora_abertura}</p>
                <p className="text-xs text-slate-500">{fmtDate(status.data_abertura)}</p>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
                <p className="text-xs text-slate-400 font-medium">Fundo de Caixa</p>
                <p className="text-lg font-bold text-white mt-0.5">{R(Number(status.vr_abertura))}</p>
                <p className="text-xs text-slate-500">Valor inicial em gaveta</p>
              </div>

              <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3.5">
                <p className="text-xs text-emerald-300 font-medium">Total em Vendas</p>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">{R(Number(status.vr_fechado_turno))}</p>
                <p className="text-xs text-emerald-400/70">
                  {status.totais_por_forma?.qtd_vendas ?? 0} {status.totais_por_forma?.qtd_vendas === 1 ? 'venda' : 'vendas'} nesta sessão
                </p>
              </div>

              <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3.5">
                <p className="text-xs text-blue-300 font-medium">Esperado em Dinheiro</p>
                <p className="text-lg font-bold text-blue-400 mt-0.5">{R(esperadoDinheiro)}</p>
                <p className="text-xs text-blue-400/70">Fundo + Vendas em espécie</p>
              </div>
            </div>

            {/* Resumo por Forma de Pagamento */}
            {status.totais_por_forma && (
              <div className="bg-slate-950/50 rounded-xl border border-slate-800/80 p-3.5">
                <p className="text-xs font-semibold text-slate-400 mb-2">Resumo das Vendas por Meio de Pagamento</p>
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
                    <span className="text-slate-400 block text-[11px]">⚡ PIX</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.pix)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">📝 A Prazo (Nota)</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.prazo)}</strong>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                    <span className="text-slate-400 block text-[11px]">🎟️ Outros / Ticket</span>
                    <strong className="text-slate-100 text-sm">{R(status.totais_por_forma.outros)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Fechamento */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-white mb-1">Fechamento de Caixa</p>
                <p className="text-xs text-slate-400">
                  Informe o valor físico em dinheiro contado na gaveta. O valor esperado é de <strong>{R(esperadoDinheiro)}</strong>.
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
                  onClick={() => {
                    if (confirm(`Confirma o fechamento do caixa com ${R(fechamentoNum)} conferidos?`)) {
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
              {temValorDigitado && (
                <div className={`p-3 rounded-xl text-xs font-semibold border flex items-center justify-between ${
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
                    <span>
                      {Math.abs(diferencaFechamento) < 0.01
                        ? 'Caixa bateu perfeitamente com o esperado em dinheiro!'
                        : diferencaFechamento > 0
                        ? `Sobra de caixa: ${R(diferencaFechamento)} a mais que o esperado em dinheiro.`
                        : `Quebra/Falta de caixa: ${R(Math.abs(diferencaFechamento))} a menos que o esperado em dinheiro.`}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold">
                    {diferencaFechamento >= 0 ? `+${R(diferencaFechamento)}` : `-${R(Math.abs(diferencaFechamento))}`}
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
              <div className="flex gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">R$</span>
                  <input
                    value={vrAbertura}
                    onChange={e => setVrAbertura(e.target.value)}
                    placeholder="0,00"
                    className="w-44 bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-medium text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
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

      {/* ── HISTÓRICO DE CAIXAS ── */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Histórico de Caixas</h2>
            <p className="text-xs text-slate-500">Sessões registradas exclusivamente para esta loja</p>
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

        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando histórico…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950/40">
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Abertura</th>
                  <th className="px-5 py-3">Fechamento</th>
                  <th className="px-5 py-3 text-right">Fundo</th>
                  <th className="px-5 py-3 text-right">Total Vendas</th>
                  <th className="px-5 py-3 text-right">Conf. Caixa</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {(hist?.data ?? []).map((c: CaixaSession) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 text-slate-300 whitespace-nowrap font-medium">
                      {fmtDate(c.data_abertura)}
                    </td>
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{c.hora_abertura}</td>
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{c.hora_fechamento ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-300 whitespace-nowrap">{R(Number(c.vr_abertura))}</td>
                    <td className="px-5 py-3 text-right text-emerald-400 font-semibold whitespace-nowrap">
                      {R(Number(c.vr_fechado_turno))}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-200 whitespace-nowrap font-medium">
                      {c.vr_fechamento ? R(Number(c.vr_fechamento)) : '—'}
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        c.status_caixa === 'A' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {c.status_caixa === 'A' ? 'Aberto' : 'Fechado'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setDetalhesId(c.id)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs text-blue-400 hover:text-blue-300 font-medium rounded-lg transition-colors border border-slate-700/60"
                        title="Ver extrato e formas de pagamento desta sessão"
                      >
                        Extrato
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                      <span className="text-slate-400 block text-xs">Fundo de Caixa</span>
                      <strong className="text-white text-base">{R(Number(detalhesModal.caixa.vr_abertura))}</strong>
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3">
                      <span className="text-emerald-300 block text-xs">Total Vendas</span>
                      <strong className="text-emerald-400 text-base">{R(detalhesModal.totais.total_vendas)}</strong>
                    </div>
                    <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3">
                      <span className="text-blue-300 block text-xs">Esperado em Dinheiro</span>
                      <strong className="text-blue-400 text-base">{R(detalhesModal.totais.saldo_esperado_dinheiro)}</strong>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                      <span className="text-slate-400 block text-xs">Conferido no Fechamento</span>
                      <strong className="text-white text-base">
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
                      </div>
                    </div>
                  </div>

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
    </div>
  )
}
