# J sheets: the generic shell in `@jini-ai/admin` (3 runs, Jini only). Read `COMMON-ADMIN.md` first.

Why these come before any Tovu change: Jini's `AdminShell` (`packages/admin/src/react/shell/`, 455 lines in 8 files,
`AdminShell.tsx` 116) has **no consumer** (`rg -l "AdminShell\b" packages examples` finds only docs). Tovu runs its
own `AdminShell` (`apps/admin/src/App.tsx:643-703`) plus `App.chrome.tsx` (256) and `App.hooks.ts` (1,205).
The Jini shell cannot host Tovu today. Measured gaps:

| # | Gap (Jini file) | Tovu has (file:line) | Sheet |
|---|---|---|---|
| G1 | panels gate on `permissions` = all-of (`core/manifest/types.ts:168`); no any-of; no "unknown yet" state | `lib/panel-access.ts` (94): `anyOfPermissions`, unknown permissions show everything, 31 of 51 panels declare it (command below the table) | J1 |
| G2 | the shell calls `useAdminShellSession`, `useAdminTheme`, `useShellRoute`, `useShellDrawer` directly (`AdminShell.tsx`) | hooks arrive as props (`App.tsx:433-446` `resolve*Hook`) | J2 |
| G3 | class names are unprefixed (`admin-layout`, `skip-link`, `admin-topbar`, `sidebar-backdrop`, `admin-content`, …) | same names, styled in `styles.css` (6,799 lines) | J2 |
| G4 | slots: `login`, `sessionError`, `sidebarHeader`, `sidebarFooter`, `topbar`, `overlays`, `assistant {content,label,open}` | needs also: a layout class from interface preferences, sidebar label tooltips, empty-click toggle, logout button + confirm, sheet bar and resizable dock aside (`App.chrome.tsx:26-134`), chat FAB clearance, per-route `NoAccess` | J2 |
| G5 | navigation is rebuilt on every shell render (11-06 survey) | `buildShellNav` (`App.tsx:555`) | J2 |
| G6 | theme: `use-admin-theme.ts` (62) + `theme-ports.ts` (27), one default theme | registry of themes, scheme resolution, server-backed preference (`admin-themes/*.ts` 374 lines + `features/admin-themes` 149) | J3 |
G1 count (prints 31 at `e801e9ae`):
```
rg -c "^\s+anyOfPermissions:" $T/apps/admin/src/panels.tsx
```

| # | Gap found by the round-1 judge (verified at Jini `dde69a6d`, Tovu `e801e9ae`) | Sheet |
|---|---|---|
| G7 | `react/shell/model.ts:25-29` filters panels by permission **before** `matchRoute`, and `:34-35` turns an unmatched route into the default panel: a denied direct URL silently shows the default panel, so a "no access" screen can never know which panel was asked for. `core/manifest/rules.ts:34` turns unknown permissions into `[]`. | J1 |
| G8 | `ShellSidebar` (`AdminShell.tsx:55-69`) is a fixed arrangement (header slot, one `Sidebar.Nav`, footer with the rail toggle). Tovu's sidebar (`App.tsx:603-641`) is a different composition: mobile header, empty-click toggle, label tooltips, the first nav group rendered by `SitesSidebarNav`, the rail toggle **between** two nav slices, logout in the footer, and `{...dockRail}` (`railOverride`, `onRailCollapsedChange` from `hooks/use-dock-auto-rail.hooks.ts:75-108`, returned at `:108`). No list of small slots represents that. | J2 |
| G9 | Providers that must wrap shell + dock + overlays as one boundary (`App.tsx:678-680`) have no seam: the Jini shell renders its own root `<div>`. | J2 |
| G10 | `AdminThemePreferenceStorePort` (`theme-ports.ts:10-13`) is synchronous and scheme-only; Tovu's controller (`admin-themes/use-admin-theme.hooks.ts:34-41`) is four async settings calls for two values (theme id + scheme), paints three root attributes and keeps a pre-paint storage hint (`admin-themes/apply.ts:60-74`). | J3 |

| Sheet | Estimate | Needs |
|---|---|---|
| J1 panel access rule + route/visibility split + `noAccess` | 130k | - |
| J2 shell contract (hooks as props, sidebar + frame seams, memo, `jini-` classes) | 250k | J1; R1c (xpkg: `use-admin-theme.ts` onto the kit) landed, or do J2 first and tell the coordinator R1c must rebase |
| J3 theme seam (host-owned theme controller) | 70k | J2 |
Serial: J1, J2, J3 (all three edit `react/shell`). Each sheet's commits are green without the next sheet.

## J1: panel access rule, route recognition separate from visibility, `noAccess`
```
jini_files:
  - packages/admin/src/core/manifest/types.ts:159-168   | edit: add `readonly anyOfPermissions?: readonly string[]` beside `permissions`
  - packages/admin/src/core/permissions/rules.ts (34)   | edit: add `isPanelAccessible`, `withoutInaccessiblePanels`
  - packages/admin/src/core/manifest/rules.ts            | READ `resolvePanels` (:29-40); do NOT change it (other callers keep today's result)
  - packages/admin/src/core/index.ts:33                  | edit: export the two new rules beside `hasPermission` (explicit names)
  - packages/admin/src/react/shell/model.ts (44)         | edit: two panel sets + `access`
  - packages/admin/src/react/shell/types.ts              | edit: `slots.noAccess?`
  - packages/admin/src/react/shell/AdminShell.tsx:108-110| edit: render `noAccess` when denied
  - packages/admin/src/react/shell/__tests__/model.test.ts:9-15     | edit (declared change, see "Existing tests" below)
  - packages/admin/src/react/shell/__tests__/AdminShell.test.tsx:71-73 | edit (declared change, see below)
  - packages/admin/src/core/__tests__/public-surface.unit.test.ts  | new (T9)
  - packages/admin/docs/spec/api.spec.md:161-166, docs/spec/ui.spec.md:55-60 | edit: `access`, `noAccess`, the two rules
  - .changeset/<name>.md                                            | new (the two declared behaviour changes, D-11)
  - tests: beside admin's existing core and shell tests (`rg -l "hasPermission|resolveAdminShellModel" packages/admin/src -g '*test*'`;
    at `65d73b0d5` it lists 6 files: core `permissions.test.ts`, `args-convention.contract.test.ts`, `default-panel-navigation.test.ts`,
    shell `model.test.ts`, `react/__tests__/integration-barrels.test.tsx`, `comments/react/__tests__/Comments.unit.test.tsx`)
```
Search for an existing owner first (lesson 9). Found: `packages/ui/src/features/panel-kit/helpers/permissions.ts:9`
has a second `hasPermission`. Diff the two bodies; report whether they differ. Do not merge them here (admin may not
import `ui`). (Second judge, run at `65d73b0d5`: same logic, `permissions.includes('*') || permissions.includes(permission)`;
the only difference is `readonly` on the admin parameter type. Report exactly that.)

**Baseline (second judge, run for real at Jini `65d73b0d5`, Node 24.22.3):** `pnpm --filter @jini-ai/admin build` ok;
`npm --prefix packages/admin run test` = **213 files, 2,846 tests, all pass**. `pnpm guard` ok. `pnpm check:size` ok.
`node scripts/check-hook-injection.mjs` is **red on the base** (exit 1, 32 "(new)" findings, all in `packages/ui`):
PRE-EXISTING (owner decision BASE-RED); judge J1-J3 on "no new line beyond the base output".

**The rule** (ported from `apps/admin/src/lib/panel-access.ts:43-52,63-77`; read all 94 lines and its tests):
`isPanelAccessible({ panel, permissions }, _options = {})` where `permissions: readonly string[] | undefined` is a
**required key whose value may be `undefined`** (unknown); never `permissions?:` (absent and unknown must not be
confusable, lessons 7, 20). Same two-object shape for `withoutInaccessiblePanels` (C12; precedent `resolvePanels({ panels }, context = {})`).
(a) no declaration → true; (b) `permissions === undefined` (not known yet) → true, checked with `=== undefined`,
never truthiness (lessons 7, 20); (c) `anyOfPermissions`: at least one held, or `'*'`; (d) `permissions` (all-of):
every one held; (e) both declared: both must pass. `withoutInaccessiblePanels({ groups, panels, permissions })`
returns the **same `groups` reference** while permissions are unknown (`panel-access.ts:71`), drops emptied groups,
keeps a nav row whose id names no panel.
Class: client-side visibility only. The server stays the authority; keep that sentence in the TSDoc.

**The model** (this is the part round 1 left out). `resolveAdminShellModel` computes two sets:
| Set | Built from | Used for |
|---|---|---|
| routable | `resolvePanels({ panels }, { capabilities, permissions: ['*'] })`: capability-gated only. The `['*']` is REQUIRED (revision 3, Opus blocker B1): `resolvePanels` defaults a missing `permissions` to `[]` (`core/manifest/rules.ts:34`) and then drops every panel that declares all-of `permissions` (`:38`), so revision 2's "no permissions argument" made every all-of panel unroutable for every user, permission held or not. The real user permissions are applied by `isPanelAccessible` (visible set and `access`), never by route recognition: passing them to `resolvePanels` would turn a denied all-of URL back into the default-panel fallback (change 2 would then hold for any-of panels only) and would still drop all-of panels while permissions are unknown | `matchRoute`, `resolveAgentPageId`, `panel` lookup |
| visible | routable filtered by `isPanelAccessible` with `session.effectivePermissions` passed through **as is** (`undefined` stays `undefined`; delete the `?? []` at `model.ts:27`) | `buildNav` |
and gains `readonly access: 'allowed' | 'denied'` = the rule applied to the routed panel. An unmatched path still
falls back to the default panel (unchanged); a **matched but denied** path keeps its own `panelId` and `access: 'denied'`.
`AdminShell` renders `props.slots.noAccess?.(slotArgs) ?? null` in `<main>` instead of `model.panel.render` when
`access === 'denied'`; `slots.noAccess?: (args: AdminShellSlotArgs) => ReactNode` (optional: existing hosts compile).
**Declared behaviour changes in the shell (write both into the changeset; there is no consumer today, `rg -l "AdminShell\b" packages examples` finds only docs, so nobody is broken, but it is not silent):**
(1) while permissions are unknown, a panel that declares all-of `permissions` is now shown in the nav (before: hidden);
(2) a denied direct URL no longer redirects to the default panel. `resolvePanels` itself is untouched.
Owner approved both on 2026-11-17 (AU-D11 = Rec).

**Second judge (2026-11-17, Jini `65d73b0d5`): the routable fix is correct for every panel kind and every user.**
Checked by running the built `dist/core` `resolvePanels` + `matchRoute` + `buildNav` with the rule (a)-(e) over 8 panel
kinds (none, any-of, all-of, both, capability wired + all-of, capability missing, no-nav + all-of, default) x 9 permission
sets (unknown, `[]`, `['*']`, any-of holder, all-of holder, half all-of, both-holder, half-both, capability-panel holder):
every panel whose capability is wired is routable for every user; access and nav follow the rule exactly; the
capability-missing panel falls back to the default panel for everyone (unchanged). Revision 2's call (no `permissions`)
left only `dashboard, open, anyof` routable: the B1 bug is real and `['*']` fixes it. Script: `admin-judge2-REPORT.md`.
Precisions the sheet did not state (each is now part of the contract; add a test where marked):
- `model.panels` = the **visible** set (its meaning today: what this operator can use); `model.panel` is looked up in
  the **routable** set; `buildNav` and `resolveAgentPageId` take the visible / routable set as in the table.
- `access` for a model whose `panel` is `undefined` (default panel id not registered or its capability missing):
  `'allowed'` (nothing declared; today's empty `<main>` stays). A **default panel that is itself denied** gives
  `access: 'denied'` at `/` (noAccess at the root). Tovu's `dashboard` declares nothing, so Tovu never sees this.
- `agentPageId` of a denied route stays the routed panel's page id (parity: Tovu's `agentPageId(route)`, `App.tsx:181`,
  ignores access). Test T14 pins it, so it is a decision, not an accident.
- Name the `['*']` (`const ROUTE_RECOGNITION = { permissions: ['*'] } as const` or similar) with a why-comment
  pointing at `core/manifest/rules.ts:34,38`: it is the one non-obvious line in J1. Precedent for passing `['*']`:
  `core/__tests__/args-convention.contract.test.ts:13`.

**Existing tests this sheet changes (C6: name each in the report; they pin the two approved behaviour changes):**
| Test | Today asserts | After J1 |
|---|---|---|
| `react/shell/__tests__/model.test.ts:9-15` | session `{ user }` (permissions **unknown**) drops the all-of panel `users` from `model.panels` | the test's own name says "without grants": set the fixture to `effectivePermissions: []` (assertion `['home']` kept unchanged); add one case with `{ user }` expecting `['home', 'users']` (change 1) |
| `react/shell/__tests__/AdminShell.test.tsx:71-73` | `go('/private')` (all-of `private.read`, not held) shows `Overview screen` | change 2: with a `noAccess` slot in the fixture, `/private` renders the slot, not `Overview screen` and not `Private screen` (keep the `queryByText('Private screen')` null assertion) |
No other existing assertion may change; `default-panel-navigation.test.ts` declares no permissions and must pass untouched.

Tests first (RED before the edit):
| # | Asserts | Fails when |
|---|---|---|
| T1 | any-of with one held permission is accessible; with none is not | any-of is treated as all-of |
| T2 | `'*'` satisfies any-of and all-of | wildcard dropped |
| T3 | `permissions: undefined` shows all and returns the identical `groups` object | unknown is treated as empty (every panel hidden during boot) |
| T4 | `permissions: []` hides a panel that declares any-of | empty is treated as unknown |
| T5 | all-of + any-of both declared: fails when either fails | one check short-circuits the other |
| T6 | Tovu's own `panel-access` test table, copied as data (not imported), gives the same answers | a ported case differs |
| T7 | **through `<AdminShell>`** (fake session port, `effectivePermissions: []`, path of a panel declaring any-of): the `noAccess` slot renders, the panel's `render` is never called, the default panel's `render` is never called, and the nav has no row for it | filtering happens before route matching again (the denied URL shows the default panel) |
| T8 | through `<AdminShell>` with `effectivePermissions: undefined` and the same path: the panel renders | unknown is collapsed to `[]` anywhere in the model |
| T9 | `import { isPanelAccessible, withoutInaccessiblePanels } from '@jini-ai/admin/core'` resolves in a built package: new `core/__tests__/public-surface.unit.test.ts` (imports `../index.js`; there is no existing core surface test, the nearest precedent is `source-control/react/__tests__/source-control-surface.unit.test.tsx`) **plus** the built check in the block below | the export is missing (T1a could not import it) |
| T14 | through `<AdminShell>`, denied route (T7 setup): `main[data-agent-page]` is the denied panel's page id | the agent page id is dropped or rewritten for a denied route (Tovu parity, `App.tsx:181`) |
| T10 | `resolvePanels` with all-of `permissions` and no permissions argument returns exactly what it returned before (pin 3 fixtures on the old code) | the shared rule was changed instead of the shell model |
| T11 | through `<AdminShell>`: a panel declaring all-of `permissions: ['posts.read']`, session `effectivePermissions: ['posts.read']`, its path: the panel renders and its nav row exists | routable is built without `permissions: ['*']` (revision 2's bug: RED under that mutation) |
| T12 | same panel, `effectivePermissions: []`: the `noAccess` slot renders, neither the panel's nor the default panel's `render` is called | real permissions are passed to `resolvePanels` (the denied all-of URL falls back to the default panel). RED on today's Jini `model.ts:25-28` |
| T13 | same panel, `effectivePermissions: undefined`: the panel renders | unknown collapsed to `[]` (today's `model.ts:27`) or routable built without `['*']` |
V3 for T11/T13: delete `permissions: ['*']` from the routable call, show both RED, restore.
**Limits budget (second judge, measured at `65d73b0d5` with the C8 eslint rules at lowered thresholds to read the
values):** `AdminShell` (`AdminShell.tsx:76`) is at cyclomatic **9** of 10 and 38 of 50 lines;
`resolveAdminShellModel` (`model.ts:21`) is at 6. J1's denied branch must not go into `AdminShell`'s body: put the
"`noAccess` slot or `panel.render`" choice in a small `renderRoutedPanel({ model, slots, slotArgs })` beside
`renderSessionGate`, and keep the visible/routable/access computation in `model.ts` helpers so
`resolveAdminShellModel` stays <= 10. C8 must print nothing for both files.
Done: `(cd $J && pnpm --filter @jini-ai/admin build) && npm --prefix $J/packages/admin run test`; changeset file added.
T9 built check (`examples/minimal-host` does **not** depend on `@jini-ai/admin`, so COMMON C10's minimal-host line
fails with ERR_MODULE_NOT_FOUND for this package; the package's own self-reference works, verified at `65d73b0d5`):
```
(cd $J/packages/admin && node --input-type=module -e "const m = await import('@jini-ai/admin/core'); if (typeof m.isPanelAccessible !== 'function' || typeof m.withoutInaccessiblePanels !== 'function') process.exit(1); console.log('ok')")
```
STOP: a **production** caller of `resolveAdminShellModel` outside `packages/admin/src/react/shell/` exists. Command
and the complete expected output at `65d73b0d5` (second judge ran it): anything beyond these lines is the STOP.
```
rg -n "resolveAdminShellModel" $J/packages $J/examples -g '!**/dist/**' -g '!**/node_modules/**' -g '!*.csv' -g '!*.tsv' | rg -v '/__tests__/|/docs/spec/|/react/shell/(model|AdminShell|index)\.tsx?:'
```
prints nothing at `65d73b0d5`. (Unfiltered it lists `model.ts`, `AdminShell.tsx`, `index.ts`, `docs/spec/api.spec.md`
and three tests: `model.test.ts` and `core/__tests__/default-panel-navigation.test.ts`, which depend on route/nav only,
and `react/__tests__/integration-barrels.test.tsx`, an identity check.)

## J2: shell contract
Do not redesign the shell. Close G2-G5, G8, G9 in five green commits.
**Limits budget (second judge):** after J1, `AdminShell` is at or near cyclomatic 10 (9 at `65d73b0d5`, see J1). Every
J2 step adds branches (`??` defaults for four hooks, `ids` defaults, `frame`/`sidebar`/`assistantAside`/`afterMain`
presence checks), so the body cannot absorb them. Planned shape, one extraction per step that needs it: step 1 a
pure `resolveShellHooks(props)` (all hook defaults and the 1b session-source choice live there; it returns hook
functions, it calls none, so the hooks are still called unconditionally in `AdminShell`); step 3 the sidebar choice in
`renderShellSidebar`; step 4 the authenticated tree in a `ShellLayout` component and the main column in
`ShellMainColumn`. Each new function <= 50 lines and <= 10 / 10 by the C8 command; record each function's values in
the report. `Sidebar.tsx` (step 5) already has one finding at the base: `SidebarRoot` is **51** lines (code lines,
C8 rule); a rename must not grow it (C8 prints the changed message if it does: STOP), and the file is 346 code lines.
1. **Hooks as props (G2).** `AdminShellProps` gains optional `useSessionHook`, `useThemeHook`, `useRouteHook`,
   `useDrawerHook`, each defaulted to today's hook. Signatures are the present ones; do not change argument shapes
   (lesson 12). Fake-hook output test per hook: with a fake returning `anonymous`, the login slot renders and the
   real session port is never called. Then the by-file hook check of COMMON-ADMIN section 1 on `packages/admin/src/react/shell`: CLEAN.
   Second judge: the one-liner prints exactly 4 keys at `65d73b0d5` (`AdminShell::useAdminShellSession`,
   `::useAdminTheme`, `::useShellDrawer`, `::useShellRoute`). Delete exactly those 4 by hand from
   `scripts/hook-injection-debt.json` in this commit (section 1, C11); never `--update`. Jini's hook gate is red on
   the base (32 "(new)" lines in `packages/ui`, PRE-EXISTING): the step is green when no line is added.
   **1b. Host-owned session (second judge; needed by T1b, see its "Session" row).** Tovu's session machine
   (`App.hooks.ts:109-228`: boot-token fragment, guarded local bootstrap, epoch guard, settings-change feed, permission
   refresh) also feeds `AdminBootScopeContext` *above* the shell (`App.tsx:460-462`, read by locale, interface
   preferences, admin theme and assistant hooks while `checking`). A second reader behind `AdminShellSessionPort` would
   duplicate it (S4 fails) or re-implement it (lesson 12). So the props take **exactly one session source**, enforced by
   the type, with no change to `AdminShellSessionPort`:
   ```ts
   type AdminShellSessionSource =
     | { readonly session: AdminShellSessionPort; readonly useSessionHook?: typeof useAdminShellSession }  // today; hook defaulted
     | { readonly session?: undefined; readonly useHostSession: () => AdminShellSessionController };     // host owns the session
   ```
   `useHostSession` is a hook prop with no default because there is no real hook to default to without a port; a host
   that passes it passes no port. Tests: the existing `session.test.tsx` count unchanged (port path); with
   `useHostSession` returning `authenticated`, the panel renders and no port method exists to be called; with
   `anonymous`, the login slot renders. Name it in the report if a cleaner shape is found; do not add a dummy port.
2. **Memoized navigation (G5).** Read `AdminShell.hooks.ts` (27) and `model.ts`. Memoize the nav build on
   `panels`, `capabilities`, permissions, `translateNav`, and route. Test: re-render with identical props; a
   counting `translateNav` fake is called once. (A host must pass a stable `translateNav`: Tovu's will close over
   locale and site-section availability, so T1b wraps it in `useCallback`; say so in the TSDoc.)
3. **Sidebar composition seam (G8).** One render slot, because `Sidebar` is a compound component designed for
   host-composed children (`react/components/Sidebar.tsx:23` "Why children rather than props"):
   ```ts
   slots.sidebar?: (args: AdminShellSlotArgs & {
     readonly nav: readonly AdminNavGroup[];            // the visible, translated groups (J1 + translateNav)
     readonly sidebarProps: { activeId: string; base: string | undefined; open: boolean; id: string; label: string;
                              railStorageKey: string; railDefaultCollapsed: boolean };   // exactly what ShellSidebar passes today
     readonly setDrawerOpen: (open: boolean) => void;
   }) => ReactNode
   ```
   Present → the shell renders its result in the place of `<ShellSidebar>` and nothing else changes. Absent → today's
   `ShellSidebar` (snapshot test: byte-identical markup). The host renders `<Sidebar {...sidebarProps} {...dockRail}>`
   with its own children; rail override stays a `Sidebar` prop the host passes (`railOverride`,
   `onRailCollapsedChange` already exist on `Sidebar`: confirm with `rg -n "railOverride|onRailCollapsedChange" packages/admin/src/react`;
   if they do not exist on `Sidebar`, STOP: T1b cannot keep the auto-rail and the sheet needs a review).
   Second judge ran it at `65d73b0d5`: they exist (`Sidebar.tsx:283,286`, `hooks/use-sidebar-rail.ts:83-86`); no STOP.
   `sidebarProps.id` and `label`: Tovu passes neither today, so its `<nav>` is `id="admin-sidebar"` and
   `aria-label="Admin"` (`Sidebar.tsx:354` defaults). Four Tovu hooks find the nav by that id
   (`use-sidebar-empty-click-toggle.hooks.ts:81`, `use-cms-sidebar-label-tooltips.hooks.ts:13`,
   `use-sites-sidebar-nav.hooks.ts:65`, `use-drawer-active-item-centring.hooks.ts:73`), so `id` must be host-settable:
   see `ids` in step 4. `label` comes from `labels.navigation`; T1b decides whether to keep "Admin" (no a11y-name change).
   Tests: (a) a host slot that renders `MobileHeader`, a custom first group, `RailToggle`, `Nav` for the rest and a
   footer produces that DOM order; (b) `sidebarProps.activeId` equals the routed panel id, also when `access` is denied;
   (c) `setDrawerOpen(false)` closes the drawer the topbar toggle opened (one drawer state, not two).
4. **Frame and small slots (G4, G9).**
   - `slots.frame?: (args: AdminShellSlotArgs & { readonly children: ReactNode }) => ReactNode` wraps the **whole
     authenticated layout** (root `<div>` with sidebar, main, assistant and overlays inside `children`). It is where
     a host puts providers that the panels, the dock and the overlays must share. It is not called for the
     checking / anonymous / error states. Tests: a context provided in `frame` is readable from `panel.render`,
     from `slots.assistant` content and from `slots.overlays`; a child that counts mounts is mounted once across
     three route changes; the host re-keying its provider on `session.user.id` remounts it on identity switch.
   - `slots.beforeMain?: ReactNode` (the logout confirm dialog, mounted where Tovu mounts it, `App.tsx:685`),
     rendered **between the sidebar and the backdrop** (Tovu's order, `App.tsx:683-690`; S6 pins DOM order).
   - `slots.assistantAside?: ReactNode` rendered **instead of** the built-in `<aside>` (second judge: not a field of
     `slots.assistant`, whose `content`/`label`/`open` are required and would be meaningless beside it). Tovu passes
     `AssistantChrome` (`App.tsx:348-385`, it returns at :366-384: `ChatDockAside` + `ChatFab`, `App.chrome.tsx:65-134`). Both present: the
     shell renders `assistantAside` only (test).
   - `slots.afterMain?: ReactNode` inside `.admin-main-col`, after `<main>` (second judge: Tovu renders
     `ScrollJumpButtons` there, `App.chrome.tsx:195-198`; no other seam reaches inside the main column).
   - `ids?: { readonly sidebar?: string; readonly main?: string }`, each defaulting to today's `useId()` value
     (second judge: Tovu's `#admin-sidebar` lookups above, `styles.css:247` `#main-content:focus`, the skip link
     `href="#main-content"` and `__tests__/unit/focus-ring-css.unit.test.ts`). The skip link, the topbar's
     `aria-controls`, `<nav id>` and `<main id>` all read from it (test: one value, four places).
   - Markup parity the Tovu swap needs, no host consumes the shell today: the topbar toggle `<path>` gets
     `strokeLinecap="round"` (Tovu `App.chrome.tsx:149`). The backdrop stays a `<button>` with `aria-label` (Jini) where
     Tovu has a `<div>` (`App.tsx:690`): an a11y gain, but a `<button>` brings a UA border and padding that Tovu's
     `.sidebar-backdrop` (`styles.css:1453`) does not reset, so T1b step 3 adds `border: 0; padding: 0` to that rule.
   - layout class: the existing `className` prop (no new prop). `noAccess` came with J1.
   Each slot has a render test and an "absent slot renders exactly today's markup" snapshot test.
   Before adding any slot, write in the report which Tovu element it hosts, by `App.tsx`/`App.chrome.tsx` line.
   The T1b mapping table lists every Tovu shell element and its seam; an element missing from that table is
   reported, not solved by a new prop.
5. **`jini-` classes (G3).** Rename every class in `packages/admin/src/react/shell/**` and
   `react/components/Sidebar.tsx` (593 raw lines, about 351 code lines at Jini `65d73b0d5`: under the 500 limit,
   because the size gate counts code lines only (`scripts/check-size.mjs:57` skips blank lines and comments); it has
   no row in `scripts/size-debt.json` or `scripts/size-exceptions.json` (Opus m1); keep it under 500 code lines, and if a
   rename pushes a function over a limit, STOP) to `jini-admin-<name>`
   (including `.cms-section`, which `App.tsx:624` relies on). List old → new in `packages/admin/docs/shell-classes.md`
   (T1b consumes this list to rename Tovu's CSS, TS selectors and e2e journeys). Tovu imports `Sidebar` and
   `useSidebar` today (`App.tsx:15`): this commit changes what Tovu renders, so it is the **last** J2 commit and
   **T1b step 3 is its Tovu half**. Do not leave both class sets in the markup.
   **Second judge corrections to step 5:**
   - `packages/admin/src/themes/default/admin.css` (51 lines) holds **tokens only, no selector**: nothing to update
     there. The one Jini stylesheet that styles a shell class is **`packages/ui/src/styles/admin.css:294-295`**
     (`.admin-layout`, `.admin-layout :is(h1, h2, h3)`): it is in the write set (CSS, not an import, so the
     admin-may-not-import-ui rule is not crossed). Also in the write set: `packages/admin/src/react/components/__tests__/Sidebar.test.tsx`,
     `react/shell/__tests__/*.test.tsx` class assertions, `docs/spec/ui.spec.md`. Find them all:
     ```
     rg -l -P 'cms-(item|section|nav|group|foot|rail|tooltip)|admin-(layout|topbar|content|main-col|sidebar|assistant-pane)\b|sidebar-backdrop|skip-link|boot-screen' $J/packages $J/examples -g '!**/dist/**' -g '!**/node_modules/**'
     ```
   - **Merge timing.** Tovu consumes Jini through `link:jini` (`file:../Jini/packages/*`): once step 5 is on the Jini
     integration branch, *every* Tovu run that links it (A-, S-, JM- sheets) renders an unstyled sidebar and breaks
     Tovu e2e selectors until T1b step 3 lands. "Tovu stays linked to the J2 commit before" cannot hold for other
     lanes. So J2's lane branch `admin-ui/J2` carries steps 1-4 only; step 5 is built on `admin-ui/J2-classes` (green
     alone in Jini) and is merged **in the same window as T1b step 3**, by the T1b run, never earlier.
   - Ripple measured on Tovu `232764af5` with the same pattern: `apps/admin/src` 65 files (378 lines; 174 CSS selector
     lines in `styles.css` + 5 `styles/*.css`), `development/e2e` 20 files (91 lines, journeys and fixtures),
     `apps/desktop` 3 files (4 lines). Production TS that queries the classes: `use-cms-sidebar-label-tooltips.hooks.ts:21`
     (`a.cms-item`), `use-sites-sidebar-nav.hooks.ts:69` (`a.cms-item[href$="/sites"]`). T1b step 3 owns all of it.
STOP: a needed change alters `AdminShellSessionPort` or `AdminShellNavigationPort` (`createAdminShellNavigation`
returns the latter; Tovu imports it at `App.hooks.ts:9` and calls it at `:1087` for the agent page bridge): report
the proposed change instead.

## J3: theme seam (the host keeps its theme controller)
Round 1 planned to push theme id + scheme through `AdminThemePreferenceStorePort`. That port cannot express it
(G10), and inventing an async two-value store in Jini would re-implement Tovu's settings binding without a second
host that needs it. Decision (owner rules: hooks injected as props; host binding stays in the host, lesson 9):
| Concern | Owner | Why |
|---|---|---|
| Which themes exist, their CSS packs, `--tovu-*` tokens | Tovu (`admin-themes/registry.ts`, CSS; INDEX D-7) | product content |
| Reading/writing the two settings (`core.interface.adminTheme`, `core.appearance.theme`), async failure, the error string | Tovu (`AdminThemePort`, `useAdminThemePicker` `:163-190`) | they reuse the shell's own query keys, so they add no boot request (`use-admin-theme.hooks.ts:28-31`) |
| Painting `data-admin-theme`, `data-color-scheme`, `data-theme` on the root and the pre-paint storage hint (`ADMIN_THEME_STORAGE_KEY`) | Tovu (`apply.ts:60-74`, `paintAdminTheme`) | attribute names and the storage key are an installed surface read by the pre-paint script and by saved CSS (lesson 26) |
| Scheme resolution (`system` + `prefers-color-scheme`) | Jini kit `resolveColorScheme` (already used by Tovu `apply.ts:57`) | already generic |
| The shell's own default theme behaviour | Jini `use-admin-theme.ts`, unchanged | hosts without a theme system |
So J3 is small and adds **no port method**:
```
jini_files: packages/admin/src/react/shell/{AdminShell.tsx, types.ts, use-admin-theme.ts (62, read only)}
```
1. `useThemeHook` (J2 step 1) is typed `(args: { userId: string | null; workspace }, options: ThemeOptions) => AdminShellAppearance | undefined`.
   Returning `undefined` means "the host paints; the shell exposes no appearance to slots".
2. Tests first: T1 with a fake `useThemeHook`, the real `useAdminTheme` is never called and the shell writes **no**
   attribute to the injected `themeEnvironment.target` (fails when the shell still paints: double painting would
   fight the host's three attributes); T2 the fake's `AdminShellAppearance` reaches `slots.topbar`/`sidebar` args
   unchanged; T3 absent `useThemeHook`: today's behaviour, pinned by the existing theme tests (count unchanged).
3. Tovu side is T1b: it passes `useThemeHook={() => undefined}` and keeps calling `useAdminThemeDocument` /
   `useAdminThemeBoundary` exactly where it does today. Nothing in `apps/admin/src/admin-themes` moves in this plan.
Not done here, and not needed for the goal: a multi-theme registry inside Jini. It is listed in INDEX section 9 as
"only when a second host needs it"; `f/admin-themes` and `admin-themes` change from MOVE PART to STAY in the inventory.
STOP: `useAdminTheme` cannot be skipped without also skipping something the shell needs for layout (report what).
