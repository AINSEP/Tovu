CREATE TABLE `media_slug_history` (
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`media_id` text NOT NULL,
	`retired_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `slug`)
);
--> statement-breakpoint
CREATE INDEX `idx_media_slug_history_media_id` ON `media_slug_history` (`workspace_id`,`media_id`);