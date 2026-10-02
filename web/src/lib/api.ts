import type {
  Order, OrderItem, CatalogItem, Vehicle, OrderClient, ErpDashboard, CaixaSession, CaixaStatusResponse, CaixaTotaisPeriodo, Venda, ProdutoPdv,
  ClientePdv, Lancamento, ProdutoEstoque, ClienteErp, ClienteHistorico,
  TenantAdmin, UserAdmin, Instalacao, OsEncerradaPdv, ImportarOsPdvResponse, TotaisContas,
  ContaPagar, TotaisContasPagar, CategoriaContaPagar, Fornecedor,
  ProdutoTipo, ParametrosPdv, RelatorioMultiLojasResponse, CrmManutencoesResponse,
  CurvaAbcResponse,
  Mecanico, MecanicoProdutividade, ExtratoItemComissao, ProdutividadeOficinaResponse, MecanicoPagamento,
  DreResponse, UsuarioSistema,
} from '../types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const jwt = localStorage.getItem('erp_jwt_token')
  const tenantRaw = localStorage.getItem('erp_current_tenant')
  const tenantId = tenantRaw ? (JSON.parse(tenantRaw) as { id: number }).id : undefined

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(tenantId ? { 'x-tenant-id': String(tenantId) } : {}),
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
  listOrders: (status?: string | unknown) => {
    const q = typeof status === 'string' && status ? `?status=${encodeURIComponent(status)}` : ''
    return request<Order[]>(`/orders${q}`)
  },
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  lookupPlate: (plate: string) =>
    request<{
      found: boolean
      vehicle?: Vehicle
      client?: OrderClient
      source?: string
    }>(`/orders/lookup-plate/${encodeURIComponent(plate)}`),
  createOrder: (
    vehicle: Vehicle,
    status: 'quote' | 'open' = 'open',
    client?: OrderClient,
    mecanicoId?: number | null,
  ) =>
    request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({ vehicle, status, client, mecanicoId }),
    }),
  updateOrderMechanic: (orderId: string, mecanicoId: number | null, aplicarAosItens = true) =>
    request<Order>(`/orders/${orderId}/mecanico`, {
      method: 'PATCH',
      body: JSON.stringify({ mecanicoId, aplicarAosItens }),
    }),
  updateItemMechanic: (orderId: string, itemId: string, mecanicoId: number | null, comissaoPct?: number) =>
    request<Order>(`/orders/${orderId}/items/${itemId}/mecanico`, {
      method: 'PATCH',
      body: JSON.stringify({ mecanicoId, comissaoPct }),
    }),
  updateOrderClient: (
    id: string,
    client: { name: string; phone: string; document?: string },
  ) =>
    request<Order>(`/orders/${id}/client`, {
      method: 'PATCH',
      body: JSON.stringify(client),
    }),
  approveQuote: (id: string) =>
    request<Order>(`/orders/${id}/approve`, {
      method: 'POST',
    }),
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
  searchCatalog: (query: string) =>
    request<CatalogItem[]>(`/items?search=${encodeURIComponent(query)}`),
  addItem: (
    orderId: string,
    payload: {
      catalogItemId: number | string
      quantity?: number
      unitPrice?: number
      laborPrice?: number
      instalacaoId?: number | null
      mecanicoId?: number | null
    }
  ) =>
    request<OrderItem>(`/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeItem: (orderId: string, itemId: string) =>
    request<void>(`/orders/${orderId}/items/${itemId}`, {
      method: 'DELETE',
    }),
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) =>
    request<OrderItem>(`/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  updateItemLabor: (orderId: string, itemId: string, laborPrice: number) =>
    request<Order>(`/orders/${orderId}/items/${itemId}/labor`, {
      method: 'PATCH',
      body: JSON.stringify({ laborPrice }),
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

  caixaStatus: () => adminRequest<CaixaStatusResponse | null>('/erp/caixa/status'),
  caixaList: (params?: {
    page?: number
    data_inicio?: string
    data_fim?: string
    forma_pagto?: string
  } | number) => {
    if (typeof params === 'number') {
      return adminRequest<{ data: CaixaSession[]; total: number; pages: number; totais?: CaixaTotaisPeriodo }>(`/erp/caixa?page=${params}`)
    }
    const q = new URLSearchParams()
    if (params?.page)        q.set('page',        String(params.page))
    if (params?.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params?.data_fim)    q.set('data_fim',    params.data_fim)
    if (params?.forma_pagto) q.set('forma_pagto', params.forma_pagto)
    return adminRequest<{ data: CaixaSession[]; total: number; pages: number; totais?: CaixaTotaisPeriodo }>(`/erp/caixa?${q}`)
  },
  caixaVendas: (params: {
    page?: number
    data_inicio?: string
    data_fim?: string
    forma_pagto?: string
    search?: string
  }) => {
    const q = new URLSearchParams()
    if (params.page)        q.set('page',        String(params.page))
    if (params.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params.data_fim)    q.set('data_fim',    params.data_fim)
    if (params.forma_pagto) q.set('forma_pagto', params.forma_pagto)
    if (params.search)      q.set('search',      params.search)
    return adminRequest<{
      data: (Venda & { vr_prazo?: number; vr_outros?: number; id_caixa?: number })[]
      total: number
      pages: number
    }>(`/erp/caixa/vendas?${q}`)
  },
  caixaDetalhes: (id: number) => adminRequest<{
    caixa: CaixaSession
    totais: {
      total_vendas: number
      total_despesas?: number
      despesas_dinheiro?: number
      saldo_liquido?: number
      dinheiro: number
      cartao: number
      pix: number
      prazo: number
      outros: number
      qtd_vendas: number
      qtd_despesas?: number
      saldo_esperado_dinheiro: number
      diferenca_caixa: number
    }
    vendas: any[]
    despesas?: any[]
  }>(`/erp/caixa/${id}/detalhes`),
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
    vr_cartao?: number
    vr_pix?: number
    vr_nota?: number
    vr_outros?: number
    vr_cheque?: number
    vr_carne?: number
    vr_ticket?: number
    vr_adicional?: number
    parcelas?: number
    id_os?: string
    supervisor_pin?: string
  }) => adminRequest<{ controle: string; id: number; vr_total: number; avisos_estoque?: string[] }>(
    '/erp/vendas', { method: 'POST', body: JSON.stringify(data) }
  ),

  listarOsEncerradas: (params?: { search?: string; apenasPendentes?: boolean }) => {
    const q = new URLSearchParams()
    if (params?.search) q.set('search', params.search)
    if (params?.apenasPendentes !== undefined) q.set('apenas_pendentes', String(params.apenasPendentes))
    return adminRequest<OsEncerradaPdv[]>(`/erp/pdv/os-encerradas?${q}`)
  },

  carregarOsPdv: (id: string) =>
    adminRequest<ImportarOsPdvResponse>(`/erp/pdv/os/${id}`),

  contas: (params: {
    status?: string;
    page?: number;
    search?: string;
    data_inicio?: string;
    data_fim?: string;
    forma_pagto?: string;
  }) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.page)   q.set('page',   String(params.page))
    if (params.search) q.set('search', params.search)
    if (params.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params.data_fim)    q.set('data_fim',    params.data_fim)
    if (params.forma_pagto) q.set('forma_pagto', params.forma_pagto)
    return adminRequest<{ data: Lancamento[]; total: number; pages: number; totais?: TotaisContas }>(`/erp/contas?${q}`)
  },
  receberConta: (id: number) =>
    adminRequest(`/erp/contas/${id}/receber`, { method: 'PATCH' }),

  contasPagar: (params: {
    status?: string
    page?: number
    search?: string
    data_inicio?: string
    data_fim?: string
    forma_pagto?: string
    categoria?: number
  }) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.page)   q.set('page',   String(params.page))
    if (params.search) q.set('search', params.search)
    if (params.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params.data_fim)    q.set('data_fim',    params.data_fim)
    if (params.forma_pagto) q.set('forma_pagto', params.forma_pagto)
    if (params.categoria)   q.set('categoria',   String(params.categoria))
    return adminRequest<{ data: ContaPagar[]; total: number; pages: number; totais?: TotaisContasPagar }>(`/erp/contas-pagar?${q}`)
  },

  criarContaPagar: (data: {
    descricao: string
    valor: number
    data_vencimento: string
    id_planejamento?: number
    id_modo_lancamento?: number
    favorecido?: string
    documento?: string
    parcelas?: number
    pago_agora?: boolean
    data_pagamento?: string
  }) => adminRequest<{ ok: boolean; parcelas: number }>('/erp/contas-pagar', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  pagarContaPagar: (id: number, data?: { data_pagamento?: string; id_modo_lancamento?: number }) =>
    adminRequest<{ ok: boolean }>(`/erp/contas-pagar/${id}/pagar`, {
      method: 'PATCH',
      body: JSON.stringify(data || {}),
    }),

  estornarContaPagar: (id: number) =>
    adminRequest<{ ok: boolean }>(`/erp/contas-pagar/${id}/estornar`, { method: 'PATCH' }),

  atualizarContaPagar: (id: number, data: {
    descricao?: string
    valor?: number
    data_vencimento?: string
    id_planejamento?: number
    id_modo_lancamento?: number
    favorecido?: string
    documento?: string
  }) => adminRequest<{ ok: boolean }>(`/erp/contas-pagar/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  excluirContaPagar: (id: number) =>
    adminRequest<{ ok: boolean }>(`/erp/contas-pagar/${id}`, { method: 'DELETE' }),

  categoriasContasPagar: () =>
    adminRequest<CategoriaContaPagar[]>('/erp/contas-pagar/categorias'),

  fornecedores: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : ''
    return adminRequest<Fornecedor[]>(`/erp/fornecedores${q}`)
  },

  buscaProdutos: (q: string) => adminRequest<ProdutoPdv[]>(`/erp/busca/produtos?q=${encodeURIComponent(q)}`),
  buscaClientes: (q: string) => adminRequest<ClientePdv[]>(`/erp/busca/clientes?q=${encodeURIComponent(q)}`),

  obterParametrosPdv: () => adminRequest<ParametrosPdv>('/erp/config/parametros'),
  salvarParametrosPdv: (data: { limite_desconto_padrao: number; aplicar_todas_lojas?: boolean }) =>
    adminRequest<{ ok: boolean; limite_desconto_padrao: number }>('/erp/config/parametros', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  relatorioMultiLojas: (params?: { data_inicio?: string; data_fim?: string }) => {
    const q = new URLSearchParams()
    if (params?.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params?.data_fim) q.set('data_fim', params.data_fim)
    const qs = q.toString() ? `?${q}` : ''
    return adminRequest<RelatorioMultiLojasResponse>(`/erp/relatorios/multi-lojas${qs}`)
  },

  crmManutencoesPreventivas: (params?: {
    status?: string
    categoria?: string
    search?: string
    sort?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.categoria) q.set('categoria', params.categoria)
    if (params?.search) q.set('search', params.search)
    if (params?.sort) q.set('sort', params.sort)
    const qs = q.toString() ? `?${q}` : ''
    return adminRequest<CrmManutencoesResponse>(`/erp/crm/manutencoes-preventivas${qs}`)
  },

  curvaAbc: (params?: {
    dias?: number
    data_inicio?: string
    data_fim?: string
    apenas_produtos?: string
    classe?: string
    tipo?: number
    search?: string
    sort?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.dias) q.set('dias', String(params.dias))
    if (params?.data_inicio) q.set('data_inicio', params.data_inicio)
    if (params?.data_fim) q.set('data_fim', params.data_fim)
    if (params?.apenas_produtos) q.set('apenas_produtos', params.apenas_produtos)
    if (params?.classe) q.set('classe', params.classe)
    if (params?.tipo) q.set('tipo', String(params.tipo))
    if (params?.search) q.set('search', params.search)
    if (params?.sort) q.set('sort', params.sort)
    const qs = q.toString() ? `?${q}` : ''
    return adminRequest<CurvaAbcResponse>(`/erp/estoque/curva-abc${qs}`)
  },

  clientes: (params: { search?: string; status?: 'ativos' | 'inativos' | 'todos'; page?: number }) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.status) q.set('status', params.status)
    if (params.page)   q.set('page',   String(params.page))
    return adminRequest<{ data: ClienteErp[]; total: number; pages: number }>(`/erp/clientes?${q}`)
  },
  clienteDetalhes: (id: number) =>
    adminRequest<ClienteErp>(`/erp/clientes/${id}`),
  clienteHistorico: (id: number) =>
    adminRequest<ClienteHistorico>(`/erp/clientes/${id}/historico`),
  criarCliente: (data: {
    nome: string
    placa?: string
    modelo?: string
    cpf_cnpj?: string
    telefone?: string
    celular?: string
    email?: string
    cep?: string
    endereco?: string
    bairro?: string
    cidade?: string
    uf?: string
    tenant_ids?: number[]
  }) =>
    adminRequest<{ ok: boolean; id: number; message: string }>('/erp/clientes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  atualizarCliente: (
    id: number,
    data: {
      nome: string
      placa?: string
      modelo?: string
      cpf_cnpj?: string
      telefone?: string
      celular?: string
      email?: string
      cep?: string
      endereco?: string
      bairro?: string
      cidade?: string
      uf?: string
      inativo?: number
      tenant_ids?: number[]
    }
  ) =>
    adminRequest<{ ok: boolean; message: string }>(`/erp/clientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleClienteStatus: (id: number) =>
    adminRequest<{ ok: boolean }>(`/erp/clientes/${id}/toggle`, {
      method: 'PATCH',
    }),
  excluirCliente: (id: number) =>
    adminRequest<{ ok: boolean; softDeleted: boolean; message: string }>(`/erp/clientes/${id}`, {
      method: 'DELETE',
    }),

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
  getDre: (params?: {
    data_inicio?: string
    data_fim?: string
    regime?: 'competencia' | 'caixa'
    aliquota_imposto?: number
  }) => {
    const sp = new URLSearchParams()
    if (params?.data_inicio) sp.append('data_inicio', params.data_inicio)
    if (params?.data_fim) sp.append('data_fim', params.data_fim)
    if (params?.regime) sp.append('regime', params.regime)
    if (params?.aliquota_imposto !== undefined) sp.append('aliquota_imposto', String(params.aliquota_imposto))
    const qs = sp.toString() ? `?${sp.toString()}` : ''
    return request<DreResponse>(`/erp/financeiro/dre${qs}`)
  },
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
  listProducts: (search: string, page: number, status?: string, tipo?: string | number) =>
    adminRequest<{
      data: any[]
      total: number
      pages: number
      counts?: { total: number; total_ativos: number; total_inativos: number }
    }>(
      `/admin/products?search=${encodeURIComponent(search)}&page=${page}${status ? `&status=${encodeURIComponent(status)}` : ''}${tipo ? `&tipo=${encodeURIComponent(String(tipo))}` : ''}`
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

  // Tipos de Produtos
  getProductTypes: () =>
    adminRequest<ProdutoTipo[]>('/admin/product-types'),
  createProductType: (data: { nome_tipo: string; is_service?: number | boolean }) =>
    adminRequest<ProdutoTipo>('/admin/product-types', { method: 'POST', body: JSON.stringify(data) }),
  updateProductType: (id: number, data: { nome_tipo: string; is_service?: number | boolean }) =>
    adminRequest<ProdutoTipo>(`/admin/product-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductType: (id: number) =>
    adminRequest(`/admin/product-types/${id}`, { method: 'DELETE' }),
}

export const oficinaApi = {
  listMecanicos: (params?: boolean | { apenasAtivos?: boolean }) => {
    let ativo: boolean | undefined
    if (typeof params === 'boolean') {
      ativo = params
    } else if (params && typeof params === 'object') {
      ativo = params.apenasAtivos
    }
    const q = ativo !== undefined ? `?ativo=${ativo ? 1 : 0}` : ''
    return request<Mecanico[]>(`/erp/mecanicos${q}`)
  },
  listUsuariosSistema: () =>
    request<UsuarioSistema[]>('/erp/mecanicos/usuarios-sistema'),
  createMecanico: (data: Partial<Mecanico>) =>
    request<Mecanico>('/erp/mecanicos', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMecanico: (id: number, data: Partial<Mecanico>) =>
    request<Mecanico>(`/erp/mecanicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteMecanico: (id: number) =>
    request<{ message: string }>(`/erp/mecanicos/${id}`, {
      method: 'DELETE',
    }),
  getProdutividade: (params?: {
    data_inicio?: string
    data_fim?: string
    mecanico_id?: number | string
    status?: string
  }) => {
    const sp = new URLSearchParams()
    if (params?.data_inicio) sp.append('data_inicio', params.data_inicio)
    if (params?.data_fim) sp.append('data_fim', params.data_fim)
    if (params?.mecanico_id) sp.append('mecanico_id', String(params.mecanico_id))
    if (params?.status) sp.append('status', params.status)
    const qs = sp.toString() ? `?${sp.toString()}` : ''
    return request<ProdutividadeOficinaResponse>(`/erp/oficina/produtividade${qs}`)
  },
  pagarComissao: (payload: {
    mecanico_id: number
    valor: number
    data_pagamento?: string
    periodo_inicio?: string
    periodo_fim?: string
    forma_pagamento?: string
    observacoes?: string
    gerar_contas_pagar?: boolean
    id_caixa?: number | null
  }) =>
    request<{
      success: boolean
      pagamento_id: number
      lancamento_id?: number | null
      mecanico_id: number
      mecanico_nome: string
      valor: number
      data_pagamento: string
      forma_pagamento: string
      message: string
    }>('/erp/oficina/pagar-comissao', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listPagamentosMecanico: (mecanicoId: number) =>
    request<MecanicoPagamento[]>(`/erp/oficina/mecanicos/${mecanicoId}/pagamentos`),
}
