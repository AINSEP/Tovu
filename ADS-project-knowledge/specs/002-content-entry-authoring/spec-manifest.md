# Spec Manifest: Content Entry Authoring — Create and Edit Pages + Posts

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-002 |
| feature_name | FEAT-002-content-entry-authoring |
| version | 1.0.0 |
| last_edited | 2026-07-07T02:05:00Z |
| spec_naming | prefixed |
| spec_root | ADS-project-knowledge/specs/002-content-entry-authoring/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Feature adds 5 endpoints and modifies 6 existing surfaces |
| `state.spec.md` | PRESENT | `state.spec.md` | `kind` field, create action, selector changes, migration + seed contract |
| `orchestrator.spec.md` | OMITTED | `—` | All operations are synchronous request/response through the SPEC-001 gateway; no async orchestration, queues, or coordinator state beyond the existing outbox worker (unchanged) |
| `ui.spec.md` | PRESENT | `ui.spec.md` | MVP goal is UI-driven creation: New Post/New Page, Pages section, editor create mode (owner call 2026-07-06) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | 3 new machine-readable codes (`SLUG_CONFLICT`, `ENTRY_NOT_FOUND`, `PAYLOAD_TOO_LARGE`) + 3 carried over |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Slug derivation, validation ordering, kind-guard placement, list tie-break |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error/BR coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, `ui.spec.md`, `traceability.spec.md`, `spec-dod.md`, SPEC-001 package (dependency) |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, SPEC-001 `behavior.spec.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, `ui.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-project-knowledge/specs/001-admin-command-gateway/` (SPEC-001 v1.0.0) | upstream spec | Hard dependency: creates execute through `executeCommand`; idempotency, change-set, and revert semantics are defined there, not here. SPEC-001 is approved but NOT yet wired into routes — implementation prerequisite. |
| `src/features/post/post.ts` (`PostRecord`, `updatePost`, validation rules, error classes) | source touchpoint | The module this feature extends; create must mirror its validation exactly; `kind` lands on `PostRecord` |
| `src/features/post/repo.memory.ts`, `src/features/post/repo.sqlite.ts` | source touchpoint | Both adapters gain the `kind` column/filter and TB-01 ordering; contract tests must cover both (ADR-006) |
| `src/infra/db/schema.ts` (Drizzle code-first schema, adopted 2026-07-06) | source touchpoint | `kind` column + `idx_posts_workspace_kind` are added here; `drizzle-kit generate` produces the migration |
| `src/infra/sqlite/content-db.ts` (`openContentDb` runs Drizzle `migrate()`, `seedContentDb`) | source touchpoint | Generated additive `kind` migration is applied here; seeded `about` page lands in the seed path (AC-16/EC-09) |
| `drizzle/` (generated migration files + `meta/`) | source touchpoint | The `kind` migration is emitted here by `drizzle-kit generate`; never hand-edited |
| `src/server/seed.ts` | source touchpoint | Seed source of truth shared by both persistence paths; gains the page record |
| `src/server/routes/admin/posts/{list,get-by-id,update}.ts` | source touchpoint | Modified routes (kind scoping); pattern for the new `pages` route family |
| `src/server/routes/content/posts/get-by-slug.ts` | source touchpoint | Public content endpoint that starts serving both kinds |
| `src/server/routes/site/pages.ts` (home + catch-all) | source touchpoint | Home gains the kind filter; catch-all already serves any published entry by slug |
| `src/server/http/{admin,content,shared}/post*.ts`, `src/headless/contracts.ts` | source touchpoint | Serializers + wire contracts gaining `kind` (REQ-10); `AdminPostEnvelope` is the create response shape |
| `src/server/http/__tests__/headless-contracts.test.ts` | source touchpoint | Existing contract tests that pin response shapes — must be extended, not broken |
| `apps/admin/src/sections/{Posts,PostEditor}.tsx`, `apps/admin/src/nav.ts` (id `pages`), `apps/admin/src/lib/api.ts` | source touchpoint | UI surfaces the ui.spec.md contracts map onto; `pages` nav placeholder becomes real |
| `ADS-project-knowledge/reports/architecture/ADR-007-structural-workspace-scoping.md` | codebase-analysis | Kind scoping mirrors the structural-scoping doctrine (route-fixed, not payload-driven) |
| `ADS-project-knowledge/reports/architecture/ADR-008-change-sets.md` | codebase-analysis | Governs the create change-set profile (operation vocabulary, non-revertible items) |
| `tovu-v2-design.md` §3 (registry 3), §3.5 tier-2 `content` | codebase-analysis | The `PostRecord` → `ContentEntry` direction that motivated the unified-kind decision |
| `START-HERE.md` (v1 first slice §2) | codebase-analysis | This feature is slice step 2 ("content model — post + page") |

---

## Validation Notes

- Validator last run: 2026-07-07T03:55:00Z (re-validated after revision R1)
- Validator result: PASS (`--phase spec`)
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-07T03:55:00Z (see feature.spec.md header for the current hash)
- Notes: Original v1.0.0 hash was `sha256:c797ad4c…4973`.

## Revision History

- **R1 (2026-07-07, pre-checkpoint):** Rebased the persistence contract onto **Drizzle ORM** (adopted repo-wide 2026-07-06). REQ-11 and state.spec §7 now express the `kind` migration as a `schema.ts` edit + `drizzle-kit generate` (additive, applied by Drizzle `migrate()` with `__drizzle_migrations` idempotency) instead of a hand-written `ALTER TABLE`; brownfield refs updated (`src/infra/db/schema.ts`, `drizzle/`). Content-only refinement of an as-yet-unratified spec — version held at 1.0.0, hash recomputed. Also part of the retroactive Spec-Agent persona audit (see spec-dod.md sign-off).
