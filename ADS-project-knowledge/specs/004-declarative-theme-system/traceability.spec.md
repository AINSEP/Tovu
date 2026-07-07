# Traceability Matrix: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| feature_name | FEAT-004-declarative-theme-system |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T02:35:00Z |
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Package layout; no-code rule | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-01) | Executable file ⇒ invalid (CODE_FILE_PRESENT) | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Manifest schema, strict keys | — | pending | pending | pending | pending | PENDING |
| REQ-03 | Template resolution chain | — | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-03) | post/page fall back to entry; page.json overrides for pages only | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-03) | not-found.json else built-in 404 | P2 | pending | pending | pending | pending | PENDING |
| REQ-04 | Block vocabulary + slots + components | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Unknown component ⇒ invalid | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-04) | Slots receive route context correctly | P2 | pending | pending | pending | pending | PENDING |
| REQ-05 | Discovery sources + shadowing | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-05) | Dropped valid theme discovered + listed | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-05) | Built-in shadowing refused | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | Validation pipeline (CSS, sizes, files) | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-06) | @import CSS ⇒ invalid; activation 422 | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Built-ins ported; THEME_STYLES deleted | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-07) | Ported built-ins render equivalent tokens | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Dynamic activation guard replaces hardcode | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-08) | Valid site theme activates via gateway; revert restores | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | Unknown id ⇒ 404, no change set | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | THEMES_LIST endpoint | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-09) | Full list with source/status/errors/active | P2 | pending | pending | pending | pending | PENDING |
| REQ-10 | Render-time fallback | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-10) | Deleted active theme ⇒ paper fallback, 200, logged | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Appearance UI | — | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-11) | Grouped list, badges, activation rules | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | No theme code ever executes | pending | pending | PENDING |
| INV-02 | Activation requires fresh validation | pending | pending | PENDING |
| INV-03 | Built-in ids never shadowed | pending | pending | PENDING |
| INV-04 | Theme folders are read-only to the runtime | pending | pending | PENDING |
| INV-05 | Theme-data failures never 5xx public routes | pending | pending | PENDING |
| INV-06 | Activation stays gateway-audited | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | id/folder mismatch | pending | pending | PENDING |
| EC-02 | case-insensitive duplicate ids | pending | pending | PENDING |
| EC-03 | missing required token | pending | pending | PENDING |
| EC-04 | oversized/deep template tree | pending | pending | PENDING |
| EC-05 | active theme invalidated while serving | pending | pending | PENDING |
| EC-06 | non-directory in themes/ | pending | pending | PENDING |
| EC-07 | legacy mode (no install dir) | pending | pending | PENDING |
| EC-08 | component props mismatch | pending | pending | PENDING |
| EC-09 | persisted activeThemeId dangling at boot | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| THEME_NOT_FOUND | activation guard | pending | pending | PENDING |
| THEME_INVALID | activation re-validation | pending | pending | PENDING |
| validation vocabulary (§3 errors.spec.md, 16 codes) | theme validator | pending | pending | PENDING |
| VALIDATION_ERROR | route body validation (existing) | pending | pending | PENDING |
| DUPLICATE_COMMAND | core/commands (SPEC-001, unchanged) | pending | pending | PENDING |
| INTERNAL_ERROR | route catch-all (unchanged) | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| BR-01 resolution chain | § 1 | pending | pending | PENDING |
| BR-02 validation ordering, collect-all | § 2 | pending | pending | PENDING |
| BR-03 no warning tier | § 2 | pending | pending | PENDING |
| BR-04 discovery precedence + shadowing | § 3 | pending | pending | PENDING |
| BR-05 activation guard order, gateway last | § 4 | pending | pending | PENDING |
| BR-06 render fallback, no silent rewrite | § 5 | pending | pending | PENDING |
| DUP-01 id duplicate definition | § 8 | pending | pending | PENDING |
| TB-01 list ordering | § 3 | pending | pending | PENDING |

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
