CREATE TABLE `content_type_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_type_key` text NOT NULL,
	`workspace_id` text NOT NULL,
	`op` text NOT NULL,
	`state_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`delegated_by_workspace_id` text,
	`delegated_by_id` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_type_revisions_workspace_key` ON `content_type_revisions` (`workspace_id`,`content_type_key`,`seq`);--> statement-breakpoint
CREATE TABLE `content_types` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`fields_json` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`tombstoned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_types_workspace_key_unique` ON `content_types` (`workspace_id`,`key`);--> statement-breakpoint
CREATE INDEX `idx_content_types_workspace` ON `content_types` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`body_json` text,
	`fields_json` text NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_workspace_type_slug_unique` ON `entries` (`workspace_id`,`type`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_entries_workspace` ON `entries` (`workspace_id`,`type`);--> statement-breakpoint
CREATE TABLE `entry_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`op` text NOT NULL,
	`state_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`delegated_by_workspace_id` text,
	`delegated_by_id` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entry_revisions_workspace_entry` ON `entry_revisions` (`workspace_id`,`entry_id`,`seq`);--> statement-breakpoint
CREATE TABLE `entry_terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text NOT NULL,
	`term_id` text NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_terms_unique` ON `entry_terms` (`workspace_id`,`content_type`,`content_id`,`term_id`);--> statement-breakpoint
CREATE TABLE `taxonomies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`hierarchical` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_taxonomies_workspace` ON `taxonomies` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `taxonomy_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`taxonomy_id` text NOT NULL,
	`op` text NOT NULL,
	`previous_state_json` text,
	`actor_id` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_taxonomy_revisions_workspace_taxonomy` ON `taxonomy_revisions` (`workspace_id`,`taxonomy_id`,`seq`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`taxonomy_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_terms_workspace_taxonomy` ON `terms` (`workspace_id`,`taxonomy_id`);