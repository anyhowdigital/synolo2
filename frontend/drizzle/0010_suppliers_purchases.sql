CREATE TABLE `expense_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`line_number` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`vat_category` integer DEFAULT 1 NOT NULL,
	`net_value` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`product_id` text
);
--> statement-breakpoint
CREATE TABLE `expense_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`amount` real NOT NULL,
	`paid_at` text NOT NULL,
	`method` integer DEFAULT 1 NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`afm` text DEFAULT '' NOT NULL,
	`doy` text DEFAULT '' NOT NULL,
	`country` text DEFAULT 'GR' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`contact_person` text DEFAULT '' NOT NULL,
	`iban` text DEFAULT '' NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`payment_terms_days` integer,
	`default_classification_category` text DEFAULT '' NOT NULL,
	`default_classification_type` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `supplier_id` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `paid_amount` real DEFAULT 0 NOT NULL;