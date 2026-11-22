import type { RouteRegistrar } from "#src/server/routes/types";
import { registerListingRewrites } from "./pages/handlers/listing.js";
import { registerHomeRoute } from "./pages/handlers/home.js";
import { registerNestedPathRoute, registerSlugRoute } from "./pages/handlers/slug-routes.js";

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
