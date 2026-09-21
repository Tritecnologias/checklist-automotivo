import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { CaixaSession } from '../types'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

export default function Caixa() {
  const qc = useQueryClient()
  const [vrAbertura, setVrAbertura] = useState('')
  const [vrFechamento, setVrFechamento] = useState('')

  const { data: status } = useQuery({
    queryKey: ['caixa-status'],
    queryFn: erpApi.caixaStatus,
    refetchInterval: 15_000,
  })

  const { data: hist, isLoading } = useQuery({
    queryKey: ['caixa-hist'],
    queryFn: () => erpApi.caixaList(1),
  })

  const { mutate: abrir, isPending: abrindo } = useMutation({
    mutationFn: () => erpApi.caixaAbrir({ vr_abertura: parseFloat(vrAbertura.replace(',', '.')) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-status'] }); qc.invalidateQueries({ queryKey: ['caixa-hist'] }); setVrAbertura('') },
  })

  const { mutate: fechar, isPending: fechando } = useMutation({
    mutationFn: (id: number) => erpApi.caixaFechar(id, { vr_fechamento: parseFloat(vrFechamento.replace(',', '.')) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-status'] }); qc.invalidateQueries({ queryKey: ['caixa-hist'] }); setVrFechamento('') },
  })

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Controle de Caixa</h1>

      {/* Status atual */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Status atual</h2>

        {status ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-900/30 text-green-400 text-sm font-semibold border border-green-800/50">
                🟢 Caixa Aberto
              </span>
              <span className="text-slate-400 text-sm">Terminal {status.terminal} · Turno {status.turno}</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Abertura</p>
                <p className="text-base font-semibold text-white">{status.hora_abertura}</p>
                <p className="text-xs text-slate-500">{fmtDate(status.data_abertura)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Valor de abertura</p>
                <p className="text-base font-semibold text-white">{R(Number(status.vr_abertura))}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total em vendas</p>
                <p className="text-base font-semibold text-emerald-400">{R(Number(status.vr_fechado_turno))}</p>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400 mb-2">Valor conferido em caixa (R$)</p>
              <div className="flex gap-3">
                <input
                  value={vrFechamento}
                  onChange={e => setVrFechamento(e.target.value)}
                  placeholder="0,00"
                  className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
                <button
                  onClick={() => fechar(status.id)}
                  disabled={fechando}
                  className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {fechando ? 'Fechando…' : 'Fechar Caixa'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-sm font-semibold border border-slate-700">
                🔴 Caixa Fechado
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-400 mb-2">Valor de abertura (fundo de caixa, R$)</p>
              <div className="flex gap-3">
                <input
                  value={vrAbertura}
                  onChange={e => setVrAbertura(e.target.value)}
                  placeholder="0,00"
                  className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
                <button
                  onClick={() => abrir()}
                  disabled={abrindo}
                  className="px-5 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {abrindo ? 'Abrindo…' : 'Abrir Caixa'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Histórico de Caixas</h2>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Abertura</th>
                <th className="px-5 py-3">Fechamento</th>
                <th className="px-5 py-3 text-right">Fundo</th>
                <th className="px-5 py-3 text-right">Total Vendas</th>
                <th className="px-5 py-3 text-right">Conf. Caixa</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(hist?.data ?? []).map((c: CaixaSession) => (
                <tr key={c.id} className="hover:bg-slate-800/30">
                  <td className="px-5 py-3 text-slate-300">{fmtDate(c.data_abertura)}</td>
                  <td className="px-5 py-3 text-slate-400">{c.hora_abertura}</td>
                  <td className="px-5 py-3 text-slate-400">{c.hora_fechamento ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-slate-300">{R(Number(c.vr_abertura))}</td>
                  <td className="px-5 py-3 text-right text-emerald-400 font-semibold">{R(Number(c.vr_fechado_turno))}</td>
                  <td className="px-5 py-3 text-right text-slate-300">{c.vr_fechamento ? R(Number(c.vr_fechamento)) : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      c.status_caixa === 'A' ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {c.status_caixa === 'A' ? 'Aberto' : 'Fechado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
