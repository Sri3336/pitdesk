CREATE TABLE `intraday_scan_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`scanned_at` bigint NOT NULL,
	`symbol` varchar(10) NOT NULL,
	`score` decimal(5,2) NOT NULL,
	`grade` char(1) NOT NULL,
	`direction` varchar(10) NOT NULL,
	`criteria_json` text NOT NULL,
	`current_price` decimal(10,4) DEFAULT '0',
	`vwap` decimal(10,4) DEFAULT '0',
	`atr` decimal(10,4) DEFAULT '0',
	`alerted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `intraday_scan_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `googleId` varchar(255);