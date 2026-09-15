CREATE TABLE `tax_rule_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_code` text NOT NULL,
	`tax_year` integer NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`reviewed_by_name` text,
	`reviewed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_rule_review_code_year_idx` ON `tax_rule_reviews` (`rule_code`,`tax_year`);