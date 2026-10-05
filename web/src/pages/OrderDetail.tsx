import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Printer,
  Search,
  Plus,
  Minus,
  Trash2,
  Wrench,
  Package,
  Edit2,
  X,
  Check,
  AlertCircle,
  ShoppingCart,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import { api, oficinaApi } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { OrderItem, CatalogItem, Mecanico, OrderAdminUser } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { lookupCep, formatCep, formatCpfCnpj, formatPhone } from '../lib/cep'

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

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── estado de modais de OS ────────────────────────────────────────────────
  const [confirmClose, setConfirmClose]                 = useState(false)
  const [adminPassword, setAdminPassword]               = useState('')
  const [adminPasswordVisible, setAdminPasswordVisible] = useState(false)
  const [selectedAdminId, setSelectedAdminId]           = useState<number | null>(null)
  const [closeError, setCloseError]                     = useState('')
  const [sendToPdvOnClose, setSendToPdvOnClose]         = useState(false)

  // Confirmação de dados do cliente ao finalizar OS
  const [confirmClientName, setConfirmClientName]       = useState('')
  const [confirmClientDoc, setConfirmClientDoc]         = useState('')
  const [confirmClientPhone, setConfirmClientPhone]     = useState('')
  const [confirmClientCep, setConfirmClientCep]         = useState('')
  const [confirmClientAddress, setConfirmClientAddress] = useState('')
  const [loadingConfirmCep, setLoadingConfirmCep]       = useState(false)

  const handleConfirmCepSearch = async (cepInput: string) => {
    const clean = cepInput.replace(/\D/g, '')
    if (clean.length === 8) {
      setLoadingConfirmCep(true)
      try {
        const res = await lookupCep(clean)
        if (res && res.formattedAddress) {
          setConfirmClientAddress(res.formattedAddress)
        }
      } catch (err) {
        console.error('Erro ao buscar CEP na confirmação da OS:', err)
      } finally {
        setLoadingConfirmCep(false)
      }
    }
  }

  const [showReopenPin, setShowReopenPin]   = useState(false)
  const [pin, setPin]                       = useState('')
  const [pinError, setPinError]             = useState('')
  const [verifying, setVerifying]           = useState(false)

  // ── estado de edição de cliente ───────────────────────────────────────────
  const [editClientOpen, setEditClientOpen]   = useState(false)
  const [editClientName, setEditClientName]   = useState('')
  const [editClientPhone, setEditClientPhone] = useState('')
  const [editClientDoc, setEditClientDoc]     = useState('')
  const [editClientCep, setEditClientCep]     = useState('')
  const [editClientAddress, setEditClientAddress] = useState('')
  const [loadingEditCep, setLoadingEditCep]   = useState(false)
  const [editClientError, setEditClientError] = useState('')

  const handleEditCepSearch = async (cepInput: string) => {
    const clean = cepInput.replace(/\D/g, '')
    if (clean.length === 8) {
      setLoadingEditCep(true)
      try {
        const res = await lookupCep(clean)
        if (res && res.formattedAddress) {
          setEditClientAddress(res.formattedAddress)
        }
      } catch (err) {
        console.error('Erro ao buscar CEP:', err)
      } finally {
        setLoadingEditCep(false)
      }
    }
  }

  // ── estado de busca no catálogo ───────────────────────────────────────────
  const [searchQuery, setSearchQuery]           = useState('')
  const [debouncedQuery, setDebouncedQuery]     = useState('')
  const [searchFocused, setSearchFocused]       = useState(false)
  const searchContainerRef                      = useRef<HTMLDivElement>(null)

  // ── estado do modal de adicionar item ─────────────────────────────────────
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null)
  const [addItemQty, setAddItemQty]                   = useState(1)
  const [addItemUnitPrice, setAddItemUnitPrice]       = useState<number>(0)
  const [addItemLabor, setAddItemLabor]               = useState<number>(0)
  const [addItemInstId, setAddItemInstId]             = useState<number | null>(null)
  const [addItemMecanicoId, setAddItemMecanicoId]     = useState<number | null>(null)
  const [addItemError, setAddItemError]               = useState('')

  // ── estado do modal de exclusão de item ───────────────────────────────────
  const [itemToDelete, setItemToDelete] = useState<OrderItem | null>(null)

  // ── estado do modal de edição de mão de obra de item ──────────────────────
  const [editingLaborItem, setEditingLaborItem] = useState<OrderItem | null>(null)
  const [laborInputValue, setLaborInputValue]   = useState('')
  const [laborError, setLaborError]             = useState('')

  // Debounce da busca de catálogo
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fechar dropdown de busca ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { currentTenant, user: currentUser } = useAuth()
  const tid = currentTenant?.id ?? null
  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'manager'

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ['order', id, tid],
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const ord = query.state.data
      if (ord?.status === 'closed' || ord?.vendaControle) return false
      return 10_000
    },
  })

  const isClosed = order?.status === 'closed' || !!order?.vendaControle

  // Lista de Administradores para autorização de finalização
  const { data: administradores = [] } = useQuery<OrderAdminUser[]>({
    queryKey: ['administradores', order?.tenantId],
    queryFn: () => api.getAdministradores(order?.tenantId),
    enabled: confirmClose,
  })

  const { data: searchResults, isFetching: searchingCatalog } = useQuery({
    queryKey: ['catalog-search', debouncedQuery],
    queryFn: () => api.searchCatalog(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && !isClosed,
  })

  // Lista de Mecânicos / Técnicos
  const { data: mecanicos = [] } = useQuery<Mecanico[]>({
    queryKey: ['mecanicos', tid],
    queryFn: () => oficinaApi.listMecanicos({ apenasAtivos: true }),
  })

  // ── Mutações ──────────────────────────────────────────────────────────────

  // Atualizar Mecânico da OS
  const { mutate: handleUpdateOrderMechanic, isPending: updatingOrderMechanic } = useMutation({
    mutationFn: (mecanicoId: number | null) => api.updateOrderMechanic(id!, mecanicoId),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Erro ao definir mecânico da OS')
    },
  })

  // Atualizar Auxiliar da OS
  const { mutate: handleUpdateOrderAuxiliar, isPending: updatingOrderAuxiliar } = useMutation({
    mutationFn: (auxiliarId: number | null) => api.updateOrderAuxiliar(id!, auxiliarId),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Erro ao definir auxiliar da OS')
    },
  })

  // Atualizar Mecânico de um Item
  const { mutate: handleUpdateItemMechanic } = useMutation({
    mutationFn: ({ itemId, mecanicoId }: { itemId: string; mecanicoId: number | null }) =>
      api.updateItemMechanic(id!, itemId, mecanicoId),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['oficina-produtividade'] })
    },
    onError: (err: any) => {
      alert(err.message || 'Erro ao alterar mecânico do item')
    },
  })

  // Editar Cliente
  const { mutate: handleUpdateClient, isPending: savingClient } = useMutation({
    mutationFn: () =>
      api.updateOrderClient(id!, {
        name: editClientName.trim(),
        phone: editClientPhone.trim(),
        document: editClientDoc.trim() || undefined,
        cep: editClientCep.trim() || undefined,
        address: editClientAddress.trim() || undefined,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      setEditClientOpen(false)
    },
    onError: (err: any) => {
      setEditClientError(err.message || 'Erro ao atualizar dados do cliente')
    },
  })

  // Aprovar Orçamento (Virar OS)
  const { mutate: approveQuote, isPending: approving } = useMutation({
    mutationFn: () => {
      const cCep = order?.client?.cep?.trim() || order?.cep?.trim() || ''
      const cAddr = order?.client?.address?.trim() || order?.endereco?.trim() || ''
      if (!cCep || cCep.replace(/\D/g, '').length < 8 || !cAddr || cAddr.length < 3) {
        throw new Error('CEP_ADDRESS_REQUIRED')
      }
      return api.approveQuote(id!)
    },
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      if (err?.message === 'CEP_ADDRESS_REQUIRED') {
        setEditClientName(order?.client?.name || '')
        setEditClientPhone(order?.client?.phone || '')
        setEditClientDoc(order?.client?.document || '')
        setEditClientCep(order?.client?.cep || order?.cep || '')
        setEditClientAddress(order?.client?.address || order?.endereco || '')
        setEditClientError('Para aprovar o orçamento, é obrigatório preencher o CEP e o Endereço completo do cliente.')
        setEditClientOpen(true)
      } else {
        alert(err?.message || 'Erro ao aprovar orçamento')
      }
    },
  })

  // Finalizar OS (exige confirmação dos dados do cliente e senha de administrador)
  const { mutate: closeOrder, isPending: closing } = useMutation({
    mutationFn: async (sendToPdv: boolean = false) => {
      const name = confirmClientName.trim()
      const doc = confirmClientDoc.trim()
      const phone = confirmClientPhone.trim()
      const cep = confirmClientCep.trim()
      const address = confirmClientAddress.trim()

      if (!name || name.length < 2) {
        throw new Error('Informe o nome completo do cliente.')
      }
      const cleanDoc = doc.replace(/\D/g, '')
      if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
        throw new Error('O CPF deve conter 11 dígitos ou CNPJ 14 dígitos.')
      }
      const cleanPhone = phone.replace(/\D/g, '')
      if (cleanPhone.length < 8) {
        throw new Error('Informe um telefone ou WhatsApp válido com DDD.')
      }
      const cleanCep = cep.replace(/\D/g, '')
      if (cleanCep.length !== 8) {
        throw new Error('Informe um CEP válido com 8 dígitos.')
      }
      if (!address || address.length < 3) {
        throw new Error('Informe o endereço completo do cliente.')
      }

      if (!adminPassword.trim()) {
        throw new Error('Informe a senha do administrador para autorizar a finalização.')
      }
      const adminIdToUse = isAdmin
        ? (selectedAdminId ?? currentUser?.id ?? null)
        : selectedAdminId

      if (!adminIdToUse) {
        throw new Error('Selecione o administrador responsável para autorizar a finalização.')
      }

      const updated = await api.finalizarOrder(id!, {
        adminPassword: adminPassword.trim(),
        adminUserId: adminIdToUse,
        client: {
          name,
          document: doc,
          phone,
          cep,
          address,
        },
      })

      return { updated, sendToPdv }
    },
    onSuccess: ({ updated, sendToPdv }) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['pdv-os-encerradas'] })
      setConfirmClose(false)
      setAdminPassword('')
      setCloseError('')
      if (sendToPdv) {
        navigate(`/erp/pdv?osId=${id}`)
      }
    },
    onError: (err: any) => {
      setCloseError(err.message || 'Erro ao finalizar Ordem de Serviço')
    },
  })

  // Reabrir OS
  const { mutate: reopenOrder, isPending: reopening } = useMutation({
    mutationFn: () => api.reopenOrder(id!),
    onSuccess: (updated) => {
      qc.setQueryData(['order', id], updated)
      qc.invalidateQueries({ queryKey: ['orders'] })
      setShowReopenPin(false)
      setPin('')
      setPinError('')
    },
  })

  // Adicionar Item
  const { mutate: handleAddItem, isPending: addingItem } = useMutation({
    mutationFn: async () => {
      if (!selectedCatalogItem) throw new Error('Nenhum item selecionado')
      if (
        selectedCatalogItem.instalacoes &&
        selectedCatalogItem.instalacoes.length > 0 &&
        !addItemInstId
      ) {
        throw new Error('Selecione o local de instalação obrigatório')
      }
      return api.addItem(id!, {
        catalogItemId: selectedCatalogItem.id,
        quantity: addItemQty,
        unitPrice: addItemUnitPrice,
        laborPrice: addItemLabor,
        instalacaoId: addItemInstId,
        mecanicoId: addItemMecanicoId ?? undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setSelectedCatalogItem(null)
      setSearchQuery('')
      setDebouncedQuery('')
      setSearchFocused(false)
    },
    onError: (err: any) => {
      setAddItemError(err.message || 'Erro ao adicionar item')
    },
  })

  // Remover Item
  const { mutate: handleDeleteItem, isPending: deletingItem } = useMutation({
    mutationFn: (itemId: string) => api.removeItem(id!, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setItemToDelete(null)
    },
  })

  // Atualizar Quantidade
  const { mutate: handleUpdateQuantity } = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.updateItemQuantity(id!, itemId, quantity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Atualizar Mão de Obra do Item
  const { mutate: handleUpdateLabor, isPending: updatingLabor } = useMutation({
    mutationFn: () => {
      if (!editingLaborItem) throw new Error('Nenhum item selecionado')
      const val = parseFloat(laborInputValue.replace(',', '.'))
      if (isNaN(val) || val < 0) throw new Error('Informe um valor válido maior ou igual a zero')
      return api.updateItemLabor(id!, editingLaborItem.id, val)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setEditingLaborItem(null)
    },
    onError: (err: any) => {
      setLaborError(err.message || 'Erro ao atualizar mão de obra')
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectCatalogItem = (item: CatalogItem) => {
    setSelectedCatalogItem(item)
    setAddItemQty(1)
    setAddItemUnitPrice(item.unitPrice)
    setAddItemLabor(0)
    setAddItemInstId(
      item.instalacoes && item.instalacoes.length > 0 ? item.instalacoes[0].id : null
    )
    setAddItemMecanicoId(order?.mecanicoId || null)
    setAddItemError('')
    setSearchFocused(false)
  }

  const handleQuantityDelta = (item: OrderItem, delta: number) => {
    if (isClosed) return
    const next = item.quantity + delta
    if (next <= 0) {
      setItemToDelete(item)
    } else {
      handleUpdateQuantity({ itemId: item.id, quantity: next })
    }
  }

  const handleOpenEditLabor = (item: OrderItem) => {
    if (isClosed) return
    setEditingLaborItem(item)
    setLaborInputValue(String(item.laborPrice ?? 0))
    setLaborError('')
  }

  const handleReopenClick = () => {
    if (order?.vendaControle) {
      alert(`Esta OS já foi finalizada no PDV (Venda #${order.vendaControle}) e está permanentemente bloqueada contra reabertura.`)
      return
    }
    setPin('')
    setPinError('')
    setShowReopenPin(true)
  }

  const handlePinSubmit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('PIN deve ter exatamente 4 dígitos.')
      return
    }
    setVerifying(true)
    setPinError('')
    try {
      const result = await api.verifySupervisorPin(pin)
      if (result.authorized) {
        reopenOrder()
      } else {
        setPinError('PIN inválido. Somente administradores podem reabrir uma OS.')
      }
    } catch {
      setPinError('Erro ao verificar PIN. Tente novamente.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Renderização Condicional Inicial ──────────────────────────────────────

  if (isLoading) {
    return <div className="py-32 text-center text-slate-500">Carregando OS…</div>
  }

  if (isError || !order) {
    return (
      <div className="py-32 text-center">
        <p className="text-red-400 mb-4">Registro não encontrado.</p>
        <button
          onClick={() => navigate('/orders')}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          ← Voltar para lista
        </button>
      </div>
    )
  }

  const isQuote  = order.status === 'quote'
  const items    = order.items || []
  const parts    = items.filter((i) => i.type === 'part')
  const services = items.filter((i) => i.type === 'service')
  const totalParts = items.reduce((s, i) => s + i.total, 0)
  const totalLabor = items.reduce((s, i) => s + (i.laborPrice ?? 0), 0)
  const discount   = Number(order.discountAmount ?? 0)
  const totalGeral = order.vendaControle
    ? Number(order.totalAmount)
    : Math.max(0, totalParts + totalLabor - discount)

  const handlePrint = () => {
    if (!order) return
    const printWindow = window.open('', '_blank', 'width=800,height=900')
    if (!printWindow) return

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${isQuote ? 'Orçamento' : 'Ordem de Serviço'} #${order.id.split('-')[0].toUpperCase()} - ${order.vehicle.plate}</title>
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
          .badge {
            background: #f1f5f9;
            color: #334155;
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
            <h1 class="title">${isQuote ? 'ORÇAMENTO DE SERVIÇOS & PEÇAS' : 'ORDEM DE SERVIÇO'}</h1>
            <p class="subtitle">Emissão: ${fmtDate(order.createdAt)} &bull; Documento #${order.id.split('-')[0].toUpperCase()}</p>
          </div>
          <div>
            <span class="badge">
              ${isQuote ? 'Proposta / Orçamento' : `OS #${order.id.split('-')[0].toUpperCase()}`}
            </span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Dados do Cliente</div>
            <div class="info-row">
              <span class="info-label">Nome:</span>
              <span class="info-value">${order.client?.name || 'Não informado'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Telefone / WhatsApp:</span>
              <span class="info-value">${order.client?.phone || 'Não informado'}</span>
            </div>
            ${order.client?.document ? `
            <div class="info-row">
              <span class="info-label">CPF / CNPJ:</span>
              <span class="info-value">${order.client.document}</span>
            </div>` : ''}
            ${order.client?.cep ? `
            <div class="info-row">
              <span class="info-label">CEP:</span>
              <span class="info-value">${order.client.cep}</span>
            </div>` : ''}
            ${order.client?.address ? `
            <div class="info-row">
              <span class="info-label">Endereço:</span>
              <span class="info-value">${order.client.address}</span>
            </div>` : ''}
          </div>

          <div class="card">
            <div class="card-title">Dados do Veículo</div>
            <div class="info-row">
              <span class="info-label">Placa:</span>
              <span class="info-value">${order.vehicle.plate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Modelo:</span>
              <span class="info-value">${order.vehicle.model}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Quilometragem:</span>
              <span class="info-value">${order.vehicle.mileage.toLocaleString('pt-BR')} km</span>
            </div>
            <div class="info-row">
              <span class="info-label">Mecânico Responsável:</span>
              <span class="info-value">${order.mecanicoNome || 'Geral / Oficina'}</span>
            </div>
            ${order.auxiliarNome ? `
            <div class="info-row">
              <span class="info-label">Auxiliar de Mecânico:</span>
              <span class="info-value">${order.auxiliarNome}</span>
            </div>` : ''}
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
            ${(order.items || []).length === 0 ? `
              <tr>
                <td colspan="5" style="text-align:center; padding: 20px; color:#94a3b8;">
                  Nenhum item adicionado ainda.
                </td>
              </tr>
            ` : (order.items || []).map(i => `
              <tr>
                <td>
                  <strong>${i.description}</strong>
                  ${i.instalacaoSigla ? `<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:2px 5px; border-radius:4px; margin-left:6px; font-weight:bold;">${i.instalacaoSigla}</span>` : ''}
                  ${i.mecanicoNome ? `<span style="font-size:10px; background:#f1f5f9; color:#475569; padding:2px 5px; border-radius:4px; margin-left:6px;">🔧 ${i.mecanicoNome}</span>` : ''}
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
            <span>Subtotal Peças:</span>
            <span>${currency(totalParts)}</span>
          </div>
          <div class="total-row">
            <span>Subtotal Mão de Obra:</span>
            <span>${currency(totalLabor)}</span>
          </div>
          ${discount > 0 ? `
          <div class="total-row" style="color:#b91c1c;">
            <span>Desconto:</span>
            <span>- ${currency(discount)}</span>
          </div>` : ''}
          <div class="total-row total-main">
            <span>Total Geral:</span>
            <span>${currency(totalGeral)}</span>
          </div>
        </div>

        ${isQuote ? `
        <div style="margin-top: 30px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 10px 14px; border-radius: 6px;">
          <strong>Condições Gerais:</strong> Este orçamento é válido por 10 dias corridos a partir da data de emissão.
        </div>` : ''}

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
          <span>Documento #${order.id.split('-')[0].toUpperCase()}</span>
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
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to={isQuote ? '/quotes' : '/orders'} className="hover:text-slate-300">
          {isQuote ? 'Orçamentos' : 'Ordens de Serviço'}
        </Link>
        <span>/</span>
        <span className="font-mono text-slate-300">#{order.id.split('-')[0].toUpperCase()}</span>
      </div>

      {/* Banner Orçamento */}
      {isQuote && (
        <div className="flex items-center justify-between flex-wrap gap-4 bg-purple-950/40 border border-purple-800/60 rounded-xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-sm font-semibold text-purple-200">Orçamento Aguardando Aprovação</p>
              <p className="text-xs text-purple-300/80 mt-0.5">
                Monte os itens e a proposta abaixo. Quando o cliente aprovar, clique no botão para transformar automaticamente em Ordem de Serviço.
              </p>
            </div>
          </div>
          <button
            onClick={() => approveQuote()}
            disabled={approving}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-900/30 transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            <span>✅</span>
            <span>{approving ? 'Aprovando…' : 'Aprovar Orçamento (Gerar OS)'}</span>
          </button>
        </div>
      )}

      {/* Banner somente-leitura */}
      {isClosed && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">🔒</span>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                OS Finalizada {order.finalizadoPorNome ? `por ${order.finalizadoPorNome}` : ''} — Somente leitura
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {order.closedAt ? `Finalizada em ${fmtDate(order.closedAt)}. ` : ''}
                Nenhuma alteração pode ser feita. Solicite a reabertura a um administrador para editar itens.
              </p>
            </div>
          </div>
          {order.finalizadoPorNome && (
            <span className="text-xs font-mono px-3 py-1 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg">
              Autorizado por: <strong className="text-white">{order.finalizadoPorNome}</strong>
            </span>
          )}
        </div>
      )}

      {/* Header cards: Veículo e Cliente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Veículo e status */}
        <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-mono text-slate-500 uppercase">
                {isQuote ? 'ORÇAMENTO' : 'OS'} #{order.id.split('-')[0].toUpperCase()}
              </p>
              <h1 className="text-3xl font-bold text-white mt-1">{order.vehicle.plate}</h1>
              <p className="text-slate-400 mt-1">
                {order.vehicle.model} &middot; {order.vehicle.mileage.toLocaleString('pt-BR')} km
              </p>
              <div className="flex items-center flex-wrap gap-3 mt-3">
                <StatusBadge status={order.status} />
                {order.vendaControle && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-700/60">
                    <span>💰</span> Faturada no PDV (#{order.vendaControle})
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  Criada em {fmtDate(order.createdAt)}
                </span>
              </div>

              {/* Mecânico Responsável & Auxiliar da OS */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {/* Mecânico Titular */}
                <div className="flex items-center flex-wrap gap-2.5">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-blue-400" />
                    <span>Mecânico Titular:</span>
                  </span>
                  {!isClosed ? (
                    <select
                      value={order.mecanicoId ?? ''}
                      disabled={updatingOrderMechanic}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null
                        handleUpdateOrderMechanic(val)
                      }}
                      className="bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs font-semibold text-white rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
                    >
                      <option value="">Não atribuído (Geral)</option>
                      {mecanicos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} {m.apelido ? `(${m.apelido})` : ''} {m.is_auxiliar ? '• [Auxiliar]' : '• [Titular]'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-bold text-white bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                      {order.mecanicoNome || 'Não atribuído'}
                    </span>
                  )}
                  {order.mecanicoNome && (
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full font-medium">
                      ✓ Titular
                    </span>
                  )}
                </div>

                {/* Auxiliar de Mecânico */}
                <div className="flex items-center flex-wrap gap-2.5">
                  <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>🤝</span>
                    <span>Auxiliar de Mecânico:</span>
                  </span>
                  {!isClosed ? (
                    <select
                      value={order.auxiliarId ?? ''}
                      disabled={updatingOrderAuxiliar}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null
                        handleUpdateOrderAuxiliar(val)
                      }}
                      className="bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs font-semibold text-amber-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors cursor-pointer"
                    >
                      <option value="">Nenhum auxiliar escalado</option>
                      {mecanicos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} {m.apelido ? `(${m.apelido})` : ''} {m.is_auxiliar ? '★ [Auxiliar]' : '• [Mecânico]'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-bold text-amber-200 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                      {order.auxiliarNome || 'Nenhum'}
                    </span>
                  )}
                  {order.auxiliarNome && (
                    <span className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-full font-medium">
                      ✓ Auxiliar Atribuído
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                title={isQuote ? 'Imprimir Orçamento' : 'Imprimir Ordem de Serviço'}
              >
                <Printer className="w-4 h-4 text-slate-400" />
                <span>Imprimir</span>
              </button>
              {isQuote ? (
                <button
                  onClick={() => approveQuote()}
                  disabled={approving}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-900/30 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <span>✅</span>
                  <span>{approving ? 'Aprovando…' : 'Aprovar Orçamento'}</span>
                </button>
              ) : !isClosed ? (
                <button
                  onClick={() => {
                    setCloseError('')
                    setAdminPassword('')
                    setAdminPasswordVisible(false)
                    setSendToPdvOnClose(false)
                    if (isAdmin && currentUser?.id) {
                      setSelectedAdminId(currentUser.id)
                    } else if (administradores.length > 0) {
                      setSelectedAdminId(administradores[0].id)
                    }
                    setConfirmClientName(order.client?.name || '')
                    setConfirmClientDoc(order.client?.document ? formatCpfCnpj(order.client.document) : '')
                    setConfirmClientPhone(order.client?.phone ? formatPhone(order.client.phone) : '')
                    setConfirmClientCep(formatCep(order.client?.cep || order.cep || ''))
                    setConfirmClientAddress(order.client?.address || order.endereco || '')
                    setConfirmClose(true)
                  }}
                  className="px-4 py-2.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded-xl text-sm font-bold border border-red-800/60 shadow-lg shadow-red-950/40 transition-all flex items-center gap-2"
                  title="Finalizar Ordem de Serviço (Confirmação dos dados do cliente e Senha de Administrador)"
                >
                  <span>🔒</span>
                  <span>Finalizar OS</span>
                </button>
              ) : order.vendaControle ? (
                <div
                  className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-sm font-semibold border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed select-none"
                  title={`OS finalizada no PDV (Venda #${order.vendaControle}). Bloqueada contra reabertura e alterações.`}
                >
                  <span>🔒</span>
                  <span>Finalizada no PDV (#{order.vendaControle})</span>
                </div>
              ) : (
                <button
                  onClick={handleReopenClick}
                  disabled={reopening}
                  className="px-4 py-2 bg-amber-900/40 hover:bg-amber-900/60 text-amber-400 rounded-xl text-sm font-semibold border border-amber-800/50 transition-colors disabled:opacity-50"
                >
                  🔓 Reabrir OS
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card do Cliente */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>👤</span> Dados do Cliente
              </span>
              {!isClosed && (
                <button
                  type="button"
                  onClick={() => {
                    setEditClientName(order.client?.name || '')
                    setEditClientPhone(order.client?.phone || '')
                    setEditClientDoc(order.client?.document || '')
                    setEditClientCep(order.client?.cep || order.cep || '')
                    setEditClientAddress(order.client?.address || order.endereco || '')
                    setEditClientError('')
                    setEditClientOpen(true)
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-700"
                >
                  ✏️ Editar
                </button>
              )}
            </div>

            {order.client?.name ? (
              <div className="space-y-2">
                <p className="text-base font-bold text-white leading-snug">
                  {order.client.name}
                </p>
                {order.client.phone && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`tel:${order.client.phone.replace(/\D/g, '')}`}
                      className="text-xs text-slate-300 font-mono hover:text-white transition-colors"
                    >
                      📞 {order.client.phone}
                    </a>
                    <a
                      href={`https://wa.me/55${order.client.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full hover:bg-emerald-900/80 transition-colors flex items-center gap-1"
                    >
                      <span>💬</span> WhatsApp
                    </a>
                  </div>
                )}
                {order.client.document && (
                  <p className="text-xs text-slate-500 font-mono">
                    Doc: {order.client.document}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-800/60 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-medium">CEP:</span>
                    {order.client?.cep ? (
                      <span className="font-mono text-slate-200 font-semibold">{order.client.cep}</span>
                    ) : (
                      <span className="text-amber-400/80 font-medium text-[11px]">Não informado</span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium shrink-0">Endereço:</span>
                    {order.client?.address ? (
                      <span className="text-slate-200 leading-snug">{order.client.address}</span>
                    ) : (
                      <span className="text-amber-400/80 font-medium text-[11px]">Não informado</span>
                    )}
                  </div>
                </div>

                {isQuote && (!order.client?.cep || !order.client?.address) && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-300 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span className="font-medium">CEP e Endereço obrigatórios para aprovação.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditClientName(order.client?.name || '')
                        setEditClientPhone(order.client?.phone || '')
                        setEditClientDoc(order.client?.document || '')
                        setEditClientCep(order.client?.cep || order.cep || '')
                        setEditClientAddress(order.client?.address || order.endereco || '')
                        setEditClientError('')
                        setEditClientOpen(true)
                      }}
                      className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold shrink-0 transition-colors"
                    >
                      Preencher
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2">
                <p className="text-sm text-amber-400 font-medium flex items-center gap-1.5">
                  <span>⚠️</span> Cliente não cadastrado
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique em Editar para registrar nome e telefone.
                </p>
              </div>
            )}
          </div>

          {order.client?.id ? (
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Cadastro ERP:</span>
              <span className="font-mono text-slate-400">ID #{order.client.id}</span>
            </div>
          ) : (
            <div className="pt-2"></div>
          )}
        </div>
      </div>

      {/* ── BARRA DE ADICIONAR PEÇAS E SERVIÇOS DO CATÁLOGO ────────────────────── */}
      {!isClosed && (
        <div
          ref={searchContainerRef}
          className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl relative"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">
                  {isQuote ? 'Adicionar Peças e Serviços ao Orçamento' : 'Adicionar Peças e Serviços à OS'}
                </h2>
                <p className="text-xs text-slate-400">
                  Busque pelo nome ou código de barras para lançar itens nesta proposta
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchFocused(true)
                }}
                onFocus={() => setSearchFocused(true)}
                placeholder="Buscar por código de barras, código ou nome (ex: Óleo, Filtro, Pastilha, Revisão)..."
                className="w-full bg-slate-800/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setDebouncedQuery('')
                  }}
                  className="absolute right-3 text-slate-400 hover:text-white p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Dropdown de Resultados da Busca */}
            {searchFocused && debouncedQuery.length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl z-40 overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-800">
                {searchingCatalog && (
                  <div className="p-5 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>Buscando produtos e serviços no catálogo...</span>
                  </div>
                )}

                {!searchingCatalog && (!searchResults || searchResults.length === 0) && (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Nenhum produto ou serviço encontrado para &ldquo;<span className="text-white font-semibold">{debouncedQuery}</span>&rdquo;.
                  </div>
                )}

                {!searchingCatalog &&
                  searchResults &&
                  searchResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectCatalogItem(item)}
                      className="p-3.5 hover:bg-slate-800/80 transition-colors cursor-pointer flex items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            item.type === 'part'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {item.type === 'part' ? (
                            <Package className="w-4 h-4" />
                          ) : (
                            <Wrench className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                              {item.description}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                item.type === 'part'
                                  ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                                  : 'bg-blue-950/70 text-blue-300 border-blue-800/60'
                              }`}
                            >
                              {item.type === 'part' ? 'Peça' : 'Serviço'}
                            </span>
                            {item.type === 'service' ? (
                              <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 rounded px-1.5 py-0.5 font-medium">
                                Serviço
                              </span>
                            ) : item.controlaEstoque === false ? (
                              <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 rounded px-1.5 py-0.5 font-semibold">
                                ∞ Estoque Livre
                              </span>
                            ) : (item.stock ?? 0) <= 0 ? (
                              <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-700/60 rounded px-1.5 py-0.5 font-semibold">
                                ⚠️ Sem estoque (0)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Estq: {item.stock}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                            <span className="font-mono text-slate-500">Cód: {item.code}</span>
                            {item.instalacoes && item.instalacoes.length > 0 && (
                              <span className="text-blue-400/90 text-[11px] font-medium">
                                📍 {item.instalacoes.length} posições disponíveis
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-base font-bold text-emerald-400 font-mono">
                          {currency(item.unitPrice)}
                        </span>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-blue-600 group-hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1"
                        >
                          <span>Incluir</span>
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURAR E ADICIONAR ITEM ───────────────────────────────── */}
      {selectedCatalogItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      selectedCatalogItem.type === 'part'
                        ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                        : 'bg-blue-950/70 text-blue-300 border-blue-800/60'
                    }`}
                  >
                    {selectedCatalogItem.type === 'part' ? 'Peça' : 'Serviço'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Cód: {selectedCatalogItem.code}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white leading-snug">
                  {selectedCatalogItem.description}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCatalogItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addItemError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs px-4 py-2.5 rounded-xl mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{addItemError}</span>
              </div>
            )}

            {/* Alerta de estoque se o produto controla estoque */}
            {selectedCatalogItem.type === 'part' && selectedCatalogItem.controlaEstoque !== false && (
              (selectedCatalogItem.stock ?? 0) <= 0 ? (
                <div className="bg-red-950/50 border border-red-700/70 rounded-xl p-3 text-red-200 text-xs flex items-center gap-2.5 mb-4">
                  <span className="text-base">⚠️</span>
                  <div>
                    <span className="font-bold text-red-300">Produto sem estoque disponível no momento (Saldo: 0)</span>
                    <p className="text-[11px] text-red-200/90 mt-0.5">
                      Você pode adicionar o item ao {isQuote ? 'orçamento' : 'à OS'} normalmente.
                    </p>
                  </div>
                </div>
              ) : addItemQty > (selectedCatalogItem.stock ?? 0) ? (
                <div className="bg-amber-950/50 border border-amber-700/70 rounded-xl p-3 text-amber-200 text-xs flex items-center gap-2.5 mb-4">
                  <span className="text-base">⚠️</span>
                  <div>
                    <span className="font-bold text-amber-300">Quantidade ({addItemQty}) maior que o saldo em estoque ({selectedCatalogItem.stock})</span>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      A inclusão pode ser realizada normalmente.
                    </p>
                  </div>
                </div>
              ) : null
            )}

            <div className="space-y-4">
              {/* Seleção de Instalação (se houver posições cadastradas) */}
              {selectedCatalogItem.instalacoes && selectedCatalogItem.instalacoes.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Posição de Instalação *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selectedCatalogItem.instalacoes.map((inst) => (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => setAddItemInstId(inst.id)}
                        className={`p-2.5 rounded-xl text-left border transition-all flex items-center justify-between ${
                          addItemInstId === inst.id
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/50'
                            : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-blue-400 block text-xs">
                            {inst.sigla}
                          </span>
                          <span className="text-[11px] text-slate-300 truncate block">
                            {inst.nome}
                          </span>
                        </div>
                        {addItemInstId === inst.id && (
                          <Check className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantidade e Valores */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Quantidade */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Quantidade
                  </label>
                  <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAddItemQty((q) => Math.max(1, q - 1))}
                      className="w-9 h-10 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={addItemQty}
                      onChange={(e) => setAddItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-transparent text-center font-bold text-white text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAddItemQty((q) => q + 1)}
                      className="w-9 h-10 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Preço Unitário */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Preço Unitário (R$)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addItemUnitPrice}
                      onChange={(e) => setAddItemUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Mão de Obra */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mão de Obra (R$)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addItemLabor}
                      onChange={(e) => setAddItemLabor(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Mecânico Executor deste Item */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Mecânico / Técnico deste Item</span>
                  {addItemMecanicoId && (
                    <span className="text-[10px] text-blue-400 font-normal">
                      Comissão personalizada para este técnico
                    </span>
                  )}
                </label>
                <select
                  value={addItemMecanicoId ?? ''}
                  onChange={(e) => setAddItemMecanicoId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    {order.mecanicoNome ? `Padrão da OS (${order.mecanicoNome})` : 'Nenhum / Geral da Oficina'}
                  </option>
                  {mecanicos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} {m.apelido ? `(${m.apelido})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pré-visualização do Cálculo do Item */}
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div>
                  <p className="text-slate-400">
                    Subtotal Peça: <strong className="text-white">{currency(addItemQty * addItemUnitPrice)}</strong>
                  </p>
                  {addItemLabor > 0 && (
                    <p className="text-blue-300 mt-0.5">
                      + Mão de Obra: <strong>{currency(addItemLabor)}</strong>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block uppercase font-bold">Total do Item</span>
                  <span className="text-base font-extrabold text-emerald-400 font-mono">
                    {currency(addItemQty * addItemUnitPrice + addItemLabor)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-5 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedCatalogItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleAddItem()}
                disabled={
                  addingItem ||
                  (selectedCatalogItem.instalacoes &&
                    selectedCatalogItem.instalacoes.length > 0 &&
                    !addItemInstId)
                }
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {addingItem ? (
                  <span>Adicionando…</span>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{isQuote ? 'Adicionar ao Orçamento' : 'Adicionar à OS'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMAR EXCLUSÃO DE ITEM ─────────────────────────────────── */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-white text-center mb-1">Remover Item?</h2>
            <p className="text-slate-400 text-xs text-center mb-5">
              Tem certeza que deseja remover <strong className="text-white">{itemToDelete.description}</strong>{' '}
              {isQuote ? 'deste orçamento' : 'desta Ordem de Serviço'}?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(itemToDelete.id)}
                disabled={deletingItem}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {deletingItem ? 'Removendo…' : 'Sim, remover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR MÃO DE OBRA DE ITEM ───────────────────────────────── */}
      {editingLaborItem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                <h2 className="text-base font-bold text-white">Editar Mão de Obra</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingLaborItem(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Item: <strong className="text-slate-200">{editingLaborItem.description}</strong>
            </p>

            {laborError && (
              <div className="bg-red-950/50 border border-red-800 rounded-xl px-3 py-2 text-red-300 text-xs mb-3">
                {laborError}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Valor da Mão de Obra (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={laborInputValue}
                  onChange={(e) => setLaborInputValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditingLaborItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleUpdateLabor()}
                disabled={updatingLabor}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {updatingLabor ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAIS EXISTENTES (ENCERRAMENTO, REABERTURA E CLIENTE) ────────────── */}
      {/* Modal — Finalizar OS com Confirmação dos Dados do Cliente e Senha de Administrador */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-xl font-bold">
                  🔒
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">Finalizar Ordem de Serviço</h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    OS #{order.id.split('-')[0].toUpperCase()} • {order.vehicle.plate} ({order.vehicle.model})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmClose(false)
                  setAdminPassword('')
                  setCloseError('')
                }}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com rolagem */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 text-xs text-amber-200/90 space-y-1">
                <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Confirmação Cadastral e Autorização Administrativa</span>
                </p>
                <p className="text-slate-300">
                  Ao finalizar a OS, os dados do cliente (CPF/CNPJ, Telefone e Endereço) são confirmados para emissão e cobrança no PDV. A finalização exige autenticação por senha de administrador.
                </p>
              </div>

              {closeError && (
                <div className="bg-red-950/60 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{closeError}</span>
                </div>
              )}

              {/* Seção 1: Dados do Cliente */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <span>👤</span>
                    <span>1. Confirmação dos Dados do Cliente (PDV)</span>
                  </h3>
                  <span className="text-[11px] text-amber-400 font-semibold">* Campos Obrigatórios</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome Completo do Cliente *
                    </label>
                    <input
                      type="text"
                      value={confirmClientName}
                      onChange={(e) => setConfirmClientName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        CPF ou CNPJ *
                      </label>
                      <input
                        type="text"
                        value={confirmClientDoc}
                        onChange={(e) => setConfirmClientDoc(formatCpfCnpj(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={18}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Telefone / WhatsApp *
                      </label>
                      <input
                        type="text"
                        value={confirmClientPhone}
                        onChange={(e) => setConfirmClientPhone(formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        CEP *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={confirmClientCep}
                          onChange={(e) => {
                            const val = formatCep(e.target.value)
                            setConfirmClientCep(val)
                            const clean = val.replace(/\D/g, '')
                            if (clean.length === 8) {
                              handleConfirmCepSearch(clean)
                            }
                          }}
                          onBlur={(e) => handleConfirmCepSearch(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 pr-8"
                        />
                        {loadingConfirmCep && (
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-blue-400 animate-spin">
                            ↻
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Endereço Completo (Rua, Número, Bairro, Cidade - UF) *
                      </label>
                      <input
                        type="text"
                        value={confirmClientAddress}
                        onChange={(e) => setConfirmClientAddress(e.target.value)}
                        placeholder="Rua, Número, Bairro, Cidade - UF"
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 2: Autorização do Administrador */}
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>2. Autorização do Administrador</span>
                </h3>

                {isAdmin ? (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Administrador Responsável
                    </span>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{currentUser?.nome}</p>
                        <p className="text-xs text-slate-400">{currentUser?.email}</p>
                      </div>
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {currentUser?.role === 'owner' ? 'Proprietário' : 'Gerente'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Selecione o Administrador Responsável *
                    </label>
                    <select
                      value={selectedAdminId ?? ''}
                      onChange={(e) => setSelectedAdminId(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                      required
                    >
                      <option value="">Selecione um administrador...</option>
                      {administradores.map((adm) => (
                        <option key={adm.id} value={adm.id}>
                          {adm.nome} ({adm.email}) — [{adm.roleLabel}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {isAdmin ? 'Sua Senha de Administrador *' : 'Senha do Administrador *'}
                  </label>
                  <div className="relative">
                    <input
                      type={adminPasswordVisible ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value)
                        setCloseError('')
                      }}
                      placeholder="Digite a sua senha de acesso..."
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-slate-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setAdminPasswordVisible(!adminPasswordVisible)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                      tabIndex={-1}
                      title={adminPasswordVisible ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {adminPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé com botões de ação */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setConfirmClose(false)
                  setAdminPassword('')
                  setCloseError('')
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>

              <div className="flex-1 w-full flex flex-col sm:flex-row gap-2.5 justify-end">
                <button
                  type="button"
                  disabled={closing || !adminPassword.trim() || (!isAdmin && !selectedAdminId)}
                  onClick={() => {
                    setSendToPdvOnClose(false)
                    closeOrder(false)
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Finaliza a OS e mantém nesta tela"
                >
                  {closing && !sendToPdvOnClose ? (
                    <>
                      <span className="animate-spin text-sm">↻</span>
                      <span>Finalizando…</span>
                    </>
                  ) : (
                    <>
                      <span>🔒</span>
                      <span>Finalizar OS</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={closing || !adminPassword.trim() || (!isAdmin && !selectedAdminId)}
                  onClick={() => {
                    setSendToPdvOnClose(true)
                    closeOrder(true)
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Finaliza a OS e redireciona direto para o PDV com a OS pronta para faturamento"
                >
                  {closing && sendToPdvOnClose ? (
                    <>
                      <span className="animate-spin text-sm">↻</span>
                      <span>Enviando ao PDV…</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      <span>Finalizar e Enviar para o PDV →</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal — PIN de Reabertura */}
      {showReopenPin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-white mb-1">🔓 Reabrir OS</h2>
            <p className="text-slate-400 text-sm mb-5">
              Insira o PIN de administrador para reabrir a OS{' '}
              <strong className="text-white">{order.vehicle.plate}</strong>.
            </p>

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                setPinError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              placeholder="••••"
              className="w-full bg-slate-800 border border-slate-700 text-white text-center text-2xl tracking-[0.5em] placeholder-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2"
              autoFocus
            />

            {pinError && (
              <p className="text-red-400 text-xs mb-3">{pinError}</p>
            )}

            <div className="flex gap-3 mt-3">
              <button
                onClick={() => { setShowReopenPin(false); setPin(''); setPinError('') }}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={verifying || reopening || pin.length < 4}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {verifying || reopening ? 'Verificando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Editar Dados do Cliente */}
      {editClientOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Editar Dados do Cliente</h2>
            <p className="text-slate-400 text-xs mb-4">
              Atualize as informações de contato do cliente desta Ordem de Serviço.
            </p>

            {editClientError && (
              <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-2.5 text-red-300 text-xs mb-4">
                {editClientError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!editClientName.trim()) {
                  setEditClientError('Nome do cliente é obrigatório')
                  return
                }
                if (!editClientPhone.trim() || editClientPhone.replace(/\D/g, '').length < 8) {
                  setEditClientError('Telefone válido é obrigatório (mínimo 8 dígitos)')
                  return
                }
                handleUpdateClient()
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Telefone / WhatsApp *
                </label>
                <input
                  type="text"
                  value={editClientPhone}
                  onChange={(e) => setEditClientPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  CPF / CNPJ <span className="text-[10px] text-slate-500">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={editClientDoc}
                  onChange={(e) => setEditClientDoc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    CEP {isQuote && <span className="text-[10px] text-amber-400 font-bold">(Obrigatório no orçamento)</span>}
                  </label>
                  {loadingEditCep && (
                    <span className="text-[10px] text-blue-400 animate-pulse">Buscando endereço…</span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    maxLength={9}
                    placeholder="Ex: 30140-071"
                    value={editClientCep}
                    onChange={(e) => {
                      const v = formatCep(e.target.value)
                      setEditClientCep(v)
                      if (v.replace(/\D/g, '').length === 8) {
                        handleEditCepSearch(v)
                      }
                    }}
                    onBlur={() => handleEditCepSearch(editClientCep)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleEditCepSearch(editClientCep)}
                    disabled={loadingEditCep || editClientCep.replace(/\D/g, '').length !== 8}
                    className="absolute right-2 px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg transition-colors"
                  >
                    🔍 Buscar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Endereço Completo {isQuote && <span className="text-[10px] text-amber-400 font-bold">(Obrigatório no orçamento)</span>}
                </label>
                <input
                  type="text"
                  placeholder="Ex: Rua das Flores, 123, Centro - Belo Horizonte/MG"
                  value={editClientAddress}
                  onChange={(e) => setEditClientAddress(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditClientOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {savingClient ? 'Salvando…' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LISTA DE ITENS LANÇADOS ──────────────────────────────────────────── */}
      {order.items.length === 0 ? (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 py-16 px-6 text-center shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            {isQuote ? 'Nenhum item adicionado ao orçamento' : 'Nenhum item lançado nesta OS'}
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {!isClosed ? (
              <>
                Utilize o campo de busca acima para pesquisar peças e serviços no catálogo e montar a proposta para o cliente.
              </>
            ) : (
              'Esta Ordem de Serviço foi encerrada sem itens cadastrados.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {parts.length > 0 && (
            <ItemsTable
              title="Peças"
              items={parts}
              accentColor="text-amber-400"
              isClosed={isClosed}
              mecanicos={mecanicos}
              onUpdateQuantity={handleQuantityDelta}
              onEditLabor={handleOpenEditLabor}
              onDeleteItem={setItemToDelete}
              onUpdateItemMechanic={(itemId, mecanicoId) => handleUpdateItemMechanic({ itemId, mecanicoId })}
            />
          )}
          {services.length > 0 && (
            <ItemsTable
              title="Mão de Obra e Serviços"
              items={services}
              accentColor="text-blue-400"
              isClosed={isClosed}
              mecanicos={mecanicos}
              onUpdateQuantity={handleQuantityDelta}
              onEditLabor={handleOpenEditLabor}
              onDeleteItem={setItemToDelete}
              onUpdateItemMechanic={(itemId, mecanicoId) => handleUpdateItemMechanic({ itemId, mecanicoId })}
            />
          )}
        </div>
      )}

      {/* Alerta de Estoque Insuficiente */}
      {(() => {
        const itensAlerta = items.filter(
          (i) =>
            i.type === 'part' &&
            i.controlaEstoque !== false &&
            i.stock !== null &&
            i.stock !== undefined &&
            (i.stock <= 0 || i.quantity > i.stock)
        )
        if (itensAlerta.length === 0) return null
        return (
          <div className="bg-amber-950/50 border border-amber-600/70 rounded-xl p-3.5 text-amber-200 text-xs space-y-1 shadow-lg">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <span>⚠️</span>
              <span>Atenção: Saldo de estoque insuficiente</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {itensAlerta.length} produto(s) {isQuote ? 'neste orçamento' : 'nesta OS'} estão sem estoque ou com quantidade superior ao saldo na loja. O orçamento e a OS podem ser gerenciados normalmente.
            </p>
          </div>
        )
      })()}

      {/* Summary */}
      {order.items.length > 0 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Resumo dos Valores
          </h3>
          <div className="space-y-2.5">
            <SummaryRow label="Total Peças" value={currency(totalParts)} color="text-amber-400" />
            <SummaryRow
              label="Total Mão de Obra"
              value={currency(totalLabor)}
              color="text-blue-400"
            />
            {discount > 0 && (
              <SummaryRow
                label="Desconto Aplicado"
                value={`- ${currency(discount)}`}
                color="text-amber-400"
              />
            )}
            <div className="border-t border-slate-700 pt-3 mt-1">
              <SummaryRow
                label={order.vendaControle ? 'Total Faturado no PDV' : 'Total Geral'}
                value={currency(totalGeral)}
                color="text-green-400"
                bold
              />
            </div>
            {order.vendaControle && (
              <div className="pt-2 text-right">
                <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-md font-mono inline-block">
                  ✓ Faturada no PDV · Venda #{order.vendaControle}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ItemsTable({
  title,
  items,
  accentColor,
  isClosed,
  mecanicos,
  onUpdateQuantity,
  onEditLabor,
  onDeleteItem,
  onUpdateItemMechanic,
}: {
  title: string
  items: OrderItem[]
  accentColor: string
  isClosed: boolean
  mecanicos?: Mecanico[]
  onUpdateQuantity: (item: OrderItem, delta: number) => void
  onEditLabor: (item: OrderItem) => void
  onDeleteItem: (item: OrderItem) => void
  onUpdateItemMechanic?: (itemId: string, mecanicoId: number | null) => void
}) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-slate-400">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Descrição</th>
              <th className="px-5 py-3">Mecânico / Técnico</th>
              <th className="px-5 py-3 text-right">Qtd</th>
              <th className="px-5 py-3 text-right">Unitário</th>
              <th className="px-5 py-3 text-right">Total Peça</th>
              <th className="px-5 py-3 text-right">Mão de Obra</th>
              {!isClosed && <th className="px-5 py-3 text-right w-16">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{item.code || '—'}</td>
                <td className="px-5 py-3 text-slate-200">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-medium text-white">{item.description}</span>
                    {item.instalacaoSigla && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-800/80"
                        title="Posição de instalação"
                      >
                        {item.instalacaoSigla}
                      </span>
                    )}
                    {item.type === 'service' ? (
                      <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 rounded px-1.5 py-0.5 font-medium">
                        Serviço
                      </span>
                    ) : item.controlaEstoque === false ? (
                      <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 rounded px-1.5 py-0.5 font-semibold">
                        ∞ Estoque Livre
                      </span>
                    ) : item.stock !== null && item.stock !== undefined && item.stock <= 0 ? (
                      <span className="text-[10px] bg-red-900/60 text-red-300 border border-red-700/60 rounded px-1.5 py-0.5 font-semibold">
                        ⚠️ Sem estoque (0)
                      </span>
                    ) : item.stock !== null && item.stock !== undefined && item.quantity > item.stock ? (
                      <span className="text-[10px] bg-amber-900/60 text-amber-300 border border-amber-700/60 rounded px-1.5 py-0.5 font-semibold">
                        ⚠️ Qtd ({item.quantity}) &gt; Estoque ({item.stock})
                      </span>
                    ) : item.stock !== null && item.stock !== undefined ? (
                      <span className="text-[10px] text-slate-500 font-mono">
                        Estq: {item.stock}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {!isClosed && onUpdateItemMechanic ? (
                    <div>
                      <select
                        value={item.mecanicoId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null
                          onUpdateItemMechanic(item.id, val)
                        }}
                        className="bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg text-xs px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[150px] truncate cursor-pointer"
                      >
                        <option value="">Oficina / Padrão</option>
                        {mecanicos?.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                      {item.comissaoValor != null && item.comissaoValor > 0 && (
                        <span className="block text-[10px] text-purple-400 font-mono mt-0.5">
                          Comissão: {currency(item.comissaoValor)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs text-slate-300 font-medium">
                        {item.mecanicoNome || '—'}
                      </span>
                      {item.comissaoValor != null && item.comissaoValor > 0 && (
                        <span className="block text-[10px] text-purple-400 font-mono mt-0.5">
                          Comissão: {currency(item.comissaoValor)}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {!isClosed ? (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors border border-slate-700"
                        title="Diminuir quantidade"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-bold text-white font-mono text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors border border-slate-700"
                        title="Aumentar quantidade"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-300 font-mono">{item.quantity}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-slate-300 font-mono">
                  {currency(item.unitPrice)}
                </td>
                <td className={`px-5 py-3 text-right font-semibold font-mono ${accentColor}`}>
                  {currency(item.total)}
                </td>
                <td className="px-5 py-3 text-right">
                  {!isClosed ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <span
                        className={`font-semibold font-mono ${
                          (item.laborPrice ?? 0) > 0 ? 'text-blue-400' : 'text-slate-500'
                        }`}
                      >
                        {(item.laborPrice ?? 0) > 0 ? currency(item.laborPrice) : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditLabor(item)}
                        className="text-slate-500 hover:text-blue-300 p-1 rounded-md hover:bg-slate-800 transition-colors"
                        title="Editar valor de mão de obra deste item"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-semibold font-mono text-blue-400">
                      {(item.laborPrice ?? 0) > 0 ? currency(item.laborPrice) : '—'}
                    </span>
                  )}
                </td>
                {!isClosed && (
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/40 transition-colors inline-flex items-center"
                      title="Excluir item desta OS"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  color,
  bold,
}: {
  label: string
  value: string
  color: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-bold text-white' : 'text-slate-400'}`}>
        {label}
      </span>
      <span className={`text-sm font-semibold font-mono ${color} ${bold ? 'text-base' : ''}`}>
        {value}
      </span>
    </div>
  )
}
