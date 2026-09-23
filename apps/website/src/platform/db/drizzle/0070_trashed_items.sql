CREATE TABLE `trashed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`trashed_at` text NOT NULL,
	`purge_after` text NOT NULL,
	`actor_principal_id` text NOT NULL,
	`actor_plugin_id` text,
	`display_title` text NOT NULL,
	`display_subtitle` text,
	`entity_version` integer,
	`purge_lease_owner` text,
	`purge_lease_expires_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trashed_items_identity_unique` ON `trashed_items` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_trashed_items_purge_after` ON `trashed_items` (`purge_after`);--> statement-breakpoint
CREATE INDEX `idx_trashed_items_workspace_trashed_at` ON `trashed_items` (`workspace_id`,`trashed_at`);
