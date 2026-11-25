import path from "node:path";
import type files from "node:fs/promises";
import type { convertToIncrementalVacuum } from "@jini-ai/db/sqlite";
import type { SqliteCompactionFs, SqliteConversionOutcome } from "@jini-ai/core/contracts/storage";
import type { CopyCoordinator } from "#src/platform/db/sqlite/copy-coordinator";
import type { SiteStorage } from "#src/platform/site-dir/types";
import type { compactionMarkerStore } from "./compaction-marker.js";

export async function compactStoppedSite(
  { dir, claim, resolvePaths, open, markerStore, fs, copyMutex, convert, now }: {
    dir: string;
    claim: (required: { dir: string; purpose: "maintenance" }) => { attached: object | null; isHeld(): boolean; release(): void };
    resolvePaths: (required: { dir: string }, optional: { reserveIdentity: false }) => { storage: SiteStorage; contentDbPath: string; chatDbPath: string };
    open: Parameters<typeof convertToIncrementalVacuum>[0]["open"];
    markerStore: (required: { opsDir: string; lease: { isHeld(): boolean } }) => ReturnType<typeof compactionMarkerStore>;
    fs: SqliteCompactionFs & Pick<typeof files, "lstat" | "realpath">;
    copyMutex: Pick<CopyCoordinator, "withCopyPublication">;
    convert: typeof convertToIncrementalVacuum;
    now: () => number;
  },
  { databases = ["content", "chat"] }: { databases?: readonly ("content" | "chat")[] } = {},
): Promise<{ status: "done" | "partial"; databases: readonly { name: "content" | "chat"; outcome: SqliteConversionOutcome }[] }> {
  const lease = claim({ dir, purpose: "maintenance" });
  if (lease.attached !== null) return { status: "partial", databases: [] };
  try {
    const paths = resolvePaths({ dir }, { reserveIdentity: false });
    if (paths.storage.kind !== "sqlite") throw new Error("Compaction is only available for SQLite websites.");
    const markers = markerStore({ opsDir: path.join(dir, "ops"), lease });
    const results: { name: "content" | "chat"; outcome: SqliteConversionOutcome }[] = [];
    for (const name of ["content", "chat"] as const) {
      if (!databases.includes(name)) continue;
      const filePath = paths[`${name}DbPath`];
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.nlink !== 1 || await fs.realpath(filePath) !== path.resolve(filePath)) {
        results.push({ name, outcome: { status: "deferred", reason: "needs-attention", message: "The database file is linked or is not a plain file; nothing was changed." } });
        continue;
      }
      const outcome = await copyMutex.withCopyPublication({ opsDir: path.dirname(filePath), work: () => convert({
        filePath, open, marker: markers.forDatabase({ name }, {}), holdsRunningLease: lease.isHeld, fs, now,
      }, {}) });
      results.push({ name, outcome });
    }
    return { status: results.some(result => result.outcome.status === "deferred") ? "partial" : "done", databases: results };
  } finally { lease.release(); }
}
