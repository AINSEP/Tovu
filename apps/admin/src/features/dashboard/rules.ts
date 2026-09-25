import type { AdminPost, AdminSiteTokenState } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";

/**
 * @file Pure logic for the `dashboard` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the same convention `features/posts/rules.ts` establishes for this app. The one function
 * here (`mergeRecent`) was already a standalone module-level function in `Dashboard.tsx`; it moves
 * here unchanged so it is importable and directly testable without rendering the screen.
 */

/** Merges one list into whatever the other fetch has already delivered and re-sorts, so the panel
 *  is correct whichever request lands first — the two are concurrent and neither can assume it is
 *  the one holding the existing state. Dedupes on id because a row is a post OR a page but the two
 *  endpoints are independent, and a future overlap should not double-render a row.
 *
 * @complexity Time: O(n log n) for the sort, where n = combined row count; space: O(n) for the
 * dedup map and result array.
 * @overallScore 100
 */
export function mergeRecent(prev: AdminPost[] | null, incoming: AdminPost[]): AdminPost[] {
  const byId = new Map((prev ?? []).map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Where an activity row's title link goes.
 *
 * The panel merges BOTH `listPosts` and `listPages` (see `use-dashboard.hooks.ts`) and labels each
 * row with its own `kind`, but every row used to href `/admin/posts/:id` — so clicking a row
 * plainly labelled "page" opened the post editor with a page id, which `api.getPost` refuses
 * (`api.ts:858`: the detail route is kind-guarded and 404s on a page id).
 *
 * Pages land on the Pages LIST rather than a page editor because `panels.tsx` gives the `pages`
 * panel no detail view — only `posts` has a `post-editor`. Sending a page row to a route that does
 * not exist would trade a wrong-editor 404 for a routing dead end. When the pages-vibecoding
 * workstream lands a page editor, this is the one place that changes.
 *
 * Readable-slugs S6a (2026-09-23): a post row now hrefs its slug, not its id, matching every other
 * post link in the admin (`/posts/:slug`, `use-posts.hooks.ts`'s `createPost`).
 */
export function activityRowHref(row: Pick<AdminPost, "id" | "kind" | "slug">): string {
  return row.kind === "page" ? "/admin/pages" : `/admin/posts/${row.slug}`;
}

/** The Posts stat card's meta line — blank while `published` is still pending (`null`). */
export function postsStatMeta(published: number | null, t: Translate): string {
  return published === null ? "" : t("{count} published").replace("{count}", String(published));
}

/** The Pages stat card's meta line — blank while `drafts` is still pending, singular/plural
 *  otherwise. */
export function pagesStatMeta(drafts: number | null, t: Translate): string {
  if (drafts === null) return "";
  return t(drafts === 1 ? "{count} draft" : "{count} drafts").replace("{count}", String(drafts));
}

/** The Comments stat card's meta line. Note this reads `StatState.value` directly rather than a
 *  loading-aware wrapper: `null !== 0`, so it reads "awaiting moderation" while the count is still
 *  pending, same as before this was extracted — preserved rather than fixed, since a moderation
 *  queue of unknown size defaulting to "may need attention" is arguably the safer default anyway. */
export function commentsStatMeta(pendingCount: number | null, t: Translate): string {
  return t(pendingCount === 0 ? "nothing to review" : "awaiting moderation");
}

/**
 * Password-banner plan (2026-09-24), Slice 3. Whether the dashboard should show the default-
 * password nag banner: the server says the caller is still on the default AND the operator hasn't
 * dismissed it in this browser. `usesDefault === null` (status still loading, or the fetch failed
 * and was swallowed — see `use-dashboard.hooks.ts`) reads as "don't show", the same fail-closed
 * default an advisory nag should have: a transient fetch error must never be read as "you're on the
 * default password" and a transient one must never be read as "you're safe" either, so the only
 * state that shows the banner is an explicit, confirmed `true`.
 *
 * @complexity O(1).
 */
export function shouldShowDefaultPasswordBanner(usesDefault: boolean | null, dismissed: boolean): boolean {
  return usesDefault === true && !dismissed;
}

/**
 * Site-key plan (2026-09-24) §A.6. Whether the dashboard should show the site-key warning banner.
 * Only 3 of the 5 {@link AdminSiteTokenState} values are urgent enough to interrupt the landing
 * screen: `"missing-with-data"` (saved credentials exist but nothing can open them),
 * `"mismatch"` (the active key doesn't match what the data was sealed under), and `"invalid"` (a
 * source was found but fails hex validation). Plain `"missing"` is the ordinary state of a brand
 * new site before its first key is minted at boot (`ensureSiteKey`) — not an error, so no banner.
 * `"active"` is the normal case. `undefined` (status still loading, or the fetch failed and was
 * swallowed — see `use-dashboard.hooks.ts`) also renders nothing, the same fail-closed default
 * {@link shouldShowDefaultPasswordBanner} uses for its own advisory nag: a transient fetch error
 * must never be read as "something is wrong with your site key" any more than as "it's fine".
 *
 * @complexity O(1).
 */
export function shouldShowSiteKeyBanner(state: AdminSiteTokenState | undefined): boolean {
  return state === "missing-with-data" || state === "mismatch" || state === "invalid";
}

/**
 * The site-key banner's own copy (site-key plan §A.6) — one terse sentence per bannered state,
 * translated through the caller's own `t`. Only ever meaningful for a state
 * {@link shouldShowSiteKeyBanner} already said `true` for; every other state (including
 * `undefined`) returns `""` defensively — `Dashboard.tsx` never renders it for those, this just
 * avoids handing back `undefined` prose during a state transition mid-render.
 *
 * @complexity O(1).
 */
export function siteKeyBannerCopy(state: AdminSiteTokenState | undefined, t: Translate): string {
  switch (state) {
    case "missing-with-data":
      return t("This site has saved credentials, but no site key was found to open them.");
    case "mismatch":
      return t("This site's key doesn't match the one its data was saved with. Saved credentials can't be opened.");
    case "invalid":
      return t("This site's key isn't in a usable format. Saved credentials can't be opened.");
    default:
      return "";
  }
}
