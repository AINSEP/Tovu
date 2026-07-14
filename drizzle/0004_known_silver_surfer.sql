CREATE TABLE `redirect_hits` (
	`redirect_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`hit_count` integer DEFAULT 0 NOT NULL,
	`last_hit_at` text
);
--> statement-breakpoint
CREATE TABLE `redirect_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`redirect_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`seq` integer NOT NULL,
	`state_json` text NOT NULL,
	`tombstoned` integer NOT NULL,
	`actor_id` text NOT NULL,
	`plugin_id` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_redirect_revisions_redirect_seq` ON `redirect_revisions` (`redirect_id`,`seq`);--> statement-breakpoint
CREATE TABLE `redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`match_type` text NOT NULL,
	`from_pattern` text NOT NULL,
	`to_target` text NOT NULL,
	`status_code` integer NOT NULL,
	`status` text NOT NULL,
	`override` integer NOT NULL,
	`priority` integer NOT NULL,
	`source` text NOT NULL,
	`source_entry_id` text,
	`from_path_at_capture` text,
	`to_path_at_capture` text,
	`created_by_principal` text NOT NULL,
	`created_by_plugin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_redirects_workspace_frompattern` ON `redirects` (`workspace_id`,`from_pattern`);--> statement-breakpoint
CREATE INDEX `idx_redirects_workspace_status` ON `redirects` (`workspace_id`,`status`);--> statement-breakpoint
ALTER TABLE `posts` ADD `seo_ext_json` text;