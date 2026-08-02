# Slice 2b — Tovu admin panel manifest

**Date:** 2026-08-01
**Scope:** `apps/admin` — collapse `App.tsx`'s `SECTIONS` map, `nav.ts`, and `lib/agent-pages.ts`
into one declarative manifest built on `@jini-ai/admin/core`'s `AdminPanel` type.
**Depends on:** Slice 2a (`src/lib/router.ts` as a thin adapter over `@jini-ai/admin/core` +
`@jini-ai/admin/browser`) — already landed, untouched by this slice.

## Result

Typecheck clean, 41 files / 424 tests passing (unchanged count — no tests were added, edited, or
removed; this was a pure internal refactor behind the same public behaviour). Zero unhandled-error
noise in the suite, per `apps/admin/INFO.md`'s standing bar. No changes were needed in
`/Users/la/Programming/Jini` — the package API (`AdminPanel`, `matchRoute`, `buildNav`,
`buildAgentPageMap`, `resolveAgentPageId`, `panelHref`) fit as documented on the first attempt.

```
npm --prefix apps/admin run typecheck   # clean, before and after
npm --prefix apps/admin run test        # 41 files / 424 tests, before and after
```

The four pinned behavior test files (38 tests) were also run in isolation for direct evidence:
`app-route-prototype-keys.unit.test.tsx`, `app-agent-page-identity.unit.test.tsx`,
`nav-wiring.unit.test.ts`, `app-plugins-route.unit.test.tsx` — all 38 green, including every
`page.navigate(id)` round-trip entry in `ADMIN_AGENT_PAGE_PATHS` (25 entries).

## Files changed

- **`src/panels.tsx`** (new) — `ADMIN_PANELS: readonly AdminPanel<PanelRenderer>[]`, one entry per
  section (27 panels total: 25 with a `nav` field/sidebar row, plus `appearance` and `settings-raw`
  which are routable with none). Each panel carries its render thunk, its `nav` entry
  (label/icon/group, transcribed from the old `nav.ts`), its `agentReachable` flag (from the old
  `agent-pages.ts`), and its `routes` (detail patterns, from the old `App.tsx` `parseRoute`
  if-chain). Panels are registered in the same order the sidebar used to group them, since
  `buildNav`'s group/item ordering is registration-order-derived and I wanted zero visual diff.
- **`src/App.tsx`** — `Route` is now `AdminRoute & { unknownSectionId?: string }` instead of a
  15-variant discriminated union. `parseRoute` delegates to the package's `matchRoute` for
  everything except the legacy `/section/:id` pre-step (Tovu-local, see below). `agentPageId` wraps
  `resolveAgentPageId`. Added `currentPanelId` (sidebar highlight) and `renderRoute` (dispatch via a
  `PANELS_BY_ID` Map) as the two small pieces of glue the package doesn't own. The `SECTIONS` map,
  `sectionRenderer`, and the ~50-line render `switch` are gone; the ~30-line `parseRoute` if-chain is
  now 4 lines plus the section pre-step.
- **`src/nav.ts`** — `NAV` (same exported shape: `NavGroup[]` of `{id,label,icon,href?,soon?}`) is
  now `buildNav(ADMIN_PANELS).map(...)`, projected into that exact shape. `Sidebar.tsx`,
  `Placeholder.tsx`, and `nav-wiring.unit.test.ts` all still import `NAV`/`NavItem`/`NavGroup`
  unmodified and pass unmodified.
- **`src/lib/agent-pages.ts`** — `ADMIN_AGENT_PAGE_PATHS` is now `buildAgentPageMap(ADMIN_PANELS)`.
  `buildAdminAgentPages()` is unchanged (still Tovu's own — the package has no notion of Tovu's
  `navigate`).

`src/lib/router.ts`'s diff in `git status` predates this slice (Slice 2a, already landed
uncommitted) — not touched here.

## The four load-bearing behaviours

**(a) Legacy `/section/:id` accepts an arbitrary id; the modern bare segment doesn't.**
`matchRoute` has no such branch (it matches over an array of registered panels, full stop), so
`App.tsx`'s `parseRoute` keeps a 6-line Tovu-local pre-step: if the path starts with `section/<id>`,
check `<id>` against `PANELS_BY_ID` (a `Map`, built once from `ADMIN_PANELS`). A known id delegates
to `matchRoute('/' + id, ADMIN_PANELS)` — same resolution as the modern path, ignoring anything past
the id (matching the single inline branch this replaces: `/section/settings/foo` never looked past
`settings` either). An unknown id returns `{ panelId: null, view: null, params: {}, query, unknownSectionId: id }`.
`renderRoute` checks `unknownSectionId` first and renders `<Placeholder sectionId={id}>` — pinned
green by `app-route-prototype-keys.unit.test.tsx:87` (`/admin/section/constructor` → "unknown
section"), and `/admin/section/settings` still resolves to the real `SettingsUi` screen (manually
verified via the isolated run above, not separately asserted by name in the test file).

**(b) A bare unknown segment falls through to the dashboard.** `matchRoute` matches over an array
(`panels.find(p => p.id === segment)`), so the historic `Object.hasOwn`-vs-`in` hazard this file
used to guard against — `/admin/constructor`, `/admin/valueOf`, `/admin/__proto__`,
`/admin/toString`, `/admin/hasOwnProperty` resolving to `Object.prototype` members — is now
structurally impossible: there is no plain-object key lookup left to walk a prototype chain, on
either the array-`.find()` side (`matchRoute`) or the `Map.has()` side (the `section/` pre-step).
`renderRoute`'s fallback (`PANELS_BY_ID.get(route.panelId ?? "dashboard")`) sends `panelId: null` to
the `dashboard` panel. All 5 keys pinned green in `app-route-prototype-keys.unit.test.tsx`.

**(c) Sidebar highlight and agent-reported id deliberately disagree for widget regions.**
Expressed exactly as the dispatch brief specified, on `panels.tsx`'s `widgets` panel: `/regions` and
`/regions/:regionKey` both carry `agentPageId: 'widget-regions'`, while `/new` and `/:widgetId`
carry none. Sidebar highlight comes from `currentPanelId` (= `route.panelId`, i.e. `widgets` for
every widgets sub-route); agent id comes from `agentPageId`, which wraps
`resolveAgentPageId(ADMIN_PANELS, route.panelId, route.view)` — that function looks up the matched
route's `agentPageId` field, falling back to the panel id when absent. Both pinned green in
`app-agent-page-identity.unit.test.tsx` (widget-regions reports `widget-regions`, sidebar keeps
highlighting `widgets`, `/admin/widgets` itself is unchanged).

**(d) Round-trip invariant.** `it.each(Object.entries(ADMIN_AGENT_PAGE_PATHS))` in
`app-agent-page-identity.unit.test.tsx:125` asserts `agentPageId(parseRoute(routePath)) === pageId`
for all 25 entries `buildAgentPageMap(ADMIN_PANELS)` now produces. All pass, including the
`ai-assistant`/`settings-raw`/`newsletter` asymmetry the test's own comment documents (those screens
report an id via `agentPageId`'s fallback-to-panel-id path without ever appearing in
`ADMIN_AGENT_PAGE_PATHS`, because their panels have no `agentReachable: true` and no route names an
`agentPageId`) — nothing was done to "fix" that; it's `panels.tsx` leaving `agentReachable` unset
(defaults `false`) exactly as intended.

## Fidelity notes / deliberate non-preservations

- **Two comment-only simplifications in `nav.ts`.** The old file omitted `href` entirely for
  `soon: true` items (only `newsletter`); the new file always sets it (`buildNav` always computes
  `panelHref`). `Sidebar.tsx`'s `Item` component branches on `item.soon || !item.href`, so this is
  behaviorally inert — confirmed by re-reading `Sidebar.tsx` before making the change, not just
  inferred. No test asserts `newsletter`'s `href` is `undefined`.
- **`/admin/section/widgets` (and similarly `posts`, `menus`, `integrations`, `forms`) now renders
  the real screen instead of a "coming soon" `Placeholder`.** In the old code these five ids were
  never added to the `SECTIONS` map (they were routed via top-level `parseRoute` branches instead),
  so the legacy `/section/:id` fallback — which never checked `SECTIONS` membership — would call
  `sectionRenderer("widgets")`, get `undefined` (not `Object.hasOwn`), and fall to
  `<Placeholder sectionId="widgets">`, which then found `widgets` in `nav.ts` and rendered "Widgets
  is coming soon" — a genuinely broken legacy path that was never reachable by any real historical
  hash URL (the old hash router had its own patterns for these five, never a `#/section/widgets`
  shape) and is not exercised by any test. In the new manifest, `widgets` (and the other four) are
  full first-class `ADMIN_PANELS` entries, so `/section/widgets` now correctly resolves to
  `WidgetsLibrary`. This is a behavior change, but a pure improvement on an untested, unreachable-in-
  practice edge case — flagging it explicitly rather than silently letting it happen.
- Removed a handful of `?? ""` fallbacks in `panels.tsx`'s render thunks (`postId`, `formId`,
  `subscriptionId`, `regionKey`, `contentTypeKey`) after confirming each is guaranteed present by
  which pattern matched — `Record<string, string>` types every present key as `string` under this
  repo's `tsconfig` (no `noUncheckedIndexedAccess`), so the fallbacks were dead code masking that
  guarantee rather than expressing real optionality. `menuId`/`widgetId`/`entryId` keep their `??
  null` because those genuinely differ between the `/new` (no capture) and `/:id` (captured) routes.

## Nothing else preserved verbatim

The global `Route` discriminated union is gone, as directed — each panel's render thunk does its own
small `switch` on `view` now, which is what lets a panel own its URL space without a shared dispatch
to edit. `PanelRouteContext` (`{ view, params, query }`) is the one shared shape every thunk
receives.

## Open items / suggested next routing

None outstanding for this slice — all four load-bearing behaviours hold, the full suite is green,
and no package changes were required. Natural next step (not done here, out of scope): apply the
same manifest pattern to whatever other Jini-hosted product eventually reuses `@jini-ai/admin` — the
package's `resolvePanels`/`requires`/`permissions` fields exist for exactly that multi-tenant case
and are currently unused by Tovu (Tovu has no capability-gated panels today, so nothing here calls
`resolvePanels`).
