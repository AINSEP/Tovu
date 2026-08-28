import { toAdminPluginResponse } from "#src/server/http/admin/plugins";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteRegistrar } from "./deps.js";

/**
 * @file `PLUGINS_LIST` — `GET /api/admin/v1/workspaces/:workspaceId/plugins` (SPEC-005 REQ-10,
 * api.spec.md §1/§4/§5; C-016). A plain read — no gateway involvement (errors.spec.md §4:
 * `PLUGIN_NOT_FOUND` etc. are route-level guards on the OTHER endpoint, `PLUGIN_SET_ENABLED`).
 *
 * Discovery + integrity/`sdkRange` checks run server-side on every call (no refresh parameter,
 * api.spec.md §4) — `deps.discoverPlugins()` is a pre-bound closure that does exactly this.
 * `enabled` is projected per-record from `deps.pluginActivationRepo` via `toAdminPluginResponse()`
 * (discovery itself does not know activation state).
 *
 * Architectural role:
 * TDD-certified implementation (implementation outline C-016). Route registration and handler body
 * are both real: authorizes `admin.plugins.read`, runs discovery, and projects each record through
 * `toAdminPluginResponse()` alongside its activation row. Verified against
 * `__tests__/integration/plugins-http.integration.test.ts`.
 */
export const registerPluginsListRoute: PluginsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/plugins", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.plugins.read",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.plugins.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.plugins.read", reason: authResult.reason },
        });
        return;
      }

      const discovery = await deps.discoverPlugins();
      const plugins = await Promise.all(
        discovery.map(async (record) => {
          const activation = await deps.pluginActivationRepo.getActivation({
            workspaceId: deps.workspaceId,
            pluginId: record.id,
          });
          return toAdminPluginResponse(record, activation);
        })
      );

      res.json({ plugins });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
