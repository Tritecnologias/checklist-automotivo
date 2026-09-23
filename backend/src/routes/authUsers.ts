import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, requireAuth, requireRole, type JwtPayload } from '../middleware/auth';

const router = Router();

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ message: 'Email e senha obrigatórios' });
    return;
  }

  try {
    const [rows] = await pool.query<any>(
      'SELECT id, nome, email, senha_hash, role, tenant_id, ativo FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !user.ativo) {
      res.status(401).json({ message: 'Credenciais inválidas' });
      return;
    }

    const ok = await bcrypt.compare(password, user.senha_hash);
    if (!ok) {
      res.status(401).json({ message: 'Credenciais inválidas' });
      return;
    }

    // Carregar tenants acessíveis
    let tenantIds: number[] = [];
    if (user.role === 'owner') {
      tenantIds = [];
    } else {
      // manager, operator e caixa: checar user_tenants primeiro (multi-loja)
      const [tRows] = await pool.query<any>(
        'SELECT tenant_id FROM user_tenants WHERE user_id = ?', [user.id]
      );
      tenantIds = tRows.map((r: any) => r.tenant_id);
      // fallback: tenant_id direto na tabela users (usuários com uma única loja)
      if (tenantIds.length === 0 && user.tenant_id) {
        tenantIds = [user.tenant_id];
      }
    }

    // se o usuário tem múltiplas lojas, não pré-seleciona; o app vai pedir escolha
    const activetenantId = tenantIds.length === 1 ? tenantIds[0] : (user.tenant_id ?? null);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: activetenantId,
      tenantIds,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Carregar dados dos tenants para o frontend
    let tenantsQuery = 'SELECT id, nome, slug FROM tenants WHERE ativo = 1';
    const tenantsParams: any[] = [];
    if (user.role !== 'owner' && tenantIds.length > 0) {
      tenantsQuery += ` AND id IN (${tenantIds.map(() => '?').join(',')})`;
      tenantsParams.push(...tenantIds);
    } else if (user.role !== 'owner') {
      tenantsQuery += ' AND 1=0'; // sem acesso
    }
    const [tenants] = await pool.query<any>(tenantsQuery, tenantsParams);

    res.json({
      token,
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role },
      tenants,
    });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query<any>(
      'SELECT id, nome, email, role, tenant_id, ativo FROM users WHERE id = ?',
      [req.user!.userId]
    );
    const user = rows[0];
    if (!user) { res.status(404).json({ message: 'Usuário não encontrado' }); return; }

    let tenantsQuery = 'SELECT id, nome, slug FROM tenants WHERE ativo = 1';
    const tenantsParams: any[] = [];
    if (user.role === 'manager') {
      const [tRows] = await pool.query<any>(
        'SELECT tenant_id FROM user_tenants WHERE user_id = ?', [user.id]
      );
      const ids = tRows.map((r: any) => r.tenant_id);
      if (ids.length > 0) {
        tenantsQuery += ` AND id IN (${ids.map(() => '?').join(',')})`;
        tenantsParams.push(...ids);
      } else {
        tenantsQuery += ' AND 1=0';
      }
    } else if (user.role === 'operator' || user.role === 'caixa') {
      // checar user_tenants (multi-loja) primeiro, depois fallback para tenant_id
      const [tRows] = await pool.query<any>(
        'SELECT tenant_id FROM user_tenants WHERE user_id = ?', [user.id]
      );
      const ids: number[] = tRows.map((r: any) => r.tenant_id);
      if (ids.length > 0) {
        tenantsQuery += ` AND id IN (${ids.map(() => '?').join(',')})`;
        tenantsParams.push(...ids);
      } else if (user.tenant_id) {
        tenantsQuery += ' AND id = ?';
        tenantsParams.push(user.tenant_id);
      } else {
        tenantsQuery += ' AND 1=0';
      }
    }

    const [tenants] = await pool.query<any>(tenantsQuery, tenantsParams);
    res.json({ user: { id: user.id, nome: user.nome, email: user.email, role: user.role }, tenants });
  } catch (err) {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── POST /auth/users — criar usuário (owner only) ─────────────────────────────

router.post('/users', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { nome, email, password, role, tenant_id, tenant_ids } = req.body as {
    nome?: string; email?: string; password?: string;
    role?: string; tenant_id?: number; tenant_ids?: number[];
  };

  if (!nome || !email || !password || !role) {
    res.status(400).json({ message: 'nome, email, password e role são obrigatórios' });
    return;
  }
  if (!['owner', 'manager', 'operator', 'caixa'].includes(role)) {
    res.status(400).json({ message: 'role inválida' });
    return;
  }
  // manager só pode criar operator e caixa
  if (req.user!.role === 'manager' && !['operator', 'caixa'].includes(role)) {
    res.status(403).json({ message: 'Manager só pode criar operadores e caixas' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query<any>(
      'INSERT INTO users (nome, email, senha_hash, role, tenant_id) VALUES (?,?,?,?,?)',
      [nome, email.toLowerCase().trim(), hash, role, tenant_id ?? null]
    );
    const userId = result.insertId;

    // associar múltiplos tenants via user_tenants (manager, operator e caixa com multi-loja)
    if (Array.isArray(tenant_ids) && tenant_ids.length > 0) {
      const vals = tenant_ids.map(tid => [userId, tid]);
      await pool.query('INSERT IGNORE INTO user_tenants (user_id, tenant_id) VALUES ?', [vals]);
    }

    res.status(201).json({ id: userId, nome, email, role });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Email já cadastrado' });
      return;
    }
    console.error('POST /auth/users error:', err);
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── GET /auth/users — listar usuários (owner/manager) ────────────────────────

router.get('/users', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.query<any>(
      `SELECT u.id, u.nome, u.email, u.role, u.tenant_id, u.ativo,
              t.nome AS tenant_nome,
              (SELECT COUNT(*) FROM user_tenants ut WHERE ut.user_id = u.id) AS tenant_count
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       ORDER BY u.nome`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── GET /auth/users/:id/tenants — lojas do usuário ───────────────────────────

router.get('/users/:id/tenants', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.query<any>(
      'SELECT tenant_id FROM user_tenants WHERE user_id = ?', [req.params.id]
    );
    res.json(rows.map((r: any) => r.tenant_id));
  } catch (err) {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── PATCH /auth/users/:id — editar usuário ────────────────────────────────────

router.patch('/users/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const { nome, role, tenant_id, tenant_ids, ativo, password } = req.body as {
    nome?: string; role?: string; tenant_id?: number | null;
    tenant_ids?: number[]; ativo?: boolean; password?: string;
  };
  try {
    const fields: string[] = [];
    const vals: any[] = [];
    if (nome)       { fields.push('nome = ?');      vals.push(nome); }
    if (role)       { fields.push('role = ?');       vals.push(role); }
    if (tenant_id !== undefined) { fields.push('tenant_id = ?'); vals.push(tenant_id); }
    if (ativo !== undefined)     { fields.push('ativo = ?');     vals.push(ativo ? 1 : 0); }
    if (password) {
      fields.push('senha_hash = ?');
      vals.push(await bcrypt.hash(password, 12));
    }
    if (fields.length > 0) {
      vals.push(req.params.id);
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    }

    // Sincronizar user_tenants se tenant_ids foi enviado
    if (Array.isArray(tenant_ids)) {
      await pool.query('DELETE FROM user_tenants WHERE user_id = ?', [req.params.id]);
      if (tenant_ids.length > 0) {
        const rows = tenant_ids.map(tid => [Number(req.params.id), tid]);
        await pool.query('INSERT IGNORE INTO user_tenants (user_id, tenant_id) VALUES ?', [rows]);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// ── POST /auth/select-tenant — trocar loja ativa ─────────────────────────────

router.post('/select-tenant', requireAuth, async (req, res) => {
  const { tenantId } = req.body as { tenantId?: number };
  if (!tenantId) {
    res.status(400).json({ message: 'tenantId obrigatório' });
    return;
  }

  try {
    const user = req.user!;

    // Owner pode selecionar qualquer tenant; outros verificam acesso
    if (user.role !== 'owner') {
      const [rows] = await pool.query<any>(
        `SELECT 1 FROM user_tenants WHERE user_id = ? AND tenant_id = ?
         UNION
         SELECT 1 FROM users WHERE id = ? AND tenant_id = ?`,
        [user.userId, tenantId, user.userId, tenantId]
      );
      if ((rows as any[]).length === 0) {
        res.status(403).json({ message: 'Sem acesso a esta loja' });
        return;
      }
    }

    const newPayload: JwtPayload = {
      ...user,
      tenantId,
    };
    const token = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Erro interno' });
  }
});

export default router;
