# Directus Shared Runtime Libraries

**Source files analyzed:**
- `other-repos/directus/packages/env/package.json`
- `other-repos/directus/packages/env/src/index.ts`
- `other-repos/directus/packages/env/src/lib/create-env.ts`
- `other-repos/directus/packages/env/src/lib/use-env.ts`
- `other-repos/directus/packages/memory/package.json`
- `other-repos/directus/packages/memory/src/index.ts`
- `other-repos/directus/packages/memory/src/bus/lib/create.ts`
- `other-repos/directus/packages/memory/src/cache/lib/create.ts`
- `other-repos/directus/packages/memory/src/kv/lib/create.ts`
- `other-repos/directus/packages/memory/src/limiter/lib/create.ts`
- `other-repos/directus/packages/schema/package.json`
- `other-repos/directus/packages/schema/src/index.ts`
- `other-repos/directus/packages/specs/package.json`
- `other-repos/directus/packages/specs/src/openapi.yaml`
- `other-repos/directus/packages/storage/package.json`
- `other-repos/directus/packages/storage/src/index.ts`
- `other-repos/directus/packages/storage-driver-local/src/index.ts`
- `other-repos/directus/packages/storage-driver-s3/src/index.ts`
- `other-repos/directus/packages/storage-driver-azure/src/index.ts`
- `other-repos/directus/packages/storage-driver-gcs/src/index.ts`
- `other-repos/directus/packages/storage-driver-cloudinary/src/index.ts`
- `other-repos/directus/packages/storage-driver-supabase/src/index.ts`
- `other-repos/directus/packages/types/package.json`
- `other-repos/directus/packages/types/src/index.ts`
- `other-repos/directus/packages/types/src/schema.ts`
- `other-repos/directus/packages/types/src/storage.ts`
- `other-repos/directus/packages/types/src/services.ts`
- `other-repos/directus/packages/types/src/extensions/index.ts`
- `other-repos/directus/packages/constants/package.json`
- `other-repos/directus/packages/constants/src/index.ts`
- `other-repos/directus/packages/constants/src/extensions.ts`
- `other-repos/directus/packages/constants/src/fields.ts`
- `other-repos/directus/packages/constants/src/files.ts`
- `other-repos/directus/packages/utils/package.json`
- `other-repos/directus/packages/utils/shared/index.ts`
- `other-repos/directus/packages/utils/node/index.ts`
- `other-repos/directus/packages/utils/browser/index.ts`
- `other-repos/directus/packages/extensions/package.json`
- `other-repos/directus/packages/extensions/src/index.ts`
- `other-repos/directus/packages/extensions/src/shared/schemas/manifest.ts`
- `other-repos/directus/packages/extensions/src/shared/schemas/options.ts`
- `other-repos/directus/packages/extensions/src/shared/constants/shared-deps.ts`
- `other-repos/directus/packages/extensions/src/shared/types/index.ts`
- `other-repos/directus/packages/extensions-registry/package.json`
- `other-repos/directus/packages/extensions-registry/src/index.ts`
- `other-repos/directus/packages/extensions-registry/src/constants.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/index.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/list/list.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/describe/describe.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/download/download.ts`
- `other-repos/directus/packages/extensions-registry/src/modules/account/account.ts`
- `other-repos/directus/api/src/server.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/database/index.ts`
- `other-repos/directus/api/src/services/extensions.ts`
- `other-repos/directus/api/src/utils/validate-storage.ts`
- `other-repos/directus/api/src/extensions/index.ts`
- `other-repos/directus/app/src/main.ts`
- `other-repos/directus/app/src/stores/extensions.ts`
- `other-repos/directus/directus/cli.js`
- `other-repos/directus/packages/extensions-sdk/src/index.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/run.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/build.ts`
- `other-repos/directus/packages/extensions-sdk/src/cli/commands/link.ts`

---

## 1. Why These Packages Matter

Directus is not held together by the API package alone. The runtime is assembled from a set of shared packages that define:

- process configuration and environment parsing
- in-memory and Redis-backed coordination primitives
- canonical schema and type surfaces
- storage driver contracts and provider implementations
- extension manifest, registry, and SDK boundaries
- shared constants and utility helpers used by both API and app code

These packages are the seam between the app/API implementation and the product-level runtime behavior.

---

## 2. Environment Configuration

`@directus/env` is the configuration loader for the whole runtime.

Its shape is intentionally simple:

- `useEnv()` returns a cached singleton
- `createEnv()` builds the env object from process variables plus a config file
- `readConfigurationFromFile()` supports JavaScript, JSON, YAML, and dotenv-style files
- file-suffixed env keys are dereferenced from disk before casting

The package also carries default values for core runtime behavior such as:

- HTTP host/port and `PUBLIC_URL`
- database, storage, cache, rate limit, email, extension, telemetry, websocket, and TUS settings
- shared limits like payload size and relational depth

The API depends on this package at bootstrap time and then throughout services, middleware, migrations, and utilities. The important boundary is that env parsing lives here, not in the API package.

---

## 3. Memory, Bus, Cache, KV, And Limiter Primitives

`@directus/memory` is the runtime coordination layer. It is not a generic cache library; it is Directus' abstraction over local process memory and Redis-backed coordination.

### 3.1 Bus

The bus package provides pub/sub behavior with two implementations:

- `BusLocal` for in-process message fanout
- `BusRedis` for distributed pub/sub with namespacing and optional compression

The Redis implementation uses a single message listener and dispatches to registered callbacks in-memory. That keeps the Node process handle count low while still supporting multi-process coordination.

### 3.2 KV And Cache

The KV layer is the low-level store abstraction used by the cache layer.

- `KvLocal` stores serialized values in a `Map` or `LRUCache`
- `KvRedis` stores serialized values in Redis, supports compression, TTL, increment, max-setting, and locking
- `KvRedis` uses Redlock for distributed locks

The cache layer is built on top of KV:

- `CacheLocal` wraps local KV
- `CacheRedis` wraps Redis KV
- `CacheMulti` combines local and Redis caches and uses the bus to invalidate stale local entries across processes

That multi-cache design is the important runtime behavior: local reads stay fast, while Redis remains the shared source of truth and invalidation channel.

### 3.3 Limiter

The limiter layer is the rate-limit primitive:

- `LimiterLocal` uses `RateLimiterMemory`
- `LimiterRedis` uses `RateLimiterRedis`

This package is what makes rate limiting portable between single-process and clustered deployments.

### 3.4 Runtime Use

The API uses these primitives for:

- global and per-IP rate limiting
- cache invalidation and request/response caching
- websocket and collab coordination
- other distributed runtime locks and counters

The dependency direction matters: the API consumes these primitives, but the primitives do not know about controllers, routes, or business services.

---

## 4. Shared Schema, Spec, Type, And Constant Layers

These packages are the shared contract surface that both runtime and tooling code build on.

### 4.1 `@directus/schema`

`@directus/schema` is the database inspection layer.

It exports:

- dialect-specific `SchemaInspector` implementations
- `createInspector(knex)` for selecting the right inspector from the Knex client
- low-level schema types like columns, foreign keys, tables, and schema overview structures

The API database layer uses this to derive schema metadata from PostgreSQL, MySQL, MariaDB, SQLite, CockroachDB, MSSQL, and OracleDB. This is how Directus turns database structure into a typed runtime schema.

### 4.2 `@directus/specs`

`@directus/specs` is the canonical OpenAPI document for the public API contract.

The spec file declares the product surface in terms of:

- activity
- assets
- authentication
- collections and fields
- comments
- extensions
- files
- flows and operations
- permissions and policies
- relations and revisions
- roles, settings, users, and versions

This package is not a runtime service. It is the contract artifact that downstream tooling and docs consume.

### 4.3 `@directus/types`

`@directus/types` is the shared TypeScript contract layer.

It centralizes the shapes that would otherwise leak across package boundaries:

- `SchemaOverview`, `CollectionOverview`, `FieldOverview`
- `Range`, `Stat`, `ReadOptions`, and `ChunkedUploadContext`
- service contracts in `services.ts`
- extension types in `extensions/*`
- storage and runtime domain types for files, items, users, permissions, websockets, and more

This is the package that keeps the API, app, storage drivers, and extension runtime speaking the same language.

### 4.4 `@directus/constants`

`@directus/constants` holds the runtime enumerations and shared fixed sets that multiple layers rely on:

- extension type families
- field type families
- relational types
- file and upload constants
- injection and permission constants

The key runtime point is that extension SDK build logic, app extension filtering, and registry validation all depend on the same constant sets.

### 4.5 `@directus/utils`

`@directus/utils` is split by execution target:

- `shared/` for logic used in both browser and Node
- `node/` for filesystem, process, and Node-specific helpers
- `browser/` for CSS-variable helpers

The shared entrypoint carries a lot of the product's behavior glue:

- endpoint construction
- relation and field helpers
- JSON and boolean parsing
- filter merging and validation
- path normalization
- compression helpers

The API and app both depend on this package heavily. It is the low-level utility seam between product features.

---

## 5. Storage Abstraction And Drivers

`@directus/storage` is the storage contract, not a provider implementation.

It defines:

- `StorageManager` for registering named driver classes and named storage locations
- the base driver contract for `read`, `write`, `delete`, `stat`, `exists`, `move`, `copy`, and `list`
- `TusDriver` for providers that support chunked upload flows

That means the API works with storage locations, while the actual provider behavior lives in the driver packages.

### 5.1 Driver Boundaries

The built-in drivers implement the same contract but encode very different provider behavior:

- `storage-driver-local` uses the filesystem and supports recursive listing plus chunked upload write streams
- `storage-driver-s3` uses AWS S3 APIs, custom HTTP agents, and multipart/TUS logic
- `storage-driver-azure` uses Azure Blob APIs and append/blob semantics
- `storage-driver-gcs` uses resumable uploads and bucket object listing
- `storage-driver-cloudinary` signs requests and maps paths to Cloudinary resource types
- `storage-driver-supabase` uses Supabase storage auth, authenticated reads, and resumable uploads

The important boundary is that provider-specific edge cases stay inside each driver package.

### 5.2 API Use

The API validates storage configuration at startup and then relies on the storage layer indirectly through file and asset services. If a deployment uses local storage, the runtime checks filesystem access directly; if it uses remote storage, the same driver contract still applies.

---

## 6. Extension Model Core

`@directus/extensions` defines the shared extension manifest and shape language.

It exports:

- manifest validation through `ExtensionManifest`
- split-entrypoint and bundle option schemas
- sandbox scope options
- shared dependency allowlists used by the bundler/runtime
- all extension-related type exports re-exported from `@directus/types`

This package is the bridge between:

- extension authoring
- registry installs
- API runtime loading
- sandbox and bundle generation

The concrete detail that matters is that extension manifests are validated structurally, not just assumed from `package.json`.

---

## 7. Extension Registry Client

`@directus/extensions-registry` is the HTTP client for the marketplace registry.

It provides four primary operations:

- `list()`
- `describe()`
- `account()`
- `download()`

Each operation validates the Directus API version before making registry calls. If the current installation does not match the supported registry version, the client throws an out-of-date error.

It also exposes zod schemas for the registry responses, which means registry data is validated at the boundary instead of being trusted as free-form JSON.

### 7.1 Runtime Use

The API uses this client in the extensions service for marketplace install flows. The admin app uses the same data model in its marketplace UI and store.

This keeps the marketplace contract in one package instead of duplicating request parsing in app and API code.

---

## 8. Extension SDK

`@directus/extensions-sdk` is the developer-facing toolkit for creating and bundling extensions.

It serves two roles:

- CLI tooling for extension authors
- runtime helpers that the app can reuse, such as `useSync`

Its top-level exports re-export:

- composables from `@directus/composables`
- extension definition helpers from `@directus/extensions`
- `defineTheme` from `@directus/themes`
- field/template helpers from `@directus/utils`

Its CLI layer handles:

- `create`
- `add`
- `build`
- `link`
- `validate`

The `build` command is especially important because it reads the extension manifest, validates the declared extension type, and then chooses app, API, hybrid, or bundle build paths. Shared dependencies are rewritten using the package's built-in allowlist instead of leaving each extension to duplicate its own bundling rules.

That is the package boundary: SDK behavior is about extension authoring and build-time normalization, not server runtime loading.

---

## 9. How The Runtime Layers Depend On These Packages

### 9.1 API

The API is the heaviest consumer.

It depends on:

- `@directus/env` for all configuration
- `@directus/memory` for cache, bus, limiter, and distributed lock behavior
- `@directus/schema` for database introspection
- `@directus/storage` and the concrete storage drivers for files and assets
- `@directus/types` for service and runtime contracts
- `@directus/constants` and `@directus/utils` for shared runtime rules
- `@directus/extensions` and `@directus/extensions-registry` for extension loading and marketplace installs

The API bootstrap shows this clearly: env is read at startup, schema is inspected from Knex, extension managers are initialized, storage is validated, and shared utilities are used for request handling and config transformation.

### 9.2 App

The admin app uses the same shared packages, but on the browser side.

It depends on:

- `@directus/types` for item, extension, and UI-facing models
- `@directus/constants` for filtering extension and field families
- `@directus/utils` for shared client-side helpers
- `@directus/extensions-registry` for marketplace data models
- `@directus/extensions-sdk` for the `useSync` composable and extension tooling surface

The extensions store is the clearest example: it reads `/extensions`, toggles extension state, and uses the registry install/reinstall/uninstall endpoints through the shared API contract.

### 9.3 Distribution

The `directus/` runtime package is a thin CLI wrapper around `@directus/api`.

It does not reimplement any of the shared runtime libraries. It inherits them indirectly through the API package, which is why the shared library boundaries above matter for self-hosted deployments as well.

---

## 10. Boundary Summary

The package split is deliberate:

- `env` owns configuration normalization
- `memory` owns process and cluster coordination primitives
- `schema`, `specs`, `types`, `constants`, and `utils` own shared contract and glue layers
- `storage` owns the abstract storage contract
- storage-driver packages own provider-specific IO behavior
- `extensions` owns the shared extension manifest and bundle shape
- `extensions-registry` owns the marketplace client contract
- `extensions-sdk` owns authoring/build-time extension tooling

If a change crosses one of these boundaries, it should usually land in the shared package first and then be consumed by API/app code, rather than being copied into a layer-specific implementation.

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

These packages exist so cross-cutting platform rules have one owner instead of being reimplemented differently in API, app, CLI, and extension code. This is the anti-copy-paste layer of the platform.

### 11.2 What Tovu should preserve

- Shared contracts and infrastructure primitives must live outside feature handlers
- Provider-specific IO should stay behind ports/adapters
- Core type/constant/schema/env packages should be boring and reusable
- Cross-layer changes should usually start in a shared boundary, not inside one runtime

### 11.3 What Tovu can simplify

- V1 does not need as many packages as Directus
- Several Directus shared packages can start as modules inside `src/core/` until their boundaries stabilize
- Marketplace- and extension-authoring-specific shared packages can come later

### 11.4 Possible Tovu seams

- `src/core/` for env, events, ports, shared types, and runtime primitives
- `src/headless/` for shared client/server DTO contracts
- extract separate packages only when reuse and release cadence justify it

### 11.5 Suggested priority

- `V1`: env, ports, shared DTOs, event/outbox primitives, storage/auth abstractions
- `Later`: extension-authoring SDKs, registry clients, more granular package extraction
