-- Phase 33: AJ Liquidity Hunting
-- Create liquidity_zones table
CREATE TABLE IF NOT EXISTS `liquidity_zones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `ticker` varchar(20) NOT NULL,
  `zone_type` varchar(32) NOT NULL COMMENT 'resistance|support|supply|demand|trendline|fibonacci|vwap|previous_high|previous_low',
  `price_level` decimal(12,4) NOT NULL COMMENT 'lower bound of zone',
  `price_level_high` decimal(12,4) NULL COMMENT 'upper bound of zone (null = single level)',
  `notes` text NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_lz_user_ticker` (`user_id`, `ticker`),
  INDEX `idx_lz_user_active` (`user_id`, `is_active`)
);

-- Add liquidity context columns to morning_session_trades
ALTER TABLE `morning_session_trades`
  ADD COLUMN IF NOT EXISTS `near_retail_zone` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `liquidity_context` varchar(64) NULL COMMENT 'resistance|support|supply|demand|trendline|fibonacci|none',
  ADD COLUMN IF NOT EXISTS `liquidity_notes` varchar(255) NULL;
