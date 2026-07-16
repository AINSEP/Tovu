# Feature Spec: collections

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-020 |
| version | 1.4.0 |
| status | APPROVED |
| content_hash | sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6 |
| feature_name | FEAT-020-collections |
| last_edited | 2026-07-15T16:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (Claude Sonnet 5, delegated subagent run, 2026-07-14) |
| spec_mode | brownfield |

---

## Revision Note (v1.3.0 → v1.4.0, 2026-07-15T16:00:00Z)

This revision resolves an `/audit-work` finding (internal verification pass, independently confirmed by an
external audit — Fable, Codex GPT-5.6-terra, and Gemini 3.1 Pro all reviewed the pipeline artifacts):
REQ-26/AC-56 (and the corresponding rows in `api.spec.md`, `state.spec.md`, `orchestrator.spec.md`,
`behavior.spec.md`) required rejecting a stale `expectedVersion` with "a version-conflict error," but no such
code was ever registered in `errors.spec.md` — the error registry's own §5 acceptance checklist ("every code
used in api.spec.md appears here") was checked as passing but was not actually true for this one code.
Fixed: added `VERSION_CONFLICT` (category `conflict`, HTTP 409, retryable) to `errors.spec.md` §2.1/§3, and
replaced every "a version-conflict error" reference across this package with the concrete code name. No
requirement's *behavior* changed — REQ-26's ordering (expectedVersion checked before fields_empty) was
already correct; only the missing error-code registration is fixed. Content hash recomputed and propagated
to every sibling file; version bumped `1.3.0` → `1.4.0`.

## Overview

Collections lets a site operator define their own content type (e.g. "Recipe," "Product," "Event")
with its own validated fields, and create/edit/publish entries of that type — entirely through the
admin UI or an agent tool, with no developer writing code or running a migration. This is the first
real build of ADR-022's deferred content-type-registry engine, scoped to new content only; the
existing `posts` table is left completely untouched.

---

## Problem Statement

**Current state:** Tovu's content model is a single bespoke `posts` table with a `kind` column
(`post`|`page`). There is no admin-facing way to model a new kind of content without a developer
writing a schema migration and application code.

**Desired state:** An operator can register a content type by naming its fields (name, kind,
required, queryable) through the Collections admin screen, and immediately start creating, editing,
publishing, and querying entries of that type — with the same validation, revisioning, and
audit-trail discipline every other write path in this codebase already has.

**Why now:** ADR-043 (Collections) was Accepted 2026-07-14 after a 4-round swarm debate and six
rounds of `/audit-work`, alongside three sibling ADRs (ADR-041 Storage/Timeline, ADR-044 Categories
& Tags, ADR-045 Backups/Recovery) that share a core contract now specified in SPEC-016. This spec is
the first of the four dependent domain specs dispatched against that shared contract.

**Success signal:** An operator can register a new content type and create a published entry of that
type end-to-end without a developer touching `src/infra/db/schema.ts`, confirmed by an integration
test that never issues `CREATE TABLE`/`ALTER TABLE` for the new type.

---

## User Journey

1. **Trigger:** An operator wants to model a new kind of content (e.g. "Recipe") without asking a
   developer to write code.
2. **Steps:**
   1. Operator opens the Collections admin screen, chooses "New Content Type," names it, and adds
      fields (name, kind, whether each is required, whether each is queryable), then submits.
   2. Definition-time validation runs (key grammar, reserved-key check, field-name grammar, field-kind
      enum, queryable-field cap) in a fixed order — see REQ-24 for the authoritative order; on
      success, a `content_types` row and its first
      `content_type_revisions` row are written in one transaction, the watermark is stamped, and any
      queryable fields get their indexes provisioned.
   3. Operator (or an agent acting on the operator's behalf) creates entries of that type, filling
      in the type's declared fields. Each entry write validates the field bag against the current
      schema, writes the entry and an `entry_revisions` row transactionally, stamps the watermark,
      and enqueues an outbox event.
   4. Later, the operator decides to retire the content type: **disable** it (`deprecate`) — new
      entry creation is refused, existing entries remain readable/queryable. Then **tombstone** it —
      its queryable indexes are torn down and its entries are excluded from public serving, while
      the rows themselves are retained.
   5. After an explicit retention window has elapsed and an export has been taken, the operator (a
      human, never an agent) runs the destructive cleanup ceremony: `plan()` previews exactly what
      will be permanently removed, `confirm()` (human-only) mints a short-lived token, and
      `execute()` redeems it to permanently delete the content type and all of its entries and
      revisions.
3. **Outcome:** The operator has a fully custom, zero-code content type, and a safe,
   reversible-until-the-last-step retirement path for it.
4. **Alternate paths:** Reserved-key, grammar, and field-kind violations are rejected before any
   DDL is constructed. Entry creation against a deprecated or tombstoned type is refused while reads
   of existing entries continue to work (deprecated) or are excluded from public serving
   (tombstoned). A cleanup `plan()` for a type that is not yet `tombstone`, or for which the
   retention window has not elapsed, or for which no export reference exists, is refused. A cleanup
   `execute()` is subject to every one of SPEC-016's staleness/actor-class/`authorize()` rejections.

---

## Scope

**In scope:**
- The `content_types` registry: definition-time validation (reserved-key rejection, key/field-name
  grammar, closed field-kind enum, per-type queryable-field cap), and its own append-only
  `content_type_revisions` ledger. (ADR-043 §1, §4)
- Core-mediated, workspace-scoped index provisioning for fields marked `queryable` — never an
  operator-triggered `CREATE TABLE`/`ALTER TABLE`. (ADR-043 §1, §4)
- The `entries` table: creation, editing, publish/unpublish, field-bag validation against the
  owning content type's current schema (strict on write, tolerant of orphaned fields on read), and
  its own append-only `entry_revisions` ledger. (ADR-043 §2, §5)
- Same-transaction watermark stamping at both the content-type write chokepoint and the entry write
  chokepoint (cites SPEC-016 REQ-01/REQ-02).
- Same-transaction ADR-009 outbox enqueue for entry-transition events and content-type
  lifecycle-transition events. (ADR-043 §4)
- The disable (`deprecate`) → tombstone → destructive-cleanup lifecycle for a content type, with the
  final cleanup step implemented as an instantiation of SPEC-016's gated-mutation gateway (cites
  SPEC-016 REQ-08–REQ-15, REQ-22). (ADR-043 §6)
- Human admin routes for content-type and entry CRUD, plus the agent-tool catalog for both ordinary
  CRUD/validation and the gated cleanup operation.

**Out of scope:**
- Migrating `posts`/`pages` onto `entries` — ADR-043 explicitly defers this to a future pass.
- Any Directus/Contentful-style physical table-per-Collection or DDL builder — squarely ADR-023
  `dataModule` territory, rejected by ADR-043 §3.
- The Categories & Tags taxonomy join (`entry_terms`) that Collections entries may opt into — owned
  by SPEC-018 per ADR-044.
- The Storage Timeline's own display of `index.provision`/`index.drop` ledger rows, and the full
  migration/`db-ops` execution machinery those events ride on — owned by SPEC-017; this spec only
  requires that Collections' index-provisioning calls into that machinery.
- Per-entry hard delete outside the content-type-level cleanup lifecycle — entries have no
  standalone hard-delete route in this pass; only the content-type-level disable→tombstone→cleanup
  path can permanently remove entry rows.
- The global watermark counter, its sidecar mirror, the generic `plan()`→`confirm()`→`execute()`
  gateway mechanics, the composite actor-identity shape, and the `db-ops` capability contract
  themselves — all owned by SPEC-016, cited here only, per this project's Brownfield/Legacy Code
  Rule 3.
- The full ADR-021 identity & authorization schema (`principals`, `roles`, `policies`) — cited here
  by reference only, never restated.

---

## Requirements

- REQ-01: The system MUST expose a `content_types` registry row per operator-defined content type,
  storing `workspaceId`, `key`, `label`, a `fieldsSchemaJson` field-definition list (each field
  carrying `name`, `kind`, `required`, `queryable`), `status`, and an optimistic-concurrency
  `version` counter, unique per `(workspaceId, key)`.
- REQ-02: The content-type write chokepoint MUST reject registration of a `content_types.key` equal
  to `'post'` or `'page'` with `RESERVED_CONTENT_TYPE_KEY`.
- REQ-03: The content-type write chokepoint MUST validate `content_types.key` and every field name
  in `fieldsSchemaJson` against the grammar `^[a-z][a-z0-9_]{0,63}$` before accepting a definition,
  rejecting a violation with `INVALID_KEY_GRAMMAR` or `INVALID_FIELD_NAME_GRAMMAR` respectively.
- REQ-04: A field's `kind` MUST be restricted to the closed enum
  `text | integer | real | boolean | datetime`. The index provisioner MUST map a field's `kind`
  through a fixed, core-owned lookup table to its `CAST(... AS {sqlType})` literal — it MUST NEVER
  interpolate an operator-supplied `kind`, namespace, or collation string directly into DDL. A
  `kind` outside the enum is rejected with `INVALID_FIELD_KIND`.
- REQ-05: The content-type write chokepoint MUST enforce a per-type cap of 20 fields marked
  `queryable` at definition time, rejecting the 21st with `QUERYABLE_FIELD_CAP_EXCEEDED`.
- REQ-06: Every index provisioned for a `queryable` field MUST have its identity (index name)
  include a workspace-scoped segment (the field's owning `content_types.workspaceId`) in addition to
  the `{type}/{namespace}/{field}` tuple, so that two workspaces defining the same `key` with a
  different field `kind` for the same field name never collide on index identity.
- REQ-07: The content-type write chokepoint MUST call the watermark-stamping function (SPEC-016
  REQ-01) inside the same transaction as every `content_types` row write, per SPEC-016 REQ-02's
  explicit naming of Collections' write-service as a required caller.
- REQ-08: The content-type write chokepoint MUST append a `content_type_revisions` row (`op` one of
  `register | deprecate | reactivate | tombstone | field-change`, an `actorId`, and a monotonic
  `perContentTypeSeq`) in the same transaction as every `content_types` row write. When the write
  was performed by a delegated agent (`kind='agent'`) or by an api_key acting for its owning user
  (`kind='api_key'`), the row MUST additionally carry `(delegatedByWorkspaceId, delegatedById)`
  identifying the delegator or owning user respectively, per SPEC-016 REQ-16's `ActorIdentityRef`
  shape (SPEC-016 `state.spec.md` §2).
- REQ-09: A `content_types.status` MUST follow the state machine `active ⇄ deprecated → tombstone`:
  `active` and `deprecated` are mutually reversible; `tombstone` is reachable only from `deprecated`
  and is terminal — no transition out of `tombstone` back to `active` or `deprecated` may ever
  succeed.
- REQ-10: While a content type's `status` is `deprecated`, the entry write chokepoint MUST refuse
  creation of a new entry of that type with `CONTENT_TYPE_NOT_ACTIVE`, while continuing to allow
  reads (list/get) of that type's existing entries.
- REQ-11: When a content type's `status` transitions to `tombstone`, the system MUST tear down every
  index provisioned for that type's `queryable` fields via the core index-teardown path, and MUST
  exclude that type's entries from any public-facing serving surface, while retaining the entry and
  revision rows themselves.
- REQ-12: Both the `deprecate` and `tombstone` content-type lifecycle transitions MUST enqueue an
  ADR-009 outbox event (`content_type.deprecated`, `content_type.tombstoned`) in the same
  transaction as the status-changing write.
- REQ-13: The system MUST expose an `entries` row per content entry, storing `workspaceId`, `type`
  (a soft reference to `content_types.key`), `slug`, `status`, `title`, `bodyJson`, `fieldsJson`,
  `publishedAt`, `createdAt`, `updatedAt`, and `version`, unique per `(workspaceId, type, slug)`.
- REQ-14: The entry write chokepoint MUST validate every key present in an incoming `fieldsJson`
  payload against the owning content type's *current* `fieldsSchemaJson` at write time, rejecting
  with `VALIDATION_ERROR` if: the payload does not match the `{ ext: { site: { <fieldName>: <value>
  } } }` envelope shape (e.g. a flat, unwrapped payload); the payload contains a key not in the
  current schema; the payload omits a field the current schema marks `required`; or a supplied
  field value's runtime type does not conform to that field's declared `kind` (e.g. a string value
  for a `kind='integer'` field). Envelope-shape validation runs first, before any per-field key/
  required/kind check, since a malformed envelope has no well-defined per-field keys to check.
- REQ-15: When an entry is read whose `fieldsJson` contains a key that existed in the content type's
  schema at write time but has since been removed from the current schema, the read path MUST
  silently ignore that orphaned key rather than treating it as an error.
- REQ-16: The entry write chokepoint MUST append an `entry_revisions` row (`op` one of
  `create | update | publish | unpublish`, an `actorId`, an optional `pluginId`, and a monotonic
  `perEntrySeq`) in the same transaction as every `entries` row write. When the write was performed
  by a delegated agent (`kind='agent'`) or by an api_key acting for its owning user
  (`kind='api_key'`), the row MUST additionally carry `(delegatedByWorkspaceId, delegatedById)`
  identifying the delegator or owning user respectively, per SPEC-016 REQ-16's `ActorIdentityRef`
  shape (SPEC-016 `state.spec.md` §2).
- REQ-17: The entry write chokepoint MUST call the watermark-stamping function (SPEC-016 REQ-01)
  inside the same transaction as every `entries` row write, per SPEC-016 REQ-02.
- REQ-18: Every entry-transition write (`create`, `update`, `publish`, `unpublish`) MUST enqueue an
  ADR-009 outbox event (`entry.created`, `entry.updated`, `entry.published`, `entry.unpublished`) in
  the same transaction as the entry/revision write.
- REQ-19: The entry write chokepoint MUST validate, at write time, that an incoming `entries.type`
  value references a `content_types.key` that exists in the same workspace (SPEC-016 REQ-18), and
  MUST tolerate an already-existing entry whose type was later tombstoned as inert-on-read rather
  than a hard read failure.
- REQ-20: The destructive removal of a `tombstone`-status content type and all of its entries and
  revisions MUST be implemented as an instantiation of SPEC-016's gated-mutation gateway
  (`domain="collections"`, `action="cleanup"`). `plan()` MUST produce an executable plan only when
  the target content type's `status` is `tombstone`, at least 30 days have elapsed since the
  `tombstone` transition, and a caller-supplied export reference is present; otherwise `plan()` MUST
  return `CLEANUP_NOT_ELIGIBLE` with a `reason`.
- REQ-21: A successful cleanup `execute()` MUST permanently and atomically remove the target
  `content_types` row and every `entries`/`entry_revisions`/`content_type_revisions` row scoped to
  it, in a single transaction.
- REQ-22: The Collections agent-tool catalog MUST expose `collections_plan_cleanup` and
  `collections_execute_cleanup` as the only tools implementing the gated cleanup step, following
  SPEC-016 REQ-22's `{domain}_plan_{action}`/`{domain}_execute_{action}` convention, and MUST NOT
  expose a `collections_confirm_cleanup` tool or any other agent-callable tool that performs the
  `confirm()` step.
- REQ-23: Every Collections route and agent tool MUST be gated by exactly one of two permissions:
  `admin.collections.read` (list/get/plan/validate operations) or `admin.collections.manage`
  (create/update/lifecycle-transition/cleanup-confirm/cleanup-execute operations), per ADR-021's
  flat-string permission convention.
- REQ-24: When a content-type definition submission violates more than one definition-time guard
  simultaneously, the write chokepoint MUST evaluate the guards in a fixed order — key grammar,
  reserved-key, field-name grammar, field-kind enum, queryable-field cap — and report only the first
  failing guard.
- REQ-25: The system MUST expose a read-only field-bag validation capability (a route and an agent
  tool) that runs the identical validation logic REQ-14 applies to a create/update call, against a
  caller-supplied `type` and `fieldsJson` payload, without persisting any `entries` or
  `entry_revisions` row.
- REQ-26: The `fields` array submitted to `CONTENT_TYPE_UPDATE_FIELDS`
  (`UPDATE_CONTENT_TYPE_FIELDS`) MUST be treated as a full-replacement list of the content type's
  entire field set, never a merge-by-name patch: when the call succeeds, the content type's
  `fieldsSchemaJson` becomes exactly the submitted `fields` array, and any existing field whose
  `name` does not appear in the submitted array is thereby removed from the schema — this is the
  content type's only field-removal mechanism; no separate `removeFields` list exists. The
  per-type queryable-field cap (REQ-05) is enforced against the submitted array alone, never
  against the submitted array plus any previously-existing field the call does not resubmit. The
  `expectedVersion` optimistic-concurrency match MUST be evaluated first, before the fields_empty
  check below or any other precondition: a call whose `expectedVersion` does not match the content
  type's current `version` MUST be rejected with `VERSION_CONFLICT` regardless of whether
  `fields` is present, empty, or well-formed, and no `fieldsSchemaJson` change is evaluated or
  applied. Only once `expectedVersion` matches does the following apply: when the `fields` array is
  present, it MUST contain at least 1 entry: a submission where `fields` is present but empty
  (`fields: []`) MUST be rejected with `VALIDATION_ERROR` (`details.reason='fields_empty'`) before
  any per-field guard or the queryable-cap check runs, and the content type's existing
  `fieldsSchemaJson` MUST be left completely unchanged by a rejected call. This floor mirrors
  `CONTENT_TYPE_CREATE`'s `fields.minItems: 1` contract constraint: full-replacement semantics
  govern *which* fields exist after a successful call, never whether a content type may be left
  with zero fields — an empty submitted array is always rejected, never treated as "remove every
  field," specifically so that a single call can never silently reduce a content type to a
  fieldless state or drop a currently-`required` field with no distinct error path.
- REQ-27: When an `UPDATE_CONTENT_TYPE_FIELDS` call changes an existing field's `kind` while that
  field remains `queryable` both before and after the call (i.e. the `queryable` flag itself does
  not flip), the write chokepoint MUST tear down that field's existing index and re-provision a new
  index under the new `kind`'s `CAST` mapping (REQ-04), in the same transaction as the schema
  update. A `kind` change on a field that stays `queryable` MUST NEVER be treated as a no-op for
  index-provisioning purposes — index provisioning/teardown is triggered by either a `queryable`
  flag flip or a `kind` change on an already-`queryable` field, not only the former.
- REQ-28: While a content type's `status` is `tombstone`, the entry write chokepoint MUST refuse
  `UPDATE_ENTRY`, `PUBLISH_ENTRY`, and `UNPUBLISH_ENTRY` against any existing entry of that type
  with `CONTENT_TYPE_NOT_ACTIVE`, while continuing to allow reads (list/get) of that type's existing
  entries, per REQ-11's public-serving exclusion. While a content type's `status` is `deprecated`
  (not yet `tombstone`), `UPDATE_ENTRY`, `PUBLISH_ENTRY`, and `UNPUBLISH_ENTRY` against existing
  entries of that type remain permitted — REQ-10's refusal of *new* entry creation is the only
  restriction `deprecated` status imposes; management of already-existing entries of a `deprecated`
  type is unaffected.
- REQ-29: When an `UPDATE_CONTENT_TYPE_FIELDS` call resubmits an existing field with its `queryable`
  value changed (`false→true` or `true→false`) while that field's `kind` does not change, the write
  chokepoint MUST, in the same transaction as the schema update, provision a new index for that
  field (on `false→true`) or tear down its existing index (on `true→false`). This is the same
  index-provisioning/teardown obligation REQ-06 establishes at registration time, applied
  identically whenever an existing field's `queryable` flag changes on an update call. REQ-27
  covers the orthogonal case of a `kind` change while `queryable` stays constant across the call;
  this requirement covers the `queryable` flag itself changing while `kind` stays constant.
- REQ-30: REQ-27 and REQ-29 govern only the two cases where exactly one of `kind`/`queryable`
  changes on an *already-existing* field. This requirement closes the two residual cases an
  `UPDATE_CONTENT_TYPE_FIELDS` full-replace call (REQ-26) can otherwise reach that neither REQ-27
  nor REQ-29 literally covers: (a) A field name that is not present in the content type's schema
  immediately before the call, submitted in the `fields` array with `queryable=true`, MUST have its
  index provisioned in the same transaction as the schema update, identically to registration-time
  provisioning (REQ-01/REQ-06) — this is index provisioning for a newly-introduced field, not a
  resubmission of an existing field, so it is a REQ-30 obligation, not a REQ-29 one. (b) When a
  single existing field's `kind` AND `queryable` both change in the same `UPDATE_CONTENT_TYPE_FIELDS`
  call, its index state MUST be resolved according to its *post-call* `queryable` value and `kind`:
  REQ-27 and REQ-29 combine, not exclude, when both conditions hold simultaneously for the same
  field within one call — the write chokepoint MUST NOT treat REQ-27's and REQ-29's trigger
  conditions as mutually exclusive gates that leave a combined change ungoverned. In both (a) and
  (b), the index-provisioning/teardown obligation runs in the same transaction as the schema update,
  exactly as REQ-27 and REQ-29 require for their own respective cases.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given an operator submits a well-formed content-type definition, when the
  submission is processed, then a `content_types` row is created with the submitted `key`, `label`,
  `fieldsSchemaJson`, `status='active'`, and `version=1`.
- AC-02 (REQ-02) [P1]: Given an operator submits a content-type definition with `key='post'`, when
  the submission is processed, then it is rejected with `RESERVED_CONTENT_TYPE_KEY` and no row is
  created.
- AC-03 (REQ-02) [P1]: Given an operator submits a content-type definition with `key='page'`, when
  the submission is processed, then it is rejected with `RESERVED_CONTENT_TYPE_KEY` and no row is
  created.
- AC-04 (REQ-03) [P1]: Given an operator submits `key='My-Recipe'` (contains an uppercase letter and
  a hyphen), when the submission is processed, then it is rejected with `INVALID_KEY_GRAMMAR`.
- AC-05 (REQ-03) [P1]: Given an operator submits a field named `name"; DROP TABLE entries;--`, when
  the submission is processed, then it is rejected with `INVALID_FIELD_NAME_GRAMMAR` before any
  index DDL is constructed.
- AC-06 (REQ-04) [P1]: Given an operator submits a field with `kind="text'); DROP TABLE entries;--"`,
  when the submission is processed, then it is rejected with `INVALID_FIELD_KIND` and no DDL is
  constructed referencing that string.
- AC-07 (REQ-04) [P1]: Given a field with `kind="integer"` is marked `queryable`, when its index is
  provisioned, then the resulting `CAST` literal in the generated DDL comes only from the fixed
  core lookup table entry for `integer`, never from operator-supplied text.
- AC-08 (REQ-05) [P1]: Given a content type already has 20 fields marked `queryable`, when a 21st
  `queryable` field is submitted, then it is rejected with `QUERYABLE_FIELD_CAP_EXCEEDED`.
- AC-09 (REQ-05) [P2]: Given a content type has exactly 20 fields marked `queryable`, when the
  definition is submitted, then it is accepted.
- AC-10 (REQ-06) [P1]: Given two different workspaces each register a content type with the same
  `key` and the same queryable field name but a different field `kind`, when both types' indexes are
  provisioned, then the two resulting index names differ (each includes its own workspace-scoped
  segment) and neither provisioning attempt fails due to name collision.
- AC-11 (REQ-07) [P1]: Given a content-type write chokepoint commits a `content_types` row, when the
  transaction commits, then `storage_write_watermark` (SPEC-016 REQ-01) has advanced by exactly 1.
- AC-12 (REQ-08) [P1]: Given a content-type write chokepoint commits a `content_types` row, when the
  transaction commits, then a `content_type_revisions` row exists in the same transaction with the
  correct `op` and an incremented `perContentTypeSeq`.
- AC-13 (REQ-09) [P1]: Given a content type with `status='active'`, when it is deprecated and then
  reactivated, then both transitions succeed and the final `status` is `active`.
- AC-14 (REQ-09) [P1]: Given a content type with `status='tombstone'`, when a reactivation or
  un-tombstone request is submitted, then it is rejected and `status` remains `tombstone`.
- AC-15 (REQ-10) [P1]: Given a content type with `status='deprecated'`, when a new entry of that
  type is submitted, then it is rejected with `CONTENT_TYPE_NOT_ACTIVE` and no entry row is created.
- AC-16 (REQ-10) [P1]: Given a content type with `status='deprecated'` has existing entries, when
  those entries are listed or fetched, then the request succeeds and returns them.
- AC-17 (REQ-11) [P1]: Given a content type transitions to `status='tombstone'`, when the transition
  completes, then every index previously provisioned for that type's `queryable` fields has been
  torn down.
- AC-18 (REQ-11) [P1]: Given a content type has `status='tombstone'`, when its entries are requested
  through the public-facing serving surface, then they are excluded from the result, while the same
  entries remain retrievable through the admin read routes.
- AC-19 (REQ-12) [P1]: Given a content type is deprecated, when the transition commits, then a
  `content_type.deprecated` outbox event was enqueued in the same transaction.
- AC-20 (REQ-12) [P1]: Given a content type is tombstoned, when the transition commits, then a
  `content_type.tombstoned` outbox event was enqueued in the same transaction.
- AC-21 (REQ-13) [P1]: Given an entry already exists with `(workspaceId, type, slug)` = `(W, "recipe",
  "chili")`, when a second entry is submitted with the identical triple, then it is rejected with
  `ENTRY_SLUG_CONFLICT` and no second row is created.
- AC-22 (REQ-14) [P1]: Given a content type's current schema does not declare a field named `foo`,
  when an entry write includes `fieldsJson.ext.site.foo`, then it is rejected with `VALIDATION_ERROR`
  naming `foo` as an unrecognized field.
- AC-23 (REQ-14) [P1]: Given a content type's current schema marks field `title` as `required`, when
  an entry write omits `title`, then it is rejected with `VALIDATION_ERROR`.
- AC-24 (REQ-15) [P1]: Given an entry was written while its content type's schema declared field
  `legacyNote`, and that field was subsequently removed from the schema, when the entry is read,
  then the response omits `legacyNote` silently rather than raising an error.
- AC-25 (REQ-16) [P1]: Given an entry write chokepoint commits an `entries` row, when the
  transaction commits, then an `entry_revisions` row exists in the same transaction with the correct
  `op`, an incremented `perEntrySeq`, and `pluginId=null` for an operator-initiated write.
- AC-26 (REQ-17) [P1]: Given an entry write chokepoint commits an `entries` row, when the
  transaction commits, then `storage_write_watermark` (SPEC-016 REQ-01) has advanced by exactly 1.
- AC-27 (REQ-18) [P1]: Given a new entry is created, when the transaction commits, then an
  `entry.created` outbox event was enqueued in the same transaction.
- AC-28 (REQ-18) [P1]: Given an existing entry is published, when the transaction commits, then an
  `entry.published` outbox event was enqueued in the same transaction.
- AC-29 (REQ-19) [P1]: Given an entry write specifies `type="does-not-exist"`, when the write is
  processed, then it is rejected with `CONTENT_TYPE_NOT_FOUND`.
- AC-30 (REQ-19) [P1]: Given a content type `key="recipe"` exists only in workspace `W1`, when a
  caller in workspace `W2` submits an entry with `type="recipe"`, then it is rejected as a
  workspace-ownership violation, not silently accepted against `W1`'s type.
- AC-31 (REQ-20) [P1]: Given a content type has `status='active'` or `status='deprecated'`, when
  `plan()` is called for its cleanup, then it returns `CLEANUP_NOT_ELIGIBLE` with
  `reason='not_tombstoned'`.
- AC-32 (REQ-20) [P1]: Given a content type has `status='tombstone'` but fewer than 30 days have
  elapsed since that transition, when `plan()` is called for its cleanup, then it returns
  `CLEANUP_NOT_ELIGIBLE` with `reason='retention_window_not_elapsed'`.
- AC-33 (REQ-20) [P1]: Given a content type has `status='tombstone'`, at least 30 days have elapsed
  since that transition, and a valid export reference is supplied, when `plan()` is called, then it
  returns an executable `Plan` describing exactly the rows that would be removed.
- AC-34 (REQ-21) [P1]: Given a cleanup `execute()` succeeds, when the transaction commits, then the
  target `content_types` row and every `entries`/`entry_revisions`/`content_type_revisions` row
  scoped to it no longer exist, all removed in one transaction.
- AC-35 (REQ-22) [P1]: Given the Collections agent-tool catalog is inspected, then
  `collections_plan_cleanup` and `collections_execute_cleanup` are present and agent-callable, and
  no tool named `collections_confirm_cleanup` (or any tool that performs the `confirm()` step)
  exists.
- AC-36 (REQ-23) [P1]: Given a principal holds only `admin.collections.read`, when it calls a
  content-type or entry create/update/lifecycle-transition route or tool, then the call is rejected
  with `FORBIDDEN`.
- AC-37 (REQ-23) [P1]: Given a principal holds only `admin.collections.read`, when it calls a
  content-type or entry list/get route or tool, then the call succeeds.
- AC-38 (REQ-24) [P1]: Given a content-type submission has `key='post'` (reserved) AND an invalid
  field name in the same payload, when it is processed, then `RESERVED_CONTENT_TYPE_KEY` is the
  reported error — per REQ-24's fixed guard order (key grammar, reserved-key, field-name grammar,
  field-kind, queryable-cap), the key grammar check passes first (`'post'` is grammar-valid), so
  the reserved-key check is the next guard evaluated and is the one that fails and is reported,
  never the later `INVALID_FIELD_NAME_GRAMMAR` violation.
- AC-39 (REQ-25) [P2]: Given a `fieldsJson` payload that violates the target content type's current
  schema, when the validate-only route/tool is called, then it returns the same `VALIDATION_ERROR`
  shape `ENTRY_CREATE` would produce, and no `entries` or `entry_revisions` row is written.
- AC-40 (REQ-25) [P2]: Given a `fieldsJson` payload that satisfies the target content type's current
  schema, when the validate-only route/tool is called, then it returns success and no `entries` or
  `entry_revisions` row is written.
- AC-41 (REQ-26) [P1]: Given a content type's current schema has fields `[a, b, c]`, when an
  `UPDATE_CONTENT_TYPE_FIELDS` call submits `fields=[a, b]` (omitting `c`), then the call succeeds
  and the schema no longer contains field `c`.
- AC-42 (REQ-26) [P1]: Given a content type has 15 existing fields marked `queryable`, when an
  `UPDATE_CONTENT_TYPE_FIELDS` call submits a `fields` array containing exactly 20 queryable fields
  (regardless of overlap with the prior 15), then the queryable-field cap is evaluated only against
  the 20 fields in the submitted array, and the call is accepted.
- AC-43 (REQ-27) [P1]: Given a field named `price` is `queryable=true` with `kind='integer'` and has
  a live index built against the `integer` `CAST` mapping, when an `UPDATE_CONTENT_TYPE_FIELDS` call
  changes `price`'s `kind` to `real` while leaving `queryable=true`, then the transaction that
  commits the schema change also tears down the old `integer`-mapped index and provisions a new
  index built against the `real` `CAST` mapping.
- AC-44 (REQ-28) [P1]: Given a content type has `status='tombstone'`, when `UPDATE_ENTRY` is called
  against an existing entry of that type, then it is rejected with `CONTENT_TYPE_NOT_ACTIVE` and no
  update is applied.
- AC-45 (REQ-28) [P1]: Given a content type has `status='tombstone'`, when `PUBLISH_ENTRY` or
  `UNPUBLISH_ENTRY` is called against an existing entry of that type, then it is rejected with
  `CONTENT_TYPE_NOT_ACTIVE`, no status transition occurs, and no `entry.published`/
  `entry.unpublished` outbox event is enqueued.
- AC-46 (REQ-28) [P1]: Given a content type has `status='deprecated'`, when `UPDATE_ENTRY`,
  `PUBLISH_ENTRY`, or `UNPUBLISH_ENTRY` is called against an existing entry of that type, then the
  call succeeds normally, identically to when `status='active'`.
- AC-47 (REQ-08) [P1]: Given a `content_type_revisions` row is appended for a write performed by a
  `kind='agent'` principal delegated by another principal, when the row is inspected, then it
  carries `(delegatedByWorkspaceId, delegatedById)` identifying the delegator, per SPEC-016 REQ-16's
  `ActorIdentityRef` shape.
- AC-48 (REQ-16) [P1]: Given an `entry_revisions` row is appended for a write performed by a
  `kind='api_key'` principal acting for its owning user, when the row is inspected, then it carries
  `(delegatedByWorkspaceId, delegatedById)` identifying the owning user, per SPEC-016 REQ-16's
  `ActorIdentityRef` shape.
- AC-49 (REQ-14) [P1]: Given a content type's current schema declares field `age` with
  `kind='integer'`, when an entry write supplies `fieldsJson.ext.site.age = "thirty"` (a string, not
  an integer), then it is rejected with `VALIDATION_ERROR` naming `age`'s kind-conformance
  violation.
- AC-50 (REQ-14) [P1]: Given an entry write supplies a flat, unwrapped `fieldsJson` payload (e.g.
  `{ "foo": 30 }` instead of `{ ext: { site: { foo: 30 } } }`), when the write is processed, then it
  is rejected with `VALIDATION_ERROR` before any per-field key/required/kind check runs.
- AC-51 (REQ-26) [P1]: Given a content type has 3 existing fields, when an
  `UPDATE_CONTENT_TYPE_FIELDS` call submits `fields=[]` (an empty array), then the call is rejected
  with `VALIDATION_ERROR` (`details.reason='fields_empty'`) and the content type's
  `fieldsSchemaJson` remains exactly the 3 pre-existing fields, unchanged.
- AC-52 (REQ-29) [P1]: Given a field named `email` is `queryable=false` with `kind='text'` and no
  live index, when an `UPDATE_CONTENT_TYPE_FIELDS` call resubmits `email` with `queryable=true` and
  `kind='text'` unchanged, then the transaction that commits the schema change also provisions a
  new index for `email`.
- AC-53 (REQ-29) [P1]: Given a field named `email` is `queryable=true` with `kind='text'` and a live
  index, when an `UPDATE_CONTENT_TYPE_FIELDS` call resubmits `email` with `queryable=false` and
  `kind='text'` unchanged, then the transaction that commits the schema change also tears down
  `email`'s existing index.
- AC-54 (REQ-30) [P1]: Given a content type's current schema has fields `[a, b]`, when an
  `UPDATE_CONTENT_TYPE_FIELDS` call submits `fields=[a, b, c]` where `c` is a field name absent
  from the prior schema and `c` is submitted with `queryable=true`, then the transaction that
  commits the schema change also provisions a new index for `c`, identically to registration-time
  provisioning (REQ-01/REQ-06).
- AC-55 (REQ-30) [P1]: Given a field named `price` is `queryable=false` with `kind='integer'` and
  no live index, when an `UPDATE_CONTENT_TYPE_FIELDS` call resubmits `price` with both `kind='real'`
  and `queryable=true` changed together in the same call, then the transaction that commits the
  schema change provisions a new index for `price` built against the `real` `CAST` mapping,
  resolved from `price`'s post-call `kind` and `queryable` value.
- AC-56 (REQ-26) [P1]: Given a content type is at `version=3`, when an `UPDATE_CONTENT_TYPE_FIELDS`
  call submits `expectedVersion=2` (stale) together with `fields=[]` (present but empty), then the
  call is rejected with `VERSION_CONFLICT`, not `VALIDATION_ERROR`
  (`details.reason='fields_empty'`), and the content type's `fieldsSchemaJson` and `version` are
  both left completely unchanged.

---

## Invariants

- INV-01: An `entries` row's `type` value must always reference a `content_types.key` that exists
  in the same workspace at the moment the write chokepoint accepts the entry write.
- INV-02: A `content_types.key` must never equal `'post'` or `'page'`.
- INV-03: A `content_types.key`, and every field name inside its `fieldsSchemaJson`, must always
  match the grammar `^[a-z][a-z0-9_]{0,63}$`.
- INV-04: A field's `kind` must always be one of `text | integer | real | boolean | datetime`; the
  index provisioner must never interpolate an operator-supplied kind, namespace, or collation string
  directly into DDL.
- INV-05: The `(workspaceId, type, slug)` uniqueness on `entries` must never be violated.
- INV-06: A `content_types.status` must never transition from `tombstone` back to `active` or
  `deprecated`.
- INV-07: A cleanup `execute()` must never run its destructive removal against a content type whose
  `status` is not `tombstone`.
- INV-08: Every content-type or entry write-chokepoint transaction that commits a row must have
  stamped `storage_write_watermark` exactly once within that same transaction (SPEC-016 REQ-02's
  obligation, applied to both of this spec's write chokepoints).
- INV-09: A `queryable` field's live index must never reference a `CAST` mapping for a `kind` other
  than that field's current `kind` — any `kind` change on a `queryable` field must be accompanied,
  in the same transaction, by tearing down the stale index and provisioning a new one (REQ-27,
  REQ-30 for the case where `kind` and `queryable` change together in the same call).
- INV-10: A field's live queryable index must exist if and only if that field currently exists in
  its content type's schema with `queryable=true`. Any `queryable` flag change on an existing field
  — whether by explicit resubmission with a flipped `queryable` value (REQ-29), by a field newly
  introduced in a full-replace submission with `queryable=true` (REQ-30), or by full-replace
  removal of the field entirely (REQ-26) — must be accompanied, in the same transaction, by
  provisioning or tearing down that field's index.

---

## Edge Cases

- EC-01: What happens when an operator registers a content type with `key='post'`?
  Expected behavior: rejected with `RESERVED_CONTENT_TYPE_KEY`; no row is created (REQ-02).
- EC-02: What happens when an operator submits a field name containing a quote or JSON-path
  metacharacter?
  Expected behavior: rejected with `INVALID_FIELD_NAME_GRAMMAR` before any index DDL is constructed
  (REQ-03).
- EC-03: What happens when an operator submits a field `kind` that is not one of the closed enum
  values, including an attempted SQL-fragment string?
  Expected behavior: rejected with `INVALID_FIELD_KIND`; the string is never interpolated into DDL
  (REQ-04).
- EC-04: What happens when two different workspaces each register the same content-type `key` with
  a different field `kind` for the same queryable field name?
  Expected behavior: each workspace's index identity carries its own workspace-scoped segment, so
  the two indexes never collide (REQ-06).
- EC-05: What happens when an entry-create request targets a content type with `status='deprecated'`?
  Expected behavior: rejected with `CONTENT_TYPE_NOT_ACTIVE`; existing entries of that type remain
  listable and gettable (REQ-10).
- EC-06: What happens when an entry-create request targets a content type with `status='tombstone'`?
  Expected behavior: rejected; existing entries of that type are additionally excluded from the
  public-facing serving surface, though they remain in the `entries` table (REQ-10, REQ-11).
- EC-07: What happens when an entry write's `fieldsJson` includes a key that is not present in the
  target content type's current schema?
  Expected behavior: rejected with `VALIDATION_ERROR`; strict-on-write is never relaxed (REQ-14).
- EC-08: What happens when an entry written before a field was removed from its content type's
  schema is read after that removal?
  Expected behavior: the now-orphaned key is silently omitted from the read response, not treated as
  an error (REQ-15).
- EC-09: What happens when a cleanup `plan()` is requested for a content type still in
  `status='deprecated'` (never tombstoned)?
  Expected behavior: rejected with `CLEANUP_NOT_ELIGIBLE`, `reason='not_tombstoned'` (REQ-20).
- EC-10: What happens when a cleanup `execute()` is attempted a second time against a token whose
  underlying content type was already permanently removed by an earlier successful `execute()`?
  Expected behavior: rejected per SPEC-016's token/plan-staleness rules
  (`TOKEN_ALREADY_REDEEMED`/`PLAN_STALE`, SPEC-016 REQ-12/INV-03) — no second removal is attempted.
- EC-11: What happens when an `UPDATE_CONTENT_TYPE_FIELDS` call omits an existing field from its
  `fields` array?
  Expected behavior: the field is removed from the schema — the submitted array is a full
  replacement, not a merge (REQ-26).
- EC-12: What happens when an `UPDATE_CONTENT_TYPE_FIELDS` call changes a field's `kind` while the
  field stays `queryable` across the call?
  Expected behavior: the field's index is torn down and re-provisioned under the new `kind`'s
  `CAST` mapping in the same transaction, even though the `queryable` flag never flipped (REQ-27).
- EC-13: What happens when `UPDATE_ENTRY`, `PUBLISH_ENTRY`, or `UNPUBLISH_ENTRY` targets an existing
  entry whose content type has since become `tombstone`?
  Expected behavior: rejected with `CONTENT_TYPE_NOT_ACTIVE`; no state change and no outbox event
  (REQ-28).
- EC-14: What happens when `UPDATE_ENTRY`, `PUBLISH_ENTRY`, or `UNPUBLISH_ENTRY` targets an existing
  entry whose content type is `deprecated` (not yet `tombstone`)?
  Expected behavior: the call succeeds normally — `deprecated` only blocks *new* entry creation
  (REQ-10, REQ-28).
- EC-15: What happens when an entry write's `fieldsJson` omits the `{ ext: { site: {...} } }`
  wrapper entirely (a flat payload)?
  Expected behavior: rejected with `VALIDATION_ERROR` before any per-field check runs (REQ-14).
- EC-16: What happens when an `UPDATE_CONTENT_TYPE_FIELDS` call submits `fields: []` (present but
  empty)?
  Expected behavior: rejected with `VALIDATION_ERROR` (`details.reason='fields_empty'`); the
  content type's existing field set, including any `required` field, is left completely unchanged
  (REQ-26).
- EC-17: What happens when an `UPDATE_CONTENT_TYPE_FIELDS` call resubmits an existing field with
  only its `queryable` value changed (`kind` unchanged)?
  Expected behavior: the field's index is provisioned (`false→true`) or torn down (`true→false`) in
  the same transaction as the schema update (REQ-29).
- EC-18: What happens when an `UPDATE_CONTENT_TYPE_FIELDS` call introduces a field name not present
  in the content type's schema immediately before the call, submitted with `queryable=true`?
  Expected behavior: the new field's index is provisioned in the same transaction, identically to
  registration-time provisioning — this is a REQ-30 obligation, not REQ-29's (REQ-30).
- EC-19: What happens when a single field's `kind` and `queryable` value both change in the same
  `UPDATE_CONTENT_TYPE_FIELDS` call?
  Expected behavior: the field's index state is resolved according to its post-call `kind` and
  `queryable` value in the same transaction — REQ-27 and REQ-29 combine rather than exclude each
  other (REQ-30).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-016 (content-admin-core-contract) | The watermark-stamping function, the generic `plan()→confirm()→execute()` gated-mutation gateway, the composite actor-identity/soft-reference pattern, and `authorize()` ordering this spec instantiates | If SPEC-016's gateway or watermark function is unavailable, Collections' cleanup ceremony and watermark-stamped writes cannot run | None — fail-closed; the write or cleanup ceremony is blocked, never silently skipped |
| ADR-022 append-only revisions / write-chokepoint discipline | The existing per-entry revisioning precedent this feature's write-service follows | Not an operational dependency of this spec itself; a chokepoint that skips it is this feature's own defect | None — cited by reference only, not restated here |
| ADR-024 expression-totality amendment | Bounds the field-validation predicate language this feature's operator-authored validation rules ride, so it is never Turing-complete | If violated, an operator-authored validation rule could hang or resource-exhaust the write chokepoint | None — validation rules must be expressed within the bounded predicate language; there is no escape hatch |
| ADR-041 index-provisioning ledger and execution path (owned downstream by SPEC-017) | The core migration/`db-ops` execution path Collections calls to create/drop the indexes REQ-06 requires | If unavailable, index provisioning cannot occur | The field remains declared but not query-optimized; content-type registration itself is not blocked, only the index-backed query capability is deferred until the path is available |
| ADR-009 outbox discipline | The mechanism by which entry and content-type lifecycle events reach downstream consumers (search indexing, webhooks, SEO overrides) | If the same-transaction outbox enqueue fails, downstream consumers never learn of the change | None — the enqueue is required in the same transaction as the row write; a failed enqueue must fail the whole write, never silently drop the event |
| ADR-021 identity & authorization (`authorize()`, permission strings, principal kinds, agent delegation) | The `admin.collections.read`/`admin.collections.manage` permission-gate mechanics and the agent-tool actor-class rule this spec relies on | If `authorize()` is unavailable, no Collections route or tool can be evaluated | None — fail-closed; the call is denied, never allowed by default |

---

## Open Questions

- OQ-01: The exact per-type queryable-field cap. This spec sets `20` as a Spec Agent `SAFE DEFAULT`
  NFR assumption — ADR-043 itself states this value is "not benchmarked here." — Owner: Software
  Architect for SPEC-020 — Resolve by: before SPEC-020's architecture sign-off.
- OQ-02: The exact retention window before a tombstoned content type's cleanup `plan()` becomes
  eligible. This spec sets `30 days` as a Spec Agent `SAFE DEFAULT` NFR assumption — ADR-043 does
  not state a number. — Owner: Software Architect for SPEC-020 — Resolve by: before SPEC-020's
  architecture sign-off.
- OQ-03: Whether/when `posts`/`pages` migrate onto `entries` — deliberately out of ADR-043's scope
  and this spec's scope. — Owner: a future ADR — Resolve by: not scheduled.
- OQ-04: **Resolved** — inherited directly from SPEC-016's own OQ-04, which is itself marked
  "Resolved 2026-07-14 (Coordinator fold-back from SPEC-017)" as of the current SPEC-016 revision
  (v1.1.0): a second `confirm()` call for the same still-valid `planId`/`planHash` mints an
  independent additional single-use token; the first token remains valid until it is separately
  redeemed or expires. SPEC-016 states this is "the contract's single global answer" with no
  domain-specific reason to diverge, so Collections' cleanup gateway instantiation applies this
  resolution directly rather than re-deciding it or waiting on a separate sign-off gate. No further
  action or owner is needed for this question in this spec.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` Article I is an unfilled template placeholder (literal `[PRINCIPLE NAME]` text, no ratified project-specific principle) — there is no concrete compliance target to check this spec against. |
| II — Test-First | N/A | Same template-placeholder state as Article I — no ratified principle text exists to evaluate against. |
| III — Simplicity Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own scope discipline (see Scope, Out of scope) is documented independently of any constitution article. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's generic gateway instantiation (`domain="collections"`) already has a proven multi-consumer pattern in SPEC-016 (Storage, Recovery), so it is not a speculative one-off abstraction even absent a constitution article. |
| V — Integration-First Testing | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| VI — Security-by-Default | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own grammar/reserved-key/field-kind injection-prevention requirements (REQ-02–REQ-04, INV-02–INV-04) stand on ADR-043's own decision, not on a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec still carries its own `spec_id`/`content_hash` discipline per the Speckit compatibility contract regardless. |
| VIII — Observability | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's error envelope (see `errors.spec.md`) still carries `correlationId` regardless. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified: `ADS-memory/specs/003-*` and `ADS-memory/reports/pipeline/003-*` were confirmed absent before this run)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (this feature has real ordering/default/limit/dedup rules — see Scope)
- [x] traceability.spec.md complete (marked "pending implementation" — no code has been written yet)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Integration Contracts

This spec depends on SPEC-016 (`content-admin-core-contract`) for the mechanisms below. Per this
project's shared-core-contract convention, this spec does not restate their behavior — it cites
SPEC-016's requirement/acceptance-criterion/invariant ids by number.

- **Watermark stamping (SPEC-016 REQ-01, REQ-02):** Both write chokepoints this spec defines — the
  content-type write-service (this spec's REQ-07/REQ-08/AC-11/AC-12) and the entry write-service
  (this spec's REQ-16/REQ-17/AC-25/AC-26) — call SPEC-016's watermark-stamping function inside their
  own commit transaction. SPEC-016 REQ-02 explicitly names "Collections' entries/content-types
  write-service" as a required caller. This spec's AC-11 and AC-26 are not satisfiable unless
  SPEC-016 REQ-01/REQ-02 are implemented and live.
- **Gated-mutation gateway (SPEC-016 REQ-08–REQ-15, REQ-22; INV-03, INV-04, INV-05):** The
  destructive content-type cleanup step (this spec's REQ-20/REQ-21) is a direct instantiation of
  SPEC-016's `plan()`→`confirm()`→`execute()` gateway with `domain="collections"`,
  `action="cleanup"`. This spec's AC-31 through AC-35 assume SPEC-016's gateway is live: `confirm()`
  is human-only (SPEC-016 REQ-10), `execute()` re-runs `authorize()` fresh and rejects a stale plan
  (SPEC-016 REQ-11/REQ-12), the actor-class redemption rule applies to any agent-delegated
  `execute()` call (SPEC-016 REQ-13), and the agent-tool catalog rule that no `confirm`-equivalent
  tool may exist (SPEC-016 REQ-22) governs this spec's AC-35 directly.
- **Composite actor identity (SPEC-016 REQ-16, REQ-17):** Every row in `content_type_revisions` and
  `entry_revisions` carries the actor pair via its own `workspaceId` column plus `actorId` (and
  `pluginId` when the writer is a plugin), per SPEC-016 REQ-16. When the write was performed by a
  delegated agent (`kind='agent'`) or an api_key acting for its owning user (`kind='api_key'`), both
  revision tables additionally carry `(delegatedByWorkspaceId, delegatedById)` per SPEC-016 REQ-16's
  `ActorIdentityRef` shape (SPEC-016 `state.spec.md` §2) — this spec's `state.spec.md` §2 now
  defines both fields on `ContentTypeRevision` and `EntryRevision` (REQ-08, REQ-16). This spec's
  AC-12, AC-25, AC-47, and AC-48 assume this shape is available. `content_type_revisions` and
  `entry_revisions` live in the same physical `content.db` file as `principals` (per ADR-021 §4/§7 —
  identity lives per-site in `content.db`, the same file Collections' own tables live in), so
  REQ-17's specific "physical boundary/no-FK" clause does not itself apply to Collections' revision
  tables the way it applies to Storage's sidecar journal; REQ-17 is cited here only for its general
  soft-reference posture (population only via the core-mediated write path, never assumed
  FK-enforced), not its physical-boundary-specific clause. A database-level foreign key from these
  revision tables to `principals` remains an implementation option this spec does not foreclose,
  precisely because both tables share one physical database.
- **Soft cross-boundary reference validation/tolerance (SPEC-016 REQ-18; INV-07):**
  `entries.type`'s soft reference to `content_types.key` instantiates REQ-18's *general opening
  rule* directly — "Any soft, cross-boundary reference...MUST have its target existence and
  workspace ownership validated..." — rather than either of REQ-18's two named example flavors
  (composite actor identity; polymorphic content reference, e.g. `entry_terms`). `entries.type` is
  neither: it always references exactly one fixed target table (`content_types`), never a
  heterogeneous set of tables, so it is a third, plainer flavor not named in REQ-18's parenthetical
  examples. This does not change this spec's behavioral obligation: REQ-19/AC-29/AC-30's write-time
  existence/workspace-ownership validation and read-time orphan tolerance instantiate REQ-18's
  general rule for this specific reference shape, independent of which named sub-flavor (if any)
  the reference is understood to fall under.
- **`db-ops` capability shape (SPEC-016 REQ-19):** Collections does not call `db-ops` restore-point
  capture directly, but the index-provisioning path this spec's REQ-06 depends on (owned downstream
  by SPEC-017, per ADR-041) is expected to expose capability information consistent with SPEC-016
  REQ-19's `getCapabilities()` shape once SPEC-017 is dispatched. This is a forward-compatibility
  note, not a live dependency of this spec's own ACs.

**Not cited:** SPEC-016 REQ-03–REQ-07 (sidecar mirror/restore-point disclosure — Storage/Recovery
owned, not touched by Collections) and REQ-20/REQ-21 (SQLite/Postgres restore-point capture
mechanics — not called by this spec).

---

## Agent Directives

Always:
- Every reference to `authorize()` calls the existing function contract defined by ADR-021 §2
  (`authorize(principalId, permission, context) → { allowed, reason }`) — do not introduce a second
  authorization evaluator.
- Route every content-type and entry write through the single write chokepoint
  (`write-service.ts`), mirroring the existing shape of `src/features/post/post.ts` and
  `src/features/settings/write-service.ts` — never write directly from a route handler or an
  agent-tool handler.
- Follow the existing deprecate/tombstone lifecycle precedent already shipped in
  `src/features/settings/write-service.ts` and `src/features/settings/purge-service.ts` for the
  content-type disable→tombstone→cleanup lifecycle — do not invent a new lifecycle shape.

Ask before:
- Changing the queryable-field cap (`20`) or the cleanup retention window (`30 days`) away from
  this spec's stated `SAFE DEFAULT` values without Software Architect benchmarking (OQ-01/OQ-02).
- Introducing any index-name-collision-avoidance scheme other than the workspace-scoped segment
  this spec requires (REQ-06).

Never:
- Interpolate an operator-supplied field name, key, or kind directly into DDL text — always pass it
  through the grammar guard and the fixed kind→SQL-cast lookup table first (REQ-03/REQ-04,
  INV-03/INV-04).
- Expose a `collections_confirm_cleanup` tool, or any `confirm()`-equivalent tool, in the
  agent-tool catalog (REQ-22, cites SPEC-016 REQ-22).
- Allow the destructive cleanup `execute()` step to run against a content type whose `status` is
  not `tombstone` (INV-07).
