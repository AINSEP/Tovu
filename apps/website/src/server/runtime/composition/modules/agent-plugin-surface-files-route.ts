import type { Express } from "express";
import type { LoadedAdminSurface } from "@jini-ai/agent-plugins/admin-surfaces";
import { createAdminSurfaceFilesRoute } from "@jini-ai/cms/public-http/routes/agent-plugin-surfaces/files";
import type { Clock } from "@jini-ai/core/primitives";
import { ADMIN_SURFACE_FILES_PER_IP, createRateLimiter, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import {
  createAgentPluginAdminSurfaceSource,
  findAdminSurface,
  readSurfaceFile,
  ADMIN_SURFACE_FILES_PREFIX,
  type AdminSurfaceSource,
} from "#src/features/agent-plugins/admin-surfaces/surfaces";
import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";

/**
 * @file K1 (RT-K1-pub-agent-plugin-surfaces, w4-routes): registrar for `AGENT_PLUGIN_SURFACE_FILE`, the
 * PUBLIC surface-files route (Jini `@jini-ai/cms/public-http/routes/agent-plugin-surfaces/files`; its header
 * says why it carries no session). Mounted with `mountPublicRawRoute` at Tovu's `ADMIN_SURFACE_FILES_PREFIX`,
 * binding this host's per-IP limiter, the lifecycle-backed admitted-surface source and its contained read.
 * The client address comes from the public ports' `requestFacts` (`captureRequestFacts` -> `resolveClientIp`,
 * the same key the hand-written route charged). The spec opts into http-kit's buffered reply, so the answer
 * keeps `res.send`'s `Content-Length`, weak ETag and 304 (pinned in `files.wire.test.ts`).
 */

export interface AdminSurfaceFilesRouteDeps {
  readonly clock: Clock;
  readonly workspaceId: string;
  readonly agentPluginLifecycle: Pick<TovuAgentPluginLifecycle, "loadPluginContributions" | "readTrustedPluginFile">;
  /** Test seam; defaults to the lifecycle-backed source. */
  readonly adminSurfaceSource?: AdminSurfaceSource;
}

const adminSurfaceFilesRoute = createAdminSurfaceFilesRoute<LoadedAdminSurface>({ pathPrefix: ADMIN_SURFACE_FILES_PREFIX });

/** Mount public static files with a per-route limiter; denied calls do no plugin I/O.
 * @complexity O(p + s) admitted plugin/surface scan per allowed request; limiter state is window-bounded.
 */
export function registerAdminSurfaceFilesRoute({ app, deps }: { app: Express; deps: AdminSurfaceFilesRouteDeps }, options: { readonly limiter?: RateLimiter } = {}): void {
  const limiter = options.limiter ?? createRateLimiter({ profile: ADMIN_SURFACE_FILES_PER_IP, clock: deps.clock });
  const source = deps.adminSurfaceSource ?? createAgentPluginAdminSurfaceSource({ lifecycle: deps.agentPluginLifecycle });
  mountPublicRawRoute({
    app,
    spec: adminSurfaceFilesRoute,
    deps: {
      limiter,
      findSurface: ({ pluginId, surfaceId }) => findAdminSurface({ source, workspaceId: deps.workspaceId, pluginId, surfaceId }),
      readSurfaceFile: ({ surface, path }) => readSurfaceFile({ source, surface, path }),
    },
    // Reached only if the host's request-facts port itself fails; every handler fault answers the spec's 404.
    failure: { operation: "agent-plugin-surfaces:file", visitorError: "The surface file couldn’t load." },
  });
}
