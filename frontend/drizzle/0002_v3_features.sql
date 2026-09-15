CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verifications_token_unique` ON `email_verifications` (`token`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_to_eur` real NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`webhook_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_status_code` integer,
	`last_error` text,
	`next_attempt_at` text NOT NULL,
	`delivered_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `classification_sent_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `self_pricing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `branch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payment_session_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `accounting_map_json` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `online_payments` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `bilingual_invoices` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `branch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `branch_name` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip_address` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` text;