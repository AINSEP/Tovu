CREATE TABLE `custom_credential_sets` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`base_url` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_credential_sets_workspace_label_unique` ON `custom_credential_sets` (`workspace_id`,`label`);