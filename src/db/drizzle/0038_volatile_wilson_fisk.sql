CREATE TABLE `commerce_product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_product_images_product_media_unique` ON `commerce_product_images` (`product_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `idx_commerce_product_images_product_position` ON `commerce_product_images` (`product_id`,`position`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_commerce_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_amount_cents` integer NOT NULL,
	`compare_at_amount_cents` integer,
	`currency` text NOT NULL,
	`billing_interval` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_prices_unit_amount_cents_check" CHECK("__new_commerce_prices"."unit_amount_cents" >= 0),
	CONSTRAINT "commerce_prices_compare_at_amount_cents_check" CHECK("__new_commerce_prices"."compare_at_amount_cents" IS NULL OR "__new_commerce_prices"."compare_at_amount_cents" > "__new_commerce_prices"."unit_amount_cents"),
	CONSTRAINT "commerce_prices_currency_check" CHECK(length("__new_commerce_prices"."currency") = 3 AND "__new_commerce_prices"."currency" = lower("__new_commerce_prices"."currency")),
	CONSTRAINT "commerce_prices_status_check" CHECK("__new_commerce_prices"."status" IN ('active', 'archived')),
	CONSTRAINT "commerce_prices_billing_interval_check" CHECK("__new_commerce_prices"."billing_interval" IS NULL OR "__new_commerce_prices"."billing_interval" IN ('month', 'year'))
);
--> statement-breakpoint
INSERT INTO `__new_commerce_prices`("id", "workspace_id", "product_id", "unit_amount_cents", "currency", "billing_interval", "status", "created_at", "version") SELECT "id", "workspace_id", "product_id", "unit_amount_cents", "currency", "billing_interval", "status", "created_at", "version" FROM `commerce_prices`;--> statement-breakpoint
DROP TABLE `commerce_prices`;--> statement-breakpoint
ALTER TABLE `__new_commerce_prices` RENAME TO `commerce_prices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_commerce_prices_product` ON `commerce_prices` (`product_id`);--> statement-breakpoint
ALTER TABLE `commerce_products` ADD `specs_json` text;