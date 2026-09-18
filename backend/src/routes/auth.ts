import { Router, Request, Response } from 'express';
import { pool } from '../db';

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

export default router;
