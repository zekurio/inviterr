CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`message` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_requests_email_unique` ON `access_requests` (`email`);--> statement-breakpoint
ALTER TABLE `invites` ADD `email` text;