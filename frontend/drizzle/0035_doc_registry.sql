ALTER TABLE `organizations` ADD `books_self_manage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accountant_profiles` ADD `reg_no` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accountant_profiles` ADD `signature_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accountant_profiles` ADD `stamp_data_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE `issued_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`hash` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`data` text DEFAULT '' NOT NULL,
	`issued_by_user_id` text DEFAULT '' NOT NULL,
	`issued_by_name` text DEFAULT '' NOT NULL,
	`firm_name` text DEFAULT '' NOT NULL,
	`reg_no` text DEFAULT '' NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `issued_documents_code_idx` ON `issued_documents` (`code`);--> statement-breakpoint
CREATE INDEX `issued_documents_org_idx` ON `issued_documents` (`org_id`,`created_at`);
