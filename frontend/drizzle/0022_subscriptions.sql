ALTER TABLE `customers` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `stripe_payment_method_id` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `card_brand` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `card_last4` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `card_saved_at` text;--> statement-breakpoint
ALTER TABLE `recurring_templates` ADD `auto_charge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_templates` ADD `charge_fail_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_templates` ADD `charge_last_error` text;--> statement-breakpoint
ALTER TABLE `recurring_templates` ADD `charge_last_at` text;--> statement-breakpoint
ALTER TABLE `recurring_templates` ADD `period_start` text;
