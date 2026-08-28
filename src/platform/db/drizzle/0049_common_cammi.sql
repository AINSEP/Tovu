-- Hand-corrected after `drizzle-kit generate`.
--
-- SQLite cannot ALTER a CHECK constraint, so drizzle-kit emits a create/copy/drop/rename for this
-- table. Its generated INSERT..SELECT listed the NEW column names on BOTH sides, which cannot run
-- against the OLD table -- those columns do not exist there yet. The SELECT below therefore reads
-- only the columns the old table actually has and supplies the new ones as literals:
--   auth_mode -> 'static_env' (every pre-existing row's only credential mechanism was the env
--     block; a row with an empty block behaves identically under 'none', so 'static_env' is the
--     value that preserves meaning rather than relabelling rows that DO carry a sealed block)
--   url, oauth_* -> NULL (no pre-existing row was ever OAuth-authenticated)

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_external_mcp_servers` (
	`workspace_id` text NOT NULL,
	`server_id` text NOT NULL,
	`label` text,
	`transport` text NOT NULL,
	`auth_mode` text DEFAULT 'static_env' NOT NULL,
	`enabled` integer NOT NULL,
	`command` text,
	`url` text,
	`args` text,
	`allowed_tool_names` text,
	`env_names` text,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`oauth_provider_id` text,
	`oauth_grant` text,
	`oauth_client_id` text,
	`oauth_endpoints_json` text,
	`oauth_scopes_json` text,
	`oauth_status` text,
	`oauth_expires_at` text,
	`oauth_token_env_name` text,
	`oauth_refresh_lease_until` text,
	`oauth_sealed_key_id` text,
	`oauth_sealed_ciphertext` text,
	`oauth_sealed_nonce` text,
	`oauth_sealed_alg` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `server_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "external_mcp_servers_sealed_shape" CHECK(("__new_external_mcp_servers"."sealed_key_id" IS NULL AND "__new_external_mcp_servers"."sealed_ciphertext" IS NULL AND "__new_external_mcp_servers"."sealed_nonce" IS NULL AND "__new_external_mcp_servers"."sealed_alg" IS NULL) OR ("__new_external_mcp_servers"."sealed_key_id" IS NOT NULL AND "__new_external_mcp_servers"."sealed_ciphertext" IS NOT NULL AND "__new_external_mcp_servers"."sealed_nonce" IS NOT NULL AND "__new_external_mcp_servers"."sealed_alg" IS NOT NULL)),
	CONSTRAINT "external_mcp_servers_oauth_sealed_shape" CHECK(("__new_external_mcp_servers"."oauth_sealed_key_id" IS NULL AND "__new_external_mcp_servers"."oauth_sealed_ciphertext" IS NULL AND "__new_external_mcp_servers"."oauth_sealed_nonce" IS NULL AND "__new_external_mcp_servers"."oauth_sealed_alg" IS NULL) OR ("__new_external_mcp_servers"."oauth_sealed_key_id" IS NOT NULL AND "__new_external_mcp_servers"."oauth_sealed_ciphertext" IS NOT NULL AND "__new_external_mcp_servers"."oauth_sealed_nonce" IS NOT NULL AND "__new_external_mcp_servers"."oauth_sealed_alg" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_external_mcp_servers`("workspace_id", "server_id", "label", "transport", "auth_mode", "enabled", "command", "url", "args", "allowed_tool_names", "env_names", "sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg", "oauth_provider_id", "oauth_grant", "oauth_client_id", "oauth_endpoints_json", "oauth_scopes_json", "oauth_status", "oauth_expires_at", "oauth_token_env_name", "oauth_refresh_lease_until", "oauth_sealed_key_id", "oauth_sealed_ciphertext", "oauth_sealed_nonce", "oauth_sealed_alg", "created_at", "updated_at") SELECT "workspace_id", "server_id", "label", "transport", 'static_env', "enabled", "command", NULL, "args", "allowed_tool_names", "env_names", "sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg", NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, "created_at", "updated_at" FROM `external_mcp_servers`;--> statement-breakpoint
DROP TABLE `external_mcp_servers`;--> statement-breakpoint
ALTER TABLE `__new_external_mcp_servers` RENAME TO `external_mcp_servers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;