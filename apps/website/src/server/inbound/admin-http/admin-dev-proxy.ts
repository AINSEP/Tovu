import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import { isSeaRuntime } from "@jini-ai/cms/admin-http/sea-runtime";
import { createDevProxyUpgradeListener } from "@jini-ai/http-kit/dev-proxy";

/**
 * @file Host glue for the admin dev proxy: reads `TOVU_ADMIN_DEV_PROXY_URL` and the SEA (packaged
 * build) check, then attaches `@jini-ai/http-kit/dev-proxy`'s `upgrade` listener. The proxy itself
 * (request handler, HMR socket splice) lives in http-kit; `admin-static.ts` mounts its request handler.
 */

/**
 * Registers the `upgrade` listener that makes Vite's HMR WebSocket work through the dev proxy.
 *
 * Must be called with the actual `http.Server`/`https.Server` instance (not the Express `app`):
 * `upgrade` is a socket-level server event Express's own request routing never sees. No-ops when
 * `TOVU_ADMIN_DEV_PROXY_URL` is unset or this is a packaged (SEA) build, mirroring
 * `admin-static.ts`'s own precedence — the SEA branch there always wins, and this var must never be
 * set in production/packaged builds.
 *
 * @complexity O(1) setup; one `upgrade` listener added to `server` for the process's lifetime.
 */
export function registerAdminDevProxyUpgrade(server: { on(event: "upgrade", listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void): unknown }): void {
  const devProxyUrl = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  if (!devProxyUrl || isSeaRuntime({ orFallbackSync })) return;

  server.on("upgrade", createDevProxyUpgradeListener({ devProxyUrl, basePath: "/admin" }));
}
