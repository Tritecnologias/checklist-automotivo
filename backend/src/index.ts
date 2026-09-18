import express from 'express';
import cors from 'cors';
import itemsRouter  from './routes/items';
import ordersRouter from './routes/orders';
import authRouter   from './routes/auth';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.use('/items',  itemsRouter);
app.use('/orders', ordersRouter);
app.use('/auth',   authRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API 4Rodas rodando em http://0.0.0.0:${PORT}`);
});
