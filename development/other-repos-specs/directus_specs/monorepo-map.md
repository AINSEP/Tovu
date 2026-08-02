# Directus Monorepo Map

**Source files analyzed:**
- `other-repos/directus/package.json`
- `other-repos/directus/pnpm-workspace.yaml`
- `other-repos/directus/api/package.json`
- `other-repos/directus/app/package.json`
- `other-repos/directus/sdk/package.json`
- `other-repos/directus/directus/package.json`
- package directory inventory under `other-repos/directus/packages/`

---

## 1. Monorepo Shape

The repository is a pnpm monorepo with these primary product packages:

- `directus/` - publishable runtime package and CLI entry
- `api/` - server runtime
- `app/` - admin Studio app
- `sdk/` - JavaScript SDK
- `packages/` - shared libraries
- `tests/` - blackbox and package test suites

This is not a library repo with one runtime. It is a full platform repo with:

- distributable runtime package
- browser app
- client SDK
- internal contract packages

---

## 2. High-Level Dependency Direction

At the coarse level, the inspected repo implies this direction:

```text
directus package
  ->
@directus/api
  ->
shared packages

admin app
  ->
shared packages

sdk
  ->
shared schema/types/utils
```

Notable facts from package manifests:

- `directus` depends on `@directus/api` and update-check tooling
- `@directus/api` depends on `@directus/app` and many shared workspace packages
- `@directus/app` depends on many shared workspace packages plus `@directus/sdk`
- `@directus/sdk` is independently published and dependency-light

This makes the API package the central runtime integrator.

---

## 3. What Each Top-Level Product Package Owns

### 3.1 `directus/`

Owns:

- npm package named `directus`
- CLI binary `directus`
- version surface
- update check before handing off to API CLI

This is the end-user runtime package, not the actual application logic package.

### 3.2 `api/`

Owns:

- server startup
- Express app construction
- controllers and services
- auth, files, flows, schema, GraphQL, MCP, metrics, websocket, and extension endpoints
- schedulers
- database/storage runtime integration

### 3.3 `app/`

Owns:

- Vue app shell
- Studio routes
- extension-driven UI registry
- permission-aware module registration
- public and private auth/setup views

### 3.4 `sdk/`

Owns:

- composable client
- REST / GraphQL / auth / realtime helpers
- type-level schema surface

### 3.5 `packages/`

Owns the cross-cutting pieces the other packages depend on, including:

- `ai`
- `constants`
- `env`
- `errors`
- `extensions`
- `extensions-registry`
- `extensions-sdk`
- `memory`
- `schema`
- `schema-builder`
- `specs`
- `storage`
- storage drivers
- `stores`
- `system-data`
- `themes`
- `types`
- `utils`
- `validation`

---

## 4. Important Architectural Clusters

The repository naturally clusters into these architecture zones:

### Runtime zone

- `api/`
- `directus/`

### Admin UI zone

- `app/`
- `packages/stores`
- `packages/themes`
- `packages/composables`

### Contract zone

- `packages/specs`
- `packages/system-data`
- `packages/types`
- `packages/schema`
- `packages/schema-builder`

### Extensibility zone

- `packages/extensions`
- `packages/extensions-registry`
- `packages/extensions-sdk`
- `packages/create-directus-extension`
- `packages/create-directus-project`

### Infrastructure zone

- `packages/storage*`
- `packages/memory`
- `packages/env`
- `packages/pressure`

This grouping is a better mental model than reading the repo strictly as folders in alphabetical order.

---

## 5. Why This Map Matters For Specs

A Directus spec corpus that mirrors only `api/src/controllers/*.ts` would miss:

- the app shell and module model
- the publishable `directus` runtime package
- the SDK contract
- the canonical system schema
- the extension toolchain
- storage and memory abstractions

This monorepo map exists to prevent that mistake.

---

## 6. Tovu Reconstruction Notes

### 6.1 Why this exists

This map exists to stop us from reducing Directus to only its API controllers. The monorepo layout shows which contracts live in app, SDK, runtime, packages, and extension tooling, which is exactly what matters when recreating the platform in Tovu.

### 6.2 What Tovu should preserve

- A mental model that spans runtime, admin UI, contracts, extensibility, and infrastructure together
- Awareness that high-value platform behavior often lives outside the obvious request/controller layer
- Explicit clustering of packages into architecture zones instead of reading the repo as an undifferentiated folder tree

### 6.3 What Tovu can simplify

- Tovu does not need to preserve Directus's package boundaries one-for-one
- Once the key lessons are extracted, this map can become reference material rather than an active planning surface

### 6.4 Possible Tovu seams

- use this map as an input to Tovu module decomposition, not as a target structure
- cross-check Tovu plans against runtime, app, SDK, extension, and infrastructure coverage

### 6.5 Suggested priority

- `V1`: keep as a guardrail against under-scoping the platform
- `Later`: refine only if deeper package-level work reopens architecture questions
