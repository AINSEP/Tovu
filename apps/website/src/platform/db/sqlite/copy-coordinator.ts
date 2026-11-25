import path from "node:path";
import type { DatabaseCopy, selectDatabaseCopiesToPrune } from "@jini-ai/db/sqlite";

/**
 * @file The one coordinator for a site's database copies in `<site>/ops/`: publication of a new copy,
 * pruning of old ones (migration callback and the daily retention pass) and Recovery's restore all go
 * through it, so a pruner never removes a copy that is being written, verified or restored from.
 */

/** Exact grammar the migration runner writes (`content-db.ts` `migrationBackupPath`); nothing else is a candidate. */
const MIGRATION_COPY_NAME = /^pre-migrations-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.db$/;
/** Only these sidecars have proven provenance: they are named after a copy that matched the grammar. */
const COPY_SIDECARS = ["-wal", "-shm"] as const;

export interface CopyCoordinator {
  withCopyPublication<T>(required: { opsDir: string; work: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  holdCopy<T>(required: { path: string; work: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  runExclusive<T>(required: { opsDir: string; work: () => Promise<T> }, optional?: Record<string, never>): Promise<T>;
  held(): ReadonlySet<string>;
}

/**
 * One exclusive lane per resolved ops folder (publication and pruning queue on it) plus a set of held
 * copies. A hold is registered inside the lane, so it waits out a running prune and every later prune sees it.
 * @complexity O(1) per call besides the awaited work.
 */
export function createCopyCoordinator(_required: Record<string, never>, _optional: Record<string, never> = {}): CopyCoordinator {
  const lanes = new Map<string, Promise<unknown>>();
  const holds = new Map<string, number>();
  const runExclusive = <T>({ opsDir, work }: { opsDir: string; work: () => Promise<T> }, _o: Record<string, never> = {}): Promise<T> => {
    const key = path.resolve(opsDir);
    const run = (lanes.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
    const tail = run.catch(() => undefined);
    lanes.set(key, tail);
    void tail.then(() => { if (lanes.get(key) === tail) lanes.delete(key); });
    return run;
  };
  return {
    runExclusive,
    withCopyPublication: ({ opsDir, work }, _o = {}) => runExclusive({ opsDir, work }),
    async holdCopy({ path: file, work }, _o = {}) {
      const key = path.resolve(file);
      await runExclusive({ opsDir: path.dirname(key), work: async () => { holds.set(key, (holds.get(key) ?? 0) + 1); } });
      try { return await work(); } finally {
        const left = (holds.get(key) ?? 1) - 1;
        if (left > 0) holds.set(key, left); else holds.delete(key);
      }
    },
    held: () => new Set(holds.keys()),
  };
}

/** Filesystem port the pruner needs; `lstat` so a symlink is never followed or counted as a copy. */
export interface DatabaseCopyFs {
  readdir(dir: string): Promise<string[]>;
  lstat(file: string): Promise<{ size: number; isFile(): boolean }>;
  unlink(file: string): Promise<void>;
}

export interface ListedCopy extends DatabaseCopy { readonly bytes: number }

/**
 * The grammar-matched copies in one ops folder, newest first, with their bytes (copy plus proven sidecars).
 * A missing folder lists nothing; any other read error propagates so a pass reports it instead of guessing.
 * @complexity O(n log n) in folder entries, one lstat per matched name and sidecar.
 */
export async function listMigrationCopies({ opsDir, fs }: { opsDir: string; fs: DatabaseCopyFs }, _optional: Record<string, never> = {}): Promise<ListedCopy[]> {
  const entries = await fs.readdir(opsDir).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  const copies: ListedCopy[] = [];
  for (const name of entries) {
    const match = MIGRATION_COPY_NAME.exec(name);
    if (!match) continue;
    const filePath = path.join(path.resolve(opsDir), name);
    const stat = await fs.lstat(filePath).catch(() => undefined);
    if (!stat?.isFile()) continue;
    const createdAt = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
    if (Number.isNaN(createdAt)) continue;
    copies.push({ filePath, createdAt, bytes: stat.size + await sidecarBytes({ filePath, fs }) });
  }
  return copies.sort((a, b) => b.createdAt - a.createdAt || b.filePath.localeCompare(a.filePath));
}

async function sidecarBytes({ filePath, fs }: { filePath: string; fs: DatabaseCopyFs }, _optional: Record<string, never> = {}): Promise<number> {
  let bytes = 0;
  for (const suffix of COPY_SIDECARS) {
    const stat = await fs.lstat(`${filePath}${suffix}`).catch(() => undefined);
    if (stat?.isFile()) bytes += stat.size;
  }
  return bytes;
}

export interface PruneMigrationCopiesRequired {
  opsDir: string;
  /** The copy the caller just published; when set it must be the newest listed copy, or nothing is removed. */
  justWritten?: string;
  /** Read-only `quick_check` of one copy; `false` or a throw means "not recoverable". */
  verify: (required: { path: string }, optional?: Record<string, never>) => Promise<boolean>;
  held: () => ReadonlySet<string>;
  /** Every copy path a journal row or marker protects; a throw means protection is unknown. */
  listProtected: () => Promise<readonly string[]>;
  fs: DatabaseCopyFs;
  selectCopies: typeof selectDatabaseCopiesToPrune;
}

/**
 * Removes old pre-migration copies beyond `keep`, anchored on a newest copy that passed verification.
 * The caller must hold the coordinator lane for `opsDir` (the migration callback runs inside its own
 * publication; the daily pass takes `runExclusive`). Unknown protection removes nothing.
 * @complexity O(n log n) in copies; at most `limit` removals, sequential.
 */
export async function pruneMigrationCopies(
  required: PruneMigrationCopiesRequired,
  { keep = 5, limit = 20, signal }: { keep?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<{ removed: number; freedBytes: number }> {
  const { opsDir, justWritten, verify, held, listProtected, fs, selectCopies } = required;
  const none = { removed: 0, freedBytes: 0 };
  const copies = await listMigrationCopies({ opsDir, fs });
  const newest = copies[0];
  if (!newest || (justWritten !== undefined && path.resolve(justWritten) !== newest.filePath)) return none;
  // Age is not recoverability evidence: the newest copy can be torn (disk full mid-copy, a crash before
  // fsync) and still carry the latest timestamp. Pruning older copies against it would spend the only
  // good recovery window, so the anchor must pass a read-only quick_check first.
  if (!(await verify({ path: newest.filePath }).catch(() => false))) return none;
  const protectedPaths = new Set([...(await listProtected()).map(file => path.resolve(file)), ...held()]);
  const victims = selectCopies({ copies, verifiedNewest: newest.filePath }, { keep, protectedPaths }).slice(0, limit);
  let result = none;
  for (const victim of victims) {
    if (signal?.aborted || held().has(victim.filePath)) continue;
    const bytes = (victim as ListedCopy).bytes ?? 0;
    for (const file of [victim.filePath, ...COPY_SIDECARS.map(suffix => `${victim.filePath}${suffix}`)]) {
      await fs.unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    result = { removed: result.removed + 1, freedBytes: result.freedBytes + bytes };
  }
  return result;
}

/** The one coordinator a serving process composes: boot migration, `dbOps` and the retention pass all inject it. */
export const processCopyCoordinator: CopyCoordinator = createCopyCoordinator({}, {});

/** Read-only connection port (better-sqlite3's shape) for verification and journal reads. */
export type ReadonlySqliteOpener = (file: string, options: { readonly: true; fileMustExist: true }) => {
  pragma(source: string, options: { simple: true }): unknown;
  prepare(source: string): { pluck(): { all(): unknown[] } };
  close(): void;
};

/**
 * Read-only `quick_check` of one copy: `true` only for SQLite's exact `ok`. Any open or read error is
 * "not recoverable", never an exception, so a torn copy simply anchors nothing.
 * @complexity O(copy size) — quick_check reads every page once.
 */
export async function quickCheckSqliteCopy({ path: file, open }: { path: string; open: ReadonlySqliteOpener }, _optional: Record<string, never> = {}): Promise<boolean> {
  try {
    const connection = open(file, { readonly: true, fileMustExist: true });
    try { return connection.pragma("quick_check", { simple: true }) === "ok"; } finally { connection.close(); }
  } catch { return false; }
}

/**
 * Real ports for the migration pruner and the retention policy. Protection is every `artifact_ref` in the
 * recovery journal (all sites, the safer superset); no journal file means no row can protect anything, but a
 * journal that exists and cannot be read throws, so the caller removes nothing.
 * @complexity verify O(copy size); listProtected O(rows).
 */
export function sqliteCopyPorts(
  { journalPath, copies, open, exists }: { journalPath: string; copies: CopyCoordinator; open: ReadonlySqliteOpener; exists: (file: string) => boolean },
  _optional: Record<string, never> = {},
): { copies: CopyCoordinator; verify: PruneMigrationCopiesRequired["verify"]; listProtected: PruneMigrationCopiesRequired["listProtected"] } {
  return {
    copies,
    verify: ({ path: file }) => quickCheckSqliteCopy({ path: file, open }),
    listProtected: async () => {
      if (!exists(journalPath)) return [];
      const journal = open(journalPath, { readonly: true, fileMustExist: true });
      try {
        return journal.prepare("SELECT artifact_ref FROM restore_points WHERE artifact_ref <> ''").pluck().all().map(String);
      } finally { journal.close(); }
    },
  };
}
