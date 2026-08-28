CREATE TABLE `source_control_credential_sets` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`label` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_control_credential_sets_workspace_provider_label_unique` ON `source_control_credential_sets` (`workspace_id`,`provider_id`,`label`);