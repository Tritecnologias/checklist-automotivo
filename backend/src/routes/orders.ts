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

const PLATE_RE = /\b([A-Z]{3})[\-\s]?([0-9][A-Z0-9][0-9]{2})\b/i;

function stripPlate(nome: string): string {
  return String(nome || '').replace(PLATE_RE, '').replace(/\s+/g, ' ').trim();
}

function formatOrder(order: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    id: order.id,
    tenantId: Number(order.tenant_id),
    vehicle: { plate: order.plate, model: order.model, mileage: order.mileage },
    client: {
      id: order.client_id ? Number(order.client_id) : null,
      name: (order.client_name as string) || '',
      phone: (order.client_phone as string) || '',
      document: (order.client_document as string) || null,
    },
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
    discountAmount: Number(order.discount_amount ?? 0),
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
      const term = `%${search.trim()}%`;
      whereParts.push(`(
        REPLACE(REPLACE(UPPER(plate), '-', ''), ' ', '') LIKE ?
        OR UPPER(model) LIKE ?
        OR UPPER(COALESCE(client_name, '')) LIKE ?
        OR COALESCE(client_phone, '') LIKE ?
      )`);
      params.push(`%${clean}%`, term, term, term);
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

    const sql = `
      SELECT o.*,
             COALESCE(v.vr_total, o.total_amount) AS total_amount,
             COALESCE(ABS(v.vr_adicional), o.discount_amount, 0) AS discount_amount
      FROM os_orders o
      LEFT JOIN mv_vendas v ON v.controle = o.venda_controle
      ${whereStr}
      ORDER BY o.created_at DESC
      LIMIT 200
    `;
    const [rows] = await pool.execute(sql, [...params, ...tenantParams]);

    res.json(
      (rows as Record<string, unknown>[]).map((o) => ({
        id: o.id,
        tenantId: Number(o.tenant_id),
        vehicle: { plate: o.plate, model: o.model, mileage: o.mileage },
        client: {
          id: o.client_id ? Number(o.client_id) : null,
          name: (o.client_name as string) || '',
          phone: (o.client_phone as string) || '',
          document: (o.client_document as string) || null,
        },
        status: o.status,
        vendaControle: (o.venda_controle as string | null) ?? null,
        laborAmount: Number(o.labor_amount ?? 0),
        totalAmount: Number(o.total_amount),
        discountAmount: Number(o.discount_amount ?? 0),
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

// ── GET /orders/lookup-plate/:plate ──────────────────────────────────────────

router.get('/lookup-plate/:plate', async (req: Request, res: Response) => {
  const rawPlate = String(req.params.plate ?? '');
  const cleanPlate = rawPlate.replace(/[-\s]/g, '').toUpperCase();

  // Uma placa veicular no Brasil possui exatamente 7 caracteres (padrão tradicional AAA9999 ou Mercosul AAA9A99)
  if (cleanPlate.length !== 7 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleanPlate)) {
    res.json({ found: false });
    return;
  }

  try {
    // 1. Tenta buscar na última OS gravada (correspondência exata da placa)
    const [orders] = await pool.execute<any[]>(
      `SELECT plate, model, mileage, client_id, client_name, client_phone, client_document
       FROM os_orders
       WHERE REPLACE(REPLACE(UPPER(plate), '-', ''), ' ', '') = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [cleanPlate]
    );
    const lastOrder = (orders as any[])[0];

    // 2. Tenta buscar no cadastro de clientes (cad_clientes)
    // Busca exclusivamente pela placa completa de 7 caracteres no nome do cliente (onde a placa fica armazenada no formato legado).
    // NÃO busca em inf_adicional para evitar falsos positivos com modelos de veículos.
    const [clients] = await pool.execute<any[]>(
      `SELECT id, nome_cliente, telefone, celular, cpf_cnpj, inf_adicional
       FROM cad_clientes
       WHERE inativo = 0 AND (
         REPLACE(REPLACE(UPPER(nome_cliente), '-', ''), ' ', '') LIKE ?
       )
       ORDER BY id DESC
       LIMIT 1`,
      [`%${cleanPlate}%`]
    );
    const clientRow = (clients as any[])[0];

    if (!lastOrder && !clientRow) {
      res.json({ found: false });
      return;
    }

    const cleanClientName = clientRow
      ? stripPlate(clientRow.nome_cliente) || clientRow.nome_cliente
      : '';
    const cleanClientPhone = clientRow
      ? clientRow.celular || clientRow.telefone || ''
      : '';
    const cleanClientDoc = clientRow
      ? clientRow.cpf_cnpj || ''
      : '';

    const resolvedClient = {
      id: lastOrder?.client_id ?? clientRow?.id ?? null,
      name: lastOrder?.client_name || cleanClientName || '',
      phone: lastOrder?.client_phone || cleanClientPhone || '',
      document: lastOrder?.client_document || cleanClientDoc || '',
    };

    const resolvedVehicle = {
      plate: lastOrder?.plate || rawPlate.toUpperCase(),
      model: lastOrder?.model || clientRow?.inf_adicional || '',
      mileage: lastOrder?.mileage ? Number(lastOrder.mileage) : 0,
    };

    res.json({
      found: true,
      vehicle: resolvedVehicle,
      client: resolvedClient,
      source: lastOrder ? (clientRow ? 'os_and_cad_clientes' : 'os') : 'cad_clientes',
    });
  } catch (err) {
    console.error('GET /orders/lookup-plate error:', err);
    res.status(500).json({ message: 'Erro ao consultar placa' });
  }
});

// ── POST /orders ────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const {
    vehicle,
    client,
    status = 'open',
  } = req.body as {
    vehicle?: { plate?: string; model?: string; mileage?: number };
    client?: { id?: number | null; name?: string; phone?: string; document?: string };
    status?: string;
  };

  if (!vehicle?.plate || !vehicle?.model || vehicle?.mileage === undefined) {
    res.status(400).json({ message: 'Dados do veículo obrigatórios (plate, model, mileage)' });
    return;
  }

  let clientName = String(client?.name ?? '').trim();
  let clientPhone = String(client?.phone ?? '').trim();
  let clientDoc = client?.document ? String(client.document).trim() : null;
  let finalClientId: number | null = client?.id ? Number(client.id) : null;

  // Se o cliente foi enviado pelo novo frontend, valida obrigatoriedade
  if (client && client.name !== undefined) {
    if (!clientName) {
      res.status(400).json({ message: 'Nome completo do cliente é obrigatório' });
      return;
    }
    if (!clientPhone || clientPhone.replace(/\D/g, '').length < 8) {
      res.status(400).json({ message: 'Número de telefone / WhatsApp do cliente é obrigatório' });
      return;
    }
  } else {
    // Compatibilidade com versões do app mobile anteriores ao rebuild:
    // Tenta resolver cliente automaticamente pela placa (somente placa válida completa de 7 caracteres)
    const cleanPlate = vehicle.plate.replace(/[-\s]/g, '').toUpperCase();
    if (cleanPlate.length === 7 && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleanPlate)) {
      try {
        const [cRows] = await pool.query<any>(
          `SELECT id, nome_cliente, telefone, celular, cpf_cnpj, inf_adicional
           FROM cad_clientes
           WHERE inativo = 0 AND (
             REPLACE(REPLACE(UPPER(nome_cliente), '-', ''), ' ', '') LIKE ?
           )
           LIMIT 1`,
          [`%${cleanPlate}%`]
        );
        if (cRows.length > 0) {
          finalClientId = Number(cRows[0].id);
          clientName = stripPlate(cRows[0].nome_cliente) || cRows[0].nome_cliente;
          clientPhone = cRows[0].celular || cRows[0].telefone || '';
          clientDoc = cRows[0].cpf_cnpj || null;
        } else {
          clientName = `Cliente ${vehicle.plate.toUpperCase()}`;
          clientPhone = '';
        }
      } catch {
        clientName = `Cliente ${vehicle.plate.toUpperCase()}`;
        clientPhone = '';
      }
    } else {
      clientName = `Cliente ${vehicle.plate.toUpperCase()}`;
      clientPhone = '';
    }
  }

  const allowedStatus = ['quote', 'open', 'in_progress', 'closed'];
  const finalStatus = allowedStatus.includes(status) ? status : 'open';
  const tenantId = writeTenantId(req.user!, req);

  try {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();

    let finalClientId: number | null = client?.id ? Number(client.id) : null;

    // Sincroniza / cadastra em cad_clientes
    try {
      if (finalClientId && finalClientId > 0) {
        // Atualiza cliente existente com os dados validados
        await pool.execute(
          `UPDATE cad_clientes
           SET telefone = COALESCE(NULLIF(?, ''), telefone),
               celular  = COALESCE(NULLIF(?, ''), celular),
               cpf_cnpj = COALESCE(NULLIF(?, ''), cpf_cnpj),
               data_ultima_alteracao = CURDATE()
           WHERE id = ?`,
          [clientPhone, clientPhone, clientDoc, finalClientId]
        );
        await pool.query(
          'INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES (?, ?)',
          [finalClientId, tenantId]
        ).catch(() => {});
      } else {
        // Tenta localizar por documento ou telefone
        const cleanDoc = clientDoc ? clientDoc.replace(/\D/g, '') : '';
        const cleanTel = clientPhone.replace(/\D/g, '');
        let existingClient: any = null;

        if (cleanDoc.length === 11 || cleanDoc.length === 14) {
          const [rows] = await pool.query<any>(
            `SELECT id FROM cad_clientes
             WHERE inativo = 0 AND REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '-', ''), '/', '') = ?
             LIMIT 1`,
            [cleanDoc]
          );
          if (rows.length > 0) existingClient = rows[0];
        }

        if (!existingClient && cleanTel.length >= 8) {
          const [rows] = await pool.query<any>(
            `SELECT id FROM cad_clientes
             WHERE inativo = 0 AND (
               REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone, ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?
               OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(celular, ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?
             )
             LIMIT 1`,
            [`%${cleanTel.slice(-8)}%`, `%${cleanTel.slice(-8)}%`]
          );
          if (rows.length > 0) existingClient = rows[0];
        }

        if (existingClient) {
          finalClientId = Number(existingClient.id);
          await pool.execute(
            `UPDATE cad_clientes
             SET telefone = COALESCE(NULLIF(?, ''), telefone),
                 celular  = COALESCE(NULLIF(?, ''), celular),
                 cpf_cnpj = COALESCE(NULLIF(?, ''), cpf_cnpj),
                 data_ultima_alteracao = CURDATE()
             WHERE id = ?`,
            [clientPhone, clientPhone, clientDoc, finalClientId]
          );
          await pool.query(
            'INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES (?, ?)',
            [finalClientId, tenantId]
          ).catch(() => {});
        } else {
          // Cria novo cliente no cad_clientes
          const rawNome = `${clientName} ${vehicle.plate.toUpperCase()}`.slice(0, 60);
          const [insResult] = await pool.query<any>(
            `INSERT INTO cad_clientes (nome_cliente, telefone, celular, cpf_cnpj, inf_adicional, inativo, data_cadastro)
             VALUES (?, ?, ?, ?, ?, 0, CURDATE())`,
            [rawNome, clientPhone, clientPhone, clientDoc, vehicle.model.slice(0, 255)]
          );
          finalClientId = insResult.insertId;
          await pool.query(
            'INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES (?, ?)',
            [finalClientId, tenantId]
          ).catch(() => {});
        }
      }
    } catch (cErr) {
      console.error('Erro ao sincronizar cliente em cad_clientes:', cErr);
    }

    await pool.execute(
      `INSERT INTO os_orders
         (id, plate, model, mileage, status, total_amount, tenant_id, client_id, client_name, client_phone, client_document)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        id,
        vehicle.plate.toUpperCase(),
        vehicle.model,
        vehicle.mileage,
        finalStatus,
        tenantId,
        finalClientId,
        clientName,
        clientPhone,
        clientDoc,
      ],
    );

    res.status(201).json({
      id,
      tenantId,
      vehicle: { plate: vehicle.plate.toUpperCase(), model: vehicle.model, mileage: vehicle.mileage },
      client: {
        id: finalClientId,
        name: clientName,
        phone: clientPhone,
        document: clientDoc,
      },
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
      `SELECT o.*,
              COALESCE(v.vr_total, o.total_amount) AS total_amount,
              COALESCE(ABS(v.vr_adicional), o.discount_amount, 0) AS discount_amount
       FROM os_orders o
       LEFT JOIN mv_vendas v ON v.controle = o.venda_controle
       WHERE o.id = ?`,
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
      [product.id as any],
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
      [itemId, req.params.id, product.id as any, product.code as any, product.description as any, product.type as any, qty, unitPrice, lp, total, instId],
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

// ── PATCH /orders/:id/client ───────────────────────────────────────────────

router.patch('/:id/client', async (req: Request, res: Response) => {
  const { name, phone, document } = req.body as {
    name?: string;
    phone?: string;
    document?: string;
  };

  const clientName = String(name || '').trim();
  const clientPhone = String(phone || '').trim();
  const clientDoc = document ? String(document).trim() : null;

  if (!clientName) {
    res.status(400).json({ message: 'Nome do cliente é obrigatório' });
    return;
  }
  if (!clientPhone || clientPhone.replace(/\D/g, '').length < 8) {
    res.status(400).json({ message: 'Número de telefone / WhatsApp do cliente é obrigatório' });
    return;
  }

  try {
    if (!await assertOrderOpen(req.params.id, req.user!, req, res)) return;

    const [orders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const order = (orders as Record<string, unknown>[])[0];
    if (!order) { res.status(404).json({ message: 'OS não encontrada' }); return; }

    const clientId = order.client_id ? Number(order.client_id) : null;
    if (clientId) {
      await pool.execute(
        `UPDATE cad_clientes
         SET telefone = ?,
             celular  = ?,
             cpf_cnpj = COALESCE(NULLIF(?, ''), cpf_cnpj),
             data_ultima_alteracao = CURDATE()
         WHERE id = ?`,
        [clientPhone, clientPhone, clientDoc, clientId]
      ).catch((e) => console.error('Erro ao atualizar cad_clientes:', e));
    }

    await pool.execute(
      `UPDATE os_orders
       SET client_name = ?, client_phone = ?, client_document = ?, updated_at = NOW()
       WHERE id = ?`,
      [clientName, clientPhone, clientDoc, req.params.id]
    );

    const [updatedOrders] = await pool.execute('SELECT * FROM os_orders WHERE id = ?', [req.params.id]);
    const updatedOrder = (updatedOrders as Record<string, unknown>[])[0];
    const items = await fetchItems(req.params.id);

    res.json(formatOrder(updatedOrder, items));
  } catch (err) {
    console.error('PATCH /orders/:id/client error:', err);
    res.status(500).json({ message: 'Erro ao atualizar dados do cliente' });
  }
});

export default router;
