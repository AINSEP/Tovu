CREATE TABLE `oauth_device_authorizations` (
	`workspace_id` text NOT NULL,
	`server_id` text NOT NULL,
	`user_code` text NOT NULL,
	`verification_uri` text NOT NULL,
	`verification_uri_complete` text,
	`interval_seconds` integer NOT NULL,
	`expires_at` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `server_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_pending_authorizations` (
	`state` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`provider_id` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scopes_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_pending_expires_at` ON `oauth_pending_authorizations` (`expires_at`);