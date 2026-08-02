import { buildNav } from "@jini-ai/admin/core";
import { ADMIN_PANELS } from "./panels";

/**
 * @file Admin sidebar navigation model (grouped) — derived from `panels.tsx`.
 *
 * Purpose:
 * The blueprint for the per-site admin's grouped secondary nav — Overview plus
 * Content / People / Marketing / Design & System sections. Replaces the flat,
 * WordPress-shaped menu that came from `@tovu/admin-shell`.
 *
 * How it relates to the project:
 * - Rendered by `components/Sidebar.tsx`, which still consumes exactly this shape. This file used
 *   to be the source of truth for label/icon/group/order; it is now a thin projection of each
 *   panel's own `nav` field (`panels.tsx`) through `@jini-ai/admin/core`'s `buildNav`, so there is
 *   nowhere left for a nav entry to drift out of sync with the panel it describes.
 * - `href` is a **route path**, not a URL: `/settings`, not `/admin/settings`. Sidebar applies the
 *   `/admin` base via `lib/router.ts`'s `adminHref`, so this file stays base-agnostic and the base
 *   lives in exactly one place.
 * - This file's presence in `NAV` controls sidebar *presence* only, never reachability — a section
 *   is routable as soon as it exists in `panels.tsx`'s `ADMIN_PANELS`, with or without a `nav`
 *   field (`appearance` and `settings-raw` are both deliberately reachable with no nav entry).
 * - Adding a section: see `apps/admin/INFO.md`, "Adding a new admin section".
 *
 * Icons are inline SVG inner-markup (viewBox 0 0 18 18, stroke=currentColor).
 */
export interface NavItem {
  /** Matches the panel's id in `panels.tsx` (see `App.tsx`'s `currentPanelId`). */
  id: string;
  label: string;
  /** Inner SVG markup for an 18x18 stroked icon. */
  icon: string;
  /** Route path (`/settings`), not a URL — Sidebar adds the base. */
  href?: string;
  soon?: boolean;
}

export interface NavGroup {
  /** Group heading; omitted for the top-level Overview row. */
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = buildNav(ADMIN_PANELS).map((group) => ({
  ...(group.label === undefined ? {} : { label: group.label }),
  items: group.items.map((item) => ({
    id: item.id,
    label: item.label,
    // Every panel with a `nav` field supplies an icon in practice; `?? ""` only guards the type
    // (`AdminNavEntry.icon` is optional so a panel can be listed before anyone has drawn it one).
    icon: item.icon ?? "",
    href: item.href,
    ...(item.soon ? { soon: true as const } : {}),
  })),
}));
