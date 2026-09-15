CREATE TABLE `gl_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`parent_code` text DEFAULT '' NOT NULL,
	`plan` text DEFAULT 'elp' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gl_accounts_org_code_idx` ON `gl_accounts` (`org_id`,`code`);--> statement-breakpoint
CREATE TABLE `gl_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entry_no` integer DEFAULT 0 NOT NULL,
	`entry_date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`fiscal_year` integer NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gl_entries_org_date_idx` ON `gl_entries` (`org_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `gl_entries_source_idx` ON `gl_entries` (`org_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `gl_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`account_code` text NOT NULL,
	`account_name` text DEFAULT '' NOT NULL,
	`debit` real DEFAULT 0 NOT NULL,
	`credit` real DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gl_lines_entry_idx` ON `gl_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `gl_lines_account_idx` ON `gl_lines` (`org_id`,`account_code`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `accounting_plan` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `books_category` text DEFAULT 'simple' NOT NULL;
