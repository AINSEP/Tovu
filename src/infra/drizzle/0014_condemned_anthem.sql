CREATE TABLE `asset_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_by_principal` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`tombstoned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_asset_blobs_workspace_sha256` ON `asset_blobs` (`workspace_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `asset_renditions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`transform_name` text NOT NULL,
	`version` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_asset_renditions_asset` ON `asset_renditions` (`workspace_id`,`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_asset_renditions_lookup` ON `asset_renditions` (`workspace_id`,`asset_id`,`transform_name`,`version`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`alt` text NOT NULL,
	`caption` text NOT NULL,
	`credit` text NOT NULL,
	`source_sha256` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transform_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`params_json` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transform_registry_lookup` ON `transform_registry` (`workspace_id`,`name`,`version`);