import type { AdminPost } from "../../../lib/api";

/**
 * @file What `usePageEditor` needs from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects`: this file
 * declares, `page-editor-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/pages/hooks` imports `lib/api` for these five routes.
 *
 * `getPresentation`'s return type is narrowed to `activeThemeTemplates` only — the only field this
 * hook actually reads off it (see `usePageEditor`'s load effect). `features/posts`' `usePostEditor`
 * reads three more fields off the same route and, when it is converted, needs a wider port shape —
 * narrowing here is not a shared contract, it is this hook's own consumption.
 */
export interface PageEditorPort {
  getPage(routeSlug: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{ activeThemeTemplates: string[] }>;
  updatePageHtml(id: string, html: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePage(id: string): Promise<{ post: AdminPost }>;
}
