# auicheck2 — Admin UI (A) after Codex r3, 2026-10-17

## Commit
- A: edd096615 feat(admin): Admin UI section (Theme | Appearance) replaces Admin Themes, Appearance and Design System
  29 explicit paths: the A set + Codex r3 files + apps/website/src/features/site-inspection/admin-screens.generated.ts.
  Left out: admin-theme-token-contract.md, development/todos.md, AllSitesTab.unit.test.tsx, _fixtures.ts, shopify,
  bundled-inactive-gating, pages.ts.orig.

## Verification (each run under the machine test lock; CPU_Speed_Limit 100, load under 7)
- Manifest regen (`UPDATE_ADMIN_SCREENS_MANIFEST=1`, admin-screens-manifest test): 2/2. Diff: +admin-ui "Admin UI";
  +admin-themes "Admin Themes"; admin-appearance relabelled "Admin Appearance"; design-system kept (its route redirects).
  Before the regen, newest chat run_status was "succeeded" for both zoran and order-pinch.
- apps/admin vitest, 54 named files (list: scratchpad auicheck2/files.txt): 54/54 files, 803 passed, 2 skipped, 0 failed.
  Both earlier failures (manifest drift and the AdminAppearance stateful fake) now pass.
- apps/admin `npx tsc --noEmit -p .`: 0 errors.

## Look (Claude in Chrome; desktop and 390px iframe; light and dark)
- Admin UI shows 2 visible tabs (Theme, Appearance). Studio nav: themes, admin-ui, playground.
- Appearance: the "Color scheme" label is styled exactly like "Accent color" (12px / 500 / same colour in both schemes).
- Dark: active segment oklch(0.26) on track oklch(0.22) plus an inset 1px white/18% edge. Clearly visible.
- Light: active segment is white with the base shadow, the unchanged .segmented style. Left on LIGHT and checked after reload.
- Redirects: /admin/design-system, /admin/admin-ui?tab=design-system (hard load), /admin/admin-appearance and
  /admin/settings?tab=appearance all go to ?tab=appearance. /admin/admin-themes goes to ?tab=theme. No "Design System" text.
- 390px: scrollWidth equals clientWidth on both tabs, no elements overflow, accent swatches wrap.

## Issues for Codex (NITs, none blocking)
1. admin-screens.generated.ts / ADMIN_AGENT_PAGE_PATHS still publish "Admin Themes", "Admin Appearance" and
   "Design System" as agent screens, but each of those routes is now a redirect. An agent reading the screen list would
   think a Design System page exists. Fix: point them at their targets (as `integrations` → ?tab=webhooks already does)
   or drop them from the agent page map.
2. AdminUi.tsx: the strings "Studio", "Admin UI", "Theme" and "Appearance" are hard-coded English. AdminAppearance's
   "Loading appearance…" is hard-coded too. The admin-themes strings next to them use t().
3. admin-theme-bridge.css hard-codes 23 Jini Default token values. The new parity test compares them with node_modules
   Jini Default, so a future Jini palette change will fail the Tovu test (intended drift guard, but worth knowing).

## HOME
- sites.json md5 changed (9dea5d41… → 19c448b0…). Cause: the :3000 tsx-watch restart after the manifest regen
  bumped tovu-dev `lastOpened` to 2026-10-18T02:51:49Z (19:51:49 PDT, 9 s after the regen finished). It is the
  restart the brief expected, not a test write. The same 5 entries remain (luvira, plannie, tovu-dev, order-pinch,
  zoran), nothing was added, nothing removed. site-keys stayed at 860 and ~/Documents/Tovu still has the same 5 dirs.
- No vitest or node --test processes left (pgrep returned no pids).
