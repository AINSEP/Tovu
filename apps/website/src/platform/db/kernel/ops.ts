/** @file Tovu compatibility facade over the shared Jini database package. */
// Storage-op rationale: Jini packages/db/src/kernel/{ops,sqlite/ops,pglite/ops,postgres/ops}.ts.
import { PGlite } from "@electric-sql/pglite";
import { type StorageKernel, type StorageOps, StorageOpNotSupportedError } from "@jini-ai/db/kernel";
import { sqliteOps } from "@jini-ai/db/kernel/sqlite";
import { pgliteOps, copyServedPgliteTo as jiniCopyServedPgliteTo, type PgliteExclusive } from "@jini-ai/db/kernel/pglite";
import { postgresOps } from "@jini-ai/db/kernel/postgres";
import { OWNER_LOCK_FILE } from "./drivers/pglite-owner.js";

export { StorageOpError, StorageOpNotSupportedError, type StorageOps } from "@jini-ai/db/kernel";
export type { PgliteExclusive } from "@jini-ai/db/kernel/pglite";

/** Keep Tovu's single ops entry point; database mechanics belong to the shared adapters. */
export function storageOps<DB>(kernel: StorageKernel<DB>, optional: { pgliteOwner?: PgliteExclusive } = {}): StorageOps {
  if (kernel.dialect === "sqlite") return sqliteOps(kernel);
  if (kernel.transport === "pglite" || (kernel.transport === "pglite-socket" && optional.pgliteOwner !== undefined)) {
    return pgliteOps(kernel, { PGlite, ownerLockFileName: OWNER_LOCK_FILE, ledgerTable: "tovu_migrations" }, optional);
  }
  const ops = postgresOps(kernel, { ledgerTable: "tovu_migrations" });
  return {
    ...ops,
    async copyTo(targetPath) {
      try {
        await ops.copyTo(targetPath);
      } catch (error) {
        if (!(error instanceof StorageOpNotSupportedError)) throw error;
        // Product-specific operator guidance remains byte-identical for legacy callers.
        const reason = kernel.transport === "pglite-socket"
          ? "a PGlite socket client copies through its owner's exclusive window (pass pgliteOwner)"
          : "a Postgres site is backed up by its provider; use the move/transfer tools to copy it";
        throw new StorageOpNotSupportedError(error.op, error.transport, reason);
      }
    },
  };
}

/** Restore a served dump with Tovu's driver and remove its historical owner lock from the copy. */
export function copyServedPgliteTo(owner: PgliteExclusive, targetPath: string): Promise<void> {
  return jiniCopyServedPgliteTo(owner, targetPath, { PGlite, ownerLockFileName: OWNER_LOCK_FILE });
}
