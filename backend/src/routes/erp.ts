import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, type JwtPayload } from '../middleware/auth';

// ── Tenant helpers ────────────────────────────────────────────────────────────

function getErpWriteTenantId(req: Request): number {
  const user = req.user as JwtPayload | undefined;
  if (!user) return 1;
  if (user.role === 'owner') {
    const h = Number(req.headers['x-tenant-id']);
    return h > 0 ? h : 1;
  }
  const h = Number(req.headers['x-tenant-id']);
  return (h > 0 && user.tenantIds.includes(h)) ? h : (user.tenantIds[0] ?? 1);
}

function getErpTenantFilter(req: Request, existingWhere = false): { clause: string; params: any[] } {
  const user = req.user as JwtPayload | undefined;
  if (!user) return { clause: '', params: [] };
  const prefix = existingWhere ? ' AND ' : ' WHERE ';
  if (user.role === 'owner') {
    const h = Number(req.headers['x-tenant-id']);
    if (h > 0) return { clause: `${prefix}tenant_id = ?`, params: [h] };
    return { clause: '', params: [] };
  }
  const h = Number(req.headers['x-tenant-id']);
  const tid = (h > 0 && user.tenantIds.includes(h)) ? h : (user.tenantIds[0] ?? 1);
  return { clause: `${prefix}tenant_id = ?`, params: [tid] };
}

const router = Router();
const ADMIN_TOKEN = process.env.ADMIN_PASSWORD ?? 'admin@2026';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
      if (['owner', 'manager', 'operator', 'caixa'].includes(payload.role)) {
        req.user = payload;
        next();
        return;
      }
    } catch { /* tenta legado */ }
  }
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) {
    next();
    return;
  }
  res.status(401).json({ message: 'Não autorizado' });
}

// Rotas restritas a owner/manager — caixa não tem acesso
function requireManagerUp(req: Request, res: Response, next: NextFunction) {
  const role = (req.user as JwtPayload | undefined)?.role;
  if (role !== 'owner' && role !== 'manager') {
    res.status(403).json({ message: 'Permissão insuficiente' });
    return;
  }
  next();
}

router.use(requireAdmin);

// ── DASHBOARD ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const tenantId = getErpWriteTenantId(req);
  const [[hoje]] = await pool.query<any>(
    `SELECT COUNT(*) as count_vendas, COALESCE(SUM(vr_total),0) as total_dia
     FROM mv_vendas WHERE data_venda = CURDATE()`
  );
  const [[semana]] = await pool.query<any>(
    `SELECT COALESCE(SUM(vr_total),0) as total_semana
     FROM mv_vendas WHERE data_venda >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`
  );
  const [[mes]] = await pool.query<any>(
    `SELECT COALESCE(SUM(vr_total),0) as total_mes
     FROM mv_vendas WHERE MONTH(data_venda)=MONTH(CURDATE()) AND YEAR(data_venda)=YEAR(CURDATE())`
  );
  const [top_produtos] = await pool.query<any>(
    `SELECT p.nome_produto, SUM(m.quant) as quant, SUM(m.vr_total) as total
     FROM mv_vendas_movimento m
     JOIN cad_produtos p ON p.id = m.id_produto
     WHERE m.data_venda = CURDATE()
     GROUP BY m.id_produto ORDER BY total DESC LIMIT 5`
  );
  const [estoque_baixo] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS estoque, p.min_estoque
     FROM cad_produtos p
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     WHERE p.inativo = 0 AND p.min_estoque > 0
     HAVING estoque <= p.min_estoque
     ORDER BY estoque ASC LIMIT 8`,
    [tenantId, tenantId]
  );
  const { clause: caixaTenantClause, params: caixaTenantParams } = getErpTenantFilter(req, true);
  const [[caixa]] = await pool.query<any>(
    `SELECT id, status_caixa, turno, terminal, hora_abertura, vr_abertura
     FROM mv_caixa WHERE status_caixa = 'A'${caixaTenantClause} ORDER BY id DESC LIMIT 1`,
    caixaTenantParams
  );
  const [[contas_pendentes]] = await pool.query<any>(
    `SELECT COUNT(*) as count_pendentes, COALESCE(SUM(vr_parcela - vr_abatimentos),0) as vr_pendente
     FROM cad_lancamentos WHERE status_lancamento = 0`
  );

  res.json({
    hoje: { count: Number(hoje.count_vendas), total: Number(hoje.total_dia) },
    semana: { total: Number(semana.total_semana) },
    mes: { total: Number(mes.total_mes) },
    top_produtos: top_produtos.map((r: any) => ({
      nome: r.nome_produto,
      quant: Number(r.quant),
      total: Number(r.total),
    })),
    estoque_baixo: estoque_baixo.map((r: any) => ({
      id: r.id,
      nome: r.nome_produto,
      estoque: Number(r.estoque),
      min_estoque: Number(r.min_estoque),
    })),
    caixa: caixa ?? null,
    contas: {
      count: Number(contas_pendentes.count_pendentes),
      total: Number(contas_pendentes.vr_pendente),
    },
  });
});

// ── CAIXA ────────────────────────────────────────────────────────────────────

router.get('/caixa', async (req, res) => {
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = 20;
  const offset = (page - 1) * limit;
  const { clause: tf, params: tp } = getErpTenantFilter(req);

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM mv_caixa${tf}`, tp
  );
  const [rows] = await pool.query<any>(
    `SELECT * FROM mv_caixa${tf} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...tp, limit, offset]
  );

  res.json({ data: rows, total: Number(total), pages: Math.ceil(total / limit) });
});

router.get('/caixa/status', async (req, res) => {
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);
  const [[row]] = await pool.query<any>(
    `SELECT * FROM mv_caixa WHERE status_caixa = 'A'${tf} ORDER BY id DESC LIMIT 1`,
    tp
  );
  res.json(row ?? null);
});

router.post('/caixa/abrir', async (req, res) => {
  const { vr_abertura = 0, terminal = '01', turno = '1', id_login = 1 } = req.body;
  const tenantId = getErpWriteTenantId(req);
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);

  const [existing] = await pool.query<any>(
    `SELECT id FROM mv_caixa WHERE status_caixa = 'A'${tf} LIMIT 1`,
    tp
  );
  if ((existing as any[]).length > 0) {
    res.status(409).json({ message: 'Já existe um caixa aberto para esta loja' });
    return;
  }

  const now = new Date();
  const hora = now.toTimeString().slice(0, 8);
  const data = now.toISOString().slice(0, 10);

  const [result] = await pool.query<any>(
    `INSERT INTO mv_caixa (hora_abertura, data_abertura, vr_abertura, vr_fechamento,
      vr_fechado_turno, id_login, turno, terminal, status_caixa, tenant_id)
     VALUES (?,?,?,0,0,?,?,?,'A',?)`,
    [hora, data, vr_abertura, id_login, turno, terminal, tenantId]
  );
  res.status(201).json({ id: result.insertId });
});

router.patch('/caixa/:id/fechar', async (req, res) => {
  const { vr_fechamento = 0 } = req.body;
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);

  // garante que o caixa pertence ao tenant do usuário logado
  const [[caixaRow]] = await pool.query<any>(
    `SELECT id FROM mv_caixa WHERE id = ?${tf} LIMIT 1`,
    [req.params.id, ...tp]
  );
  if (!caixaRow) {
    res.status(403).json({ message: 'Caixa não encontrado para esta loja' });
    return;
  }

  const now = new Date();
  const hora = now.toTimeString().slice(0, 8);
  const data = now.toISOString().slice(0, 10);

  const [[totals]] = await pool.query<any>(
    `SELECT COALESCE(SUM(vr_total),0) as vr_fechado_turno
     FROM mv_vendas v
     JOIN mv_caixa c ON c.id = ? AND v.data_venda = c.data_abertura AND v.turno = c.turno AND v.terminal = c.terminal`,
    [req.params.id]
  );

  await pool.query(
    `UPDATE mv_caixa SET status_caixa='F', hora_fechamento=?, data_fechamento=?,
      vr_fechamento=?, vr_fechado_turno=? WHERE id=?`,
    [hora, data, vr_fechamento, Number(totals.vr_fechado_turno), req.params.id]
  );
  res.json({ ok: true });
});

// ── VENDAS ───────────────────────────────────────────────────────────────────

router.get('/vendas', async (req, res) => {
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = 30;
  const offset = (page - 1) * limit;
  const data  = String(req.query.data ?? new Date().toISOString().slice(0, 10));
  const search = String(req.query.search ?? '');

  const where = search.length >= 2
    ? 'AND (c.nome_cliente LIKE ? OR v.controle LIKE ?)'
    : '';
  const params: any[] = search.length >= 2
    ? [data, `%${search}%`, `%${search}%`]
    : [data];

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.data_venda = ? ${where}`,
    params
  );

  const [rows] = await pool.query<any>(
    `SELECT v.id, v.controle, v.data_venda, v.vr_total, v.vr_adicional,
            v.vr_dinheiro, v.vr_cheque, v.vr_cartao, v.vr_carne, v.vr_ticket,
            v.em_aberto, v.parcelas, v.id_cliente,
            COALESCE(c.nome_cliente, 'Consumidor') as nome_cliente
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.data_venda = ? ${where}
     ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      hora_venda: String(r.controle).slice(8, 10) + ':' + String(r.controle).slice(10, 12),
      vr_total: Number(r.vr_total),
      vr_adicional: Number(r.vr_adicional),
      vr_dinheiro: Number(r.vr_dinheiro),
      vr_cheque: Number(r.vr_cheque),
      vr_cartao: Number(r.vr_cartao),
      vr_carne: Number(r.vr_carne),
      vr_ticket: Number(r.vr_ticket),
    })),
    total: Number(total),
    pages: Math.ceil(total / limit),
  });
});

router.get('/vendas/:controle', async (req, res) => {
  const [[venda]] = await pool.query<any>(
    `SELECT v.*, COALESCE(c.nome_cliente,'Consumidor') as nome_cliente
     FROM mv_vendas v LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.controle = ?`,
    [req.params.controle]
  );
  if (!venda) { res.status(404).json({ message: 'Venda não encontrada' }); return; }

  const [itens] = await pool.query<any>(
    `SELECT m.id, m.id_produto, p.nome_produto, m.valor, m.quant, m.vr_total
     FROM mv_vendas_movimento m
     JOIN cad_produtos p ON p.id = m.id_produto
     WHERE m.controle = ? ORDER BY m.id`,
    [req.params.controle]
  );

  res.json({
    ...venda,
    vr_total: Number(venda.vr_total),
    itens: itens.map((i: any) => ({
      ...i,
      valor: Number(i.valor),
      quant: Number(i.quant),
      vr_total: Number(i.vr_total),
    })),
  });
});

router.post('/vendas', async (req, res) => {
  try {
    const {
      id_cliente = 0,
      itens = [],
      vr_dinheiro = 0,
      vr_cheque = 0,
      vr_cartao = 0,
      vr_carne = 0,
      vr_ticket = 0,
      vr_adicional = 0,
      parcelas = 1,
      id_login = 1,
      terminal = '01',
      turno = '1',
      id_os,
    } = req.body as {
      id_cliente?: number;
      itens: { id_produto: number; valor: number; quant: number }[];
      vr_dinheiro?: number;
      vr_cheque?: number;
      vr_cartao?: number;
      vr_carne?: number;
      vr_ticket?: number;
      vr_adicional?: number;
      parcelas?: number;
      id_login?: number;
      terminal?: string;
      turno?: string;
      id_os?: string;
    };

    if (!itens.length) {
      res.status(400).json({ message: 'Venda sem itens' });
      return;
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const controle = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const data_venda = now.toISOString().slice(0, 10);

    const vr_total = itens.reduce((s, i) => s + i.valor * i.quant, 0) + Number(vr_adicional);
    const em_aberto = vr_carne > 0 ? 1 : 0;

    // Detect primary payment mode for cod_lancamento mapping
    const codLancamento =
      vr_cartao > 0 ? (vr_cartao === vr_total ? 7 : 1) :
      vr_cheque  > 0 ? 2 :
      vr_carne   > 0 ? 5 :
      vr_ticket  > 0 ? 8 : 1;

    const [vendaResult] = await pool.query<any>(
      `INSERT INTO mv_vendas
         (controle, data_venda, parcelas, id_cliente, id_cliente_convenio,
          id_login, terminal, turno, vr_total, vr_adicional,
          vr_dinheiro, vr_cheque, vr_cartao, vr_carne, vr_ticket,
          em_aberto, vr_pagto_parcial, cod_lancamento)
       VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [controle, data_venda, parcelas, id_cliente, id_login, terminal, turno,
       vr_total, vr_adicional, vr_dinheiro, vr_cheque, vr_cartao, vr_carne, vr_ticket,
       em_aberto, codLancamento]
    );
    const id_venda = vendaResult.insertId;

    for (const item of itens) {
      const item_total = Number(item.valor) * Number(item.quant);
      await pool.query(
        `INSERT INTO mv_vendas_movimento
           (data_venda, controle, modo_venda, cod_lancamento, id_login,
            id_cliente, id_cliente_convenio, id_produto, id_grade,
            modo_lancamento, terminal, turno, valor, quant, vr_total, vr_cotacao, desconto_total_venda)
         VALUES (?,?,1,?,?,?,0,?,0,0,?,?,?,?,?,1,'N')`,
        [data_venda, controle, codLancamento, id_login, id_cliente,
         item.id_produto, terminal, turno, item.valor, item.quant, item_total]
      );
      const tenantId = getErpWriteTenantId(req);
      await pool.query(
        `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo)
         SELECT p.id, ?, GREATEST(0, COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) - ?)
         FROM cad_produtos p
         LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
         WHERE p.id = ?
         ON DUPLICATE KEY UPDATE saldo = GREATEST(0, produto_saldo_tenant.saldo - ?)`,
        [tenantId, tenantId, item.quant, tenantId, item.id_produto, item.quant]
      );
    }

    // Lançamento financeiro
    const hist = `VENDA REALIZADA [ ${controle} ]`;
    await pool.query(
      `INSERT INTO cad_lancamentos
         (id_planejamento, id_conta, id_modo_lancamento, status_lancamento,
          controle, documento, historico, parcela, data_vencimento,
          vr_parcela, vr_abatimentos, vr_acrescimo, transferido,
          id_cliente, id_venda, data_confirmacao, dias_atraso)
       VALUES (2,1,?,?,?,?,?,1,?,?,0,0,0,?,?,?,0)`,
      [codLancamento, em_aberto === 0 ? 1 : 0,
       controle, controle, hist, data_venda,
       vr_total, id_cliente, id_venda,
       em_aberto === 0 ? data_venda : null]
    );

    // Se a venda é de uma OS, atualiza o controle na OS
    if (id_os) {
      await pool.query(
        'UPDATE os_orders SET venda_controle = ?, updated_at = NOW() WHERE id = ?',
        [controle, id_os]
      ).catch(err => console.error('Erro ao vincular venda à OS:', err));
    }

    res.status(201).json({ controle, id: id_venda, vr_total });
  } catch (err: any) {
    console.error('POST /erp/vendas error:', err);
    res.status(500).json({ message: err?.message || 'Erro ao processar venda' });
  }
});

// ── CONTAS / FINANCEIRO ──────────────────────────────────────────────────────

router.get('/contas', requireManagerUp, async (req, res) => {
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 30;
  const offset = (page - 1) * limit;
  const statusQ = req.query.status;
  const status = statusQ === '1' || statusQ === 'pago' ? 1 : statusQ === '' || statusQ === 'todos' ? null : 0;
  const search = String(req.query.search ?? '');

  const whereParts: string[] = [];
  const params: any[] = [];

  if (status !== null) { whereParts.push('l.status_lancamento = ?'); params.push(status); }
  if (search.length >= 2) {
    whereParts.push('(c.nome_cliente LIKE ? OR l.historico LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_lancamentos l
     LEFT JOIN cad_clientes c ON c.id = l.id_cliente ${where}`,
    params
  );
  const [rows] = await pool.query<any>(
    `SELECT l.id, l.controle, l.historico, l.data_vencimento, l.data_confirmacao,
            l.vr_parcela, l.vr_abatimentos, l.status_lancamento,
            l.id_cliente, COALESCE(c.nome_cliente,'Consumidor') as nome_cliente,
            m.modo_lancamento
     FROM cad_lancamentos l
     LEFT JOIN cad_clientes c ON c.id = l.id_cliente
     LEFT JOIN cad_modo_lancamento m ON m.id = l.id_modo_lancamento
     ${where}
     ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      status: Number(r.status_lancamento),
      data_lancamento: r.data_vencimento,
      valor: Number(r.vr_parcela) - Number(r.vr_abatimentos),
      vr_parcela: Number(r.vr_parcela),
      vr_abatimentos: Number(r.vr_abatimentos),
      vr_liquido: Number(r.vr_parcela) - Number(r.vr_abatimentos),
    })),
    total: Number(total),
    pages: Math.ceil(total / limit),
  });
});

router.patch('/contas/:id/receber', requireManagerUp, async (req, res) => {
  const data_confirmacao = new Date().toISOString().slice(0, 10);
  await pool.query(
    'UPDATE cad_lancamentos SET status_lancamento=1, data_confirmacao=? WHERE id=?',
    [data_confirmacao, req.params.id]
  );
  res.json({ ok: true });
});

// ── BUSCA RÁPIDA (PDV) ───────────────────────────────────────────────────────

router.get('/busca/produtos', async (req, res) => {
  const q = String(req.query.q ?? '');
  if (q.length < 2) { res.json([]); return; }
  const tenantId = getErpWriteTenantId(req);

  const [rows] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, p.cod_barra, p.unidade, p.vr_venda,
            COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS estoque
     FROM cad_produtos p
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     WHERE p.inativo = 0 AND (p.nome_produto LIKE ? OR p.cod_barra LIKE ?)
     ORDER BY p.nome_produto LIMIT 20`,
    [tenantId, tenantId, `%${q}%`, `%${q}%`]
  );
  res.json(rows.map((r: any) => ({ ...r, vr_venda: Number(r.vr_venda), estoque: Number(r.estoque) })));
});

router.get('/busca/clientes', async (req, res) => {
  const q = String(req.query.q ?? '');
  if (q.length < 2) { res.json([]); return; }

  const [rows] = await pool.query<any>(
    `SELECT id, nome_cliente, cpf_cnpj, telefone, celular
     FROM cad_clientes
     WHERE inativo = 0 AND (nome_cliente LIKE ? OR cpf_cnpj LIKE ? OR telefone LIKE ?)
     ORDER BY nome_cliente LIMIT 15`,
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );
  res.json(rows);
});

// ── BUSCA OS ENCERRADA PARA PDV ─────────────────────────────────────────────

async function getMaoDeObraProduto(): Promise<{ id: number; nome_produto: string; cod_barra: string }> {
  const [[prod]] = await pool.query<any>(
    "SELECT id, nome_produto, cod_barra FROM cad_produtos WHERE nome_produto LIKE '%MAO DE OBRA%' OR nome_produto LIKE '%MÃO DE OBRA%' LIMIT 1"
  );
  if (prod) return { id: Number(prod.id), nome_produto: prod.nome_produto, cod_barra: prod.cod_barra ?? '' };
  const [[prodServ]] = await pool.query<any>(
    "SELECT id, nome_produto, cod_barra FROM cad_produtos WHERE id_tipo IN (2, 9) LIMIT 1"
  );
  if (prodServ) return { id: Number(prodServ.id), nome_produto: prodServ.nome_produto, cod_barra: prodServ.cod_barra ?? '' };
  return { id: 1981, nome_produto: 'MÃO DE OBRA', cod_barra: '2000000019819' };
}

router.get('/pdv/os-encerradas', async (req, res) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const apenasPendentes = req.query.apenas_pendentes === 'true' || req.query.apenas_pendentes === '1';
    const { clause: tenantClause, params: tenantParams } = getErpTenantFilter(req, true);

    const whereParts: string[] = ["o.status = 'closed'"];
    const params: any[] = [];

    if (search.length >= 2) {
      const clean = search.replace(/[-\s]/g, '').toUpperCase();
      whereParts.push("(REPLACE(REPLACE(UPPER(o.plate), '-', ''), ' ', '') LIKE ? OR o.model LIKE ? OR o.id LIKE ?)");
      params.push(`%${clean}%`, `%${search}%`, `%${search}%`);
    }

    if (apenasPendentes) {
      whereParts.push('o.venda_controle IS NULL');
    }

    const whereStr = 'WHERE ' + whereParts.join(' AND ') + tenantClause;
    const sql = `
      SELECT o.id, o.plate, o.model, o.mileage, o.status, o.total_amount,
             o.labor_amount, o.created_at, o.updated_at, o.closed_at,
             o.venda_controle,
             (SELECT COUNT(*) FROM os_order_items oi WHERE oi.order_id = o.id) AS total_itens
      FROM os_orders o
      ${whereStr}
      ORDER BY o.closed_at DESC, o.updated_at DESC
      LIMIT 50
    `;

    const [rows] = await pool.query<any>(sql, [...params, ...tenantParams]);

    res.json(rows.map((r: any) => ({
      id: r.id,
      plate: r.plate,
      model: r.model,
      mileage: Number(r.mileage),
      status: r.status,
      totalAmount: Number(r.total_amount),
      laborAmount: Number(r.labor_amount ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      closedAt: r.closed_at,
      vendaControle: r.venda_controle ?? null,
      totalItens: Number(r.total_itens ?? 0),
    })));
  } catch (err) {
    console.error('GET /erp/pdv/os-encerradas error:', err);
    res.status(500).json({ message: 'Erro ao listar ordens de serviço encerradas' });
  }
});

router.get('/pdv/os/:id', async (req, res) => {
  try {
    const { clause: tenantClause, params: tenantParams } = getErpTenantFilter(req, true);
    const [[order]] = await pool.query<any>(
      `SELECT * FROM os_orders WHERE id = ?${tenantClause}`,
      [req.params.id, ...tenantParams]
    );

    if (!order) {
      res.status(404).json({ message: 'Ordem de serviço não encontrada' });
      return;
    }

    // Busca itens da OS
    const [rawItems] = await pool.query<any>(
      `SELECT oi.*, p.unidade, p.estoque, p.cod_barra AS prod_cod_barra
       FROM os_order_items oi
       LEFT JOIN cad_produtos p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.created_at`,
      [order.id]
    );

    // Tenta encontrar cliente pela placa no cadastro
    const cleanPlate = order.plate.replace(/[-\s]/g, '').toUpperCase();
    const [[cliente]] = await pool.query<any>(
      `SELECT id, nome_cliente, cpf_cnpj, telefone, celular
       FROM cad_clientes
       WHERE inativo = 0 AND (
         REPLACE(REPLACE(UPPER(nome_cliente), '-', ''), ' ', '') LIKE ?
         OR inf_adicional LIKE ?
       )
       LIMIT 1`,
      [`%${cleanPlate}%`, `%${cleanPlate}%`]
    );

    // Formata itens para o PDV
    const itensPdv: any[] = [];
    let totalLabor = 0;

    for (const item of rawItems) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const lp = Number(item.labor_price ?? 0);
      totalLabor += lp;

      itensPdv.push({
        produto: {
          id: Number(item.product_id),
          nome_produto: item.description,
          cod_barra: item.code || item.prod_cod_barra || '',
          unidade: item.unidade || 'UN',
          vr_venda: unitPrice,
          estoque: Number(item.estoque ?? 0),
        },
        quant: qty,
        valor: unitPrice,
      });
    }

    // Se houver mão de obra geral na OS ou acumulada nos itens
    const osLaborAmount = Number(order.labor_amount ?? 0);
    const finalLabor = totalLabor > 0 ? totalLabor : osLaborAmount;

    if (finalLabor > 0) {
      const prodMo = await getMaoDeObraProduto();
      itensPdv.push({
        produto: {
          id: prodMo.id,
          nome_produto: `MÃO DE OBRA (OS ${order.plate})`,
          cod_barra: prodMo.cod_barra,
          unidade: 'UN',
          vr_venda: finalLabor,
          estoque: 0,
        },
        quant: 1,
        valor: finalLabor,
      });
    }

    res.json({
      order: {
        id: order.id,
        plate: order.plate,
        model: order.model,
        mileage: Number(order.mileage),
        status: order.status,
        totalAmount: Number(order.total_amount),
        laborAmount: Number(order.labor_amount ?? 0),
        vendaControle: order.venda_controle ?? null,
        closedAt: order.closed_at,
      },
      cliente: cliente ? {
        id: Number(cliente.id),
        nome_cliente: cliente.nome_cliente,
        cpf_cnpj: cliente.cpf_cnpj ?? '',
        telefone: cliente.telefone ?? '',
        celular: cliente.celular ?? '',
      } : null,
      itens: itensPdv,
    });
  } catch (err) {
    console.error('GET /erp/pdv/os/:id error:', err);
    res.status(500).json({ message: 'Erro ao carregar itens da OS para o PDV' });
  }
});

// ── CLIENTES ─────────────────────────────────────────────────────────────────

const PLATE_RE = /\b([A-Z]{3})[\-\s]?([0-9][A-Z0-9][0-9]{2})\b/i;

function extractPlate(nome: string): string | null {
  const m = String(nome || '').match(PLATE_RE);
  if (!m) return null;
  return (m[1] + m[2]).toUpperCase();
}

function stripPlate(nome: string): string {
  return String(nome || '').replace(PLATE_RE, '').replace(/\s+/g, ' ').trim();
}

function getClienteTenantId(req: Request): number | null {
  const user = req.user as JwtPayload | undefined;
  if (!user) return null;
  if (user.role === 'owner') {
    const h = Number(req.headers['x-tenant-id']);
    return h > 0 ? h : null;
  }
  const h = Number(req.headers['x-tenant-id']);
  return (h > 0 && user.tenantIds.includes(h)) ? h : (user.tenantIds[0] ?? null);
}

router.get('/clientes', requireManagerUp, async (req, res) => {
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 30;
  const offset = (page - 1) * limit;
  const search = String(req.query.search ?? '');

  const filterTenantId = getClienteTenantId(req);
  const tenantJoin = filterTenantId !== null
    ? 'INNER JOIN cliente_tenant _ctf ON _ctf.cliente_id = c.id AND _ctf.tenant_id = ?'
    : '';

  const whereParts: string[] = ['c.inativo = 0'];
  const baseParams: any[] = filterTenantId !== null ? [filterTenantId] : [];

  if (search.length >= 2) {
    whereParts.push('(c.nome_cliente LIKE ? OR c.telefone LIKE ? OR c.celular LIKE ?)');
    baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = 'WHERE ' + whereParts.join(' AND ');

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_clientes c ${tenantJoin} ${where}`,
    baseParams
  );

  const [rows] = await pool.query<any>(
    `SELECT c.id, c.nome_cliente, c.telefone, c.celular, c.inf_adicional,
            MAX(v.data_venda) as ultima_compra,
            COALESCE(SUM(v.vr_total),0) as total_gasto,
            COUNT(v.id) as qtd_compras,
            (SELECT GROUP_CONCAT(t2.nome ORDER BY t2.nome SEPARATOR ', ')
             FROM cliente_tenant ct2
             JOIN tenants t2 ON t2.id = ct2.tenant_id
             WHERE ct2.cliente_id = c.id) AS lojas
     FROM cad_clientes c
     ${tenantJoin}
     LEFT JOIN mv_vendas v ON v.id_cliente = c.id
     ${where}
     GROUP BY c.id
     ORDER BY ultima_compra IS NULL, ultima_compra DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      id: r.id,
      nome: stripPlate(r.nome_cliente),
      nome_original: r.nome_cliente,
      placa: extractPlate(r.nome_cliente),
      modelo: r.inf_adicional || null,
      telefone: r.telefone || r.celular || null,
      ultima_compra: r.ultima_compra,
      total_gasto: Number(r.total_gasto),
      qtd_compras: Number(r.qtd_compras),
      lojas: r.lojas || null,
    })),
    total: Number(total),
    pages: Math.ceil(Number(total) / limit),
  });
});

router.get('/clientes/:id/historico', requireManagerUp, async (req, res) => {
  const [[cliente]] = await pool.query<any>(
    'SELECT * FROM cad_clientes WHERE id = ?', [req.params.id]
  );
  if (!cliente) { res.status(404).json({ message: 'Cliente não encontrado' }); return; }

  const placa = extractPlate(cliente.nome_cliente);

  const [vendas] = await pool.query<any>(
    `SELECT v.controle, v.data_venda, v.vr_total, v.vr_dinheiro,
            v.vr_cartao, v.vr_carne, v.em_aberto
     FROM mv_vendas v
     WHERE v.id_cliente = ?
     ORDER BY v.data_venda DESC, v.controle DESC
     LIMIT 50`,
    [req.params.id]
  );

  let os: any[] = [];
  if (placa) {
    const clean = placa.replace(/[-\s]/g, '');
    const [osRows] = await pool.query<any>(
      `SELECT id, plate, model, mileage, status, total_amount, labor_amount, created_at
       FROM os_orders
       WHERE REPLACE(REPLACE(UPPER(plate), '-', ''), ' ', '') = ?
       ORDER BY created_at DESC`,
      [clean]
    );
    os = (osRows as any[]).map((o: any) => ({
      id: o.id,
      plate: o.plate,
      model: o.model,
      mileage: Number(o.mileage),
      status: o.status,
      total: Number(o.total_amount),
      laborAmount: Number(o.labor_amount ?? 0),
      createdAt: o.created_at,
    }));
  }

  res.json({
    cliente: {
      id: cliente.id,
      nome: stripPlate(cliente.nome_cliente),
      placa,
      modelo: cliente.inf_adicional || null,
      telefone: cliente.telefone || cliente.celular || null,
      cpf_cnpj: cliente.cpf_cnpj || null,
    },
    vendas: (vendas as any[]).map((v: any) => ({
      controle: v.controle,
      data: v.data_venda,
      total: Number(v.vr_total),
      em_aberto: Number(v.em_aberto),
    })),
    os,
  });
});

// ── ESTOQUE ──────────────────────────────────────────────────────────────────

router.get('/estoque', requireManagerUp, async (req, res) => {
  const tenantId = getErpWriteTenantId(req);
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = 50;
  const offset = (page - 1) * limit;
  const search = String(req.query.search ?? '');
  const filtro = req.query.filtro;

  // Para lojas novas (tenant != 1), só exibe produtos que já têm linha em produto_saldo_tenant
  const whereParts: string[] = ['p.inativo = 0', '(? = 1 OR pst.produto_id IS NOT NULL)'];
  const baseParams: any[] = [tenantId, tenantId];

  if (search.length >= 2) {
    whereParts.push('(p.nome_produto LIKE ? OR p.cod_barra LIKE ?)');
    baseParams.push(`%${search}%`, `%${search}%`);
  }

  const where = 'WHERE ' + whereParts.join(' AND ');

  const havingParts: string[] = [];
  if (filtro === 'baixo')  havingParts.push('estoque <= p.min_estoque AND p.min_estoque > 0');
  if (filtro === 'zerado') havingParts.push('estoque <= 0');
  const having = havingParts.length ? 'HAVING ' + havingParts.join(' AND ') : '';

  const baseSelect = `
    FROM cad_produtos p
    LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
    ${where}`;

  // tenantId = 1 (Veneza/loja-principal) usa fallback do legado; lojas novas começam em 0
  const saldoExpr = `COALESCE(pst.saldo, IF(? = 1, p.estoque, 0))`;

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM (
       SELECT ${saldoExpr} AS estoque, p.min_estoque
       ${baseSelect} ${having}
     ) AS sub`,
    [tenantId, ...baseParams]
  );

  const [rows] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, p.cod_barra, p.unidade,
            ${saldoExpr} AS estoque,
            p.min_estoque, p.vr_compra, p.vr_venda
     ${baseSelect} ${having}
     ORDER BY p.nome_produto LIMIT ? OFFSET ?`,
    [tenantId, ...baseParams, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      grupo: '',
      estoque: Number(r.estoque),
      min_estoque: Number(r.min_estoque),
      vr_compra: Number(r.vr_compra),
      vr_custo: Number(r.vr_compra),
      vr_venda: Number(r.vr_venda),
    })),
    total: Number(total),
    pages: Math.ceil(total / limit),
  });
});

// ── AJUSTE DE ESTOQUE POR TENANT ─────────────────────────────────────────────

router.patch('/estoque/:id/ajustar', requireManagerUp, async (req, res) => {
  const tenantId = getErpWriteTenantId(req);
  const prodId   = Number(req.params.id);
  const { tipo, quantidade } = req.body as {
    tipo: 'entrada' | 'saida' | 'ajuste';
    quantidade: number;
  };

  if (!['entrada', 'saida', 'ajuste'].includes(tipo) || isNaN(quantidade) || quantidade < 0) {
    res.status(400).json({ message: 'Parâmetros inválidos' });
    return;
  }

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
    tipo === 'ajuste'  ? quantidade :
    tipo === 'entrada' ? atual + quantidade :
    Math.max(0, atual - quantidade);

  await pool.query(
    `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)`,
    [prodId, tenantId, novoSaldo]
  );

  res.json({ estoque: novoSaldo });
});

// ── IMPORTAÇÃO DE ESTOQUE VIA PARES cod_barra/saldo (parse feito no browser) ─

router.post('/estoque/importar-sql', requireManagerUp, async (req, res) => {
  const tenantId = getErpWriteTenantId(req);
  if (!tenantId) { res.status(400).json({ message: 'Selecione uma loja antes de importar' }); return; }

  // Frontend parseia o SQL e envia só os pares { codBarra, saldo }
  const { pairs } = req.body as { pairs: Array<{ codBarra: string; saldo: number }> };
  if (!Array.isArray(pairs) || pairs.length === 0) {
    res.status(400).json({ message: 'Nenhum par cod_barra/saldo recebido.' });
    return;
  }

  // Busca produto_ids pelo cod_barra (em lotes de 500 para evitar query gigante)
  const codBarras = pairs.map(p => String(p.codBarra).trim()).filter(Boolean);
  const saldoMap  = new Map<string, number>(pairs.map(p => [String(p.codBarra).trim(), Number(p.saldo)]));

  const allProds: Array<{ id: number; cb: string }> = [];
  const CHUNK = 500;
  for (let i = 0; i < codBarras.length; i += CHUNK) {
    const slice = codBarras.slice(i, i + CHUNK);
    const ph    = slice.map(() => '?').join(',');
    const [rows] = await pool.query<any>(
      `SELECT id, TRIM(cod_barra) AS cb FROM cad_produtos WHERE TRIM(cod_barra) IN (${ph})`,
      slice
    );
    allProds.push(...rows);
  }

  const insertRows: [number, number, number][] = [];
  for (const row of allProds) {
    const saldo = saldoMap.get(row.cb.trim());
    if (saldo !== undefined) insertRows.push([row.id, tenantId, saldo]);
  }

  if (insertRows.length === 0) {
    res.json({ importados: 0, nao_encontrados: pairs.length });
    return;
  }

  await pool.query(
    `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo) VALUES ?
     ON DUPLICATE KEY UPDATE saldo = VALUES(saldo)`,
    [insertRows]
  );

  res.json({
    importados:      insertRows.length,
    nao_encontrados: pairs.length - insertRows.length,
  });
});

// ── IMPORTAÇÃO DE CLIENTES VIA JSON (parse feito no browser) ─────────────────
router.post('/clientes/importar', requireManagerUp, async (req, res) => {
  const user = req.user as JwtPayload | undefined;
  if (user?.role === 'owner' && !(Number(req.headers['x-tenant-id']) > 0)) {
    res.status(400).json({ message: 'Selecione uma loja antes de importar clientes.' }); return;
  }
  const tenantId = getErpWriteTenantId(req);

  interface ClienteIn {
    nome_cliente: string; telefone: string; celular: string;
    cpf_cnpj: string; inf_adicional: string;
  }
  const { clientes } = req.body as { clientes: ClienteIn[] };
  if (!Array.isArray(clientes) || clientes.length === 0) {
    res.status(400).json({ message: 'Nenhum cliente recebido.' }); return;
  }

  const norm = clientes
    .map(c => ({
      nome:    String(c.nome_cliente  || '').trim(),
      tel:     String(c.telefone      || '').trim(),
      cel:     String(c.celular       || '').trim(),
      cpf_raw: String(c.cpf_cnpj     || '').trim(),
      cpf:     String(c.cpf_cnpj     || '').replace(/\D/g, ''),
      inf:     String(c.inf_adicional || '').trim(),
    }))
    .filter(c => c.nome.length > 1);

  if (norm.length === 0) {
    res.status(400).json({ message: 'Nenhum cliente válido no lote.' }); return;
  }

  // Deduplicate by name within this batch
  const byName = new Map<string, typeof norm[0]>();
  for (const c of norm) byName.set(c.nome.toUpperCase(), c);
  const unique = [...byName.values()];

  // Step 1 — Load ALL existing clients in ONE query (avoid full-scan per client)
  const [existing] = await pool.query<any>(
    `SELECT id,
            REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj,''),'.',''),'-',''),'/','') AS cpf_norm,
            TRIM(UPPER(nome_cliente)) AS nome_up
     FROM cad_clientes WHERE inativo = 0`
  );
  const cpfToId  = new Map<string, number>();
  const nameToId = new Map<string, number>();
  let maxId = 0;
  for (const row of existing) {
    const id  = Number(row.id);
    if (id > maxId) maxId = id;
    const cpf = String(row.cpf_norm || '');
    if (cpf.length === 11) cpfToId.set(cpf, id);
    nameToId.set(String(row.nome_up || ''), id);
  }

  // Step 2 — Classify: existing vs new (all in Node memory — no extra DB round-trips)
  const existingIds = new Set<number>();
  const toInsert: typeof unique[0][] = [];
  for (const c of unique) {
    const byCpf   = c.cpf.length === 11 ? cpfToId.get(c.cpf) : undefined;
    const byNome  = nameToId.get(c.nome.toUpperCase());
    const found   = byCpf ?? byNome;
    if (found !== undefined) existingIds.add(found);
    else toInsert.push(c);
  }

  // Step 3 — Bulk insert new clients in one shot
  const insertedIds: number[] = [];
  if (toInsert.length > 0) {
    const rows = toInsert.map(c => [c.nome, c.tel, c.cel, c.cpf_raw, c.inf, 0]);
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await pool.query(
        `INSERT INTO cad_clientes (nome_cliente, telefone, celular, cpf_cnpj, inf_adicional, inativo) VALUES ?`,
        [rows.slice(i, i + CHUNK)]
      );
    }
    // Retrieve IDs of just-inserted rows (id > maxId before import)
    const [newRows] = await pool.query<any>(
      `SELECT id FROM cad_clientes WHERE id > ? AND inativo = 0`, [maxId]
    );
    for (const r of newRows) insertedIds.push(Number(r.id));
  }

  // Step 4 — Associate all with current tenant (INSERT IGNORE = idempotent)
  const allIds    = [...existingIds, ...insertedIds];
  const assocRows = allIds.map(id => [id, tenantId]);
  const CHUNK = 500;
  for (let i = 0; i < assocRows.length; i += CHUNK) {
    await pool.query(
      `INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES ?`,
      [assocRows.slice(i, i + CHUNK)]
    );
  }

  res.json({ existentes: existingIds.size, criados: insertedIds.length, associados: allIds.length });
});

export default router;
