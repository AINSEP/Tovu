import type nodeFs from "node:fs";
import { join } from "node:path";
import type { ImportHistoryPolicy } from "@jini-ai/core/contracts/site/site-import-history";
import type { SqliteSyncClient } from "@jini-ai/core/contracts/storage";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { ImportHistoryUnavailable } from "@jini-ai/devops/backup/site/import-index/errors";
import { payloadPaths } from "@jini-ai/devops/backup/site/import-index/payload-namespace";
import { sweepExpired } from "@jini-ai/devops/backup/site/import-index/sweep";
import {
  indexStatePaths, markIndexedWrite, readIndexState, resolveMode, retireLegacySnapshot, writeIndexState, writeIndexedWitness,
  type ImportIndexState, type IndexedWitnessFs, type LegacyRetireFs, type ResolveModeArgs, type RetryReason,
} from "@jini-ai/devops/backup/site/import-index/mode";
import { createDurableJsonFile, createNodeAtomicFilesystem, createNodeDurableJsonPorts, syncDirectoryBestEffort, writeJsonFileAtomic, type AtomicNativeFilesystem } from "@jini-ai/platform/fs";
import type { SiteImportRegistry } from "#src/features/site-backup/import-registry";

/**
 * Host binding of import-history authority (legacy JSON snapshot vs. the SQLite index).
 *
 * Surface, for the registry and for part-2 callers (backend latch, CLI tidy):
 * - `history.read({run})` / `history.locked({run})`: the `SiteImportRegistry.history` seam. Each call
 *   resolves the mode afresh, hands `run` a legacy or index session, and closes its scoped DB handle in
 *   `finally`. `locked` must be called with `<root>/.import.lock` held (the registry's `exclusive`).
 * - `retire({})`: tidy-only snapshot retirement; resolves like `locked` (so the same lock must be held)
 *   and calls `retireLegacySnapshot` only when the index is the authority. At most 200 files per pass.
 * - `refusal()`: the latched `ImportHistoryUnavailable` (MISSING / DAMAGED / NEWER), or undefined.
 *   Once set, every later `read`/`locked`/`retire` throws it without touching disk: once indexed,
 *   failing closed is what prevents a second site. Busy and out-of-space are thrown, never latched.
 */
export interface SiteImportIndexStateBinding {
  history: NonNullable<SiteImportRegistry["history"]>;
  retire(required: Record<string, never>, optional?: Record<string, never>): { removed: number; finished: boolean };
  refusal(required: Record<string, never>, optional?: Record<string, never>): ImportHistoryUnavailable | undefined;
}
export type SiteImportIndexStateFs = AtomicNativeFilesystem & Pick<typeof nodeFs, "readdirSync" | "unlinkSync" | "mkdirSync">;
type IndexHandle = ReturnType<typeof openImportIndex>;
type Resolved = ReturnType<typeof resolveMode<IndexHandle>>;
type LockedSession = Parameters<Parameters<SiteImportIndexStateBinding["history"]["locked"]>[0]["run"]>[0];
interface Required {
  directory: string; policy: ImportHistoryPolicy; clock: { nowMs(): number }; fs: SiteImportIndexStateFs;
  open: (required: { file: string; options: { readonly?: boolean; fileMustExist?: boolean } }, optional?: Record<string, never>) => SqliteSyncClient;
  checkIntegrity: (required: { db: SqliteSyncClient; file: string }, optional?: Record<string, never>) => void;
  backfill: ResolveModeArgs<IndexHandle>["backfill"];
  log: (required: { message: string }, optional?: Record<string, never>) => void;
}

const DB = "site-imports.db";
const DAMAGED = "Import history could not be read. Imports are paused and nothing was changed. Contact support with this error ID.";
const damaged = () => new ImportHistoryUnavailable({ code: "IMPORT_HISTORY_DAMAGED", status: 503, message: DAMAGED });

function lstatOrMissing({ fs, file }: { fs: SiteImportIndexStateFs; file: string }): nodeFs.Stats | undefined {
  try { return fs.lstatSync(file); } catch (error) {
    // Only absence is "missing"; a permission or I/O error must not read as "no evidence".
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function fsyncDir({ fs, dir }: { fs: SiteImportIndexStateFs; dir: string }): void {
  // Best effort: some platforms (Windows, some network filesystems) cannot flush a directory.
  syncDirectoryBestEffort({ directory: dir, open: (path, flags) => fs.openSync(path, flags), sync: descriptor => fs.fsyncSync(descriptor), close: descriptor => fs.closeSync(descriptor) }, { platform: process.platform });
}

function witnessFs({ fs }: { fs: SiteImportIndexStateFs }): IndexedWitnessFs {
  return {
    writeExclusive: ({ file, mode }, _optional = {}) => { fs.closeSync(fs.openSync(file, "wx", mode)); },
    kind: ({ file }, _optional = {}) => {
      const stat = lstatOrMissing({ fs, file });
      if (stat === undefined) return "missing";
      return stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other";
    },
    fsyncFile: ({ file }, _optional = {}) => {
      const descriptor = fs.openSync(file, "r");
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    },
    fsyncDir: ({ dir }, _optional = {}) => fsyncDir({ fs, dir }),
  };
}

function retireFs({ fs }: { fs: SiteImportIndexStateFs }): LegacyRetireFs {
  return {
    readdir: ({ dir }, _optional = {}) => fs.readdirSync(dir),
    stat: ({ file }, _optional = {}) => {
      // One no-follow lstat supplies both kind and mtime, so they describe the same file.
      const stat = lstatOrMissing({ fs, file });
      if (stat === undefined) return { kind: "missing", mtimeMs: 0 };
      return { kind: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "other", mtimeMs: stat.mtimeMs };
    },
    unlink: ({ file }, _optional = {}) => fs.unlinkSync(file),
  };
}

/** Moves one artifact without overwriting; a missing source is already moved (resumable). */
function moveNoOverwrite({ fs, from, to }: { fs: SiteImportIndexStateFs; from: string; to: string }): void {
  const source = lstatOrMissing({ fs, file: from });
  if (source === undefined) return;
  // A link or an occupied destination cannot be moved safely; refuse and leave every file in place.
  if (!source.isFile() || lstatOrMissing({ fs, file: to }) !== undefined) throw damaged();
  // The check-then-rename runs under the held `.import.lock`, the only writer of this root.
  fs.renameSync(from, to);
}

/**
 * Quarantine is a pre-write recovery path only: the DB still equals the JSON snapshot, so setting it
 * aside loses nothing. Sidecars move before the main file, so a partial move never leaves a fresh DB
 * able to pair with old WAL/SHM pages; a rerun resumes into the same db-id-keyed private directory.
 */
function quarantineArtifacts({ fs, root, dbId }: { fs: SiteImportIndexStateFs; root: string; dbId: string }): void {
  const dir = join(root, `site-imports.quarantine-${dbId}`);
  try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw damaged();
  for (const name of [`${DB}-wal`, `${DB}-shm`, DB]) moveNoOverwrite({ fs, from: join(root, name), to: join(dir, name) });
  fsyncDir({ fs, dir });
  fsyncDir({ fs, dir: root });
}

function createPorts(required: Required) {
  const { directory: root, fs, clock, policy, open, checkIntegrity } = required;
  const paths = indexStatePaths({ root });
  // One memo per binding: integrity runs once per file+db_id, not on every fresh scoped open.
  const integrityMemo = createImportIndexIntegrityMemo({});
  const atomicFs = createNodeAtomicFilesystem({}, { filesystem: fs });
  const exists = (name: string) => lstatOrMissing({ fs, file: join(root, name) }) !== undefined;
  return {
    root, paths,
    // The durable reader's read never quarantines: a damaged state file is refused and left in place.
    readState: () => readIndexState({ file: paths.state, readJson: ({ file }, _optional = {}) => createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath: file, notices: { prefix: "Site imports", lockTimeout: () => "Import registry is busy." } }).read({}) }),
    // Explicit 0600 + owner-only check: the durable JSON writer would keep its umask-derived create mode.
    writeState: ({ state }: { state: ImportIndexState }, _optional: Record<string, never> = {}) => writeIndexState({ file: paths.state, state, writeJson: ({ file, value }, _optional = {}) => writeJsonFileAtomic({ filePath: file, data: value, fs: atomicFs }, { mode: 0o600, verifyOwnerOnly: true, refuseSymlink: true }) }),
    // Fixed-path probes only: enumerating the root could mistake unrelated files for evidence.
    evidence: () => ({ dbArtifactsPresent: [DB, `${DB}-wal`, `${DB}-shm`].some(exists), indexedWitnessPresent: lstatOrMissing({ fs, file: paths.witness }) !== undefined }),
    witness: () => writeIndexedWitness({ root, fs: witnessFs({ fs }) }),
    retireFs: retireFs({ fs }),
    quarantine: ({ dbId }: { dbId: string }) => quarantineArtifacts({ fs, root, dbId }),
    stagePath: (importId: string) => payloadPaths({ root }).stage({ importId }),
    // A fresh scoped open sees a missing or exchanged DB that an old descriptor could hide.
    openExisting: ({ readonly }: { readonly: boolean }, _optional: Record<string, never> = {}): IndexHandle => {
      const file = join(root, DB);
      const stat = lstatOrMissing({ fs, file });
      // Opening an absent file could create an empty DB; ENOENT tells resolveMode the DB is missing.
      if (stat === undefined) throw Object.assign(new Error("Import history database is missing."), { code: "ENOENT" });
      if (!stat.isFile()) throw Object.assign(new Error("Import history database is not a regular file."), { code: "SQLITE_NOTADB" });
      const opener = { file, open: (file: string, options: { readonly?: boolean; fileMustExist?: boolean }) => open({ file, options }), clock, policy, integrityMemo, checkIntegrity };
      // A read-write connection over a damaged main file deletes its WAL/SHM on close, destroying what
      // quarantine must preserve; so a locked open first validates through a read-only connection.
      if (!readonly) openImportIndex(opener, { mustExist: true, readonly: true }).close({});
      return openImportIndex(opener, { mustExist: true, readonly });
    },
  };
}
type Ports = ReturnType<typeof createPorts>;

const readOnly = (what: string) => () => { throw new Error(`Lock-free import history reads never ${what}.`); };

function resolveFor({ ports, required, access, latch }: { ports: Ports; required: Required; access: "read" | "locked"; latch: { error?: ImportHistoryUnavailable } }): { resolved: Exclude<Resolved, { mode: "refused" }>; seen: string } {
  if (latch.error) throw latch.error;
  const state = ports.readState();
  const evidence = ports.evidence();
  let current: ImportIndexState | undefined = state.kind === "valid" ? state.state : undefined;
  const writeState = ({ state: next }: { state: ImportIndexState }, _optional: Record<string, never> = {}) => { ports.writeState({ state: next }); current = next; };
  const prepareRetry = (_retry: { reason: RetryReason }, _optional: Record<string, never> = {}) => {
    // Never quarantine indexed data or a read: only a verified pre-write cutover under the lock.
    if (access !== "locked" || current?.mode !== "cutover") throw damaged();
    ports.quarantine({ dbId: current.dbId });
  };
  const resolved = resolveMode<IndexHandle>(access === "locked"
    ? { state, evidence, access, policy: required.policy, openExisting: ports.openExisting, writeState, backfill: required.backfill, prepareRetry, log: required.log }
    : { state, evidence, access, policy: required.policy, openExisting: ports.openExisting, writeState: readOnly("write state"), backfill: readOnly("backfill"), prepareRetry: readOnly("quarantine"), log: required.log });
  if (resolved.mode === "refused") { latch.error = resolved.error; throw resolved.error; }
  return { resolved, seen: JSON.stringify({ state, evidence }) };
}

function indexSession({ ports, required, resolved }: { ports: Ports; required: Required; resolved: Extract<Resolved, { mode: "cutover" | "indexed" }> }): LockedSession {
  const { clock, policy, fs } = required;
  const { db, store } = resolved.handle;
  let state: ImportIndexState = resolved.state;
  // State first, then witness, then return so the caller's SQL may run; a failure in either throws first.
  const beforeWrite = (_required: Record<string, never>, _optional: Record<string, never> = {}) => {
    state = markIndexedWrite({ state, clock, writeState: ports.writeState, ensureIndexedWitness: () => ports.witness() });
  };
  const expireHistory = (_required: Record<string, never>, _optional: Record<string, never> = {}) => {
    for (const row of store.dueOwnerSetups({ now: clock.nowMs() })) {
      // Record the failure before discarding the stage: a crash between leaves an orphan stage that payload expiry clears.
      store.put({ row: { ...row, status: "failed", error: "Owner setup expired. Import the archive again." }, beforeWrite });
      fs.rmSync(ports.stagePath(row.importId), { recursive: true, force: true });
    }
  };
  // Sweep never runs in cutover: rollback may still hand authority back to the JSON snapshot.
  const sweep = (_required: Record<string, never>, _optional: Record<string, never> = {}) => { if (state.mode === "indexed") sweepExpired({ db, clock, policy }); };
  return { kind: "index", db, store, policy, beforeWrite, expireHistory, sweep };
}

type ReadSession = Parameters<Parameters<SiteImportIndexStateBinding["history"]["read"]>[0]["run"]>[0];
function readHistory<T>({ ports, required, latch, run }: { ports: Ports; required: Required; latch: { error?: ImportHistoryUnavailable }; run: (session: ReadSession, optional?: Record<string, never>) => T }): T {
  // Lock-free reads never cut over, expire, sweep or quarantine anything.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { resolved, seen } = resolveFor({ ports, required, access: "read", latch });
    if (resolved.mode !== "legacy") {
      try { return run({ kind: "index", db: resolved.handle.db, store: resolved.handle.store, policy: required.policy }, {}); } finally { resolved.handle.close({}, {}); }
    }
    const result = run({ kind: "legacy" }, {});
    // Authority moved under a legacy read: discard it rather than serve JSON that may now be stale.
    if (JSON.stringify({ state: ports.readState(), evidence: ports.evidence() }) === seen) return result;
  }
  throw new ImportHistoryUnavailable({ code: "IMPORT_HISTORY_BUSY", status: 503, message: "Import history is busy. Try again in a moment." });
}

/** Binds import-history authority to one workspace root. @complexity O(1) per resolution plus SQLite open. */
export function bindSiteImportIndexState(required: Required, _optional: Record<string, never> = {}): SiteImportIndexStateBinding {
  const ports = createPorts(required);
  const latch: { error?: ImportHistoryUnavailable } = {};
  return {
    history: {
      read: ({ run }, _optional = {}) => readHistory({ ports, required, latch, run }),
      locked: async ({ run }, _optional = {}) => {
        const { resolved } = resolveFor({ ports, required, access: "locked", latch });
        if (resolved.mode === "legacy") return run({ kind: "legacy" }, {});
        try { return await run(indexSession({ ports, required, resolved }), {}); } finally { resolved.handle.close({}, {}); }
      },
    },
    retire: (_required, _optional = {}) => {
      const { resolved } = resolveFor({ ports, required, access: "locked", latch });
      if (resolved.mode === "legacy") return { removed: 0, finished: false };
      try {
        return retireLegacySnapshot({ root: ports.root, state: resolved.state, clock: required.clock, policy: required.policy, fs: ports.retireFs, writeState: ports.writeState, log: required.log });
      } finally { resolved.handle.close({}, {}); }
    },
    refusal: (_required, _optional = {}) => latch.error,
  };
}
