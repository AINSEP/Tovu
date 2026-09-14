import { PLUGIN_PACKAGE_FILE_LIMITS, PluginPackagePathError } from "#src/features/plugin-runtime/package-files";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";
import type { PluginsRouteRegistrar } from "./deps.js";

/** Maps this route's thrown error types onto the admin error envelope. The path error's own message
 *  names absolute server paths, so it is replaced with fixed text rather than echoed.
 *  @complexity O(1). */
function sendPluginFilesError(res: Response, err: unknown): void {
  if (err instanceof PluginPackagePathError) {
    res.status(400).json({ error: "plugin id or version is not a safe path", code: "PLUGIN_ID_INVALID" });
    return;
  }

  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/**
 * @file `PLUGIN_FILES` — `GET /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/files`
 * (2026-09-13). The admin Plugins screen's read-only package-files viewer: every file in ONE
 * discovered plugin's own directory, bounded and never following a symlink.
 *
 * Structured like `list.ts`/`uninstall.ts`: authorize, run discovery, call a pre-bound mechanism,
 * map its typed error. Gated on `admin.plugins.read` — the permission `PLUGINS_LIST` and the Agent
 * Plugins screen's `AGENT_PLUGINS_LIST` both use — and authorized BEFORE the id is looked up, so a
 * caller without it learns nothing about which plugin ids exist.
 *
 * The id must name a record in a fresh discovery pass (`PLUGIN_NOT_FOUND` otherwise), so no request
 * text is ever joined into a path directly. Which directory that record maps to, and the path
 * safety for it, live in `deps.readPluginPackageFiles` (`plugin-runtime.ts`) and
 * `features/plugin-runtime/package-files.ts` — see those files' headers.
 *
 * Unlike the Agent Plugins viewer (a compile-time allowlist in the admin bundle, no route at all),
 * this reads the disk: a `.tovu-plugin` is dropped into the install directory at runtime, so no
 * build-time list could know its files.
 */
export const registerPluginFilesRoute: PluginsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/files", async (req, res) => {
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
          permission: "admin.plugins.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const record = (await deps.discoverPlugins()).find((candidate) => candidate.id === pluginId);
      if (!record) {
        res.status(404).json({ error: "plugin was not found", code: "PLUGIN_NOT_FOUND" });
        return;
      }

      const { files, truncated } = await deps.readPluginPackageFiles(record);
      res.json({ pluginId, source: record.source, files, truncated, limits: PLUGIN_PACKAGE_FILE_LIMITS });
    } catch (err) {
      sendPluginFilesError(res, err);
    }
  });
};
