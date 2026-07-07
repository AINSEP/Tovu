# Traceability Matrix: Admin Command Gateway — Auditable, Undoable Mutations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
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
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Gateway single write path with fixed ordering; one applied single-item change set per execution | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Post edit records exactly one applied change set with one item; appliedAt == createdAt | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Change-set header and item field persistence | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | Item carries entityType/entityId/operation/inversePayload/entityVersionAtApply | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Duplicate idempotency key rejected without execution | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Same key, same workspace ⇒ DUPLICATE_COMMAND with original changeSetId | P1 | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Same key, different workspace ⇒ executes normally | P2 | pending | pending | pending | pending | PENDING |
| REQ-04 | Post update route through gateway; response contract preserved; Idempotency-Key header | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | PUT posts success response shape unchanged; change set recorded | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Duplicate Idempotency-Key on PUT posts ⇒ 409 DUPLICATE_COMMAND; post unchanged | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Presentation patch through gateway; PresentationSettingsRecord gains version | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Two patches ⇒ version 2 then 3; inverse holds prior activeThemeId | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | List and get change-set endpoints, workspace-scoped | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | List returns own workspace newest-first | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-06) | Get returns header+items; unknown id ⇒ 404 CHANGE_SET_NOT_FOUND | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | Revert applies inverses reverse-order via registry; status/revertedAt updated | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-07) | Revert restores post fields; version +1; status reverted | P1 | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-07) | Second revert ⇒ 409 CHANGE_SET_INVALID_STATUS | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Version guard refuses stale revert | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-08) | Later edit ⇒ revert of earlier change set ⇒ 409 REVERT_CONFLICT | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | change-set.applied / change-set.reverted events with workspaceId/actorId/changeSetId | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-09) | Outbox contains both events with required envelope fields | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Null inversePayload ⇒ revert refused | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-10) | Revert of non-revertible item ⇒ 422 REVERT_NOT_POSSIBLE | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Failed execution records nothing | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-11) | Validation failure ⇒ no change set, no event | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Fixed local actor until identity feature | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-12) | actorId == "user-local" on every change set | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | Mutation ⇔ exactly one change set; never one without the other | pending | pending | PENDING |
| INV-02 | Status transitions only applied → reverted; reverted terminal | pending | pending | PENDING |
| INV-03 | Gateway events always carry workspaceId, actorId, changeSetId | pending | pending | PENDING |
| INV-04 | Entity version never decreases; revert writes a higher version | pending | pending | PENDING |
| INV-05 | Revert never partially applies | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Revert an already-reverted change set | pending | pending | PENDING |
| EC-02 | Revert unknown change-set id | pending | pending | PENDING |
| EC-03 | Entity deleted before revert | pending | pending | PENDING |
| EC-04 | Feature call throws after inverse capture | pending | pending | PENDING |
| EC-05 | captureInverse returns null | pending | pending | PENDING |
| EC-06 | No applier registered at revert time | pending | pending | PENDING |
| EC-07 | Concurrent same-key commands (single-process serialization) | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| DUPLICATE_COMMAND | pending | pending | pending | PENDING |
| CHANGE_SET_NOT_FOUND | pending | pending | pending | PENDING |
| CHANGE_SET_INVALID_STATUS | pending | pending | pending | PENDING |
| REVERT_CONFLICT | pending | pending | pending | PENDING |
| REVERT_NOT_POSSIBLE | pending | pending | pending | PENDING |
| VALIDATION_ERROR | existing features (unchanged) | pending | pending | PENDING |
| INTERNAL_ERROR | route catch-all (unchanged) | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| BR-01 idempotency check first | § 1 | pending | pending | PENDING |
| BR-02 inverse captured before execute | § 1 | pending | pending | PENDING |
| BR-03 failed execute records nothing | § 1 | pending | pending | PENDING |
| BR-04 record then enqueue; enqueue failure non-rolling-back | § 1 | pending | pending | PENDING |
| BR-05 revert precondition order | § 2 | pending | pending | PENDING |
| BR-06 strict version equality guard | § 2 | pending | pending | PENDING |
| BR-07 descending position order | § 2 | pending | pending | PENDING |
| BR-08 restore increments version | § 2 | pending | pending | PENDING |
| BR-09 status/revertedAt then event | § 2 | pending | pending | PENDING |
| DUP-01 duplicate definition | § 5 | pending | pending | PENDING |
| TB-01 list ordering tie-break | § 6 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | — | — | — |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|-----------------|-------------------|-------|
| — | — | — | — |

---

## 7. Untraced Requirements

(none)
