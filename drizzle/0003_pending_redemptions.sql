CREATE TABLE `pending_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_id` text NOT NULL,
	`username` text NOT NULL,
	`user_id` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`invite_id`) REFERENCES `invites`(`id`) ON UPDATE no action ON DELETE cascade
);
