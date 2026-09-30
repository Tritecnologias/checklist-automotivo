import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Plus,
  RotateCw,
  Search,
  Printer,
  CheckCircle2,
  Phone,
  MessageCircle,
  ExternalLink,
  Clock,
  Car,
  User,
  AlertCircle,
  Check,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { Order } from '../types'
import { useAuth } from '../contexts/AuthContext'

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

type QuoteFilter = 'pending' | 'approved' | 'all'

const FILTER_TABS: { key: QuoteFilter; label: string }[] = [
  { key: 'pending',  label: 'Aguardando Aprovação' },
  { key: 'approved', label: 'Aprovados (Gerou OS)' },
  { key: 'all',      label: 'Todos os Orçamentos' },
]

export default function Quotes() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [search, setSearch]       = useState('')
  const [filterTab, setFilterTab] = useState<QuoteFilter>('pending')

  // Modal Novo Orçamento
  const [modalOpen, setModalOpen]           = useState(false)
  const [newPlate, setNewPlate]             = useState('')
  const [newModel, setNewModel]             = useState('')
  const [newMileage, setNewMileage]         = useState('')
  const [newClientName, setNewClientName]   = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientDoc, setNewClientDoc]     = useState('')
  const [newClientId, setNewClientId]       = useState<number | null>(null)
  const [createError, setCreateError]       = useState('')
  const [lookupLoading, setLookupLoading]   = useState(false)
  const [lookupFeedback, setLookupFeedback] = useState<string | null>(null)

  const { currentTenant } = useAuth()
  const tid = currentTenant?.id ?? null

  // Consulta de ordens
  const { data: orders = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['orders', tid],
    queryFn: () => api.listOrders(),
    staleTime: 30_000,
  })

  // Mutação para aprovar orçamento direto da lista
  const { mutate: handleApproveQuote, isPending: approving } = useMutation({
    mutationFn: (id: string) => api.approveQuote(id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.setQueryData(['order', updated.id], updated)
    },
  })

  // Consulta de placa automática
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
        setLookupFeedback('Cadastro localizado! Valide e confirme os dados do cliente.')
      } else {
        setNewClientId(null)
        setNewClientName('')
        setNewClientPhone('')
        setNewClientDoc('')
        setNewModel('')
        setNewMileage('')
        setLookupFeedback('Novo veículo / cliente! Preencha a ficha para emitir o orçamento.')
      }
    } catch {
      // silencioso
    } finally {
      setLookupLoading(false)
    }
  }

  // Criar orçamento (sempre status='quote')
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
      if (!clientName) throw new Error('O Nome do cliente é obrigatório')
      if (!clientPhone || clientPhone.replace(/\D/g, '').length < 8) {
        throw new Error('Informe um número de Telefone / WhatsApp válido')
      }

      return api.createOrder(
        { plate, model, mileage },
        'quote',
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
      setCreateError(err.message || 'Erro ao criar orçamento')
    },
  })

  // Filtros e métricas
  // Consideramos como orçamento qualquer registro com status 'quote' (pendente)
  // ou que começou como orçamento e foi aprovado/faturado
  const pendingQuotes = useMemo(
    () => orders.filter((o) => o.status === 'quote'),
    [orders]
  )

  const approvedQuotes = useMemo(
    () => orders.filter((o) => o.status !== 'quote'),
    [orders]
  )

  const totalPendingValue = useMemo(
    () => pendingQuotes.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
    [pendingQuotes]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      // Filtro de aba
      if (filterTab === 'pending' && o.status !== 'quote') return false
      if (filterTab === 'approved' && o.status === 'quote') return false

      // Busca textual
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
  }, [orders, search, filterTab])

  // Impressão rápida do orçamento
  const handlePrintQuote = useCallback((o: Order) => {
    const cleanPhone = o.client?.phone?.replace(/\D/g, '') || ''
    const printWindow = window.open('', '_blank', 'width=800,height=900')
    if (!printWindow) return

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Orçamento #${o.id.split('-')[0].toUpperCase()} - ${o.vehicle.plate}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            margin: 0;
            padding: 20px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .title { font-size: 20px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
          .badge-quote {
            background: #f3e8ff;
            color: #7e22ce;
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 12px;
            text-transform: uppercase;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 14px;
          }
          .card-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
          }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .info-label { color: #64748b; font-size: 12px; }
          .info-value { font-weight: 600; color: #0f172a; font-size: 12px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 12px;
          }
          th {
            background: #f1f5f9;
            color: #475569;
            text-align: left;
            padding: 8px 10px;
            font-size: 11px;
            text-transform: uppercase;
            border-bottom: 1px solid #cbd5e1;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .text-right { text-align: right; }
          .total-box {
            margin-top: 25px;
            margin-left: auto;
            width: 280px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px 16px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            margin-bottom: 4px;
          }
          .total-main {
            font-size: 18px;
            font-weight: bold;
            color: #166534;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            margin-top: 6px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 15px;
            border-top: 1px dashed #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
          }
          .signature-box {
            margin-top: 50px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #94a3b8;
            padding-top: 6px;
            font-size: 12px;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">ORÇAMENTO DE SERVIÇOS & PEÇAS</h1>
            <p class="subtitle">Emissão: ${fmtDate(o.createdAt)} &bull; Orçamento #${o.id.split('-')[0].toUpperCase()}</p>
          </div>
          <div>
            <span class="badge-quote">
              ${o.status === 'quote' ? 'Proposta / Orçamento' : 'Orçamento Aprovado'}
            </span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Dados do Cliente</div>
            <div class="info-row">
              <span class="info-label">Nome:</span>
              <span class="info-value">${o.client?.name || 'Não informado'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Telefone / WhatsApp:</span>
              <span class="info-value">${o.client?.phone || 'Não informado'}</span>
            </div>
            ${o.client?.document ? `
            <div class="info-row">
              <span class="info-label">CPF / CNPJ:</span>
              <span class="info-value">${o.client.document}</span>
            </div>` : ''}
          </div>

          <div class="card">
            <div class="card-title">Dados do Veículo</div>
            <div class="info-row">
              <span class="info-label">Placa:</span>
              <span class="info-value">${o.vehicle.plate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Modelo:</span>
              <span class="info-value">${o.vehicle.model}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Quilometragem:</span>
              <span class="info-value">${o.vehicle.mileage.toLocaleString('pt-BR')} km</span>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item / Descrição</th>
              <th class="text-right">Qtd</th>
              <th class="text-right">Unitário</th>
              <th class="text-right">M.O.</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(o.items || []).length === 0 ? `
              <tr>
                <td colspan="5" style="text-align:center; padding: 20px; color:#94a3b8;">
                  Nenhum item adicionado ainda a este orçamento.
                </td>
              </tr>
            ` : (o.items || []).map(i => `
              <tr>
                <td>
                  <strong>${i.description}</strong>
                  ${i.code ? `<br/><small style="color:#64748b;">Cód: ${i.code}</small>` : ''}
                </td>
                <td class="text-right">${i.quantity}</td>
                <td class="text-right">${currency(i.unitPrice)}</td>
                <td class="text-right">${(i.laborPrice || 0) > 0 ? currency(i.laborPrice) : '—'}</td>
                <td class="text-right" style="font-weight:600;">${currency(i.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${currency(Number(o.totalAmount || 0) + Number(o.discountAmount || 0))}</span>
          </div>
          ${Number(o.discountAmount || 0) > 0 ? `
          <div class="total-row" style="color:#b91c1c;">
            <span>Desconto:</span>
            <span>- ${currency(Number(o.discountAmount))}</span>
          </div>` : ''}
          <div class="total-row total-main">
            <span>Total:</span>
            <span>${currency(Number(o.totalAmount || 0))}</span>
          </div>
        </div>

        <div style="margin-top: 30px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 10px 14px; border-radius: 6px;">
          <strong>Condições Gerais:</strong> Este orçamento é válido por 10 dias corridos a partir da data de emissão.
          Os preços das peças e serviços estão sujeitos a confirmação no momento da aprovação caso haja variações de mercado.
        </div>

        <div class="signature-box">
          <div>
            <div class="signature-line">Assinatura do Consultor / Responsável</div>
          </div>
          <div>
            <div class="signature-line">Assinatura de Aprovação do Cliente</div>
          </div>
        </div>

        <div class="footer">
          <span>Sistema Checklist Automotivo &bull; Impresso em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</span>
          <span>Orçamento #${o.id.split('-')[0].toUpperCase()}</span>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }, [])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Orçamentos</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Propostas comerciais, estimativas de peças e serviços para aprovação
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-medium text-slate-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{isFetching ? 'Atualizando…' : 'Atualizar'}</span>
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
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Orçamento</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Aguardando Aprovação</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-2">{pendingQuotes.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Orçamentos em aberto</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total em Orçamentos</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{currency(totalPendingValue)}</p>
          <p className="text-[11px] text-slate-500 mt-1">Em propostas pendentes</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Aprovados / Viraram OS</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-400 mt-2">{approvedQuotes.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Transformados em OS</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Geral</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{orders.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">Histórico completo</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por placa, cliente, telefone ou modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 overflow-x-auto shrink-0">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filterTab === key
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Orçamentos */}
      {isLoading ? (
        <div className="py-24 text-center text-slate-500">Carregando orçamentos…</div>
      ) : isError ? (
        <div className="py-24 text-center">
          <p className="text-red-400 mb-4">Erro ao carregar orçamentos.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-purple-600 rounded-xl text-sm font-medium text-white"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-400">Nenhum orçamento encontrado</p>
              <p className="text-xs text-slate-600 mt-1">
                {search ? 'Tente ajustar os termos da busca.' : 'Clique em "+ Novo Orçamento" para iniciar uma proposta.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="px-5 py-3">Orçamento</th>
                    <th className="px-5 py-3">Placa / Veículo</th>
                    <th className="px-5 py-3">Cliente / Contato</th>
                    <th className="px-5 py-3">Situação</th>
                    <th className="px-5 py-3 text-right">Valor Total</th>
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((o) => {
                    const isPending = o.status === 'quote'
                    const digitsPhone = o.client?.phone?.replace(/\D/g, '') || ''

                    return (
                      <tr key={o.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* ID */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-semibold text-purple-400 bg-purple-950/50 border border-purple-800/50 px-2 py-0.5 rounded">
                            #{o.id.split('-')[0].toUpperCase()}
                          </span>
                        </td>

                        {/* Veículo */}
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-white tracking-wide">{o.vehicle.plate}</div>
                          <div className="text-xs text-slate-300 truncate max-w-[200px]" title={o.vehicle.model}>
                            {o.vehicle.model}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {o.vehicle.mileage.toLocaleString('pt-BR')} km
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="px-5 py-3.5">
                          {o.client?.name ? (
                            <div className="font-medium text-slate-200 text-xs truncate max-w-[200px]">
                              {o.client.name}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">Cliente s/ cadastro</div>
                          )}

                          {digitsPhone ? (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-slate-400 font-mono">
                                {o.client?.phone}
                              </span>
                              <a
                                href={`https://wa.me/55${digitsPhone}?text=${encodeURIComponent(
                                  `Olá ${o.client?.name || ''}, seu orçamento para o veículo ${o.vehicle.plate} (${o.vehicle.model}) já está disponível!`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center text-[10px] text-emerald-400 hover:text-emerald-300 gap-1 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40"
                                title="Enviar mensagem no WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </a>
                            </div>
                          ) : null}
                        </td>

                        {/* Situação */}
                        <td className="px-5 py-3.5">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-950/70 text-purple-300 border border-purple-800/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                              <span>Aguardando Aprovação</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/70 text-blue-300 border border-blue-800/50">
                                <Check className="w-3 h-3 text-blue-400" />
                                <span>Aprovado (OS)</span>
                              </span>
                              <StatusBadge status={o.status} />
                            </div>
                          )}
                        </td>

                        {/* Valor */}
                        <td className="px-5 py-3.5 text-right font-bold text-emerald-400">
                          {currency(o.totalAmount)}
                        </td>

                        {/* Data */}
                        <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                          {fmtDate(o.createdAt)}
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isPending && (
                              <button
                                onClick={() => handleApproveQuote(o.id)}
                                disabled={approving}
                                className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                                title="Aprovar e gerar Ordem de Serviço"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Aprovar</span>
                              </button>
                            )}

                            <button
                              onClick={() => handlePrintQuote(o)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                              title="Imprimir Orçamento"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            <Link
                              to={`/orders/${o.id}`}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                              title="Abrir Orçamento"
                            >
                              <span>Detalhes</span>
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal — Novo Orçamento */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl my-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <FileText className="w-4 h-4" />
                </div>
                <h2 className="text-xl font-bold text-white">Novo Orçamento</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-400 text-xs mb-4">
              Identifique o veículo e registre os dados do cliente para emitir a proposta comercial.
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
              {/* Placa do Veículo com Consulta Automática */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200">
                    Placa do Veículo *
                  </label>
                  {lookupLoading && (
                    <span className="text-[11px] text-purple-400 animate-pulse">
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
                    className="flex-1 bg-slate-800 border border-slate-700 text-white font-mono uppercase text-base rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  <div
                    className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                      newClientId || lookupFeedback.includes('localizado')
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                        : 'bg-purple-950/60 text-purple-300 border border-purple-800/50'
                    }`}
                  >
                    <span>{newClientId ? '✅' : 'ℹ️'}</span>
                    <span>{lookupFeedback}</span>
                  </div>
                )}
              </div>

              {/* Seção Dados do Cliente */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-purple-400" />
                    <span>Contato do Cliente (Obrigatório)</span>
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
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Dados do Veículo */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-purple-400" />
                  <span>Dados do Veículo</span>
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
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-purple-950/40"
                >
                  {creating ? 'Criando…' : 'Criar Orçamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
