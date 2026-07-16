# Traceability Matrix: backups-recovery

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-019 |
| feature_name | FEAT-019-backups-recovery |
| version | 1.1.0 |
| content_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d |
| last_edited | 2026-07-14T23:30:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every requirement, acceptance criterion, invariant, and edge case in
`SPEC-019-feature.spec.md` forward to implementation and test coverage. No implementation exists yet — this
spec has not been dispatched to Software Architect or TDD. Every row below is intentionally `PENDING`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Recovery is a distinct screen, never a tab within Storage | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Route `/admin/recovery` renders independent of Storage | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | No inline tab/toggle switches Storage into Recovery | P2 | pending | pending | pending | pending | PENDING |
| REQ-02 | Permission gating: backup.read/create/restore | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | backup.read holder sees list/status but no mutating control | P1 | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-02) | Missing backup.create rejects restore-point creation | P1 | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-02) | Missing backup.restore rejects confirm/execute | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Capability/status bar (costClass + in-flight) | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-03) | costClass=expensive shows cost/disk acknowledgment gate | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-03) | In-flight migration shows status-bar indicator | P2 | pending | pending | pending | pending | PENDING |
| REQ-04 | Restore-points list contents + ordering | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-04) | List newest-first with all required row fields | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-04) | template-upgrade trigger label distinguishable | P2 | pending | pending | pending | pending | PENDING |
| REQ-05 | Restore-point creation is an ordinary mutation | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-05) | Create succeeds without plan/confirm/token | P1 | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-05) | authorize() runs before idempotency short-circuit | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | Restore = SPEC-016 gateway instantiation (domain=backup, action=restore) | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-06) | Restore flow is exactly plan/confirm/execute, no direct endpoint | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | plan() preview contents | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-07) | plan() returns target schema, quiesceIntegrity, cost/disk estimate | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Blocking disclosure required before confirm() | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-08) | confirm() control disabled until disclosure acknowledged | P1 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-08) | Acknowledged disclosure allows confirm() to proceed | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Disclosure covered-categories restriction | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-09) | Disclosure lists only posts/pages + plugin-table categories | P1 | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-09) | Collections entries omitted until write path confirmed stamped | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Acknowledge control requires caveat-text acknowledgment | — | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-10) | Acknowledge label includes partial-coverage caveat text | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Watermark-baseline-unavailable rendering rule | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-11) | content.db unopenable renders unknown estimate, states so plainly | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | costClass unavailable degraded mode | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-12) | Unavailable costClass -> read-only markers + runbook pointer | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | Operation-in-flight cross-screen block | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-13) | Restore in flight disables Storage's migrate action | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-13) | Migration in flight disables Recovery's restore action | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Progress read from sidecar journal, refresh-safe | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-14) | Page refresh mid-restore resumes correct live state | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Progress panel state machine, non-dismissable | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-15) | No dismiss control during non-terminal states | P1 | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-15) | Dismissable once RESTORED/RESTORE_FAILED reached | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Completion deep-link back to Storage Timeline | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-16) | Completion view includes Storage Timeline deep-link | P1 | pending | pending | pending | pending | PENDING |
| REQ-17 | PENDING_MIGRATION banner deep-links to Storage only | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-17) | Banner's single action deep-links to Storage migration ceremony | P1 | pending | pending | pending | pending | PENDING |
| REQ-18 | Restore doesn't clear PENDING_MIGRATION | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-18) | PENDING_MIGRATION unchanged after a successful restore | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | migration.interrupted surfaced with single unblock action | — | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-19) | Interrupted event shown at top with accepted-downtime copy | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | StorageContextEnvelope consumption + server-side re-lookup | — | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-20) | Envelope restorePointId re-looked-up server-side before render | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | Stale/forged envelope id -> not-found/re-derive fallback | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-21) | Unresolvable restorePointId renders unfocused fallback list | P1 | pending | pending | pending | pending | PENDING |
| REQ-22 | No raw row-edit/SQL console; Tier-3 browser lives under Storage | — | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-22) | No such affordance present anywhere on Recovery screen | P1 | pending | pending | pending | pending | PENDING |
| REQ-23 | Agent tools: backup_plan_restore + backup_execute_restore, no confirm tool | — | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-23) | Catalog has both tools, no confirm-step tool | P1 | pending | pending | pending | pending | PENDING |
| REQ-24 | Agent tool: backup_create_restore_point | — | pending | pending | pending | pending | PENDING |
| AC-34 (REQ-24) | Tool present, agent-callable, requires backup.create, unwrapped | P1 | pending | pending | pending | pending | PENDING |
| REQ-25 | Agent tools: read-only list/capabilities | — | pending | pending | pending | pending | PENDING |
| AC-35 (REQ-25) | Both read tools succeed with no durable state change | P1 | pending | pending | pending | pending | PENDING |
| REQ-26 | Uniform ceremony regardless of costClass | — | pending | pending | pending | pending | PENDING |
| AC-36 (REQ-26) | costClass=cheap still requires full plan/confirm/execute | P1 | pending | pending | pending | pending | PENDING |
| REQ-27 | Supersedes pre-ADR-041 /admin/backups + /admin/database | — | pending | pending | pending | pending | PENDING |
| AC-37 (REQ-27) | No /admin/backups nav entry remains; routes to /admin/recovery | P1 | pending | pending | pending | pending | PENDING |
| AC-38 (REQ-27) | Only Tier-3 browser (under Storage) remains of /admin/database | P2 | pending | pending | pending | pending | PENDING |

<!-- All REQ-* and AC-* rows above are copied from SPEC-019-feature.spec.md. -->

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | No enabled Restore action when costClass is unavailable | pending | pending | PENDING |
| INV-02 | Disclosure never skipped/pre-checked/auto-acknowledged before confirm() reachable | pending | pending | PENDING |
| INV-03 | No restore-point row presented restorable while an operation is in flight | pending | pending | PENDING |
| INV-04 | StorageContextEnvelope's carried id never treated as authoritative without server re-lookup | pending | pending | PENDING |
| INV-05 | Disclosure never asserts a count for a non-watermark-stamped category | pending | pending | PENDING |
| INV-06 | No confirm()-equivalent call reachable through the agent-tool catalog | pending | pending | PENDING |
| INV-07 | PENDING_MIGRATION banner action never routes to a Recovery restore-flow action | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Recovery opened while a Storage migration is in flight | pending | pending | PENDING |
| EC-02 | Restore point predates watermarkAtCapture column | pending | pending | PENDING |
| EC-03 | Deep-link envelope's restorePointId no longer exists | pending | pending | PENDING |
| EC-04 | Agent redeems a token not matching its delegatedBy | pending | pending | PENDING |
| EC-05 | costClass transitions cheap -> unavailable mid-flow | pending | pending | PENDING |
| EC-06 | migration.interrupted and PENDING_MIGRATION both present at boot | pending | pending | PENDING |
| EC-07 | Successful restore while site was in PENDING_MIGRATION | pending | pending | PENDING |
| EC-08 | Watermark baseline unavailable at disclosure-compute time | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| RESTORE_POINT_NOT_FOUND | pending | pending | pending | PENDING |
| RESTORE_OPERATION_IN_FLIGHT | pending | pending | pending | PENDING |
| COST_CLASS_UNAVAILABLE | pending | pending | pending | PENDING |
| DEEP_LINK_TARGET_NOT_FOUND | pending | pending | pending | PENDING |
| PLAN_STALE (reused from SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_EXPIRED (reused from SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_ALREADY_REDEEMED (reused from SPEC-016) | pending | pending | pending | PENDING |
| FORBIDDEN (reused from SPEC-016) | pending | pending | pending | PENDING |
| UNAUTHENTICATED (reused from SPEC-016) | pending | pending | pending | PENDING |
| VALIDATION_ERROR (reused from SPEC-016) | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED (reused from SPEC-016) | pending | pending | pending | PENDING |
| WATERMARK_BASELINE_UNAVAILABLE (reused from SPEC-016) | pending | pending | pending | PENDING |
| INTERNAL_ERROR (reused from SPEC-016) | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Degraded-state banner precedence | § 1.1 | pending | pending | PENDING |
| Disclosure-acknowledgment vs. confirm-reachability | § 1.2 | pending | pending | PENDING |
| Restore-flow step ordering | § 2.1 | pending | pending | PENDING |
| onBeforePlanRestore vs. costClass re-check ordering | § 2.2 | pending | pending | PENDING |
| Default: restoreFlow.step = 'idle' | § 3 | pending | pending | PENDING |
| Default: capabilities.operationInFlight = false | § 3 | pending | pending | PENDING |
| Default: disclosureAcknowledged = false | § 3 | pending | pending | PENDING |
| Default: restore-point creation trigger = 'manual' | § 3 | pending | pending | PENDING |
| Limit: restore-points list page size | § 4 | pending | pending | PENDING |
| Limit: concurrent in-flight operations = exactly 1 | § 4 | pending | pending | PENDING |
| Limit: confirmation token TTL (inherited from SPEC-016) | § 4 | pending | pending | PENDING |
| Edge case: costClass transitions mid-flow | § 7 | pending | pending | PENDING |
| Edge case: migration.interrupted + PENDING_MIGRATION both true | § 7 | pending | pending | PENDING |
| Edge case: successful restore during PENDING_MIGRATION | § 7 | pending | pending | PENDING |
| Edge case: restore point predates watermarkAtCapture | § 7 | pending | pending | PENDING |
| Edge case: watermark baseline unreadable at compute time | § 7 | pending | pending | PENDING |
| Edge case: deep-link restorePointId no longer resolves | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ/AC rows above | This is a spec-stage artifact; Software Architect and TDD have not yet been dispatched for SPEC-019 | Upon SPEC-019 implementation, after SPEC-016's contract is implemented | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ/AC rows above | No implementation exists yet to test | Upon SPEC-019 TDD dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All error codes above | No implementation exists yet to test | Upon SPEC-019 TDD dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | No requirement in this spec is deferred — every REQ/AC here is in-scope for the Recovery screen itself | — |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — all entries here are
      explicitly "pending implementation," not deferred/skipped
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — not applicable yet; no
      row has reached VERIFIED status

**[ ] TRACEABILITY COMPLETE** — not yet; this is a spec-stage package, pending implementation.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14 | Seeded matrix from feature.spec.md; all rows PENDING |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
