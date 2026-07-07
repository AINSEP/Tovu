# Traceability Matrix: Content Entry Authoring — Create and Edit Pages + Posts

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-002 |
| feature_name | FEAT-002-content-entry-authoring |
| version | 1.0.0 |
| content_hash | sha256:see feature.spec.md (package hash of record) |
| last_edited | 2026-07-07T02:05:00Z |
| traceability_status | PENDING IMPLEMENTATION |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | `kind` field, route-fixed, immutable | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-01) | `kind` in update body ignored | P2 | pending | pending | pending | pending | PENDING |
| REQ-02 | Create with defaults (draft, empty doc, version 1) | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-02) | Minimal create yields version 1 / draft / empty doc / derived slug | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Optional slug: provided validated, omitted derived | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-03) | Derived slug suffixes to first free (`hello-world-3`) | P1 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-03) | Explicit slug conflict ⇒ 409 SLUG_CONFLICT, nothing written | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Reserved slugs rejected (create + update) | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-04) | Slug `admin` ⇒ 400 VALIDATION_ERROR | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Create through gateway; Idempotency-Key | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-05) | One applied change set: create item, null inverse, versionAtApply 1 | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-05) | Duplicate key ⇒ 409 DUPLICATE_COMMAND, one entry | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-05) | Revert of create ⇒ 422 REVERT_NOT_POSSIBLE | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | POST create endpoints, 201, AdminPostEnvelope + kind | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-06) | 201 envelope kind post/page per route family | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Kind-partitioned lists, TB-01 ordering | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-07) | Posts list vs pages list disjoint | P1 | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-07) | updatedAt desc, id desc tie-break | P2 | pending | pending | pending | pending | PENDING |
| REQ-08 | Kind-scoped item routes (get/update, both families) | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-08) | Page via posts route ⇒ 404; via pages route ⇒ 200 | P1 | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-08) | Page update parity (envelope, version +1, change set) | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Public serving: content API both kinds, home posts-only | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-09) | Published page via content API + site slug ⇒ 200 | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-09) | Home lists posts only | P1 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-09) | Draft page ⇒ 404 on both public surfaces | P2 | pending | pending | pending | pending | PENDING |
| REQ-10 | Headless contracts gain `kind` | — | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-10) | Every entry response carries `kind`; pre-feature fields intact | P2 | pending | pending | pending | pending | PENDING |
| REQ-11 | Additive migration + seeded page | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-11) | Old db migrates additively; fresh db seeds `about` page | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Admin UI create loop (New Post, Pages section, create mode) | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-12) | New Post creates then transitions to edit mode | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-12) | Pages section lists and creates pages | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | `(workspaceId, slug)` unique across kinds, both adapters | pending | pending | PENDING |
| INV-02 | `kind` never changes after create | pending | pending | PENDING |
| INV-03 | Every admin create/update records exactly one applied change set | pending | pending | PENDING |
| INV-04 | Public surfaces never serve drafts | pending | pending | PENDING |
| INV-05 | Posts and pages admin collections disjoint | pending | pending | PENDING |
| INV-06 | Version starts at 1 and never decreases | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Whitespace-only title | pending | pending | PENDING |
| EC-02 | Title derives to empty slug | pending | pending | PENDING |
| EC-03 | Suffix search exhausts n=999 | pending | pending | PENDING |
| EC-04 | bodyJson not a JSON object | pending | pending | PENDING |
| EC-05 | Body over 1 MiB ⇒ 413 | pending | pending | PENDING |
| EC-06 | Cross-kind slug conflict | pending | pending | PENDING |
| EC-07 | Gateway-wrapped create throws ⇒ no trace | pending | pending | PENDING |
| EC-08 | Site slug matches draft ⇒ 404 page | pending | pending | PENDING |
| EC-09 | Pre-kind db boots ⇒ additive migration | pending | pending | PENDING |
| EC-10 | Concurrent same-title creates ⇒ distinct suffixes | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| VALIDATION_ERROR | features/post validation (existing + reserved/empty-derived) | pending | pending | PENDING |
| SLUG_CONFLICT | features/post `PostConflictError` mapping | pending | pending | PENDING |
| ENTRY_NOT_FOUND | features/post `PostNotFoundError` + kind guard | pending | pending | PENDING |
| PAYLOAD_TOO_LARGE | route layer body limit | pending | pending | PENDING |
| DUPLICATE_COMMAND | core/commands (SPEC-001, unchanged) | pending | pending | PENDING |
| INTERNAL_ERROR | route catch-all (unchanged) | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| BR-01 slug derivation algorithm | § 1 | pending | pending | PENDING |
| BR-02 suffix resolution + bound (incl. reserved-derived-slug) | § 1 | pending | pending | PENDING |
| BR-02b UNIQUE-constraint violation → SLUG_CONFLICT (RT-001) | § 1 | pending | pending | PENDING |
| BR-03 validation order (pure first, repo last) | § 2 | pending | pending | PENDING |
| BR-04 create inside gateway; null inverse | § 2 | pending | pending | PENDING |
| BR-05 kind guard before gateway; 404 parity | § 2 | pending | pending | PENDING |
| BR-06 kind guard in feature layer | § 2 | pending | pending | PENDING |
| DUP-01 idempotency (SPEC-001 carry-over) | § 5 | pending | pending | PENDING |
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
