# Traceability Matrix: Site Install Dir — Instantiate a Template, Serve the Folder

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| feature_name | FEAT-003-site-install-dir |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T02:20:00Z |
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Install-dir layout + file schemas | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-03) | init produces exact layout with correct config/meta values | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-01) | Empty contract dirs exist; nothing written outside target | P2 | pending | pending | pending | pending | PENDING |
| REQ-02 | Starter template as declarative repo data | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | Template seed equals pre-feature seed output (incl. about page) | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | init flow ordering + cleanup + commit marker | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Fault-injected init leaves no partial dir | P1 | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Non-empty target ⇒ exit 3 INIT_DIR_NOT_EMPTY, untouched | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | serve validation gate | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | Missing commit marker ⇒ exit 3 SITE_DIR_INVALID | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Schema guard + forward migration + stamp bump | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-05) | Newer site schema ⇒ exit 4, db untouched | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Older site migrates forward, stamp bumped, serves | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | Workspace resolved from db; hardcode removed | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | Edit → restart round-trip persists; route workspace == db row | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-06) | Zero workspace rows ⇒ exit 5 SITE_CORRUPT | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Port/name precedence | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-07) | flag > config > env > 3000 resolution | P2 | pending | pending | pending | pending | PENDING |
| REQ-08 | Portability (no absolute paths) | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-08) | Moved dir serves identically | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | tovu bin wiring + usage exits | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-09) | Unknown command ⇒ usage, exit 2 | P2 | pending | pending | pending | pending | PENDING |
| REQ-10 | Legacy env boots preserved | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-10) | memory/flat-db boots match pre-feature behavior | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | No writes outside the install dir | pending | pending | PENDING |
| INV-02 | Failed init never leaves a partial dir; marker implies completeness | pending | pending | PENDING |
| INV-03 | Template sources read-only at runtime | pending | pending | PENDING |
| INV-04 | serve writes only content.db (+ schemaVersion bump) | pending | pending | PENDING |
| INV-05 | schemaVersion monotonic, never above runtime | pending | pending | PENDING |
| INV-06 | Layout identical across standalone/desktop creation | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | init into non-empty dir (empty dir allowed) | pending | pending | PENDING |
| EC-02 | init target is a regular file | pending | pending | PENDING |
| EC-03 | invalid config.json at serve | pending | pending | PENDING |
| EC-04 | port in use | pending | pending | PENDING |
| EC-05 | content.db locked by another process | pending | pending | PENDING |
| EC-06 | empty --name | pending | pending | PENDING |
| EC-07 | unknown templateId in meta (warn, proceed) | pending | pending | PENDING |
| EC-08 | dir argument + legacy env vars (dir wins, warn) | pending | pending | PENDING |
| EC-09 | crash mid-migration; idempotent re-run | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| VALIDATION | CLI arg parser | pending | pending | PENDING |
| INIT_DIR_NOT_EMPTY | init target validation | pending | pending | PENDING |
| SITE_DIR_INVALID | readSiteDir selector | pending | pending | PENDING |
| SITE_NEWER_THAN_RUNTIME | schema guard | pending | pending | PENDING |
| SITE_CORRUPT | resolveWorkspace / db open | pending | pending | PENDING |
| PORT_IN_USE | listener EADDRINUSE mapping | pending | pending | PENDING |
| INTERNAL | CLI catch-all (post-cleanup) | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| BR-01 init ordering + cleanup + marker-last | § 1 | pending | pending | PENDING |
| BR-02 port precedence (no fall-through on invalid) | § 5 | pending | pending | PENDING |
| BR-03 name precedence | § 5 | pending | pending | PENDING |
| BR-04 dir argument overrides legacy envs | § 2 | pending | pending | PENDING |
| BR-05 serve validation order | § 2 | pending | pending | PENDING |
| BR-06 stamp bump only after migration success | § 2 | pending | pending | PENDING |
| BR-07 graceful shutdown | § 2 | pending | pending | PENDING |
| TB-01 (n/a placeholder) | § 6 | pending | pending | PENDING |

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
