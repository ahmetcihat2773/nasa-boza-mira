CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mission_id` text NOT NULL,
	`nicknames` text NOT NULL,
	`seed` text NOT NULL,
	`design` text NOT NULL,
	`result` text NOT NULL,
	`success` integer NOT NULL,
	`score` integer NOT NULL,
	`stars` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_mission_score_idx` ON `attempts` (`mission_id`,`score`);--> statement-breakpoint
CREATE INDEX `attempts_created_idx` ON `attempts` (`created_at`);