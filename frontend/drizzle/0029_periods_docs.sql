CREATE TABLE `period_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`month` text NOT NULL,
	`locked_by` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `period_locks_org_month_idx` ON `period_locks` (`org_id`,`month`);
--> statement-breakpoint
CREATE TABLE `doc_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`token` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_requests_token_idx` ON `doc_requests` (`token`);
