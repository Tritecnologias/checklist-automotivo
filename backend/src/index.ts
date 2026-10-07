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

  // status ENUM com 'quote' (orçamento) em os_orders
  await pool.query(
    `ALTER TABLE os_orders MODIFY COLUMN status ENUM('quote','open','in_progress','closed') NOT NULL DEFAULT 'open'`
  ).catch(() => {});

  // venda_controle em os_orders (vínculo com PDV quando faturada)
  const [[{ cntVendaCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntVendaCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'venda_controle'`
  );
  if (Number(cntVendaCol) === 0) {
    await pool.query('ALTER TABLE os_orders ADD COLUMN venda_controle VARCHAR(50) NULL DEFAULT NULL');
    console.log('[migration] os_orders.venda_controle adicionada');
  }

  // discount_amount em os_orders (desconto faturado no PDV)
  const [[{ cntDiscount }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntDiscount FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'discount_amount'`
  );
  if (Number(cntDiscount) === 0) {
    await pool.query('ALTER TABLE os_orders ADD COLUMN discount_amount DECIMAL(18,4) NULL DEFAULT 0');
    console.log('[migration] os_orders.discount_amount adicionada');
  }

  // colunas de cliente em os_orders (nome, telefone, documento, id)
  const [[{ cntClientCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntClientCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'client_name'`
  );
  if (Number(cntClientCol) === 0) {
    await pool.query(`
      ALTER TABLE os_orders
      ADD COLUMN client_id INT NULL,
      ADD COLUMN client_name VARCHAR(150) NULL,
      ADD COLUMN client_phone VARCHAR(30) NULL,
      ADD COLUMN client_document VARCHAR(30) NULL
    `);
    console.log('[migration] os_orders colunas de cliente adicionadas');
  }

  // colunas de endereço e CEP em os_orders (client_cep, client_address)
  const [[{ cntCepCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntCepCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'client_cep'`
  );
  if (Number(cntCepCol) === 0) {
    await pool.query(`
      ALTER TABLE os_orders
      ADD COLUMN client_cep VARCHAR(15) NULL,
      ADD COLUMN client_address VARCHAR(255) NULL
    `);
    console.log('[migration] os_orders colunas client_cep e client_address adicionadas');
  }

  // Sincroniza retroativamente client_cep e client_address de cad_clientes se existirem
  try {
    await pool.query(`
      UPDATE os_orders o
      JOIN cad_clientes c ON c.id = o.client_id
      SET o.client_cep = COALESCE(o.client_cep, c.cep),
          o.client_address = COALESCE(o.client_address, c.endereco)
      WHERE (o.client_cep IS NULL OR o.client_address IS NULL)
        AND (c.cep IS NOT NULL OR c.endereco IS NOT NULL)
    `);
  } catch {}

  // finalizado_por em os_orders (registro do administrador que encerrou/finalizou a OS com senha)
  const [[{ cntFinalizadoCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntFinalizadoCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'finalizado_por_nome'`
  );
  if (Number(cntFinalizadoCol) === 0) {
    await pool.query(`
      ALTER TABLE os_orders
      ADD COLUMN finalizado_por_id INT NULL,
      ADD COLUMN finalizado_por_nome VARCHAR(100) NULL
    `);
    console.log('[migration] os_orders colunas finalizado_por adicionadas');
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

  // Índices para listagem e filtros rápidos em os_orders
  try {
    const [[{ cntIdx1 }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdx1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND INDEX_NAME = 'idx_os_orders_tenant_created'`
    );
    if (Number(cntIdx1) === 0) {
      await pool.query('ALTER TABLE os_orders ADD INDEX idx_os_orders_tenant_created (tenant_id, created_at)');
      console.log('[migration] Índice idx_os_orders_tenant_created adicionado');
    }

    const [[{ cntIdx2 }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdx2 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND INDEX_NAME = 'idx_os_orders_tenant_status'`
    );
    if (Number(cntIdx2) === 0) {
      await pool.query('ALTER TABLE os_orders ADD INDEX idx_os_orders_tenant_status (tenant_id, status, created_at)');
      console.log('[migration] Índice idx_os_orders_tenant_status adicionado');
    }

    const [[{ cntIdx3 }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdx3 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND INDEX_NAME = 'idx_os_orders_venda_controle'`
    );
    if (Number(cntIdx3) === 0) {
      await pool.query('ALTER TABLE os_orders ADD INDEX idx_os_orders_venda_controle (venda_controle)');
      console.log('[migration] Índice idx_os_orders_venda_controle adicionado');
    }

    // Sincroniza total_amount e discount_amount de OSs que foram faturadas anteriormente no PDV
    await pool.query(`
      UPDATE os_orders o
      JOIN mv_vendas v ON v.controle = CONVERT(o.venda_controle USING latin1)
      SET o.total_amount = v.vr_total,
          o.discount_amount = COALESCE(ABS(v.vr_adicional), o.discount_amount, 0)
      WHERE o.venda_controle IS NOT NULL AND o.total_amount = 0
    `);
  } catch (idxErr) {
    console.warn('[migration] Aviso ao configurar índices/totais de os_orders:', idxErr);
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

  // vr_pix e vr_nota em mv_vendas
  const [[{ cntPix }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntPix FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND COLUMN_NAME = 'vr_pix'`
  );
  if (Number(cntPix) === 0) {
    await pool.query('ALTER TABLE mv_vendas ADD COLUMN vr_pix DOUBLE(18,4) NULL DEFAULT 0');
    console.log('[migration] mv_vendas.vr_pix adicionada');
  }

  const [[{ cntNota }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntNota FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND COLUMN_NAME = 'vr_nota'`
  );
  if (Number(cntNota) === 0) {
    await pool.query('ALTER TABLE mv_vendas ADD COLUMN vr_nota DOUBLE(18,4) NULL DEFAULT 0');
    console.log('[migration] mv_vendas.vr_nota adicionada');
  }

  // tenant_id em mv_vendas
  const [[{ cntVendasTenant }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntVendasTenant FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND COLUMN_NAME = 'tenant_id'`
  );
  if (Number(cntVendasTenant) === 0) {
    await pool.query('ALTER TABLE mv_vendas ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    console.log('[migration] mv_vendas.tenant_id adicionada (registros existentes → tenant 1)');
  }

  // id_caixa em mv_vendas (vínculo direto com a sessão do caixa)
  const [[{ cntCaixaCol }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntCaixaCol FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND COLUMN_NAME = 'id_caixa'`
  );
  if (Number(cntCaixaCol) === 0) {
    await pool.query('ALTER TABLE mv_vendas ADD COLUMN id_caixa INT NULL, ADD INDEX idx_mv_vendas_id_caixa (id_caixa)');
    console.log('[migration] mv_vendas.id_caixa adicionada');
  }

  // Sincroniza tenant_id em vendas e lançamentos financeiros legados baseados na OS de origem
  try {
    await pool.query(`
      UPDATE mv_vendas v
      JOIN os_orders o ON o.venda_controle = v.controle
      SET v.tenant_id = o.tenant_id
      WHERE o.tenant_id IS NOT NULL AND v.tenant_id = 1
    `);
    await pool.query(`
      UPDATE cad_lancamentos l
      JOIN mv_vendas v ON v.id = l.id_venda
      SET l.tenant_id = v.tenant_id
      WHERE v.tenant_id IS NOT NULL AND l.tenant_id = 1
    `);

    // Sincroniza id_caixa para vendas antigas com data e turno correspondentes para o tenant
    await pool.query(`
      UPDATE mv_vendas v
      JOIN mv_caixa c ON c.tenant_id = v.tenant_id
        AND v.data_venda = c.data_abertura
        AND (v.turno = c.turno OR c.turno = '1' OR v.turno IS NULL)
      SET v.id_caixa = c.id
      WHERE v.id_caixa IS NULL
    `);

    // Recalcula vr_fechado_turno de caixas fechados aplicando isolamento multi-tenant
    await pool.query(`
      UPDATE mv_caixa c
      SET vr_fechado_turno = COALESCE((
        SELECT SUM(v.vr_total)
        FROM mv_vendas v
        WHERE v.tenant_id = c.tenant_id
          AND (
            v.id_caixa = c.id
            OR (
              v.id_caixa IS NULL
              AND v.data_venda = c.data_abertura
              AND v.turno = c.turno
              AND v.terminal = c.terminal
            )
          )
      ), 0)
      WHERE c.status_caixa = 'F'
    `);
    console.log('[migration] Histórico de caixas e id_caixa sincronizados com sucesso');
  } catch (syncErr) {
    console.warn('[migration] Aviso ao sincronizar tenant_id/caixa de vendas/lançamentos:', syncErr);
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

  // Se cliente_tenant estiver vazio, associa os clientes existentes ao tenant 1 (Loja Principal)
  const [[{ cntCT }]] = await pool.query<any>('SELECT COUNT(*) as cntCT FROM cliente_tenant');
  if (Number(cntCT) === 0) {
    await pool.query('INSERT IGNORE INTO cliente_tenant (cliente_id, tenant_id) SELECT id, 1 FROM cad_clientes')
      .catch(e => console.warn('[migration] Aviso ao popular cliente_tenant inicial:', e));
  }

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

  // Tabela de histórico e auditoria de movimentações de estoque (Kardex)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`estoque_movimentacoes\` (
      \`id\`               INT AUTO_INCREMENT PRIMARY KEY,
      \`tenant_id\`        INT NOT NULL,
      \`produto_id\`       INT NOT NULL,
      \`tipo\`             ENUM('entrada', 'saida', 'ajuste') NOT NULL,
      \`origem\`           VARCHAR(50) NOT NULL DEFAULT 'ajuste_manual',
      \`quantidade\`       DECIMAL(10,2) NOT NULL,
      \`saldo_anterior\`   DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`saldo_posterior\`  DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`documento_ref\`    VARCHAR(100) NULL,
      \`motivo\`           VARCHAR(255) NULL,
      \`user_id\`          INT NULL,
      \`user_nome\`        VARCHAR(100) NULL,
      \`created_at\`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_est_mov_tenant_prod\` (\`tenant_id\`, \`produto_id\`, \`created_at\`),
      INDEX \`idx_est_mov_tenant_data\` (\`tenant_id\`, \`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // controla_estoque em cad_produtos (1 = controla, 0 = não controla / estoque infinito)
  const [[{ cntControlaEstoque }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntControlaEstoque FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_produtos' AND COLUMN_NAME = 'controla_estoque'`
  );
  if (Number(cntControlaEstoque) === 0) {
    await pool.query('ALTER TABLE cad_produtos ADD COLUMN controla_estoque TINYINT(1) NOT NULL DEFAULT 1');
    console.log('[migration] cad_produtos.controla_estoque adicionada');
  }

  // Índice de busca em cad_produtos para acelerar listagens de estoque e produtos
  try {
    const [[{ cntIdxBusca }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxBusca FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_produtos' AND INDEX_NAME = 'idx_cad_produtos_busca'`
    );
    if (Number(cntIdxBusca) === 0) {
      await pool.query('ALTER TABLE cad_produtos ADD INDEX idx_cad_produtos_busca (inativo, nome_produto(50))');
      console.log('[migration] idx_cad_produtos_busca adicionada');
    }
  } catch (idxErr) {
    console.warn('[migration] Aviso ao criar idx_cad_produtos_busca:', idxErr);
  }

  // favorecido e tenant_id em cad_lancamentos (Contas a Pagar / Receber)
  const [[{ cntFav }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntFav FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_lancamentos' AND COLUMN_NAME = 'favorecido'`
  );
  if (Number(cntFav) === 0) {
    await pool.query('ALTER TABLE cad_lancamentos ADD COLUMN favorecido VARCHAR(150) NULL DEFAULT NULL');
    console.log('[migration] cad_lancamentos.favorecido adicionada');
  }

  const [[{ cntLancTenant }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntLancTenant FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_lancamentos' AND COLUMN_NAME = 'tenant_id'`
  );
  if (Number(cntLancTenant) === 0) {
    await pool.query('ALTER TABLE cad_lancamentos ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    console.log('[migration] cad_lancamentos.tenant_id adicionada');
  }

  // id_caixa em cad_lancamentos para vincular despesas à sessão de caixa correta
  const [[{ cntLancCaixa }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntLancCaixa FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_lancamentos' AND COLUMN_NAME = 'id_caixa'`
  );
  if (Number(cntLancCaixa) === 0) {
    await pool.query('ALTER TABLE cad_lancamentos ADD COLUMN id_caixa INT NULL DEFAULT NULL, ADD INDEX idx_cad_lancamentos_caixa (id_caixa)');
    console.log('[migration] cad_lancamentos.id_caixa adicionada');
  }

  // Backfill: vincula despesas já quitadas à primeira sessão da data para não vazarem para novas sessões do mesmo dia
  try {
    await pool.query(`
      UPDATE cad_lancamentos l
      JOIN (
        SELECT tenant_id, data_abertura, MIN(id) as first_caixa_id
        FROM mv_caixa
        GROUP BY tenant_id, data_abertura
      ) c ON c.tenant_id = l.tenant_id AND c.data_abertura = DATE(COALESCE(l.data_confirmacao, l.data_vencimento))
      SET l.id_caixa = c.first_caixa_id
      WHERE l.status_lancamento = 1
        AND l.id_caixa IS NULL
        AND (l.id_planejamento IN (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14) OR EXISTS (
          SELECT 1 FROM cad_planejamento pl WHERE pl.id = l.id_planejamento AND pl.plane_tipo = 'S'
        ))
    `);
  } catch (backfillErr) {
    console.warn('[migration] Aviso no backfill de id_caixa em cad_lancamentos:', backfillErr);
  }

  // Seed / garantir categorias de despesas no cad_planejamento
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`cad_planejamento\` (
      \`id\` int(4) unsigned NOT NULL AUTO_INCREMENT,
      \`plane_cod\` int(4) unsigned DEFAULT NULL,
      \`plane_descricao\` varchar(50) DEFAULT NULL,
      \`plane_tipo\` char(1) DEFAULT NULL,
      \`protegido\` char(1) DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    INSERT IGNORE INTO \`cad_planejamento\` (id, plane_cod, plane_descricao, plane_tipo, protegido) VALUES
      (1, 100000, 'RECEITAS DIVERSAS', 'E', ''),
      (2, 110000, 'VENDA REALIZADA', 'E', 'X'),
      (3, 120000, 'OUTROS RECEBIMENTOS', 'E', ''),
      (4, 200000, 'DESPESAS DIVERSAS', 'S', ''),
      (5, 210000, 'DEVOLUÇÃO REALIZADA', 'S', 'X'),
      (6, 220000, 'CONTAS DE CONSUMO', 'S', ''),
      (7, 230000, 'ÁGUA / CONDOMÍNIO', 'S', ''),
      (8, 240000, 'ENERGIA ELÉTRICA', 'S', ''),
      (9, 250000, 'INTERNET / TELEFONE', 'S', ''),
      (10, 260000, 'ALUGUEL', 'S', ''),
      (11, 270000, 'FORNECEDOR DE PEÇAS', 'S', ''),
      (12, 280000, 'SALÁRIOS / PRÓ-LABORE', 'S', ''),
      (13, 290000, 'IMPOSTOS E TAXAS', 'S', ''),
      (14, 300000, 'MANUTENÇÃO E FERRAMENTAS', 'S', '')
  `);

  // cad_fornecedores
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`cad_fornecedores\` (
      \`id\` int(4) unsigned NOT NULL AUTO_INCREMENT,
      \`nome_fornecedor\` varchar(100) NOT NULL,
      \`cpf_cnpj\` varchar(20) DEFAULT NULL,
      \`telefone\` varchar(20) DEFAULT NULL,
      \`email\` varchar(100) DEFAULT NULL,
      \`inativo\` tinyint(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // cad_produtos_tipo
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`cad_produtos_tipo\` (
      \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`nome_tipo\` VARCHAR(100) NOT NULL,
      \`is_service\` TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY \`nome_tipo\` (\`nome_tipo\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try {
    const [[{ cntTipoIsService }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntTipoIsService FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_produtos_tipo' AND COLUMN_NAME = 'is_service'`
    );
    if (Number(cntTipoIsService) === 0) {
      await pool.query('ALTER TABLE cad_produtos_tipo ADD COLUMN is_service TINYINT(1) NOT NULL DEFAULT 0');
      await pool.query('UPDATE cad_produtos_tipo SET is_service = 1 WHERE id IN (2, 9)');
      console.log('[migration] cad_produtos_tipo.is_service adicionada');
    }
  } catch (err) {
    console.warn('[migration] Aviso ao verificar coluna is_service em cad_produtos_tipo:', err);
  }

  try {
    await pool.query('ALTER TABLE cad_produtos_tipo MODIFY COLUMN nome_tipo VARCHAR(100) NOT NULL');
  } catch (err) {}

  await pool.query("UPDATE cad_produtos_tipo SET nome_tipo = 'DIVERSOS' WHERE id = 7 AND TRIM(nome_tipo) = ''").catch(() => {});

  const [[{ cntTiposInit }]] = await pool.query<any>('SELECT COUNT(*) as cntTiposInit FROM cad_produtos_tipo');
  if (Number(cntTiposInit) === 0) {
    await pool.query(`
      INSERT INTO cad_produtos_tipo (id, nome_tipo, is_service) VALUES
      (1, 'PECAS', 0),
      (2, 'MAO DE OBRA', 1),
      (3, 'LUBRIFICANTES', 0),
      (4, 'OUTROS', 0),
      (5, 'ACESSORIOS', 0),
      (6, 'ESCAPAMENTOS', 0),
      (8, 'COMPONENTES P/ ESCAPAMENTOS', 0),
      (9, 'ALINHAMENTO E BALANCEAMENTO', 1)
    `).catch(() => {});
  }

  // Tabela de configurações / parâmetros do sistema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`app_config\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`chave\` VARCHAR(60) NOT NULL,
      \`tenant_id\` INT DEFAULT NULL,
      \`valor\` VARCHAR(255) NOT NULL,
      \`descricao\` VARCHAR(255) DEFAULT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uniq_chave_tenant\` (\`chave\`, \`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    INSERT IGNORE INTO \`app_config\` (chave, tenant_id, valor, descricao)
    VALUES ('limite_desconto_padrao', NULL, '4.00', 'Percentual máximo de desconto para usuários comuns sem PIN de admin')
  `);

  // ── Módulo Oficina & Produtividade (Mecânicos e Comissões) ───────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`cad_mecanicos\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tenant_id\` INT NOT NULL DEFAULT 1,
      \`nome\` VARCHAR(100) NOT NULL,
      \`apelido\` VARCHAR(50) DEFAULT NULL,
      \`cpf\` VARCHAR(20) DEFAULT NULL,
      \`telefone\` VARCHAR(30) DEFAULT NULL,
      \`chave_pix\` VARCHAR(100) DEFAULT NULL,
      \`comissao_servico_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      \`comissao_peca_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      \`ativo\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY \`idx_cad_mecanicos_tenant\` (\`tenant_id\`, \`ativo\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // user_id em cad_mecanicos (vínculo com login de usuário)
  const [[{ cntMecUser }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntMecUser FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_mecanicos' AND COLUMN_NAME = 'user_id'`
  );
  if (Number(cntMecUser) === 0) {
    await pool.query(`
      ALTER TABLE cad_mecanicos
      ADD COLUMN user_id INT NULL DEFAULT NULL,
      ADD INDEX idx_cad_mecanicos_user (user_id)
    `);
    console.log('[migration] cad_mecanicos.user_id adicionada');
  }

  // users.role suportando 'mecanico'
  await pool.query(`
    ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'operator'
  `).catch(() => {});

  // mecanico_id e mecanico_nome em os_orders
  const [[{ cntMecOrders }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntMecOrders FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'mecanico_id'`
  );
  if (Number(cntMecOrders) === 0) {
    await pool.query(`
      ALTER TABLE os_orders
      ADD COLUMN mecanico_id INT NULL DEFAULT NULL,
      ADD COLUMN mecanico_nome VARCHAR(100) NULL DEFAULT NULL,
      ADD INDEX idx_os_orders_mecanico (mecanico_id)
    `);
    console.log('[migration] os_orders colunas de mecânico adicionadas');
  }

  // is_auxiliar em cad_mecanicos (distinção entre mecânico titular e auxiliar)
  const [[{ cntMecAux }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntMecAux FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cad_mecanicos' AND COLUMN_NAME = 'is_auxiliar'`
  );
  if (Number(cntMecAux) === 0) {
    await pool.query(`
      ALTER TABLE cad_mecanicos
      ADD COLUMN is_auxiliar TINYINT(1) NOT NULL DEFAULT 0,
      ADD INDEX idx_cad_mecanicos_aux (is_auxiliar)
    `);
    console.log('[migration] cad_mecanicos.is_auxiliar adicionada');
  }

  // auxiliar_id e auxiliar_nome em os_orders (para trabalhar em conjunto na OS)
  const [[{ cntMecAuxOrders }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntMecAuxOrders FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_orders' AND COLUMN_NAME = 'auxiliar_id'`
  );
  if (Number(cntMecAuxOrders) === 0) {
    await pool.query(`
      ALTER TABLE os_orders
      ADD COLUMN auxiliar_id INT NULL DEFAULT NULL,
      ADD COLUMN auxiliar_nome VARCHAR(100) NULL DEFAULT NULL,
      ADD INDEX idx_os_orders_auxiliar (auxiliar_id)
    `);
    console.log('[migration] os_orders colunas de auxiliar adicionadas');
  }

  // mecanico_id, mecanico_nome, comissao_pct e comissao_valor em os_order_items
  const [[{ cntMecItems }]] = await pool.query<any>(
    `SELECT COUNT(*) as cntMecItems FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'os_order_items' AND COLUMN_NAME = 'mecanico_id'`
  );
  if (Number(cntMecItems) === 0) {
    await pool.query(`
      ALTER TABLE os_order_items
      ADD COLUMN mecanico_id INT NULL DEFAULT NULL,
      ADD COLUMN mecanico_nome VARCHAR(100) NULL DEFAULT NULL,
      ADD COLUMN comissao_pct DECIMAL(5,2) NULL DEFAULT NULL,
      ADD COLUMN comissao_valor DECIMAL(10,2) NULL DEFAULT NULL,
      ADD INDEX idx_os_order_items_mecanico (mecanico_id)
    `);
    console.log('[migration] os_order_items colunas de mecânico e comissão adicionadas');
  }

  // Tabela de pagamentos / adiantamentos de comissão
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`mecanico_pagamentos\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tenant_id\` INT NOT NULL DEFAULT 1,
      \`mecanico_id\` INT NOT NULL,
      \`valor\` DECIMAL(10,2) NOT NULL,
      \`data_pagamento\` DATE NOT NULL,
      \`periodo_inicio\` DATE NULL DEFAULT NULL,
      \`periodo_fim\` DATE NULL DEFAULT NULL,
      \`forma_pagamento\` VARCHAR(50) NOT NULL DEFAULT 'PIX',
      \`observacoes\` VARCHAR(255) NULL DEFAULT NULL,
      \`id_lancamento\` INT NULL DEFAULT NULL,
      \`created_by\` VARCHAR(100) NULL DEFAULT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY \`idx_mecanico_pagamentos\` (\`mecanico_id\`, \`tenant_id\`, \`data_pagamento\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tabela de rateio de múltiplos executantes por item (Caso 1: Valor Fixo / Caso 2: Percentual)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`os_item_executantes\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`item_id\` CHAR(36) NOT NULL,
      \`order_id\` CHAR(36) NOT NULL,
      \`mecanico_id\` INT NOT NULL,
      \`tipo_rateio\` ENUM('PERCENTUAL', 'VALOR_FIXO') NOT NULL DEFAULT 'PERCENTUAL',
      \`percentual\` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
      \`valor_base\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`comissao_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      \`comissao_valor\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`papel\` VARCHAR(20) NOT NULL DEFAULT 'titular',
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY \`idx_exec_item\` (\`item_id\`),
      KEY \`idx_exec_order\` (\`order_id\`),
      KEY \`idx_exec_mecanico\` (\`mecanico_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[migration] os_item_executantes configurada');

  // Seed inicial de técnicos se tabela estiver vazia
  const [[{ cntMecanicosInit }]] = await pool.query<any>('SELECT COUNT(*) as cntMecanicosInit FROM cad_mecanicos');
  if (Number(cntMecanicosInit) === 0) {
    await pool.query(`
      INSERT INTO cad_mecanicos (tenant_id, nome, apelido, telefone, chave_pix, comissao_servico_pct, comissao_peca_pct, ativo)
      VALUES
        (1, 'Carlos Eduardo Souza', 'Carlão', '(31) 98877-1122', '31988771122', 10.00, 2.00, 1),
        (1, 'Marcos Vinícius Santos', 'Marquinhos', '(31) 98765-4321', 'marcos.vinicius@pix.com', 8.00, 0.00, 1),
        (1, 'Roberto Ferreira Lima', 'Betão', '(31) 99123-4567', 'beto.mecanico@pix.com', 12.00, 3.00, 1)
    `).catch(() => {});
    console.log('[migration] Mecânicos padrão iniciais semeados com sucesso');
  }

  // Índices para otimização extrema de relatórios, Curva ABC, DRE e vendas
  try {
    const [[{ cntIdxVendasData }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxVendasData FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND INDEX_NAME = 'idx_mv_vendas_tenant_data'`
    );
    if (Number(cntIdxVendasData) === 0) {
      await pool.query('ALTER TABLE mv_vendas ADD INDEX idx_mv_vendas_tenant_data (tenant_id, data_venda)');
      console.log('[migration] idx_mv_vendas_tenant_data adicionada');
    }

    const [[{ cntIdxVendasControle }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxVendasControle FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas' AND INDEX_NAME = 'idx_mv_vendas_controle'`
    );
    if (Number(cntIdxVendasControle) === 0) {
      await pool.query('ALTER TABLE mv_vendas ADD INDEX idx_mv_vendas_controle (controle)');
      console.log('[migration] idx_mv_vendas_controle adicionada');
    }

    const [[{ cntIdxMovControle }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxMovControle FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas_movimento' AND INDEX_NAME = 'idx_mv_mov_controle'`
    );
    if (Number(cntIdxMovControle) === 0) {
      await pool.query('ALTER TABLE mv_vendas_movimento ADD INDEX idx_mv_mov_controle (controle)');
      console.log('[migration] idx_mv_mov_controle adicionada');
    }

    const [[{ cntIdxMovProduto }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxMovProduto FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas_movimento' AND INDEX_NAME = 'idx_mv_mov_produto'`
    );
    if (Number(cntIdxMovProduto) === 0) {
      await pool.query('ALTER TABLE mv_vendas_movimento ADD INDEX idx_mv_mov_produto (id_produto)');
      console.log('[migration] idx_mv_mov_produto adicionada');
    }

    const [[{ cntIdxMovData }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxMovData FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mv_vendas_movimento' AND INDEX_NAME = 'idx_mv_mov_data'`
    );
    if (Number(cntIdxMovData) === 0) {
      await pool.query('ALTER TABLE mv_vendas_movimento ADD INDEX idx_mv_mov_data (data_venda)');
      console.log('[migration] idx_mv_mov_data adicionada');
    }

    const [[{ cntIdxPst }]] = await pool.query<any>(
      `SELECT COUNT(*) as cntIdxPst FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produto_saldo_tenant' AND INDEX_NAME = 'idx_pst_tenant_prod'`
    );
    if (Number(cntIdxPst) === 0) {
      await pool.query('ALTER TABLE produto_saldo_tenant ADD INDEX idx_pst_tenant_prod (tenant_id, produto_id)');
      console.log('[migration] idx_pst_tenant_prod adicionada');
    }
  } catch (idxErr) {
    console.warn('[migration] Aviso ao configurar índices de vendas/estoque:', idxErr);
  }

  // Limpeza e saneamento de itens duplicados de OS gerados por sincronização do PDV
  try {
    const [dupDeleted] = await pool.query<any>(`
      DELETE d FROM os_order_items d
      JOIN os_order_items o ON o.order_id = d.order_id
        AND o.product_id = d.product_id
        AND o.product_id IS NOT NULL
        AND o.product_id > 0
        AND o.id != d.id
        AND (
          d.created_at > o.created_at
          OR (d.created_at = o.created_at AND d.id > o.id)
        )
      WHERE (
        -- Cenário da duplicação pelo PDV: original com mecânico e cópia gerada no PDV sem mecânico
        (o.mecanico_id IS NOT NULL AND d.mecanico_id IS NULL)
        -- Ou itens idênticos com mesma quantidade e preço na mesma OS
        OR (d.mecanico_id IS NULL AND d.quantity = o.quantity AND d.unit_price = o.unit_price)
      )
    `);
    if (dupDeleted && dupDeleted.affectedRows > 0) {
      console.log(`[migration] Limpeza de itens duplicados de OS: ${dupDeleted.affectedRows} item(ns) removido(s)`);
    }
  } catch (cleanErr) {
    console.warn('[migration] Aviso ao limpar itens duplicados de OS:', cleanErr);
  }

  console.log('[migration] tabelas de multi-tenant e financeiro OK');
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
