CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`label` text NOT NULL,
	`key_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`issued_policy_id` text,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_workspace_prefix` ON `api_keys` (`workspace_id`,`prefix`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_workspace_principal` ON `api_keys` (`workspace_id`,`principal_id`);