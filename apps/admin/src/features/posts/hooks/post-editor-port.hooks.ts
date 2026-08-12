import type { AdminPost, AdminThemeSummary, PresentationSettings } from "../../../lib/api";

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
export interface PostEditorPort {
  getPost(id: string): Promise<{ post: AdminPost }>;
  getPresentation(): Promise<{
    settings: PresentationSettings;
    availableThemes: AdminThemeSummary[];
    activeThemeTemplates: string[];
    activeThemeStaticPageIds: string[];
  }>;
  updatePost(
    target: { id: string },
    patch: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">>
  ): Promise<{ post: AdminPost }>;
  deletePost(id: string): Promise<{ post: AdminPost }>;
}
