CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`refs_json` text DEFAULT '[]' NOT NULL,
	`undone_at` text,
	`actor` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_batches_org_idx` ON `import_batches` (`org_id`,`created_at`);
