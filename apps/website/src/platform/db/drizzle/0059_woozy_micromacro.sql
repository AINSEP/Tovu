ALTER TABLE `media` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_workspace_slug` ON `media` (`workspace_id`,`slug`);