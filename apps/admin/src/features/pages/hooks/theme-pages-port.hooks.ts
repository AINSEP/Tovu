/**
 * @file What `use-theme-pages.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface ThemePagesPort {
  /** Narrowed to the one field this hook reads — the real `api.getPresentation()` also returns
   *  `settings`/`availableThemes`/etc., which this hook never uses. Matches `page-editor-
   *  port.hooks.ts`'s own narrowing precedent for the same route. */
  getPresentation(): Promise<{ activeThemeStaticPageIds: string[] }>;
}
