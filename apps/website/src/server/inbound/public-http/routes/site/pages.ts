
import { resolveActiveThemeId } from "#src/features/presentation/active-theme-id";
import { resolveActiveTheme } from "#src/features/theme/active-theme";
import type { RouteRegistrar } from "#src/server/routes/types";
import { registerListingRewrites } from "./pages/handlers/listing.js";
import { registerHomeRoute } from "./pages/handlers/home.js";
import { registerNestedPathRoute, registerSlugRoute } from "./pages/handlers/slug-routes.js";

/**
 * `resolveActiveThemeId`/`resolveActiveTheme` moved out of this file 2026-08-16 — both were pure
 * `(deps) => value` queries with zero `req`/`res` coupling, and living here forced `export/
 * route-manifest.ts` to import a routing-layer file just to reuse them (a `check:architecture`-
 * flagged runtime edge into the composition-root module; see `ADS-memory/reports/
 * 2026-08-16-export-edge-decoupling.md`). Different homes, not the same one — `resolveActiveThemeId`
 * has zero theme-data dependency (it only reads presentation settings) so it moved to
 * `#src/features/presentation/index` (`active-theme-id.ts`); `resolveActiveTheme` genuinely needs
 * theme data (`findTheme`/`DiscoveredTheme`) so it moved to `#src/features/theme/index`
 * (`active-theme.ts`). Splitting them, rather than bundling both into one file because every real
 * call site uses them together, avoided a measured `check:architecture` regression a combined home
 * would have caused — see `active-theme.ts`'s own file header for the SCC trace. Both re-exported
 * below, unchanged in behavior, so `apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s existing
 * `from "../../site/pages"` import of `resolveActiveTheme` keeps working — only `route-manifest.ts`
 * was updated to import both new homes directly.
 */
export { resolveActiveThemeId, resolveActiveTheme };

/**
 * Public site: server-rendered home and post pages through the active
 * declarative theme. Registered LAST — GET /:slug handles single-segment
 * pages; unmatched nested public paths consult redirects before the normal 404.
 */
export const registerSiteRoutes: RouteRegistrar = (required, _options = {}) => {
  // The order is the route table: the rewrites first, then `/`, nested paths, `/:slug`.
  registerListingRewrites(required, {});
  registerHomeRoute(required, {});
  registerNestedPathRoute(required, {});
  registerSlugRoute(required, {});
};
