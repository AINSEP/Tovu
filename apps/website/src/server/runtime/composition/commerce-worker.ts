import { acquireOwnerLock } from '@jini-ai/db/pglite';
import { createSettlementWorker, type CommerceWorkerRequired, type CommerceWorkerOptional } from '@jini-ai/commerce/payments/kernel';

/** Bind host timer and filesystem ownership to the reusable settlement state machine. */
export function createCommerceWorker(required: CommerceWorkerRequired & { directory: string }, optional: Partial<CommerceWorkerOptional> & { acquire?: () => () => void } = {}) {
  const acquire = optional.acquire ?? (() => acquireOwnerLock({ dataDir: required.directory, lockFileName: 'commerce-worker.lock' }));
  return createSettlementWorker(required, {
    withOwnership: optional.withOwnership ?? (async run => {
      const release = acquire();
      try { await run(); return { acquired: true }; } finally { release(); }
    }),
    schedule: optional.schedule ?? ((run, delayMs) => {
      const timer = setTimeout(run, delayMs); timer.unref?.(); return () => clearTimeout(timer);
    }),
  });
}
