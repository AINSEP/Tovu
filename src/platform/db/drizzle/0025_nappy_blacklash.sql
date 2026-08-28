CREATE TABLE `site_assistant_credentials` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'google' NOT NULL,
	`base_url` text,
	`model` text,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`masked` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "site_assistant_credentials_sealed_shape" CHECK(("site_assistant_credentials"."sealed_key_id" IS NULL AND "site_assistant_credentials"."sealed_ciphertext" IS NULL AND "site_assistant_credentials"."sealed_nonce" IS NULL AND "site_assistant_credentials"."sealed_alg" IS NULL AND "site_assistant_credentials"."masked" IS NULL) OR ("site_assistant_credentials"."sealed_key_id" IS NOT NULL AND "site_assistant_credentials"."sealed_ciphertext" IS NOT NULL AND "site_assistant_credentials"."sealed_nonce" IS NOT NULL AND "site_assistant_credentials"."sealed_alg" IS NOT NULL AND "site_assistant_credentials"."masked" IS NOT NULL))
);
