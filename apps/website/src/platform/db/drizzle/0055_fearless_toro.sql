ALTER TABLE `admin_execution_credentials` ADD `aad_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `composio_config` ADD `aad_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `composio_connector_credentials` ADD `aad_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_provider_credentials` ADD `aad_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_assistant_credentials` ADD `aad_version` integer DEFAULT 0 NOT NULL;