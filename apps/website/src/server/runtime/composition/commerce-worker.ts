import { acquireOwnerLock } from '@jini-ai/db/pglite';

interface CommerceWorkerRequired {
  /** Only the serving owner schedules jobs; daemon/client compositions never do. */
  owner: boolean;
  directory: string;
  active(): Promise<boolean>;
  hasPending(): Promise<boolean>;
  run(): Promise<void>;
  warn(message: string): void;
}
interface CommerceWorkerOptional {
  acquire?: () => () => void;
  /** Native PostgreSQL reserves a session advisory lock for the owner's whole lifetime. */
  withOwnership?: (run: (lease?: { assertOwned(): Promise<void> }) => Promise<void>) => Promise<{ acquired: boolean }>;
  schedule?: (run: () => void, delayMs: number) => () => void;
}

/** Bind existing host ownership to one serialized settlement owner, active or draining.
 * No transaction spans provider HTTP: kernel dispatch snapshots commit independently.
 * @complexity One cycle/5s while active/draining, no idle timers; one owner lock held while running. */
export function createCommerceWorker(required: CommerceWorkerRequired, optional: CommerceWorkerOptional = {}): {
  kick(): Promise<void>; close(): Promise<void>;
} {
  const acquire = optional.acquire ?? (() => acquireOwnerLock({ dataDir: required.directory, lockFileName: 'commerce-worker.lock' }));
  const own = optional.withOwnership ?? (async (run: () => Promise<void>) => {
    const release = acquire();
    try { await run(); return { acquired: true }; } finally { release(); }
  });
  const schedule = optional.schedule ?? ((run, delayMs) => {
    const timer = setTimeout(run, delayMs); timer.unref?.(); return () => clearTimeout(timer);
  });
  let cancel: (() => void) | undefined;
  let current: Promise<void> | undefined;
  let holding: Promise<void> | undefined;
  let finish: (() => void) | undefined;
  let closed = false;
  let assertOwned: (() => Promise<void>) | undefined;
  let delayed = false;
  async function step(): Promise<void> {
    if (closed) { finish?.(); return; }
    try { await assertOwned?.(); } catch {
      required.warn('Payment settlement ownership was lost; this process stopped its worker.'); finish?.(); return;
    }
    try {
      if (!await required.active() && !await required.hasPending()) { finish?.(); return; }
      await required.run(); delayed = false;
    } catch {
      if (!delayed) required.warn('Payment settlement is delayed; recorded payments will retry automatically.');
      delayed = true;
    }
    if (!closed) cancel = schedule(() => {
      cancel = undefined;
      current = step().finally(() => { current = undefined; });
    }, 5000);
  }
  return {
    async kick() {
      if (!required.owner || closed || holding) return;
      let started!: () => void;
      const ready = new Promise<void>(resolve => { started = resolve; });
      const done = new Promise<void>(resolve => { finish = resolve; });
      holding = own(async (lease?: { assertOwned(): Promise<void> }) => {
        assertOwned = lease?.assertOwned;
        current = step().finally(() => { current = undefined; started(); });
        await current; await done;
      }).then(result => {
        if (!result.acquired) required.warn('Another serving process owns payment settlement for this database.');
      }).catch(() => required.warn('Payment settlement ownership could not be acquired; recorded payments remain queued.'))
        .finally(() => { holding = undefined; started(); });
      await ready;
    },
    async close() {
      closed = true; cancel?.(); cancel = undefined;
      await current; finish?.(); await holding;
    },
  };
}
