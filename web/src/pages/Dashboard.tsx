import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: api.listOrders,
  })

  const open        = orders.filter((o) => o.status === 'open').length
  const in_progress = orders.filter((o) => o.status === 'in_progress').length
  const closed      = orders.filter((o) => o.status === 'closed').length
  const revenue     = orders.reduce((s, o) => s + o.totalAmount, 0)
  const recent      = [...orders].slice(0, 10)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-500">
        Carregando…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-red-400">Erro ao conectar com a API.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-500"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">{orders.length} ordens registradas</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Abertas"       value={open}        color="text-green-400" />
        <StatCard label="Em andamento"  value={in_progress} color="text-amber-400" />
        <StatCard label="Encerradas"    value={closed}      color="text-slate-400" />
        <StatCard label="Faturamento"   value={currency(revenue)} color="text-blue-400"
          sub={`${orders.length} OS`} />
      </div>

      {/* Recent orders */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Ordens recentes</h2>
          <Link to="/orders" className="text-sm text-blue-400 hover:text-blue-300">
            Ver todas →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="py-16 text-center text-slate-500">Nenhuma OS registrada ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="px-5 py-3">OS</th>
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Modelo</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recent.map((o: Order) => (
                  <tr
                    key={o.id}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/orders/${o.id}`}
                  >
                    <td className="px-5 py-3 font-mono text-slate-400 text-xs">
                      #{o.id.split('-')[0].toUpperCase()}
                    </td>
                    <td className="px-5 py-3 font-bold text-white">{o.vehicle.plate}</td>
                    <td className="px-5 py-3 text-slate-300 max-w-[200px] truncate">
                      {o.vehicle.model}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-3 text-right font-semibold text-green-400">
                      {currency(o.totalAmount)}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
