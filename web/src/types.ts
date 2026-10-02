// ── ERP Types ─────────────────────────────────────────────────────────────────

export interface ErpDashboard {
  hoje: { count: number; total: number }
  semana: { total: number }
  mes: { total: number }
  top_produtos: { nome: string; quant: number; total: number }[]
  estoque_baixo: { id: number; nome: string; estoque: number; min_estoque: number }[]
  caixa: CaixaSession | null
  contas: { count: number; total: number }
}

export interface CaixaSession {
  id: number
  hora_abertura: string
  hora_fechamento: string | null
  data_abertura: string
  data_fechamento: string | null
  vr_abertura: number
  vr_fechamento: number
  vr_fechado_turno: number
  id_login: number
  turno: string
  terminal: string
  status_caixa: 'A' | 'F'
  aberto?: boolean
  nome_login?: string
  nome_operador?: string
  saldo_esperado_dinheiro?: number
  diferenca_caixa?: number
  total_despesas?: number
  despesas_dinheiro?: number
  saldo_liquido?: number
  ultimo_caixa_fechado?: {
    id: number
    data_fechamento: string
    hora_fechamento: string
    vr_fechamento: number
    vr_fechado_turno: number
  } | null
  lista_pix?: {
    controle: string
    data_venda: string
    vr_pix: number
    vr_total: number
    nome_cliente: string
    modelo?: string | null
  }[]
  totais_por_forma?: {
    dinheiro: number
    cartao: number
    pix: number
    prazo: number
    outros: number
    total_vendas: number
    total_despesas?: number
    despesas_dinheiro?: number
    saldo_liquido?: number
    qtd_vendas: number
    qtd_despesas?: number
    saldo_esperado_dinheiro?: number
  }
}

export interface CaixaStatusResponse {
  aberto: boolean
  id?: number
  hora_abertura?: string
  hora_fechamento?: string | null
  data_abertura?: string
  data_fechamento?: string | null
  vr_abertura?: number
  vr_fechamento?: number
  vr_fechado_turno?: number
  id_login?: number
  turno?: string
  terminal?: string
  status_caixa?: 'A' | 'F'
  nome_login?: string
  nome_operador?: string
  saldo_esperado_dinheiro?: number
  diferenca_caixa?: number
  total_despesas?: number
  despesas_dinheiro?: number
  saldo_liquido?: number
  ultimo_caixa_fechado?: {
    id: number
    data_fechamento: string
    hora_fechamento: string
    vr_fechamento: number
    vr_fechado_turno: number
  } | null
  lista_pix?: {
    controle: string
    data_venda: string
    vr_pix: number
    vr_total: number
    nome_cliente: string
    modelo?: string | null
  }[]
  totais_por_forma?: {
    dinheiro: number
    cartao: number
    pix: number
    prazo: number
    outros: number
    total_vendas: number
    total_despesas?: number
    despesas_dinheiro?: number
    saldo_liquido?: number
    qtd_vendas: number
    qtd_despesas?: number
    saldo_esperado_dinheiro?: number
  }
}

export interface CaixaTotaisPeriodo {
  total_vendas: number
  total_despesas?: number
  despesas_dinheiro?: number
  saldo_liquido?: number
  dinheiro: number
  cartao: number
  pix: number
  prazo: number
  outros: number
  total_fundo: number
  total_conferido: number
  qtd_vendas: number
  qtd_despesas?: number
  qtd_sessoes: number
  valor_filtrado?: number
}

export interface Venda {
  id: number
  controle: string
  data_venda: string
  hora_venda: string
  vr_total: number
  vr_adicional: number
  vr_dinheiro: number
  vr_cheque: number
  vr_cartao: number
  vr_carne: number
  vr_ticket: number
  vr_pix?: number
  vr_nota?: number
  em_aberto: number
  parcelas: number
  id_cliente: number
  nome_cliente: string
  itens?: VendaItem[]
}

export interface VendaItem {
  id: number
  id_produto: number
  nome_produto: string
  valor: number
  quant: number
  vr_total: number
}

export interface ProdutoPdv {
  id: number
  nome_produto: string
  cod_barra: string
  unidade: string
  vr_venda: number
  estoque: number
  is_service?: boolean
  controla_estoque?: number
}

export interface ClientePdv {
  id: number
  nome_cliente: string
  cpf_cnpj: string
  telefone: string
  celular: string
}

export interface Lancamento {
  id: number
  controle: string
  historico: string
  data_vencimento: string
  data_confirmacao: string | null
  vr_parcela: number
  vr_abatimentos: number
  vr_liquido: number
  status_lancamento: number
  status: number
  data_lancamento: string
  valor: number
  id_cliente: number
  nome_cliente: string
  modo_lancamento: string
}

export interface TotaisContas {
  total: number
  total_recebido: number
  total_pendente: number
  total_vencido: number
  por_forma_pagamento: {
    dinheiro: number
    cartao: number
    pix: number
    nota: number
    outros: number
  }
}

export interface ContaPagar {
  id: number
  controle: string
  documento: string
  historico: string
  favorecido: string
  id_planejamento: number
  categoria: string
  data_vencimento: string
  data_pagamento: string | null
  status: number // 0 = Pendente / A Pagar, 1 = Pago
  valor: number
  vr_parcela: number
  vr_abatimentos: number
  vr_acrescimo: number
  id_modo_lancamento: number
  modo_lancamento: string
  parcela: number
}

export interface TotaisContasPagar {
  total: number
  total_pago: number
  total_pendente: number
  total_vencido: number
  por_forma_pagamento: {
    boleto: number
    pix: number
    dinheiro: number
    cartao: number
    outros: number
  }
}

export interface CategoriaContaPagar {
  id: number
  nome: string
  codigo?: number
}

export interface Fornecedor {
  id: number
  nome: string
  cpf_cnpj?: string
  telefone?: string
}

export interface ProdutoEstoque {
  id: number
  nome_produto: string
  cod_barra: string
  unidade: string
  grupo: string
  estoque: number
  min_estoque: number
  controla_estoque?: number
  vr_compra: number
  vr_custo: number
  vr_venda: number
}

// ── Clientes ERP ─────────────────────────────────────────────────────────────

export interface ClienteErp {
  id: number
  nome: string
  nome_original?: string
  placa: string | null
  modelo: string | null
  telefone: string | null
  celular?: string | null
  cpf_cnpj?: string | null
  email?: string | null
  cep?: string | null
  endereco?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  inativo?: number
  ultima_compra: string | null
  total_gasto: number
  qtd_compras: number
  lojas: string | null
  tenant_ids?: number[]
}

export interface ClienteHistorico {
  cliente: {
    id: number
    nome: string
    nome_original?: string
    placa: string | null
    modelo: string | null
    telefone: string | null
    celular?: string | null
    cpf_cnpj: string | null
    email?: string | null
    cep?: string | null
    endereco?: string | null
    bairro?: string | null
    cidade?: string | null
    uf?: string | null
    inativo?: number
  }
  vendas: {
    controle: string
    data: string
    total: number
    em_aberto: number
  }[]
  os: {
    id: string
    plate: string
    model: string
    mileage: number
    status: string
    total: number
    laborAmount: number
    createdAt: string
  }[]
}

// ── Instalações ──────────────────────────────────────────────────────────────

export interface Instalacao {
  id: number
  nome: string
  sigla: string
  ordem: number
}

// ── Admin Types ──────────────────────────────────────────────────────────────

export interface TenantAdmin {
  id: number
  nome: string
  slug: string
  ativo: number
  created_at: string
}

export interface UserAdmin {
  id: number
  nome: string
  email: string
  role: 'owner' | 'manager' | 'operator' | 'caixa'
  tenant_id: number | null
  tenant_nome: string | null
  tenant_count: number
  ativo: number
}

// ── Checklist Types ───────────────────────────────────────────────────────────

export type OrderStatus = 'quote' | 'open' | 'in_progress' | 'closed'

export interface Vehicle {
  plate: string
  model: string
  mileage: number
}

export interface OrderClient {
  id?: number | null
  name: string
  phone: string
  document?: string | null
}

export interface OrderItem {
  id: string
  productId?: number | null
  code: string
  description: string
  type: 'part' | 'service'
  quantity: number
  unitPrice: number
  laborPrice: number
  total: number
  instalacaoId?: number | null
  instalacaoSigla?: string | null
  stock?: number | null
  controlaEstoque?: boolean
}

export interface InstItem {
  id: number
  sigla: string
  nome: string
}

export interface CatalogItem {
  id: number
  code: string
  description: string
  type: 'part' | 'service'
  unitPrice: number
  stock?: number
  controlaEstoque?: boolean
  instalacoes: InstItem[]
}

export interface Order {
  id: string
  tenantId: number
  vehicle: Vehicle
  client?: OrderClient | null
  status: OrderStatus
  vendaControle?: string | null
  items: OrderItem[]
  laborAmount: number
  totalAmount: number
  discountAmount?: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

// ── Tipos para Integração OS no PDV ──────────────────────────────────────────

export interface OsEncerradaPdv {
  id: string
  plate: string
  model: string
  mileage: number
  client?: OrderClient | null
  status: string
  totalAmount: number
  laborAmount: number
  discountAmount?: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  vendaControle: string | null
  totalItens: number
}

export interface ImportarOsPdvResponse {
  order: {
    id: string
    plate: string
    model: string
    mileage: number
    status: string
    totalAmount: number
    laborAmount: number
    discountAmount?: number
    vendaControle: string | null
    closedAt: string | null
  }
  cliente: ClientePdv | null
  itens: {
    produto: ProdutoPdv
    quant: number
    valor: number
  }[]
}

export interface ProdutoTipo {
  id: number
  nome_tipo: string
  is_service: number
  total_produtos?: number
}

export interface ParametrosPdv {
  limite_desconto_padrao: number
  tenant_id: number | null
}

export interface LojaComparativo {
  tenant: {
    id: number
    nome: string
    slug: string
    ativo: boolean
    is_matriz: boolean
  }
  faturamento: {
    total: number
    qtd_vendas: number
    ticket_medio: number
    share_pct: number
  }
  pagamentos: {
    dinheiro: number
    cartao: number
    pix: number
    prazo: number
    outros: number
  }
  descontos: {
    total: number
    pct_medio: number
  }
  oficina_os: {
    qtd_total: number
    qtd_encerradas: number
    faturamento: number
    ticket_medio: number
  }
  despesas: {
    total: number
    despesas_dinheiro: number
    qtd: number
  }
  resultado: {
    lucro_operacional: number
    margem_lucro_pct: number
  }
  caixa_atual: {
    id: number
    status: 'A' | 'F'
    terminal: string | null
    turno: string | null
    hora_abertura: string | null
    data_abertura: string | null
    vr_abertura: number
  } | null
}

export interface ConsolidadoMultiLojas {
  faturamento_total: number
  qtd_vendas_total: number
  ticket_medio_geral: number
  despesas_total: number
  lucro_operacional_total: number
  margem_lucro_geral_pct: number
  descontos_total: number
  os_encerradas_total: number
  os_faturamento_total: number
  pagamentos_total: {
    dinheiro: number
    cartao: number
    pix: number
    prazo: number
    outros: number
  }
  destaques: {
    maior_faturamento: { id: number; nome: string; valor: number } | null
    maior_ticket_medio: { id: number; nome: string; valor: number } | null
    maior_margem: { id: number; nome: string; valor: number } | null
  }
}

export interface RelatorioMultiLojasResponse {
  periodo: {
    data_inicio: string
    data_fim: string
  }
  lojas: LojaComparativo[]
  consolidados: ConsolidadoMultiLojas | null
}

