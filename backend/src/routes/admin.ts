import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, type JwtPayload } from '../middleware/auth';

const router = Router();
const ADMIN_TOKEN = process.env.ADMIN_PASSWORD ?? 'admin@2026';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Aceita JWT (role owner ou manager) OU token fixo legado
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
      if (payload.role === 'owner' || payload.role === 'manager') {
        req.user = payload;
        next();
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

// ── PRODUTOS ────────────────────────────────────────────────────────────────

router.get('/products', async (req, res) => {
  const search = String(req.query.search ?? '');
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 50;
  const offset = (page - 1) * limit;

  const where  = search.length >= 2 ? 'WHERE nome_produto LIKE ? OR cod_barra LIKE ?' : '';
  const params = search.length >= 2 ? [`%${search}%`, `%${search}%`] : [];

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_produtos ${where}`, params
  );
  const [rows] = await pool.query<any>(
    `SELECT id, nome_produto, cod_barra, unidade, id_tipo,
            vr_compra, vr_venda, vr_venda_2, estoque, inativo
     FROM cad_produtos ${where}
     ORDER BY nome_produto LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ data: rows, total, page, pages: Math.ceil(total / limit) });
});

router.put('/products/:id', async (req, res) => {
  const { nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque } = req.body;
  await pool.query(
    `UPDATE cad_produtos
     SET nome_produto=?, cod_barra=?, unidade=?, id_tipo=?,
         vr_compra=?, vr_venda=?, vr_venda_2=?, estoque=?
     WHERE id=?`,
    [nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque, req.params.id]
  );
  res.json({ ok: true });
});

router.post('/products', async (req, res) => {
  const { nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque } = req.body;
  const [result] = await pool.query<any>(
    `INSERT INTO cad_produtos
       (nome_produto, cod_barra, unidade, id_tipo, vr_compra, vr_venda, vr_venda_2, estoque, inativo)
     VALUES (?,?,?,?,?,?,?,?,0)`,
    [nome_produto, cod_barra, unidade, id_tipo ?? 1, vr_compra ?? 0, vr_venda ?? 0, vr_venda_2 ?? 0, estoque ?? 0]
  );
  res.status(201).json({ id: result.insertId });
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
  const { tipo, quantidade } = req.body as { tipo: string; quantidade: number };
  if (!['entrada', 'saida', 'ajuste'].includes(tipo) || isNaN(Number(quantidade)) || Number(quantidade) < 0) {
    res.status(400).json({ message: 'Parâmetros inválidos' });
    return;
  }
  const qty = Number(quantidade);
  if (tipo === 'ajuste') {
    await pool.query('UPDATE cad_produtos SET estoque = ? WHERE id = ?', [qty, req.params.id]);
  } else if (tipo === 'entrada') {
    await pool.query('UPDATE cad_produtos SET estoque = estoque + ? WHERE id = ?', [qty, req.params.id]);
  } else {
    await pool.query('UPDATE cad_produtos SET estoque = GREATEST(0, estoque - ?) WHERE id = ?', [qty, req.params.id]);
  }
  const [[row]] = await pool.query<any>('SELECT estoque FROM cad_produtos WHERE id = ?', [req.params.id]);
  res.json({ estoque: Number(row.estoque) });
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

export default router;
