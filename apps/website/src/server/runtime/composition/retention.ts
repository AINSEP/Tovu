import type { createRetentionRunner, RetentionPolicy } from "@jini-ai/platform/retention";

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
import { createShareMutex, createShareRetention, type ShareRetentionFs } from "#src/features/site-backup/share-retention";

export function startSiteRetention(
  { createRunner, policiesForSignal, reportOnlyForSignal, clock, scheduler, reportError, log }: {
    createRunner: typeof createRetentionRunner;
    policiesForSignal: (signal: AbortSignal) => Parameters<typeof createRetentionRunner>[0]["policies"];
    reportOnlyForSignal?: (signal: AbortSignal) => readonly ReportOnlyRetentionPolicy[];
    clock: Parameters<typeof createRetentionRunner>[0]["clock"];
    scheduler: {
      setTimeout(callback: () => void, ms: number): unknown;
      clearTimeout(handle: unknown): void;
      setInterval(callback: () => void, ms: number): unknown;
      clearInterval(handle: unknown): void;
    };
    reportError: ReportErrorHook;
    log: (line: string) => void;
  },
  { bootDelayMs = 300000, intervalMs = 86400000, scheduledDryRun = true } = {},
) {
  const controller = new AbortController();
  let report: RetentionReport | undefined;
  let reported: Promise<RetentionReport> | undefined;
  let timer: unknown;
  const reportOnly = reportOnlyForSignal?.(controller.signal) ?? [];
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
