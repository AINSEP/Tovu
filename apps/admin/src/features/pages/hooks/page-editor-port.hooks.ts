import type { AdminPost } from "../../../lib/api";

/**
 * @file What `usePageEditor` needs from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects`: this file
 * declares, `page-editor-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/pages/hooks` imports `lib/api` for these six routes.
 *
 * `getPresentation`'s return type is narrowed to the three fields this hook actually reads off it
 * (see `usePageEditor`'s load effect). `features/posts`' `usePostEditor` reads more fields off the
 * same route through its own `PostEditorPort` (`post-editor-port.hooks.ts`) — narrowing here is not a
 * shared contract, it is this hook's own consumption. The narrowing also moves one derivation off
 * the hook: the active theme's `apiVersion` lives on `availableThemes`, keyed by id, and
 * `page-editor-dependencies.hooks.ts` resolves it rather than handing the whole array through.
 */
export interface PageEditorPort {
  getPage(routeSlug: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{
    activeThemeTemplates: string[];
    /** `PresentationSettings.activeThemeId` — feeds the Interactive tab's canvas stylesheet and
     *  token fetches (`use-theme-canvas-styling.hooks.ts`). */
    activeThemeId: string;
    /** The active theme's manifest `apiVersion` (`2`, or `undefined` for v1), looked up on
     *  `availableThemes` by `activeThemeId`. `undefined` also covers "the active theme is absent
     *  from `availableThemes`", which `resolveThemeLayout` treats as v1 — the same conflation
     *  `usePostEditor`'s own `activeThemeApiVersion` documents. */
    activeThemeApiVersion: 2 | undefined;
  }>;
  updatePageHtml(id: string, html: string): Promise<{ post: AdminPost }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePage(id: string): Promise<{ post: AdminPost }>;
  /**
   * Synchronous URL builder for the admin-only template-preview iframe — NOT a network call itself;
   * the browser navigates to the returned URL when the iframe's `src` is set. Belongs on the port
   * (not a plain `lib/api` import in `PageEditor.tsx`) for the same reason every other route here
   * does: `page-editor-dependencies.hooks.ts` becomes the only file that reaches `lib/api` for it,
   * and a test can assert the resolved URL came from the injected port. `templateChoice: null` omits
   * the query param (server renders the page's own saved template); `""` sends an explicit empty
   * value ("no template"); a real filename requests that template — see `lib/api.ts`'s own
   * `templatePreviewUrl` for the exact query-string contract this mirrors.
   */
  templatePreviewUrl(id: string, templateChoice: string | null): string;
}
