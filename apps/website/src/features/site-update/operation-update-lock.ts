/**
 * @file The site update's lock, bound to the site's one shared operation lock (the same instance migration and
 * restore take), so an update can never run beside a migration, a restore or another update in this process.
 */
import { ToolInputError } from "@jini-ai/core";
import type { SharedOperationLockPort } from "@jini-ai/db/recovery/operation-lock";
import type { SiteUpdateLockPort } from "./tools.js";

type ClockDep = Parameters<SharedOperationLockPort["acquireOperationLock"]>[0]["deps"]["clock"];

export interface OperationUpdateLockRequired {
  lock: Pick<SharedOperationLockPort, "acquireOperationLock" | "releaseOperationLock">;
  /** The site the lock is keyed by: the same id migration and restore use (the workspace id). */
  siteId: string;
  clock: ClockDep;
}

const BUSY = "Another update, migration or restore is running on this site. Nothing was changed. Try again when it has finished.";

/**
 * @returns A lock that refuses at once (never queues) while the site is busy, and releases after `run` settles.
 *   Process-local only: the update supervisor owns the durable lease that fences writers across processes.
 * @complexity O(1) besides `run`.
 */
export function createOperationUpdateLock({ lock, siteId, clock }: OperationUpdateLockRequired, _optional = {}): SiteUpdateLockPort {
  return {
    withLock: async ({ run }) => {
      const deps = { clock };
      const acquired = await lock.acquireOperationLock({ deps, input: { siteId, operationKind: "site-update" } });
      // Refusing rather than waiting: a queued approval would run later against a site its card no longer describes.
      if (!acquired.ok) throw new ToolInputError({ message: BUSY });
      try {
        return await run();
      } finally {
        await lock.releaseOperationLock({ deps, input: { siteId, handle: acquired.value } });
      }
    },
  };
}
