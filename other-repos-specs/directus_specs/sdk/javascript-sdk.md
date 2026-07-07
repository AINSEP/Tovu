# Directus JavaScript SDK

**Source files analyzed:**
- `other-repos/directus/sdk/readme.md`
- `other-repos/directus/sdk/src/client.ts`
- `other-repos/directus/sdk/src/index.ts`
- `other-repos/directus/sdk/package.json`
- `other-repos/directus/sdk/src/` file inventory

---

## 1. Overview

The Directus SDK is intentionally composable. There is no monolithic always-on client.

The base client created by `createDirectus(url)` is a minimal wrapper that gains functionality only through `.with(...)` composables.

That design matters for three reasons:

1. client bundle size can be constrained
2. features like realtime and GraphQL are optional
3. auth behavior can be chosen per consumer

---

## 2. Base Client

`createDirectus(url, options)` in `sdk/src/client.ts`:

1. builds a `globals` object
2. sets `url` as a constructed URL instance
3. returns a client with a `.with(createExtension)` method

Default globals include:

- `fetch`
- `WebSocket`
- `URL`
- `console` as logger

Consumers can override globals through client options.

This allows the SDK to run across environments where the host may want custom:

- fetch implementation
- websocket implementation
- URL implementation
- logger

---

## 3. Extension-Based Client Composition

From the inspected readme and exports, the major composable families are:

- `rest()`
- `graphql()`
- `staticToken()`
- `authentication()`
- `realtime()`

### 3.1 REST

Adds request-oriented behavior for REST endpoints.

### 3.2 GraphQL

Adds query-oriented behavior for GraphQL execution.

### 3.3 Static token auth

Stores and uses a fixed token.

### 3.4 Session / credential auth

Adds:

- login
- logout
- refresh

### 3.5 Realtime

Adds websocket subscription and raw message capabilities.

The readme examples show:

- subscribing to a collection
- receiving async iterator items
- listening for low-level websocket messages
- sending manual ping messages

---

## 4. Source Tree Shape

The SDK source tree is split into coherent modules:

- `auth/`
- `graphql/`
- `realtime/`
- `rest/`
- `schema/`
- `types/`
- `utils/`

The `schema/` folder includes system model types for:

- access
- activity
- collections
- comments
- dashboards
- deployments
- extensions
- fields
- files
- flows
- folders
- notifications
- operations
- panels
- permissions
- policies
- presets
- relations
- revisions
- roles
- settings
- shares
- translations
- users
- versions

This means the SDK is not only request helpers. It ships type representations of Directus system resources too.

---

## 5. Important Source Clue

`sdk/src/index.ts` starts with:

- `// TODO update for Policies / Access`

That comment matters.

It indicates the SDK surface has likely been evolving alongside the newer policy/access model and may not yet be fully normalized around that newer terminology.

This is exactly the kind of detail that should guide later parity checks between:

- API runtime behavior
- OpenAPI package
- SDK exports

---

## 6. Schema Typing Model

The readme's schema example makes the intended typing model explicit:

- regular collections are array-typed in the top-level schema interface
- singletons are singular object types
- junction collections are modeled as collections too
- relations may be represented as IDs or expanded objects depending on query shape

This means the SDK assumes a strongly typed but query-shape-sensitive data model.

It is not a simple generated CRUD client with one rigid object shape.

---

## 7. Architectural Role

From the inspected code and readme, the SDK acts as:

- transport abstraction for REST and GraphQL
- auth helper layer
- realtime client
- schema typing layer
- environment-adaptable runtime wrapper

It is not tightly coupled to one framework or one fetch implementation.

---

## 8. Follow-Up Areas

A deeper SDK pass should inspect:

- `rest/composable.ts`
- `graphql/composable.ts`
- `auth/composable.ts`
- `realtime/composable.ts`
- request utility and error-shape handling
- exact query param serialization logic
- how schema expansion and field formatting utilities behave

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This SDK exists so consumers can integrate with Directus without importing server internals or reimplementing transport details themselves. The critical idea is composability: clients opt into capabilities instead of inheriting one mandatory all-in-one client.

### 9.2 What Tovu should preserve

- A transport/client layer separate from admin-shell code
- Capability-based client composition instead of one giant hardcoded SDK surface
- Schema-aware typing where it meaningfully improves safety
- Environment-adaptable runtime hooks for fetch, websocket, and URL handling

### 9.3 What Tovu can simplify

- V1 does not need every client family Directus ships
- Type surfaces can begin around Tovu’s own headless/admin contracts instead of full dynamic Directus-style schema typing
- A smaller SDK is acceptable if auth/realtime/REST seams remain composable

### 9.4 Possible Tovu seams

- `src/headless/` for stable shared DTO contracts
- separate published client package later if needed
- `src/core/ports/ApiClientPort.ts` only if the server itself needs to abstract downstream APIs
- frontend shells should consume shared contracts, not reach into server modules

### 9.5 Suggested priority

- `V1`: shared DTO contract layer and a thin typed HTTP client for frontend shells
- `Later`: broader public SDK, composable realtime/auth packages, richer schema-aware tooling
