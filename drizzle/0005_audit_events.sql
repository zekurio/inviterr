CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`target_label` text,
	`batch_id` text,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_id`);