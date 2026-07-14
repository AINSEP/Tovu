CREATE TABLE `form_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`fields_json` text NOT NULL,
	`notify_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_definitions_workspace_slug_unique` ON `form_definitions` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_form_definitions_workspace` ON `form_definitions` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`form_definition_id` text NOT NULL,
	`data_json` text NOT NULL,
	`source_ip` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`form_definition_id`) REFERENCES `form_definitions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_form_submissions_definition` ON `form_submissions` (`form_definition_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_form_submissions_workspace` ON `form_submissions` (`workspace_id`);