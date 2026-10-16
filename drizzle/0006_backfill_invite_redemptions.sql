-- Copies invite usages recorded before the audit log existed into it, so the
-- audit log can replace the separate invite history view. Names come from the
-- user's most recent session snapshot (Jellyfin is unreachable from SQL), and
-- details stay empty because the redemption-time email was never stored.
INSERT INTO `audit_events` (
	`id`,
	`created_at`,
	`actor_type`,
	`actor_id`,
	`actor_name`,
	`action`,
	`target_type`,
	`target_id`,
	`target_label`
)
SELECT
	lower(
		hex(randomblob(4)) || '-' ||
		hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', 1 + (abs(random()) % 4), 1) ||
		substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	),
	`invite_usages`.`used_at`,
	'user',
	`invite_usages`.`user_id`,
	(
		SELECT `sessions`.`display_name_snapshot`
		FROM `sessions`
		WHERE `sessions`.`user_id` = `invite_usages`.`user_id`
		ORDER BY `sessions`.`updated_at` DESC
		LIMIT 1
	),
	'invite.redeemed',
	'invite',
	`invite_usages`.`invite_id`,
	`invites`.`code`
FROM `invite_usages`
INNER JOIN `invites` ON `invites`.`id` = `invite_usages`.`invite_id`
WHERE NOT EXISTS (
	SELECT 1
	FROM `audit_events`
	WHERE `audit_events`.`action` = 'invite.redeemed'
		AND `audit_events`.`actor_id` = `invite_usages`.`user_id`
		AND `audit_events`.`target_id` = `invite_usages`.`invite_id`
);
