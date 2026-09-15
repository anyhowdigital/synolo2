ALTER TABLE `employees` ADD `birth_date` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `sex` text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `father_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `mother_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `nationality` text DEFAULT '000' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `id_type` text DEFAULT 'ΑΔΤ' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `id_number` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `marital_status` text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `doy` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `education_level` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `phone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `employer_afm` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `employer_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `annex_aa` text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `sepe` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `oaed` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `kad` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `kallikratis` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `card_sector` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ergani_credentials` ADD `verified_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`employee_name` text DEFAULT '' NOT NULL,
	`leave_type` text DEFAULT 'ΑΔΚΑΝ' NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`days` integer DEFAULT 1 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text DEFAULT '' NOT NULL,
	`decided_at` text,
	`decision_note` text DEFAULT '' NOT NULL,
	`ergani_protocol` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leave_requests_org_idx` ON `leave_requests` (`org_id`,`status`);
