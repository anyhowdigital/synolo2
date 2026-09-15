ALTER TABLE `customers` ADD `b2g_cpv` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_cpv` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `b2g_soft_reject` integer DEFAULT false NOT NULL;
