ALTER TABLE `organizations` ADD `late_interest_annual_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `late_fee_flat` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `credit_limit` real DEFAULT 0 NOT NULL;
