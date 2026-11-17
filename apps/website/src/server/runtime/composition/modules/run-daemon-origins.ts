import { isProcessAlive } from "@jini-ai/sidecar";

import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";
import { assistantDaemonToken, previousAssistantDaemonConnection } from "../../lifecycle/assistant-daemon-connection.js";

/**
 * @file Which daemon process holds a run: the previous site's daemon, which can outlive an API
 * boot, or the current one. Owns the per-run pin of endpoint and capability. The two snapshots
 * it starts from (`previous`, `initialToken`) are taken by the HTTP client's constructor, before
 * the replacement daemon publishes; this module only reads them.
 */

export interface RunDaemonAddress { url: string; token: string | undefined; pid?: number }
interface PinnedRun { readonly runId: string; readonly principalId: string }
/** The prior daemon's registry record as snapshotted at construction, or why reading it failed. */
export type PreviousDaemonSnapshot = Promise<{ record: { url: string; pid: number; token?: string } | null } | { error: unknown }> | undefined;
export type RunDaemonOrigins = ReturnType<typeof createRunDaemonOrigins>;

/** @complexity O(1) per lookup; O(w) retained addresses for w active run/principal watches. */
export function createRunDaemonOrigins(
  { previous, initialToken }: { previous: PreviousDaemonSnapshot; initialToken: string | undefined },
  optional: { isAlive?: (required: { pid: number }) => boolean; currentUrl?: () => string } = {},
) {
  const current = (): RunDaemonAddress => ({ url: (optional.currentUrl ?? getAgentDaemonUrl)(), token: assistantDaemonToken({}, {}) });
  async function origin(): Promise<RunDaemonAddress> {
    const result = await previous;
    if (result && "error" in result) throw result.error;
    const record = result?.record ?? previousAssistantDaemonConnection({}, {});
    if (record && (optional.isAlive ?? isProcessAlive)({ pid: record.pid })) return { url: record.url, token: record.token ?? initialToken, pid: record.pid };
    return current();
  }
  // Retain endpoint AND capability per run; a fallback for one principal must not redirect
  // another run to a replacement scope or pair its old URL with the replacement credential.
  const replayOrigins = new Map<string, RunDaemonAddress>();
  const replayKey = ({ runId, principalId }: PinnedRun, _optional = {}) => JSON.stringify([principalId, runId]);
  /** Keep a live owner's URL/capability together, but never reuse a known-dead owner's port.
   * A prior daemon can outlive the API boot, so a new current URL alone is no reason to switch.
   * @complexity O(1) lookup and process probe; no new daemon is started.
   */
  async function replayOrigin(required: PinnedRun, _options = {}): Promise<RunDaemonAddress> {
    const key = replayKey(required);
    const address = replayOrigins.get(key);
    if (address && (address.pid === undefined || (optional.isAlive ?? isProcessAlive)({ pid: address.pid }))) return address;
    replayOrigins.delete(key);
    return origin();
  }
  /** A timed-out probe can resolve after watch cleanup. Never let it retain a retired capability.
   * @complexity O(1) time/space per still-live probe; the owning watch releases its map entry. */
  function retainLive(
    { run, address, status }: { run: PinnedRun; address: RunDaemonAddress; status: number | null },
    { signal }: { signal?: AbortSignal } = {},
  ): void {
    if (status !== 200 || signal?.aborted) return;
    replayOrigins.set(replayKey(run), address);
  }
  /** Drops a run's pin: at watch end, or when neither daemon holds the run. Idempotent. */
  function release(required: PinnedRun, _options = {}): void { replayOrigins.delete(replayKey(required)); }
  return { current, origin, replayOrigin, retainLive, release };
}
