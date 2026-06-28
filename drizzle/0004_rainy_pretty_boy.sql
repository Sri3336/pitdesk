-- Phase 30: Account-aware trade history + positions tracking

-- Add account columns to trade_upload_batches
ALTER TABLE `trade_upload_batches`
  ADD COLUMN `accountId` varchar(32) NULL,
  ADD COLUMN `accountLabel` varchar(64) NULL;

-- Add account columns to uploaded_trades
ALTER TABLE `uploaded_trades`
  ADD COLUMN `accountId` varchar(32) NULL,
  ADD COLUMN `accountLabel` varchar(64) NULL;

-- Create position_batches table
CREATE TABLE `position_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `filename` varchar(255) NOT NULL,
  `rowCount` int NOT NULL DEFAULT 0,
  `accountId` varchar(32) NOT NULL,
  `accountLabel` varchar(64) NOT NULL,
  `uploadedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `position_batches_id` PRIMARY KEY(`id`)
);

-- Create positions table
CREATE TABLE `positions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `batchId` int NOT NULL,
  `accountId` varchar(32) NOT NULL,
  `accountLabel` varchar(64) NOT NULL,
  `ticker` varchar(20) NOT NULL,
  `qty` decimal(12,4) NOT NULL,
  `avgCost` decimal(12,4),
  `currentPrice` decimal(12,4),
  `marketValue` decimal(14,4),
  `unrealizedPnl` decimal(14,4),
  `unrealizedPnlPct` decimal(8,4),
  `assetType` enum('stock','option','etf','other') NOT NULL DEFAULT 'stock',
  `notes` varchar(512),
  `uploadedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);