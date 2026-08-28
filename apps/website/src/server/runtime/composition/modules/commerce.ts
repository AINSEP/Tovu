import type { AdminCommerceStatusDeps } from "../../../inbound/admin-http/routes/commerce/status.js";
import { registerAdminCommerceStatusRoute } from "../../../inbound/admin-http/routes/commerce/status.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * Creates the Commerce server module for provider-neutral operational reads.
 *
 * @param deps - Narrow route dependencies for tenant authorization and optional runtime discovery.
 * @returns A route-only server module; it owns no boot work, writes, or provider lifecycle.
 * @throws Never during construction.
 *
 * @complexity Time and space: O(1).
 */
export function createCommerceModule(deps: AdminCommerceStatusDeps): ServerModuleHandle {
  return {
    name: "commerce",
    registerRoutes: (app) => {
      registerAdminCommerceStatusRoute(app, deps);
    },
  };
}
