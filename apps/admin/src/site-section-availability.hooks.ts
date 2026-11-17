import { isDesktopAdmin } from "./features/settings/ai-agent-presentation";
import { sitesApi } from "./features/sites/api/sites-api";
import type { AdminUser } from "./features/auth/api/auth-api.types";
import { useSitesSnapshot } from "./features/sites/hooks/use-sites-snapshot.hooks";
import { useEffect, useState } from "react";
import type { AdminNavGroup, AdminNavItem } from "./nav";

/**
 * @file Whether this admin client has a Sites section at all, and what each surface does about it:
 * the route gate, the sidebar row (with its remembered first-paint answer) and the nav filter.
 * A verbatim move out of `App.hooks.ts` (its size ratchet), no behavior change.
 */

/**
 * `panels.tsx`'s own id for the Sites section, named once here rather than inlined at the two call
 * sites that gate on it ({@link withoutSiteSection} and {@link resolveSiteSectionRouteGate}).
 *
 * The id itself is untouched by this gate, deliberately: `ADMIN_PANELS` still declares `sites` in
 * the same position with the same `nav` block, `matchRoute` still resolves `/sites` to it, and
 * `ADMIN_AGENT_PAGE_PATHS` still publishes it. Hiding a section here means "do not show it and do
 * not let this route render it on this deployment" — never renaming, renumbering, or removing a
 * panel, which would move every other section's identity with it.
 */
export const SITES_PANEL_ID = "sites";

/**
 * Whether this admin client has a Sites section at all.
 *
 * Three states, not a boolean, and the third one is the point: outside the desktop shell the answer
 * comes from the server, so "not answered yet" has to be distinguishable from "no". Collapsing
 * `unknown` into `false` would redirect a developer's own `/admin/sites` deep link to the dashboard in the window before
 * the flag arrives; collapsing it into `true` would flash the Sites screen inside the desktop app,
 * which is the exact thing this gate exists to prevent.
 */
export type SiteSectionAvailability = "unknown" | "available" | "unavailable";

/**
 * Resolves the desktop shell first, otherwise reads the deployment's site-switcher capability
 * flag, and reports a section-visibility answer.
 *
 * ## Why this reuses `switchingEnabled` rather than introducing a second flag
 *
 * `TOVU_ENABLE_SITE_SWITCHER` (`apps/website/src/platform/site-dir/site-switcher-enabled.ts`)
 * already exists, is already default-OFF, and its own header already enumerates exactly the three
 * deployments this section cares about: ON for local `npm run dev` (set by
 * `development/scripts/dev.mjs`), OFF for a Tovu-Runner/desktop host, OFF for a hosted install.
 * That keeps the owner's browser requirement — "sites page is for when a dev runs `npm run dev`
 * themselves" — with no new variable. The shell can also attach to an existing dev server whose
 * flag is ON, so the server flag alone cannot distinguish the two clients. `isDesktopAdmin` already
 * owns that check through the synchronous `tovuFiles`/`tovuVoice` preload bridges. The shell wins
 * before the first paint and needs no server read: its own All tab already lists and switches sites.
 *
 * The flag also already reaches this client. `GET .../system/sites` is deliberately NOT gated on
 * it; the route carries its value instead, and that route's own header states the intended use in
 * as many words — "its response CARRIES the flag's value (`switchingEnabled`) so the UI can decide
 * whether to render the 'Sites' nav item, a disabled Create button, etc. without a second round
 * trip". Until now only the second half of that sentence was wired: `Sites.tsx` disabled Create and
 * Activate and explained why, while the nav item and the route stayed live everywhere. This hook is
 * the first half.
 *
 * Shares `useSitesSnapshot` with the screen and sidebar label: visibility is a projection of the
 * same authorized directory listing, so those mounts must not issue independent boot requests.
 * The principal key keeps one session's visibility answer out of another session's first paint.
 *
 * Fails CLOSED, the opposite of `useAdminAssistantAvailability`'s fail-open posture, because the
 * server's own default is the opposite: absent the var the capability is off, and
 * `features/sites/rules.ts`'s `readSnapshot` already records the same rule for the same field
 * ("`switchingEnabled` in particular must fall back to `false`, not true"). A rejected read —
 * including the 403 an operator without `system.read` gets — therefore hides the section rather
 * than showing a screen whose every request would fail.
 *
 * Gated on `user` for the same reason its sibling is: a pre-login request would 401, and the value
 * plays no role before `App.tsx`'s `<Login>` gate clears.
 *
 * @param input.user - `useAdminSession()`'s current session, or `null` before login.
 * @param options.desktop - Injectable shell check; defaults to the existing preload-bridge detector.
 * @returns `unavailable` synchronously in the shell; otherwise `unknown` until the read settles,
 *   then `available` only if the server said the flag is on.
 * @complexity O(1) plus one server round trip per browser session; no round trip in the shell.
 */
export function useSiteSectionAvailability(
  { user }: { user: AdminUser | null },
  { desktop = isDesktopAdmin({}) }: { desktop?: boolean } = {},
): SiteSectionAvailability {
  // Identity belongs in the query key: logout/401 must not paint the previous user's answer,
  // and an ordinary remount in this session should reuse the already authorized snapshot.
  const snapshot = useSitesSnapshot({ port: sitesApi }, { enabled: !!user && !desktop, principalId: user?.id });
  return siteSectionAvailability({ desktop, user, snapshot });
}

/** Project visibility without changing the query's identity or fail-closed boundary. */
function siteSectionAvailability({ desktop, user, snapshot }: {
  desktop: boolean; user: AdminUser | null; snapshot: ReturnType<typeof useSitesSnapshot>;
}): SiteSectionAvailability {
  if (desktop) return "unavailable";
  if (!user) return "unknown";
  if (snapshot.error) return "unavailable";
  if (!snapshot.data) return "unknown";
  return snapshot.data.switchingEnabled === true ? "available" : "unavailable";
}

/** Where {@link useSidebarSiteSection} remembers this deployment's last confirmed answer. */
export const SITES_ROW_STORAGE_KEY = "tovu-admin-sites-row-available";

/** Storage access throws in a locked-down browser; the row then simply waits for the server. */
function readSitesRowFlag({ storage }: { storage: Pick<Storage, "getItem"> | undefined }, _options: Record<string, never> = {}): boolean {
  try { return storage?.getItem(SITES_ROW_STORAGE_KEY) === "1"; } catch { return false; }
}

function writeSitesRowFlag({ storage, available }: { storage: Pick<Storage, "setItem"> | undefined; available: boolean }, _options: Record<string, never> = {}): void {
  try { storage?.setItem(SITES_ROW_STORAGE_KEY, available ? "1" : "0"); } catch { /* best effort */ }
}

function defaultSitesRowStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

/**
 * The sidebar's own view of {@link useSiteSectionAvailability}: while the server's answer is still
 * `unknown`, it reuses this browser's last confirmed answer for this deployment, so the Sites row is
 * there from the first paint instead of arriving late and pushing every row under it down (owner,
 * 2026-10-26: a mis-click risk). Nav only — the route gate keeps the strict three-state answer, so a
 * `/admin/sites` visit still holds until the server confirms. A deployment that never had the
 * section (desktop, hosted) remembers `unavailable` and shows no row either way.
 *
 * @param availability - {@link useSiteSectionAvailability}'s answer.
 * @param options.storage - Injectable `localStorage`.
 * @complexity O(1).
 */
export function useSidebarSiteSection(
  availability: SiteSectionAvailability,
  { storage = defaultSitesRowStorage() }: { storage?: Pick<Storage, "getItem" | "setItem"> } = {},
): SiteSectionAvailability {
  const [lastAvailable] = useState(() => readSitesRowFlag({ storage }));
  useEffect(() => {
    if (availability !== "unknown") writeSitesRowFlag({ storage, available: availability === "available" });
  }, [availability, storage]);
  return availability === "unknown" && lastAvailable ? "available" : availability;
}

/** {@link withoutSiteSection}'s predicate, hoisted out of the `.filter` call so the id comparison is
 *  one named thing rather than an inline arrow repeated per group. */
function isNotSiteSection(item: AdminNavItem): boolean {
  return item.id !== SITES_PANEL_ID;
}

/**
 * The sidebar nav model with the Sites row dropped when this deployment has no Sites section.
 *
 * Filters ITEMS, never groups. `App.tsx` splits the rendered nav by group index
 * (`navGroups.slice(0, 1)` for the ungrouped top row, `.slice(1)` for the labelled sections), so
 * dropping a group would shift that boundary and move the rail toggle. Sites lives in the ungrouped
 * top row alongside Overview and AI Assistant, both of which survive, so the group itself is never
 * emptied and every index either side of it is unchanged. `AdminNavItem` carries no positional
 * field — `buildNav` sorts by `order` with registration order as the tiebreak — so removing one row
 * cannot renumber another.
 *
 * Returns the input array unchanged (same reference) when the section is visible, so the common
 * case allocates nothing.
 *
 * @param groups - `nav.ts`'s `getNav()` output, untranslated.
 * @param availability - {@link useSiteSectionAvailability}'s answer. Anything but `available` hides
 *   the row, so the desktop app never paints a Sites item it would then have to take away.
 * @complexity O(n) in total nav items.
 */
export function withoutSiteSection(
  groups: readonly AdminNavGroup[],
  availability: SiteSectionAvailability,
): readonly AdminNavGroup[] {
  if (availability === "available") return groups;
  return groups.map((group) => ({ ...group, items: group.items.filter(isNotSiteSection) }));
}

/** What `App.tsx`'s `renderRoute` should do with the route it just resolved. `hold` is the
 *  not-yet-known case — render nothing for this one frame rather than guess. */
export type SiteSectionRouteGate = "render" | "hold" | "redirect";

/**
 * Whether this route may render, must wait, or must leave.
 *
 * This is the half of the change that makes the section genuinely absent rather than merely
 * unlinked. A hidden nav row with a live route still answers `/admin/sites` — to a typed URL, to a
 * bookmark, to `page.navigate("sites")`, and to anything that restores the last section an operator
 * was on — which is precisely the surface the desktop app must not have.
 *
 * `redirect` sends the browser to the default section (`/`, the dashboard) rather than rendering a
 * "not available here" screen. Both satisfy "unreachable"; the redirect is chosen because a
 * not-available screen is still a Sites screen, in a shell whose own tabs already own site
 * switching, offering the operator nothing to do — and because this admin already resolves exactly
 * this shape that way twice (`WorkspaceRedirect`, `IntegrationsRedirect`), so a third case behaves
 * like the two beside it.
 *
 * Every non-Sites route returns `render` on the first branch, so no other section can be affected
 * by this gate however the flag resolves.
 *
 * @param input.panelId - the resolved route's panel id (`null` for a route matching no panel).
 * @param input.availability - {@link useSiteSectionAvailability}'s answer.
 * @complexity O(1).
 */
export function resolveSiteSectionRouteGate(
  { panelId, availability }: { panelId: string | null | undefined; availability: SiteSectionAvailability },
  _options: Record<string, never> = {},
): SiteSectionRouteGate {
  if (panelId !== SITES_PANEL_ID) return "render";
  if (availability === "available") return "render";
  if (availability === "unknown") return "hold";
  return "redirect";
}
