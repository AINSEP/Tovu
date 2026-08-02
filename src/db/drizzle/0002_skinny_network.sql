CREATE TABLE `setting_definitions` (
	`setting_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`workspace_id` text,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text,
	`schema_json` text NOT NULL,
	`default_json` text,
	`scopes` integer NOT NULL,
	`secret` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`alias_of_key` text,
	`alias_of_ns` text,
	`coercion_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_setting_definitions` ON `setting_definitions` (`setting_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_def_namespace_key_workspace` ON `setting_definitions` (`namespace`,`key`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `setting_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_kind` text NOT NULL,
	`setting_id` text NOT NULL,
	`scope` text,
	`workspace_id` text,
	`principal_id` text,
	`op` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`def_version` integer NOT NULL,
	`actor` text NOT NULL,
	`origin_plugin_id` text,
	`change_set_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rev_setting` ON `setting_revisions` (`setting_id`,`seq`);--> statement-breakpoint
CREATE TABLE `setting_values_global` (
	`setting_id` text PRIMARY KEY NOT NULL,
	`value_json` text,
	`state` text DEFAULT 'set' NOT NULL,
	`def_version` integer NOT NULL,
	`seq` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`origin_plugin_id` text
);
--> statement-breakpoint
CREATE TABLE `setting_values_user` (
	`setting_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`value_json` text,
	`state` text DEFAULT 'set' NOT NULL,
	`def_version` integer NOT NULL,
	`seq` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`origin_plugin_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_setting_values_user` ON `setting_values_user` (`workspace_id`,`principal_id`,`setting_id`);--> statement-breakpoint
CREATE TABLE `setting_values_workspace` (
	`setting_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`value_json` text,
	`state` text DEFAULT 'set' NOT NULL,
	`def_version` integer NOT NULL,
	`seq` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`origin_plugin_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_setting_values_workspace` ON `setting_values_workspace` (`workspace_id`,`setting_id`);