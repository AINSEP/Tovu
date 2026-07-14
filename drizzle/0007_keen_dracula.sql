CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`event_id` text NOT NULL,
	`topic` text NOT NULL,
	`payload_json` text,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`next_attempt_at` text NOT NULL,
	`last_response_status` integer,
	`last_error` text,
	`signed_with_version` integer,
	`created_at` text NOT NULL,
	`delivered_at` text,
	`dead_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webhook_deliveries_workspace_sub_event` ON `webhook_deliveries` (`workspace_id`,`subscription_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_webhook_deliveries_status_next_attempt` ON `webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `webhook_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`owner_principal_id` text NOT NULL,
	`label` text NOT NULL,
	`target_url` text NOT NULL,
	`topics_json` text NOT NULL,
	`secret_version` integer NOT NULL,
	`previous_secret_version` integer,
	`status` text NOT NULL,
	`created_by_principal_id` text NOT NULL,
	`created_by_plugin_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`disabled_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_subscriptions_workspace` ON `webhook_subscriptions` (`workspace_id`);