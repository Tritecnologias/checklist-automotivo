import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { pool } from './db';
import itemsRouter     from './routes/items';
import ordersRouter    from './routes/orders';
import authRouter      from './routes/auth';
import authUsersRouter from './routes/authUsers';
import tenantsRouter   from './routes/tenants';
import adminRouter     from './routes/admin';
import erpRouter       from './routes/erp';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);

async function runMigrations() {
  // labor_price em os_order_items
  const [[{ cnt1 }]] = await pool.query<any>(
    `SELECT COUNT(*) as cnt1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_order_items' AND COLUMN_NAME = 'labor_price'`
  );
  if (Number(cnt1) === 0) {
    await pool.query(
      'ALTER TABLE os_order_items ADD COLUMN labor_price DECIMAL(10,2) NOT NULL DEFAULT 0'
    );
    console.log('[migration] os_order_items.labor_price adicionada');
  }

  // labor_amount em os_orders
  const [[{ cntLabor }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntLabor FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'labor_amount'`
  );
  if (Number(cntLabor) === 0) {
    await pool.query('ALTER TABLE os_orders ADD COLUMN labor_amount DECIMAL(10,2) NOT NULL DEFAULT 0');
    console.log('[migration] os_orders.labor_amount adicionada');
  }

  // closed_at em os_orders
  const [[{ cnt2 }]] = await pool.query<any>(
    `SELECT COUNT(*) as cnt2 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'closed_at'`
  );
  if (Number(cnt2) === 0) {
    await pool.query('ALTER TABLE os_orders ADD COLUMN closed_at DATETIME NULL DEFAULT NULL');
    console.log('[migration] os_orders.closed_at adicionada');
  }

  // tenant_id em os_orders
  const [[{ cnt3 }]] = await pool.query<any>(
    `SELECT COUNT(*) as cnt3 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'tenant_id'`
  );
  if (Number(cnt3) === 0) {
    await pool.query('ALTER TABLE os_orders ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    await pool.query('UPDATE os_orders SET tenant_id = 1 WHERE tenant_id = 0 OR tenant_id IS NULL');
    console.log('[migration] os_orders.tenant_id adicionada (registros existentes → tenant 1)');
  }

  // Tabela tenants
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`tenants\` (
      \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
      \`nome\`       VARCHAR(100) NOT NULL,
      \`slug\`       VARCHAR(50)  NOT NULL,
      \`ativo\`      TINYINT(1)   NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`slug\` (\`slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(
    'INSERT IGNORE INTO tenants (id, nome, slug) VALUES (1, ?, ?)',
    ['Loja Principal', 'loja-principal']
  );

  // Tabela users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
      \`nome\`       VARCHAR(100) NOT NULL,
      \`email\`      VARCHAR(150) NOT NULL,
      \`senha_hash\` VARCHAR(255) NOT NULL,
      \`role\`       ENUM('owner','manager','operator') NOT NULL DEFAULT 'operator',
      \`tenant_id\`  INT NULL,
      \`ativo\`      TINYINT(1)   NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`email\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tabela user_tenants
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`user_tenants\` (
      \`user_id\`   INT NOT NULL,
      \`tenant_id\` INT NOT NULL,
      PRIMARY KEY (\`user_id\`, \`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed: owner padrão (criado apenas se não existir nenhum owner)
  const [[{ ownerCount }]] = await pool.query<any>(
    "SELECT COUNT(*) as ownerCount FROM users WHERE role = 'owner'"
  );
  if (Number(ownerCount) === 0) {
    const hash = await bcrypt.hash('Admin@2026', 12);
    await pool.query(
      "INSERT INTO users (nome, email, senha_hash, role) VALUES (?, ?, ?, 'owner')",
      ['Administrador', 'admin@4rodas.com', hash]
    );
    console.log('[seed] Owner padrão criado: admin@4rodas.com / Admin@2026');
  }
  // tenant_id em mv_caixa
  const [[{ cnt4 }]] = await pool.query<any>(
    `SELECT COUNT(*) as cnt4 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_caixa' AND COLUMN_NAME = 'tenant_id'`
  );
  if (Number(cnt4) === 0) {
    await pool.query('ALTER TABLE mv_caixa ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    console.log('[migration] mv_caixa.tenant_id adicionada (registros existentes → tenant 1)');
  }

  // Adiciona role 'caixa' ao ENUM se ainda não existir
  await pool.query(
    `ALTER TABLE users MODIFY COLUMN role ENUM('owner','manager','operator','caixa') NOT NULL DEFAULT 'operator'`
  ).catch(() => {}); // ignora se já existe

  // Tabela de saldo de estoque por tenant
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`produto_saldo_tenant\` (
      \`produto_id\` INT NOT NULL,
      \`tenant_id\`  INT NOT NULL,
      \`saldo\`      DECIMAL(10,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (\`produto_id\`, \`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tabela de associação cliente ↔ tenant (qual loja o cliente pertence)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`cliente_tenant\` (
      \`cliente_id\` INT NOT NULL,
      \`tenant_id\`  INT NOT NULL,
      PRIMARY KEY (\`cliente_id\`, \`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // instalacao_id em os_order_items
  const [[{ cntInstCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntInstCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_order_items' AND COLUMN_NAME = 'instalacao_id'`
  );
  if (Number(cntInstCol) === 0) {
    await pool.query('ALTER TABLE os_order_items ADD COLUMN instalacao_id INT NULL');
    console.log('[migration] os_order_items.instalacao_id adicionada');
  }

  // Tabela de instalações configuráveis (LD, LE, D, T, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`instalacoes\` (
      \`id\`    INT AUTO_INCREMENT PRIMARY KEY,
      \`nome\`  VARCHAR(50)  NOT NULL,
      \`sigla\` VARCHAR(10)  NOT NULL,
      \`ordem\` INT          NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`produto_instalacao\` (
      \`produto_id\`    INT NOT NULL,
      \`instalacao_id\` INT NOT NULL,
      PRIMARY KEY (\`produto_id\`, \`instalacao_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [[{ cntInstInit }]] = await pool.query<any>(
    'SELECT COUNT(*) as cntInstInit FROM instalacoes'
  );
  if (Number(cntInstInit) === 0) {
    await pool.query(`
      INSERT INTO instalacoes (id, nome, sigla, ordem) VALUES
      (1, 'Lado Direito',  'LD', 1),
      (2, 'Lado Esquerdo', 'LE', 2),
      (3, 'Dianteiro',     'D',  3),
      (4, 'Traseiro',      'T',  4)
    `);
  }

  console.log('[migration] tabelas de multi-tenant OK');
}

app.use(cors());
app.use(express.json());

app.use('/items',   itemsRouter);
app.use('/orders',  ordersRouter);
app.use('/auth',    authRouter);
app.use('/auth',    authUsersRouter);
app.use('/tenants', tenantsRouter);
app.use('/admin',   adminRouter);
app.use('/erp',     erpRouter);

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
