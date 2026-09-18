import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();

  if (search.length < 2) {
    res.json([]);
    return;
  }

  try {
    const like = `%${search}%`;
    const [rows] = await pool.execute(
      `SELECT
         p.id,
         COALESCE(NULLIF(TRIM(p.cod_barra), ''), CONCAT('ID', LPAD(p.id, 6, '0'))) AS code,
         CONVERT(p.nome_produto USING utf8mb4) AS description,
         CASE WHEN p.id_tipo IN (2, 9) THEN 'service' ELSE 'part' END AS type,
         CAST(p.vr_venda  AS DECIMAL(18,4)) AS unitPrice,
         CAST(p.estoque   AS DECIMAL(18,4)) AS stock
       FROM cad_produtos p
       WHERE p.inativo = 0
         AND (p.nome_produto LIKE ? OR p.cod_barra LIKE ?)
       ORDER BY p.nome_produto
       LIMIT 30`,
      [like, like],
    );

    const items = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      unitPrice: Number(r.unitPrice),
      stock: Number(r.stock),
    }));
    res.json(items);
  } catch (err) {
    console.error('GET /items error:', err);
    res.status(500).json({ message: 'Erro ao buscar itens no catálogo' });
  }
});

export default router;
