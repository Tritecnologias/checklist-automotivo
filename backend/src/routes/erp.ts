import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
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

function getErpTenantCondition(req: Request, column = 'tenant_id'): { condition: string; params: any[] } {
  const user = req.user as JwtPayload | undefined;
  const h = Number(req.headers['x-tenant-id']);

  if (!user) {
    if (h > 0) return { condition: `${column} = ?`, params: [h] };
    return { condition: '', params: [] };
  }
  if (user.role === 'owner') {
    if (h > 0) return { condition: `${column} = ?`, params: [h] };
    return { condition: '', params: [] };
  }
  const tid = (h > 0 && user.tenantIds.includes(h)) ? h : (user.tenantIds[0] ?? 1);
  return { condition: `${column} = ?`, params: [tid] };
}

function getErpTenantFilter(req: Request, existingWhere = false, column = 'tenant_id'): { clause: string; params: any[] } {
  const { condition, params } = getErpTenantCondition(req, column);
  if (!condition) return { clause: '', params: [] };
  return { clause: (existingWhere ? ' AND ' : ' WHERE ') + condition, params };
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
  const { clause: vClause, params: vParams } = getErpTenantFilter(req, true, 'tenant_id');
  const { clause: lClause, params: lParams } = getErpTenantFilter(req, true, 'tenant_id');

  const [[hoje]] = await pool.query<any>(
    `SELECT COUNT(*) as count_vendas, COALESCE(SUM(vr_total),0) as total_dia
     FROM mv_vendas WHERE data_venda = CURDATE()${vClause}`,
    vParams
  );
  const [[semana]] = await pool.query<any>(
    `SELECT COALESCE(SUM(vr_total),0) as total_semana
     FROM mv_vendas WHERE data_venda >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${vClause}`,
    vParams
  );
  const [[mes]] = await pool.query<any>(
    `SELECT COALESCE(SUM(vr_total),0) as total_mes
     FROM mv_vendas WHERE MONTH(data_venda)=MONTH(CURDATE()) AND YEAR(data_venda)=YEAR(CURDATE())${vClause}`,
    vParams
  );
  const [top_produtos] = await pool.query<any>(
    `SELECT p.nome_produto, SUM(m.quant) as quant, SUM(m.vr_total) as total
     FROM mv_vendas_movimento m
     JOIN cad_produtos p ON p.id = m.id_produto
     JOIN mv_vendas v ON v.controle = m.controle
     WHERE m.data_venda = CURDATE()${vClause.replace(/tenant_id/g, 'v.tenant_id')}
     GROUP BY m.id_produto ORDER BY total DESC LIMIT 5`,
    vParams
  );
  const [estoque_baixo] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS estoque, p.min_estoque
     FROM cad_produtos p
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     WHERE p.inativo = 0 AND p.min_estoque > 0 AND COALESCE(p.controla_estoque, 1) = 1
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
     FROM cad_lancamentos WHERE status_lancamento = 0${lClause}`,
    lParams
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
  const page       = Math.max(1, Number(req.query.page ?? 1));
  const limit      = 20;
  const offset     = (page - 1) * limit;
  const dataInicio = req.query.data_inicio ? String(req.query.data_inicio).trim() : '';
  const dataFim    = req.query.data_fim    ? String(req.query.data_fim).trim()    : '';
  const formaPagto = req.query.forma_pagto ? String(req.query.forma_pagto).trim().toLowerCase() : '';

  const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'c.tenant_id');
  const whereParts: string[] = [];
  const params: any[] = [];

  if (tenantCond) {
    whereParts.push(tenantCond);
    params.push(...tenantParams);
  }

  if (dataInicio) {
    whereParts.push('c.data_abertura >= ?');
    params.push(dataInicio);
  }

  if (dataFim) {
    whereParts.push('c.data_abertura <= ?');
    params.push(dataFim);
  }

  if (formaPagto === 'dinheiro') {
    whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura)) AND v.vr_dinheiro > 0)');
  } else if (formaPagto === 'cartao') {
    whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura)) AND v.vr_cartao > 0)');
  } else if (formaPagto === 'pix') {
    whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura)) AND v.vr_pix > 0)');
  } else if (formaPagto === 'prazo') {
    whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura)) AND (v.vr_nota > 0 OR v.vr_carne > 0))');
  } else if (formaPagto === 'outros') {
    whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura)) AND (v.vr_ticket > 0 OR v.vr_outros > 0))');
  }

  const whereSql = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM mv_caixa c ${whereSql}`,
    params
  );

  const [rows] = await pool.query<any>(
    `SELECT c.*,
            COALESCE(u.nome, 'Operador') as nome_operador
     FROM mv_caixa c
     LEFT JOIN users u ON u.id = c.id_login
     ${whereSql}
     ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const sessionIds = rows.map((r: any) => r.id);
  const sessionBreakdownMap: Record<number, any> = {};

  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(',');
    const [breakdowns] = await pool.query<any>(
      `SELECT 
         c.id as id_caixa,
         COALESCE(SUM(v.vr_total), 0) as vr_total,
         COALESCE(SUM(v.vr_dinheiro), 0) as vr_dinheiro,
         COALESCE(SUM(v.vr_cartao), 0) as vr_cartao,
         COALESCE(SUM(v.vr_pix), 0) as vr_pix,
         COALESCE(SUM(v.vr_nota + v.vr_carne), 0) as vr_prazo,
         COALESCE(SUM(v.vr_ticket + v.vr_outros), 0) as vr_outros,
         COUNT(v.id) as qtd_vendas
       FROM mv_caixa c
       LEFT JOIN mv_vendas v ON (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.tenant_id = c.tenant_id AND v.data_venda = c.data_abertura))
       WHERE c.id IN (${placeholders})
       GROUP BY c.id`,
      sessionIds
    );

    for (const b of breakdowns) {
      sessionBreakdownMap[b.id_caixa] = b;
    }
  }

  const enrichedRows = rows.map((c: any) => {
    const s = sessionBreakdownMap[c.id];
    const totalVendas = Number(s?.vr_total || c.vr_fechado_turno || 0);
    const vrDinheiro = Number(s?.vr_dinheiro || 0);
    const vrCartao = Number(s?.vr_cartao || 0);
    const vrPix = Number(s?.vr_pix || 0);
    const vrPrazo = Number(s?.vr_prazo || 0);
    const vrOutros = Number(s?.vr_outros || 0);
    const vrAbertura = Number(c.vr_abertura || 0);
    const vrFechamento = Number(c.vr_fechamento || 0);
    const saldoEsperado = vrAbertura + vrDinheiro;
    const diferenca = c.status_caixa === 'F' && c.vr_fechamento !== null ? (vrFechamento - saldoEsperado) : 0;

    return {
      ...c,
      vr_fechado_turno: totalVendas,
      saldo_esperado_dinheiro: saldoEsperado,
      diferenca_caixa: diferenca,
      totais_por_forma: {
        dinheiro: vrDinheiro,
        cartao: vrCartao,
        pix: vrPix,
        prazo: vrPrazo,
        outros: vrOutros,
        total_vendas: totalVendas,
        qtd_vendas: Number(s?.qtd_vendas || 0),
      }
    };
  });

  // Agrega totais do período
  const { condition: vTenantCond, params: vTenantParams } = getErpTenantCondition(req, 'v.tenant_id');
  const vWhereParts: string[] = [];
  const vParams: any[] = [];
  if (vTenantCond) {
    vWhereParts.push(vTenantCond);
    vParams.push(...vTenantParams);
  }
  if (dataInicio) {
    vWhereParts.push('v.data_venda >= ?');
    vParams.push(dataInicio);
  }
  if (dataFim) {
    vWhereParts.push('v.data_venda <= ?');
    vParams.push(dataFim);
  }
  const vWhereSql = vWhereParts.length ? 'WHERE ' + vWhereParts.join(' AND ') : '';

  const [[totaisVendas]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(v.vr_total), 0) as total_vendas,
       COALESCE(SUM(v.vr_dinheiro), 0) as dinheiro,
       COALESCE(SUM(v.vr_cartao), 0) as cartao,
       COALESCE(SUM(v.vr_pix), 0) as pix,
       COALESCE(SUM(v.vr_nota + v.vr_carne), 0) as prazo,
       COALESCE(SUM(v.vr_ticket + v.vr_outros), 0) as outros,
       COUNT(v.id) as qtd_vendas
     FROM mv_vendas v
     ${vWhereSql}`,
    vParams
  );

  const { condition: cTenantCond, params: cTenantParams } = getErpTenantCondition(req, 'c.tenant_id');
  const cWhereParts: string[] = [];
  const cParams: any[] = [];
  if (cTenantCond) {
    cWhereParts.push(cTenantCond);
    cParams.push(...cTenantParams);
  }
  if (dataInicio) {
    cWhereParts.push('c.data_abertura >= ?');
    cParams.push(dataInicio);
  }
  if (dataFim) {
    cWhereParts.push('c.data_abertura <= ?');
    cParams.push(dataFim);
  }
  const cWhereSql = cWhereParts.length ? 'WHERE ' + cWhereParts.join(' AND ') : '';

  const [[totaisCaixas]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(c.vr_abertura), 0) as total_fundo,
       COALESCE(SUM(c.vr_fechamento), 0) as total_conferido,
       COUNT(c.id) as qtd_sessoes
     FROM mv_caixa c
     ${cWhereSql}`,
    cParams
  );

  let valorFiltrado = Number(totaisVendas?.total_vendas || 0);
  if (formaPagto === 'dinheiro') valorFiltrado = Number(totaisVendas?.dinheiro || 0);
  else if (formaPagto === 'cartao') valorFiltrado = Number(totaisVendas?.cartao || 0);
  else if (formaPagto === 'pix') valorFiltrado = Number(totaisVendas?.pix || 0);
  else if (formaPagto === 'prazo') valorFiltrado = Number(totaisVendas?.prazo || 0);
  else if (formaPagto === 'outros') valorFiltrado = Number(totaisVendas?.outros || 0);

  res.json({
    data: enrichedRows,
    total: Number(total),
    pages: Math.ceil(total / limit),
    totais: {
      total_vendas: Number(totaisVendas?.total_vendas || 0),
      dinheiro: Number(totaisVendas?.dinheiro || 0),
      cartao: Number(totaisVendas?.cartao || 0),
      pix: Number(totaisVendas?.pix || 0),
      prazo: Number(totaisVendas?.prazo || 0),
      outros: Number(totaisVendas?.outros || 0),
      total_fundo: Number(totaisCaixas?.total_fundo || 0),
      total_conferido: Number(totaisCaixas?.total_conferido || 0),
      qtd_vendas: Number(totaisVendas?.qtd_vendas || 0),
      qtd_sessoes: Number(totaisCaixas?.qtd_sessoes || 0),
      valor_filtrado: valorFiltrado,
    }
  });
});

router.get('/caixa/vendas', async (req, res) => {
  const page       = Math.max(1, Number(req.query.page ?? 1));
  const limit      = 30;
  const offset     = (page - 1) * limit;
  const dataInicio = req.query.data_inicio ? String(req.query.data_inicio).trim() : '';
  const dataFim    = req.query.data_fim    ? String(req.query.data_fim).trim()    : '';
  const formaPagto = req.query.forma_pagto ? String(req.query.forma_pagto).trim().toLowerCase() : '';
  const search     = String(req.query.search ?? '').trim();

  const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'v.tenant_id');
  const whereParts: string[] = [];
  const params: any[] = [];

  if (tenantCond) {
    whereParts.push(tenantCond);
    params.push(...tenantParams);
  }
  if (dataInicio) {
    whereParts.push('v.data_venda >= ?');
    params.push(dataInicio);
  }
  if (dataFim) {
    whereParts.push('v.data_venda <= ?');
    params.push(dataFim);
  }
  if (search.length >= 2) {
    whereParts.push('(c.nome_cliente LIKE ? OR v.controle LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (formaPagto === 'dinheiro') {
    whereParts.push('v.vr_dinheiro > 0');
  } else if (formaPagto === 'cartao') {
    whereParts.push('v.vr_cartao > 0');
  } else if (formaPagto === 'pix') {
    whereParts.push('v.vr_pix > 0');
  } else if (formaPagto === 'prazo') {
    whereParts.push('(v.vr_nota > 0 OR v.vr_carne > 0)');
  } else if (formaPagto === 'outros') {
    whereParts.push('(v.vr_ticket > 0 OR v.vr_outros > 0)');
  }

  const whereSql = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query<any>(
    `SELECT v.id, v.controle, v.data_venda, v.vr_total, v.id_caixa,
            v.vr_dinheiro, v.vr_cartao, v.vr_pix, v.vr_nota, v.vr_carne, v.vr_ticket, v.vr_outros,
            COALESCE(c.nome_cliente, 'Consumidor') as nome_cliente
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     ${whereSql}
     ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      hora_venda: String(r.controle).slice(8, 10) + ':' + String(r.controle).slice(10, 12),
      vr_total: Number(r.vr_total),
      vr_dinheiro: Number(r.vr_dinheiro),
      vr_cartao: Number(r.vr_cartao),
      vr_pix: Number(r.vr_pix),
      vr_prazo: Number(r.vr_nota + r.vr_carne),
      vr_outros: Number(r.vr_ticket + r.vr_outros),
    })),
    total: Number(total),
    pages: Math.ceil(total / limit),
  });
});

router.get('/caixa/status', async (req, res) => {
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);
  const [[row]] = await pool.query<any>(
    `SELECT * FROM mv_caixa WHERE status_caixa = 'A'${tf} ORDER BY id DESC LIMIT 1`,
    tp
  );
  if (!row) {
    res.json(null);
    return;
  }

  // Calcula vendas acumuladas em tempo real da sessão do caixa aberto com isolamento estrito por loja
  const [[totais]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(vr_total), 0) as vr_total,
       COALESCE(SUM(vr_dinheiro), 0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao), 0) as vr_cartao,
       COALESCE(SUM(vr_pix), 0) as vr_pix,
       COALESCE(SUM(vr_nota + vr_carne), 0) as vr_prazo,
       COALESCE(SUM(vr_ticket), 0) as vr_outros,
       COUNT(*) as qtd_vendas
     FROM mv_vendas
     WHERE tenant_id = ?
       AND (
         id_caixa = ?
         OR (
           id_caixa IS NULL 
           AND data_venda >= ?
           AND (
             controle NOT REGEXP '^[0-9]{14}$'
             OR STR_TO_DATE(controle, '%Y%m%d%H%i%s') >= STR_TO_DATE(CONCAT(?, ' ', ?), '%Y-%m-%d %H:%i:%s')
           )
         )
       )`,
    [row.tenant_id, row.id, row.data_abertura, row.data_abertura, row.hora_abertura]
  );

  const vrTotal = Number(totais?.vr_total || 0);
  const vrDinheiro = Number(totais?.vr_dinheiro || 0);
  const vrAbertura = Number(row.vr_abertura || 0);

  res.json({
    ...row,
    vr_fechado_turno: vrTotal,
    totais_por_forma: {
      dinheiro: vrDinheiro,
      cartao: Number(totais?.vr_cartao || 0),
      pix: Number(totais?.vr_pix || 0),
      prazo: Number(totais?.vr_prazo || 0),
      outros: Number(totais?.vr_outros || 0),
      total_vendas: vrTotal,
      qtd_vendas: Number(totais?.qtd_vendas || 0),
      saldo_esperado_dinheiro: vrAbertura + vrDinheiro,
    }
  });
});

router.get('/caixa/:id/detalhes', async (req, res) => {
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);
  const [[caixa]] = await pool.query<any>(
    `SELECT c.*, COALESCE(u.nome, 'Operador') as nome_operador
     FROM mv_caixa c
     LEFT JOIN users u ON u.id = c.id_login
     WHERE c.id = ?${tf.replace(/tenant_id/g, 'c.tenant_id')} LIMIT 1`,
    [req.params.id, ...tp]
  );
  if (!caixa) {
    res.status(404).json({ message: 'Caixa não encontrado para esta loja' });
    return;
  }

  const [[totais]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(vr_total), 0) as vr_total,
       COALESCE(SUM(vr_dinheiro), 0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao), 0) as vr_cartao,
       COALESCE(SUM(vr_pix), 0) as vr_pix,
       COALESCE(SUM(vr_nota + vr_carne), 0) as vr_prazo,
       COALESCE(SUM(vr_ticket), 0) as vr_outros,
       COUNT(*) as qtd_vendas
     FROM mv_vendas
     WHERE tenant_id = ?
       AND (
         id_caixa = ?
         OR (
           id_caixa IS NULL 
           AND data_venda = ?
           AND turno = ?
           AND terminal = ?
         )
       )`,
    [caixa.tenant_id, caixa.id, caixa.data_abertura, caixa.turno, caixa.terminal]
  );

  const [vendas] = await pool.query<any>(
    `SELECT v.id, v.controle, v.data_venda, v.vr_total, v.vr_dinheiro, v.vr_cartao, v.vr_pix, v.vr_nota,
            COALESCE(c.nome_cliente, 'Consumidor') as nome_cliente
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.tenant_id = ?
       AND (
         v.id_caixa = ?
         OR (
           v.id_caixa IS NULL 
           AND v.data_venda = ?
           AND v.turno = ?
           AND v.terminal = ?
         )
       )
     ORDER BY v.id DESC LIMIT 50`,
    [caixa.tenant_id, caixa.id, caixa.data_abertura, caixa.turno, caixa.terminal]
  );

  const vrTotal = Number(totais?.vr_total || caixa.vr_fechado_turno || 0);
  const vrDinheiro = Number(totais?.vr_dinheiro || 0);
  const vrAbertura = Number(caixa.vr_abertura || 0);
  const vrFechamento = Number(caixa.vr_fechamento || 0);
  const saldoEsperado = vrAbertura + vrDinheiro;
  const diferenca = caixa.status_caixa === 'F' ? (vrFechamento - saldoEsperado) : 0;

  res.json({
    caixa,
    totais: {
      total_vendas: vrTotal,
      dinheiro: vrDinheiro,
      cartao: Number(totais?.vr_cartao || 0),
      pix: Number(totais?.vr_pix || 0),
      prazo: Number(totais?.vr_prazo || 0),
      outros: Number(totais?.vr_outros || 0),
      qtd_vendas: Number(totais?.qtd_vendas || 0),
      saldo_esperado_dinheiro: saldoEsperado,
      diferenca_caixa: diferenca
    },
    vendas
  });
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
    `SELECT * FROM mv_caixa WHERE id = ?${tf} LIMIT 1`,
    [req.params.id, ...tp]
  );
  if (!caixaRow) {
    res.status(403).json({ message: 'Caixa não encontrado para esta loja' });
    return;
  }

  const now = new Date();
  const hora = now.toTimeString().slice(0, 8);
  const data = now.toISOString().slice(0, 10);

  // Associa vendas pendentes desta sessão que ainda não tinham id_caixa gravado
  await pool.query(
    `UPDATE mv_vendas
     SET id_caixa = ?
     WHERE tenant_id = ?
       AND id_caixa IS NULL
       AND data_venda >= ?
       AND (
         controle NOT REGEXP '^[0-9]{14}$'
         OR STR_TO_DATE(controle, '%Y%m%d%H%i%s') >= STR_TO_DATE(CONCAT(?, ' ', ?), '%Y-%m-%d %H:%i:%s')
       )`,
    [caixaRow.id, caixaRow.tenant_id, caixaRow.data_abertura, caixaRow.data_abertura, caixaRow.hora_abertura]
  );

  const [[totals]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(vr_total),0) as vr_fechado_turno,
       COALESCE(SUM(vr_dinheiro),0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao),0) as vr_cartao,
       COALESCE(SUM(vr_pix),0) as vr_pix,
       COALESCE(SUM(vr_nota + vr_carne),0) as vr_prazo,
       COALESCE(SUM(vr_ticket),0) as vr_outros,
       COUNT(*) as qtd_vendas
     FROM mv_vendas
     WHERE tenant_id = ?
       AND (
         id_caixa = ?
         OR (
           id_caixa IS NULL
           AND data_venda = ?
           AND turno = ?
           AND terminal = ?
         )
       )`,
    [caixaRow.tenant_id, caixaRow.id, caixaRow.data_abertura, caixaRow.turno, caixaRow.terminal]
  );

  const totalVendas = Number(totals?.vr_fechado_turno || 0);

  await pool.query(
    `UPDATE mv_caixa SET status_caixa='F', hora_fechamento=?, data_fechamento=?,
      vr_fechamento=?, vr_fechado_turno=? WHERE id=? AND tenant_id=?`,
    [hora, data, vr_fechamento, totalVendas, req.params.id, caixaRow.tenant_id]
  );
  res.json({ ok: true, vr_fechado_turno: totalVendas, totais: totals });
});

// ── VENDAS ───────────────────────────────────────────────────────────────────

router.get('/vendas', async (req, res) => {
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = 30;
  const offset = (page - 1) * limit;
  const data  = String(req.query.data ?? new Date().toISOString().slice(0, 10));
  const search = String(req.query.search ?? '');

  const { clause: tenantClause, params: tenantParams } = getErpTenantFilter(req, true, 'v.tenant_id');

  const where = search.length >= 2
    ? 'AND (c.nome_cliente LIKE ? OR v.controle LIKE ?)'
    : '';
  const searchParams: any[] = search.length >= 2
    ? [`%${search}%`, `%${search}%`]
    : [];

  const baseParams = [data, ...tenantParams, ...searchParams];

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.data_venda = ? ${tenantClause} ${where}`,
    baseParams
  );

  const [rows] = await pool.query<any>(
    `SELECT v.id, v.controle, v.data_venda, v.vr_total, v.vr_adicional,
            v.vr_dinheiro, v.vr_cheque, v.vr_cartao, v.vr_carne, v.vr_ticket,
            COALESCE(v.vr_pix, 0) as vr_pix, COALESCE(v.vr_nota, 0) as vr_nota,
            v.em_aberto, v.parcelas, v.id_cliente,
            COALESCE(c.nome_cliente, 'Consumidor') as nome_cliente
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.data_venda = ? ${tenantClause} ${where}
     ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
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
      vr_pix: Number(r.vr_pix ?? 0),
      vr_nota: Number(r.vr_nota ?? 0),
    })),
    total: Number(total),
    pages: Math.ceil(total / limit),
  });
});

router.get('/vendas/:controle', async (req, res) => {
  const [[venda]] = await pool.query<any>(
    `SELECT v.*, COALESCE(c.nome_cliente,'Consumidor') as nome_cliente,
            c.cpf_cnpj, c.telefone, c.celular,
            o.plate as os_plate, o.model as os_model
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     LEFT JOIN os_orders o ON o.venda_controle = v.controle
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
    vr_pix: Number(venda.vr_pix ?? 0),
    vr_nota: Number(venda.vr_nota ?? 0),
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
      vr_pix = 0,
      vr_nota = 0,
      vr_outros = 0,
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
      vr_pix?: number;
      vr_nota?: number;
      vr_outros?: number;
      vr_adicional?: number;
      parcelas?: number;
      id_login?: number;
      terminal?: string;
      turno?: string;
      id_os?: string;
    };

    const itensArray = Array.isArray(itens) ? itens : [];
    const hasItens = itensArray.length > 0;
    const finalVrTicket = Number(vr_ticket || 0) + Number(vr_outros || 0);

    const vr_pagto_total =
      Number(vr_dinheiro || 0) +
      Number(vr_cartao || 0) +
      Number(vr_pix || 0) +
      Number(vr_nota || 0) +
      finalVrTicket +
      Number(vr_cheque || 0) +
      Number(vr_carne || 0);

    if (!hasItens && vr_pagto_total <= 0) {
      res.status(400).json({ message: 'Informe os itens ou um valor de pagamento' });
      return;
    }

    const tenantId = getErpWriteTenantId(req);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const controle = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const data_venda = now.toISOString().slice(0, 10);

    const vr_itens = hasItens ? itensArray.reduce((s, i) => s + i.valor * i.quant, 0) : 0;
    const vr_total = hasItens ? (vr_itens + Number(vr_adicional)) : vr_pagto_total;
    const em_aberto = (vr_nota > 0 || vr_carne > 0) ? 1 : 0;

    // Detect primary payment mode for cod_lancamento mapping
    // 1: Dinheiro, 7: Cartão, 11: PIX/Transferência, 10: Duplicata/Nota, 2: Cheque, 5: Carnê, 8: Outros/Ticket
    const codLancamento =
      vr_pix > 0 ? 11 :
      vr_cartao > 0 ? (vr_cartao === vr_total ? 7 : 1) :
      vr_nota > 0 ? 10 :
      finalVrTicket > 0 ? 8 :
      vr_cheque > 0 ? 2 :
      vr_carne > 0 ? 5 : 1;

    let finalClienteId = Number(id_cliente ?? 0);
    if (finalClienteId === 0 && id_os) {
      const [[osRowForClient]] = await pool.query<any>('SELECT client_id FROM os_orders WHERE id = ?', [id_os]);
      if (osRowForClient?.client_id) {
        finalClienteId = Number(osRowForClient.client_id);
      }
    }

    // Busca o caixa aberto no momento para a loja atual para vincular diretamente
    const [[caixaAberto]] = await pool.query<any>(
      `SELECT id, turno, terminal FROM mv_caixa WHERE status_caixa = 'A' AND tenant_id = ? ORDER BY id DESC LIMIT 1`,
      [tenantId]
    );
    const id_caixa = caixaAberto?.id ?? null;
    const finalTurno = caixaAberto?.turno ?? turno;
    const finalTerminal = caixaAberto?.terminal ?? terminal;

    const [vendaResult] = await pool.query<any>(
      `INSERT INTO mv_vendas
         (controle, data_venda, parcelas, id_cliente, id_cliente_convenio,
          id_login, terminal, turno, vr_total, vr_adicional,
          vr_dinheiro, vr_cheque, vr_cartao, vr_carne, vr_ticket, vr_pix, vr_nota,
          em_aberto, vr_pagto_parcial, cod_lancamento, tenant_id, id_caixa)
       VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
      [controle, data_venda, parcelas, finalClienteId, id_login, finalTerminal, finalTurno,
       vr_total, vr_adicional, vr_dinheiro, vr_cheque, vr_cartao, vr_carne, finalVrTicket, vr_pix, vr_nota,
       em_aberto, codLancamento, tenantId, id_caixa]
    );
    const id_venda = vendaResult.insertId;

    if (hasItens) {
      for (const item of itensArray) {
        const item_total = Number(item.valor) * Number(item.quant);
        await pool.query(
          `INSERT INTO mv_vendas_movimento
             (data_venda, controle, modo_venda, cod_lancamento, id_login,
              id_cliente, id_cliente_convenio, id_produto, id_grade,
              modo_lancamento, terminal, turno, valor, quant, vr_total, vr_cotacao, desconto_total_venda)
           VALUES (?,?,1,?,?,?,0,?,0,0,?,?,?,?,?,1,'N')`,
          [data_venda, controle, codLancamento, id_login, finalClienteId,
           item.id_produto, terminal, turno, item.valor, item.quant, item_total]
        );
        await pool.query(
          `INSERT INTO produto_saldo_tenant (produto_id, tenant_id, saldo)
           SELECT p.id, ?, GREATEST(0, COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) - ?)
           FROM cad_produtos p
           LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
           WHERE p.id = ? AND COALESCE(p.controla_estoque, 1) = 1
           ON DUPLICATE KEY UPDATE saldo = GREATEST(0, produto_saldo_tenant.saldo - ?)`,
          [tenantId, tenantId, item.quant, tenantId, item.id_produto, item.quant]
        );

        if (tenantId === 1) {
          await pool.query(
            'UPDATE cad_produtos SET estoque = GREATEST(0, estoque - ?) WHERE id = ? AND COALESCE(controla_estoque, 1) = 1',
            [item.quant, item.id_produto]
          );
        }
      }
    }

    // Lançamento financeiro
    const hist = hasItens
      ? `VENDA REALIZADA [ ${controle} ]`
      : `VENDA AVULSA [ ${controle} ]`;
    await pool.query(
      `INSERT INTO cad_lancamentos
         (id_planejamento, id_conta, id_modo_lancamento, status_lancamento,
          controle, documento, historico, parcela, data_vencimento,
          vr_parcela, vr_abatimentos, vr_acrescimo, transferido,
          id_cliente, id_venda, data_confirmacao, dias_atraso, tenant_id)
       VALUES (2,1,?,?,?,?,?,1,?,?,0,0,0,?,?,?,0,?)`,
      [codLancamento, em_aberto === 0 ? 1 : 0,
       controle, controle, hist, data_venda,
       vr_total, finalClienteId, id_venda,
       em_aberto === 0 ? data_venda : null, tenantId]
    );

    // Se a venda é de uma OS, sincroniza a OS completamente (itens, total e desconto)
    if (id_os) {
      try {
        const [[osRow]] = await pool.query<any>('SELECT * FROM os_orders WHERE id = ?', [id_os]);
        if (osRow) {
          const prodMo = await getMaoDeObraProduto();
          const [existingOsItems] = await pool.query<any>('SELECT * FROM os_order_items WHERE order_id = ?', [id_os]);

          let osLabor = 0;
          const soldPartProductIds: number[] = [];

          for (const item of itens) {
            const pid = Number(item.id_produto);
            const val = Number(item.valor);
            const qty = Number(item.quant);
            const itemTot = val * qty;

            if (pid === prodMo.id) {
              osLabor += itemTot;
              continue;
            }

            soldPartProductIds.push(pid);

            const existing = (existingOsItems as any[]).find(
              oi => Number(oi.product_id) === pid && oi.type === 'part'
            );

            if (existing) {
              await pool.query(
                'UPDATE os_order_items SET quantity = ?, unit_price = ?, total = ? WHERE id = ?',
                [qty, val, itemTot, existing.id]
              );
            } else {
              // Item novo adicionado pelo operador no PDV (ex: Aromatizante em spray)
              const [[prodInfo]] = await pool.query<any>(
                'SELECT id, nome_produto, cod_barra, unidade, id_tipo FROM cad_produtos WHERE id = ?',
                [pid]
              );
              const newItemId = crypto.randomUUID();
              const pCode = prodInfo?.cod_barra || '';
              const pDesc = prodInfo?.nome_produto || `Item #${pid}`;
              const pType = (prodInfo?.id_tipo === 2 || prodInfo?.id_tipo === 9) ? 'service' : 'part';

              await pool.query(
                `INSERT INTO os_order_items
                   (id, order_id, product_id, code, description, type, quantity, unit_price, labor_price, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
                [newItemId, id_os, pid, pCode, pDesc, pType, qty, val, itemTot]
              );
            }
          }

          // Se peças originais da OS foram removidas no PDV antes da venda, remove de os_order_items
          if (soldPartProductIds.length > 0) {
            const placeholders = soldPartProductIds.map(() => '?').join(',');
            await pool.query(
              `DELETE FROM os_order_items WHERE order_id = ? AND type = 'part' AND product_id NOT IN (${placeholders})`,
              [id_os, ...soldPartProductIds]
            );
          }

          const discountAmount = Number(vr_adicional) < 0 ? Math.abs(Number(vr_adicional)) : 0;
          const finalLabor = osLabor > 0 ? osLabor : Number(osRow.labor_amount ?? 0);

          await pool.query(
            `UPDATE os_orders
             SET venda_controle = ?,
                 status = 'closed',
                 closed_at = COALESCE(closed_at, NOW()),
                 total_amount = ?,
                 labor_amount = ?,
                 discount_amount = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [controle, vr_total, finalLabor, discountAmount, id_os]
          );
        }
      } catch (osSyncErr) {
        console.error('Erro ao sincronizar OS com a venda:', osSyncErr);
      }
    }

    res.status(201).json({ controle, id: id_venda, vr_total });
  } catch (err: any) {
    console.error('POST /erp/vendas error:', err);
    res.status(500).json({ message: err?.message || 'Erro ao processar venda' });
  }
});

// ── CONTAS / FINANCEIRO ──────────────────────────────────────────────────────

router.get('/contas', requireManagerUp, async (req, res) => {
  try {
    const page   = Math.max(1, Number(req.query.page ?? 1));
    const limit  = 50;
    const offset = (page - 1) * limit;
    const statusQ = req.query.status;
    const status = statusQ === '1' || statusQ === 'pago' ? 1 : statusQ === '' || statusQ === 'todos' ? null : 0;
    const search = String(req.query.search ?? '').trim();
    const dataInicio = req.query.data_inicio ? String(req.query.data_inicio).trim() : '';
    const dataFim = req.query.data_fim ? String(req.query.data_fim).trim() : '';
    const formaPagto = req.query.forma_pagto ? String(req.query.forma_pagto).trim().toLowerCase() : '';
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'l.tenant_id');

    const whereParts: string[] = [
      "(pl.plane_tipo = 'E' OR pl.plane_tipo IS NULL OR l.id_venda IS NOT NULL OR l.id_planejamento IN (1, 2, 3))"
    ];
    const params: any[] = [];

    if (tenantCond) {
      whereParts.push(tenantCond);
      params.push(...tenantParams);
    }

    if (status !== null) {
      whereParts.push('l.status_lancamento = ?');
      params.push(status);
    }

    if (search.length > 0) {
      whereParts.push('(c.nome_cliente LIKE ? OR l.historico LIKE ? OR l.controle LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (dataInicio) {
      whereParts.push('l.data_vencimento >= ?');
      params.push(dataInicio);
    }

    if (dataFim) {
      whereParts.push('l.data_vencimento <= ?');
      params.push(dataFim);
    }

    const whereBase = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

    // Agregação geral do período (alimenta os cards de formas de pagamento)
    const [[totaisRow]] = await pool.query<any>(
      `SELECT
         COUNT(*) as total_count,
         COALESCE(SUM(l.vr_parcela - l.vr_abatimentos), 0) as total_valor,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 1 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_recebido,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 0 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_pendente,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 0 AND l.data_vencimento < CURDATE() THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_vencido,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_dinheiro,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento IN (6, 7) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_cartao,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 11 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_pix,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento IN (4, 5, 9, 10) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_nota,
         COALESCE(SUM(CASE WHEN (l.id_modo_lancamento NOT IN (1, 4, 5, 6, 7, 9, 10, 11) OR l.id_modo_lancamento IS NULL) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_outros
       FROM cad_lancamentos l
       LEFT JOIN cad_clientes c ON c.id = l.id_cliente
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       ${whereBase}`,
      params
    );

    // Filtro adicional de forma de pagamento para a listagem
    const whereListParts = [...whereParts];
    const paramsList = [...params];

    if (formaPagto === 'dinheiro') {
      whereListParts.push('l.id_modo_lancamento = 1');
    } else if (formaPagto === 'cartao') {
      whereListParts.push('l.id_modo_lancamento IN (6, 7)');
    } else if (formaPagto === 'pix') {
      whereListParts.push('l.id_modo_lancamento = 11');
    } else if (formaPagto === 'nota') {
      whereListParts.push('l.id_modo_lancamento IN (4, 5, 9, 10)');
    } else if (formaPagto === 'outros') {
      whereListParts.push('(l.id_modo_lancamento NOT IN (1, 4, 5, 6, 7, 9, 10, 11) OR l.id_modo_lancamento IS NULL)');
    }

    const whereList = whereListParts.length ? 'WHERE ' + whereListParts.join(' AND ') : '';

    let totaisKpi = totaisRow;
    if (formaPagto) {
      const [[fRow]] = await pool.query<any>(
        `SELECT
           COUNT(*) as total_count,
           COALESCE(SUM(l.vr_parcela - l.vr_abatimentos), 0) as total_valor,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 1 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_recebido,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 0 THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_pendente,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 0 AND l.data_vencimento < CURDATE() THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_vencido
         FROM cad_lancamentos l
         LEFT JOIN cad_clientes c ON c.id = l.id_cliente
         LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
         ${whereList}`,
        paramsList
      );
      totaisKpi = fRow;
    }

    const [rows] = await pool.query<any>(
      `SELECT l.id, l.controle, l.historico, l.data_vencimento, l.data_confirmacao,
              l.vr_parcela, l.vr_abatimentos, l.status_lancamento,
              l.id_cliente, COALESCE(c.nome_cliente,'Consumidor') as nome_cliente,
              l.id_modo_lancamento,
              m.modo_lancamento
       FROM cad_lancamentos l
       LEFT JOIN cad_clientes c ON c.id = l.id_cliente
       LEFT JOIN cad_modo_lancamento m ON m.id = l.id_modo_lancamento
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       ${whereList}
       ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...paramsList, limit, offset]
    );

    const total = Number(totaisKpi?.total_count ?? 0);

    const FORMAS_MAP: Record<number, string> = {
      1: 'DINHEIRO',
      2: 'CHEQUE',
      4: 'BOLETO',
      5: 'CARNÊ',
      6: 'CARTÃO DÉBITO',
      7: 'CARTÃO CRÉDITO',
      8: 'OUTROS',
      9: 'PROMISSÓRIA',
      10: 'NOTA / A PRAZO',
      11: 'PIX',
    };

    res.json({
      data: rows.map((r: any) => {
        const modoId = Number(r.id_modo_lancamento);
        const modoNome = FORMAS_MAP[modoId] || r.modo_lancamento || '—';
        return {
          ...r,
          status: Number(r.status_lancamento),
          data_lancamento: r.data_vencimento,
          valor: Number(r.vr_parcela) - Number(r.vr_abatimentos),
          vr_parcela: Number(r.vr_parcela),
          vr_abatimentos: Number(r.vr_abatimentos),
          vr_liquido: Number(r.vr_parcela) - Number(r.vr_abatimentos),
          modo_lancamento: modoNome,
        };
      }),
      total,
      pages: Math.ceil(total / limit),
      totais: {
        total: Number(totaisKpi?.total_valor ?? 0),
        total_recebido: Number(totaisKpi?.total_recebido ?? 0),
        total_pendente: Number(totaisKpi?.total_pendente ?? 0),
        total_vencido: Number(totaisKpi?.total_vencido ?? 0),
        por_forma_pagamento: {
          dinheiro: Number(totaisRow?.total_dinheiro ?? 0),
          cartao: Number(totaisRow?.total_cartao ?? 0),
          pix: Number(totaisRow?.total_pix ?? 0),
          nota: Number(totaisRow?.total_nota ?? 0),
          outros: Number(totaisRow?.total_outros ?? 0),
        },
      },
    });
  } catch (err: any) {
    console.error('GET /erp/contas error:', err);
    res.status(500).json({ message: err?.message || 'Erro ao carregar contas' });
  }
});

router.patch('/contas/:id/receber', requireManagerUp, async (req, res) => {
  const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
  const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
  const data_confirmacao = new Date().toISOString().slice(0, 10);
  await pool.query(
    `UPDATE cad_lancamentos SET status_lancamento=1, data_confirmacao=? WHERE id=?${whereTenant}`,
    [data_confirmacao, req.params.id, ...tenantParams]
  );
  res.json({ ok: true });
});

// ── CONTAS A PAGAR ───────────────────────────────────────────────────────────

router.get('/contas-pagar/categorias', requireManagerUp, async (_req, res) => {
  try {
    const [rows] = await pool.query<any>(
      "SELECT id, plane_descricao as nome, plane_cod as codigo FROM cad_planejamento WHERE plane_tipo = 'S' ORDER BY plane_descricao"
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao buscar categorias' });
  }
});

router.get('/fornecedores', requireManagerUp, async (req, res) => {
  try {
    const search = String(req.query.search ?? '').trim();
    let query = 'SELECT id, nome_fornecedor as nome, cpf_cnpj, telefone FROM cad_fornecedores WHERE inativo = 0';
    const params: any[] = [];
    if (search.length > 0) {
      query += ' AND (nome_fornecedor LIKE ? OR cpf_cnpj LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY nome_fornecedor LIMIT 50';
    const [rows] = await pool.query<any>(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao listar fornecedores' });
  }
});

router.get('/contas-pagar', requireManagerUp, async (req, res) => {
  try {
    const page   = Math.max(1, Number(req.query.page ?? 1));
    const limit  = 50;
    const offset = (page - 1) * limit;
    const statusQ = req.query.status;
    const status = statusQ === '1' || statusQ === 'pago' ? 1 : statusQ === '' || statusQ === 'todos' ? null : 0;
    const search = String(req.query.search ?? '').trim();
    const dataInicio = req.query.data_inicio ? String(req.query.data_inicio).trim() : '';
    const dataFim = req.query.data_fim ? String(req.query.data_fim).trim() : '';
    const formaPagto = req.query.forma_pagto ? String(req.query.forma_pagto).trim().toLowerCase() : '';
    const categoriaId = req.query.categoria ? Number(req.query.categoria) : null;
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'l.tenant_id');

    const whereParts: string[] = [
      "(pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14))"
    ];
    const params: any[] = [];

    if (tenantCond) {
      whereParts.push(tenantCond);
      params.push(...tenantParams);
    }

    if (status !== null) {
      whereParts.push('l.status_lancamento = ?');
      params.push(status);
    }

    if (categoriaId) {
      whereParts.push('l.id_planejamento = ?');
      params.push(categoriaId);
    }

    if (search.length > 0) {
      whereParts.push('(l.favorecido LIKE ? OR l.historico LIKE ? OR l.documento LIKE ? OR l.controle LIKE ? OR pl.plane_descricao LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (dataInicio) {
      whereParts.push('l.data_vencimento >= ?');
      params.push(dataInicio);
    }

    if (dataFim) {
      whereParts.push('l.data_vencimento <= ?');
      params.push(dataFim);
    }

    const whereBase = 'WHERE ' + whereParts.join(' AND ');

    // Agregações de totais gerais
    const [[totaisRow]] = await pool.query<any>(
      `SELECT
         COUNT(*) as total_count,
         COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_valor,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 1 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_pago,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 0 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_pendente,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 0 AND l.data_vencimento < CURDATE() THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_vencido,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 4 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0)) ELSE 0 END), 0) as total_boleto,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 11 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0)) ELSE 0 END), 0) as total_pix,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0)) ELSE 0 END), 0) as total_dinheiro,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento IN (6, 7) THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0)) ELSE 0 END), 0) as total_cartao,
         COALESCE(SUM(CASE WHEN (l.id_modo_lancamento NOT IN (1, 4, 6, 7, 11) OR l.id_modo_lancamento IS NULL) THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0)) ELSE 0 END), 0) as total_outros
       FROM cad_lancamentos l
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       ${whereBase}`,
      params
    );

    const whereListParts = [...whereParts];
    const paramsList = [...params];

    if (formaPagto === 'boleto') {
      whereListParts.push('l.id_modo_lancamento = 4');
    } else if (formaPagto === 'pix') {
      whereListParts.push('l.id_modo_lancamento = 11');
    } else if (formaPagto === 'dinheiro') {
      whereListParts.push('l.id_modo_lancamento = 1');
    } else if (formaPagto === 'cartao') {
      whereListParts.push('l.id_modo_lancamento IN (6, 7)');
    } else if (formaPagto === 'outros') {
      whereListParts.push('(l.id_modo_lancamento NOT IN (1, 4, 6, 7, 11) OR l.id_modo_lancamento IS NULL)');
    }

    const whereList = 'WHERE ' + whereListParts.join(' AND ');

    let totaisKpi = totaisRow;
    if (formaPagto) {
      const [[fRow]] = await pool.query<any>(
        `SELECT
           COUNT(*) as total_count,
           COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_valor,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 1 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_pago,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 0 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_pendente,
           COALESCE(SUM(CASE WHEN l.status_lancamento = 0 AND l.data_vencimento < CURDATE() THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as total_vencido
         FROM cad_lancamentos l
         LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
         ${whereList}`,
        paramsList
      );
      totaisKpi = fRow;
    }

    const [rows] = await pool.query<any>(
      `SELECT l.id, l.controle, l.documento, l.historico, l.favorecido,
              l.data_vencimento, l.data_confirmacao,
              l.vr_parcela, l.vr_abatimentos, l.vr_acrescimo, l.status_lancamento,
              l.id_planejamento, pl.plane_descricao as categoria,
              l.id_modo_lancamento, m.modo_lancamento,
              l.parcela
       FROM cad_lancamentos l
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       LEFT JOIN cad_modo_lancamento m ON m.id = l.id_modo_lancamento
       ${whereList}
       ORDER BY l.data_vencimento ASC, l.id DESC LIMIT ? OFFSET ?`,
      [...paramsList, limit, offset]
    );

    const total = Number(totaisKpi?.total_count ?? 0);

    const FORMAS_MAP: Record<number, string> = {
      1: 'DINHEIRO',
      2: 'CHEQUE',
      4: 'BOLETO',
      5: 'CARNÊ',
      6: 'CARTÃO DÉBITO',
      7: 'CARTÃO CRÉDITO',
      8: 'OUTROS',
      9: 'PROMISSÓRIA',
      10: 'DUPLICATA',
      11: 'PIX',
    };

    res.json({
      data: rows.map((r: any) => {
        const modoId = Number(r.id_modo_lancamento);
        const modoNome = FORMAS_MAP[modoId] || r.modo_lancamento || 'BOLETO';
        const valorLiquido = Number(r.vr_parcela || 0) - Number(r.vr_abatimentos || 0) + Number(r.vr_acrescimo || 0);
        return {
          id: r.id,
          controle: r.controle,
          documento: r.documento || '',
          historico: r.historico || '',
          favorecido: r.favorecido || r.historico || 'Fornecedor / Favorecido',
          id_planejamento: r.id_planejamento,
          categoria: r.categoria || 'Despesa Diversa',
          data_vencimento: r.data_vencimento,
          data_pagamento: r.data_confirmacao,
          status: Number(r.status_lancamento),
          valor: valorLiquido,
          vr_parcela: Number(r.vr_parcela),
          vr_abatimentos: Number(r.vr_abatimentos || 0),
          vr_acrescimo: Number(r.vr_acrescimo || 0),
          id_modo_lancamento: modoId,
          modo_lancamento: modoNome,
          parcela: r.parcela || 1,
        };
      }),
      total,
      pages: Math.ceil(total / limit),
      totais: {
        total: Number(totaisKpi?.total_valor ?? 0),
        total_pago: Number(totaisKpi?.total_pago ?? 0),
        total_pendente: Number(totaisKpi?.total_pendente ?? 0),
        total_vencido: Number(totaisKpi?.total_vencido ?? 0),
        por_forma_pagamento: {
          boleto: Number(totaisRow?.total_boleto ?? 0),
          pix: Number(totaisRow?.total_pix ?? 0),
          dinheiro: Number(totaisRow?.total_dinheiro ?? 0),
          cartao: Number(totaisRow?.total_cartao ?? 0),
          outros: Number(totaisRow?.total_outros ?? 0),
        },
      },
    });
  } catch (err: any) {
    console.error('GET /erp/contas-pagar error:', err);
    res.status(500).json({ message: err?.message || 'Erro ao carregar contas a pagar' });
  }
});

router.post('/contas-pagar', requireManagerUp, async (req, res) => {
  try {
    const {
      descricao,
      valor,
      data_vencimento,
      id_planejamento = 4,
      id_modo_lancamento = 4,
      favorecido = '',
      documento = '',
      parcelas = 1,
      pago_agora = false,
      data_pagamento,
    } = req.body;

    const valNum = Number(valor);
    if (!descricao || !data_vencimento || isNaN(valNum) || valNum <= 0) {
      res.status(400).json({ message: 'Descrição, valor e data de vencimento são obrigatórios.' });
      return;
    }

    const tenantId = getErpWriteTenantId(req);
    const numParcelas = Math.max(1, Math.min(60, Number(parcelas || 1)));
    const valorParcela = Number((valNum / numParcelas).toFixed(2));
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const baseCtrl = `CP${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // Base date
    const [y, m, d] = String(data_vencimento).slice(0, 10).split('-').map(Number);

    for (let p = 1; p <= numParcelas; p++) {
      const due = new Date(y, (m - 1) + (p - 1), d);
      const dueStr = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
      const ctrl = numParcelas > 1 ? `${baseCtrl}_${p}` : baseCtrl;
      const hist = numParcelas > 1 ? `${descricao} (${p}/${numParcelas})` : descricao;
      const isPago = p === 1 && Boolean(pago_agora);
      const dataConf = isPago ? (data_pagamento || dueStr) : null;

      await pool.query(
        `INSERT INTO cad_lancamentos
           (id_planejamento, id_conta, id_modo_lancamento, status_lancamento,
            controle, documento, historico, favorecido, parcela, data_vencimento,
            vr_parcela, vr_abatimentos, vr_acrescimo, transferido,
            id_cliente, data_confirmacao, dias_atraso, tenant_id)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 0, ?)`,
        [
          Number(id_planejamento || 4),
          Number(id_modo_lancamento || 4),
          isPago ? 1 : 0,
          ctrl,
          documento || ctrl,
          hist,
          favorecido || descricao,
          p,
          dueStr,
          valorParcela,
          dataConf,
          tenantId
        ]
      );
    }

    res.json({ ok: true, parcelas: numParcelas });
  } catch (err: any) {
    console.error('POST /erp/contas-pagar error:', err);
    res.status(500).json({ message: err?.message || 'Erro ao criar conta a pagar' });
  }
});

router.patch('/contas-pagar/:id/pagar', requireManagerUp, async (req, res) => {
  try {
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
    const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
    const dataConfirmacao = req.body.data_pagamento || new Date().toISOString().slice(0, 10);
    const modoId = req.body.id_modo_lancamento ? Number(req.body.id_modo_lancamento) : null;

    if (modoId) {
      await pool.query(
        `UPDATE cad_lancamentos SET status_lancamento=1, data_confirmacao=?, id_modo_lancamento=? WHERE id=?${whereTenant}`,
        [dataConfirmacao, modoId, req.params.id, ...tenantParams]
      );
    } else {
      await pool.query(
        `UPDATE cad_lancamentos SET status_lancamento=1, data_confirmacao=? WHERE id=?${whereTenant}`,
        [dataConfirmacao, req.params.id, ...tenantParams]
      );
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao baixar conta a pagar' });
  }
});

router.patch('/contas-pagar/:id/estornar', requireManagerUp, async (req, res) => {
  try {
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
    const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
    await pool.query(
      `UPDATE cad_lancamentos SET status_lancamento=0, data_confirmacao=NULL WHERE id=?${whereTenant}`,
      [req.params.id, ...tenantParams]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao estornar conta a pagar' });
  }
});

router.put('/contas-pagar/:id', requireManagerUp, async (req, res) => {
  try {
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
    const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
    const {
      descricao,
      valor,
      data_vencimento,
      id_planejamento,
      id_modo_lancamento,
      favorecido,
      documento,
    } = req.body;

    await pool.query(
      `UPDATE cad_lancamentos SET
         historico = COALESCE(?, historico),
         vr_parcela = COALESCE(?, vr_parcela),
         data_vencimento = COALESCE(?, data_vencimento),
         id_planejamento = COALESCE(?, id_planejamento),
         id_modo_lancamento = COALESCE(?, id_modo_lancamento),
         favorecido = COALESCE(?, favorecido),
         documento = COALESCE(?, documento)
       WHERE id = ?${whereTenant}`,
      [
        descricao,
        valor ? Number(valor) : null,
        data_vencimento,
        id_planejamento ? Number(id_planejamento) : null,
        id_modo_lancamento ? Number(id_modo_lancamento) : null,
        favorecido,
        documento,
        req.params.id,
        ...tenantParams
      ]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao atualizar conta a pagar' });
  }
});

router.delete('/contas-pagar/:id', requireManagerUp, async (req, res) => {
  try {
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
    const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
    await pool.query(`DELETE FROM cad_lancamentos WHERE id = ?${whereTenant}`, [req.params.id, ...tenantParams]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao excluir conta a pagar' });
  }
});

// ── BUSCA RÁPIDA (PDV) ───────────────────────────────────────────────────────

router.get('/busca/produtos', async (req, res) => {
  const q = String(req.query.q ?? '');
  if (q.length < 2) { res.json([]); return; }
  const tenantId = getErpWriteTenantId(req);

  const [rows] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, p.cod_barra, p.unidade, p.vr_venda,
            COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS estoque,
            COALESCE(p.controla_estoque, 1) AS controla_estoque,
            CASE WHEN p.id_tipo IN (2, 9) THEN 1 ELSE 0 END AS is_service
     FROM cad_produtos p
     LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
     WHERE p.inativo = 0 AND (p.nome_produto LIKE ? OR p.cod_barra LIKE ?)
     ORDER BY p.nome_produto LIMIT 20`,
    [tenantId, tenantId, `%${q}%`, `%${q}%`]
  );
  res.json(rows.map((r: any) => ({
    ...r,
    vr_venda: Number(r.vr_venda),
    estoque: Number(r.estoque),
    controla_estoque: Number(r.controla_estoque ?? 1),
    is_service: Boolean(r.is_service),
  })));
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

const PLATE_RE = /\b([A-Z]{3})[\-\s]?([0-9][A-Z0-9][0-9]{2})\b/i;

function extractPlate(nome: string): string | null {
  const m = String(nome || '').match(PLATE_RE);
  if (!m) return null;
  return (m[1] + m[2]).toUpperCase();
}

function stripPlate(nome: string): string {
  return String(nome || '').replace(PLATE_RE, '').replace(/\s+/g, ' ').trim();
}

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
    const { clause: tenantClause, params: tenantParams } = getErpTenantFilter(req, true, 'o.tenant_id');

    const whereParts: string[] = ["o.status = 'closed'"];
    const params: any[] = [];

    if (search.length >= 2) {
      const clean = search.replace(/[-\s]/g, '').toUpperCase();
      whereParts.push(`(
        REPLACE(REPLACE(UPPER(o.plate), '-', ''), ' ', '') LIKE ?
        OR o.model LIKE ?
        OR o.id LIKE ?
        OR UPPER(COALESCE(o.client_name, '')) LIKE ?
        OR COALESCE(o.client_phone, '') LIKE ?
      )`);
      params.push(`%${clean}%`, `%${search}%`, `%${search}%`, `%${search.toUpperCase()}%`, `%${search}%`);
    }

    if (apenasPendentes) {
      whereParts.push('o.venda_controle IS NULL');
    }

    const whereStr = 'WHERE ' + whereParts.join(' AND ') + tenantClause;
    const sql = `
      SELECT o.id, o.plate, o.model, o.mileage, o.status,
             o.total_amount,
             o.discount_amount,
             o.labor_amount, o.created_at, o.updated_at, o.closed_at,
             o.venda_controle,
             o.client_id, o.client_name, o.client_phone, o.client_document,
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
      discountAmount: Number(r.discount_amount ?? 0),
      laborAmount: Number(r.labor_amount ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      closedAt: r.closed_at,
      vendaControle: r.venda_controle ?? null,
      totalItens: Number(r.total_itens ?? 0),
      client: {
        id: r.client_id ? Number(r.client_id) : null,
        name: r.client_name || '',
        phone: r.client_phone || '',
        document: r.client_document || null,
      },
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
    const orderTenantId = Number(order.tenant_id || 1);
    const [rawItems] = await pool.query<any>(
      `SELECT oi.*, p.unidade,
              COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS estoque,
              COALESCE(p.controla_estoque, 1) AS controla_estoque,
              CASE WHEN oi.type = 'service' OR p.id_tipo IN (2, 9) THEN 1 ELSE 0 END AS is_service,
              p.cod_barra AS prod_cod_barra
       FROM os_order_items oi
       LEFT JOIN cad_produtos p ON p.id = oi.product_id
       LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
       WHERE oi.order_id = ?
       ORDER BY oi.created_at`,
      [orderTenantId, orderTenantId, order.id]
    );

    // Resolve dados do cliente prioritariamente da OS e cad_clientes
    let cliente: any = null;

    if (order.client_id) {
      const [[cRow]] = await pool.query<any>(
        'SELECT id, nome_cliente, cpf_cnpj, telefone, celular FROM cad_clientes WHERE id = ?',
        [order.client_id]
      );
      if (cRow) {
        cliente = {
          id: Number(cRow.id),
          nome_cliente: order.client_name || stripPlate(cRow.nome_cliente) || cRow.nome_cliente,
          cpf_cnpj: cRow.cpf_cnpj || order.client_document || '',
          telefone: cRow.telefone || order.client_phone || '',
          celular: cRow.celular || order.client_phone || '',
        };
      }
    }

    if (!cliente && (order.client_name || order.client_phone)) {
      cliente = {
        id: 0,
        nome_cliente: order.client_name || 'Cliente',
        cpf_cnpj: order.client_document || '',
        telefone: order.client_phone || '',
        celular: order.client_phone || '',
      };
    }

    if (!cliente) {
      // Fallback: tenta encontrar cliente pela placa no cadastro (somente placa válida completa de 7 caracteres)
      const cleanPlate = order.plate.replace(/[-\s]/g, '').toUpperCase();
      if (cleanPlate.length === 7 && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleanPlate)) {
        const [[cRow]] = await pool.query<any>(
          `SELECT id, nome_cliente, cpf_cnpj, telefone, celular
           FROM cad_clientes
           WHERE inativo = 0 AND (
             REPLACE(REPLACE(UPPER(nome_cliente), '-', ''), ' ', '') LIKE ?
           )
           LIMIT 1`,
          [`%${cleanPlate}%`]
        );
        if (cRow) {
          cliente = {
            id: Number(cRow.id),
            nome_cliente: stripPlate(cRow.nome_cliente) || cRow.nome_cliente,
            cpf_cnpj: cRow.cpf_cnpj ?? '',
            telefone: cRow.telefone ?? '',
            celular: cRow.celular ?? '',
          };
        }
      }
    }

    // Formata itens para o PDV
    const itensPdv: any[] = [];
    let totalLabor = 0;

    for (const item of rawItems) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const lp = Number(item.labor_price ?? 0);
      totalLabor += lp;

      const isService = Boolean(item.is_service || item.type === 'service');
      const controlaEstoque = Number(item.controla_estoque ?? 1);

      itensPdv.push({
        produto: {
          id: Number(item.product_id),
          nome_produto: item.description,
          cod_barra: item.code || item.prod_cod_barra || '',
          unidade: item.unidade || 'UN',
          vr_venda: unitPrice,
          estoque: Number(item.estoque ?? 0),
          is_service: isService,
          controla_estoque: isService ? 0 : controlaEstoque,
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
          is_service: true,
          controla_estoque: 0,
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
        discountAmount: Number(order.discount_amount ?? 0),
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

  const saldoExpr = `COALESCE(pst.saldo, IF(? = 1, p.estoque, 0))`;

  // Para lojas novas (tenant != 1), só exibe produtos que já têm linha em produto_saldo_tenant
  const whereParts: string[] = ['p.inativo = 0', '(? = 1 OR pst.produto_id IS NOT NULL)'];
  const whereParams: any[] = [tenantId];

  if (search.length > 0) {
    whereParts.push('(p.nome_produto LIKE ? OR p.cod_barra LIKE ?)');
    whereParams.push(`%${search}%`, `%${search}%`);
  }

  if (filtro === 'baixo') {
    whereParts.push(`${saldoExpr} <= p.min_estoque AND p.min_estoque > 0 AND COALESCE(p.controla_estoque, 1) = 1`);
    whereParams.push(tenantId);
  } else if (filtro === 'zerado') {
    whereParts.push(`${saldoExpr} <= 0 AND COALESCE(p.controla_estoque, 1) = 1`);
    whereParams.push(tenantId);
  }

  const where = 'WHERE ' + whereParts.join(' AND ');

  const fromJoin = `
    FROM cad_produtos p
    LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
    ${where}`;

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total ${fromJoin}`,
    [tenantId, ...whereParams]
  );

  const [rows] = await pool.query<any>(
    `SELECT p.id, p.nome_produto, p.cod_barra, p.unidade,
            ${saldoExpr} AS estoque,
            COALESCE(p.controla_estoque, 1) AS controla_estoque,
            p.min_estoque, p.vr_compra, p.vr_venda
     ${fromJoin}
     ORDER BY p.nome_produto LIMIT ? OFFSET ?`,
    [tenantId, tenantId, ...whereParams, limit, offset]
  );

  res.json({
    data: rows.map((r: any) => ({
      ...r,
      grupo: '',
      estoque: Number(r.estoque),
      controla_estoque: Number(r.controla_estoque ?? 1),
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

  if (tenantId === 1) {
    await pool.query('UPDATE cad_produtos SET estoque = ? WHERE id = ?', [novoSaldo, prodId]);
  }

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

  if (tenantId === 1) {
    const prodIds = insertRows.map(r => r[0]);
    await pool.query(
      `UPDATE cad_produtos p
       JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = 1
       SET p.estoque = pst.saldo
       WHERE p.id IN (?)`,
      [prodIds]
    );
  }

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
