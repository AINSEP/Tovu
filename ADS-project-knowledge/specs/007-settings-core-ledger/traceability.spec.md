# Traceability Matrix: Settings (Core-Only Layered Ledger)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-007 |
| feature_name | FEAT-007-settings-core-ledger |
| version | 0.2.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-11T19:10:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC and error code from the package to its implementation and
test. At spec stage all impl/test cells are "pending" (TDD has not run).

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Settings persist in dedicated tables, never `entries` | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Write lands only in `setting_values_*`, never `entries` | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | registerDefinitions with owner fence | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | Core def in `core.presentation.*` registers | P1 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | Site def in `core.foo` rejected DEFINITION_INVALID | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Resolver precedence + totality + alias | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Global-only value returned for user ctx | P1 | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-03) | No layer → validated default | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-03) | Old key resolves alias-transparently | P1 | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-03) | Stale def_version coerced in memory, no write-back | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Single write chokepoint value+revision same tx | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-04) | One value row + one op='set' revision, same tx | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-04) | Unauthorized set → FORBIDDEN, no rows | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Definition lifecycle via chokepoint | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-05) | Rename after retype → v1 alias marker | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-05) | Rename+retype one op → RENAME_RETYPE_CONFLICT | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | Full settings.* permission catalog | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-06) | ws.write holder can't set global → FORBIDDEN | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Ledgered purge service, FK RESTRICT | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-07) | Purge appends op='purge' redacted revisions | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-07) | Raw workspace delete blocked by RESTRICT | P2 | pending | pending | pending | pending | PENDING |
| REQ-08 | Retire PresentationSettingsRepoPort | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-08) | Active theme served from core.presentation.activeThemeId | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Reject secret:true | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-09) | secret:true → SECRET_NOT_SUPPORTED | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Admin API gated by settings.* | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-10) | Endpoint without permission → 403 | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Settings admin screen | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-11) | Screen shows effective + per-layer + default | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-11) | Save shows new effective + records revision | P2 | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-11) | user.write holder sets another principal's user layer | P2 | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-11) | No user.write → no selector; direct write FORBIDDEN | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Per-layer cache + workspace-qualified def cache | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-12) | Global write invalidates one key, no fan-out | P2 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-12) | Def cache never leaks across workspaces | P2 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | No value row without same-tx revision | pending | pending | PENDING |
| INV-02 | getEffective total for live key (never throws/undefined) | pending | pending | PENDING |
| INV-03 | Values addressable by stable setting_id across rename | pending | pending | PENDING |
| INV-04 | Alias marker v1 → active def; depth ≤1 | pending | pending | PENDING |
| INV-05 | Site-owned def never global-scoped nor outside site.* | pending | pending | PENDING |
| INV-06 | Ledger append-only; purge before delete; no cascade | pending | pending | PENDING |
| INV-07 | authorize() before any disclose/mutate (fail-closed) | pending | pending | PENDING |
| INV-08 | registerDefinitions never accepts secret:true | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | No layer value → validated default | pending | pending | PENDING |
| EC-02 | Write to scope not in scopes → SCOPE_NOT_ALLOWED | pending | pending | PENDING |
| EC-03 | Register secret:true → SECRET_NOT_SUPPORTED | pending | pending | PENDING |
| EC-04 | Site def global bit → DEFINITION_INVALID | pending | pending | PENDING |
| EC-05 | Rename+retype one op → RENAME_RETYPE_CONFLICT | pending | pending | PENDING |
| EC-06 | Alias-to-alias → ALIAS_DEPTH_EXCEEDED | pending | pending | PENDING |
| EC-07 | Raw workspace delete → RESTRICT / PURGE_REQUIRED | pending | pending | PENDING |
| EC-08 | Stale def_version read → in-memory coerce, no write | pending | pending | PENDING |
| EC-09 | reset.* without *.write → reset succeeds (internal ctx) | pending | pending | PENDING |
| EC-10 | getEffective tombstoned key → typed-absent | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| UNAUTHENTICATED | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| DEFINITION_NOT_FOUND | pending | pending | pending | PENDING |
| DEFINITION_INVALID | pending | pending | pending | PENDING |
| SCOPE_NOT_ALLOWED | pending | pending | pending | PENDING |
| SECRET_NOT_SUPPORTED | pending | pending | pending | PENDING |
| VALUE_VALIDATION_FAILED | pending | pending | pending | PENDING |
| RENAME_RETYPE_CONFLICT | pending | pending | pending | PENDING |
| ALIAS_DEPTH_EXCEEDED | pending | pending | pending | PENDING |
| DEFINITION_TOMBSTONED | pending | pending | pending | PENDING |
| PURGE_REQUIRED | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |
| REQUEST_CANCELLED | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Layer resolution precedence | § 1.1 | pending | pending | PENDING |
| Cleared-state falls through | § 1.2 | pending | pending | PENDING |
| Definition listing order | § 2.1 | pending | pending | PENDING |
| Sequential rename retarget | § 2.3 | pending | pending | PENDING |
| Non-secret default must be non-null | § 3 / § 4 | pending | pending | PENDING |
| scopes bitmask 1..7 | § 4 | pending | pending | PENDING |
| Alias depth ≤1 | § 4 | pending | pending | PENDING |
| Duplicate definition idempotency | § 5.2 | pending | pending | PENDING |
| Total-order layer tie-break | § 6.1 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements
| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| all | Spec stage — TDD/impl not yet run | post-/plan | Coordinator |

### 6.2 Untested Requirements
| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| all | Spec stage — TDD not yet run | post-/tasks | TDD Agent |

### 6.3 Untested Error Codes
| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| all | Spec stage — TDD not yet run | post-/tasks | TDD Agent |

### 6.4 Deferred Items
| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | — | — |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [ ] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [ ] All AC-* from feature.spec.md appear in the Section 1 matrix
- [ ] All INV-* from feature.spec.md appear in the Section 2 matrix
- [ ] All EC-* from feature.spec.md appear in the Section 3 matrix
- [ ] All error codes from errors.spec.md appear in the Section 4 matrix
- [ ] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [ ] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval
- [ ] Section 6.2 (untested) is empty or all entries are DEFERRED with approval
- [ ] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval
- [ ] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent

**[ ] TRACEABILITY COMPLETE** — pending implementation.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-11 | Rows seeded from feature.spec.md v0.1.0; AC-22/AC-23 added in v0.2.0 `/clarify` pass; impl/test pending TDD |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
