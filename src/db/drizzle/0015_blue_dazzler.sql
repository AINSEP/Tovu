CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`referrer_host` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_term` text,
	`utm_content` text,
	`country` text,
	`region` text,
	`device_class` text NOT NULL,
	`browser_family` text,
	`os_family` text,
	`visitor_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`event_name` text,
	`event_props_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_events_workspace_list` ON `analytics_events` (`workspace_id`,`id`);