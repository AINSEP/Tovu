CREATE TABLE `site_title_preexisting_workspaces` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`preserved_at` text
);
--> statement-breakpoint
-- SPEC-050 NC-3 = A: record every workspace that exists when this runs. A new site seeds after migrate(), so it records none.
INSERT INTO `site_title_preexisting_workspaces` (`workspace_id`) SELECT `id` FROM `workspaces`;
