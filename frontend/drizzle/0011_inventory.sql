CREATE TABLE `stock_count_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`count_id` text NOT NULL,
	`product_id` text NOT NULL,
	`expected_quantity` real DEFAULT 0 NOT NULL,
	`counted_quantity` real
);
--> statement-breakpoint
CREATE TABLE `stock_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`counted_at` text NOT NULL,
	`posted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` real,
	`kind` text NOT NULL,
	`ref_type` text DEFAULT 'manual' NOT NULL,
	`ref_id` text,
	`note` text DEFAULT '' NOT NULL,
	`moved_at` text NOT NULL,
	`actor` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `warehouse_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `barcode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `avg_cost` real DEFAULT 0 NOT NULL;