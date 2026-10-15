import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET } from '../middleware/auth';

const router = Router();

router.post('/verify-supervisor-pin', async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };

  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ message: 'PIN deve ter exatamente 4 dígitos' });
    return;
  }

  try {
    // Verifica no banco de dados
    const [rows] = await pool.execute(
      'SELECT supervisor_name FROM os_supervisor_pins WHERE pin = ? AND active = 1',
      [pin],
    );
    const record = (rows as { supervisor_name: string }[])[0];

    if (record) {
      res.json({ authorized: true, supervisorName: record.supervisor_name });
      return;
    }

    // Fallback: PIN de variável de ambiente (para dev/override rápido)
    const envPin = process.env.SUPERVISOR_PIN;
    if (envPin && pin === envPin) {
      res.json({ authorized: true, supervisorName: 'Supervisor' });
      return;
    }

    res.json({ authorized: false });
  } catch (err) {
    console.error('POST /auth/verify-supervisor-pin error:', err);
    res.status(500).json({ message: 'Erro ao verificar PIN' });
  }
});

/**
 * POST /auth/authorize-discount
 * Autoriza desconto mediante seleção de um Administrador ou Gerente e sua respectiva senha.
 * Também mantém suporte a PIN como fallback para compatibilidade.
 */
router.post('/authorize-discount', async (req: Request, res: Response) => {
  const { userId, email, password, tenantId, pin } = req.body as {
    userId?: number;
    email?: string;
    password?: string;
    tenantId?: number;
    pin?: string;
  };

  try {
    // 1. Autorização via seleção de Administrador/Gerente + Senha
    if (password && (userId || email)) {
      let query = 'SELECT id, nome, email, senha_hash, role, tenant_id, ativo FROM users WHERE ';
      const params: any[] = [];
      if (userId && Number(userId) > 0) {
        query += 'id = ?';
        params.push(Number(userId));
      } else {
        query += 'LOWER(TRIM(email)) = LOWER(TRIM(?))';
        params.push(email!);
      }

      const [rows] = await pool.query<any>(query, params);
      const user = rows[0];

      if (!user || !user.ativo) {
        res.status(401).json({ authorized: false, message: 'Usuário não encontrado ou está inativo no sistema.' });
        return;
      }

      if (!['owner', 'manager'].includes(user.role)) {
        res.status(403).json({
          authorized: false,
          message: 'Apenas Administradores ou Gerentes possuem permissão para autorizar descontos.',
        });
        return;
      }

      // Se for gerente e tenantId foi informado, verifica se tem acesso à unidade
      if (user.role === 'manager' && tenantId && Number(tenantId) > 0) {
        const [tRows] = await pool.query<any>(
          'SELECT tenant_id FROM user_tenants WHERE user_id = ?',
          [user.id]
        );
        const tenantIds: number[] = tRows.map((r: any) => Number(r.tenant_id));
        if (user.tenant_id) {
          tenantIds.push(Number(user.tenant_id));
        }
        if (tenantIds.length > 0 && !tenantIds.includes(Number(tenantId))) {
          res.status(403).json({
            authorized: false,
            message: 'O gerente selecionado não possui permissão para esta unidade/loja.',
          });
          return;
        }
      }

      const ok = await bcrypt.compare(password.trim(), user.senha_hash);
      if (!ok) {
        res.status(401).json({ authorized: false, message: 'Senha de acesso incorreta.' });
        return;
      }

      const supervisorToken = jwt.sign(
        {
          supervisorId: user.id,
          supervisorName: user.nome,
          supervisorRole: user.role,
          type: 'discount_auth',
        },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      res.json({
        authorized: true,
        supervisorId: user.id,
        supervisorName: user.nome,
        supervisorRole: user.role === 'owner' ? 'Proprietário' : 'Gerente',
        token: supervisorToken,
      });
      return;
    }

    // 2. Fallback por PIN de 4 dígitos (compatibilidade retroativa)
    if (pin && /^\d{4}$/.test(pin)) {
      const [rows] = await pool.execute(
        'SELECT supervisor_name FROM os_supervisor_pins WHERE pin = ? AND active = 1',
        [pin],
      );
      const record = (rows as { supervisor_name: string }[])[0];

      if (record) {
        const supervisorToken = jwt.sign(
          {
            supervisorName: record.supervisor_name,
            supervisorRole: 'manager',
            type: 'discount_auth',
          },
          JWT_SECRET,
          { expiresIn: '2h' }
        );
        res.json({ authorized: true, supervisorName: record.supervisor_name, token: supervisorToken });
        return;
      }

      const envPin = process.env.SUPERVISOR_PIN;
      if (envPin && pin === envPin) {
        const supervisorToken = jwt.sign(
          {
            supervisorName: 'Supervisor',
            supervisorRole: 'owner',
            type: 'discount_auth',
          },
          JWT_SECRET,
          { expiresIn: '2h' }
        );
        res.json({ authorized: true, supervisorName: 'Supervisor', token: supervisorToken });
        return;
      }

      res.status(401).json({ authorized: false, message: 'PIN inválido.' });
      return;
    }

    res.status(400).json({ authorized: false, message: 'Selecione um administrador/gerente e informe a senha.' });
  } catch (err) {
    console.error('POST /auth/authorize-discount error:', err);
    res.status(500).json({ authorized: false, message: 'Erro interno ao validar autorização de desconto.' });
  }
});

export default router;
