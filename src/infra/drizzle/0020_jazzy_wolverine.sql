CREATE TABLE `agent_tool_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` text NOT NULL,
	`execution_id` text,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`principal_id` text NOT NULL,
	`phase` text NOT NULL,
	`at` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `idx_agent_tool_attempts_workspace_list` ON `agent_tool_attempts` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_agent_tool_attempts_attempt` ON `agent_tool_attempts` (`workspace_id`,`attempt_id`);