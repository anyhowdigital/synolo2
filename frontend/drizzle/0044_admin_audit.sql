CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_email` text NOT NULL,
	`action` text NOT NULL,
	`target_org_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
