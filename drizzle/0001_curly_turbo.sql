CREATE TABLE `fib_ema_alert_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`currentPrice` decimal(12,4),
	`swingHigh` decimal(12,4),
	`swingLow` decimal(12,4),
	`fibLevel` float,
	`fibPrice` decimal(12,4),
	`emaPeriod` int,
	`emaPrice` decimal(12,4),
	`proximityPct` float,
	`notifiedEmail` boolean DEFAULT false,
	`notifiedPush` boolean DEFAULT false,
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fib_ema_alert_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fib_ema_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`proximityPct` float NOT NULL DEFAULT 1,
	`fibLevels` json DEFAULT ('[38.2,61.8]'),
	`emaPeriods` json DEFAULT ('[9,20,50,200]'),
	`emailEnabled` boolean NOT NULL DEFAULT true,
	`pushEnabled` boolean NOT NULL DEFAULT true,
	`lastTriggeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fib_ema_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manual_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(16) NOT NULL,
	`strategy` varchar(64),
	`direction` enum('long','short') NOT NULL DEFAULT 'long',
	`entryPrice` decimal(12,4),
	`exitPrice` decimal(12,4),
	`swingLow` decimal(12,4),
	`swingHigh` decimal(12,4),
	`quantity` int,
	`target1` decimal(12,4),
	`target2` decimal(12,4),
	`stopLoss` decimal(12,4),
	`pnl` decimal(12,4),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`postTradeNotes` text,
	`lessonsLearned` text,
	`enteredAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manual_trades_id` PRIMARY KEY(`id`)
);
