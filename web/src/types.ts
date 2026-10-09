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
  fechado_por?: string | null
  id_usuario_fechamento?: number | null
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
    fechado_por?: string | null
    nome_operador?: string | null
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
  fechado_por?: string | null
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
    fechado_por?: string | null
    nome_operador?: string | null
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
  os_id?: string | null
  os_plate?: string | null
  os_model?: string | null
  cpf_cnpj?: string | null
  telefone?: string | null
  celular?: string | null
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
  cep?: string
  endereco?: string
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
  os_plate?: string | null
  os_model?: string | null
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
    partsAmount?: number
    total: number
    laborAmount: number
    createdAt: string
    clientName?: string | null
    clientPhone?: string | null
    clientDocument?: string | null
    clientAddress?: string | null
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
  role: 'owner' | 'manager' | 'operator' | 'caixa' | 'mecanico' | string
  tenant_id: number | null
  tenant_nome: string | null
  tenant_count: number
  tenant_ids?: number[]
  ativo: number
  custom_permissions?: number
  mecanico_id?: number | null
}

export interface PermissionItem {
  id: string
  nome: string
  descricao: string
  rota?: string
}

export interface PermissionCategory {
  categoria: string
  icone: string
  permissoes: PermissionItem[]
}

export interface UserPermissionsDetail {
  userId: number
  nome: string
  email: string
  role: string
  custom_permissions: boolean
  permissions: string[]
  rolePermissions: string[]
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
  cep?: string | null
  address?: string | null
}

export interface OrderItemExecutante {
  id?: number
  itemId?: string
  orderId?: string
  mecanicoId: number
  mecanicoNome?: string
  tipoRateio: 'PERCENTUAL' | 'VALOR_FIXO'
  percentual: number
  valorBase: number
  comissaoPct: number
  comissaoValor: number
  papel: 'titular' | 'auxiliar' | string
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
  mecanicoId?: number | null
  mecanicoNome?: string | null
  comissaoPct?: number | null
  comissaoValor?: number | null
  executantes?: OrderItemExecutante[]
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
  cep?: string | null
  endereco?: string | null
  status: OrderStatus
  vendaControle?: string | null
  mecanicoId?: number | null
  mecanicoNome?: string | null
  auxiliarId?: number | null
  auxiliarNome?: string | null
  items: OrderItem[]
  laborAmount: number
  totalAmount: number
  discountAmount?: number
  finalizadoPorId?: number | null
  finalizadoPorNome?: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export interface OrderAdminUser {
  id: number
  nome: string
  email: string
  role: string
  roleLabel: string
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

export interface CrmManutencaoPreventivaItem {
  id: string
  placa: string
  placa_limpa: string
  modelo: string
  cliente_id: number | null
  cliente_nome: string
  telefone: string | null
  telefone_valido: boolean
  tenant_id: number
  tenant_nome: string
  total_visitas: number
  total_gasto: number
  data_ultima_visita: string
  dias_sem_visita: number
  meses_sem_visita: number
  km_ultima_visita: number
  km_estimado_atual: number | null
  status_manutencao: 'em_dia' | 'proximo' | 'vencido' | 'inativo'
  servicos_recentes: string[]
  categoria_servico: 'oleo' | 'alinhamento' | 'freio' | 'geral'
  recomendacao: string
  mensagem_whatsapp: string
  link_whatsapp: string | null
}

export interface CrmResumoManutencao {
  total_veiculos: number
  em_dia: number
  proximos: number
  vencidos: number
  inativos: number
  ticket_medio_historico: number
  potencial_receita_estimada: number
}

export interface CrmManutencoesResponse {
  resumo: CrmResumoManutencao | null
  clientes: CrmManutencaoPreventivaItem[]
}

export interface ProdutoCurvaAbc {
  id: number
  nome_produto: string
  cod_barra: string | null
  unidade: string
  id_tipo: number | null
  tipo_nome: string
  is_service: boolean
  vr_compra: number
  vr_venda: number
  margem_unitaria_pct: number
  estoque: number
  min_estoque: number
  controla_estoque: boolean
  qtd_vendida: number
  faturamento_total: number
  valor_estoque_custo: number
  valor_estoque_venda: number
  share_pct: number
  acumulado_pct: number
  classe: 'A' | 'B' | 'C'
  status_estoque: 'ruptura' | 'baixo' | 'zerado' | 'normal' | 'dinheiro_parado'
  sugestao_compra: number
}

export interface ResumoCurvaAbc {
  total_itens_catalogo: number
  valor_total_estoque_custo: number
  valor_total_estoque_venda: number
  margem_media_estoque_pct: number
  dinheiro_parado_classe_c: number
  itens_em_ruptura_classe_a: number
  faturamento_total_periodo: number
  qtd_total_vendida_periodo: number
  classe_a: {
    qtd_itens: number
    faturamento: number
    share_faturamento_pct: number
    valor_estoque_custo: number
  }
  classe_b: {
    qtd_itens: number
    faturamento: number
    share_faturamento_pct: number
    valor_estoque_custo: number
  }
  classe_c: {
    qtd_itens: number
    faturamento: number
    share_faturamento_pct: number
    valor_estoque_custo: number
  }
}

export interface CurvaAbcResponse {
  periodo: {
    data_inicio: string
    data_fim: string
    dias: number
  }
  resumo: ResumoCurvaAbc
  produtos: ProdutoCurvaAbc[]
}

// ── Valorização Financeira de Estoque ─────────────────────────────────────────

export interface ValorizacaoResumo {
  total_produtos_catalogo: number
  total_itens_com_saldo: number
  total_unidades_fisicas: number
  valor_total_custo: number
  valor_total_venda: number
  lucro_bruto_projetado: number
  margem_lucro_pct: number
  markup_medio_pct: number
  qtd_zerados: number
  qtd_baixo: number
  qtd_normal: number
  qtd_negativo: number
  qtd_infinito: number
  qtd_sem_custo: number
}

export interface ValorizacaoCategoria {
  id_tipo: number
  nome_tipo: string
  total_produtos: number
  total_unidades: number
  valor_custo: number
  valor_venda: number
  lucro_projetado: number
  margem_pct: number
  share_custo_pct: number
}

export interface ValorizacaoProduto {
  id: number
  nome_produto: string
  cod_barra: string | null
  unidade: string
  id_tipo: number | null
  tipo_nome: string
  is_service: boolean
  estoque: number
  min_estoque: number
  controla_estoque: boolean
  vr_custo: number
  vr_venda: number
  valor_custo_total: number
  valor_venda_total: number
  lucro_projetado: number
  margem_pct: number
  markup_pct: number
  status_estoque: 'zerado' | 'baixo' | 'normal' | 'negativo' | 'infinito'
  alerta_sem_custo: boolean
}

export interface ValorizacaoEstoqueResponse {
  tenant_id: number
  resumo: ValorizacaoResumo
  categorias: ValorizacaoCategoria[]
  produtos: ValorizacaoProduto[]
}

// ── Sugestão de Compras e Ponto de Reposição ──────────────────────────────────

export interface SugestaoComprasParametros {
  periodo_dias: number
  dias_cobertura: number
  data_inicio: string
  data_fim: string
}

export interface SugestaoComprasResumo {
  total_itens_comprar: number
  total_unidades_comprar: number
  investimento_total_estimado: number
  itens_criticos_urgentes: number
  itens_sem_fornecedor: number
  total_fornecedores_acionar: number
}

export interface SugestaoComprasFornecedor {
  id_fornecedor: number
  nome_fornecedor: string
  telefone: string | null
  email: string | null
  contato: string | null
  total_itens: number
  total_unidades: number
  valor_total: number
}

export interface SugestaoComprasProduto {
  id: number
  nome_produto: string
  cod_barra: string | null
  unidade: string
  id_tipo: number | null
  tipo_nome: string
  is_service: boolean
  estoque: number
  min_estoque: number
  controla_estoque: boolean
  vr_custo: number
  vr_venda: number
  qtd_consumo_periodo: number
  qtd_vendas_periodo: number
  qtd_os_periodo: number
  consumo_diario: number
  dias_duracao_estoque: number
  ponto_reposicao: number
  sugestao_qtd: number
  custo_estimado_total: number
  precisa_comprar: boolean
  status_reposicao: 'urgente' | 'critico' | 'atencao' | 'planejado' | 'seguro'
  id_fornecedor: number | null
  nome_fornecedor: string
  fornecedor_telefone: string | null
  fornecedor_email: string | null
  fornecedor_contato: string | null
}

export interface SugestaoComprasResponse {
  tenant_id: number
  parametros: SugestaoComprasParametros
  resumo: SugestaoComprasResumo
  fornecedores: SugestaoComprasFornecedor[]
  produtos: SugestaoComprasProduto[]
}

// ── Oficina & Produtividade (Mecânicos e Comissões) ─────────────────────────

export interface Mecanico {
  id: number
  tenant_id: number
  tenant_nome?: string | null
  user_id?: number | null
  user_nome?: string | null
  user_email?: string | null
  nome: string
  apelido?: string | null
  cpf?: string | null
  telefone?: string | null
  chave_pix?: string | null
  comissao_servico_pct: number
  comissao_peca_pct: number
  ativo: boolean
  is_auxiliar?: boolean
  total_os?: number
  total_servicos?: number
  created_at?: string
  updated_at?: string
}

export interface UsuarioSistema {
  id: number
  nome: string
  email: string
  role: string
  mecanico_id?: number | null
  mecanico_nome?: string | null
}

export interface MecanicoProdutividade {
  id: number
  nome: string
  apelido?: string | null
  cpf?: string | null
  telefone?: string | null
  chave_pix?: string | null
  comissao_servico_pct: number
  comissao_peca_pct: number
  ativo: boolean
  is_auxiliar?: boolean
  qtd_os: number
  qtd_servicos: number
  qtd_pecas: number
  total_servicos: number
  total_pecas: number
  total_produzido: number
  comissao_servicos: number
  comissao_pecas: number
  total_comissao: number
  total_pago: number
  saldo_a_pagar: number
  ticket_medio: number
  share_pct: number
}

export interface ExtratoItemComissao {
  item_id: string
  order_id: string
  os_numero: string
  plate: string
  model: string
  mileage: number
  client_name: string
  client_phone: string
  order_status: string
  venda_controle: string | null
  data_referencia: string
  data_os: string
  data_fechamento: string | null
  descricao: string
  codigo: string
  tipo: 'service' | 'part'
  quantidade: number
  unit_price: number
  labor_price: number
  total_item: number
  valor_base: number
  valor_total_linha: number
  mecanico_id: number | null
  mecanico_nome: string
  auxiliar_id?: number | null
  auxiliar_nome?: string | null
  papel?: 'titular' | 'auxiliar' | string
  tipo_rateio?: 'PERCENTUAL' | 'VALOR_FIXO' | string
  percentual_rateio?: number | null
  comissao_pct: number
  comissao_valor: number
}

export interface ProdutividadeOficinaResponse {
  periodo: {
    data_inicio: string
    data_fim: string
    status_filtro: string
  }
  resumo: {
    faturamento_total: number
    faturamento_servicos: number
    faturamento_pecas: number
    total_comissoes: number
    total_comissoes_pagas: number
    saldo_comissoes_pendente: number
    qtd_os: number
    qtd_servicos: number
    ticket_medio_os: number
    mecanico_destaque: {
      id: number
      nome: string
      apelido: string | null
      total_servicos: number
      total_comissao: number
      share_pct: number
    } | null
  }
  mecanicos: MecanicoProdutividade[]
  extrato: ExtratoItemComissao[]
}

export interface MecanicoPagamento {
  id: number
  mecanico_id: number
  valor: number
  data_pagamento: string
  periodo_inicio: string | null
  periodo_fim: string | null
  forma_pagamento: string
  observacoes: string | null
  id_lancamento: number | null
  lancamento_documento?: string | null
  created_by: string | null
  created_at: string
}

// ── DRE Gerencial Types ───────────────────────────────────────────────────────

export interface DreItemLinhaFilho {
  codigo: string
  descricao: string
  valor: number
  percentual: number
  detalhes?: {
    qtd_itens?: number
    aliquota_estimada_pct?: number
    [key: string]: any
  }
}

export interface DreLinha {
  codigo: string
  descricao: string
  tipo: 'titulo' | 'deducao' | 'subtotal' | 'destaque' | 'resultado_financeiro' | 'total_final'
  valor: number
  percentual: number
  filhos?: DreItemLinhaFilho[]
}

export interface DreIndicadores {
  receita_bruta: number
  receita_liquida: number
  total_custos_variaveis: number
  margem_contribuicao: number
  margem_contribuicao_pct: number
  total_despesas_fixas: number
  resultado_operacional: number
  margem_operacional_pct: number
  resultado_liquido: number
  margem_liquida_pct: number
  ponto_equilibrio: number
  markup_medio: number
  total_vendas_qtd: number
  ticket_medio: number
}

export interface DreHistoricoMes {
  mes: string
  ano: number
  mes_num: number
  receita_liquida: number
  cmv: number
  despesas_fixas: number
  lucro_liquido: number
  margem_liquida_pct: number
}

export interface DreLancamentoItem {
  id: number
  documento: string
  favorecido: string
  historico: string
  data: string
  data_pagamento: string | null
  valor: number
  status: 'pago' | 'pendente'
}

export interface DreCategoriaDetalhes {
  nome: string
  total: number
  lancamentos: DreLancamentoItem[]
}

export interface DreResponse {
  periodo: {
    data_inicio: string
    data_fim: string
    regime: 'competencia' | 'caixa'
    aliquota_imposto: number
  }
  indicadores: DreIndicadores
  linhas_dre: DreLinha[]
  meios_pagamento: {
    dinheiro: number
    pix: number
    cartao: number
    prazo: number
  }
  compras_fornecedores_periodo: number
  historico_mensal: DreHistoricoMes[]
  detalhes_categorias: Record<string, DreCategoriaDetalhes>
}

// ── Kardex de Estoque e Rastreabilidade ──────────────────────────────────────

export type KardexTipo = 'entrada' | 'saida' | 'ajuste'
export type KardexOrigem = 'ajuste_manual' | 'ordem_servico' | 'pdv_venda' | 'inventario' | 'entrada_nota' | 'outros'

export interface KardexMovimentacao {
  id: string
  data_hora: string
  produto_id: number
  nome_produto: string
  cod_barra: string | null
  unidade: string
  tipo: KardexTipo
  origem: KardexOrigem
  quantidade: number
  saldo_anterior: number
  saldo_posterior: number
  documento_ref: string | null
  motivo: string | null
  responsavel: string | null
  vr_unitario: number
  vr_total: number
}

export interface KardexResumo {
  total_movimentacoes: number
  total_entradas_qtd: number
  total_saidas_qtd: number
  total_ajustes_qtd: number
  saldo_liquido_periodo: number
  valor_total_saidas: number
  produtos_distintos_movimentados: number
}

export interface KardexProdutoInfo {
  id: number
  nome_produto: string
  cod_barra: string | null
  unidade: string
  tipo_nome: string
  saldo_atual: number
  min_estoque: number
  vr_compra: number
  vr_venda: number
  controla_estoque: boolean
}

export interface KardexResponse {
  tenant_id: number
  periodo: {
    data_inicio: string
    data_fim: string
    dias?: number
  }
  resumo: KardexResumo
  produto?: KardexProdutoInfo | null
  movimentacoes: KardexMovimentacao[]
  total_registros: number
  pagina: number
  limite: number
  total_paginas: number
}
