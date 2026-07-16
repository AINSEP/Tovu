# Traceability Matrix: content-admin-core-contract

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-016 |
| feature_name | FEAT-016-content-admin-core-contract |
| version | 1.4.0 |
| content_hash | sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f |
| last_edited | 2026-07-15T05:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every requirement, acceptance criterion, invariant, and edge case in
`SPEC-016-feature.spec.md` forward to implementation and test coverage. No implementation exists
yet — this spec has not been dispatched to Software Architect or TDD. Every row below is
intentionally `PENDING`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Global monotonic `storage_write_watermark` counter, same-transaction stamped (both SQLite type/atomicity and Postgres `BIGINT` type/MVCC-atomicity self-defined here, not delegated to SPEC-017) | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Watermark advances by 1 atomically with the stamping transaction (SQLite-backed site) | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | Stamping outside an open transaction is rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-39 (REQ-01) | Watermark advances by 1 atomically with the stamping transaction (Postgres-backed site, post-migrate-forward) | P1 | pending | pending | pending | pending | PENDING |
| AC-40 (REQ-01) | Concurrent Postgres transactions incrementing the watermark are serialized by row-locking; no increment is lost | P2 | pending | pending | pending | pending | PENDING |
| REQ-02 | Core write chokepoints call the stamping function in their own transaction | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | Collections/Taxonomy write-service stamps watermark in same transaction | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Sidecar mirror of the watermark, refreshed by next reconciliation opportunity (boot/periodic tick) after a watermark-changing commit | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Mirror refreshed to match by the next reconciliation opportunity after a watermark-changing commit | P2 | pending | pending | pending | pending | PENDING |
| REQ-04 | Boot reconciliation pulls the mirror from content.db directly | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Boot sets mirror to content.db's authoritative value, never from storage_ledger | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Unopenable content.db renders disclosure as unknown/lower-bound | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-05) | Disclosure has no precise count when content.db can't open | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | restore_points rows persist watermarkAtCapture | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-06) | Restore point row includes non-null watermarkAtCapture | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Disclosure labeled partial, never exhaustive | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-07) | Disclosure states partial coverage explicitly | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | plan/confirm/execute gateway, no direct entry point | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-08) | Direct mutation call with no plan/confirm fails | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | plan() read-only, `{domain}.read`, any principal kind | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-09) | plan() succeeds with read permission, no state change | P1 | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-09) | plan() succeeds identically for user/agent/api_key | P2 | pending | pending | pending | pending | PENDING |
| REQ-10 | confirm() user-only, authorize() at mint, mints TTL'd token | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-10) | Agent calling confirm() is rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-10) | User without permission calling confirm() is rejected, no token | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-10) | Authorized user confirm() mints token with exact 600s TTL, bound fields | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | execute() re-runs authorize() fresh, then recomputes plan hash | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-11) | authorize() evaluated fresh before token-state check | P1 | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-11) | Plan hash mismatch rejects before mutation | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Hash mismatch -> PLAN_STALE before mutation | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-12) | PLAN_STALE returned, no durable mutation | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | Actor-class redemption rule enforced | — | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-13) | User redeeming another user's token rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-13) | Agent redeeming token not from its delegator rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-13) | Agent redeeming its delegator's token succeeds | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | authorize() before idempotency short-circuit (restatement of an ADR-021-owned authorize() ordering property) | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-14) | Unauthorized replay of idempotency key never discloses duplicate | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Agent effective permission = live grant ∩ delegator intersection | — | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-15) | Delegator permission change reflected at execute-time re-evaluation | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Composite (actorWorkspaceId, actorId) [+ delegatedBy] on every ledger row | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-16) | Ledger/audit row carries composite actor identity pair | P1 | pending | pending | pending | pending | PENDING |
| REQ-17 | Cross-physical-boundary actor identity is a soft value-join, not a DB FK | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-17) | Sidecar-journal actor pair has no DB-level FK, populated by core write path | P1 | pending | pending | pending | pending | PENDING |
| REQ-18 | Soft cross-boundary references validated at write, tolerant on read, swept | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-18) | Orphaned soft reference omitted on read, not an error | P1 | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-18) | Reconciliation sweep removes orphaned soft-reference rows | P1 | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-18) | Write chokepoint validates referenced entity existence/ownership, not just trusts caller | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | db-ops getCapabilities() returns costClass + kind | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-19) | SQLite site reports costClass=cheap, kind=file-snapshot | P1 | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-19) | Postgres site with no tooling reports costClass=unavailable | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | SQLite restore-point capture = online-backup whole-file copy | — | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-20) | SQLite capture produces whole-file copy, not partial/logical export | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | Postgres restore-point capture = pg_dump -Fc + blue/green repoint | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-21) | Postgres capture = pg_dump -Fc; restore = blue/green repoint, never in-place | P1 | pending | pending | pending | pending | PENDING |
| REQ-22 | Agent-tool catalog: plan/execute callable, confirm never | — | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-22) | Catalog has plan/execute tools, no confirm tool | P1 | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-19) | Postgres site with configured tooling reports costClass=expensive, kind=logical-dump | P1 | pending | pending | pending | pending | PENDING |
| AC-34 (REQ-02) | Dependent domain's Integration Contracts section names every watermark-stamping write chokepoint | P2 | pending | pending | pending | pending | PENDING |
| AC-35 (REQ-11) | Unrecognized/forged confirmationToken returns TOKEN_EXPIRED, never a distinct code | P1 | pending | pending | pending | pending | PENDING |
| AC-36 (REQ-19) | Postgres site with tooling configured but non-functional reports costClass=unavailable | P2 | pending | pending | pending | pending | PENDING |
| AC-37 (REQ-19) | Site with only an externally-managed PITR/backup mechanism reports kind=external, costClass=unavailable | P2 | pending | pending | pending | pending | PENDING |
| AC-38 (REQ-13) | Actor-class mismatch AND stale plan both present -> FORBIDDEN, never PLAN_STALE (actor-class checked first) | P1 | pending | pending | pending | pending | PENDING |

<!-- All REQ-* and AC-* rows above are copied from SPEC-016-feature.spec.md. -->

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | storage_write_watermark's stored value must never decrease | pending | pending | PENDING |
| INV-02 | restore_points.watermarkAtCapture must never exceed the live watermark at write time | pending | pending | PENDING |
| INV-03 | A confirmation token must never be redeemed more than once | pending | pending | PENDING |
| INV-04 | A confirmation token must never be minted without the permission already held | pending | pending | PENDING |
| INV-05 | authorize() must never be bypassed or run after an idempotency short-circuit | pending | pending | PENDING |
| INV-06 | Composite actor-identity pair must match the referencing row's own workspace, unless documented exempt | pending | pending | PENDING |
| INV-07 | An orphaned soft cross-boundary reference must never fail a read with an error | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Concurrent watermark increment race (SQLite WAL serialization; Postgres MVCC/row-locking serialization — both self-defined here, not delegated to SPEC-017) | pending | pending | PENDING |
| EC-02 | Agent principal calls confirm() directly | pending | pending | PENDING |
| EC-03 | execute() called with valid token but drifted live state | pending | pending | PENDING |
| EC-04 | Delegator disabled between confirm() and execute() | pending | pending | PENDING |
| EC-05 | content.db cannot be opened at boot | pending | pending | PENDING |
| EC-06 | Restore point predates watermarkAtCapture column | pending | pending | PENDING |
| EC-07 | api_key principal redeems token confirmed by a different user | pending | pending | PENDING |
| EC-08 | User principal redeems another user's token | pending | pending | PENDING |
| EC-09 | execute() called with a confirmationToken string never issued by this contract | pending | pending | PENDING |
| EC-10 | Redemption fails actor-class rule AND recomputed plan would also be stale | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| PLAN_STALE | pending | pending | pending | PENDING |
| TOKEN_EXPIRED | pending | pending | pending | PENDING |
| TOKEN_ALREADY_REDEEMED | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| UNAUTHENTICATED | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED | pending | pending | pending | PENDING |
| WATERMARK_BASELINE_UNAVAILABLE | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| authorize() vs. idempotency precedence | § 1.1 | pending | pending | PENDING |
| Watermark source of truth vs. sidecar mirror | § 1.2 | pending | pending | PENDING |
| Gated-mutation step ordering | § 2.1 | pending | pending | PENDING |
| authorize() re-evaluation ordering within execute() | § 2.2 | pending | pending | PENDING |
| Default: confirmation token TTL = exactly 600 seconds (10 minutes), no jitter | § 3 | pending | pending | PENDING |
| Default: watermark initial value = 0 | § 3 | pending | pending | PENDING |
| Default: mirror.staleness initial value = 'fresh' | § 3 | pending | pending | PENDING |
| Limit: token redemption count = exactly 1 | § 4 | pending | pending | PENDING |
| Limit: watermark per-transaction increment = exactly 1 | § 4 | pending | pending | PENDING |
| Edge case: second confirm() before first token resolved | § 7 | pending | pending | PENDING |
| Edge case: execute() at exact TTL boundary | § 7 | pending | pending | PENDING |
| Edge case: authorize() denies and token also expired | § 7 | pending | pending | PENDING |
| Edge case: mirror never initialized | § 7 | pending | pending | PENDING |
| Edge case: restore point predates watermarkAtCapture | § 7 | pending | pending | PENDING |
| Edge case: watermark-stamping function called twice in one transaction | § 7 | pending | pending | PENDING |
| Edge case: execute() called with a never-issued confirmationToken (unknown/forged) | § 7 | pending | pending | PENDING |
| Edge case: actor-class mismatch AND recomputed plan also stale — FORBIDDEN wins (actor-class checked first) | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ/AC rows above | This is a spec-stage artifact; Software Architect and TDD have not yet been dispatched for SPEC-016 | Upon SPEC-017/SPEC-019 implementation (this contract is realized through the dependent domain specs, not its own standalone codebase) | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ/AC rows above | No implementation exists yet to test | Upon SPEC-017/SPEC-019 TDD dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All error codes above | No implementation exists yet to test | Upon SPEC-017/SPEC-019 TDD dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | No requirement in this spec is deferred — every REQ/AC here is in-scope for the core contract itself, even though its concrete implementation lands inside the dependent domain specs' codebases | — |

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
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — all
      entries here are explicitly "pending implementation," not deferred/skipped
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — not
      applicable yet; no row has reached VERIFIED status

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
