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
  nome_login?: string
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

export interface ProdutoEstoque {
  id: number
  nome_produto: string
  cod_barra: string
  unidade: string
  grupo: string
  estoque: number
  min_estoque: number
  vr_compra: number
  vr_custo: number
  vr_venda: number
}

// ── Checklist Types ───────────────────────────────────────────────────────────

export interface Vehicle {
  plate: string
  model: string
  mileage: number
}

export interface OrderItem {
  id: string
  code: string
  description: string
  type: 'part' | 'service'
  quantity: number
  unitPrice: number
  laborPrice: number
  total: number
}

export interface Order {
  id: string
  vehicle: Vehicle
  status: 'open' | 'in_progress' | 'closed'
  items: OrderItem[]
  laborAmount: number
  totalAmount: number
  createdAt: string
  updatedAt: string
}
