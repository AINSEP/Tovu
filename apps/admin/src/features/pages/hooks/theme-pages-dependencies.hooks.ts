import { themesApi } from "@/features/themes/api/themes-api";
import type { ThemePagesFileEntry, ThemePagesPort } from "@jini-ai/admin/pages/hooks/theme-pages-port.hooks";

/**
 * @file The only place `use-theme-pages.hooks.ts` reaches `lib/api` — see `theme-pages-
 * port.hooks.ts` for why the split exists, and for why this now binds three routes, not one.
 */

/** The live implementation, as a module-level singleton. */
export const defaultThemePagesPort: ThemePagesPort = {
  getPresentation: () => themesApi.getPresentation(),
  getThemeDetail: ({ themeId }, _options = {}) => themesApi.getThemeDetail({ themeId }),
  setPagePublished: ({ themeId, page, published }, _options = {}) => themesApi.setThemePagePublished({ themeId, page, published }),
};
