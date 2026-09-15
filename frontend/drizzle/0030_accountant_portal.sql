CREATE TABLE `accountant_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`firm_name` text DEFAULT '' NOT NULL,
	`afm` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `firm_links` (
	`id` text PRIMARY KEY NOT NULL,
	`accountant_user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_afm` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
