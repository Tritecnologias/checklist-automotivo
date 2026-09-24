import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, allowedTenants, type JwtPayload } from '../middleware/auth';

const router = Router();

// Todos os endpoints de OS exigem autenticação JWT
router.use(requireAuth);

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Retorna o tenant_id que o usuário usa para CRIAR/ESCREVER.
 * Owner sem tenant_id definido usa o tenant do header X-Tenant-Id, senão 1.
 */
function writeTenantId(user: JwtPayload, req: Request): number {
  if (user.role === 'owner') {
    const h = Number(req.headers['x-tenant-id']);
    return h > 0 ? h : 1;
  }
  return user.tenantId ?? user.tenantIds[0] ?? 1;
}

/**
 * Monta a cláusula WHERE de tenant para leituras.
 * Retorna { clause: string; params: any[] }
 * - owner sem X-Tenant-Id: sem filtro (vê todos)
 * - owner com X-Tenant-Id: filtra pelo tenant do header
 * - outros: filtra pela lista de tenants permitidos
 */
function tenantWhereClause(
  user: JwtPayload,
  req: Request,
  existingWhere = false,
): { clause: string; params: any[] } {
  const prefix = existingWhere ? ' AND ' : ' WHERE ';
  const ids = allowedTenants(user); // null = owner sem restrição

  const headerTenant = Number(req.headers['x-tenant-id']);

  if (ids === null) {
    // owner
    if (headerTenant > 0) {
      return { clause: `${prefix}tenant_id = ?`, params: [headerTenant] };
    }
    return { clause: '', params: [] };
  }

  if (ids.length === 0) {
    return { clause: `${prefix}1=0`, params: [] };
  }
  if (ids.length === 1) {
    return { clause: `${prefix}tenant_id = ?`, params: [ids[0]] };
  }
  return {
    clause: `${prefix}tenant_id IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  };
}

async function assertOrderOpen(
  orderId: string,
  user: JwtPayload,
  req: Request,
  res: Response,
): Promise<boolean> {
  const [rows] = await pool.execute(
    'SELECT status, tenant_id FROM os_orders WHERE id = ?',
    [orderId],
  );
  const order = (rows as { status: string; tenant_id: number }[])[0];
  if (!order) {
    res.status(404).json({ message: 'OS não encontrada' });
    return false;
  }

  // Verificar acesso ao tenant
  const allowed = allowedTenants(user);
  if (allowed !== null && !allowed.includes(order.tenant_id)) {
    res.status(403).json({ message: 'Sem acesso a esta OS' });
    return false;
  }

  if (order.status === 'closed') {
    res.status(422).json({ message: 'OS encerrada. Reabra a OS para realizar alterações.' });
    return false;
  }
  return true;
}

async function recalcTotal(orderId: string): Promise<number> {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(total), 0) AS items_t, COALESCE(SUM(labor_price), 0) AS labor_t
     FROM os_order_items WHERE order_id = ?`,
    [orderId],
  );
  const row = (rows as { items_t: string; labor_t: string }[])[0];
  const totalParts = row ? Number(row.items_t) : 0;
  const totalLabor = row ? Number(row.labor_t) : 0;
  const total = totalParts + totalLabor;
  await pool.execute(
    'UPDATE os_orders SET labor_amount = ?, total_amount = ?, updated_at = NOW() WHERE id = ?',
    [totalLabor, total, orderId],
  );
  return total;
}

async function fetchItems(orderId: string): Promise<Record<string, unknown>[]> {
  const [rows] = await pool.execute(
    `SELECT oi.*, inst.sigla AS instalacao_sigla
     FROM os_order_items oi
     LEFT JOIN instalacoes inst ON inst.id = oi.instalacao_id
     WHERE oi.order_id = ?
     ORDER BY oi.created_at`,
    [orderId],
  );
  return rows as Record<string, unknown>[];
}

function formatOrder(order: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    id: order.id,
    tenantId: Number(order.tenant_id),
    vehicle: { plate: order.plate, model: order.model, mileage: order.mileage },
    status: order.status,
    vendaControle: (order.venda_controle as string | null) ?? null,
    items: items.map(i => ({
      id: i.id,
      productId: i.product_id ? Number(i.product_id) : null,
      code: i.code,
      description: i.description,
      type: i.type,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      laborPrice: Number(i.labor_price ?? 0),
      total: Number(i.total),
      instalacaoId: i.instalacao_id ? Number(i.instalacao_id) : null,
      instalacaoSigla: (i.instalacao_sigla as string | null) ?? null,
    })),
    laborAmount: Number(order.labor_amount ?? 0),
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    closedAt: order.closed_at ?? null,
  };
}

// ── GET /orders ─────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const { search, status } = req.query as { search?: string; status?: string };
  const user = req.user!;

  try {
    const whereParts: string[] = [];
    const params: any[] = [];

    if (search?.trim()) {
      const clean = search.replace(/[-\s]/g, '').toUpperCase();
      whereParts.push("REPLACE(REPLACE(UPPER(plate), '-', ''), ' ', '') LIKE ?");
      params.push(`%${clean}%`);
    }

    if (status?.trim()) {
      whereParts.push('status = ?');
      params.push(status.trim());
    }

    const { clause: tenantClause, params: tenantParams } = tenantWhereClause(
      user, req, whereParts.length > 0
    );
    // Se não tem busca, tenantClause já traz o WHERE; se tem busca, traz o AND
    const whereStr = whereParts.length > 0
      ? ` WHERE ${whereParts.join(' AND ')}${tenantClause}`
      : tenantClause;

    const sql = `SELECT * FROM os_orders${whereStr} ORDER BY created_at DESC LIMIT 200`;
    const [rows] = await pool.execute(sql, [...params, ...tenantParams]);

    res.json(
      (rows as Record<string, unknown>[]).map((o) => ({
        id: o.id,
        tenantId: Number(o.tenant_id),
        vehicle: { plate: o.plate, model: o.model, mileage: o.mileage },
        status: o.status,
        vendaControle: (o.venda_controle as string | null) ?? null,
        laborAmount: Number(o.labor_amount ?? 0),
        totalAmount: Number(o.total_amount),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        closedAt: o.closed_at ?? null,
      })),
    );
  } catch (err) {
    console.error('GET /orders error:', err);
    res.status(500).json({ message: 'Erro ao listar OS' });
  }
});

// ── POST /orders ────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { vehicle, status = 'open' } = req.body as {
    vehicle?: { plate?: string; model?: string; mileage?: number };
    status?: string;
  };

  if (!vehicle?.plate || !vehicle?.model || !vehicle?.mileage) {
    res.status(400).json({ message: 'Dados do veículo obrigatórios (plate, model, mileage)' });
    return;
  }

  const allowedStatus = ['quote', 'open', 'in_progress', 'closed'];
  const finalStatus = allowedStatus.includes(status) ? status : 'open';
  const tenantId = writeTenantId(req.user!, req);

  try {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();

    await pool.execute(
      'INSERT INTO os_orders (id, plate, model, mileage, status, total_amount, tenant_id) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [id, vehicle.plate.toUpperCase(), vehicle.model, vehicle.mileage, finalStatus, tenantId],
    );

    res.status(201).json({
      id,
      tenantId,
      vehicle: { plate: vehicle.plate.toUpperCase(), model: vehicle.model, mileage: vehicle.mileage },
      status: finalStatus,
      vendaControle: null,
      items: [],
      totalAmount: 0,
      laborAmount: 0,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    });
  } catch (err) {
    console.error('POST /orders error:', err);
    res.status(500).json({ message: 'Erro ao criar OS' });
  }
});

// ── GET /orders/:id ─────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const user = req.user!;
  try {
    const [orders] = await pool.execute(
      'SELECT * FROM os_orders WHERE id = ?',
      [req.params.id],
    );
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    // Verificar acesso ao tenant
    const allowed = allowedTenants(user);
    if (allowed !== null && !allowed.includes(Number(order.tenant_id))) {
      res.status(403).json({ message: 'Sem acesso a esta OS' });
      return;
    }

    const items = await fetchItems(req.params.id);

    res.json(formatOrder(order, items));
  } catch (err) {
    console.error('GET /orders/:id error:', err);
    res.status(500).json({ message: 'Erro ao buscar OS' });
  }
});

// ── POST /orders/:id/items ──────────────────────────────────────────────────

router.post('/:id/items', async (req: Request, res: Response) => {
  const { catalogItemId, quantity = 1, unitPrice: overridePrice, laborPrice = 0, instalacaoId } = req.body as {
    catalogItemId?: number | string;
    quantity?: number;
    unitPrice?: number;
    laborPrice?: number;
    instalacaoId?: number;
  };

  if (!catalogItemId) {
    res.status(400).json({ message: 'catalogItemId obrigatório' });
    return;
  }

  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    const [products] = await pool.execute(
      `SELECT
         p.id,
         COALESCE(NULLIF(TRIM(p.cod_barra), ''), CONCAT('ID', LPAD(p.id, 6, '0'))) AS code,
         CONVERT(p.nome_produto USING utf8mb4) AS description,
         CASE WHEN p.id_tipo IN (2, 9) THEN 'service' ELSE 'part' END AS type,
         CAST(p.vr_venda AS DECIMAL(18,4)) AS unit_price
       FROM cad_produtos p WHERE p.id = ?`,
      [catalogItemId],
    );

    const product = (products as Record<string, unknown>[])[0];
    if (!product) { res.status(404).json({ message: 'Produto não encontrado no catálogo' }); return; }

    // Verifica instalações obrigatórias
    const [instRows] = await pool.execute(
      'SELECT instalacao_id FROM produto_instalacao WHERE produto_id = ?',
      [product.id],
    );
    const validInstIds = (instRows as { instalacao_id: number }[]).map(r => r.instalacao_id);
    if (validInstIds.length > 0 && !instalacaoId) {
      res.status(400).json({ message: 'Selecione uma instalação para este produto' });
      return;
    }
    if (instalacaoId && !validInstIds.includes(Number(instalacaoId))) {
      res.status(400).json({ message: 'Instalação inválida para este produto' });
      return;
    }

    const itemId    = crypto.randomUUID();
    const qty       = Number(quantity);
    const unitPrice = (overridePrice !== undefined && Number(overridePrice) > 0)
      ? Number(overridePrice)
      : Number(product.unit_price);
    const total     = qty * unitPrice;
    const lp        = Number(laborPrice) >= 0 ? Number(laborPrice) : 0;
    const instId    = instalacaoId ?? null;

    // Busca a sigla da instalação selecionada (se houver)
    let instalacaoSigla: string | null = null;
    if (instId) {
      const [[instRow]] = await pool.execute<any>(
        'SELECT sigla FROM instalacoes WHERE id = ?', [instId]
      );
      instalacaoSigla = instRow?.sigla ?? null;
    }

    await pool.execute(
      `INSERT INTO os_order_items
         (id, order_id, product_id, code, description, type, quantity, unit_price, labor_price, total, instalacao_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, req.params.id, product.id, product.code, product.description, product.type, qty, unitPrice, lp, total, instId],
    );

    await recalcTotal(req.params.id);

    res.status(201).json({
      id: itemId,
      code: product.code,
      description: product.description,
      type: product.type,
      quantity: qty,
      unitPrice,
      laborPrice: lp,
      total,
      instalacaoId: instId,
      instalacaoSigla,
    });
  } catch (err) {
    console.error('POST /orders/:id/items error:', err);
    res.status(500).json({ message: 'Erro ao adicionar item' });
  }
});

// ── PATCH /orders/:id/items/:itemId ────────────────────────────────────────

router.patch('/:id/items/:itemId', async (req: Request, res: Response) => {
  const { quantity } = req.body as { quantity?: number };

  if (!quantity || quantity <= 0) {
    res.status(400).json({ message: 'quantity deve ser maior que zero' });
    return;
  }

  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    const [rows] = await pool.execute(
      'SELECT * FROM os_order_items WHERE id = ? AND order_id = ?',
      [req.params.itemId, req.params.id],
    );
    const item = (rows as Record<string, unknown>[])[0];
    if (!item) { res.status(404).json({ message: 'Item não encontrado' }); return; }

    const qty       = Number(quantity);
    const unitPrice = Number(item.unit_price);
    const total     = qty * unitPrice;

    await pool.execute(
      'UPDATE os_order_items SET quantity = ?, total = ? WHERE id = ?',
      [qty, total, req.params.itemId],
    );

    await recalcTotal(req.params.id);

    res.json({ id: item.id, code: item.code, description: item.description, type: item.type, quantity: qty, unitPrice, total });
  } catch (err) {
    console.error('PATCH /orders/:id/items/:itemId error:', err);
    res.status(500).json({ message: 'Erro ao atualizar quantidade' });
  }
});

// ── PATCH /orders/:id/status ────────────────────────────────────────────────

router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  const allowed = ['quote', 'open', 'in_progress', 'closed'];

  if (!status || !allowed.includes(status)) {
    res.status(400).json({ message: `Status deve ser: ${allowed.join(', ')}` });
    return;
  }

  try {
    // Verificar acesso ao tenant
    const [rows] = await pool.execute('SELECT tenant_id FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (rows as { tenant_id: number }[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }
    const allowedT = allowedTenants(req.user!);
    if (allowedT !== null && !allowedT.includes(order.tenant_id)) {
      res.status(403).json({ message: 'Sem acesso a esta OS' });
      return;
    }

    if (status === 'closed') {
      await pool.execute(
        'UPDATE os_orders SET status = ?, updated_at = NOW(), closed_at = NOW() WHERE id = ?',
        [status, req.params.id],
      );
    } else {
      await pool.execute(
        'UPDATE os_orders SET status = ?, updated_at = NOW(), closed_at = NULL WHERE id = ?',
        [status, req.params.id],
      );
    }

    const [updRows] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const updated = (updRows as Record<string, unknown>[])[0];
    if (!updated) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const items = await fetchItems(req.params.id);

    res.json(formatOrder(updated, items));
  } catch (err) {
    console.error('PATCH /orders/:id/status error:', err);
    res.status(500).json({ message: 'Erro ao atualizar status da OS' });
  }
});

// ── POST /orders/:id/approve ────────────────────────────────────────────────
// Aprova um orçamento transformando-o em OS aberta (status = 'open')
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (rows as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const allowedT = allowedTenants(req.user!);
    if (allowedT !== null && !allowedT.includes(Number(order.tenant_id))) {
      res.status(403).json({ message: 'Sem acesso a esta OS' });
      return;
    }

    await pool.execute(
      "UPDATE os_orders SET status = 'open', updated_at = NOW() WHERE id = ?",
      [req.params.id],
    );

    const [updRows] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const updated = (updRows as Record<string, unknown>[])[0];
    const items = await fetchItems(req.params.id);

    res.json(formatOrder(updated, items));
  } catch (err) {
    console.error('POST /orders/:id/approve error:', err);
    res.status(500).json({ message: 'Erro ao aprovar orçamento' });
  }
});

// ── PATCH /orders/:id/labor ─────────────────────────────────────────────────

router.patch('/:id/labor', async (req: Request, res: Response) => {
  const { amount } = req.body as { amount?: number };

  if (amount === undefined || Number(amount) < 0) {
    res.status(400).json({ message: 'amount deve ser >= 0' });
    return;
  }

  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    await pool.execute(
      'UPDATE os_orders SET labor_amount = ?, updated_at = NOW() WHERE id = ?',
      [Number(amount), req.params.id],
    );

    await recalcTotal(req.params.id);

    const [orders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const items = await fetchItems(req.params.id);

    res.json(formatOrder(order, items));
  } catch (err) {
    console.error('PATCH /orders/:id/labor error:', err);
    res.status(500).json({ message: 'Erro ao atualizar mão de obra' });
  }
});

// ── PATCH /orders/:id/items/:itemId/labor ──────────────────────────────────

router.patch('/:id/items/:itemId/labor', async (req: Request, res: Response) => {
  const { laborPrice } = req.body as { laborPrice?: number };

  if (laborPrice === undefined || Number(laborPrice) < 0) {
    res.status(400).json({ message: 'laborPrice deve ser >= 0' });
    return;
  }

  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    await pool.execute(
      'UPDATE os_order_items SET labor_price = ? WHERE id = ? AND order_id = ?',
      [Number(laborPrice), req.params.itemId, req.params.id],
    );

    await recalcTotal(req.params.id);

    const [orders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const items = await fetchItems(req.params.id);

    res.json(formatOrder(order, items));
  } catch (err) {
    console.error('PATCH /orders/:id/items/:itemId/labor error:', err);
    res.status(500).json({ message: 'Erro ao atualizar mão de obra do item' });
  }
});

// ── DELETE /orders/:id/items/:itemId ───────────────────────────────────────

router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    await pool.execute(
      'DELETE FROM os_order_items WHERE id = ? AND order_id = ?',
      [req.params.itemId, req.params.id],
    );

    await recalcTotal(req.params.id);

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /orders/:id/items/:itemId error:', err);
    res.status(500).json({ message: 'Erro ao remover item' });
  }
});

export default router;
