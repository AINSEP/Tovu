CREATE TABLE `entry_refs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`source_entry_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`field_path` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entry_refs_source` ON `entry_refs` (`workspace_id`,`source_entry_id`);--> statement-breakpoint
CREATE INDEX `idx_entry_refs_target` ON `entry_refs` (`workspace_id`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `widget_region_bindings` (
	`workspace_id` text NOT NULL,
	`region_key` text NOT NULL,
	`area_entry_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `widget_region_bindings_workspace_region_unique` ON `widget_region_bindings` (`workspace_id`,`region_key`);--> statement-breakpoint
CREATE INDEX `idx_widget_region_bindings_area` ON `widget_region_bindings` (`workspace_id`,`area_entry_id`);