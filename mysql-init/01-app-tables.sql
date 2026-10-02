-- ============================================================
-- Tabelas do App Checklist Automotivo
-- Executado APÓS o import do backup (00-backup.sql)
-- ============================================================

USE `4rodas`;

-- ── Tenants (lojas) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tenants` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `nome`       VARCHAR(100) NOT NULL,
  `slug`       VARCHAR(50)  NOT NULL,
  `ativo`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Usuários ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `nome`        VARCHAR(100) NOT NULL,
  `email`       VARCHAR(150) NOT NULL,
  `senha_hash`  VARCHAR(255) NOT NULL,
  `role`        ENUM('owner','manager','operator') NOT NULL DEFAULT 'operator',
  `tenant_id`   INT          NULL,
  `ativo`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `email` (`email`),
  KEY `tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Acesso a múltiplos tenants (para role=manager) ────────────────────────────
CREATE TABLE IF NOT EXISTS `user_tenants` (
  `user_id`   INT NOT NULL,
  `tenant_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Loja padrão (migração de dados existentes)
INSERT IGNORE INTO `tenants` (id, nome, slug) VALUES (1, 'Loja Principal', 'loja-principal');


CREATE TABLE IF NOT EXISTS `os_orders` (
  `id`           CHAR(36)      NOT NULL,
  `plate`        VARCHAR(8)    NOT NULL,
  `model`        VARCHAR(100)  NOT NULL,
  `mileage`      INT UNSIGNED  NOT NULL,
  `status`       ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  `total_amount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `labor_amount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `tenant_id`    INT           NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `closed_at`    DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `os_order_items` (
  `id`          CHAR(36)      NOT NULL,
  `order_id`    CHAR(36)      NOT NULL,
  `product_id`  INT UNSIGNED  NOT NULL,
  `code`        VARCHAR(60)   NOT NULL,
  `description` VARCHAR(120)  NOT NULL,
  `type`        ENUM('part','service') NOT NULL DEFAULT 'part',
  `quantity`    DECIMAL(18,4) NOT NULL DEFAULT 1,
  `unit_price`  DECIMAL(18,4) NOT NULL,
  `total`       DECIMAL(18,4) NOT NULL,
  `created_at`  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `os_supervisor_pins` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `pin`             VARCHAR(6)   NOT NULL,
  `supervisor_name` VARCHAR(60)  NOT NULL,
  `active`          TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY `pin` (`pin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `os_supervisor_pins` (pin, supervisor_name)
VALUES ('1234', 'Supervisor Padrão');

CREATE TABLE IF NOT EXISTS `cad_mecanicos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `nome` VARCHAR(100) NOT NULL,
  `apelido` VARCHAR(50) DEFAULT NULL,
  `cpf` VARCHAR(20) DEFAULT NULL,
  `telefone` VARCHAR(30) DEFAULT NULL,
  `chave_pix` VARCHAR(100) DEFAULT NULL,
  `comissao_servico_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `comissao_peca_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cad_mecanicos_tenant` (`tenant_id`, `ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mecanico_pagamentos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NOT NULL DEFAULT 1,
  `mecanico_id` INT NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `data_pagamento` DATE NOT NULL,
  `periodo_inicio` DATE NULL DEFAULT NULL,
  `periodo_fim` DATE NULL DEFAULT NULL,
  `forma_pagamento` VARCHAR(50) NOT NULL DEFAULT 'PIX',
  `observacoes` VARCHAR(255) NULL DEFAULT NULL,
  `id_lancamento` INT NULL DEFAULT NULL,
  `created_by` VARCHAR(100) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_mecanico_pagamentos` (`mecanico_id`, `tenant_id`, `data_pagamento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

