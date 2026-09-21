import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { OrderItem } from '../types'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmClose, setConfirmClose] = useState(false)

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
  })

  const { mutate: closeOrder, isPending: closing } = useMutation({
    mutationFn: () => api.updateOrderStatus(id!, 'closed'),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      setConfirmClose(false)
    },
  })

  if (isLoading) {
    return <div className="py-32 text-center text-slate-500">Carregando OS…</div>
  }

  if (isError || !order) {
    return (
      <div className="py-32 text-center">
        <p className="text-red-400 mb-4">OS não encontrada.</p>
        <button onClick={() => navigate('/orders')} className="text-blue-400 hover:text-blue-300 text-sm">
          ← Voltar para lista
        </button>
      </div>
    )
  }

  const parts    = order.items.filter((i) => i.type === 'part')
  const services = order.items.filter((i) => i.type === 'service')
  const totalParts  = order.items.reduce((s, i) => s + i.total, 0)
  const totalLabor  = order.items.reduce((s, i) => s + (i.laborPrice ?? 0), 0)
  const totalGeral  = totalParts + totalLabor

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/orders" className="hover:text-slate-300">Ordens de Serviço</Link>
        <span>/</span>
        <span className="font-mono text-slate-300">#{order.id.split('-')[0].toUpperCase()}</span>
      </div>

      {/* Header card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-mono text-slate-500 uppercase">
              OS #{order.id.split('-')[0].toUpperCase()}
            </p>
            <h1 className="text-3xl font-bold text-white mt-1">{order.vehicle.plate}</h1>
            <p className="text-slate-400 mt-1">
              {order.vehicle.model} &middot; {order.vehicle.mileage.toLocaleString('pt-BR')} km
            </p>
            <div className="flex items-center gap-3 mt-3">
              <StatusBadge status={order.status} />
              <span className="text-xs text-slate-500">
                Criada em {fmtDate(order.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {order.status !== 'closed' && (
              <button
                onClick={() => setConfirmClose(true)}
                className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-xl text-sm font-semibold border border-red-800/50 transition-colors"
              >
                Encerrar OS
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm close dialog */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-white mb-2">Encerrar OS?</h2>
            <p className="text-slate-400 text-sm mb-6">
              A OS <strong className="text-white">{order.vehicle.plate}</strong> será marcada como encerrada.
              Esta ação não pode ser desfeita por aqui.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => closeOrder()}
                disabled={closing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {closing ? 'Encerrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items */}
      {order.items.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 py-16 text-center text-slate-500">
          Nenhum item lançado nesta OS.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Parts */}
          {parts.length > 0 && (
            <ItemsTable title="Peças" items={parts} accentColor="text-amber-400" />
          )}
          {/* Services */}
          {services.length > 0 && (
            <ItemsTable title="Mão de Obra" items={services} accentColor="text-blue-400" />
          )}
        </div>
      )}

      {/* Summary */}
      {order.items.length > 0 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Resumo</h3>
          <div className="space-y-2.5">
            <SummaryRow label="Total Peças"      value={currency(totalParts)} color="text-amber-400" />
            <SummaryRow label="Total Mão de Obra" value={currency(totalLabor)} color="text-blue-400" />
            <div className="border-t border-slate-700 pt-3 mt-1">
              <SummaryRow
                label="Total Geral"
                value={currency(totalGeral)}
                color="text-green-400"
                bold
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemsTable({
  title, items, accentColor,
}: {
  title: string; items: OrderItem[]; accentColor: string
}) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Descrição</th>
              <th className="px-5 py-3 text-right">Qtd</th>
              <th className="px-5 py-3 text-right">Unit.</th>
              <th className="px-5 py-3 text-right">Total Peça</th>
              <th className="px-5 py-3 text-right">M.O.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/30">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{item.code}</td>
                <td className="px-5 py-3 text-slate-200">{item.description}</td>
                <td className="px-5 py-3 text-right text-slate-300">{item.quantity}</td>
                <td className="px-5 py-3 text-right text-slate-300">
                  {currency(item.unitPrice)}
                </td>
                <td className={`px-5 py-3 text-right font-semibold ${accentColor}`}>
                  {currency(item.total)}
                </td>
                <td className="px-5 py-3 text-right font-semibold text-blue-400">
                  {(item.laborPrice ?? 0) > 0 ? currency(item.laborPrice) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryRow({
  label, value, color, bold,
}: {
  label: string; value: string; color: string; bold?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-bold text-white' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-sm font-semibold ${color} ${bold ? 'text-base' : ''}`}>{value}</span>
    </div>
  )
}
