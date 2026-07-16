# API Contract Spec: collections

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/api.spec.md`

- Spec ID: `SPEC-020`
- Feature: `FEAT-020-collections`
- Version: `1.4.0`
- Content Hash: `sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`
- Last Edited: `2026-07-15T03:30:00Z`

## Purpose

This file is the source of truth for Collections' API behavior: the content-type registry CRUD
routes, the entry CRUD/publish routes, the field-bag validate-only route, and the destructive
cleanup gateway routes that instantiate SPEC-016's generic `plan()→confirm()→execute()` gateway with
`domain="collections"`, `action="cleanup"`.

## 1) Endpoint Registry

| Endpoint ID | Method | Path | Purpose | Auth Profile | Rate Limit Profile |
|---|---|---|---|---|---|
| `CONTENT_TYPE_LIST` | `GET` | `/api/admin/v1/content-types` | List content types in the caller's workspace | `AUTH_COLLECTIONS_READ` | `COLLECTIONS_READ` |
| `CONTENT_TYPE_GET` | `GET` | `/api/admin/v1/content-types/{key}` | Get one content-type definition | `AUTH_COLLECTIONS_READ` | `COLLECTIONS_READ` |
| `CONTENT_TYPE_CREATE` | `POST` | `/api/admin/v1/content-types` | Register a new content type | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `CONTENT_TYPE_UPDATE_FIELDS` | `PATCH` | `/api/admin/v1/content-types/{key}` | Update label and/or field definitions | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `CONTENT_TYPE_DEPRECATE` | `POST` | `/api/admin/v1/content-types/{key}/deprecate` | Disable a content type (active → deprecated) | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `CONTENT_TYPE_REACTIVATE` | `POST` | `/api/admin/v1/content-types/{key}/reactivate` | Re-enable a content type (deprecated → active) | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `CONTENT_TYPE_TOMBSTONE` | `POST` | `/api/admin/v1/content-types/{key}/tombstone` | Tombstone a content type (deprecated → tombstone) | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `ENTRY_LIST` | `GET` | `/api/admin/v1/entries` | List entries, optionally filtered by `type` | `AUTH_COLLECTIONS_READ` | `COLLECTIONS_READ` |
| `ENTRY_GET` | `GET` | `/api/admin/v1/entries/{id}` | Get one entry | `AUTH_COLLECTIONS_READ` | `COLLECTIONS_READ` |
| `ENTRY_CREATE` | `POST` | `/api/admin/v1/entries` | Create a new entry | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `ENTRY_UPDATE` | `PATCH` | `/api/admin/v1/entries/{id}` | Update an entry's title/body/fields | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `ENTRY_PUBLISH` | `POST` | `/api/admin/v1/entries/{id}/publish` | Publish an entry | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `ENTRY_UNPUBLISH` | `POST` | `/api/admin/v1/entries/{id}/unpublish` | Unpublish an entry | `AUTH_COLLECTIONS_MANAGE` | `COLLECTIONS_WRITE` |
| `ENTRY_VALIDATE_FIELDS` | `POST` | `/api/admin/v1/entries/validate` | Dry-run field-bag validation against a content type's current schema | `AUTH_COLLECTIONS_READ` | `COLLECTIONS_READ` |
| `COLLECTIONS_CLEANUP_PLAN` | `POST` | `/api/admin/v1/collections/cleanup/plan` | Preview a content type's destructive cleanup | `AUTH_GATEWAY_READ` | `GATED_READ` |
| `COLLECTIONS_CLEANUP_CONFIRM` | `POST` | `/api/admin/v1/collections/cleanup/confirm` | Human-only confirmation, mints a single-use token | `AUTH_GATEWAY_CONFIRM` | `GATED_WRITE` |
| `COLLECTIONS_CLEANUP_EXECUTE` | `POST` | `/api/admin/v1/collections/cleanup/execute` | Redeem the token and permanently remove the content type | `AUTH_GATEWAY_EXECUTE` | `GATED_WRITE` |

The three `COLLECTIONS_CLEANUP_*` endpoints are this spec's concrete instantiation of SPEC-016
`api.spec.md` §1's generic `GATEWAY_PLAN`/`GATEWAY_CONFIRM`/`GATEWAY_EXECUTE` shape at
`{domain}="collections"`, `{action}="cleanup"` — the auth-profile and rate-limit-profile ids below
are SPEC-016's own, reused rather than redefined.

## 2) Authentication and Authorization Profiles

| Profile ID | Auth Required | Credential Type | Required Scopes | Permitted Principal Kinds | Notes |
|---|---|---|---|---|---|
| `AUTH_COLLECTIONS_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.collections.read` | `user, agent, api_key` | Ordinary read/list/validate operations |
| `AUTH_COLLECTIONS_MANAGE` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.collections.manage` | `user, agent, api_key` | Ordinary create/update/lifecycle-transition operations — not gated by SPEC-016's gateway; these are direct, non-destructive mutations |
| `AUTH_GATEWAY_READ` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.collections.read` | `user, agent, api_key` | SPEC-016 REQ-09 — cleanup `plan()` is read-only and callable by any principal kind holding the permission |
| `AUTH_GATEWAY_CONFIRM` | `true` | Session cookie only | `admin.collections.manage` | `user` only | SPEC-016 REQ-10 — `authorize()` evaluated at mint time; no other principal kind may call this endpoint at all |
| `AUTH_GATEWAY_EXECUTE` | `true` | Session cookie, Bearer API key, or agent delegation token | `admin.collections.manage` | `user, agent, api_key` — subject to SPEC-016's actor-class redemption rule (SPEC-016 REQ-13) | SPEC-016 REQ-11 — `authorize()` is re-evaluated fresh at this call, never cached from confirm-time |

## 3) Rate Limit Profiles

| Profile ID | Window Seconds | Max Requests | Burst Allowance | Keyed By | Notes |
|---|---:|---:|---:|---|---|
| `COLLECTIONS_READ` | `60` | `300` | `50` | `principalId` | Ordinary list/get/validate traffic — a `SAFE DEFAULT` Spec Agent assumption, not stated by ADR-043 |
| `COLLECTIONS_WRITE` | `60` | `60` | `10` | `principalId` | Ordinary create/update/lifecycle-transition traffic — a `SAFE DEFAULT` Spec Agent assumption |
| `GATED_READ` | `60` | `60` | `10` | `principalId` | Reused directly from SPEC-016 `api.spec.md` §3 — cleanup `plan()` |
| `GATED_WRITE` | `60` | `5` | `0` | `principalId` | Reused directly from SPEC-016 `api.spec.md` §3 — cleanup `confirm()`/`execute()` |

## 4) Request Contracts

### Endpoint: `CONTENT_TYPE_LIST` (`GET /api/admin/v1/content-types`)
- Query Params:
```yaml
status:
  type: string
  enum: [active, deprecated, tombstone]
  required: false
```

### Endpoint: `CONTENT_TYPE_GET` (`GET /api/admin/v1/content-types/{key}`)
- Path Params:
```yaml
key:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
```

### Endpoint: `CONTENT_TYPE_CREATE` (`POST /api/admin/v1/content-types`)
- Body:
```yaml
key:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
label:
  type: string
  minLength: 1
  maxLength: 255
  required: true
fields:
  type: array
  required: true
  minItems: 1
  items:
    name:
      type: string
      pattern: "^[a-z][a-z0-9_]{0,63}$"
      required: true
    kind:
      type: string
      enum: [text, integer, real, boolean, datetime]
      required: true
    required:
      type: boolean
      default: false
    queryable:
      type: boolean
      default: false
```

### Endpoint: `CONTENT_TYPE_UPDATE_FIELDS` (`PATCH /api/admin/v1/content-types/{key}`)
- Path Params:
```yaml
key:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
```
- Body:
```yaml
label:
  type: string
  minLength: 1
  maxLength: 255
  required: false
fields:
  type: array
  required: false
  minItems: 1
  description: >
    FULL REPLACEMENT of the content type's entire field set when present (REQ-26) — not a
    merge-by-name patch. Any existing field whose `name` is absent from this array is removed
    from the schema by this call. The queryable-field cap (REQ-05) is enforced against this
    array alone, never against this array plus any previously-existing field not resubmitted.
    Changing an existing field's `kind` while it stays `queryable` forces index teardown +
    re-provisioning under the new `kind` (REQ-27). Changing an existing field's `queryable` value
    alone (kind unchanged) forces index provisioning/teardown for that field (REQ-29). A field
    newly introduced by this submission with `queryable=true`, or a field whose `kind` and
    `queryable` both change together in the same call, has its index resolved per REQ-30 (REQ-27
    and REQ-29 combine, not exclude, when both trigger conditions hold for the same field). When
    present, this array MUST contain at least 1 entry (`minItems: 1`, symmetric with
    `CONTENT_TYPE_CREATE`'s `fields` contract) — a submitted `fields: []` is rejected with
    `VALIDATION_ERROR` (`details.reason='fields_empty'`) and leaves the content type's existing
    field set completely unchanged (REQ-26). This fields_empty check is only reached once
    `expectedVersion` (below) has been matched — a stale `expectedVersion` is rejected first,
    before this array is evaluated at all (REQ-26).
  items:
    name:
      type: string
      pattern: "^[a-z][a-z0-9_]{0,63}$"
      required: true
    kind:
      type: string
      enum: [text, integer, real, boolean, datetime]
      required: true
    required:
      type: boolean
      default: false
    queryable:
      type: boolean
      default: false
expectedVersion:
  type: integer
  required: true
  description: >
    optimistic-concurrency guard against `content_types.version`. Checked first, before the
    `fields` array's fields_empty guard or any other precondition (REQ-26) — a stale
    `expectedVersion` is rejected with `VERSION_CONFLICT` regardless of the `fields`
    payload's shape.
```

### Endpoint: `CONTENT_TYPE_DEPRECATE` / `CONTENT_TYPE_REACTIVATE` / `CONTENT_TYPE_TOMBSTONE`
- Path Params:
```yaml
key:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
```
- Body:
```yaml
expectedVersion:
  type: integer
  required: true
```

### Endpoint: `ENTRY_LIST` (`GET /api/admin/v1/entries`)
- Query Params:
```yaml
type:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: false
status:
  type: string
  enum: [draft, published, unpublished]
  required: false
pageSize:
  type: integer
  minimum: 1
  maximum: 100
  default: 20
cursor:
  type: string
  required: false
```

### Endpoint: `ENTRY_GET` (`GET /api/admin/v1/entries/{id}`)
- Path Params:
```yaml
id:
  type: string
  format: ulid
  required: true
```

### Endpoint: `ENTRY_CREATE` (`POST /api/admin/v1/entries`)
- Body:
```yaml
type:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
slug:
  type: string
  minLength: 1
  maxLength: 255
  required: true
title:
  type: string
  minLength: 1
  required: true
bodyJson:
  type: object
  required: false
fieldsJson:
  type: object
  required: false
  description: >
    Typed as `FieldsJsonEnvelope` (see Section 5 Contract Definitions): MUST match the shape
    `{ ext: { site: { <fieldName>: <value> } } }` exactly. A payload that omits the `ext.site`
    wrapper (e.g. a flat `{ <fieldName>: <value> }`) is itself rejected with `VALIDATION_ERROR`
    before any per-field key/required/kind check runs (REQ-14). Recognized field values are
    validated against the target content type's current schema, including per-field `kind`
    conformance (REQ-14).
```

### Endpoint: `ENTRY_UPDATE` (`PATCH /api/admin/v1/entries/{id}`)
- Path Params:
```yaml
id:
  type: string
  format: ulid
  required: true
```
- Body:
```yaml
title:
  type: string
  minLength: 1
  required: false
bodyJson:
  type: object
  required: false
fieldsJson:
  type: object
  required: false
  description: >
    Typed as `FieldsJsonEnvelope` (see Section 5 Contract Definitions) — identical shape and
    validation rule as `ENTRY_CREATE`'s `fieldsJson` (REQ-14). Also rejected with
    `CONTENT_TYPE_NOT_ACTIVE` if the owning content type's `status` is `tombstone` (REQ-28).
expectedVersion:
  type: integer
  required: true
```

### Endpoint: `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH`
- Path Params:
```yaml
id:
  type: string
  format: ulid
  required: true
```
- Body:
```yaml
expectedVersion:
  type: integer
  required: true
```
- Note: rejected with `CONTENT_TYPE_NOT_ACTIVE` if the target entry's owning content type's
  `status` is `tombstone` (REQ-28); permitted normally when the owning type's `status` is
  `deprecated` or `active`.

### Endpoint: `ENTRY_VALIDATE_FIELDS` (`POST /api/admin/v1/entries/validate`)
- Body:
```yaml
type:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
fieldsJson:
  type: object
  required: true
  description: >
    Typed as `FieldsJsonEnvelope` (see Section 5 Contract Definitions) — identical shape and
    validation rule as `ENTRY_CREATE`'s `fieldsJson` (REQ-14, REQ-25).
```

### Endpoint: `COLLECTIONS_CLEANUP_PLAN` (`POST /api/admin/v1/collections/cleanup/plan`)
- Body:
```yaml
contentTypeKey:
  type: string
  pattern: "^[a-z][a-z0-9_]{0,63}$"
  required: true
exportReference:
  type: string
  required: false
  description: "caller-supplied reference to a completed export artifact; required for plan() to be executable (REQ-20)"
```

### Endpoint: `COLLECTIONS_CLEANUP_CONFIRM` (`POST /api/admin/v1/collections/cleanup/confirm`)
- Body: identical shape to SPEC-016 `api.spec.md` §4's `GATEWAY_CONFIRM` body (`planId`, `planHash`).

### Endpoint: `COLLECTIONS_CLEANUP_EXECUTE` (`POST /api/admin/v1/collections/cleanup/execute`)
- Body: identical shape to SPEC-016 `api.spec.md` §4's `GATEWAY_EXECUTE` body (`confirmationToken`).

## 5) Response Contracts

### Success Responses
| Endpoint ID | HTTP Status | Body Contract | Notes |
|---|---:|---|---|
| `CONTENT_TYPE_LIST` | `200` | `ContentTypeListResponse` | |
| `CONTENT_TYPE_GET` | `200` | `ContentTypeResponse` | |
| `CONTENT_TYPE_CREATE` | `201` | `ContentTypeResponse` | |
| `CONTENT_TYPE_UPDATE_FIELDS` | `200` | `ContentTypeResponse` | |
| `CONTENT_TYPE_DEPRECATE` / `_REACTIVATE` / `_TOMBSTONE` | `200` | `ContentTypeResponse` | |
| `ENTRY_LIST` | `200` | `EntryListResponse` | |
| `ENTRY_GET` | `200` | `EntryResponse` | |
| `ENTRY_CREATE` | `201` | `EntryResponse` | |
| `ENTRY_UPDATE` | `200` | `EntryResponse` | |
| `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH` | `200` | `EntryResponse` | |
| `ENTRY_VALIDATE_FIELDS` | `200` | `ValidateFieldsResponse` | No row is written (REQ-25) |
| `COLLECTIONS_CLEANUP_PLAN` | `200` | `GatewayPlanResponse` (SPEC-016 shape; `details` = `CollectionsCleanupPlanDetails`) | |
| `COLLECTIONS_CLEANUP_CONFIRM` | `200` | `GatewayConfirmResponse` (SPEC-016 shape) | |
| `COLLECTIONS_CLEANUP_EXECUTE` | `200` | `CollectionsCleanupExecuteResponse` | |

### Contract Definitions
```yaml
FieldsJsonEnvelope:
  ext:
    site:
      type: object
      description: >
        Map of `<fieldName>: <value>` pairs. Every key MUST correspond to a field name declared
        in the target content type's *current* `fieldsSchemaJson` (REQ-14). A payload that does
        not nest under `ext.site` exactly (e.g. a flat top-level object) is itself rejected with
        `VALIDATION_ERROR` before any per-field check runs (REQ-14, AC-50) — this envelope shape
        is not optional or auto-coerced.

ContentTypeField:
  name: { type: string, pattern: "^[a-z][a-z0-9_]{0,63}$" }
  kind: { type: string, enum: [text, integer, real, boolean, datetime] }
  required: { type: boolean }
  queryable: { type: boolean }

ContentType:
  key: { type: string, pattern: "^[a-z][a-z0-9_]{0,63}$" }
  label: { type: string }
  fields: { type: array, items: { $ref: ContentTypeField } }
  status: { type: string, enum: [active, deprecated, tombstone] }
  version: { type: integer }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }

ContentTypeListResponse:
  data: { type: array, items: { $ref: ContentType } }
  nextCursor: { type: string, nullable: true }

ContentTypeResponse:
  data: { $ref: ContentType }

Entry:
  id: { type: string, format: ulid }
  type: { type: string, pattern: "^[a-z][a-z0-9_]{0,63}$" }
  slug: { type: string }
  status: { type: string, enum: [draft, published, unpublished] }
  title: { type: string }
  bodyJson: { type: object, nullable: true }
  fieldsJson: { type: object }
  publishedAt: { type: string, format: date-time, nullable: true }
  createdAt: { type: string, format: date-time }
  updatedAt: { type: string, format: date-time }
  version: { type: integer }

EntryListResponse:
  data: { type: array, items: { $ref: Entry } }
  nextCursor: { type: string, nullable: true }

EntryResponse:
  data: { $ref: Entry }

ValidateFieldsResponse:
  valid: { type: boolean }
  fieldErrors:
    type: array
    items:
      field: { type: string }
      reason: { type: string }

CollectionsCleanupPlanDetails:
  contentTypeKey: { type: string }
  entryCount: { type: integer }
  entryRevisionCount: { type: integer }
  contentTypeRevisionCount: { type: integer }
  exportReference: { type: string }

CollectionsCleanupExecuteResponse:
  contentTypeKey: { type: string }
  removedEntryCount: { type: integer }
  removedAt: { type: string, format: date-time }
```

## 6) Error Mapping

Reference canonical codes in `errors.spec.md` (this file's own registry, which reuses several codes
directly from SPEC-016 `errors.spec.md`).

| Endpoint ID | HTTP Status | Error Codes |
|---|---:|---|
| `CONTENT_TYPE_CREATE` | `400` | `VALIDATION_ERROR, INVALID_KEY_GRAMMAR, INVALID_FIELD_NAME_GRAMMAR, INVALID_FIELD_KIND, QUERYABLE_FIELD_CAP_EXCEEDED` |
| `CONTENT_TYPE_CREATE` | `409` | `RESERVED_CONTENT_TYPE_KEY, CONTENT_TYPE_KEY_CONFLICT` |
| `CONTENT_TYPE_CREATE` | `401` | `UNAUTHENTICATED` |
| `CONTENT_TYPE_CREATE` | `403` | `FORBIDDEN` |
| `CONTENT_TYPE_CREATE` | `429` | `RATE_LIMIT_EXCEEDED` |
| `CONTENT_TYPE_GET` / `CONTENT_TYPE_UPDATE_FIELDS` / `_DEPRECATE` / `_REACTIVATE` / `_TOMBSTONE` | `404` | `CONTENT_TYPE_NOT_FOUND` |
| `CONTENT_TYPE_UPDATE_FIELDS` / `_DEPRECATE` / `_REACTIVATE` / `_TOMBSTONE` | `400` | `VALIDATION_ERROR, INVALID_FIELD_NAME_GRAMMAR, INVALID_FIELD_KIND, QUERYABLE_FIELD_CAP_EXCEEDED` |
| `ENTRY_CREATE` | `400` | `VALIDATION_ERROR` |
| `ENTRY_CREATE` | `404` | `CONTENT_TYPE_NOT_FOUND` |
| `ENTRY_CREATE` | `409` | `CONTENT_TYPE_NOT_ACTIVE, ENTRY_SLUG_CONFLICT` |
| `ENTRY_UPDATE` | `400` | `VALIDATION_ERROR` |
| `ENTRY_UPDATE` / `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH` | `409` | `CONTENT_TYPE_NOT_ACTIVE` (REQ-28 — target entry's owning content type is `tombstone`) |
| `ENTRY_CREATE` / `ENTRY_UPDATE` / `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH` | `401` | `UNAUTHENTICATED` |
| `ENTRY_CREATE` / `ENTRY_UPDATE` / `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH` | `403` | `FORBIDDEN` |
| `ENTRY_GET` / `ENTRY_UPDATE` / `ENTRY_PUBLISH` / `ENTRY_UNPUBLISH` | `404` | `ENTRY_NOT_FOUND` |
| `ENTRY_VALIDATE_FIELDS` | `400` | `VALIDATION_ERROR` |
| `ENTRY_VALIDATE_FIELDS` | `404` | `CONTENT_TYPE_NOT_FOUND` |
| `COLLECTIONS_CLEANUP_PLAN` | `409` | `CLEANUP_NOT_ELIGIBLE` |
| `COLLECTIONS_CLEANUP_PLAN` / `_CONFIRM` / `_EXECUTE` | `401` | `UNAUTHENTICATED` |
| `COLLECTIONS_CLEANUP_PLAN` / `_CONFIRM` / `_EXECUTE` | `403` | `FORBIDDEN` |
| `COLLECTIONS_CLEANUP_EXECUTE` | `409` | `PLAN_STALE, TOKEN_ALREADY_REDEEMED` |
| `COLLECTIONS_CLEANUP_EXECUTE` | `410` | `TOKEN_EXPIRED` |
| all endpoints | `429` | `RATE_LIMIT_EXCEEDED` |
| all endpoints | `500` | `INTERNAL_ERROR` |

## 7) Agent Tool Catalog Contract

Every Collections agent tool follows ADR-021 §3's flat-dotted permission style and, for the cleanup
step, SPEC-016 REQ-22's `{domain}_plan_{action}`/`{domain}_execute_{action}` naming convention.

```yaml
AgentToolDefinition:
  name: string
  description: string
  params: object
  returns: object
  sideEffects: enum[none, mutates-durable-state, mints-token]
  authorization:
    permission: string
    deniesIfMissing: "FORBIDDEN"
  actorClassRule: enum[confirmer-must-equal-own-delegatedBy, user-only, none]
```

| Tool Name | Purpose | Permission | Side Effects | Actor-Class Rule |
|---|---|---|---|---|
| `collections_content_type_list` | List content types | `admin.collections.read` | `none` | `none` |
| `collections_content_type_get` | Get one content-type definition | `admin.collections.read` | `none` | `none` |
| `collections_content_type_define` | Register a new content type | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_content_type_update_fields` | Update label/fields of an existing content type | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_content_type_deprecate` | Disable a content type | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_content_type_reactivate` | Re-enable a deprecated content type | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_content_type_tombstone` | Tombstone a deprecated content type | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_entry_list` | List entries | `admin.collections.read` | `none` | `none` |
| `collections_entry_get` | Get one entry | `admin.collections.read` | `none` | `none` |
| `collections_entry_validate_fields` | Dry-run field-bag validation (REQ-25) | `admin.collections.read` | `none` | `none` |
| `collections_entry_create` | Create an entry | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_entry_update` | Update an entry | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_entry_publish` | Publish an entry | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_entry_unpublish` | Unpublish an entry | `admin.collections.manage` | `mutates-durable-state` | `none` |
| `collections_plan_cleanup` | Preview a content type's destructive cleanup (SPEC-016 REQ-09) | `admin.collections.read` | `none` | `none` |
| `collections_execute_cleanup` | Redeem a confirmation token and permanently remove a content type (SPEC-016 REQ-11/REQ-13) | `admin.collections.manage` | `mutates-durable-state` | `confirmer-must-equal-own-delegatedBy` |

Rules (REQ-22, cites SPEC-016 REQ-22):
- No tool named `collections_confirm_cleanup` exists, and no tool in this catalog performs the
  `confirm()` step. A human operator confirms cleanup only through the admin UI's own confirmation
  dialog, which calls `COLLECTIONS_CLEANUP_CONFIRM` directly — never through an agent tool.
- `collections_plan_cleanup` requires only `admin.collections.read` and has `sideEffects: none`,
  matching SPEC-016 REQ-09.
- `collections_execute_cleanup` requires `admin.collections.manage`, has
  `sideEffects: mutates-durable-state`, and carries `actorClassRule:
  confirmer-must-equal-own-delegatedBy`, matching SPEC-016 REQ-13.

## 8) Contract Acceptance Checklist
- [x] Every endpoint in Section 1 has request and response contracts.
- [x] Every endpoint has auth and rate-limit profiles.
- [x] Every error code used here exists in `errors.spec.md`.
- [x] Names and enums align with `state.spec.md`, `orchestrator.spec.md`, and `ui.spec.md`.
