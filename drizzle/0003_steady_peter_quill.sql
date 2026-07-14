CREATE TABLE `menus` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`doc_json` text NOT NULL,
	`locations_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menus_workspace_slug_unique` ON `menus` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_menus_workspace` ON `menus` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `nav_location_bindings` (
	`workspace_id` text NOT NULL,
	`location_key` text NOT NULL,
	`menu_id` text NOT NULL,
	`bound_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nav_location_bindings_workspace_location_unique` ON `nav_location_bindings` (`workspace_id`,`location_key`);--> statement-breakpoint
CREATE INDEX `idx_nav_location_bindings_menu` ON `nav_location_bindings` (`workspace_id`,`menu_id`);