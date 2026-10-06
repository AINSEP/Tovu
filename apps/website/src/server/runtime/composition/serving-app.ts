import { createTrashScheduler } from "#src/features/trash/scheduler.node";
import type { Express } from "express";

import { startOutboxDrainer, type OutboxDrainer } from "#src/contracts/core/events/index";
import { startTrashSweeper, type TrashSweeper } from "@jini-ai/cms/trash";
import { createApp } from "./app.js";

/**
 * @file `createApp` plus the site-serving process's background loops — the outbox drainer
 * (2026-09-14), Trash auto-purge sweeper (2026-09-20), and assistant-run recovery — as one step.
 *
 * Callers: the two site-serving boot paths and nothing else. `src/index.ts` serves the dev API and the
 * container image (`Dockerfile` CMD). `cli/commands/serve.ts` is `tovu serve`, which the desktop app
 * spawns per site window. Pinned by `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts`.
 *
 * Why not inside `createApp`: `createApp` also runs where no site is served and nothing may drain.
 * That covers the static exporter (`routeDeps.createSiteApp()`, including inside the agent daemon)
 * and `app.ts`'s eager module-level `app`, which every importer of `app.ts` builds. The agent daemon
 * itself only enqueues (`agent-daemon-deps.ts`).
 * Assistant recovery has the same ownership rule: an export app built by a live chat run is not
 * a web restart. Sweeping during its route registration canceled that very run's transcript while
 * its daemon still held the conversation (2026-10-05); only a serving boot may probe and recover.
 *
 * Order is the point. `createApp` subscribes every handler (SEO sitemap invalidation, forms notify,
 * webhook fan-out, newsletter batches, redirect hits) onto `routeDeps.bus` synchronously, and only
 * then does the drainer start. A drainer started first could mark rows delivered with no handlers
 * attached, the same loss this fix closes in the daemon.
 */

/**
 * Builds the site app and starts its background loops.
 *
 * @param routeDeps the serving process's composed deps; its `outbox`/`bus`/`clock` feed the
 *   drainer, and its pre-bound `sweepTrash` feeds the sweeper.
 * @param optional.outboxDrainIntervalMs idle wait between drains (default: the drainer's own).
 * @param optional.trashSweepIntervalMs idle wait between sweeps (default: the sweeper's own hour).
 * @returns the Express app, both loop handles (call them at shutdown: `trashSweeper.stop({})`), and
 *   `bootWork`: the background passes `createApp` started and returned before they finished
 *   (`CreateAppOptions.onBootWork`). A caller that closes the store awaits these first.
 * @complexity O(1) beyond `createApp`.
 */
export function createServingApp(
  routeDeps: NonNullable<Parameters<typeof createApp>[0]>,
  optional: { outboxDrainIntervalMs?: number; trashSweepIntervalMs?: number } = {}
): { app: Express; outboxDrainer: OutboxDrainer; trashSweeper: TrashSweeper; bootWork: Promise<void>[] } {
  const bootWork: Promise<void>[] = [];
  const app = createApp(routeDeps, { recoverAssistantChatRuns: true, onBootWork: (work) => bootWork.push(work) });
  const outboxDrainer = startOutboxDrainer(
    { outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock },
    { intervalMs: optional.outboxDrainIntervalMs }
  );
  // Unlike the drainer, the sweeper has no ordering dependency on `createApp` — it reads and writes
  // only `trashed_items` and the domain markers, and publishes nothing onto the bus. It starts here
  // anyway, and only here, for the other half of the drainer's reason: this is the one process pair
  // that serves a site. A sweep in the exporter or the agent daemon would hard-delete a site's rows
  // from a process nobody is watching, on a schedule nobody set.
  const trashSweeper = startTrashSweeper(
    {
      sweep: routeDeps.sweepTrash, clock: { nowMs: () => Date.parse(routeDeps.clock.nowIso()) },
      scheduler: createTrashScheduler({}), leaseOwner: `trash-sweeper-${Math.random().toString(36).slice(2, 10)}`
    },
    {
      intervalMs: optional.trashSweepIntervalMs,
      onError: ({ error }) => console.error("[trash-sweeper] sweep failed; retrying after the idle interval", error)
    }
  );
  return { app, outboxDrainer, trashSweeper, bootWork };
}
