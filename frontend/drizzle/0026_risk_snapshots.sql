CREATE TABLE `risk_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`day` text NOT NULL,
	`score` integer DEFAULT 100 NOT NULL,
	`findings` integer DEFAULT 0 NOT NULL,
	`critical` integer DEFAULT 0 NOT NULL,
	`high` integer DEFAULT 0 NOT NULL,
	`codes_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `risk_snapshots_org_day_idx` ON `risk_snapshots` (`org_id`,`day`);
