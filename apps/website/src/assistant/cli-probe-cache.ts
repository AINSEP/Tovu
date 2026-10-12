/** Temporary host binding until Jini publishes background inventory caching (see extraction survey).
 * Discovery stays behind the existing runtime port; requests only read settled snapshots. */
let probeTail: Promise<void> = Promise.resolve();

/** One inventory per host port. Failed scans keep the previous snapshot; only Rescan retries.
 * A rescan during a scan coalesces into one forced follow-up, never a second concurrent sweep.
 * @complexity O(1) bookkeeping; snapshot/probe cost belongs to the injected inventory port. */
export function createCliProbeCache<T>(
  { initial, probe }: { initial: () => T; probe: (input: { force: boolean }, options: Record<string, never>) => Promise<T> },
  _options: Record<string, never> = {},
) {
  let snapshot: Promise<T> | undefined;
  let pending: Promise<void> | undefined;
  let started = false;
  let rescanQueued = false;

  function refresh({ force }: { force: boolean }, _options: Record<string, never> = {}): void {
    if (pending) { rescanQueued ||= force; return; }
    started = true;
    // Let the request serialize its cached response before even launching the first CLI.
    const turn = new Promise<void>(resolve => { setImmediate(resolve); });
    pending = probeTail.then(() => turn).then(async () => {
      try { snapshot = Promise.resolve(await probe({ force }, {})); }
      catch { /* Keep last-good data; raw CLI errors may include private host details. */ }
    }).finally(() => {
      pending = undefined;
      if (rescanQueued) { rescanQueued = false; refresh({ force: true }); }
    });
    probeTail = pending;
  }

  return {
    isPending(_input: Record<string, never>, _options: Record<string, never> = {}): boolean { return pending !== undefined; },
    read({ force = false }: { force?: boolean }, _options: Record<string, never> = {}): Promise<T> {
      snapshot ??= Promise.resolve(initial());
      if (!started || force) refresh({ force });
      return snapshot;
    },
    /** Explicit completion port for diagnostics/tests; HTTP readers never call it. */
    async settled(_input: Record<string, never>, _options: Record<string, never> = {}): Promise<void> {
      while (pending) await pending;
    },
  };
}
