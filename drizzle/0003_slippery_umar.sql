CREATE TABLE `analysis_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`analysis_json` text NOT NULL,
	`top_strategy` varchar(64),
	`score` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `criteria_weights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`criterion_name` varchar(64) NOT NULL,
	`weight` decimal(5,3) NOT NULL DEFAULT '1.000',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `criteria_weights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pcr_alert_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`bullish_threshold` decimal(6,3) DEFAULT '0.700',
	`bearish_threshold` decimal(6,3) DEFAULT '1.300',
	`email_enabled` boolean NOT NULL DEFAULT true,
	`last_triggered_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pcr_alert_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pcr_oi_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`snapshot_date` varchar(12) NOT NULL,
	`put_oi` bigint DEFAULT 0,
	`call_oi` bigint DEFAULT 0,
	`pcr_oi` decimal(8,4) DEFAULT '0',
	`put_volume` bigint DEFAULT 0,
	`call_volume` bigint DEFAULT 0,
	`pcr_volume` decimal(8,4) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pcr_oi_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pcr_scheduled_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`scanned_at` bigint NOT NULL,
	`put_volume` bigint DEFAULT 0,
	`call_volume` bigint DEFAULT 0,
	`pcr_volume` decimal(8,4) DEFAULT '0',
	`signal` varchar(16) DEFAULT 'neutral',
	`delta_vs_prior` decimal(8,4),
	CONSTRAINT `pcr_scheduled_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scan_outcomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`scan_result_id` bigint,
	`grade` char(1) NOT NULL,
	`direction` varchar(10) NOT NULL,
	`entry_price` decimal(10,4),
	`exit_price` decimal(10,4),
	`outcome` enum('win','loss','breakeven','pending') DEFAULT 'pending',
	`pnl_pct` decimal(8,4),
	`criteria_json` text,
	`scanned_at` bigint NOT NULL,
	`resolved_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_outcomes_id` PRIMARY KEY(`id`)
);
