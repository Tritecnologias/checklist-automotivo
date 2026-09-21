import express from 'express';
import cors from 'cors';
import itemsRouter  from './routes/items';
import ordersRouter from './routes/orders';
import authRouter   from './routes/auth';
import adminRouter  from './routes/admin';
import erpRouter    from './routes/erp';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API 4Rodas rodando em http://0.0.0.0:${PORT}`);
});
