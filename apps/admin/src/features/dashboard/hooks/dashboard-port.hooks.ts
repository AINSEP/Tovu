import type { AdminPost } from "@/lib/api";

/**
 * @file What `use-dashboard.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` (canonical spec) and
 * `redirects-port.hooks.ts` (canonical reference implementation): this file declares,
 * `dashboard-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/dashboard` imports `lib/api`.
 *
 * `listMedia`/`listCommentsQueue`/`getPresentation` are narrowed to only the field this hook
 * actually reads off each response (an active-status flag, an items count, one theme id) — same
 * narrowing precedent `theme-pages-port.hooks.ts` uses for its own `getPresentation()` slice.
 * `listPosts`/`listPages` keep the full `AdminPost` shape: both the stat cards AND the merged
 * "Recently updated" activity list (`rules.ts`'s `mergeRecent`/`activityRowHref`) read several
 * fields off the same rows, the same "genuinely used in full" case `media-port.hooks.ts` names for
 * keeping `AdminMedia` unnarrowed.
 */
export interface DashboardPort {
  listPosts(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  listPages(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  listMedia(): Promise<{ media: Array<{ status: string }> }>;
  listCommentsQueue(options: { status: "pending" }): Promise<{ items: unknown[] }>;
  getPresentation(): Promise<{ settings: { activeThemeId: string } }>;
  /** Password-banner plan (2026-09-24), Slice 3 — whether the SIGNED-IN caller's own stored
   *  credential still verifies against the default password (`GET /auth/me/password-status`,
   *  Slice 2). A sixth independent read, same "each source owns its own error slot" shape the rest
   *  of this port already documents above. */
  getPasswordStatus(): Promise<{ usesDefaultPassword: boolean }>;
}
