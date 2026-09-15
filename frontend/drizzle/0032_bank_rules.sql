CREATE TABLE `bank_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`keyword` text NOT NULL,
	`action` text NOT NULL,
	`entry_kind` text DEFAULT '' NOT NULL,
	`target_name` text DEFAULT '' NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL
);
