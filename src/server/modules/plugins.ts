import { registerPluginsListRoute } from "../routes/admin/plugins/list.js";
import { registerPluginSetEnabledRoute } from "../routes/admin/plugins/set-enabled.js";
import type { RouteDeps } from "../routes/types.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `plugins` server module (SPEC-005, ADR-005-ARCH) — ADR-046 Phase 3 server-module
 * convention, mirroring `modules/widgets.ts` exactly.
 *
 * `PluginsRouteDeps` (`routes/admin/plugins/deps.ts`) is a structural subset of `RouteDeps` —
 * `pluginActivationRepo`/`discoverPlugins` were added directly to `RouteDeps` (mirroring how
 * `widgetBindingRepo`/`entryRefsRepo` were added for the `widgets` module), so no widened or
 * narrowed local type is needed here, same as `widgets.ts`'s own rationale.
 *
 * Registers `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` (REQ-10) — the only 2 HTTP endpoints this feature
 * adds in Phase 1. The admin UI screen (REQ-12..18) consumes this contract as a black box; the
 * `word-count` dogfood plugin (Phase 2) and the `post.ts` hook-wiring (Phase 3) are later, gated
 * phases that do not add new routes to this module.
 */
export function createPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "plugins",
    registerRoutes: (app) => {
      registerPluginsListRoute(app, deps);
      registerPluginSetEnabledRoute(app, deps);
    },
  };
}
