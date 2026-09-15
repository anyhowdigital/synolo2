ALTER TABLE `employees` ADD `portal_token` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `portal_pin` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `kind` text DEFAULT 'monthly' NOT NULL;
--> statement-breakpoint
CREATE TABLE `ergani_credentials` (
	`org_id` text PRIMARY KEY NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`password` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'trial' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ergani_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`form` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`protocol` text DEFAULT '' NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ergani_submissions_org_idx` ON `ergani_submissions` (`org_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `terminations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`employee_name` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'dismissal' NOT NULL,
	`end_date` text NOT NULL,
	`with_notice` integer DEFAULT 0 NOT NULL,
	`service_years` real DEFAULT 0 NOT NULL,
	`months_owed` real DEFAULT 0 NOT NULL,
	`monthly_base` real DEFAULT 0 NOT NULL,
	`gross` real DEFAULT 0 NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`net` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `terminations_org_idx` ON `terminations` (`org_id`);
