ALTER TABLE `organizations` ADD `overrides_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_overrides_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text
);
