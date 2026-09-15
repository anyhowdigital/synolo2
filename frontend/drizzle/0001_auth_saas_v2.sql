CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`attachments` text DEFAULT '[]',
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`related_entity` text,
	`related_id` text,
	`sent_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`supplier_name` text DEFAULT '' NOT NULL,
	`supplier_afm` text DEFAULT '' NOT NULL,
	`supplier_country` text DEFAULT 'GR' NOT NULL,
	`mark` text,
	`uid` text,
	`invoice_type` text DEFAULT '1.1' NOT NULL,
	`series` text DEFAULT '',
	`number` text DEFAULT '',
	`issue_date` text NOT NULL,
	`description` text DEFAULT '',
	`net_value` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`vat_category` integer DEFAULT 1 NOT NULL,
	`withheld_amount` real DEFAULT 0 NOT NULL,
	`gross_value` real DEFAULT 0 NOT NULL,
	`classification_category` text DEFAULT '',
	`classification_type` text DEFAULT '',
	`vat_deductible` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`paid_at` text,
	`raw_xml` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token` text NOT NULL,
	`invited_by` text NOT NULL,
	`accepted_at` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_unique` ON `password_resets` (`token`);--> statement-breakpoint
CREATE TABLE `recurring_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`customer_id` text NOT NULL,
	`series_id` text NOT NULL,
	`payment_method` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '',
	`lines_json` text NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`next_run_at` text NOT NULL,
	`auto_issue` integer DEFAULT true NOT NULL,
	`auto_transmit` integer DEFAULT false NOT NULL,
	`auto_email` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified_at` text,
	`last_org_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text DEFAULT '*' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_status` text,
	`last_delivered_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `exchange_rate` real;--> statement-breakpoint
ALTER TABLE `invoices` ADD `source_quote_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `recurring_template_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `public_token` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `last_reminder_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `reminder_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `emailed_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `dispatch_date` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `vehicle_number` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `move_purpose` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `delivery_address` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `loading_address` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `logo_data_url` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `auto_transmit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `yearly_numbering` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `reminder_days` text DEFAULT '3,10,30' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `plan_interval` text DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE `organizations` ADD `current_period_end` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `stripe_subscription_id` text;--> statement-breakpoint
ALTER TABLE `series` ADD `numbering_year` integer;