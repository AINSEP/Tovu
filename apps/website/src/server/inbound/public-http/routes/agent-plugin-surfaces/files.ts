import type { Express } from "express";

import {
  createAgentPluginAdminSurfaceSource,
  findAdminSurface,
  readSurfaceFile,
  ADMIN_SURFACE_FILES_PREFIX,
  type AdminSurfaceSource,
} from "#src/features/agent-plugins/admin-surfaces/surfaces";
import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";

/**
 * @file `AGENT_PLUGIN_SURFACE_FILE` — `GET /api/agent-plugin-surfaces/v1/:pluginId/:surfaceId/<path>`:
 * the static files of one plugin-owned admin surface, which the admin page renders in an
 * `<iframe sandbox="allow-scripts">`.
 *
 * Why PUBLIC (not behind `requireAdminSession`): the frame runs in an opaque origin, so its module
 * scripts are cross-origin CORS fetches that carry no cookie; an authenticated route would break
 * every surface. What makes that safe: only surfaces Jini's loader admitted (active plugin, the
 * build's own shipped digest) are served; only the surface's declared `entry` and `files` are read,
 * through the lifecycle's contained read (symlinks resolved, nothing outside the package root);
 * every response carries Jini's isolation headers (strict CSP with `sandbox allow-scripts` and
 * `frame-ancestors 'self'`, `nosniff`, `no-referrer`). Surface files are plugin code that ships in
 * the build, never secrets: start data reaches the frame only through the authenticated bootstrap.
 *
 * Request ids and the path are only compared with declared values, never joined into a path here.
 */

export interface AdminSurfaceFilesRouteDeps {
  readonly workspaceId: string;
  readonly agentPluginLifecycle: Pick<TovuAgentPluginLifecycle, "loadPluginContributions" | "readTrustedPluginFile">;
  /** Test seam; defaults to the lifecycle-backed source. */
  readonly adminSurfaceSource?: AdminSurfaceSource;
}

function notFound(res: import("express").Response): void {
  res.status(404).set({ "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" }).send("Not found");
}

export function registerAdminSurfaceFilesRoute(app: Express, deps: AdminSurfaceFilesRouteDeps): void {
  const source = deps.adminSurfaceSource ?? createAgentPluginAdminSurfaceSource({ lifecycle: deps.agentPluginLifecycle });
  app.get(`${ADMIN_SURFACE_FILES_PREFIX}/:pluginId/:surfaceId/*`, async (req, res) => {
    try {
      const surface = await findAdminSurface({ source, workspaceId: deps.workspaceId, pluginId: String(req.params.pluginId ?? ""), surfaceId: String(req.params.surfaceId ?? "") });
      const file = surface ? await readSurfaceFile({ source, surface, path: String((req.params as Record<string, string>)[0] ?? "") }) : undefined;
      if (!file?.ok) return notFound(res);
      res.status(200).set(file.headers).send(file.body);
    } catch {
      // A containment refusal or read fault names server paths; never echoed.
      notFound(res);
    }
  });
}
