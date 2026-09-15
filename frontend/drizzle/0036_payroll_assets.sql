CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`afm` text DEFAULT '' NOT NULL,
	`amka` text DEFAULT '' NOT NULL,
	`efka_am` text DEFAULT '' NOT NULL,
	`specialty_code` text DEFAULT '' NOT NULL,
	`specialty_name` text DEFAULT '' NOT NULL,
	`kpk` text DEFAULT '101' NOT NULL,
	`contract_type` text DEFAULT 'full' NOT NULL,
	`hire_date` text NOT NULL,
	`end_date` text,
	`gross_salary` real DEFAULT 0 NOT NULL,
	`daily_wage` real DEFAULT 0 NOT NULL,
	`hours_per_week` real DEFAULT 40 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`iban` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employees_org_idx` ON `employees` (`org_id`,`active`);
--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`month` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`gross_total` real DEFAULT 0 NOT NULL,
	`efka_employee` real DEFAULT 0 NOT NULL,
	`efka_employer` real DEFAULT 0 NOT NULL,
	`tax_total` real DEFAULT 0 NOT NULL,
	`net_total` real DEFAULT 0 NOT NULL,
	`gl_entry_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_runs_org_month_idx` ON `payroll_runs` (`org_id`,`month`);
--> statement-breakpoint
CREATE TABLE `payroll_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`run_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`employee_name` text DEFAULT '' NOT NULL,
	`days` real DEFAULT 25 NOT NULL,
	`hours` real DEFAULT 0 NOT NULL,
	`overtime_hours` real DEFAULT 0 NOT NULL,
	`overtime_amount` real DEFAULT 0 NOT NULL,
	`bonus` real DEFAULT 0 NOT NULL,
	`gross` real DEFAULT 0 NOT NULL,
	`efka_employee` real DEFAULT 0 NOT NULL,
	`efka_employer` real DEFAULT 0 NOT NULL,
	`taxable` real DEFAULT 0 NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`net` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payroll_items_run_idx` ON `payroll_items` (`run_id`);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`start_time` text DEFAULT '' NOT NULL,
	`end_time` text DEFAULT '' NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'work' NOT NULL,
	`ergani_status` text DEFAULT 'pending' NOT NULL,
	`ergani_ref` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shifts_org_date_idx` ON `shifts` (`org_id`,`work_date`);
--> statement-breakpoint
CREATE TABLE `fixed_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`account_code` text DEFAULT '12' NOT NULL,
	`acquired_at` text NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`salvage` real DEFAULT 0 NOT NULL,
	`useful_years` real DEFAULT 5 NOT NULL,
	`method` text DEFAULT 'straight' NOT NULL,
	`disposed_at` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fixed_assets_org_idx` ON `fixed_assets` (`org_id`,`active`);
