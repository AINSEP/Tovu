# API And Extension Entrypoints

Curated evidence inventory of visible entrypoints extracted from the local Medusa mirror.

This file is intentionally an inventory and representative surface map, not a verbatim dump of every route file or every plugin entrypoint.

## HTTP API zones in `packages/medusa/src/api`

- `admin/`
- `store/`
- `auth/`
- `hooks/`
- `cloud/`
- shared `utils/`

## Representative admin route families

- `api-keys`
- `campaigns`
- `claims`
- `collections`
- `currencies`
- `customer-groups`
- `customers`
- `draft-orders`
- `exchanges`
- `feature-flags`
- `fulfillment-providers`
- `fulfillment-sets`
- `fulfillments`
- `index`
- `inventory-items`
- `invites`
- `locales`
- `notifications`
- `order-changes`
- `order-edits`
- `orders`
- `payment-collections`
- `payments`
- `plugins`
- `price-lists`
- `price-preferences`
- `product-categories`
- `product-tags`
- `product-types`
- `product-variants`
- `products`
- `promotions`
- `property-labels`
- `rbac`
- `refund-reasons`
- `regions`
- `reservations`
- `return-reasons`
- `returns`
- `sales-channels`
- `shipping-option-types`
- `shipping-options`
- `shipping-profiles`
- `stock-locations`
- `stores`
- `tax-providers`
- `tax-rates`
- `tax-regions`
- `translations`
- `uploads`
- `users`
- `views`
- `workflows-executions`

## Representative store route families

- `carts`
- `collections`
- `currencies`
- `customers`
- `locales`
- `orders`
- `payment-collections`
- `payment-providers`
- `product-categories`
- `product-tags`
- `product-types`
- `product-variants`
- `products`
- `regions`
- `return-reasons`
- `returns`
- `shipping-options`

## Plugin contribution entrypoints visible in the loaders

Resolved plugin folders are loaded from:

- `api`
- `admin`
- `jobs`
- `links`
- `workflows`
- `subscribers`

## Admin extension contribution types visible in `admin-vite-plugin` and `dashboard`

- routes
- menu items
- widgets
- custom field links
- custom field forms
- custom field displays
- i18n resources

## Dashboard route families visible in `packages/admin/dashboard/src/routes`

- `api-key-management`
- `campaigns`
- `categories`
- `collections`
- `customer-groups`
- `customers`
- `inventory`
- `invite`
- `locations`
- `orders`
- `price-lists`
- `product-tags`
- `product-types`
- `product-variants`
- `products`
- `profile`
- `promotions`
- `refund-reasons`
- `regions`
- `reservations`
- `return-reasons`
- `sales-channels`
- `settings`
- `shipping-option-types`
- `shipping-profiles`
- `store`
- `tax-regions`
- `translations`
- `users`
- `workflow-executions`

## Example plugin package structure

`packages/plugins/draft-order/src` includes:

- `admin`
- `types`

`packages/plugins/loyalty/src` includes:

- `admin`
- `api`
- `jobs`
- `links`
- `modules`
- `subscribers`
- `types`
- `utils`
- `workflows`
