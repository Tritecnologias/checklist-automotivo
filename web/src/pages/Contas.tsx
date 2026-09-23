import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { erpApi } from '../lib/api'
import type { Lancamento } from '../types'
import { useAuth } from '../contexts/AuthContext'

const R = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

const STATUS_OPTS = [
  { value: '',  label: 'Todos' },
  { value: '0', label: 'Em aberto' },
  { value: '1', label: 'Recebido' },
]

export default function Contas() {
  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null
  const qc = useQueryClient()
  const [status, setStatus] = useState('0')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: res, isLoading } = useQuery({
    queryKey: ['contas', tid, status, search, page],
    queryFn: () => erpApi.contas({ status, search, page }),
  })

  const { mutate: receber, isPending: recebendo } = useMutation({
    mutationFn: (id: number) => erpApi.receberConta(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contas'] }),
  })

  const lancamentos = res?.data ?? []

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold text-white">Financeiro — Contas a Receber</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {STATUS_OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => { setStatus(o.value); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                status === o.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar cliente ou histórico…"
          className="flex-1 min-w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Carregando…</div>
        ) : lancamentos.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">Nenhum lançamento encontrado</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Histórico</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center w-28">Status</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lancamentos.map((l: Lancamento) => {
                const vencido = l.status === 0 && new Date(l.data_lancamento) < new Date()
                return (
                  <tr key={l.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <span className={vencido ? 'text-red-400 font-medium' : 'text-slate-300'}>
                        {fmtDate(l.data_lancamento)}
                      </span>
                      {vencido && <span className="ml-1 text-xs text-red-500">vencido</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-200 max-w-[180px] truncate">{l.nome_cliente || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{l.historico || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">{R(Number(l.valor))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        l.status === 1
                          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                          : vencido
                            ? 'bg-red-900/30 text-red-400 border border-red-800/40'
                            : 'bg-amber-900/20 text-amber-400 border border-amber-800/40'
                      }`}>
                        {l.status === 1 ? 'Recebido' : vencido ? 'Vencido' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.status === 0 && (
                        <button
                          onClick={() => receber(l.id)}
                          disabled={recebendo}
                          className="px-3 py-1 rounded-lg bg-emerald-800/30 hover:bg-emerald-700/40 text-emerald-400 text-xs font-medium border border-emerald-800/40 transition-colors disabled:opacity-50"
                        >
                          Receber
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {(res?.pages ?? 0) > 1 && (
          <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-sm text-slate-500">
            <span>{res?.total} lançamentos</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">←</button>
              <span className="px-2 py-1 text-slate-400">{page} / {res?.pages}</span>
              <button disabled={page >= (res?.pages ?? 1)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
