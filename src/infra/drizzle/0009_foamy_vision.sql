CREATE TABLE `storage_write_watermark` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`last_stamped_at` text
);
