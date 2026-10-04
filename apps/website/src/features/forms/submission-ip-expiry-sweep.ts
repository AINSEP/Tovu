import * as forms from "@jini-ai/cms-forms";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { createSubmissionIpRetentionRepo } from "./submission-ip-retention-repo.js";
import type { SubmissionIpSweep } from "./submission-ip-retention-port.js";

/** Daily after the boot pass; the 90-day policy constant belongs solely to Jini. */
export const SUBMISSION_IP_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function warn(error: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[submission-ip-expiry-sweep] sweep failed: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * Same lifecycle shape as chat-expiry-sweep: boot, unref'd interval, skip overlapping ticks,
 * and stop/wait before closing the store. The package capability gate permits an independent
 * upstream release; it never imports an unpublished named export or a local Jini source file.
 */
export function startSubmissionIpExpirySweep(
  { kernel, sweep: suppliedSweep }: { kernel: ContentKernel; sweep?: SubmissionIpSweep },
  options: { intervalMs?: number; now?: () => number; onError?: (error: unknown) => void } = {},
): () => Promise<void> {
  const { intervalMs = SUBMISSION_IP_SWEEP_INTERVAL_MS, now = Date.now, onError = warn } = options;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new RangeError("submission IP sweep interval must be positive");
  const report = (error: unknown): void => {
    try { onError(error); } catch { /* A logging failure cannot reject timer work. */ }
  };
  const candidate: unknown = suppliedSweep ?? Reflect.get(forms, "sweepExpiredSubmissionIps");
  if (typeof candidate !== "function") {
    report(new Error("disabled: published @jini-ai/cms-forms has no sweepExpiredSubmissionIps export; release/install Jini retention support"));
    return async () => {};
  }
  const sweep = candidate as SubmissionIpSweep;
  const repo = createSubmissionIpRetentionRepo({ kernel });
  let active: Promise<void> | undefined;
  let stopped = false;
  const run = async (): Promise<void> => {
    try { await sweep({ now: now(), repo }); } catch (error) { report(error); }
  };
  const pass = (): void => {
    if (stopped || active !== undefined) return;
    active = run().finally(() => { active = undefined; });
  };
  pass();
  const timer = setInterval(pass, intervalMs);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
