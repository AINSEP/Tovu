import type { createRetentionRunner, RetentionPolicy } from "@jini-ai/platform/retention";
import type { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { createShareMutex, createShareRetention, type ShareRetentionFs } from "#src/features/site-backup/share-retention";

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
 * The serving process's retention policies: today only the share expiry pass (`share-files`, kind
 * `old-copy` — never a content class), and only when this site has a share catalog. Scheduled passes stay
 * measure-only (`scheduledDryRun: true`); a sweep expires nothing but links whose owner chose a date.
 */
export function siteRetentionPolicies(
  required: { registry: SiteShareRegistry | undefined; fs: ShareRetentionFs; clock: { now(): number }; signal: AbortSignal; reportError: (required: { error: Error; policyId?: string }, optional: Record<string, never>) => void },
  _optional: Record<string, never> = {},
): RetentionPolicy[] {
  const { registry, fs, clock, signal, reportError } = required;
  if (!registry) return [];
  return [createShareRetention({ registry, shareMutex: createShareMutex({}), fs, clock, signal,
    reportError: ({ error }, {}) => reportError({ error, policyId: "share-files" }, {}) })];
}
