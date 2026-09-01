CREATE TABLE `gated_mutation_tokens` (
	`confirmation_token` text PRIMARY KEY NOT NULL,
	`plan_hash` text NOT NULL,
	`scope_id` text NOT NULL,
	`confirmer_principal_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
