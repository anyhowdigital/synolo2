CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`customer_id` text,
	`customer_name` text NOT NULL DEFAULT '',
	`stage` text NOT NULL DEFAULT 'lead',
	`amount` real NOT NULL DEFAULT 0,
	`probability` integer NOT NULL DEFAULT 20,
	`expected_close_date` text,
	`owner_id` text,
	`owner_name` text NOT NULL DEFAULT '',
	`description` text NOT NULL DEFAULT '',
	`lost_reason` text NOT NULL DEFAULT '',
	`quote_id` text,
	`invoice_id` text,
	`sort_order` integer NOT NULL DEFAULT 0,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opps_org_stage_idx` ON `opportunities` (`org_id`, `stage`);
