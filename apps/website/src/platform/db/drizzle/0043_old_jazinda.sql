CREATE TABLE `publish_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`target` text NOT NULL,
	`url` text NOT NULL,
	`reachable` integer NOT NULL,
	`status` text NOT NULL,
	`project_name` text NOT NULL,
	`published_at` text NOT NULL,
	`owner` text,
	`repo` text,
	`base_path` text,
	`deployment_id` text,
	`commit_sha` text,
	`branch` text,
	`triggered_by` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_publish_history_workspace_id` ON `publish_history` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_publish_history_workspace_target_id` ON `publish_history` (`workspace_id`,`target`,`id`);