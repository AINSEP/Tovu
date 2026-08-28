CREATE TABLE `migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`dialect` text NOT NULL,
	`status` text NOT NULL,
	`revision_seq_at_quiesce` integer,
	`quiesce_integrity` text,
	`blue_touched` integer DEFAULT 0 NOT NULL,
	`correlation_id` text,
	`restore_point_id` text,
	`actor_workspace_id` text,
	`actor_id` text,
	`delegated_by_workspace_id` text,
	`delegated_by_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_migration_runs_site_status` ON `migration_runs` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `restore_points` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`trigger` text NOT NULL,
	`cost_class` text NOT NULL,
	`kind` text NOT NULL,
	`artifact_ref` text NOT NULL,
	`watermark_at_capture` integer,
	`captured_schema_version` integer,
	`captured_schema_tag` text,
	`size_bytes` integer,
	`idempotency_key` text,
	`actor_workspace_id` text,
	`actor_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_restore_points_site_created` ON `restore_points` (`site_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_restore_points_site_idempotency_key` ON `restore_points` (`site_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `storage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`correlation_id` text,
	`restore_point_id` text,
	`schema_before_version` integer,
	`schema_before_tag` text,
	`schema_after_version` integer,
	`schema_after_tag` text,
	`drift_status` text,
	`outcome` text NOT NULL,
	`detail_json` text,
	`actor_workspace_id` text,
	`actor_id` text,
	`delegated_by_workspace_id` text,
	`delegated_by_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_storage_ledger_site_created` ON `storage_ledger` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_storage_ledger_site_kind` ON `storage_ledger` (`site_id`,`kind`);