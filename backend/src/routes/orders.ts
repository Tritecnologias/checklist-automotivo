import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

async function recalcTotal(orderId: string): Promise<number> {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(total), 0) AS items_t, COALESCE(SUM(labor_price), 0) AS labor_t
     FROM os_order_items WHERE order_id = ?`,
    [orderId],
  );
  const row = (rows as { items_t: string; labor_t: string }[])[0];
  const totalParts  = row ? Number(row.items_t) : 0;
  const totalLabor  = row ? Number(row.labor_t) : 0;
  const total       = totalParts + totalLabor;
  await pool.execute(
    'UPDATE os_orders SET labor_amount = ?, total_amount = ?, updated_at = NOW() WHERE id = ?',
    [totalLabor, total, orderId],
  );
  return total;
}

function formatOrder(order: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    id: order.id,
    vehicle: { plate: order.plate, model: order.model, mileage: order.mileage },
    status: order.status,
    items: items.map(i => ({
      id: i.id,
      code: i.code,
      description: i.description,
      type: i.type,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      laborPrice: Number(i.labor_price ?? 0),
      total: Number(i.total),
    })),
    laborAmount: Number(order.labor_amount ?? 0),
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

// ── GET /orders ─────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM os_orders ORDER BY created_at DESC LIMIT 100',
    );
    res.json(
      (rows as Record<string, unknown>[]).map((o) => ({
        id: o.id,
        vehicle: { plate: o.plate, model: o.model, mileage: o.mileage },
        status: o.status,
        totalAmount: Number(o.total_amount),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
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

  try {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();

    await pool.execute(
      'INSERT INTO os_orders (id, plate, model, mileage, status, total_amount) VALUES (?, ?, ?, ?, ?, 0)',
      [id, vehicle.plate.toUpperCase(), vehicle.model, vehicle.mileage, status],
    );

    res.status(201).json({
      id,
      vehicle: { plate: vehicle.plate.toUpperCase(), model: vehicle.model, mileage: vehicle.mileage },
      status,
      items: [],
      totalAmount: 0,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.error('POST /orders error:', err);
    res.status(500).json({ message: 'Erro ao criar OS' });
  }
});

// ── GET /orders/:id ─────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [orders] = await pool.execute(
      'SELECT * FROM os_orders WHERE id = ?',
      [req.params.id],
    );
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const [items] = await pool.execute(
      'SELECT * FROM os_order_items WHERE order_id = ? ORDER BY created_at',
      [req.params.id],
    );

    res.json(formatOrder(order, items as Record<string, unknown>[]));
  } catch (err) {
    console.error('GET /orders/:id error:', err);
    res.status(500).json({ message: 'Erro ao buscar OS' });
  }
});

// ── POST /orders/:id/items ──────────────────────────────────────────────────

router.post('/:id/items', async (req: Request, res: Response) => {
  const { catalogItemId, quantity = 1, unitPrice: overridePrice, laborPrice = 0 } = req.body as {
    catalogItemId?: number | string;
    quantity?: number;
    unitPrice?: number;
    laborPrice?: number;
  };

  if (!catalogItemId) {
    res.status(400).json({ message: 'catalogItemId obrigatório' });
    return;
  }

  try {
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

    const itemId    = crypto.randomUUID();
    const qty       = Number(quantity);
    const unitPrice = (overridePrice !== undefined && Number(overridePrice) > 0)
      ? Number(overridePrice)
      : Number(product.unit_price);
    const total     = qty * unitPrice;

    const lp = Number(laborPrice) >= 0 ? Number(laborPrice) : 0;

    await pool.execute(
      `INSERT INTO os_order_items
         (id, order_id, product_id, code, description, type, quantity, unit_price, labor_price, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, req.params.id, product.id, product.code, product.description, product.type, qty, unitPrice, lp, total],
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

    res.json({
      id: item.id,
      code: item.code,
      description: item.description,
      type: item.type,
      quantity: qty,
      unitPrice,
      total,
    });
  } catch (err) {
    console.error('PATCH /orders/:id/items/:itemId error:', err);
    res.status(500).json({ message: 'Erro ao atualizar quantidade' });
  }
});

// ── PATCH /orders/:id/status ────────────────────────────────────────────────

router.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  const allowed = ['open', 'in_progress', 'closed'];

  if (!status || !allowed.includes(status)) {
    res.status(400).json({ message: `Status deve ser: ${allowed.join(', ')}` });
    return;
  }

  try {
    await pool.execute(
      'UPDATE os_orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id],
    );

    const [rows] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (rows as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const [items] = await pool.execute(
      'SELECT * FROM os_order_items WHERE order_id = ? ORDER BY created_at',
      [req.params.id],
    );

    res.json(formatOrder(order, items as Record<string, unknown>[]));
  } catch (err) {
    console.error('PATCH /orders/:id/status error:', err);
    res.status(500).json({ message: 'Erro ao atualizar status da OS' });
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
    await pool.execute(
      'UPDATE os_orders SET labor_amount = ?, updated_at = NOW() WHERE id = ?',
      [Number(amount), req.params.id],
    );

    await recalcTotal(req.params.id);

    const [orders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const [items] = await pool.execute(
      'SELECT * FROM os_order_items WHERE order_id = ? ORDER BY created_at',
      [req.params.id],
    );

    res.json(formatOrder(order, items as Record<string, unknown>[]));
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
    await pool.execute(
      'UPDATE os_order_items SET labor_price = ? WHERE id = ? AND order_id = ?',
      [Number(laborPrice), req.params.itemId, req.params.id],
    );

    await recalcTotal(req.params.id);

    const [orders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const [items] = await pool.execute(
      'SELECT * FROM os_order_items WHERE order_id = ? ORDER BY created_at',
      [req.params.id],
    );

    res.json(formatOrder(order, items as Record<string, unknown>[]));
  } catch (err) {
    console.error('PATCH /orders/:id/items/:itemId/labor error:', err);
    res.status(500).json({ message: 'Erro ao atualizar mão de obra do item' });
  }
});

// ── DELETE /orders/:id/items/:itemId ───────────────────────────────────────

router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
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
