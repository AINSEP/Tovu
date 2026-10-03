/** @file Tovu compatibility facade over the shared Jini database package. */
import { PGlite } from "@electric-sql/pglite";
// Lock/private-socket rationale: Jini/packages/db/src/pglite/owner.ts.
import {
  acquireOwnerLock as jiniAcquireOwnerLock,
  defaultPgliteSocketDir as jiniDefaultPgliteSocketDir,
  pgliteLowMemoryStartParams,
  startPgliteOwner as jiniStartPgliteOwner,
  type PgliteOwner,
} from "@jini-ai/db/pglite";

export { PGLITE_SOCKET_FILE } from "@jini-ai/db/core";
export { assertSocketPathFits, ensurePrivateDir, PgliteOwnerLockedError, runningPgliteOwner, type PgliteOwner } from "@jini-ai/db/pglite";

export const OWNER_LOCK_FILE = "tovu-owner.pid";
export const PGLITE_LOW_MEMORY_START_PARAMS: readonly string[] = pgliteLowMemoryStartParams(PGlite);

/** Keep Tovu's home and /tmp socket namespaces unchanged. */
export function defaultPgliteSocketDir(dataDir: string, home?: string): string {
  return jiniDefaultPgliteSocketDir({ dataDir, runDirName: "tovu" }, home === undefined ? {} : { home });
}

/** Use Jini's shared owner state with Tovu's historical lock filename. */
export function acquireOwnerLock(dataDir: string): () => void {
  return jiniAcquireOwnerLock({ dataDir, lockFileName: OWNER_LOCK_FILE });
}

/** Inject Tovu's driver and literal namespaces without changing the old caller contract. */
export function startPgliteOwner(
  required: { dataDir: string },
  optional: { socketDir?: string; idleInTransactionTimeoutMs?: number; maxConnections?: number; log?: (message: string) => void } = {}
): Promise<PgliteOwner> {
  return jiniStartPgliteOwner({ dataDir: required.dataDir, PGlite, lockFileName: OWNER_LOCK_FILE, runDirName: "tovu" }, optional);
}
