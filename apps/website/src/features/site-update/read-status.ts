/**
 * @file The admin status read behind the site-update notice: running version plus one feed compare.
 * It answers availability only. A failure is reported server-side and the reply says `check-failed`,
 * because the feed URL and upstream messages may carry credentials.
 */
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { checkForUpdateFromFeed } from "@jini-ai/devops/deploy";
import type { SiteUpdateRuntime } from "./tools.js";

/** The read ports only: a read route gets only read ports so a future UI change cannot accidentally install an update. */
export type SiteUpdateStatusPorts = Pick<SiteUpdateRuntime, "runningVersion" | "feed" | "ids">;

export interface ReadSiteUpdateStatusRequired {
  runtime: SiteUpdateStatusPorts | null;
  /** Receives the raw error only; the binder adds a fixed operation label and redacts before any sink. */
  reportFailure: (required: { error: unknown }, optional?: Record<string, never>) => void;
}

/**
 * -> `unavailable` without I/O when no platform can update; otherwise `current`/`available`, or
 * `check-failed` when either read fails. A cancelled read rejects with its cancellation.
 * @complexity One version read plus one feed request.
 */
export async function readSiteUpdateStatus(
  required: ReadSiteUpdateStatusRequired,
  _optional: { signal?: AbortSignal | undefined } = {},
): Promise<SiteUpdateStatusReply> {
  const { runtime } = required;
  if (runtime === null) return { availability: { kind: "unavailable" } };
  try {
    const runningVersion = await runtime.runningVersion();
    const update = await checkForUpdateFromFeed({ runningVersion, feed: runtime.feed }, { signal: _optional.signal, ids: runtime.ids });
    if (update === null) return { availability: { kind: "current", runningVersion } };
    return { availability: { kind: "available", runningVersion, latest: update.latest, notes: update.notes } };
  } catch (error) {
    // A cancelled request is the caller's decision, not a failed check: it is neither reported nor answered.
    if (_optional.signal?.aborted) throw error;
    required.reportFailure({ error });
    return { availability: { kind: "check-failed" } };
  }
}
