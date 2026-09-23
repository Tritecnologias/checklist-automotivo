import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('owner'));

// ── GET /tenants ──────────────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  const [rows] = await pool.query<any>(
    'SELECT id, nome, slug, ativo, created_at FROM tenants ORDER BY nome'
  );
  res.json(rows);
});

// ── POST /tenants ─────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { nome, slug } = req.body as { nome?: string; slug?: string };
  if (!nome || !slug) {
    res.status(400).json({ message: 'nome e slug obrigatórios' });
    return;
  }
  try {
    const [r] = await pool.query<any>(
      'INSERT INTO tenants (nome, slug) VALUES (?, ?)', [nome, slug]
    );
    res.status(201).json({ id: r.insertId, nome, slug, ativo: 1 });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Slug já em uso' });
      return;
    }
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── PATCH /tenants/:id ────────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  const { nome, ativo } = req.body as { nome?: string; ativo?: boolean };
  const fields: string[] = [];
  const vals: any[] = [];
  if (nome)           { fields.push('nome = ?');  vals.push(nome); }
  if (ativo !== undefined) { fields.push('ativo = ?'); vals.push(ativo ? 1 : 0); }
  if (!fields.length) { res.status(400).json({ message: 'Nada para atualizar' }); return; }
  vals.push(req.params.id);
  await pool.query(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
});

export default router;
