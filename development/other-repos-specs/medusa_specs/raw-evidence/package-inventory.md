# Package Inventory

Curated evidence inventory derived from `other-repos/medusa/packages/**/package.json`.

This file lists published package names and descriptions, not every workspace path verbatim from the root manifest.

Relevant workspace-path note:

- `packages/medusa-test-utils` publishes as `@medusajs/test-utils`
- the root manifest also declares `packages/framework/*` and `packages/generated/*` workspace globs, which are noted in the monorepo map even though they are not broken out here as standalone package families

## Admin packages

- `@medusajs/admin-bundler` — bundler for the Medusa admin dashboard
- `@medusajs/admin-sdk` — SDK for building extensions for the Medusa admin dashboard
- `@medusajs/admin-shared` — shared code for Medusa admin packages
- `@medusajs/admin-vite-plugin`
- `@medusajs/dashboard`

## Core packages

- `@medusajs/core-flows` — set of workflow definitions for Medusa
- `@medusajs/framework`
- `@medusajs/js-sdk` — SDK for the Medusa API
- `@medusajs/modules-sdk` — SDK for Medusa modules
- `@medusajs/orchestration` — utilities to orchestrate modules
- `@medusajs/types`
- `@medusajs/utils`
- `@medusajs/workflows-sdk` — workflows tooling for Medusa

## Main runtime package

- `@medusajs/medusa` — building blocks for digital commerce

## Domain modules

- `@medusajs/analytics`
- `@medusajs/api-key`
- `@medusajs/auth`
- `@medusajs/cache-inmemory`
- `@medusajs/cache-redis`
- `@medusajs/caching`
- `@medusajs/cart`
- `@medusajs/currency`
- `@medusajs/customer`
- `@medusajs/event-bus-local`
- `@medusajs/event-bus-redis`
- `@medusajs/file`
- `@medusajs/fulfillment`
- `@medusajs/index`
- `@medusajs/inventory`
- `@medusajs/link-modules`
- `@medusajs/locking`
- `@medusajs/notification`
- `@medusajs/order`
- `@medusajs/payment`
- `@medusajs/pricing`
- `@medusajs/product`
- `@medusajs/promotion`
- `@medusajs/rbac`
- `@medusajs/region`
- `@medusajs/sales-channel`
- `@medusajs/settings`
- `@medusajs/stock-location`
- `@medusajs/store`
- `@medusajs/tax`
- `@medusajs/translation`
- `@medusajs/user`
- `@medusajs/workflow-engine-inmemory`
- `@medusajs/workflow-engine-redis`

## Provider packages

- `@medusajs/analytics-local`
- `@medusajs/analytics-posthog`
- `@medusajs/auth-emailpass`
- `@medusajs/auth-github`
- `@medusajs/auth-google`
- `@medusajs/caching-redis`
- `@medusajs/file-local`
- `@medusajs/file-s3`
- `@medusajs/fulfillment-manual`
- `@medusajs/locking-postgres`
- `@medusajs/locking-redis`
- `@medusajs/notification-local`
- `@medusajs/notification-sendgrid`
- `@medusajs/payment-stripe`

## CLI packages

- `create-medusa-app`
- `@medusajs/cli`
- `medusa-dev-cli`
- `@medusajs/http-types-generator`
- `@medusajs/medusa-oas-cli`
- `@medusajs/oas-github-ci`

## Plugin packages

- `@medusajs/draft-order`
- `@medusajs/loyalty-plugin`

## Other visible support packages

- `@medusajs/deps`
- `@medusajs/telemetry`
- `@medusajs/test-utils`
- `@medusajs/icons`
- `@medusajs/toolbox`
- `@medusajs/ui`
- `@medusajs/ui-preset`
