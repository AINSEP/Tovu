import { PluginNotFoundError } from "#src/features/plugin-runtime/activation";
import { PluginEnabledError, PluginNotUninstallableError, uninstallPlugin } from "#src/features/plugin-runtime/uninstall";
import { PluginUninstallPathError } from "#src/server/runtime/composition/plugin-runtime";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { PluginsRouteRegistrar } from "./deps.js";

/**
 * @file `PLUGIN_UNINSTALL` — `DELETE /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId`
 * (Milestone 2, 2026-08-20). No SPEC-005 spec package covers this endpoint at all — `ui.spec.md`'s
 * "On plugin installation" section explicitly says v1 install is "a filesystem operation, not an
 * HTTP one" and `api.spec.md` §1 lists only `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`. This route (and
 * its error codes below) is new surface, not an implementation of an existing contract.
 *
 * Deliberately NOT wrapped in `executeCommand`/the gateway's change-set/revert machinery, unlike
 * `set-enabled.ts`: removing a plugin's on-disk artifact is not a revertible database write — there
 * is no meaningful "restore the prior state" for deleted bytes, and wrapping this in a mechanism
 * whose entire point is capturing a usable inverse would be misleading (a captured "inverse" could
 * only ever re-create an activation ROW, never the artifact that made the plugin actually work).
 * Structured like `list.ts` instead: authorize, call the feature function, map its typed errors.
 * Same `admin.plugins.enable` permission `set-enabled.ts` already gates its own mutation behind —
 * no new permission string introduced, per the settled policy for this route surface.
 *
 * All business-rule gating (not-found / built-in-can't-be-uninstalled / enabled-somewhere) lives in
 * `uninstallPlugin()` (`features/plugin-runtime/uninstall.ts`); all path-traversal-safety gating
 * lives in `deps.onPluginUninstalled` (`server/plugin-runtime.ts`'s `onPluginUninstalled`, bound by
 * the composition root). This handler is purely the HTTP <-> typed-error translation layer, mirrors
 * every other route in this directory.
 */
export const registerPluginUninstallRoute: PluginsRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pluginId = String(req.params.pluginId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.plugins.enable",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.plugins.enable' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.plugins.enable", reason: authResult.reason },
        });
        return;
      }

      const discovery = await deps.discoverPlugins();
      const result = await uninstallPlugin({
        deps: {
          repo: deps.pluginActivationRepo,
          discovery,
          onUninstall: deps.onPluginUninstalled,
        },
        input: { pluginId },
      });

      res.json({ pluginId, clearedWorkspaceIds: result.clearedWorkspaceIds });
    } catch (err) {
      if (err instanceof PluginNotFoundError) {
        res.status(404).json({ error: err.message, code: "PLUGIN_NOT_FOUND" });
        return;
      }

      if (err instanceof PluginNotUninstallableError) {
        res.status(422).json({ error: err.message, code: "PLUGIN_NOT_UNINSTALLABLE" });
        return;
      }

      if (err instanceof PluginEnabledError) {
        res.status(409).json({ error: err.message, code: "PLUGIN_ENABLED" });
        return;
      }

      if (err instanceof PluginUninstallPathError) {
        res.status(400).json({ error: err.message, code: "PLUGIN_ID_INVALID" });
        return;
      }

      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
