/**
 * @file The admin status read behind the site-update notice: running version plus one feed compare.
 * It answers availability only. A failure is reported server-side and the reply says `check-failed`,
 * because the feed URL and upstream messages may carry credentials. When the host has a journal reader, the last
 * update attempt rides along, read independently of the feed so pending and settled state survive a reconnect.
 */
import type { SiteUpdateStatusReply } from "@jini-ai/core/contracts/site/devops-deploy";
import { checkForUpdateFromFeed, type SiteUpdateCallOptions } from "@jini-ai/devops/deploy";
import type { SiteUpdateCheckRuntime } from "./tools.js";

/** The read ports only: a read route gets only read ports so a future UI change cannot accidentally install an update. */
export type SiteUpdateStatusPorts = Pick<SiteUpdateCheckRuntime, "runningVersion" | "feed" | "ids">;

export interface ReadSiteUpdateStatusRequired {
  runtime: SiteUpdateStatusPorts | null;
  /** Receives the raw error only; the binder adds a fixed operation label and redacts before any sink. */
  reportFailure: (required: { error: unknown }, optional?: Record<string, never>) => void;
  /** Read-only journal read of the last attempt. Absent (no journal on this host) means the reply has no `lastAttempt`. */
  readLastAttempt?: ((required: Record<string, never>, optional?: SiteUpdateCallOptions) => Promise<SiteUpdateStatusReply["lastAttempt"]>) | undefined;
}

/**
 * -> `unavailable` without I/O when no platform can update; otherwise `current`/`available`, or
 * `check-failed` when either read fails, plus `lastAttempt` when a journal reader is bound and has one.
 * A cancelled read rejects with its cancellation.
 * @complexity One version read plus one feed request, alongside at most one journal read.
 */
export async function readSiteUpdateStatus(
  required: ReadSiteUpdateStatusRequired,
  _optional: { signal?: AbortSignal | undefined } = {},
): Promise<SiteUpdateStatusReply> {
  const { runtime } = required;
  if (runtime === null) return { availability: { kind: "unavailable" } };
  // Read independently: a failing feed must not hide an update that is pending or just settled.
  const [availability, lastAttempt] = await Promise.all([readAvailability({ ...required, runtime }, _optional), readSafeLastAttempt(required, _optional)]);
  return lastAttempt === undefined ? { availability } : { availability, lastAttempt };
}

async function readAvailability(required: ReadSiteUpdateStatusRequired & { runtime: SiteUpdateStatusPorts }, _optional: { signal?: AbortSignal | undefined } = {}): Promise<SiteUpdateStatusReply["availability"]> {
  const { runtime } = required;
  try {
    const runningVersion = await runtime.runningVersion();
    const update = await checkForUpdateFromFeed({ runningVersion, feed: runtime.feed }, { signal: _optional.signal, ids: runtime.ids });
    if (update === null) return { kind: "current", runningVersion };
    return { kind: "available", runningVersion, latest: update.latest, notes: update.notes };
  } catch (error) {
    // A cancelled request is the caller's decision, not a failed check: it is neither reported nor answered.
    if (_optional.signal?.aborted) throw error;
    required.reportFailure({ error });
    return { kind: "check-failed" };
  }
}

/** -> only the safe projection (status, versions, summary): no journal internals, paths, credentials or upstream messages. */
async function readSafeLastAttempt({ readLastAttempt, reportFailure }: ReadSiteUpdateStatusRequired, _optional: { signal?: AbortSignal | undefined } = {}): Promise<SiteUpdateStatusReply["lastAttempt"]> {
  if (!readLastAttempt) return undefined;
  try {
    const attempt = await readLastAttempt({}, { signal: _optional.signal });
    return attempt && { status: attempt.status, toVersion: attempt.toVersion, summary: attempt.summary };
  } catch (error) {
    if (_optional.signal?.aborted) throw error;
    reportFailure({ error });
    return undefined;
  }
}
