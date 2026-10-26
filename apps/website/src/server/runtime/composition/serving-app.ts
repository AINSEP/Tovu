import { createTrashScheduler } from "#src/features/trash/scheduler.node";
import { startThemeWatcher } from "#src/features/theme/theme-watcher";
import { startPostGoLiveSweep } from "#src/features/post/go-live";
import type { Express } from "express";

import { startOutboxDrainer, type OutboxDrainer } from "#src/contracts/core/events/index";
import { startTrashSweeper, type TrashSweeper } from "@jini-ai/cms/trash";
import { createApp } from "./app.js";
import { createServingFormPullTrigger } from "./form-pull-triggers.js";
import { startServingWebhookDeliveryWorker, type WebhookDeliveryWorker } from "./webhook-delivery-worker.js";
import { startDomainBindingSweeper, type DomainBindingSweeper } from "./domain-binding-sweeper.js";
import { startSiteSearchMaintenance, type SiteSearchMaintenance } from "./modules/site-search.js";

/**
 * @file `createApp` plus the site-serving process's background loops — the outbox drainer
 * (2026-09-14), Trash auto-purge sweeper (2026-09-20), theme watcher, assistant-run recovery and the
 * site-search maintenance loop (2026-10-21) — as one step.
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
 *
 * The post go-live sweep (2026-10-21, `features/post/go-live.ts`) follows the drainer's rules for the
 * same reason: it enqueues `entry.published` for scheduled posts whose time has come, so it starts
 * after `createApp` and only here. It runs only when `routeDeps.postGoLiveCandidates` is bound.
 *
 * The automatic form pull (`form-pull-triggers.ts`) follows the same two rules: it imports
 * submissions and enqueues their events, so its startup pull runs only after `createApp` attached
 * the subscribers, and only a serving process pulls — at startup and on owner/admin sign-in.
 *
 * The webhook delivery loop (`webhook-delivery-worker.ts`) sends what `createApp`'s integrations
 * module enqueued, so it too runs only here: a POST of a site's data from a process nobody serves
 * is the drainer's loss in reverse.
 *
 * The due-bindings DNS sweep (`domain-binding-sweeper.ts`, 2026-10-21) re-checks `domain_binding`
 * rows on their backoff schedule; same rule — only a serving process writes a site's tracking state.
 * It runs only when the root pre-bound `verifyDueDomainBindings` (the hermetic root does not).
 */

/**
 * Builds the site app and starts its background loops.
 *
 * @param routeDeps the serving process's composed deps; its `outbox`/`bus`/`clock` feed the
 *   drainer, and its pre-bound `sweepTrash` feeds the sweeper.
 * @param optional.outboxDrainIntervalMs idle wait between drains (default: the drainer's own).
 * @param optional.trashSweepIntervalMs idle wait between sweeps (default: the sweeper's own hour).
 * @param optional.webhookDeliveryIntervalMs idle wait between webhook delivery ticks (default: the worker's own 15 s).
 * @param optional.domainBindingSweepIntervalMs idle wait between due-bindings DNS sweeps (default: the sweeper's own minute).
 * @returns the Express app, background handles (stop all at shutdown; `formPullTrigger.stop` and
 *   `siteSearchMaintenance.stop` wait for a running pass), and
 *   `bootWork`: the background passes `createApp` started and returned before they finished
 *   (`CreateAppOptions.onBootWork`). A caller that closes the store awaits these first.
 * @complexity O(1) beyond `createApp`.
 */
export function createServingApp(
  routeDeps: NonNullable<Parameters<typeof createApp>[0]>,
  optional: { outboxDrainIntervalMs?: number; trashSweepIntervalMs?: number; webhookDeliveryIntervalMs?: number; domainBindingSweepIntervalMs?: number } = {}
): { app: Express; outboxDrainer: OutboxDrainer; trashSweeper: TrashSweeper; themeWatcher: ReturnType<typeof startThemeWatcher>; formPullTrigger: { stop(): Promise<void> }; postGoLiveSweep: { stop(): Promise<void> }; webhookDeliveryWorker: WebhookDeliveryWorker; domainBindingSweeper: DomainBindingSweeper; siteSearchMaintenance: SiteSearchMaintenance; bootWork: Promise<void>[] } {
  const bootWork: Promise<void>[] = [];
  const formPull = createServingFormPullTrigger({ autoPull: routeDeps.formSubmissionsAutoPull, workspaceId: routeDeps.workspaceId });
  const app = createApp(routeDeps, { recoverAssistantChatRuns: true, onBootWork: (work) => bootWork.push(work), onAdminSignIn: formPull.signIn });
  const outboxDrainer = startOutboxDrainer(
    { outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock },
    { intervalMs: optional.outboxDrainIntervalMs, tracker: routeDeps.tracker }
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
  const candidates = routeDeps.postGoLiveCandidates;
  const postGoLiveSweep = candidates
    ? startPostGoLiveSweep({ deps: { repo: candidates, outbox: routeDeps.outbox, clock: routeDeps.clock }, workspaceId: routeDeps.workspaceId })
    : { stop: async () => {} };
  const themeWatcher = startThemeWatcher({ themes: routeDeps.themes, themesDir: routeDeps.themesDir });
  const webhookDeliveryWorker = startServingWebhookDeliveryWorker(
    { deps: routeDeps },
    optional.webhookDeliveryIntervalMs === undefined ? {} : { intervalMs: optional.webhookDeliveryIntervalMs }
  );
  const domainBindingSweeper = startDomainBindingSweeper(
    { sweep: routeDeps.verifyDueDomainBindings },
    optional.domainBindingSweepIntervalMs === undefined ? {} : { intervalMs: optional.domainBindingSweepIntervalMs }
  );
  // After `createApp`: the pulled submissions' events need their subscribers attached.
  formPull.pullNow();
  // Site search upkeep (reconcile + resumable backfill, and the boot rebuild for a site with no index
  // yet). Serving-only for the sweeper's reason: it writes to search backends on a schedule, which only
  // the process serving the site may do. A no-op handle when the composition has no search runtime.
  const siteSearchMaintenance = startSiteSearchMaintenance({ runtime: routeDeps.siteSearch });
  return { app, outboxDrainer, trashSweeper, themeWatcher, formPullTrigger: { stop: formPull.stop }, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance, bootWork };
}
