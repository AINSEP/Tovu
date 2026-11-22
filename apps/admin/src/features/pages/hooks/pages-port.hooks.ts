import type { AdminPost } from "@/features/posts/api/posts-api.types";

/**
 * @file What `use-pages.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface PagesPort {
  listPages(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  createPage(required: { title: string }): Promise<{ post: AdminPost }>;
  /**
   * `expectedVersion` (2026-09-18, multi-author hardening) — mirrors `posts-list-port.hooks.ts`'s
   * identical member exactly (Pages and Posts share this one route). `togglePagePublish`
   * (`use-pages.hooks.ts`) always sends it.
   *
   * `expectedVersion` (2026-09-07) is the optimistic-concurrency basis, NOT a field of the page:
   * the `AdminPost.version` this editor loaded, which the server compares and rejects with
   * `409 VERSION_CONFLICT` when a newer save has superseded it. Same optional, purely additive
   * extension `PostEditorPort` already declares — one shared kind-blind route (`PUT /posts/:id`)
   * serves both editors. Omitting it is exactly the last-write-wins behavior this method has always
   * had; `usePageEditor` always sends it once the row has loaded.
   */
  updatePost(
    required: {
      target: { id: string };
      patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> & {
        expectedVersion?: number;
      };
    }
  ): Promise<{ post: AdminPost }>;
  deletePage(required: { id: string }): Promise<{ post: AdminPost }>;
}
