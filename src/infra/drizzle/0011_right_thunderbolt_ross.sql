CREATE TABLE `change_set_items` (
	`id` text PRIMARY KEY NOT NULL,
	`change_set_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`before_revision_id` text,
	`after_revision_id` text,
	`inverse_payload_json` text,
	`entity_version_at_apply` integer,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_change_set_items_change_set` ON `change_set_items` (`change_set_id`,`position`);--> statement-breakpoint
CREATE TABLE `change_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`idempotency_key` text,
	`intent_ref` text,
	`created_at` text NOT NULL,
	`applied_at` text,
	`reverted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_change_sets_workspace` ON `change_sets` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_change_sets_idempotency` ON `change_sets` (`workspace_id`,`idempotency_key`);