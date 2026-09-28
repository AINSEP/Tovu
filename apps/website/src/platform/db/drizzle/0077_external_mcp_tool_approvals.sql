CREATE TABLE `external_mcp_tool_approvals` (
	`workspace_id` text NOT NULL,
	`server_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`fingerprint` text NOT NULL,
	`granted_by_principal_id` text NOT NULL,
	`granted_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `server_id`, `tool_name`),
	FOREIGN KEY (`workspace_id`,`server_id`) REFERENCES `external_mcp_servers`(`workspace_id`,`server_id`) ON UPDATE no action ON DELETE cascade
);
