CREATE TABLE `content_transport_baselines` (
	`workspace_id` text NOT NULL,
	`peer_principal_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`hash_at_last_sync` text NOT NULL,
	`hash_version` integer NOT NULL,
	`synced_at` text NOT NULL,
	`run_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_transport_baselines_unique` ON `content_transport_baselines` (`workspace_id`,`peer_principal_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `content_transport_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_principal_id` text NOT NULL,
	`hash_version` integer NOT NULL,
	`entities_json` text NOT NULL,
	`blob_manifest_json` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`received_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_transport_bundles_workspace` ON `content_transport_bundles` (`workspace_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `content_transport_peers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`remote_workspace_id` text NOT NULL,
	`sealed_key_id` text,
	`sealed_ciphertext` text,
	`sealed_nonce` text,
	`sealed_alg` text,
	`masked` text,
	`aad_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_transport_peers_workspace_label_unique` ON `content_transport_peers` (`workspace_id`,`label`);--> statement-breakpoint
CREATE TABLE `content_transport_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`direction` text NOT NULL,
	`peer_principal_id` text NOT NULL,
	`peer_label` text,
	`phase` text NOT NULL,
	`restore_point_id` text,
	`change_set_ids_json` text,
	`actor_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`report_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_content_transport_runs_workspace` ON `content_transport_runs` (`workspace_id`,`started_at`);