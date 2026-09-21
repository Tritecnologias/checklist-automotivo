import express from 'express';
import cors from 'cors';
import { pool } from './db';
import itemsRouter  from './routes/items';
import ordersRouter from './routes/orders';
import authRouter   from './routes/auth';
import adminRouter  from './routes/admin';
import erpRouter    from './routes/erp';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

async function runMigrations() {
  const [[{ cnt }]] = await pool.query<any>(
    `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_order_items' AND COLUMN_NAME = 'labor_price'`
  );
  if (Number(cnt) === 0) {
    await pool.query(
      'ALTER TABLE os_order_items ADD COLUMN labor_price DECIMAL(10,2) NOT NULL DEFAULT 0'
    );
    console.log('[migration] os_order_items.labor_price adicionada');
  }
}

app.use(cors());
app.use(express.json());

app.use('/items',  itemsRouter);
app.use('/orders', ordersRouter);
app.use('/auth',   authRouter);
app.use('/admin',  adminRouter);
app.use('/erp',    erpRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err?.message ?? err);
  res.status(500).json({ message: err?.message ?? 'Erro interno' });
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[UnhandledRejection]', reason?.message ?? reason);
});

runMigrations().catch(e => console.error('[migration error]', e));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API 4Rodas rodando em http://0.0.0.0:${PORT}`);
});
