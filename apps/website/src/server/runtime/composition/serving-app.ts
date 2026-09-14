import type { Express } from "express";

import { startOutboxDrainer, type OutboxDrainer } from "#src/contracts/core/events/index";
import type { RouteDeps } from "../../routes/types.js";
import { createApp } from "./app.js";

/**
 * @file `createApp` plus the site-serving process's background outbox drainer, as one step
 * (2026-09-14).
 *
 * Callers: the two site-serving boot paths and nothing else. `src/index.ts` serves the dev API and the
 * container image (`Dockerfile` CMD). `cli/commands/serve.ts` is `tovu serve`, which the desktop app
 * spawns per site window. Pinned by `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts`.
 *
 * Why not inside `createApp`: `createApp` also runs where no site is served and nothing may drain.
 * That covers the static exporter (`routeDeps.createSiteApp()`, including inside the agent daemon)
 * and `app.ts`'s eager module-level `app`, which every importer of `app.ts` builds. The agent daemon
 * itself only enqueues (`agent-daemon-deps.ts`).
 *
 * Order is the point. `createApp` subscribes every handler (SEO sitemap invalidation, forms notify,
 * webhook fan-out, newsletter batches, redirect hits) onto `routeDeps.bus` synchronously, and only
 * then does the drainer start. A drainer started first could mark rows delivered with no handlers
 * attached, the same loss this fix closes in the daemon.
 */

/**
 * Builds the site app and starts its outbox drainer.
 *
 * @param routeDeps the serving process's composed deps; its `outbox`/`bus`/`clock` feed the drainer.
 * @param optional.outboxDrainIntervalMs idle wait between drains (default: the drainer's own).
 * @returns the Express app and the drainer handle; call `outboxDrainer.stop()` on shutdown.
 * @complexity O(1) beyond `createApp`.
 */
export function createServingApp(
  routeDeps: RouteDeps,
  optional: { outboxDrainIntervalMs?: number } = {}
): { app: Express; outboxDrainer: OutboxDrainer } {
  const app = createApp(routeDeps);
  const outboxDrainer = startOutboxDrainer(
    { outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock },
    { intervalMs: optional.outboxDrainIntervalMs }
  );
  return { app, outboxDrainer };
}
