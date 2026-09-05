import { ApiError } from "../../lib/api";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { QueryKey } from "../../lib/fetch-query";

/**
 * @file Pure logic for the `sites` feature — everything that computes a value rather than rendering
 * one. Same convention as `features/redirects/rules.ts`: no React, no hooks, directly testable.
 *
 * The functions here exist for one reason above all others: this screen is capable of telling a
 * lie. Activate persists a choice and returns; nothing switches until a human restarts. Every
 * "what is true right now" decision is therefore made HERE, from the server's own snapshot, rather
 * than inferred in JSX from whichever value happened to be nearby — see {@link siteRowState} and
 * {@link activationOutlook}.
 */

/** One cache identity for this screen's single resource, defined once so a write's `invalidates`
 *  and the read's `key` cannot drift apart (`lib/fetch-query/types.ts`'s own `QueryKey` warning). */
export const KEYS = { list: ["sites"] as QueryKey };

/** This screen's name on `lib/content-refresh-bus.ts` — a plain colocated constant, matching
 *  `REDIRECTS_RESOURCE`/`TAXONOMY_RESOURCE`. `sites/` is filesystem state, so it can change from
 *  outside this screen entirely (a `tovu init` in a terminal, an assistant run that shells out),
 *  which is exactly the staleness the bus exists for. */
export const SITES_RESOURCE = "sites";

/** Mirrors `SITE_NAME_PATTERN` in `apps/website/src/platform/site-dir/site-registry.ts`. Duplicated
 *  rather than imported because this is a browser bundle and that module is server-side Node; the
 *  server still validates independently, so a drift here degrades to a worse error message, never
 *  to an accepted bad name. */
const SITE_NAME_PATTERN = /^[a-z0-9-]+$/;
const MAX_SITE_NAME_LENGTH = 100;

/** What a row's badge says. Deliberately three states, not two: "the operator asked for this" and
 *  "the server is serving this" are different facts, and collapsing them is the exact lie this
 *  screen must not tell. */
export type SiteRowState = "serving" | "pending-restart" | "idle";

/**
 * Which of the three states one listed site is in, decided from the server snapshot alone.
 *
 * `serving` is matched on `dir`, not `name`: `currentSite.dir` is what the process actually
 * resolved, and under a `TOVU_SITE_DIR` override a folder NAME can coincide with a directory
 * somewhere else entirely.
 *
 * @complexity Time/space: O(1).
 */
export function siteRowState(site: AdminSiteListEntry, snapshot: AdminSitesSnapshot): SiteRowState {
  if (site.dir === snapshot.currentSite.dir) return "serving";
  if (snapshot.persistedSiteName === site.name) return "pending-restart";
  return "idle";
}

/** The English copy for a {@link SiteRowState} — a key in `sites-i18n.ts`, resolved by the caller's
 *  bound `t`. Kept next to the state it describes so a new state cannot be added without one.
 *
 *  @complexity Time/space: O(1). */
export function siteRowStateLabelKey(state: SiteRowState): string {
  if (state === "serving") return "Serving now";
  if (state === "pending-restart") return "Queued for next restart";
  return "Not in use";
}

/** The `status-*` modifier for a {@link SiteRowState}. `pending-restart` is `warning`, not `ok`:
 *  nothing has happened yet, and a green badge would read as "switched".
 *
 *  @complexity Time/space: O(1). */
export function siteRowStateToneClass(state: SiteRowState): string {
  if (state === "serving") return "status-ok";
  if (state === "pending-restart") return "status-warning";
  return "status-neutral";
}

/**
 * Whether a pending activate choice exists and whether it will actually be honored.
 *
 * `pending-ignored` is the `TOVU_SITE_DIR` trap: `resolveSiteRoot` reads that variable ABOVE the
 * `TOVU_SITE` line Activate writes, so with it set the next boot resolves the override and the
 * persisted choice is dead on arrival. A screen that reported a plain "queued" there would promise
 * a switch that cannot happen.
 */
export type ActivationOutlook =
  | { kind: "none" }
  | { kind: "pending"; name: string }
  | { kind: "pending-ignored"; name: string };

/**
 * Read the pending-choice situation off the snapshot.
 *
 * A persisted name equal to the live binding's own name is `none`, not `pending`: the choice is
 * already in effect, so there is nothing for the operator to do.
 *
 * @complexity Time/space: O(1).
 */
export function activationOutlook(snapshot: AdminSitesSnapshot): ActivationOutlook {
  const name = snapshot.persistedSiteName;
  if (name === null || name === snapshot.currentSite.name) return { kind: "none" };
  return snapshot.currentSite.dirOverridden ? { kind: "pending-ignored", name } : { kind: "pending", name };
}

/**
 * Client-side check on the create form's name field, so an obviously-bad name is caught before a
 * round trip. Returns an English copy key, or `null` when the name is acceptable.
 *
 * Not a substitute for the server's own validation — the server rejects independently with `400`
 * `VALIDATION_ERROR`, and this only decides whether it is worth asking.
 *
 * @complexity Time/space: O(n) in the name's own length, bounded by what a human types.
 */
export function siteNameErrorKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "Enter a folder name.";
  if (trimmed.length > MAX_SITE_NAME_LENGTH) return "That name is too long (100 characters maximum).";
  if (!SITE_NAME_PATTERN.test(trimmed)) return "Use lowercase letters, digits, and dashes only.";
  return null;
}

/**
 * Operator-facing copy for the two error codes this feature's writes have their own meaning for —
 * the "check my own codes first, fall through for the rest" shape `lib/api.ts`'s `describeApiError`
 * documents. Returns an English copy key, or `null` to let the shared fallback answer.
 *
 * @complexity Time/space: O(1) — one `instanceof` and two comparisons.
 */
export function siteWriteErrorKey(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  if (e.code === "SITE_SWITCHING_DISABLED") return "Site switching is turned off on this deployment.";
  if (e.code === "SITE_ALREADY_EXISTS") return "A folder with that name already exists under sites/.";
  return null;
}

/**
 * The order rows are rendered in: the site being served first, then the rest by folder name.
 *
 * `listSites` returns whatever `fs.readdirSync` produced, which is neither sorted nor stable across
 * filesystems — a list that reshuffles between reloads reads as data changing when nothing did.
 * `DataTable` ships no sorting of its own (21 screens use it; the ones that sort, like Posts, do it
 * in their own hook), so ordering is this feature's job and it is done here, purely.
 *
 * Non-mutating: `sites` comes from the query cache, and sorting it in place would reorder the
 * cached array every render.
 *
 * @complexity Time: O(n log n) in the number of sites — bounded by how many an operator created.
 *   Space: O(n) for the copy.
 */
export function sitesInDisplayOrder(snapshot: AdminSitesSnapshot): AdminSiteListEntry[] {
  return [...snapshot.sites].sort((a, b) => {
    const aServing = a.dir === snapshot.currentSite.dir;
    const bServing = b.dir === snapshot.currentSite.dir;
    if (aServing !== bServing) return aServing ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The three snapshot-derived values the Sites screen renders from — see {@link readSnapshot}. */
export interface SnapshotView {
  /** Rows in render order, empty before the first load. */
  sites: AdminSiteListEntry[];
  /** The deployment capability flag; `false` before the first load, so nothing offers a write it
   *  cannot yet know is permitted. */
  switchingEnabled: boolean;
  outlook: ActivationOutlook;
}

/**
 * Collapse an in-flight-or-loaded snapshot into everything the view needs from it, with the
 * "not loaded yet" case answered ONCE here rather than re-tested per field.
 *
 * Exists as much for the pre-load defaults as for the tidiness: three separate
 * `data === undefined ? fallback : derive(data)` expressions in the hook is three chances to pick a
 * different, and wrong, default — `switchingEnabled` in particular must fall back to `false`, not
 * `true`, so a screen mid-load never renders an enabled Activate.
 *
 * @complexity Dominated by `sitesInDisplayOrder`'s O(n log n); O(1) otherwise.
 */
export function readSnapshot(snapshot: AdminSitesSnapshot | undefined): SnapshotView {
  if (snapshot === undefined) return { sites: [], switchingEnabled: false, outlook: { kind: "none" } };
  return {
    sites: sitesInDisplayOrder(snapshot),
    switchingEnabled: snapshot.switchingEnabled,
    outlook: activationOutlook(snapshot),
  };
}
