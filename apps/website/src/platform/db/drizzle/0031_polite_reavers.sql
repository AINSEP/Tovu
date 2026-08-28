CREATE TABLE `composio_config` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`key_tail` text,
	`auth_config_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "composio_config_sealed_shape" CHECK(("composio_config"."sealed_key_id" IS NULL AND "composio_config"."sealed_ciphertext" IS NULL AND "composio_config"."sealed_nonce" IS NULL AND "composio_config"."sealed_alg" IS NULL AND "composio_config"."key_tail" IS NULL) OR ("composio_config"."sealed_key_id" IS NOT NULL AND "composio_config"."sealed_ciphertext" IS NOT NULL AND "composio_config"."sealed_nonce" IS NOT NULL AND "composio_config"."sealed_alg" IS NOT NULL AND "composio_config"."key_tail" IS NOT NULL))
);
