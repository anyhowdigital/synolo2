CREATE TABLE `document_views` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`source` text DEFAULT 'link' NOT NULL,
	`ip_address` text DEFAULT '',
	`user_agent` text DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `document_views_invoice_idx` ON `document_views` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`link` text,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_org_user_idx` ON `notifications` (`org_id`,`user_id`,`read_at`);--> statement-breakpoint
ALTER TABLE `customers` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `custom_fields_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `language` text DEFAULT 'el' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `salesperson_id` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_token` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `portal_last_seen_at` text;--> statement-breakpoint
ALTER TABLE `document_notes` ADD `visibility` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_notes` ADD `author_type` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `custom_fields_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `custom_fields_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `salesperson_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `channel` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `viewed_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `view_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accepted_by_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accepted_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accepted_ip` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `decision_note` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `notification_prefs_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `custom_field_defs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `sales_channels` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `custom_fields_json` text DEFAULT '{}' NOT NULL;