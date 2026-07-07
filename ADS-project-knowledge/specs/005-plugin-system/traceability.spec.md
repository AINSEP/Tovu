# Traceability Matrix: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T04:10:00Z |
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Artifact envelope + manifest required fields | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-01) | Missing entry ⇒ CODE_ENTRY_MISSING; missing field ⇒ MANIFEST_MALFORMED | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Install layout + active pointer; side-by-side versions | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-02) | Only active-pointer version loads; flip swaps, no migration | P2 | pending | pending | pending | pending | PENDING |
| REQ-03 | Load pipeline: integrity → sdkRange → import → capability register | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Tampered file ⇒ invalid INTEGRITY_FAILED, not loaded | P1 | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | sdkRange miss ⇒ incompatible; enable 422 PLUGIN_INCOMPATIBLE | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Capability model enforced at SDK boundary | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Undeclared capability ⇒ CAPABILITY_DENIED ⇒ save fails, entry unchanged | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | One typed hook point content.entry.beforeSave | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-05) | Attached filter mutates entry; undeclared hook ⇒ HOOK_UNKNOWN | P1 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-05) | tovu hooks list enumerates the point + signature | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | ext.{pluginId} fields, store-only, no DDL | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-06) | Type-validated; bad namespace ⇒ FIELD_PATH_INVALID; no DDL | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | queryable:true ⇒ QUERYABLE_UNSUPPORTED_V1 | P2 | pending | pending | pending | pending | PENDING |
| REQ-07 | Enable/disable through gateway; disable retains data | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-07) | One change set per transition; disabled stops writing, retains value | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-07) | Reverting enable change set disables; ext untouched | P1 | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-06/SPEC-001 REQ-07) | Reverting a content save restores bodyJson + ext together; hook does not re-fire; restore needs no plugin | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Minimal @tovu/sdk + snapshot test; core internals blocked | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | Snapshot passes; deep @tovu/core import fails to resolve | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Bundled word-count dogfood plugin | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-09) | Enabled + save 5-word body ⇒ ext.word-count.count == 5 + change set | P1 | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-09) | Discovered + enableable in legacy mode | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | PLUGINS_LIST + gateway-backed enable/disable | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-10) | List built-in + valid + invalid with correct fields | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Additive ext on entry DTOs | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-11) | ext absent without plugin; present after write; pre-feature fields intact | P2 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | No plugin executes DDL | pending | pending | PENDING |
| INV-02 | No access to undeclared SDK surface | pending | pending | PENDING |
| INV-03 | Disable/remove never destroys ext data | pending | pending | PENDING |
| INV-04 | No load if integrity or sdkRange fails | pending | pending | PENDING |
| INV-05 | Every enable/disable gateway-audited | pending | pending | PENDING |
| INV-06 | Attach only to declared typed hook points | pending | pending | PENDING |
| INV-07 | Public API = @tovu/sdk exports only | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | id/folder mismatch | pending | pending | PENDING |
| EC-02 | sdkRange excludes runtime | pending | pending | PENDING |
| EC-03 | integrity tamper | pending | pending | PENDING |
| EC-04 | queryable:true declared | pending | pending | PENDING |
| EC-05 | undeclared hook attach | pending | pending | PENDING |
| EC-06 | undeclared capability at runtime | pending | pending | PENDING |
| EC-07 | disabled plugin ext data on read | pending | pending | PENDING |
| EC-08 | two installed versions | pending | pending | PENDING |
| EC-09 | legacy mode (no install dir) | pending | pending | PENDING |
| EC-10 | beforeSave filter throws (fail-closed) | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| PLUGIN_NOT_FOUND | enable guard | pending | pending | PENDING |
| PLUGIN_INVALID | enable-time re-validation | pending | pending | PENDING |
| PLUGIN_INCOMPATIBLE | sdkRange check | pending | pending | PENDING |
| PLUGIN_HOOK_FAILED | hook runner (fail-closed) | pending | pending | PENDING |
| validation vocabulary (§3 errors.spec.md, incl. INTEGRITY_FAILED/SDK_RANGE_UNSATISFIED/CAPABILITY_*/HOOK_UNKNOWN/FIELD_*/QUERYABLE_UNSUPPORTED_V1/DDL_ATTEMPTED) | plugin validator | pending | pending | PENDING |
| VALIDATION_ERROR | route body validation (existing) | pending | pending | PENDING |
| DUPLICATE_COMMAND | core/commands (SPEC-001, unchanged) | pending | pending | PENDING |
| INTERNAL_ERROR | route catch-all (unchanged) | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| BR-01 load pipeline order | § 1 | pending | pending | PENDING |
| BR-02 validation ordering, collect-all | § 2 | pending | pending | PENDING |
| BR-03 no warning tier | § 2 | pending | pending | PENDING |
| BR-04-cap capability enforcement | § 3 | pending | pending | PENDING |
| BR-04 hook firing + composition order | § 4 | pending | pending | PENDING |
| BR-05 enable/disable via gateway | § 5 | pending | pending | PENDING |
| BR-06 ext field write validation | § 6 | pending | pending | PENDING |
| BR-07 fail-closed handling | § 7 | pending | pending | PENDING |
| BR-08 ext under gateway revert (pre-image + no hook re-fire) | § 7a | pending | pending | PENDING |
| DUP-01 id duplicate / shadowing | § 8 | pending | pending | PENDING |
| TB-01 list + composition ordering | § 9 | pending | pending | PENDING |

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
