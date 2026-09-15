CREATE TABLE `org_pins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`pinned` integer DEFAULT true NOT NULL,
	`last_opened_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_pins_user_org_idx` ON `org_pins` (`user_id`,`org_id`);
--> statement-breakpoint
CREATE TABLE `office_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`assignee_user_id` text,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `office_tasks_status_idx` ON `office_tasks` (`status`,`due_date`);
