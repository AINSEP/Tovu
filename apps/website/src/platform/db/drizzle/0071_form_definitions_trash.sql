ALTER TABLE `form_definitions` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `form_definitions` ADD `version` integer DEFAULT 1 NOT NULL;
