CREATE TABLE `plugin_activations` (
	`workspace_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_plugin_activations` ON `plugin_activations` (`workspace_id`,`plugin_id`);--> statement-breakpoint
ALTER TABLE `posts` ADD `ext` text DEFAULT '{}' NOT NULL;