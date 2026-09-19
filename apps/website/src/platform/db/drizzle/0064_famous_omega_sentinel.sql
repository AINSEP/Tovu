CREATE TABLE `post_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`seq` integer NOT NULL,
	`op` text NOT NULL,
	`state_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`delegated_by_workspace_id` text,
	`delegated_by_id` text,
	`restored_from` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_post_revisions_workspace_post` ON `post_revisions` (`workspace_id`,`post_id`,`seq`);