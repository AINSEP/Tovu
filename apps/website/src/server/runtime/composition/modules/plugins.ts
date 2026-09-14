import { registerPluginsListRoute } from "#src/server/inbound/admin-http/routes/plugins/list";
import { registerPluginSetEnabledRoute } from "#src/server/inbound/admin-http/routes/plugins/set-enabled";
import { registerPluginFilesRoute } from "#src/server/inbound/admin-http/routes/plugins/files";
import { registerPluginUninstallRoute } from "#src/server/inbound/admin-http/routes/plugins/uninstall";
import type { RouteDeps } from "#src/server/routes/types";
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
 * Registers `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` (REQ-10, Phase 1) plus `PLUGIN_UNINSTALL`
 * (Milestone 2, 2026-08-20 — no SPEC-005 spec package covers it; see `uninstall.ts`'s own header)
 * and `PLUGIN_FILES` (2026-09-13 — the read-only package-files viewer; see `files.ts`'s header).
 * The admin UI screen (REQ-12..18) consumes the Phase 1 contract as a black box; the `word-count`
 * dogfood plugin (Phase 2) and the `post.ts` hook-wiring (Phase 3) were later, gated phases that
 * added no new routes to this module. Install/update remain unbuilt (Milestone 2's own scope note:
 * uninstall/disable first, since revocation is what makes installing safe).
 */
export function createPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "plugins",
    registerRoutes: (app) => {
      registerPluginsListRoute(app, deps);
      registerPluginSetEnabledRoute(app, deps);
      registerPluginUninstallRoute(app, deps);
      registerPluginFilesRoute(app, deps);
    },
  };
}
