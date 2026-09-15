CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`account_id` text NOT NULL,
	`booked_at` text NOT NULL,
	`amount` real NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`balance_after` real,
	`fingerprint` text NOT NULL,
	`import_batch_id` text NOT NULL,
	`status` text DEFAULT 'unmatched' NOT NULL,
	`matched_type` text,
	`matched_id` text,
	`match_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'bank' NOT NULL,
	`iban` text DEFAULT '' NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`opening_balance` real DEFAULT 0 NOT NULL,
	`opening_date` text,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` real NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`transfer_id` text,
	`moved_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expense_payments` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `account_id` text;