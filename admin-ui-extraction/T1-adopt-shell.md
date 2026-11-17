# T1 sheets: Tovu adopts Jini's `AdminShell` (2 runs, Tovu only). Read `COMMON-ADMIN.md` first.

| Sheet | Work | Estimate | Needs |
|---|---|---|---|
| T1a | panels gate through Jini's any-of rule; delete `lib/panel-access.ts` | 100k | J1 published/linked |
| T1b | `App.tsx` renders Jini `AdminShell`; Tovu's own shell function and duplicated chrome are deleted | 240k | J2, J3, T1a, A0, A1; Opus review of the diff before merge |
Both edit `App.tsx` and `panels.tsx`: serial. Nothing else in this plan may edit `App.tsx`, `App.chrome.tsx`,
`App.hooks.ts`, `App.session.ts`, `nav.ts` or `styles.css` shell selectors while T1 is open.

Root files at `f354cfbd`: `App.hooks.ts` 1,205, `App.tsx` 703, `App.chrome.tsx` 256, `App.session.ts` 120,
`panels.tsx` 1,311, `nav.ts` 76, `panel-pages.ts` 61, `main.tsx` 97, `app-i18n.ts` 257. Hook-injection debt on
`App.tsx`: 13 keys (`AdminShell::useShellAvailability`, `::useShellRoute`, `::useShellDockChrome`, `::useShellContent`,
`::useShellLocale`, `::useCollapsibleNavGroupLabels`, and `App::*`).

## T1a: permissions
1. Census: `rg -n "panel-access|isPanelAccessible|withoutInaccessiblePanels|resolvePanelAccessGate|PanelAccess" apps/admin/src`.
   Write the list (file:line, production or test) into the report. Every site is repointed in this run.
2. `panels.tsx`: the 31 `anyOfPermissions` declarations stay as written; the panel type now comes from
   `@jini-ai/admin/core` (J1). `App.tsx` `buildShellNav` (`:555`) and `renderRoute` (`:199`) call Jini's rules.
3. `resolvePanelAccessGate` (`panel-access.ts:87`) decides the `NoAccess` screen. Read it before deciding where it
   goes: if it only combines the two Jini rules, inline the call; if it holds Tovu routing knowledge, it stays in
   Tovu as `lib/panel-route-gate.ts` and only the two generic functions are deleted.
4. Delete `lib/panel-access.ts` and move its tests: generic cases are already in Jini (J1 T6); Tovu keeps the
   cases that exercise real `panels.tsx` entries.
Tests first: P1 for a fixed permission list, the set of visible panel ids before and after is identical (snapshot
the 51 ids against 4 lists: unknown, empty, `['*']`, one editor-like list taken from an existing test). P2 a routed
panel that fails the gate renders `NoAccess`, and renders the panel while permissions are unknown.
STOP: a panel is visible before and hidden after (or the reverse) for any of the 4 lists.

## T1b: the shell swap
Mapping (verify each line number first; `App.tsx` was changed by merge-a):
| Tovu today | After |
|---|---|
| `AdminShell` function `App.tsx:643-703` | deleted; `App` renders `<AdminShell …/>` from `@jini-ai/admin/react/shell` |
| providers wrapped around the layout (`AdminModulesProvider`, `ChartRegistryProvider key={user.id}`, `ConfirmDialogDefaultsProvider`) | stay in Tovu, wrapped **around** the Jini shell's authenticated content: put them in the panel render path (`panels[].render`) through one Tovu wrapper component, keyed on the user id exactly as today (the key resets chart state on identity switch: keep the comment) |
| `useAdminSession` (`App.hooks.ts:109-228`) + `App.session.ts` | a Tovu adapter `integrations/jini-admin/shell-session-port.ts` implementing `AdminShellSessionPort`. Compare behaviour, not only types (lesson 12): boot-token handling (`lib/boot-token-fragment`), local-owner sign-in, `onUnauthenticated` (`lib/admin-http/request`), draft identity reset (`lib/admin-draft-identity`) on identity switch |
| `useSidebarDrawer` (`:590`), `useLogoutConfirm` (`:549`), `SidebarLabelTooltips`, `SidebarEmptyClickToggle`, `LogoutConfirmDialog` | passed as J2 hook props / slots (`useDrawerHook`, `slots.sidebarOverlay`, `slots.beforeMain`, `slots.sidebarFooter`) |
| `ShellSkipLink`, `AdminTopbar`, `ShellMain` (`App.chrome.tsx:135-241`) | deleted where Jini renders the same element; `ShellMain`'s content ref and `data-agent-page` map to `mainRef` and the model's `agentPageId` |
| `ChatDockAside`, `SheetBar`, `AssistantChrome`, `useChatDockLayout`, `resolveChatFabClearance` | stay in Tovu for now, passed through `slots.assistant.aside` (S-DOCK moves the generic part later) |
| `ShellOverlays` | `slots.overlays` |
| `resolveAdminLayoutClassName(interfacePreferences)` | `className` prop |
| site-section logic (`:311-508`), publish deep link, agent page bridge, WebMCP tools, screenshot announcement | stay in Tovu, unchanged |
| shell selectors in `styles.css` / `styles/` | renamed to the `jini-admin-*` names listed in Jini `packages/admin/docs/shell-classes.md` (J2 step 4); no selector is duplicated |

Order (each a green commit): (1) session port adapter + its tests, unused; (2) wrapper component for the three
providers, used by the old shell; (3) CSS + `Sidebar` class rename pair with J2 step 4; (4) swap to Jini
`AdminShell`; (5) delete dead Tovu shell code, retire the `AdminShell::*` hook-debt keys and the size/complexity
keys of deleted functions.
Tests first (GREEN on the old shell, each RED under its mutation; they must keep passing after the swap):
| # | Asserts | Fails when |
|---|---|---|
| S1 | boot: `checking` shows the boot screen text, anonymous shows `Login`, authenticated shows the default panel | a session state maps to the wrong view |
| S2 | sign out → sign in as another user: draft identity is reset before the first panel render, and chart provider state is new | identity switch keeps the old user's drafts (class: cross-user state) |
| S3 | a 401 from any request returns to `Login` once (no loop) | `onUnauthenticated` wiring is lost |
| S4 | the session endpoint is called once at boot (use the `app-boot-request-volume` harness) | the Jini session hook re-reads on a port identity change (11-06 survey trap) |
| S5 | the drawer closes on route change and on backdrop click; `Escape` is ignored when an inner layer owns it (`lib/escape-owned-by-inner-layer`) | the drawer hook prop is not wired |
| S6 | DOM order of skip link, sidebar, main, dock aside, overlays is unchanged; `main` keeps `tabIndex=-1` and `data-agent-page` | focus order or the agent page id changes |
| S7 | rail collapsed state survives reload under the same storage key as today | `railStorageKey` differs from Tovu's present key (documented at `App.tsx:88-89`: Jini's `Sidebar` defaults to its own package key, Tovu passes its historic one; keep passing it) |
Chrome check (COMMON-ADMIN 4): **every** panel, both themes, both schemes, both widths, plus: mobile drawer open
and close animation still runs at 390 px; dock open/resize/sheet mode; logout confirm; server-restart banner.
STOP
- A Tovu shell element has no J2 slot. Report the element and line; do not add a prop to Jini from this sheet.
- S4 shows more than today's request count.
- Any panel differs visibly beyond the class rename.
