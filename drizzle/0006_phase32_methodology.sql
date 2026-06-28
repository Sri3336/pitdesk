-- Phase 32: Systematic Trading Methodology tables

CREATE TABLE IF NOT EXISTS `morning_session_trades` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `date` varchar(10) NOT NULL,
  `ticker` varchar(20) NOT NULL,
  `setupType` enum('ORB','GAP_GO','VWAP_RECLAIM') NOT NULL,
  `direction` enum('LONG','SHORT') NOT NULL,
  `entryPrice` decimal(12,4) NOT NULL,
  `stopPrice` decimal(12,4) NOT NULL,
  `targetPrice` decimal(12,4) NOT NULL,
  `exitPrice` decimal(12,4),
  `shares` int NOT NULL,
  `riskAmount` decimal(12,2) NOT NULL,
  `rrRatio` decimal(6,2) NOT NULL,
  `pnl` decimal(12,2),
  `status` enum('ACTIVE','WIN','LOSS','SCRATCH') NOT NULL DEFAULT 'ACTIVE',
  `notes` text,
  `enteredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `exitedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `session_settings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `accountSize` decimal(14,2) NOT NULL DEFAULT 350000.00,
  `maxRiskPerTradePct` decimal(6,2) NOT NULL DEFAULT 1.00,
  `dailyLossLimitPct` decimal(6,2) NOT NULL DEFAULT 2.00,
  `maxTradesPerDay` int NOT NULL DEFAULT 3,
  `swingRiskPerTradePct` decimal(6,2) NOT NULL DEFAULT 1.50,
  `maxConcurrentSwings` int NOT NULL DEFAULT 3,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `swing_watchlist` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `ticker` varchar(20) NOT NULL,
  `setupType` enum('POST_EARNINGS','CATALYST_BREAKOUT','VCP','GAP_FILL') NOT NULL,
  `direction` enum('LONG','SHORT') NOT NULL DEFAULT 'LONG',
  `entryPrice` decimal(12,4) NOT NULL,
  `stopPrice` decimal(12,4) NOT NULL,
  `targetPrice` decimal(12,4) NOT NULL,
  `shares` int NOT NULL,
  `riskAmount` decimal(12,2) NOT NULL,
  `rrRatio` decimal(6,2) NOT NULL,
  `accountId` varchar(32),
  `status` enum('WATCHING','ACTIVE','WIN','LOSS','SCRATCH','EXPIRED') NOT NULL DEFAULT 'WATCHING',
  `entryDate` varchar(10),
  `exitDate` varchar(10),
  `exitPrice` decimal(12,4),
  `pnl` decimal(12,2),
  `dayCount` int NOT NULL DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
