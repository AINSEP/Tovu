# Directus Utilities, Import/Export, And Versioning

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/utils.ts`
- `other-repos/directus/api/src/services/import-export.ts`
- `other-repos/directus/api/src/controllers/schema.ts`
- `other-repos/directus/api/src/services/schema.ts`
- `other-repos/directus/api/src/controllers/versions.ts`
- `other-repos/directus/api/src/services/versions.ts`
- `other-repos/directus/api/src/utils/get-versioned-hash.ts`
- `other-repos/directus/api/src/utils/validate-diff.ts`
- `other-repos/directus/api/src/utils/validate-snapshot.ts`

---

## 1. Overview

Directus spreads “utility” and “versioning” behavior across three related but distinct API surfaces:

- miscellaneous operational utilities under `/utils`
- schema snapshot/diff/apply workflows under `/schema`
- content-version CRUD and promote/compare/save workflows under `/versions`

These surfaces do not all solve the same problem, but together they cover the platform’s non-CRUD operational helpers:

- hashing and random value generation
- collection sorting and revision reverts
- bulk data import/export
- schema import/export via snapshots and diffs
- item-level content versioning and promotion

---

## 2. `/utils` Controller Surface

`controllers/utils.ts` is a mixed operational router, not a single-domain resource controller.

It exposes:

- `GET /utils/random/string`
- `POST /utils/hash/generate`
- `POST /utils/hash/verify`
- `POST /utils/sort/:collection`
- `POST /utils/revert/:revision`
- `POST /utils/import/:collection`
- `POST /utils/export/:collection`
- `POST /utils/cache/clear`

### 2.1 Pure utility endpoints

The first three endpoints are stateless helpers:

- random string generation via `nanoid`
- hash generation via `generateHash(...)`
- hash verification via `argon2.verify(...)`

These validate payload/query shape explicitly and return simple `{ data: ... }` envelopes.

### 2.2 Collection utility endpoints

The collection-scoped helpers use service classes and current request accountability:

- sort delegates to `UtilsService.sort(...)`
- revert delegates to `RevisionsService.revert(...)`
- cache clear delegates to `UtilsService.clearCache(...)`

`/sort/:collection` is guarded by `collectionExists`.

`/cache/clear` optionally clears system cache when `?system` is present.

---

## 3. Data Import And Export

The `/utils/import/:collection` and `/utils/export/:collection` endpoints are the data-movement surface for item data, not schema definitions.

### 3.1 Import semantics

Imports require `multipart/form-data`. The route rejects other content types before any parsing work begins.

The controller:

1. creates an `ImportService`
2. streams the uploaded file through Busboy
3. passes the collection, MIME type, and file stream to `service.import(...)`

`ImportService` then:

- blocks non-admin writes into system collections
- validates both `create` and `update` access
- accepts JSON and CSV input only
- dispatches to `importJSON(...)` or `importCSV(...)`

The import path uses an error tracker with `MAX_IMPORT_ERRORS` so bulk failures can be grouped and truncated instead of exploding unboundedly.

### 3.2 Export semantics

Exports are asynchronous background jobs.

The route validates:

- `query`
- `format`

It sanitizes the query, then calls `ExportService.exportToFile(...)` without awaiting the underlying long-running work before the normal response chain continues.

`ExportService.exportToFile(...)`:

- pages query results in batches
- forces stable sorting through the collection primary key
- appends transformed output into a temporary file
- uploads the final artifact into `directus_files`
- notifies the requesting user when the export succeeds or fails

Supported output formats include:

- `csv`
- `csv_utf8`
- `json`
- `xml`
- `yaml`

This means export is modeled as “generate a file artifact inside Directus,” not “stream the final payload directly to the caller.”

---

## 4. Schema Snapshot, Diff, And Apply

Schema import/export is a separate runtime from the item import/export flow.

`controllers/schema.ts` exposes:

- `GET /schema/snapshot`
- `POST /schema/diff`
- `POST /schema/apply`

### 4.1 Transport shape

The schema routes accept either:

- `application/json`
- `multipart/form-data` with exactly one JSON or YAML file

The multipart handler explicitly rejects:

- empty JSON bodies
- non-JSON and non-multipart content types
- multiple uploaded files
- invalid JSON
- invalid YAML

### 4.2 Service contract

`SchemaService` is admin-only and provides:

- `snapshot()`
- `diff(snapshot, options?)`
- `apply(diffWithHash)`
- `getHashedSnapshot(snapshot)`

`snapshot()` reads the live schema through `getSnapshot(...)`.

`diff(...)` validates the incoming snapshot, computes a diff against the current live schema, and returns `null` when there are no effective changes.

`apply(...)` validates the incoming hash/diff pair against the current hashed snapshot and only applies when the diff is structurally safe and current.

### 4.3 Versioned hash and safety rules

`getVersionedHash(...)` hashes the payload together with the current Directus version, which means schema diffs are intentionally version-sensitive.

`validateSnapshot(...)` rejects snapshots whose:

- version number is invalid
- Directus version does not match the current instance
- database vendor does not match the current instance

Those checks can be bypassed only with `force`.

`validateApplyDiff(...)` adds additional safety:

- empty diffs are ignored
- create/delete collisions are rejected if the live schema has already drifted
- system field edits are limited to `schema.is_indexed`
- hash mismatches are rejected with an explicit “generate a new diff” error

So schema apply is guarded both by structure validation and by optimistic concurrency via the versioned hash.

---

## 5. `/versions` Resource Surface

`controllers/versions.ts` mounts `useCollection('directus_versions')` and exposes a full resource controller plus comparison and promotion helpers.

The route surface includes:

- `POST /versions`
- `GET /versions`
- `SEARCH /versions`
- `GET /versions/:pk`
- `PATCH /versions`
- `PATCH /versions/:pk`
- `DELETE /versions`
- `DELETE /versions/:pk`
- `GET /versions/:pk/compare`
- `POST /versions/:pk/save`
- `POST /versions/:pk/promote`

Batch read/update/delete paths rely on `validateBatch(...)`, while single-record paths work directly against the route param.

### 5.1 Read behavior

Reads support:

- singleton mode
- explicit key lists
- general query-based reads

Metadata for query reads is added through `MetaService.getMetaForQuery(...)`.

### 5.2 Compare/save/promote behavior

The special endpoints do more than basic CRUD:

- `compare` reads the version, verifies its hash against the live item, and returns both the current version delta and the live main item
- `save` appends new delta data into the version and returns merged main/version state
- `promote` applies version delta back onto the live item after verifying the provided `mainHash`

This turns versions into an editable branch-like artifact rather than a static snapshot.

---

## 6. `VersionsService` Semantics

`VersionsService` extends `ItemsService<ContentVersion>` but narrows the allowed behavior heavily.

### 6.1 Creation constraints

`validateCreateData(...)` enforces:

- required `key`, `collection`, and `item`
- reserved key protection for `main`
- read access to the target item
- collection-level versioning enablement
- uniqueness of `(key, collection, item)`

On create, the service stores an object hash of the current main item so later compare/promote operations can detect drift.

### 6.2 Update constraints

Version updates only allow:

- `key`
- `name`

Key changes are revalidated so multiple versions cannot collapse onto the same `(key, collection, item)` tuple.

### 6.3 Save semantics

`save(...)` is the “record more version delta” path.

It:

- prepares delta through `PayloadService`
- writes a revision activity and revision row
- annotates nested object changes with `_user` and `_date`
- merges new delta into existing delta
- writes the merged delta back through a sudo item service
- clears cache when necessary

So saving a version is part audit trail, part delta accumulation.

### 6.4 Promote semantics

`promote(...)`:

- verifies update access on the live item
- rejects empty delta
- verifies the caller-provided `mainHash`
- splits recursive delta into payload plus overwrite defaults
- runs `items.promote` filters/actions
- applies the promoted payload to the live item through `ItemsService.updateOne(...)`

This is effectively the version “merge into main” operation.

### 6.5 Delta mapping

`mapDelta(...)` rehydrates stored delta into a user-facing shape by:

- reattaching the primary key
- translating `_user` and `_date` markers into special field values such as `user-updated` and `date-updated`
- walking nested objects with schema awareness

That mapping is why the read surface can present version deltas as more than raw internal bookkeeping fields.

---

## 7. Architectural Boundaries And Constraints

- `/utils` mixes several unrelated helpers, so it should be read as an operational toolbox, not a coherent domain controller.
- Item import/export and schema import/export are separate systems with different formats, safety checks, and outcomes.
- Schema diff/apply is admin-only and intentionally version-hash sensitive.
- Content versions are not arbitrary snapshots; they are collection-gated, item-specific, delta-based artifacts with promote semantics.
- Exports are background file-generation jobs that notify the user rather than directly streaming the final artifact.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

These utilities exist because content platforms need operational tooling around the core CRUD model: bulk ingress/egress, schema transfer, version promotion, and a few low-level helpers. Directus keeps them close to the platform but does not pretend they are one coherent resource.

### 8.2 What Tovu should preserve

- Treat schema movement, data movement, and content versioning as different workflows
- Keep version promotion and rollback semantics explicit
- Preserve hash/version guards around structural changes
- Model long-running exports as jobs/artifacts rather than assuming synchronous download

### 8.3 What Tovu can simplify

- V1 does not need every `/utils` helper
- Background export artifacts can start simpler
- Content versioning can be narrower than Directus if Tovu still keeps revision/version semantics explicit

### 8.4 Possible Tovu seams

- `src/features/import-export/` for data ingress/egress workflows
- `src/features/content-version/` for version branches, compare, and promote
- `src/core/ports/SchemaTransferPort.ts` for snapshot/diff/apply style structural movement
- `src/core/ports/ExportJobPort.ts` for background export artifact generation

### 8.5 Suggested priority

- `V1`: content version/revision semantics and controlled import/export
- `Later`: richer schema transfer, broader utility helpers, more advanced export job workflows
