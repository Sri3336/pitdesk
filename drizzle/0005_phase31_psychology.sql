-- Phase 31: Pre-Market Checklist + Drawdown Settings

CREATE TABLE IF NOT EXISTS `pre_market_checklist_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `date` varchar(10) NOT NULL,
  `itemKey` varchar(64) NOT NULL,
  `label` varchar(128) NOT NULL,
  `completed` boolean NOT NULL DEFAULT false,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS `drawdown_settings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `maxDrawdownPct` decimal(6,2) NOT NULL DEFAULT 20.00,
  `riskPerTradePct` decimal(6,2) NOT NULL DEFAULT 0.66,
  `totalCapital` decimal(14,2) NOT NULL DEFAULT 350000.00,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
