/** Trigger-driven pull coordination. No timers; manual and automatic calls share one lease. */
export interface FormPullLeasePort {
  /** Atomic, receiver-scoped admission. A non-expired holder excludes every trigger, including manual.
   * The host lease must outlast the bounded pull operation; expired claims recover after a crash. */
  claim(required: { workspaceId: string; receiverKey: string; token: string; nowIso: string; debounceMs: number }, optional?: Record<string, never>): Promise<boolean>;
  release(required: { workspaceId: string; receiverKey: string; token: string }, optional?: Record<string, never>): Promise<void>;
}
/** Run the existing pull while holding admission; manual bypasses only the recent-pull check.
 * A failed pull also counts as a recent attempt, avoiding login storms against a broken receiver.
 * @example await withFormPullLease({ leases, workspaceId, receiverKey, token, nowIso, trigger: 'automatic', pull });
 */
export async function withFormPullLease<T>(
  required: { leases: FormPullLeasePort; workspaceId: string; receiverKey: string; token: string; nowIso: string; trigger: 'manual' | 'automatic'; pull: () => Promise<T> },
  _options: Record<string, never> = {},
): Promise<{ ran: true; result: T } | { ran: false }> {
  const { leases, workspaceId, receiverKey, token, nowIso, trigger } = required;
  if (!await leases.claim({ workspaceId, receiverKey, token, nowIso, debounceMs: trigger === 'automatic' ? 60_000 : 0 })) return { ran: false };
  try { return { ran: true, result: await required.pull() }; }
  finally { await leases.release({ workspaceId, receiverKey, token }); }
}

/** Track trigger-driven background work so shutdown can stop admission and await live pulls.
 * No scheduling or polling occurs here. The receiver lease still owns concurrency and debounce.
 * @example const trigger = createFormPullTrigger({ run, onError }); void trigger.run({}); await trigger.stop({});
 */
export function createFormPullTrigger(required: { run: () => Promise<void>; onError: (error: unknown) => void }, _options: Record<string, never> = {}) {
  let stopped = false;
  const inFlight = new Set<Promise<void>>();
  return {
    run(_input: Record<string, never> = {}, _optional: Record<string, never> = {}): Promise<void> {
      if (stopped) return Promise.resolve();
      const work = Promise.resolve().then(() => required.run()).catch(error => {
        try { required.onError(error); } catch { /* Reporting cannot reject background work. */ }
      });
      inFlight.add(work);
      void work.then(() => { inFlight.delete(work); });
      return work;
    },
    async stop(_input: Record<string, never> = {}, _optional: Record<string, never> = {}): Promise<void> {
      stopped = true;
      await Promise.allSettled(inFlight);
    },
  };
}
