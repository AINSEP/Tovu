import { NO_OPERATION_TRACKING } from "#src/platform/express/jini-routes";
import { createCleanupPreviewStore, createRetentionRunner } from "@jini-ai/platform/retention";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import type { claimSiteRunning } from "#src/platform/site-dir/site-running";
import { servingDatabaseCopies, siteRetentionPolicies, startSiteRetention, type FreePagesWork } from "./retention.js";
import { createMediaBytesPolicy } from "./retention-policies/media-bytes.js";
import { mediaBytesDeps, servingRecoveryArtifacts } from "./retention-policies/media-bytes-deps.js";
import { servingStoragePaths, type SiteStoragePort } from "./modules/storage-routes.js";
import { measureSiteStorage } from "#src/features/storage/measure";
import { stat, unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { createTrashScheduler } from "@jini-ai/cms/trash/site/scheduler.node";
import { createThemeWatcher } from "@jini-ai/cms/themes/preview/watcher";
import { refreshWatchedThemes, reportThemeWatchError } from "#src/features/theme/index";
import { startPostGoLiveSweep } from "@jini-ai/cms/posts/go-live-sweep";
import { Router, type Express } from "express";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { ownerAccessFor, startServingRoutines, type ServingRoutines } from "./modules/serving-routines.js";
import { servingRoutineToolOptions, settingsLocaleFor } from "./modules/serving-routine-tools.js";
import type { RoutineRunHandler } from "@jini-ai/daemon";

import { startOutboxDrainer, type OutboxQueueMetrics } from "#src/contracts/core/events/outbox-drainer";
import { readOutboxQueueDepth } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { type OutboxDrainer } from "@jini-ai/infra/events/outbox";
import { startTrashSweeper, type TrashSweeper } from "@jini-ai/cms/trash";
import { createApp, siteFailureReporter } from "./app.js";
import type { CreateAppOptions } from "./create-app-options.js";
import { createServingFormPullTrigger } from "./form-pull-triggers.js";
import { startServingWebhookDeliveryWorker, type WebhookDeliveryWorker } from "./webhook-delivery-worker.js";
import { startDomainBindingSweeper, type DomainBindingSweeper } from "@jini-ai/devops/dns";
import { nodeWebhookDeliveryScheduler } from "@jini-ai/integrations/webhooks";
import { startSiteSearchMaintenance, type SiteSearchMaintenance } from "./modules/site-search.js";
import { createConsoleLogger } from "@jini-ai/core/primitives";

const consoleLogger = createConsoleLogger({ prefix: "" });

// Only the website serving runtime starts this service. Recomposition/site switches replace its
// active site's watcher; exporter apps and the separate agent daemon never own another one.
const startThemeWatcher = createThemeWatcher({ onError: reportThemeWatchError });

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
 * That covers the static exporter (`routeDeps.createSiteApp()`) and `app.ts`'s eager module-level
 * `app`, which every importer of `app.ts` builds. ADR-070's daemon has no site composition or
 * outbox: its remote site writes execute here, with this serving process's real subscribers.
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
 * The due-bindings DNS sweep (`@jini-ai/devops/dns` `startDomainBindingSweeper`, 2026-10-21) re-checks `domain_binding`
 * rows on their backoff schedule; same rule — only a serving process writes a site's tracking state.
 * It runs only when the root pre-bound `verifyDueDomainBindings` (the hermetic root does not).
 */

/**
 * The drainer's queue-depth gauge ports, or nothing: no gauge without the durable content kernel or
 * without metric admission by the observability port. The depth is this workspace's live outbox
 * rows; no workspace, event, URL or payload label is attached.
 * @returns `{ queueMetrics }` to spread into the drainer options, or `{}`.
 */
function outboxQueueMetrics({ routeDeps }: { routeDeps: Pick<NonNullable<Parameters<typeof createApp>[0]>, "contentKernel" | "workspaceId" | "observability"> }, _optional = {}): { queueMetrics?: OutboxQueueMetrics } {
  const { contentKernel, workspaceId, observability } = routeDeps;
  if (!contentKernel || observability.supportsMetric !== true) return {};
  return { queueMetrics: {
    readDepth: () => readOutboxQueueDepth({ store: contentKernel, workspaceId }),
    metric: (required, optional) => observability.metric(required, optional),
  } };
}

/**
 * Builds the site app and starts its background loops.
 *
 * @param routeDeps the serving process's composed deps; its `outbox`/`bus`/`clock` feed the
 *   drainer, and its pre-bound `sweepTrash` feeds the sweeper.
 * @param optional.outboxDrainIntervalMs idle wait between drains (default: the drainer's own).
 * @param optional.trashSweepIntervalMs idle wait between sweeps (default: the sweeper's own hour).
 * @param optional.webhookDeliveryIntervalMs idle wait between webhook delivery ticks (default: the worker's own 15 s).
 * @param optional.domainBindingSweepIntervalMs idle wait between due-bindings DNS sweeps (default: the sweeper's own minute).
 * @param optional.dbFreePages binds the P11 ST-7c.T free-page reclaim (absent by default: nothing is scheduled).
 * @returns the Express app, background handles (stop all at shutdown; `formPullTrigger.stop` and
 *   `siteSearchMaintenance.stop` wait for a running pass), and
 *   `bootWork`: the background passes `createApp` started and returned before they finished
 *   (`CreateAppOptions.onBootWork`). A caller that closes the store awaits these first.
 *   `releaseOnShutdown`: runs every process-local release `createApp` handed out
 *   (`CreateAppOptions.onShutdown`, the parked AG-UI approvals); the host calls it when it stops.
 * @complexity O(1) beyond `createApp`.
 */
export function createServingApp(
  routeDeps: NonNullable<Parameters<typeof createApp>[0]>,
  optional: { runningLease?: ReturnType<typeof claimSiteRunning>; stopForIdle?: CreateAppOptions["stopForIdle"]; outboxDrainIntervalMs?: number; trashSweepIntervalMs?: number; webhookDeliveryIntervalMs?: number; domainBindingSweepIntervalMs?: number; dbFreePages?: (signal: AbortSignal) => FreePagesWork | undefined; routines?: { desktopEligible: boolean; releaseEnabled: boolean; runStarter?: RoutineRunHandler } } = {}
): { routines: ServingRoutines; siteRetention?: ReturnType<typeof startSiteRetention>; app: Express; outboxDrainer: OutboxDrainer; trashSweeper: TrashSweeper; themeWatcher: ReturnType<typeof startThemeWatcher>; formPullTrigger: { stop(): Promise<void> }; postGoLiveSweep: { stop(): Promise<void> }; webhookDeliveryWorker: WebhookDeliveryWorker; domainBindingSweeper: DomainBindingSweeper; siteSearchMaintenance: SiteSearchMaintenance; bootWork: Promise<void>[]; releaseOnShutdown: () => void } {
  const reportRetentionError = ({ error }: { error: Error }, _optional: Record<string, never>) => console.warn(formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
  // Exporter, daemon, attached serve and memory-only roots do not own this runner.
  const siteRetention = optional.runningLease && !optional.runningLease.attached
    ? startSiteRetention({
      createRunner: createRetentionRunner, clock: Date, scheduler: globalThis,
      policiesForSignal: signal => siteRetentionPolicies({ registry: routeDeps.siteShareBackend?.registry, fs: { stat, unlink }, clock: { now: () => routeDeps.clock.nowMs() }, signal, reportError: reportRetentionError, databaseCopies: servingDatabaseCopies({ contentDbPath: routeDeps.siteStoragePaths.contentDbPath }) }),
      // Report-only (P11 ST-11b.T): the media-bytes policy measures on every pass and has no sweep.
      reportOnlyForSignal: signal => routeDeps.contentKernel === undefined ? [] : [createMediaBytesPolicy(mediaBytesDeps({ workspaceId: routeDeps.workspaceId, kernel: routeDeps.contentKernel as KyselyKernel<unknown>, mediaRepo: routeDeps.mediaRepo, blobStore: routeDeps.blobStore, clock: routeDeps.clock, signal, shareTransfers: routeDeps.siteShareBackend, recoveryArtifacts: servingRecoveryArtifacts({ restorePoints: routeDeps.restorePointsRepo, contentDbPath: routeDeps.siteStoragePaths.contentDbPath }, {}) }, {}), {})],
      // P11 ST-7c.T, staged dark: the free-page reclaim runs only when the host binds `dbFreePages`, which no
      // entrant does until G1–G3 clear. It gets its own schedule; the general runner stays measure-only.
      freePagesForSignal: optional.dbFreePages,
      reportError: reportRetentionError,
      log: line => console.log(line),
    }, {})
    : undefined;
  const siteStorage: SiteStoragePort | undefined = siteRetention && {
    measure: () => measureSiteStorage({ siteDir: routeDeps.siteBinding.dir, paths: servingStoragePaths({ siteDir: routeDeps.siteBinding.dir, ...routeDeps.siteStoragePaths, themesDir: routeDeps.themesDir }) }),
    runOnce: siteRetention.runOnce, lastPass: siteRetention.lastReport,
    // One grant store for the HTTP cleanup route and the assistant tool (Codex FIX 5).
    cleanupPreviews: createCleanupPreviewStore({ randomToken: ({ bytes }) => randomBytes(bytes).toString("base64url"), mono: () => performance.now() }),
  };
  const bootWork: Promise<void>[] = [];
  const shutdownReleases: Array<() => void> = [];
  const formPull = createServingFormPullTrigger({ autoPull: routeDeps.formSubmissionsAutoPull, workspaceId: routeDeps.workspaceId });
  // Routines (P3-T1a.T): the slot is placed inside createApp's admin routes; the host composes into it
  // after createApp returns. Absent `optional.routines` (tests, hermetic roots) means ineligible and dark.
  const routineRouter = Router();
  // The routines handle exists only after createApp returns, so chat repair waits on a deferred barrier:
  // only when routines can run at all, and then only while this boot's routine lease owner is interrupting.
  let bindRoutines: (ready: ServingRoutines["ready"]) => void = () => {};
  const routinesReady = new Promise<ServingRoutines["ready"]>((resolve) => { bindRoutines = resolve; });
  const routinesCanRun = (optional.routines?.desktopEligible ?? false) && (optional.routines?.releaseEnabled ?? false);
  const assistantRoutineBoot = { isLeaseOwner: () => routinesCanRun, whenInterrupted: async () => {
    await routinesReady;
  } };
  const errors = { reporter: siteFailureReporter({ routeDeps }, {}), observability: NO_OPERATION_TRACKING };
  const app = createApp(routeDeps, { errorReporter: errors.reporter, assistantRoutineBoot, stopForIdle: optional.stopForIdle, activateAssistantFederation: true, recoverAssistantChatRuns: true, onBootWork: ({ work }) => bootWork.push(work), onAdminSignIn: formPull.signIn,
    ...(siteStorage ? { siteStorage } : {}),
    onShutdown: ({ shutdown }) => { shutdownReleases.push(shutdown); },
    mountAssistantRoutines: ({ app: routed }) => { routed.use(routineRouter); },
    // Lazy: the handle composes after createApp returns, so the tools resolve it per call (P3-T4.T / T3.T).
    ...servingRoutineToolOptions({ canRun: routinesCanRun, releaseEnabled: optional.routines?.releaseEnabled ?? false,
      ready: () => routinesReady.then((ready) => ready), access: ownerAccessFor(routeDeps), workspaceId: routeDeps.workspaceId },
      routeDeps.settingsRepo ? { localeFor: settingsLocaleFor({ settingsRepo: routeDeps.settingsRepo, workspaceId: routeDeps.workspaceId }) } : {}) });
  // `siteFailureReporter` is memoized per routeDeps, so routines record through the reporter `createApp` bound above.
  const routines = startServingRoutines({ routeDeps, errors, router: routineRouter, desktopEligible: optional.routines?.desktopEligible ?? false,
    releaseEnabled: optional.routines?.releaseEnabled ?? false, reporter: errors.reporter }, optional.routines?.runStarter ? { runStarter: optional.routines.runStarter } : { acceptanceDeps: routeDeps });
  bindRoutines(routines.ready);
  const outboxDrainer = startOutboxDrainer(
    { outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock },
    { intervalMs: optional.outboxDrainIntervalMs, tracker: routeDeps.tracker, ...outboxQueueMetrics({ routeDeps }) }
  );
  // Unlike the drainer, the sweeper has no ordering dependency on `createApp` — it reads and writes
  // only `trashed_items` and the domain markers, and publishes nothing onto the bus. It starts here
  // anyway, and only here, for the other half of the drainer's reason: this is the one process pair
  // that serves a site. A sweep in the exporter or the agent daemon would hard-delete a site's rows
  // from a process nobody is watching, on a schedule nobody set.
  const trashSweeper = startTrashSweeper(
    {
      sweep: (...args) => routeDeps.tracker.trace({ name: "trash.purge", run: () => routeDeps.sweepTrash(...args) }), clock: { nowMs: () => Date.parse(routeDeps.clock.nowIso()) },
      scheduler: createTrashScheduler({}), leaseOwner: `trash-sweeper-${randomUUID()}`
    },
    {
      intervalMs: optional.trashSweepIntervalMs,
      onError: ({ error }) => console.error("[trash-sweeper] sweep failed; retrying after the idle interval", error)
    }
  );
  const candidates = routeDeps.postGoLiveCandidates;
  const postGoLiveSweep = candidates
    ? startPostGoLiveSweep({ deps: { repo: candidates, outbox: routeDeps.outbox, clock: routeDeps.clock }, workspaceId: routeDeps.workspaceId,
      onError: ({ error }) => console.error("[post-go-live-sweep] sweep failed; retrying after the idle interval", error) }, { tracker: routeDeps.tracker })
    : { stop: async () => {} };
  const themeWatcher = startThemeWatcher({ themesDir: routeDeps.themesDir, refresh: ({ themesDir }) => refreshWatchedThemes({ themes: routeDeps.themes, themesDir }) });
  const webhookDeliveryWorker = startServingWebhookDeliveryWorker(
    { deps: routeDeps },
    optional.webhookDeliveryIntervalMs === undefined ? {} : { intervalMs: optional.webhookDeliveryIntervalMs }
  );
  const verifyDue = routeDeps.verifyDueDomainBindings;
  const domainBindingSweeper = startDomainBindingSweeper(
    { sweep: verifyDue && ((input) => routeDeps.tracker.trace({ name: "domain.bindings.sweep", run: () => verifyDue(input) })), scheduler: nodeWebhookDeliveryScheduler, logger: consoleLogger },
    optional.domainBindingSweepIntervalMs === undefined ? {} : { intervalMs: optional.domainBindingSweepIntervalMs }
  );
  // After `createApp`: the pulled submissions' events need their subscribers attached.
  formPull.pullNow();
  // Site search upkeep (reconcile + resumable backfill, and the boot rebuild for a site with no index
  // yet). Serving-only for the sweeper's reason: it writes to search backends on a schedule, which only
  // the process serving the site may do. A no-op handle when the composition has no search runtime.
  const siteSearchMaintenance = startSiteSearchMaintenance({ runtime: routeDeps.siteSearch });
  return { app, routines, siteRetention, outboxDrainer, trashSweeper, themeWatcher, formPullTrigger: { stop: formPull.stop }, postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance, bootWork,
    releaseOnShutdown: () => { for (const release of shutdownReleases) release(); } };
}
