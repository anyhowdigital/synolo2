ALTER TABLE `firm_links` ADD `access_level` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `firm_links` ADD `assignee_user_id` text;--> statement-breakpoint
ALTER TABLE `firm_links` ADD `source` text DEFAULT 'afm' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `accountant_link_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `accountant_link_code_expires` text;--> statement-breakpoint
CREATE TABLE `firm_members` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firm_staff_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firm_link_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`access_level` text DEFAULT 'full' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firm_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`cadence` text DEFAULT 'monthly' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firm_fee_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`month` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`paid_at` text,
	`created_at` text NOT NULL
);
