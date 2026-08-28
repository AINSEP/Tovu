import type { AdminPost } from "@/lib/api";

/**
 * @file What `use-posts.hooks.ts` (the LIST hook — `posts-list-*`, distinct from `use-post-editor
 * .hooks.ts`'s own `post-editor-port.hooks.ts`) needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface PostsListPort {
  listPosts(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  createPost(title: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePost(id: string): Promise<{ post: AdminPost }>;
}
