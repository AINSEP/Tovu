CREATE TABLE `vendor_credential_sets` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`vendor_id` text NOT NULL,
	`label` text NOT NULL,
	`sealed_key_id` text NOT NULL,
	`sealed_ciphertext` text NOT NULL,
	`sealed_nonce` text NOT NULL,
	`sealed_alg` text NOT NULL,
	`token_tail` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`account_label` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendor_credential_sets_workspace_vendor_label_unique` ON `vendor_credential_sets` (`workspace_id`,`vendor_id`,`label`);