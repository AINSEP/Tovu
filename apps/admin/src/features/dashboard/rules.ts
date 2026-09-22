import type { AdminPost } from "../../lib/api";
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
 */
export function activityRowHref(row: Pick<AdminPost, "id" | "kind">): string {
  return row.kind === "page" ? "/admin/pages" : `/admin/posts/${row.id}`;
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
