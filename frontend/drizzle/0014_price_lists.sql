CREATE TABLE `price_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`price_list_id` text NOT NULL,
	`product_id` text NOT NULL,
	`min_quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real,
	`discount_percent` real
);
--> statement-breakpoint
CREATE TABLE `price_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `price_list_id` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `discount_percent` real DEFAULT 0 NOT NULL;