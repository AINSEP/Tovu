CREATE TABLE `media_provider_credentials` (
	`workspace_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`base_url` text,
	`model` text,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`key_tail` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `provider_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_provider_credentials_sealed_shape" CHECK(("media_provider_credentials"."sealed_key_id" IS NULL AND "media_provider_credentials"."sealed_ciphertext" IS NULL AND "media_provider_credentials"."sealed_nonce" IS NULL AND "media_provider_credentials"."sealed_alg" IS NULL AND "media_provider_credentials"."key_tail" IS NULL) OR ("media_provider_credentials"."sealed_key_id" IS NOT NULL AND "media_provider_credentials"."sealed_ciphertext" IS NOT NULL AND "media_provider_credentials"."sealed_nonce" IS NOT NULL AND "media_provider_credentials"."sealed_alg" IS NOT NULL AND "media_provider_credentials"."key_tail" IS NOT NULL))
);
