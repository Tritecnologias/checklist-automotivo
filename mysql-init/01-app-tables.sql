-- ============================================================
-- Tabelas do App Checklist Automotivo
-- Executado APÓS o import do backup (00-backup.sql)
-- ============================================================

USE `4rodas`;

CREATE TABLE IF NOT EXISTS `os_orders` (
  `id`           CHAR(36)      NOT NULL,
  `plate`        VARCHAR(8)    NOT NULL,
  `model`        VARCHAR(100)  NOT NULL,
  `mileage`      INT UNSIGNED  NOT NULL,
  `status`       ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  `total_amount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `labor_amount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `closed_at`    DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
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
