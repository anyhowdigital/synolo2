CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`data` text NOT NULL,
	`uploaded_by` text,
	`uploaded_by_name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`org_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `document_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `document_notes_entity_idx` ON `document_notes` (`org_id`,`entity_type`,`entity_id`);