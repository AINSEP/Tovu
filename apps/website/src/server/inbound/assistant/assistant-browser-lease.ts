/** The daemon's one browser integration (Claude in Chrome) is shared by every site scope it hosts, so
 * a run claims it before launching with the integration and gives it back on every way a run ends.
 * A scope built without a lease (tests only: the daemon server always passes one) is not limited.
 * Both calls are pure over the lease port. */
import type { ExclusiveRunLease } from "@jini-ai/daemon/exclusive-run-lease";

/** True when this run may use the browser integration. Asking again as the holder is granted. */
export function claimBrowserForRun({ lease, runId }: { lease: ExclusiveRunLease | undefined; runId: string }, _optional = {}): boolean {
  return lease === undefined || lease.acquire({ runId }).granted;
}

/** Idempotent; a run that never held the lease changes nothing. */
export function releaseBrowserForRun({ lease, runId }: { lease: ExclusiveRunLease | undefined; runId: string }, _optional = {}): void {
  lease?.release({ runId });
}

/** A run's end-of-run release that also gives the browser back, so the one release call the scope
 * already makes on every terminal record covers the lease too. */
export function releasingBrowserToo({ release, lease, runId }: { release: () => void; lease: ExclusiveRunLease | undefined; runId: string }, _optional = {}): () => void {
  return () => { release(); releaseBrowserForRun({ lease, runId }); };
}
