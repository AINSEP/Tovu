# Orchestrator Contract Spec: collections

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-020`
- Feature: `FEAT-020-collections`
- Version: `1.4.0`
- Content Hash: `sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`
- Last Edited: `2026-07-15T03:30:00Z`

## Purpose

Defines two ordinary (non-gated) write chokepoints — `ContentTypeWriteService` and
`EntryWriteService` — and one instantiation of SPEC-016's generic `GatedMutationGateway` at
`domain="collections"` for the destructive cleanup step. The two write chokepoints are direct,
single-call mutations (they are not gated mutations); only the cleanup step goes through
`plan()`→`confirm()`→`execute()`.

## 1) Orchestrator Identity

- Name: `ContentTypeWriteService`
  - Responsibility: validate and persist `content_types` registrations, field updates, and
    lifecycle transitions (`deprecate`/`reactivate`/`tombstone`), each in one transaction that also
    stamps the watermark, appends a `content_type_revisions` row, and (for lifecycle transitions)
    enqueues an outbox event.
- Name: `EntryWriteService`
  - Responsibility: validate and persist `entries` creates/updates/publish/unpublish, each in one
    transaction that also stamps the watermark, appends an `entry_revisions` row, and enqueues an
    outbox event.
- Name: `CollectionsCleanupGateway`
  - Responsibility: instantiate SPEC-016's `GatedMutationGateway` (`orchestrator.spec.md` §1) at
    `domain="collections"`, `action="cleanup"`, adding this spec's own eligibility precondition
    (REQ-20) to the `plan()` step and its own destructive removal logic to the `execute()` step.

## 2) Input Contract

### 2.1 `ContentTypeWriteService`

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `workspaceId` | yes | `string` | none | resolved from session/token, never a body field | |
| `actorId` | yes | `string` | none | resolved from session/token | |
| `op` | yes | `enum[register, update-fields, deprecate, reactivate, tombstone]` | none | | |
| `key` | yes | `string` | none | `^[a-z][a-z0-9_]{0,63}$`; NOT IN `('post','page')` for `op='register'` | REQ-02/REQ-03 |
| `label` | conditional | `string` | none | 1–255 chars; required for `op='register'` | |
| `fields` | conditional | `array<ContentTypeField>` | none | required for `op='register'` (`minItems: 1`); optional but, when present, MUST be non-empty (`minItems: 1`) for `op='update-fields'` — for `op='update-fields'`, `expectedVersion` is checked first (see below), and only once it matches is a present-but-empty array rejected with `VALIDATION_ERROR` (`details.reason='fields_empty'`) before any other field validation runs (REQ-26); each field in a non-empty array validated per REQ-03/REQ-04; queryable count ≤ 20 checked against the submitted array alone (REQ-05, REQ-26) | For `op='update-fields'`, this array (when non-empty) replaces the entire existing field set — any existing field omitted from it is removed from the schema (REQ-26); a `kind` change on a field that stays `queryable` forces index teardown+re-provisioning (REQ-27); a `queryable` value change on an existing field whose `kind` stays constant forces index provisioning/teardown for that field alone (REQ-29); a field newly *added* by this submission with `queryable=true`, or a field whose `kind` and `queryable` both change together in the same call, is resolved per REQ-30 (REQ-27 and REQ-29 combine rather than exclude when both trigger conditions hold for the same field) |
| `expectedVersion` | conditional | `integer` | none | required for every `op` except `register`; for `op='update-fields'`, this match is evaluated before the `fields` array's fields_empty guard or any other precondition (REQ-26) | optimistic-concurrency guard |

### 2.2 `EntryWriteService`

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `workspaceId` | yes | `string` | none | resolved from session/token | |
| `actorId` | yes | `string` | none | resolved from session/token | |
| `pluginId` | no | `string` | `null` | present only when the writer is a plugin | |
| `op` | yes | `enum[create, update, publish, unpublish]` | none | | |
| `type` | conditional | `string` | none | required for `op='create'`; must reference an existing, workspace-owned `content_types.key` (REQ-19) | |
| `slug` | conditional | `string` | none | required for `op='create'`; 1–255 chars | |
| `title` | conditional | `string` | none | required for `op='create'` | |
| `bodyJson` | no | `object` | `null` | | |
| `fieldsJson` | no | `object` | `{}` | validated against the target type's current schema (REQ-14) | |
| `expectedVersion` | conditional | `integer` | none | required for `op` in `{update, publish, unpublish}` | |

### 2.3 `CollectionsCleanupGateway`

Identical to SPEC-016 `orchestrator.spec.md` §2's `GatedMutationGateway` Input Contract, with
`domain` fixed to `"collections"` and one additional `plan()`-only input:

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `contentTypeKey` | yes (at `plan()`) | `string` | none | must reference an existing `content_types` row in the caller's workspace | |
| `exportReference` | yes (at `plan()`) | `string` | none | opaque caller-supplied token proving an export was taken; `plan()` fails `CLEANUP_NOT_ELIGIBLE` (`reason='export_reference_missing'`) if absent | REQ-20 |

## 3) Output State Contract

| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `contentType` | `ContentType` | nullable | derived (from `ContentTypeWriteService`) | reflects the post-write row |
| `contentTypeRevision` | `ContentTypeRevision` | nullable | derived | the row appended in the same transaction |
| `entry` | `Entry` | nullable | derived (from `EntryWriteService`) | reflects the post-write row |
| `entryRevision` | `EntryRevision` | nullable | derived | the row appended in the same transaction |
| `validateFieldsResult` | `{valid: boolean, fieldErrors: array}` | non-null (read path) | derived (REQ-25) | never mutates state |
| `cleanupPlan` | `GatewayPlan` (SPEC-016 shape, `details: CollectionsCleanupPlanDetails`) | nullable | derived (from `plan`) | |
| `cleanupConfirmationToken` | `ConfirmationToken` (SPEC-016 shape) | nullable | derived (from `confirm`) | |
| `cleanupExecutionResult` | `CollectionsCleanupExecuteResponse` | nullable | derived (from `execute`) | |
| `lastError` | domain error object | nullable | derived | one of this spec's own codes (`errors.spec.md` §2.1) or a reused SPEC-016 code (`errors.spec.md` §2.2) |

## 4) Action Contracts

| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `ContentTypeWriteService.register` | §2.1 with `op='register'` | `Result<{contentType, contentTypeRevision}>` | writes `content_types` + `content_type_revisions`, stamps watermark, provisions indexes for `queryable` fields | `RESERVED_CONTENT_TYPE_KEY, INVALID_KEY_GRAMMAR, INVALID_FIELD_NAME_GRAMMAR, INVALID_FIELD_KIND, QUERYABLE_FIELD_CAP_EXCEEDED, CONTENT_TYPE_KEY_CONFLICT, UNAUTHENTICATED, FORBIDDEN` |
| `ContentTypeWriteService.updateFields` | §2.1 with `op='update-fields'` | `Result<{contentType, contentTypeRevision}>` | full-replaces the field set from the submitted `fields` array (REQ-26), updates `content_types`, appends revision, stamps watermark, provisions/drops indexes for `queryable` flips on existing fields (REQ-29) and full-replace removals (REQ-26), provisions indexes for newly-added `queryable=true` fields and resolves combined `kind`+`queryable` changes (REQ-30), and tears down+re-provisions the index for any field whose `kind` changes while staying `queryable` (REQ-27) | `VALIDATION_ERROR (fields present but empty, details.reason='fields_empty', REQ-26 — only reached once expectedVersion has matched), INVALID_FIELD_NAME_GRAMMAR, INVALID_FIELD_KIND, QUERYABLE_FIELD_CAP_EXCEEDED, CONTENT_TYPE_NOT_FOUND, UNAUTHENTICATED, FORBIDDEN`, plus `VERSION_CONFLICT` on `expectedVersion` mismatch (checked before all of the above) |
| `ContentTypeWriteService.deprecate` / `.reactivate` / `.tombstone` | §2.1 with the matching `op` | `Result<{contentType, contentTypeRevision}>` | transitions `status`, appends revision, stamps watermark, (deprecate/tombstone) enqueues outbox event, (tombstone) tears down indexes | `CONTENT_TYPE_NOT_FOUND, UNAUTHENTICATED, FORBIDDEN`, plus a state-machine-violation error when the transition is illegal (REQ-09) |
| `EntryWriteService.create` | §2.2 with `op='create'` | `Result<{entry, entryRevision}>` | writes `entries` + `entry_revisions`, stamps watermark, enqueues `entry.created` | `CONTENT_TYPE_NOT_FOUND, CONTENT_TYPE_NOT_ACTIVE, VALIDATION_ERROR, ENTRY_SLUG_CONFLICT, UNAUTHENTICATED, FORBIDDEN` |
| `EntryWriteService.update` | §2.2 with `op='update'` | `Result<{entry, entryRevision}>` | updates `entries`, appends revision, stamps watermark, enqueues `entry.updated` | `ENTRY_NOT_FOUND, CONTENT_TYPE_NOT_ACTIVE (REQ-28 — owning type is tombstone), VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN` |
| `EntryWriteService.publish` / `.unpublish` | §2.2 with the matching `op` | `Result<{entry, entryRevision}>` | transitions `status`, appends revision, stamps watermark, enqueues the matching outbox event | `ENTRY_NOT_FOUND, CONTENT_TYPE_NOT_ACTIVE (REQ-28 — owning type is tombstone), UNAUTHENTICATED, FORBIDDEN`, plus a state-machine-violation error when already in the target state |
| `EntryWriteService.validateFields` | `{type, fieldsJson}` | `Result<{valid, fieldErrors}>` | none (REQ-25) | `CONTENT_TYPE_NOT_FOUND, UNAUTHENTICATED, FORBIDDEN` |
| `CollectionsCleanupGateway.plan` | §2.3 | `Result<GatewayPlan>` | none — read-only (SPEC-016 REQ-09) | `CONTENT_TYPE_NOT_FOUND, CLEANUP_NOT_ELIGIBLE, UNAUTHENTICATED, FORBIDDEN` |
| `CollectionsCleanupGateway.confirm` | SPEC-016 shape | `Result<ConfirmationToken>` | mints a single-use token if `authorize()` passes (SPEC-016 REQ-10) | `UNAUTHENTICATED, FORBIDDEN` (includes non-`user` principal kind) |
| `CollectionsCleanupGateway.execute` | SPEC-016 shape | `Result<CollectionsCleanupExecuteResponse>` | permanently deletes the `content_types` row and every scoped `entries`/`entry_revisions`/`content_type_revisions` row in one transaction (REQ-21) | `UNAUTHENTICATED, FORBIDDEN, PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, INTERNAL_ERROR` |

## 5) Lifecycle Hooks

| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onBeforeContentTypeWrite` | before any `ContentTypeWriteService` write commits | for `op='update-fields'`, first checks `expectedVersion` matches the content type's current `version` (optimistic-concurrency guard) — a stale `expectedVersion` fails here before any field-related check runs, including the fields_empty check; only once `expectedVersion` matches does it check a present `fields` array is non-empty (REQ-26) — a `fields: []` submission (with a matching `expectedVersion`) fails here before the guard order below ever runs; then runs the fixed guard order from REQ-24 (key grammar → reserved-key → field-name grammar → field-kind → queryable-cap) | the first failing guard's error is returned; no row is written; a stale `expectedVersion` returns `VERSION_CONFLICT` regardless of the `fields` payload's shape; the empty-`fields` check (only reached once `expectedVersion` matches) returns `VALIDATION_ERROR` (`details.reason='fields_empty'`, REQ-26) |
| `onBeforeEntryWrite` | before any `EntryWriteService` write commits | for `op='create'`: validates `type` existence/workspace-ownership (REQ-19), then `status='active'` (REQ-10), then the field bag against the current schema (REQ-14). For `op` in `{update, publish, unpublish}`: validates the target entry's owning content type's `status != 'tombstone'` (REQ-28) before any other check, then (for `update`) the field bag against the current schema (REQ-14) | the first failing check's error is returned; no row is written; `CONTENT_TYPE_NOT_ACTIVE` is returned for `update`/`publish`/`unpublish` against a `tombstone`-status owning type, but never against a `deprecated`-status one (REQ-28) |
| `onAfterLifecycleTransition` | after a `deprecate`/`tombstone` transition commits | in the same transaction as the transition write | enqueues the matching outbox event (REQ-12); a failed enqueue fails the whole transaction, per the Dependencies table's "no fallback" rule |
| `onBeforeCleanupPlan` | before `CollectionsCleanupGateway.plan` returns | evaluates REQ-20's three eligibility conditions in order: `status='tombstone'` → retention window elapsed → export reference present | the first unmet condition's `reason` is returned in `CLEANUP_NOT_ELIGIBLE.details.reason`; a later condition is never evaluated once an earlier one fails |
| `onBeforeCleanupExecute` | before `CollectionsCleanupGateway.execute` runs the destructive removal | re-evaluates `authorize()` fresh (SPEC-016 REQ-11), then token/plan-staleness/actor-class checks (SPEC-016 §2.2), then this spec's own INV-07 check (`status` still `tombstone`) | if `status` is no longer `tombstone` at execute time (e.g. concurrently reactivated between `plan()` and `execute()`), the recomputed plan hash will already mismatch and the call fails `PLAN_STALE` before the destructive removal runs |

## 6) Invariants
- [x] `ContentTypeWriteService`/`EntryWriteService` never commit a row without stamping the
      watermark in the same transaction (INV-08).
- [x] `EntryWriteService.create` never succeeds against a `content_types.key` that does not exist
      in the caller's workspace (INV-01).
- [x] `CollectionsCleanupGateway.execute` never runs its destructive removal against a
      `content_types` row whose `status` is not `tombstone` (INV-07).
- [x] `CollectionsCleanupGateway.confirm` never succeeds for a `principalKind` other than `user`
      (SPEC-016 REQ-10).
- [x] `EntryWriteService.update`/`.publish`/`.unpublish` never succeed against an entry whose
      owning content type's `status` is `tombstone` (REQ-28, INV-09-adjacent).
- [x] `ContentTypeWriteService.updateFields` never leaves a `queryable` field's index built against
      a stale `kind`'s `CAST` mapping after a `kind` change commits (REQ-27, INV-09), including when
      `kind` and `queryable` change together in the same call (REQ-30, INV-09).
- [x] `ContentTypeWriteService.updateFields` never leaves a field's live index out of sync with
      that field's current `queryable` value, whether the flag changed by explicit resubmission
      (REQ-29), the field was newly added with `queryable=true` (REQ-30), or the field was removed
      entirely via full-replace omission (REQ-26, INV-10).
- [x] `ContentTypeWriteService.updateFields` never applies a submitted `fields: []` as "remove all
      fields" — a present-but-empty array is always rejected with `VALIDATION_ERROR`, never
      accepted (REQ-26).

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md`.
- [x] Entity field names align with `state.spec.md` and `ui.spec.md`.
