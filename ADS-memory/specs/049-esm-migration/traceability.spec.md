# Traceability Matrix: esm-migration

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-049 |
| feature_name | FEAT-049-esm-migration |
| version | 1.1.0 |
| content_hash | sha256:af12b9f5cc28ea909a62730ed39d59d18897bc5d25de4822aa8dee7f44016fab (propagated from feature.spec.md's validator-computed hash) |
| last_edited | 2026-08-18T04:00:00Z |
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | A file may enter a wave only if all `#src/`-internal import targets are external or already-migrated ESM | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Candidate wave eligible when every internal import target verified external/migrated | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | File with a still-CJS, non-wave internal import target is excluded from the wave | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Wave 1 member set is exactly the verified 24-file leaf set | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | Wave 1 converts exactly the 24 named files, no others | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | `core` excluded from any wave until Ce=0-vs-grep discrepancy resolved | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | `core` absent from every wave while discrepancy unresolved | P1 | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-03) | `core` eligible once discrepancy documented and resolved | P2 | pending | pending | pending | pending | PENDING |
| REQ-04 | Each wave merges/reverts as a single atomic unit | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Failed wave reverted as one atomic commit, zero mixed-state files | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Per-wave verification gate (typecheck, tests, check:boundaries, check:architecture, boot/smoke) | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Wave merges only if all 5 gate conditions report zero failures | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | No wave changes observable behavior of any route/API/output | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Pre/post-wave observable interactions unchanged | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Every relative import in migrated files has an explicit extension | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-07) | Migrated file's relative imports all carry explicit extensions | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Phase 0: bump deploy Node runtime to 24 before Wave 1 (resolved 2026-08-18, Option A) | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | CJS-requires-ESM boundary merges only once Phase 0 verified complete | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | `apps/admin/**`, `src/themes/static/**`, `src/features/theme/**` excluded from every wave | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-09) | No wave contains a file under the 3 excluded paths | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | `packages/*` in scope; `packages/sdk` already ESM, treated as pre-migrated no-op (resolved 2026-08-18) | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-10) | `packages/sdk` recognized as already-migrated; not scheduled for conversion | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Barrel not converted until 100% of re-exported names are migrated | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-11) | Barrel with any unmigrated re-export target remains CommonJS | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | A merged wave must never mix ESM and CommonJS files within its own member set | pending | pending | PENDING |
| INV-02 | A file must never be added to a wave while any `#src/`-internal dependency is still unmigrated and not part of the same wave | pending | pending | PENDING |
| INV-03 | Any test/observable behavior passing before a wave merges must still pass, identically, after | pending | pending | PENDING |
| INV-04 | Wave ordering must never proceed top-down or arbitrarily — only bottom-up by the verified dependency graph | pending | pending | PENDING |
| INV-05 | `core` must never appear in any wave's member set while its discrepancy is undocumented and unresolved | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Wave's verification gate fails after files already converted | pending | pending | PENDING |
| EC-02 | Tool-reported zero-outward-dependency file turns out to have real dependencies on grep | pending | pending | PENDING |
| EC-03 | Barrel re-exports mix of already-migrated and still-CommonJS names | pending | pending | PENDING |
| EC-04 | Two candidate wave file-sets have zero dependency edges between them | pending | pending | PENDING |
| EC-05 | Still-CommonJS file needs to `require()` an already-migrated ESM file before REQ-08 is answered | pending | pending | PENDING |

---

## 4. Error Code Traceability

N/A — `errors.spec.md` is OMITTED for this feature (see `spec-manifest.md`). This migration defines no new product-facing error codes or HTTP error surface; wave-failure and rollback handling are captured as INV-01–05/EC-01–05 above and as the EARS statements in `behavior.spec.md` §7, not as an error registry.

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Bottom-up wave sequencing order | § 2.1 | pending | pending | PENDING |
| Barrel conversion order (100% re-export targets migrated) | § 2.2 | pending | pending | PENDING |
| EC 1: verify wave membership by grep, not tool output alone | § 7 row 1 | pending | pending | PENDING |
| EC 2: exclude file with still-CJS non-wave dependency | § 7 row 2 | pending | pending | PENDING |
| EC 3: exclude `core` while discrepancy unresolved | § 7 row 3 | pending | pending | PENDING |
| EC 4: revert wave atomically on gate failure | § 7 row 4 | pending | pending | PENDING |
| EC 5: barrel with any unmigrated re-export target stays CommonJS | § 7 row 5 | pending | pending | PENDING |
| EC 6: zero-dependency-edge waves may run in either order or parallel | § 7 row 6 | pending | pending | PENDING |
| EC 7: migrated relative imports carry explicit extensions | § 7 row 7 | pending | pending | PENDING |
| EC 8: CJS-requires-ESM boundary blocked until REQ-08 mechanism verified | § 7 row 8 | pending | pending | PENDING |
| EC 9: reject wave touching apps/admin, themes/static, features/theme | § 7 row 9 | pending | pending | PENDING |
| EC 10: exclude packages/* while REQ-10 unresolved | § 7 row 10 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ-*/AC-* | Spec stage — no implementation has started; TDD/Programmer not yet dispatched | Post `/plan` | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ-*/AC-* | Spec stage — TDD Agent has not yet certified tests | Post `/plan` | TDD Agent |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| — | N/A — no error codes defined (errors.spec.md OMITTED) | — | — |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | Both prior deferrals (REQ-08 Node-version decision, REQ-10 packages/* scope decision) were resolved 2026-08-18 by human decision and are no longer deferred — see feature.spec.md's v1.0.0 to v1.1.0 revision note. | — |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | None — every REQ-*/AC-*/INV-*/EC-* from feature.spec.md and every behavior rule from behavior.spec.md appears above. |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix (N/A — file OMITTED)
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval (pre-implementation — expected)
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval (pre-TDD — expected)
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval (N/A)
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Inspection Agent — N/A at spec stage, no rows are VERIFIED yet

**[ ] TRACEABILITY COMPLETE** — not yet; this is expected at spec stage, before TDD/Programmer dispatch.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-08-18T00:00:00Z | Seeded matrix from feature.spec.md v1.0.0 and behavior.spec.md v1.0.0 |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Inspection Agent | | | |
| Coordinator | | | |
