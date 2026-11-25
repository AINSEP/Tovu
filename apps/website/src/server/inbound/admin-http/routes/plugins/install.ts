import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "@jini-ai/plugins/host/node";
import { raw, type Express, type Request, type Response } from "express";
import { folderPluginInstallPreviewRoute, folderPluginInstallRoute, zipPluginInstallPreviewRoute, zipPluginInstallRoute, pluginInstallErrorStatus, zipParserRefusal } from "@jini-ai/cms/admin-http/routes/plugins/install";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../../admin-raw-route-ports.js";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteDeps } from "#src/server/runtime/composition/modules/plugins";
import { localPluginInstaller, type LocalInstallerDeps } from "./local-installer.js";

/** The deps the install routes read. */
export type PluginInstallRouteDeps = Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "tracker"> & LocalInstallerDeps;

async function readZipUpload(req: Request, res: Response, parseZip: ReturnType<typeof raw>): ReturnType<Parameters<typeof zipPluginInstallRoute.handle>[0]["deps"]["readZipUpload"]> {
  if (!req.is("application/zip")) return { ok: false, refusal: { status: 400, code: "PLUGIN_INSTALL_INPUT_INVALID", error: "An application/zip upload is required." } };
  const parseError = await new Promise<unknown>((resolve) => parseZip(req, res, (error?: unknown) => resolve(error)));
  if (parseError) return { ok: false, refusal: zipParserRefusal({ error: parseError, uploadLimitText: "ZIP exceeds the 32 MiB upload limit." }) };
  if (!Buffer.isBuffer(req.body)) return { ok: false, refusal: zipParserRefusal({ error: undefined, uploadLimitText: "ZIP exceeds the 32 MiB upload limit." }) };
  return { ok: true, archive: req.body };
}

function respondInstallFailure({ res, error }: { res: Response; error: unknown }, _optional = {}): void {
  if (error instanceof PluginInstallError) { res.status(pluginInstallErrorStatus({ code: error.code })).json({ code: error.code, error: error.message }); return; }
  sendAdminFailure({ res, error }, { operation: "routes/plugins/install", code: "INTERNAL_ERROR" });
}

/** Local sources are explicitly opt-in, even for admins. ZIP parsing follows authorization. */
export const registerPluginInstallRoutes = ({ app, deps }: { app: Express; deps: PluginInstallRouteDeps }, _optional: Record<string, never> = {}): void => {
  const parseZip = raw({ type: "application/zip", limit: MAX_PLUGIN_ARCHIVE_BYTES, inflate: false });
  for (const [spec, zip, preview] of [[folderPluginInstallPreviewRoute, false, true], [folderPluginInstallRoute, false, false], [zipPluginInstallPreviewRoute, true, true], [zipPluginInstallRoute, true, false]] as const) {
    const mounted = {
      workspaceId: deps.workspaceId, authorize: deps.authorize,
      installer: () => localPluginInstaller(deps),
      readZipUpload: (): ReturnType<Parameters<typeof zipPluginInstallRoute.handle>[0]["deps"]["readZipUpload"]> => { throw new Error("bound per request"); },
      onInstalled: ({ actorId, pluginId }: { actorId: string; pluginId: string }) => {
        void deps.tracker.capture({ name: "plugin_installed", userId: actorId }, { properties: { pluginId, pluginKind: "cms", source: "admin" } });
      },
    };
    if (zip) {
      mountAdminRawRoute<typeof mounted>({ app, spec, deps: mounted }, {
        requestDeps: ({ req, res, deps: base }) => ({ ...base, readZipUpload: () => readZipUpload(req, res, parseZip) }),
        failureWriter: ({ res, error }) => {
          if (!preview) void deps.tracker.capture({ name: "operation_failed", userId: getAuthedPrincipal(res).id }, { properties: { operationKind: "plugin_install", reasonClass: error instanceof PluginInstallError ? "refused" : "internal", surface: "admin", retryable: false } });
          respondInstallFailure({ res, error });
        },
      });
    } else {
      mountAdminJsonRoute({ app, spec, deps: mounted }, {
        failureWriter: ({ res, error }) => {
          if (!preview) void deps.tracker.capture({ name: "operation_failed", userId: getAuthedPrincipal(res).id }, { properties: { operationKind: "plugin_install", reasonClass: error instanceof PluginInstallError ? "refused" : "internal", surface: "admin", retryable: false } });
          respondInstallFailure({ res, error });
        },
      });
    }
  }
};
