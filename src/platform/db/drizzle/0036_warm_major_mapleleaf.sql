CREATE TABLE `commerce_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`order_id` text NOT NULL,
	`price_id` text NOT NULL,
	`product_id` text NOT NULL,
	`description` text NOT NULL,
	`unit_amount_cents` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_id`) REFERENCES `commerce_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_order_items_unit_amount_cents_check" CHECK("commerce_order_items"."unit_amount_cents" >= 0),
	CONSTRAINT "commerce_order_items_quantity_check" CHECK("commerce_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_commerce_order_items_order` ON `commerce_order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text NOT NULL,
	`currency` text NOT NULL,
	`total_amount_cents` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_customer_ref` text,
	`provider_payment_ref` text,
	`provider_event_at` text,
	`placed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_orders_total_amount_cents_check" CHECK("commerce_orders"."total_amount_cents" >= 0),
	CONSTRAINT "commerce_orders_currency_check" CHECK(length("commerce_orders"."currency") = 3 AND "commerce_orders"."currency" = lower("commerce_orders"."currency")),
	CONSTRAINT "commerce_orders_status_check" CHECK("commerce_orders"."status" IN ('pending', 'paid', 'failed', 'canceled'))
);
--> statement-breakpoint
CREATE INDEX `idx_commerce_orders_workspace_member` ON `commerce_orders` (`workspace_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `commerce_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`billing_interval` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_prices_unit_amount_cents_check" CHECK("commerce_prices"."unit_amount_cents" >= 0),
	CONSTRAINT "commerce_prices_currency_check" CHECK(length("commerce_prices"."currency") = 3 AND "commerce_prices"."currency" = lower("commerce_prices"."currency")),
	CONSTRAINT "commerce_prices_status_check" CHECK("commerce_prices"."status" IN ('active', 'archived')),
	CONSTRAINT "commerce_prices_billing_interval_check" CHECK("commerce_prices"."billing_interval" IS NULL OR "commerce_prices"."billing_interval" IN ('month', 'year'))
);
--> statement-breakpoint
CREATE INDEX `idx_commerce_prices_product` ON `commerce_prices` (`product_id`);--> statement-breakpoint
CREATE TABLE `commerce_products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`description` text,
	`grants_member_tier_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`,`grants_member_tier_id`) REFERENCES `member_tiers`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_products_status_check" CHECK("commerce_products"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_workspace_slug_unique` ON `commerce_products` (`workspace_id`,`slug`);--> statement-breakpoint
CREATE TABLE `commerce_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text,
	`last_error` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_webhook_events_status_check" CHECK("commerce_webhook_events"."status" IN ('received', 'applied', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_webhook_events_provider_event_unique` ON `commerce_webhook_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_commerce_webhook_events_claim` ON `commerce_webhook_events` (`status`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_tiers_workspace_id_unique` ON `member_tiers` (`workspace_id`,`id`);