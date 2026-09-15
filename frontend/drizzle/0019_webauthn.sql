CREATE TABLE `webauthn_credentials` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `public_key` text NOT NULL,
  `counter` integer DEFAULT 0 NOT NULL,
  `transports` text DEFAULT '' NOT NULL,
  `device_type` text DEFAULT 'multi_device' NOT NULL,
  `backed_up` integer DEFAULT 0 NOT NULL,
  `nickname` text DEFAULT '' NOT NULL,
  `last_used_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webauthn_credentials_credential_id_idx` ON `webauthn_credentials` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `webauthn_credentials_user_id_idx` ON `webauthn_credentials` (`user_id`);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
  `id` text PRIMARY KEY NOT NULL,
  `challenge` text NOT NULL,
  `kind` text NOT NULL,
  `user_id` text,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webauthn_challenges_expires_idx` ON `webauthn_challenges` (`expires_at`);
