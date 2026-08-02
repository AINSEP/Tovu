# Medusa Monorepo Map

## 1. Summary of the Repository Layout

The local Medusa mirror is a workspace monorepo with these top-level package groups:

- `packages/medusa`
- `packages/framework/*`
- `packages/core/*`
- `packages/modules/*`
- `packages/modules/providers/*`
- `packages/admin/*`
- `packages/cli/*`
- `packages/plugins/*`
- `packages/generated/*`
- `packages/design-system/*`
- `packages/medusa-test-utils`
- `integration-tests/*`

The package map itself is a strong source of truth because it shows which responsibilities Medusa treats as reusable platform capabilities rather than app-local code.

Two clarifications are worth making explicit:

- `packages/framework/*` and `packages/generated/*` are declared workspace globs in the root package manifest, even though this first-pass corpus does not decompose them into their own standalone subsystem docs.
- `packages/medusa-test-utils` is a declared workspace path that publishes as `@medusajs/test-utils`.

## 2. Key Primitives / Contracts

### `packages/medusa`

The assembled application package.

Visible responsibilities:

- loaders
- module registration files
- HTTP API folders
- commands
- jobs
- subscribers
- policies

### `packages/core/*`

The reusable runtime and composition substrate.

Key packages:

- `@medusajs/framework`
- `@medusajs/modules-sdk`
- `@medusajs/workflows-sdk`
- `@medusajs/orchestration`
- `@medusajs/core-flows`
- `@medusajs/utils`
- `@medusajs/types`
- `@medusajs/js-sdk`

`packages/framework/*` is also declared as a workspace glob in the root manifest. In the current local mirror and package inventory, the main reusable framework surface still presents as `@medusajs/framework` alongside the other core/runtime packages, so this corpus keeps it grouped with the reusable runtime substrate rather than treating `packages/framework/*` as a separate architectural zone.

### `packages/modules/*`

The commerce and platform domain modules.

Examples:

- `product`
- `pricing`
- `cart`
- `order`
- `payment`
- `fulfillment`
- `inventory`
- `tax`
- `customer`
- `auth`
- `rbac`
- `settings`
- `translation`
- `workflow-engine-*`

### `packages/modules/providers/*`

Provider-specific adapters behind domain seams.

Examples:

- `payment-stripe`
- `file-s3`
- `file-local`
- `notification-sendgrid`
- `notification-local`
- `auth-emailpass`
- `auth-github`
- `auth-google`
- `locking-postgres`
- `locking-redis`
- `caching-redis`

### `packages/admin/*`

The operator UI and its build/runtime helpers.

Key packages:

- `dashboard`
- `admin-sdk`
- `admin-vite-plugin`
- `admin-bundler`
- `admin-shared`

### `packages/cli/*`

Project scaffolding, DB workflow, OAS generation, and contributor tooling.

The root workspace manifest also declares `packages/generated/*`. This first pass treats generated artifacts as tooling-adjacent support output rather than as a separate architectural subsystem.

### `packages/plugins/*`

Feature packages that exercise Medusa's extension model.

Current examples in the repo:

- `draft-order`
- `loyalty`

### `integration-tests/*`

Three visible test surfaces:

- API tests
- HTTP tests
- module tests

## 3. Boundaries and Constraints

- Medusa treats the framework/runtime substrate as reusable and publishable packages.
- Medusa treats business domains as separate module packages with their own models, migrations, and services.
- Medusa treats provider implementations as separate packages rather than embedding them into domain modules.
- Medusa treats the admin as an extensible product surface, not just static internal screens.
- Medusa treats plugins as first-class contributors that can add both backend and admin behavior.

## 4. Operational Implications

- Teams can swap or add providers without rewriting core module ownership.
- The architecture is extensible, but reading the full platform requires following package boundaries carefully.
- Test strategy is aligned with the package split: runtime behavior is checked through module, API, and HTTP integration layers.

## 5. Tovu Reconstruction Notes

### Why this exists

This map exists so Tovu can reason from Medusa's real package boundaries instead of reverse-engineering the platform from one or two folders.

### What Tovu should preserve

- separate package or module ownership for framework, domain, adapters, admin, and tooling concerns
- visible top-level grouping that reveals architectural intent
- extension packages that prove the seams are real

### What Tovu can simplify

- fewer published packages if Tovu can preserve the same dependency direction with less packaging overhead
- fewer repo groups if some seams are not independently deployed or versioned

### Possible Tovu seams

- `core/framework`
- `core/orchestration`
- `modules/*`
- `modules/providers/*`
- `admin/*`
- `cli/*`
- `plugins/*`

### Suggested priority

- `V1`: preserve the responsibility split
- `Later`: tune packaging density based on Tovu's delivery ergonomics
