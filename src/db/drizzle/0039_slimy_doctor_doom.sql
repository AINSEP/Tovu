PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body_json` text,
	`status` text NOT NULL,
	`kind` text DEFAULT 'post' NOT NULL,
	`body_format` text DEFAULT 'doc' NOT NULL,
	`body_html` text,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL,
	`seo_ext_json` text,
	`ext` text DEFAULT '{}' NOT NULL,
	`deleted_at` text,
	`template_choice` text,
	`overrides_theme_page` integer,
	CONSTRAINT "posts_body_format_shape" CHECK(("__new_posts"."body_format" = 'doc' AND "__new_posts"."body_json" IS NOT NULL AND "__new_posts"."body_html" IS NULL) OR ("__new_posts"."body_format" = 'html' AND "__new_posts"."body_html" IS NOT NULL AND "__new_posts"."body_json" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "workspace_id", "title", "slug", "body_json", "status", "kind", "body_format", "body_html", "updated_at", "version", "seo_ext_json", "ext", "deleted_at", "template_choice", "overrides_theme_page") SELECT "id", "workspace_id", "title", "slug", "body_json", "status", "kind", "body_format", "body_html", "updated_at", "version", "seo_ext_json", "ext", "deleted_at", "template_choice", "overrides_theme_page" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_workspace_slug_unique` ON `posts` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_workspace` ON `posts` (`workspace_id`);