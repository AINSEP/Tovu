# Behavior Rules Spec: Menus (Navigation)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-012 |
| feature_name | FEAT-012-menus |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-13T00:00:00Z |

**Purpose:** Menus has real precedence (location reassignment), ordering (item tree array
order), non-obvious defaults (depth/count limits), and a two-source-of-truth invariant
(menu-field `locations` vs. the derived binding index) — this file exists per the template's
own "always create if" rule. Every rule below is EARS-phrased and cited to the real code that
implements it.

---

## 1. Precedence Rules

### 1.1 Location Ownership — Last-Writer-Wins Reassignment

**Situation:** A theme location key (e.g. `"primary"`) can be bound to at most one menu at a
time (enforced by the binding index). When `assignLocation` is called for a location already
bound to a *different* menu, the system must decide which menu keeps it.

**Sources in precedence order (highest to lowest):**
1. The **most recent successful `assignLocation` call** for that `(workspaceId, locationKey)`
   pair — whichever menu was assigned last always wins the binding.
2. There is no second source — this is a pure last-writer-wins rule, not a fallback chain.
   ADR-029 §Open item 1 named "hard 409 reject instead of reassign" as an alternative the owner
   never ruled on; the shipped code implements reassignment, not rejection.

**Example:**
- Scenario: Menu A is bound to `"primary"`. An operator assigns Menu B to `"primary"`.
- Input: `assignLocation({ menuId: B, locationKey: "primary" })` while the binding index still
  points at A.
- Result: The binding index now points at B; Menu A's `locations` array has `"primary"`
  removed and its `version` increments; Menu B's `locations` array gains `"primary"` and its
  `version` increments. The call returns Menu A as `displacedMenu` (not silently — the caller
  can see what was bumped).

**Test requirement:** Verified directly by `menu-service.test.ts`'s "assignLocation reassigns a
location already bound elsewhere" test and the route-level test's "assign location" case.

**WHEN** `assignLocation` is called for a location key already bound to a different menu, **the
system shall** overwrite the binding-index row to point at the new menu, remove the location
key from the previously-bound menu's own `locations` field, and increment that menu's version —
**never** reject the call with a conflict error.

---

## 2. Ordering Rules

### 2.1 Item Tree Order

**Field used for ordering:** none — order is positional, not a sort key. **Ordering = array
order** among sibling items in `NavItemNode[]` (`types.ts:117-119` doc comment); nesting is
expressed via `children`.

**Direction:** Whatever order the caller submits the array in — the system does not re-sort by
any field.

**Stability:** A whole-tree replace (`updateMenuTree`) persists exactly the array order it
receives, unchanged. There is no server-side reordering, deduplication-by-content, or
alphabetizing at any point.

**When overridden:** The admin UI's `↑`/`↓` controls (`MenuEditor.tsx`'s `moveAtPath`) are the
only "reordering" affordance, and they operate purely on the client-side `items` array before
Save — the server has no concept of "the previous order" once a new array arrives; a `PUT`
simply stores whatever order it is given.

**Invariant:** The order returned by `MENU_GET`/`MENU_LIST` (`AdminMenuDto.items`) is always
exactly the order last stored by the most recent successful `updateMenuTree`/`createMenu` call
— **the system shall never** reorder items server-side.

### 2.2 Processing Order — Tree Validation Walk

**Context:** When `validateAndCloneTree` validates a submitted tree, in what order are nodes
checked?

**Order:** Depth-first, pre-order: each node is validated (id presence/uniqueness, target
shape) before its `children` are recursed into (`menu-service.ts:108-129`, the `walk` function).

**Tie-break:** Not applicable — there is no competition between nodes; the walk is
deterministic given the input array's order.

**Invariant:** **The system shall** count every visited node toward `maxItemCount` and check
`maxDepth` before descending into any node's children — a node whose own depth exceeds the
limit throws before any of its children are visited, so a single grossly-over-limit subtree
cannot partially validate.

### 2.3 Resolution Order — `resolveForLocation`

**Context:** When resolving a bound menu's tree into `ResolvedNav`, in what order are sibling
items and their children resolved?

**Order:** Depth-first, in stored array order, each `await`-ed sequentially (not
`Promise.all`-parallelized) — `resolveItemList` (`resolver.ts:143-153`) awaits one node's full
subtree resolution (including its injected `resolveTargetHref` call) before moving to the next
sibling.

**Invariant:** **The system shall** preserve the stored item order in the resolved output —
`ResolvedNav.items[i]` always corresponds to `doc.items[i]` at the same tree position.

---

## 3. Default Values

| Field | Scope | Default Value | Why (as the code documents it) |
|-------|-------|---------------|-----|
| `maxDepth` (`TreeValidationLimits.maxDepth`) | `validateAndCloneTree` (create/update) | `5` (`DEFAULT_MAX_TREE_DEPTH`, `menu-service.ts:67`) | ADR-024's totality/boundedness amendment requires a bounded tree so validation stays declarative-tier-safe (no unbounded recursion/DoS surface) |
| `maxItemCount` (`TreeValidationLimits.maxItemCount`) | `validateAndCloneTree` (create/update) | `500` (`DEFAULT_MAX_ITEM_COUNT`, `menu-service.ts:69`) | Same bounded-totality rationale — caps total node count regardless of shape |
| `items` (create) | `CreateMenuServiceInput.items` | `[]` (empty tree) | "Optional initial tree; defaults to an empty menu" (`menu-service.ts:175` doc comment) — a menu is a valid, save-able entity before any items are added |
| `status` (create) | `NavMenuEntry.status` | `"draft"` | `createMenu` always sets `status: "draft" as MenuStatus` (`menu-service.ts:215`) — there is no create-time "publish immediately" option |
| `locations` (create) | `NavMenuEntry.locations` | `[]` | A new menu is not bound to any location until an explicit `assignLocation` call |
| `version` (create) | `NavMenuEntry.version` | `1` | First-write baseline for the OCC counter |
| `force` (delete query param) | `MENU_DELETE` query param | `false` | `String(req.query.force ?? "") === "true"` — any absent/non-`"true"` value defaults to the safer (blocked-purge) path (`delete.ts:22`) |
| `expectedVersion` (update, when malformed) | `MENU_UPDATE_TREE` body field | `0` (via `Number(req.body?.expectedVersion ?? 0)`) | Not a deliberate design default — a missing/non-numeric value coerces to `0`, which will always fail OCC against a real menu (whose version starts at `1`), so this "default" fails safe rather than silently succeeding (`update-tree.ts:62`) |
| `label` (resolved item, when absent) | `ResolvedNavItem.label` | `""` (empty string) | Documented gap, not a considered default: the intended behavior (fall back to the target's title) is unimplemented because the injected resolver seam does not return title metadata yet (`resolver.ts:163-170`) |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Max menu-tree nesting depth | 5 (root = depth 1) | `menu-service.ts` (`validateAndCloneTree`), both create and update | Configurable per-call via `TreeValidationLimits.maxDepth`, but no route ever passes a non-default value — the effective limit in production is always 5 |
| Max total items per tree | 500 | Same function | Configurable via `maxItemCount`; same note — no route overrides it |
| Slug character set | `^[a-z0-9-]+$` | `assertValidTitleAndSlug`, `menu-service.ts:156` | Rejected with `MenuValidationError`, mapped to `400`; not clamped or auto-corrected |
| `url` target scheme denylist | `javascript:`, `data:`, `vbscript:` (case-insensitive prefix match) | `validateTarget`, `menu-service.ts:71,144-150` | Denylist, not allowlist — any scheme not in this list (including unusual ones) passes validation |
| Item `id` uniqueness | Unique within the submitted tree | `validateAndCloneTree`'s `seenIds` set | Enforced per-write only — does not check uniqueness against the *previous* stored tree beyond what the new tree itself contains |
| Location key emptiness | Non-empty after `.trim()` | `assign-location.ts:21-25` | No max length, no character-set restriction beyond non-emptiness |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate

A menu is a duplicate of an existing menu **if and only if** it shares the same
`(workspaceId, slug)` pair (`findBySlug`, checked in both `createMenu` and, on rename, in
`updateMenuTree`). Title collisions are never checked — two menus may share an identical
`title` with different slugs. Item-level content is never deduplicated — a tree may legally
contain two items with identical `label`/`target` as long as their `id`s differ.

**Not a duplicate if:** the existing menu with that slug is the *same* menu being updated
(`updateMenuTree` exempts `duplicate.id === existing.id`, `menu-service.ts:294-297`) — there is
no status-based exemption (unlike, e.g., ADR-027 media's archived/failed exemption pattern) —
a trashed menu's slug still blocks a new menu (or another menu's rename) from claiming it, since
`findBySlug` does not filter by `status`.

### 5.2 How Duplicates Are Handled

**At creation time:** `createMenu` returns `MenuConflictError` (mapped to `409`); no row is
created.

**At update time (rename):** `updateMenuTree` returns `MenuConflictError` (mapped to `409`)
only when the new slug differs from the menu's own current slug and collides with a *different*
menu; the write is entirely rejected (no partial title-only update).

**User-facing behavior:** Both `Menus.tsx` and `MenuEditor.tsx` surface the raw error string in
a generic banner — there is no field-level "slug already exists" inline error distinct from any
other failure.

### 5.3 Idempotency vs. Deduplication

There is no `Idempotency-Key` concept anywhere in the Menus HTTP surface — repeating an
identical `POST /menus` body twice (same title/slug/items) creates one menu on the first call
and a `409` on the second, exactly like any other slug collision. This is deduplication-by-slug
behaving as accidental idempotency, not a designed idempotency mechanism.

---

## 6. Tie-Break Logic

### 6.1 Concurrent `updateMenuTree` Against the Same Starting Version

**When does this apply:** Two callers both read a menu at `version: N` and both submit
`updateMenuTree` with `expectedVersion: N`.

**Tie-break rule:** Whichever write reaches the in-memory repo's `findById`/version-check
first wins — its write succeeds, advances the stored version to `N+1`, and the second caller's
write (evaluated against the now-stale `version: N` it read) fails with `MenuConflictError`.
Since `InMemoryMenuRepo` has no locking, this is a pure race on Node's single-threaded event
loop ordering — whichever `updateMenuTree` call's `await deps.repo.findById(...)` resolves and
re-checks the version first (deterministic in practice for sequential `await`s, but not an
explicit designed tie-break rule beyond "first past the version check wins").

**Rationale:** This is optimistic concurrency control, not a designed tie-break preference
between the two callers — neither caller is favored by identity; only arrival order matters.

**Invariant:** **The system shall never** apply both writes — exactly one of the two concurrent
`updateMenuTree` calls against the same `expectedVersion` succeeds; the other always observes a
`MenuConflictError`. Verified by `menu-service.test.ts`'s "rejects a stale expectedVersion" test.

### 6.2 Concurrent `assignLocation` for the Same Location Key

**When does this apply:** Two operators both call `assignLocation` for the same
`(workspaceId, locationKey)` targeting two different menus, in quick succession.

**Tie-break rule:** Whichever call's `bindingRepo.upsert` executes last wins the binding —
this is the same last-writer-wins rule as §1.1, but note it is **not** OCC-guarded the way
`updateMenuTree` is: there is no `expectedVersion` concept for a location assignment, so the
"loser" call does not fail — it silently succeeds in binding its menu, immediately followed (or
preceded) by the other call doing the same, with whichever ran last simply winning the
binding-index row. Both calls return `200`; only inspecting the binding index afterward reveals
which one "won."

**Rationale:** Documented as an accepted gap, not a design decision defended anywhere in the
code — `assignLocation`'s own doc comment (`menu-service.ts:349-365`) names the lack of a real
transaction as tech debt, but does not discuss the assign-vs-assign race specifically.

**Invariant:** The binding index never ends up with two rows for the same location key (§INV-02
in `feature.spec.md`/`state.spec.md`), even under this race — `upsert`'s replace-not-append
semantics hold regardless of call ordering.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| Item tree submitted with exactly `maxDepth` (5) levels | Accepted — the depth check is `depth > maxDepth`, so depth 5 itself passes (`menu-service.ts:109`) | Yes (not directly covered by the existing test suite, which only tests depth 7 rejection — a coverage gap, noted in `traceability.spec.md`) |
| Item tree submitted with `maxDepth + 1` (6) levels or deeper | Rejected with `MenuValidationError` | Yes — covered (`menu-service.test.ts` "rejects a tree nested past the max depth" uses depth 7) |
| Item tree with exactly `maxItemCount` (500) items | Accepted | No — not covered by any existing test (coverage gap) |
| Item tree with `maxItemCount + 1` items | Rejected with `MenuValidationError` | No — not covered by any existing test (coverage gap) |
| Slug submitted with trailing/leading whitespace | Trimmed then validated — `"  my-menu  "` becomes `"my-menu"` before the regex check (`menu-service.ts:202`/`290`) | No explicit test found for this exact case, but the code path is direct (`.trim()` unconditionally applied) |
| `url` target with an uppercase scheme (e.g. `"JAVASCRIPT:alert(1)"`) | Rejected — the check lowercases the href before comparing against the denylist (`menu-service.ts:145`) | No — only the lowercase form is tested; the uppercase path is implied by the code, not proven by a test (coverage gap) |
| `assignLocation` called twice in a row for the same menu and the same location it already holds | Succeeds both times (idempotent for the *same* menu): `menu.locations.includes(input.locationKey)` guards against a duplicate entry in the array (`menu-service.ts:402-404`), and the binding-index `upsert` just re-writes the same row | No dedicated test found for the same-menu-re-assign case (coverage gap) |
| `deleteMenu` called on a menu with zero location bindings | Purges immediately on the *second* call with no `409` (the `bindings.length > 0` guard is simply false) — first call still only trashes | Yes — covered (`menu-service.test.ts` "deleteMenu purges once unassigned") |

<!-- Coverage gaps identified above are carried into traceability.spec.md Section 6.2/6.4 rather than silently left implicit. -->
