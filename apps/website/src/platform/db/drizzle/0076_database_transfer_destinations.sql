CREATE TABLE `database_transfer_destinations` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`port` text NOT NULL,
	`database_name` text NOT NULL,
	`user_name` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`aad_version` integer NOT NULL,
	`saved_at` text NOT NULL,
	`last_run_json` text
);
