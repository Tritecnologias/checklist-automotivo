import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { Order } from '../types'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: 'Todas' },
  { key: 'open',        label: 'Abertas' },
  { key: 'in_progress', label: 'Em andamento' },
  { key: 'closed',      label: 'Encerradas' },
]

export default function Orders() {
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<StatusFilter>('all')

  const { data: orders = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders'],
    queryFn: api.listOrders,
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (q) {
        return (
          o.vehicle.plate.toLowerCase().includes(q) ||
          o.vehicle.model.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [orders, search, statusFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordens de Serviço</h1>
          <p className="text-slate-400 text-sm mt-1">
            {filtered.length} de {orders.length} ordens
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium text-slate-300 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'Atualizando…' : '↻ Atualizar'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por placa, modelo ou OS…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-32 text-center text-slate-500">Carregando…</div>
      ) : isError ? (
        <div className="py-32 text-center">
          <p className="text-red-400 mb-4">Erro ao carregar ordens.</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium">
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              Nenhuma OS encontrada para os filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-5 py-3">OS</th>
                    <th className="px-5 py-3">Placa</th>
                    <th className="px-5 py-3">Modelo</th>
                    <th className="px-5 py-3">Km</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((o: Order) => (
                    <tr key={o.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-mono text-slate-400 text-xs">
                        #{o.id.split('-')[0].toUpperCase()}
                      </td>
                      <td className="px-5 py-3 font-bold text-white">{o.vehicle.plate}</td>
                      <td className="px-5 py-3 text-slate-300 max-w-[180px] truncate">
                        {o.vehicle.model}
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {o.vehicle.mileage.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-5 py-3 text-right font-semibold text-green-400">
                        {currency(o.totalAmount)}
                      </td>
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                        {fmtDate(o.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/orders/${o.id}`}
                          className="text-xs font-medium text-blue-400 hover:text-blue-300"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
