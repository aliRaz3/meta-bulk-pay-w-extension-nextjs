-- ============================================================
-- Meta PayNow NextJS - MySQL Database Schema
-- Run these queries in your MySQL database
-- ============================================================

CREATE DATABASE IF NOT EXISTS meta_paynow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE meta_paynow;

-- ── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Session` (
  `id`        VARCHAR(191) NOT NULL,
  `userId`    VARCHAR(191) NOT NULL,
  `userName`  VARCHAR(191) NOT NULL DEFAULT '',
  `token`     LONGTEXT     NOT NULL,
  `appId`     VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Session_userId_key` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Businesses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Business` (
  `id`        VARCHAR(191) NOT NULL,
  `name`      VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `selected`  TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Business_sessionId_idx` (`sessionId`),
  CONSTRAINT `Business_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Ad Accounts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `AdAccount` (
  `id`              VARCHAR(191) NOT NULL,
  `name`            VARCHAR(191) NOT NULL,
  `accountStatus`   INT          NOT NULL,
  `currency`        VARCHAR(191) NOT NULL DEFAULT 'USD',
  `balance`         DOUBLE       NOT NULL DEFAULT 0,
  `disableReason`   INT          NULL,
  `bmId`            VARCHAR(191) NOT NULL,
  `bmName`          VARCHAR(191) NOT NULL,
  `url`             LONGTEXT     NOT NULL,
  `result`          VARCHAR(191) NOT NULL DEFAULT 'pending',
  `paidVerified`    TINYINT(1)   NOT NULL DEFAULT 0,
  `extensionResult` VARCHAR(191) NULL,
  `extensionDetail` LONGTEXT     NULL,
  `sessionId`       VARCHAR(191) NOT NULL,
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `AdAccount_sessionId_idx` (`sessionId`),
  KEY `AdAccount_bmId_idx` (`bmId`),
  CONSTRAINT `AdAccount_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AdAccount_bmId_fkey`
    FOREIGN KEY (`bmId`) REFERENCES `Business` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Prisma migrations bookkeeping (optional, used by prisma migrate) ──────────
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id`                    VARCHAR(36)  NOT NULL,
  `checksum`              VARCHAR(64)  NOT NULL,
  `finished_at`           DATETIME(3)  NULL,
  `migration_name`        VARCHAR(255) NOT NULL,
  `logs`                  TEXT         NULL,
  `rolled_back_at`        DATETIME(3)  NULL,
  `started_at`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
