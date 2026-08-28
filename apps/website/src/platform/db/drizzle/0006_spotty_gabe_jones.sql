CREATE TABLE `member_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`evidence_json` text NOT NULL,
	`granted_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_consents_workspace_member_purpose_unique` ON `member_consents` (`workspace_id`,`member_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `member_magic_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_magic_tokens_workspace_tokenhash_unique` ON `member_magic_tokens` (`workspace_id`,`token_hash`);--> statement-breakpoint
CREATE TABLE `member_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`purpose` text,
	`op` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`origin_module` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_member_revisions_workspace_member` ON `member_revisions` (`workspace_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text,
	`user_agent` text,
	`ip` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_sessions_workspace_tokenhash_unique` ON `member_sessions` (`workspace_id`,`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_member_sessions_workspace_member` ON `member_sessions` (`workspace_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `member_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`tier_id` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`external_ref` text,
	`started_at` text NOT NULL,
	`current_period_end` text,
	`canceled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_member_subscriptions_workspace_member` ON `member_subscriptions` (`workspace_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `member_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`description` text,
	`welcome_page_path` text,
	`visible_in_portal` integer DEFAULT 0 NOT NULL,
	`monthly_price_cents` integer,
	`yearly_price_cents` integer,
	`currency` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_tiers_workspace_slug_unique` ON `member_tiers` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`email_verified_at` text,
	`status` text NOT NULL,
	`note` text,
	`fields_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_workspace_email_unique` ON `members` (`workspace_id`,`email`);--> statement-breakpoint
CREATE TABLE `newsletter_campaign_revisions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`state_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_newsletter_campaign_revisions_campaign` ON `newsletter_campaign_revisions` (`campaign_id`,`seq`);--> statement-breakpoint
CREATE TABLE `newsletter_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`status` text NOT NULL,
	`subject` text NOT NULL,
	`preheader` text,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`reply_to` text NOT NULL,
	`list_id` text NOT NULL,
	`scheduled_at` text,
	`send_started_at` text,
	`audience_snapshot_id` text,
	`counters_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_by_principal` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_newsletter_campaigns_workspace` ON `newsletter_campaigns` (`workspace_id`);