import { PluginInstallError } from "#src/features/plugin-runtime/install";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteRegistrar } from "./deps.js";

const conflicts = new Set(["PLUGIN_SHADOWS_BUILT_IN", "PLUGIN_ID_CONFLICT", "PLUGIN_IN_TRASH", "PLUGIN_ENABLED", "PLUGIN_VERSION_EXISTS", "PLUGIN_DOWNGRADE", "PLUGIN_CHANGED_SINCE_PREVIEW", "PLUGIN_INSTALL_BUSY"]);

/** Folder paths are read on the server, so this route is explicitly opt-in, even for admins. */
export const registerPluginInstallRoutes: PluginsRouteRegistrar = (app, deps) => {
  for (const preview of [true, false]) {
    app.post(`/api/admin/v1/workspaces/:workspaceId/plugins/install${preview ? "/preview" : ""}`, async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
      try {
        const principal = getAuthedPrincipal(res);
        if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.plugins.enable", workspaceId: deps.workspaceId }))) return;
        if (process.env.TOVU_PLUGIN_LOCAL_INSTALL !== "1" || !deps.pluginInstaller) {
          res.status(403).json({ code: "PLUGIN_LOCAL_INSTALL_DISABLED", error: "Local folder installs are disabled on this server." }); return;
        }
        const body = req.body;
        if (!body || body.source?.kind !== "folder" || typeof body.source.path !== "string" || !body.source.path.trim() || (body.replace !== undefined && typeof body.replace !== "boolean") || (!preview && (typeof body.expectedDigest !== "string" || !/^sha256-[a-f0-9]{64}$/.test(body.expectedDigest)))) {
          res.status(400).json({ code: "PLUGIN_INSTALL_INPUT_INVALID", error: "A folder source and, for install, the reviewed digest are required." }); return;
        }
        const input = { sourceDir: body.source.path, replace: body.replace === true };
        const result = preview
          ? await deps.pluginInstaller.preview(input)
          : await deps.pluginInstaller.install({ ...input, expectedDigest: body.expectedDigest });
        res.status(preview ? 200 : 201).json({ plugin: result });
      } catch (error) {
        if (error instanceof PluginInstallError) { res.status(error.code === "PLUGIN_INSTALL_RECOVERY_REQUIRED" ? 500 : conflicts.has(error.code) ? 409 : 400).json({ code: error.code, error: error.message }); return; }
        res.status(500).json({ code: "INTERNAL_ERROR", error: "internal error" });
      }
    });
  }
};
