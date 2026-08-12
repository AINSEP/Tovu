import type { AdminPost } from "../../../lib/api";

/**
 * @file What `use-pages.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface PagesPort {
  listPages(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  createPage(title: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePage(id: string): Promise<{ post: AdminPost }>;
}
