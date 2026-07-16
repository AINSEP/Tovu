CREATE TABLE `origin_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`scheme` text NOT NULL,
	`host` text NOT NULL,
	`port` integer,
	`base_path` text,
	`verified_at` text NOT NULL,
	`source` text NOT NULL,
	`redirect_allowlist_json` text DEFAULT '[]' NOT NULL,
	`egress_allowlist_json` text DEFAULT '[]' NOT NULL
);
