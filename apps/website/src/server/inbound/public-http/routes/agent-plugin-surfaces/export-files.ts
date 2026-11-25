/** Public declarative export assets; templates and undeclared files are never served. */
import type { Express } from "express";
import { createPluginExportFilesRoute } from "@jini-ai/cms/public-http/routes/agent-plugin-surfaces/export-files";
import type { Clock } from "@jini-ai/core/primitives";
import { ADMIN_SURFACE_FILES_PER_IP, createRateLimiter, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { createPluginExportSource, PLUGIN_EXPORT_FILES_PREFIX, type PluginExportPackage, type PluginExportSource } from "#src/features/agent-plugins/exports/source";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";

/**
 * @file K1 (x8-s5): registrar for the PUBLIC plugin export-files route (Jini
 * `@jini-ai/cms/public-http/routes/agent-plugin-surfaces/export-files`, whose header carries the serving rules).
 * Mounted with `mountPublicRawRoute` at Tovu's `PLUGIN_EXPORT_FILES_PREFIX`, binding this host's per-IP limiter
 * and the lifecycle-backed export catalog. The client address comes from the public ports' `requestFacts`
 * (`captureRequestFacts` -> `resolveClientIp`, the same key the hand-written route charged). The spec opts into
 * http-kit's buffered reply, so the answer keeps `res.send`'s `Content-Length`, weak ETag and 304.
 */

interface ExportFilesDeps {
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly agentPluginLifecycle: TovuAgentPluginLifecycle;
}

const exportFilesRoute = createPluginExportFilesRoute<PluginExportPackage>({ pathPrefix: PLUGIN_EXPORT_FILES_PREFIX });

/** Rate-limit before catalog I/O; the spec answers every refusal as its fixed 404.
 * @complexity One lifecycle catalog scan and one declared file read per allowed request.
 */
export function registerPluginExportFilesRoute(required: { app: Express; deps: ExportFilesDeps }, options: { source?: PluginExportSource; limiter?: RateLimiter } = {}): void {
  const { app, deps } = required;
  const source = options.source ?? createPluginExportSource({ lifecycle: deps.agentPluginLifecycle });
  const limiter = options.limiter ?? createRateLimiter({ profile: ADMIN_SURFACE_FILES_PER_IP, clock: deps.clock });
  mountPublicRawRoute({
    app,
    spec: exportFilesRoute,
    deps: { workspaceId: deps.workspaceId, limiter, source },
    // Reached only if the host's request-facts port itself fails; every handler fault answers the spec's 404.
    failure: { operation: "agent-plugin-exports:file", visitorError: "The export file couldn’t load." },
  });
}
