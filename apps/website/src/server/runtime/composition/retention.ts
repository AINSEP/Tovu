import { lstat, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { createRetentionRunner, RetentionPolicy } from "@jini-ai/platform/retention";
import { selectDatabaseCopiesToPrune } from "@jini-ai/db/sqlite";
import { siteMigrationCopyPorts } from "#src/platform/db/sqlite/content-db";
import { defaultDatabaseJournalDbPath } from "./site-paths.js";
import type { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { createShareMutex, createShareRetention, type ShareRetentionFs } from "#src/features/site-backup/share-retention";
import { createDatabaseCopyPolicy, type DatabaseCopyPolicyRequired } from "./retention-policies/database-copies.js";

export function startSiteRetention(
  { createRunner, policiesForSignal, clock, scheduler, reportError, log }: {
    createRunner: typeof createRetentionRunner;
    policiesForSignal: (signal: AbortSignal) => Parameters<typeof createRetentionRunner>[0]["policies"];
    clock: Parameters<typeof createRetentionRunner>[0]["clock"];
    scheduler: {
      setTimeout(callback: () => void, ms: number): unknown;
      clearTimeout(handle: unknown): void;
      setInterval(callback: () => void, ms: number): unknown;
      clearInterval(handle: unknown): void;
    };
    reportError: (required: { error: Error; policyId?: string }, optional: Record<string, never>) => void;
    log: (line: string) => void;
  },
  { bootDelayMs = 300000, intervalMs = 86400000, scheduledDryRun = true } = {},
) {
  const controller = new AbortController();
  let report: Awaited<ReturnType<ReturnType<typeof createRetentionRunner>["runOnce"]>> | undefined;
  let timer: unknown;
  let ready = false;
  const runner = createRunner({
    policies: policiesForSignal(controller.signal), clock, scheduler,
    reportError: (error, { policyId }) => reportError({ error, policyId }, {}),
  }, { intervalMs, scheduledDryRun, onReport: value => {
    report = value;
    log(`[storage-retention] ${JSON.stringify(value)}`);
  } });
  return {
    listenerReady() {
      if (ready || controller.signal.aborted) return;
      ready = true;
      timer = scheduler.setTimeout(() => runner.start(), bootDelayMs);
    },
    runOnce: runner.runOnce,
    lastReport: () => report,
    async stop() {
      scheduler.clearTimeout(timer);
      controller.abort();
      await runner.stop();
    },
  };
}

/**
 * The serving process's retention policies, both kind `old-copy` (never a content class): the share
 * expiry pass (`share-files`, only when this site has a share catalog) and the verified pre-migration
 * copy pass (`database-copies`, only when the host supplies its ports). Scheduled passes stay
 * measure-only (`scheduledDryRun: true`); a sweep expires nothing but links whose owner chose a date and
 * copies beyond the newest five behind a verified newest copy.
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
