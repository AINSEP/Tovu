import { buildAgentListHandles } from "../../lib/agent-list-handles";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
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
 * This screen's two VIEWS — the list, and the create-a-site onboarding screen (Runner port,
 * 2026-09-05).
 *
 * Not tabs. An earlier pass made "New site" a second tab; Tovu Runner, which the owner asked this
 * screen to follow, reaches its onboarding from a `+ Create website` button in the page header
 * (`MainHeader` in Runner's `App.tsx`) and shows it as a full-page screen with its own `← All
 * websites` back link. Runner's own tab strip means something else entirely — see `Sites.tsx`'s
 * header.
 *
 * The URL key stays `?tab=` rather than becoming `?view=`: it is the query key every other tabbed
 * admin screen already uses, it is what `panels.tsx` threads in, and one screen inventing a second
 * spelling for "which sub-state of this panel am I on" is the drift ADR-063's shared guard exists to
 * stop. What changed is how the resolved value is RENDERED, not how it is addressed.
 */
export const SITES_VIEW_IDS = ["all", "new"] as const;
export type SitesViewId = (typeof SITES_VIEW_IDS)[number];

/** Falls back to the list for an absent or unrecognized `?tab=` value, through the same shared
 *  guard `Deployment.tsx`/`Database.tsx`/`Themes.tsx` use — a stale bookmark or a typo must open the
 *  list, never a blank panel. */
export function resolveSitesViewId(tabId: string | null | undefined): SitesViewId {
  return resolveActiveTabId(tabId, SITES_VIEW_IDS, "all");
}

/** The page header's own kicker/title/description, which differ per view — Runner swaps its
 *  `main__title` to "Create a website" while its onboarding is open (`MainHeader`), so the header
 *  names the screen you are actually on rather than the section you came from.
 *
 *  @complexity Time/space: O(1). */
export function resolveSitesHeading(view: SitesViewId, t: Translate): { kicker: string; title: string; description: string } {
  if (view === "new") {
    return {
      kicker: t("New site"),
      title: t("Create a site"),
      description: t("Each site gets its own folder, content database, uploads, and themes."),
    };
  }
  return {
    kicker: t("Overview"),
    title: t("Sites"),
    description: t("Each site under sites/ has its own content, uploads, and themes. Switching between them takes a restart."),
  };
}

/** Whether the site list renders its empty state instead of the grid. Its own function rather than
 *  a `sites.length === 0` written in the JSX, per this file's header. */
export function resolveSitesEmpty(sites: readonly AdminSiteListEntry[]): boolean {
  return sites.length === 0;
}

/** One database backend the onboarding screen offers. `available` is the whole honesty seam: it is
 *  a property of what Tovu's `initSite` can actually produce, never of what the operator picked. */
export interface SiteDatabaseOption {
  id: "sqlite" | "supabase" | "custom";
  title: string;
  hint: string;
  available: boolean;
}

/**
 * The three options, ported from Runner's own `DatabasePicker` (titles and hints kept close to its
 * wording so the two products read as one family) with one field added that Runner has no need
 * for: `available`.
 *
 * Runner can offer all three because Runner's create screen provisions nothing — its own footer
 * says so ("Provisioning the copy and securely saving vendor credentials needs the Runner
 * supervisor connection"), and it carries a whole `blocked` project status for exactly this, whose
 * code comment reads: "A blocked project is waiting on database-provider support Tovu does not
 * have, so the only honest affordance is none." Tovu's Create button, by contrast, REALLY creates a
 * site — `initSite` runs, hardcoded to SQLite — so shipping Runner's three live options here would
 * turn Runner's honest mockup into Tovu's silent lie. `available` is what stops that, and Runner's
 * own comment above is the precedent for it rather than a departure from it.
 *
 * @complexity Time/space: O(1) — a fixed three-element array.
 */
export function resolveSiteDatabaseOptions(t: Translate): SiteDatabaseOption[] {
  return [
    { id: "sqlite", title: t("SQLite"), hint: t("Default · created inside this site's own folder"), available: true },
    { id: "supabase", title: t("Supabase"), hint: t("Hosted · requires a project URL and API key"), available: false },
    { id: "custom", title: t("Custom DB Provider"), hint: t("Any vendor · add its endpoint and credential"), available: false },
  ];
}

/** One database option's own class name. `available: false` never combines with `selected: true`:
 *  nothing on this screen can select an unavailable backend (see `CreateSiteOnboarding.tsx`'s own
 *  header for why that is structural rather than a matter of which flags happen to be passed here).
 *
 *  @complexity Time/space: O(1). */
export function resolveDatabaseOptionClassName(args: { selected: boolean; available: boolean }): string {
  if (!args.available) return "site-db-option is-unavailable";
  return args.selected ? "site-db-option is-selected" : "site-db-option";
}
