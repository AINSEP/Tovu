CREATE TABLE `deployment_environments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`is_production` integer NOT NULL,
	`created_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "deployment_environments_is_production_check" CHECK("deployment_environments"."is_production" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deployment_environments_workspace_slug` ON `deployment_environments` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `deployment_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`at` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_id`) REFERENCES `deployment_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "deployment_run_events_level_check" CHECK("deployment_run_events"."level" IN ('info', 'warning', 'error'))
);
--> statement-breakpoint
CREATE INDEX `idx_deployment_run_events_run` ON `deployment_run_events` (`run_id`,`at`);--> statement-breakpoint
CREATE TABLE `deployment_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`target_id` text,
	`environment_id` text,
	`release_id` text,
	`status` text NOT NULL,
	`provider_run_ref` text,
	`reconciliation` text NOT NULL,
	`requested_by_principal_id` text NOT NULL,
	`requested_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`error_summary` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_id`) REFERENCES `deployment_targets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`environment_id`) REFERENCES `deployment_environments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "deployment_runs_status_check" CHECK("deployment_runs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "deployment_runs_reconciliation_check" CHECK("deployment_runs"."reconciliation" IN ('poll', 'callback', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deployment_runs_provider_ref` ON `deployment_runs` (`provider_id`,`provider_run_ref`);--> statement-breakpoint
CREATE INDEX `idx_deployment_runs_workspace` ON `deployment_runs` (`workspace_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `deployment_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`label` text NOT NULL,
	`config_json` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`environment_id`) REFERENCES `deployment_environments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "deployment_targets_enabled_check" CHECK("deployment_targets"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_deployment_targets_workspace_env` ON `deployment_targets` (`workspace_id`,`environment_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_repo_url` text,
	`source_commit_sha` text,
	`source_uri` text,
	`source_checksum` text,
	`created_by_principal_id` text NOT NULL,
	`created_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "releases_source_kind_check" CHECK("releases"."source_kind" IN ('git-revision', 'external-artifact'))
);
--> statement-breakpoint
CREATE INDEX `idx_releases_workspace_created` ON `releases` (`workspace_id`,`created_at`);