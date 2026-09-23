ALTER TABLE `entries` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `form_submissions` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `form_submissions` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trashed_items` ADD `prior_marker` text;
