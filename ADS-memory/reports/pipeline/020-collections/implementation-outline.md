# Implementation Outline: collections

- Spec: SPEC-020 v1.4.0 (hash: sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6)
- ADR: ADR-PIPE-020
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant
- Date: 2026-07-15T11:00:00Z
- Re-verified: 2026-07-15T17:00:00Z against SPEC-020 v1.4.0 (round-2 `/audit-work` — VERSION_CONFLICT registration; no Contract Map changes required)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Crosses `core/gated-mutations` (cleanup only), `infra/db/schema.ts`, `features/content-types`, `features/entries`; downstream index-provisioning execution owned by SPEC-017 | ADR-PIPE-020 Module Boundaries |
| Contract Change | yes | New routes under `/api/admin/v1/content-types` and `/api/admin/v1/entries`, new agent tools, new error codes | SPEC-020 api.spec.md |
| System Wiring | no | No cross-package orchestration beyond the single cleanup gateway call — not a multi-step wiring chain requiring its own outline detail beyond the Wiring Map below | — |
| Data And Persistence | yes | New `content_types`/`entries`/`content_type_revisions`/`entry_revisions` tables in `content.db` | SPEC-020 state.spec.md §1 |
| Brownfield Dependency | yes | Explicitly leaves `posts`/`pages` untouched (ADR-043's own scope boundary); depends on SPEC-017's index-provisioning execution path | SPEC-020 Out of Scope, Dependencies |
| Reverse-Spec Or Migration | no | Not a reverse-spec extraction; `posts`/`pages` migration onto `entries` is explicitly deferred (OQ-03), not this pass's work | N/A |
| Critical Cross-Boundary Invariant | yes | INV-01 through INV-10 — the largest invariant set among the four dependents, including DDL-safety (INV-04) and index-state correctness (INV-09/INV-10) | SPEC-020 feature.spec.md Invariants |
| Parallelization Ambiguity | no | The two libraries (`content-types`, `entries`) have a clear one-way dependency (entries reads content-types' schema) that Coordinator can derive directly from the Module Map; no additional detail needed | — |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `features/content-types` | SPEC-020 | Registry CRUD, lifecycle transitions, index provisioning, cleanup, agent tools | C-401-C-406 | `core/gated-mutations` (cleanup only), `infra/db/schema.ts`, SPEC-017's index-execution path (downstream) | Per ADR-043's own explicit direction |
| `features/entries` | SPEC-020 | Entry CRUD, field-bag validation, agent tools | C-409-C-412 | `features/content-types` (reads current schema only, never writes it) | Per ADR-043's own explicit direction |
| `core/gated-mutations` (existing, unchanged) | ADR-PIPE-016 | Generic gateway | C-001-C-008 | — | Imported for cleanup only — this domain's third instantiation (rule-of-three) |
| SPEC-017's index-execution path (external, downstream) | SPEC-017 | Actual `CREATE INDEX`/`DROP INDEX` execution | — | — | This domain calls into it; does not own it |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/features/content-types/write-service.ts` | `features/content-types` | creates | C-401, C-402 | Registry chokepoint (register, update-fields) | Single write chokepoint, matches convention | New |
| `src/features/content-types/index-provisioning.ts` | `features/content-types` | creates | C-403 | Fixed kind→CAST lookup + REQ-27/29/30 composition logic | Isolated because this IS the CIC U-001/U-003 unit — the highest-risk logic in this domain | New |
| `src/features/content-types/lifecycle.ts` | `features/content-types` | creates | C-404 | deprecate/reactivate/tombstone | Mirrors `settings/write-service.ts`'s existing precedent exactly | New |
| `src/features/content-types/cleanup.ts` | `features/content-types` | creates | C-405 | Gated cleanup ceremony | Isolated from ordinary mutations, since it alone touches `core/gated-mutations` | New |
| `src/features/content-types/agent-tools.ts` | `features/content-types` | creates | C-406 | Content-types agent-tool catalog (registry CRUD + lifecycle + cleanup tools) | Matches convention; kept a distinct contract from C-412 (entries' own catalog) since the two libraries own disjoint tool sets | New |
| `src/features/entries/write-service.ts` | `features/entries` | creates | C-409, C-410 | Entry CRUD chokepoint | Single write chokepoint | New |
| `src/features/entries/field-validation.ts` | `features/entries` | creates | C-411 | Field-bag validation against current schema | Isolated for focused review of REQ-14's envelope/key/required/kind ordering | New |
| `src/infra/db/schema.ts` | `infra/db` | changes | — | Adds 4 new tables | Existing shared schema file | Additive |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-401 `registerContentType` | `write-service.ts` | `features/content-types` | exported function | Content-type registration | Fixed guard order (CIC U-002), write + revision + watermark + provision indexes | `{key, label, fields}` | `Result<ContentType>` | Guard order: key grammar → reserved-key → field-name grammar → field-kind → queryable-cap (REQ-24) | `RESERVED_CONTENT_TYPE_KEY`, `INVALID_KEY_GRAMMAR`, `INVALID_FIELD_NAME_GRAMMAR`, `INVALID_FIELD_KIND`, `QUERYABLE_FIELD_CAP_EXCEEDED` | Side effect: row + revision + watermark + outbox + index provisioning, one transaction | O(fields.length) | Adversarial case: multiple simultaneous guard violations — only the first in fixed order is reported (see CIC U-002) | SPEC-020 REQ-01-REQ-08, REQ-24, AC-01-AC-13, AC-38 | Contract test: exhaustive multi-violation matrix |
| C-402 `updateContentTypeFields` | `write-service.ts` | `features/content-types` | exported function | Full-replace field-set update | `expectedVersion` checked first, then fields_empty, then per-field guards, then compose index provisioning (REQ-27/29/30) | `{key, fields?, expectedVersion}` | `Result<ContentType>` | See CIC U-004 (ordering), U-003 (composition) | version-conflict error, `VALIDATION_ERROR` (`fields_empty`), plus C-401's per-field errors | Side effect: full-replace schema update + index provisioning/teardown, one transaction | O(fields.length) | Adversarial case: a single field's kind AND queryable both change in one call — see CIC U-003 | SPEC-020 REQ-26, REQ-27, REQ-29, REQ-30, AC-41-AC-56 | Property test: exhaustive combination matrix (kind-only, queryable-only, both, new field) |
| C-403 Index provisioning + kind→CAST lookup | `index-provisioning.ts` | `features/content-types` | exported function | DDL-safe index management | Map `kind` through a fixed, closed lookup table; compose REQ-27/29/30's provisioning/teardown decisions | field kind + queryable state (before/after) | DDL provisioning/teardown instruction (delegated to SPEC-017's execution path) | Never accepts a `kind` outside the closed enum; never interpolates operator text into DDL | `INVALID_FIELD_KIND` | Side effect (delegated): index create/drop | O(1) per field | This IS the CIC U-001 (DDL safety) and U-003 (composition) unit | SPEC-020 REQ-04, REQ-06, REQ-27, REQ-29, REQ-30, INV-04, INV-09, INV-10 | Property test: injection-payload `kind` values always rejected before reaching any DDL construction |
| C-404 `deprecateContentType`/`reactivateContentType`/`tombstoneContentType` | `lifecycle.ts` | `features/content-types` | exported functions | Lifecycle transitions | Enforce the `active ⇄ deprecated → tombstone` state machine (INV-06) | `{key, expectedVersion}` | `Result<ContentType>` | `tombstone` is terminal — no exit transition | `FORBIDDEN`, version-conflict, illegal-transition error | Side effect: status + revision + watermark + outbox, one transaction | O(1) plus index teardown cost for tombstone | Adversarial case: tombstone→active attempt must always fail | SPEC-020 REQ-09, AC-13, AC-14 | State-transition test: exhaustive legal/illegal table |
| C-405 `planCleanup`/`confirmCleanup`/`executeCleanup` | `cleanup.ts` | `features/content-types` | exported functions | Destructive multi-table removal | Calls `core/gated-mutations` C-001-C-003 (`domain="collections"`); `plan()` checks tombstone status + retention window + export reference | `{contentTypeKey}` / `{planId,planHash}` / `{confirmationToken}` | `Result<Plan\|Token\|CleanupResult>` | `CLEANUP_NOT_ELIGIBLE` unless tombstone + 30 days elapsed + export ref present | `CLEANUP_NOT_ELIGIBLE`, plus SPEC-016's gateway codes | Side effect (execute only): atomic multi-table delete | O(entryCount) at execute time | Adversarial case: double-execute against an already-cleaned-up type — see SPEC-016's own token/plan-staleness CIC | SPEC-020 REQ-20, REQ-21, AC-31-AC-35 | Contract test: eligibility gate exhaustive per condition |
| C-406 Content-types agent-tool catalog | `agent-tools.ts` (content-types) | `features/content-types` | exported registrations | Expose registry/lifecycle/cleanup tools | Per SPEC-016 REQ-22's convention | — | — | No `collections_confirm_cleanup` tool ever | N/A | N/A | N/A | SPEC-020 REQ-22, AC-35 | Contract test: catalog inspection |
| C-409 `createEntry`/`updateEntry` | `write-service.ts` | `features/entries` | exported functions | Entry CRUD | Envelope-shape validation first, then per-field key/required/kind checks (REQ-14) | `{type, slug, fieldsJson, ...}` | `Result<Entry>` | `CONTENT_TYPE_NOT_ACTIVE`, `VALIDATION_ERROR`, `ENTRY_SLUG_CONFLICT` | same | Side effect: row + revision + watermark + outbox, one transaction | O(fieldsJson keys) | Adversarial case: malformed envelope must reject before any per-field check runs (AC-50) | SPEC-020 REQ-13, REQ-14, REQ-28, AC-21-AC-24, AC-44-AC-46 | Contract test: envelope-shape-first ordering |
| C-410 `publishEntry`/`unpublishEntry` | `write-service.ts` | `features/entries` | exported functions | Entry status transitions | Reject if owning type is `tombstone` (REQ-28); `deprecated` does not block | `{id, expectedVersion}` | `Result<Entry>` | `CONTENT_TYPE_NOT_ACTIVE` only for tombstone, not deprecated | same | Side effect: status + revision + watermark + outbox | O(1) | N/A | SPEC-020 REQ-28, AC-44-AC-46 | Contract test: deprecated-vs-tombstone distinction |
| C-411 `validateFieldsAgainstSchema` | `field-validation.ts` | `features/entries` | exported function | Shared validation logic for create/update/validate-only | Envelope shape → per-field key → required → kind conformance, in that order | `{type, fieldsJson}` | `{valid: boolean, fieldErrors: [...]}` | Envelope shape checked before any per-field check (REQ-14) | none (returns errors, doesn't throw, for VALIDATE_ENTRY_FIELDS reuse) | Pure decision | O(fieldsJson keys) | Adversarial case: flat/unwrapped payload — must reject before per-field checks (AC-50) | SPEC-020 REQ-14, REQ-25, AC-22, AC-23, AC-49, AC-50 | Contract test: reused identically by create/update/validate-only |
| C-412 Entries agent-tool catalog | `agent-tools.ts` (entries) | `features/entries` | exported registrations | Expose entry CRUD/validate tools | Per SPEC-016 REQ-22's convention; scoped to entries only — content-types' own catalog is C-406, not a shared contract | — | — | N/A (entries has no gated mutation, so no `confirm`-equivalent concern here) | N/A | N/A | N/A | SPEC-020 REQ-22 | Contract test: catalog inspection |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-401 | Route handler / agent tool | direct call | C-401-C-404 (content-types write-service/lifecycle) | respective contract | Fixed guard order (REQ-24); `authorize()` before idempotency (SPEC-016 REQ-14) | Maps to domain error codes | SPEC-020 api.spec.md |
| W-402 | C-401/C-402 | direct call | SPEC-017's index-execution path (downstream, external) | index provisioning/teardown instruction | Same transaction as the schema write | If index execution is unavailable, the field remains declared but not query-optimized (per SPEC-020's own Dependencies table fallback) | SPEC-020 REQ-06, Dependencies table |
| W-403 | `features/content-types/cleanup.ts` (C-405) | direct call | `core/gated-mutations.plan/confirm/execute` (C-001-C-003) | C-001-C-003 | Per SPEC-016's gateway ordering, unmodified | Maps to SPEC-016's codes plus `CLEANUP_NOT_ELIGIBLE` | SPEC-020 Integration Contracts |
| W-404 | `features/entries/write-service.ts` (C-409) | direct call | `features/content-types`'s current-schema read (not a write) | `ContentType.fieldsSchemaJson` | Read-only, no ordering concern beyond "reads current, not stale, schema" | `CONTENT_TYPE_NOT_FOUND` if the type doesn't exist | SPEC-020 REQ-14, REQ-19 |
| W-405 | `write-service.ts` (any mutation, both libraries) | direct call | `core/gated-mutations.stampWatermark()` (C-004) | C-004 | Same transaction as the domain row write | Transaction rollback if stamping fails | SPEC-020 REQ-07, REQ-17 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `content_types` (in `content.db`) | `features/content-types` | `features/entries` (schema lookup, read-only) | `write-service.ts`/`lifecycle.ts` only | Revision + watermark + outbox + index provisioning per mutation | Guard order fixed (REQ-24); optimistic concurrency via `expectedVersion` | N/A — new table |
| `entries` (in `content.db`) | `features/entries` | Admin UI, agent tools | `write-service.ts` only | Revision + watermark + outbox per mutation | `(workspaceId, type, slug)` uniqueness (INV-05) | N/A |
| `content_type_revisions`/`entry_revisions` (in `content.db`) | respective library | Audit views | Every mutation | None beyond the row write | Composite actor identity always stamped (REQ-08, REQ-16) | N/A |
| Queryable-field indexes (physical DB indexes) | `features/content-types` (provisioning decision), SPEC-017 (execution) | Query planner | `index-provisioning.ts` decides, SPEC-017 executes | DDL execution | Index existence must exactly match `queryable=true` field existence (INV-10) | N/A |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| Content-type/entry mutations | Structured error envelope; revision ledgers as durable audit trail | `correlationId` on error envelope | Not specified — v1 admin feature | Standard error envelope | N/A | None beyond standard workspace-scoping | SPEC-020 errors.spec.md |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-01 | `entries` (this domain) | `type` always references an existing `content_types.key` in the same workspace | Prevents dangling type references | C-409 | Contract test | SPEC-020 feature.spec.md INV-01 |
| INV-02 | `content_types` (this domain) | `key` never equals `'post'`/`'page'` | Preserves the injectivity guarantee SPEC-018 depends on | C-401 | Contract test | SPEC-020 feature.spec.md INV-02 |
| INV-03 | `content_types` (this domain) | `key` and every field name match the grammar | Prevents malformed/injection-shaped identifiers | C-401, C-402 | Contract test | SPEC-020 feature.spec.md INV-03 |
| INV-04 | Index provisioning (this domain) | Field `kind` always in the closed enum; never interpolated into DDL | DDL-injection prevention — this domain's highest-severity property | C-403 | Property test | SPEC-020 feature.spec.md INV-04; see CIC U-001 |
| INV-05 | `entries` (this domain) | `(workspaceId, type, slug)` uniqueness never violated | Prevents duplicate entries | DB unique constraint | DB-level test | SPEC-020 feature.spec.md INV-05 |
| INV-06 | `content_types.status` (this domain) | Never transitions from `tombstone` back | Terminal-state correctness | C-404 | State-transition test | SPEC-020 feature.spec.md INV-06 |
| INV-07 | Cleanup (this domain) | Never runs against a non-tombstone content type | Prevents accidental destructive removal | C-405 | Contract test | SPEC-020 feature.spec.md INV-07 |
| INV-08 | Both write chokepoints (this domain) | Every commit stamps the watermark exactly once | SPEC-016 REQ-02's obligation | C-401, C-402, C-404, C-409, C-410 | Contract test | SPEC-020 feature.spec.md INV-08 |
| INV-09 | Index state (this domain) | A queryable field's index never references a stale `kind`'s CAST mapping | Prevents silently-wrong query results after a kind change | C-403 | Property test | SPEC-020 feature.spec.md INV-09; see CIC U-003 |
| INV-10 | Index state (this domain) | An index exists iff the field currently exists with `queryable=true` | Prevents orphaned or missing indexes after any field-set change | C-403 | Property test | SPEC-020 feature.spec.md INV-10; see CIC U-003 |

## Brownfield / Migration Mapping

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| `posts`/`pages` (existing, untouched) | N/A — explicitly out of scope | Preserve completely unchanged | Direct read of `src/infra/db/schema.ts` and ADR-043's own scope boundary | Zero blast radius; `posts`/`pages`-onto-`entries` migration is a deliberately deferred future decision (OQ-03) |
| `src/features/settings/purge-service.ts` (existing precedent) | `features/content-types/lifecycle.ts`'s deprecate/tombstone transitions (NOT the cleanup step) | Preserve the pattern for lifecycle transitions only | Direct read of `purge-service.ts` | Cleanup itself uses the stricter SPEC-016 gateway, not settings' direct-purge pattern — a deliberate, documented departure for the higher-blast-radius operation |

## Test Expectations

- Contract tests: C-401-C-406, C-409-C-412 (C-407/C-408 are not used — corrected numbering gap, see 2026-07-15 `/audit-work` finding).
- Integration tests: W-402 (index-provisioning delegation to SPEC-017's execution path), W-403 (cleanup gateway).
- Property/invariant tests: INV-01 through INV-10, especially INV-04 (DDL safety, CIC U-001) and INV-09/INV-10 (index-state composition, CIC U-003).
- Characterization tests: N/A.
- Explicitly N/A suites with reason: `posts`/`pages` migration tests — N/A, explicitly deferred (OQ-03).

## Downstream Handoff Notes

- Coordinator task-generation constraints: `features/entries`'s tasks depend on `features/content-types`'s schema-read contract existing first (one-way dependency); both can otherwise proceed independently of SPEC-017/018/019.
- TDD focus: prioritize C-403's DDL-injection property test (CIC U-001) and its REQ-27/29/30 composition property test (CIC U-003) first — these are the highest-severity and highest-complexity units in this entire 4-domain pipeline.
- Programmer architecture audit focus: confirm no DDL-generation code path bypasses the fixed lookup table; confirm the field-update composition logic resolves from post-call state, not three independent branches.
- Open risks or ambiguities: OQ-01 (queryable-field cap) and OQ-02 (cleanup retention window) remain open per their stated owner/deadline (this ADR, before architecture sign-off).
