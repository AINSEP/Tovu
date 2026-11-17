# J sheets: the generic shell in `@jini-ai/admin` (3 runs, Jini only). Read `COMMON-ADMIN.md` first.

Why these come before any Tovu change: Jini's `AdminShell` (`packages/admin/src/react/shell/`, 455 lines in 8 files,
`AdminShell.tsx` 116) has **no consumer** (`rg -l "AdminShell\b" packages examples` finds only docs). Tovu runs its
own `AdminShell` (`apps/admin/src/App.tsx:643-703`) plus `App.chrome.tsx` (256) and `App.hooks.ts` (1,205).
The Jini shell cannot host Tovu today. Measured gaps:

| # | Gap (Jini file) | Tovu has (file:line) | Sheet |
|---|---|---|---|
| G1 | panels gate on `permissions` = all-of (`core/manifest/types.ts:168`); no any-of; no "unknown yet" state | `lib/panel-access.ts` (94): `anyOfPermissions`, unknown permissions show everything, 31 of 51 panels declare it (`rg -c "^\s+anyOfPermissions:" apps/admin/src/panels.tsx`) | J1 |
| G2 | the shell calls `useAdminShellSession`, `useAdminTheme`, `useShellRoute`, `useShellDrawer` directly (`AdminShell.tsx`) | hooks arrive as props (`App.tsx:433-446` `resolve*Hook`) | J2 |
| G3 | class names are unprefixed (`admin-layout`, `skip-link`, `admin-topbar`, `sidebar-backdrop`, `admin-content`, …) | same names, styled in `styles.css` (6,799 lines) | J2 |
| G4 | slots: `login`, `sessionError`, `sidebarHeader`, `sidebarFooter`, `topbar`, `overlays`, `assistant {content,label,open}` | needs also: a layout class from interface preferences, sidebar label tooltips, empty-click toggle, logout button + confirm, sheet bar and resizable dock aside (`App.chrome.tsx:26-134`), chat FAB clearance, per-route `NoAccess` | J2 |
| G5 | navigation is rebuilt on every shell render (11-06 survey) | `buildShellNav` (`App.tsx:555`) | J2 |
| G6 | theme: `use-admin-theme.ts` (62) + `theme-ports.ts` (27), one default theme | registry of themes, scheme resolution, server-backed preference (`admin-themes/*.ts` 374 lines + `features/admin-themes` 149) | J3 |

| Sheet | Estimate | Needs |
|---|---|---|
| J1 any-of permissions | 90k | - |
| J2 shell contract (hooks as props, `jini-` classes, slots, memo) | 230k | R1c (xpkg: `use-admin-theme.ts` onto the kit) landed, or do J2 first and tell the coordinator R1c must rebase |
| J3 theme registry port | 130k | J2 |
J1 and J2 touch different files (`core/manifest`, `core/permissions` vs `react/shell`) except `react/shell/model.ts`
(44 lines), where J2 calls J1's rule: run J1 first.

## J1: `anyOfPermissions`
```
jini_files:
  - packages/admin/src/core/manifest/types.ts:159-168     | edit: add `readonly anyOfPermissions?: readonly string[]` beside `permissions`
  - packages/admin/src/core/permissions/rules.ts (34)     | edit: add `isPanelAccessible`, `withoutInaccessiblePanels`
  - packages/admin/src/react/shell/model.ts (44)          | edit: use the rule
  - a new test file for the rules (the folder holds only `rules.ts`; put it where admin's core tests live:
    `rg -l "hasPermission" packages/admin/src -g '*test*'`)
```
Search for an existing owner first (lesson 9). Found: `packages/ui/src/features/panel-kit/helpers/permissions.ts:9`
has a second `hasPermission`. Diff the two bodies; report whether they differ. Do not merge them here (admin may not
import `ui`); record it for the coordinator.

Semantics to port, from `apps/admin/src/lib/panel-access.ts` (read all 94 lines and its tests
`rg -l "panel-access" apps/admin/src`): (a) a panel with no declaration is visible; (b) `anyOfPermissions` passes
when the operator holds at least one, or `'*'`; (c) when the permission list is **not known yet** (`undefined`),
every panel is shown and `withoutInaccessiblePanels` returns the same `groups` reference (`panel-access.ts:60`);
(d) `permissions` (all-of) keeps its present meaning; (e) both declared: both must pass.
Keep "unknown" distinct from "empty list" (lesson 7 and 20): the type is `readonly string[] | undefined`, and the
check is `permissions === undefined`, never truthiness.
Class: client-side visibility only. The server stays the authority; keep that sentence in the TSDoc.

Tests first (RED before the edit):
| # | Asserts | Fails when |
|---|---|---|
| T1 | any-of with one held permission is accessible; with none is not | any-of is treated as all-of |
| T2 | `'*'` satisfies any-of and all-of | wildcard dropped |
| T3 | `permissions: undefined` shows all and returns the identical `groups` object | unknown is treated as empty (every panel hidden during boot) |
| T4 | `permissions: []` hides a panel that declares any-of | empty is treated as unknown |
| T5 | all-of + any-of both declared: fails when either fails | one check short-circuits the other |
| T6 | Tovu's own `panel-access` test table, copied as data (not imported), gives the same answers | a ported case differs |
Done: `pnpm --filter @jini-ai/admin build && npm --prefix packages/admin run test`; changeset file added.

## J2: shell contract
Do not redesign the shell. Close G2-G5 only, in four green commits.
1. **Hooks as props (G2).** `AdminShellProps` gains optional `useSessionHook`, `useThemeHook`, `useRouteHook`,
   `useDrawerHook`, each defaulted to today's hook. Signatures are the present ones; do not change argument shapes
   (lesson 12). Fake-hook output test per hook: with a fake returning `anonymous`, the login slot renders and the
   real session port is never called. Then run `node scripts/check-hook-injection.mjs`: the `AdminShell::*` keys
   leave `scripts/hook-injection-debt.json`.
2. **Memoized navigation (G5).** Read `AdminShell.hooks.ts` (27) and `model.ts`. Memoize the nav build on
   `panels`, `capabilities`, permissions, `translateNav`, and route. Test: re-render with identical props; a
   counting `translateNav` fake is called once.
3. **Slots (G4).** Add only: `layoutClassName?: string` already exists as `className` (use it; no new prop);
   `slots.sidebarOverlay?: (args) => ReactNode` (label tooltips, empty-click toggle);
   `slots.beforeMain?: ReactNode` (the logout confirm dialog, mounted where Tovu mounts it);
   `slots.noAccess?: (args) => ReactNode` (rendered when the routed panel fails J1's rule and permissions are known);
   `slots.assistant` gains `aside?: ReactNode` rendered **instead of** the built-in `<aside>` when present, so the
   host keeps its resizable dock (`App.chrome.tsx:65-134`). Each slot has a render test and an "absent slot renders
   exactly today's markup" snapshot test.
   Before adding any slot, write in the report which Tovu element it hosts, by `App.tsx`/`App.chrome.tsx` line. A
   Tovu element with no slot after this list is a finding for T1b, not a reason to add props here.
4. **`jini-` classes (G3).** Rename every class in `packages/admin/src/react/shell/**` and
   `react/components/Sidebar.tsx` (593 lines; over the 500 limit **today**: check `scripts/size-debt.json` /
   `size-exceptions.json`; do not grow it; if a rename pushes a function over a limit, STOP) to `jini-admin-<name>`.
   Update `packages/admin/src/themes/default/admin.css` selectors in the same commit. List old → new in
   `packages/admin/docs/shell-classes.md` (T1b consumes this list to rename Tovu's CSS). Tovu imports `Sidebar`
   and `useSidebar` today (`App.tsx:15`): this commit is a **pair**; the Tovu half belongs to T1b. Until T1b runs, Tovu stays
   pinned to the previous `@jini-ai/admin` version; say so in the report. Do not leave both class sets in the markup.
STOP: a needed change alters `AdminShellSessionPort` or `AdminShellNavigationPort` (both are used by
`createAdminShellNavigation`, which Tovu calls at `App.hooks.ts:9`): report the proposed change instead.

## J3: theme registry port
```
jini_files: packages/admin/src/react/shell/{use-admin-theme.ts (62), theme-ports.ts (27), types.ts (86)}
reads (Tovu, not edited): apps/admin/src/admin-themes/*.ts (374 in 3 files), apps/admin/src/features/admin-themes/ (149)
```
Port only mechanics: a list of installed themes supplied by the host (`themes: readonly AdminTheme[]`), the selected
theme id and colour-scheme preference read/written through `AdminThemePreferenceStorePort` (exists), scheme
resolution, paint and cleanup. Theme **contents** (classic, glass CSS; 884 CSS lines; `--tovu-*` tokens) stay in
Tovu (INDEX D-7). Lesson 20: Jini assumed one constant default theme; making it a list means every cache key or
storage key that assumed one theme is revisited (`rg -n "defaultAdminTheme|railStorageKey|storage" packages/admin/src/react/shell`).
Tests first: T1 switching theme id repaints once and runs the previous cleanup (fails when cleanup is dropped);
T2 an unknown stored id falls back to the first theme without writing the store; T3 preference store rejection
shows the plain-words error and keeps the previous theme; T4 `prefers-color-scheme` change repaints only when the
preference is `system`; T5 Tovu's `admin-themes` test table copied as data gives the same resolved scheme.
STOP: Tovu's theme code reads a Tovu setting or endpoint directly inside the mechanics (then the port needs a new
method: report its shape; do not add it unreviewed).
