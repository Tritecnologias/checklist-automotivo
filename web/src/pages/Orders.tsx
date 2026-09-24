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
  const [modalOpen, setModalOpen]           = useState(false)
  const [newPlate, setNewPlate]             = useState('')
  const [newModel, setNewModel]             = useState('')
  const [newMileage, setNewMileage]         = useState('')
  const [newClientName, setNewClientName]   = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientDoc, setNewClientDoc]     = useState('')
  const [newClientId, setNewClientId]       = useState<number | null>(null)
  const [newStatus, setNewStatus]           = useState<'quote' | 'open'>('quote')
  const [createError, setCreateError]       = useState('')
  const [lookupLoading, setLookupLoading]   = useState(false)
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null)

  const { data: orders = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
    staleTime: 30_000,
  })

  const triggerLookup = async (plateToSearch: string) => {
    const clean = plateToSearch.replace(/[-\s]/g, '').toUpperCase()
    if (clean.length !== 7 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(clean)) return
    setLookupLoading(true)
    setLookupFeedback(null)
    try {
      const res = await api.lookupPlate(clean)
      if (res.found) {
        if (res.vehicle?.model) setNewModel(res.vehicle.model)
        if (res.vehicle?.mileage) setNewMileage(String(res.vehicle.mileage))
        if (res.client) {
          setNewClientId(res.client.id ?? null)
          if (res.client.name) setNewClientName(res.client.name)
          if (res.client.phone) setNewClientPhone(res.client.phone)
          if (res.client.document) setNewClientDoc(res.client.document)
        }
        setLookupFeedback('Cadastro localizado! Valide e confirme o telefone e nome do cliente para prosseguir.')
      } else {
        setNewClientId(null)
        setNewClientName('')
        setNewClientPhone('')
        setNewClientDoc('')
        setNewModel('')
        setNewMileage('')
        setLookupFeedback('Novo veículo / cliente! Preencha a ficha cadastral abaixo.')
      }
    } catch {
      // silencioso
    } finally {
      setLookupLoading(false)
    }
  }

  const { mutate: handleCreate, isPending: creating } = useMutation({
    mutationFn: () => {
      const plate = newPlate.trim().toUpperCase()
      const model = newModel.trim()
      const mileage = parseInt(newMileage.replace(/\D/g, ''), 10) || 0
      const clientName = newClientName.trim()
      const clientPhone = newClientPhone.trim()
      const clientDoc = newClientDoc.trim()

      if (!plate) throw new Error('A placa do veículo é obrigatória')
      if (!model) throw new Error('O modelo do veículo é obrigatório')
      if (mileage < 0) throw new Error('Quilometragem inválida')
      if (!clientName) throw new Error('O Nome Completo do cliente é obrigatório')
      if (!clientPhone || clientPhone.replace(/\D/g, '').length < 8) {
        throw new Error('Informe um número de Telefone / WhatsApp válido (mínimo 8 dígitos)')
      }

      return api.createOrder(
        { plate, model, mileage },
        newStatus,
        {
          id: newClientId,
          name: clientName,
          phone: clientPhone,
          document: clientDoc || undefined,
        }
      )
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setModalOpen(false)
      setNewPlate('')
      setNewModel('')
      setNewMileage('')
      setNewClientName('')
      setNewClientPhone('')
      setNewClientDoc('')
      setNewClientId(null)
      setLookupFeedback(null)
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
          o.id.toLowerCase().includes(q) ||
          (o.client?.name && o.client.name.toLowerCase().includes(q)) ||
          (o.client?.phone && o.client.phone.includes(q))
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
              setLookupFeedback(null)
              setNewPlate('')
              setNewModel('')
              setNewMileage('')
              setNewClientName('')
              setNewClientPhone('')
              setNewClientDoc('')
              setNewClientId(null)
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
          placeholder="Buscar por placa, modelo, cliente ou telefone…"
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
                    <th className="px-5 py-3">Placa / Cliente</th>
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
                      <td className="px-5 py-3">
                        <div className="font-bold text-white tracking-wide">{o.vehicle.plate}</div>
                        {o.client?.name ? (
                          <div className="text-xs text-slate-300 font-medium truncate max-w-[200px]" title={o.client.name}>
                            👤 {o.client.name}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic">Cliente s/ cadastro</div>
                        )}
                        {o.client?.phone && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            📞 {o.client.phone}
                          </div>
                        )}
                      </td>
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-white">Novo Atendimento</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-400 text-xs mb-4">
              Identifique o veículo e registre ou valide obrigatoriamente os dados de contato do cliente logo no arranque do atendimento.
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
                    className={`py-2.5 px-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
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
                    className={`py-2.5 px-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
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

              {/* Placa do Veículo com Consulta Automática */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200">
                    Placa do Veículo *
                  </label>
                  {lookupLoading && (
                    <span className="text-[11px] text-blue-400 animate-pulse">
                      🔍 Consultando placa…
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="Ex: ABC1D23"
                    value={newPlate}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
                      setNewPlate(v)
                      const clean = v.replace(/[-\s]/g, '')
                      if (clean.length === 7) {
                        triggerLookup(v)
                      } else if (clean.length < 7 && newClientId) {
                        setNewClientId(null)
                        setNewClientName('')
                        setNewClientPhone('')
                        setNewClientDoc('')
                        setNewModel('')
                        setNewMileage('')
                        setLookupFeedback(null)
                      }
                    }}
                    onBlur={() => {
                      const clean = newPlate.replace(/[-\s]/g, '')
                      if (clean.length === 7) {
                        triggerLookup(newPlate)
                      }
                    }}
                    className="flex-1 bg-slate-800 border border-slate-700 text-white font-mono uppercase text-base rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => triggerLookup(newPlate)}
                    disabled={lookupLoading || newPlate.replace(/[-\s]/g, '').length !== 7}
                    className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs font-medium text-slate-200 rounded-xl transition-colors shrink-0"
                  >
                    🔍 Buscar
                  </button>
                </div>

                {lookupFeedback && (
                  <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                    newClientId || lookupFeedback.includes('localizado')
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                      : 'bg-blue-950/60 text-blue-300 border border-blue-800/50'
                  }`}>
                    <span>{newClientId ? '✅' : 'ℹ️'}</span>
                    <span>{lookupFeedback}</span>
                  </div>
                )}
              </div>

              {/* Seção Dados do Cliente (Obrigatórios) */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                    <span>👤</span> Contato do Cliente (Obrigatório)
                  </h3>
                  {newClientId && (
                    <span className="text-[10px] bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 px-2 py-0.5 rounded-full font-mono">
                      Cliente #{newClientId}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nome Completo do Cliente *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva Santos"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Telefone / WhatsApp *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: (31) 98888-7777"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      CPF / CNPJ <span className="text-[10px] text-slate-500">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 000.000.000-00"
                      value={newClientDoc}
                      onChange={(e) => setNewClientDoc(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Dados do Veículo */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                  <span>🚗</span> Dados do Veículo
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Modelo do Veículo *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Honda Civic 2.0 EXL"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Quilometragem (Km) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 45000"
                      value={newMileage}
                      onChange={(e) => setNewMileage(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg ${
                    newStatus === 'quote'
                      ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-950/40'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/40'
                  }`}
                >
                  {creating
                    ? 'Salvando…'
                    : newStatus === 'quote'
                    ? 'Criar Orçamento'
                    : 'Criar Ordem de Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
