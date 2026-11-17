# T1 sheets: Tovu adopts Jini's `AdminShell` (2 runs, Tovu only). Read `COMMON-ADMIN.md` first.

| Sheet | Work | Estimate | Needs |
|---|---|---|---|
| T1a | panels gate through Jini's access rule (`@jini-ai/admin/core`, J1 test T9 proves the export); delete `lib/panel-access.ts` | 100k | J1 linked |
| T1b | `App.tsx` renders Jini `AdminShell`; Tovu's own shell function and duplicated chrome are deleted | 380k (judge 2: was 260k; + route parity step 0, + class-rename ripple of 88 Tovu files incl. e2e) | J2 steps 1-4 incl. its judge-2 seams (1b `useHostSession`, `ids`, `afterMain`, `assistantAside`), J2 `admin-ui/J2-classes` merged *with* step 3, J3, T1a, A0, A1; owner decision AU-D15; Opus review of the diff before merge |
Both edit `App.tsx` and `panels.tsx`: serial. Nothing else in this plan may edit `App.tsx`, `App.chrome.tsx`,
`App.hooks.ts`, `App.session.ts`, `nav.ts`, `styles.css` shell selectors or the `development/e2e` shell selectors while T1 is open.

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
the 51 ids against 4 lists: unknown, empty, `['*']`, one editor-like list taken from an existing test). **The expected
sets come from Tovu's rule today** (Opus m4): on the base commit, run `withoutInaccessiblePanels` from
`lib/panel-access.ts` (`:64`) over the real `panels.tsx` list for each of the 4 lists and pin the results as
literals in the test before any edit; never compute them from Jini's `resolvePanels`/`isPanelAccessible` (J1
changed that rule on purpose, D-11). After T1a the Jini rule must reproduce the literals. P2 a routed
panel that fails the gate renders `NoAccess`, and renders the panel while permissions are unknown.
STOP: a panel is visible before and hidden after (or the reverse) for any of the 4 lists.

## T1b: the shell swap
**Second judge (2026-11-17, Tovu `232764af5`, Jini `65d73b0d5`): revision 3's mapping would have broken current
screens.** It had no row for Tovu's route layer (`parseRoute`, `renderRoute`'s redirect, `Placeholder` and Sites
gate), for the panel render signature, for the second link interceptor, for the session source that also feeds
`AdminBootScopeContext`, for `KitProvider`/`ScrollJumpButtons` inside the main column, or for the DOM ids four Tovu
hooks and one CSS rule look up. The baseline tests that pin those behaviours (run for real: `src/__tests__/unit/app-*`
+ `app-boot-request-volume.test.tsx` = **26 files, 259 tests, all pass** at `232764af5`, linked to Jini `65d73b0d5`)
would fail: `app-route-prototype-keys` (`/section/constructor` → Placeholder), `app-assistant-alias`,
`app-sites-section-visibility`, `app-agent-page-identity`, `app-shell-chrome`. The rows below are new or corrected;
each names its J2 seam. They must all stay green **unchanged** through step 4 (C6).

Mapping (line numbers re-verified at `232764af5`):
| Tovu today | After |
|---|---|
| `AdminShell` function `App.tsx:643-703` | deleted; a Tovu wrapper (`App`'s child, e.g. `TovuAdminShell`) runs Tovu's hooks (`useShellAvailability`, `useShellRoute`, `useShellDockChrome`, `useShellContent`, `useShellLocale`, each injected per the owner rule) and renders `<AdminShell …/>` from `@jini-ai/admin/react/shell` |
| `App` + `AdminBootScopeContext.Provider` (`App.tsx:451-463`) around boot, login and shell | **unchanged**: `App` keeps calling `useAdminSession()` (`App.hooks.ts:109-228`) and providing the boot scope; the shell receives that same session through J2 step 1b `useHostSession` (an adapter hook: `checking` → `{status:'checking'}`, `user === null` → `anonymous`, else `authenticated` with `{ user, effectivePermissions }` passed through as is, `undefined` stays `undefined`; `logout` = the session's `logout`; `refresh` = re-run of the session read the hook already owns). **No** `AdminShellSessionPort` adapter: the boot-token fragment, guarded local-owner bootstrap, epoch guard, settings-change feed and `onUnauthenticated` stay in the one place they live (lesson 12). `App.session.ts` stays |
| `Login onLogin={handleLogin}`, boot screen "Loading Tovu…" (`App.tsx:663-664`) | `slots.login` renders `<Login onLogin={session.handleLogin} />` (Jini's `refreshSession` arg unused, say so); `labels.loading` = the same translated string. Jini adds `role="status"` to the boot screen (a11y gain, not a regression) |
| route read: `useRouteLocation()` + `parseRoute` (`App.tsx:119-148,488-498`) | J2 `useRouteHook` = a Tovu hook returning the **canonical** route path, pure: `/assistant…` → `/ai-assistant…`, `/section/<known>` → `/<known>`, moved import-export / add-ons paths → `moved.matchPath` (`resolveImportExportRoute`, `resolveAddonsRoute`), bare `/section` → `/`, `/section/<unknown>` → `/section/<unknown>` (row below). `useDesktopViewRelease`, `useAgentScreenRoute(agentPageId(route))`, `useAdminTelemetry` stay in the wrapper on Tovu's own `parseRoute`, unchanged |
| `route.redirectPath` → `<IntegrationsRedirect>` instead of the screen (`App.tsx:201`) | the canonical screen renders directly (the alias test's "without mounting Dashboard first" still holds) and the same `IntegrationsRedirect` (replace, no push) is mounted from `slots.overlays` while the raw path has a `redirectPath`. One mount of the target screen, as today |
| `/section/<unknown>` → `<Placeholder sectionId>` (`App.tsx:202-204`) | a hidden Tovu panel `id: "section"` (no `nav`, route `/:sectionId`) whose render is `<Placeholder sectionId={params.sectionId} />`. Sidebar highlight: nothing, as today. **Declared change, owner decision AU-D15 (new):** `data-agent-page` becomes the hidden panel's id instead of the unknown id (`App.tsx:181-183`); unknown ids are not published pages (`app-agent-page-identity.unit.test.tsx:136` already says so). Recommendation: accept. If refused, T1b STOPs here (no seam reports a param as the page id) |
| Sites gate `resolveSiteSectionRouteGate` → `hold` (null) / `redirect` (`UnavailableSectionRedirect`) (`App.tsx:209-211`, `App.hooks.ts:487-494`) | inside the panel adapter below, for the `sites` panel only, on the availability the wrapper already reads (`useSiteSectionAvailability`). Order differs: Jini applies `access` (J1) **before** render, Tovu applied the Sites gate first; `sites` declares `anyOfPermissions: ["system.read"]` (`panels.tsx:141`), so an operator without `system.read` on a deployment **without** Sites now sees NoAccess at `/sites` instead of a redirect to `/`. Both say "not for you"; test S15 pins the new answer; name it in the changeset |
| panel render signature: Tovu `render(ctx: PanelRenderContext)` = `{ view, params, query, Placeholder }` (`panel-contracts.ts:2-11`, `panels.tsx:1304-1311` Suspense wrapper) vs Jini `render(args: AdminShellRenderArgs)` | one Tovu adapter `toShellPanels({ panels: ADMIN_PANELS, siteSection, contentEl })` (memoized on its inputs: J2 step 2 keys the nav on `panels`), mapping `args.route` to `{ view, params, query, Placeholder }` and wrapping the result in `<KitProvider kit={tovuKit} agent={tovuAgentAttrs} overlayContainer={contentEl}>` exactly as `ShellMain` does (`App.chrome.tsx:188-190`). **Per panel, not in `frame`**: the dock sits outside `KitProvider` today, and an overlay container of `<main>` would capture the dock's popovers |
| `NoAccess` (`App.tsx:231-244`) | `slots.noAccess` (J1) |
| providers `AdminModulesProvider`, `ChartRegistryProvider key={user.id}`, `ConfirmDialogDefaultsProvider` (`App.tsx:678-680`) | one Tovu component `AuthenticatedProviders` passed as J2 `slots.frame`, keyed on the user id exactly as today (the key resets chart state on identity switch: keep the comment); `AdminModulesProvider permissions={session.effectivePermissions ?? NO_PERMISSIONS}` from the frame args. **Never** inside `panels[].render` (`RoutedA2uiSurfaceCard.tsx:75` reads `AdminChartRegistryContext`; default `chart-registry-context.ts:10-13` is the core registry; round-1 judge blocker 2) |
| `AdminSidebar` (`App.tsx:587-641`) | stays a Tovu component, rendered through J2 `slots.sidebar` with `nav`, `sidebarProps`, `setDrawerOpen`; adds `{...dockRail}` and `railDefaultCollapsed` itself; does **not** spread `sidebarProps.label` unless the owner wants the nav's accessible name to change from "Admin" (Tovu passes none today). Its hooks (`useCollapsibleNavGroupLabels`, the tooltip and empty-click components' hooks) become injected props (owner rule). The two-slice nav comment block (`:612-627`) moves with it unchanged |
| DOM ids `admin-sidebar`, `main-content` | J2 step 4 `ids={{ sidebar: "admin-sidebar", main: "main-content" }}`: read by `use-sidebar-empty-click-toggle.hooks.ts:81`, `use-cms-sidebar-label-tooltips.hooks.ts:13`, `use-sites-sidebar-nav.hooks.ts:65`, `use-drawer-active-item-centring.hooks.ts:73`, `styles.css:247`, the skip link, `focus-ring-css.unit.test.ts` |
| admin theme (`useAdminThemeDocument`, `useAdminThemeBoundary`, `paintAdminTheme`) | unchanged in Tovu; `useThemeHook={() => undefined}` (J3) |
| `useSidebarDrawer` (`App.hooks.ts:590-611`, returns `{ sidebarOpen, setSidebarOpen }`) + `useDrawerActiveItemCentring` (`App.tsx:506`) | J2 `useDrawerHook` = a Tovu adapter calling both and returning Jini's shape `{ open, setOpen }` (different field names: lesson 12; test S5) |
| `useLogoutConfirm` (`App.hooks.ts:549`), `LogoutConfirmDialog` (`App.tsx:319-332`) | hook stays in the wrapper; dialog = `slots.beforeMain` (between sidebar and backdrop, as today) |
| `useInternalLinkInterceptor` (`App.hooks.ts:620-622`) **and** Jini's `navigation.installLinkInterceptor` (`AdminShell.hooks.ts:10`) | **exactly one interceptor**: the navigation port passed to the shell is `createAdminShellNavigation(…)` with `installLinkInterceptor` replaced by Tovu's `installInternalLinkInterceptor` (`lib/router.ts:63`, today's behaviour), and the wrapper drops its own `useLinkInterceptor` call (the `AppProps.useLinkInterceptor` seam and its tests move to the port). Two interceptors would push two history entries per click (S12) |
| `ShellSkipLink`, `AdminTopbar`, `ShellMain` (`App.chrome.tsx:135-256`) | deleted where Jini renders the same element (`title="Tovu"`; J2 adds `strokeLinecap="round"`); `ShellMain`'s content ref and `data-agent-page` map to `mainRef` and the model's `agentPageId`; `ScrollJumpButtons` (`:195-198`) → J2 `slots.afterMain`; `KitProvider` → the panel adapter row above |
| backdrop `<div className="sidebar-backdrop">` (`App.tsx:690`) | Jini's `<button>` with `aria-label`; step 3 adds `border: 0; padding: 0` to the renamed `.sidebar-backdrop` rule (`styles.css:1453`) |
| `ChatDockAside`, `SheetBar`, `AssistantChrome`, `useChatDockLayout`, `resolveChatFabClearance` | stay in Tovu, passed as J2 `slots.assistantAside` (S-DOCK moves the generic part later) |
| `ShellOverlays` | `slots.overlays` (plus the redirect row above) |
| `resolveAdminLayoutClassName(interfacePreferences)` (returns `"admin-layout …"`, `hooks/use-interface-preferences.hooks.ts:54-60`) | `className` prop **without** its first token: Jini already writes `admin-layout` (renamed by J2 step 5); passing it again duplicates the class. Split the function into the modifier list (`hides-fab-while-open`, `wraps-tabs`) |
| site-section nav logic (`withoutSiteSection`, `App.hooks.ts:453-460`), add-ons hrefs (`nav.ts`), publish deep link, agent page bridge, WebMCP tools, screenshot announcement | stay in Tovu. The nav rewrites (`getNav()`'s add-ons hrefs and `soonPreviewable`, `withoutSiteSection`, translation) go into one `translateNav`, wrapped in `useCallback` (J2 step 2 memo) |
| shell selectors in `styles.css` / `styles/`, **TS selectors and e2e** | renamed to the `jini-admin-*` names in Jini `packages/admin/docs/shell-classes.md` (J2 step 5): 65 files in `apps/admin/src` (378 lines, of which 174 CSS selector lines), 20 in `development/e2e`, 3 in `apps/desktop` (census command in J2 step 5, run on Tovu); no selector duplicated |

Order (each a green commit): (0) **route parity first**: the canonical route hook, the hidden `section` panel and the
panel adapter, used by the **old** shell's `renderRoute` (so the 26 `app-*` files prove them before the swap);
(1) `useHostSession` adapter + its tests, unused; (2) `AuthenticatedProviders` for the three providers, used by the old
shell in the same place; (3) the class rename (Tovu CSS, TS selectors, e2e, desktop) **together with** merging J2's
`admin-ui/J2-classes` (J2 step 5 merge timing), relinked to that Jini SHA; (4) swap to Jini `AdminShell`; (5) delete
dead Tovu shell code, retire the `AdminShell::*` hook-debt keys and the size/complexity keys of deleted functions.
Tests first (GREEN on the old shell, each RED under its mutation; they must keep passing after the swap):
| # | Asserts | Fails when |
|---|---|---|
| S1 | boot: `checking` shows the boot screen text, anonymous shows `Login`, authenticated shows the default panel | a session state maps to the wrong view |
| S2 | sign out → sign in as another user: draft identity is reset before the first panel render, and chart provider state is new | identity switch keeps the old user's drafts (class: cross-user state) |
| S3 | a 401 from any request returns to `Login` once (no loop) | `onUnauthenticated` wiring is lost |
| S4 | the session endpoint is called once at boot (use the `app-boot-request-volume` harness) | a second session reader exists (a port read beside `useAdminSession`) |
| S5 | the drawer closes on route change, on backdrop click and on `Escape` (today's `useSidebarDrawer`, `App.hooks.ts:601-608`: plain Escape. Revision 3 said "Escape is ignored when an inner layer owns it": that is the **chat dock's** rule, `App.hooks.ts:793`, not the drawer's; never assert it here) | the drawer hook adapter is not wired or maps the wrong fields |
| S6 | DOM order of skip link, sidebar, logout dialog, backdrop, main column (topbar, main, scroll buttons), dock aside, overlays is unchanged; `main` keeps `id="main-content"`, `tabIndex=-1` and `data-agent-page`; the nav keeps `id="admin-sidebar"` | focus order, ids or the agent page id change |
| S7 | rail collapsed state survives reload under the same storage key as today | `railStorageKey` differs from Tovu's present key (`App.tsx:86-94`: Jini's `Sidebar` defaults to its own package key) |
| S8 | a dock card (`RoutedA2uiSurfaceCard` rendered inside the dock) reads the **authenticated** chart snapshot: `generation` is not `"core"` and the provider stylesheets are present | the providers sit below the dock (in a panel render) or the frame slot is not wired |
| S9 | navigating between two panels does not remount `ChartRegistryProvider` (a mount counter in a test child stays 1); switching principal remounts it (counter 2) | the provider lifetime follows the route, or the `key={user.id}` is lost |
| S10 | with the dock open in a window inside the auto-rail band, the sidebar is railed; closing the dock restores the operator's saved rail choice (drive `useDockAutoRail` with a fake `matchMedia`) | `dockRail` is not spread onto `Sidebar` in the sidebar slot |
| S11 | DOM of the sidebar: mobile header, group 0, rail toggle, remaining groups, footer logout, in that order | the two-slice nav arrangement is lost |
| S12 | one click on an internal `<a href="/admin/posts">` adds exactly one history entry and one route change | two link interceptors are installed |
| S13 | `/admin/assistant?x=1` renders the AI Assistant screen without mounting Dashboard and ends at `/admin/ai-assistant?x=1` (query bytes kept); `/admin/section/settings` renders Settings; a moved import-export URL lands on its new home | the canonical route hook drops an alias or a redirect |
| S14 | `/admin/section/constructor` and `/admin/section/nope` render the Placeholder; `/admin/section` renders Dashboard | the hidden `section` panel or the bare-path mapping is missing |
| S15 | Sites: availability `unknown` renders nothing at `/sites`; `unavailable` + `system.read` redirects to `/`; `unavailable` without `system.read` shows NoAccess (declared order change) | the Sites gate is lost or runs for another panel |
| S16 | a page popover opened inside a panel portals into `<main>` (`KitProvider overlayContainer`); a dock popover does not | `KitProvider` moved into `frame` or dropped |
Chrome check (COMMON-ADMIN 4): **every** panel, both themes, both schemes, at 1440, 390 **and 1024 px** (inside the
auto-rail band, dock open and closed: the 1440/390 pair never exercises it), a chart card in the dock, plus: mobile drawer open
and close animation still runs at 390 px (and the backdrop shows no button border); dock open/resize/sheet mode;
logout confirm; server-restart banner; one legacy `/section/<id>` URL and `/assistant`.
STOP
- A Tovu shell element is in neither the mapping table nor a J2 seam. Report the element and line; do not add a
  prop to Jini from this sheet. Check before step 4 and tick every name against the table (second judge ran it at
  `232764af5`: 31 names (25 + 6), every one now has a row (the five `useShell*` hooks stay in the wrapper): `parseRoute`, `currentPanelId`, `agentPageId`, `renderRoute`,
  `NoAccess`, `UnavailableSectionRedirect`, `SidebarLogoutButton`, `SidebarLabelTooltips`, `SidebarEmptyClickToggle`,
  `LogoutConfirmDialog`, `AssistantChrome`, `resolve*Hook` x5, `App`, `useShell*` x5, `buildShellNav`, `AdminSidebar`,
  `AdminShell`; `App.chrome.tsx`: `SheetBar`, `ChatDockAside`, `AdminTopbar`, `ShellMain`, `ShellOverlays`, `ShellSkipLink`):
  ```
  rg -n "^function \w+|^export function \w+" $T/apps/admin/src/App.tsx $T/apps/admin/src/App.chrome.tsx
  ```
- Any of the 26 baseline `app-*` test files needs an edited assertion before step 5 (C6), except the ones this sheet
  names: S5's old wording and AU-D15's agent page id.
- AU-D15 refused.
- S4 shows more than today's request count.
- Any panel differs visibly beyond the class rename and the backdrop reset.
