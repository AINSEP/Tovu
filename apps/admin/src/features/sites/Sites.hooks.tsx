import { buildAgentListHandles } from "../../lib/agent-list-handles";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
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
