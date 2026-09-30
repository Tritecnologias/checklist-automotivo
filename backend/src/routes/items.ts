import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();

  if (search.length < 2) {
    res.json([]);
    return;
  }

  const tenantHeader = Number(req.headers['x-tenant-id']);
  const tenantId = tenantHeader > 0 ? tenantHeader : 1;

  try {
    const like = `%${search}%`;
    const [rows] = await pool.query<any>(
      `SELECT
         p.id,
         COALESCE(NULLIF(TRIM(p.cod_barra), ''), CONCAT('ID', LPAD(p.id, 6, '0'))) AS code,
         CONVERT(p.nome_produto USING utf8mb4) AS description,
         CASE WHEN COALESCE(t.is_service, 0) = 1 OR p.id_tipo IN (2, 9) THEN 'service' ELSE 'part' END AS type,
         CAST(p.vr_venda  AS DECIMAL(18,4)) AS unitPrice,
         CAST(COALESCE(pst.saldo, IF(? = 1, p.estoque, 0)) AS DECIMAL(18,4)) AS stock,
         COALESCE(p.controla_estoque, 1)    AS controlaEstoque
       FROM cad_produtos p
       LEFT JOIN cad_produtos_tipo t ON t.id = p.id_tipo
       LEFT JOIN produto_saldo_tenant pst ON pst.produto_id = p.id AND pst.tenant_id = ?
       WHERE p.inativo = 0
         AND (p.nome_produto LIKE ? OR p.cod_barra LIKE ?)
       ORDER BY p.nome_produto
       LIMIT 30`,
      [tenantId, tenantId, like, like],
    );

    const products = (rows as Record<string, unknown>[]).map(r => ({
      id: r.id as number,
      code: r.code as string,
      description: r.description as string,
      type: r.type as string,
      unitPrice: Number(r.unitPrice),
      stock: Number(r.stock),
      controlaEstoque: Number(r.controlaEstoque ?? 1) === 1,
    }));

    // Buscar instalações separadamente para evitar problemas com JSON_ARRAYAGG
    const instMap = new Map<number, { id: number; sigla: string; nome: string }[]>();
    if (products.length > 0) {
      const ids = products.map(p => p.id);
      const placeholders = ids.map(() => '?').join(',');
      const [instRows] = await pool.query<any>(
        `SELECT pit.produto_id, i.id, i.sigla, i.nome
         FROM produto_instalacao pit
         JOIN instalacoes i ON i.id = pit.instalacao_id
         WHERE pit.produto_id IN (${placeholders})
         ORDER BY i.ordem`,
        ids,
      );
      for (const row of instRows as Record<string, unknown>[]) {
        const pid = row.produto_id as number;
        if (!instMap.has(pid)) instMap.set(pid, []);
        instMap.get(pid)!.push({
          id: row.id as number,
          sigla: row.sigla as string,
          nome: row.nome as string,
        });
      }
    }

    const items = products.map(p => ({
      ...p,
      instalacoes: instMap.get(p.id) ?? [],
    }));

    res.json(items);
  } catch (err) {
    console.error('GET /items error:', err);
    res.status(500).json({ message: 'Erro ao buscar itens no catálogo' });
  }
});

export default router;
