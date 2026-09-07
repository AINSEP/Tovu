import type { AdminMedia, AdminPost, AdminThemeSummary, PresentationSettings } from "@/lib/api";
import type { StandingDraftAutosavePort } from "@/hooks/use-standing-draft-autosave.hooks";

/**
 * @file What `use-post-editor.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and copied from `features/redirects/hooks/
 * redirects-port.hooks.ts`'s own split: this file declares, `post-editor-dependencies.hooks.ts` binds
 * the real `api` client, and nothing else under this hook imports `lib/api` for these four routes.
 *
 * `navigate` (`lib/router`) is injected alongside this port on `usePostEditor`'s own second
 * parameter, not folded into it — it is host navigation, not this feature's own I/O, matching how
 * the off-limits conversion plan for `use-page-editor.hooks.ts` (`ADS-memory/reports/implementation/
 * 2026-08-11-wired-hooks-audit.md`) shapes its own `PageEditorDependencies`.
 *
 * `withTitleNode`/`titleNodeText` (`../rules.ts`) and TipTap's own `useEditor` are deliberately NOT
 * part of this port — the former are pure, I/O-free rules (per the pattern, a hook imports rules
 * directly rather than having them injected, same reasoning `assistant-chats-port.hooks.ts` gives for
 * `persistableMessages`), and the latter is editor/local-state infrastructure, not a host service.
 */
/**
 * Standing-draft autosave (2026-09-06 dispatch) — `putAutosave`/`getAutosave`/`discardAutosave` are
 * pulled in from the shared, feature-agnostic hook rather than redeclared here, so this port and
 * `PageEditorPort`'s identical extension stay structurally IDENTICAL by construction. See
 * `use-standing-draft-autosave.hooks.ts`'s own header for why the hook itself stays ignorant of
 * both features either way.
 */
export interface PostEditorPort extends StandingDraftAutosavePort {
  getPost(id: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{
    settings: PresentationSettings;
    availableThemes: AdminThemeSummary[]; // includes `apiVersion` — see that interface's own doc.
    activeThemeTemplates: string[];
    activeThemeStaticPageIds: string[];
  }>;
  /**
   * `expectedVersion` (2026-09-06) is the optimistic-concurrency basis, NOT a field of the post:
   * the {@link AdminPost.version} this editor loaded, sent so the server can reject a save whose
   * basis another operator's save has already superseded. Typed as its own member rather than
   * folded into the `Partial<Pick<AdminPost, …>>` bag precisely because it is not writable content
   * — nothing about it is stored, it is only compared.
   *
   * Optional here because the server treats it as optional (omit it and the save is last-write-wins,
   * exactly as before this feature). `usePostEditor` always sends it once a post has loaded; a
   * caller that omits it gets the old, unguarded behavior.
   *
   * Rejects with an `ApiError` carrying `code: "VERSION_CONFLICT"` (`rules.ts`'s
   * `POST_VERSION_CONFLICT_CODE`) when the basis is stale — distinct from the slug-uniqueness 409
   * this same route can also return, which carries no code at all.
   */
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> & {
      expectedVersion?: number;
    }
  ): Promise<{ post: AdminPost }>;
  deletePost(id: string): Promise<{ post: AdminPost }>;
  /** Mention feature (2026-08-11, coordinator MSG #1 licensing sweep) — the picker list for
   *  "mention another post"; same wrapped-entry response shape `api.listPosts()` actually returns
   *  (confirmed against `use-posts.hooks.ts`'s own `r.posts.map((entry) => entry.post)`, not the
   *  type declaration alone). */
  listPosts(): Promise<{ posts: Array<{ post: AdminPost }> }>;
  /** File-handler feature (2026-08-12) — uploads one dropped/pasted `File` through the SAME
   *  media-upload path `MediaPickerDialog`'s own upload flow already calls (`api.uploadMedia`), so
   *  a file dropped/pasted into the editor becomes a real media-library asset (`{assetId,
   *  transformName}` ref) rather than an inlined `data:` URL. `PostEditorPort` (not a direct `api`
   *  import) for the same reason every other route on this interface is injected — see this file's
   *  header — even though media itself is a different feature's domain; the editor is the only
   *  caller that needs it for THIS purpose (uploading whatever was just dropped, not browsing the
   *  library), so it belongs on this port rather than pulling in `features/media`'s own port. */
  uploadMedia(input: { filename: string; contentType: string; dataBase64: string }): Promise<{ media: AdminMedia }>;
  /**
   * Synchronous URL builder for the admin-only template-preview iframe/form target (2026-08-14, moved
   * out of `PostEditor.tsx`/`PostPreview` — see `apps/admin/INFO.md`'s Hooks section) — NOT a network
   * call itself; the browser navigates to the returned URL when the iframe's `src` is set or the
   * hidden form submits. `templateChoice: null` omits the query param (server renders the post's own
   * saved template); `""` sends an explicit empty value ("no template"); a real filename requests
   * that template. Mirrors `features/pages/hooks/page-editor-port.hooks.ts`'s identical member —
   * see `lib/api.ts`'s own `templatePreviewUrl` for the exact query-string contract both share.
   */
  templatePreviewUrl(id: string, templateChoice: string | null): string;
}
