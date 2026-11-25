import type { createRetentionRunner } from "@jini-ai/platform/retention";

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
