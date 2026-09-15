ALTER TABLE `email_outbox` ADD `provider_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `provider_events` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE INDEX `email_outbox_provider_idx` ON `email_outbox` (`provider_id`);
