import type { AdminPost, ThemeTier } from "@/lib/api";
import type { StandingDraftAutosavePort } from "@/hooks/use-standing-draft-autosave.hooks";

/**
 * @file What `usePageEditor` needs from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects`: this file
 * declares, `page-editor-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/pages/hooks` imports `lib/api` for these six routes.
 *
 * `getPresentation`'s return type is narrowed to the four fields this hook actually reads off it
 * (see `usePageEditor`'s load effect). `features/posts`' `usePostEditor` reads more fields off the
 * same route through its own `PostEditorPort` (`post-editor-port.hooks.ts`) — narrowing here is not a
 * shared contract, it is this hook's own consumption. The narrowing also moves two derivations off
 * the hook: the active theme's `apiVersion` and `tier` both live on `availableThemes`, keyed by id,
 * and `page-editor-dependencies.hooks.ts` resolves them rather than handing the whole array through.
 * `activeThemeTier` (2026-09-24, "View Template" parity with `features/posts`) feeds
 * `TemplateSourceModal`'s (`components/TemplateSource/TemplateSourceModal.tsx`) tier gate the same
 * way `usePostEditor`'s own `activeThemeTier` does.
 */
/**
 * Standing-draft autosave (2026-09-06 dispatch) — `putAutosave`/`getAutosave`/`discardAutosave` are
 * pulled in from the shared, feature-agnostic hook rather than redeclared here, so this port and
 * `PostEditorPort`'s identical extension stay structurally IDENTICAL by construction (one type,
 * not two hand-copied signatures that could quietly drift). See `use-standing-draft-autosave.hooks.ts`'s
 * own header for why the hook itself stays ignorant of both features either way.
 */
export interface PageEditorPort extends StandingDraftAutosavePort {
  getPage(routeSlug: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{
    activeThemeTemplates: string[];
    /** `PresentationSettings.activeThemeId` — feeds the Interactive tab's canvas stylesheet and
     *  token fetches (`use-theme-canvas-styling.hooks.ts`), and `TemplateSourceModal`'s fetch URL. */
    activeThemeId: string;
    /** The active theme's manifest `apiVersion` (`2`, or `undefined` for v1), looked up on
     *  `availableThemes` by `activeThemeId`. `undefined` also covers "the active theme is absent
     *  from `availableThemes`", which `resolveThemeLayout` treats as v1 — the same conflation
     *  `usePostEditor`'s own `activeThemeApiVersion` documents. */
    activeThemeApiVersion: 2 | undefined;
    /** The active theme's capability tier, looked up on `availableThemes` the same way as
     *  `activeThemeApiVersion` just above. `null` when the id has not loaded yet OR when
     *  `activeThemeId` is absent from `availableThemes` — same conflation `usePostEditor`'s own
     *  `activeThemeTier` documents. Gates whether `TemplateSourceModal` attempts a fetch at all. */
    activeThemeTier: ThemeTier | null;
  }>;
  updatePageHtml(id: string, html: string): Promise<{ post: AdminPost }>;
  /**
   * `expectedVersion` (2026-09-07) is the optimistic-concurrency basis, NOT a field of the page:
   * the `AdminPost.version` this editor loaded, which the server compares and rejects with
   * `409 VERSION_CONFLICT` when a newer save has superseded it. Same optional, purely additive
   * extension `PostEditorPort` already declares — one shared kind-blind route (`PUT /posts/:id`)
   * serves both editors. Omitting it is exactly the last-write-wins behavior this method has always
   * had; `usePageEditor` always sends it once the row has loaded.
   */
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> & {
      expectedVersion?: number;
    }
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
