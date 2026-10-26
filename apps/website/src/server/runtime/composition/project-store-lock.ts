import { randomBytes } from "node:crypto";
import fs from "node:fs";

/**
 * @file The lock two starts of the same project (web + desktop launched together) take before one of
 * them moves the old `project.db` (`project-store-relocate.ts`). Without it the second start sees the
 * first one's move half done: it could open the old name of a file that is being linked away (two
 * names, two -wal files, one database: corruption) or create a fresh EMPTY `project.db` in the synced
 * sites root. A plain file created with `wx` (exclusive create: one winner, on POSIX and Windows
 * alike) holding `{ pid, atMs }`. A start that died holding it never blocks the next one forever: a
 * lock whose pid is gone, or that is older than any real move, is taken over.
 */

export interface LockSeams {
  /** How long to wait for a live holder before going on without the lock (default 15 s). */
  waitMs?: number;
  /** Older than this, a lock is stale even when its pid answers (a reused pid; default 2 min). */
  staleMs?: number;
  /** A synchronous wait between tries (the relocation runs before the server serves anything). */
  sleep?: (ms: number) => void;
  nowMs?: () => number;
  /** Whether a pid is a running process; `process.kill(pid, 0)` (works on Windows too). */
  isAlive?: (pid: number) => boolean;
}

const RETRY_MS = 50;
/** A failed exclusive create that means "someone else holds it" (EPERM/EACCES/EBUSY: Windows, while
 *  the holder's file is being deleted) rather than "this folder cannot hold a lock at all". */
const CONTENDED = new Set(["EEXIST", "EPERM", "EACCES", "EBUSY"]);

const errorCode = (error: unknown): unknown => (error as NodeJS.ErrnoException | undefined)?.code;

const sleepSync = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/** `process.kill(pid, 0)` throws ESRCH for no such process; EPERM means it exists under another user. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

/** Creates the lock file; its contents, or "contended" / "unavailable" when it could not be made. */
function tryCreate(file: string, nowMs: number): string | "contended" | "unavailable" {
  const raw = JSON.stringify({ pid: process.pid, atMs: nowMs, token: randomBytes(8).toString("hex") });
  try {
    fs.writeFileSync(file, raw, { flag: "wx", mode: 0o600 });
    return raw;
  } catch (error) {
    return CONTENDED.has(errorCode(error) as string) ? "contended" : "unavailable";
  }
}

interface Holder { readonly raw: string; readonly pid: number | undefined; readonly atMs: number }

/** The current holder; a half-written (empty/unparsable) lock is dated by its file's mtime. */
function readHolder(file: string): Holder | undefined {
  try {
    const raw = fs.readFileSync(file, "utf8");
    let parsed: { pid?: unknown; atMs?: unknown } = {};
    try { parsed = JSON.parse(raw) as typeof parsed; } catch { /* half-written: dated by mtime below */ }
    const atMs = typeof parsed.atMs === "number" ? parsed.atMs : fs.statSync(file).mtimeMs;
    return { raw, pid: typeof parsed.pid === "number" ? parsed.pid : undefined, atMs };
  } catch {
    return undefined;
  }
}

/**
 * Takes a stale lock away: renames it aside (atomic, one winner), then checks that what was taken is
 * the stale lock that was judged. If another start replaced it meanwhile, its live lock is linked
 * back (never over a newer one) before the aside copy is removed.
 */
function breakStale(file: string, stale: Holder): void {
  const aside = `${file}.stale-${process.pid}-${randomBytes(4).toString("hex")}`;
  try { fs.renameSync(file, aside); } catch { return; }
  try {
    if (fs.readFileSync(aside, "utf8") !== stale.raw) fs.linkSync(aside, file);
  } catch { /* a newer lock is already in place, or the aside copy is unreadable: either way the next try decides */ }
  fs.rmSync(aside, { force: true });
}

function isStale(holder: Holder, now: number, seams: LockSeams): boolean {
  if (now - holder.atMs > (seams.staleMs ?? 120_000)) return true;
  return holder.pid !== undefined && !(seams.isAlive ?? pidAlive)(holder.pid);
}

/** Removes the lock only while it is still this start's own (a taken-over lock is someone else's now). */
function releaser(file: string, raw: string): () => void {
  return () => {
    try {
      if (fs.readFileSync(file, "utf8") === raw) fs.rmSync(file, { force: true });
    } catch { /* already gone, or unreadable: nothing of ours to remove */ }
  };
}

/**
 * Takes the lock at `file`, waiting up to `waitMs` for a live holder.
 * @returns Its release, or undefined when the wait ran out or the folder cannot hold a lock: the
 *   caller then goes on without it (it must not move anything, and must open the old file only if it
 *   still exists).
 * @complexity O(waitMs / 50) tries, each O(1) file I/O.
 */
export function acquireLock({ file }: { file: string }, seams: LockSeams = {}): (() => void) | undefined {
  const now = seams.nowMs ?? Date.now;
  const deadline = now() + (seams.waitMs ?? 15_000);
  // Bounded: a stale lock that cannot be renamed aside (Windows, a file held open) must not spin forever.
  let breaks = 0;
  for (;;) {
    const created = tryCreate(file, now());
    if (created === "unavailable") return undefined;
    if (created !== "contended") return releaser(file, created);
    const holder = readHolder(file);
    if (holder && isStale(holder, now(), seams) && breaks++ < 3) { breakStale(file, holder); continue; }
    if (now() >= deadline) return undefined;
    (seams.sleep ?? sleepSync)(RETRY_MS);
  }
}
