CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body_json` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_workspace_slug_unique` ON `posts` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_workspace` ON `posts` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `presentation_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`active_theme_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);