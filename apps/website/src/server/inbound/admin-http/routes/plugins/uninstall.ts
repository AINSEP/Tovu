import { PluginNotFoundError } from "#src/features/plugin-runtime/activation";
import {
  PluginAlreadyInTrashError,
  PluginEnabledError,
  PluginNotUninstallableError,
  uninstallPlugin,
} from "#src/features/plugin-runtime/uninstall";
import { PluginUninstallPathError } from "#src/server/runtime/composition/plugin-runtime";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";
import type { PluginsRouteRegistrar } from "./deps.js";

/** Maps this route's thrown error types onto the admin error envelope.
 *  @complexity O(1). */
function sendPluginUninstallError(res: Response, err: unknown): void {
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

  if (err instanceof PluginAlreadyInTrashError) {
    res.status(409).json({ error: err.message, code: "PLUGIN_IN_TRASH" });
    return;
  }

  if (err instanceof PluginUninstallPathError) {
    res.status(400).json({ error: err.message, code: "PLUGIN_ID_INVALID" });
    return;
  }

  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/**
 * @file `PLUGIN_UNINSTALL` moves a site plugin to the 60-day Trash. The package directory is shared
 * by every workspace on this site, while the Trash row belongs to the workspace making the request.
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
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "admin.plugins.enable",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const discovery = await deps.discoverPlugins();
      const result = await uninstallPlugin({
        deps: {
          repo: deps.pluginActivationRepo,
          discovery,
          remove: deps.removePlugin,
        },
        input: {
          pluginId,
          workspaceId: deps.workspaceId,
          at: deps.clock.nowIso(),
          actor: { principalId: principal.id },
        },
      });

      res.json({ pluginId, trashed: result.trashed });
    } catch (err) {
      sendPluginUninstallError(res, err);
    }
  });
};
