import { pool } from '../db';

export interface PermissionItem {
  id: string;
  nome: string;
  descricao: string;
  rota?: string;
}

export interface PermissionCategory {
  categoria: string;
  icone: string;
  permissoes: PermissionItem[];
}

export const PERMISSION_CATALOG: PermissionCategory[] = [
  {
    categoria: 'PDV & Frente de Caixa',
    icone: 'ShoppingCart',
    permissoes: [
      {
        id: 'pdv',
        nome: 'Frente de Caixa (PDV)',
        descricao: 'Acesso à tela de PDV para emitir vendas e emitir cupons.',
        rota: '/erp/pdv',
      },
      {
        id: 'caixa',
        nome: 'Operações de Caixa',
        descricao: 'Abertura, fechamento de turno, sangrias e suprimentos.',
        rota: '/erp/caixa',
      },
    ],
  },
  {
    categoria: 'Catálogo & Estoque',
    icone: 'Boxes',
    permissoes: [
      {
        id: 'produtos',
        nome: 'Cadastro de Produtos',
        descricao: 'Visualizar, cadastrar, editar e gerenciar produtos e preços.',
        rota: '/erp/produtos',
      },
      {
        id: 'estoque',
        nome: 'Controle de Estoque',
        descricao: 'Consultar saldos e realizar ajustes manuais de estoque.',
        rota: '/erp/estoque',
      },
      {
        id: 'estoque_valorizacao',
        nome: 'Valorização de Estoque',
        descricao: 'Relatório financeiro do estoque a preço de custo e venda.',
        rota: '/erp/estoque/valorizacao',
      },
      {
        id: 'estoque_curva_abc',
        nome: 'Curva ABC de Estoque',
        descricao: 'Análise de giro, margem e classificação de produtos (A, B, C).',
        rota: '/erp/estoque/curva-abc',
      },
      {
        id: 'estoque_sugestao_compras',
        nome: 'Sugestão de Compras',
        descricao: 'Cálculo de reposição baseado em histórico e estoque mínimo.',
        rota: '/erp/estoque/sugestao-compras',
      },
      {
        id: 'estoque_kardex',
        nome: 'Kardex de Estoque',
        descricao: 'Extrato cronológico e rastreabilidade de entradas e saídas.',
        rota: '/erp/estoque/kardex',
      },
    ],
  },
  {
    categoria: 'Clientes & CRM',
    icone: 'Users',
    permissoes: [
      {
        id: 'clientes',
        nome: 'Cadastro de Clientes',
        descricao: 'Cadastrar, editar e consultar cadastro e histórico de compras.',
        rota: '/erp/clientes',
      },
      {
        id: 'crm',
        nome: 'CRM / Retorno Preventivo',
        descricao: 'Alertas de revisão, trocas periódicas e contato com clientes.',
        rota: '/erp/crm',
      },
    ],
  },
  {
    categoria: 'Vendas & Financeiro',
    icone: 'DollarSign',
    permissoes: [
      {
        id: 'vendas',
        nome: 'Histórico de Vendas',
        descricao: 'Consultar vendas realizadas, detalhes e estornos.',
        rota: '/erp/vendas',
      },
      {
        id: 'contas_receber',
        nome: 'Contas a Receber',
        descricao: 'Controle de crediário, carnês, baixas e recebimentos.',
        rota: '/erp/contas',
      },
      {
        id: 'contas_pagar',
        nome: 'Contas a Pagar',
        descricao: 'Gestão de despesas, fornecedores e lançamentos a pagar.',
        rota: '/erp/contas-pagar',
      },
      {
        id: 'dre',
        nome: 'DRE Gerencial',
        descricao: 'Demonstrativo de Resultado do Exercício e lucratividade.',
        rota: '/erp/dre',
      },
      {
        id: 'dashboard',
        nome: 'Dashboard e Resumo',
        descricao: 'Acesso aos gráficos e indicadores principais do dia.',
        rota: '/erp',
      },
    ],
  },
  {
    categoria: 'Oficina & Ordens de Serviço',
    icone: 'Wrench',
    permissoes: [
      {
        id: 'oficina',
        nome: 'Oficina & Produtividade',
        descricao: 'Produtividade de mecânicos e comissões sobre serviços e peças.',
        rota: '/erp/oficina',
      },
      {
        id: 'os_orders',
        nome: 'Ordens de Serviço (Checklist)',
        descricao: 'Criar, gerenciar e executar Ordens de Serviço e checklists.',
        rota: '/orders',
      },
      {
        id: 'quotes',
        nome: 'Orçamentos',
        descricao: 'Criar e negociar orçamentos antes da aprovação.',
        rota: '/quotes',
      },
    ],
  },
  {
    categoria: 'Gestão & Configurações',
    icone: 'SlidersHorizontal',
    permissoes: [
      {
        id: 'relatorio_multi_lojas',
        nome: 'Relatório Multi-Lojas',
        descricao: 'Visão unificada de vendas e desempenho entre lojas.',
        rota: '/erp/relatorios/multi-lojas',
      },
      {
        id: 'lojas',
        nome: 'Gerenciamento de Lojas',
        descricao: 'Cadastrar filiais e configurar unidades do negócio.',
        rota: '/erp/lojas',
      },
      {
        id: 'usuarios',
        nome: 'Usuários & Papéis',
        descricao: 'Cadastrar colaboradores e configurar perfis e permissões.',
        rota: '/erp/usuarios',
      },
      {
        id: 'importar',
        nome: 'Importação de Dados',
        descricao: 'Importar planilhas de produtos, estoques e clientes.',
        rota: '/erp/importar',
      },
      {
        id: 'config_tipos',
        nome: 'Tipos de Produtos',
        descricao: 'Gerenciar categorias e classificações de produtos/serviços.',
        rota: '/erp/config/tipos',
      },
      {
        id: 'config_instalacoes',
        nome: 'Instalações de Veículos',
        descricao: 'Configurar posições e componentes automotivos.',
        rota: '/erp/config/instalacoes',
      },
      {
        id: 'config_parametros',
        nome: 'Parâmetros do Sistema',
        descricao: 'Definir regras operacionais, juros e padrões da empresa.',
        rota: '/erp/config/parametros',
      },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = PERMISSION_CATALOG.flatMap(c => c.permissoes.map(p => p.id));

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSION_IDS,
  manager: [
    'dashboard', 'pdv', 'caixa', 'produtos', 'estoque', 'estoque_valorizacao',
    'estoque_curva_abc', 'estoque_sugestao_compras', 'estoque_kardex', 'oficina',
    'vendas', 'contas_receber', 'contas_pagar', 'dre', 'clientes', 'crm',
    'os_orders', 'quotes', 'relatorio_multi_lojas', 'importar', 'config_tipos', 'config_instalacoes'
  ],
  caixa: [
    'dashboard', 'pdv', 'caixa'
  ],
  operator: [
    'os_orders', 'quotes'
  ],
  mecanico: [
    'oficina', 'os_orders'
  ],
};

/**
 * Retorna as permissões ativas de um usuário.
 * - Owner: tem acesso irrestrito ('*' e todas as permissões).
 * - Usuário com custom_permissions = 1: retorna permissões de user_permissions.
 * - Demais: herda permissões de role_permissions para o seu cargo.
 */
export async function getUserPermissions(userId: number, role: string): Promise<string[]> {
  if (role === 'owner') {
    return ['*', ...ALL_PERMISSION_IDS];
  }

  try {
    const [uRows] = await pool.query<any>(
      'SELECT custom_permissions FROM users WHERE id = ?',
      [userId]
    );

    if (uRows[0]?.custom_permissions) {
      const [pRows] = await pool.query<any>(
        'SELECT permission FROM user_permissions WHERE user_id = ?',
        [userId]
      );
      return pRows.map((r: any) => r.permission);
    }

    // Herda do cargo
    const [rRows] = await pool.query<any>(
      'SELECT permission FROM role_permissions WHERE role = ?',
      [role]
    );
    if (rRows.length > 0) {
      return rRows.map((r: any) => r.permission);
    }

    // Fallback para padrões estáticos se a tabela ainda não estiver populada
    return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  } catch (err) {
    console.error(`Erro ao obter permissões do usuário ${userId}:`, err);
    return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  }
}

/**
 * Retorna mapa de permissões padrão de todos os cargos.
 */
export async function getAllRolePermissions(): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {
    manager: [],
    operator: [],
    caixa: [],
    mecanico: [],
  };

  try {
    const [rows] = await pool.query<any>(
      'SELECT role, permission FROM role_permissions ORDER BY role, permission'
    );
    for (const r of rows) {
      if (!result[r.role]) result[r.role] = [];
      result[r.role].push(r.permission);
    }

    // Preenche com fallback se algum papel estiver vazio no banco
    for (const role of Object.keys(result)) {
      if (result[role].length === 0 && DEFAULT_ROLE_PERMISSIONS[role]) {
        result[role] = [...DEFAULT_ROLE_PERMISSIONS[role]];
      }
    }
  } catch (err) {
    console.error('Erro ao listar permissões dos cargos:', err);
    return { ...DEFAULT_ROLE_PERMISSIONS };
  }

  return result;
}

/**
 * Salva as permissões padrão de um cargo.
 */
export async function setRolePermissions(role: string, permissions: string[]): Promise<void> {
  await pool.query('DELETE FROM role_permissions WHERE role = ?', [role]);
  if (permissions.length > 0) {
    const values = permissions.map(p => [role, p]);
    await pool.query(
      'INSERT INTO role_permissions (role, permission) VALUES ?',
      [values]
    );
  }
}

/**
 * Retorna os detalhes de permissão de um usuário específico,
 * indicando se está usando padrão do cargo ou personalizado.
 */
export async function getUserPermissionsDetail(userId: number): Promise<{
  userId: number;
  nome: string;
  email: string;
  role: string;
  custom_permissions: boolean;
  permissions: string[];
  rolePermissions: string[];
}> {
  const [rows] = await pool.query<any>(
    'SELECT id, nome, email, role, custom_permissions FROM users WHERE id = ?',
    [userId]
  );
  const u = rows[0];
  if (!u) throw new Error('Usuário não encontrado');

  const [roleRows] = await pool.query<any>(
    'SELECT permission FROM role_permissions WHERE role = ?',
    [u.role]
  );
  const rolePermissions: string[] = roleRows.length > 0
    ? roleRows.map((r: any) => r.permission)
    : (DEFAULT_ROLE_PERMISSIONS[u.role] ?? []);

  let permissions: string[] = [];
  const isCustom = Boolean(u.custom_permissions);

  if (u.role === 'owner') {
    permissions = ['*', ...ALL_PERMISSION_IDS];
  } else if (isCustom) {
    const [pRows] = await pool.query<any>(
      'SELECT permission FROM user_permissions WHERE user_id = ?',
      [userId]
    );
    permissions = pRows.map((r: any) => r.permission);
  } else {
    permissions = [...rolePermissions];
  }

  return {
    userId: u.id,
    nome: u.nome,
    email: u.email,
    role: u.role,
    custom_permissions: isCustom,
    permissions,
    rolePermissions,
  };
}

/**
 * Salva as permissões de um usuário específico.
 * Se custom = false, remove as customizações e restaura a herança do perfil.
 */
export async function setUserPermissions(
  userId: number,
  permissions: string[],
  custom: boolean
): Promise<void> {
  if (!custom) {
    await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    await pool.query('UPDATE users SET custom_permissions = 0 WHERE id = ?', [userId]);
    return;
  }

  await pool.query('UPDATE users SET custom_permissions = 1 WHERE id = ?', [userId]);
  await pool.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
  if (permissions.length > 0) {
    const values = permissions.map(p => [userId, p]);
    await pool.query(
      'INSERT INTO user_permissions (user_id, permission) VALUES ?',
      [values]
    );
  }
}

/**
 * Verifica se um conjunto de permissões possui determinada permissão.
 */
export function userHasPermission(userPerms: string[], permission: string, role?: string): boolean {
  if (role === 'owner') return true;
  if (userPerms.includes('*')) return true;
  return userPerms.includes(permission);
}
