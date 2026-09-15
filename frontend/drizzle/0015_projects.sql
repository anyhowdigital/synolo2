CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`customer_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`hourly_rate` real DEFAULT 0 NOT NULL,
	`budget_amount` real,
	`budget_hours` real,
	`starts_on` text,
	`ends_on` text,
	`color` text DEFAULT '#2563eb' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`, `status`);
--> statement-breakpoint
CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`hourly_rate` real,
	`billable` integer DEFAULT true NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_tasks_project_idx` ON `project_tasks` (`project_id`);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`user_id` text,
	`user_name` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`minutes` integer DEFAULT 0 NOT NULL,
	`hourly_rate` real DEFAULT 0 NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'logged' NOT NULL,
	`invoice_id` text,
	`invoice_line_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_entries_project_idx` ON `time_entries` (`org_id`, `project_id`, `status`);
--> statement-breakpoint
CREATE TABLE `project_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`incurred_on` text NOT NULL,
	`billable` integer DEFAULT true NOT NULL,
	`markup_percent` real DEFAULT 0 NOT NULL,
	`invoice_id` text,
	`expense_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_expenses_project_idx` ON `project_expenses` (`project_id`);
