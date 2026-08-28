ALTER TABLE `plugin_activations` ADD `quarantined_at` text;--> statement-breakpoint
ALTER TABLE `plugin_activations` ADD `quarantine_reason` text;--> statement-breakpoint
ALTER TABLE `plugin_activations` ADD `quarantine_failure_count` integer;