CREATE TABLE `publish_trust_revocations` (
	`source_installation_id` text PRIMARY KEY NOT NULL,
	`revoked_at` text NOT NULL,
	`note` text
);
