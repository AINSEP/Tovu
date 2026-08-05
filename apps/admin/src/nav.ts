import { buildNav, type AdminNavGroup, type AdminNavItem } from "@jini-ai/admin/core";
import { ADMIN_PANELS } from "./panels";

/**
 * @file Admin sidebar navigation model (grouped) — derived from `panels.tsx`.
 *
 * Purpose:
 * The blueprint for the per-site admin's grouped secondary nav — Overview plus
 * Content / People / Marketing / Design & System sections. Replaces the flat,
 * WordPress-shaped menu the admin previously rendered from a shared,
 * framework-agnostic shell package (since removed as dead code once this file
 * became the real source of truth).
 *
 * How it relates to the project:
 * - Rendered by `@jini-ai/admin/react`'s `<Sidebar.Nav groups={getNav()}>`. This file used to
 *   reshape `buildNav`'s output into a bespoke local `NavGroup`/`NavItem` (a required
 *   `icon: string`, dropped `order`); that reshaping is gone now that `Sidebar.Nav` itself takes
 *   `AdminNavGroup[]` and handles an absent icon (`item.icon ?? ''`) — one less place for the two
 *   shapes to drift apart. `getNav()` returns exactly `buildNav(ADMIN_PANELS)`, computed once and
 *   cached here so `App.tsx` and `components/Placeholder.tsx` share one nav model instead of each
 *   calling `buildNav` itself.
 * - `href` is a **route path**, not a URL: `/settings`, not `/admin/settings`. Sidebar applies the
 *   `/admin` base via `@jini-ai/admin/core`'s `adminHref`, so this file stays base-agnostic and the
 *   base lives in exactly one place.
 * - This file's presence in the nav controls sidebar *presence* only, never reachability — a
 *   section is routable as soon as it exists in `panels.tsx`'s `ADMIN_PANELS`, with or without a
 *   `nav` field (`appearance` and `settings-raw` are both deliberately reachable with no nav entry).
 * - Adding a section: see `apps/admin/INFO.md`, "Adding a new admin section".
 *
 * Icons are inline SVG inner-markup (viewBox 0 0 18 18, stroke=currentColor).
 *
 * ## Why `getNav()` and not a plain `NAV` constant
 *
 * This file sits in a genuine import cycle: `panels.tsx` imports `components/Placeholder.tsx`, which
 * imports this file for its own nav lookup, and this file imports `ADMIN_PANELS` back from
 * `panels.tsx`. Computing `buildNav(ADMIN_PANELS)` eagerly at this module's own top level (the
 * first version of this file did exactly that) raced that cycle: depending on which module the
 * bundler happened to enter the cycle through first, `ADMIN_PANELS` could still be an unassigned
 * binding at the moment this ran, and `buildNav` would throw on `panels.forEach` over `undefined`
 * — reproduced by `App.tsx` importing this file directly (previously only `Placeholder.tsx` and
 * the old local `Sidebar.tsx` did, and that import order happened not to trigger it).
 *
 * `getNav()` sidesteps the ordering hazard rather than depending on it resolving favorably: nothing
 * calls it from module-top-level code, only from inside a component's render or a helper function,
 * which only ever runs after the whole module graph has finished linking — so `ADMIN_PANELS` is
 * always fully assigned by the time `buildNav` actually needs it. Still computed once and cached
 * (not per-call), same "single source of truth" property the eager constant had.
 */
export type { AdminNavGroup, AdminNavItem };

let cachedNav: readonly AdminNavGroup[] | undefined;

/**
 * The nav model shared by `App.tsx` (passed to `Sidebar`) and `components/Placeholder.tsx` (its own
 * lookup). See the file header for why this is a lazy, memoized function rather than a module-level
 * constant.
 *
 * @complexity O(1) amortized — `buildNav` (`O(n log n)` in panel count) runs once; every call after
 * the first returns the cached array.
 */
export function getNav(): readonly AdminNavGroup[] {
  if (!cachedNav) cachedNav = buildNav(ADMIN_PANELS);
  return cachedNav;
}
