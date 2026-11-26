import { lstat, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { createRetentionRunner, RetentionPolicy } from "@jini-ai/platform/retention";
import { selectDatabaseCopiesToPrune } from "@jini-ai/db/sqlite";
import { siteMigrationCopyPorts } from "#src/platform/db/sqlite/content-db";
import { defaultDatabaseJournalDbPath } from "./site-paths.js";

type RetentionReport = Awaited<ReturnType<ReturnType<typeof createRetentionRunner>["runOnce"]>>;
/** A policy the host only measures, on dry AND live passes: it has no `sweep` to call. */
export type ReportOnlyRetentionPolicy = Pick<RetentionPolicy, "id" | "kind" | "measure">;
type ReportErrorHook = (required: { error: Error; policyId?: string }, optional: Record<string, never>) => void;

/**
 * Append each report-only policy's measurement to a completed pass. These policies stay outside the
 * engine runner because a live pass there would call `sweep()`; here a live pass can only measure.
 * A failure is reported in plain words with the policy id, like the runner does, and the next one runs.
 * @complexity O(report-only policies), one measure at a time.
 */
async function withReportOnly(
  required: { value: RetentionReport; policies: readonly ReportOnlyRetentionPolicy[]; reportError: ReportErrorHook },
  _optional: Record<string, never> = {},
): Promise<RetentionReport> {
  const { value, policies, reportError } = required;
  if (value.status !== "completed" || policies.length === 0) return value;
  const extra: Array<Extract<RetentionReport, { status: "completed" }>["policies"][number]> = [];
  for (const { id, kind, measure } of policies) {
    try {
      extra.push({ id, kind, status: "measured", measurement: await measure() });
    } catch (cause) {
      reportError({ error: new Error(`Storage report for ${id} could not be measured.`, { cause }), policyId: id }, {});
      extra.push({ id, kind, status: "failed", message: "This storage report could not be measured." });
    }
  }
  return { ...value, policies: [...value.policies, ...extra] };
}
import type { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import fsPromises from "node:fs/promises";
import { sweepOwnedTempRoots } from "@jini-ai/platform/fs";
import { SITE_TEMP_ROOTS, siteTempRootLock } from "#src/platform/temp/site-temp-roots";
import { createSiteTempRootPolicy } from "./retention-policies/temp-roots.js";
import { createShareMutex, createShareRetention, type ShareRetentionFs } from "#src/features/site-backup/share-retention";
import { createDatabaseCopyPolicy, type DatabaseCopyPolicyRequired } from "./retention-policies/database-copies.js";

/** One bounded free-page pass (`createDbFreePagesPolicy`): `run` steps, `drain` awaits the step in flight. */
export interface FreePagesWork { run(): Promise<unknown>; drain(): Promise<void> }
type RetentionScheduler = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

/**
 * The free-page reclaim's own schedule (P11 ST-7c.T). It holds only `work`, never the general runner or its
 * policies, so a tick cannot start another policy or make the measure-only general pass live. One pass at a
 * time; a tick during a pass is skipped. `stop` waits for the pass, then drains, before SQLite may close.
 * @complexity O(1) per tick; the work bounds its own steps.
 */
function startFreePageSchedule(
  { work, scheduler, signal, reportError }: { work: FreePagesWork; scheduler: RetentionScheduler; signal: AbortSignal; reportError: ReportErrorHook },
  { delayMs, intervalMs }: { delayMs: number; intervalMs: number },
) {
  let timer: unknown;
  let interval: unknown;
  let inFlight: Promise<void> | undefined;
  const tick = () => {
    if (inFlight || signal.aborted) return;
    inFlight = work.run().then(() => undefined, (cause: unknown) => {
      reportError({ error: new Error("Free-page reclaim could not finish.", { cause }), policyId: "db-free-pages" }, {});
    }).finally(() => { inFlight = undefined; });
  };
  return {
    start() {
      timer = scheduler.setTimeout(() => { tick(); interval = scheduler.setInterval(tick, intervalMs); }, delayMs);
    },
    async stop() {
      scheduler.clearTimeout(timer);
      scheduler.clearInterval(interval);
      await inFlight;
      await work.drain();
    },
  };
}

export function startSiteRetention(
  { createRunner, policiesForSignal, reportOnlyForSignal, freePagesForSignal, clock, scheduler, reportError, log }: {
    createRunner: typeof createRetentionRunner;
    policiesForSignal: (signal: AbortSignal) => Parameters<typeof createRetentionRunner>[0]["policies"];
    reportOnlyForSignal?: (signal: AbortSignal) => readonly ReportOnlyRetentionPolicy[];
    /** Off unless supplied: the free-page reclaim, on its own schedule and never through the general runner. */
    freePagesForSignal?: (signal: AbortSignal) => FreePagesWork | undefined;
    clock: Parameters<typeof createRetentionRunner>[0]["clock"];
    scheduler: RetentionScheduler;
    reportError: ReportErrorHook;
    log: (line: string) => void;
  },
  { bootDelayMs = 300000, intervalMs = 86400000, scheduledDryRun = true, freePagesDelayMs = 600000, freePagesIntervalMs = 86400000 } = {},
) {
  const controller = new AbortController();
  let report: RetentionReport | undefined;
  let reported: Promise<RetentionReport> | undefined;
  let timer: unknown;
  const reportOnly = reportOnlyForSignal?.(controller.signal) ?? [];
  const freePagesWork = freePagesForSignal?.(controller.signal);
  const freePages = freePagesWork && startFreePageSchedule({ work: freePagesWork, scheduler, signal: controller.signal, reportError }, { delayMs: freePagesDelayMs, intervalMs: freePagesIntervalMs });
  let ready = false;
  const runner = createRunner({
    policies: policiesForSignal(controller.signal), clock, scheduler,
    reportError: (error, { policyId }) => reportError({ error, policyId }, {}),
  }, { intervalMs, scheduledDryRun, onReport: value => {
    reported = withReportOnly({ value, policies: reportOnly, reportError }, {}).then(full => {
      report = full;
      log(`[storage-retention] ${JSON.stringify(full)}`);
      return full;
    });
  } });
  return {
    listenerReady() {
      if (ready || controller.signal.aborted) return;
      ready = true;
      timer = scheduler.setTimeout(() => runner.start(), bootDelayMs);
      freePages?.start();
    },
    async runOnce(input: Parameters<typeof runner.runOnce>[0]): Promise<RetentionReport> {
      const result = await runner.runOnce(input);
      return result.status === "completed" && reported ? await reported : result;
    },
    lastReport: () => report,
    async stop() {
      scheduler.clearTimeout(timer);
      controller.abort();
      await runner.stop();
      await reported;
      // Last before the caller closes the store: no free-page pragma may run on a closing connection.
      await freePages?.stop();
    },
  };
}

/**
 * The serving process's retention policies, all kind `old-copy` (never a content class): the share
 * expiry pass (`share-files`, only when this site has a share catalog), the verified pre-migration
 * copy pass (`database-copies`, only when the host supplies its ports) and always the owned temp-root
 * tidy (`temp-roots`) over the same resolved parent and prefixes the writers use. Scheduled passes stay
 * measure-only (`scheduledDryRun: true`); a sweep expires nothing but links whose owner chose a date,
 * copies beyond the newest five behind a verified newest copy, and temporary roots whose owning
 * process is proven dead.
 */
export function siteRetentionPolicies(
  required: { registry: SiteShareRegistry | undefined; fs: ShareRetentionFs; clock: { now(): number }; signal: AbortSignal; reportError: (required: { error: Error; policyId?: string }, optional: Record<string, never>) => void; databaseCopies?: Omit<DatabaseCopyPolicyRequired, "signal"> },
  _optional: Record<string, never> = {},
): RetentionPolicy[] {
  const { registry, fs, clock, signal, reportError, databaseCopies } = required;
  const policies: RetentionPolicy[] = [];
  if (registry) policies.push(createShareRetention({ registry, shareMutex: createShareMutex({}), fs, clock, signal,
    reportError: ({ error }, {}) => reportError({ error, policyId: "share-files" }, {}) }));
  if (databaseCopies) policies.push(createDatabaseCopyPolicy({ ...databaseCopies, signal }));
  policies.push(createSiteTempRootPolicy({ roots: SITE_TEMP_ROOTS, sweepOwnedTempRoots, fs: fsPromises, fileLock: siteTempRootLock, signal }));
  return policies;
}

/**
 * The real `database-copies` ports for a file-backed site: its `ops/` folder, the process copy
 * coordinator (shared with boot migration and `dbOps`), read-only quick_check and journal protection.
 * @complexity O(1); the returned ports do the I/O.
 */
export function servingDatabaseCopies(
  { contentDbPath }: { contentDbPath: string },
  _optional: Record<string, never> = {},
): Omit<DatabaseCopyPolicyRequired, "signal"> | undefined {
  if (contentDbPath === ":memory:") return undefined;
  const { copies, verify, listProtected } = siteMigrationCopyPorts({ filePath: contentDbPath }, { journalPath: defaultDatabaseJournalDbPath({}, { contentDbPath }) });
  return { opsDirs: [path.join(path.dirname(path.resolve(contentDbPath)), "ops")], verify, listProtected, mutex: copies,
    fs: { readdir, lstat, unlink }, selectCopies: selectDatabaseCopiesToPrune };
}
