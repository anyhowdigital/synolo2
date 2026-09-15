ALTER TABLE `customers` ADD `public_entity` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_endpoint_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_buyer_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_buyer_identifier` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_contract_adam` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_project_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_order_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `b2g_kae` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_status` text DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_provider` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_provider_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_raw_status` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_error` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_sent_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_status_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_xml` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_buyer_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_contract_adam` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_project_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_order_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_provider` text DEFAULT 'simulation' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_environment` text DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_base_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_api_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_api_secret` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_username` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `b2g_subscription_key` text DEFAULT '' NOT NULL;
