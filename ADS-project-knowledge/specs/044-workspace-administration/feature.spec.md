# Feature Spec: Workspace Administration

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-044 |
| version | 1.0.0 |
| status | DRAFT |
| feature_name | FEAT-044-workspace-administration |
| last_edited | 2026-07-21T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Coordinator (dispatched slice — Spec Agent persona) |
| spec_mode | greenfield |

**Provenance note:** No prior spec exists for the `workspace` feature — `src/features/workspace/`
has only ever had a `create.ts` slice (`__specs__/create-workspace.spec.md` is its own informal,
non-Speckit behavioral note, not a package). This is a fresh spec, dispatched alongside a SPEC-006
amendment (users/roles/policies CRUD) and a Plugins-admin scoping question, bundled into one
worktree. **Package shape note:** following the disclosed lighter-package precedent already used in
this repo for a similarly-scoped feature (`specs/043-widgets/spec-manifest.md`), this package is
`feature.spec.md` + `spec-manifest.md` only — API/state/error contracts are folded inline into
Requirements rather than split into separate files, proportionate to a feature this size. See
`spec-manifest.md` for the itemized omissions.

---

## Overview

Give a site operator the ability to see and manage their Tovu install's own workspace record —
rename it, view it, and (once the platform supports more than one workspace per install) delete a
retired one — instead of the current state, where a workspace can only ever be created, never
listed, viewed, updated, or removed through any authenticated surface.

---

## Problem Statement

**Current state:** `src/features/workspace/create.ts` is the *only* file in the workspace feature
slice — there is no read-many, read-one, update, or delete. Three concrete gaps, in ascending order
of severity:

1. No admin UI (`apps/admin/src/sections/` has no `Workspace.tsx`) and no `nav.ts` entry — an
   operator has no way to see or change their workspace's name/slug at all.
2. No authenticated HTTP surface beyond create — `WorkspaceRepoPort` (`create.ts`) exposes only
   `insert`/`findBySlug`; there is no `findById`, `list`, `update`, or `delete`.
3. **The one route that does exist is unauthenticated.** `app.post("/workspaces", …)` in
   `src/server/app.ts` (~line 562) sits **outside** the `/api/admin/v1/workspaces/:workspaceId/…`
   namespace every other admin mutation uses, and calls neither `getAuthedPrincipal` nor
   `authorize()` — it predates SPEC-006's identity model (ADR-021) and was never migrated onto it.
   Today, **any unauthenticated caller can `POST /workspaces` and create a workspace row.** This
   spec folds hardening that route into REQ-01 rather than leaving a newly-authenticated sibling
   surface next to an unauthenticated one, which would be a strictly worse, more confusing state
   than either "all authenticated" or "all not."

**Desired state:** An authenticated admin, holding a new `workspace.manage` permission, can list,
view, and rename their workspace through the same `/api/admin/v1/workspaces/…` + `authorize()`
discipline every other admin resource uses (SPEC-006), from a real `Workspace.tsx` admin screen
reachable from `nav.ts`. Deleting a workspace is a real, correctly-guarded transition — not an
omitted endpoint — even though the guard means it always refuses in v1 (see Scope/REQ-05).

**Why now:** The unauthenticated `POST /workspaces` gap (point 3 above) is a real, live security
inconsistency now that SPEC-006 has established `authorize()` as the universal admin-mutation gate
— every other resource in this codebase is gated, this one route is not. There is no external
deadline; the "why now" is that this drifted further out of step with the rest of the admin surface
every time a new authenticated resource shipped alongside it unauthenticated.

**Success signal:** An operator can rename their workspace from the admin UI and see the change
persist; `POST /workspaces` requires an authenticated session with `workspace.manage` and is
reachable only via `/api/admin/v1/workspaces`; a `DELETE` attempt against the install's only
workspace is refused with a clear, typed reason rather than either silently succeeding (bricking the
install) or 404ing (looking like a bug).

---

## Architectural Finding This Spec Is Scoped Around (read before Requirements)

Tovu is **multisite-native by design** (ADR-007: "workspaces are the tenancy primitive... WordPress
multisite as a first-class concept, plus the desktop multi-install manager later") — `workspaceId`
scoping is threaded through every repo port and event. **But no multi-workspace *admin routing*
exists yet.** `RouteDeps.workspaceId` (`src/server/routes/types.ts`) is a single value fixed at
process composition (`server/deps.ts`'s `seededWorkspace`, `server/seed.ts`), and **every existing
admin route checks the `:workspaceId` path param for equality against that one fixed value**,
404ing on any mismatch (e.g. `routes/admin/users/list.ts`'s `if (String(req.params.workspaceId ...) !==
deps.workspaceId)`). A second workspace row can exist in the `workspaces` table (nothing stops
`POST /workspaces` from inserting one today), but **the running server can never address it** — there
is no per-request workspace resolution, only the one boot-wired id.

**Scope decision this implies (not a `[NEEDS CLARIFICATION]` — a reasoned default, flagged for an
owner sanity-check in the handoff report):** this spec builds workspace administration as
**single-workspace-scoped admin CRUD** — list/view/update act on the caller's own (boot-wired)
workspace only, matching every other admin resource's existing pattern, not a cross-workspace
switcher. Building a true multi-workspace admin surface (list *all* workspaces on the install,
switch between them, provision new ones as first-class tenants) needs `RouteDeps` to become
workspace-dynamic first — a materially larger architectural change than "CRUD completion," and out
of scope here. That larger change is recorded as OQ-01 below, not silently dropped.

---

## Scope

**In scope:**
- Bring the pre-existing `CREATE_WORKSPACE` transition under the same `/api/admin/v1/workspaces`
  path + `AUTH_SESSION` + `workspace.manage` discipline as every other admin mutation — REQ-01
- `GET /api/admin/v1/workspaces` — list (v1: returns exactly the caller's own workspace) — REQ-02
- `GET /api/admin/v1/workspaces/:workspaceId` — view one — REQ-03
- `PATCH /api/admin/v1/workspaces/:workspaceId` — rename (`name` and/or `slug`) — REQ-04
- `DELETE /api/admin/v1/workspaces/:workspaceId` — correctly-guarded delete (refuses in v1 by
  design — REQ-05, see the Architectural Finding above and INV-03 below)
- Register a new `workspace.manage` permission via the identity library's existing
  `registerPermission` mechanism (SPEC-006 REQ-03 explicitly supports feature-registered
  permissions) — REQ-06
- `Workspace.tsx` admin screen + `nav.ts` entry — REQ-07
- `WorkspaceRepoPort` gains `findById`, `list`, `update`, `delete` (both adapters: memory + SQLite)
  — REQ-08

**Out of scope (deferred — see Open Questions):**
- True multi-workspace admin (list *all* workspaces on an install, switch/act-as another workspace,
  provision additional tenants as a first-class flow) — needs `RouteDeps` to become
  workspace-dynamic; a distinct, larger architectural project — OQ-01
- Workspace-level settings/branding beyond `name`/`slug` (logo, timezone, locale) — these belong to
  the existing Settings admin section (SPEC-007 Layered Settings Ledger), not this spec — OQ-02
- Desktop multi-install manager (ADR-007's other named consumer of the tenancy primitive) — a
  Tovu-Runner-side concern, not this repo — OQ-03
- Whether the `Workspace` nav entry should instead be a tab inside the existing `Settings` section
  rather than its own top-level item — a UI-placement call, not a behavioral question; REQ-07
  defaults to a standalone nav entry (matches how this gap was originally framed) — OQ-04

---

## Requirements

- REQ-01: The existing `createWorkspace` slice (`src/features/workspace/create.ts`) is served at
  `POST /api/admin/v1/workspaces` (moved from the current unauthenticated `POST /workspaces`) and
  requires an active session (`AUTH_SESSION`, SPEC-006 api.spec §2) plus the `workspace.manage`
  permission via `authorize()`. The old unauthenticated `POST /workspaces` route is removed, not
  left as a second, insecure path to the same effect.
- REQ-02: `GET /api/admin/v1/workspaces` returns an array containing the caller's own workspace
  (identified by `deps.workspaceId`, the same fixed value every other admin route resolves against)
  — in v1 this array always has exactly one element. Gated by `workspace.manage`.
- REQ-03: `GET /api/admin/v1/workspaces/:workspaceId` returns the single workspace record when
  `:workspaceId` equals the caller's own workspace, else `404` — matches the existing guard pattern
  used by every other `/api/admin/v1/workspaces/:workspaceId/…` route (e.g.
  `routes/admin/users/list.ts`). Gated by `workspace.manage`.
- REQ-04: `PATCH /api/admin/v1/workspaces/:workspaceId` updates `name` and/or `slug` on the caller's
  own workspace. `name`: non-blank after trim. `slug`: lowercase letters/numbers/dashes
  (`^[a-z0-9-]+$`, same pattern `createWorkspace` already validates), unique across all workspace
  rows (checked via the existing `findBySlug`, excluding the row being updated). Gated by
  `workspace.manage`.
- REQ-05: `DELETE /api/admin/v1/workspaces/:workspaceId` deletes the caller's own workspace **iff**
  it is not the install's last remaining workspace row — checked and enforced by INV-03. Because a
  v1 install always has exactly one workspace row (REQ-02's own v1 behavior), **this transition
  always refuses in v1** — that is correct, guarded behavior, not a bug or a stub: the code path,
  the guard, and the typed refusal (`LAST_WORKSPACE`) all exist and are tested now, so the day a
  second, genuinely addressable workspace exists (post-OQ-01), delete works without further design.
  Gated by `workspace.manage`.
- REQ-06: A new permission `workspace.manage` is registered into the identity permission catalog
  (SPEC-006 REQ-03's `registerPermission` mechanism — features may register additional permissions
  at startup) rather than reusing `settings.write` — workspace identity (rename, eventual
  multi-tenant delete) is a distinct, higher-blast-radius operation than a settings-ledger value
  edit, and deserves its own catalog entry auditable independently. Seed-time grant: `owner` and
  `admin` built-in roles (mirrors `settings.write`'s existing owner+admin seed pattern, REQ-09 of
  SPEC-006) — **not** `editor`/`viewer`.
- REQ-07: A `Workspace.tsx` admin screen (mirrors the existing `Roles.tsx`/`Users.tsx` fetch/
  loading/error/form shape) is reachable from a new `nav.ts` entry (`id: "workspace"`, under the
  "Design & System" group per OQ-04's default) and a matching `case "workspace":` in `App.tsx`'s
  section switch. Shows the current workspace's `name`, `slug`, `createdAt`; an editable
  rename form (REQ-04); and a `Delete workspace` control that is present (not hidden) but always
  disabled with an explanatory tooltip/notice in v1 ("Your install must always have exactly one
  workspace — this becomes available once multi-workspace support lands") rather than either
  omitting it entirely or letting a real click hit a guaranteed-refusing endpoint with a raw error.
- REQ-08: `WorkspaceRepoPort` (`src/features/workspace/create.ts`) gains three methods beyond the
  existing `insert`/`findBySlug`: `findById(id): Promise<WorkspaceRecord | null>`,
  `list(): Promise<WorkspaceRecord[]>`, `update(record): Promise<void>`, and
  `delete(id): Promise<void>`. Both `InMemoryWorkspaceRepo` (`repo.memory.ts`) and
  `SqliteWorkspaceRepo` (`repo.sqlite.ts`) implement all seven methods, preserving REQ-01's existing
  `insert`/`findBySlug` contract unchanged (ADR-006 ports/adapters — ADR-007 already requires every
  scoped repo port method to key by the record's own id/slug, which this satisfies since
  `WorkspaceRecord.id` is already the row's own key).

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given no session cookie, when `POST /api/admin/v1/workspaces` is called with
  a valid `name`/`slug`, then it is refused `401 UNAUTHENTICATED` and no row is created; given an
  unauthenticated request to the **old** path `POST /workspaces`, then it `404`s (route removed).
- AC-02 (REQ-01) [P1]: Given a session holding `workspace.manage`, when `POST /api/admin/v1/workspaces`
  is called with a valid `name`/`slug`, then a workspace row is created (`201`) — identical
  validation/conflict behavior to the pre-existing `createWorkspace` slice (blank name →
  `VALIDATION_ERROR`; invalid slug pattern → `VALIDATION_ERROR`; duplicate slug → `RESOURCE_CONFLICT`).
- AC-03 (REQ-02) [P1]: Given an authenticated session holding `workspace.manage`, when
  `GET /api/admin/v1/workspaces` is called, then the response array contains exactly the caller's
  own workspace record; given a session **without** `workspace.manage`, then `403 FORBIDDEN`.
- AC-04 (REQ-03) [P1]: Given `:workspaceId` equal to the caller's own workspace, when
  `GET /api/admin/v1/workspaces/:workspaceId` is called, then the record is returned `200`; given a
  `:workspaceId` that does not match, then `404` (never leaks whether a *different* workspace id
  exists elsewhere in the table — matches every sibling route's existing information-hiding
  behavior).
- AC-05 (REQ-04) [P1]: Given a valid new `name`, when `PATCH .../:workspaceId` is called, then the
  name updates and is reflected on the next `GET`; given a `slug` colliding with a different
  workspace row, then `409 RESOURCE_CONFLICT` and no change; given an invalid slug pattern, then
  `400 VALIDATION_ERROR` and no change.
- AC-06 (REQ-05) [P1]: Given the install's only workspace, when `DELETE .../:workspaceId` is called
  by a caller holding `workspace.manage`, then it is refused `409 LAST_WORKSPACE` and the row is not
  deleted; given a caller **without** `workspace.manage`, then `403 FORBIDDEN` (checked before the
  last-workspace guard — an unauthorized caller learns nothing about workspace count).
- AC-07 (REQ-07) [P1]: Given the admin UI, when the operator navigates to the new `Workspace` nav
  entry, then the current `name`/`slug`/`createdAt` render, the rename form submits through REQ-04's
  endpoint and reloads on success, and the `Delete workspace` control is visibly present but
  disabled with an explanatory notice.
- AC-08 (REQ-06) [P1]: Given a caller holding only `settings.write` (not `workspace.manage`), when
  any REQ-01..05 endpoint is called, then it is refused `403 FORBIDDEN` — `workspace.manage` is a
  distinct grant, not implied by `settings.write`.

---

## Invariants

- INV-01: Every workspace mutation (`CREATE`/`UPDATE`/`DELETE`) requires an authenticated session
  holding `workspace.manage`, evaluated via the same `authorize()` function every other admin
  mutation uses (SPEC-006 REQ-04/REQ-05) — no workspace mutation is ever reachable unauthenticated
  (closes the REQ-01 gap this spec exists to close).
- INV-02: `slug` is unique across all workspace rows at all times — enforced identically on create
  (pre-existing) and update (REQ-04, new).
- INV-03: An install is never left with zero workspace rows. `DELETE` is refused whenever it would
  remove the last remaining workspace row (`LAST_WORKSPACE`) — checked and the delete performed as
  one atomic operation, so a concurrent create cannot race a delete of what looks like "the last
  row" into a state where a delete and a create interleave to leave the install workspace-less at
  any instant (mirrors SPEC-006 INV-08's atomic owner-count-check-and-disable reasoning, applied to
  workspace count instead of owner count).
- INV-04: `:workspaceId` path-param equality against the caller's own (boot-wired) workspace is
  checked before authorization on every read/update/delete route (`404` on mismatch, matching the
  existing convention across every other admin resource in this codebase) — never a `403` that would
  disclose "this workspace exists but you can't touch it" for a workspace outside the caller's own.

---

## Edge Cases

- EC-01: `PATCH` is called with neither `name` nor `slug` present in the body.
  Expected: `400 VALIDATION_ERROR` — at least one field must be present (an empty-object PATCH is
  not a silent no-op success, to avoid masking a client-side bug as a successful save).
  Alternatively renders success with no change — Software Architect's call, but must be one
  deliberate documented behavior in the implementation outline, not left ambiguous. Default
  recommendation: reject as above (fail loud over silent no-op).
- EC-02: `PATCH` is called with a `slug` identical to the workspace's own current slug (no-op rename
  of the same value).
  Expected: succeeds — the uniqueness check must exclude the row being updated from its own
  collision check (a workspace is never "in conflict with itself").
- EC-03: `POST /api/admin/v1/workspaces` (REQ-01) is called by a caller holding `workspace.manage`
  from a *different* workspace than `deps.workspaceId` — is this even representable in v1's
  single-workspace-per-process model?
  Expected: not representable in v1 — `deps.workspaceId` is the only workspace a running process's
  admin session can ever authenticate against (there is exactly one seeded owner user, in exactly
  one workspace, per the Architectural Finding above); `CREATE_WORKSPACE`'s new row is simply
  unaddressable by this process afterward (same "orphaned but present" state the pre-existing route
  already produces today for any workspace beyond the first).
- EC-04: `DELETE` is attempted on a `:workspaceId` that does not match the caller's own workspace.
  Expected: `404` (INV-04) — never reaches the `LAST_WORKSPACE` guard, consistent with every other
  route's "mismatched workspaceId is 404, not a different error" convention.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-006 identity & authorization | `authorize()`, session auth, the `registerPermission` mechanism this spec's `workspace.manage` permission uses | Seam signature drift | none — blocks REQ-01..06 |
| ADR-015 Drizzle repos | `content.db` schema/migrations for the extended `WorkspaceRepoPort` methods (REQ-08) | schema drift | none — blocks SQLite persistence of update/delete |
| ADR-007 workspace scoping | The `workspaceId`-on-every-row discipline this spec's guard rules (INV-04) build on | — | none |
| ADR-006 ports/adapters | The `WorkspaceRepoPort` contract both adapters (memory/SQLite) must satisfy identically | adapter drift | contract tests (existing pattern, `__tests__/create.test.ts`'s style) |

---

## Open Questions

- OQ-01: True multi-workspace admin (list all workspaces, switch/act-as, provision new tenants) —
  needs `RouteDeps` to become workspace-dynamic; a distinct, larger architectural project. — Owner:
  Leon Aburime — Resolve by: 2026-10-31
- OQ-02: Workspace-level settings/branding (logo, timezone, locale) beyond `name`/`slug` — belongs to
  the SPEC-007 Settings Ledger, not this spec; flagged so it isn't accidentally built twice in two
  places. — Owner: Leon Aburime — Resolve by: 2026-09-30
- OQ-03: Desktop multi-install manager (Tovu-Runner side, ADR-007's other named tenancy consumer) —
  out of this repo's scope entirely. — Owner: Leon Aburime — Resolve by: 2026-11-30
- OQ-04: Should the `Workspace` admin screen be its own top-level nav entry (REQ-07's default) or a
  tab inside the existing `Settings` section? A UI-placement call, not a behavioral question — either
  answer satisfies every REQ/AC above unchanged. — Owner: Leon Aburime — Resolve by: before Software
  Architect dispatch (cheap to answer, no reason to defer)

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Reuses existing Drizzle/ADR-015 persistence and the existing `authorize()`/session machinery; no new library needed. |
| II — Test-First | COMPLIES | TDD Agent dispatched before Programmer, matching every other feature in this pipeline. |
| III — Simplicity Gate | COMPLIES | Every new method/route traces to a REQ; no speculative multi-workspace-switching machinery built ahead of OQ-01's resolution. |
| IV — Anti-Abstraction Gate | COMPLIES | `WorkspaceRepoPort` gains concrete methods with two real adapters (memory + SQLite) already required by ADR-006's rule-of-two — no new port invented. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is an integration-level HTTP-route test, matching this codebase's existing route-test style (`server/__tests__/identity-routes.test.ts`). |
| VI — Security-by-Default | COMPLIES | This spec's central purpose is closing an unauthenticated-mutation gap (REQ-01); every new/moved route is `authorize()`-gated (INV-01). Security Agent review required before merge, as always. |
| VII — Spec Integrity | COMPLIES | spec_id/version referenced consistently; no content_hash computed yet (disclosed in spec-manifest.md, matching the SPEC-043 precedent this package format follows). |
| VIII — Observability | COMPLIES | Reuses the existing admin-route error-envelope shape (`{ error, code, details }`) already used across `routes/admin/users/*.ts`. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-044; verified against `specs/` — next free number after 043-widgets)
- [x] version set (1.0.0 — initial draft, greenfield)
- [ ] status set to APPROVED — **DRAFT.** No Red-Team pass or owner checkpoint has occurred yet; this
      is the Spec Agent's output only, per this dispatch's explicit instruction to stop after specs.
- [x] Zero `[NEEDS CLARIFICATION]` markers — the one real scope fork (single- vs multi-workspace admin)
      was resolved as a reasoned default (see the Architectural Finding section) and flagged for an
      owner sanity-check in the handoff report, not left as a blocking marker.
- [x] All Open Questions have an owner and a resolution target
- [x] All REQ-* are testable, no vague qualifiers; every REQ has ≥1 AC; every AC is Given/When/Then
      with a priority tag
- [x] Invariants are absolute/falsifiable statements
- [x] Edge Cases have explicit Expected Behavior (EC-01 flags one Architect-level default choice —
      disclosed, not hidden)
- [x] Dependencies table complete, no blank cells
- [x] Constitution Compliance table complete, all 8 articles marked
- [x] Scope in-scope/out-of-scope both non-empty

**Gate result:** CONDITIONAL — content-complete and internally consistent; the only gap is the
approval ceremony (status DRAFT pending Red-Team + owner checkpoint), same shape as the SPEC-006
amendment produced alongside this spec.
