import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { Order, OrderStatus } from '../types'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

type StatusFilter = 'all' | 'quote' | 'open' | 'in_progress' | 'closed'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: 'Todas' },
  { key: 'quote',       label: 'Orçamentos' },
  { key: 'open',        label: 'Abertas' },
  { key: 'in_progress', label: 'Em andamento' },
  { key: 'closed',      label: 'Encerradas' },
]

export default function Orders() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<StatusFilter>('all')

  // Estado do Modal de Nova OS / Orçamento
  const [modalOpen, setModalOpen]     = useState(false)
  const [newPlate, setNewPlate]       = useState('')
  const [newModel, setNewModel]       = useState('')
  const [newMileage, setNewMileage]   = useState('')
  const [newStatus, setNewStatus]     = useState<'quote' | 'open'>('quote')
  const [createError, setCreateError] = useState('')

  const { data: orders = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
    staleTime: 30_000,
  })

  const { mutate: handleCreate, isPending: creating } = useMutation({
    mutationFn: () => {
      const plate = newPlate.trim().toUpperCase()
      const model = newModel.trim()
      const mileage = parseInt(newMileage.replace(/\D/g, ''), 10) || 0

      if (!plate) throw new Error('A placa do veículo é obrigatória')
      if (!model) throw new Error('O modelo do veículo é obrigatório')
      if (mileage < 0) throw new Error('Quilometragem inválida')

      return api.createOrder({ plate, model, mileage }, newStatus)
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setModalOpen(false)
      setNewPlate('')
      setNewModel('')
      setNewMileage('')
      setCreateError('')
      navigate(`/orders/${created.id}`)
    },
    onError: (err: any) => {
      setCreateError(err.message || 'Erro ao criar ordem')
    },
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordens de Serviço & Orçamentos</h1>
          <p className="text-slate-400 text-sm mt-1">
            {filtered.length} de {orders.length} registros
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium text-slate-300 transition-colors disabled:opacity-50"
          >
            {isFetching ? 'Atualizando…' : '↻ Atualizar'}
          </button>
          <button
            onClick={() => {
              setCreateError('')
              setModalOpen(true)
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2"
          >
            <span>+</span> Novo Orçamento / OS
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por placa, modelo ou código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1 overflow-x-auto">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
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
          <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white">
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              Nenhum registro encontrado para os filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-5 py-3">Registro</th>
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
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={o.status} />
                          {o.vendaControle && (
                            <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded" title={`Venda #${o.vendaControle}`}>
                              PDV #{o.vendaControle.slice(-4)}
                            </span>
                          )}
                        </div>
                      </td>
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

      {/* Modal — Criar Novo Orçamento ou OS */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Novo Atendimento</h2>
            <p className="text-slate-400 text-xs mb-5">
              Crie um novo orçamento para enviar ao cliente ou abra uma Ordem de Serviço direta.
            </p>

            {createError && (
              <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-2.5 text-red-300 text-xs mb-4">
                {createError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCreate()
              }}
              className="space-y-4"
            >
              {/* Seleção do Tipo */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  Tipo de Atendimento
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewStatus('quote')}
                    className={`py-3 px-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                      newStatus === 'quote'
                        ? 'border-purple-500 bg-purple-950/40 text-purple-200 ring-2 ring-purple-500/30'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">📋</span>
                    <span className="text-xs font-bold">Orçamento</span>
                    <span className="text-[10px] text-slate-500">Para aprovação posterior</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewStatus('open')}
                    className={`py-3 px-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                      newStatus === 'open'
                        ? 'border-blue-500 bg-blue-950/40 text-blue-200 ring-2 ring-blue-500/30'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">🔧</span>
                    <span className="text-xs font-bold">Ordem de Serviço</span>
                    <span className="text-[10px] text-slate-500">Execução imediata</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Placa do Veículo *
                </label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Ex: ABC1D23"
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-slate-700 text-white font-mono uppercase rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Modelo do Veículo *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Honda Civic 2.0 EXL 2021"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Quilometragem (Km) *
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Ex: 45000"
                  value={newMileage}
                  onChange={(e) => setNewMileage(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors ${
                    newStatus === 'quote'
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {creating ? 'Criando…' : newStatus === 'quote' ? 'Criar Orçamento' : 'Criar Ordem de Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
