# Behavior Rules Spec: collections

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-020 |
| feature_name | FEAT-020-collections |
| version | 1.4.0 |
| content_hash | sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6 |
| last_edited | 2026-07-15T03:30:00Z |

**Purpose:** This file captures the deterministic, rule-based behavior of Collections that is not
fully expressed by the acceptance criteria alone — the fixed definition-time validation order, the
content-type lifecycle state machine, the field-schema strict-on-write/tolerant-on-read rule, and
the numeric defaults/limits ADR-043 left unbenchmarked (queryable-field cap, cleanup retention
window).

---

## EARS Syntax Guide

All behavior rules below use EARS (Easy Approach to Requirements Syntax) format.

---

## 1. Precedence Rules

### 1.1 Field-bag validation: current schema vs. an entry's own historical field set

**Situation:** An entry's stored `fieldsJson` may contain a key that was valid under the content
type's schema at the time the entry was written, but the content type's schema has since changed
(a field was removed).

**Sources in precedence order (highest to lowest):**
1. The content type's *current* `fieldsSchemaJson` — always the source of truth for what is
   writable and what is displayed as an editable field.
2. The entry's own stored `fieldsJson` — read-only historical data; a key present here but absent
   from source 1 is tolerated on read (silently omitted from editable/displayed fields) but is
   never itself re-validated or promoted back into the schema.

**Example:**
- Scenario: content type `recipe` originally declared a field `prepTimeMinutes`; an entry was
  written with that field populated; the field was later removed from `recipe`'s schema.
- Input: entry's `fieldsJson` still contains `ext.site.prepTimeMinutes = 30`.
- Result: reading the entry omits `prepTimeMinutes` from the visible field set (REQ-15); writing an
  update to that same entry without re-including `prepTimeMinutes` succeeds normally, and does not
  resurrect the field.

**Test requirement:** The TDD Agent must write a test proving a read after schema field-removal
silently omits the orphaned key, and a separate test proving a *new* write containing that same key
name is rejected under REQ-14 (the current schema, not the entry's own history, governs writes).

---

## 2. Ordering Rules

### 2.1 Definition-time validation check ordering

**Sequence:** When a content-type definition (register or field-update) is submitted, the write
chokepoint evaluates guards in this fixed order and reports only the first failure (REQ-24):
1. `content_types.key` grammar (`^[a-z][a-z0-9_]{0,63}$`)
2. Reserved-key check (`key NOT IN ('post', 'page')`)
3. Each field name's grammar (`^[a-z][a-z0-9_]{0,63}$`)
4. Each field's `kind` against the closed enum
5. The queryable-field count against the cap (`20`)

**Stability:** This ordering is absolute for a single submission — a chokepoint implementation may
not reorder these checks or report more than one failure per submission.

**When overridden:** Never.

**Invariant:** A submission that violates more than one guard always reports the earliest-listed
guard's error, never a later one.

### 2.2 Content-type lifecycle transition ordering

**Context:** A content type moves through `active ⇄ deprecated → tombstone` (REQ-09).

**Order:** `active` and `deprecated` are mutually reversible via `DEPRECATE_CONTENT_TYPE` and
`REACTIVATE_CONTENT_TYPE`. `tombstone` is reachable only via `TOMBSTONE_CONTENT_TYPE`, and only from
`deprecated` — a direct `active → tombstone` transition is not a valid single action.

**Tie-break:** Not applicable — this is a linear state machine, not a competing-candidates scenario.

**Invariant:** No transition out of `tombstone` back to `active` or `deprecated` may ever succeed
(INV-06).

### 2.3 Cleanup eligibility check ordering

**Context:** `CollectionsCleanupGateway.plan()` evaluates REQ-20's three conditions.

**Order:** `status == 'tombstone'` → retention window elapsed since `tombstonedAt` → export
reference present.

**Tie-break:** Not applicable — sequential gate evaluation; the first failing condition is the one
reported in `CLEANUP_NOT_ELIGIBLE.details.reason`.

**Invariant:** A later condition in this order is never evaluated once an earlier one has failed.

### 2.4 Entry-write ordering for update/publish/unpublish against a non-active owning type

**Context:** `UPDATE_ENTRY`, `PUBLISH_ENTRY`, and `UNPUBLISH_ENTRY` each target an existing entry
whose owning content type's `status` may have changed since the entry was created (REQ-28).

**Order:** The owning content type's `status != 'tombstone'` check runs first, before any other
precondition for that action (field-bag validation for `update`, or the status-machine check for
`publish`/`unpublish`).

**Tie-break:** Not applicable — sequential gate evaluation.

**Invariant:** `deprecated` status never blocks `update`/`publish`/`unpublish` of an existing entry
— only `tombstone` status does (REQ-28). This is the inverse relationship of REQ-10, which blocks
*creation* under `deprecated` but says nothing about `tombstone`-only blocking for the other three
actions.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `field.required` | `ContentTypeField` | `false` | An operator adding a field should not accidentally break every existing entry of that type by making it mandatory by default. |
| `field.queryable` | `ContentTypeField` | `false` | Marking a field queryable provisions a real index; defaulting to `true` would silently create index sprawl for fields the operator never intended to search on. |
| `contentType.status` | new `ContentType` | `'active'` | A newly registered content type should immediately accept entries — there is no reason to force an extra activation step. |
| `entry.status` | new `Entry` | `'draft'` | Mirrors this codebase's existing `posts` convention of not publishing content the instant it is created. |
| Per-type queryable-field cap | `ContentTypeWriteService` | `20` | A `SAFE DEFAULT` Spec Agent assumption — ADR-043 states this cap is "not benchmarked" and defers the exact number; `20` is chosen as a generous-but-bounded ceiling pending Software Architect benchmarking (OQ-01). |
| Cleanup retention window | `CollectionsCleanupGateway.plan` | `30 days` after `tombstonedAt` | A `SAFE DEFAULT` Spec Agent assumption — ADR-043 does not state a number; 30 days mirrors common data-retention grace periods and gives an operator a realistic window to notice and reverse an accidental tombstone before cleanup becomes plannable (OQ-02). |
| Confirmation token TTL | `CollectionsCleanupGateway.confirm` | `~10 minutes` | Not re-decided here — inherited directly from SPEC-016 REQ-10/ADR-041 §3; this spec's Agent Directives explicitly forbid changing it locally. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `content_types.key` / field name grammar | `^[a-z][a-z0-9_]{0,63}$` (max 64 chars) | API (write chokepoint) | REQ-03; never relaxed client-side only |
| Queryable fields per content type | `20` | API (write chokepoint) | REQ-05; the 21st is rejected, never silently dropped |
| Minimum fields per content type (`fields.minItems`) | `1` | API (write chokepoint) | REQ-01/REQ-26; applies at both `CONTENT_TYPE_CREATE` (always required) and `CONTENT_TYPE_UPDATE_FIELDS` (only when `fields` is present) — a present-but-empty `fields: []` on update is rejected, never treated as "clear all fields" |
| `content_types.label` length | 1–255 characters | API + client | |
| `entries.slug` length | 1–255 characters | API + client | |
| Cleanup retention window | `30 days` minimum after `tombstonedAt` | API (`plan()`) | REQ-20; a `plan()` call before this elapses returns `CLEANUP_NOT_ELIGIBLE`, never a shortened window |
| Confirmation token TTL | `~10 minutes` | API (reused from SPEC-016) | Not configurable per-domain |
| `COLLECTIONS_READ` rate limit | 300 req / 60s per principal | API | `api.spec.md` §3 |
| `COLLECTIONS_WRITE` rate limit | 60 req / 60s per principal | API | `api.spec.md` §3 |
| Entry list page size | 1–100, default 20 | API | Values above 100 are rejected, not silently clamped |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate

- A `content_types` registration is a duplicate of an existing one if it shares the same
  `(workspaceId, key)` — enforced by `content_types_workspace_key_unique` (REQ-01).
- An `entries` creation is a duplicate of an existing one if it shares the same
  `(workspaceId, type, slug)` — enforced by `entries_workspace_type_slug_unique` (REQ-13, INV-05).

### 5.2 How Duplicates Are Handled

**At creation time:** A duplicate `content_types` registration is rejected with
`CONTENT_TYPE_KEY_CONFLICT` (409); no row is created. A duplicate `entries` creation is rejected
with `ENTRY_SLUG_CONFLICT` (409); no row is created. Neither is silently merged or overwritten.

**User-facing behavior:** The Content-Type Builder and Entry Editor surface these as inline
field-level conflicts on `key` and `slug` respectively.

### 5.3 Idempotency vs. Deduplication

Distinct concepts, same as SPEC-016's own §5.3 treatment: deduplication here is content-based
(`key` within workspace; `(type, slug)` within workspace), not header-based idempotency-key
matching. This spec does not define an `Idempotency-Key` mechanism of its own for ordinary CRUD —
only the cleanup gateway carries token-based single-use semantics, and that is SPEC-016's mechanism,
not a duplicate concept introduced here.

---

## 6. Tie-Break Logic

N/A — this spec has no scenario where multiple items compete for the same role. Concurrent
registration/creation attempts against the same unique key are resolved deterministically by the
underlying unique index (first committing transaction wins; the second gets
`CONTENT_TYPE_KEY_CONFLICT`/`ENTRY_SLUG_CONFLICT`), which is a conflict outcome, not a tie-break
between competing candidates.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `content_types.key` is exactly 64 characters and otherwise grammar-valid | Accepted. | Yes |
| `content_types.key` is exactly 65 characters | Rejected with `INVALID_KEY_GRAMMAR`. | Yes |
| A content type has exactly 20 fields marked `queryable` | Accepted (AC-09). | Yes |
| A content type has 21 fields marked `queryable` | Rejected with `QUERYABLE_FIELD_CAP_EXCEEDED` on the 21st (AC-08). | Yes |
| A cleanup `plan()` is requested at exactly 30 days since `tombstonedAt` | Treated as eligible — the retention window is an inclusive lower bound (`elapsed >= 30 days`), not exclusive. | Yes |
| A cleanup `plan()` is requested at 29 days, 23 hours since `tombstonedAt` | Rejected with `CLEANUP_NOT_ELIGIBLE`, `reason='retention_window_not_elapsed'`. | Yes |
| Two entries are submitted concurrently for the same `(workspaceId, type, slug)` | The first commit wins; the second is rejected with `ENTRY_SLUG_CONFLICT` — never silently overwritten. | Yes |
| A content type is reactivated and then immediately deprecated again in the same session | Both transitions succeed independently, each appending its own `content_type_revisions` row — no transition is deduplicated or collapsed. | Yes |
| A field is marked `queryable=true` in an `UPDATE_CONTENT_TYPE_FIELDS` call that pushes the count from 20 to 21 | Rejected with `QUERYABLE_FIELD_CAP_EXCEEDED`; the update is rejected in full, not partially applied. | Yes |
| An entry's `fieldsJson` key exists in the schema but its value's runtime type does not match the field's declared `kind` | Rejected with `VALIDATION_ERROR` — kind-conformance is an explicit clause of REQ-14's schema validation (AC-49), not a separate concern. | Yes |
| An entry's `fieldsJson` payload omits the `{ ext: { site: {...} } }` wrapper (a flat payload) | Rejected with `VALIDATION_ERROR` before any per-field key/required/kind check runs — the envelope shape itself is validated first (REQ-14, AC-50). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call omits an existing field from its `fields` array | The field is removed from the schema — `fields` is a full-replacement list, not a merge (REQ-26, AC-41). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call changes a field's `kind` while it stays `queryable` across the call | The field's index is torn down and re-provisioned under the new `kind`'s `CAST` mapping in the same transaction (REQ-27, AC-43). | Yes |
| `UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY` targets an entry whose owning content type has become `tombstone` | Rejected with `CONTENT_TYPE_NOT_ACTIVE`; no state change, no outbox event (REQ-28, AC-44/AC-45). | Yes |
| `UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY` targets an entry whose owning content type is `deprecated` (not tombstoned) | Succeeds normally — `deprecated` only blocks *new* entry creation (REQ-10, REQ-28, AC-46). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call submits `fields: []` (present but empty) | Rejected with `VALIDATION_ERROR` (`details.reason='fields_empty'`); the existing field set, including any `required` field, is left completely unchanged — this floor mirrors `CONTENT_TYPE_CREATE`'s `minItems: 1` (REQ-26, AC-51). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call resubmits an existing field with only its `queryable` value changed (`kind` unchanged) | The field's index is provisioned (`false→true`) or torn down (`true→false`) in the same transaction as the schema update (REQ-29, AC-52/AC-53). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call introduces a field name absent from the prior schema, submitted with `queryable=true` | The new field's index is provisioned in the same transaction, identically to registration-time provisioning — a REQ-30 obligation, not REQ-29's, since the field is newly added rather than resubmitted (REQ-30, AC-54). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call changes a single field's `kind` and `queryable` value together in the same call | The field's index state is resolved from its post-call `kind`/`queryable` value — REQ-27 and REQ-29 combine rather than exclude each other (REQ-30, AC-55). | Yes |
| An `UPDATE_CONTENT_TYPE_FIELDS` call submits a stale `expectedVersion` together with `fields: []` (present but empty) | Rejected with `VERSION_CONFLICT`, not `VALIDATION_ERROR`/`fields_empty` — `expectedVersion` is checked first, before the fields_empty guard (REQ-26, AC-56). | Yes |

