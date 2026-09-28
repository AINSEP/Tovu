import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import { PgliteSocketServer } from "../pglite-server/socket-server.js";

/**
 * @file The PGlite OWNER: the one process that opens a site's PGlite data dir and serves it on a
 * private Unix socket, so the API process and the agent daemon share one database as ordinary
 * Postgres clients (`pglite-socket.ts`). Storage plan R1e; spike S0
 * (`ADS-memory/reports/2026-09-28-pglite-socket-spike.md`).
 *
 * - One owner per data dir: a pid lock file inside it. A second owner for the same dir — another
 *   process or this one — is refused; a lock left by a dead pid (kill -9) is taken over. Different
 *   data dirs run side by side.
 * - The socket lives in a short private runtime dir (0700, socket 0600), never the site dir: macOS
 *   caps a socket path at 103 bytes. Never TCP.
 * - Low-memory Postgres settings (~110-120 MB steady instead of ~245 MB; S0 §3b). Expect a
 *   400-700 MB peak for ~10 s after open while V8 tiers up the WASM; that is not a leak.
 * - While serving, the owner reaches the database only through {@link PgliteOwner.runExclusive}
 *   (or as a socket client like everyone else).
 */

/** `PGlite.defaultStartParams` plus the low-memory settings (`initialMemory` stays at its 128 MB minimum). */
export const PGLITE_LOW_MEMORY_START_PARAMS: readonly string[] = [
  ...PGlite.defaultStartParams,
  "-c",
  "shared_buffers=16MB",
  "-c",
  "work_mem=1MB",
  "-c",
  "maintenance_work_mem=8MB",
  "-c",
  "wal_buffers=256kB",
  "-c",
  "max_connections=1",
];

/** The Postgres client convention: a client given `host=<dir>, port=5432` connects to this file. */
export const PGLITE_SOCKET_FILE = ".s.PGSQL.5432";
export const OWNER_LOCK_FILE = "tovu-owner.pid";
/** `sun_path` is 104 bytes on macOS including the terminating NUL. */
const MAX_SOCKET_PATH_BYTES = 103;

export interface PgliteOwner {
  readonly socketPath: string;
  /** Directory to give a Postgres client as `host`. */
  readonly socketDir: string;
  /** Runs `fn` alone on the database: after any open client transaction, before the next client message. */
  runExclusive<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
  /** Stops serving (open client transactions roll back), closes PGlite, removes the socket, releases the lock. */
  close(): Promise<void>;
}

export class PgliteOwnerLockedError extends Error {
  constructor(
    readonly dataDir: string,
    readonly pid: number
  ) {
    super(
      `the PGlite data dir ${dataDir} is already open by process ${pid}; only one process may own it (connect to its socket instead)`
    );
    this.name = "PgliteOwnerLockedError";
  }
}

/** 8 hex characters naming a data dir, stable across runs so clients can find its socket. */
function dirKey(dataDir: string): string {
  return createHash("sha256").update(resolve(dataDir)).digest("hex").slice(0, 8);
}

/**
 * Where the owner of `dataDir` puts its socket: `~/.tovu/run/<key>/`, or `/tmp/tovu-<uid>/<key>/`
 * when the home path is too long for a socket.
 */
export function defaultPgliteSocketDir(dataDir: string, home: string = homedir()): string {
  const key = dirKey(dataDir);
  const inHome = join(home, ".tovu", "run", key);
  if (Buffer.byteLength(join(inHome, PGLITE_SOCKET_FILE)) <= MAX_SOCKET_PATH_BYTES) return inHome;
  return join("/tmp", `tovu-${process.getuid?.() ?? "user"}`, key);
}

/** Throws unless `socketPath` fits in `sun_path`. */
export function assertSocketPathFits(socketPath: string): void {
  const bytes = Buffer.byteLength(socketPath);
  if (bytes > MAX_SOCKET_PATH_BYTES) {
    throw new Error(`socket path is ${bytes} bytes; Unix sockets allow at most ${MAX_SOCKET_PATH_BYTES}: ${socketPath}`);
  }
}

/**
 * Creates `dir` (and missing parents) owner-only, and refuses one that is a symlink or belongs to
 * another user (a pre-created `/tmp/tovu-<uid>` would otherwise let that user reach the socket).
 */
export function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  const uid = process.getuid?.();
  if (!stat.isDirectory() || stat.isSymbolicLink() || (uid !== undefined && stat.uid !== uid)) {
    throw new Error(`refusing socket dir ${dir}: not a directory owned by this user`);
  }
  chmodSync(dir, 0o700);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the pid exists but belongs to another user — still alive.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLockPid(lockPath: string): number | undefined {
  try {
    const pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Takes the data dir's owner lock (O_EXCL create). A lock whose pid is dead is removed and taken
 * once more; a live one — including this process's own — refuses. Returns the release function.
 */
export function acquireOwnerLock(dataDir: string): () => void {
  const lockPath = join(dataDir, OWNER_LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return () => {
        if (readLockPid(lockPath) === process.pid) rmSync(lockPath, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = readLockPid(lockPath);
      if (pid !== undefined && pidAlive(pid)) throw new PgliteOwnerLockedError(dataDir, pid);
      // Dead or unreadable: stale. Re-read right before removing so a lock another starter has
      // just written is not deleted.
      if (readLockPid(lockPath) === pid) rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`could not take the PGlite owner lock ${lockPath}`);
}

/**
 * Opens `dataDir` (creating it on first use — initdb takes several seconds) and serves it on a
 * private Unix socket.
 *
 * @param optional.socketDir default {@link defaultPgliteSocketDir}.
 * @param optional.idleInTransactionTimeoutMs default 30 s; see `PgliteSocketServer`.
 * @throws PgliteOwnerLockedError when another live owner holds `dataDir`.
 */
export async function startPgliteOwner(
  required: { dataDir: string },
  optional: {
    socketDir?: string;
    idleInTransactionTimeoutMs?: number;
    maxConnections?: number;
    log?: (message: string) => void;
  } = {}
): Promise<PgliteOwner> {
  const dataDir = resolve(required.dataDir);
  const socketDir = optional.socketDir ?? defaultPgliteSocketDir(dataDir);
  const socketPath = join(socketDir, PGLITE_SOCKET_FILE);
  assertSocketPathFits(socketPath);

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const releaseLock = acquireOwnerLock(dataDir);
  let db: PGlite | undefined;
  let server: PgliteSocketServer | undefined;
  try {
    ensurePrivateDir(socketDir);
    // We hold the lock, so a socket file here was left by a dead owner.
    if (existsSync(socketPath)) unlinkSync(socketPath);
    db = await PGlite.create({ dataDir, startParams: [...PGLITE_LOW_MEMORY_START_PARAMS] });
    server = new PgliteSocketServer({
      db,
      path: socketPath,
      idleInTransactionTimeoutMs: optional.idleInTransactionTimeoutMs,
      maxConnections: optional.maxConnections,
      log: optional.log,
    });
    await server.start();
    chmodSync(socketPath, 0o600);
    if ((statSync(socketPath).mode & 0o077) !== 0) throw new Error(`socket ${socketPath} is not owner-only`);
  } catch (error) {
    await server?.stop().catch(() => {});
    await db?.close().catch(() => {});
    rmSync(socketPath, { force: true });
    releaseLock();
    throw error;
  }

  const serving = server;
  const open = db;
  let closing: Promise<void> | undefined;
  return {
    socketPath,
    socketDir,
    runExclusive: (fn) => serving.runExclusive(fn),
    close() {
      closing ??= (async () => {
        try {
          await serving.stop();
          await open.close();
        } finally {
          rmSync(socketPath, { force: true });
          releaseLock();
        }
      })();
      return closing;
    },
  };
}
