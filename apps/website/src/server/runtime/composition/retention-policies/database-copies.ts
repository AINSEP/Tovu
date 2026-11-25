import type { RetentionPolicy } from "@jini-ai/platform/retention";
import { listMigrationCopies, pruneMigrationCopies, type CopyCoordinator, type PruneMigrationCopiesRequired } from "#src/platform/db/sqlite/copy-coordinator";

export interface DatabaseCopyPolicyRequired extends Pick<PruneMigrationCopiesRequired, "verify" | "listProtected" | "fs" | "selectCopies"> {
  /** Each site's `ops/` folder; only `pre-migrations-<ISO>.db` copies (and their sidecars) in it are managed. */
  opsDirs: readonly string[];
  /** The coordinator shared with backup publication and Recovery's restore. */
  mutex: Pick<CopyCoordinator, "runExclusive" | "held">;
  signal: AbortSignal;
}

/**
 * The `database-copies` retention policy (kind `old-copy`): old pre-migration copies beyond the newest
 * `keep` (default 5), only when the newest copy verifies, never a protected or held copy. Scheduled
 * passes only `measure()`; `sweep()` runs on an owner-confirmed cleanup, on the same lane as publication.
 * @complexity measure O(n) lstat calls; sweep O(n log n) per folder with at most `limit` removals.
 */
export function createDatabaseCopyPolicy(
  required: DatabaseCopyPolicyRequired,
  { keep = 5, limit = 20 }: { keep?: number; limit?: number } = {},
): RetentionPolicy {
  const { opsDirs, verify, listProtected, mutex, fs, selectCopies, signal } = required;
  return {
    id: "database-copies",
    kind: "old-copy",
    async measure() {
      let bytes = 0;
      let items = 0;
      for (const opsDir of opsDirs) {
        const copies = await listMigrationCopies({ opsDir, fs });
        items += copies.length;
        bytes += copies.reduce((sum, copy) => sum + copy.bytes, 0);
      }
      return { bytes, items };
    },
    async sweep() {
      let removed = 0;
      let freedBytes = 0;
      for (const opsDir of opsDirs) {
        if (signal.aborted) break;
        const result = await mutex.runExclusive({ opsDir, work: () => pruneMigrationCopies(
          { opsDir, verify, held: mutex.held, listProtected, fs, selectCopies },
          { keep, limit: limit - removed, signal },
        ) });
        removed += result.removed;
        freedBytes += result.freedBytes;
      }
      return { removed, freedBytes };
    },
  };
}
