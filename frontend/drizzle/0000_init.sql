CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`due_at` text,
	`done` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text DEFAULT 'company' NOT NULL,
	`name` text NOT NULL,
	`afm` text DEFAULT '',
	`doy` text DEFAULT '',
	`activity` text DEFAULT '',
	`address` text DEFAULT '',
	`city` text DEFAULT '',
	`postal_code` text DEFAULT '',
	`country` text DEFAULT 'GR' NOT NULL,
	`email` text DEFAULT '',
	`phone` text DEFAULT '',
	`contact_person` text DEFAULT '',
	`notes` text DEFAULT '',
	`stage` text DEFAULT 'customer' NOT NULL,
	`payment_terms_days` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`line_number` integer NOT NULL,
	`product_id` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`vat_category` integer DEFAULT 1 NOT NULL,
	`vat_exemption_category` integer,
	`measurement_unit` integer DEFAULT 1 NOT NULL,
	`classification_category` text NOT NULL,
	`classification_type` text NOT NULL,
	`withholding_category` integer DEFAULT 0 NOT NULL,
	`stamp_duty_category` integer DEFAULT 0 NOT NULL,
	`net_value` real DEFAULT 0 NOT NULL,
	`vat_amount` real DEFAULT 0 NOT NULL,
	`withheld_amount` real DEFAULT 0 NOT NULL,
	`stamp_duty_amount` real DEFAULT 0 NOT NULL,
	`gross_value` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`customer_id` text,
	`series_id` text NOT NULL,
	`series_code` text NOT NULL,
	`number` integer NOT NULL,
	`invoice_type` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`payment_method` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text DEFAULT '',
	`correlated_invoice_id` text,
	`customer_name` text DEFAULT '',
	`customer_afm` text DEFAULT '',
	`customer_doy` text DEFAULT '',
	`customer_address` text DEFAULT '',
	`customer_country` text DEFAULT 'GR',
	`total_net_value` real DEFAULT 0 NOT NULL,
	`total_vat_amount` real DEFAULT 0 NOT NULL,
	`total_withheld_amount` real DEFAULT 0 NOT NULL,
	`total_stamp_duty_amount` real DEFAULT 0 NOT NULL,
	`total_gross_value` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`mydata_status` text DEFAULT 'not_sent' NOT NULL,
	`mydata_mark` text,
	`mydata_uid` text,
	`mydata_auth_code` text,
	`mydata_qr_url` text,
	`mydata_cancellation_mark` text,
	`mydata_error` text,
	`mydata_sent_at` text,
	`mydata_request_xml` text,
	`mydata_response_xml` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`afm` text DEFAULT '' NOT NULL,
	`doy` text DEFAULT '',
	`activity` text DEFAULT '',
	`gemi` text DEFAULT '',
	`address` text DEFAULT '',
	`city` text DEFAULT '',
	`postal_code` text DEFAULT '',
	`country` text DEFAULT 'GR' NOT NULL,
	`email` text DEFAULT '',
	`phone` text DEFAULT '',
	`website` text DEFAULT '',
	`iban` text DEFAULT '',
	`bank_name` text DEFAULT '',
	`logo_text` text DEFAULT '',
	`invoice_footer` text DEFAULT '',
	`default_payment_terms_days` integer DEFAULT 30 NOT NULL,
	`mydata_user_id` text DEFAULT '',
	`mydata_subscription_key` text DEFAULT '',
	`mydata_environment` text DEFAULT 'mock' NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`plan_status` text DEFAULT 'trialing' NOT NULL,
	`trial_ends_at` text,
	`billing_email` text DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` real NOT NULL,
	`paid_at` text NOT NULL,
	`method` integer DEFAULT 1 NOT NULL,
	`reference` text DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`sku` text DEFAULT '',
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`kind` text DEFAULT 'service' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`cost_price` real DEFAULT 0 NOT NULL,
	`vat_category` integer DEFAULT 1 NOT NULL,
	`vat_exemption_category` integer,
	`measurement_unit` integer DEFAULT 1 NOT NULL,
	`classification_category` text DEFAULT 'category1_3' NOT NULL,
	`classification_type` text DEFAULT 'E3_561_001' NOT NULL,
	`track_stock` integer DEFAULT false NOT NULL,
	`stock_quantity` real DEFAULT 0 NOT NULL,
	`reorder_level` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`invoice_type` text NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
