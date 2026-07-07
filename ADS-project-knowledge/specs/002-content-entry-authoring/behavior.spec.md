# Behavior Rules Spec: Content Entry Authoring — Create and Edit Pages + Posts

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
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

**Purpose:** Deterministic rules for slug derivation, validation ordering, kind scoping, and list ordering. All rules use EARS syntax.

---

## 1. Slug Derivation (BR-01…BR-02)

- BR-01: WHEN a create request omits `slug`, the system shall derive a base slug from `title` by applying, in order: (1) trim, (2) lowercase, (3) replace every maximal run of characters outside `[a-z0-9]` with a single `-`, (4) strip leading/trailing `-`, (5) truncate to 120 characters and re-strip a trailing `-`. IF the result is empty, THEN the system shall fail with `VALIDATION_ERROR` ("title must contain characters usable in a slug") and write nothing.
- BR-02: WHEN the derived base slug is already used in the workspace (any kind), the system shall try `{base}-{n}` for n = 2, 3, … 999 in ascending order and use the first free candidate, truncating the base (not the suffix) if the candidate would exceed 120 characters. IF all candidates through n = 999 are taken, THEN the system shall fail with `SLUG_CONFLICT` and write nothing.

## 2. Validation and Execution Ordering (BR-03…BR-06)

- BR-03: WHEN a create request is validated, the system shall evaluate in this order, first failure wins: (1) title non-empty after trim and ≤ 200 chars, (2) provided slug format `^[a-z0-9-]+$` and ≤ 120 chars (skipped when omitted), (3) slug not reserved (`admin`, `api`) — applies to provided AND derived slugs, (4) `bodyJson` is a JSON object (when provided), (5) `status` is `draft` or `published` (when provided), (6) slug uniqueness / derivation (BR-01/BR-02, repo access starts here). Steps 1–5 are pure; no repo read occurs before step 6.
- BR-04: WHEN a create executes, it shall run inside the SPEC-001 gateway with its ordering (idempotency check first, SPEC-001 BR-01); the gateway's `captureInverse` for `operation "create"` shall return null, recording a non-revertible item (EC-05 of SPEC-001; owner call 2026-07-06).
- BR-05: WHEN an update arrives at a kind-scoped item route, the system shall evaluate: (1) workspace match, (2) entry exists, (3) entry kind matches the route family — and only then enter the gateway. A kind mismatch shall produce the same 404 as a missing entry, and no gateway execution, change set, or event shall occur (BR-06 below governs the guard's placement).
- BR-06: The kind guard shall live in the feature layer (kind passed as required input by the route), not in route handlers — route handlers only select the kind for their family (Agent Directives, feature.spec.md).

## 3. Default Values

| Field | Default | Why |
|---|---|---|
| `status` (create) | `draft` | Safe-by-default authoring: nothing goes public without an explicit publish |
| `bodyJson` (create) | `{"type":"doc","content":[]}` | Valid empty TipTap document — the editor opens without a migration shim |
| `slug` (create) | derived per BR-01/BR-02 | WordPress-parity ergonomics; explicit slug always wins |
| `kind` | fixed by route family | Structural, not payload-driven — prevents kind spoofing (REQ-01) |
| `version` (create) | `1` | SPEC-001 version-guard baseline |
| `Idempotency-Key` header | absent ⇒ no idempotency check | SPEC-001 behavior carried over |

## 4. Limits and Bounds

| Constraint | Value | Enforcement |
|---|---:|---|
| `title` length (after trim) | 1…200 chars | feature validation ⇒ `VALIDATION_ERROR` |
| `slug` length | 1…120 chars | feature validation ⇒ `VALIDATION_ERROR`; derivation truncates per BR-01/BR-02 |
| Request body size | ≤ 1 MiB | route layer (Express JSON limit) ⇒ 413 `PAYLOAD_TOO_LARGE` |
| Suffix search bound | n ≤ 999 | BR-02 ⇒ `SLUG_CONFLICT` when exhausted |
| `Idempotency-Key` length | ≤ 200 chars | SPEC-001 limit carried over |

## 5. Deduplication Rules

- DUP-01: Create/update deduplication is exactly SPEC-001 DUP-01 — same `workspaceId` + same non-null `Idempotency-Key`. Identical titles/slugs with different keys are not duplicates (they resolve via BR-02 or `SLUG_CONFLICT`).

## 6. Tie-Break Logic

- TB-01: Kind lists (`POSTS_LIST`, `PAGES_LIST`, and the feature list functions) shall order by `updatedAt` descending; WHEN two entries share `updatedAt`, the system shall order by `id` descending. (Pre-feature `POSTS_LIST` ordering was unspecified; this makes it deterministic.)

## 7. Edge Case Handling (EARS)

- IF the create title is whitespace-only, THEN the system shall respond `VALIDATION_ERROR` and write nothing (EC-01).
- IF the title derives to an empty slug and no slug was provided, THEN the system shall respond `VALIDATION_ERROR` per BR-01 (EC-02).
- IF suffix search exhausts n = 999, THEN the system shall respond `SLUG_CONFLICT` (EC-03).
- IF `bodyJson` is an array, string, number, boolean, or null, THEN the system shall respond `VALIDATION_ERROR` (EC-04).
- IF the request body exceeds 1 MiB, THEN the route layer shall respond 413 `PAYLOAD_TOO_LARGE` before feature code runs (EC-05).
- IF a page create uses a slug held by a post (or vice versa), THEN the system shall respond `SLUG_CONFLICT` (EC-06, INV-01).
- IF the wrapped create throws inside the gateway, THEN no entry, change set, or event shall exist afterward (EC-07; SPEC-001 BR-03).
- IF site `GET /:slug` matches a draft entry of either kind, THEN the site 404 page shall render (EC-08, INV-04).
- IF `runMigrations` runs against a db whose `posts` table lacks `kind`, THEN it shall add the column with default `'post'` and preserve all rows; a second run shall be a no-op (EC-09).
- WHEN two creates with the same derivable title race in the single-process dev server, event-loop serialization shall give the second the next free suffix; both succeed (EC-10).
