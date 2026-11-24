import { createSubmissionIpRetentionRepo } from "#src/features/forms/submission-ip-retention";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import * as forms from "@jini-ai/cms/forms";
import {
  assertSubmissionIpSweepInterval,
  startSubmissionIpExpirySweep as startSweepRunner,
  SUBMISSION_IP_SWEEP_INTERVAL_MS,
  type SubmissionIpSweep,
} from "@jini-ai/cms/forms/site/submission-ip-expiry-sweep";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
const consoleLogger = createConsoleLogger({ prefix: "" });

function warn({ error }: { error: unknown }, _optional = {}): void {
  consoleLogger.warn({ message: `[submission-ip-expiry-sweep] sweep failed: ${error instanceof Error ? error.message : String(error)}` });
}

/**
 * Host binding of `@jini-ai/cms/forms/site/submission-ip-expiry-sweep`: binds this site's kernel
 * repo and labelled warning. The package capability gate permits an independent upstream release;
 * it never imports an unpublished named export or a local Jini source file.
 */
export function startSubmissionIpExpirySweep(
  { kernel, sweep: suppliedSweep }: { kernel: ContentKernel; sweep?: SubmissionIpSweep },
  options: { intervalMs?: number; now?: () => number; onError?: (required: { error: unknown }) => void } = {},
): () => Promise<void> {
  const { intervalMs = SUBMISSION_IP_SWEEP_INTERVAL_MS, now = Date.now, onError = warn } = options;
  assertSubmissionIpSweepInterval({ intervalMs });
  const candidate: unknown = suppliedSweep ?? Reflect.get(forms, "sweepExpiredSubmissionIps");
  if (typeof candidate !== "function") {
    try {
      onError({ error: new Error("disabled: published @jini-ai/cms-forms has no sweepExpiredSubmissionIps export; release/install Jini retention support") });
    } catch { /* A logging failure cannot reject timer work. */ }
    return async () => {};
  }
  return startSweepRunner({ repo: createSubmissionIpRetentionRepo({ kernel }), sweep: candidate as SubmissionIpSweep, onError }, { intervalMs, now });
}
