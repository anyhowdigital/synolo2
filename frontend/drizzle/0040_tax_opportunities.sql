CREATE TABLE `tax_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rule_code` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`estimated_benefit` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`decided_by` text,
	`decided_by_name` text,
	`decided_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_opp_org_rule_idx` ON `tax_opportunities` (`org_id`,`rule_code`);