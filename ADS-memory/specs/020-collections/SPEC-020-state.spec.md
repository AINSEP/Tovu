# State Contract Spec: collections

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-020`
- Feature: `FEAT-020-collections`
- Version: `1.4.0`
- Content Hash: `sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`
- Last Edited: `2026-07-15T03:30:00Z`

## Purpose

Defines the durable state Collections owns directly: the `content_types` registry and its
`content_type_revisions` ledger, the `entries` table and its `entry_revisions` ledger, and the
client-facing admin/orchestrator state each of these projects into. The confirmation-token
lifecycle for the destructive cleanup step is SPEC-016's own state (`state.spec.md` §1/§2) and is
not redefined here — this file only adds the Collections-specific `CleanupPlanDetails` payload that
rides inside SPEC-016's generic `Plan`/`GatewayPlan` shape.

## 1) State Shape

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `contentType.status` | `ContentTypeStatus` | no | `'active'` | Lifecycle state at registration |
| `contentType.version` | `integer` | no | `1` | Optimistic-concurrency counter |
| `contentType.fields[].required` | `boolean` | no | `false` | Per-field default (behavior.spec.md §3) |
| `contentType.fields[].queryable` | `boolean` | no | `false` | Per-field default (behavior.spec.md §3) |
| `entry.status` | `EntryStatus` | no | `'draft'` | Lifecycle state at creation |
| `entry.publishedAt` | `string (date-time)` | yes | `null` | Set only on `PUBLISH_ENTRY` |
| `entry.version` | `integer` | no | `1` | Optimistic-concurrency counter |
| `cleanupPlan.tombstonedAt` | `string (date-time)` | yes | n/a — set at `TOMBSTONE_CONTENT_TYPE` | Anchors the 30-day retention window (REQ-20) |

## 2) Entity Contracts

```yaml
ContentTypeStatus: enum[active, deprecated, tombstone]

FieldKind: enum[text, integer, real, boolean, datetime]

ContentTypeField:
  name: string          # ^[a-z][a-z0-9_]{0,63}$
  kind: FieldKind
  required: boolean
  queryable: boolean

ContentType:
  workspaceId: string
  key: string            # ^[a-z][a-z0-9_]{0,63}$, NOT IN ('post','page')
  label: string
  fields: array<ContentTypeField>
  status: ContentTypeStatus
  version: integer
  tombstonedAt: string (date-time) | null
  createdAt: string (date-time)
  updatedAt: string (date-time)

ContentTypeRevision:
  contentTypeId: string
  workspaceId: string
  perContentTypeSeq: integer
  op: enum[register, deprecate, reactivate, tombstone, field-change]
  actorId: string
  delegatedByWorkspaceId: string | null   # populated only when the writer is a delegated agent
                                            # (kind='agent') or an api_key acting for its owning
                                            # user (kind='api_key') — SPEC-016 REQ-16 /
                                            # ActorIdentityRef shape (REQ-08)
  delegatedById: string | null             # the agent's delegator, or the api_key's owning user
  recordedAt: string (date-time)

EntryStatus: enum[draft, published, unpublished]

Entry:
  id: string (ulid)
  workspaceId: string
  type: string            # soft ref to ContentType.key
  slug: string
  status: EntryStatus
  title: string
  bodyJson: object | null
  fieldsJson: object      # { ext: { site: { <fieldName>: <value> } } }
  publishedAt: string (date-time) | null
  version: integer
  createdAt: string (date-time)
  updatedAt: string (date-time)

EntryRevision:
  entryId: string
  workspaceId: string
  perEntrySeq: integer
  op: enum[create, update, publish, unpublish]
  actorId: string
  pluginId: string | null
  delegatedByWorkspaceId: string | null   # populated only when the writer is a delegated agent
                                            # (kind='agent') or an api_key acting for its owning
                                            # user (kind='api_key') — SPEC-016 REQ-16 /
                                            # ActorIdentityRef shape (REQ-16)
  delegatedById: string | null             # the agent's delegator, or the api_key's owning user
  recordedAt: string (date-time)

CollectionsCleanupPlanDetails:
  contentTypeKey: string
  entryCount: integer
  entryRevisionCount: integer
  contentTypeRevisionCount: integer
  exportReference: string
  # rides inside SPEC-016 state.spec.md's `GatewayPlan.details` payload — not a standalone entity
```

## 3) Action Catalog

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `REGISTER_CONTENT_TYPE` | `{key, label, fields}` | key not reserved; key/field-name grammar valid; field kinds valid; queryable count ≤ 20 | creates `ContentType` (`status='active'`, `version=1`) + `ContentTypeRevision` (`op='register'`), stamps watermark, provisions indexes for `queryable` fields | rejects per REQ-24's fixed guard order; no partial row is created |
| `UPDATE_CONTENT_TYPE_FIELDS` | `{key, label?, fields?, expectedVersion}` | `expectedVersion` matches current `version` — checked **first**, before the fields_empty guard below or any other precondition in this cell (REQ-26); only once `expectedVersion` matches: when `fields` is present it MUST contain at least 1 entry — a present-but-empty `fields: []` is rejected with `VALIDATION_ERROR` (`details.reason='fields_empty'`) before any other precondition below is evaluated (REQ-26); every field in a non-empty submitted `fields` array passes the same guards as `REGISTER_CONTENT_TYPE`; the queryable-field cap (REQ-05) is checked against the submitted `fields` array alone | `fields`, when present (and non-empty), is a **full replacement** of the content type's entire field set (REQ-26) — any existing field whose `name` is absent from the submitted array is removed from the schema; updates `ContentType`, appends `ContentTypeRevision` (`op='field-change'`), stamps watermark; drops indexes for any field removed from `queryable` (whether by an explicit `queryable=false` resubmission, REQ-29, or by full-replace omission, REQ-26) and for any field removed from the schema entirely; provisions indexes for any newly `queryable` field — a field newly *added* by this submission with `queryable=true` is provisioned per **REQ-30** (identically to registration-time provisioning), while a field *resubmitted* with `queryable` flipped `false→true` is provisioned per **REQ-29**; tears down + re-provisions the index for any field whose `kind` changes while it remains `queryable` across the call, independent of any `queryable` flag flip (REQ-27); when a single field's `kind` and `queryable` both change in the same call, its index state is resolved from its post-call `kind`/`queryable` value per REQ-30 (REQ-27 and REQ-29 combine, not exclude) | rejects with `VERSION_CONFLICT` if `expectedVersion` does not match current `version` (checked first, before any other precondition in this row — REQ-26); otherwise rejects with `VALIDATION_ERROR` (`details.reason='fields_empty'`) if `fields` is present but empty, leaving `fieldsSchemaJson` unchanged (REQ-26); otherwise rejects per whichever other guard fails |
| `DEPRECATE_CONTENT_TYPE` | `{key, expectedVersion}` | `status='active'` | `status → 'deprecated'`, appends `ContentTypeRevision` (`op='deprecate'`), stamps watermark, enqueues `content_type.deprecated` outbox event | rejects if `status` is already `deprecated` or `tombstone` |
| `REACTIVATE_CONTENT_TYPE` | `{key, expectedVersion}` | `status='deprecated'` | `status → 'active'`, appends `ContentTypeRevision` (`op='reactivate'`), stamps watermark | rejects if `status` is `active` (no-op is still rejected, not silently accepted) or `tombstone` (INV-06) |
| `TOMBSTONE_CONTENT_TYPE` | `{key, expectedVersion}` | `status='deprecated'` | `status → 'tombstone'`, `tombstonedAt = now`, tears down all `queryable`-field indexes, appends `ContentTypeRevision` (`op='tombstone'`), stamps watermark, enqueues `content_type.tombstoned` outbox event | rejects if `status` is `active` (must deprecate first) or already `tombstone` |
| `CREATE_ENTRY` | `{type, slug, title, bodyJson?, fieldsJson?}` | target `ContentType.status='active'`; `fieldsJson` validates against current schema; `(workspaceId,type,slug)` unique | creates `Entry` (`status='draft'`, `version=1`) + `EntryRevision` (`op='create'`), stamps watermark, enqueues `entry.created` outbox event | rejects with `CONTENT_TYPE_NOT_ACTIVE`, `VALIDATION_ERROR`, or `ENTRY_SLUG_CONFLICT` per which precondition failed |
| `UPDATE_ENTRY` | `{id, title?, bodyJson?, fieldsJson?, expectedVersion}` | `expectedVersion` matches; owning `ContentType.status != 'tombstone'` (REQ-28); `fieldsJson` (if present) validates against current schema | updates `Entry`, appends `EntryRevision` (`op='update'`), stamps watermark, enqueues `entry.updated` outbox event | rejects with `CONTENT_TYPE_NOT_ACTIVE` if owning type is `tombstone`; otherwise rejects on version conflict or field-bag violation |
| `PUBLISH_ENTRY` | `{id, expectedVersion}` | `status` in `{draft, unpublished}`; owning `ContentType.status != 'tombstone'` (REQ-28) | `status → 'published'`, `publishedAt = now`, appends `EntryRevision` (`op='publish'`), stamps watermark, enqueues `entry.published` outbox event | rejects with `CONTENT_TYPE_NOT_ACTIVE` if owning type is `tombstone`; rejects if already `published` |
| `UNPUBLISH_ENTRY` | `{id, expectedVersion}` | `status='published'`; owning `ContentType.status != 'tombstone'` (REQ-28) | `status → 'unpublished'`, appends `EntryRevision` (`op='unpublish'`), stamps watermark, enqueues `entry.unpublished` outbox event | rejects with `CONTENT_TYPE_NOT_ACTIVE` if owning type is `tombstone`; rejects if not currently `published` |
| `VALIDATE_ENTRY_FIELDS` | `{type, fieldsJson}` | none (read-only) | none — no `Entry`/`EntryRevision` row is created (REQ-25) | returns `fieldErrors` array, empty when valid |
| `PLAN_CLEANUP` / `CONFIRM_CLEANUP` / `EXECUTE_CLEANUP` | see SPEC-016 `orchestrator.spec.md` §2/§4 Action Contracts (`plan`/`confirm`/`execute`), instantiated at `domain="collections"` | `EXECUTE_CLEANUP` additionally requires target `ContentType.status='tombstone'` (INV-07) | `EXECUTE_CLEANUP` success permanently deletes the `ContentType` row and every scoped `Entry`/`EntryRevision`/`ContentTypeRevision` row, atomically | Failure codes per SPEC-016 `orchestrator.spec.md` §4, plus this spec's `CLEANUP_NOT_ELIGIBLE` at the `plan` step |

## 4) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `selectContentTypeByKey` | `(workspaceId, key)` | `ContentType \| null` | `null` when not found, never throws |
| `selectQueryableFieldCount` | `ContentType` | `integer` | `0` when no field is marked `queryable` |
| `selectIsEntryCreationAllowed` | `ContentType` | `boolean` | `true` only when `status='active'` |
| `selectIsPubliclyServable` | `ContentType` | `boolean` | `false` when `status='tombstone'` |
| `selectVisibleEntryFields` | `(Entry, ContentType)` | `object` | keys present in `Entry.fieldsJson` but absent from `ContentType`'s *current* schema are silently omitted (REQ-15) |
| `selectCleanupEligibility` | `ContentType` | `{ eligible: boolean, reason: string \| null }` | `eligible=false` with the specific `reason` (`not_tombstoned` \| `retention_window_not_elapsed` \| `export_reference_missing`) whenever any REQ-20 condition is unmet |

## 5) State Invariants
- [x] `contentType.status` never transitions from `tombstone` back to `active` or `deprecated`
      (INV-06).
- [x] `(workspaceId, key)` uniqueness on `ContentType` is never violated.
- [x] `(workspaceId, type, slug)` uniqueness on `Entry` is never violated (INV-05).
- [x] `EXECUTE_CLEANUP` never runs against a `ContentType` whose `status` is not `tombstone`
      (INV-07).
- [x] Every `REGISTER_CONTENT_TYPE`/`UPDATE_CONTENT_TYPE_FIELDS`/lifecycle-transition action and
      every `CREATE_ENTRY`/`UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY` action stamps the
      watermark exactly once in its own transaction (INV-08).
- [x] A `queryable` field's live index never references a `CAST` mapping for a `kind` other than
      that field's current `kind` (INV-09).
- [x] A field's live queryable index exists if and only if that field currently exists in its
      content type's schema with `queryable=true` (INV-10).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md`, `orchestrator.spec.md`, and `ui.spec.md`.
