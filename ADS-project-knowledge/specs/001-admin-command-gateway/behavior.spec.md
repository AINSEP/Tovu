# Behavior Rules Spec: Admin Command Gateway — Auditable, Undoable Mutations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-001 |
| feature_name | FEAT-001-admin-command-gateway |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-02T20:45:00Z |

**Purpose:** Deterministic ordering and precedence rules for the gateway and revert executor. All rules use EARS syntax.

---

## 1. Gateway Execution Ordering (BR-01…BR-04)

- BR-01: WHEN a command arrives with an idempotency key, the gateway shall check `(workspaceId, idempotencyKey)` uniqueness BEFORE capturing any inverse and BEFORE executing the mutation.
- BR-02: The gateway shall capture the inverse snapshot BEFORE executing the mutation, and shall not re-read the snapshot afterward.
- BR-03: IF the wrapped feature execution throws, THEN the gateway shall persist no change-set rows and enqueue no events, and shall rethrow the original error unmodified.
- BR-04: WHEN the mutation succeeds, the gateway shall persist the change-set header and item in the same logical step, then enqueue `change-set.applied`; event enqueue failure shall not roll back the recorded change set (outbox is best-effort in v1; rows are the source of truth).

## 2. Revert Ordering and Guard Precedence (BR-05…BR-09)

- BR-05: WHEN revert is requested, the executor shall evaluate preconditions in this order: (1) change set exists in workspace, (2) status is `applied`, (3) every item has a registered applier, (4) every item has a non-null `inversePayload`, (5) every item passes the version guard. The FIRST failing precondition determines the error code; no entity write occurs during evaluation.
- BR-06: The version guard shall compare the entity's CURRENT version to the item's `entityVersionAtApply` using strict equality; a missing entity or missing current version shall fail the guard (maps to `REVERT_CONFLICT`).
- BR-07: WHILE applying inverses, the executor shall walk items in strictly descending `position` order.
- BR-08: WHEN an inverse is applied, the restoring write shall increment the entity version by exactly 1 (never restore the old version number) and refresh `updatedAt` from the clock.
- BR-09: WHEN all inverses are applied, the executor shall set status `reverted` and `revertedAt`, then enqueue `change-set.reverted`.

## 3. Default Values

| Field | Default | Why |
|---|---|---|
| `ChangeSetRecord.status` (gateway path) | `applied` | ADR-008 §4: direct mutations are auto-applied single-item change sets; `proposed` is unreachable until the plans feature |
| `ChangeSetRecord.appliedAt` | `createdAt` | Auto-applied — application is the creation moment |
| `ChangeSetItemRecord.position` | `0` | v1 change sets are single-item |
| `actorId` | `"user-local"` | REQ-12 — fixed local principal until identity lands |
| `Idempotency-Key` header | absent ⇒ no idempotency check | Existing human-driven shells don't send keys; agents will be required to |

## 4. Limits and Bounds

| Constraint | Value | Enforcement |
|---|---:|---|
| Items per change set (v1) | exactly 1 | `executeCommand` constructs the single item; multi-item arrives with plans feature |
| `Idempotency-Key` length | ≤ 200 chars | route layer validation; longer ⇒ `VALIDATION_ERROR` |
| `summary` length | 1…500 chars | gateway validation; empty ⇒ programming error (thrown) |

## 5. Deduplication Rules

- DUP-01: Two commands are duplicates iff they share the same `workspaceId` AND the same non-null `idempotencyKey`. Identical payloads with different keys (or no keys) are NOT duplicates.

## 6. Tie-Break Logic

- TB-01: `listByWorkspace` shall order by `createdAt` descending; WHEN two records share `createdAt`, the executor shall order by `id` descending for determinism.

## 7. Edge Case Handling (EARS)

- IF revert is requested for a change set in status `reverted`, THEN the system shall respond `CHANGE_SET_INVALID_STATUS` and write nothing (EC-01).
- IF the referenced entity does not exist at revert time, THEN the version guard shall fail and the system shall respond `REVERT_CONFLICT` (EC-03).
- IF `captureInverse` returns null, THEN the gateway shall record the item with null `inversePayload` and the change set shall be permanently non-revertible (EC-05).
- IF no applier is registered for `(entityType, operation)` at revert time, THEN the system shall respond `REVERT_NOT_POSSIBLE` before touching any entity (EC-06).
- WHEN two requests race on the same fresh idempotency key in the single-process dev server, the event-loop-serialized second request shall receive `DUPLICATE_COMMAND` (EC-07).
