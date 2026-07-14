# Feature Spec: Menus (Navigation)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-012 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:f1d9a8aa4c8434a7b7dbafd78f696c04f75edcc06bde4250f8aae91a55b4bf9d |
| feature_name | FEAT-012-menus |
| last_edited | 2026-07-13T00:00:00Z |
| owner | Tovu core team |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **`status: APPROVED` note — as-built documentation, not a pre-implementation gate.** See the
> Overview section immediately below for what APPROVED means for this backfill spec.

> **This spec documents an already-shipped feature. It is a retroactive backfill, not a
> pre-implementation contract.** Menus/navigation (governed by **ADR-029**, ACCEPTED
> 2026-07-10) was built directly from the ADR during the 2026-07-10 admin-section sweep,
> without a SPEC-NNN package — this file, and the rest of this package, is that missing
> traceability document, written from the real code (`src/navigation/`,
> `src/server/routes/admin/menus/`, `apps/admin/src/sections/{Menus,MenuEditor}.tsx`) as it
> exists today. Every REQ/AC below is phrased in present tense ("the system does X") and is
> sourced from a real file, not from aspiration or from the ADR's own (broader) design intent.
> Where the running code does less than ADR-029 describes, or does something ADR-029 didn't
> decide, that gap is called out explicitly as a **Deviation** — never silently resolved in
> either direction. `status: APPROVED` reflects that this package accurately describes
> production code today (there is no future implementation step this spec is gating); it does
> **not** mean a human has certified the underlying design choices as the intended long-term
> shape — several are flagged below as open engineering debt the code's own comments already
> disclose.

---

## Overview

Menus is Tovu's navigation admin section: it lets an operator create named menus (e.g.
"Primary Nav", "Footer Nav"), build a nested, ordered tree of link items inside each one, and
bind a menu to a theme location (e.g. `primary`, `footer`) so themes can render it. The system
persists each menu as a whole-tree entity with optimistic-concurrency versioning, soft-deletes
before hard-purging, and derives a location→menu index that enforces exactly one menu per
location. This document describes that system exactly as it runs today.

---

## Problem Statement

**Current state (pre-existing, before this spec was written):** Menus/navigation code already
exists and is exercised by a passing test suite (`src/navigation/__tests__/*.test.ts`,
`src/server/__tests__/admin-menus-routes.test.ts`), but there was no SPEC-NNN artifact tracing
its requirements, acceptance criteria, or API/UI/error contracts back to the governing
ADR-029. Downstream agents (Software Architect for follow-on work, Code Review, future
Programmer passes) had no single traceable source of truth for "what does Menus actually do
today" short of reading all ~15 source files directly.

**Desired state:** A standard Speckit spec package exists at
`ADS-project-knowledge/specs/012-menus/` that lets any agent or human answer "what does
Menus do, exactly, right now" from the spec package alone, with file-grounded confidence, and
that explicitly flags every place the shipped code diverges from ADR-029's decision text.

**Why now:** This is a governance-gap backfill identified during a repo-wide traceability
audit; there is no external deadline, but every future change to Menus (a new location-conflict
policy, wiring the real routing library, promoting `termRef` to real integrity-tracking) needs
a spec to diff against instead of re-reading the ADR and the code from scratch each time.

**Success signal:** A reviewer can read this spec package (without opening `src/navigation/` or
`src/server/routes/admin/menus/`) and correctly predict the HTTP status code, response body
shape, and persisted state change for every menu operation described in the User Journey below.

---

## User Journey

**Trigger:** An authenticated admin operator (or an AI agent acting as a delegated principal)
wants to create or edit a site's navigation menu and assign it to a theme location.

**Steps:**
1. Operator opens the Menus admin screen (`apps/admin/src/sections/Menus.tsx`), which lists
   every menu in the workspace (`GET /api/admin/v1/workspaces/:workspaceId/menus`).
2. Operator clicks "Add New" (creates via the editor, `MenuEditor.tsx` in create mode) or clicks
   an existing menu's title to open it in the tree editor
   (`GET /api/admin/v1/workspaces/:workspaceId/menus/:menuId`).
3. In the editor, the operator sets a title/slug and adds/removes/reorders/nests link items
   (URL, named route, entry reference, or taxonomy-term reference), then clicks Save
   (`POST .../menus` for a new menu, or `PUT .../menus/:menuId` with the whole replacement tree
   and the version the edit started from).
4. Back on the list screen, the operator types a location key (e.g. `primary`) into a menu's row
   and clicks Assign (`POST .../menus/:menuId/locations`).
5. To remove a menu, the operator clicks "Trash" (soft-delete,
   `DELETE .../menus/:menuId`); the button becomes "Delete permanently" on a trashed menu,
   which the operator confirms via a browser `confirm()` dialog before it purges
   (`DELETE .../menus/:menuId?force=true` or a plain second `DELETE` if the menu is not
   location-bound).

**Outcome:** The menu's item tree, status, version, and location assignments are shown updated
in the list and editor immediately after each successful action (no page reload; the UI
re-fetches after each mutation).

**Alternate paths:**
- **Duplicate slug on create:** the create call returns `409`; the UI's generic
  `error`/`notice error` banner shows the server's message string (no field-level highlighting
  implemented in `MenuEditor.tsx`/`Menus.tsx` — the whole response body's `error` string is
  surfaced as-is).
- **Stale edit (another admin saved first):** the `PUT` returns `409`; the editor shows the
  error banner but does **not** auto-reload the newer version for the operator to reconcile —
  the operator must manually reopen the menu.
- **Purge while still location-bound:** the second `DELETE` call returns `409` with a
  `boundLocations` array in the body; the shipped `Menus.tsx` UI does not read or display that
  array — it shows the generic error message only. The operator must know (from the message
  text) to unassign the location first, or pass `?force=true` themselves — there is no "force"
  UI affordance in `Menus.tsx`; force-purge is reachable only by direct API call in the shipped
  code, not through any button.
- **No permission:** any of the six routes returns `403` with `{ error, code: "FORBIDDEN",
  details: { permission: "navigation.manage", reason } }` when the caller's principal has no
  `navigation.manage` grant. The shipped admin UI has no visible "permission denied" affordance
  distinct from the generic error banner.

---

## Scope

**In scope (what the shipped code covers, all cited by file):**
- Create a menu with an optional initial item tree (`src/navigation/menu-service.ts`
  `createMenu`, wired at `src/server/routes/admin/menus/create.ts`).
- Whole-tree replace of an existing menu's items/title/slug, guarded by optimistic concurrency
  on the entry `version` (`updateMenuTree`, `update-tree.ts`).
- List all menus in the workspace (`list.ts`, reads `MenuRepoPort.list` directly — no service
  wrapper, see Deviation D-9).
- Get one menu by id, including its full item tree (`get-by-id.ts`).
- Assign a menu to a theme location key, with last-writer-wins reassignment of a location
  already held by a different menu (`assignLocation`, `assign-location.ts`).
- Two-step deletion ladder: soft-delete (trash) on the first `DELETE`, hard-purge on a second
  `DELETE` against an already-trashed menu, blocked with `409` while location-bound unless
  `?force=true` (`deleteMenu`, `delete.ts`).
- Four v1 link-target kinds validated at write time: `url` (scheme-denylisted), `route`,
  `entryRef`, `termRef` (`validateAndCloneTree`/`validateTarget` in `menu-service.ts`).
- Bounded, total tree validation: max nesting depth 5, max item count 500, both configurable via
  `TreeValidationLimits` (`DEFAULT_MAX_TREE_DEPTH`, `DEFAULT_MAX_ITEM_COUNT`).
- Render-time resolution of a location's bound menu into a `ResolvedNav` model via an injected
  `resolveTargetHref` seam, with unavailable targets flagged rather than dropped
  (`resolver.ts` `resolveForLocation`).
- Derived `nav_location_bindings`-equivalent in-memory index enforcing one menu per location
  (`InMemoryNavLocationBindingRepo`, `repo.memory.ts`).
- A single flat `navigation.manage` permission gating every one of the six HTTP routes,
  checked via `authorize()` before the underlying service call
  (`src/identity/permissions.ts` lines 149-153).
- Admin UI: a list screen (`Menus.tsx`) and a recursive nested-tree editor (`MenuEditor.tsx`),
  both plain React function components using local `useState` (no Redux/store layer).

**Out of scope (named gaps the code itself documents, not silently omitted):**
- Menus are **not** stored as ADR-022 generic content entries — `InMemoryMenuRepo` is a
  self-contained, non-persistent, in-memory-only store (`repo.memory.ts` file header). There is
  no SQLite adapter for either `MenuRepoPort` or `NavLocationBindingRepoPort` today.
- `entry_refs` extraction for `entryRef`/`termRef` targets (ADR-029 §3's where-used/safe-delete
  claim) is **not implemented** — nothing in `menu-service.ts` writes to any ref-tracking index.
- `termRef` link-integrity is not implemented at all (the injected resolver seam always
  resolves it to unavailable, per the ADR-029 Round-3 audit fold — see Deviation D-4).
- No routing through the ADR-008 command gateway — every mutation is a direct function call
  from the route handler (see Deviation D-3). No revision history, no revert.
- No SQL/derived-index rebuild endpoint (`rebuildForWorkspace` exists on the port interface but
  has no caller anywhere in the route/service code).
- `dynamicQuery` and `content` target kinds are recognized and explicitly rejected (not
  silently ignored) — no resolver exists for either.
- No `navigation.locations.register` hook implementation, no location registry read/write
  surface reachable from HTTP, no outbox events actually emitted (the event name constants
  exist in `contracts.ts` but nothing in `menu-service.ts` publishes them).
- No AI tool surface wired (the tool name constants exist in `contracts.ts`; no handler exists).

---

## Requirements

- REQ-01: The system creates a new menu entity in `draft` status with an empty `locations`
  array when given a workspace id, title, and slug, defaulting to an empty item tree when none
  is supplied (`createMenu`, `menu-service.ts:196-224`).
- REQ-02: The system rejects a menu create when the given slug already exists in the same
  workspace (`createMenu`, `menu-service.ts:205-206`).
- REQ-03: The system validates every submitted item tree — non-empty unique `id` per node,
  nesting depth ≤ configured max (default 5), total item count ≤ configured max (default 500),
  and a target `kind` in `{entryRef, termRef, url, route}` — before persisting a create or
  update (`validateAndCloneTree`, `menu-service.ts:99-132`).
- REQ-04: The system rejects a `url`-kind target whose href starts with `javascript:`,
  `data:`, or `vbscript:` (case-insensitive), and rejects `dynamicQuery`/`content` target kinds
  with a distinct "reserved seam, not supported yet" error rather than an "unknown kind" error
  (`validateTarget`, `menu-service.ts:134-152`).
- REQ-05: The system replaces a menu's whole item tree (plus optionally its title/slug) only
  when the caller's supplied `expectedVersion` matches the menu's current stored `version`,
  incrementing the version by exactly 1 on success (`updateMenuTree`,
  `menu-service.ts:275-313`).
- REQ-06: The system assigns a menu to a location key by writing the location into the menu's
  own `locations` array and upserting a `{workspaceId, locationKey, menuId}` row in the
  location-binding index in the same call (`assignLocation`, `menu-service.ts:367-418`).
- REQ-07: When a location is already bound to a different menu, the system reassigns the
  location to the new menu (last-writer-wins) and removes the location key from the previously
  bound menu's own `locations` array, incrementing that menu's version
  (`assignLocation`, `menu-service.ts:382-398`).
- REQ-08: On the first delete call against a non-trashed menu, the system sets its status to
  `trash` and increments its version, without removing the row or any location binding
  (`deleteMenu`, `menu-service.ts:469-478`).
- REQ-09: On a delete call against an already-trashed menu, the system checks whether any
  location binding still references it; if so and `force` is not set, it rejects the purge with
  a `MenuLocationBoundError` listing the bound location keys, and does not remove the row
  (`deleteMenu`, `menu-service.ts:480-491`).
- REQ-10: When a trashed menu's purge is not blocked (no bindings, or `force` is set), the
  system removes the menu row and all of its location-binding rows
  (`deleteMenu`, `menu-service.ts:493-496`).
- REQ-11: The system resolves the menu bound to a given location into a `ResolvedNav` tree,
  resolving `url` targets to their stored href directly and every other target kind through an
  injected `resolveTargetHref` function, marking any target that resolver returns `null` for as
  `available: false, href: null` without dropping the node or halting resolution of siblings
  (`resolveForLocation`/`resolveItem`, `resolver.ts:107-223`).
- REQ-12: The system computes `isCurrent` (href equals the given `currentPath`) and `isActive`
  (`isCurrent` OR any descendant `isActive`) for each resolved item
  (`resolveItem`, `resolver.ts:209-211`).
- REQ-13: The system exposes six HTTP routes under
  `/api/admin/v1/workspaces/:workspaceId/menus[...]` (list, get, create, update-tree,
  assign-location, delete), each returning `404` when the `:workspaceId` path param does not
  match the server's configured workspace id, before any auth or business-logic check runs
  (every route file, e.g. `create.ts:19-24`).
- REQ-14: The system authorizes every one of the six routes against the single permission
  string `navigation.manage`, returning `403` with `{ code: "FORBIDDEN", details: { permission,
  reason } }` when the calling principal's `authorize()` result is not `allowed`
  (every route file's `authResult.allowed` check, e.g. `create.ts:36-49`).
- REQ-15: The admin UI list screen fetches and displays every menu in the workspace, lets the
  operator type a location key and assign it inline, and toggles a row's delete action between
  "Trash" and "Delete permanently" based on the menu's `status`
  (`Menus.tsx:10-108`).
- REQ-16: The admin UI tree editor renders items recursively with label/target-kind/target-value
  fields, add-child/remove/move-up/move-down controls, and a single "Save" action that calls
  create (new menu) or whole-tree update (existing menu) depending on whether a menu id is
  present (`MenuEditor.tsx:105-323`).

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a valid workspace id, title, and slug with no `items`, when
  `createMenu` is called, then the returned menu has `status: "draft"`, `locations: []`,
  `version: 1`, and `doc.items: []`.
- AC-02 (REQ-01) [P1]: Given the same input but with a two-item `items` array, when
  `createMenu` is called, then the returned menu's `doc.items` has length 2 and both items
  retain their submitted `id`s.
- AC-03 (REQ-02) [P1]: Given a menu already exists in workspace `ws-1` with slug `primary-nav`,
  when `createMenu` is called again with the same workspace and slug, then it rejects with
  `MenuConflictError` and no second menu row is created.
- AC-04 (REQ-03) [P1]: Given a tree containing two items with the same `id`, when create or
  update validation runs, then it rejects with `MenuValidationError` and the whole write is
  rejected atomically (the target menu's stored `version`/`items` are unchanged).
- AC-05 (REQ-03) [P1]: Given a tree nested 7 levels deep (root = depth 1, default max 5), when
  update validation runs, then it rejects with `MenuValidationError` before any node is
  persisted.
- AC-06 (REQ-04) [P1]: Given an item with `target: { kind: "url", href: "javascript:alert(1)" }`,
  when validation runs, then it rejects with `MenuValidationError` and the HTTP layer returns
  `400`.
- AC-07 (REQ-04) [P1]: Given an item with `target: { kind: "dynamicQuery" }`, when validation
  runs, then it rejects with a `MenuValidationError` whose message names it a "reserved seam …
  not supported yet" (distinct wording from an unknown-kind rejection).
- AC-08 (REQ-05) [P1]: Given a menu at `version: 1`, when `updateMenuTree` is called with
  `expectedVersion: 1` and a 2-item tree, then the stored menu becomes `version: 2` with the
  new 2-item tree, and the HTTP `PUT` returns `200`.
- AC-09 (REQ-05) [P1]: Given the same menu is now at `version: 2`, when a second `PUT` is sent
  with a stale `expectedVersion: 1`, then the server returns `409` and the stored menu is
  unchanged (still `version: 2` with the first update's tree).
- AC-10 (REQ-06) [P1]: Given a fresh menu with no locations, when `assignLocation` binds it to
  `"primary"`, then the returned menu's `locations` includes `"primary"` and
  `bindingRepo.findByLocation({..., locationKey: "primary"})` returns a row pointing at that
  menu's id.
- AC-11 (REQ-07) [P1]: Given menu A is bound to `"primary"`, when menu B is assigned to
  `"primary"`, then the binding index points at menu B exclusively, menu B's `locations`
  includes `"primary"`, menu A's `locations` no longer includes `"primary"`, and the call
  returns menu A as `displacedMenu` (not `null`).
- AC-12 (REQ-08) [P1]: Given a non-trashed menu, when `deleteMenu` is called once, then the
  response has `purged: false` and the returned menu has `status: "trash"`; the menu row still
  exists in the repo.
- AC-13 (REQ-09) [P1]: Given a trashed menu still bound to `"primary"` and `force` is not set,
  when `deleteMenu` is called a second time, then it rejects with `MenuLocationBoundError`
  whose `boundLocations` equals `["primary"]`, and the HTTP layer returns `409` with that array
  in the JSON body; the menu row still exists.
- AC-14 (REQ-10) [P1]: Given the same trashed, bound menu, when `deleteMenu` is called with
  `force: true`, then the response has `purged: true`, the menu row is removed from the repo,
  and no binding row for that menu remains in `bindingRepo.listByMenu(...)`.
- AC-15 (REQ-11) [P1]: Given a menu bound to `"primary"` with a `url` item and an `entryRef`
  item whose id starts with `deleted-`, when `resolveForLocation` runs against a fake resolver
  that returns `{ path, available: false }` for `deleted-*` ids, then the resolved tree has 2
  items where the `url` item is `available: true` with its literal href, and the `entryRef`
  item is `available: false` with `href: null` — and resolution of the remaining tree
  continues (does not throw).
- AC-16 (REQ-11) [P2]: Given no menu is bound to a location, when `resolveForLocation` is
  called with that `locationKey`, then it returns `null`.
- AC-17 (REQ-12) [P1]: Given a menu item with `target: { kind: "route", route: "home" }`
  resolving to `"/"`, when `resolveForLocation` is called with `currentPath: "/"`, then that
  item's `isCurrent` and `isActive` are both `true`, and a sibling item resolving to a different
  path has both `false`.
- AC-18 (REQ-13) [P1]: Given a request path whose `:workspaceId` does not equal the server's
  configured workspace id, when any of the six menu routes is called, then the response is
  `404` with `{ error: "workspace was not found" }`, regardless of auth state.
- AC-19 (REQ-14) [P1]: Given an authenticated principal with zero permission grants, when that
  principal calls any of the six menu routes (list/get/create/update/assign/delete), then every
  one returns `403` with `code: "FORBIDDEN"` and `details.permission === "navigation.manage"`,
  and no menu state changes as a result of any denied mutation attempt.
- AC-20 (REQ-14) [P1]: Given the workspace owner principal (wildcard `*` grant), when the same
  six routes are called with valid inputs, then every one succeeds with its documented status
  code (`201` create, `200` list/get/update/assign/first-delete, `409` blocked purge, `200`
  force-purge).
- AC-21 (REQ-15) [P2]: Given the list screen has loaded menus, when the operator types a
  location key into a menu's row and clicks "Assign", then the UI calls
  `POST .../menus/:menuId/locations` with that key and re-fetches the list on success.
- AC-22 (REQ-16) [P2]: Given the editor is in create mode (`menuId === null`), when the operator
  clicks "Save", then the UI calls `createMenu` (not `updateMenuTree`) and navigates to
  `#/menus/:newId` on success.

---

## Invariants

- INV-01: A menu's `version` must never decrease and must increment by exactly 1 on every
  successful `updateMenuTree`, `assignLocation` (on the assigned menu, and on a displaced menu
  when one exists), or `deleteMenu` (trash step) call (`menu-service.ts`, every mutating
  function's `version: existing.version + 1` / `menu.version + 1`).
- INV-02: The `nav_location_bindings`-equivalent index must never hold more than one row for a
  given `(workspaceId, locationKey)` pair — `InMemoryNavLocationBindingRepo.upsert` always
  replaces, never appends, the existing row for that key (`repo.memory.ts:159-184`).
- INV-03: Every node in a stored menu tree must have a non-empty `id` that is unique within
  that tree at the time of the write that stored it (`validateAndCloneTree`,
  `menu-service.ts:117-123`) — this is enforced per-write, not diffed across edits (see
  Deviation D-7).
- INV-04: A menu purge must never remove the menu row while any `nav_location_bindings`-
  equivalent row still references that menu's id, unless the caller passed `force: true`
  (`deleteMenu`, `menu-service.ts:480-491`).
- INV-05: `resolveForLocation` must never throw when a target fails to resolve — an
  unresolvable target always yields `{ available: false, href: null }` on that node only, and
  sibling/ancestor resolution always continues (`resolveItem`, `resolver.ts:199-207`).
- INV-06: Every one of the six HTTP routes must check `authorize()` for `navigation.manage`
  before performing any read of menu data or any mutation (every route file's ordering: auth
  check precedes `deps.menuRepo`/`menu-service.ts` calls).

---

## Edge Cases

- EC-01: What happens when the submitted `items` field on create/update is present but is not
  an array (e.g. an object or string)?
  Expected behavior: the route returns `400` with `{ error: "items must be an array" }` before
  calling into `menu-service.ts` at all (`create.ts:25-29`, `update-tree.ts:32-35`).
- EC-02: What happens when `assign-location` is called with an empty or whitespace-only
  `locationKey`?
  Expected behavior: the route trims the value and returns `400` with `{ error: "locationKey is
  required" }` without calling `assignLocation` (`assign-location.ts:21-25`).
- EC-03: What happens when a menu's title is empty or its slug contains uppercase letters,
  spaces, or symbols outside `[a-z0-9-]`?
  Expected behavior: `assertValidTitleAndSlug` throws `MenuValidationError` ("title is
  required" or "slug must use lowercase letters, numbers, and dashes"), mapped to `400`
  (`menu-service.ts:154-159`).
- EC-04: What happens when `deleteMenu` is called with an `id` that does not exist in the
  repo?
  Expected behavior: rejects with `MenuNotFoundError`, mapped to `404`
  (`menu-service.ts:466-467`, `delete.ts:62-64`).
- EC-05: What happens when `assignLocation` targets a `menuId` that does not exist?
  Expected behavior: rejects with `MenuNotFoundError` before any repo write, mapped to `404`
  (`menu-service.ts:372-373`).
- EC-06: What happens when `updateMenuTree`'s new `slug` collides with a *different* existing
  menu's slug in the same workspace?
  Expected behavior: rejects with `MenuConflictError`, mapped to `409`; a no-op slug (same as
  the menu's own current slug) is exempted from the collision check
  (`menu-service.ts:293-298`).
- EC-07: What happens when the resolver's injected `resolveTargetHref` returns `null` for a
  `termRef` target (the real-world case today, since no term-ref schema exists)?
  Expected behavior: the item resolves to `available: false, href: null`, identically to any
  other unresolvable target — the resolver code has no `termRef`-specific branch
  (`resolver.ts:193-207`, confirmed by `resolver.test.ts`'s dedicated `termRef` test).
- EC-08: What happens when the location-binding index has a row pointing at a `menuId` the menu
  repo no longer has (a stale/orphaned derived row)?
  Expected behavior: `resolveForLocation` returns `null` rather than throwing — a missing menu
  behind a binding is treated as "no menu for this location," not an error
  (`resolver.ts:119-120` doc comment + code).
- EC-09: What happens when an admin submits a menu item whose `label` is omitted?
  Expected behavior: the resolved item's `label` is the empty string `""` — there is no
  fallback to the target's title (documented gap, `resolver.ts:163-170`, `INFO.md` "Known
  simplifications").
- EC-10: What happens when two admins call `updateMenuTree` concurrently against the same
  starting version?
  Expected behavior: the first write to reach the repo succeeds and advances the version; the
  second fails `MenuConflictError`/`409` because its `expectedVersion` is now stale — proven by
  `menu-service.test.ts`'s "rejects a stale expectedVersion" test and the route test's "stale
  OCC is rejected" case.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `src/identity` (`authorize()`, `permissions.ts`) | Session-based auth + the `navigation.manage` permission check gating every route | If `identity` is unavailable, `getAuthedPrincipal`/`authorize` throw or the request never reaches a resolved principal; the route's try/catch maps any non-typed thrown error to `500` | None — every route hard-depends on `deps.authorize`/session middleware; there is no unauthenticated fallback path |
| `MenuRepoPort` (`InMemoryMenuRepo`, `repo.memory.ts`) | In-process menu storage for the app's lifetime | Data does not survive a process restart (in-memory only, no SQLite adapter exists) | None — this is a named, documented v1 limitation, not a runtime fallback |
| `NavLocationBindingRepoPort` (`InMemoryNavLocationBindingRepo`) | The one-menu-per-location uniqueness index | Same as above — in-memory only, lost on restart | None (declared "rebuildable from menu entries" by ADR-029, but no rebuild caller exists in shipped code — see Deviation D-8) |
| Injected `ResolveTargetHrefFn` (test/dev fake today; `src/routing`'s real `urlFor` is the intended production implementation per `resolver.ts`'s file header) | Resolves `entryRef`/`termRef`/`route` targets to a concrete path + availability | If the injected function is absent or misconfigured, every non-`url` target resolves to `available: false` (same code path as a real "not found") — no distinct error surfaces | Graceful degradation is the fallback by design (INV-05); there is no retry |
| `apps/admin/src/lib/api` (frontend HTTP client, not read in full for this pass but referenced by `Menus.tsx`/`MenuEditor.tsx`) | Typed fetch wrappers (`listMenus`, `createMenu`, `updateMenuTree`, `assignMenuLocation`, `deleteMenu`, `getMenu`) the admin UI calls | A network/API failure surfaces as a caught `Error`, shown via the screen's generic `error`/`notice error` banner | None — no offline queue or retry in the shipped UI |

---

## Open Questions

- OQ-01: Should the shipped `navigation.manage` permission be split into the ADR-029 §8
  catalog (`navigation.read/create/update/delete/delete.force/assign`) now, or is a single
  flat permission an accepted, permanent simplification for v1? — Owner: Coordinator /
  feature owner — Resolve by: 2026-08-01.
- OQ-02: Should `navigation.manage` be renamed to `admin.menus.manage` to match the
  `admin.{section}.{action}` convention frozen the same day ADR-029 shipped (see Deviation
  D-2), and if so, is that a breaking grant-migration the team is willing to run? — Owner:
  Coordinator — Resolve by: 2026-08-01.
- OQ-03: Is the unreachable `"published"` `MenuStatus` value (declared in `types.ts`, never
  set by any code path — see Deviation D-10) intentional forward-reservation, or a missed
  publish-flow requirement? — Owner: feature owner — Resolve by: 2026-08-01.

---

## Constitution Compliance

Completed by the Spec Agent. Verified by the Software Architect Agent.
Any EXCEPTION requires a justification row in the ADR's Complexity Justification table.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No custom implementation stands in for a maintained library here — tree walking/validation and Express routing are ordinary application code, not a solved external problem. |
| II — Test-First | EXCEPTION | This is retroactive documentation of already-implemented, already-tested code (`menu-service.test.ts`, `resolver.test.ts`, `admin-menus-routes.test.ts` all pass today) — the spec was written *after* the tests and code, not before. This inverts Article II's normal ordering by construction of this task (as-built backfill), not by a process failure on a forward feature. |
| III — Simplicity Gate | COMPLIES | Every module traces to an ADR-029 decision point (menu-as-entry-stand-in repo, one binding-index port, one resolver evaluator) — no speculative abstraction beyond what ADR-029 §5 already justifies. |
| IV — Anti-Abstraction Gate | COMPLIES | `NavLocationBindingRepoPort` has one real adapter today (in-memory); ADR-029 §5 documents the rule-of-two plan (SQLite is the named second adapter, not yet built) — an accepted single-adapter port under the constitution's exception process, already justified in the ADR rather than needing a fresh justification here. |
| V — Integration-First Testing | COMPLIES | `admin-menus-routes.test.ts` exercises every P1 AC at the real HTTP route (create→list→get→update→assign→delete ladder, 403/404 cases) — not unit-only. |
| VI — Security-by-Default | EXCEPTION (STANDING, v1 — matches the ratified constitution's own Art. VI exception) | Auth/authz *is* enforced (`navigation.manage` via `authorize()` on every route) — the standing exception here is narrower: this is still the local dev server (SPEC-001…005's documented no-deployment-beyond-local-dev posture), and the permission model is a single flat grant rather than the split ADR-029 §8 catalog (see Deviation D-1/D-9). |
| VII — Spec Integrity | COMPLIES | This spec cites its own `spec_id`/`content_hash`; downstream artifacts (none yet — this is the first spec for this feature) will reference `SPEC-012` at this hash going forward. |
| VIII — Observability | EXCEPTION | ADR-029 §8 names outbox events (`navigation.menu.created`, etc.) as in-scope; the shipped code declares the event-name constants (`contracts.ts`) but no code path publishes them — write paths are not currently observable via events. Deferred, matching the Article VIII exception process (deferral named, no owner yet assigned in code — see Deviation D-11/Scope). |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (verified against existing `ADS-project-knowledge/reports/pipeline/` folders — `012-menus` was not previously used; `010`/`011` do not exist yet, `012` was the fixed identifier given for this task)
- [x] version set to correct semver (1.0.0 — first version of this spec)
- [x] status set to APPROVED — with the as-built caveat spelled out in Overview (see header note; this is not a forward pre-implementation gate)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly (`FEAT-012-menus` / `012-menus`)
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
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
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has real ordering/precedence/limit/tie-break rules)
- [x] traceability.spec.md complete (as-built — every row cites the real impl file/function/test today, not "pending")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield/reverse-spec evidence paths recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Task-specific boundary rules that override or supplement global AGENTS.md rules for this spec only.

Always:
- Treat this package as a description of what runs today, not a design proposal — any future
  change to Menus behavior is a *new* spec revision (or a new spec), not a silent edit here.
- Preserve every Deviation entry (`spec-manifest.md`) verbatim when this spec is revised —
  resolving one requires an explicit decision recorded in the Amendment history, not deletion.

Ask before:
- Renaming `navigation.manage` to `admin.menus.manage` (OQ-02) — this is a breaking permission-
  grant migration per the frozen convention's own stated rationale
  (`sweep-crosscutting-decisions-20260710.md` §E).

Never:
- Do not "fix" the code-vs-ADR-029 deviations by editing this spec to match the ADR's original
  intent instead of the running code. This package's job is fidelity to what ships today.
