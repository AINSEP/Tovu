import { registerAdminHeldBackThemeRoutes, type HeldBackRouteDeps } from "#src/server/inbound/admin-http/routes/themes/held-back";
import { explainThemeTree } from "#src/features/site-backup/import-restore-placement";
import { THEME_PLACEMENT_CHECKS } from "../theme-placement-checks.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `theme-held-back` server module: the Themes screen's "Held back on import" routes
 * (list, re-check, restore). Its own module, not part of `content`, so it takes only the six deps
 * those routes read. Mounted right after the content module (`mount-core-content.ts`).
 */

/**
 * @param deps the narrow held-back deps (site-backup's `explainThemeTree` is bound here); a full `RouteDeps` satisfies it structurally.
 * @complexity O(1).
 */
export function createThemeHeldBackModule(deps: Omit<HeldBackRouteDeps, "explainThemeTree">): ServerModuleHandle {
  return {
    name: "theme-held-back",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminHeldBackThemeRoutes({ app, deps: { ...deps, explainThemeTree: (required) => explainThemeTree({ ...required, themeChecks: THEME_PLACEMENT_CHECKS }) } });
    },
  };
}
