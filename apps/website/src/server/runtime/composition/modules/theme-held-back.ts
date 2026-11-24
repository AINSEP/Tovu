import { registerAdminHeldBackThemeRoutes, type HeldBackRouteDeps } from "#src/server/inbound/admin-http/routes/themes/held-back";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `theme-held-back` server module: the Themes screen's "Held back on import" routes
 * (list, re-check, restore). Its own module, not part of `content`, so it takes only the six deps
 * those routes read. Mounted right after the content module (`mount-core-content.ts`).
 */

/**
 * @param deps the narrow held-back deps; a full `RouteDeps` satisfies it structurally.
 * @complexity O(1).
 */
export function createThemeHeldBackModule(deps: HeldBackRouteDeps): ServerModuleHandle {
  return {
    name: "theme-held-back",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminHeldBackThemeRoutes({ app, deps });
    },
  };
}
