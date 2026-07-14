CREATE TABLE `identity_users` (
	`principal_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`password_hash` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_identity_users_workspace_username` ON `identity_users` (`workspace_id`,`username`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_builtin` integer NOT NULL,
	`is_frozen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policies_workspace_name` ON `policies` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `policy_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`permission` text NOT NULL,
	`resource_type` text,
	`constraint_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_policy_permissions_workspace_policy` ON `policy_permissions` (`workspace_id`,`policy_id`);--> statement-breakpoint
CREATE TABLE `principal_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`policy_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_principal_policies_workspace_principal` ON `principal_policies` (`workspace_id`,`principal_id`);--> statement-breakpoint
CREATE TABLE `principal_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`role_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_principal_roles_workspace_principal` ON `principal_roles` (`workspace_id`,`principal_id`);--> statement-breakpoint
CREATE TABLE `principals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text NOT NULL,
	`disabled_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`role_id` text NOT NULL,
	`policy_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_role_policies_workspace_role` ON `role_policies` (`workspace_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`is_builtin` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_roles_workspace_name` ON `roles` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`ip` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_workspace_token_hash` ON `sessions` (`workspace_id`,`token_hash`);