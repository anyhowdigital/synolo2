CREATE TABLE `customer_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	`account_id` text,
	`method` integer,
	`reference` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`moved_at` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `offset_source` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `offset_ref_id` text;