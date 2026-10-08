import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, type JwtPayload } from '../middleware/auth';
import { getUserPermissions, userHasPermission } from '../lib/permissions';

const router = Router();
const ADMIN_TOKEN = process.env.ADMIN_PASSWORD ?? 'admin@2026';

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Aceita JWT OU token fixo legado
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
      req.user = payload;

      if (payload.role === 'owner' || payload.role === 'manager') {
        next();
        return;
      }

      // Verifica se o usuário (ex: caixa ou operador) tem permissão para a funcionalidade
      const perms = await getUserPermissions(payload.userId, payload.role);
      const path = req.path;
      let needed = 'produtos';
      if (path.includes('product-types')) needed = 'config_tipos';
      else if (path.includes('instalacoes')) needed = 'config_instalacoes';

      if (userHasPermission(perms, needed, payload.role)) {
        next();
        return;
      } else {
        res.status(403).json({ message: 'Permissão insuficiente para este recurso' });
        return;
      }
    } catch { /* token inválido — tenta legado */ }
  }
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) {
    next();
    return;
  }
  res.status(401).json({ message: 'Não autorizado' });
}


router.use(requireAdmin);

function getAdminTenantId(req: Request): number {
  const user = req.user as JwtPayload | undefined;
  const h = Number(req.headers['x-tenant-id']);
  if (h > 0) {
    if (!user || user.role === 'owner' || user.tenantIds?.includes(h)) {
      return h;
    }
  }
  return user?.tenantIds?.[0] ?? 1;
}

// ── PRODUTOS ────────────────────────────────────────────────────────────────

router.get('/products', async (req, res) => {
  const tenantId = getAdminTenantId(req);
  const search = String(req.query.search ?? '').trim();
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 50;
  const offset = (page - 1) * limit;
  const status = String(req.query.status ?? 'ativos'); // 'ativos' | 'inativos' | 'todos'
  const tipoFilter = req.query.tipo ? Number(req.query.tipo) : null;

  const whereParts: string[] = [];
  const params: any[] = [];

  if (status === 'ativos') {
    whereParts.push('p.inativo = 0');
  } else if (status === 'inativos') {
    whereParts.push('p.inativo = 1');
  }

  if (tipoFilter) {
    whereParts.push('p.id_tipo = ?');
    params.push(tipoFilter);
  }

  if (search.length >= 2) {
    whereParts.push('(p.nome_produto LIKE ? OR p.cod_barra LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_produtos p ${where}`, params
  );

  const [[counts]] = await pool.query<any>(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN inativo = 0 THEN 1 END) as total_ativos,
       COUNT(CASE WHEN inativo = 1 THEN 1 END) as total_inativos
     FROM cad_produtos`
  );

  const saldoExpr = `COALESCE(pst.saldo, IF(? = 1, p.estoque, 0))`;

  const [rows] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, p.cod_barra, p.unidade, p.id_tipo,
            t.nome_tipo AS tipo_nome,
            COALESCE(t.is_service, 0) AS is_service,
            p.vr_compra, p.vr_venda, p.vr_venda_2,
            ${saldoExpr} AS estoque,
            COALESCE(p.controla_estoque, 1) AS controla_estoque,
            p.inativo
     FROM cad_produtos p
     LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     ${where}
     ORDER BY p.nome_produto LIMIT ? OFFSET ?`,
    [tenantId, tenantId, ...params, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      tipo_nome: r.tipo_nome ?? null,
      is_service: Number(r.is_service ?? 0),
      estoque: Number(r.estoque ?? 0),
      controla_estoque: Number(r.controla_estoque ?? 1),
      vr_compra: Number(r.vr_compra ?? 0),
      vr_venda: Number(r.vr_venda ?? 0),
      vr_venda_2: Number(r.vr_venda_2 ?? 0),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    counts: {
      total: Number(counts.total ?? 0),
      total_ativos: Number(counts.total_ativos ?? 0),
      total_inativos: Number(counts.total_inativos ?? 0),
    },
  });
});

router.put('/products/:id', async (req, res) => {
  const tenantId = getAdminTenantId(req);
  const prodId = Number(req.params.id);
  const {
    nome_produto, cod_barra, unidade, id_tipo,
    vr_compra, vr_venda, vr_venda_2, estoque,
    controla_estoque,
  } = req.body;
  const ctrlEstoque = controla_estoque !== undefined ? (Number(controla_estoque) === 0 ? 0 : 1) : 1;

  await pool.query(
    `UPDATE cad_produtos
     SET nome_produto=?, cod_barra=?, unidade=?, id_tipo=?,
         vr_compra=?, vr_venda=?, vr_venda_2=?, estoque=?, controla_estoque=?
     WHERE id=?`,
    [nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque, ctrlEstoque, prodId]
  );
  if (ctrlEstoque === 1 && estoque !== undefined && !isNaN(Number(estoque))) {
    await pool.query(
      `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)`,
      [prodId, tenantId, Number(estoque)]
    );
  }
  res.json({ ok: true });
});

router.post('/products', async (req, res) => {
  const tenantId = getAdminTenantId(req);
  const {
    nome_produto, cod_barra, unidade, id_tipo,
    vr_compra, vr_venda, vr_venda_2, estoque,
    controla_estoque,
  } = req.body;
  const ctrlEstoque = controla_estoque !== undefined ? (Number(controla_estoque) === 0 ? 0 : 1) : 1;

  const [result] = await pool.query<any>(
    `INSERT INTO cad_produtos
       (nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque, controla_estoque, inativo)
     VALUES (?,?,?,?,?,?,?,?,?,0)`,
    [nome_produto, cod_barra, unidade, id_tipo ?? 1, vr_compra ?? 0, vr_venda ?? 0, vr_venda_2 ?? 0, estoque ?? 0, ctrlEstoque]
  );
  const newId = result.insertId;
  if (ctrlEstoque === 1 && estoque !== undefined && Number(estoque) > 0) {
    await pool.query(
      `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)`,
      [newId, tenantId, Number(estoque)]
    );
  }
  res.status(201).json({ id: newId });
});

router.patch('/products/:id/toggle', async (req, res) => {
  await pool.query(
    'UPDATE cad_produtos SET inativo = IF(inativo=0,1,0) WHERE id=?',
    [req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/products/:id', async (req, res) => {
  await pool.query('DELETE FROM cad_produtos WHERE id=?', [req.params.id]);
  res.status(204).end();
});

// tipo: 'entrada' (+qty) | 'saida' (-qty) | 'ajuste' (valor absoluto)
router.patch('/products/:id/estoque', async (req, res) => {
  const tenantId = getAdminTenantId(req);
  const prodId = Number(req.params.id);
  const { tipo, quantidade } = req.body as { tipo: string; quantidade: number };
  if (!['entrada', 'saida', 'ajuste'].includes(tipo) || isNaN(Number(quantidade)) || Number(quantidade) < 0) {
    res.status(400).json({ message: 'Parâmetros inválidos' });
    return;
  }
  const qty = Number(quantidade);

  const [[row]] = await pool.query<any>(
    `SELECT COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS saldo
     FROM cad_produtos p
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     WHERE p.id = ?`,
    [tenantId, tenantId, prodId]
  );
  if (!row) { res.status(404).json({ message: 'Produto não encontrado' }); return; }

  const atual = Number(row.saldo);
  const novoSaldo =
    tipo === 'ajuste'  ? qty :
    tipo === 'entrada' ? atual + qty :
    Math.max(0, atual - qty);

  await pool.query(
    `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)`,
    [prodId, tenantId, novoSaldo]
  );

  if (tenantId === 1) {
    await pool.query('UPDATE cad_produtos SET estoque = ? WHERE id = ?', [novoSaldo, prodId]);
  }

  res.json({ estoque: novoSaldo });
});

// ── CLIENTES ─────────────────────────────────────────────────────────────────

router.get('/clients', async (req, res) => {
  const search = String(req.query.search ?? '');
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 50;
  const offset = (page - 1) * limit;

  const where  = search.length >= 2
    ? 'WHERE nome_cliente LIKE ? OR cpf_cnpj LIKE ? OR telefone LIKE ? OR celular LIKE ?'
    : '';
  const params = search.length >= 2
    ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    : [];

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_clientes ${where}`, params
  );
  const [rows] = await pool.query<any>(
    `SELECT id, nome_cliente, cpf_cnpj, telefone, celular,
            email, cep, endereco, bairro, cidade, uf, inativo
     FROM cad_clientes ${where}
     ORDER BY nome_cliente LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ data: rows, total, page, pages: Math.ceil(total / limit) });
});

router.put('/clients/:id', async (req, res) => {
  const { nome_cliente, cpf_cnpj, telefone, celular, email, cep, endereco, bairro, cidade, uf } = req.body;
  await pool.query(
    `UPDATE cad_clientes
     SET nome_cliente=?, cpf_cnpj=?, telefone=?, celular=?,
         email=?, cep=?, endereco=?, bairro=?, cidade=?, uf=?
     WHERE id=?`,
    [nome_cliente, cpf_cnpj, telefone, celular, email, cep, endereco, bairro, cidade, uf, req.params.id]
  );
  res.json({ ok: true });
});

router.post('/clients', async (req, res) => {
  const { nome_cliente, cpf_cnpj, telefone, celular, email, cep, endereco, bairro, cidade, uf } = req.body;
  const [result] = await pool.query<any>(
    `INSERT INTO cad_clientes
       (nome_cliente, cpf_cnpj, telefone, celular, email, cep, endereco, bairro, cidade, uf, inativo)
     VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
    [nome_cliente, cpf_cnpj, telefone, celular, email, cep, endereco, bairro, cidade, uf]
  );
  res.status(201).json({ id: result.insertId });
});

router.patch('/clients/:id/toggle', async (req, res) => {
  await pool.query(
    'UPDATE cad_clientes SET inativo = IF(inativo=0,1,0) WHERE id=?',
    [req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/clients/:id', async (req, res) => {
  await pool.query('DELETE FROM cad_clientes WHERE id=?', [req.params.id]);
  res.status(204).end();
});

// ── INSTALAÇÕES ──────────────────────────────────────────────────────────────

router.get('/instalacoes', async (_req, res) => {
  const [rows] = await pool.query<any>(
    'SELECT id, nome, sigla, ordem FROM instalacoes ORDER BY ordem, id'
  );
  res.json(rows);
});

router.post('/instalacoes', async (req, res) => {
  const { nome, sigla, ordem } = req.body as { nome: string; sigla: string; ordem?: number };
  if (!nome?.trim() || !sigla?.trim()) {
    res.status(400).json({ message: 'Nome e sigla são obrigatórios' });
    return;
  }
  const [result] = await pool.query<any>(
    'INSERT INTO instalacoes (nome, sigla, ordem) VALUES (?, ?, ?)',
    [nome.trim(), sigla.trim().toUpperCase(), ordem ?? 0]
  );
  res.status(201).json({ id: result.insertId, nome: nome.trim(), sigla: sigla.trim().toUpperCase(), ordem: ordem ?? 0 });
});

router.put('/instalacoes/:id', async (req, res) => {
  const { nome, sigla, ordem } = req.body as { nome?: string; sigla?: string; ordem?: number };
  if (!nome?.trim() || !sigla?.trim()) {
    res.status(400).json({ message: 'Nome e sigla são obrigatórios' });
    return;
  }
  await pool.query(
    'UPDATE instalacoes SET nome = ?, sigla = ?, ordem = ? WHERE id = ?',
    [nome.trim(), sigla.trim().toUpperCase(), Number(ordem) || 0, req.params.id]
  );
  res.json({
    id: Number(req.params.id),
    nome: nome.trim(),
    sigla: sigla.trim().toUpperCase(),
    ordem: Number(ordem) || 0,
  });
});

router.delete('/instalacoes/:id', async (req, res) => {
  await pool.query('DELETE FROM produto_instalacao WHERE instalacao_id = ?', [req.params.id]);
  await pool.query('UPDATE os_order_items SET instalacao_id = NULL WHERE instalacao_id = ?', [req.params.id]);
  await pool.query('DELETE FROM instalacoes WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

router.get('/products/:id/instalacoes', async (req, res) => {
  const [rows] = await pool.query<any>(
    'SELECT instalacao_id FROM produto_instalacao WHERE produto_id = ?',
    [req.params.id]
  );
  res.json((rows as any[]).map((r: any) => r.instalacao_id as number));
});

router.put('/products/:id/instalacoes', async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  const prodId = Number(req.params.id);
  await pool.query('DELETE FROM produto_instalacao WHERE produto_id = ?', [prodId]);
  if (Array.isArray(ids) && ids.length > 0) {
    const values = ids.map(iid => [prodId, iid]);
    await pool.query('INSERT INTO produto_instalacao (produto_id, instalacao_id) VALUES ?', [values]);
  }
  res.status(204).end();
});

// ── TIPOS DE PRODUTOS ────────────────────────────────────────────────────────

router.get('/product-types', async (_req, res) => {
  const [rows] = await pool.query<any>(
    `SELECT t.id, t.nome_tipo, COALESCE(t.is_service, 0) AS is_service,
            COUNT(p.id) AS total_produtos
     FROM cad_produtos_tipo t
     LEFT JOIN cad_produtos p ON p.id_tipo = t.id
     GROUP BY t.id, t.nome_tipo, t.is_service
     ORDER BY t.nome_tipo ASC`
  );
  res.json(rows.map((r: any) => ({
    id: Number(r.id),
    nome_tipo: r.nome_tipo,
    is_service: Number(r.is_service ?? 0),
    total_produtos: Number(r.total_produtos ?? 0),
  })));
});

router.post('/product-types', async (req, res) => {
  const { nome_tipo, is_service } = req.body as { nome_tipo?: string; is_service?: number | boolean };
  const nome = nome_tipo?.trim();
  if (!nome) {
    res.status(400).json({ message: 'O nome do tipo é obrigatório' });
    return;
  }
  const [existing] = await pool.query<any>(
    'SELECT id FROM cad_produtos_tipo WHERE LOWER(TRIM(nome_tipo)) = LOWER(?)',
    [nome]
  );
  if (existing.length > 0) {
    res.status(400).json({ message: 'Já existe um tipo de produto com este nome' });
    return;
  }
  const isServ = is_service ? 1 : 0;
  const [result] = await pool.query<any>(
    'INSERT INTO cad_produtos_tipo (nome_tipo, is_service) VALUES (?, ?)',
    [nome.toUpperCase(), isServ]
  );
  res.status(201).json({
    id: result.insertId,
    nome_tipo: nome.toUpperCase(),
    is_service: isServ,
    total_produtos: 0,
  });
});

router.put('/product-types/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nome_tipo, is_service } = req.body as { nome_tipo?: string; is_service?: number | boolean };
  const nome = nome_tipo?.trim();
  if (!nome) {
    res.status(400).json({ message: 'O nome do tipo é obrigatório' });
    return;
  }
  const [existing] = await pool.query<any>(
    'SELECT id FROM cad_produtos_tipo WHERE LOWER(TRIM(nome_tipo)) = LOWER(?) AND id <> ?',
    [nome, id]
  );
  if (existing.length > 0) {
    res.status(400).json({ message: 'Já existe outro tipo de produto com este nome' });
    return;
  }
  const isServ = is_service ? 1 : 0;
  await pool.query(
    'UPDATE cad_produtos_tipo SET nome_tipo = ?, is_service = ? WHERE id = ?',
    [nome.toUpperCase(), isServ, id]
  );
  res.json({
    id,
    nome_tipo: nome.toUpperCase(),
    is_service: isServ,
  });
});

router.delete('/product-types/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [[{ total }]] = await pool.query<any>(
    'SELECT COUNT(*) as total FROM cad_produtos WHERE id_tipo = ?',
    [id]
  );
  if (Number(total) > 0) {
    res.status(400).json({
      message: `Não é possível excluir este tipo porque existem ${total} produto(s) associado(s) a ele. Reclassifique os produtos antes de excluir.`,
    });
    return;
  }
  await pool.query('DELETE FROM cad_produtos_tipo WHERE id = ?', [id]);
  res.status(204).end();
});

export default router;
