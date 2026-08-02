# Directus Monorepo Overview

**Repo snapshot inspected:** `other-repos/directus @ 9dcea73`

**Primary source files analyzed:**
- `other-repos/directus/package.json`
- `other-repos/directus/directus/readme.md`
- `other-repos/directus/api/package.json`
- `other-repos/directus/api/src/start.ts`
- `other-repos/directus/api/src/server.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/app/package.json`
- `other-repos/directus/app/src/main.ts`
- `other-repos/directus/app/src/router.ts`
- `other-repos/directus/sdk/package.json`
- `other-repos/directus/sdk/readme.md`
- `other-repos/directus/sdk/src/index.ts`
- `other-repos/directus/packages/specs/src/openapi.yaml`
- `other-repos/directus/packages/system-data/src/collections/collections.yaml`

---

## 1. Overview

Directus is not a single runtime package. The repository is a monorepo with four major product surfaces:

1. `api/` - the Node.js and Express runtime that validates environment, boots services, exposes REST, GraphQL, files, flows, extensions, MCP, and health endpoints, and optionally serves the admin app.
2. `app/` - the Vue admin application, including login/setup flows, module registration, extension-driven UI types, and route guards.
3. `sdk/` - the modular JavaScript client, composed from REST, GraphQL, auth, and realtime extensions.
4. `packages/` - shared libraries and canonical metadata, including OpenAPI definitions, system collection schemas, extension tooling, storage drivers, memory/cache primitives, and shared types.

This means a useful Directus spec corpus cannot stop at the REST controllers. The core product contract spans:

- runtime boot and middleware sequencing
- admin app boot and route guarding
- dynamic collection and field mutation
- policy and permission evaluation
- automation flows and operations
- files, assets, and resumable uploads
- extension loading in both API and app
- GraphQL, websocket, and MCP/AI surfaces
- system metadata and OpenAPI generation
- SDK client composition

---

## 2. Package Inventory

| Area | Path | Role |
|---|---|---|
| API runtime | `api/` | Main server runtime and API surface |
| Admin app | `app/` | Vue Studio / dashboard UI |
| JavaScript SDK | `sdk/` | Type-safe client for REST, GraphQL, auth, realtime |
| OpenAPI specs | `packages/specs/` | Generated / source OpenAPI path and component definitions |
| System data | `packages/system-data/` | Canonical system collections, fields, and relations |
| Extensions SDK | `packages/extensions-sdk/` | Tooling for creating extensions |
| Extensions registry client | `packages/extensions-registry/` | Marketplace / registry interaction |
| Shared stores | `packages/stores/` | Pinia stores for app and extensions |
| Shared types | `packages/types/` | Cross-package type contracts |
| Shared storage drivers | `packages/storage*` | Storage abstraction and adapters |
| Shared memory layer | `packages/memory/` | Cache, KV, limiter, and bus primitives |

---

## 3. Runtime Hierarchy

### 3.1 API boot chain

```text
node process
  ->
api/src/start.ts
  ->
startServer()
  ->
createServer()
  ->
createApp()
  ->
environment / database / storage / extension / flow initialization
  ->
Express middleware chain
  ->
route registration
  ->
optional admin app serving
  ->
HTTP server + optional websocket controllers + health shutdown hooks
```

### 3.2 Admin app boot chain

```text
browser
  ->
app/src/main.ts
  ->
create Vue app
  ->
register directives / components / views
  ->
load external app extensions
  ->
register extension types
  ->
install router
  ->
hydrate system state
  ->
mount to #app
```

### 3.3 SDK boot chain

```text
consumer code
  ->
createDirectus(url)
  ->
base client with globals + URL
  ->
.with(rest())
  ->
.with(graphql())
  ->
.with(authentication() / staticToken())
  ->
.with(realtime())
```

---

## 4. Canonical System Collections

The system model is not implicit. `packages/system-data/src/collections/collections.yaml` defines the built-in Directus collections the platform itself owns.

The inspected snapshot includes at least:

- `directus_access`
- `directus_activity`
- `directus_collections`
- `directus_comments`
- `directus_fields`
- `directus_files`
- `directus_folders`
- `directus_migrations`
- `directus_permissions`
- `directus_policies`
- `directus_presets`
- `directus_relations`
- `directus_revisions`
- `directus_roles`
- `directus_sessions`
- `directus_settings`
- `directus_users`
- `directus_dashboards`
- `directus_panels`
- `directus_notifications`
- `directus_shares`
- `directus_flows`
- `directus_operations`
- `directus_translations`
- `directus_versions`
- `directus_extensions`
- `directus_deployments`
- `directus_deployment_projects`
- `directus_deployment_runs`

Any Directus spec corpus that ignores `packages/system-data/` will miss the actual product-owned schema contract.

---

## 5. Public API Families

From the OpenAPI source and route registration, the inspected API families include:

- authentication
- activity
- access
- assets
- collections
- comments
- dashboards
- deployments
- extensions
- fields
- files
- flows
- folders
- GraphQL
- items
- MCP
- notifications
- operations
- panels
- permissions
- policies
- presets
- relations
- revisions
- roles
- schema snapshot / diff / apply
- server info / health / specs / setup
- settings
- shares
- translations
- users
- utilities
- versions

In `api/src/app.ts`, several of these are conditionally mounted:

- `/files/tus` only when `TUS_ENABLED === true`
- `/mcp` only when `MCP_ENABLED` resolves truthy
- `/ai/chat` only when `AI_ENABLED` resolves truthy
- `/metrics` only when `METRICS_ENABLED === true`
- `/admin` only when `SERVE_APP` is enabled

---

## 6. Admin App Surface

The app is not a thin shell. It contains:

- public routes for setup, login, register, reset password, invite acceptance, logout, shares
- private routes that are added dynamically by registered modules
- TFA enforcement logic in the router guard
- extension-driven registration for:
  - interfaces
  - displays
  - layouts
  - modules
  - panels
  - operations
  - themes

This is a critical difference from WordPress. The Directus admin UI is a first-class extension platform rather than a PHP page collection with server-rendered metabox injection.

---

## 7. Spec Corpus Shape

This initial Directus corpus is organized by actual monorepo boundary instead of by one top-level runtime directory:

```text
directus_specs/
  overview.md
  api/
    server-bootstrap.md
    authentication.md
    content-and-schema.md
    access-control-and-automation.md
    files-extensions-and-protocols.md
  app/
    admin-app.md
  sdk/
    javascript-sdk.md
  packages/
    system-data-and-openapi.md
```

That structure is the Directus equivalent of the WordPress split across root entrypoints, `wp-admin`, and `wp-includes`.

---

## 8. First-Tranche Coverage Decisions

The first tranche prioritizes the surfaces that define the product's architecture rather than every CRUD controller individually:

1. boot and middleware sequence
2. auth session/token flow
3. dynamic content and schema mutation
4. policy and permission surfaces
5. flows / operations
6. files / extensions / GraphQL / MCP
7. admin app boot and routing
8. SDK composition
9. canonical system-data and OpenAPI metadata

Follow-up slices should go deeper into:

- users, roles, shares, revisions, versions
- dashboards, panels, presets, notifications
- websocket REST / GraphQL realtime and collaborative editing internals
- extension manager internals and marketplace install lifecycle
- import/export and deployment project workflows
- asset transformations and storage driver behavior

---

## 9. Important Limits Of This Tranche

This tranche is source-grounded, but not yet exhaustive.

Areas intentionally deferred to follow-up files:

- individual auth driver internals (`local`, `oauth2`, `openid`, `ldap`, `saml`)
- detailed `ItemsService` query compilation internals
- websocket controller and handler internals
- AI chat runtime internals
- per-module admin views
- every single system collection field YAML

Those are not omitted because they are unimportant. They are deferred because the goal of tranche one is to lock the macro contracts first.

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This overview exists to keep the Directus corpus oriented around product-defining contracts instead of getting lost in controller-by-controller detail.

### 10.2 What Tovu should preserve

- A macro map of the platform surfaces that actually define Directus as a product
- Clear separation between first-pass contract coverage and deeper implementation follow-up
- The discipline of locking the high-leverage contracts before chasing leaf internals

### 10.3 What Tovu can simplify

- Tovu does not need to mirror Directus's exact repo layout to learn from its architecture
- Once Tovu implementation starts, some overview detail can move into narrower planning docs or module manifests

### 10.4 Possible Tovu seams

- `docs/research/directus/overview.md` as the macro contract map
- Tovu module planning should branch from the canonical subsystem docs, not from this overview alone

### 10.5 Suggested priority

- `V1`: keep as a navigation and prioritization guide while rebuilding equivalent Tovu surfaces
- `Later`: refine or regenerate from the stabilized Tovu architecture map
