import type { AdminPost } from "@/lib/api";

/**
 * @file What `use-pages.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface PagesPort {
  listPages(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  createPage(title: string): Promise<{ post: AdminPost }>;
  /**
   * `expectedVersion` (2026-09-18, multi-author hardening) — mirrors `posts-list-port.hooks.ts`'s
   * identical member exactly (Pages and Posts share this one route). `togglePagePublish`
   * (`use-pages.hooks.ts`) always sends it.
   */
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> & {
      expectedVersion?: number;
    }
  ): Promise<{ post: AdminPost }>;
  deletePage(id: string): Promise<{ post: AdminPost }>;
}
