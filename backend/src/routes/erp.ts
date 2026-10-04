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
    `SELECT COUNT(*) as count_vendas, COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)),0) as total_dia
     FROM mv_vendas WHERE data_venda = CURDATE()${vClause}`,
    vParams
  );
  const [[semana]] = await pool.query<any>(
    `SELECT COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)),0) as total_semana
     FROM mv_vendas WHERE data_venda >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)${vClause}`,
    vParams
  );
  const [[mes]] = await pool.query<any>(
    `SELECT COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)),0) as total_mes
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
  try {
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
      whereParts.push('(c.data_abertura >= ? OR DATE(c.data_abertura) >= ?)');
      params.push(dataInicio, dataInicio);
    }

    if (dataFim) {
      whereParts.push("(c.data_abertura <= ? OR c.data_abertura <= CONCAT(?, ' 23:59:59'))");
      params.push(dataFim, dataFim);
    }

    if (formaPagto === 'dinheiro') {
      whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)) AND COALESCE(v.vr_dinheiro, 0) > 0)');
    } else if (formaPagto === 'cartao') {
      whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)) AND COALESCE(v.vr_cartao, 0) > 0)');
    } else if (formaPagto === 'pix') {
      whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)) AND COALESCE(v.vr_pix, 0) > 0)');
    } else if (formaPagto === 'prazo') {
      whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)) AND (COALESCE(v.vr_nota, 0) > 0 OR COALESCE(v.vr_carne, 0) > 0))');
    } else if (formaPagto === 'outros') {
      whereParts.push('EXISTS (SELECT 1 FROM mv_vendas v WHERE v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)) AND COALESCE(v.vr_ticket, 0) > 0)');
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
    const sessionExpensesMap: Record<number, any> = {};

    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const [breakdowns] = await pool.query<any>(
        `SELECT 
           c.id as id_caixa,
           COALESCE(SUM(COALESCE(v.vr_dinheiro, 0) + COALESCE(v.vr_cartao, 0) + COALESCE(v.vr_pix, 0) + COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0)), 0) as vr_total,
           COALESCE(SUM(v.vr_dinheiro), 0) as vr_dinheiro,
           COALESCE(SUM(v.vr_cartao), 0) as vr_cartao,
           COALESCE(SUM(v.vr_pix), 0) as vr_pix,
           COALESCE(SUM(COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0)), 0) as vr_prazo,
           COALESCE(SUM(COALESCE(v.vr_ticket, 0)), 0) as vr_outros,
           COUNT(v.id) as qtd_vendas
         FROM mv_caixa c
         LEFT JOIN mv_vendas v ON (v.tenant_id = c.tenant_id AND (v.id_caixa = c.id OR (v.id_caixa IS NULL AND v.data_venda = c.data_abertura)))
         WHERE c.id IN (${placeholders})
         GROUP BY c.id`,
        sessionIds
      );

      for (const b of breakdowns) {
        sessionBreakdownMap[b.id_caixa] = b;
      }

      // Agrega despesas (contas a pagar quitadas) na data da abertura da sessão de caixa
      const [despesasRows] = await pool.query<any>(
        `SELECT 
           c.id as id_caixa,
           COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
           COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 OR l.id_caixa = c.id THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
           COUNT(l.id) as qtd_despesas
         FROM mv_caixa c
         LEFT JOIN cad_lancamentos l ON (
           l.tenant_id = c.tenant_id
           AND l.status_lancamento = 1
           AND (
             l.id_caixa = c.id
             OR (
               l.id_caixa IS NULL
               AND (COALESCE(l.data_confirmacao, l.data_vencimento) = c.data_abertura OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) = DATE(c.data_abertura))
               AND (
                 c.status_caixa = 'A'
                 OR NOT EXISTS (
                   SELECT 1 FROM mv_caixa c_prev
                   WHERE c_prev.tenant_id = c.tenant_id
                     AND c_prev.data_abertura = c.data_abertura
                     AND c_prev.id < c.id
                 )
               )
             )
           )
         )
         LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
         WHERE c.id IN (${placeholders})
           AND (l.id IS NULL OR (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0))
         GROUP BY c.id`,
        sessionIds
      );

      for (const d of despesasRows) {
        sessionExpensesMap[d.id_caixa] = d;
      }
    }

    const enrichedRows = rows.map((c: any) => {
      const s = sessionBreakdownMap[c.id];
      const d = sessionExpensesMap[c.id];
      const totalVendas = Number(s?.vr_total || c.vr_fechado_turno || 0);
      const totalDespesas = Number(d?.total_despesas || 0);
      const despesasDinheiro = Number(d?.despesas_dinheiro || 0);
      const valorDespesasCaixa = despesasDinheiro > 0 ? despesasDinheiro : totalDespesas;
      const vrDinheiro = Number(s?.vr_dinheiro || 0);
      const vrCartao = Number(s?.vr_cartao || 0);
      const vrPix = Number(s?.vr_pix || 0);
      const vrPrazo = Number(s?.vr_prazo || 0);
      const vrOutros = Number(s?.vr_outros || 0);
      const vrAbertura = Number(c.vr_abertura || 0);
      const vrFechamento = Number(c.vr_fechamento || 0);
      const saldoEsperado = Math.max(0, vrAbertura + vrDinheiro - valorDespesasCaixa);
      const saldoLiquido = totalVendas - totalDespesas;
      const diferenca = c.status_caixa === 'F' && c.vr_fechamento !== null ? (vrFechamento - saldoEsperado) : 0;

      return {
        ...c,
        vr_fechado_turno: totalVendas,
        total_despesas: totalDespesas,
        despesas_dinheiro: valorDespesasCaixa,
        saldo_liquido: saldoLiquido,
        saldo_esperado_dinheiro: saldoEsperado,
        diferenca_caixa: diferenca,
        totais_por_forma: {
          dinheiro: vrDinheiro,
          cartao: vrCartao,
          pix: vrPix,
          prazo: vrPrazo,
          outros: vrOutros,
          total_vendas: totalVendas,
          total_despesas: totalDespesas,
          despesas_dinheiro: valorDespesasCaixa,
          saldo_liquido: saldoLiquido,
          qtd_vendas: Number(s?.qtd_vendas || 0),
          qtd_despesas: Number(d?.qtd_despesas || 0),
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
      vWhereParts.push('(v.data_venda >= ? OR DATE(v.data_venda) >= ?)');
      vParams.push(dataInicio, dataInicio);
    }
    if (dataFim) {
      vWhereParts.push("(v.data_venda <= ? OR v.data_venda <= CONCAT(?, ' 23:59:59'))");
      vParams.push(dataFim, dataFim);
    }
    const vWhereSql = vWhereParts.length ? 'WHERE ' + vWhereParts.join(' AND ') : '';

    const [[totaisVendas]] = await pool.query<any>(
      `SELECT 
         COALESCE(SUM(COALESCE(v.vr_dinheiro, 0) + COALESCE(v.vr_cartao, 0) + COALESCE(v.vr_pix, 0) + COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0)), 0) as total_vendas,
         COALESCE(SUM(v.vr_dinheiro), 0) as dinheiro,
         COALESCE(SUM(v.vr_cartao), 0) as cartao,
         COALESCE(SUM(v.vr_pix), 0) as pix,
         COALESCE(SUM(COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0)), 0) as prazo,
         COALESCE(SUM(COALESCE(v.vr_ticket, 0)), 0) as outros,
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
      cWhereParts.push('(c.data_abertura >= ? OR DATE(c.data_abertura) >= ?)');
      cParams.push(dataInicio, dataInicio);
    }
    if (dataFim) {
      cWhereParts.push("(c.data_abertura <= ? OR c.data_abertura <= CONCAT(?, ' 23:59:59'))");
      cParams.push(dataFim, dataFim);
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

    // Agrega despesas do período (contas a pagar quitadas)
    const { condition: dTenantCond, params: dTenantParams } = getErpTenantCondition(req, 'l.tenant_id');
    const dWhereParts: string[] = [
      'l.status_lancamento = 1',
      "(pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14))"
    ];
    const dParams: any[] = [];
    if (dTenantCond) {
      dWhereParts.push(dTenantCond);
      dParams.push(...dTenantParams);
    }
    if (dataInicio) {
      dWhereParts.push('(COALESCE(l.data_confirmacao, l.data_vencimento) >= ? OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) >= ?)');
      dParams.push(dataInicio, dataInicio);
    }
    if (dataFim) {
      dWhereParts.push("(COALESCE(l.data_confirmacao, l.data_vencimento) <= ? OR COALESCE(l.data_confirmacao, l.data_vencimento) <= CONCAT(?, ' 23:59:59'))");
      dParams.push(dataFim, dataFim);
    }
    const dWhereSql = 'WHERE ' + dWhereParts.join(' AND ');

    const [[totaisDespesasPeriodo]] = await pool.query<any>(
      `SELECT 
         COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 OR l.id_caixa = ? THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
         COUNT(l.id) as qtd_despesas
       FROM cad_lancamentos l
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       ${dWhereSql}`,
      dParams
    );

    const totalVendasPeriodo = Number(totaisVendas?.total_vendas || 0);
    const totalDespesasPeriodo = Number(totaisDespesasPeriodo?.total_despesas || 0);
    const despesasDinheiroPeriodo = Number(totaisDespesasPeriodo?.despesas_dinheiro || 0);
    const saldoLiquidoPeriodo = totalVendasPeriodo - totalDespesasPeriodo;

    res.json({
      data: enrichedRows,
      total: Number(total),
      pages: Math.ceil(total / limit),
      totais: {
        total_vendas: totalVendasPeriodo,
        total_despesas: totalDespesasPeriodo,
        despesas_dinheiro: despesasDinheiroPeriodo,
        saldo_liquido: saldoLiquidoPeriodo,
        dinheiro: Number(totaisVendas?.dinheiro || 0),
        cartao: Number(totaisVendas?.cartao || 0),
        pix: Number(totaisVendas?.pix || 0),
        prazo: Number(totaisVendas?.prazo || 0),
        outros: Number(totaisVendas?.outros || 0),
        total_fundo: Number(totaisCaixas?.total_fundo || 0),
        total_conferido: Number(totaisCaixas?.total_conferido || 0),
        qtd_vendas: Number(totaisVendas?.qtd_vendas || 0),
        qtd_despesas: Number(totaisDespesasPeriodo?.qtd_despesas || 0),
        qtd_sessoes: Number(totaisCaixas?.qtd_sessoes || 0),
        valor_filtrado: valorFiltrado,
      }
    });
  } catch (err) {
    console.error('[caixa] Erro ao listar sessões de caixa:', err);
    res.status(500).json({ error: 'Erro ao listar sessões de caixa', details: String(err) });
  }
});

router.get('/caixa/vendas', async (req, res) => {
  try {
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
      whereParts.push('(v.data_venda >= ? OR DATE(v.data_venda) >= ?)');
      params.push(dataInicio, dataInicio);
    }
    if (dataFim) {
      whereParts.push("(v.data_venda <= ? OR v.data_venda <= CONCAT(?, ' 23:59:59'))");
      params.push(dataFim, dataFim);
    }
    if (search.length >= 2) {
      whereParts.push('(c.nome_cliente LIKE ? OR v.controle LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (formaPagto === 'dinheiro') {
      whereParts.push('COALESCE(v.vr_dinheiro, 0) > 0');
    } else if (formaPagto === 'cartao') {
      whereParts.push('COALESCE(v.vr_cartao, 0) > 0');
    } else if (formaPagto === 'pix') {
      whereParts.push('COALESCE(v.vr_pix, 0) > 0');
    } else if (formaPagto === 'prazo') {
      whereParts.push('(COALESCE(v.vr_nota, 0) > 0 OR COALESCE(v.vr_carne, 0) > 0)');
    } else if (formaPagto === 'outros') {
      whereParts.push('COALESCE(v.vr_ticket, 0) > 0');
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
              v.vr_dinheiro, v.vr_cartao, v.vr_pix, v.vr_nota, v.vr_carne, v.vr_ticket,
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
        vr_total: Number(r.vr_total || 0),
        vr_dinheiro: Number(r.vr_dinheiro || 0),
        vr_cartao: Number(r.vr_cartao || 0),
        vr_pix: Number(r.vr_pix || 0),
        vr_prazo: Number(r.vr_nota || 0) + Number(r.vr_carne || 0),
        vr_outros: Number(r.vr_ticket || 0),
      })),
      total: Number(total),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[caixa/vendas] Erro ao listar vendas:', err);
    res.status(500).json({ error: 'Erro ao listar movimentações de vendas', details: String(err) });
  }
});

router.get('/caixa/status', async (req, res) => {
  const { clause: tf, params: tp } = getErpTenantFilter(req, true);
  const [[row]] = await pool.query<any>(
    `SELECT * FROM mv_caixa WHERE status_caixa = 'A'${tf} ORDER BY id DESC LIMIT 1`,
    tp
  );

  const [[ultimoCaixa]] = await pool.query<any>(
    `SELECT id, data_fechamento, hora_fechamento, vr_fechamento, vr_fechado_turno
     FROM mv_caixa
     WHERE status_caixa = 'F' ${tf}
     ORDER BY id DESC LIMIT 1`,
    tp
  );

  const ultimoFechamento = ultimoCaixa ? {
    id: Number(ultimoCaixa.id),
    data_fechamento: ultimoCaixa.data_fechamento,
    hora_fechamento: ultimoCaixa.hora_fechamento,
    vr_fechamento: Number(ultimoCaixa.vr_fechamento || 0),
    vr_fechado_turno: Number(ultimoCaixa.vr_fechado_turno || 0),
  } : null;

  if (!row) {
    res.json({
      aberto: false,
      ultimo_caixa_fechado: ultimoFechamento,
    });
    return;
  }

  // Calcula vendas acumuladas em tempo real da sessão do caixa aberto com isolamento estrito por loja
  const [[totais]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as vr_total,
       COALESCE(SUM(vr_dinheiro), 0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao), 0) as vr_cartao,
       COALESCE(SUM(vr_pix), 0) as vr_pix,
       COALESCE(SUM(COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as vr_prazo,
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

  // Lista de transações PIX discriminadas
  const [pixRows] = await pool.query<any>(
    `SELECT v.controle, v.data_venda, v.vr_pix, v.vr_total,
            COALESCE(c.nome_cliente, 'Cliente Balcão') as nome_cliente,
            c.inf_adicional as modelo
     FROM mv_vendas v
     LEFT JOIN cad_clientes c ON c.id = v.id_cliente
     WHERE v.tenant_id = ?
       AND v.vr_pix > 0
       AND (
         v.id_caixa = ?
         OR (
           v.id_caixa IS NULL 
           AND v.data_venda >= ?
           AND (
             v.controle NOT REGEXP '^[0-9]{14}$'
             OR STR_TO_DATE(controle, '%Y%m%d%H%i%s') >= STR_TO_DATE(CONCAT(?, ' ', ?), '%Y-%m-%d %H:%i:%s')
           )
         )
       )
     ORDER BY v.data_venda DESC, v.controle DESC`,
    [row.tenant_id, row.id, row.data_abertura, row.data_abertura, row.hora_abertura]
  );

  // Associa proativamente despesas quitadas desta loja que ainda não tinham id_caixa gravado
  await pool.query(
    `UPDATE cad_lancamentos
     SET id_caixa = ?,
         tenant_id = COALESCE(tenant_id, ?)
     WHERE (tenant_id = ? OR tenant_id IS NULL)
       AND status_lancamento = 1
       AND id_caixa IS NULL
       AND (COALESCE(data_confirmacao, data_vencimento) = ? OR DATE(COALESCE(data_confirmacao, data_vencimento)) = DATE(?))`,
    [row.id, row.tenant_id, row.tenant_id, row.data_abertura, row.data_abertura]
  );

  // Agrega despesas (contas a pagar quitadas) vinculadas exclusivamente à sessão de caixa atual
  const [[despesasStatus]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
       COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 OR l.id_caixa = ? THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
       COUNT(l.id) as qtd_despesas
     FROM cad_lancamentos l
     LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
     WHERE l.status_lancamento = 1
       AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0)
       AND (
         l.id_caixa = ?
         OR (
           (l.tenant_id = ? OR l.tenant_id IS NULL)
           AND l.id_caixa IS NULL
           AND (COALESCE(l.data_confirmacao, l.data_vencimento) = ? OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) = DATE(?))
         )
       )`,
    [row.id, row.id, row.tenant_id, row.data_abertura, row.data_abertura]
  );

  const vrTotal = Number(totais?.vr_total || 0);
  const vrDinheiro = Number(totais?.vr_dinheiro || 0);
  const vrAbertura = Number(row.vr_abertura || 0);
  const totalDespesas = Number(despesasStatus?.total_despesas || 0);
  const despesasDinheiro = Number(despesasStatus?.despesas_dinheiro || 0);
  const valorDespesasCaixa = despesasDinheiro > 0 ? despesasDinheiro : totalDespesas;
  const saldoEsperado = Math.max(0, vrAbertura + vrDinheiro - valorDespesasCaixa);
  const saldoLiquido = vrTotal - totalDespesas;

  res.json({
    ...row,
    aberto: true,
    ultimo_caixa_fechado: ultimoFechamento,
    lista_pix: (pixRows as any[]).map((p: any) => ({
      controle: p.controle,
      data_venda: p.data_venda,
      vr_pix: Number(p.vr_pix || 0),
      vr_total: Number(p.vr_total || 0),
      nome_cliente: p.nome_cliente,
      modelo: p.modelo || null,
    })),
    vr_fechado_turno: vrTotal,
    total_despesas: totalDespesas,
    despesas_dinheiro: valorDespesasCaixa,
    saldo_liquido: saldoLiquido,
    saldo_esperado_dinheiro: saldoEsperado,
    totais_por_forma: {
      dinheiro: vrDinheiro,
      cartao: Number(totais?.vr_cartao || 0),
      pix: Number(totais?.vr_pix || 0),
      prazo: Number(totais?.vr_prazo || 0),
      outros: Number(totais?.vr_outros || 0),
      total_vendas: vrTotal,
      total_despesas: totalDespesas,
      despesas_dinheiro: valorDespesasCaixa,
      saldo_liquido: saldoLiquido,
      qtd_vendas: Number(totais?.qtd_vendas || 0),
      qtd_despesas: Number(despesasStatus?.qtd_despesas || 0),
      saldo_esperado_dinheiro: saldoEsperado,
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
       COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as vr_total,
       COALESCE(SUM(vr_dinheiro), 0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao), 0) as vr_cartao,
       COALESCE(SUM(vr_pix), 0) as vr_pix,
       COALESCE(SUM(COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as vr_prazo,
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

  if (caixa.status_caixa === 'A') {
    await pool.query(
      `UPDATE cad_lancamentos
       SET id_caixa = ?,
           tenant_id = COALESCE(tenant_id, ?)
       WHERE (tenant_id = ? OR tenant_id IS NULL)
         AND status_lancamento = 1
         AND id_caixa IS NULL
         AND (COALESCE(data_confirmacao, data_vencimento) = ? OR DATE(COALESCE(data_confirmacao, data_vencimento)) = DATE(?))`,
      [caixa.id, caixa.tenant_id, caixa.tenant_id, caixa.data_abertura, caixa.data_abertura]
    );
  }

  const [[despesasDetalhes]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
       COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 OR l.id_caixa = ? THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
       COUNT(l.id) as qtd_despesas
     FROM cad_lancamentos l
     LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
     WHERE l.status_lancamento = 1
       AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0)
       AND (
         l.id_caixa = ?
         OR (
           (l.tenant_id = ? OR l.tenant_id IS NULL)
           AND l.id_caixa IS NULL
           AND (COALESCE(l.data_confirmacao, l.data_vencimento) = ? OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) = DATE(?))
           AND (
             caixa.status_caixa = 'A'
             OR NOT EXISTS (
               SELECT 1 FROM mv_caixa c_prev
               WHERE c_prev.tenant_id = ?
                 AND c_prev.data_abertura = ?
                 AND c_prev.id < ?
             )
           )
         )
       )`,
    [caixa.id, caixa.id, caixa.tenant_id, caixa.data_abertura, caixa.data_abertura, caixa.tenant_id, caixa.data_abertura, caixa.id]
  );

  const [despesasRows] = await pool.query<any>(
    `SELECT l.id, l.documento, l.historico, l.favorecido,
            COALESCE(l.data_confirmacao, l.data_vencimento) as data_pagamento,
            (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) as valor,
            l.id_modo_lancamento, m.modo_lancamento
     FROM cad_lancamentos l
     LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
     LEFT JOIN cad_modo_lancamento m ON m.id = l.id_modo_lancamento
     WHERE l.status_lancamento = 1
       AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0)
       AND (
         l.id_caixa = ?
         OR (
           (l.tenant_id = ? OR l.tenant_id IS NULL)
           AND l.id_caixa IS NULL
           AND (COALESCE(l.data_confirmacao, l.data_vencimento) = ? OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) = DATE(?))
           AND (
             caixa.status_caixa = 'A'
             OR NOT EXISTS (
               SELECT 1 FROM mv_caixa c_prev
               WHERE c_prev.tenant_id = ?
                 AND c_prev.data_abertura = ?
                 AND c_prev.id < ?
             )
           )
         )
       )
     ORDER BY l.id DESC LIMIT 50`,
    [caixa.id, caixa.tenant_id, caixa.data_abertura, caixa.data_abertura, caixa.tenant_id, caixa.data_abertura, caixa.id]
  );

  const vrTotal = Number(totais?.vr_total || caixa.vr_fechado_turno || 0);
  const vrDinheiro = Number(totais?.vr_dinheiro || 0);
  const vrAbertura = Number(caixa.vr_abertura || 0);
  const vrFechamento = Number(caixa.vr_fechamento || 0);
  const totalDespesas = Number(despesasDetalhes?.total_despesas || 0);
  const despesasDinheiro = Number(despesasDetalhes?.despesas_dinheiro || 0);
  const valorDespesasCaixa = despesasDinheiro > 0 ? despesasDinheiro : totalDespesas;
  const saldoEsperado = Math.max(0, vrAbertura + vrDinheiro - valorDespesasCaixa);
  const saldoLiquido = vrTotal - totalDespesas;
  const diferenca = caixa.status_caixa === 'F' ? (vrFechamento - saldoEsperado) : 0;

  res.json({
    caixa,
    totais: {
      total_vendas: vrTotal,
      total_despesas: totalDespesas,
      despesas_dinheiro: despesasDinheiro,
      saldo_liquido: saldoLiquido,
      dinheiro: vrDinheiro,
      cartao: Number(totais?.vr_cartao || 0),
      pix: Number(totais?.vr_pix || 0),
      prazo: Number(totais?.vr_prazo || 0),
      outros: Number(totais?.vr_outros || 0),
      qtd_vendas: Number(totais?.qtd_vendas || 0),
      qtd_despesas: Number(despesasDetalhes?.qtd_despesas || 0),
      saldo_esperado_dinheiro: saldoEsperado,
      diferenca_caixa: diferenca
    },
    vendas,
    despesas: despesasRows
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
       COALESCE(SUM(COALESCE(vr_dinheiro, 0) + COALESCE(vr_cartao, 0) + COALESCE(vr_pix, 0) + COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as vr_fechado_turno,
       COALESCE(SUM(vr_dinheiro),0) as vr_dinheiro,
       COALESCE(SUM(vr_cartao),0) as vr_cartao,
       COALESCE(SUM(vr_pix),0) as vr_pix,
       COALESCE(SUM(COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)),0) as vr_prazo,
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

  // Associa despesas pendentes pagas durante esta sessão que ainda não tinham id_caixa gravado
  await pool.query(
    `UPDATE cad_lancamentos
     SET id_caixa = ?,
         tenant_id = COALESCE(tenant_id, ?)
     WHERE (tenant_id = ? OR tenant_id IS NULL)
       AND status_lancamento = 1
       AND id_caixa IS NULL
       AND (COALESCE(data_confirmacao, data_vencimento) = ? OR DATE(COALESCE(data_confirmacao, data_vencimento)) = DATE(?))`,
    [caixaRow.id, caixaRow.tenant_id, caixaRow.tenant_id, caixaRow.data_abertura, caixaRow.data_abertura]
  );

  const [[despesasFechar]] = await pool.query<any>(
    `SELECT 
       COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
       COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 OR l.id_caixa = ? THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
       COUNT(l.id) as qtd_despesas
     FROM cad_lancamentos l
     LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
     WHERE l.status_lancamento = 1
       AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0)
       AND (
         l.id_caixa = ?
         OR (
           (l.tenant_id = ? OR l.tenant_id IS NULL)
           AND l.id_caixa IS NULL
           AND (COALESCE(l.data_confirmacao, l.data_vencimento) = ? OR DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) = DATE(?))
         )
       )`,
    [caixaRow.id, caixaRow.id, caixaRow.tenant_id, caixaRow.data_abertura, caixaRow.data_abertura]
  );

  const totalVendas = Number(totals?.vr_fechado_turno || 0);
  const vrAbertura = Number(caixaRow.vr_abertura || 0);
  const vrDinheiro = Number(totals?.vr_dinheiro || 0);
  const totalDespesas = Number(despesasFechar?.total_despesas || 0);
  const despesasDinheiro = Number(despesasFechar?.despesas_dinheiro || 0);
  const valorDespesasCaixa = despesasDinheiro > 0 ? despesasDinheiro : totalDespesas;
  const saldoEsperado = Math.max(0, vrAbertura + vrDinheiro - valorDespesasCaixa);
  const saldoLiquido = totalVendas - totalDespesas;

  await pool.query(
    `UPDATE mv_caixa SET status_caixa='F', hora_fechamento=?, data_fechamento=?,
      vr_fechamento=?, vr_fechado_turno=? WHERE id=? AND tenant_id=?`,
    [hora, data, vr_fechamento, totalVendas, req.params.id, caixaRow.tenant_id]
  );
  res.json({
    ok: true,
    vr_fechado_turno: totalVendas,
    total_despesas: totalDespesas,
    despesas_dinheiro: despesasDinheiro,
    saldo_liquido: saldoLiquido,
    saldo_esperado_dinheiro: saldoEsperado,
    totais: {
      ...totals,
      total_despesas: totalDespesas,
      despesas_dinheiro: despesasDinheiro,
      saldo_liquido: saldoLiquido,
      saldo_esperado_dinheiro: saldoEsperado,
    }
  });
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
      supervisor_pin,
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
      supervisor_pin?: string;
    };

    const itensArray = Array.isArray(itens) ? itens : [];
    const hasItens = itensArray.length > 0;
    const finalVrTicket = Number(vr_ticket || 0) + Number(vr_outros || 0);

    // Valida se a OS já foi faturada anteriormente
    if (id_os) {
      const [[osCheck]] = await pool.query<any>(
        'SELECT id, plate, model, status, total_amount, venda_controle FROM os_orders WHERE id = ?',
        [id_os]
      );
      if (!osCheck) {
        res.status(404).json({ message: 'Ordem de serviço vinculada não encontrada.' });
        return;
      }
      if (osCheck.venda_controle) {
        res.status(422).json({
          message: `A Ordem de Serviço ${osCheck.plate} já foi finalizada na Venda #${osCheck.venda_controle} e não pode ser finalizada novamente.`
        });
        return;
      }
    }

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

    const vr_itens = hasItens ? itensArray.reduce((s, i) => s + i.valor * i.quant, 0) : 0;
    const subtotalCalculado = vr_itens > 0 ? vr_itens : (vr_pagto_total + (Number(vr_adicional) < 0 ? Math.abs(Number(vr_adicional)) : 0));
    const descontoAplicado = Number(vr_adicional) < 0 ? Math.abs(Number(vr_adicional)) : 0;

    const tenantId = getErpWriteTenantId(req);

    // Regra de segurança: Limite de desconto configurável para usuários comuns sem autorização do Administrador
    if (descontoAplicado > 0 && subtotalCalculado > 0) {
      let pctLimite = 4.0;
      try {
        const [[cfgRow]] = await pool.query<any>(
          `SELECT valor FROM app_config WHERE chave = 'limite_desconto_padrao' AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id DESC LIMIT 1`,
          [tenantId]
        );
        if (cfgRow?.valor !== undefined && cfgRow?.valor !== null) {
          const parsed = parseFloat(cfgRow.valor);
          if (!isNaN(parsed)) pctLimite = Math.max(0, Math.min(100, parsed));
        }
      } catch {
        pctLimite = 4.0;
      }

      const limiteDescontoPermitido = Math.round((subtotalCalculado * (pctLimite / 100)) * 100) / 100;
      if (descontoAplicado > limiteDescontoPermitido + 0.005) {
        const isOwner = req.user?.role === 'owner';
        let pinValido = false;

        if (supervisor_pin && /^\d{4}$/.test(String(supervisor_pin))) {
          const [pinRows] = await pool.query<any>(
            'SELECT supervisor_name FROM os_supervisor_pins WHERE pin = ? AND active = 1',
            [supervisor_pin]
          );
          if ((pinRows as any[]).length > 0 || (process.env.SUPERVISOR_PIN && supervisor_pin === process.env.SUPERVISOR_PIN)) {
            pinValido = true;
          }
        }

        if (!isOwner && !pinValido) {
          res.status(403).json({
            message: `Desconto de R$ ${descontoAplicado.toFixed(2)} excede o limite permitido de ${pctLimite}% (R$ ${limiteDescontoPermitido.toFixed(2)}). Requer autorização do Administrador via PIN.`
          });
          return;
        }
      }
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const controle = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const data_venda = now.toISOString().slice(0, 10);

    const vr_total = hasItens ? (vr_itens + Number(vr_adicional)) : vr_pagto_total;
    if (vr_total <= 0) {
      res.status(400).json({ message: 'O valor total da venda não pode ser zero ou negativo.' });
      return;
    }
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

          // Mantém todos os itens originais da OS para preservar o histórico e não zerar valores
          const discountAmount = Number(vr_adicional) < 0 ? Math.abs(Number(vr_adicional)) : 0;
          const finalLabor = osLabor > 0 ? osLabor : Number(osRow.labor_amount ?? 0);
          const finalTotal = Math.max(Number(vr_total), Number(osRow.total_amount ?? 0));

          await pool.query(
            `UPDATE os_orders
             SET venda_controle = ?,
                 status = 'closed',
                 closed_at = COALESCE(closed_at, NOW()),
                 total_amount = ?,
                 labor_amount = ?,
                 discount_amount = ?,
                 updated_at = NOW()
             WHERE id = ? AND venda_controle IS NULL`,
            [controle, finalTotal, finalLabor, discountAmount, id_os]
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
         COALESCE(SUM(CASE WHEN (l.id_modo_lancamento IN (1, 4, 5, 6, 7, 9, 10, 11)) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_valor,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 1 AND (l.id_modo_lancamento IN (1, 4, 5, 6, 7, 9, 10, 11)) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_recebido,
         COALESCE(SUM(CASE WHEN l.status_lancamento = 0 AND (l.id_modo_lancamento IN (1, 4, 5, 6, 7, 9, 10, 11)) THEN (l.vr_parcela - l.vr_abatimentos) ELSE 0 END), 0) as total_pendente,
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

    // Se houver pagamento imediato, busca a sessão de caixa aberta para vincular
    let caixaAbertoId: number | null = null;
    let caixaTenantId: number | null = tenantId;
    if (Boolean(pago_agora)) {
      const [[caixaAberto]] = await pool.query<any>(
        `SELECT id, tenant_id FROM mv_caixa WHERE status_caixa = 'A' AND tenant_id = ? ORDER BY id DESC LIMIT 1`,
        [tenantId]
      );
      caixaAbertoId = caixaAberto?.id ?? null;
      if (caixaAberto?.tenant_id) caixaTenantId = caixaAberto.tenant_id;
      if (!caixaAbertoId && req.user?.role === 'owner') {
        const [[anyCaixa]] = await pool.query<any>(
          `SELECT id, tenant_id FROM mv_caixa WHERE status_caixa = 'A' ORDER BY id DESC LIMIT 1`
        );
        if (anyCaixa?.id) {
          caixaAbertoId = anyCaixa.id;
          caixaTenantId = anyCaixa.tenant_id;
        }
      }
    }

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
            id_cliente, data_confirmacao, dias_atraso, tenant_id, id_caixa)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 0, ?, ?)`,
        [
          Number(id_planejamento || 4),
          Number(id_modo_lancamento || 1),
          isPago ? 1 : 0,
          ctrl,
          documento || ctrl,
          hist,
          favorecido || descricao,
          p,
          dueStr,
          valorParcela,
          dataConf,
          caixaTenantId || tenantId,
          isPago ? caixaAbertoId : null
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
    const writeTenantId = getErpWriteTenantId(req);
    const dataConfirmacao = req.body.data_pagamento || new Date().toISOString().slice(0, 10);
    const modoId = req.body.id_modo_lancamento ? Number(req.body.id_modo_lancamento) : 1;

    // Busca caixa aberto para vincular a baixa da despesa à sessão atual
    let caixaAbertoId: number | null = null;
    let caixaTenantId: number | null = writeTenantId;
    const [[caixaAberto]] = await pool.query<any>(
      `SELECT id, tenant_id FROM mv_caixa WHERE status_caixa = 'A' AND tenant_id = ? ORDER BY id DESC LIMIT 1`,
      [writeTenantId]
    );
    caixaAbertoId = caixaAberto?.id ?? null;
    if (caixaAberto?.tenant_id) caixaTenantId = caixaAberto.tenant_id;
    if (!caixaAbertoId && req.user?.role === 'owner') {
      const [[anyCaixa]] = await pool.query<any>(
        `SELECT id, tenant_id FROM mv_caixa WHERE status_caixa = 'A' ORDER BY id DESC LIMIT 1`
      );
      if (anyCaixa?.id) {
        caixaAbertoId = anyCaixa.id;
        caixaTenantId = anyCaixa.tenant_id;
      }
    }

    const [result] = await pool.query<any>(
      `UPDATE cad_lancamentos
       SET status_lancamento = 1,
           data_confirmacao = ?,
           id_modo_lancamento = ?,
           id_caixa = ?,
           tenant_id = COALESCE(?, tenant_id)
       WHERE id = ?`,
      [dataConfirmacao, modoId, caixaAbertoId, caixaTenantId, req.params.id]
    );

    res.json({ ok: true, affected: result?.affectedRows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao baixar conta a pagar' });
  }
});

router.patch('/contas-pagar/:id/estornar', requireManagerUp, async (req, res) => {
  try {
    const { condition: tenantCond, params: tenantParams } = getErpTenantCondition(req, 'tenant_id');
    const whereTenant = tenantCond ? ` AND ${tenantCond}` : '';
    await pool.query(
      `UPDATE cad_lancamentos SET status_lancamento=0, data_confirmacao=NULL, id_caixa=NULL WHERE id=?${whereTenant}`,
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

    if (order.venda_controle) {
      res.status(422).json({
        message: `Esta Ordem de Serviço (${order.plate}) já foi finalizada no caixa na Venda #${order.venda_controle} e não pode ser finalizada novamente nem zerada.`
      });
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
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? 'ativos');

  const filterTenantId = getClienteTenantId(req);
  let tenantJoin = '';
  const baseParams: any[] = [];

  const whereParts: string[] = [];
  if (status === 'inativos') {
    whereParts.push('c.inativo = 1');
  } else if (status === 'todos') {
    // sem filtro de inativo
  } else {
    whereParts.push('c.inativo = 0');
  }

  if (filterTenantId !== null) {
    if (filterTenantId === 1) {
      tenantJoin = 'LEFT JOIN cliente_tenant _ctf ON _ctf.cliente_id = c.id';
      whereParts.push('(_ctf.tenant_id = 1 OR _ctf.tenant_id IS NULL)');
    } else {
      tenantJoin = 'INNER JOIN cliente_tenant _ctf ON _ctf.cliente_id = c.id AND _ctf.tenant_id = ?';
      baseParams.push(filterTenantId);
    }
  }

  if (search.length >= 2) {
    whereParts.push('(c.nome_cliente LIKE ? OR c.telefone LIKE ? OR c.celular LIKE ? OR c.cpf_cnpj LIKE ?)');
    baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : '';

  const [[{ total }]] = await pool.query<any>(
    `SELECT COUNT(*) as total FROM cad_clientes c ${tenantJoin} ${where}`,
    baseParams
  );

  const [rows] = await pool.query<any>(
    `SELECT c.id, c.nome_cliente, c.telefone, c.celular, c.inf_adicional,
            c.cpf_cnpj, c.email, c.cep, c.endereco, c.bairro, c.cidade, c.uf, c.inativo,
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
      celular: r.celular || null,
      cpf_cnpj: r.cpf_cnpj || null,
      email: r.email || null,
      cep: r.cep || null,
      endereco: r.endereco || null,
      bairro: r.bairro || null,
      cidade: r.cidade || null,
      uf: r.uf || null,
      inativo: Number(r.inativo || 0),
      ultima_compra: r.ultima_compra,
      total_gasto: Number(r.total_gasto),
      qtd_compras: Number(r.qtd_compras),
      lojas: r.lojas || null,
    })),
    total: Number(total),
    pages: Math.ceil(Number(total) / limit),
  });
});

router.get('/clientes/:id', requireManagerUp, async (req, res) => {
  try {
    const [[cliente]] = await pool.query<any>(
      'SELECT * FROM cad_clientes WHERE id = ?',
      [req.params.id]
    );
    if (!cliente) {
      res.status(404).json({ message: 'Cliente não encontrado' });
      return;
    }
    const [tRows] = await pool.query<any>(
      'SELECT tenant_id FROM cliente_tenant WHERE cliente_id = ?',
      [req.params.id]
    );
    res.json({
      id: cliente.id,
      nome: stripPlate(cliente.nome_cliente),
      nome_original: cliente.nome_cliente,
      placa: extractPlate(cliente.nome_cliente),
      modelo: cliente.inf_adicional || '',
      telefone: cliente.telefone || '',
      celular: cliente.celular || '',
      cpf_cnpj: cliente.cpf_cnpj || '',
      email: cliente.email || '',
      cep: cliente.cep || '',
      endereco: cliente.endereco || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      uf: cliente.uf || '',
      inativo: Number(cliente.inativo || 0),
      data_cadastro: cliente.data_cadastro,
      data_ultima_alteracao: cliente.data_ultima_alteracao,
      tenant_ids: tRows.map((r: any) => Number(r.tenant_id)),
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Erro ao buscar dados do cliente', error: err?.message });
  }
});

router.post('/clientes', requireManagerUp, async (req, res) => {
  try {
    const {
      nome,
      placa,
      modelo,
      cpf_cnpj,
      telefone,
      celular,
      email,
      cep,
      endereco,
      bairro,
      cidade,
      uf,
      tenant_ids,
    } = req.body;

    if (!nome || !String(nome).trim()) {
      res.status(400).json({ message: 'Nome do cliente é obrigatório' });
      return;
    }

    const cleanNome = String(nome).trim();
    const cleanPlaca = (placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    let nomeCliente = cleanNome;
    if (cleanPlaca && !cleanNome.toUpperCase().includes(cleanPlaca)) {
      nomeCliente = `${cleanNome} ${cleanPlaca}`.slice(0, 60);
    } else {
      nomeCliente = cleanNome.slice(0, 60);
    }

    const [result] = await pool.query<any>(
      `INSERT INTO cad_clientes (
        nome_cliente, cpf_cnpj, telefone, celular, email,
        cep, endereco, bairro, cidade, uf,
        inf_adicional, inativo, data_cadastro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURDATE())`,
      [
        nomeCliente,
        cpf_cnpj ? String(cpf_cnpj).slice(0, 18) : null,
        telefone ? String(telefone).slice(0, 15) : null,
        celular ? String(celular).slice(0, 15) : null,
        email ? String(email).slice(0, 100) : null,
        cep ? String(cep).slice(0, 15) : null,
        endereco ? String(endereco).slice(0, 100) : null,
        bairro ? String(bairro).slice(0, 60) : null,
        cidade ? String(cidade).slice(0, 60) : null,
        uf ? String(uf).slice(0, 2).toUpperCase() : null,
        modelo ? String(modelo).slice(0, 255) : null,
      ]
    );

    const newId = result.insertId;
    const currentTenant = getErpWriteTenantId(req);
    const targetTenants: number[] = Array.isArray(tenant_ids) && tenant_ids.length > 0
      ? tenant_ids.map(Number).filter((n: number) => n > 0)
      : [currentTenant];

    if (targetTenants.length > 0) {
      const tValues = targetTenants.map(tid => [newId, tid]);
      await pool.query('INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES ?', [tValues])
        .catch(err => console.error('Erro ao associar cliente_tenant:', err));
    }

    res.status(201).json({ ok: true, id: newId, message: 'Cliente cadastrado com sucesso' });
  } catch (err: any) {
    console.error('POST /erp/clientes error:', err);
    res.status(500).json({ message: 'Erro ao cadastrar cliente', error: err?.message });
  }
});

router.put('/clientes/:id', requireManagerUp, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      nome,
      placa,
      modelo,
      cpf_cnpj,
      telefone,
      celular,
      email,
      cep,
      endereco,
      bairro,
      cidade,
      uf,
      inativo,
      tenant_ids,
    } = req.body;

    if (!nome || !String(nome).trim()) {
      res.status(400).json({ message: 'Nome do cliente é obrigatório' });
      return;
    }

    const cleanNome = String(nome).trim();
    const cleanPlaca = (placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    let nomeCliente = cleanNome;
    if (cleanPlaca && !cleanNome.toUpperCase().includes(cleanPlaca)) {
      nomeCliente = `${cleanNome} ${cleanPlaca}`.slice(0, 60);
    } else {
      nomeCliente = cleanNome.slice(0, 60);
    }

    await pool.query(
      `UPDATE cad_clientes
       SET nome_cliente = ?,
           cpf_cnpj = ?,
           telefone = ?,
           celular = ?,
           email = ?,
           cep = ?,
           endereco = ?,
           bairro = ?,
           cidade = ?,
           uf = ?,
           inf_adicional = ?,
           inativo = COALESCE(?, inativo),
           data_ultima_alteracao = CURDATE()
       WHERE id = ?`,
      [
        nomeCliente,
        cpf_cnpj ? String(cpf_cnpj).slice(0, 18) : null,
        telefone ? String(telefone).slice(0, 15) : null,
        celular ? String(celular).slice(0, 15) : null,
        email ? String(email).slice(0, 100) : null,
        cep ? String(cep).slice(0, 15) : null,
        endereco ? String(endereco).slice(0, 100) : null,
        bairro ? String(bairro).slice(0, 60) : null,
        cidade ? String(cidade).slice(0, 60) : null,
        uf ? String(uf).slice(0, 2).toUpperCase() : null,
        modelo !== undefined ? (modelo ? String(modelo).slice(0, 255) : null) : null,
        inativo !== undefined ? Number(inativo) : null,
        id,
      ]
    );

    if (Array.isArray(tenant_ids)) {
      await pool.query('DELETE FROM cliente_tenant WHERE cliente_id = ?', [id]).catch(() => {});
      const targetTenants = tenant_ids.map(Number).filter((n: number) => n > 0);
      if (targetTenants.length > 0) {
        const tValues = targetTenants.map(tid => [id, tid]);
        await pool.query('INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) VALUES ?', [tValues])
          .catch(err => console.error('Erro ao atualizar cliente_tenant:', err));
      }
    }

    res.json({ ok: true, message: 'Cliente atualizado com sucesso' });
  } catch (err: any) {
    console.error('PUT /erp/clientes/:id error:', err);
    res.status(500).json({ message: 'Erro ao atualizar cliente', error: err?.message });
  }
});

router.patch('/clientes/:id/toggle', requireManagerUp, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query('UPDATE cad_clientes SET inativo = IF(inativo=0,1,0), data_ultima_alteracao = CURDATE() WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: 'Erro ao alternar status do cliente' });
  }
});

router.delete('/clientes/:id', requireManagerUp, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [[vendasRow]] = await pool.query<any>(
      'SELECT COUNT(*) as cnt FROM mv_vendas WHERE id_cliente = ?',
      [id]
    );

    if (Number(vendasRow?.cnt || 0) > 0) {
      await pool.query('UPDATE cad_clientes SET inativo = 1, data_ultima_alteracao = CURDATE() WHERE id = ?', [id]);
      res.json({
        ok: true,
        softDeleted: true,
        message: 'Cliente possui histórico de compras e foi inativado para manter a integridade dos relatórios.',
      });
      return;
    }

    await pool.query('DELETE FROM cliente_tenant WHERE cliente_id = ?', [id]).catch(() => {});
    await pool.query('DELETE FROM cad_clientes WHERE id = ?', [id]);

    res.json({ ok: true, softDeleted: false, message: 'Cliente excluído com sucesso' });
  } catch (err: any) {
    console.error('DELETE /erp/clientes/:id error:', err);
    res.status(500).json({ message: 'Erro ao excluir cliente', error: err?.message });
  }
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
      nome_original: cliente.nome_cliente,
      placa,
      modelo: cliente.inf_adicional || null,
      telefone: cliente.telefone || cliente.celular || null,
      celular: cliente.celular || null,
      cpf_cnpj: cliente.cpf_cnpj || null,
      email: cliente.email || null,
      cep: cliente.cep || null,
      endereco: cliente.endereco || null,
      bairro: cliente.bairro || null,
      cidade: cliente.cidade || null,
      uf: cliente.uf || null,
      inativo: Number(cliente.inativo || 0),
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

// ── Parâmetros / Configurações do PDV ──────────────────────────────────────

router.get('/config/parametros', async (req, res) => {
  try {
    const tenantId = Number(req.headers['x-tenant-id']) || null;
    let query = `SELECT chave, valor, tenant_id FROM app_config WHERE chave = 'limite_desconto_padrao'`;
    const params: any[] = [];
    if (tenantId) {
      query += ` AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id DESC LIMIT 1`;
      params.push(tenantId);
    } else {
      query += ` AND tenant_id IS NULL LIMIT 1`;
    }
    const [[row]] = await pool.query<any>(query, params);
    const limite = row?.valor ? Number(row.valor) : 4.0;
    res.json({
      limite_desconto_padrao: isNaN(limite) ? 4.0 : limite,
      tenant_id: row?.tenant_id ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao carregar parâmetros' });
  }
});

router.put('/config/parametros', requireManagerUp, async (req, res) => {
  try {
    const { limite_desconto_padrao, aplicar_todas_lojas } = req.body;
    const pct = parseFloat(String(limite_desconto_padrao).replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) {
      res.status(400).json({ message: 'O percentual de desconto deve ser um número entre 0 e 100.' });
      return;
    }

    const tenantId = Number(req.headers['x-tenant-id']) || null;
    const targetTenantId = (Boolean(aplicar_todas_lojas) || (req.user?.role === 'owner' && !tenantId)) ? null : tenantId;

    if (Boolean(aplicar_todas_lojas)) {
      await pool.query(
        `INSERT INTO app_config (chave, tenant_id, valor, descricao)
         VALUES ('limite_desconto_padrao', NULL, ?, 'Percentual máximo de desconto para usuários comuns sem PIN de admin')
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [pct.toFixed(2)]
      );
      await pool.query(
        `DELETE FROM app_config WHERE chave = 'limite_desconto_padrao' AND tenant_id IS NOT NULL`
      );
    } else {
      await pool.query(
        `INSERT INTO app_config (chave, tenant_id, valor, descricao)
         VALUES ('limite_desconto_padrao', ?, ?, 'Percentual máximo de desconto para usuários comuns sem PIN de admin')
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [targetTenantId, pct.toFixed(2)]
      );
    }

    res.json({ ok: true, limite_desconto_padrao: pct });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Erro ao salvar parâmetros' });
  }
});

// ── RELATÓRIO CONSOLIDADO MULTI-LOJAS (MATRIZ VS. FILIAIS) ─────────────────

router.get('/relatorios/multi-lojas', requireManagerUp, async (req, res) => {
  try {
    const user = req.user as JwtPayload;
    const isOwner = user.role === 'owner';

    // Determina lojas acessíveis
    let tenantsQuery = 'SELECT id, nome, slug, ativo FROM tenants ORDER BY id ASC';
    let tenantsParams: any[] = [];

    if (!isOwner) {
      const allowed = user.tenantIds && user.tenantIds.length > 0
        ? user.tenantIds
        : (user.tenantId ? [user.tenantId] : []);
      if (allowed.length === 0) {
        return res.json({
          periodo: { data_inicio: '', data_fim: '' },
          lojas: [],
          consolidados: {
            faturamento_total: 0,
            qtd_vendas_total: 0,
            ticket_medio_geral: 0,
            despesas_total: 0,
            lucro_operacional_total: 0,
            margem_lucro_geral_pct: 0,
            descontos_total: 0,
            os_encerradas_total: 0,
            os_faturamento_total: 0,
            pagamentos_total: { dinheiro: 0, cartao: 0, pix: 0, prazo: 0, outros: 0 },
            destaques: { maior_faturamento: null, maior_ticket_medio: null, maior_margem: null },
          },
        });
      }
      tenantsQuery = `SELECT id, nome, slug, ativo FROM tenants WHERE id IN (${allowed.map(() => '?').join(',')}) ORDER BY id ASC`;
      tenantsParams = allowed;
    }

    const [tenants] = await pool.query<any>(tenantsQuery, tenantsParams);
    if (!tenants || tenants.length === 0) {
      return res.json({
        periodo: { data_inicio: '', data_fim: '' },
        lojas: [],
        consolidados: null,
      });
    }

    // Período padrão: mês atual
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const primeiroDiaMes = `${ano}-${mes}-01`;
    const hojeStr = `${ano}-${mes}-${dia}`;

    const dataInicio = req.query.data_inicio ? String(req.query.data_inicio).trim() : primeiroDiaMes;
    const dataFim = req.query.data_fim ? String(req.query.data_fim).trim() : hojeStr;

    const tenantIds = tenants.map((t: any) => t.id);
    const tenantPlaceholders = tenantIds.map(() => '?').join(',');

    // 1. Vendas e formas de pagamento por tenant no período
    const [vendasRows] = await pool.query<any>(
      `SELECT 
         v.tenant_id,
         COUNT(v.id) as qtd_vendas,
         COALESCE(SUM(COALESCE(v.vr_dinheiro, 0) + COALESCE(v.vr_cartao, 0) + COALESCE(v.vr_pix, 0) + COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0) + COALESCE(v.vr_ticket, 0)), 0) as faturamento_total,
         COALESCE(SUM(COALESCE(v.vr_dinheiro, 0)), 0) as vr_dinheiro,
         COALESCE(SUM(COALESCE(v.vr_cartao, 0)), 0) as vr_cartao,
         COALESCE(SUM(COALESCE(v.vr_pix, 0)), 0) as vr_pix,
         COALESCE(SUM(COALESCE(v.vr_nota, 0) + COALESCE(v.vr_carne, 0)), 0) as vr_prazo,
         COALESCE(SUM(COALESCE(v.vr_ticket, 0)), 0) as vr_outros,
         COALESCE(SUM(CASE WHEN v.vr_adicional < 0 THEN ABS(v.vr_adicional) ELSE 0 END), 0) as total_descontos
       FROM mv_vendas v
       WHERE v.tenant_id IN (${tenantPlaceholders})
         AND (v.data_venda BETWEEN ? AND ? OR DATE(v.data_venda) BETWEEN ? AND ?)
       GROUP BY v.tenant_id`,
      [...tenantIds, dataInicio, dataFim, dataInicio, dataFim]
    );

    const vendasMap = new Map<number, any>();
    for (const r of vendasRows) {
      vendasMap.set(Number(r.tenant_id), r);
    }

    // 2. Ordens de Serviço (Oficina) por tenant no período
    const [osRows] = await pool.query<any>(
      `SELECT
         o.tenant_id,
         COUNT(o.id) as qtd_os_total,
         SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) as qtd_os_encerradas,
         COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END), 0) as faturamento_os
       FROM os_orders o
       WHERE o.tenant_id IN (${tenantPlaceholders})
         AND DATE(COALESCE(o.closed_at, o.created_at)) BETWEEN ? AND ?
       GROUP BY o.tenant_id`,
      [...tenantIds, dataInicio, dataFim]
    );

    const osMap = new Map<number, any>();
    for (const r of osRows) {
      osMap.set(Number(r.tenant_id), r);
    }

    // 3. Despesas e Contas a Pagar quitadas por tenant no período
    const [despesasRows] = await pool.query<any>(
      `SELECT 
         l.tenant_id,
         COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as total_despesas,
         COALESCE(SUM(CASE WHEN l.id_modo_lancamento = 1 THEN (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) ELSE 0 END), 0) as despesas_dinheiro,
         COUNT(l.id) as qtd_despesas
       FROM cad_lancamentos l
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       WHERE l.tenant_id IN (${tenantPlaceholders})
         AND l.status_lancamento = 1
         AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR l.id_venda IS NULL OR l.id_venda = 0)
         AND (DATE(COALESCE(l.data_confirmacao, l.data_vencimento)) BETWEEN ? AND ?)
       GROUP BY l.tenant_id`,
      [...tenantIds, dataInicio, dataFim]
    );

    const despesasMap = new Map<number, any>();
    for (const r of despesasRows) {
      despesasMap.set(Number(r.tenant_id), r);
    }

    // 4. Status mais recente de caixa de cada tenant
    const [caixaRows] = await pool.query<any>(
      `SELECT 
         c.id, c.tenant_id, c.status_caixa, c.terminal, c.turno, c.hora_abertura, c.data_abertura, c.vr_abertura
       FROM mv_caixa c
       INNER JOIN (
         SELECT tenant_id, MAX(id) as max_id
         FROM mv_caixa
         WHERE tenant_id IN (${tenantPlaceholders})
         GROUP BY tenant_id
       ) latest ON latest.tenant_id = c.tenant_id AND latest.max_id = c.id`,
      tenantIds
    );

    const caixaMap = new Map<number, any>();
    for (const r of caixaRows) {
      caixaMap.set(Number(r.tenant_id), r);
    }

    // 5. Agrega e calcula indicadores individuais
    let faturamentoTotalRede = 0;
    let qtdVendasTotalRede = 0;
    let despesasTotalRede = 0;
    let descontosTotalRede = 0;
    let osEncerradasTotalRede = 0;
    let osFaturamentoTotalRede = 0;
    const pagamentosTotalRede = {
      dinheiro: 0,
      cartao: 0,
      pix: 0,
      prazo: 0,
      outros: 0,
    };

    const lojasCalculadasTemp = tenants.map((t: any, index: number) => {
      const v = vendasMap.get(t.id) || {};
      const os = osMap.get(t.id) || {};
      const d = despesasMap.get(t.id) || {};
      const c = caixaMap.get(t.id) || null;

      const faturamentoLoja = Number(v.faturamento_total || 0);
      const qtdVendas = Number(v.qtd_vendas || 0);
      const ticketMedio = qtdVendas > 0 ? faturamentoLoja / qtdVendas : 0;
      const despesasLoja = Number(d.total_despesas || 0);
      const lucroOperacional = faturamentoLoja - despesasLoja;
      const margemLucroPct = faturamentoLoja > 0 ? (lucroOperacional / faturamentoLoja) * 100 : 0;
      const totalDescontos = Number(v.total_descontos || 0);
      const pctDescontoMedio = (faturamentoLoja + totalDescontos) > 0
        ? (totalDescontos / (faturamentoLoja + totalDescontos)) * 100
        : 0;

      const pagto = {
        dinheiro: Number(v.vr_dinheiro || 0),
        cartao: Number(v.vr_cartao || 0),
        pix: Number(v.vr_pix || 0),
        prazo: Number(v.vr_prazo || 0),
        outros: Number(v.vr_outros || 0),
      };

      faturamentoTotalRede += faturamentoLoja;
      qtdVendasTotalRede += qtdVendas;
      despesasTotalRede += despesasLoja;
      descontosTotalRede += totalDescontos;
      osEncerradasTotalRede += Number(os.qtd_os_encerradas || 0);
      osFaturamentoTotalRede += Number(os.faturamento_os || 0);

      pagamentosTotalRede.dinheiro += pagto.dinheiro;
      pagamentosTotalRede.cartao += pagto.cartao;
      pagamentosTotalRede.pix += pagto.pix;
      pagamentosTotalRede.prazo += pagto.prazo;
      pagamentosTotalRede.outros += pagto.outros;

      // É matriz se id == 1 ou slug == 'loja-principal' ou primeiro index
      const isMatriz = t.id === 1 || t.slug === 'loja-principal' || index === 0;

      return {
        tenant: {
          id: t.id,
          nome: t.nome,
          slug: t.slug,
          ativo: Boolean(t.ativo),
          is_matriz: isMatriz,
        },
        faturamento: {
          total: faturamentoLoja,
          qtd_vendas: qtdVendas,
          ticket_medio: ticketMedio,
          share_pct: 0,
        },
        pagamentos: pagto,
        descontos: {
          total: totalDescontos,
          pct_medio: pctDescontoMedio,
        },
        oficina_os: {
          qtd_total: Number(os.qtd_os_total || 0),
          qtd_encerradas: Number(os.qtd_os_encerradas || 0),
          faturamento: Number(os.faturamento_os || 0),
          ticket_medio: Number(os.qtd_os_encerradas || 0) > 0
            ? Number(os.faturamento_os || 0) / Number(os.qtd_os_encerradas || 0)
            : 0,
        },
        despesas: {
          total: despesasLoja,
          despesas_dinheiro: Number(d.despesas_dinheiro || 0),
          qtd: Number(d.qtd_despesas || 0),
        },
        resultado: {
          lucro_operacional: lucroOperacional,
          margem_lucro_pct: margemLucroPct,
        },
        caixa_atual: c ? {
          id: c.id,
          status: c.status_caixa === 'A' ? 'A' : 'F',
          terminal: c.terminal,
          turno: c.turno,
          hora_abertura: c.hora_abertura,
          data_abertura: c.data_abertura,
          vr_abertura: Number(c.vr_abertura || 0),
        } : null,
      };
    });

    // 6. Atualiza share_pct de cada loja em relação ao total da rede
    const lojas = lojasCalculadasTemp.map((l: any) => ({
      ...l,
      faturamento: {
        ...l.faturamento,
        share_pct: faturamentoTotalRede > 0
          ? Number(((l.faturamento.total / faturamentoTotalRede) * 100).toFixed(1))
          : 0,
      },
    }));

    const ticketMedioGeral = qtdVendasTotalRede > 0
      ? faturamentoTotalRede / qtdVendasTotalRede
      : 0;
    const lucroOperacionalTotal = faturamentoTotalRede - despesasTotalRede;
    const margemLucroGeralPct = faturamentoTotalRede > 0
      ? (lucroOperacionalTotal / faturamentoTotalRede) * 100
      : 0;

    // Destaques / Rankings
    const lojasPorFaturamento = [...lojas].sort((a, b) => b.faturamento.total - a.faturamento.total);
    const lojasPorTicket = [...lojas].filter(l => l.faturamento.qtd_vendas > 0).sort((a, b) => b.faturamento.ticket_medio - a.faturamento.ticket_medio);
    const lojasPorMargem = [...lojas].filter(l => l.faturamento.total > 0).sort((a, b) => b.resultado.margem_lucro_pct - a.resultado.margem_lucro_pct);

    res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },
      lojas,
      consolidados: {
        faturamento_total: faturamentoTotalRede,
        qtd_vendas_total: qtdVendasTotalRede,
        ticket_medio_geral: ticketMedioGeral,
        despesas_total: despesasTotalRede,
        lucro_operacional_total: lucroOperacionalTotal,
        margem_lucro_geral_pct: margemLucroGeralPct,
        descontos_total: descontosTotalRede,
        os_encerradas_total: osEncerradasTotalRede,
        os_faturamento_total: osFaturamentoTotalRede,
        pagamentos_total: pagamentosTotalRede,
        destaques: {
          maior_faturamento: lojasPorFaturamento[0] ? {
            id: lojasPorFaturamento[0].tenant.id,
            nome: lojasPorFaturamento[0].tenant.nome,
            valor: lojasPorFaturamento[0].faturamento.total,
          } : null,
          maior_ticket_medio: lojasPorTicket[0] ? {
            id: lojasPorTicket[0].tenant.id,
            nome: lojasPorTicket[0].tenant.nome,
            valor: lojasPorTicket[0].faturamento.ticket_medio,
          } : null,
          maior_margem: lojasPorMargem[0] ? {
            id: lojasPorMargem[0].tenant.id,
            nome: lojasPorMargem[0].tenant.nome,
            valor: lojasPorMargem[0].resultado.margem_lucro_pct,
          } : null,
        },
      },
    });
  } catch (err: any) {
    console.error('[relatorio-multi-lojas] Erro:', err);
    res.status(500).json({ message: err?.message || 'Erro ao gerar relatório consolidado multi-lojas' });
  }
});

// ── CRM: MANUTENÇÕES PREVENTIVAS & RETORNO DE CLIENTES ───────────────────────

router.get('/crm/manutencoes-preventivas', requireManagerUp, async (req, res) => {
  try {
    const user = req.user as JwtPayload;
    const isOwner = user.role === 'owner';
    const headerTenant = Number(req.headers['x-tenant-id']);

    const statusFiltro = req.query.status ? String(req.query.status).trim().toLowerCase() : 'todos';
    const categoriaFiltro = req.query.categoria ? String(req.query.categoria).trim().toLowerCase() : 'todos';
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sort = req.query.sort ? String(req.query.sort).trim() : 'dias_desc';

    // Cláusula de Tenant
    let tenantCondition = '';
    const tenantParams: any[] = [];
    if (!isOwner) {
      const allowed = user.tenantIds && user.tenantIds.length > 0
        ? user.tenantIds
        : (user.tenantId ? [user.tenantId] : []);
      if (allowed.length === 0) {
        return res.json({ resumo: null, clientes: [] });
      }
      if (headerTenant > 0 && allowed.includes(headerTenant)) {
        tenantCondition = ' AND o.tenant_id = ?';
        tenantParams.push(headerTenant);
      } else {
        tenantCondition = ` AND o.tenant_id IN (${allowed.map(() => '?').join(',')})`;
        tenantParams.push(...allowed);
      }
    } else if (headerTenant > 0) {
      tenantCondition = ' AND o.tenant_id = ?';
      tenantParams.push(headerTenant);
    }

    // Busca os veículos com histórico em os_orders
    const [rows] = await pool.query<any>(
      `SELECT 
         UPPER(REPLACE(REPLACE(o.plate, '-', ''), ' ', '')) as placa_limpa,
         o.plate as placa_formatada,
         COALESCE(NULLIF(TRIM(o.model), ''), 'Veículo') as modelo,
         COALESCE(c.id, o.client_id) as cliente_id,
         COALESCE(NULLIF(TRIM(c.nome_cliente), ''), NULLIF(TRIM(o.client_name), ''), 'Cliente sem nome') as cliente_nome,
         COALESCE(NULLIF(TRIM(c.celular), ''), NULLIF(TRIM(c.telefone), ''), NULLIF(TRIM(o.client_phone), '')) as telefone,
         o.tenant_id,
         COALESCE(t.nome, 'Loja Principal') as tenant_nome,
         COUNT(o.id) as total_visitas,
         COALESCE(SUM(o.total_amount), 0) as total_gasto,
         MAX(COALESCE(o.closed_at, o.created_at)) as data_ultima_visita,
         SUBSTRING_INDEX(GROUP_CONCAT(o.id ORDER BY COALESCE(o.closed_at, o.created_at) DESC), ',', 1) as ultima_os_id,
         SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(o.mileage, 0) ORDER BY COALESCE(o.closed_at, o.created_at) DESC), ',', 1) as km_ultima_os
       FROM os_orders o
       LEFT JOIN cad_clientes c ON c.id = o.client_id
       LEFT JOIN tenants t ON t.id = o.tenant_id
       WHERE o.plate IS NOT NULL AND TRIM(o.plate) != ''${tenantCondition}
       GROUP BY placa_limpa, o.tenant_id
       HAVING data_ultima_visita IS NOT NULL`,
      tenantParams
    );

    // Coleta as últimas OS IDs para carregar os serviços executados
    const latestOrderIds = rows.map((r: any) => r.ultima_os_id).filter(Boolean);
    const orderItemsMap = new Map<string, string[]>();

    if (latestOrderIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < latestOrderIds.length; i += chunkSize) {
        const chunk = latestOrderIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        const [items] = await pool.query<any>(
          `SELECT order_id, description FROM os_order_items WHERE order_id IN (${placeholders})`,
          chunk
        );
        for (const item of items) {
          const list = orderItemsMap.get(item.order_id) || [];
          list.push(item.description);
          orderItemsMap.set(item.order_id, list);
        }
      }
    }

    const now = Date.now();

    // Contadores para o resumo
    let countEmDia = 0;
    let countProximos = 0;
    let countVencidos = 0;
    let countInativos = 0;
    let somaGasto = 0;
    let countGasto = 0;

    const clientesMapeados = rows.map((r: any) => {
      const dataUltima = new Date(r.data_ultima_visita);
      const diffMs = now - dataUltima.getTime();
      const diasSemVisita = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      const mesesSemVisita = Math.max(0, Number((diasSemVisita / 30.4).toFixed(1)));
      const kmUltima = Number(r.km_ultima_os || 0);

      // Estimativa de KM atual: ~1000 km por mês rodado
      const kmEstimado = kmUltima > 0
        ? kmUltima + Math.round((diasSemVisita / 30.4) * 1000)
        : null;

      // Status de manutenção preventiva
      let statusManutencao: 'em_dia' | 'proximo' | 'vencido' | 'inativo' = 'em_dia';
      if (diasSemVisita > 365) {
        statusManutencao = 'inativo';
        countInativos++;
      } else if (diasSemVisita > 180) {
        statusManutencao = 'vencido';
        countVencidos++;
      } else if (diasSemVisita >= 120) {
        statusManutencao = 'proximo';
        countProximos++;
      } else {
        statusManutencao = 'em_dia';
        countEmDia++;
      }

      const totalGasto = Number(r.total_gasto || 0);
      somaGasto += totalGasto;
      countGasto++;

      const servicosRaw = orderItemsMap.get(r.ultima_os_id) || [];
      const servicosStr = servicosRaw.join(' ').toLowerCase();

      // Detecção de categoria do serviço anterior
      let categoriaServico: 'oleo' | 'alinhamento' | 'freio' | 'geral' = 'geral';
      let recomendacao = 'Revisão periódica preventiva de segurança e fluidos.';

      if (servicosStr.includes('oleo') || servicosStr.includes('óleo') || servicosStr.includes('filtro') || servicosStr.includes('lubrific')) {
        categoriaServico = 'oleo';
        recomendacao = 'Troca preventiva de óleo do motor e filtros (recomendada a cada 6 meses ou 10.000 km).';
      } else if (servicosStr.includes('alinhamento') || servicosStr.includes('balanceamento') || servicosStr.includes('geometria') || servicosStr.includes('pneu') || servicosStr.includes('rodizio')) {
        categoriaServico = 'alinhamento';
        recomendacao = 'Alinhamento, balanceamento e rodízio de pneus (recomendada a cada 10.000 km).';
      } else if (servicosStr.includes('freio') || servicosStr.includes('pastilha') || servicosStr.includes('disco') || servicosStr.includes('suspens') || servicosStr.includes('amortecedor')) {
        categoriaServico = 'freio';
        recomendacao = 'Inspeção preventiva do sistema de freios e suspensão.';
      }

      const nomeCliente = stripPlate(r.cliente_nome);
      const telOriginal = String(r.telefone || '').trim();
      const cleanPhone = telOriginal.replace(/\D/g, '');
      const telefoneValido = cleanPhone.length >= 10 && cleanPhone.length <= 13;

      let linkWhatsapp: string | null = null;
      let mensagemWhatsapp = '';

      const servicoResumo = servicosRaw.slice(0, 2).join(', ') || 'serviços preventivos';
      const mesesTexto = mesesSemVisita < 1 ? 'menos de 1 mês' : `${Math.round(mesesSemVisita)} meses`;

      mensagemWhatsapp = `Olá, ${nomeCliente}! Tudo bem? 🚗\n` +
        `Aqui é da *${r.tenant_nome}*.\n\n` +
        `Constatamos que a última manutenção do seu *${r.modelo}* (placa *${r.placa_formatada}*) foi realizada há aproximadamente *${mesesTexto}* (${servicoResumo}).\n\n` +
        `A revisão periódica preventiva garante a segurança da sua família, o melhor consumo de combustível e evita gastos imprevistos de oficina.\n\n` +
        `Podemos agendar uma checagem preventiva para esta semana? Teremos o maior prazer em atendê-lo!`;

      if (telefoneValido) {
        const ddi = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        linkWhatsapp = `https://wa.me/${ddi}?text=${encodeURIComponent(mensagemWhatsapp)}`;
      }

      return {
        id: `${r.placa_limpa}_${r.tenant_id}`,
        placa: r.placa_formatada,
        placa_limpa: r.placa_limpa,
        modelo: r.modelo,
        cliente_id: r.cliente_id ? Number(r.cliente_id) : null,
        cliente_nome: nomeCliente,
        telefone: telOriginal || null,
        telefone_valido: telefoneValido,
        tenant_id: Number(r.tenant_id),
        tenant_nome: r.tenant_nome,
        total_visitas: Number(r.total_visitas || 1),
        total_gasto: totalGasto,
        data_ultima_visita: r.data_ultima_visita,
        dias_sem_visita: diasSemVisita,
        meses_sem_visita: mesesSemVisita,
        km_ultima_visita: kmUltima,
        km_estimado_atual: kmEstimado,
        status_manutencao: statusManutencao,
        servicos_recentes: servicosRaw.slice(0, 3),
        categoria_servico: categoriaServico,
        recomendacao,
        mensagem_whatsapp: mensagemWhatsapp,
        link_whatsapp: linkWhatsapp,
      };
    });

    // Filtros em memória
    let filtrados = clientesMapeados;

    if (statusFiltro !== 'todos') {
      filtrados = filtrados.filter((c: any) => c.status_manutencao === statusFiltro);
    }

    if (categoriaFiltro !== 'todos') {
      filtrados = filtrados.filter((c: any) => c.categoria_servico === categoriaFiltro);
    }

    if (search) {
      const q = search.toLowerCase();
      filtrados = filtrados.filter((c: any) =>
        c.placa.toLowerCase().includes(q) ||
        c.placa_limpa.toLowerCase().includes(q) ||
        c.cliente_nome.toLowerCase().includes(q) ||
        c.modelo.toLowerCase().includes(q) ||
        (c.telefone && c.telefone.includes(q))
      );
    }

    // Ordenação
    if (sort === 'dias_desc') {
      filtrados.sort((a: any, b: any) => b.dias_sem_visita - a.dias_sem_visita);
    } else if (sort === 'dias_asc') {
      filtrados.sort((a: any, b: any) => a.dias_sem_visita - b.dias_sem_visita);
    } else if (sort === 'gasto_desc') {
      filtrados.sort((a: any, b: any) => b.total_gasto - a.total_gasto);
    } else if (sort === 'nome_asc') {
      filtrados.sort((a: any, b: any) => a.cliente_nome.localeCompare(b.cliente_nome));
    }

    const ticketMedioHistorico = countGasto > 0 ? somaGasto / countGasto : 180;
    const potencialReceita = (countProximos + countVencidos) * ticketMedioHistorico;

    res.json({
      resumo: {
        total_veiculos: clientesMapeados.length,
        em_dia: countEmDia,
        proximos: countProximos,
        vencidos: countVencidos,
        inativos: countInativos,
        ticket_medio_historico: ticketMedioHistorico,
        potencial_receita_estimada: potencialReceita,
      },
      clientes: filtrados,
    });
  } catch (err: any) {
    console.error('[crm-manutencoes-preventivas] Erro:', err);
    res.status(500).json({ message: err?.message || 'Erro ao carregar manutenções preventivas do CRM' });
  }
});

// Cache em memória para Curva ABC (60s TTL) para resposta instantânea ao alternar filtros
const curvaAbcCache = new Map<string, { timestamp: number; payload: { listaComVendas: any[]; resumoBase: any } }>();

// ── RELATÓRIO / GESTÃO: CURVA ABC DE PEÇAS & DINHEIRO PARADO ─────────────────

router.get('/estoque/curva-abc', requireManagerUp, async (req, res) => {
  try {
    const tenantId = getErpWriteTenantId(req);

    // Datas de análise
    const diasParam = Number(req.query.dias) || 30;
    const agora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let dataFim = req.query.data_fim ? String(req.query.data_fim).trim() : toIso(agora);
    let dataInicio: string;

    if (req.query.data_inicio) {
      dataInicio = String(req.query.data_inicio).trim();
    } else {
      const inicioDate = new Date(agora);
      inicioDate.setDate(inicioDate.getDate() - diasParam);
      dataInicio = toIso(inicioDate);
    }

    const dtIniClean = dataInicio.split('T')[0].split(' ')[0];
    const dtFimClean = dataFim.split('T')[0].split(' ')[0];

    const apenasProdutos = req.query.apenas_produtos !== '0';
    const classeFiltro = req.query.classe ? String(req.query.classe).trim() : 'todas';
    const tipoFiltro = req.query.tipo ? Number(req.query.tipo) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sort = req.query.sort ? String(req.query.sort).trim() : 'faturamento_desc';

    // Verificação de cache em memória (60 segundos)
    const cacheKey = `${tenantId}_${dtIniClean}_${dtFimClean}_${apenasProdutos ? '1' : '0'}`;
    const cached = curvaAbcCache.get(cacheKey);
    const useCache = cached && (Date.now() - cached.timestamp < 60_000) && req.query.fresh !== '1' && req.query.nocache !== '1';

    let listaComVendas: any[];
    let resumoBase: any;

    if (useCache) {
      listaComVendas = cached.payload.listaComVendas;
      resumoBase = cached.payload.resumoBase;
    } else {
      // 1. Total de vendas por produto no período para o tenant (otimizado com índices)
      const [vendasRows] = await pool.query<any>(
        `SELECT 
           m.id_produto,
           SUM(m.quant) as qtd_vendida,
           SUM(m.vr_total) as faturamento_total
         FROM mv_vendas v
         JOIN mv_vendas_movimento m ON m.controle = v.controle
         WHERE v.tenant_id = ?
           AND v.data_venda >= ? AND v.data_venda <= ?
         GROUP BY m.id_produto`,
        [tenantId, dtIniClean, dtFimClean]
      );

      const vendasMap = new Map<number, { qtd_vendida: number; faturamento_total: number }>();
      let faturamentoGeralPeriodo = 0;
      let qtdGeralPeriodo = 0;

      for (const vr of vendasRows) {
        const id = Number(vr.id_produto);
        const fat = Number(vr.faturamento_total || 0);
        const qtd = Number(vr.qtd_vendida || 0);
        vendasMap.set(id, { qtd_vendida: qtd, faturamento_total: fat });
        faturamentoGeralPeriodo += fat;
        qtdGeralPeriodo += qtd;
      }

      // 2. Consulta catálogo de produtos e saldos do tenant (já filtrando serviços no SQL se solicitado)
      const serviceFilter = apenasProdutos ? 'AND (COALESCE(t.is_service, 0) = 0)' : '';

      const [produtosBase] = await pool.query<any>(
        `SELECT 
           p.id,
           p.nome_produto,
           p.cod_barra,
           p.unidade,
           p.id_tipo,
           COALESCE(t.nome_tipo, 'DIVERSOS') as tipo_nome,
           COALESCE(t.is_service, 0) as is_service,
           COALESCE(p.vr_compra, 0) as vr_compra,
           COALESCE(p.vr_venda, 0) as vr_venda,
           COALESCE(p.min_estoque, 0) as min_estoque,
           COALESCE(p.controla_estoque, 1) as controla_estoque,
           COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) as estoque
         FROM cad_produtos p
         LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
         LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
         WHERE p.inativo = 0
           ${serviceFilter}
           AND (? = 1 OR pst.produto_id IS NOT NULL)`,
        [tenantId, tenantId, tenantId]
      );

      // 3. Monta lista completa e ordena por faturamento decrescente para classificar ABC
      listaComVendas = produtosBase.map((p: any) => {
        const v = vendasMap.get(p.id) || { qtd_vendida: 0, faturamento_total: 0 };
        const vrCompra = Number(p.vr_compra || 0);
        const vrVenda = Number(p.vr_venda || 0);
        const estoque = Number(p.estoque || 0);
        const minEstoque = Number(p.min_estoque || 0);
        const margemUnitariaPct = vrVenda > 0 ? ((vrVenda - vrCompra) / vrVenda) * 100 : 0;
        const valorEstoqueCusto = estoque * vrCompra;
        const valorEstoqueVenda = estoque * vrVenda;

        return {
          id: p.id,
          nome_produto: p.nome_produto,
          cod_barra: p.cod_barra || null,
          unidade: p.unidade || 'UN',
          id_tipo: p.id_tipo ? Number(p.id_tipo) : null,
          tipo_nome: p.tipo_nome,
          is_service: Boolean(p.is_service),
          vr_compra: vrCompra,
          vr_venda: vrVenda,
          margem_unitaria_pct: margemUnitariaPct,
          estoque,
          min_estoque: minEstoque,
          controla_estoque: Boolean(p.controla_estoque),
          qtd_vendida: v.qtd_vendida,
          faturamento_total: v.faturamento_total,
          valor_estoque_custo: valorEstoqueCusto,
          valor_estoque_venda: valorEstoqueVenda,
          share_pct: 0,
          acumulado_pct: 0,
          classe: 'C' as 'A' | 'B' | 'C',
          status_estoque: 'normal' as 'ruptura' | 'baixo' | 'zerado' | 'normal' | 'dinheiro_parado',
          sugestao_compra: 0,
        };
      });

      // Ordena por faturamento desc
      listaComVendas.sort((a: any, b: any) => b.faturamento_total - a.faturamento_total);

      // 4. Atribuição de classes ABC pelo faturamento acumulado
      let acumulado = 0;
      let countA = 0;
      let countB = 0;
      let countC = 0;
      let fatA = 0;
      let fatB = 0;
      let fatC = 0;
      let estCustoA = 0;
      let estCustoB = 0;
      let estCustoC = 0;
      let dinheiroParadoC = 0;
      let itensRupturaA = 0;
      let valorTotalEstoqueCusto = 0;
      let valorTotalEstoqueVenda = 0;

      for (const item of listaComVendas) {
        valorTotalEstoqueCusto += item.valor_estoque_custo;
        valorTotalEstoqueVenda += item.valor_estoque_venda;

        const share = faturamentoGeralPeriodo > 0
          ? (item.faturamento_total / faturamentoGeralPeriodo) * 100
          : 0;
        acumulado += share;

        item.share_pct = Number(share.toFixed(2));
        item.acumulado_pct = Number(acumulado.toFixed(2));

        if (item.faturamento_total > 0 && (acumulado <= 80 || countA === 0)) {
          item.classe = 'A';
          countA++;
          fatA += item.faturamento_total;
          estCustoA += item.valor_estoque_custo;
        } else if (item.faturamento_total > 0 && acumulado <= 95) {
          item.classe = 'B';
          countB++;
          fatB += item.faturamento_total;
          estCustoB += item.valor_estoque_custo;
        } else {
          item.classe = 'C';
          countC++;
          fatC += item.faturamento_total;
          estCustoC += item.valor_estoque_custo;

          if (item.qtd_vendida === 0 && item.estoque > 0) {
            dinheiroParadoC += item.valor_estoque_custo;
          }
        }

        if (item.controla_estoque) {
          if (item.estoque <= 0 && item.classe === 'A') {
            item.status_estoque = 'ruptura';
            itensRupturaA++;
            const mediaMensal = item.qtd_vendida > 0 ? (item.qtd_vendida / Math.max(1, diasParam)) * 30 : Math.max(2, item.min_estoque);
            item.sugestao_compra = Math.ceil(mediaMensal);
          } else if (item.min_estoque > 0 && item.estoque <= item.min_estoque && item.classe === 'A') {
            item.status_estoque = 'ruptura';
            itensRupturaA++;
            const mediaMensal = item.qtd_vendida > 0 ? (item.qtd_vendida / Math.max(1, diasParam)) * 30 : item.min_estoque;
            item.sugestao_compra = Math.max(1, Math.ceil(mediaMensal - item.estoque));
          } else if (item.estoque <= 0) {
            item.status_estoque = 'zerado';
          } else if (item.min_estoque > 0 && item.estoque <= item.min_estoque) {
            item.status_estoque = 'baixo';
          } else if (item.qtd_vendida === 0 && item.estoque > 0) {
            item.status_estoque = 'dinheiro_parado';
          } else {
            item.status_estoque = 'normal';
          }
        }
      }

      const margemMediaEstoque = valorTotalEstoqueVenda > 0
        ? ((valorTotalEstoqueVenda - valorTotalEstoqueCusto) / valorTotalEstoqueVenda) * 100
        : 0;

      resumoBase = {
        total_itens_catalogo: listaComVendas.length,
        valor_total_estoque_custo: valorTotalEstoqueCusto,
        valor_total_estoque_venda: valorTotalEstoqueVenda,
        margem_media_estoque_pct: margemMediaEstoque,
        dinheiro_parado_classe_c: dinheiroParadoC,
        itens_em_ruptura_classe_a: itensRupturaA,
        faturamento_total_periodo: faturamentoGeralPeriodo,
        qtd_total_vendida_periodo: qtdGeralPeriodo,
        classe_a: {
          qtd_itens: countA,
          faturamento: fatA,
          share_faturamento_pct: faturamentoGeralPeriodo > 0 ? (fatA / faturamentoGeralPeriodo) * 100 : 0,
          valor_estoque_custo: estCustoA,
        },
        classe_b: {
          qtd_itens: countB,
          faturamento: fatB,
          share_faturamento_pct: faturamentoGeralPeriodo > 0 ? (fatB / faturamentoGeralPeriodo) * 100 : 0,
          valor_estoque_custo: estCustoB,
        },
        classe_c: {
          qtd_itens: countC,
          faturamento: fatC,
          share_faturamento_pct: faturamentoGeralPeriodo > 0 ? (fatC / faturamentoGeralPeriodo) * 100 : 0,
          valor_estoque_custo: estCustoC,
        },
      };

      // Salva no cache
      curvaAbcCache.set(cacheKey, {
        timestamp: Date.now(),
        payload: { listaComVendas, resumoBase },
      });

      if (curvaAbcCache.size > 50) {
        const threshold = Date.now() - 180_000;
        for (const [k, v] of curvaAbcCache.entries()) {
          if (v.timestamp < threshold) curvaAbcCache.delete(k);
        }
      }
    }

    // 5. Aplica filtros da requisição para listagem na tabela
    let filtrados = listaComVendas;

    if (classeFiltro === 'A') {
      filtrados = filtrados.filter((p: any) => p.classe === 'A');
    } else if (classeFiltro === 'B') {
      filtrados = filtrados.filter((p: any) => p.classe === 'B');
    } else if (classeFiltro === 'C') {
      filtrados = filtrados.filter((p: any) => p.classe === 'C');
    } else if (classeFiltro === 'sem_giro') {
      filtrados = filtrados.filter((p: any) => p.qtd_vendida === 0);
    } else if (classeFiltro === 'dinheiro_parado') {
      filtrados = filtrados.filter((p: any) => p.qtd_vendida === 0 && p.estoque > 0);
    } else if (classeFiltro === 'ruptura') {
      filtrados = filtrados.filter((p: any) => p.status_estoque === 'ruptura');
    }

    if (tipoFiltro) {
      filtrados = filtrados.filter((p: any) => p.id_tipo === tipoFiltro);
    }

    if (search) {
      const q = search.toLowerCase();
      filtrados = filtrados.filter((p: any) =>
        p.nome_produto.toLowerCase().includes(q) ||
        (p.cod_barra && p.cod_barra.toLowerCase().includes(q)) ||
        (p.tipo_nome && p.tipo_nome.toLowerCase().includes(q))
      );
    }

    // Ordenação
    if (sort === 'faturamento_desc') {
      filtrados.sort((a: any, b: any) => b.faturamento_total - a.faturamento_total);
    } else if (sort === 'qtd_desc') {
      filtrados.sort((a: any, b: any) => b.qtd_vendida - a.qtd_vendida);
    } else if (sort === 'imobilizado_desc') {
      filtrados.sort((a: any, b: any) => b.valor_estoque_custo - a.valor_estoque_custo);
    } else if (sort === 'estoque_asc') {
      filtrados.sort((a: any, b: any) => a.estoque - b.estoque);
    } else if (sort === 'nome_asc') {
      filtrados.sort((a: any, b: any) => a.nome_produto.localeCompare(b.nome_produto));
    }

    res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
        dias: diasParam,
      },
      resumo: resumoBase,
      produtos: filtrados,
    });
  } catch (err: any) {
    console.error('[curva-abc] Erro:', err);
    res.status(500).json({ message: err?.message || 'Erro ao gerar Curva ABC de peças e estoque' });
  }
});

// ── VALORIZAÇÃO FINANCEIRA DO ESTOQUE (INVENTÁRIO FÍSICO & FINANCEIRO) ───────
router.get('/estoque/valorizacao', requireManagerUp, async (req, res) => {
  try {
    const tenantId = getErpWriteTenantId(req);
    const apenasProdutos = req.query.apenas_produtos !== '0';
    const serviceFilter = apenasProdutos ? 'AND (COALESCE(t.is_service, 0) = 0)' : '';

    // Consulta todos os produtos ativos e saldos do tenant
    const [rows] = await pool.query<any>(
      `SELECT 
         p.id,
         p.nome_produto,
         p.cod_barra,
         p.unidade,
         p.id_tipo,
         COALESCE(t.nome_tipo, 'DIVERSOS') as tipo_nome,
         COALESCE(t.is_service, 0) as is_service,
         COALESCE(p.vr_compra, 0) as vr_compra,
         COALESCE(p.vr_venda, 0) as vr_venda,
         COALESCE(p.min_estoque, 0) as min_estoque,
         COALESCE(p.controla_estoque, 1) as controla_estoque,
         COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) as estoque
       FROM cad_produtos p
       LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
       LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
       WHERE p.inativo = 0
         ${serviceFilter}
         AND (? = 1 OR pst.produto_id IS NOT NULL)
       ORDER BY p.nome_produto ASC`,
      [tenantId, tenantId, tenantId]
    );

    let totalProdutosCatalogo = rows.length;
    let totalItensComSaldo = 0;
    let totalUnidadesFisicas = 0;
    let valorTotalCusto = 0;
    let valorTotalVenda = 0;
    let qtdZerados = 0;
    let qtdBaixo = 0;
    let qtdNormal = 0;
    let qtdNegativo = 0;
    let qtdInfinito = 0;
    let qtdSemCusto = 0;

    // Agrupamento por Categoria/Tipo
    const categoriasMap = new Map<number, {
      id_tipo: number;
      nome_tipo: string;
      total_produtos: number;
      total_unidades: number;
      valor_custo: number;
      valor_venda: number;
    }>();

    const produtos = rows.map((r: any) => {
      const id = Number(r.id);
      const vrCusto = Number(r.vr_compra || 0);
      const vrVenda = Number(r.vr_venda || 0);
      const estoque = Number(r.estoque || 0);
      const minEstoque = Number(r.min_estoque || 0);
      const controlaEstoque = Boolean(Number(r.controla_estoque ?? 1));
      const idTipo = r.id_tipo ? Number(r.id_tipo) : 0;
      const tipoNome = r.tipo_nome || 'DIVERSOS';

      // Classificação de status
      let statusEstoque: 'zerado' | 'baixo' | 'normal' | 'negativo' | 'infinito' = 'normal';
      if (!controlaEstoque) {
        statusEstoque = 'infinito';
        qtdInfinito++;
      } else if (estoque < 0) {
        statusEstoque = 'negativo';
        qtdNegativo++;
      } else if (estoque === 0) {
        statusEstoque = 'zerado';
        qtdZerados++;
      } else if (estoque <= minEstoque) {
        statusEstoque = 'baixo';
        qtdBaixo++;
      } else {
        statusEstoque = 'normal';
        qtdNormal++;
      }

      // Se possui estoque físico positivo, computa financeiro
      const unidadesValidas = estoque > 0 ? estoque : 0;
      const custoTotal = unidadesValidas * vrCusto;
      const vendaTotal = unidadesValidas * vrVenda;
      const lucroTotal = vendaTotal - custoTotal;

      if (estoque > 0) {
        totalItensComSaldo++;
        totalUnidadesFisicas += estoque;
        valorTotalCusto += custoTotal;
        valorTotalVenda += vendaTotal;

        if (vrCusto <= 0) {
          qtdSemCusto++;
        }
      }

      // Agrupamento da categoria
      let cat = categoriasMap.get(idTipo);
      if (!cat) {
        cat = {
          id_tipo: idTipo,
          nome_tipo: tipoNome,
          total_produtos: 0,
          total_unidades: 0,
          valor_custo: 0,
          valor_venda: 0,
        };
        categoriasMap.set(idTipo, cat);
      }
      cat.total_produtos++;
      if (estoque > 0) {
        cat.total_unidades += estoque;
        cat.valor_custo += custoTotal;
        cat.valor_venda += vendaTotal;
      }

      const margemPct = vrVenda > 0 ? ((vrVenda - vrCusto) / vrVenda) * 100 : 0;
      const markupPct = vrCusto > 0 ? ((vrVenda - vrCusto) / vrCusto) * 100 : 0;

      return {
        id,
        nome_produto: r.nome_produto,
        cod_barra: r.cod_barra ? String(r.cod_barra).trim() : null,
        unidade: r.unidade || 'UN',
        id_tipo: r.id_tipo,
        tipo_nome: tipoNome,
        is_service: Boolean(r.is_service),
        estoque,
        min_estoque: minEstoque,
        controla_estoque: controlaEstoque,
        vr_custo: vrCusto,
        vr_venda: vrVenda,
        valor_custo_total: Number(custoTotal.toFixed(2)),
        valor_venda_total: Number(vendaTotal.toFixed(2)),
        lucro_projetado: Number(lucroTotal.toFixed(2)),
        margem_pct: Number(margemPct.toFixed(1)),
        markup_pct: Number(markupPct.toFixed(1)),
        status_estoque: statusEstoque,
        alerta_sem_custo: estoque > 0 && vrCusto <= 0,
      };
    });

    const lucroBrutoTotal = valorTotalVenda - valorTotalCusto;
    const margemGeralPct = valorTotalVenda > 0 ? (lucroBrutoTotal / valorTotalVenda) * 100 : 0;
    const markupGeralPct = valorTotalCusto > 0 ? (lucroBrutoTotal / valorTotalCusto) * 100 : 0;

    // Lista de categorias ordenadas por maior valor de custo imobilizado
    const categorias = Array.from(categoriasMap.values())
      .map(c => {
        const lucro = c.valor_venda - c.valor_custo;
        const margem = c.valor_venda > 0 ? (lucro / c.valor_venda) * 100 : 0;
        const shareCusto = valorTotalCusto > 0 ? (c.valor_custo / valorTotalCusto) * 100 : 0;
        return {
          id_tipo: c.id_tipo,
          nome_tipo: c.nome_tipo,
          total_produtos: c.total_produtos,
          total_unidades: Number(c.total_unidades.toFixed(2)),
          valor_custo: Number(c.valor_custo.toFixed(2)),
          valor_venda: Number(c.valor_venda.toFixed(2)),
          lucro_projetado: Number(lucro.toFixed(2)),
          margem_pct: Number(margem.toFixed(1)),
          share_custo_pct: Number(shareCusto.toFixed(1)),
        };
      })
      .sort((a, b) => b.valor_custo - a.valor_custo);

    res.json({
      tenant_id: tenantId,
      resumo: {
        total_produtos_catalogo: totalProdutosCatalogo,
        total_itens_com_saldo: totalItensComSaldo,
        total_unidades_fisicas: Number(totalUnidadesFisicas.toFixed(2)),
        valor_total_custo: Number(valorTotalCusto.toFixed(2)),
        valor_total_venda: Number(valorTotalVenda.toFixed(2)),
        lucro_bruto_projetado: Number(lucroBrutoTotal.toFixed(2)),
        margem_lucro_pct: Number(margemGeralPct.toFixed(1)),
        markup_medio_pct: Number(markupGeralPct.toFixed(1)),
        qtd_zerados: qtdZerados,
        qtd_baixo: qtdBaixo,
        qtd_normal: qtdNormal,
        qtd_negativo: qtdNegativo,
        qtd_infinito: qtdInfinito,
        qtd_sem_custo: qtdSemCusto,
      },
      categorias,
      produtos,
    });
  } catch (err: any) {
    console.error('[valorizacao-estoque] Erro:', err);
    res.status(500).json({ message: err?.message || 'Erro ao calcular valorização do estoque' });
  }
});

// ── SUGESTÃO DE COMPRAS E PONTO DE REPOSIÇÃO POR FORNECEDOR ─────────────────
router.get('/estoque/sugestao-compras', requireManagerUp, async (req, res) => {
  try {
    const tenantId = getErpWriteTenantId(req);

    // Parâmetros de análise
    const periodoDias = Math.max(7, Math.min(180, Number(req.query.periodo_dias) || 30));
    const diasCobertura = Math.max(7, Math.min(180, Number(req.query.dias_cobertura) || 30));
    const apenasProdutos = req.query.apenas_produtos !== '0';

    const agora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const inicioDate = new Date(agora);
    inicioDate.setDate(inicioDate.getDate() - periodoDias);
    const dataInicioIso = toIso(inicioDate);
    const dataFimIso = toIso(agora);

    // 1. Consulta consumo em Vendas (PDV / Balcão) no período
    const [vendasRows] = await pool.query<any>(
      `SELECT 
         m.id_produto,
         SUM(m.quant) as qtd_vendida
       FROM mv_vendas v
       JOIN mv_vendas_movimento m ON m.controle = v.controle
       WHERE v.tenant_id = ?
         AND v.data_venda >= ? AND v.data_venda <= ?
       GROUP BY m.id_produto`,
      [tenantId, dataInicioIso, dataFimIso]
    );

    // 2. Consulta consumo em Ordens de Serviço (peças aplicadas nas OSs) no período
    let osRows: any[] = [];
    try {
      const [rows] = await pool.query<any>(
        `SELECT 
           oi.product_id as id_produto,
           SUM(oi.quantity) as qtd_aplicada
         FROM os_orders o
         JOIN os_order_items oi ON oi.order_id = o.id
         WHERE o.tenant_id = ?
           AND o.created_at >= ?
           AND o.status IN ('in_progress', 'closed')
         GROUP BY oi.product_id`,
        [tenantId, `${dataInicioIso} 00:00:00`]
      );
      osRows = rows;
    } catch {
      osRows = [];
    }

    // Mapa consolidado de consumo
    const consumoMap = new Map<number, { qtdVendas: number; qtdOs: number; qtdTotal: number }>();

    for (const r of vendasRows) {
      const id = Number(r.id_produto);
      const q = Number(r.qtd_vendida || 0);
      consumoMap.set(id, { qtdVendas: q, qtdOs: 0, qtdTotal: q });
    }

    for (const r of osRows) {
      const id = Number(r.id_produto);
      const q = Number(r.qtd_aplicada || 0);
      const prev = consumoMap.get(id);
      if (prev) {
        prev.qtdOs += q;
        prev.qtdTotal += q;
      } else {
        consumoMap.set(id, { qtdVendas: 0, qtdOs: q, qtdTotal: q });
      }
    }

    // 3. Consulta produtos, saldo do tenant, categorias e fornecedores preferenciais
    const serviceFilter = apenasProdutos ? 'AND (COALESCE(t.is_service, 0) = 0)' : '';

    const [produtosRows] = await pool.query<any>(
      `SELECT 
         p.id,
         p.nome_produto,
         p.cod_barra,
         p.unidade,
         p.id_tipo,
         COALESCE(t.nome_tipo, 'DIVERSOS') as tipo_nome,
         COALESCE(t.is_service, 0) as is_service,
         COALESCE(p.vr_compra, 0) as vr_compra,
         COALESCE(p.vr_venda, 0) as vr_venda,
         COALESCE(p.min_estoque, 0) as min_estoque,
         COALESCE(p.controla_estoque, 1) as controla_estoque,
         COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) as estoque,
         forn.id_fornecedor,
         COALESCE(forn.nome_fornecedor, 'SEM FORNECEDOR VINCULADO') as nome_fornecedor,
         forn.telefone as fornecedor_telefone,
         forn.email as fornecedor_email,
         forn.contato as fornecedor_contato
       FROM cad_produtos p
       LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
       LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
       LEFT JOIN (
         SELECT 
           pf.id_produto,
           f.id as id_fornecedor,
           f.nome_fornecedor,
           f.telefone,
           f.email,
           f.contato
         FROM cad_produtos_fornecedores pf
         JOIN cad_fornecedores f ON f.id = pf.id_fornecedor
         WHERE COALESCE(f.inativo, 0) = 0
       ) forn ON forn.id_produto = p.id
       WHERE p.inativo = 0
         ${serviceFilter}
         AND (? = 1 OR pst.produto_id IS NOT NULL)`,
      [tenantId, tenantId, tenantId]
    );

    // 4. Processamento dos Itens e Cálculo de Sugestão
    let totalItensComprar = 0;
    let totalUnidadesComprar = 0;
    let investimentoTotalEstimado = 0;
    let itensCriticosUrgentes = 0;
    let itensSemFornecedor = 0;

    const fornecedoresMap = new Map<number, {
      id_fornecedor: number;
      nome_fornecedor: string;
      telefone: string | null;
      email: string | null;
      contato: string | null;
      total_itens: number;
      total_unidades: number;
      valor_total: number;
    }>();

    const produtosCalculados = produtosRows.map((p: any) => {
      const id = Number(p.id);
      const vrCompra = Number(p.vr_compra || 0);
      const vrVenda = Number(p.vr_venda || 0);
      const estoque = Number(p.estoque || 0);
      const minEstoque = Number(p.min_estoque || 0);
      const controlaEstoque = Boolean(Number(p.controla_estoque ?? 1));

      const consumo = consumoMap.get(id) || { qtdVendas: 0, qtdOs: 0, qtdTotal: 0 };
      const consumoDiario = consumo.qtdTotal / periodoDias;
      const demandaCobertura = consumoDiario * diasCobertura;

      // Ponto de reposição
      const pontoReposicao = minEstoque > 0 ? minEstoque : Math.ceil(consumoDiario * 7);

      // Quantidade sugerida para atingir a cobertura + estoque de segurança
      let sugestaoQtd = 0;
      if (controlaEstoque) {
        if (estoque <= 0) {
          const deficit = Math.abs(Math.min(0, estoque));
          const alvo = demandaCobertura > 0 ? Math.ceil(demandaCobertura + pontoReposicao) : (minEstoque > 0 ? minEstoque : 1);
          sugestaoQtd = alvo + deficit;
        } else if (estoque <= pontoReposicao || estoque < demandaCobertura) {
          const alvo = Math.ceil(demandaCobertura + (minEstoque > 0 ? minEstoque : 0));
          if (alvo > estoque) {
            sugestaoQtd = alvo - estoque;
          }
        }
      }

      // Previsão de dias de duração do estoque atual
      let diasDuracaoEstoque = 999;
      if (estoque <= 0) {
        diasDuracaoEstoque = 0;
      } else if (consumoDiario > 0) {
        diasDuracaoEstoque = Math.floor(estoque / consumoDiario);
      }

      // Classificação do status de reposição
      let statusReposicao: 'urgente' | 'critico' | 'atencao' | 'planejado' | 'seguro' = 'seguro';
      if (!controlaEstoque) {
        statusReposicao = 'seguro';
        sugestaoQtd = 0;
      } else if (estoque <= 0 && consumo.qtdTotal > 0) {
        statusReposicao = 'urgente'; // Vendeu recentemente e está zerado!
      } else if (estoque <= 0) {
        statusReposicao = 'critico'; // Zerado
      } else if (estoque <= minEstoque) {
        statusReposicao = 'atencao'; // Abaixo do mínimo
      } else if (diasDuracaoEstoque <= diasCobertura) {
        statusReposicao = 'planejado'; // Vai acabar antes do fim da cobertura
      } else {
        statusReposicao = 'seguro';
      }

      const precisaComprar = sugestaoQtd > 0;
      const custoEstimadoTotal = Number((sugestaoQtd * vrCompra).toFixed(2));

      const idForn = p.id_fornecedor ? Number(p.id_fornecedor) : 0;
      const nomeForn = p.nome_fornecedor || 'SEM FORNECEDOR VINCULADO';

      if (precisaComprar) {
        totalItensComprar++;
        totalUnidadesComprar += sugestaoQtd;
        investimentoTotalEstimado += custoEstimadoTotal;

        if (statusReposicao === 'urgente' || statusReposicao === 'critico') {
          itensCriticosUrgentes++;
        }
        if (!p.id_fornecedor) {
          itensSemFornecedor++;
        }

        // Agrupamento no mapa de fornecedores
        let f = fornecedoresMap.get(idForn);
        if (!f) {
          f = {
            id_fornecedor: idForn,
            nome_fornecedor: nomeForn,
            telefone: p.fornecedor_telefone || null,
            email: p.fornecedor_email || null,
            contato: p.fornecedor_contato || null,
            total_itens: 0,
            total_unidades: 0,
            valor_total: 0,
          };
          fornecedoresMap.set(idForn, f);
        }
        f.total_itens++;
        f.total_unidades += sugestaoQtd;
        f.valor_total += custoEstimadoTotal;
      }

      return {
        id,
        nome_produto: p.nome_produto,
        cod_barra: p.cod_barra ? String(p.cod_barra).trim() : null,
        unidade: p.unidade || 'UN',
        id_tipo: p.id_tipo ? Number(p.id_tipo) : null,
        tipo_nome: p.tipo_nome,
        is_service: Boolean(p.is_service),
        estoque,
        min_estoque: minEstoque,
        controla_estoque: controlaEstoque,
        vr_custo: vrCompra,
        vr_venda: vrVenda,
        qtd_consumo_periodo: Number(consumo.qtdTotal.toFixed(2)),
        qtd_vendas_periodo: Number(consumo.qtdVendas.toFixed(2)),
        qtd_os_periodo: Number(consumo.qtdOs.toFixed(2)),
        consumo_diario: Number(consumoDiario.toFixed(2)),
        dias_duracao_estoque: diasDuracaoEstoque,
        ponto_reposicao: pontoReposicao,
        sugestao_qtd: sugestaoQtd,
        custo_estimado_total: custoEstimadoTotal,
        precisa_comprar: precisaComprar,
        status_reposicao: statusReposicao,
        id_fornecedor: p.id_fornecedor ? Number(p.id_fornecedor) : null,
        nome_fornecedor: nomeForn,
        fornecedor_telefone: p.fornecedor_telefone || null,
        fornecedor_email: p.fornecedor_email || null,
        fornecedor_contato: p.fornecedor_contato || null,
      };
    });

    const fornecedores = Array.from(fornecedoresMap.values())
      .map(f => ({
        ...f,
        valor_total: Number(f.valor_total.toFixed(2)),
      }))
      .sort((a, b) => b.valor_total - a.valor_total);

    res.json({
      tenant_id: tenantId,
      parametros: {
        periodo_dias: periodoDias,
        dias_cobertura: diasCobertura,
        data_inicio: dataInicioIso,
        data_fim: dataFimIso,
      },
      resumo: {
        total_itens_comprar: totalItensComprar,
        total_unidades_comprar: Number(totalUnidadesComprar.toFixed(2)),
        investimento_total_estimado: Number(investimentoTotalEstimado.toFixed(2)),
        itens_criticos_urgentes: itensCriticosUrgentes,
        itens_sem_fornecedor: itensSemFornecedor,
        total_fornecedores_acionar: fornecedores.length,
      },
      fornecedores,
      produtos: produtosCalculados,
    });
  } catch (err: any) {
    console.error('[sugestao-compras] Erro:', err);
    res.status(500).json({ message: err?.message || 'Erro ao gerar sugestão de compras' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── OFICINA & PRODUTIVIDADE: MECÂNICOS E COMISSÕES ───────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /erp/mecanicos ────────────────────────────────────────────────────────
router.get('/mecanicos', async (req: Request, res: Response) => {
  try {
    const { clause, params } = getErpTenantFilter(req, false, 'm.tenant_id');
    const { ativo } = req.query as { ativo?: string };

    let whereClause = clause ? clause : '';
    const queryParams: any[] = [...params];

    if (ativo !== undefined && ativo !== '') {
      const atv = Number(ativo) === 1 ? 1 : 0;
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + 'm.ativo = ?';
      queryParams.push(atv);
    }

    const sql = `
      SELECT
        m.*,
        t.nome AS tenant_nome,
        u.id AS user_id,
        u.nome AS user_nome,
        u.email AS user_email,
        (SELECT COUNT(DISTINCT o.id) FROM os_orders o WHERE o.mecanico_id = m.id OR o.auxiliar_id = m.id OR EXISTS (SELECT 1 FROM os_order_items oi WHERE oi.order_id = o.id AND oi.mecanico_id = m.id)) AS total_os,
        (SELECT COUNT(oi.id) FROM os_order_items oi WHERE oi.mecanico_id = m.id AND oi.type = 'service') AS total_servicos
      FROM cad_mecanicos m
      LEFT JOIN tenants t ON t.id = m.tenant_id
      LEFT JOIN users u ON u.id = m.user_id
      ${whereClause}
      ORDER BY m.ativo DESC, m.nome ASC
    `;

    const [rows] = await pool.query<any>(sql, queryParams);
    res.json(rows.map((r: any) => ({
      id: Number(r.id),
      tenant_id: Number(r.tenant_id),
      tenant_nome: r.tenant_nome || null,
      user_id: r.user_id ? Number(r.user_id) : null,
      user_nome: r.user_nome || null,
      user_email: r.user_email || null,
      nome: r.nome,
      apelido: r.apelido || null,
      cpf: r.cpf || null,
      telefone: r.telefone || null,
      chave_pix: r.chave_pix || null,
      comissao_servico_pct: Number(r.comissao_servico_pct || 0),
      comissao_peca_pct: Number(r.comissao_peca_pct || 0),
      ativo: Boolean(r.ativo),
      is_auxiliar: Boolean(r.is_auxiliar),
      total_os: Number(r.total_os || 0),
      total_servicos: Number(r.total_servicos || 0),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })));
  } catch (err: any) {
    console.error('[mecanicos] GET erro:', err);
    res.status(500).json({ message: 'Erro ao listar mecânicos / técnicos' });
  }
});

// ── GET /erp/mecanicos/usuarios-sistema ─────────────────────────────────────
// Retorna os usuários do sistema ativos para seleção de vínculo com mecânico
router.get('/mecanicos/usuarios-sistema', requireManagerUp, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any>(`
      SELECT u.id, u.nome, u.email, u.role, u.ativo, m.id as mecanico_id, m.nome as mecanico_nome
      FROM users u
      LEFT JOIN cad_mecanicos m ON m.user_id = u.id AND m.ativo = 1
      WHERE u.ativo = 1
      ORDER BY u.nome ASC
    `);
    res.json(rows.map((r: any) => ({
      id: Number(r.id),
      nome: r.nome,
      email: r.email,
      role: r.role,
      mecanico_id: r.mecanico_id ? Number(r.mecanico_id) : null,
      mecanico_nome: r.mecanico_nome || null,
    })));
  } catch (err: any) {
    console.error('[mecanicos/usuarios-sistema] erro:', err);
    res.status(500).json({ message: 'Erro ao buscar usuários do sistema' });
  }
});

// ── POST /erp/mecanicos ───────────────────────────────────────────────────────
router.post('/mecanicos', requireManagerUp, async (req: Request, res: Response) => {
  try {
    const { nome, apelido, cpf, telefone, chave_pix, comissao_servico_pct, comissao_peca_pct, tenant_id, user_id, is_auxiliar } = req.body;
    if (!nome || !String(nome).trim()) {
      res.status(400).json({ message: 'Nome do mecânico / técnico é obrigatório' });
      return;
    }

    const tId = tenant_id && Number(tenant_id) > 0 ? Number(tenant_id) : getErpWriteTenantId(req);
    const servPct = Math.max(0, parseFloat(String(comissao_servico_pct ?? 0)) || 0);
    const pecaPct = Math.max(0, parseFloat(String(comissao_peca_pct ?? 0)) || 0);
    const linkedUserId = user_id && Number(user_id) > 0 ? Number(user_id) : null;
    const isAux = is_auxiliar ? 1 : 0;

    const [result] = await pool.query<any>(
      `INSERT INTO cad_mecanicos
         (tenant_id, user_id, nome, apelido, cpf, telefone, chave_pix, comissao_servico_pct, comissao_peca_pct, ativo, is_auxiliar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        tId,
        linkedUserId,
        String(nome).trim(),
        apelido ? String(apelido).trim() : null,
        cpf ? String(cpf).trim() : null,
        telefone ? String(telefone).trim() : null,
        chave_pix ? String(chave_pix).trim() : null,
        servPct,
        pecaPct,
        isAux,
      ]
    );

    const [[created]] = await pool.query<any>(
      `SELECT m.*, u.nome as user_nome, u.email as user_email
       FROM cad_mecanicos m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`,
      [result.insertId]
    );
    res.status(201).json({
      id: Number(created.id),
      tenant_id: Number(created.tenant_id),
      user_id: created.user_id ? Number(created.user_id) : null,
      user_nome: created.user_nome || null,
      user_email: created.user_email || null,
      nome: created.nome,
      apelido: created.apelido || null,
      cpf: created.cpf || null,
      telefone: created.telefone || null,
      chave_pix: created.chave_pix || null,
      comissao_servico_pct: Number(created.comissao_servico_pct),
      comissao_peca_pct: Number(created.comissao_peca_pct),
      ativo: Boolean(created.ativo),
      is_auxiliar: Boolean(created.is_auxiliar),
    });
  } catch (err: any) {
    console.error('[mecanicos] POST erro:', err);
    res.status(500).json({ message: 'Erro ao cadastrar mecânico / técnico' });
  }
});

// ── PUT /erp/mecanicos/:id ────────────────────────────────────────────────────
router.put('/mecanicos/:id', requireManagerUp, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { nome, apelido, cpf, telefone, chave_pix, comissao_servico_pct, comissao_peca_pct, ativo, is_auxiliar, tenant_id, user_id } = req.body;

    const [[existing]] = await pool.query<any>('SELECT * FROM cad_mecanicos WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ message: 'Mecânico não encontrado' });
      return;
    }

    const servPct = comissao_servico_pct !== undefined ? Math.max(0, parseFloat(String(comissao_servico_pct)) || 0) : Number(existing.comissao_servico_pct);
    const pecaPct = comissao_peca_pct !== undefined ? Math.max(0, parseFloat(String(comissao_peca_pct)) || 0) : Number(existing.comissao_peca_pct);
    const isAtivo = ativo !== undefined ? (Boolean(ativo) ? 1 : 0) : existing.ativo;
    const isAux = is_auxiliar !== undefined ? (Boolean(is_auxiliar) ? 1 : 0) : (existing.is_auxiliar ?? 0);
    const finalTenant = tenant_id ? Number(tenant_id) : existing.tenant_id;
    const linkedUserId = user_id !== undefined ? (user_id && Number(user_id) > 0 ? Number(user_id) : null) : existing.user_id;

    await pool.query(
      `UPDATE cad_mecanicos
       SET user_id = ?, nome = ?, apelido = ?, cpf = ?, telefone = ?, chave_pix = ?,
           comissao_servico_pct = ?, comissao_peca_pct = ?, ativo = ?, is_auxiliar = ?, tenant_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        linkedUserId,
        nome ? String(nome).trim() : existing.nome,
        apelido !== undefined ? (apelido ? String(apelido).trim() : null) : existing.apelido,
        cpf !== undefined ? (cpf ? String(cpf).trim() : null) : existing.cpf,
        telefone !== undefined ? (telefone ? String(telefone).trim() : null) : existing.telefone,
        chave_pix !== undefined ? (chave_pix ? String(chave_pix).trim() : null) : existing.chave_pix,
        servPct,
        pecaPct,
        isAtivo,
        isAux,
        finalTenant,
        id,
      ]
    );

    // Se o nome foi alterado, atualiza também a desnormalização de nome nas OSs e Itens
    if (nome && String(nome).trim() !== existing.nome) {
      await pool.query('UPDATE os_orders SET mecanico_nome = ? WHERE mecanico_id = ?', [String(nome).trim(), id]);
      await pool.query('UPDATE os_orders SET auxiliar_nome = ? WHERE auxiliar_id = ?', [String(nome).trim(), id]);
      await pool.query('UPDATE os_order_items SET mecanico_nome = ? WHERE mecanico_id = ?', [String(nome).trim(), id]);
    }

    const [[updated]] = await pool.query<any>(
      `SELECT m.*, u.nome as user_nome, u.email as user_email
       FROM cad_mecanicos m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`,
      [id]
    );
    res.json({
      id: Number(updated.id),
      tenant_id: Number(updated.tenant_id),
      user_id: updated.user_id ? Number(updated.user_id) : null,
      user_nome: updated.user_nome || null,
      user_email: updated.user_email || null,
      nome: updated.nome,
      apelido: updated.apelido || null,
      cpf: updated.cpf || null,
      telefone: updated.telefone || null,
      chave_pix: updated.chave_pix || null,
      comissao_servico_pct: Number(updated.comissao_servico_pct),
      comissao_peca_pct: Number(updated.comissao_peca_pct),
      ativo: Boolean(updated.ativo),
      is_auxiliar: Boolean(updated.is_auxiliar),
    });
  } catch (err: any) {
    console.error('[mecanicos] PUT erro:', err);
    res.status(500).json({ message: 'Erro ao atualizar mecânico / técnico' });
  }
});

// ── DELETE /erp/mecanicos/:id ─────────────────────────────────────────────────
router.delete('/mecanicos/:id', requireManagerUp, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [[countUsage]] = await pool.query<any>(
      `SELECT
         (SELECT COUNT(*) FROM os_orders WHERE mecanico_id = ?) +
         (SELECT COUNT(*) FROM os_order_items WHERE mecanico_id = ?) AS total_refs`,
      [id, id]
    );

    if (Number(countUsage?.total_refs || 0) > 0) {
      // Inativa para manter integridade dos dados históricos
      await pool.query('UPDATE cad_mecanicos SET ativo = 0, updated_at = NOW() WHERE id = ?', [id]);
      res.json({ message: 'Mecânico inativado com sucesso (histórico de ordens preservado)' });
      return;
    }

    await pool.query('DELETE FROM cad_mecanicos WHERE id = ?', [id]);
    res.json({ message: 'Mecânico excluído com sucesso' });
  } catch (err: any) {
    console.error('[mecanicos] DELETE erro:', err);
    res.status(500).json({ message: 'Erro ao excluir mecânico' });
  }
});

// ── GET /erp/oficina/produtividade ────────────────────────────────────────────
// Relatório completo de produtividade e comissões por mecânico / técnico
router.get('/oficina/produtividade', async (req: Request, res: Response) => {
  try {
    const { data_inicio, data_fim, mecanico_id, status } = req.query as {
      data_inicio?: string;
      data_fim?: string;
      mecanico_id?: string;
      status?: string;
    };

    // Datas padrão: mês atual
    const now = new Date();
    const dtInicio = data_inicio && /^\d{4}-\d{2}-\d{2}$/.test(data_inicio)
      ? data_inicio
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const dtFim = data_fim && /^\d{4}-\d{2}-\d{2}$/.test(data_fim)
      ? data_fim
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { clause: tenantClause, params: tenantParams } = getErpTenantFilter(req, true, 'o.tenant_id');

    // Filtros de status de OS: 'all' (todas exceto orçamentos), 'closed' (apenas finalizadas), 'open' (em andamento)
    let statusFilter = " AND o.status != 'quote'";
    if (status === 'closed') {
      statusFilter = " AND o.status = 'closed'";
    } else if (status === 'open') {
      statusFilter = " AND o.status IN ('open', 'in_progress')";
    }

    // Filtro de mecânico se especificado (inclui titular ou auxiliar da OS)
    let mecItemFilter = '';
    const mecParams: any[] = [];
    if (mecanico_id && Number(mecanico_id) > 0) {
      mecItemFilter = ' AND (oi.mecanico_id = ? OR o.mecanico_id = ? OR o.auxiliar_id = ?)';
      mecParams.push(Number(mecanico_id), Number(mecanico_id), Number(mecanico_id));
    }

    // 1. Busca todos os itens de OS executados no período com seus respectivos mecânicos
    const itemsSql = `
      SELECT
        oi.id AS item_id,
        oi.order_id,
        oi.product_id,
        oi.code,
        oi.description,
        oi.type,
        oi.quantity,
        oi.unit_price,
        oi.labor_price,
        oi.total,
        oi.comissao_pct,
        oi.comissao_valor,
        oi.mecanico_id,
        oi.mecanico_nome,
        o.plate,
        o.model,
        o.mileage,
        o.status AS order_status,
        o.venda_controle,
        o.total_amount AS order_total,
        o.labor_amount AS order_labor,
        o.discount_amount AS order_discount,
        o.client_name,
        o.client_phone,
        o.mecanico_id AS order_mecanico_id,
        o.mecanico_nome AS order_mecanico_nome,
        o.auxiliar_id,
        o.auxiliar_nome,
        o.created_at AS order_created_at,
        o.closed_at AS order_closed_at,
        DATE(COALESCE(o.closed_at, o.created_at)) AS data_referencia,
        m.nome AS cad_mecanico_nome,
        m.apelido AS cad_mecanico_apelido,
        m.comissao_servico_pct AS cad_serv_pct,
        m.comissao_peca_pct AS cad_peca_pct,
        m.chave_pix AS cad_chave_pix
      FROM os_order_items oi
      JOIN os_orders o ON o.id = oi.order_id
      LEFT JOIN cad_mecanicos m ON m.id = oi.mecanico_id
      WHERE DATE(COALESCE(o.closed_at, o.created_at)) BETWEEN ? AND ?
        ${statusFilter}
        ${tenantClause}
        ${mecItemFilter}
      ORDER BY data_referencia DESC, o.plate ASC, oi.created_at ASC
    `;

    const [itemRows] = await pool.query<any>(itemsSql, [dtInicio, dtFim, ...tenantParams, ...mecParams]);

    // 2. Busca lista de mecânicos cadastrados no tenant (para garantir que mesmo os sem OS apareçam no ranking)
    const { clause: mecTenantClause, params: mecTenantParams } = getErpTenantFilter(req, false, 'tenant_id');
    const [allMecanicos] = await pool.query<any>(
      `SELECT * FROM cad_mecanicos ${mecTenantClause} ORDER BY ativo DESC, nome ASC`,
      mecTenantParams
    );

    // 3. Busca pagamentos / adiantamentos efetuados aos mecânicos no período
    const { clause: pagTenantClause, params: pagTenantParams } = getErpTenantFilter(req, true, 'tenant_id');
    const [pagamentosRows] = await pool.query<any>(
      `SELECT
         mecanico_id,
         COALESCE(SUM(valor), 0) AS total_pago,
         COUNT(id) AS qtd_pagamentos
       FROM mecanico_pagamentos
       WHERE data_pagamento BETWEEN ? AND ?
       ${pagTenantClause}
       GROUP BY mecanico_id`,
      [dtInicio, dtFim, ...pagTenantParams]
    );

    const pagamentosMap = new Map<number, number>();
    for (const p of pagamentosRows as any[]) {
      pagamentosMap.set(Number(p.mecanico_id), Number(p.total_pago));
    }

    // 4. Agrega métricas por mecânico
    const mecanicosStats = new Map<number | string, {
      id: number;
      nome: string;
      apelido: string | null;
      cpf: string | null;
      telefone: string | null;
      chave_pix: string | null;
      comissao_servico_pct: number;
      comissao_peca_pct: number;
      ativo: boolean;
      is_auxiliar: boolean;
      qtd_os_set: Set<string>;
      qtd_servicos: number;
      qtd_pecas: number;
      total_servicos: number;
      total_pecas: number;
      total_produzido: number;
      comissao_servicos: number;
      comissao_pecas: number;
      total_comissao: number;
      total_pago: number;
      saldo_a_pagar: number;
      ticket_medio: number;
      share_pct: number;
    }>();

    // Inicializa com todos os mecânicos cadastrados
    for (const m of allMecanicos as any[]) {
      const mId = Number(m.id);
      mecanicosStats.set(mId, {
        id: mId,
        nome: m.nome,
        apelido: m.apelido || null,
        cpf: m.cpf || null,
        telefone: m.telefone || null,
        chave_pix: m.chave_pix || null,
        comissao_servico_pct: Number(m.comissao_servico_pct || 0),
        comissao_peca_pct: Number(m.comissao_peca_pct || 0),
        ativo: Boolean(m.ativo),
        is_auxiliar: Boolean(m.is_auxiliar),
        qtd_os_set: new Set<string>(),
        qtd_servicos: 0,
        qtd_pecas: 0,
        total_servicos: 0,
        total_pecas: 0,
        total_produzido: 0,
        comissao_servicos: 0,
        comissao_pecas: 0,
        total_comissao: 0,
        total_pago: pagamentosMap.get(mId) || 0,
        saldo_a_pagar: 0,
        ticket_medio: 0,
        share_pct: 0,
      });
    }

    // Adiciona slot para "Sem mecânico atribuído" (id 0) caso haja itens sem técnico
    const SEM_MECANICO_KEY = 0;
    mecanicosStats.set(SEM_MECANICO_KEY, {
      id: 0,
      nome: 'Não atribuído / Geral',
      apelido: 'Sem técnico',
      cpf: null,
      telefone: null,
      chave_pix: null,
      comissao_servico_pct: 0,
      comissao_peca_pct: 0,
      ativo: true,
      is_auxiliar: false,
      qtd_os_set: new Set<string>(),
      qtd_servicos: 0,
      qtd_pecas: 0,
      total_servicos: 0,
      total_pecas: 0,
      total_produzido: 0,
      comissao_servicos: 0,
      comissao_pecas: 0,
      total_comissao: 0,
      total_pago: 0,
      saldo_a_pagar: 0,
      ticket_medio: 0,
      share_pct: 0,
    });

    let faturamentoGeralServicos = 0;
    let faturamentoGeralPecas = 0;
    let totalComissoesGeral = 0;
    const osDistintasTotal = new Set<string>();

    const extratoItens: any[] = [];

    for (const row of itemRows as any[]) {
      const mecId = row.mecanico_id ? Number(row.mecanico_id) : 0;
      const isServico = row.type === 'service';
      const qtd = Number(row.quantity);
      const unitPrice = Number(row.unit_price);
      const laborPrice = Number(row.labor_price || 0);
      const totalItem = Number(row.total);

      // Base do serviço e da peça
      const valorServico = isServico ? (totalItem + laborPrice) : laborPrice;
      const valorPeca = isServico ? 0 : totalItem;
      const valorTotalLinha = totalItem + laborPrice;

      // Comissão calculada da linha
      let comissaoLinha = 0;
      let pctAplicado = 0;

      if (row.comissao_valor !== null && row.comissao_valor !== undefined) {
        comissaoLinha = Number(row.comissao_valor);
        pctAplicado = Number(row.comissao_pct || 0);
      } else if (mecId > 0 && mecanicosStats.has(mecId)) {
        // Fallback: calcula baseado nas taxas cadastradas do técnico
        const mec = mecanicosStats.get(mecId)!;
        if (isServico) {
          pctAplicado = mec.comissao_servico_pct;
          comissaoLinha = pctAplicado > 0 ? (valorServico * pctAplicado) / 100 : 0;
        } else {
          pctAplicado = mec.comissao_peca_pct;
          comissaoLinha = pctAplicado > 0 ? (valorPeca * pctAplicado) / 100 : 0;
        }
      }

      faturamentoGeralServicos += valorServico;
      faturamentoGeralPecas += valorPeca;
      totalComissoesGeral += comissaoLinha;
      osDistintasTotal.add(row.order_id);

      // Acumula nas estatísticas do mecânico
      let mecStat = mecanicosStats.get(mecId);
      if (!mecStat) {
        mecStat = {
          id: mecId,
          nome: row.mecanico_nome || row.cad_mecanico_nome || 'Mecânico #' + mecId,
          apelido: row.cad_mecanico_apelido || null,
          cpf: null,
          telefone: null,
          chave_pix: row.cad_chave_pix || null,
          comissao_servico_pct: Number(row.cad_serv_pct || 0),
          comissao_peca_pct: Number(row.cad_peca_pct || 0),
          ativo: true,
          is_auxiliar: false,
          qtd_os_set: new Set<string>(),
          qtd_servicos: 0,
          qtd_pecas: 0,
          total_servicos: 0,
          total_pecas: 0,
          total_produzido: 0,
          comissao_servicos: 0,
          comissao_pecas: 0,
          total_comissao: 0,
          total_pago: pagamentosMap.get(mecId) || 0,
          saldo_a_pagar: 0,
          ticket_medio: 0,
          share_pct: 0,
        };
        mecanicosStats.set(mecId, mecStat);
      }

      const currentMecStat = mecStat;
      currentMecStat.qtd_os_set.add(row.order_id);
      if (isServico) {
        currentMecStat.qtd_servicos += 1;
        currentMecStat.total_servicos += valorServico;
        currentMecStat.comissao_servicos += comissaoLinha;
      } else {
        currentMecStat.qtd_pecas += 1;
        currentMecStat.total_pecas += valorPeca;
        currentMecStat.comissao_pecas += comissaoLinha;
      }
      currentMecStat.total_produzido += valorTotalLinha;
      currentMecStat.total_comissao += comissaoLinha;

      // Se a OS possui Auxiliar atribuído, contabiliza a participação na OS para ele também
      if (row.auxiliar_id && Number(row.auxiliar_id) > 0) {
        const auxId = Number(row.auxiliar_id);
        const auxStat = mecanicosStats.get(auxId);
        if (auxStat) {
          auxStat.qtd_os_set.add(row.order_id);
        }
      }

      extratoItens.push({
        item_id: row.item_id,
        order_id: row.order_id,
        os_numero: String(row.order_id).slice(0, 8).toUpperCase(),
        plate: row.plate,
        model: row.model,
        mileage: Number(row.mileage || 0),
        client_name: row.client_name || 'Sem nome',
        client_phone: row.client_phone || '',
        order_status: row.order_status,
        venda_controle: row.venda_controle || null,
        data_referencia: row.data_referencia,
        data_os: row.order_created_at,
        data_fechamento: row.order_closed_at,
        descricao: row.description,
        codigo: row.code,
        tipo: row.type,
        quantidade: qtd,
        unit_price: unitPrice,
        labor_price: laborPrice,
        total_item: totalItem,
        valor_base: isServico ? valorServico : valorPeca,
        valor_total_linha: valorTotalLinha,
        mecanico_id: mecId > 0 ? mecId : null,
        mecanico_nome: row.mecanico_nome || row.cad_mecanico_nome || (mecId === 0 ? 'Não atribuído' : 'Técnico #' + mecId),
        auxiliar_id: row.auxiliar_id ? Number(row.auxiliar_id) : null,
        auxiliar_nome: row.auxiliar_nome || null,
        comissao_pct: pctAplicado,
        comissao_valor: comissaoLinha,
      });
    }

    // Calcula percentual de participação (share) e saldos por mecânico
    const listaMecanicos = Array.from(mecanicosStats.values())
      .filter(m => m.id !== 0 || m.total_produzido > 0)
      .map(m => {
        const totalProduzido = m.total_servicos + m.total_pecas;
        const totalComissao = m.comissao_servicos + m.comissao_pecas;
        const qtdOs = m.qtd_os_set.size;
        const ticketMedio = qtdOs > 0 ? totalProduzido / qtdOs : 0;
        const sharePct = faturamentoGeralServicos > 0 ? (m.total_servicos / faturamentoGeralServicos) * 100 : 0;
        const saldoAPagar = Math.max(0, totalComissao - m.total_pago);

        return {
          id: m.id,
          nome: m.nome,
          apelido: m.apelido,
          cpf: m.cpf,
          telefone: m.telefone,
          chave_pix: m.chave_pix,
          comissao_servico_pct: m.comissao_servico_pct,
          comissao_peca_pct: m.comissao_peca_pct,
          ativo: m.ativo,
          is_auxiliar: m.is_auxiliar,
          qtd_os: qtdOs,
          qtd_servicos: m.qtd_servicos,
          qtd_pecas: m.qtd_pecas,
          total_servicos: m.total_servicos,
          total_pecas: m.total_pecas,
          total_produzido: totalProduzido,
          comissao_servicos: m.comissao_servicos,
          comissao_pecas: m.comissao_pecas,
          total_comissao: totalComissao,
          total_pago: m.total_pago,
          saldo_a_pagar: saldoAPagar,
          ticket_medio: ticketMedio,
          share_pct: sharePct,
        };
      })
      .sort((a, b) => b.total_servicos - a.total_servicos);

    // Total de pagamentos realizados no período geral
    let totalPagamentosGeral = 0;
    for (const val of pagamentosMap.values()) {
      totalPagamentosGeral += val;
    }

    const faturamentoTotalOficina = faturamentoGeralServicos + faturamentoGeralPecas;
    const qtdOsTotal = osDistintasTotal.size;
    const ticketMedioGeral = qtdOsTotal > 0 ? faturamentoTotalOficina / qtdOsTotal : 0;
    const saldoComissoesPendente = Math.max(0, totalComissoesGeral - totalPagamentosGeral);

    // Mecânico destaque (maior faturamento de serviços com id > 0)
    const topMecanico = listaMecanicos.find(m => m.id > 0 && m.total_servicos > 0) || null;

    res.json({
      periodo: {
        data_inicio: dtInicio,
        data_fim: dtFim,
        status_filtro: status || 'closed',
      },
      resumo: {
        faturamento_total: faturamentoTotalOficina,
        faturamento_servicos: faturamentoGeralServicos,
        faturamento_pecas: faturamentoGeralPecas,
        total_comissoes: totalComissoesGeral,
        total_comissoes_pagas: totalPagamentosGeral,
        saldo_comissoes_pendente: saldoComissoesPendente,
        qtd_os: qtdOsTotal,
        qtd_servicos: extratoItens.filter(i => i.tipo === 'service').length,
        ticket_medio_os: ticketMedioGeral,
        mecanico_destaque: topMecanico ? {
          id: topMecanico.id,
          nome: topMecanico.nome,
          apelido: topMecanico.apelido,
          total_servicos: topMecanico.total_servicos,
          total_comissao: topMecanico.total_comissao,
          share_pct: topMecanico.share_pct,
        } : null,
      },
      mecanicos: listaMecanicos,
      extrato: extratoItens,
    });
  } catch (err: any) {
    console.error('[produtividade] Erro:', err);
    res.status(500).json({ message: 'Erro ao gerar relatório de produtividade e comissões da oficina' });
  }
});

// ── POST /erp/oficina/pagar-comissao ──────────────────────────────────────────
// Registra pagamento de comissão e gera opcionalmente lançamento financeiro em Contas a Pagar
router.post('/oficina/pagar-comissao', requireManagerUp, async (req: Request, res: Response) => {
  try {
    const {
      mecanico_id,
      valor,
      data_pagamento,
      periodo_inicio,
      periodo_fim,
      forma_pagamento = 'PIX',
      observacoes,
      gerar_contas_pagar = true,
      id_caixa,
    } = req.body;

    const mecId = Number(mecanico_id);
    const vrPagto = Math.max(0, parseFloat(String(valor)) || 0);

    if (!mecId || vrPagto <= 0) {
      res.status(400).json({ message: 'Mecânico e valor válido maior que zero são obrigatórios' });
      return;
    }

    const [[mec]] = await pool.query<any>('SELECT * FROM cad_mecanicos WHERE id = ?', [mecId]);
    if (!mec) {
      res.status(404).json({ message: 'Mecânico não encontrado' });
      return;
    }

    const tenantId = Number(mec.tenant_id) || getErpWriteTenantId(req);
    const dtPagto = data_pagamento && /^\d{4}-\d{2}-\d{2}$/.test(data_pagamento) ? data_pagamento : new Date().toISOString().slice(0, 10);
    const user = (req.user as JwtPayload | undefined)?.email ?? 'Admin';

    let lancamentoId: number | null = null;

    // Se solicitado gerar lançamento financeiro em cad_lancamentos
    if (gerar_contas_pagar) {
      const periodoTxt = (periodo_inicio && periodo_fim) ? ` Ref: ${periodo_inicio} a ${periodo_fim}` : '';
      const desc = `Comissão Oficina - ${mec.nome}${periodoTxt}`;
      const obsLanc = observacoes ? ` [${observacoes}]` : '';

      const [insLanc] = await pool.query<any>(
        `INSERT INTO cad_lancamentos
           (id_planejamento, tipo_lancamento, documento, descricao, favorecido, vr_total, vr_liquido,
            data_lancamento, data_vencimento, data_confirmacao, status_lancamento, tenant_id, id_caixa)
         VALUES
           (12, 'D', ?, ?, ?, ?, ?, CURDATE(), ?, ?, 1, ?, ?)`,
        [
          `COMISS-MEC-${mecId}-${Date.now().toString().slice(-6)}`,
          (desc + obsLanc).slice(0, 200),
          `Mecânico: ${mec.nome}`.slice(0, 150),
          vrPagto,
          vrPagto,
          dtPagto,
          dtPagto,
          tenantId,
          id_caixa ? Number(id_caixa) : null,
        ]
      );
      lancamentoId = insLanc.insertId;
    }

    // Registra na tabela de pagamentos de comissão
    const [insPagto] = await pool.query<any>(
      `INSERT INTO mecanico_pagamentos
         (tenant_id, mecanico_id, valor, data_pagamento, periodo_inicio, periodo_fim, forma_pagamento, observacoes, id_lancamento, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        mecId,
        vrPagto,
        dtPagto,
        periodo_inicio || null,
        periodo_fim || null,
        String(forma_pagamento || 'PIX').slice(0, 50),
        observacoes ? String(observacoes).slice(0, 255) : null,
        lancamentoId,
        user.slice(0, 100),
      ]
    );

    res.status(201).json({
      success: true,
      pagamento_id: insPagto.insertId,
      lancamento_id: lancamentoId,
      mecanico_id: mecId,
      mecanico_nome: mec.nome,
      valor: vrPagto,
      data_pagamento: dtPagto,
      forma_pagamento,
      message: `Pagamento de comissão de R$ ${vrPagto.toFixed(2)} registrado com sucesso para ${mec.nome}`,
    });
  } catch (err: any) {
    console.error('[pagar-comissao] Erro:', err);
    res.status(500).json({ message: 'Erro ao registrar pagamento de comissão' });
  }
});

// ── GET /erp/financeiro/dre ──────────────────────────────────────────────────
// Demonstrativo de Resultado do Exercício (DRE Gerencial Simplificado)
router.get('/financeiro/dre', async (req: Request, res: Response) => {
  try {
    const { condition: tenantCondV, params: tenantParamsV } = getErpTenantCondition(req, 'v.tenant_id');
    const { condition: tenantCondL, params: tenantParamsL } = getErpTenantCondition(req, 'l.tenant_id');
    const { condition: tenantCondO, params: tenantParamsO } = getErpTenantCondition(req, 'o.tenant_id');
    const { condition: tenantCondP, params: tenantParamsP } = getErpTenantCondition(req, 'p.tenant_id');

    // Período padrão: mês atual
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultInicio = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const defaultFim = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDayOfMonth)}`;

    const dataInicio = String(req.query.data_inicio || defaultInicio);
    const dataFim = String(req.query.data_fim || defaultFim);
    const regime = req.query.regime === 'caixa' ? 'caixa' : 'competencia';
    const aliquotaImposto = req.query.aliquota_imposto !== undefined ? Math.max(0, Number(req.query.aliquota_imposto)) : 0;

    // 1. Receita de Vendas e CMV por Tipo (Peças vs Serviços)
    const vWhereClause = tenantCondV ? `AND ${tenantCondV}` : '';
    const [itensVendasRows] = await pool.query<any>(
      `SELECT
         COALESCE(t.is_service, 0) as is_service,
         SUM(m.vr_total) as receita_total,
         SUM(m.quant * COALESCE(p.vr_compra, p.vr_custo, 0)) as custo_total,
         SUM(m.quant) as qtd_itens,
         COUNT(DISTINCT m.id_produto) as qtd_produtos_distintos
       FROM mv_vendas_movimento m
       JOIN mv_vendas v ON v.controle = m.controle
       JOIN cad_produtos p ON p.id = m.id_produto
       LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
       WHERE (v.data_venda BETWEEN ? AND ? OR DATE(v.data_venda) BETWEEN ? AND ?)
         ${vWhereClause}
       GROUP BY COALESCE(t.is_service, 0)`,
      [dataInicio, dataFim, dataInicio, dataFim, ...tenantParamsV]
    );

    let receitaPecas = 0;
    let cmvPecas = 0;
    let qtdPecas = 0;
    let receitaServicos = 0;
    let custoServicos = 0;
    let qtdServicos = 0;

    for (const r of itensVendasRows) {
      if (Number(r.is_service) === 1) {
        receitaServicos = Number(r.receita_total || 0);
        custoServicos = Number(r.custo_total || 0);
        qtdServicos = Number(r.qtd_itens || 0);
      } else {
        receitaPecas = Number(r.receita_total || 0);
        cmvPecas = Number(r.custo_total || 0);
        qtdPecas = Number(r.qtd_itens || 0);
      }
    }

    // 2. Totais da Capa de Vendas (Descontos, Acréscimos e Meios de Pagamento)
    const [[vendasTotais]] = await pool.query<any>(
      `SELECT
         COUNT(*) as total_vendas,
         COALESCE(SUM(vr_total), 0) as faturamento_bruto_vendas,
         COALESCE(SUM(vr_desconto), 0) as total_descontos,
         COALESCE(SUM(vr_adicional), 0) as total_acrescimos,
         COALESCE(SUM(vr_cartao), 0) as total_cartao,
         COALESCE(SUM(vr_pix), 0) as total_pix,
         COALESCE(SUM(vr_dinheiro), 0) as total_dinheiro,
         COALESCE(SUM(COALESCE(vr_nota, 0) + COALESCE(vr_carne, 0)), 0) as total_prazo
       FROM mv_vendas v
       WHERE (v.data_venda BETWEEN ? AND ? OR DATE(v.data_venda) BETWEEN ? AND ?)
         ${vWhereClause}`,
      [dataInicio, dataFim, dataInicio, dataFim, ...tenantParamsV]
    );

    const totalVendasQtd = Number(vendasTotais?.total_vendas || 0);
    const totalDescontosVendas = Number(vendasTotais?.total_descontos || 0);
    const totalAcrescimosVendas = Number(vendasTotais?.total_acrescimos || 0);
    const totalCartao = Number(vendasTotais?.total_cartao || 0);
    const totalPix = Number(vendasTotais?.total_pix || 0);
    const totalDinheiro = Number(vendasTotais?.total_dinheiro || 0);
    const totalPrazo = Number(vendasTotais?.total_prazo || 0);

    // Ajusta receita bruta se os itens somarem diferente da capa
    const somaItens = receitaPecas + receitaServicos;
    const faturamentoBrutoVendas = Number(vendasTotais?.faturamento_bruto_vendas || 0);
    if (somaItens === 0 && faturamentoBrutoVendas > 0) {
      receitaPecas = faturamentoBrutoVendas;
    }

    // 3. Comissões da Oficina Apuradas no Período
    const oWhereClause = tenantCondO ? `AND ${tenantCondO}` : '';
    const [[comissoesRow]] = await pool.query<any>(
      `SELECT
         COALESCE(SUM(oi.comissao_valor), 0) as comissoes_geradas
       FROM os_order_items oi
       JOIN os_orders o ON o.id = oi.order_id
       WHERE o.status != 'canceled'
         AND (
           (o.closed_at IS NOT NULL AND DATE(o.closed_at) BETWEEN ? AND ?)
           OR (o.closed_at IS NULL AND DATE(o.created_at) BETWEEN ? AND ?)
         )
         ${oWhereClause}`,
      [dataInicio, dataFim, dataInicio, dataFim, ...tenantParamsO]
    );

    const pWhereClause = tenantCondP ? `AND ${tenantCondP}` : '';
    const [[pagamentosComissoesRow]] = await pool.query<any>(
      `SELECT COALESCE(SUM(valor), 0) as comissoes_pagas
       FROM mecanico_pagamentos p
       WHERE p.data_pagamento BETWEEN ? AND ?
         ${pWhereClause}`,
      [dataInicio, dataFim, ...tenantParamsP]
    );

    // No regime de competência usamos as comissões geradas no período; no regime de caixa, as comissões efetivamente pagas
    const comissoesOficina = regime === 'caixa'
      ? Number(pagamentosComissoesRow?.comissoes_pagas || 0)
      : Number(comissoesRow?.comissoes_geradas || 0);

    // Taxas estimadas de meios de pagamento (média de ~2% sobre cartões)
    const taxasMeiosPagamento = Number((totalCartao * 0.02).toFixed(2));

    // 4. Despesas e Outras Entradas do Plano de Contas (cad_lancamentos)
    const lWhereTenant = tenantCondL ? `AND ${tenantCondL}` : '';
    const dateField = regime === 'caixa' ? 'COALESCE(l.data_confirmacao, l.data_vencimento)' : 'l.data_vencimento';
    const statusFilter = regime === 'caixa' ? 'AND l.status_lancamento = 1' : '';

    const [lancamentosRows] = await pool.query<any>(
      `SELECT
         l.id,
         l.id_planejamento,
         COALESCE(pl.plane_descricao, 'OUTRAS DESPESAS') as categoria_nome,
         pl.plane_cod,
         pl.plane_tipo,
         l.documento,
         l.favorecido,
         l.historico,
         l.data_vencimento,
         l.data_confirmacao,
         l.status_lancamento,
         (l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)) as vr_liquido
       FROM cad_lancamentos l
       LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
       WHERE (DATE(${dateField}) BETWEEN ? AND ?)
         ${statusFilter}
         ${lWhereTenant}
       ORDER BY l.data_vencimento ASC, l.id ASC`,
      [dataInicio, dataFim, ...tenantParamsL]
    );

    // Categorização de Despesas Operacionais e Outras Receitas
    let outrasReceitasOperacionais = 0;
    let receitasFinanceiras = 0;
    let devolucoesConcedidas = 0;
    let despesasPessoal = 0;
    let despesasOcupacao = 0;
    let despesasConsumo = 0;
    let despesasManutencao = 0;
    let despesasTributosLancadas = 0;
    let despesasGeraisAdmin = 0;
    let despesasFinanceiras = 0;
    let comprasFornecedoresEstoque = 0;

    const detalhesPorCategoria: Record<string, { nome: string; total: number; lancamentos: any[] }> = {};

    for (const l of lancamentosRows) {
      const pid = Number(l.id_planejamento || 0);
      const ptipo = l.plane_tipo;
      const valor = Number(l.vr_liquido || 0);
      const catNome = l.categoria_nome;

      if (!detalhesPorCategoria[catNome]) {
        detalhesPorCategoria[catNome] = { nome: catNome, total: 0, lancamentos: [] };
      }
      detalhesPorCategoria[catNome].total += valor;
      detalhesPorCategoria[catNome].lancamentos.push({
        id: l.id,
        documento: l.documento,
        favorecido: l.favorecido,
        historico: l.historico,
        data: l.data_vencimento,
        data_pagamento: l.data_confirmacao,
        valor,
        status: l.status_lancamento === 1 ? 'pago' : 'pendente',
      });

      if (ptipo === 'E') {
        if (pid === 1 || pid === 3) {
          outrasReceitasOperacionais += valor;
        } else if (pid === 2) {
          // Venda realizada (já considerada em mv_vendas)
        } else {
          receitasFinanceiras += valor;
        }
      } else {
        // Despesas (Saídas)
        if (pid === 5) {
          devolucoesConcedidas += valor;
        } else if (pid === 12) {
          despesasPessoal += valor;
        } else if (pid === 10) {
          despesasOcupacao += valor;
        } else if ([6, 7, 8, 9].includes(pid)) {
          despesasConsumo += valor;
        } else if (pid === 14) {
          despesasManutencao += valor;
        } else if (pid === 13) {
          despesasTributosLancadas += valor;
        } else if (pid === 11) {
          comprasFornecedoresEstoque += valor;
        } else {
          despesasGeraisAdmin += valor;
        }
      }
    }

    // 5. Linhas do DRE (Cálculo em Cascata)
    const receitaBrutaTotal = receitaPecas + receitaServicos + outrasReceitasOperacionais;

    // Deduções: Descontos + Devoluções + Impostos s/ Venda
    const impostosVendas = aliquotaImposto > 0
      ? Number(((receitaPecas + receitaServicos) * (aliquotaImposto / 100)).toFixed(2))
      : despesasTributosLancadas;

    const totalDeducoes = totalDescontosVendas + devolucoesConcedidas + impostosVendas;
    const receitaLiquida = Math.max(0, receitaBrutaTotal - totalDeducoes);

    // Custos Variáveis: CMV Peças + Custo Direto Serviços + Comissões + Taxas Cartão
    const totalCustosVariaveis = cmvPecas + custoServicos + comissoesOficina + taxasMeiosPagamento;

    // Margem de Contribuição / Lucro Bruto
    const margemContribuicao = receitaLiquida - totalCustosVariaveis;
    const margemContribuicaoPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;

    // Despesas Fixas e Operacionais
    // (No regime de competência, estoque de fornecedor já entra via CMV das peças vendidas)
    const totalDespesasFixas = despesasPessoal + despesasOcupacao + despesasConsumo + despesasManutencao + despesasGeraisAdmin;

    // Resultado Operacional (EBITDA / LAJIDA)
    const resultadoOperacional = margemContribuicao - totalDespesasFixas;
    const margemOperacionalPct = receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0;

    // Resultado Financeiro
    const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras + totalAcrescimosVendas;

    // Resultado Líquido do Exercício (Lucro Líquido / Prejuízo)
    const resultadoLiquido = resultadoOperacional + resultadoFinanceiro;
    const margemLiquidaPct = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

    // Ponto de Equilíbrio Operacional (Break-even): quanto precisa faturar para cobrir custos e despesas fixas
    const pontoEquilibrio = margemContribuicaoPct > 0
      ? Number((totalDespesasFixas / (margemContribuicaoPct / 100)).toFixed(2))
      : 0;

    // Markup Médio Praticado nas Peças
    const markupMedio = cmvPecas > 0 ? Number((receitaPecas / cmvPecas).toFixed(2)) : 0;

    // 6. Evolução Mensal dos Últimos 6 Meses para o Gráfico de Tendência
    const mesesHistorico = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mY = d.getFullYear();
      const mM = d.getMonth() + 1;
      const mLabel = `${pad(mM)}/${mY}`;
      const mInicio = `${mY}-${pad(mM)}-01`;
      const mFimDia = new Date(mY, mM, 0).getDate();
      const mFim = `${mY}-${pad(mM)}-${pad(mFimDia)}`;

      const [[hFatRow]] = await pool.query<any>(
        `SELECT
           COALESCE(SUM(vr_total), 0) as fat,
           COALESCE(SUM(vr_desconto), 0) as desc_total
         FROM mv_vendas v
         WHERE (v.data_venda BETWEEN ? AND ? OR DATE(v.data_venda) BETWEEN ? AND ?)
           ${vWhereClause}`,
        [mInicio, mFim, mInicio, mFim, ...tenantParamsV]
      );

      const [[hCmvRow]] = await pool.query<any>(
        `SELECT
           COALESCE(SUM(m.quant * COALESCE(p.vr_compra, p.vr_custo, 0)), 0) as cmv
         FROM mv_vendas_movimento m
         JOIN mv_vendas v ON v.controle = m.controle
         JOIN cad_produtos p ON p.id = m.id_produto
         WHERE (v.data_venda BETWEEN ? AND ? OR DATE(v.data_venda) BETWEEN ? AND ?)
           ${vWhereClause}`,
        [mInicio, mFim, mInicio, mFim, ...tenantParamsV]
      );

      const [[hDespRow]] = await pool.query<any>(
        `SELECT
           COALESCE(SUM(l.vr_parcela - COALESCE(l.vr_abatimentos, 0) + COALESCE(l.vr_acrescimo, 0)), 0) as desp
         FROM cad_lancamentos l
         LEFT JOIN cad_planejamento pl ON pl.id = l.id_planejamento
         WHERE l.data_vencimento BETWEEN ? AND ?
           AND (pl.plane_tipo = 'S' OR l.id_planejamento IN (4, 6, 7, 8, 9, 10, 12, 13, 14))
           ${lWhereTenant}`,
        [mInicio, mFim, ...tenantParamsL]
      );

      const mFatLiq = Math.max(0, Number(hFatRow?.fat || 0) - Number(hFatRow?.desc_total || 0));
      const mCmv = Number(hCmvRow?.cmv || 0);
      const mDesp = Number(hDespRow?.desp || 0);
      const mLucro = mFatLiq - mCmv - mDesp;
      const mMargemPct = mFatLiq > 0 ? (mLucro / mFatLiq) * 100 : 0;

      mesesHistorico.push({
        mes: mLabel,
        ano: mY,
        mes_num: mM,
        receita_liquida: mFatLiq,
        cmv: mCmv,
        despesas_fixas: mDesp,
        lucro_liquido: mLucro,
        margem_liquida_pct: Number(mMargemPct.toFixed(1)),
      });
    }

    res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
        regime,
        aliquota_imposto: aliquotaImposto,
      },
      indicadores: {
        receita_bruta: receitaBrutaTotal,
        receita_liquida: receitaLiquida,
        total_custos_variaveis: totalCustosVariaveis,
        margem_contribuicao: margemContribuicao,
        margem_contribuicao_pct: Number(margemContribuicaoPct.toFixed(2)),
        total_despesas_fixas: totalDespesasFixas,
        resultado_operacional: resultadoOperacional,
        margem_operacional_pct: Number(margemOperacionalPct.toFixed(2)),
        resultado_liquido: resultadoLiquido,
        margem_liquida_pct: Number(margemLiquidaPct.toFixed(2)),
        ponto_equilibrio: pontoEquilibrio,
        markup_medio: markupMedio,
        total_vendas_qtd: totalVendasQtd,
        ticket_medio: totalVendasQtd > 0 ? Number((receitaLiquida / totalVendasQtd).toFixed(2)) : 0,
      },
      linhas_dre: [
        {
          codigo: '1',
          descricao: 'RECEITA OPERACIONAL BRUTA',
          tipo: 'titulo',
          valor: receitaBrutaTotal,
          percentual: receitaLiquida > 0 ? Number(((receitaBrutaTotal / receitaLiquida) * 100).toFixed(2)) : 100,
          filhos: [
            {
              codigo: '1.1',
              descricao: 'Venda de Peças e Produtos',
              valor: receitaPecas,
              percentual: receitaLiquida > 0 ? Number(((receitaPecas / receitaLiquida) * 100).toFixed(2)) : 0,
              detalhes: { qtd_itens: qtdPecas },
            },
            {
              codigo: '1.2',
              descricao: 'Prestação de Serviços / Mão de Obra',
              valor: receitaServicos,
              percentual: receitaLiquida > 0 ? Number(((receitaServicos / receitaLiquida) * 100).toFixed(2)) : 0,
              detalhes: { qtd_itens: qtdServicos },
            },
            {
              codigo: '1.3',
              descricao: 'Outras Receitas Operacionais',
              valor: outrasReceitasOperacionais,
              percentual: receitaLiquida > 0 ? Number(((outrasReceitasOperacionais / receitaLiquida) * 100).toFixed(2)) : 0,
            },
          ],
        },
        {
          codigo: '2',
          descricao: '(-) DEDUÇÕES DA RECEITA BRUTA',
          tipo: 'deducao',
          valor: -totalDeducoes,
          percentual: receitaLiquida > 0 ? Number(((-totalDeducoes / receitaLiquida) * 100).toFixed(2)) : 0,
          filhos: [
            {
              codigo: '2.1',
              descricao: 'Descontos Comerciais Concedidos',
              valor: -totalDescontosVendas,
              percentual: receitaLiquida > 0 ? Number(((-totalDescontosVendas / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '2.2',
              descricao: 'Devoluções e Cancelamentos',
              valor: -devolucoesConcedidas,
              percentual: receitaLiquida > 0 ? Number(((-devolucoesConcedidas / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '2.3',
              descricao: 'Tributos e Impostos sobre Faturamento',
              valor: -impostosVendas,
              percentual: receitaLiquida > 0 ? Number(((-impostosVendas / receitaLiquida) * 100).toFixed(2)) : 0,
              detalhes: { aliquota_estimada_pct: aliquotaImposto },
            },
          ],
        },
        {
          codigo: '3',
          descricao: '(=) RECEITA OPERACIONAL LÍQUIDA',
          tipo: 'subtotal',
          valor: receitaLiquida,
          percentual: 100.0,
        },
        {
          codigo: '4',
          descricao: '(-) CUSTOS VARIÁVEIS / CMV & COMISSÕES',
          tipo: 'deducao',
          valor: -totalCustosVariaveis,
          percentual: receitaLiquida > 0 ? Number(((-totalCustosVariaveis / receitaLiquida) * 100).toFixed(2)) : 0,
          filhos: [
            {
              codigo: '4.1',
              descricao: 'Custo das Mercadorias Vendidas (CMV Peças)',
              valor: -cmvPecas,
              percentual: receitaLiquida > 0 ? Number(((-cmvPecas / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '4.2',
              descricao: 'Custos Diretos de Mão de Obra / Serviços',
              valor: -custoServicos,
              percentual: receitaLiquida > 0 ? Number(((-custoServicos / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '4.3',
              descricao: 'Comissões de Mecânicos / Técnicos',
              valor: -comissoesOficina,
              percentual: receitaLiquida > 0 ? Number(((-comissoesOficina / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '4.4',
              descricao: 'Taxas de Meios de Pagamento (Cartões / PIX)',
              valor: -taxasMeiosPagamento,
              percentual: receitaLiquida > 0 ? Number(((-taxasMeiosPagamento / receitaLiquida) * 100).toFixed(2)) : 0,
            },
          ],
        },
        {
          codigo: '5',
          descricao: '(=) LUCRO BRUTO / MARGEM DE CONTRIBUIÇÃO',
          tipo: 'destaque',
          valor: margemContribuicao,
          percentual: Number(margemContribuicaoPct.toFixed(2)),
        },
        {
          codigo: '6',
          descricao: '(-) DESPESAS OPERACIONAIS FIXAS',
          tipo: 'deducao',
          valor: -totalDespesasFixas,
          percentual: receitaLiquida > 0 ? Number(((-totalDespesasFixas / receitaLiquida) * 100).toFixed(2)) : 0,
          filhos: [
            {
              codigo: '6.1',
              descricao: 'Pessoal e Pró-Labore',
              valor: -despesasPessoal,
              percentual: receitaLiquida > 0 ? Number(((-despesasPessoal / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '6.2',
              descricao: 'Ocupação e Imóvel (Aluguel / Condomínio)',
              valor: -despesasOcupacao,
              percentual: receitaLiquida > 0 ? Number(((-despesasOcupacao / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '6.3',
              descricao: 'Contas de Consumo (Luz, Água, Internet, Telefone)',
              valor: -despesasConsumo,
              percentual: receitaLiquida > 0 ? Number(((-despesasConsumo / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '6.4',
              descricao: 'Manutenção da Oficina & Ferramental',
              valor: -despesasManutencao,
              percentual: receitaLiquida > 0 ? Number(((-despesasManutencao / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '6.5',
              descricao: 'Despesas Gerais e Administrativas',
              valor: -despesasGeraisAdmin,
              percentual: receitaLiquida > 0 ? Number(((-despesasGeraisAdmin / receitaLiquida) * 100).toFixed(2)) : 0,
            },
          ],
        },
        {
          codigo: '7',
          descricao: '(=) RESULTADO OPERACIONAL (EBITDA / LAJIDA)',
          tipo: 'subtotal',
          valor: resultadoOperacional,
          percentual: Number(margemOperacionalPct.toFixed(2)),
        },
        {
          codigo: '8',
          descricao: '(+/-) RESULTADO FINANCEIRO',
          tipo: 'resultado_financeiro',
          valor: resultadoFinanceiro,
          percentual: receitaLiquida > 0 ? Number(((resultadoFinanceiro / receitaLiquida) * 100).toFixed(2)) : 0,
          filhos: [
            {
              codigo: '8.1',
              descricao: 'Receitas Financeiras (Juros / Descontos Obtidos)',
              valor: receitasFinanceiras + totalAcrescimosVendas,
              percentual: receitaLiquida > 0 ? Number((((receitasFinanceiras + totalAcrescimosVendas) / receitaLiquida) * 100).toFixed(2)) : 0,
            },
            {
              codigo: '8.2',
              descricao: 'Despesas Financeiras (Juros Pagos / Tarifas)',
              valor: -despesasFinanceiras,
              percentual: receitaLiquida > 0 ? Number(((-despesasFinanceiras / receitaLiquida) * 100).toFixed(2)) : 0,
            },
          ],
        },
        {
          codigo: '9',
          descricao: '(=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO / PREJUÍZO)',
          tipo: 'total_final',
          valor: resultadoLiquido,
          percentual: Number(margemLiquidaPct.toFixed(2)),
        },
      ],
      meios_pagamento: {
        dinheiro: totalDinheiro,
        pix: totalPix,
        cartao: totalCartao,
        prazo: totalPrazo,
      },
      compras_fornecedores_periodo: comprasFornecedoresEstoque,
      historico_mensal: mesesHistorico,
      detalhes_categorias: detalhesPorCategoria,
    });
  } catch (err: any) {
    console.error('[DRE Gerencial] Erro:', err);
    res.status(500).json({ message: 'Erro ao gerar DRE Gerencial' });
  }
});

export default router;
