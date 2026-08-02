# Directus Content And Schema Mutation

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/items.ts`
- `other-repos/directus/api/src/controllers/collections.ts`
- `other-repos/directus/api/src/controllers/fields.ts`
- `other-repos/directus/api/src/controllers/schema.ts`
- `other-repos/directus/packages/specs/src/openapi.yaml`

---

## 1. Overview

Directus is not a CMS with a fixed content schema. These controllers together expose the platform's core promise:

- data items can be read and mutated dynamically by collection
- collections can be created, updated, and deleted at runtime
- fields can be created and altered at runtime
- full schema snapshots can be exported, diffed, and applied

This is the system's defining architectural difference from products that require compile-time models.

---

## 2. Items API

`controllers/items.ts` exposes collection-parametric CRUD routes under `/items/:collection`.

### 2.1 Guardrails

The inspected controller refuses several cases up front:

- system collections are blocked with `ForbiddenError`
- singleton collections reject routes that only make sense for regular collections

The controller relies on upstream middleware such as `collectionExists` to resolve:

- `req.collection`
- `req.singleton`
- `req.schema`
- `req.accountability`
- `req.sanitizedQuery`

### 2.2 Create

`POST /items/:collection`

Behavior:

- rejects system collections
- rejects singleton collections via `RouteNotFoundError`
- creates one or many items based on whether body is array
- re-reads created records after write
- if the re-read fails only because of forbidden read access, it still returns through `next()` instead of crashing

This create-then-read behavior means write output is normalized through the same read shape clients use elsewhere.

### 2.3 Read collection

Routes:

- `GET /items/:collection`
- `SEARCH /items/:collection`

Behavior branches:

- singleton -> `readSingleton(req.sanitizedQuery)`
- request body with `keys` -> `readMany(...)`
- otherwise -> `readByQuery(req.sanitizedQuery)`

The controller also computes metadata via `MetaService.getMetaForQuery(...)`.

Payload shape:

- `data`
- `meta`

### 2.4 Read single item

`GET /items/:collection/:pk`

Behavior:

- rejects system collections
- uses `ItemsService.readOne(pk, sanitizedQuery)`
- returns `{ data: result || null }`

### 2.5 Update collection

`PATCH /items/:collection`

Supported modes:

- singleton upsert
- batch update from array
- keyed update from `{ keys, data }`
- query-based update from `{ query, data }`

For query-based update, the controller re-sanitizes the submitted query body using `sanitizeQuery(...)` before passing it to the service.

After update, it attempts to re-read the affected records.

### 2.6 Update single item

`PATCH /items/:collection/:pk`

Behavior:

- rejects system collections
- rejects singleton route shape
- `updateOne(pk, body)`
- re-read updated item with sanitized query

### 2.7 Delete

Routes:

- `DELETE /items/:collection`
- `DELETE /items/:collection/:pk`

Collection delete supports:

- raw array body
- `{ keys }`
- query-based delete after query sanitization

---

## 3. Collections API

`controllers/collections.ts` manages collection definitions themselves.

### 3.1 Create collection

`POST /collections`

Supports:

- single create
- batch create

Special query flag:

- `concurrentIndexCreation`

The controller interprets any presence of that query param except explicit `'false'` as truthy.

That flag is passed down as:

- `attemptConcurrentIndex`

This is an important clue that schema mutation is optimized for live databases where index creation strategy matters.

### 3.2 Read collections

Routes:

- `GET /collections`
- `SEARCH /collections`
- `GET /collections/:collection`

The list endpoint does not use arbitrary sanitized queries in the inspected code path. It uses:

- `readMany(req.body.keys)` when keys exist
- `readByQuery()` otherwise

### 3.3 Update collections

Routes:

- `PATCH /collections`
- `PATCH /collections/:collection`

Batch update returns re-read collections. Single update updates first, then re-reads the named collection.

### 3.4 Delete collection

`DELETE /collections/:collection`

The inspected controller delegates directly to `CollectionsService.deleteOne(...)`.

---

## 4. Fields API

`controllers/fields.ts` manages field definitions within collections.

### 4.1 Read

Routes:

- `GET /fields`
- `GET /fields/:collection`
- `GET /fields/:collection/:field`

These expose:

- all visible fields
- all fields for one collection
- one field in one collection

### 4.2 Create field

`POST /fields/:collection`

Validation requires:

- `field` name
- optional `type` that must be a known data type or alias type
- optional `schema`
- optional `meta`

The create path also supports `concurrentIndexCreation` query semantics.

### 4.3 Update multiple fields

`PATCH /fields/:collection`

Requirements:

- body must be an array

System field restriction:

- when a targeted field is a system field, only `schema.is_indexed` may be modified

This restriction is enforced before service invocation.

### 4.4 Update one field

`PATCH /fields/:collection/:field`

Behavior:

- system fields use a separate narrow validation rule
- non-system fields use broader type/schema/meta validation
- if body omits `field`, controller injects it from URL param
- supports `concurrentIndexCreation`

### 4.5 Delete field

`DELETE /fields/:collection/:field`

Behavior:

- system fields are hard forbidden
- non-system fields delegate to `deleteField(...)`

---

## 5. Schema Snapshot / Diff / Apply

`controllers/schema.ts` is the coarse-grained schema transport surface.

### 5.1 Snapshot

`GET /schema/snapshot`

Behavior:

- instantiate `SchemaService`
- return current schema snapshot as `{ data: currentSnapshot }`

### 5.2 Accepted upload formats

For diff and apply, Directus accepts:

- JSON request body when `Content-Type` is `application/json`
- multipart file upload

Multipart parsing supports:

- JSON file
- YAML file

Failure cases:

- unsupported content type -> `UnsupportedMediaTypeError`
- empty JSON body -> `InvalidPayloadError`
- more than one uploaded file -> `InvalidPayloadError`
- invalid JSON -> `InvalidPayloadError`
- invalid YAML -> `InvalidPayloadError`
- no file -> `InvalidPayloadError`

### 5.3 Diff

`POST /schema/diff`

Behavior:

1. parse uploaded snapshot
2. take current snapshot
3. compute diff
4. attach versioned hash of current snapshot
5. return `{ data: { hash, diff } }`

Supports query option:

- `force` when present in query

### 5.4 Apply

`POST /schema/apply`

Behavior:

- parse uploaded diff-with-hash payload
- call `SchemaService.apply(diff)`

This is the most dangerous schema mutation endpoint in the inspected set. It applies a precomputed diff, not an ad hoc collection or field patch.

---

## 6. Architectural Observations

From these controllers, Directus's content model has several clear properties:

- user collections and fields are first-class mutable runtime objects
- system collections are protected from generic item CRUD
- system fields are protected from general mutation
- schema changes are supported both incrementally and as full diff application
- query sanitization is a mandatory precondition for query-based read/update/delete
- metadata responses are expected alongside data list results

---

## 7. Follow-Up Depth Still Needed

This file covers route behavior, not service internals.

A second-pass content/schema spec should inspect:

- `ItemsService`
- `CollectionsService`
- `FieldsService`
- `SchemaService`
- query sanitization internals
- relation-building helpers in field services
- singleton detection and collection existence middleware

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

This is the Directus core promise: content is defined and mutated at runtime rather than being frozen into compile-time models. The API exists so the admin UI, automations, imports, and integrations can all work against the same live content model.

### 8.2 What Tovu should preserve

- Metadata-driven item CRUD rather than hardcoded per-type admin forms
- A protected distinction between user-managed content structures and system internals
- A stable schema/content contract that the admin shell can hydrate and trust
- Query sanitization and guardrails before query-based bulk mutation

### 8.3 What Tovu can simplify

- Tovu V1 does not need unrestricted Directus-style live schema mutation everywhere
- Full snapshot/diff/apply can be delayed if Tovu keeps a controlled content-model change workflow
- Some schema mutation may be better expressed as spec-first migrations than arbitrary runtime patches, as long as the admin shell still consumes metadata rather than code assumptions

### 8.4 Possible Tovu seams

- `src/features/content-model/` for collection/type definitions and metadata rules
- `src/features/content-item/` for item CRUD and bulk mutations
- `src/core/ports/ContentModelPort.ts` for reading/writing model metadata
- `src/core/ports/SchemaChangePort.ts` for controlled structural changes behind a swappable adapter seam

### 8.5 Suggested priority

- `V1`: metadata-backed item CRUD, collection/type registry, system/user boundary, sanitized bulk operations
- `Later`: richer live schema authoring, snapshot/diff/apply, advanced field mutation workflows
