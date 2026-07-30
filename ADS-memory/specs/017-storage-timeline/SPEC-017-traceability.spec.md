# Traceability Matrix: storage-timeline

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-017 |
| feature_name | FEAT-017-storage-timeline |
| version | 1.3.0 |
| content_hash | sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8 |
| last_edited | 2026-07-15T00:45:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every requirement, acceptance criterion, invariant, and edge case in
`SPEC-017-feature.spec.md` forward to implementation and test coverage. No implementation exists
yet — this spec has not been dispatched to Software Architect or TDD. Every row below is
intentionally `PENDING`. Rows also note which SPEC-016 id they instantiate, where applicable.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Timeline renders every ledger row, reverse-chronological, with restore-point linkage | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Rows ordered reverse-chronological, restore-point label shown | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Drift banner shown when ahead/diverged | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | Banner shown/hidden per drift status | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Drift classified by tag identity, not count | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Equal index, different tag ⇒ diverged | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | storage_query_timeline filter surface, no raw SQL | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-04) | Filtered query returns matching rows only | P2 | pending | pending | pending | pending | PENDING |
| REQ-05 | No raw row edit / SQL console / DB-first mode | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-05) | Full catalog inspected, none of the three exist | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | plan() instantiation: read-only, costClass + estimate | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-06) | Expensive plan includes cost estimate | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-06) | agent/api_key plan() succeeds identically | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | confirm() instantiation follows SPEC-016 REQ-10 with siteId as scopeId | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-07) | Token bound to (planHash, siteId, confirmerPrincipalId), exactly 600s TTL, no jitter | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | execute() ordering + costClass=unavailable refusal, no bypass | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-08) | Unavailable costClass refused, no override honored | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | execute() runs state machine exactly once per token | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-09) | State machine completes once; replay rejected TOKEN_ALREADY_REDEEMED | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Quiesce closes chokepoint, records revisionSeqAtQuiesce from watermark | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-10) | revisionSeqAtQuiesce recorded before SNAPSHOTTING | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | SQLite state machine sequence + failure edges | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-11) | APPLYING failure -> RESTORING -> RESTORED|RESTORE_FAILED | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Postgres blue/green state machine + CUTOVER + failure edges | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-12) | CUTOVER fail -> CUTOVER_FAILED -> ROLLBACK_TO_BLUE | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-12) | Blue keeps serving during APPLYING | P2 | pending | pending | pending | pending | PENDING |
| REQ-13 | SNAPSHOT_FAILED -> ABORTED_SAFE, no restore | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-13) | Snapshot failure skips RESTORING entirely | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | On apply/verify failure: re-snapshot, hand off to Recovery, show disclosure first | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-14) | Disclosure shown before restore confirm; Recovery executes, not Storage | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Boot crash reconciliation: interrupted migration -> ledger row, blocks open | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-15) | Non-terminal row converted, site-open blocked until resolved | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Ledger/migration_runs rows carry scope/siteId/correlationId/restorePointId | — | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-16) | Non-index rows have non-null restorePointId | P1 | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-16) | scope='site', siteId present | P2 | pending | pending | pending | pending | PENDING |
| REQ-17 | storage_ledger/migration_runs/restore_points are SITE_SCOPE_EXEMPT_TABLES | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-17) | All three listed, no workspaceId column | P1 | pending | pending | pending | pending | PENDING |
| REQ-18 | index.provision/drop rows: restorePointId=NULL by design | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-18) | Index-provision row has null restorePointId, no capture invoked | P1 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-18) | Table-shape DDL never classified as index kind | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | Postgres index provisioning uses CREATE INDEX CONCURRENTLY, non-transactional | — | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-19) | CONCURRENTLY used, outside transaction block | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | Free-read agent tools require only storage.read | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-20) | All five read tools succeed with storage.read only | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | plan/execute tools present, agent-callable; no confirm tool | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-21) | Catalog has plan+execute, no confirm-equivalent | P1 | pending | pending | pending | pending | PENDING |
| REQ-22 | backup_create_restore_point: single-call authorize()-gated, costAck required when expensive | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-22) | Missing costAck on expensive site rejected VALIDATION_ERROR | P1 | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-22) | costAck=true on expensive site mints restore point | P2 | pending | pending | pending | pending | PENDING |
| REQ-23 | Agent rollback request receives storage_get_restore_guidance only | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-23) | Only guidance tool present; returns envelope, never executes restore | P1 | pending | pending | pending | pending | PENDING |
| REQ-24 | StorageContextEnvelope unsigned/untrusted, re-verified at each hop | — | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-24) | Stale restorePointId in envelope re-derived, "not found" | P1 | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-24) | authorize() + drift recomputed server-side at each hop | P2 | pending | pending | pending | pending | PENDING |
| REQ-25 | Tier-3 describeTables/readRows redact sensitive columns; never agent-callable | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-25) | describeTables never lists sensitive column | P1 | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-25) | readRows never returns sensitive column value | P1 | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-25) | No agent tool exposes Tier-3 browser | P1 | pending | pending | pending | pending | PENDING |
| REQ-26 | readRows bounded expression language only, orderBy/cursor/limit≤200 | — | pending | pending | pending | pending | PENDING |
| AC-34 (REQ-26) | Bounded predicate accepted; raw SQL text rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-35 (REQ-26) | Missing limit defaults to server ≤200 cap | P2 | pending | pending | pending | pending | PENDING |
| REQ-27 | Tier-3 plugin enabled -> quiesceIntegrity='chokepoint-only', surfaced at confirm | — | pending | pending | pending | pending | PENDING |
| AC-36 (REQ-27) | Flag recorded and surfaced to operator before confirm | P1 | pending | pending | pending | pending | PENDING |
| REQ-28 | Boot auto-migrate when costClass=cheap, attributed to system principal | — | pending | pending | pending | pending | PENDING |
| AC-37 (REQ-28) | Auto-migrate runs no-token, ledger attributes kind='system' | P1 | pending | pending | pending | pending | PENDING |
| REQ-29 | Boot refuses auto-migrate + enters PENDING_MIGRATION when expensive/unavailable | — | pending | pending | pending | pending | PENDING |
| AC-38 (REQ-29) | Site enters PENDING_MIGRATION, admin reachable, public refused | P1 | pending | pending | pending | pending | PENDING |
| REQ-30 | PENDING_MIGRATION never silently resumes public serving | — | pending | pending | pending | pending | PENDING |
| AC-39 (REQ-30) | Public serving refused until execute() success or costClass becomes cheap | P1 | pending | pending | pending | pending | PENDING |
| AC-40 (REQ-12) | Postgres RESTORING (green-discard) itself fails -> RESTORE_FAILED, blue unaffected | P1 | pending | pending | pending | pending | PENDING |
| AC-41 (REQ-08) | Unauthorized caller + already-redeemed token -> FORBIDDEN, not TOKEN_ALREADY_REDEEMED (SPEC-016 REQ-11 authorize()-before-token-state ordering instantiation) | P1 | pending | pending | pending | pending | PENDING |
| AC-42 (REQ-08) | Agent execute() re-evaluates delegator's live grant, revoked-between-confirm-and-execute denies with FORBIDDEN (SPEC-016 REQ-15 instantiation) | P1 | pending | pending | pending | pending | PENDING |

<!-- All REQ-* and AC-* rows above are copied from SPEC-017-feature.spec.md. -->

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | A migration_runs row must never enter SNAPSHOTTING before QUIESCING completes | pending | pending | PENDING |
| INV-02 | A non-index ledger row must always reference an existing restore_points row at creation | pending | pending | PENDING |
| INV-03 | index.provision/drop rows must never carry a non-null restorePointId | pending | pending | PENDING |
| INV-04 | A PENDING_MIGRATION site must never silently resume public serving | pending | pending | PENDING |
| INV-05 | A Postgres migration must never apply in-place against the serving (blue) schema | pending | pending | PENDING |
| INV-06 | quiesceIntegrity must never be anything other than 'chokepoint-only' or absent | pending | pending | PENDING |
| INV-07 | Tier-3 browser must never return a sensitive:true column's value, any tier | pending | pending | PENDING |
| INV-08 | evaluateBootMigrationPolicy must never run while a non-terminal migration_runs row exists; reconcileInterruptedMigrationOnBoot (REQ-15) must always resolve or block first | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Migration confirmed but site drifts to diverged before execute() | pending | pending | PENDING |
| EC-02 | Tier-3 plugin writes directly during QUIESCING | pending | pending | PENDING |
| EC-03 | Postgres CUTOVER fails after validated green schema | pending | pending | PENDING |
| EC-04 | Restore-point capture requested when costClass=unavailable | pending | pending | PENDING |
| EC-05 | Tier-3 readRows where-clause references a sensitive column | pending | pending | PENDING |
| EC-06 | Boot: content.db opens but sidecar migration_runs table missing/unreadable | pending | pending | PENDING |
| EC-07 | costClass improves from unavailable/expensive to cheap between boots | pending | pending | PENDING |
| EC-08 | Tier-3 plugin later disabled after a migration ran while it was enabled | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| SCHEMA_DRIFT_DIVERGED | pending | pending | pending | PENDING |
| RESTORE_POINT_UNAVAILABLE | pending | pending | pending | PENDING |
| TIER3_DISABLED | pending | pending | pending | PENDING |
| MIGRATION_ALREADY_IN_FLIGHT | pending | pending | pending | PENDING |
| PLAN_STALE (SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_EXPIRED (SPEC-016) | pending | pending | pending | PENDING |
| TOKEN_ALREADY_REDEEMED (SPEC-016) | pending | pending | pending | PENDING |
| FORBIDDEN (SPEC-016) | pending | pending | pending | PENDING |
| UNAUTHENTICATED (SPEC-016) | pending | pending | pending | PENDING |
| VALIDATION_ERROR (SPEC-016) | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED (SPEC-016) | pending | pending | pending | PENDING |
| WATERMARK_BASELINE_UNAVAILABLE (SPEC-016) | pending | pending | pending | PENDING |
| INTERNAL_ERROR (SPEC-016) | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Drift classification: tag identity vs. version index | § 1.1 | pending | pending | PENDING |
| Boot policy: cost-gated auto-migrate vs. PENDING_MIGRATION | § 1.2 | pending | pending | PENDING |
| Migrate state machine ordering (SQLite) | § 2.1 | pending | pending | PENDING |
| Migrate state machine ordering (Postgres) | § 2.2 | pending | pending | PENDING |
| Failure-edge ordering | § 2.3 | pending | pending | PENDING |
| Boot-sequence ordering: crash reconciliation vs. cost-gated auto-migrate policy | § 2.4 | pending | pending | PENDING |
| Default: quiesceIntegrity = null (full integrity) | § 3 | pending | pending | PENDING |
| Default: costEstimate null unless expensive | § 3 | pending | pending | PENDING |
| Default: site.servingStatus = SERVING | § 3 | pending | pending | PENDING |
| Default: Tier-3 flag = false | § 3 | pending | pending | PENDING |
| Limit: Tier-3 page size ≤200 | § 4 | pending | pending | PENDING |
| Limit: concurrent migrations per site = 1 | § 4 | pending | pending | PENDING |
| Dedup: concurrent execute() on same site rejected | § 5 | pending | pending | PENDING |
| Edge case: drift to diverged before execute() | § 7 | pending | pending | PENDING |
| Edge case: Tier-3 plugin writes during QUIESCING | § 7 | pending | pending | PENDING |
| Edge case: Postgres CUTOVER fails post-verify | § 7 | pending | pending | PENDING |
| Edge case: restore-point capture when unavailable | § 7 | pending | pending | PENDING |
| Edge case: readRows references sensitive column | § 7 | pending | pending | PENDING |
| Edge case: sidecar migration_runs table missing at boot | § 7 | pending | pending | PENDING |
| Edge case: costClass improves between boots | § 7 | pending | pending | PENDING |
| Edge case: Tier-3 plugin disabled after historical migration | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ/AC rows above | This is a spec-stage artifact; Software Architect and TDD have not yet been dispatched for SPEC-017 | Upon Software Architect/TDD dispatch for SPEC-017 | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ/AC rows above | No implementation exists yet to test | Upon SPEC-017 TDD dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All error codes above | No implementation exists yet to test | Upon SPEC-017 TDD dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| REQ-28 – REQ-30 (concrete file edit) | Follow-up against `ADS-memory/specs/003-site-install-dir/` | The behavior these requirements specify is in-scope for this spec, but the mechanical edit of that pre-existing file's `SERVE_SITE` row/status lifecycle is a separate follow-up action, not this spec's own implementation surface (see feature.spec.md Out of scope) | Spec Agent (this dispatch), pending Coordinator confirmation |
| Tier-3 browser (REQ-25/REQ-26) shipping phase | Software Architect scheduling decision | OQ-05 leaves whether Tier-3 ships alongside the Timeline/migrate ceremony, or later, unresolved | Not yet approved — open |

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
- [x] All error codes from errors.spec.md (plus reused SPEC-016 codes) appear in the Section 4 matrix
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
