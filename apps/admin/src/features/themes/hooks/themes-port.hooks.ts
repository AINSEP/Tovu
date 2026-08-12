import type { PresentationSettings, ThemeTier } from "../../../lib/api";

/**
 * @file What `use-themes.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference): this file declares, `themes-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/themes` imports `lib/api` for these five routes. NOT
 * shared with `theme-explore-port.hooks.ts` — that hook edits a single theme's FILES (a different
 * resource), while this one manages the theme REGISTRY (available themes, active theme, the
 * marketplace catalog).
 *
 * This hook doesn't call `useAdminLocale()`/`t()` — every message is hardcoded English — so unlike
 * `media-port.hooks.ts`/`widgets-port.hooks.ts` there is no accompanying `locale` dependency.
 */
export interface ThemesPort {
  getPresentation(): Promise<{
    settings: PresentationSettings;
    availableThemeIds: string[];
    availableThemes: Array<{ id: string; tier: ThemeTier }>;
  }>;
  rescanThemes(): Promise<{ added: string[]; removed: string[]; total: number; availableThemeIds: string[]; duplicateIds: string[] }>;
  setActiveTheme(activeThemeId: string): Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>;
  listMarketplaceThemes(): Promise<{ themes: Array<{ id: string; name: string; tier: string; description?: string; idTaken: boolean }> }>;
  downloadMarketplaceTheme(themeId: string): Promise<{ id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }>;
}
