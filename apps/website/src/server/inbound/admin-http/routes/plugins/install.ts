import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { MAX_PLUGIN_ARCHIVE_BYTES } from "@jini-ai/plugins/host/node";
import { raw, type Express } from "express";
import { registerPluginInstallRoutes as registerInstall } from "@jini-ai/cms/admin-http/routes/plugins/install";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../../admin-raw-route-ports.js";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { PluginsRouteDeps } from "#src/server/runtime/composition/modules/plugins";
import { localPluginInstaller, type LocalInstallerDeps } from "./local-installer.js";

/** The deps the install routes read. */
export type PluginInstallRouteDeps = Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "tracker"> & LocalInstallerDeps;

/** Local sources are explicitly opt-in, even for admins. ZIP parsing follows authorization. */
export const registerPluginInstallRoutes = ({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: PluginInstallRouteDeps }, _optional: Record<string, never> = {}): void => registerInstall({
  mountJson: route => mountAdminJsonRoute({ errors, app, spec: route.spec,
    deps: { ...route.deps, workspaceId: deps.workspaceId, authorize: deps.authorize },
  }, { failureWriter: ({ res, error }) => route.failure({ error,
    principalId: () => getAuthedPrincipal(res).id,
    json: (body, status) => { res.status(status).json(body); },
    incident: (error, options) => { sendAdminFailure({ res, error }, options); },
  }) }),
  mountRaw: route => mountAdminRawRoute({ errors, app, spec: route.spec,
    depsForRequest: ({ req, res }) => ({ workspaceId: deps.workspaceId, authorize: deps.authorize,
      ...route.requestDeps({
        isZip: () => Boolean(req.is("application/zip")),
        parseZip: parser => new Promise<unknown>(resolve => parser(req, res, (error?: unknown) => resolve(error))),
        body: () => req.body,
        isBuffer: Buffer.isBuffer,
      }),
    }),
  }, { failureWriter: ({ res, error }) => route.failure({ error,
    principalId: () => getAuthedPrincipal(res).id,
    json: (body, status) => { res.status(status).json(body); },
    incident: (error, options) => { sendAdminFailure({ res, error }, options); },
  }) }),
  parserFactory: raw,
  installer: () => localPluginInstaller(deps),
  onInstalled: ({ actorId, pluginId }) => {
    void deps.tracker.capture({ name: "plugin_installed", userId: actorId }, { properties: { pluginId, pluginKind: "cms", source: "admin" } });
  },
  onFailure: ({ actorId, reasonClass }) => {
    void deps.tracker.capture({ name: "operation_failed", userId: actorId }, { properties: { operationKind: "plugin_install", reasonClass, surface: "admin", retryable: false } });
  },
  installError: PluginInstallError,
  operation: "routes/plugins/install",
  maxArchiveBytes: MAX_PLUGIN_ARCHIVE_BYTES,
  uploadLimitText: "ZIP exceeds the 32 MiB upload limit.",
});
