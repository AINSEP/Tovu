# Feature Spec: Content Entry Authoring — Create and Edit Pages + Posts

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-002 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:b0127bc03ca46fe1e1a870f6bcff28a20fddfd82872ed4f67a7b9bf1d7dd4675 |
| feature_name | FEAT-002-content-entry-authoring |
| last_edited | 2026-07-07T02:05:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

---

## Overview

The MVP authoring loop for the Tovu walking skeleton: an admin (human now, AI agent later) can **create** and edit both **posts** and **pages**, and see them served on the public site. Today the runtime can only *edit* two seeded posts — there is no create path and no page concept. This feature adds a `kind` discriminator (`post` | `page`) to the existing content record, a create operation that runs through the SPEC-001 command gateway, kind-scoped admin API routes (`…/posts`, `…/pages`), public serving of pages, and the admin-UI slice (New Post / New Page buttons, a real Pages section, editor create mode).

**Decision rationale — unified entry with a `kind` field** (owner-confirmed 2026-07-06, with consequences requested):
- *Chosen:* one record/table with `kind: "post" | "page"` — the WordPress `wp_posts.post_type` model, and the first concrete step of the blueprint's `PostRecord` → `ContentEntry` evolution (tovu-v2-design.md §3, registry 3).
- *What it buys:* one write path through the gateway, one slug-uniqueness rule (so public routes can never collide), pages inherit versioning/change-sets/idempotency for free, and the Phase-2 schema registry gets one entry model to generalize instead of two to merge.
- *What it costs / guards:* every read must filter by `kind` or pages leak into post lists — this spec pins that with INV-05 and explicit ACs; the `posts` table name drifts from its contents until the ContentEntry rename (OQ-02); future page-only fields (parent hierarchy, menu order, per-page template) land as columns or schema-registry `ext.*` fields per the hybrid-persistence rule (OQ-03).
- *Rejected:* a separate `features/page` module — duplicates all post logic, forks the gateway wiring, and moves against the settled ContentEntry direction.

---

## Problem Statement

**Current state:** `features/post` supports update/get/list only; the two seeded posts are the only content that can ever exist. There is no page concept: the admin nav's "Pages" item points at a placeholder, and the public site can only serve posts. No mutation can create content, so the product cannot demonstrate its core loop.

**Desired state:** From the admin UI (or the API, or later an agent), a user creates a post or a page, edits it, and sees it live on the site — with every mutation recorded as an auditable change set per ADR-008/SPEC-001.

**Why now:** This is the v1 first slice in START-HERE.md — "create a site, edit content, see it rendered." Content creation is the first capability every subsequent spec (themes, plugins, assistant tools) exercises. It is also the first *consumer* of the SPEC-001 gateway, proving that write path before agent tooling arrives.

**Success signal:** From a fresh boot, a user can click New Post and New Page in the admin, publish both, and load both at `/:slug` on the public site; every create/update in the test suite leaves exactly one change-set row; `npm test` passes with contract tests for both repo adapters.

---

## User Journey

1. **Trigger:** An admin opens the admin shell and clicks **New Page** (or **New Post**) in the corresponding section.
2. **Steps:**
   1. The editor opens in create mode: empty TipTap body, title field focused, slug field empty with an "auto" placeholder, status defaulting to draft.
   2. The admin types a title ("About Us") and saves. The shell POSTs to the create endpoint; the server derives the slug (`about-us`), runs the create through the command gateway, and records an applied change set.
   3. The editor transitions to edit mode for the returned entry id; the Pages list now shows the new page.
   4. The admin sets status to published and saves (existing update path, now kind-scoped).
   5. The admin opens `/about-us` on the site and sees the page rendered with the active theme.
3. **Outcome:** The page exists, is versioned (version 1 on create, +1 per update), is served publicly, and both mutations appear in change-set history.
4. **Alternate paths:** If the chosen slug is taken, the save fails with a slug-conflict error and the editor keeps the user's input for correction. If the derived slug is taken, the server suffixes it (`about-us-2`) instead of failing. A retried create with the same `Idempotency-Key` returns `DUPLICATE_COMMAND` instead of duplicating the entry.

---

## Scope

**In scope:**
- `kind: "post" | "page"` on `PostRecord`, both repo adapters, Drizzle schema migration, and headless contracts — REQ-01, REQ-10, REQ-11
- `createEntry` feature function in `features/post` (validation, defaults, slug derivation) — REQ-02, REQ-03, REQ-04
- Create execution through the SPEC-001 command gateway with `Idempotency-Key` support — REQ-05
- New admin endpoints: `POST …/posts`, `POST …/pages`, `GET …/pages`, `GET …/pages/:pageId`, `PUT …/pages/:pageId` — REQ-06, REQ-07, REQ-08
- Kind scoping on existing post routes (list/get/update) — REQ-07, REQ-08
- Public serving of pages: content API by slug, site catch-all; home page stays posts-only — REQ-09
- Seeded demo page + additive `kind` migration (generated via Drizzle) — REQ-11
- Admin UI slice: New Post button, real Pages section, editor create mode — REQ-12 (contracts in ui.spec.md)

**Out of scope:**
- Delete / trash / restore lifecycle, and therefore revertible creates (creates record `inversePayload: null`) — OQ-01
- The `PostRecord` → `ContentEntry` / `features/post` → `features/content` rename (Phase-2 schema registry) — OQ-02
- Page hierarchy (parent/child), menu order, per-page template selection — OQ-03 (SPEC-004 theme system + schema registry)
- Revisions, autosave, scheduled publishing, custom content types
- Pagination of admin lists — OQ-04
- Authentication/authorization (SPEC-001 Art. VI exception carries over; dev-auth middleware unchanged)
- Media/uploads inside the editor

---

## Requirements

- REQ-01: `PostRecord` gains a required `kind` field with exactly the values `"post"` and `"page"`; `kind` is set once at create time (by route family) and no update input can change it.
- REQ-02: A create operation produces an entry with `id` from `IdGeneratorPort`, `version` 1, `updatedAt` from `ClockPort`, and applies the same field validation as `updatePost` (trimmed non-empty title; `bodyJson` a JSON object; status `draft` or `published`). Omitted `status` defaults to `"draft"`; omitted `bodyJson` defaults to the empty TipTap document `{"type":"doc","content":[]}`.
- REQ-03: `slug` is optional on create. When provided it must match `^[a-z0-9-]+$` after trim/lowercase and be unused in the workspace (any kind), else the create fails with `SLUG_CONFLICT` and nothing is written. When omitted it is derived from the title per BR-01, with numeric suffix resolution per BR-02.
- REQ-04: The reserved slugs `admin` and `api` are rejected with `VALIDATION_ERROR` on create and on update (updatePost gains this check; it is missing today).
- REQ-05: Every create executes through the SPEC-001 command gateway: exactly one applied change set with one item (`entityType "post"`, `operation "create"`, `inversePayload null`, `entityVersionAtApply 1`); the create endpoints accept an optional `Idempotency-Key` header with SPEC-001 duplicate semantics (`DUPLICATE_COMMAND`, no second entry).
- REQ-06: `POST /api/admin/v1/workspaces/:workspaceId/posts` creates a `kind "post"` entry and `POST …/pages` creates a `kind "page"` entry; both return HTTP 201 with the `AdminPostEnvelope` shape (now including `kind`).
- REQ-07: Admin lists are kind-partitioned: `GET …/posts` returns only `kind "post"` entries and the new `GET …/pages` returns only `kind "page"` entries (envelope `{ pages: [...] }`); both include drafts and are ordered `updatedAt` descending with `id` descending as tie-break.
- REQ-08: Item routes are kind-scoped: `GET/PUT …/posts/:postId` respond 404 when the record's kind is not `post`; new `GET …/pages/:pageId` and `PUT …/pages/:pageId` respond 404 (`ENTRY_NOT_FOUND`) when the record's kind is not `page`. `PUT …/pages/:pageId` otherwise behaves exactly as the post update contract (validation, gateway, versioning).
- REQ-09: Public surfaces serve pages: `GET /api/content/v1/workspaces/:workspaceId/posts/:slug` returns any *published* entry regardless of kind (payload gains `kind`); the site catch-all `GET /:slug` renders any published entry; the site home `GET /` lists published `kind "post"` entries only.
- REQ-10: Headless contracts `AdminPost` and `ContentPost` gain the required field `kind: "post" | "page"`; all existing response fields are unchanged (additive change only).
- REQ-11: The schema migration adds `kind` to the `posts` table by editing the code-first Drizzle schema (`src/infra/db/schema.ts`) and generating a new migration via `drizzle-kit generate` (output under `drizzle/`); the generated migration is additive (`ALTER TABLE posts ADD COLUMN kind ...` with a `'post'` default) and is applied by Drizzle's `migrate()` at boot, which is idempotent through the `__drizzle_migrations` journal (re-runs on a migrated db are no-ops); it never drops or rewrites rows. Seed data gains one published page (slug `about`) created only on first seed.
- REQ-12: The admin shell exposes the create loop: the Posts section has a New Post action, the `pages` nav id resolves to a real Pages section (list + New Page), and the editor supports a create mode that POSTs to the create endpoint and then transitions to edit mode for the returned entry id (component contracts in ui.spec.md).

---

## Acceptance Criteria

- AC-01 (REQ-02) [P1]: Given a create request with title `"Hello World"` and no slug/status/bodyJson, when it succeeds, then the entry has `version 1`, `status "draft"`, `bodyJson {"type":"doc","content":[]}`, `slug "hello-world"`, and `kind` matching the route family.
- AC-02 (REQ-03) [P1]: Given entries with slugs `hello-world` and `hello-world-2` exist in the workspace, when a create with title `"Hello World"` and no slug runs, then the new entry's slug is `hello-world-3`.
- AC-03 (REQ-03) [P1]: Given an entry with slug `welcome` exists (any kind), when a create provides slug `welcome` explicitly, then the response is HTTP 409 `SLUG_CONFLICT`, no entry is created, and no change set is recorded.
- AC-04 (REQ-04) [P1]: Given a create request with slug `admin`, when it is handled, then the response is HTTP 400 `VALIDATION_ERROR` and nothing is written.
- AC-05 (REQ-05) [P1]: Given a successful create, when change sets are inspected, then exactly one applied change set exists for it with one item of `entityType "post"`, `operation "create"`, `inversePayload null`, `entityVersionAtApply 1`.
- AC-06 (REQ-05) [P1]: Given a create executed with `Idempotency-Key: K`, when a second create with key `K` arrives in the same workspace, then the response is HTTP 409 `DUPLICATE_COMMAND` carrying the original change-set id and exactly one entry exists.
- AC-07 (REQ-05) [P2]: Given an applied create change set, when revert is called on it, then the response is HTTP 422 `REVERT_NOT_POSSIBLE` (SPEC-001 REQ-10) and the entry still exists.
- AC-08 (REQ-06) [P1]: Given a valid body, when `POST …/posts` succeeds, then the status is 201 and the body is the `AdminPostEnvelope` shape with `kind "post"`; the same via `POST …/pages` yields `kind "page"`.
- AC-09 (REQ-07) [P1]: Given two posts and one page in a workspace, when `GET …/posts` and `GET …/pages` are called, then the first returns exactly the two posts and the second exactly the one page (drafts included in both).
- AC-10 (REQ-07) [P2]: Given three entries with distinct `updatedAt` values, when a kind list is fetched, then entries are ordered `updatedAt` descending; given equal `updatedAt`, ordered `id` descending.
- AC-11 (REQ-08) [P1]: Given a page entry, when it is fetched via `GET …/posts/:postId`, then the response is HTTP 404; when fetched via `GET …/pages/:pageId`, then it is returned with HTTP 200.
- AC-12 (REQ-08) [P1]: Given a page entry, when `PUT …/pages/:pageId` submits a valid edit, then the response matches the post-update contract (envelope with `kind "page"`), the version increments by 1, and a change set is recorded.
- AC-13 (REQ-09) [P1]: Given a published page with slug `about`, when `GET /api/content/v1/workspaces/:workspaceId/posts/about` and site `GET /about` are requested, then both return 200 (JSON payload includes `kind "page"`; site returns rendered HTML).
- AC-14 (REQ-09) [P1]: Given a published page and a published post, when site `GET /` is requested, then the home listing contains the post and not the page.
- AC-15 (REQ-09) [P2]: Given a draft page, when the content API and site `GET /:slug` are requested for its slug, then both respond 404.
- AC-16 (REQ-11) [P1]: Given a `content.db` at the Drizzle migration baseline immediately *before* the `kind` migration (its `posts` table lacks `kind`), when the server boots and applies migrations, then the `kind` column exists with every prior row reading `kind "post"` and no rows lost; given a fresh database, then the seed contains the published `about` page.
- AC-17 (REQ-12) [P1]: Given the admin Posts section, when the New Post action is used with a title, then a create request fires and the editor transitions to edit mode for the returned id (per ui.spec.md events).
- AC-18 (REQ-12) [P1]: Given the admin Pages section, when it loads, then it lists `kind "page"` entries from `GET …/pages`, and New Page creates a page via `POST …/pages`.
- AC-19 (REQ-01) [P2]: Given an update request body that includes a `kind` property, when it is handled, then the property is ignored and the entry's kind is unchanged.
- AC-20 (REQ-10) [P2]: Given any admin or content response containing an entry, when it is read, then it carries a `kind` field valued `"post"` or `"page"` and all pre-feature fields unchanged.

---

## Invariants

- INV-01: `(workspaceId, slug)` must always be unique across all entries regardless of kind — in both repo adapters and the SQLite schema.
- INV-02: An entry's `kind` must never change after create.
- INV-03: Every admin-API create or update must record exactly one applied change set — no mutation without a record, no record without a mutation (extends SPEC-001 INV-01 to creates).
- INV-04: Public surfaces (content API, site routes) must never serve an entry whose status is `draft`.
- INV-05: The admin posts collection and pages collection must always be disjoint — an entry appears in exactly one, determined by `kind`.
- INV-06: A created entry must always start at `version` 1, and versions must never decrease (SPEC-001 INV-04 carried over).

---

## Edge Cases

- EC-01: What happens when the create title is empty or whitespace-only?
  Expected behavior: HTTP 400 `VALIDATION_ERROR` ("title is required"); nothing written.
- EC-02: What happens when the slug is omitted and the title contains no slug-able characters (e.g. `"!!!"`)?
  Expected behavior: HTTP 400 `VALIDATION_ERROR` (derived slug empty); nothing written.
- EC-03: What happens when derived-slug suffix resolution exhausts `-2`…`-999`?
  Expected behavior: HTTP 409 `SLUG_CONFLICT`; nothing written (BR-02 bound).
- EC-04: What happens when `bodyJson` is an array, string, or null?
  Expected behavior: HTTP 400 `VALIDATION_ERROR` ("bodyJson must be a JSON object").
- EC-05: What happens when the request body exceeds the 1 MiB body limit?
  Expected behavior: HTTP 413 `PAYLOAD_TOO_LARGE`; nothing written.
- EC-06: What happens when a page create uses a slug already held by a post?
  Expected behavior: HTTP 409 `SLUG_CONFLICT` — uniqueness is cross-kind (INV-01).
- EC-07: What happens when the wrapped create throws inside the gateway (e.g. validation)?
  Expected behavior: no entry, no change set, no outbox event; the error maps per errors.spec.md (SPEC-001 BR-03 inherited).
- EC-08: What happens when site `GET /:slug` matches a draft entry?
  Expected behavior: the site 404 page renders (draft never served, INV-04).
- EC-09: What happens when a `content.db` at the pre-`kind` Drizzle baseline (no `kind` column) boots with the new runtime?
  Expected behavior: the generated additive migration adds the column with default `'post'`; all rows preserved; re-runs are no-ops via the Drizzle journal (AC-16).
- EC-10: What happens when the same derived base slug is created concurrently twice (single-process dev server)?
  Expected behavior: event-loop serialization means the second create derives the next free suffix; both succeed with distinct slugs.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-001 command gateway (`core/commands`) | `executeCommand`, change-set records, idempotency, revert semantics | Not yet wired into routes — creates cannot record change sets | none — SPEC-001 implementation is a prerequisite; implement together, gateway first |
| `tovu/src/features/post` | `PostRecord`, validation rules, `updatePost`, repo ports | Contract drift breaks kind scoping and create parity | none — this feature modifies it directly |
| `tovu/src/core/ports.ts` | `ClockPort`, `IdGeneratorPort`, `JsonObject` | Type drift breaks create determinism | none — blocks feature |
| `tovu/src/infra/db/schema.ts` | Code-first Drizzle schema for `posts` (adopted 2026-07-06) | `kind` added to the wrong shape ⇒ generated migration drifts | `kind` lands as a column on the `posts` table; `drizzle-kit generate` produces the migration reviewed against AC-16 |
| `tovu/src/infra/sqlite/content-db.ts` | `openContentDb` (Drizzle over better-sqlite3): runs `migrate()` + seed path for `content.db` | Non-additive generated migration corrupts existing sites | Additive `ADD COLUMN` reviewed against AC-16; Drizzle journal makes application idempotent |
| `tovu/src/headless/contracts.ts` + `server/http/*` serializers | Response envelopes shared by shells | Shape drift breaks admin app | Additive-only change (REQ-10); contract tests pin shapes |
| `apps/admin` (Posts, PostEditor, nav) | UI surfaces to extend | Placeholder Pages section ships broken links | ui.spec.md contracts; Placeholder remains until section lands |

---

## Open Questions

- OQ-01: Delete/trash lifecycle (and with it revertible creates — inverse of create is delete) — Owner: Leon Aburime — Resolve by: content-lifecycle spec kickoff (next content slice after MVP)
- OQ-02: Timing of the `PostRecord` → `ContentEntry` and `features/post` → `features/content` rename — Owner: Leon Aburime — Resolve by: Phase-2 schema-registry spec
- OQ-03: Page-only fields (parent hierarchy, menu order, per-page template choice) — columns vs schema-registry `ext.*` — Owner: Leon Aburime — Resolve by: SPEC-004 theme system spec
- OQ-04: Admin list pagination and total counts — Owner: Leon Aburime — Resolve by: first workspace with >100 entries or admin IA spec, whichever first

---

## Constitution Compliance

Note: `ADS-project-knowledge/governance/constitution.md` is still not bootstrapped for this project (unchanged since SPEC-001); the toolkit default articles are applied. Flagged to Coordinator for post-spec bootstrap.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Extends the existing `features/post` module; no new library surface. Slug derivation is ~15 lines of justified custom code (no dependency needed). |
| II — Test-First | COMPLIES | TDD Agent dispatched before Programmer; contract tests must cover both repo adapters (memory + SQLite). |
| III — Simplicity Gate | COMPLIES | Every change traces to REQ-01…REQ-12; no new modules beyond one route family and one UI section. |
| IV — Anti-Abstraction Gate | COMPLIES | No new ports. `PostRepoPort.list` gains a `kind` parameter — a signature change on an existing two-adapter port (ADR-006 already satisfied). |
| V — Integration-First Testing | COMPLIES | P1 ACs are specified at HTTP route level (AC-03…AC-16) plus UI-contract level (AC-17/18). |
| VI — Security-by-Default | EXCEPTION | Carried over from SPEC-001: no auth layer exists in the dev server; endpoints are local-dev only behind dev-auth middleware. Permissions feature will replace `AUTH_LOCAL_DEV`. |
| VII — Spec Integrity | COMPLIES | All downstream stages must reference SPEC-002 v1.0.0 and its content hash; SPEC-001 v1.0.0 is referenced as a dependency, not duplicated. |
| VIII — Observability | COMPLIES | All mutations flow through the gateway, inheriting change-set audit rows and `change-set.applied` events; error registry extends SPEC-001's. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-002; verified against `ADS-project-knowledge/specs/`)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file (4 raised, 4 answered by owner 2026-07-06)
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (slug derivation, validation order, kind scoping, list ordering)
- [x] traceability.spec.md complete (marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield`: evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Follow repo conventions: parameter objects (required first, optional second defaulting to `{}`), `INFO.md` + `index.ts` per module, `__tests__/` and `__specs__/` folders.
- Route every create/update through the SPEC-001 gateway — no direct repo writes from route handlers.
- Keep the generated Drizzle migration additive (edit `schema.ts`, then `drizzle-kit generate`); test AC-16 against a database file created from the pre-feature schema.

Ask before:
- Changing any pre-feature response field or envelope key (this feature is additive on the wire).
- Adding page-only fields to `PostRecord` (that is OQ-03, not this slice).

Never:
- Add domain logic to route handlers (kind scoping lives in the feature layer as input, routes only select the kind).
- Let a list query return entries without a kind filter.
- Hand-write raw migration SQL or edit files under `drizzle/` directly — migrations are generated from `schema.ts` via `drizzle-kit generate`.
- Ship a migration that rewrites or drops the `posts` table.
