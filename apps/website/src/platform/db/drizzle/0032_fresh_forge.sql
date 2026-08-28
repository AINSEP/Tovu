CREATE TABLE `composio_connector_credentials` (
	`workspace_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`account_label` text,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `connector_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "composio_connector_credentials_sealed_shape" CHECK(("composio_connector_credentials"."sealed_key_id" IS NULL AND "composio_connector_credentials"."sealed_ciphertext" IS NULL AND "composio_connector_credentials"."sealed_nonce" IS NULL AND "composio_connector_credentials"."sealed_alg" IS NULL) OR ("composio_connector_credentials"."sealed_key_id" IS NOT NULL AND "composio_connector_credentials"."sealed_ciphertext" IS NOT NULL AND "composio_connector_credentials"."sealed_nonce" IS NOT NULL AND "composio_connector_credentials"."sealed_alg" IS NOT NULL))
);
