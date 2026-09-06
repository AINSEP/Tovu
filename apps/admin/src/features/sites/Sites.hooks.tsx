import { buildAgentListHandles } from "../../lib/agent-list-handles";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import type { TabBarTab } from "../../components/TabBar";
import { siteRowState, siteRowStateLabelKey, siteRowStateToneClass } from "./rules";

/**
 * @file `Sites.tsx`'s own derived-value logic, split out per the `<Name>.tsx`/`<Name>.hooks.tsx`
 * pattern `TabBar.tsx`/`TabBar.hooks.tsx` establishes (admin TSX-logic-sweep, 2026-09-05) — this
 * repo's rule that a `.tsx` file carries no functions or derived logic of its own. Every export
 * here is a plain value derivation with no rendering of its own; `Sites.tsx` calls each directly
 * inline where it needs the value (same idiom `TabBar.tsx`'s `{...tabHandleProps(tab)}` uses), so a
 * caller never composes its own boolean/array logic on top of what these return.
 *
 * `Sites.rules.ts` already holds this feature's screen-independent domain logic (`siteRowState`,
 * `activationOutlook`, …) — testable without React and reused by more than this one screen's markup.
 * What lives here instead is logic that is specific to how `Sites.tsx` itself is laid out (which
 * props a given button's `disabled` depends on, which prefix a row's agent handles use): moving it
 * into `rules.ts` would make that file's own tests couple to `Sites.tsx`'s prop shapes for no reason.
 */

/** The create button's own multi-condition `disabled` state — previously a boolean expression
 *  composed directly in `Sites.tsx`'s JSX. */
export function resolveCreateSubmitDisabled(args: {
  creating: boolean;
  switchingEnabled: boolean;
  createNameError: string | null;
  createName: string;
}): boolean {
  return args.creating || !args.switchingEnabled || args.createNameError !== null || args.createName.trim().length === 0;
}

/** The create-name input's own `disabled` state: also disabled while a create is already in flight,
 *  not just when the deployment can't switch sites — an enabled field mid-request lets an operator
 *  type a second name that a same-tick success handler would silently overwrite (finding 24,
 *  2026-09-05 admin-tooling audit). */
export function resolveCreateInputDisabled(args: { creating: boolean; switchingEnabled: boolean }): boolean {
  return args.creating || !args.switchingEnabled;
}

/** One row's Activate button `disabled` state. Extracting {@link ActivateButton} into its own
 *  component (a prior pass) did not by itself resolve this rule violation — the boolean was still
 *  composed inline in that component's own body; only moving the composition itself out does. */
export function resolveActivateDisabled(args: {
  switchingEnabled: boolean;
  activatingName: string | null;
  site: AdminSiteListEntry;
  snapshot: AdminSitesSnapshot;
}): boolean {
  return !args.switchingEnabled || args.activatingName !== null || siteRowState(args.site, args.snapshot) === "serving";
}

/** `Sites`'s own per-row agent handles. Folder names are unique under `sites/` (they ARE the
 *  directory entries), so they disambiguate one row's controls from another's — see `Sites.tsx`'s
 *  own history for this reasoning. */
export function resolveSitesRowHandles(sites: readonly AdminSiteListEntry[]): string[] {
  return buildAgentListHandles(
    "sites-row",
    sites.map((site) => site.name),
  );
}

/** One grid card's `state` badge: the tone class and copy key together, so `Sites.tsx`'s
 *  `SiteCard` consumes one function's result rather than composing
 *  `siteRowStateToneClass`/`siteRowStateLabelKey` on top of its own `siteRowState` call. */
export function resolveSiteStateDisplay(
  site: AdminSiteListEntry,
  snapshot: AdminSitesSnapshot,
): { toneClass: string; labelKey: string } {
  const state = siteRowState(site, snapshot);
  return { toneClass: siteRowStateToneClass(state), labelKey: siteRowStateLabelKey(state) };
}

/** One grid card's own class name: adds `site-card-serving` for whichever card is genuinely the
 *  live binding (2026-09-05 card-grid redesign) — a purely visual echo of the same
 *  `siteRowState`/`"serving"` fact the badge in {@link resolveSiteStateDisplay} already states in
 *  words, so the two can never disagree (one source, two renderings), and never a substitute for
 *  the badge itself. */
export function resolveSiteCardClassName(site: AdminSiteListEntry, snapshot: AdminSitesSnapshot): string {
  return siteRowState(site, snapshot) === "serving" ? "site-card site-card-serving" : "site-card";
}

/**
 * This screen's two tabs (owner redesign, 2026-09-05: "the first tab is all sites, second tab is
 * create new"). `"all"` is first and is the default, so a bare `/admin/sites` opens on the list
 * rather than on a form — the previous layout's actual failure was that a create form was the first
 * and (on this install) only thing on the screen.
 */
export const SITES_TAB_IDS = ["all", "new"] as const;
export type SitesTabId = (typeof SITES_TAB_IDS)[number];

/** Falls back to `"all"` for an absent or unrecognized `?tab=` value, through the same shared guard
 *  `Deployment.tsx`/`Database.tsx`/`Themes.tsx` use — a stale bookmark or a typo must open the list,
 *  never a blank panel. */
export function resolveSitesTabId(tabId: string | null | undefined): SitesTabId {
  return resolveActiveTabId(tabId, SITES_TAB_IDS, "all");
}

/**
 * The tab row's own data. `listedCount` is the length of the grid BENEATH the tab, never a count of
 * "sites that exist" — on this repo's own install the served site carries no `.site-meta.json`
 * marker and so is legitimately absent from `sites[]` (`Sites.tsx`'s header, point 1). A count that
 * quietly added the live binding back in would restate, in the one place an operator glances first,
 * exactly the lie the unlisted-site notice exists to prevent.
 *
 * @complexity Time/space: O(1) — a fixed two-element array.
 */
export function resolveSitesTabs(t: Translate, listedCount: number): TabBarTab[] {
  return [
    {
      id: "all",
      label: t("All sites"),
      count: listedCount,
      handle: "sites-tab-all",
      handleLabel: "Switch to the All sites tab — every site folder listed under sites/",
    },
    {
      id: "new",
      label: t("New site"),
      handle: "sites-tab-new",
      handleLabel: "Switch to the New site tab — the questionnaire that creates a site folder",
    },
  ];
}

/** Whether the All sites tab renders its empty state instead of the grid. Its own function rather
 *  than a `sites.length === 0` written in the JSX, per this file's header. */
export function resolveSitesEmpty(sites: readonly AdminSiteListEntry[]): boolean {
  return sites.length === 0;
}

/** One database option's own class name — the selected/unavailable modifiers on `.site-db-option`.
 *  `available: false` never combines with `selected: true`: nothing on this screen can select an
 *  unavailable backend (see `NewSiteTab.tsx`'s own header for why that is structural rather than a
 *  matter of which flags happen to be passed here).
 *
 *  @complexity Time/space: O(1). */
export function resolveDatabaseOptionClassName(args: { selected: boolean; available: boolean }): string {
  if (!args.available) return "site-db-option is-unavailable";
  return args.selected ? "site-db-option is-selected" : "site-db-option";
}
