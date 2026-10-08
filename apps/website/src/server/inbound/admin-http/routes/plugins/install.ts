import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { sitePluginLocalInstallEnabled } from "#src/features/plugin-runtime/install";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "#src/features/plugin-runtime/install-archive";
import { raw } from "express";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteRegistrar } from "./deps.js";

const conflicts = new Set(["PLUGIN_SHADOWS_BUILT_IN", "PLUGIN_ID_CONFLICT", "PLUGIN_IN_TRASH", "PLUGIN_ENABLED", "PLUGIN_VERSION_EXISTS", "PLUGIN_DOWNGRADE", "PLUGIN_CHANGED_SINCE_PREVIEW", "PLUGIN_INSTALL_BUSY"]);

/** Local sources are explicitly opt-in, even for admins. ZIP parsing follows authorization. */
export const registerPluginInstallRoutes: PluginsRouteRegistrar = (app, deps) => {
  const parseZip = raw({ type: "application/zip", limit: MAX_PLUGIN_ARCHIVE_BYTES, inflate: false });
  for (const [zip, preview] of [[false, true], [false, false], [true, true], [true, false]] as const) {
    app.post(`/api/admin/v1/workspaces/:workspaceId/plugins/install${zip ? "/zip" : ""}${preview ? "/preview" : ""}`, async (req, res) => {
      if (req.params.workspaceId !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
      try {
        const principal = getAuthedPrincipal(res);
        if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "admin.plugins.enable", workspaceId: deps.workspaceId }))) return;
        if (!sitePluginLocalInstallEnabled({ env: process.env }) || !deps.pluginInstaller) {
          res.status(403).json({ code: "PLUGIN_LOCAL_INSTALL_DISABLED", error: "Local folder installs are disabled on this server." }); return;
        }
        // ZIP options ride the query string; folder options are the JSON body. `!options` below is a
        // wiring guard: `req.body` is undefined when the route is mounted without express.json().
        const options = zip ? req.query : req.body;
        const expectedDigest = options?.expectedDigest;
        const replacement = options?.replace;
        if (!options || (zip ? replacement !== undefined && replacement !== "true" && replacement !== "false" : replacement !== undefined && typeof replacement !== "boolean") || (!preview && (typeof expectedDigest !== "string" || !/^sha256-[a-f0-9]{64}$/.test(expectedDigest)))) {
          res.status(400).json({ code: "PLUGIN_INSTALL_INPUT_INVALID", error: "Valid replacement options and the reviewed digest are required." }); return;
        }
        // req.is() is true only for a non-empty application/zip body, and raw() then always leaves
        // a Buffer in req.body, so the archive below needs no separate Buffer check.
        if (zip) {
          if (!req.is("application/zip")) { res.status(400).json({ code: "PLUGIN_INSTALL_INPUT_INVALID", error: "An application/zip upload is required." }); return; }
          const parseError = await new Promise<unknown>((resolve) => parseZip(req, res, (error?: unknown) => resolve(error)));
          if (parseError) {
            const large = (parseError as { type?: string }).type === "entity.too.large";
            res.status(large ? 413 : 400).json({ code: large ? "PLUGIN_PACKAGE_TOO_LARGE" : "PLUGIN_ARCHIVE_INVALID", error: large ? "ZIP exceeds the 32 MiB upload limit." : "ZIP upload could not be read." }); return;
          }
        } else if (options.source?.kind !== "folder" || typeof options.source.path !== "string" || !options.source.path.trim()) {
          res.status(400).json({ code: "PLUGIN_INSTALL_INPUT_INVALID", error: "A folder source is required." }); return;
        }
        const input = { ...(zip ? { archive: req.body as Buffer } : { sourceDir: options.source.path as string }), replace: replacement === true || replacement === "true" };
        const result = preview
          ? await deps.pluginInstaller.preview(input)
          : await deps.pluginInstaller.install({ ...input, expectedDigest: expectedDigest as string });
        res.status(preview ? 200 : 201).json({ plugin: result });
      } catch (error) {
        if (error instanceof PluginInstallError) { res.status(error.code === "PLUGIN_INSTALL_RECOVERY_REQUIRED" ? 500 : conflicts.has(error.code) ? 409 : 400).json({ code: error.code, error: error.message }); return; }
        res.status(500).json({ code: "INTERNAL_ERROR", error: "internal error" });
      }
    });
  }
};
