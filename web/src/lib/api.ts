import type {
  Order, ErpDashboard, CaixaSession, Venda, ProdutoPdv,
  ClientePdv, Lancamento, ProdutoEstoque, ClienteErp, ClienteHistorico,
  TenantAdmin, UserAdmin, Instalacao,
} from '../types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const jwt = localStorage.getItem('erp_jwt_token')
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listOrders: () => request<Order[]>('/orders'),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  reopenOrder: (id: string) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'open' }),
    }),
  verifySupervisorPin: (pin: string) =>
    request<{ authorized: boolean; supervisorName?: string }>('/auth/verify-supervisor-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
}

function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const jwt        = localStorage.getItem('erp_jwt_token')
  const adminToken = localStorage.getItem('admin_token') ?? ''
  const tenantRaw  = localStorage.getItem('erp_current_tenant')
  const tenantId   = tenantRaw ? (JSON.parse(tenantRaw) as { id: number }).id : undefined

  return request<T>(path, {
    ...options,
    headers: {
      // JWT tem prioridade; mantém x-admin-token para compatibilidade com admin.ts
      ...(jwt        ? { Authorization: `Bearer ${jwt}` } : { 'x-admin-token': adminToken }),
      ...(tenantId   ? { 'x-tenant-id': String(tenantId) } : {}),
      ...options?.headers,
    },
  })
}

export const erpApi = {
  dashboard: () => adminRequest<ErpDashboard>('/erp/dashboard'),

  caixaStatus: () => adminRequest<CaixaSession | null>('/erp/caixa/status'),
  caixaList: (page = 1) => adminRequest<{ data: CaixaSession[]; total: number; pages: number }>(`/erp/caixa?page=${page}`),
  caixaAbrir: (data: { vr_abertura?: number }) =>
    adminRequest<{ id: number }>('/erp/caixa/abrir', { method: 'POST', body: JSON.stringify(data) }),
  caixaFechar: (id: number, data: { vr_fechamento?: number }) =>
    adminRequest('/erp/caixa/' + id + '/fechar', { method: 'PATCH', body: JSON.stringify(data) }),

  vendas: (params: { data?: string; page?: number; search?: string }) => {
    const q = new URLSearchParams()
    if (params.data)   q.set('data',   params.data)
    if (params.page)   q.set('page',   String(params.page))
    if (params.search) q.set('search', params.search)
    return adminRequest<{ data: Venda[]; total: number; pages: number }>(`/erp/vendas?${q}`)
  },
  venda: (controle: string) => adminRequest<Venda>(`/erp/vendas/${controle}`),
  criarVenda: (data: {
    id_cliente?: number
    itens: { id_produto: number; valor: number; quant: number }[]
    vr_dinheiro?: number
    vr_cheque?: number
    vr_cartao?: number
    vr_carne?: number
    vr_ticket?: number
    vr_adicional?: number
    parcelas?: number
  }) => adminRequest<{ controle: string; id: number; vr_total: number }>(
    '/erp/vendas', { method: 'POST', body: JSON.stringify(data) }
  ),

  contas: (params: { status?: string; page?: number; search?: string }) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.page)   q.set('page',   String(params.page))
    if (params.search) q.set('search', params.search)
    return adminRequest<{ data: Lancamento[]; total: number; pages: number }>(`/erp/contas?${q}`)
  },
  receberConta: (id: number) =>
    adminRequest(`/erp/contas/${id}/receber`, { method: 'PATCH' }),

  buscaProdutos: (q: string) => adminRequest<ProdutoPdv[]>(`/erp/busca/produtos?q=${encodeURIComponent(q)}`),
  buscaClientes: (q: string) => adminRequest<ClientePdv[]>(`/erp/busca/clientes?q=${encodeURIComponent(q)}`),

  clientes: (params: { search?: string; page?: number }) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.page)   q.set('page',   String(params.page))
    return adminRequest<{ data: ClienteErp[]; total: number; pages: number }>(`/erp/clientes?${q}`)
  },
  clienteHistorico: (id: number) =>
    adminRequest<ClienteHistorico>(`/erp/clientes/${id}/historico`),

  estoque: (params: { search?: string; filtro?: string; page?: number }) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.filtro) q.set('filtro', params.filtro)
    if (params.page)   q.set('page',   String(params.page))
    return adminRequest<{ data: ProdutoEstoque[]; total: number; pages: number }>(`/erp/estoque?${q}`)
  },
  ajustarEstoque: (id: number, tipo: 'entrada' | 'saida' | 'ajuste', quantidade: number) =>
    adminRequest<{ estoque: number }>(`/erp/estoque/${id}/ajustar`, {
      method: 'PATCH',
      body: JSON.stringify({ tipo, quantidade }),
    }),
}

export const tenantsApi = {
  list: () => adminRequest<TenantAdmin[]>('/tenants'),
  create: (data: { nome: string; slug: string }) =>
    adminRequest<TenantAdmin>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { nome?: string; ativo?: boolean }) =>
    adminRequest('/tenants/' + id, { method: 'PATCH', body: JSON.stringify(data) }),
}

export const usersApi = {
  list: () => adminRequest<UserAdmin[]>('/auth/users'),
  getTenants: (id: number) => adminRequest<number[]>(`/auth/users/${id}/tenants`),
  create: (data: {
    nome: string; email: string; password: string
    role: string; tenant_id?: number | null; tenant_ids?: number[]
  }) => adminRequest<{ id: number }>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: {
    nome?: string; role?: string; tenant_id?: number | null
    tenant_ids?: number[]; ativo?: boolean; password?: string
  }) => adminRequest('/auth/users/' + id, { method: 'PATCH', body: JSON.stringify(data) }),
}

export const adminApi = {
  listProducts: (search: string, page: number) =>
    adminRequest<{ data: any[]; total: number; pages: number }>(
      `/admin/products?search=${encodeURIComponent(search)}&page=${page}`
    ),
  updateProduct: (id: number, data: unknown) =>
    adminRequest(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createProduct: (data: unknown) =>
    adminRequest(`/admin/products`, { method: 'POST', body: JSON.stringify(data) }),
  toggleProduct: (id: number) =>
    adminRequest(`/admin/products/${id}/toggle`, { method: 'PATCH' }),
  deleteProduct: (id: number) =>
    adminRequest(`/admin/products/${id}`, { method: 'DELETE' }),
  ajustarEstoque: (id: number, tipo: 'entrada' | 'saida' | 'ajuste', quantidade: number) =>
    adminRequest<{ estoque: number }>(`/admin/products/${id}/estoque`, {
      method: 'PATCH',
      body: JSON.stringify({ tipo, quantidade }),
    }),

  listClients: (search: string, page: number) =>
    adminRequest<{ data: any[]; total: number; pages: number }>(
      `/admin/clients?search=${encodeURIComponent(search)}&page=${page}`
    ),
  updateClient: (id: number, data: unknown) =>
    adminRequest(`/admin/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createClient: (data: unknown) =>
    adminRequest(`/admin/clients`, { method: 'POST', body: JSON.stringify(data) }),
  toggleClient: (id: number) =>
    adminRequest(`/admin/clients/${id}/toggle`, { method: 'PATCH' }),
  deleteClient: (id: number) =>
    adminRequest(`/admin/clients/${id}`, { method: 'DELETE' }),

  // Instalações
  getInstalacoes: () =>
    adminRequest<Instalacao[]>('/admin/instalacoes'),
  createInstalacao: (data: { nome: string; sigla: string; ordem?: number }) =>
    adminRequest<Instalacao>('/admin/instalacoes', { method: 'POST', body: JSON.stringify(data) }),
  updateInstalacao: (id: number, data: { nome: string; sigla: string; ordem?: number }) =>
    adminRequest<Instalacao>(`/admin/instalacoes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInstalacao: (id: number) =>
    adminRequest(`/admin/instalacoes/${id}`, { method: 'DELETE' }),
  getProductInstalacoes: (id: number) =>
    adminRequest<number[]>(`/admin/products/${id}/instalacoes`),
  setProductInstalacoes: (id: number, ids: number[]) =>
    adminRequest(`/admin/products/${id}/instalacoes`, { method: 'PUT', body: JSON.stringify({ ids }) }),
}
