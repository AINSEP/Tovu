# Directus OpenAPI OAS Surface

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/server.ts`
- `other-repos/directus/api/src/services/specifications.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/system.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/packages/specs/src/openapi.yaml`
- `other-repos/directus/packages/specs/src/paths/*.yaml` inventory
- `other-repos/directus/packages/system-data/src/collections/collections.yaml`
- `other-repos/directus/packages/system-data/src/fields/index.ts`

---

## 1. Why This Surface Exists

Directus has two OpenAPI surfaces, and they are not the same thing:

- `packages/specs/src/openapi.yaml` is the packaged, curated contract corpus
- `GET /server/specs/oas` is the runtime-generated, project-specific spec

The static document is the product contract index. The runtime spec is a live synthesis of the current schema, permissions, and request context.

That distinction matters because the runtime spec is not just a copy of the package file. It is filtered by accountability and host context.

---

## 2. Packaged OpenAPI Surface

`packages/specs/src/openapi.yaml` declares the public API contract as a hand-maintained index.

It includes:

- canonical tags for activity, comments, revisions, server, and other first-class families
- the core path families for auth, items, collections, comments, files, flows, folders, operations, permissions, relations, revisions, roles, schema, server, settings, users, and utilities

It does not include every runtime route.

That is by design, but it creates drift that the docs should call out explicitly.

### 2.1 Static vs runtime examples

Packaged OpenAPI includes:

- `/server/info`
- `/server/ping`
- `/comments`
- `/revisions`
- `/activity`

Packaged OpenAPI does not include:

- `/server/health`
- `/server/specs/oas`
- `/server/specs/graphql/:scope?`
- `/server/setup`
- `/notifications`
- `/metrics`
- websocket upgrade endpoints
- `/files/tus`
- `/mcp`
- `/ai/chat`
- custom extension endpoints

---

## 3. Runtime OAS Generation

`api/src/services/specifications.ts` builds the runtime spec through `SpecificationService.oas.generate(host?)`.

The generation flow is:

1. start from the live schema
2. if the caller is not admin, reduce the schema to allowed fields with `fetchAllowedFieldMap()`
3. fetch policies and permissions for the accountability context
4. generate tags from the static corpus plus live collections
5. generate paths from the static corpus and the permission set
6. generate components from the reduced live schema
7. choose the server URL from `PUBLIC_URL` or the request host when `PUBLIC_URL === '/'`
8. hash the spec version using the current time and user id

This is the key architectural detail:

- the runtime OAS is permission-aware
- the packaged OAS is not

### 3.1 Tag generation

Tags are sourced from the static spec where possible.

For system collections, the runtime generator reuses the existing static tags.
For non-system collections, it synthesizes tags like `Items<MyCollectionName>`.

That means the runtime spec can describe real project collections without requiring the package corpus to know them ahead of time.

### 3.2 Path generation

The generator only emits paths that already exist in `packages/specs/src/openapi.yaml`.

For system collections, it checks whether the current accountability has permission for the matching action before including the operation.

For user collections, it rewrites the generic `/items/{collection}` and `/items/{collection}/{id}` paths into collection-specific runtime endpoints.

### 3.3 Component generation

Components are derived from the current schema, including field types and relation-aware shapes.

That makes the runtime spec more precise than the packaged corpus for a specific project, but also more volatile.

---

## 4. Runtime Contract Boundaries

The runtime generator inherits the limits of the packaged corpus.

Anything not present in `packages/specs/src/openapi.yaml` is not going to appear in the runtime OAS, even if it exists in the app:

- websocket transports
- metrics
- notifications
- server health
- server spec endpoints
- extension custom endpoints

So the runtime spec is authoritative for the documented HTTP surface, but it is not a complete description of the server process.

### 4.1 Auth-sensitive reduction

For non-admin callers, the generator reduces the schema before generating tags, paths, and components.

That means the runtime OAS is both a documentation artifact and an access-filtered view of the project.

### 4.2 Host-sensitive server URL

The server URL is derived from the request host only when `PUBLIC_URL` is `/`.

That is a subtle but important behavior:

- local or proxy deployments can get a host-derived spec URL
- fully configured deployments keep the configured public URL

---

## 5. GraphQL Spec Sibling

The same `SpecificationService` also exposes `graphql.generate()`.

`api/src/services/graphql/resolvers/system.ts` wires that into:

- `server_specs_oas`
- `server_specs_graphql`

This matters because the runtime OAS is not a one-off route artifact. It is part of a broader self-describing server surface.

---

## 6. Drift Summary

The clearest runtime-vs-packaged gaps are:

- packaged OAS includes only the HTTP paths the product team chose to maintain as public contract
- runtime OAS is generated from live schema and permissions, so it can change per project and per user
- packaged OAS still documents stale details in a few places, such as the `/server/info` query parameter shape
- runtime-only endpoints remain outside both documents unless they are explicitly represented in the static spec corpus

In practice, that means you should treat the packaged file as the contract source and the runtime generator as the live projection of that contract onto the current project state.

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This contract layer exists to separate documented public HTTP behavior from the full runtime process. Directus uses a packaged spec as the stable contract source and a runtime generator as the project-specific projection of that contract.

### 7.2 What Tovu should preserve

- A deliberate public contract artifact for headless/admin consumers
- Clear separation between stable documented surface and runtime-only internals
- Permission-aware or project-aware projections should derive from a stable contract source, not replace it

### 7.3 What Tovu can simplify

- V1 does not need a full Directus-style runtime OAS generator
- A smaller explicit contract for Tovu’s actual public surfaces is enough
- Runtime-only internals can remain undocumented until they stabilize, as long as they are not mistaken for public API

### 7.4 Possible Tovu seams

- `src/headless/` as the source of stable public DTO/route contracts
- contract generation/docs tooling should consume those contracts, not inspect arbitrary runtime state directly
- `src/server/` can expose live capability metadata later, but should not become the only source of API truth

### 7.5 Suggested priority

- `V1`: explicit public contract for current admin/headless packet
- `Later`: generated docs/spec output, permission-aware projections, richer live spec endpoints
