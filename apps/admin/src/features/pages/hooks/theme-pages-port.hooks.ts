/**
 * @file What `use-theme-pages.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface ThemePagesPort {
  /** Narrowed to the two fields this hook reads — the real `api.getPresentation()` also returns
   *  `availableThemes`/`activeThemeTemplates`/etc., which this hook never uses, and a WIDER
   *  `settings` than the one field named here. Matches `page-editor-port.hooks.ts`'s own narrowing
   *  precedent for the same route.
   *
   *  `settings.activeThemeId` (2026-08-27) is read for the Theme Pages tab's studio links, which
   *  need `?theme=` as well as the page id. It is the same value the server derived
   *  `activeThemeStaticPageIds` FROM (`presentation/get.ts` keys them off the active theme's own
   *  `pages`), so taking both off one response is what keeps the two from ever disagreeing — a
   *  second round trip could resolve a different active theme if one was activated in between. */
  getPresentation(): Promise<{ settings: { activeThemeId: string }; activeThemeStaticPageIds: string[] }>;
}
