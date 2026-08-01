# Admin adversarial UX audit — fixes applied

Date: 2026-08-01
Implementer: dispatched Sonnet 5 programmer subagent
Spec: `ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`

Scope note: `admin-makeover-canary` was concurrently editing `apps/admin/src/{App.tsx, nav.ts,
components/Sidebar.tsx, components/ChatFab.tsx, components/AssistantDock.tsx,
styles/assistant.css, sections/Media.tsx, hooks/use-sidebar-rail.hooks.ts, styles.css}` throughout
this work — those files show as modified in `git status` because it's a shared working tree, not
because this dispatch touched them. Everything below is a file this dispatch actually changed.

---

## (1) Destructive-action confirmation — cross-cutting finding #1

**Found**: confirmation was a coin flip. `window.confirm` (or better) existed on Comments,
Integrations, Media, Menus, WidgetsLibrary, plus FormEditor's two-click in-place pattern and
Collections' lifecycle dialog. Missing entirely on Roles.tsx (delete role, delete policy),
Redirects.tsx (delete rule), and single-click Disable on Users.tsx/Members.tsx.

**Changed**: new `apps/admin/src/components/ConfirmButton.tsx` — a two-click in-place confirm
control generalizing `FormEditor.tsx`'s existing "Delete submission" → "Confirm delete" pattern.
Chosen over `window.confirm` or a new modal dialog: `styles.css` was locked so no new dialog CSS
was possible, and `window.confirm` can't carry destructive-vs-warning styling or a
screen-reader-specific announcement. Armed state disarms on Escape, an outside click, or blur;
announces via a `.visually-hidden` `role="status"` live region (reused an existing class, added no
CSS). `destructive` prop applies the existing `.btn-danger`; left `false` for
reversible-but-access-affecting actions (Disable, Reset password) per the audit's
destructive-vs-warning distinction.

Wired into: `Roles.tsx` (Delete role, Delete policy — destructive, per-row `aria-label` naming the
role/policy), `Redirects.tsx` (Delete rule — destructive), `Users.tsx` (Disable, and Reset
password — both warning-toned), `Members.tsx` (Disable — warning-toned).

**Deliberately not changed**: the 7 screens already guarded (Comments, Integrations, Media, Menus,
WidgetsLibrary, FormEditor, Collections) — churn avoidance per the dispatch brief.

**Tests**: `components/__tests__/ConfirmButton.unit.test.tsx` (9 tests: arm/confirm/disarm via
Escape/outside-click/blur, pending state, destructive styling, custom aria-label).

---

## (2) Dashboard.tsx — no error handling

**Found**: two `useEffect` fetches (`listPosts`, `getPresentation`) had no `.catch()`. A failed
request left both stat cards showing "…" forever with no indication anything was wrong.

**Changed**: added `.catch()` to both, each with its **own** error state (`postsError`,
`themeError`) rather than one shared `error` — a failure in one card must not blank the other's
already-loaded data, same principle as Pages.tsx/Posts.tsx's `error && !data` guard, expressed
per-card since Dashboard has no single page-level load to gate. Errors render via the existing
`notice error` convention with `role="alert"`.

**Deliberately not changed**: "Your public site is live." is still an unconditional, unverified
claim (a separate Minor finding) — fixing it needs a real health-check call, new scope beyond "add
error handling to these two fetches."

**Tests**: `sections/__tests__/Dashboard.unit.test.tsx` (4 tests).

---

## (3) `/admin/newsletter` renders a raw error banner

**Found**: `Placeholder.tsx` looked up sections in `src/admin-shell/navigation.ts`'s
`adminSections` — a separate, stale 12-item registry (its own header already discloses `nav.ts` is
the real source of truth) that never had `newsletter` added. A `soon: true` nav item fell through
to the same "Unknown section" error as a genuine typo'd id.

**Changed**: `Placeholder.tsx` now looks up the id in `nav.ts`'s own `NAV` export (a read-only
import — `nav.ts` itself is locked and untouched). A `soon: true` item found there renders "`<Label>`
is coming soon."; an id matching nothing in `NAV` still renders "Unknown section: X". No edits to
`App.tsx`/`nav.ts` were needed — this closed the root cause entirely within the unlocked file.

**Left alone**: `src/admin-shell/navigation.ts` itself — a separate integration test
(`recovery-route.integration.test.ts`) asserts against its content directly; `Placeholder.tsx` just
stopped consuming it.

**Tests**: `sections/__tests__/Placeholder.unit.test.tsx` (3 tests, reproduces the live bug as a
regression test).

---

## (4) Centralize `describeApiError` — cross-cutting finding #2

**Found**: 23 files had their own local `describeApiError`. 16 were byte-identical boilerplate
(the base `ApiError`/`Error`/fallback chain); 7 layered real per-`code` overrides on top of that
same boilerplate. Raw server strings reached the operator on any screen whose author forgot to add
the local helper at all.

**Changed**: added `export function describeApiError(e, fallback)` to `lib/api.ts` (the base
case). Migrated all 22 non-locked files (Media.tsx is locked, left with its own local copy):
- 15 files with the identical generic body (Recovery, Taxonomy, WidgetRegions,
  WidgetRegionEditor, CollectionEntryEditor, Database, Collections, WidgetPickerDialog, Seo,
  Comments, CollectionEntries, WidgetInstanceEditor, widget-embed-extension, WidgetsLibrary,
  Redirects) — deleted the local function, import the shared one directly.
- 7 files with real overrides (Roles, AiAssistant, Settings, Workspace, Members, Plugins, Users) —
  kept every existing message verbatim, refactored to check their own codes first and fall through
  to the shared default instead of reimplementing the base case.

**Divergence found and preserved, not unified**: `RESOURCE_CONFLICT` means three different things
depending on screen — "still referenced by an assignment/attachment" (Roles.tsx), "that slug is
already in use" (Workspace.tsx), "that username is already in use" (Users.tsx). `FORBIDDEN` has
one divergence too: AiAssistant.tsx names the specific setting rather than using the generic
wording. Documented both directly in `describeApiError`'s own JSDoc and at each of the three
`RESOURCE_CONFLICT` sites, per the audit's explicit instruction to keep divergent behaviors rather
than silently picking one.

**Deliberately not changed**: 14 screens (Pages, Posts, PostEditor, Dashboard, FormEditor,
MenuEditor, Menus, Integrations, IntegrationDeliveries, Analytics, Appearance, FormsList, Login,
WidgetConfigFields) that never had a local `describeApiError` — nothing there to consolidate;
migrating them to the shared helper is a genuine but separate small follow-up (gains
`ApiError`-awareness they don't have today).

**Tests**: `lib/__tests__/api-describe-error.unit.test.ts` (4 tests). `Plugins.unit.test.tsx`'s
pre-existing AC-20 case (PLUGIN_INVALID 422 → exact message) stayed green unchanged, independently
proving the refactor preserved behavior for one of the 7 override files.

---

## (5) Shared `formatTimestamp()` — cross-cutting finding #4

**Found**: `x.slice(0, 16).replace("T", " ")` copy-pasted at 11 call sites across 8 files.

**Changed**: new `lib/format-timestamp.ts` — `formatTimestamp(iso)` reproduces the exact same
output, byte for byte (no behavior change, per the dispatch brief). Migrated all 11 call sites:
Members, CollectionEntries, Comments, IntegrationDeliveries, Pages, Posts, Analytics, Database
(×2), Recovery (×2).

**Proposed, not shipped**: label the zone explicitly (e.g. "UTC" if confirmed), or move to
`Intl.DateTimeFormat` once there's a settings field to read the operator's zone from — either is
now a one-file change.

**Tests**: `lib/__tests__/format-timestamp.unit.test.ts` (3 tests).

---

## (6) Users.tsx internal-constant tooltip

**Found**: `title={user.status === "active" ? "DISABLE_PRINCIPAL" : "ENABLE_PRINCIPAL"}` — the
permission system's internal action name shipped verbatim as a tooltip.

**Changed**: dropped the `title` entirely (closed as part of item 1's ConfirmButton wiring on the
same lines). Chose removal over replacement because `disablePrincipal` in
`identity/admin-crud-service.ts` was verified to NOT revoke active sessions — writing a richer
tooltip claiming a specific behavior would have been a fabricated claim.

**Adjacent findings in the same section, also closed**: "Reset password" had no confirmation
(Minor, same finding-#1 class) — converted to `ConfirmButton`, warning-toned.

**Flagged, not implemented**: the "Create user" password field's `minLength={1}`. Checked the real
server validation (`identity/admin-crud-service.ts:207`, `grant-service.ts:220`): it genuinely only
requires "password is required" — no length/complexity policy at all. This is a confirmed, live
security gap, not just an alleged one. Not implementing a password policy myself — what the actual
minimum should be is a security/product decision requiring both server- and client-side
enforcement, not an implementation detail to invent unilaterally. Recommend routing to whoever owns
security requirements.

---

## (7) Remaining findings, worked by severity within unlocked files

- **CollectionEntries.tsx bogus-content-type trap** (Blocker, exec summary #1) — a nonexistent
  `contentTypeKey` rendered as a real, empty, creatable collection (working "New entry" button, no
  error). The `contentType` state already distinguished `undefined` (loading) from `null` (looked
  up, not found); nothing checked the `null` case. Added the guard, matching
  `CollectionEntryEditor.tsx`'s "Unknown content type" copy one route deeper.
  Test: `sections/__tests__/CollectionEntries.unit.test.tsx` (2 tests).

- **FormEditor.tsx inverted-guard bug** (Blocker, exec summary #3) — `if (!isNew && !form &&
  !error) return <Loading/>` only covered the pre-error state; once `error` was set it fell through
  to a live, empty, saveable form under its own "not found" banner. Added the missing second guard
  (`!isNew && !form && error` → error-only render). Verified this doesn't regress "a later save
  failure keeps the editor on screen" (the `error && !data` principle).
  Test: `sections/__tests__/FormEditor.unit.test.tsx` (2 tests).

- **MenuEditor.tsx "Remove" deletes a whole subtree with no confirmation** (Major) — added
  `window.confirm` naming the exact recursive descendant count, only when the item has children (a
  leaf item stays a bare click, matching `FormFieldsEditor`'s convention for low-stakes removals).
  While testing it, found and fixed a sharper version of the Move-button aria-label finding: the
  Remove button's (✕) accessible name was computing to the glyph itself, not "Remove item" —
  `title` is never used for the accessible name when text content exists. Added `aria-label` to
  both Move buttons (as flagged) and Remove.

- **MenuEditor.tsx unsaved-changes protection** (Major cross-cutting) — see the dedicated
  `useDirtyGuard` section below.

- **Pages.tsx empty-state drift** (Minor) — added a "No pages yet." message, reusing the
  already-existing `.card`/`.empty-state` classes `Posts.tsx` established for the same situation
  (not adding new CSS). Judgment call: ported only the empty-state block, not `Posts.tsx`'s full
  newer `.page`/`.table-scroll` layout — that broader restyle is the canary agent's territory, and
  the audit itself flagged this drift as possibly already slated to change.

- **WidgetInstanceEditor.tsx garbage `?type=`** (Major) — `/widgets/new?type=garbage-nonsense`
  rendered a full live editor shell (title, Save) with zero config fields and zero explanation
  (`WidgetConfigFields`'s switch had no `default` beyond `return null`). Added a closed-set check
  against the 5 real widget types (`WIDGET_TYPE_OPTIONS`), scoped to `isNew` only — an
  already-saved widget's type is server-validated at creation, so loaded data isn't
  second-guessed.
  Test: `sections/__tests__/WidgetInstanceEditor.unit.test.tsx` (3 tests).

- **Unsaved-changes protection** (Major cross-cutting) — new
  `hooks/use-dirty-guard.hooks.ts`: `useDirtyGuard(current, original)` tracks whether the live form
  state has drifted from what was loaded/last saved, wires a `beforeunload` listener while dirty,
  and exposes `confirmLeave()` for an in-app back-link's `onClick`. No `-port`/`-dependencies` pair
  per `apps/admin/INFO.md`'s hook convention — its only outside dependency is the `beforeunload`
  browser built-in, same reasoning `use-sidebar-rail.hooks.ts` already gives for skipping that
  seam. `confirmLeave()`'s caller calls `event.preventDefault()` when the operator cancels, which
  also stops `router.ts`'s document-level click interceptor from firing `navigate()` (it checks
  `event.defaultPrevented` first) — no changes to `router.ts` needed.
  Wired into **MenuEditor.tsx only** (the screen the audit live-verified losing an edit on, along
  with PostEditor): tracks `{title, slug, items}` against a snapshot set on load and refreshed
  after every successful save.
  Tests: `hooks/__tests__/use-dirty-guard.hooks.test.ts` (8 tests, hook in isolation) +
  3 new tests in `sections/__tests__/MenuEditor.unit.test.tsx` (no-edit click proceeds silently;
  edited + cancel blocks navigation; edited + confirm allows it).

  **Not done — explicitly deferred, not silently skipped**: wiring the same hook into
  `PostEditor.tsx`, `CollectionEntryEditor.tsx`, `FormEditor.tsx`, `WidgetInstanceEditor.tsx`.
  `FormEditor.tsx`/`WidgetInstanceEditor.tsx` are plain React state — mechanical, low-risk
  follow-ups using the exact same hook. `PostEditor.tsx`/`CollectionEntryEditor.tsx` are harder:
  their body content lives in TipTap's own imperative editor state, not React state, so "current"
  needs either an `onUpdate` callback bumping a version counter or comparing
  `editor.getJSON()` results — solvable, but a real design decision I didn't want to guess at
  without live verification, which this dispatch's rules don't allow.

**Escalated, not implemented**: `Plugins.tsx`/`Roles.tsx`'s shared-`rowSavingId` race. The audit's
own write-up already identifies this as a *documented* tradeoff (`Plugins.tsx:38-44`'s
`@tradeoffs` comment, citing `ui.spec.md §0`'s **mandated** convention) that undercounts its real
consequence (a duplicate PATCH, unordered `reload()`s). Fixing it means either overriding a
mandated spec convention everywhere it's mirrored, or getting the mandate itself revisited — a
governance call, not mine to make unilaterally. Recommend routing to whoever owns `ui.spec.md`.

**Not attempted — locked files**: skip-link and duplicate-`<h1>` (cross-cutting §5/§6) need
`Sidebar.tsx`/`AssistantDock.tsx`, both locked to the canary agent. PostEditor.tsx's TipTap
toolbar focus-return issue was read and understood but not fixed — deprioritized below the
Blocker/Major items above given the size of this dispatch.

---

---

## MSG-02 / MSG-03 follow-up (post-report additions)

**1a/1b re-verified, already fixed** — the audit's second pass (detail/editor routes) re-surfaced
`CollectionEntries.tsx`'s fake-collection render and `FormEditor.tsx:334`'s inverted guard as the
top two ranked items. Both were already closed in the "(7) Remaining findings" section above,
before that second pass landed. Re-read both files line-for-line against the team lead's
description to confirm no drift: `CollectionEntries.tsx`'s `contentType === null` guard and
`FormEditor.tsx`'s `!isNew && !form && error` guard are exactly as described. No rework needed.

**`Roles.tsx`'s shared-`rowSavingId` concurrency shape — confirmed unaffected.** The `ConfirmButton`
wiring in item (1) only reads the existing `rowSavingId` value for the `pending` prop
(`pending={rowSavingId === role.id}`); it does not touch `onDeleteRole`/`onSaveRole`/the
`rowSavingId` state variable itself, or how it's shared across roles/policies. The concurrency
shape the audit's write-up traced through `Plugins.tsx`'s documented `@tradeoffs` comment is
unchanged by this dispatch.

**Unsaved-changes protection — extended to `PostEditor.tsx`**, the screen the team lead live-verified
losing an edit on. `PostEditor.tsx`'s body content lives in TipTap's own imperative editor state,
not React state, which is exactly the harder case flagged as deferred in item (7) above. Resolved
by adding an `onUpdate` callback that bumps a version counter purely to force a re-render (its
value is never read), so `current.bodyJson` — read fresh via `editor.getJSON()` every render — is
re-evaluated after each keystroke. The `original` snapshot is captured via `editor.getJSON()`
**immediately after** `editor.commands.setContent(post.bodyJson)` on load, not from `post.bodyJson`
as loaded — both sides of the later comparison are then produced by the identical serialization
call, so a schema-normalization difference between the server's stored JSON and TipTap's own
round-trip can never register as a false "unsaved change" on a freshly-opened, untouched post.
Wired the same `confirmLeave()` pattern into the "← Posts" back-link, preserving its existing
`agentHandle("post-back-to-list", …)` spread untouched.

Also converted `Posts.tsx`/`Pages.tsx`'s delete row actions from `window.confirm` to
`ConfirmButton` per MSG-03 — see the dedicated section below.

**Not done, still deferred**: `useDirtyGuard` wiring for `CollectionEntryEditor.tsx` (same TipTap
complexity as `PostEditor.tsx`, now a mechanical copy of that pattern) and `FormEditor.tsx`/
`WidgetInstanceEditor.tsx` (plain React state, simpler). `MenuEditor.tsx`'s tree semantics
(`role="tree"`/`aria-level`) and `PostEditor.tsx`'s TipTap toolbar focus-return were both explicitly
ranked "take it if you get there"/"take it last if at all" — not attempted, in line with that
priority.

### MSG-03 — Posts.tsx / Pages.tsx delete → `ConfirmButton`

Converted both screens' per-row `window.confirm`-gated delete to `ConfirmButton` (`destructive`,
with a `deletingId`-driven `pending` state matching the single-flight guard pattern already used
on `Roles.tsx`/`Redirects.tsx`). The soft-delete copy — "moves to trash, disappears from the site
and this list, no undo/recoverable/permanent claim" — is preserved but restructured: the mechanism
disclosure that used to live only inside the `window.confirm` dialog text now lives in the
button's `aria-label`, so it reaches the operator up front (before they've even clicked once)
rather than only after. `label`/`confirmLabel` stay the short "Delete"/"Confirm delete" pair for
visual consistency with every other `ConfirmButton` call site in the app. Both screens' file-header
comments explaining the "why no recoverable/permanent claim" reasoning were kept, updated only to
name the new control instead of `window.confirm`. Neither screen's delete button carried an
`agentHandle` — confirmed before editing, nothing to preserve there.

**`PostEditor.tsx`'s delete — judgment call, not converted.** Two independent reasons: (1) the
"wall of red" problem MSG-03 describes is specific to a repeated column of identical buttons down
a table — `PostEditor.tsx` has exactly one Delete button in its editor header, so that problem
doesn't apply; its existing `window.confirm` gate is already one of the audit's three accepted
confirmation shapes. (2) Converting it would require either dropping its `agentHandle("post-delete",
…)` wiring (explicitly told not to) or extending `ConfirmButton`'s prop surface to accept a
passthrough spread — checked `@jini-ai/agentic`'s `agentHandle()` source and confirmed it only
returns plain `data-agent-*` string attributes with no event-handler collision risk, so that
extension would have been safe, but I chose not to add unused API surface to `ConfirmButton` for a
single caller I was already deciding not to convert. Happy to revisit if the "one primitive
everywhere" goal outweighs these two reasons.

## Verification

- `npm --prefix apps/admin run typecheck` — clean.
- Root `npm run typecheck` — clean.
- `npm --prefix apps/admin run test -- --run` (full suite, latest run after the MSG-02/MSG-03
  additions): **266 passed, 0 failed**, same 3 pre-existing suites erroring at import on
  `__TOVU_ADMIN_VERSION__` (not fixed, per the dispatch brief — confirmed a one-line
  `vitest.config.ts` `define` addition would resolve it, left for the user to route). Baseline was
  221/0/3; the +45 are the tests added across this report's original 7 items. The PostEditor.tsx
  and Posts.tsx/Pages.tsx changes added no new tests (see reasoning above and in each section) so
  the count is unchanged from the pre-MSG-02 total.

## Files changed

New: `components/ConfirmButton.tsx` (+test), `lib/format-timestamp.ts` (+test),
`hooks/use-dirty-guard.hooks.ts` (+test), plus new test files for Dashboard, Placeholder,
CollectionEntries, FormEditor, WidgetInstanceEditor, and 3 new tests in MenuEditor's suite.

Modified: `lib/api.ts`, `sections/{Roles,Redirects,Users,Members,Dashboard,Placeholder,
CollectionEntries,FormEditor,MenuEditor,Pages,WidgetInstanceEditor,Posts,Analytics,Comments,
IntegrationDeliveries,Recovery,Database,Taxonomy,WidgetRegions,WidgetRegionEditor,
CollectionEntryEditor,Collections,Seo,WidgetsLibrary,AiAssistant,Settings,Workspace,Plugins}.tsx`,
`components/WidgetPickerDialog.tsx`, `lib/widget-embed-extension.tsx`.

Not touched (locked to `admin-makeover-canary`): `styles.css`, `App.tsx`, `nav.ts`,
`components/Sidebar.tsx`, `components/ChatFab.tsx`, `components/AssistantDock.tsx`,
`styles/assistant.css`, `sections/Media.tsx`, `hooks/use-sidebar-rail.hooks.ts`.
