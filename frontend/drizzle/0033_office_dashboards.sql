CREATE TABLE `office_dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`widgets_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
