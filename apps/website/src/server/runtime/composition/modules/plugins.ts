import { registerPluginsListRoute } from "#src/server/inbound/admin-http/routes/plugins/list";
import { registerPluginSetEnabledRoute } from "#src/server/inbound/admin-http/routes/plugins/set-enabled";
import { registerPluginFilesRoute } from "#src/server/inbound/admin-http/routes/plugins/files";
import { registerPluginPreviewRoute } from "#src/server/inbound/admin-http/routes/plugins/preview";
import { registerPluginUninstallRoute } from "#src/server/inbound/admin-http/routes/plugins/uninstall";
import { registerPluginInstallRoutes } from "#src/server/inbound/admin-http/routes/plugins/install";
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
 * and `PLUGIN_FILES` (2026-09-13 — the read-only package-files viewer; see `files.ts`'s header),
 * and `PLUGIN_PREVIEW` (AW-7 Tier 2, 2026-10-04 — one plugin's beforeSave on an unsaved draft; see
 * `preview.ts`'s header) with its `GET` sibling `PLUGIN_PREVIEW_STATUS` (2026-10-05).
 * The admin UI screen (REQ-12..18) consumes the Phase 1 contract as a black box; the `word-count`
 * dogfood plugin (Phase 2) and the `post.ts` hook-wiring (Phase 3) were later, gated phases that
 * added no new routes to this module. Local folder install/update now use the owner-approved
 * 2026-09-22 plan: uninstall/disable came first, since revocation is what makes installing safe.
 */
export function createPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "plugins",
    registerRoutes: (app) => {
      registerPluginsListRoute(app, deps);
      registerPluginSetEnabledRoute(app, deps);
      registerPluginUninstallRoute(app, deps);
      registerPluginFilesRoute(app, deps);
      registerPluginInstallRoutes(app, deps);
      // After the install routes: `.../plugins/:pluginId/preview` also matches
      // `.../plugins/install/preview`, and Express runs the first registered match.
      registerPluginPreviewRoute(app, deps);
    },
  };
}
